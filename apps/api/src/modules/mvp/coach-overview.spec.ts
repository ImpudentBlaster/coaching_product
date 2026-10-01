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

describe.skipIf(!process.env.DATABASE_URL)('coach dashboard data',()=>{
  const schema=`overview_test_${randomUUID().replaceAll('-','')}`;
  const admin=new pg.Pool({connectionString:process.env.DATABASE_URL});
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema},public`});
  const env=validateEnvironment({DATABASE_URL:process.env.DATABASE_URL??'postgresql://localhost/unused',JWT_ACCESS_SECRET:randomBytes(32).toString('hex'),NODE_ENV:'test'});
  const coach=randomUUID(),other=randomUUID(),client=randomUUID(),foreign=randomUUID(),suspended=randomUUID(),pending=randomUUID();
  const token=(id:string,role:'COACH'|'CLIENT')=>`Bearer ${issueAccessToken(env,{id,role})}`;
  const app=express();app.use(express.json());app.use(createMvpRouter(env,pool));
  const coachToken=token(coach,'COACH');
  beforeAll(async()=>{
    await admin.query(`CREATE SCHEMA ${schema}`);
    for(const file of ['001_identity_approvals.sql','002_demo_mvp.sql'])await pool.query(await readFile(new URL(`../../../db/migrations/${file}`,import.meta.url),'utf8'));
    for(const id of [coach,other,client,foreign,suspended,pending]){
      const role=[coach,other].includes(id)?'COACH':'CLIENT';
      await pool.query("INSERT INTO users(id,email,password_hash,role,account_status) VALUES($1,$2,'unused-test-hash',$3,$4)",[id,`${id}@example.test`,role,id===suspended?'SUSPENDED':id===pending?'PENDING_REVIEW':'APPROVED']);
      if(role==='CLIENT')await pool.query('INSERT INTO client_profiles(user_id,display_name) VALUES($1,$2)',[id,id===client?'Visible client':'Private client']);
    }
    for(const id of [client,foreign,suspended,pending])await pool.query('INSERT INTO coach_clients(coach_id,client_id,status) VALUES($1,$2,$3)',[id===foreign?other:coach,id,id===pending?'PENDING_REVIEW':'APPROVED']);
    for(const id of [client,foreign,suspended]){
      const owner=id===foreign?other:coach;
      await pool.query("INSERT INTO onboarding_submissions(coach_id,client_id,status,data,submitted_at) VALUES($1,$2,'SUBMITTED','{}',now())",[owner,id]);
      for(const [due,status] of [['2026-09-19',null],['2026-09-20','DRAFT'],['2026-09-20','SUBMITTED'],['2026-09-18','REVIEWED'],['2026-09-21',null]]){
        const assignment=(await pool.query<{id:string}>('INSERT INTO checkin_assignments(coach_id,client_id,due_date) VALUES($1,$2,$3) RETURNING id',[owner,id,due])).rows[0]!.id;
        if(status)await pool.query("INSERT INTO checkin_submissions(assignment_id,coach_id,client_id,status,data,submitted_at) VALUES($1,$2,$3,$4,'{}',CASE WHEN $4::record_status='DRAFT' THEN NULL ELSE now() END)",[assignment,owner,id,status]);
      }
      const program=(await pool.query<{id:string}>("INSERT INTO programs(coach_id,name) VALUES($1,'Test program') RETURNING id",[owner])).rows[0]!.id;
      const assignment=(await pool.query<{id:string}>("INSERT INTO program_assignments(coach_id,client_id,program_id,snapshot) VALUES($1,$2,$3,'{}') RETURNING id",[owner,id,program])).rows[0]!.id;
      for(const days of [1,10])await pool.query("INSERT INTO workout_sessions(assignment_id,coach_id,client_id,day_position,workout_snapshot,status,completed_at) VALUES($1,$2,$3,0,'{\"name\":\"Strength session\"}','COMPLETED',now()-make_interval(days=>$4))",[assignment,owner,id,days]);
    }
  },30000);
  afterAll(async()=>{await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();});
  it('returns accurate counts, bounded activity, and no other-coach or suspended-client records',async()=>{
    const response=await request(app).get('/coach/dashboard?date=2026-09-20').set('Authorization',coachToken);
    expect(response.status).toBe(200);
    const body=response.body as {overview:{activeClients:number;pendingClients:number;onboardingReviews:number;checkinReviews:number;dueToday:number;overdue:number;completedWorkouts7d:number;onboarding:Array<{clientId:string}>;dueCheckins:Array<{clientId:string;dueDate:string}>;activity:Array<{clientId:string}>}};
    expect(body.overview).toMatchObject({activeClients:1,pendingClients:1,onboardingReviews:1,checkinReviews:1,dueToday:1,overdue:1,completedWorkouts7d:1});
    expect(body.overview.onboarding.map(item=>item.clientId)).toEqual([client]);
    expect(body.overview.dueCheckins.map(item=>item.dueDate)).toEqual(['2026-09-19','2026-09-20']);
    expect(body.overview.activity.length).toBeGreaterThan(0);expect(body.overview.activity.length).toBeLessThanOrEqual(6);
    expect(body.overview.activity.every(item=>item.clientId===client)).toBe(true);
    expect(body.overview.dueCheckins.every(item=>item.clientId===client)).toBe(true);
    const nextDay=await request(app).get('/coach/dashboard?date=2026-09-21').set('Authorization',coachToken);
    expect((nextDay.body as {overview:unknown}).overview).toMatchObject({dueToday:1,overdue:2});
  });
  it('requires a currently approved coach and validates the dashboard date',async()=>{
    expect((await request(app).get('/coach/dashboard')).status).toBe(401);
    expect((await request(app).get('/coach/dashboard').set('Authorization',token(client,'CLIENT'))).status).toBe(403);
    expect((await request(app).get('/coach/dashboard?date=2026-02-30').set('Authorization',coachToken)).status).toBe(400);
    await pool.query("UPDATE users SET account_status='SUSPENDED' WHERE id=$1",[other]);
    expect((await request(app).get('/coach/dashboard').set('Authorization',token(other,'COACH'))).status).toBe(403);
  });
});
