import { definitionSchema } from '../modules/mvp/checkin-model.js';
const demoCheckin = definitionSchema.parse({ name: 'Weekly check-in', fields: [{ id: 'weight', label: 'Current weight', type: 'NUMBER', required: true, min: 0.01, max: 1000, unit: 'kg', metric: true }, { id: 'notes', label: 'How did your week go?', type: 'LONG_TEXT', required: false }] });
import 'dotenv/config';
import argon2 from 'argon2';
import pg from 'pg';
if (process.env.NODE_ENV === 'production')
    throw new Error('Demo seed cannot run in production');
const required = ['DEMO_SEED_PASSWORD', 'DEMO_SEED_ADMIN_EMAIL', 'DEMO_SEED_COACH_EMAIL', 'DEMO_SEED_PENDING_COACH_EMAIL', 'DEMO_SEED_CLIENT_EMAIL', 'DEMO_SEED_PENDING_CLIENT_EMAIL'];
for (const key of required)
    if (!process.env[key])
        throw new Error(`${key} is required`);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
    throw new Error('DATABASE_URL is required');
const password = process.env.DEMO_SEED_PASSWORD;
if (password.length < 12)
    throw new Error('DEMO_SEED_PASSWORD must contain at least 12 characters');
const hash = await argon2.hash(password, { type: argon2.argon2id });
const pool = new pg.Pool({ connectionString: databaseUrl });
const client = await pool.connect();
try {
    await client.query('BEGIN');
    const admin = await user(client, process.env.DEMO_SEED_ADMIN_EMAIL, 'PLATFORM_ADMIN', 'APPROVED', hash);
    const coach = await user(client, process.env.DEMO_SEED_COACH_EMAIL, 'COACH', 'APPROVED', hash);
    const pendingCoach = await user(client, process.env.DEMO_SEED_PENDING_COACH_EMAIL, 'COACH', 'PENDING_REVIEW', hash);
    const approvedClient = await user(client, process.env.DEMO_SEED_CLIENT_EMAIL, 'CLIENT', 'APPROVED', hash);
    const pendingClient = await user(client, process.env.DEMO_SEED_PENDING_CLIENT_EMAIL, 'CLIENT', 'PENDING_REVIEW', hash);
    await client.query(`INSERT INTO coach_profiles(user_id,display_name,business_name,approved_at,approved_by_user_id) VALUES($1,'Demo Coach','Forme Demo Coaching',now(),$2) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,business_name=excluded.business_name`, [coach, admin]);
    await client.query(`INSERT INTO coach_profiles(user_id,display_name,business_name) VALUES($1,'Pending Coach','Pending Coaching') ON CONFLICT(user_id) DO NOTHING`, [pendingCoach]);
    await client.query(`INSERT INTO client_profiles(user_id,display_name) VALUES($1,'Demo Client') ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name`, [approvedClient]);
    await client.query(`INSERT INTO client_profiles(user_id,display_name) VALUES($1,'Pending Client') ON CONFLICT(user_id) DO NOTHING`, [pendingClient]);
    await relationship(client, coach, approvedClient, 'APPROVED');
    await relationship(client, coach, pendingClient, 'PENDING_REVIEW');
    const templateId = await named(client, 'workout_templates', coach, 'Demo Full Body Workout', `INSERT INTO workout_templates(coach_id,name,description) VALUES($1,$2,'Simple full-body demo workout') RETURNING id`);
    await client.query(`INSERT INTO workout_template_exercises(template_id,exercise_external_id,position,sets,repetitions,rest_seconds,target_rpe,notes) VALUES($1,'0001',0,3,10,60,7,'Move with control') ON CONFLICT(template_id,position) DO UPDATE SET exercise_external_id=excluded.exercise_external_id,sets=excluded.sets,repetitions=excluded.repetitions`, [templateId]);
    const programId = await named(client, 'programs', coach, 'Demo Starter Program', `INSERT INTO programs(coach_id,name,description,status,published_at) VALUES($1,$2,'A clear starter program','PUBLISHED',now()) RETURNING id`);
    await client.query(`INSERT INTO program_days(program_id,template_id,position,day_label) VALUES($1,$2,0,'Day 1') ON CONFLICT(program_id,position) DO UPDATE SET template_id=excluded.template_id,day_label=excluded.day_label`, [programId, templateId]);
    const snapshot = { id: programId, name: 'Demo Starter Program', description: 'A clear starter program', days: [{ position: 0, dayLabel: 'Day 1', templateId, name: 'Demo Full Body Workout', description: 'Simple full-body demo workout', exercises: [{ exerciseId: '0001', name: '3/4 sit-up', instructions: ['Follow the exercise instructions shown in the app.'], gifAvailable: true, position: 0, sets: 3, repetitions: 10, restSeconds: 60, targetRpe: 7, tempo: null, notes: 'Move with control' }] }], snapshotAt: new Date().toISOString() };
    await client.query('UPDATE program_assignments SET active=false WHERE coach_id=$1 AND client_id=$2 AND program_id<>$3', [coach, approvedClient, programId]);
    await client.query(`INSERT INTO program_assignments(coach_id,client_id,program_id,snapshot) SELECT $1,$2,$3,$4 WHERE NOT EXISTS(SELECT 1 FROM program_assignments WHERE coach_id=$1 AND client_id=$2 AND program_id=$3)`, [coach, approvedClient, programId, JSON.stringify(snapshot)]);
    await client.query(`INSERT INTO nutrition_plans(coach_id,client_id,daily_calories,protein_grams,carbohydrate_grams,fat_grams,meal_guidance,notes,starts_on) SELECT $1,$2,2200,150,240,70,'Build meals around protein and vegetables.','Demo target',current_date WHERE NOT EXISTS(SELECT 1 FROM nutrition_plans WHERE coach_id=$1 AND client_id=$2 AND active=true)`, [coach, approvedClient]);
    await client.query(`INSERT INTO checkin_assignments(coach_id,client_id,due_date,notes,form_snapshot) SELECT $1,$2,current_date+7,'Tell me how your week went.',$3 WHERE NOT EXISTS(SELECT 1 FROM checkin_assignments WHERE coach_id=$1 AND client_id=$2 AND due_date>=current_date)`, [coach, approvedClient, JSON.stringify(demoCheckin)]);
    await client.query(`INSERT INTO feedback_messages(coach_id,client_id,author_user_id,context,message) SELECT $1,$2,$1,'GENERAL','Welcome! Your starter plan is ready.' WHERE NOT EXISTS(SELECT 1 FROM feedback_messages WHERE coach_id=$1 AND client_id=$2 AND message='Welcome! Your starter plan is ready.')`, [coach, approvedClient]);
    await client.query(`INSERT INTO subscriptions(coach_id,client_id,plan_name,status,starts_on,ends_or_renews_on,amount,currency,notes) VALUES($1,$2,'Demo Monthly Coaching','ACTIVE',current_date,current_date+30,99,'USD','Informational demo record') ON CONFLICT(coach_id,client_id) DO UPDATE SET plan_name=excluded.plan_name,status=excluded.status,starts_on=excluded.starts_on,ends_or_renews_on=excluded.ends_or_renews_on,amount=excluded.amount,currency=excluded.currency,notes=excluded.notes`, [coach, approvedClient]);
    await client.query('COMMIT');
    console.info('Development demo data is ready');
}
catch (error) {
    await client.query('ROLLBACK');
    throw error;
}
finally {
    client.release();
    await pool.end();
}
async function user(c, email, role, status, passwordHash) { const result = await c.query(`INSERT INTO users(email,password_hash,role,account_status) VALUES($1,$2,$3::user_role,$4::approval_status) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash,role=excluded.role,account_status=excluded.account_status,updated_at=now() RETURNING id`, [email.trim().toLowerCase(), passwordHash, role, status]); return result.rows[0].id; }
async function relationship(c, coach, clientId, status) { await c.query(`INSERT INTO coach_clients(coach_id,client_id,status,approved_at,approved_by_user_id) VALUES($1,$2,$3::approval_status,CASE WHEN $3='APPROVED' THEN now() END,CASE WHEN $3='APPROVED' THEN $1::uuid END) ON CONFLICT(coach_id,client_id) DO UPDATE SET status=excluded.status`, [coach, clientId, status]); }
async function named(c, table, coach, name, insert) { const found = await c.query(`SELECT id FROM ${table} WHERE coach_id=$1 AND name=$2`, [coach, name]); return found.rows[0]?.id ?? (await c.query(insert, [coach, name])).rows[0].id; }
//# sourceMappingURL=seed-demo.js.map