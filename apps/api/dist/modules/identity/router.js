import argon2 from 'argon2';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { authenticate, issueAccessToken, requireRole } from './auth.js';
import { toPublicUser } from './demo-store.js';
const coachRegistrationSchema = z.object({
    email: z.string().email(), password: z.string().min(12).max(128),
    displayName: z.string().trim().min(2).max(100), businessName: z.string().trim().min(2).max(120),
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(128) });
const reasonSchema = z.object({ reason: z.string().trim().min(3).max(500) });
const invitationSchema = z.object({ email: z.string().email() });
const clientRegistrationSchema = z.object({ token: z.string().min(20), password: z.string().min(12).max(128), displayName: z.string().trim().min(2).max(100) });
const passwordResetSchema = z.object({ token: z.string().min(20), newPassword: z.string().min(12).max(128) });
const profileSchema = z.object({ displayName: z.string().trim().min(2).max(100), businessName: z.string().trim().min(2).max(120).optional() });
export function createIdentityRouter(environment, store) {
    const router = Router();
    const jwtAuth = authenticate(environment);
    const auth = (request, response, next) => {
        jwtAuth(request, response, () => {
            void (async () => {
                const user = request.auth ? await store.findById(request.auth.userId) : undefined;
                if (!user) {
                    response.status(401).json({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
                    return;
                }
                request.auth = { userId: user.id, role: user.role, approvalStatus: user.approvalStatus };
                next();
            })().catch(next);
        });
    };
    const authLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
    router.post('/auth/coach/register', authLimiter, async (request, response) => {
        const parsed = coachRegistrationSchema.safeParse(request.body);
        if (!parsed.success)
            return response.status(400).json({ code: 'VALIDATION_ERROR', message: 'Check the submitted fields', details: parsed.error.flatten().fieldErrors });
        try {
            const user = await store.registerCoach(parsed.data);
            return response.status(201).json({ user });
        }
        catch (error) {
            if (error instanceof Error && error.message === 'EMAIL_EXISTS')
                return response.status(409).json({ code: 'EMAIL_EXISTS', message: 'An account already exists for this email' });
            throw error;
        }
    });
    router.post('/auth/login', authLimiter, async (request, response) => {
        const parsed = loginSchema.safeParse(request.body);
        if (!parsed.success)
            return response.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
        const user = await store.findByEmail(parsed.data.email);
        if (!user || !(await argon2.verify(user.passwordHash, parsed.data.password)))
            return response.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
        const refresh = await store.createRefreshSession(user.id);
        setRefreshCookie(response, refresh.token, environment);
        return response.json({ accessToken: issueAccessToken(environment, user), user: toPublicUser(user) });
    });
    router.post('/auth/refresh', async (request, response) => {
        const token = getRefreshCookie(request);
        if (!token)
            return response.status(401).json({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
        try {
            const rotated = await store.rotateRefreshSession(token);
            setRefreshCookie(response, rotated.token, environment);
            return response.json({ accessToken: issueAccessToken(environment, rotated.user), user: toPublicUser(rotated.user) });
        }
        catch {
            clearRefreshCookie(response, environment);
            return response.status(401).json({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
        }
    });
    router.post('/auth/logout', async (request, response) => { const token = getRefreshCookie(request); if (token)
        await store.revokeRefreshToken(token); clearRefreshCookie(response, environment); return response.status(204).send(); });
    router.post('/auth/logout-all', auth, async (request, response) => { if (request.auth)
        await store.revokeAllSessions(request.auth.userId); clearRefreshCookie(response, environment); return response.status(204).send(); });
    router.post('/auth/password-reset', authLimiter, async (request, response) => {
        const parsed = passwordResetSchema.safeParse(request.body);
        if (!parsed.success)
            return response.status(400).json({ code: 'VALIDATION_ERROR', message: 'Check the submitted fields' });
        try {
            await store.usePasswordReset(parsed.data.token, parsed.data.newPassword);
            clearRefreshCookie(response, environment);
            return response.status(204).send();
        }
        catch {
            return response.status(410).json({ code: 'INVALID_RESET', message: 'This reset code is invalid, expired, or already used' });
        }
    });
    router.post('/auth/client/register', authLimiter, async (request, response) => {
        const parsed = clientRegistrationSchema.safeParse(request.body);
        if (!parsed.success)
            return response.status(400).json({ code: 'VALIDATION_ERROR', message: 'Check the submitted fields', details: parsed.error.flatten().fieldErrors });
        try {
            const result = await store.registerClient(parsed.data);
            return response.status(201).json(result);
        }
        catch (error) {
            if (error instanceof Error && error.message === 'INVALID_INVITATION')
                return response.status(410).json({ code: 'INVALID_INVITATION', message: 'This invitation is invalid, expired, or already used' });
            if (error instanceof Error && error.message === 'EMAIL_EXISTS')
                return response.status(409).json({ code: 'EMAIL_EXISTS', message: 'An account already exists for this email' });
            throw error;
        }
    });
    router.get('/auth/me', auth, async (request, response) => {
        const user = request.auth ? await store.findById(request.auth.userId) : undefined;
        if (!user)
            return response.status(401).json({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
        return response.json({ user: toPublicUser(user) });
    });
    router.patch('/auth/me', auth, async (request, response) => {
        const parsed = profileSchema.safeParse(request.body);
        if (!parsed.success)
            return response.status(400).json({ code: 'VALIDATION_ERROR', message: 'Check the submitted fields', details: parsed.error.flatten().fieldErrors });
        const user = await store.updateProfile(request.auth?.userId ?? '', parsed.data.displayName, parsed.data.businessName);
        return response.json({ user });
    });
    router.get('/admin/overview', auth, requireRole('PLATFORM_ADMIN'), async (_request, response) => response.json({ overview: await store.getAdminOverview() }));
    router.get('/admin/audit-events', auth, requireRole('PLATFORM_ADMIN'), async (_request, response) => response.json({ events: await store.listAuditEvents() }));
    router.get('/admin/coaches', auth, requireRole('PLATFORM_ADMIN'), async (request, response) => {
        const rawStatus = typeof request.query.status === 'string' ? request.query.status : undefined;
        const status = rawStatus && ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED'].includes(rawStatus) ? rawStatus : undefined;
        return response.json({ coaches: await store.listCoaches(status) });
    });
    router.post('/admin/coaches/:coachId/approve', auth, requireRole('PLATFORM_ADMIN'), (request, response) => transition(request, response, store, 'APPROVED', null));
    router.post('/admin/coaches/:coachId/reject', auth, requireRole('PLATFORM_ADMIN'), (request, response) => {
        const parsed = reasonSchema.safeParse(request.body);
        if (!parsed.success)
            return response.status(400).json({ code: 'VALIDATION_ERROR', message: 'A rejection reason is required' });
        return transition(request, response, store, 'REJECTED', parsed.data.reason);
    });
    router.post('/admin/coaches/:coachId/suspend', auth, requireRole('PLATFORM_ADMIN'), (request, response) => {
        const parsed = reasonSchema.safeParse(request.body);
        if (!parsed.success)
            return response.status(400).json({ code: 'VALIDATION_ERROR', message: 'A suspension reason is required' });
        return transition(request, response, store, 'SUSPENDED', parsed.data.reason);
    });
    router.post('/admin/coaches/:coachId/reopen', auth, requireRole('PLATFORM_ADMIN'), (request, response) => transition(request, response, store, 'PENDING_REVIEW', null));
    router.post('/admin/users/:userId/password-reset', auth, requireRole('PLATFORM_ADMIN'), async (request, response) => {
        const rawId = request.params.userId;
        const userId = typeof rawId === 'string' ? rawId : '';
        try {
            return response.status(201).json({ reset: await store.createPasswordReset(request.auth?.userId ?? '', userId) });
        }
        catch {
            return response.status(404).json({ code: 'NOT_FOUND', message: 'User not found' });
        }
    });
    router.post('/coach/invitations', auth, requireRole('COACH'), async (request, response) => {
        const parsed = invitationSchema.safeParse(request.body);
        if (!parsed.success)
            return response.status(400).json({ code: 'VALIDATION_ERROR', message: 'Enter a valid client email' });
        try {
            const invitation = await store.createClientInvitation(request.auth?.userId ?? '', parsed.data.email);
            return response.status(201).json({ invitation });
        }
        catch (error) {
            if (error instanceof Error && error.message === 'COACH_NOT_APPROVED')
                return response.status(403).json({ code: 'COACH_NOT_APPROVED', message: 'Coach approval is required' });
            throw error;
        }
    });
    router.get('/coach/invitations', auth, requireRole('COACH'), async (request, response) => response.json({ invitations: await store.listInvitations(request.auth?.userId ?? '') }));
    router.delete('/coach/invitations/:invitationId', auth, requireRole('COACH'), async (request, response) => {
        try {
            const rawId = request.params.invitationId;
            const invitationId = typeof rawId === 'string' ? rawId : '';
            return response.json({ invitation: await store.revokeInvitation(request.auth?.userId ?? '', invitationId) });
        }
        catch (error) {
            if (error instanceof Error && ['INVITATION_NOT_FOUND', 'INVALID_INVITATION_TRANSITION'].includes(error.message))
                return response.status(409).json({ code: 'INVALID_INVITATION_TRANSITION', message: 'This invitation cannot be revoked' });
            throw error;
        }
    });
    router.get('/coach/clients', auth, requireRole('COACH'), async (request, response) => {
        try {
            return response.json({ relationships: await store.listCoachClients(request.auth?.userId ?? '') });
        }
        catch (error) {
            if (error instanceof Error && error.message === 'COACH_NOT_APPROVED')
                return response.status(403).json({ code: 'COACH_NOT_APPROVED', message: 'Coach approval is required' });
            throw error;
        }
    });
    router.post('/coach/clients/:relationshipId/approve', auth, requireRole('COACH'), (request, response) => transitionClient(request, response, store, 'APPROVED', null));
    router.post('/coach/clients/:relationshipId/reject', auth, requireRole('COACH'), (request, response) => {
        const parsed = reasonSchema.safeParse(request.body);
        if (!parsed.success)
            return response.status(400).json({ code: 'VALIDATION_ERROR', message: 'A rejection reason is required' });
        return transitionClient(request, response, store, 'REJECTED', parsed.data.reason);
    });
    router.get('/client/workspace', auth, requireRole('CLIENT'), async (request, response) => response.json(await store.getClientWorkspace(request.auth?.userId ?? '')));
    return router;
}
function getRefreshCookie(request) {
    const cookies = request.cookies;
    const value = cookies?.refresh_token;
    return typeof value === 'string' ? value : undefined;
}
function setRefreshCookie(response, token, environment) { response.cookie('refresh_token', token, { httpOnly: true, secure: environment.NODE_ENV === 'production', sameSite: 'lax', path: '/api/v1/auth', maxAge: 30 * 24 * 60 * 60 * 1000 }); }
function clearRefreshCookie(response, environment) { response.clearCookie('refresh_token', { httpOnly: true, secure: environment.NODE_ENV === 'production', sameSite: 'lax', path: '/api/v1/auth' }); }
async function transitionClient(request, response, store, target, reason) {
    try {
        const rawId = request.params.relationshipId;
        const relationshipId = typeof rawId === 'string' ? rawId : '';
        return response.json({ relationship: await store.transitionClient({ relationshipId, coachId: request.auth?.userId ?? '', actorId: request.auth?.userId ?? '', target, reason }) });
    }
    catch (error) {
        if (error instanceof Error && error.message === 'CLIENT_NOT_FOUND')
            return response.status(404).json({ code: 'NOT_FOUND', message: 'Client not found' });
        if (error instanceof Error && error.message === 'INVALID_TRANSITION')
            return response.status(409).json({ code: 'INVALID_TRANSITION', message: 'This approval action is not allowed' });
        if (error instanceof Error && error.message === 'COACH_NOT_APPROVED')
            return response.status(403).json({ code: 'COACH_NOT_APPROVED', message: 'Coach approval is required' });
        throw error;
    }
}
async function transition(request, response, store, target, reason) {
    try {
        const rawCoachId = request.params.coachId;
        const coachId = typeof rawCoachId === 'string' ? rawCoachId : '';
        const coach = await store.transitionCoach({ coachId, actorId: request.auth?.userId ?? '', target, reason });
        return response.json({ coach });
    }
    catch (error) {
        if (error instanceof Error && error.message === 'COACH_NOT_FOUND')
            return response.status(404).json({ code: 'NOT_FOUND', message: 'Coach not found' });
        if (error instanceof Error && error.message === 'INVALID_TRANSITION')
            return response.status(409).json({ code: 'INVALID_TRANSITION', message: 'This approval action is not allowed' });
        throw error;
    }
}
//# sourceMappingURL=router.js.map