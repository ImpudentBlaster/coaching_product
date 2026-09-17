import type { AdminOverview, ApprovalStatus, AuditEvent, AuditEventView, ClientRelationshipView, ClientWorkspace, CoachClient, InvitationView, PublicUser, RefreshSession, StoredUser } from './types.js';
export declare class DemoIdentityStore {
    private readonly users;
    private readonly userIdByEmail;
    private readonly auditEvents;
    private readonly invitations;
    private readonly relationships;
    private readonly sessions;
    private readonly passwordResets;
    static create(adminEmail: string, adminPassword: string): Promise<DemoIdentityStore>;
    registerCoach(input: {
        email: string;
        password: string;
        displayName: string;
        businessName: string;
    }): Promise<PublicUser>;
    createClientInvitation(coachId: string, email: string): {
        invitationId: string;
        token: string;
        expiresAt: string;
    };
    previewClientInvitation(token: string): {
        email: string;
        displayName: string;
    };
    registerClient(input: {
        token: string;
        password: string;
        displayName: string;
    }): Promise<{
        user: PublicUser;
        relationship: CoachClient;
    }>;
    listCoachClients(coachId: string): ClientRelationshipView[];
    transitionClient(input: {
        relationshipId: string;
        coachId: string;
        actorId: string;
        target: 'APPROVED' | 'REJECTED';
        reason: string | null;
    }): ClientRelationshipView;
    findByEmail(email: string): StoredUser | undefined;
    findById(id: string): StoredUser | undefined;
    listCoaches(status?: ApprovalStatus): PublicUser[];
    getAdminOverview(): AdminOverview;
    listAuditEvents(): AuditEventView[];
    listInvitations(coachId: string): InvitationView[];
    revokeInvitation(coachId: string, invitationId: string): InvitationView;
    getClientWorkspace(clientId: string): ClientWorkspace;
    updateProfile(userId: string, displayName: string, businessName?: string): PublicUser;
    transitionCoach(input: {
        coachId: string;
        actorId: string;
        target: ApprovalStatus;
        reason: string | null;
    }): PublicUser;
    getAuditEvents(): AuditEvent[];
    createRefreshSession(userId: string): {
        token: string;
        session: RefreshSession;
    };
    rotateRefreshSession(token: string): {
        token: string;
        user: StoredUser;
    };
    revokeRefreshToken(token: string): void;
    revokeAllSessions(userId: string): void;
    createPasswordReset(actorId: string, userId: string): {
        token: string;
        expiresAt: string;
    };
    usePasswordReset(token: string, newPassword: string): Promise<void>;
    private requireApprovedCoach;
    private revokeSessionFamily;
    private insertUser;
}
export declare function toPublicUser(user: StoredUser): PublicUser;
