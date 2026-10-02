import 'dotenv/config';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import express from 'express';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateEnvironment } from '../../config/environment.js';
import { issueAccessToken } from '../identity/auth.js';
import { createMvpRouter } from './router.js';
import {
  nutritionInput,
  portion,
  sumNutrients,
  type NutritionNode,
} from './nutrition.js';

it('scales serving quantities and sums decimal nutrients without rounding early', () => {
  const nutrients = { calories: 120, protein: 10, carbs: 15, fat: 2.5 };
  expect(
    sumNutrients([portion(nutrients, 150, 100), portion(nutrients, 50, 100)]),
  ).toEqual({ calories: 240, protein: 20, carbs: 30, fat: 5 });
  expect(
    nutritionInput.safeParse({ kind: 'meals', name: 'Lunch', items: [] })
      .success,
  ).toBe(false);
  expect(
    nutritionInput.safeParse({
      kind: 'foods',
      name: 'Food',
      servingSize: 0,
      unit: 'g',
      nutrients,
    }).success,
  ).toBe(false);
});

// A private disposable schema keeps integration fixtures out of the demo data.
describe.skipIf(!process.env.DATABASE_URL)(
  'nutrition PostgreSQL workflow',
  () => {
    const schema = `nutrition_test_${randomUUID().replaceAll('-', '')}`;
    const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema},public`,
    });
    const environment = validateEnvironment({
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://localhost/unused',
      JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
      NODE_ENV: 'test',
    });
    const app = express();
    app.use(express.json());
    app.use(createMvpRouter(environment, pool));
    const coach = randomUUID(),
      otherCoach = randomUUID(),
      client = randomUUID(),
      outsider = randomUUID();
    const token = (id: string, role: 'COACH' | 'CLIENT') =>
      `Bearer ${issueAccessToken(environment, { id, role })}`;
    const coachToken = token(coach, 'COACH');
    beforeAll(async () => {
      await admin.query(`CREATE SCHEMA ${schema}`);
      for (const file of [
        '001_identity_approvals.sql',
        '002_demo_mvp.sql', '009_custom_exercises.sql', '010_program_exercise_days.sql',
        '003_nutrition_library.sql',
 '006_library_management.sql',
      ]) {
        await pool.query(
          await readFile(
            new URL(`../../../db/migrations/${file}`, import.meta.url),
            'utf8',
          ),
        );
      }
      for (const [id, role] of [
        [coach, 'COACH'],
        [otherCoach, 'COACH'],
        [client, 'CLIENT'],
        [outsider, 'CLIENT'],
      ]) {
        await pool.query(
          "INSERT INTO users(id,email,password_hash,role,account_status) VALUES($1,$2,'unused-test-hash',$3,'APPROVED')",
          [id, `${id}@example.test`, role],
        );
        if (role === 'COACH')
          await pool.query(
            "INSERT INTO coach_profiles(user_id,display_name,business_name) VALUES($1,'Test coach','Test business')",
            [id],
          );
      }
      await pool.query(
        "INSERT INTO coach_clients(coach_id,client_id,status) VALUES($1,$2,'APPROVED')",
        [coach, client],
      );
    }, 30000);
    afterAll(async () => {
      await pool.end();
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    });

    it('searches owned clients and assigns multiple clients atomically with audit events', async () => {
      const secondClient = randomUUID(), programId = randomUUID();
      await pool.query("INSERT INTO users(id,email,password_hash,role,account_status) VALUES($1,$2,'unused','CLIENT','APPROVED')", [secondClient, `searchable-${secondClient}@example.test`]);
      await pool.query("INSERT INTO client_profiles(user_id,display_name) VALUES($1,'Nisha Searchable')", [secondClient]);
      await pool.query("INSERT INTO coach_clients(coach_id,client_id,status) VALUES($1,$2,'APPROVED')", [coach, secondClient]);
      await pool.query("INSERT INTO programs(id,coach_id,name,status) VALUES($1,$2,'Bulk plan','PUBLISHED')", [programId, coach]);
      const search = '/coach/programs/assignment-clients';
      const byName = await request(app).get(search).query({ q: 'nisha' }).set('Authorization', coachToken);
      expect(byName.status).toBe(200);
      expect((byName.body as {items:Array<{id:string}>}).items.map(item => item.id)).toEqual([secondClient]);
      const byEmail = await request(app).get(search).query({ q: `searchable-${secondClient}` }).set('Authorization', coachToken);
      expect((byEmail.body as {items:Array<{id:string}>}).items.map(item => item.id)).toEqual([secondClient]);
      expect((await request(app).get(search).query({ q: 'nisha' }).set('Authorization', token(otherCoach,'COACH'))).body).toEqual({ items: [], hasMore: false });
      expect((await request(app).get(search).set('Authorization', token(client,'CLIENT'))).status).toBe(403);
      const path = `/coach/programs/${programId}/assign`;
      expect((await request(app).post(path).set('Authorization', coachToken).send({ clientIds: [] })).status).toBe(400);
      expect((await request(app).post(path).set('Authorization', coachToken).send({ clientIds: [client, outsider] })).status).toBe(404);
      expect((await pool.query('SELECT id FROM program_assignments WHERE program_id=$1',[programId])).rowCount).toBe(0);
      await pool.query("ALTER TABLE audit_events ADD CONSTRAINT fail_bulk_assignment CHECK(action <> 'PROGRAM_ASSIGNED') NOT VALID");
      try {
        expect((await request(app).post(path).set('Authorization', coachToken).send({ clientIds: [client,secondClient] })).status).toBe(500);
        expect((await pool.query('SELECT id FROM program_assignments WHERE program_id=$1',[programId])).rowCount).toBe(0);
      } finally { await pool.query('ALTER TABLE audit_events DROP CONSTRAINT fail_bulk_assignment'); }
      const result = await request(app).post(path).set('Authorization', coachToken).send({ clientIds: [client,secondClient,client] });
      expect(result.status).toBe(201);
      expect((result.body as { assignments: unknown[] }).assignments).toHaveLength(2);
      const programCounts = await request(app).get('/coach/programs').set('Authorization', coachToken);
      expect((programCounts.body as {programs:Array<{id:string;client_count:number}>}).programs.find(item => item.id === programId)?.client_count).toBe(2);
      const checked = await request(app).get(search).query({ q: 'nisha', programId }).set('Authorization', coachToken);
      expect((checked.body as {items:Array<{assignmentId:string}>}).items[0]!.assignmentId).toEqual(expect.any(String));
      expect((await request(app).get(search).query({ q: 'nisha', programId }).set('Authorization', token(otherCoach,'COACH'))).status).toBe(404);
      expect((await pool.query('SELECT id FROM program_assignments WHERE program_id=$1 AND active',[programId])).rowCount).toBe(2);
      expect((await pool.query("SELECT id FROM audit_events WHERE action='PROGRAM_ASSIGNED' AND metadata->>'programId'=$1",[programId])).rowCount).toBe(2);
      const assignedPath = `/coach/programs/${programId}/assignments`;
      const listed = await request(app).get(assignedPath).set('Authorization', coachToken);
      expect((listed.body as {items:unknown[]}).items).toHaveLength(2);
      expect((await request(app).get(assignedPath).set('Authorization', token(otherCoach,'COACH'))).status).toBe(404);
      const assignmentId = (result.body as {assignments:Array<{id:string}>}).assignments[0]!.id;
      expect((await request(app).delete(`${assignedPath}/${assignmentId}`).set('Authorization', token(otherCoach,'COACH'))).status).toBe(404);
      await pool.query("ALTER TABLE audit_events ADD CONSTRAINT fail_unassignment CHECK(action <> 'PROGRAM_UNASSIGNED') NOT VALID");
      try {
        expect((await request(app).delete(`${assignedPath}/${assignmentId}`).set('Authorization', coachToken)).status).toBe(500);
        expect((await pool.query('SELECT id FROM program_assignments WHERE id=$1 AND active',[assignmentId])).rowCount).toBe(1);
      } finally { await pool.query('ALTER TABLE audit_events DROP CONSTRAINT fail_unassignment'); }
      expect((await request(app).delete(`${assignedPath}/${assignmentId}`).set('Authorization', coachToken)).status).toBe(204);
      const updatedCounts = await request(app).get('/coach/programs').set('Authorization', coachToken);
      expect((updatedCounts.body as {programs:Array<{id:string;client_count:number}>}).programs.find(item => item.id === programId)?.client_count).toBe(1);
      const unchecked = await request(app).get(search).query({ q: '@', programId }).set('Authorization', coachToken);
      expect((unchecked.body as {items:Array<{assignmentId:string|null}>}).items.filter(item => item.assignmentId === assignmentId)).toHaveLength(0);
      expect((await pool.query('SELECT id FROM program_assignments WHERE program_id=$1 AND active',[programId])).rowCount).toBe(1);
      expect((await pool.query("SELECT id FROM audit_events WHERE action='PROGRAM_UNASSIGNED' AND entity_id=$1",[assignmentId])).rowCount).toBe(1);
      expect((await request(app).delete(`${assignedPath}/${assignmentId}`).set('Authorization', coachToken)).status).toBe(404);
    });
    it('edits published programs without changing assigned snapshots and audits atomically', async () => {
      const programId = randomUUID(), first = randomUUID(), second = randomUUID(), foreign = randomUUID();
      await pool.query("INSERT INTO workout_templates(id,coach_id,name) VALUES($1,$4,'Original'),($2,$4,'Updated'),($3,$5,'Other coach')", [first, second, foreign, coach, otherCoach]);
      await pool.query("INSERT INTO programs(id,coach_id,name,status) VALUES($1,$2,'Published plan','PUBLISHED')", [programId, coach]);
      await pool.query("INSERT INTO program_days(program_id,template_id,position,day_label) VALUES($1,$2,0,'Day 1')", [programId, first]);
      const assigned = await request(app).post(`/coach/programs/${programId}/assign`).set('Authorization', coachToken).send({ clientId: client });
      expect(assigned.status).toBe(201);
      const snapshot = (await pool.query<{ snapshot: unknown }>('SELECT snapshot FROM program_assignments WHERE program_id=$1', [programId])).rows[0]!.snapshot;
      const body = { name: 'Revised plan', description: 'New version', days: [{ templateId: second, dayLabel: 'Day 2' }] };
      expect((await request(app).put(`/coach/programs/${programId}`).set('Authorization', token(otherCoach, 'COACH')).send(body)).status).toBe(409);
      expect((await request(app).put(`/coach/programs/${programId}`).set('Authorization', token(client, 'CLIENT')).send(body)).status).toBe(403);
      expect((await request(app).put(`/coach/programs/${programId}`).set('Authorization', coachToken).send({ ...body, days: [{ templateId: foreign, dayLabel: 'Day 2' }] })).status).toBe(409);
      await pool.query("ALTER TABLE audit_events ADD CONSTRAINT fail_program_update CHECK(action <> 'PROGRAM_UPDATED') NOT VALID");
      try {
        expect((await request(app).put(`/coach/programs/${programId}`).set('Authorization', coachToken).send(body)).status).toBe(409);
        expect((await pool.query<{ name: string }>('SELECT name FROM programs WHERE id=$1', [programId])).rows[0]!.name).toBe('Published plan');
        expect((await pool.query<{ template_id: string }>('SELECT template_id FROM program_days WHERE program_id=$1', [programId])).rows[0]!.template_id).toBe(first);
      } finally { await pool.query('ALTER TABLE audit_events DROP CONSTRAINT fail_program_update'); }
      expect((await request(app).put(`/coach/programs/${programId}`).set('Authorization', coachToken).send(body)).status).toBe(200);
      expect((await pool.query('SELECT name,status FROM programs WHERE id=$1', [programId])).rows[0]).toEqual({ name: 'Revised plan', status: 'PUBLISHED' });
      expect((await pool.query<{ snapshot: unknown }>('SELECT snapshot FROM program_assignments WHERE program_id=$1', [programId])).rows[0]!.snapshot).toEqual(snapshot);
      expect((await pool.query("SELECT id FROM audit_events WHERE entity_id=$1 AND action='PROGRAM_UPDATED'", [programId])).rowCount).toBe(1);
      await pool.query("UPDATE programs SET status='ARCHIVED' WHERE id=$1", [programId]);
      expect((await request(app).put(`/coach/programs/${programId}`).set('Authorization', coachToken).send(body)).status).toBe(409);
    });
    it('saves manual program days atomically, enforces exercise ownership and snapshots instructions', async () => {
      const externalId = `manual-${randomUUID()}`;
      const privateId = `private-${randomUUID()}`;
      await pool.query('INSERT INTO exercises(external_id,name,body_part,equipment,target,instructions) VALUES($1,$2,$3,$4,$5,$6)', [externalId, 'Manual squat', 'legs', 'body weight', 'quads', JSON.stringify(['Lower slowly.'])]);
      await pool.query('INSERT INTO exercises(external_id,name,body_part,equipment,target,instructions,owner_coach_id) VALUES($1,$2,$3,$4,$5,$6,$7)', [privateId, 'Private exercise', 'legs', 'body weight', 'quads', '[]', otherCoach]);
      const body = { name: 'Manual program', description: '', days: [{ dayLabel: 'Day 1', exercises: [{ exerciseId: externalId, sets: 3, repetitions: 10, restSeconds: 60 }] }] };
      expect((await request(app).post('/coach/programs').set('Authorization', coachToken).send({ ...body, days: [{ ...body.days[0], exercises: [{ ...body.days[0]!.exercises[0], exerciseId: privateId }] }] })).status).toBe(409);
      await pool.query("ALTER TABLE audit_events ADD CONSTRAINT fail_manual_program CHECK(action <> 'PROGRAM_CREATED') NOT VALID");
      try {
        expect((await request(app).post('/coach/programs').set('Authorization', coachToken).send(body)).status).toBe(409);
        expect((await pool.query("SELECT id FROM workout_templates WHERE program_day_only AND name='Day 1'")).rowCount).toBe(0);
      } finally { await pool.query('ALTER TABLE audit_events DROP CONSTRAINT fail_manual_program'); }
      const created = await request(app).post('/coach/programs').set('Authorization', coachToken).send(body);
      expect(created.status).toBe(201);
      const programId = (created.body as { program: { id: string } }).program.id;
      const listed = await request(app).get('/coach/programs').set('Authorization', coachToken);
      expect((listed.body as { programs: Array<{ id: string; days: Array<{ manual: boolean }> }> }).programs.find(item => item.id === programId)?.days[0]?.manual).toBe(true);
      expect((await request(app).post(`/coach/programs/${programId}/publish`).set('Authorization', coachToken)).status).toBe(200);
      expect((await request(app).post(`/coach/programs/${programId}/assign`).set('Authorization', coachToken).send({ clientId: client })).status).toBe(201);
      const snapshot = (await pool.query<{ snapshot: { days: Array<{ exercises: Array<{ instructions: string[] }> }> } }>('SELECT snapshot FROM program_assignments WHERE program_id=$1', [programId])).rows[0]!.snapshot;
      expect(snapshot.days[0]!.exercises[0]!.instructions).toEqual(['Lower slowly.']);
      expect((await request(app).put(`/coach/programs/${programId}`).set('Authorization', coachToken).send(body)).status).toBe(200);
      expect((await pool.query('SELECT id FROM workout_templates WHERE coach_id=$1 AND program_day_only', [coach])).rowCount).toBe(1);
      expect((await pool.query<{ snapshot: unknown }>('SELECT snapshot FROM program_assignments WHERE program_id=$1', [programId])).rows[0]!.snapshot).toEqual(snapshot);
    });
    it('archives programs only for their owner and rolls back when auditing fails',async()=>{
      const programId=randomUUID();
      await pool.query("INSERT INTO programs(id,coach_id,name,description) VALUES($1,$2,'Test program','')",[programId,coach]);
      expect((await request(app).delete(`/coach/programs/${programId}`).set('Authorization',token(otherCoach,'COACH'))).status).toBe(404);
      await pool.query("ALTER TABLE audit_events ADD CONSTRAINT fail_program_audit CHECK(action <> 'PROGRAM_ARCHIVED') NOT VALID");
      expect((await request(app).delete(`/coach/programs/${programId}`).set('Authorization',coachToken)).status).toBe(500);
      expect((await pool.query<{status:string}>('SELECT status FROM programs WHERE id=$1',[programId])).rows[0]?.status).toBe('DRAFT');
      await pool.query('ALTER TABLE audit_events DROP CONSTRAINT fail_program_audit');
      expect((await request(app).delete(`/coach/programs/${programId}`).set('Authorization',coachToken)).status).toBe(204);
      expect((await pool.query("SELECT id FROM audit_events WHERE action='PROGRAM_ARCHIVED' AND entity_id=$1",[programId])).rowCount).toBe(1);
    });
    it('creates the entire hierarchy, enforces tenancy, replaces assignments, and audits atomically', async () => {
      async function create(kind: string, body: object, auth = coachToken) {
        const response = await request(app)
          .post(`/coach/nutrition-library/${kind}`)
          .set('Authorization', auth)
          .send(body);
        expect(response.status, JSON.stringify(response.body)).toBe(201);
        return (response.body as { entry: { id: string; data: NutritionNode } })
          .entry;
      }
      const food = await create('foods', {
        name: 'Oats',
        servingSize: 100,
        unit: 'g',
        nutrients: { calories: 400, protein: 10, carbs: 70, fat: 8 },
      });
      const foreign = await create(
        'foods',
        {
          name: 'Private food',
          servingSize: 1,
          unit: 'piece',
          nutrients: { calories: 20, protein: 1, carbs: 3, fat: 1 },
        },
        token(otherCoach, 'COACH'),
      );
      expect(
        (
          await request(app)
            .post('/coach/nutrition-library/meals')
            .set('Authorization', coachToken)
            .send({
              name: 'Bad meal',
              items: [{ id: foreign.id, quantity: 1 }],
            })
        ).status,
      ).toBe(400);
      const meal = await create('meals', {
        name: 'Breakfast',
        items: [
          { id: food.id, quantity: 50 },
          { id: food.id, quantity: 25 },
        ],
      });
      expect(meal.data.nutrients).toEqual({
        calories: 300,
        protein: 7.5,
        carbs: 52.5,
        fat: 6,
      });
      expect(
        (
          await request(app)
            .post('/coach/nutrition-library/plans')
            .set('Authorization', coachToken)
            .send({
              name: 'Wrong hierarchy',
              items: [{ id: meal.id, label: 'Day 1' }],
            })
        ).status,
      ).toBe(400);
      const day = await create('days', {
        name: 'Training day',
        items: [
          { id: meal.id, label: 'Breakfast' },
          { id: meal.id, label: 'Snack' },
        ],
      });
      expect(day.data.nutrients?.calories).toBe(600);
      const mixedDay = await create('days', {
        name: 'Mixed day',
        items: [{id:meal.id,label:'Breakfast'},{id:food.id,type:'foods',quantity:50,label:'Snack'}],
      });
      expect(mixedDay.data.nutrients).toEqual({calories:500,protein:12.5,carbs:87.5,fat:10});
      expect(mixedDay.data.items?.[1]).toMatchObject({label:'Snack',quantity:50,node:{kind:'foods',name:'Oats'},nutrients:{calories:200,protein:5,carbs:35,fat:4}});
      const foodDay = await create('days',{name:'Food only day',items:[{id:food.id,type:'foods',quantity:25,label:'Lunch'}]});
      expect(foodDay.data.nutrients?.calories).toBe(100);
      const customId=randomUUID();
      const entryDay=await create('days',{name:'Named entries day',items:[{id:meal.id,label:'Morning'},{id:customId,type:'custom',label:'Lunch',foods:[{id:food.id,quantity:50},{id:food.id,quantity:25}]}]});
      expect(entryDay.data.nutrients).toEqual({calories:600,protein:15,carbs:105,fat:12});
      expect(entryDay.data.items?.[1]).toMatchObject({id:customId,label:'Lunch',node:{kind:'meals',custom:true,name:'Lunch',items:[{id:food.id,quantity:50},{id:food.id,quantity:25}]}});
      const updatedDay=await request(app).put(`/coach/nutrition-library/days/${entryDay.id}`).set('Authorization',coachToken).send({name:'Named entries day',version:1,items:[{id:customId,type:'custom',label:'Dinner',foods:[{id:food.id,quantity:100}]}]});
      expect(updatedDay.status).toBe(200);
      const updatedNode=(updatedDay.body as {entry:{data:NutritionNode}}).entry.data;
      expect(updatedNode.items?.[0]?.node.name).toBe('Dinner');
      expect(updatedNode.nutrients?.calories).toBe(400);
      for (const item of [
        {id:foreign.id,type:'foods',quantity:1,label:'Private'},
        {id:meal.id,type:'foods',quantity:1,label:'Wrong kind'},
        {id:food.id,label:'Wrong kind'},
        {id:food.id,type:'foods',quantity:0,label:'Invalid quantity'},
        {id:food.id,type:'foods',label:'Missing quantity'},
        {id:customId,type:'custom',label:'Empty',foods:[]},
        {id:customId,type:'custom',label:'Private',foods:[{id:foreign.id,quantity:1}]},
        {id:customId,type:'custom',label:'Wrong kind',foods:[{id:meal.id,quantity:1}]},
        {id:customId,type:'custom',label:'Bad portion',foods:[{id:food.id,quantity:0}]},
      ]) {
        expect((await request(app).post('/coach/nutrition-library/days').set('Authorization',coachToken).send({name:'Invalid day',items:[item]})).status).toBe(400);
      }
      const customPlanDay={id:randomUUID(),type:'custom',label:'Rest day',notes:'Recover well',items:[{id:meal.id,label:'Breakfast'},{id:randomUUID(),type:'custom',label:'Lunch',foods:[{id:food.id,quantity:50}]}]};
      for(const items of [
        [],
        [{id:randomUUID(),type:'custom',label:'Lunch',foods:[{id:foreign.id,quantity:50}]}],
        [{id:randomUUID(),type:'custom',label:'Lunch',foods:[{id:meal.id,quantity:50}]}],
        [{id:randomUUID(),type:'custom',label:'Lunch',foods:[{id:food.id,quantity:0}]}],
      ])expect((await request(app).post('/coach/nutrition-library/plans').set('Authorization',coachToken).send({name:'Invalid custom plan',items:[{...customPlanDay,items}]})).status).toBe(400);
      const plan = await create('plans', {
        name: 'Weekly plan',
        items: [
          { id: day.id, label: 'Day 1' },
          customPlanDay,
        ],
      });
      expect(plan.data.nutrients).toBeUndefined();
      expect(plan.data.items?.[1]?.node).toMatchObject({kind:'days',custom:true,name:'Rest day',notes:'Recover well',nutrients:{calories:500,protein:12.5,carbs:87.5,fat:10},items:[{label:'Breakfast',node:{kind:'meals'}},{label:'Lunch',node:{kind:'meals',custom:true,items:[{quantity:50,node:{name:'Oats'}}]}}]});
      expect((await pool.query('SELECT id FROM nutrition_library WHERE id=$1',[customPlanDay.id])).rowCount).toBe(0);
      expect((await request(app).get('/coach/nutrition-library')).status).toBe(
        401,
      );
      expect(
        (
          await request(app)
            .get('/coach/nutrition-library')
            .set('Authorization', token(client, 'CLIENT'))
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .post(`/coach/nutrition-library/plans/${plan.id}/assign`)
            .set('Authorization', token(otherCoach, 'COACH'))
            .send({ clientId: client })
        ).status,
      ).toBe(404);
      expect(
        (
          await request(app)
            .post(`/coach/nutrition-library/plans/${plan.id}/assign`)
            .set('Authorization', coachToken)
            .send({ clientId: outsider })
        ).status,
      ).toBe(404);
      for (let index = 0; index < 2; index++)
        expect(
          (
            await request(app)
              .post(`/coach/nutrition-library/plans/${plan.id}/assign`)
              .set('Authorization', coachToken)
              .send({ clientId: client })
          ).status,
        ).toBe(201);
      const assigned = await request(app)
        .get('/client/nutrition-plan')
        .set('Authorization', token(client, 'CLIENT'));
      expect(
        (assigned.body as { assignment: { snapshot: NutritionNode } })
          .assignment.snapshot,
      ).toEqual(plan.data);
      expect(
        (
          await request(app)
            .get('/client/nutrition-plan')
            .set('Authorization', token(outsider, 'CLIENT'))
        ).body,
      ).toEqual({ assignment: null });
      expect(
        (
          await pool.query(
            'SELECT id FROM nutrition_plan_assignments WHERE active',
          )
        ).rowCount,
      ).toBe(1);
      expect(
        (
          await pool.query(
            "SELECT id FROM audit_events WHERE action='NUTRITION_ASSIGNED'",
          )
        ).rowCount,
      ).toBe(2);
      const changed={name:'Updated plan',items:[{id:day.id,label:'Day 1'},customPlanDay],version:1};
      expect((await request(app).put(`/coach/nutrition-library/plans/${plan.id}`).set('Authorization',token(otherCoach,'COACH')).send(changed)).status).toBe(400);
      expect((await request(app).put(`/coach/nutrition-library/plans/${plan.id}`).set('Authorization',coachToken).send(changed)).status).toBe(200);
      expect((await request(app).put(`/coach/nutrition-library/plans/${plan.id}`).set('Authorization',coachToken).send(changed)).status).toBe(400);
      const unchanged=await request(app).get('/client/nutrition-plan').set('Authorization',token(client,'CLIENT'));
      expect((unchanged.body as {assignment:{snapshot:NutritionNode}}).assignment.snapshot).toEqual(plan.data);
      // Force an audit failure and prove replacement rolls back with it.
      await pool.query(
        "ALTER TABLE audit_events ADD CONSTRAINT fail_assignment_audit CHECK(action <> 'NUTRITION_ASSIGNED') NOT VALID",
      );
      expect(
        (
          await request(app)
            .post(`/coach/nutrition-library/plans/${plan.id}/assign`)
            .set('Authorization', coachToken)
            .send({ clientId: client })
        ).status,
      ).toBe(500);
      expect(
        (await pool.query('SELECT id FROM nutrition_plan_assignments'))
          .rowCount,
      ).toBe(2);
      expect(
        (
          await pool.query(
            'SELECT id FROM nutrition_plan_assignments WHERE active',
          )
        ).rowCount,
      ).toBe(1);
      expect((await request(app).delete(`/coach/nutrition-library/plans/${plan.id}`).set('Authorization',token(otherCoach,'COACH'))).status).toBe(404);
      expect((await request(app).delete(`/coach/nutrition-library/plans/${plan.id}`).set('Authorization',coachToken)).status).toBe(204);
      const afterDelete=await request(app).get('/client/nutrition-plan').set('Authorization',token(client,'CLIENT'));
      expect((afterDelete.body as {assignment:{snapshot:NutritionNode}}).assignment.snapshot).toEqual(plan.data);
      const library=await request(app).get('/coach/nutrition-library').set('Authorization',coachToken);
      expect((library.body as {entries:Array<{id:string}>}).entries.some(entry=>entry.id===plan.id)).toBe(false);
      await pool.query(
        "UPDATE coach_clients SET status='SUSPENDED' WHERE client_id=$1",
        [client],
      );
      expect(
        (
          await request(app)
            .get('/client/nutrition-plan')
            .set('Authorization', token(client, 'CLIENT'))
        ).body,
      ).toEqual({ assignment: null });
    });
  },
);
