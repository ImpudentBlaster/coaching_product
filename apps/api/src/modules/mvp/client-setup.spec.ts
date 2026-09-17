import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import express from 'express';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresIdentityStore } from '../identity/postgres-store.js';
import { issueAccessToken } from '../identity/auth.js';
import { validateEnvironment } from '../../config/environment.js';
import { createMvpRouter } from './router.js';
import {
  clientSetupSchema,
  setupDates,
  type ClientSetup,
} from './client-setup.js';

it('schedules chosen weekdays in alternate weeks and validates date ranges', () => {
  expect(
    setupDates({
      formId: randomUUID(),
      startDate: '2026-09-16',
      frequency: 'BIWEEKLY',
      weekdays: [1, 5],
      occurrences: 4,
    }),
  ).toEqual(['2026-09-18', '2026-09-28', '2026-10-02', '2026-10-12']);
  expect(
    clientSetupSchema.shape.membership.safeParse({
      name: 'Plan',
      status: 'ACTIVE',
      startsOn: '2026-10-01',
      endsOn: '2026-09-01',
      notes: '',
    }).success,
  ).toBe(false);
});
describe.skipIf(!process.env.DATABASE_URL)(
  'client setup persistence and authorization',
  () => {
    const schema = `setup_test_${randomUUID().replaceAll('-', '')}`;
    const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const url = new URL(
      process.env.DATABASE_URL ?? 'postgresql://localhost/unused',
    );
    url.searchParams.set('options', `-c search_path=${schema},public`);
    const store = new PostgresIdentityStore(url.toString());
    const pool = store.pool;
    const env = validateEnvironment({
      DATABASE_URL: url.toString(),
      JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
      NODE_ENV: 'test',
    });
    const coach = randomUUID(),
      other = randomUUID(),
      programId = randomUUID(),
      foreignProgram = randomUUID(),
      nutritionPlanId = randomUUID(),
      formId = randomUUID();
    const auth = (id = coach) =>
      `Bearer ${issueAccessToken(env, { id, role: 'COACH' })}`;
    const app = express();
    app.use(express.json());
    app.use(createMvpRouter(env, pool));
    const setup: ClientSetup = {
      firstName: 'Test',
      lastName: 'Client',
      email: `${randomUUID()}@example.test`,
      birthDate: '1995-01-01',
      phone: '+1 555 0100',
      weightUnit: 'KG',
      exerciseUnit: 'LB',
      programId,
      nutritionPlanId,
      membership: {
        name: 'Monthly coaching',
        status: 'ACTIVE',
        startsOn: '2026-09-16',
        endsOn: null,
        notes: 'Manual membership',
      },
      checkin: {
        formId,
        startDate: '2026-09-16',
        frequency: 'DAILY',
        occurrences: 2,
        weekdays: [],
      },
    };
    beforeAll(async () => {
      await admin.query(`CREATE SCHEMA ${schema}`);
      const dir = new URL('../../../db/migrations/', import.meta.url);
      for (const file of (await readdir(dir))
        .filter((file) => file.endsWith('.sql'))
        .sort())
        await pool.query(await readFile(new URL(file, dir), 'utf8'));
      for (const id of [coach, other]) {
        await pool.query(
          "INSERT INTO users(id,email,password_hash,role,account_status) VALUES($1,$2,'unused','COACH','APPROVED')",
          [id, `${id}@example.test`],
        );
        await pool.query(
          "INSERT INTO coach_profiles(user_id,display_name,business_name) VALUES($1,'Coach','Business')",
          [id],
        );
      }
      await pool.query(
        "INSERT INTO programs(id,coach_id,name,status) VALUES($1,$2,'Training','PUBLISHED'),($3,$4,'Other training','PUBLISHED')",
        [programId, coach, foreignProgram, other],
      );
      await pool.query(
        "INSERT INTO nutrition_library(id,coach_id,kind,data) VALUES($1,$2,'plans',$3)",
        [
          nutritionPlanId,
          coach,
          JSON.stringify({ name: 'Nutrition', kind: 'plans', items: [] }),
        ],
      );
      const definition = {
        name: 'Daily review',
        fields: [
          { id: 'sleep', label: 'Sleep', type: 'NUMBER', required: true },
        ],
      };
      await pool.query(
        'INSERT INTO checkin_forms(id,coach_id,definition) VALUES($1,$2,$3)',
        [formId, coach, JSON.stringify(definition)],
      );
      await pool.query(
        'INSERT INTO checkin_form_versions(form_id,version,definition) VALUES($1,1,$2)',
        [formId, JSON.stringify(definition)],
      );
    }, 30000);
    afterAll(async () => {
      await store.close();
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    });
    it('saves invitation setup, applies it at registration, updates atomically and rejects stale/cross-tenant writes', async () => {
      expect(
        (await request(app).post('/coach/client-setup').send(setup)).status,
      ).toBe(401);
      expect(
        (
          await request(app)
            .post('/coach/client-setup')
            .set('Authorization', auth())
            .send({ ...setup, programId: foreignProgram })
        ).status,
      ).toBe(400);
      const invite = await request(app)
        .post('/coach/client-setup')
        .set('Authorization', auth())
        .send(setup);
      expect(invite.status).toBe(201);
      const invitation = (
        invite.body as { invitation: { id: string; token: string } }
      ).invitation;
      expect(
        (
          await request(app)
            .get(`/coach/client-setup/invitations/${invitation.id}`)
            .set('Authorization', auth(other))
        ).status,
      ).toBe(404);
      expect(
        (
          await request(app)
            .put(`/coach/client-setup/invitations/${invitation.id}`)
            .set('Authorization', auth())
            .send({ revision: 1, data: { ...setup, phone: 'Updated phone' } })
        ).status,
      ).toBe(200);
      const registered = await store.registerClient({
        token: invitation.token,
        password: randomBytes(24).toString('hex'),
        displayName: 'Client chosen name',
      });
      const id = registered.user.id;
      expect(registered.user.approvalStatus).toBe('PENDING_REVIEW');
      expect(registered.user.displayName).toBe('Test Client');
      expect(
        (
          await pool.query(
            'SELECT id FROM program_assignments WHERE client_id=$1 AND active',
            [id],
          )
        ).rowCount,
      ).toBe(1);
      expect(
        (
          await pool.query(
            'SELECT id FROM nutrition_plan_assignments WHERE client_id=$1 AND active',
            [id],
          )
        ).rowCount,
      ).toBe(1);
      expect(
        (
          await pool.query(
            'SELECT id FROM checkin_assignments WHERE client_id=$1',
            [id],
          )
        ).rowCount,
      ).toBe(2);
      const loaded = await request(app)
        .get(`/coach/client-setup/${id}`)
        .set('Authorization', auth());
      expect(loaded.status).toBe(200);
      expect((loaded.body as { data: ClientSetup }).data.phone).toBe(
        'Updated phone',
      );
      expect(
        (
          await request(app)
            .get(`/coach/client-setup/${id}`)
            .set('Authorization', auth(other))
        ).status,
      ).toBe(404);
      await pool.query(
        "ALTER TABLE audit_events ADD CONSTRAINT fail_setup CHECK(action<>'CLIENT_SETUP_SAVED') NOT VALID",
      );
      expect(
        (
          await request(app)
            .put(`/coach/client-setup/${id}`)
            .set('Authorization', auth())
            .send({
              revision: 1,
              data: { ...setup, firstName: 'Changed', programId: null },
            })
        ).status,
      ).toBe(500);
      expect(
        (
          await pool.query<{ display_name: string }>(
            'SELECT display_name FROM client_profiles WHERE user_id=$1',
            [id],
          )
        ).rows[0]!.display_name,
      ).toBe('Test Client');
      expect(
        (
          await pool.query(
            'SELECT id FROM program_assignments WHERE client_id=$1 AND active',
            [id],
          )
        ).rowCount,
      ).toBe(1);
      await pool.query('ALTER TABLE audit_events DROP CONSTRAINT fail_setup');
      expect(
        (
          await request(app)
            .put(`/coach/client-setup/${id}`)
            .set('Authorization', auth())
            .send({ revision: 1, data: { ...setup, firstName: 'Updated' } })
        ).status,
      ).toBe(200);
      expect(
        (
          await request(app)
            .put(`/coach/client-setup/${id}`)
            .set('Authorization', auth())
            .send({ revision: 1, data: setup })
        ).status,
      ).toBe(409);
      expect(
        (
          await pool.query(
            'SELECT id FROM checkin_assignments WHERE client_id=$1',
            [id],
          )
        ).rowCount,
      ).toBe(2);
      expect(
        (
          await pool.query(
            'SELECT id FROM program_assignments WHERE client_id=$1',
            [id],
          )
        ).rowCount,
      ).toBe(1);
    }, 30000);
  },
);
