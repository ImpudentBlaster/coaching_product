import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import express from 'express';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateEnvironment } from '../../config/environment.js';
import { issueAccessToken } from '../identity/auth.js';
import { createMvpRouter } from './router.js';
import { onboardingSchema, onboardingDraftSchema } from './onboarding.js';

const answers={personalDetails:'Office worker',age:30,fitnessGoal:'Build strength',height:175,weight:72,waist:80,experienceLevel:'BEGINNER',injuries:'',availableEquipment:['Dumbbells'],preferredTrainingDays:['Monday'],currentDiet:'Three meals a day',nutritionPreferences:'Vegetarian',additionalNotes:''};
it('allows incomplete drafts but validates measurements and complete submissions',()=>{
  expect(onboardingDraftSchema.safeParse({personalDetails:'',age:30}).success).toBe(true);
  expect(onboardingSchema.safeParse({personalDetails:'',age:30}).success).toBe(false);
  expect(onboardingSchema.safeParse(answers).success).toBe(true);
  for(const invalid of [{age:30.5},{waist:-1},{height:301},{weight:'72'},{currentDiet:'  '},{preferredTrainingDays:['Not a day']}])expect(onboardingSchema.safeParse({...answers,...invalid}).success).toBe(false);
});
describe.skipIf(!process.env.DATABASE_URL)('initial onboarding storage and authorization',()=>{
  const schema=`onboarding_test_${randomUUID().replaceAll('-','')}`;
  const admin=new pg.Pool({connectionString:process.env.DATABASE_URL});
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema},public`});
  const env=validateEnvironment({DATABASE_URL:process.env.DATABASE_URL??'postgresql://localhost/unused',JWT_ACCESS_SECRET:randomBytes(32).toString('hex'),NODE_ENV:'test'});
  const coach=randomUUID(),other=randomUUID(),client=randomUUID(),stranger=randomUUID();
  const token=(id:string,role:'COACH'|'CLIENT')=>`Bearer ${issueAccessToken(env,{id,role})}`;
  const coachToken=token(coach,'COACH'),clientToken=token(client,'CLIENT');
  const app=express();app.use(express.json());app.use(createMvpRouter(env,pool));
  // Return controlled errors so rollback behavior can be asserted without logging test data.
  app.use((_error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{void _next;res.status(500).json({message:_error instanceof Error?_error.message:'Transaction failed'});});
  beforeAll(async()=>{
    await admin.query(`CREATE SCHEMA ${schema}`);
    for(const file of ['001_identity_approvals.sql','002_demo_mvp.sql'])await pool.query(await readFile(new URL(`../../../db/migrations/${file}`,import.meta.url),'utf8'));
    for(const [id,role] of [[coach,'COACH'],[other,'COACH'],[client,'CLIENT'],[stranger,'CLIENT']])await pool.query("INSERT INTO users(id,email,password_hash,role,account_status) VALUES($1,$2,'unused-test-hash',$3,'APPROVED')",[id,`${id}@example.test`,role]);
    await pool.query("INSERT INTO coach_clients(coach_id,client_id,status) VALUES($1,$2,'APPROVED')",[coach,client]);
  });
  afterAll(async()=>{await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();});
  it('enforces ownership, supports drafts, submits latest answers and reviews with atomic audit events',async()=>{
    expect((await request(app).get('/client/onboarding')).status).toBe(401);
    expect((await request(app).get('/client/onboarding').set('Authorization',coachToken)).status).toBe(403);
    expect((await request(app).get('/client/onboarding').set('Authorization',token(stranger,'CLIENT'))).status).toBe(409);
    expect((await request(app).get(`/coach/clients/${client}/onboarding`).set('Authorization',token(other,'COACH'))).status).toBe(404);
    expect((await request(app).get('/client/onboarding').set('Authorization',clientToken)).body).toEqual({onboarding:null});
    const saved=await request(app).put('/client/onboarding').set('Authorization',clientToken).send({personalDetails:'Draft'});expect(saved.status,JSON.stringify(saved.body)).toBe(200);
    expect((await request(app).post('/client/onboarding/submit').set('Authorization',clientToken).send({personalDetails:'Draft'})).status).toBe(400);
    await pool.query("ALTER TABLE audit_events ADD CONSTRAINT fail_submit CHECK(action <> 'ONBOARDING_SUBMITTED') NOT VALID");
    expect((await request(app).post('/client/onboarding/submit').set('Authorization',clientToken).send(answers)).status).toBe(500);
    expect((await pool.query<{status:string;data:unknown}>('SELECT status,data FROM onboarding_submissions')).rows[0]).toEqual({status:'DRAFT',data:{personalDetails:'Draft'}});
    await pool.query('ALTER TABLE audit_events DROP CONSTRAINT fail_submit');
    const submitted=await request(app).post('/client/onboarding/submit').set('Authorization',clientToken).send(answers);
    expect(submitted.status).toBe(200);
    expect((submitted.body as {onboarding:{data:unknown}}).onboarding.data).toEqual(answers);
    expect((await request(app).put('/client/onboarding').set('Authorization',clientToken).send({weight:90})).status).toBe(409);
    expect((await request(app).post('/client/onboarding/submit').set('Authorization',clientToken).send(answers)).status).toBe(409);
    expect((await request(app).post(`/coach/clients/${client}/onboarding/review`).set('Authorization',token(other,'COACH'))).status).toBe(404);
    await pool.query("ALTER TABLE audit_events ADD CONSTRAINT fail_review CHECK(action <> 'ONBOARDING_REVIEWED') NOT VALID");
    expect((await request(app).post(`/coach/clients/${client}/onboarding/review`).set('Authorization',coachToken)).status).toBe(500);
    expect((await pool.query<{status:string}>('SELECT status FROM onboarding_submissions')).rows[0]?.status).toBe('SUBMITTED');
    await pool.query('ALTER TABLE audit_events DROP CONSTRAINT fail_review');
    expect((await request(app).post(`/coach/clients/${client}/onboarding/review`).set('Authorization',coachToken)).status).toBe(200);
    expect((await pool.query<{action:string}>("SELECT action FROM audit_events WHERE entity_type='ONBOARDING' ORDER BY created_at")).rows.map(row=>row.action)).toEqual(['ONBOARDING_DRAFT_SAVED','ONBOARDING_SUBMITTED','ONBOARDING_REVIEWED']);
    await pool.query("UPDATE coach_clients SET status='REJECTED' WHERE client_id=$1",[client]);
    expect((await request(app).get('/client/onboarding').set('Authorization',clientToken)).status).toBe(409);
    expect((await request(app).get(`/coach/clients/${client}/onboarding`).set('Authorization',coachToken)).status).toBe(404);
  },30000);
});
