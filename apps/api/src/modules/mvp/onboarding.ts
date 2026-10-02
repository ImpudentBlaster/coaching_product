import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

export const onboardingSchema = z.object({
  personalDetails: z.string().trim().min(2).max(1000),
  fitnessGoal: z.string().trim().min(2).max(500),
  age: z.number().int().min(1).max(120),
  height: z.number().positive().max(300),
  weight: z.number().positive().max(1000),
  waist: z.number().positive().max(400),
  experienceLevel: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']),
  injuries: z.string().max(2000),
  availableEquipment: z.array(z.string().trim().min(1).max(100)).max(50),
  preferredTrainingDays: z.array(z.enum(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'])).max(7),
  currentDiet: z.string().trim().min(2).max(4000),
  nutritionPreferences: z.string().max(2000),
  additionalNotes: z.string().max(4000),
});
export const onboardingDraftSchema = onboardingSchema.partial().extend({
  personalDetails: z.string().max(1000).optional(),
  fitnessGoal: z.string().max(500).optional(),
  currentDiet: z.string().max(4000).optional(),
});
type Submission = { id: string; status: 'DRAFT'|'SUBMITTED'|'REVIEWED'; data: unknown; submittedAt: string|null; reviewedAt: string|null };
const columns = 'id,status,COALESCE(submitted_snapshot,data) data,submitted_at "submittedAt",reviewed_at "reviewedAt"';
async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function tenant(client: PoolClient, clientId: string, coachId?: string) {
  const result = await client.query<{coach_id:string}>(`SELECT cc.coach_id FROM coach_clients cc JOIN users u ON u.id=cc.client_id
    WHERE cc.client_id=$1 AND cc.status='APPROVED' AND u.account_status='APPROVED'
    AND ($2::uuid IS NULL OR cc.coach_id=$2) FOR SHARE OF cc,u`, [clientId, coachId ?? null]);
  return result.rows[0]?.coach_id;
}
async function audit(client: PoolClient, actor: string, action: string, id: string) {
  await client.query("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'ONBOARDING',$3)", [actor,action,id]);
}

// Mounted behind the existing approved-account and role middleware.
export function createClientOnboardingRouter(pool: Pool): Router {
  const router = Router();
  router.get('/', async (req,res) => {
    const result = await transaction(pool, async client => {
      const coachId = await tenant(client,req.auth!.userId);
      if (!coachId) return undefined;
      return (await client.query<Submission>(`SELECT ${columns} FROM onboarding_submissions WHERE client_id=$1 AND coach_id=$2`, [req.auth!.userId,coachId])).rows[0] ?? null;
    });
    return result === undefined ? res.status(409).json({message:'Approved coach relationship required'}) : res.json({onboarding:result});
  });
  for (const submit of [false,true]) {
    router[submit ? 'post' : 'put'](submit ? '/submit' : '/', async (req,res) => {
      const parsed = (submit ? onboardingSchema : onboardingDraftSchema).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({message:'Complete the required fields and check measurement ranges.',details:parsed.error.flatten().fieldErrors});
      const result = await transaction(pool, async client => {
        const coachId = await tenant(client,req.auth!.userId);
        if (!coachId) return null;
        const row = (await client.query<Submission>(`INSERT INTO onboarding_submissions(coach_id,client_id,data,status,submitted_snapshot,submitted_at)
          VALUES($1,$2,$3,$4::record_status,$5,CASE WHEN $4::record_status='SUBMITTED' THEN now() ELSE NULL END)
          ON CONFLICT(coach_id,client_id) DO UPDATE SET data=excluded.data,status=excluded.status,
          submitted_snapshot=excluded.submitted_snapshot,submitted_at=excluded.submitted_at,updated_at=now()
          WHERE onboarding_submissions.status='DRAFT' RETURNING ${columns}`,
          [coachId,req.auth!.userId,parsed.data,submit?'SUBMITTED':'DRAFT',submit?parsed.data:null])).rows[0];
        if (row) await audit(client,req.auth!.userId,submit?'ONBOARDING_SUBMITTED':'ONBOARDING_DRAFT_SAVED',row.id);
        return row;
      });
      return result ? res.json({onboarding:result}) : res.status(409).json({message:'Onboarding is already submitted or your coach relationship is no longer approved.'});
    });
  }
  return router;
}

export function createCoachOnboardingRouter(pool: Pool): Router {
  const router = Router({mergeParams:true});
  router.use((req,res,next) => z.string().uuid().safeParse(req.params.clientId).success ? next() : res.status(404).json({message:'Client not found'}));
  router.get<{clientId:string}>('/', async (req,res) => {
    const result = await transaction(pool, async client => {
      if (!await tenant(client,String(req.params.clientId),req.auth!.userId)) return undefined;
      return (await client.query<Submission>(`SELECT ${columns} FROM onboarding_submissions WHERE coach_id=$1 AND client_id=$2`,[req.auth!.userId,req.params.clientId])).rows[0] ?? null;
    });
    return result === undefined ? res.status(404).json({message:'Client not found'}) : res.json({onboarding:result});
  });
  router.post<{clientId:string}>('/review', async (req,res) => {
    const result = await transaction(pool, async client => {
      if (!await tenant(client,String(req.params.clientId),req.auth!.userId)) return null;
      const row = (await client.query<Submission>(`UPDATE onboarding_submissions SET status='REVIEWED',reviewed_at=now(),reviewed_by_user_id=$1,updated_at=now()
        WHERE coach_id=$1 AND client_id=$2 AND status='SUBMITTED' RETURNING ${columns}`,[req.auth!.userId,req.params.clientId])).rows[0];
      if (row) await audit(client,req.auth!.userId,'ONBOARDING_REVIEWED',row.id);
      return row;
    });
    return result ? res.json({onboarding:result}) : res.status(404).json({message:'Submitted onboarding not found'});
  });
  return router;
}
