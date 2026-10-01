import 'dotenv/config';
import { randomUUID,randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import express from 'express';
import pg from 'pg';
import request from 'supertest';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { foodCatalog,foodCopyId } from './food-catalog.js';
import { nutritionInput } from './nutrition.js';
import { createMvpRouter } from './router.js';
import { validateEnvironment } from '../../config/environment.js';
import { issueAccessToken } from '../identity/auth.js';

it('ships sourced per-100g foods accepted by the existing meal library',()=>{
  expect(foodCatalog.length).toBe(37);
  for(const food of foodCatalog){expect(nutritionInput.safeParse(food.data).success).toBe(true);expect(food.source.url).toContain(String(food.source.fdcId));}
  expect(foodCatalog.find(food=>food.id==='usda-171477')?.data.nutrients).toEqual({calories:165,protein:31.02,carbs:0,fat:3.57});
  expect(foodCopyId('coach-a','usda-171477')).toBe(foodCopyId('coach-a','usda-171477'));
  expect(foodCopyId('coach-a','usda-171477')).not.toBe(foodCopyId('coach-b','usda-171477'));
});
describe.skipIf(!process.env.DATABASE_URL)('starter food copies',()=>{
  const schema=`food_test_${randomUUID().replaceAll('-','')}`;
  const admin=new pg.Pool({connectionString:process.env.DATABASE_URL});
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema},public`});
  const env=validateEnvironment({DATABASE_URL:process.env.DATABASE_URL??'postgresql://localhost/unused',JWT_ACCESS_SECRET:randomBytes(32).toString('hex'),NODE_ENV:'test'});
  const coach=randomUUID(),other=randomUUID(),client=randomUUID();
  const token=(id:string,role:'COACH'|'CLIENT')=>`Bearer ${issueAccessToken(env,{id,role})}`;
  const app=express();app.use(express.json());app.use(createMvpRouter(env,pool));
  app.use((_error:unknown,_req:express.Request,res:express.Response,next:express.NextFunction)=>{void next;res.status(500).json({message:'Transaction failed'});});
  const root='/coach/nutrition-library';const food=foodCatalog[0]!;
  beforeAll(async()=>{
    await admin.query(`CREATE SCHEMA ${schema}`);
    for(const file of ['001_identity_approvals.sql','002_demo_mvp.sql','003_nutrition_library.sql','006_library_management.sql'])await pool.query(await readFile(new URL(`../../../db/migrations/${file}`,import.meta.url),'utf8'));
    for(const id of [coach,other,client]){
      await pool.query("INSERT INTO users(id,email,password_hash,role,account_status) VALUES($1,$2,'unused-test-hash',$3,'APPROVED')",[id,`${id}@example.test`,id===client?'CLIENT':'COACH']);
      if(id!==client)await pool.query("INSERT INTO coach_profiles(user_id,display_name,business_name) VALUES($1,'Coach','Coaching')",[id]);
    }
  });
  afterAll(async()=>{await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();});
  it('adds private copies once, preserves edits, supports meals and restores deleted foods',async()=>{
    const auth=token(coach,'COACH');
    expect((await request(app).get(`${root}/catalog`)).status).toBe(401);
    expect((await request(app).get(`${root}/catalog`).set('Authorization',token(client,'CLIENT'))).status).toBe(403);
    expect((await request(app).post(`${root}/catalog/unknown/add`).set('Authorization',auth)).status).toBe(404);
    expect((await request(app).get(`${root}/catalog`).set('Authorization',auth)).status).toBe(200);
    const add=()=>request(app).post(`${root}/catalog/${food.id}/add`).set('Authorization',auth).send({});
    const copies=await Promise.all([add(),add()]);expect(copies.map(result=>result.status).sort()).toEqual([200,201]);
    const id=foodCopyId(coach,food.id);
    expect((await pool.query('SELECT id FROM nutrition_library WHERE coach_id=$1',[coach])).rowCount).toBe(1);
    const changed={...food.data,name:'My adjusted chicken',version:1};
    expect((await request(app).put(`${root}/foods/${id}`).set('Authorization',auth).send(changed)).status).toBe(200);
    expect((await add()).body).toMatchObject({added:false,entry:{data:{name:'My adjusted chicken'}}});
    expect((await request(app).post(`${root}/catalog/${food.id}/add`).set('Authorization',token(other,'COACH'))).body).toMatchObject({entry:{id:foodCopyId(other,food.id),data:{name:food.data.name}}});
    expect((await request(app).put(`${root}/foods/${id}`).set('Authorization',token(other,'COACH')).send({...changed,version:2})).status).toBe(400);
    expect((await request(app).post(`${root}/meals`).set('Authorization',auth).send({name:'Chicken meal',items:[{id,quantity:200}]})).body).toMatchObject({entry:{data:{nutrients:{calories:330,protein:62.04}}}});
    expect((await request(app).delete(`${root}/foods/${id}`).set('Authorization',auth)).status).toBe(204);
    expect((await add()).body).toMatchObject({added:true,entry:{data:{name:food.data.name}}});
  });
  it('rolls back copies when audit recording fails and enforces live approval',async()=>{
    const nextFood=foodCatalog[1]!;
    await pool.query("ALTER TABLE audit_events ADD CONSTRAINT fail_food_audit CHECK(action <> 'NUTRITION_CATALOG_ADDED') NOT VALID");
    expect((await request(app).post(`${root}/catalog/${nextFood.id}/add`).set('Authorization',token(coach,'COACH'))).status).toBe(500);
    expect((await pool.query('SELECT id FROM nutrition_library WHERE id=$1',[foodCopyId(coach,nextFood.id)])).rowCount).toBe(0);
    await pool.query('ALTER TABLE audit_events DROP CONSTRAINT fail_food_audit');
    await pool.query("UPDATE users SET account_status='SUSPENDED' WHERE id=$1",[other]);
    expect((await request(app).get(`${root}/catalog`).set('Authorization',token(other,'COACH'))).status).toBe(403);
  });
});
