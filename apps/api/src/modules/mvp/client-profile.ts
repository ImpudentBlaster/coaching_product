import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';

export function createClientProfileRouter(pool: Pool): Router {
  const router = Router({mergeParams:true});
  router.get<{clientId:string}>('/', async (req,res) => {
    if(!z.string().uuid().safeParse(req.params.clientId).success)return res.status(404).json({message:'Client not found'});
    const result = await pool.query<{profile:unknown}>(`
      SELECT json_build_object(
        'client',json_build_object('id',u.id,'displayName',cp.display_name,'email',u.email,'status',cc.status,'joinedAt',cc.created_at,'phone',setup.data->>'phone'),
        'onboarding',(SELECT json_build_object('status',o.status,'data',COALESCE(o.submitted_snapshot,o.data)) FROM onboarding_submissions o WHERE o.coach_id=$1 AND o.client_id=$2),
        'program',(SELECT json_build_object('id',p.id,'snapshot',p.snapshot,'assignedAt',p.assigned_at) FROM program_assignments p WHERE p.coach_id=$1 AND p.client_id=$2 AND p.active ORDER BY p.assigned_at DESC LIMIT 1),
        'nutrition',(SELECT json_build_object('snapshot',n.snapshot,'assignedAt',n.assigned_at) FROM nutrition_plan_assignments n WHERE n.coach_id=$1 AND n.client_id=$2 AND n.active ORDER BY n.assigned_at DESC LIMIT 1),
        'subscription',(SELECT to_jsonb(s) - 'coach_id' - 'client_id' FROM subscriptions s WHERE s.coach_id=$1 AND s.client_id=$2),
        'progress',COALESCE((SELECT json_agg(p ORDER BY p.measurement_date DESC) FROM (SELECT measurement_date::text,body_weight,waist,chest,arm,notes FROM progress_entries WHERE client_id=$2 ORDER BY measurement_date DESC LIMIT 90) p),'[]'::json),
        'workouts',COALESCE((SELECT json_agg(w ORDER BY w."startedAt" DESC) FROM (SELECT id,workout_snapshot->>'name' name,status,started_at "startedAt",completed_at "completedAt" FROM workout_sessions WHERE coach_id=$1 AND client_id=$2 ORDER BY started_at DESC LIMIT 10) w),'[]'::json),
        'checkins',COALESCE((SELECT json_agg(c ORDER BY c."dueDate" DESC,c.id) FROM (
          SELECT ca.id,ca.client_id "clientId",cp.display_name "clientName",ca.due_date::text "dueDate",ca.notes,ca.form_snapshot form,ca.form_id "formId",
            COALESCE(cs.status::text,'PENDING') status,COALESCE(cs.submitted_snapshot,cs.data,'{}') data,COALESCE(cs.revision,0) revision,
            cs.submitted_at "submittedAt",cs.reviewed_at "reviewedAt",cs.review_status "reviewStatus",cs.review_notes "reviewNotes",cs.flags
          FROM checkin_assignments ca LEFT JOIN checkin_submissions cs ON cs.assignment_id=ca.id AND cs.coach_id=$1 AND cs.client_id=$2
          WHERE ca.coach_id=$1 AND ca.client_id=$2 ORDER BY ca.due_date DESC,ca.id LIMIT 50
        ) c),'[]'::json)
      ) profile
      FROM coach_clients cc JOIN users u ON u.id=cc.client_id JOIN client_profiles cp ON cp.user_id=u.id
      LEFT JOIN client_setup setup ON setup.coach_id=cc.coach_id AND setup.client_id=cc.client_id
      WHERE cc.coach_id=$1 AND cc.client_id=$2 AND cc.status='APPROVED' AND u.account_status='APPROVED'`,[req.auth!.userId,req.params.clientId]);
    return result.rows[0]?res.json(result.rows[0]):res.status(404).json({message:'Client not found or access is no longer approved'});
  });
  return router;
}
