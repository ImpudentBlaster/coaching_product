import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';

export function createCoachOverviewRouter(pool: Pool): Router {
  const router = Router();
  router.get('/', async (request, response) => {
    const date = z.iso.date().optional().safeParse(request.query.date);
    if (!date.success) return response.status(400).json({ message: 'Use a valid dashboard date (YYYY-MM-DD).' });
    // One statement gives counts and lists the same snapshot. Every client record
    // is scoped to this coach's currently approved relationships and accounts.
    const result = await pool.query<{ overview: unknown }>(`
      WITH active_clients AS (
        SELECT cc.client_id, COALESCE(cp.display_name,'Client') AS name
        FROM coach_clients cc JOIN users u ON u.id=cc.client_id
        LEFT JOIN client_profiles cp ON cp.user_id=cc.client_id
        WHERE cc.coach_id=$1 AND cc.status='APPROVED' AND u.account_status='APPROVED'
      ), onboarding AS (
        SELECT o.client_id, a.name, o.submitted_at
        FROM onboarding_submissions o JOIN active_clients a ON a.client_id=o.client_id
        WHERE o.coach_id=$1 AND o.status='SUBMITTED'
      ), checkin_reviews AS (
        SELECT s.id FROM checkin_submissions s JOIN active_clients a ON a.client_id=s.client_id
        WHERE s.coach_id=$1 AND s.status='SUBMITTED'
      ), due AS (
        SELECT c.id,c.client_id,a.name,c.due_date
        FROM checkin_assignments c JOIN active_clients a ON a.client_id=c.client_id
        LEFT JOIN checkin_submissions s ON s.assignment_id=c.id
        WHERE c.coach_id=$1 AND c.due_date<=COALESCE($2::date,CURRENT_DATE)
          AND (s.status IS NULL OR s.status='DRAFT')
      ), completed AS (
        SELECT w.id,w.client_id,a.name,w.completed_at,w.workout_snapshot
        FROM workout_sessions w JOIN active_clients a ON a.client_id=w.client_id
        WHERE w.coach_id=$1 AND w.status='COMPLETED' AND w.completed_at IS NOT NULL
      ), activity AS (
        SELECT 'workout:'||id AS id,client_id,name,'WORKOUT' AS kind,
          COALESCE(workout_snapshot->>'name','Workout') AS title,completed_at AS happened_at FROM completed
        UNION ALL
        SELECT 'onboarding:'||o.id,o.client_id,a.name,'ONBOARDING','Initial questionnaire',o.submitted_at
        FROM onboarding_submissions o JOIN active_clients a ON a.client_id=o.client_id
        WHERE o.coach_id=$1 AND o.status IN ('SUBMITTED','REVIEWED') AND o.submitted_at IS NOT NULL
        UNION ALL
        SELECT 'checkin:'||s.id,s.client_id,a.name,'CHECKIN','Check-in',s.submitted_at
        FROM checkin_submissions s JOIN active_clients a ON a.client_id=s.client_id
        WHERE s.coach_id=$1 AND s.status IN ('SUBMITTED','REVIEWED') AND s.submitted_at IS NOT NULL
      )
      SELECT json_build_object(
        'activeClients',(SELECT count(*)::int FROM active_clients),
        'pendingClients',(SELECT count(*)::int FROM coach_clients cc JOIN users u ON u.id=cc.client_id
          WHERE cc.coach_id=$1 AND cc.status='PENDING_REVIEW' AND u.account_status='PENDING_REVIEW'),
        'onboardingReviews',(SELECT count(*)::int FROM onboarding),
        'checkinReviews',(SELECT count(*)::int FROM checkin_reviews),
        'dueToday',(SELECT count(*)::int FROM due WHERE due_date=COALESCE($2::date,CURRENT_DATE)),
        'overdue',(SELECT count(*)::int FROM due WHERE due_date<COALESCE($2::date,CURRENT_DATE)),
        'completedWorkouts7d',(SELECT count(*)::int FROM completed WHERE completed_at>=now()-interval '7 days' AND completed_at<=now()),
        'onboarding',COALESCE((SELECT json_agg(json_build_object('clientId',client_id,'clientName',name,'submittedAt',submitted_at) ORDER BY submitted_at,client_id)
          FROM (SELECT * FROM onboarding ORDER BY submitted_at,client_id LIMIT 5) items),'[]'::json),
        'dueCheckins',COALESCE((SELECT json_agg(json_build_object('id',id,'clientId',client_id,'clientName',name,'dueDate',due_date::text) ORDER BY due_date,id)
          FROM (SELECT * FROM due ORDER BY due_date,id LIMIT 5) items),'[]'::json),
        'activity',COALESCE((SELECT json_agg(json_build_object('id',id,'clientId',client_id,'clientName',name,'kind',kind,'title',title,'happenedAt',happened_at) ORDER BY happened_at DESC,id)
          FROM (SELECT * FROM activity ORDER BY happened_at DESC,id LIMIT 6) items),'[]'::json)
      ) overview`, [request.auth!.userId, date.data ?? null]);
    return response.json(result.rows[0]);
  });
  return router;
}
