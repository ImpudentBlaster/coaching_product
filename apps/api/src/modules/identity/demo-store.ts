import argon2 from 'argon2';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { AdminOverview, ApprovalStatus, AuditEvent, AuditEventView, ClientInvitation, ClientRelationshipView, ClientWorkspace, CoachClient, InvitationView, PasswordResetRecord, PublicUser, RefreshSession, StoredUser } from './types.js';

export class DemoIdentityStore {
  private readonly users = new Map<string, StoredUser>();
  private readonly userIdByEmail = new Map<string, string>();
  private readonly auditEvents: AuditEvent[] = [];
  private readonly invitations = new Map<string, ClientInvitation>();
  private readonly relationships = new Map<string, CoachClient>();
  private readonly sessions = new Map<string, RefreshSession>();
  private readonly passwordResets = new Map<string, PasswordResetRecord>();

  static async create(adminEmail: string, adminPassword: string): Promise<DemoIdentityStore> {
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

  async registerCoach(input: { email: string; password: string; displayName: string; businessName: string }): Promise<PublicUser> {
    return this.insertUser({ ...input, role: 'COACH', approvalStatus: 'PENDING_REVIEW' });
  }

  createClientInvitation(coachId: string, email: string): { invitationId: string; token: string; expiresAt: string } {
    const coach = this.requireApprovedCoach(coachId);
    void coach;
    const token = randomBytes(32).toString('base64url');
    const invitation: ClientInvitation = {
      id: randomUUID(), coachId, email: normalizeEmail(email), tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), usedAt: null, revokedAt: null, createdAt: new Date().toISOString(),
    };
    this.invitations.set(invitation.id, invitation);
    return { invitationId: invitation.id, token, expiresAt: invitation.expiresAt };
  }

  previewClientInvitation(token:string){
    const tokenHash=hashToken(token);
    const invitation=[...this.invitations.values()].find(candidate=>safeHashEqual(candidate.tokenHash,tokenHash));
    if(!invitation||invitation.revokedAt)throw new Error('INVALID_INVITATION');
    if(invitation.usedAt)throw new Error('INVITATION_USED');
    if(new Date(invitation.expiresAt).getTime()<=Date.now())throw new Error('INVALID_INVITATION');
    this.requireApprovedCoach(invitation.coachId);
    return {email:invitation.email,displayName:''};
  }
  async registerClient(input: { token: string; password: string; displayName: string }): Promise<{ user: PublicUser; relationship: CoachClient }> {
    const tokenHash = hashToken(input.token);
    const invitation = [...this.invitations.values()].find((candidate) => safeHashEqual(candidate.tokenHash, tokenHash));
    if (!invitation || invitation.usedAt || invitation.revokedAt || new Date(invitation.expiresAt).getTime() <= Date.now()) throw new Error('INVALID_INVITATION');
    const user = await this.insertUser({ email: invitation.email, password: input.password, displayName: input.displayName, businessName: null, role: 'CLIENT', approvalStatus: 'PENDING_REVIEW' });
    invitation.usedAt = new Date().toISOString();
    const relationship: CoachClient = { id: randomUUID(), coachId: invitation.coachId, clientId: user.id, status: 'PENDING_REVIEW', rejectionReason: null, createdAt: new Date().toISOString() };
    this.relationships.set(relationship.id, relationship);
    return { user, relationship };
  }

  listCoachClients(coachId: string): ClientRelationshipView[] {
    this.requireApprovedCoach(coachId);
    return [...this.relationships.values()].filter((relationship) => relationship.coachId === coachId).map((relationship) => {
      const client = this.users.get(relationship.clientId);
      if (!client) throw new Error('CLIENT_NOT_FOUND');
      return { ...relationship, client: toPublicUser(client) };
    });
  }

  transitionClient(input: { relationshipId: string; coachId: string; actorId: string; target: 'APPROVED' | 'REJECTED'; reason: string | null }): ClientRelationshipView {
    this.requireApprovedCoach(input.coachId);
    const relationship = this.relationships.get(input.relationshipId);
    if (!relationship || relationship.coachId !== input.coachId) throw new Error('CLIENT_NOT_FOUND');
    if (relationship.status !== 'PENDING_REVIEW') throw new Error('INVALID_TRANSITION');
    if (input.target === 'REJECTED' && !input.reason) throw new Error('REASON_REQUIRED');
    const previousStatus = relationship.status;
    relationship.status = input.target; relationship.rejectionReason = input.reason;
    const client = this.users.get(relationship.clientId);
    if (!client) throw new Error('CLIENT_NOT_FOUND');
    client.approvalStatus = input.target;
    this.auditEvents.push({ id: randomUUID(), actorId: input.actorId, action: `CLIENT_${input.target}`, subjectId: client.id, previousStatus, newStatus: input.target, reason: input.reason, createdAt: new Date().toISOString() });
    return { ...relationship, client: toPublicUser(client) };
  }

  findByEmail(email: string): StoredUser | undefined {
    const id = this.userIdByEmail.get(normalizeEmail(email));
    return id ? this.users.get(id) : undefined;
  }

  findById(id: string): StoredUser | undefined {
    return this.users.get(id);
  }

  listCoaches(status?: ApprovalStatus): PublicUser[] {
    return [...this.users.values()]
      .filter((user) => user.role === 'COACH' && (!status || user.approvalStatus === status))
      .map(toPublicUser)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  getAdminOverview(): AdminOverview {
    const users = [...this.users.values()]; const coaches = users.filter((user) => user.role === 'COACH'); const clients = users.filter((user) => user.role === 'CLIENT');
    return { totalCoaches: coaches.length, pendingCoaches: coaches.filter((user) => user.approvalStatus === 'PENDING_REVIEW').length, approvedCoaches: coaches.filter((user) => user.approvalStatus === 'APPROVED').length, suspendedCoaches: coaches.filter((user) => user.approvalStatus === 'SUSPENDED').length, totalClients: clients.length, pendingClients: clients.filter((user) => user.approvalStatus === 'PENDING_REVIEW').length };
  }

  listAuditEvents(): AuditEventView[] {
    return [...this.auditEvents].reverse().map((event) => ({ id: event.id, action: event.action, entityType: 'USER', entityId: event.subjectId, actorEmail: this.users.get(event.actorId)?.email ?? null, subjectEmail: this.users.get(event.subjectId)?.email ?? null, metadata: { previousStatus: event.previousStatus, newStatus: event.newStatus, reason: event.reason }, createdAt: event.createdAt }));
  }

  listInvitations(coachId: string): InvitationView[] {
    this.requireApprovedCoach(coachId);
    return [...this.invitations.values()].filter((invitation) => invitation.coachId === coachId).sort((left, right) => right.createdAt.localeCompare(left.createdAt)).map(toInvitationView);
  }

  revokeInvitation(coachId: string, invitationId: string): InvitationView {
    this.requireApprovedCoach(coachId); const invitation = this.invitations.get(invitationId);
    if (!invitation || invitation.coachId !== coachId) throw new Error('INVITATION_NOT_FOUND');
    if (invitation.usedAt || invitation.revokedAt || new Date(invitation.expiresAt).getTime() <= Date.now()) throw new Error('INVALID_INVITATION_TRANSITION');
    invitation.revokedAt = new Date().toISOString(); return toInvitationView(invitation);
  }

  getClientWorkspace(clientId: string): ClientWorkspace {
    const relationship = [...this.relationships.values()].find((candidate) => candidate.clientId === clientId) ?? null;
    const coach = relationship ? this.users.get(relationship.coachId) : undefined;
    return { relationship: relationship ? { ...relationship } : null, coach: coach ? toPublicUser(coach) : null };
  }

  updateProfile(userId: string, displayName: string, businessName?: string): PublicUser {
    const user = this.users.get(userId); if (!user) throw new Error('USER_NOT_FOUND');
    user.displayName = displayName.trim(); if (user.role === 'COACH' && businessName) user.businessName = businessName.trim(); return toPublicUser(user);
  }

  transitionCoach(input: { coachId: string; actorId: string; target: ApprovalStatus; reason: string | null }): PublicUser {
    const coach = this.users.get(input.coachId);
    if (!coach || coach.role !== 'COACH') throw new Error('COACH_NOT_FOUND');

    const allowed: Record<ApprovalStatus, ApprovalStatus[]> = {
      PENDING_REVIEW: ['APPROVED', 'REJECTED'],
      APPROVED: ['SUSPENDED'],
      REJECTED: ['PENDING_REVIEW'],
      SUSPENDED: ['APPROVED'],
    };
    if (!allowed[coach.approvalStatus].includes(input.target)) throw new Error('INVALID_TRANSITION');
    if (input.target === 'REJECTED' && !input.reason) throw new Error('REASON_REQUIRED');

    const previousStatus = coach.approvalStatus;
    coach.approvalStatus = input.target;
    this.auditEvents.push({
      id: randomUUID(), actorId: input.actorId, action: `COACH_${input.target}`,
      subjectId: coach.id, previousStatus, newStatus: input.target, reason: input.reason,
      createdAt: new Date().toISOString(),
    });
    return toPublicUser(coach);
  }

  getAuditEvents(): AuditEvent[] {
    return [...this.auditEvents];
  }

  createRefreshSession(userId: string): { token: string; session: RefreshSession } {
    const token = randomBytes(48).toString('base64url');
    const session: RefreshSession = { id: randomUUID(), userId, familyId: randomUUID(), tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), rotatedAt: null, revokedAt: null };
    this.sessions.set(session.id, session); return { token, session };
  }

  rotateRefreshSession(token: string): { token: string; user: StoredUser } {
    const hash = hashToken(token); const current = [...this.sessions.values()].find((session) => safeHashEqual(session.tokenHash, hash));
    if (!current || new Date(current.expiresAt).getTime() <= Date.now()) throw new Error('INVALID_REFRESH');
    if (current.rotatedAt || current.revokedAt) { this.revokeSessionFamily(current.familyId); throw new Error('REFRESH_REUSE'); }
    current.rotatedAt = new Date().toISOString();
    const nextToken = randomBytes(48).toString('base64url');
    const next: RefreshSession = { id: randomUUID(), userId: current.userId, familyId: current.familyId, tokenHash: hashToken(nextToken), expiresAt: current.expiresAt, rotatedAt: null, revokedAt: null };
    this.sessions.set(next.id, next);
    const user = this.users.get(current.userId); if (!user) throw new Error('INVALID_REFRESH');
    return { token: nextToken, user };
  }

  revokeRefreshToken(token: string): void { const hash = hashToken(token); const session = [...this.sessions.values()].find((candidate) => safeHashEqual(candidate.tokenHash, hash)); if (session) session.revokedAt = new Date().toISOString(); }
  revokeAllSessions(userId: string): void { for (const session of this.sessions.values()) if (session.userId === userId) session.revokedAt = new Date().toISOString(); }

  createPasswordReset(actorId: string, userId: string): { token: string; expiresAt: string } {
    const user = this.users.get(userId); if (!user) throw new Error('USER_NOT_FOUND');
    const token = randomBytes(32).toString('base64url'); const record: PasswordResetRecord = { id: randomUUID(), userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), usedAt: null };
    this.passwordResets.set(record.id, record);
    this.auditEvents.push({ id: randomUUID(), actorId, action: 'PASSWORD_RESET_ISSUED', subjectId: userId, previousStatus: user.approvalStatus, newStatus: user.approvalStatus, reason: null, createdAt: new Date().toISOString() });
    return { token, expiresAt: record.expiresAt };
  }

  async usePasswordReset(token: string, newPassword: string): Promise<void> {
    const hash = hashToken(token); const record = [...this.passwordResets.values()].find((candidate) => safeHashEqual(candidate.tokenHash, hash));
    if (!record || record.usedAt || new Date(record.expiresAt).getTime() <= Date.now()) throw new Error('INVALID_RESET');
    const user = this.users.get(record.userId); if (!user) throw new Error('INVALID_RESET');
    user.passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id }); record.usedAt = new Date().toISOString(); this.revokeAllSessions(user.id);
    this.auditEvents.push({ id: randomUUID(), actorId: user.id, action: 'PASSWORD_RESET_USED', subjectId: user.id, previousStatus: user.approvalStatus, newStatus: user.approvalStatus, reason: null, createdAt: new Date().toISOString() });
  }

  private requireApprovedCoach(coachId: string): StoredUser {
    const coach = this.users.get(coachId);
    if (!coach || coach.role !== 'COACH' || coach.approvalStatus !== 'APPROVED') throw new Error('COACH_NOT_APPROVED');
    return coach;
  }

  private revokeSessionFamily(familyId: string): void { for (const session of this.sessions.values()) if (session.familyId === familyId) session.revokedAt = new Date().toISOString(); }

  private async insertUser(input: { email: string; password: string; displayName: string; businessName: string | null; role: StoredUser['role']; approvalStatus: ApprovalStatus }): Promise<PublicUser> {
    const email = normalizeEmail(input.email);
    if (this.userIdByEmail.has(email)) throw new Error('EMAIL_EXISTS');
    const id = randomUUID();
    const user: StoredUser = {
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

export function toPublicUser(user: StoredUser): PublicUser {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  void _passwordHash;
  return publicUser;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
function safeHashEqual(left: string, right: string): boolean { const leftBuffer = Buffer.from(left); const rightBuffer = Buffer.from(right); return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer); }
function toInvitationView(invitation: ClientInvitation): InvitationView { const { tokenHash: _tokenHash, ...view } = invitation; void _tokenHash; const status = invitation.revokedAt ? 'REVOKED' : invitation.usedAt ? 'ACCEPTED' : new Date(invitation.expiresAt).getTime() <= Date.now() ? 'EXPIRED' : 'PENDING'; return { ...view, status }; }
