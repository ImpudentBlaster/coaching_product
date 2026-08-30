import argon2 from 'argon2';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
export class DemoIdentityStore {
    users = new Map();
    userIdByEmail = new Map();
    auditEvents = [];
    invitations = new Map();
    relationships = new Map();
    sessions = new Map();
    passwordResets = new Map();
    static async create(adminEmail, adminPassword) {
        const store = new DemoIdentityStore();
        await store.insertUser({
            email: adminEmail,
            password: adminPassword,
            displayName: 'Platform Admin',
            businessName: null,
            role: 'PLATFORM_ADMIN',
            approvalStatus: 'APPROVED',
        });
        return store;
    }
    async registerCoach(input) {
        return this.insertUser({ ...input, role: 'COACH', approvalStatus: 'PENDING_REVIEW' });
    }
    createClientInvitation(coachId, email) {
        const coach = this.requireApprovedCoach(coachId);
        void coach;
        const token = randomBytes(32).toString('base64url');
        const invitation = {
            id: randomUUID(), coachId, email: normalizeEmail(email), tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), usedAt: null, revokedAt: null, createdAt: new Date().toISOString(),
        };
        this.invitations.set(invitation.id, invitation);
        return { invitationId: invitation.id, token, expiresAt: invitation.expiresAt };
    }
    async registerClient(input) {
        const tokenHash = hashToken(input.token);
        const invitation = [...this.invitations.values()].find((candidate) => safeHashEqual(candidate.tokenHash, tokenHash));
        if (!invitation || invitation.usedAt || invitation.revokedAt || new Date(invitation.expiresAt).getTime() <= Date.now())
            throw new Error('INVALID_INVITATION');
        const user = await this.insertUser({ email: invitation.email, password: input.password, displayName: input.displayName, businessName: null, role: 'CLIENT', approvalStatus: 'PENDING_REVIEW' });
        invitation.usedAt = new Date().toISOString();
        const relationship = { id: randomUUID(), coachId: invitation.coachId, clientId: user.id, status: 'PENDING_REVIEW', rejectionReason: null, createdAt: new Date().toISOString() };
        this.relationships.set(relationship.id, relationship);
        return { user, relationship };
    }
    listCoachClients(coachId) {
        this.requireApprovedCoach(coachId);
        return [...this.relationships.values()].filter((relationship) => relationship.coachId === coachId).map((relationship) => {
            const client = this.users.get(relationship.clientId);
            if (!client)
                throw new Error('CLIENT_NOT_FOUND');
            return { ...relationship, client: toPublicUser(client) };
        });
    }
    transitionClient(input) {
        this.requireApprovedCoach(input.coachId);
        const relationship = this.relationships.get(input.relationshipId);
        if (!relationship || relationship.coachId !== input.coachId)
            throw new Error('CLIENT_NOT_FOUND');
        if (relationship.status !== 'PENDING_REVIEW')
            throw new Error('INVALID_TRANSITION');
        if (input.target === 'REJECTED' && !input.reason)
            throw new Error('REASON_REQUIRED');
        const previousStatus = relationship.status;
        relationship.status = input.target;
        relationship.rejectionReason = input.reason;
        const client = this.users.get(relationship.clientId);
        if (!client)
            throw new Error('CLIENT_NOT_FOUND');
        client.approvalStatus = input.target;
        this.auditEvents.push({ id: randomUUID(), actorId: input.actorId, action: `CLIENT_${input.target}`, subjectId: client.id, previousStatus, newStatus: input.target, reason: input.reason, createdAt: new Date().toISOString() });
        return { ...relationship, client: toPublicUser(client) };
    }
    findByEmail(email) {
        const id = this.userIdByEmail.get(normalizeEmail(email));
        return id ? this.users.get(id) : undefined;
    }
    findById(id) {
        return this.users.get(id);
    }
    listCoaches(status) {
        return [...this.users.values()]
            .filter((user) => user.role === 'COACH' && (!status || user.approvalStatus === status))
            .map(toPublicUser)
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    }
    getAdminOverview() {
        const users = [...this.users.values()];
        const coaches = users.filter((user) => user.role === 'COACH');
        const clients = users.filter((user) => user.role === 'CLIENT');
        return { totalCoaches: coaches.length, pendingCoaches: coaches.filter((user) => user.approvalStatus === 'PENDING_REVIEW').length, approvedCoaches: coaches.filter((user) => user.approvalStatus === 'APPROVED').length, suspendedCoaches: coaches.filter((user) => user.approvalStatus === 'SUSPENDED').length, totalClients: clients.length, pendingClients: clients.filter((user) => user.approvalStatus === 'PENDING_REVIEW').length };
    }
    listAuditEvents() {
        return [...this.auditEvents].reverse().map((event) => ({ id: event.id, action: event.action, entityType: 'USER', entityId: event.subjectId, actorEmail: this.users.get(event.actorId)?.email ?? null, subjectEmail: this.users.get(event.subjectId)?.email ?? null, metadata: { previousStatus: event.previousStatus, newStatus: event.newStatus, reason: event.reason }, createdAt: event.createdAt }));
    }
    listInvitations(coachId) {
        this.requireApprovedCoach(coachId);
        return [...this.invitations.values()].filter((invitation) => invitation.coachId === coachId).sort((left, right) => right.createdAt.localeCompare(left.createdAt)).map(toInvitationView);
    }
    revokeInvitation(coachId, invitationId) {
        this.requireApprovedCoach(coachId);
        const invitation = this.invitations.get(invitationId);
        if (!invitation || invitation.coachId !== coachId)
            throw new Error('INVITATION_NOT_FOUND');
        if (invitation.usedAt || invitation.revokedAt || new Date(invitation.expiresAt).getTime() <= Date.now())
            throw new Error('INVALID_INVITATION_TRANSITION');
        invitation.revokedAt = new Date().toISOString();
        return toInvitationView(invitation);
    }
    getClientWorkspace(clientId) {
        const relationship = [...this.relationships.values()].find((candidate) => candidate.clientId === clientId) ?? null;
        const coach = relationship ? this.users.get(relationship.coachId) : undefined;
        return { relationship: relationship ? { ...relationship } : null, coach: coach ? toPublicUser(coach) : null };
    }
    updateProfile(userId, displayName, businessName) {
        const user = this.users.get(userId);
        if (!user)
            throw new Error('USER_NOT_FOUND');
        user.displayName = displayName.trim();
        if (user.role === 'COACH' && businessName)
            user.businessName = businessName.trim();
        return toPublicUser(user);
    }
    transitionCoach(input) {
        const coach = this.users.get(input.coachId);
        if (!coach || coach.role !== 'COACH')
            throw new Error('COACH_NOT_FOUND');
        const allowed = {
            PENDING_REVIEW: ['APPROVED', 'REJECTED'],
            APPROVED: ['SUSPENDED'],
            REJECTED: ['PENDING_REVIEW'],
            SUSPENDED: ['APPROVED'],
        };
        if (!allowed[coach.approvalStatus].includes(input.target))
            throw new Error('INVALID_TRANSITION');
        if (input.target === 'REJECTED' && !input.reason)
            throw new Error('REASON_REQUIRED');
        const previousStatus = coach.approvalStatus;
        coach.approvalStatus = input.target;
        this.auditEvents.push({
            id: randomUUID(), actorId: input.actorId, action: `COACH_${input.target}`,
            subjectId: coach.id, previousStatus, newStatus: input.target, reason: input.reason,
            createdAt: new Date().toISOString(),
        });
        return toPublicUser(coach);
    }
    getAuditEvents() {
        return [...this.auditEvents];
    }
    createRefreshSession(userId) {
        const token = randomBytes(48).toString('base64url');
        const session = { id: randomUUID(), userId, familyId: randomUUID(), tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), rotatedAt: null, revokedAt: null };
        this.sessions.set(session.id, session);
        return { token, session };
    }
    rotateRefreshSession(token) {
        const hash = hashToken(token);
        const current = [...this.sessions.values()].find((session) => safeHashEqual(session.tokenHash, hash));
        if (!current || new Date(current.expiresAt).getTime() <= Date.now())
            throw new Error('INVALID_REFRESH');
        if (current.rotatedAt || current.revokedAt) {
            this.revokeSessionFamily(current.familyId);
            throw new Error('REFRESH_REUSE');
        }
        current.rotatedAt = new Date().toISOString();
        const nextToken = randomBytes(48).toString('base64url');
        const next = { id: randomUUID(), userId: current.userId, familyId: current.familyId, tokenHash: hashToken(nextToken), expiresAt: current.expiresAt, rotatedAt: null, revokedAt: null };
        this.sessions.set(next.id, next);
        const user = this.users.get(current.userId);
        if (!user)
            throw new Error('INVALID_REFRESH');
        return { token: nextToken, user };
    }
    revokeRefreshToken(token) { const hash = hashToken(token); const session = [...this.sessions.values()].find((candidate) => safeHashEqual(candidate.tokenHash, hash)); if (session)
        session.revokedAt = new Date().toISOString(); }
    revokeAllSessions(userId) { for (const session of this.sessions.values())
        if (session.userId === userId)
            session.revokedAt = new Date().toISOString(); }
    createPasswordReset(actorId, userId) {
        const user = this.users.get(userId);
        if (!user)
            throw new Error('USER_NOT_FOUND');
        const token = randomBytes(32).toString('base64url');
        const record = { id: randomUUID(), userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), usedAt: null };
        this.passwordResets.set(record.id, record);
        this.auditEvents.push({ id: randomUUID(), actorId, action: 'PASSWORD_RESET_ISSUED', subjectId: userId, previousStatus: user.approvalStatus, newStatus: user.approvalStatus, reason: null, createdAt: new Date().toISOString() });
        return { token, expiresAt: record.expiresAt };
    }
    async usePasswordReset(token, newPassword) {
        const hash = hashToken(token);
        const record = [...this.passwordResets.values()].find((candidate) => safeHashEqual(candidate.tokenHash, hash));
        if (!record || record.usedAt || new Date(record.expiresAt).getTime() <= Date.now())
            throw new Error('INVALID_RESET');
        const user = this.users.get(record.userId);
        if (!user)
            throw new Error('INVALID_RESET');
        user.passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
        record.usedAt = new Date().toISOString();
        this.revokeAllSessions(user.id);
        this.auditEvents.push({ id: randomUUID(), actorId: user.id, action: 'PASSWORD_RESET_USED', subjectId: user.id, previousStatus: user.approvalStatus, newStatus: user.approvalStatus, reason: null, createdAt: new Date().toISOString() });
    }
    requireApprovedCoach(coachId) {
        const coach = this.users.get(coachId);
        if (!coach || coach.role !== 'COACH' || coach.approvalStatus !== 'APPROVED')
            throw new Error('COACH_NOT_APPROVED');
        return coach;
    }
    revokeSessionFamily(familyId) { for (const session of this.sessions.values())
        if (session.familyId === familyId)
            session.revokedAt = new Date().toISOString(); }
    async insertUser(input) {
        const email = normalizeEmail(input.email);
        if (this.userIdByEmail.has(email))
            throw new Error('EMAIL_EXISTS');
        const id = randomUUID();
        const user = {
            id, email, role: input.role, displayName: input.displayName.trim(), businessName: input.businessName?.trim() || null,
            approvalStatus: input.approvalStatus,
            passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }),
            createdAt: new Date().toISOString(),
        };
        this.users.set(id, user);
        this.userIdByEmail.set(email, id);
        return toPublicUser(user);
    }
}
export function toPublicUser(user) {
    const { passwordHash: _passwordHash, ...publicUser } = user;
    void _passwordHash;
    return publicUser;
}
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function hashToken(token) { return createHash('sha256').update(token).digest('hex'); }
function safeHashEqual(left, right) { const leftBuffer = Buffer.from(left); const rightBuffer = Buffer.from(right); return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer); }
function toInvitationView(invitation) { const { tokenHash: _tokenHash, ...view } = invitation; void _tokenHash; const status = invitation.revokedAt ? 'REVOKED' : invitation.usedAt ? 'ACCEPTED' : new Date(invitation.expiresAt).getTime() <= Date.now() ? 'EXPIRED' : 'PENDING'; return { ...view, status }; }
//# sourceMappingURL=demo-store.js.map