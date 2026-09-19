import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { DemoIdentityStore } from './modules/identity/demo-store.js';
import { createApp } from './app.js';
import type { Environment } from './config/environment.js';
import type { PublicUser } from './modules/identity/types.js';

const environment: Environment = {
  NODE_ENV: 'test',
  API_HOST: '127.0.0.1',
  API_PORT: 3000,
  WEB_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-characters',
  DEMO_MODE: true,
  DEMO_ADMIN_EMAIL: 'admin@example.test',
  DEMO_ADMIN_PASSWORD: 'AdminPassword!123',
};

const app = await createApp(environment);

describe('health API', () => {

  it('reports liveness', async () => {
    const response = await request(app).get('/api/v1/health/live');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns a stable not-found error', async () => {
    const response = await request(app).get('/api/v1/unknown');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ code: 'NOT_FOUND', message: 'Resource not found' });
  });
});

describe('coach approval flow', () => {
  it('registers a forced-pending coach and lets only the admin approve it', async () => {
    const registration = await request(app).post('/api/v1/auth/coach/register').send({
      email: 'coach@example.test', password: 'CoachPassword!123', displayName: 'Demo Coach', businessName: 'Stronger Coaching',
      role: 'PLATFORM_ADMIN', approvalStatus: 'APPROVED',
    });
    const registeredBody = registration.body as { user: PublicUser };
    expect(registration.status).toBe(201);
    expect(registeredBody.user).toMatchObject({ role: 'COACH', approvalStatus: 'PENDING_REVIEW' });

    const coachLogin = await request(app).post('/api/v1/auth/login').send({ email: 'coach@example.test', password: 'CoachPassword!123' });
    const coachLoginBody = coachLogin.body as { accessToken: string };
    const forbidden = await request(app).get('/api/v1/admin/coaches').set('authorization', `Bearer ${coachLoginBody.accessToken}`);
    expect(forbidden.status).toBe(403);

    const adminLogin = await request(app).post('/api/v1/auth/login').send({ email: environment.DEMO_ADMIN_EMAIL, password: environment.DEMO_ADMIN_PASSWORD });
    const adminLoginBody = adminLogin.body as { accessToken: string };
    const approval = await request(app).post(`/api/v1/admin/coaches/${registeredBody.user.id}/approve`).set('authorization', `Bearer ${adminLoginBody.accessToken}`).send({});
    const approvalBody = approval.body as { coach: PublicUser };
    expect(approval.status).toBe(200);
    expect(approvalBody.coach.approvalStatus).toBe('APPROVED');

    const approvedCoachLogin = await request(app).post('/api/v1/auth/login').send({ email: 'coach@example.test', password: 'CoachPassword!123' });
    const approvedCoachToken = (approvedCoachLogin.body as { accessToken: string }).accessToken;
    const invitation = await request(app).post('/api/v1/coach/invitations').set('authorization', `Bearer ${approvedCoachToken}`).send({ email: 'client@example.test' });
    const invitationBody = invitation.body as { invitation: { token: string } };
    expect(invitation.status).toBe(201);

    const clientRegistration = await request(app).post('/api/v1/auth/client/register').send({ token: invitationBody.invitation.token, password: 'ClientPassword!123', displayName: 'Demo Client' });
    expect(clientRegistration.status).toBe(201);
    const replay = await request(app).post('/api/v1/auth/client/register').send({ token: invitationBody.invitation.token, password: 'ClientPassword!123', displayName: 'Replay Client' });
    expect(replay.status).toBe(410);

    const clientList = await request(app).get('/api/v1/coach/clients').set('authorization', `Bearer ${approvedCoachToken}`);
    const listBody = clientList.body as { relationships: Array<{ id: string; status: string }> };
    expect(listBody.relationships).toHaveLength(1);
    const clientApproval = await request(app).post(`/api/v1/coach/clients/${listBody.relationships[0]?.id}/approve`).set('authorization', `Bearer ${approvedCoachToken}`).send({});
    expect(clientApproval.status).toBe(200);

    const clientLogin = await request(app).post('/api/v1/auth/login').send({ email: 'client@example.test', password: 'ClientPassword!123' });
    const clientToken = (clientLogin.body as { accessToken: string }).accessToken;
    const clientWorkspace = await request(app).get('/api/v1/client/workspace').set('authorization', `Bearer ${clientToken}`);
    const workspaceBody = clientWorkspace.body as { coach: PublicUser };
    expect(clientWorkspace.status).toBe(200); expect(workspaceBody.coach).toMatchObject({ id: registeredBody.user.id, role: 'COACH' });

    const secondInvitation = await request(app).post('/api/v1/coach/invitations').set('authorization', `Bearer ${approvedCoachToken}`).send({ email: 'second-client@example.test' });
    const secondInvitationBody = secondInvitation.body as { invitation: { invitationId: string; token: string } };
    const invitations = await request(app).get('/api/v1/coach/invitations').set('authorization', `Bearer ${approvedCoachToken}`);
    const invitationsBody = invitations.body as { invitations: Array<{ id: string }> };
    expect(invitationsBody.invitations).toHaveLength(2);
    const revoke = await request(app).delete(`/api/v1/coach/invitations/${secondInvitationBody.invitation.invitationId}`).set('authorization', `Bearer ${approvedCoachToken}`);
    const revokeBody = revoke.body as { invitation: { status: string } };
    expect(revokeBody.invitation.status).toBe('REVOKED');
    expect((await request(app).post('/api/v1/auth/client/register').send({ token: secondInvitationBody.invitation.token, password: 'AnotherPassword!123', displayName: 'Blocked Client' })).status).toBe(410);

    const overview = await request(app).get('/api/v1/admin/overview').set('authorization', `Bearer ${adminLoginBody.accessToken}`);
    const overviewBody = overview.body as { overview: { totalCoaches: number; approvedCoaches: number; totalClients: number } };
    expect(overviewBody.overview).toMatchObject({ totalCoaches: 1, approvedCoaches: 1, totalClients: 1 });
    const audit = await request(app).get('/api/v1/admin/audit-events').set('authorization', `Bearer ${adminLoginBody.accessToken}`);
    const auditBody = audit.body as { events: unknown[] };
    expect(auditBody.events.length).toBeGreaterThanOrEqual(2);

    const profile = await request(app).patch('/api/v1/auth/me').set('authorization', `Bearer ${approvedCoachToken}`).send({ displayName: 'Updated Coach', businessName: 'Updated Coaching' });
    const profileBody = profile.body as { user: PublicUser };
    expect(profileBody.user).toMatchObject({ displayName: 'Updated Coach', businessName: 'Updated Coaching' });

    const resetIssue = await request(app).post(`/api/v1/admin/users/${registeredBody.user.id}/password-reset`).set('authorization', `Bearer ${adminLoginBody.accessToken}`).send({});
    const resetToken = (resetIssue.body as { reset: { token: string } }).reset.token;
    expect(resetToken).toBeTruthy();
    const resetUse = await request(app).post('/api/v1/auth/password-reset').send({ token: resetToken, newPassword: 'NewCoachPassword!123' });
    expect(resetUse.status).toBe(204);
    expect((await request(app).post('/api/v1/auth/login').send({ email: 'coach@example.test', password: 'CoachPassword!123' })).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ email: 'coach@example.test', password: 'NewCoachPassword!123' })).status).toBe(200);
  });
});

describe('refresh session security', () => {
  it('restores a session from its persistent cookie without an access token', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email: environment.DEMO_ADMIN_EMAIL, password: environment.DEMO_ADMIN_PASSWORD });
    const cookie = String(login.headers['set-cookie']?.[0]);
    expect(cookie).toContain('Max-Age=2592000');
    expect(cookie).toContain('HttpOnly');
    const reopened = await request(app).post('/api/v1/auth/refresh').set('cookie', cookie);
    expect(reopened.status).toBe(200);
    const token = (reopened.body as { accessToken: string }).accessToken;
    expect((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(200);
  });
  it('does not clear a valid cookie when refresh encounters a temporary server failure', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email: environment.DEMO_ADMIN_EMAIL, password: environment.DEMO_ADMIN_PASSWORD });
    const cookie = String(login.headers['set-cookie']?.[0]);
    const rotate = vi.spyOn(DemoIdentityStore.prototype, 'rotateRefreshSession').mockImplementationOnce(() => { throw new Error('Temporarily unavailable'); });
    try {
      const failed = await request(app).post('/api/v1/auth/refresh').set('cookie', cookie);
      expect(failed.status).toBe(500);
      expect(failed.headers['set-cookie']).toBeUndefined();
    } finally { rotate.mockRestore(); }
    expect((await request(app).post('/api/v1/auth/refresh').set('cookie', cookie)).status).toBe(200);
  });
  it('rotates refresh tokens and revokes the family when an old token is replayed', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email: environment.DEMO_ADMIN_EMAIL, password: environment.DEMO_ADMIN_PASSWORD });
    const firstCookie = login.headers['set-cookie']?.[0]; expect(firstCookie).toBeTruthy();
    const firstRefresh = await request(app).post('/api/v1/auth/refresh').set('cookie', firstCookie ?? '');
    const secondCookie = firstRefresh.headers['set-cookie']?.[0]; expect(firstRefresh.status).toBe(200); expect(secondCookie).toBeTruthy();
    expect((await request(app).post('/api/v1/auth/refresh').set('cookie', firstCookie ?? '')).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/refresh').set('cookie', secondCookie ?? '')).status).toBe(401);
  });
});
