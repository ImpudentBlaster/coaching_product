import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import express from 'express';
import cookieParser from 'cookie-parser';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { validateEnvironment } from '../../config/environment.js';
import { PostgresIdentityStore } from './postgres-store.js';
import { createIdentityRouter } from './router.js';
import { issueAccessToken } from './auth.js';
import { ClientMailer } from './mailer.js';

describe.skipIf(!process.env.DATABASE_URL)('client account actions', () => {
  const schema = `access_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const url = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost/unused');
  url.searchParams.set('options', `-c search_path=${schema},public`);
  const store = new PostgresIdentityStore(url.toString()), pool = store.pool;
  const coach = randomUUID(), other = randomUUID();
  const env = validateEnvironment({ DATABASE_URL: url.toString(), JWT_ACCESS_SECRET: randomBytes(32).toString('hex'), NODE_ENV: 'test', SMTP_HOST: 'smtp.example.test', MAIL_FROM: 'coach@example.test' });
  const app = express(); app.use(express.json(), cookieParser(), createIdentityRouter(env, store));
  const delivered = vi.spyOn(ClientMailer.prototype, 'send').mockResolvedValue({ status: 'sent' });
  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const directory = new URL('../../../db/migrations/', import.meta.url);
    for (const file of (await readdir(directory)).filter(file => file.endsWith('.sql')).sort()) await pool.query(await readFile(new URL(file, directory), 'utf8'));
    for (const id of [coach, other]) {
      await pool.query("INSERT INTO users(id,email,password_hash,role,account_status) VALUES($1,$2,'unused','COACH','APPROVED')", [id, `${id}@example.test`]);
      await pool.query("INSERT INTO coach_profiles(user_id,display_name,business_name) VALUES($1,'Coach','Coaching')", [id]);
    }
  }, 30000);
  afterAll(async () => { delivered.mockRestore(); await store.close(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); });
  async function client(owner = coach, status = 'APPROVED') {
    const id = randomUUID();
    await pool.query("INSERT INTO users(id,email,password_hash,role,account_status) VALUES($1,$2,'unused','CLIENT',$3)", [id, `${id}@example.test`, status]);
    await pool.query("INSERT INTO client_profiles(user_id,display_name) VALUES($1,'Client')", [id]);
    await pool.query('INSERT INTO coach_clients(coach_id,client_id,status) VALUES($1,$2,$3)', [owner, id, status]);
    return id;
  }
  async function session(id = coach) {
    const refresh = await store.createRefreshSession(id);
    return { bearer: `Bearer ${issueAccessToken(env, { id, role: id === coach || id === other ? 'COACH' : 'CLIENT', sessionFamilyId: refresh.session.familyId })}`, cookie: `refresh_token=${refresh.token}`, refresh };
  }
  it('limits actions to owned clients, deletes atomically, and revokes client sessions', async () => {
    const owned = await client(), foreign = await client(other), auth = await session(), clientAuth = await session(owned);
    const transferred = await client(other), transferredAuth = await session(transferred);
    await pool.query("INSERT INTO coach_clients(coach_id,client_id,status) VALUES($1,$2,'REJECTED')", [coach, transferred]);
    expect((await request(app).delete(`/coach/clients/${transferred}`).set('Authorization', auth.bearer)).status).toBe(204);
    expect((await store.findById(transferred))?.approvalStatus).toBe('APPROVED');
    expect((await request(app).get('/auth/me').set('Authorization', transferredAuth.bearer)).status).toBe(200);
    expect((await request(app).delete(`/coach/clients/${foreign}`).set('Authorization', auth.bearer)).status).toBe(404);
    expect((await request(app).delete(`/coach/clients/${owned}`).set('Authorization', clientAuth.bearer)).status).toBe(403);
    expect((await request(app).delete(`/coach/clients/${owned}`).set('Authorization', auth.bearer)).status).toBe(204);
    expect((await store.listCoachClients(coach)).some(row => row.clientId === owned)).toBe(false);
    expect((await store.findById(owned))?.approvalStatus).toBe('SUSPENDED');
    expect((await request(app).get('/auth/me').set('Authorization', clientAuth.bearer)).status).toBe(401);
    expect((await pool.query("SELECT 1 FROM audit_events WHERE action='CLIENT_DELETED' AND entity_id=$1", [owned])).rowCount).toBe(1);
    expect((await request(app).delete(`/coach/clients/${owned}`).set('Authorization', auth.bearer)).status).toBe(404);
  });
  it('emails one-time resets without returning tokens and invalidates sessions on use', async () => {
    const id = await client(), auth = await session(), clientAuth = await session(id);
    const response = await request(app).post(`/coach/clients/${id}/password-reset`).set('Authorization', auth.bearer);
    expect(response.status).toBe(200); expect(response.body).not.toHaveProperty('token');
    const token = delivered.mock.calls.at(-1)![2]!;
    expect((await request(app).post('/auth/password-reset').send({ token, newPassword: 'NewPassword!12345' })).status).toBe(204);
    expect((await request(app).post('/auth/password-reset').send({ token, newPassword: 'NewPassword!12345' })).status).toBe(410);
    expect((await request(app).get('/auth/me').set('Authorization', clientAuth.bearer)).status).toBe(401);
    expect((await pool.query("SELECT 1 FROM audit_events WHERE action='PASSWORD_RESET_COMPLETED' AND entity_id=$1", [id])).rowCount).toBe(1);
  });
  it('renews invitations without duplicating them or losing setup and excludes foreign invitations', async () => {
    const auth = await session(), invitation = await store.createClientInvitation(coach, `${randomUUID()}@example.test`), foreign = await store.createClientInvitation(other, `${randomUUID()}@example.test`);
    await pool.query('UPDATE client_invitations SET setup=$1 WHERE id=$2', [JSON.stringify({ firstName: 'Taylor' }), invitation.invitationId]);
    expect((await request(app).post(`/coach/invitations/${foreign.invitationId}/registration-mail`).set('Authorization', auth.bearer)).status).toBe(404);
    expect((await request(app).post(`/coach/invitations/${invitation.invitationId}/registration-mail`).set('Authorization', auth.bearer)).status).toBe(200);
    const nextToken = delivered.mock.calls.at(-1)![2]!;
    await expect(store.previewClientInvitation(invitation.token)).rejects.toThrow('INVALID_INVITATION');
    expect((await store.previewClientInvitation(nextToken)).displayName).toBe('Taylor');
    expect((await pool.query<{ setup: unknown }>('SELECT setup FROM client_invitations WHERE id=$1', [invitation.invitationId])).rows[0]!.setup).toEqual({ firstName: 'Taylor' });
  });
  it('ends only the active coach session and starts a bounded client session with an audit trail', async () => {
    const id = await client(), foreign = await client(other), pending = await client(coach, 'PENDING_REVIEW'), auth = await session(), anotherSession = await session();
    expect((await request(app).post(`/auth/switch-client/${id}`).set('Authorization', auth.bearer)).status).toBe(401);
    expect((await request(app).post(`/auth/switch-client/${foreign}`).set('Authorization', auth.bearer).set('Cookie', auth.cookie)).status).toBe(404);
    expect((await request(app).post(`/auth/switch-client/${pending}`).set('Authorization', auth.bearer).set('Cookie', auth.cookie)).status).toBe(409);
    const response = await request(app).post(`/auth/switch-client/${id}`).set('Authorization', auth.bearer).set('Cookie', auth.cookie);
    const switched = response.body as { accessToken: string; user: { id: string; role: string } };
    expect(response.status).toBe(200); expect(switched.user).toMatchObject({ id, role: 'CLIENT' });
    expect((await request(app).get('/auth/me').set('Authorization', auth.bearer)).status).toBe(401);
    expect((await request(app).get('/auth/me').set('Authorization', anotherSession.bearer)).status).toBe(200);
    expect((await request(app).get('/auth/me').set('Authorization', `Bearer ${switched.accessToken}`)).status).toBe(200);
    const cookie = response.headers['set-cookie']![0]!.split(';')[0]!;
    const refreshed = await request(app).post('/auth/refresh').set('Cookie', cookie);
    const refreshedSession = refreshed.body as { accessToken: string; user: { id: string } };
    expect(refreshed.status).toBe(200); expect(refreshedSession.user.id).toBe(id);
    await pool.query("UPDATE users SET account_status='SUSPENDED' WHERE id=$1", [coach]);
    expect((await request(app).get('/auth/me').set('Authorization', `Bearer ${refreshedSession.accessToken}`)).status).toBe(401);
    expect((await pool.query("SELECT 1 FROM audit_events WHERE action='COACH_SWITCHED_TO_CLIENT' AND actor_user_id=$1 AND entity_id=$2", [coach, id])).rowCount).toBe(1);
  });
  it('does not keep an access token valid through a rotated session after logout', async () => {
    const id = await client(), auth = await session(id);
    const refreshed = await request(app).post('/auth/refresh').set('Cookie', auth.cookie);
    expect(refreshed.status).toBe(200);
    const cookie = refreshed.headers['set-cookie']![0]!.split(';')[0]!;
    expect((await request(app).post('/auth/logout').set('Cookie', cookie)).status).toBe(204);
    expect((await request(app).get('/auth/me').set('Authorization', auth.bearer)).status).toBe(401);
  });
});
