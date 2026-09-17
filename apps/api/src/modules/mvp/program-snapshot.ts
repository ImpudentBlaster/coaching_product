import type { PoolClient } from 'pg';
export async function programSnapshot(
  c: PoolClient,
  id: string,
  coachId: string,
) {
  const p = await c.query<{ id: string; name: string; description: string }>(
    `SELECT id,name,description FROM programs WHERE id=$1 AND coach_id=$2 AND status='PUBLISHED' FOR UPDATE`,
    [id, coachId],
  );
  if (!p.rows[0]) return null;
  const days = await c.query(
    `SELECT pd.position,pd.day_label "dayLabel",wt.id "templateId",wt.name,wt.description,COALESCE(json_agg(json_build_object('exerciseId',e.external_id,'name',e.name,'instructions',e.instructions,'gifAvailable',e.gif_available,'position',wte.position,'sets',wte.sets,'repetitions',wte.repetitions,'durationSeconds',wte.duration_seconds,'restSeconds',wte.rest_seconds,'targetRpe',wte.target_rpe,'tempo',wte.tempo,'notes',wte.notes) ORDER BY wte.position) FILTER(WHERE wte.id IS NOT NULL),'[]') exercises FROM program_days pd JOIN workout_templates wt ON wt.id=pd.template_id LEFT JOIN workout_template_exercises wte ON wte.template_id=wt.id LEFT JOIN exercises e ON e.external_id=wte.exercise_external_id WHERE pd.program_id=$1 GROUP BY pd.id,wt.id ORDER BY pd.position`,
    [id],
  );
  return {
    ...p.rows[0],
    days: days.rows,
    snapshotAt: new Date().toISOString(),
  };
}
