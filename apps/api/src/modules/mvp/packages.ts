import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { clientSetupSchema, validateSelections, SetupError } from './client-setup.js';

export const packageSchema = z.object({
  name: z.string().trim().min(2).max(150),
  description: z.string().trim().min(1).max(4000),
  paymentType: z.enum(['ONE_TIME', 'SUBSCRIPTION', 'INITIAL_AND_SUBSCRIPTION']),
  amount: z.number().nonnegative().max(100000000).nullable(),
  initialAmount: z.number().nonnegative().max(100000000).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  durationDays: z.number().int().min(1).max(3660).nullable(),
  programId: clientSetupSchema.shape.programId,
  nutritionPlanId: clientSetupSchema.shape.nutritionPlanId,
  supplementPlanId: clientSetupSchema.shape.supplementPlanId,
  checkin: clientSetupSchema.shape.checkin.unwrap().omit({ startDate: true }).nullable(),
}).strict();

async function transaction<T>(pool: Pool, work: (c: PoolClient) => Promise<T>) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const result = await work(c); await c.query('COMMIT'); return result; }
  catch (error) { await c.query('ROLLBACK'); throw error; }
  finally { c.release(); }
}

export function createPackagesRouter(pool: Pool): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    const result = await pool.query(`SELECT p.id,p.data,p.revision,p.archived_at "archivedAt",
      (SELECT count(*)::integer FROM client_setup s JOIN coach_clients cc ON cc.coach_id=s.coach_id AND cc.client_id=s.client_id
       WHERE s.package_id=p.id AND s.coach_id=p.coach_id AND cc.status IN ('APPROVED','PENDING_REVIEW')) "clientCount"
      FROM coaching_packages p WHERE p.coach_id=$1 ORDER BY p.created_at DESC`, [req.auth!.userId]);
    res.json({ packages: result.rows });
  });
  async function save(c: PoolClient, coachId: string, data: z.infer<typeof packageSchema>) {
    await validateSelections(c, coachId, {
      programId: data.programId, nutritionPlanId: data.nutritionPlanId, supplementPlanId: data.supplementPlanId,
      checkin: data.checkin ? { ...data.checkin, startDate: new Date().toISOString().slice(0, 10) } : null,
    });
  }
  router.get('/:id/clients', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { offset, query } = z.object({ offset: z.coerce.number().int().min(0).max(100000).default(0), query: z.string().trim().max(150).default('') }).parse(req.query);
    const owned = await pool.query('SELECT id FROM coaching_packages WHERE id=$1 AND coach_id=$2', [id, req.auth!.userId]);
    if (!owned.rowCount) { res.status(404).json({ message: 'Package not found' }); return; }
    const result = await pool.query<{ clientId: string; name: string; email: string; status: string }>(
      `SELECT s.client_id "clientId",cp.display_name name,u.email::text email,cc.status
       FROM client_setup s JOIN coach_clients cc ON cc.coach_id=s.coach_id AND cc.client_id=s.client_id
       JOIN client_profiles cp ON cp.user_id=s.client_id JOIN users u ON u.id=s.client_id
       WHERE s.package_id=$1 AND s.coach_id=$2 AND cc.status IN ('APPROVED','PENDING_REVIEW')
       AND (strpos(lower(cp.display_name),lower($3))>0 OR strpos(lower(u.email::text),lower($3))>0)
       ORDER BY lower(cp.display_name),s.client_id LIMIT 21 OFFSET $4`, [id, req.auth!.userId, query, offset]);
    res.json({ items: result.rows.slice(0, 20), hasMore: result.rows.length > 20 });
  });
  router.post('/', async (req, res) => {
    const data = packageSchema.parse(req.body);
    const row = await transaction(pool, async c => {
      await save(c, req.auth!.userId, data);
      const result = await c.query<{ id: string }>('INSERT INTO coaching_packages(coach_id,data) VALUES($1,$2) RETURNING id', [req.auth!.userId, JSON.stringify(data)]);
      const id = result.rows[0]!.id;
      await c.query("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,'PACKAGE_CREATED','COACHING_PACKAGE',$2)", [req.auth!.userId, id]);
      return { id };
    });
    res.status(201).json({ package: row });
  });
  router.put('/:id', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const input = z.object({ data: packageSchema, revision: z.number().int().positive(), archived: z.boolean() }).strict().parse(req.body);
    const updated = await transaction(pool, async c => {
      const existing = await c.query<{ revision: number }>('SELECT revision FROM coaching_packages WHERE id=$1 AND coach_id=$2 FOR UPDATE', [id, req.auth!.userId]);
      if (!existing.rows[0]) return 404;
      if (existing.rows[0].revision !== input.revision) return 409;
      if (!input.archived) await save(c, req.auth!.userId, input.data);
      await c.query('UPDATE coaching_packages SET data=$1,revision=revision+1,archived_at=CASE WHEN $2 THEN now() ELSE NULL END,updated_at=now() WHERE id=$3', [JSON.stringify(input.data), input.archived, id]);
      await c.query("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'COACHING_PACKAGE',$3)", [req.auth!.userId, input.archived ? 'PACKAGE_ARCHIVED' : 'PACKAGE_UPDATED', id]);
      return 200;
    });
    res.status(updated).json(updated === 200 ? { saved: true } : { message: updated === 404 ? 'Package not found' : 'Package changed. Reload before saving.' });
  });
  router.use((error: unknown, _req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    if (error instanceof z.ZodError) { res.status(400).json({ message: 'Check the package details.', details: error.flatten() }); return; }
    if (error instanceof SetupError) { res.status(error.status).json({ message: error.message }); return; }
    next(error);
  });
  return router;
}
