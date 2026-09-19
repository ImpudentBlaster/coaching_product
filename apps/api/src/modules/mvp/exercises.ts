import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { exerciseGifFilename, exerciseImagesDirectory, isGifSignature, normalizeExerciseGif } from './exercise-assets.js';

const field = z.string().trim().min(1).max(100);
export const exerciseInput = z.object({
  name: z.string().trim().min(2).max(180), bodyPart: field, equipment: field, target: field,
  secondaryMuscles: z.array(field).max(20).default([]),
  instructions: z.array(z.string().trim().min(1).max(2000)).min(1).max(30),
  gif: z.string().max(11184812).optional(),
});
const searchInput = z.object({
  q: z.string().trim().max(180).default(''),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  bodyPart: z.string().max(100).default(''), equipment: z.string().max(100).default(''), target: z.string().max(100).default(''),
});
const columns = 'external_id "id",name,body_part "bodyPart",equipment,target,secondary_muscles "secondaryMuscles",instructions,gif_available "gifAvailable",(owner_coach_id IS NOT NULL) "custom"';
class ExerciseError extends Error { constructor(public status: number, message: string) { super(message); } }
type Scope = { actor: string; coach: string | null; role: string };
async function scope(client: PoolClient, actor: string): Promise<Scope> {
  const user = (await client.query<{ role: string; account_status: string }>('SELECT role,account_status FROM users WHERE id=$1 FOR SHARE', [actor])).rows[0];
  if (!user || user.account_status !== 'APPROVED') throw new ExerciseError(403, 'Approved account required.');
  let coach: string | null = user.role === 'COACH' ? actor : null;
  if (user.role === 'CLIENT') coach = (await client.query<{ coach_id: string }>(`SELECT cc.coach_id FROM coach_clients cc JOIN users u ON u.id=cc.coach_id WHERE cc.client_id=$1 AND cc.status='APPROVED' AND u.account_status='APPROVED' AND u.role='COACH' FOR SHARE OF cc,u`, [actor])).rows[0]?.coach_id ?? null;
  return { actor, coach, role: user.role };
}
function escapedSearch(query: string) { return `%${query.replace(/[\\%_]/g, '\\$&')}%`; }

// Mounted behind authentication. Every operation rechecks current approval and
// ownership in its transaction, including private custom animation downloads.
export function createExerciseRouter(pool: Pool): Router {
  const router = Router();
  type Result = { status?: number; body?: unknown; gif?: Buffer };
  const run = (work: (client: PoolClient, ctx: Scope, request: Request) => Promise<Result>) => async (request: Request, response: Response, next: NextFunction) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ctx = await scope(client, request.auth!.userId);
      const result = await work(client, ctx, request);
      await client.query('COMMIT');
      response.set('Cache-Control', 'private, no-store');
      if (result.gif) response.type('image/gif').set('X-Content-Type-Options', 'nosniff').send(result.gif);
      else response.status(result.status ?? 200).json(result.body);
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof ExerciseError) response.status(error.status).json({ message: error.message });
      else if (error instanceof z.ZodError) response.status(400).json({ message: 'Check the exercise fields and search values.', details: error.flatten().fieldErrors });
      else next(error);
    } finally { client.release(); }
  };
  router.get('/', run(async (client, ctx, request) => {
    const input = searchInput.parse(request.query);
    const values = [ctx.coach, escapedSearch(input.q), input.bodyPart, input.equipment, input.target];
    const where = `WHERE (owner_coach_id IS NULL OR owner_coach_id=$1) AND name ILIKE $2 AND ($3='' OR body_part=$3) AND ($4='' OR equipment=$4) AND ($5='' OR target=$5)`;
    const count = (await client.query<{ count: string }>(`SELECT count(*) FROM exercises ${where}`, values)).rows[0]!;
    const rows = (await client.query(`SELECT ${columns} FROM exercises ${where} ORDER BY name,external_id LIMIT $6 OFFSET $7`, [...values, input.limit, (input.page - 1) * input.limit])).rows;
    return { body: { items: rows, total: Number(count.count), page: input.page, limit: input.limit } };
  }));
  router.get('/suggestions', run(async (client, ctx, request) => {
    const { q } = searchInput.parse(request.query);
    const rows = (await client.query(`SELECT ${columns} FROM exercises WHERE (owner_coach_id IS NULL OR owner_coach_id=$1) AND name ILIKE $2 ORDER BY random() LIMIT 4`, [ctx.coach, escapedSearch(q)])).rows;
    return { body: { items: rows } };
  }));
  router.get('/filters', run(async (client, ctx) => {
    const result = await client.query<{ bodyParts: string[]; equipment: string[]; targets: string[] }>(`SELECT COALESCE(array_agg(DISTINCT body_part ORDER BY body_part),'{}') "bodyParts",COALESCE(array_agg(DISTINCT equipment ORDER BY equipment),'{}') equipment,COALESCE(array_agg(DISTINCT target ORDER BY target),'{}') targets FROM exercises WHERE owner_coach_id IS NULL OR owner_coach_id=$1`, [ctx.coach]);
    return { body: result.rows[0] };
  }));
  router.post('/', run(async (client, ctx, request) => {
    if (ctx.role !== 'COACH') throw new ExerciseError(403, 'Only approved coaches can add exercises.');
    const input = exerciseInput.parse(request.body);
    let gif: Buffer | null = null;
    if (input.gif !== undefined) {
      const bytes = Buffer.from(input.gif, 'base64');
      if (!input.gif || bytes.toString('base64') !== input.gif) throw new ExerciseError(400, 'Invalid GIF encoding.');
      try { gif = await normalizeExerciseGif(bytes); }
      catch (error) { throw new ExerciseError(400, error instanceof Error ? error.message : 'Invalid GIF.'); }
    }
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`exercises:${ctx.actor}`]);
    const usage = (await client.query<{ count: string; bytes: string }>(`SELECT count(*)::text count,COALESCE(sum(octet_length(a.gif_bytes)),0)::text bytes FROM exercises e LEFT JOIN exercise_animations a ON a.exercise_id=e.external_id WHERE e.owner_coach_id=$1`, [ctx.actor])).rows[0]!;
    if (Number(usage.count) >= 1000 || Number(usage.bytes) + (gif?.length ?? 0) > 200 * 1024 * 1024) throw new ExerciseError(409, 'Your custom exercise limit has been reached (1,000 exercises or 200 MB of animations).');
    const id = randomUUID();
    const row = (await client.query(`INSERT INTO exercises(external_id,name,body_part,equipment,target,secondary_muscles,instructions,gif_available,owner_coach_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${columns}`, [id, input.name, input.bodyPart, input.equipment, input.target, JSON.stringify(input.secondaryMuscles), JSON.stringify(input.instructions), Boolean(gif), ctx.actor])).rows[0] as unknown;
    if (gif) await client.query('INSERT INTO exercise_animations(exercise_id,gif_bytes) VALUES($1,$2)', [id, gif]);
    await client.query("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,'EXERCISE_CREATED','EXERCISE',$2)", [ctx.actor, id]);
    return { status: 201, body: { exercise: row } };
  }));
  router.get('/:id/gif', run(async (client, ctx, request) => {
    const id = String(request.params.id);
    let filename: string;
    try { filename = exerciseGifFilename(id); } catch { throw new ExerciseError(400, 'Invalid exercise ID.'); }
    const row = (await client.query<{ owner_coach_id: string | null; gif_available: boolean }>('SELECT owner_coach_id,gif_available FROM exercises WHERE external_id=$1 AND (owner_coach_id IS NULL OR owner_coach_id=$2)', [id, ctx.coach])).rows[0];
    if (!row) throw new ExerciseError(404, 'Exercise not found.');
    let gif: Buffer | undefined;
    if (row.owner_coach_id) gif = (await client.query<{ gif_bytes: Buffer }>('SELECT gif_bytes FROM exercise_animations WHERE exercise_id=$1', [id])).rows[0]?.gif_bytes;
    else {
      // Read the actual asset rather than trusting a stale import-time flag.
      try { gif = await readFile(resolve(exerciseImagesDirectory(), filename)); }
      catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    }
    if (!gif || !isGifSignature(gif)) throw new ExerciseError(404, 'Animation is not available for this exercise.');
    return { gif };
  }));
  return router;
}
