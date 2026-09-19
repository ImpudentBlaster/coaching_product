import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import express from 'express';
import pg from 'pg';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateEnvironment } from '../../config/environment.js';
import { issueAccessToken } from '../identity/auth.js';
import { createMvpRouter } from './router.js';
import { exerciseInput } from './exercises.js';
import { normalizeExerciseGif } from './exercise-assets.js';

const input = { name: 'Custom shoulder press', bodyPart: 'shoulders', equipment: 'dumbbell', target: 'delts', secondaryMuscles: ['triceps'], instructions: ['Sit upright.', 'Press overhead with control.'] };
it('requires the existing exercise fields and validates actual GIF content', async () => {
  expect(exerciseInput.safeParse(input).success).toBe(true);
  expect(exerciseInput.safeParse({ ...input, instructions: [] }).success).toBe(false);
  expect(exerciseInput.safeParse({ ...input, target: ' ' }).success).toBe(false);
  await expect(normalizeExerciseGif(Buffer.from('GIF89a not a real image'))).rejects.toThrow('valid GIF');
  await expect(normalizeExerciseGif(Buffer.alloc(8 * 1024 * 1024 + 1))).rejects.toThrow('8 MB');
  const gif = await sharp({ create: { width: 4, height: 8, channels: 3, background: '#117755' } }).gif().toBuffer();
  expect((await sharp(await normalizeExerciseGif(gif)).metadata()).format).toBe('gif');
});

describe.skipIf(!process.env.DATABASE_URL)('custom exercise PostgreSQL workflow', () => {
  const schema = `exercise_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
  const environment = validateEnvironment({ DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://localhost/unused', JWT_ACCESS_SECRET: randomBytes(32).toString('hex'), NODE_ENV: 'test' });
  const coach = randomUUID(), other = randomUUID(), client = randomUUID(), suspended = randomUUID();
  const token = (id: string, role: 'COACH' | 'CLIENT' = 'COACH') => `Bearer ${issueAccessToken(environment, { id, role })}`;
  const app = express(); app.use(express.json({ limit: '12mb' })); app.use(createMvpRouter(environment, pool));
  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    for (const file of ['001_identity_approvals.sql', '002_demo_mvp.sql', '009_custom_exercises.sql']) await pool.query(await readFile(new URL(`../../../db/migrations/${file}`, import.meta.url), 'utf8'));
    for (const [id, role] of [[coach, 'COACH'], [other, 'COACH'], [client, 'CLIENT'], [suspended, 'COACH']]) await pool.query("INSERT INTO users(id,email,password_hash,role,account_status) VALUES($1,$2,'unused-test-hash',$3,$4)", [id, `${id}@example.test`, role, id === suspended ? 'SUSPENDED' : 'APPROVED']);
    await pool.query("INSERT INTO coach_clients(coach_id,client_id,status) VALUES($1,$2,'APPROVED')", [coach, client]);
    for (let index = 0; index < 7; index++) await pool.query("INSERT INTO exercises(external_id,name,body_part,equipment,target,instructions) VALUES($1,$2,'waist','body weight','abs','[\"Move slowly\"]')", [index === 0 ? '0001' : `test-${index}`, `Public exercise ${index}`]);
  });
  afterAll(async () => { await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); });
  it('creates exercises and GIFs atomically and scopes discovery and media to the coach', async () => {
    expect((await request(app).post('/exercises').send(input)).status).toBe(401);
    expect((await request(app).post('/exercises').set('Authorization', token(client, 'CLIENT')).send(input)).status).toBe(403);
    expect((await request(app).post('/exercises').set('Authorization', token(suspended)).send(input)).status).toBe(403);
    const gif = (await sharp({ create: { width: 8, height: 8, channels: 3, background: '#116644' } }).gif().toBuffer()).toString('base64');
    const created = await request(app).post('/exercises').set('Authorization', token(coach)).send({ ...input, gif });
    expect(created.status).toBe(201);
    const exercise = (created.body as { exercise: { id: string; gifAvailable: boolean } }).exercise;
    expect(exercise.gifAvailable).toBe(true);
    expect((await pool.query("SELECT 1 FROM audit_events WHERE entity_id=$1 AND action='EXERCISE_CREATED'", [exercise.id])).rowCount).toBe(1);
    for (const path of ['/exercises?q=Custom', '/exercises/suggestions?q=Custom']) {
      expect((await request(app).get(path).set('Authorization', token(other))).body).toMatchObject({ items: [] });
      const result = (await request(app).get(path).set('Authorization', token(client, 'CLIENT'))).body as { items: { id: string }[] };
      expect(result.items[0]!.id).toBe(exercise.id);
    }
    expect((await request(app).get(`/exercises/${exercise.id}/gif`).set('Authorization', token(other))).status).toBe(404);
    const animation = await request(app).get(`/exercises/${exercise.id}/gif`).set('Authorization', token(client, 'CLIENT'));
    expect(animation.status).toBe(200);
    expect(animation.headers['content-type']).toContain('image/gif');
    expect(animation.headers['cache-control']).toBe('private, no-store');
    const workout = { name: 'Custom workout', description: '', exercises: [{ exerciseId: exercise.id, sets: 3, repetitions: 10 }] };
    expect((await request(app).post('/coach/workout-templates').set('Authorization', token(other)).send(workout)).status).toBe(409);
    expect((await request(app).post('/coach/workout-templates').set('Authorization', token(coach)).send(workout)).status).toBe(201);
    await pool.query("UPDATE coach_clients SET status='SUSPENDED' WHERE client_id=$1", [client]);
    expect((await request(app).get(`/exercises/${exercise.id}/gif`).set('Authorization', token(client, 'CLIENT'))).status).toBe(404);
    await pool.query("UPDATE coach_clients SET status='APPROVED' WHERE client_id=$1", [client]);
    await pool.query("ALTER TABLE audit_events ADD CONSTRAINT fail_exercise_audit CHECK(action <> 'EXERCISE_CREATED') NOT VALID");
    expect((await request(app).post('/exercises').set('Authorization', token(coach)).send({ ...input, name: 'Rollback exercise', gif })).status).toBe(500);
    expect((await pool.query("SELECT 1 FROM exercises WHERE name='Rollback exercise'")).rowCount).toBe(0);
    expect((await pool.query('SELECT 1 FROM exercise_animations')).rowCount).toBe(1);
    await pool.query('ALTER TABLE audit_events DROP CONSTRAINT fail_exercise_audit');
  });
  it('returns up to four distinct random matching suggestions and treats search wildcards literally', async () => {
    const results = (await request(app).get('/exercises/suggestions?q=Public').set('Authorization', token(coach))).body as { items: { id: string; name: string }[] };
    expect(results.items).toHaveLength(4);
    expect(new Set(results.items.map(item => item.id)).size).toBe(4);
    expect(results.items.every(item => item.name.startsWith('Public'))).toBe(true);
    expect((await request(app).get('/exercises?q=%25').set('Authorization', token(coach))).body).toMatchObject({ items: [], total: 0 });
    expect((await request(app).get('/exercises?page=1.5').set('Authorization', token(coach))).status).toBe(400);
  });
  it('serves imported GIFs from the repository path even with stale availability metadata', async () => {
    // The import inputs are read-only. 0001 exists but this fixture deliberately
    // retains gif_available=false to exercise recovery from stale import flags.
    const animation = await request(app).get('/exercises/0001/gif').set('Authorization', token(coach));
    expect(animation.status).toBe(200);
    expect(animation.headers['content-type']).toContain('image/gif');
    expect((await request(app).get('/exercises/0609/gif').set('Authorization', token(coach))).status).toBe(404);
    expect((await request(app).get('/exercises/0001/gif')).status).toBe(401);
  });
});
