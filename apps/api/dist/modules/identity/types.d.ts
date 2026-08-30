export type Role = 'PLATFORM_ADMIN' | 'COACH' | 'CLIENT';
export type ApprovalStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export type PublicUser = {
    id: string;
    email: string;
    role: Role;
    displayName: string;
    businessName: string | null;
    approvalStatus: ApprovalStatus;
    createdAt: string;
};
export type StoredUser = PublicUser & {
    passwordHash: string;
};
export type ClientInvitation = {
    id: string;
    coachId: string;
    email: string;
    tokenHash: string;
    expiresAt: string;
    usedAt: string | null;
    revokedAt: string | null;
    createdAt: string;
};
export type InvitationView = Omit<ClientInvitation, 'tokenHash'> & {
    status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
};
export type CoachClient = {
    id: string;
    coachId: string;
    clientId: string;
    status: ApprovalStatus;
    rejectionReason: string | null;
    createdAt: string;
};
export type ClientRelationshipView = CoachClient & {
    client: PublicUser;
};
export type RefreshSession = {
    id: string;
    userId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: string;
    rotatedAt: string | null;
    revokedAt: string | null;
};
export type PasswordResetRecord = {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: string;
    usedAt: string | null;
};
export type AuditEvent = {
    id: string;
    actorId: string;
    action: string;
    subjectId: string;
    previousStatus: ApprovalStatus;
    newStatus: ApprovalStatus;
    reason: string | null;
    createdAt: string;
};
export type AuditEventView = {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    actorEmail: string | null;
    subjectEmail: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
};
export type AdminOverview = {
    totalCoaches: number;
    pendingCoaches: number;
    approvedCoaches: number;
    suspendedCoaches: number;
    totalClients: number;
    pendingClients: number;
};
export type ClientWorkspace = {
    relationship: CoachClient | null;
    coach: PublicUser | null;
};
