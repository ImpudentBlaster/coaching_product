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
        '002_demo_mvp.sql',
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
      const plan = await create('plans', {
        name: 'Weekly plan',
        items: [
          { id: day.id, label: 'Day 1' },
          { id: day.id, label: 'Day 2' },
        ],
      });
      expect(plan.data.nutrients).toBeUndefined();
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
      const changed={name:'Updated plan',items:plan.data.items!.map(item=>({id:item.id,label:item.label})),version:1};
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
