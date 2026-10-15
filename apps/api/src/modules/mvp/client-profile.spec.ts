import 'dotenv/config';
import { randomBytes,randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import express from 'express';
import pg from 'pg';
import request from 'supertest';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { validateEnvironment } from '../../config/environment.js';
import { issueAccessToken } from '../identity/auth.js';
import { createMvpRouter } from './router.js';

describe.skipIf(!process.env.DATABASE_URL)('coach client profile',()=>{
  const schema=`profile_test_${randomUUID().replaceAll('-','')}`;
  const admin=new pg.Pool({connectionString:process.env.DATABASE_URL});
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema},public`});
  const env=validateEnvironment({DATABASE_URL:process.env.DATABASE_URL??'postgresql://localhost/unused',JWT_ACCESS_SECRET:randomBytes(32).toString('hex'),NODE_ENV:'test'});
  const coach=randomUUID(),other=randomUUID(),client=randomUUID();
  const token=(id:string,role:'COACH'|'CLIENT')=>`Bearer ${issueAccessToken(env,{id,role})}`;
  const app=express();app.use(express.json());app.use(createMvpRouter(env,pool));
  beforeAll(async()=>{
    await admin.query(`CREATE SCHEMA ${schema}`);
    for(const file of ['001_identity_approvals.sql','002_demo_mvp.sql','003_nutrition_library.sql', '014_supplement_plans.sql','004_checkin_forms.sql','005_daily_checkin_photos.sql','006_library_management.sql','007_client_setup.sql'])await pool.query(await readFile(new URL(`../../../db/migrations/${file}`,import.meta.url),'utf8'));
    for(const id of [coach,other,client])await pool.query("INSERT INTO users(id,email,password_hash,role,account_status) VALUES($1,$2,'unused-test-hash',$3,'APPROVED')",[id,`${id}@example.test`,id===client?'CLIENT':'COACH']);
    await pool.query("INSERT INTO client_profiles(user_id,display_name) VALUES($1,'Profile client')",[client]);
    await pool.query("INSERT INTO coach_clients(coach_id,client_id,status) VALUES($1,$2,'APPROVED')",[coach,client]);
    await pool.query("INSERT INTO onboarding_submissions(coach_id,client_id,data,status,submitted_snapshot) VALUES($1,$2,'{\"weight\":99}','SUBMITTED','{\"weight\":72}')",[coach,client]);
    await pool.query("INSERT INTO progress_entries(client_id,measurement_date,body_weight,notes) VALUES($1,'2026-09-20',71,'Recorded progress')",[client]);
    await pool.query("INSERT INTO checkin_assignments(coach_id,client_id,due_date,form_snapshot) VALUES($1,$2,'2026-09-21','{\"name\":\"Daily review\",\"fields\":[]}')",[coach,client]);
    await pool.query("INSERT INTO subscriptions(coach_id,client_id,plan_name,status,starts_on) VALUES($1,$2,'Monthly coaching','ACTIVE','2026-09-01')",[coach,client]);
  },30000);
  afterAll(async()=>{await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();});
  it('returns a coherent profile with submitted answers, measurements and pending check-ins',async()=>{
    const response=await request(app).get(`/coach/clients/${client}/profile`).set('Authorization',token(coach,'COACH'));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({profile:{client:{id:client,displayName:'Profile client'},onboarding:{data:{weight:72}},program:null,nutrition:null,workouts:[],progress:[{measurement_date:'2026-09-20',notes:'Recorded progress'}],checkins:[{status:'PENDING',form:{name:'Daily review'}}],subscription:{plan_name:'Monthly coaching'}}});
  });
  it('removes only owned client assignments and rolls back removal when auditing fails',async()=>{
    await pool.query("INSERT INTO coach_profiles(user_id,display_name,business_name) VALUES($1,'Coach','Business')",[coach]);
    for(const kind of ['program','nutrition','supplements'] as const){
      const planId=randomUUID();
      const table=kind==='program'?'program_assignments':kind==='nutrition'?'nutrition_plan_assignments':'supplement_plan_assignments';
      const column=kind==='program'?'program_id':'plan_id';
      if(kind==='program')await pool.query("INSERT INTO programs(id,coach_id,name) VALUES($1,$2,'Assigned program')",[planId,coach]);
      else await pool.query('INSERT INTO nutrition_library(id,coach_id,kind,data) VALUES($1,$2,$3,$4)',[planId,coach,kind==='nutrition'?'plans':'supplements',JSON.stringify({name:'Assigned plan'})]);
      await pool.query(`INSERT INTO ${table}(coach_id,client_id,${column},snapshot) VALUES($1,$2,$3,'{}')`,[coach,client,planId]);
      const path=`/coach/clients/${client}/profile/plans/${kind}/${planId}`;
      expect((await request(app).delete(path).set('Authorization',token(other,'COACH'))).status).toBe(404);
      expect((await request(app).delete(path).set('Authorization',token(client,'CLIENT'))).status).toBe(403);
      await pool.query("ALTER TABLE audit_events ADD CONSTRAINT fail_assignment_remove CHECK(entity_type <> 'CLIENT_PLAN_ASSIGNMENT') NOT VALID");
      try{
        expect((await request(app).delete(path).set('Authorization',token(coach,'COACH'))).status).toBe(500);
        expect((await pool.query(`SELECT id FROM ${table} WHERE ${column}=$1 AND active`,[planId])).rowCount).toBe(1);
      }finally{await pool.query('ALTER TABLE audit_events DROP CONSTRAINT fail_assignment_remove');}
      expect((await request(app).delete(path).set('Authorization',token(coach,'COACH'))).status).toBe(204);
      expect((await pool.query(`SELECT id FROM ${table} WHERE ${column}=$1 AND NOT active`,[planId])).rowCount).toBe(1);
      expect((await pool.query('SELECT id FROM '+(kind==='program'?'programs':'nutrition_library')+' WHERE id=$1',[planId])).rowCount).toBe(1);
      expect((await request(app).delete(path).set('Authorization',token(coach,'COACH'))).status).toBe(409);
    }
  });
  it('denies unknown, cross-coach, wrong-role and revoked access',async()=>{
    const path=`/coach/clients/${client}/profile`;
    expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).get(path).set('Authorization',token(other,'COACH'))).status).toBe(404);
    expect((await request(app).get(path).set('Authorization',token(client,'CLIENT'))).status).toBe(403);
    expect((await request(app).get('/coach/clients/not-a-uuid/profile').set('Authorization',token(coach,'COACH'))).status).toBe(404);
    await pool.query("UPDATE users SET account_status='SUSPENDED' WHERE id=$1",[client]);
    expect((await request(app).get(path).set('Authorization',token(coach,'COACH'))).status).toBe(404);
    await pool.query("UPDATE users SET account_status='APPROVED' WHERE id=$1",[client]);
    await pool.query("UPDATE coach_clients SET status='REJECTED' WHERE client_id=$1",[client]);
    expect((await request(app).get(path).set('Authorization',token(coach,'COACH'))).status).toBe(404);
  });
});
