import pg from 'pg';
import type { AdminOverview, ApprovalStatus, AuditEventView, ClientWorkspace, InvitationView, PublicUser, StoredUser } from './types.js';
export declare class PostgresIdentityStore {
    readonly pool: pg.Pool;
    constructor(databaseUrl: string);
    close(): Promise<void>;
    previewClientInvitation(token: string): Promise<{
        email: string;
        displayName: string;
    }>;
    registerCoach(input: {
        email: string;
        password: string;
        displayName: string;
        businessName: string;
    }): Promise<PublicUser>;
    findByEmail(email: string): Promise<StoredUser | undefined>;
    findById(id: string): Promise<StoredUser | undefined>;
    listCoaches(status?: ApprovalStatus): Promise<PublicUser[]>;
    getAdminOverview(): Promise<AdminOverview>;
    listAuditEvents(): Promise<AuditEventView[]>;
    transitionCoach(input: {
        coachId: string;
        actorId: string;
        target: ApprovalStatus;
        reason: string | null;
    }): Promise<PublicUser>;
    createClientInvitation(coachId: string, email: string): Promise<{
        invitationId: string;
        token: string;
        expiresAt: string;
    }>;
    registerClient(input: {
        token: string;
        password: string;
        displayName: string;
    }): Promise<{
        user: PublicUser;
        relationship: {
            id: string;
            coachId: string;
            clientId: string;
            status: "PENDING_REVIEW";
            rejectionReason: null;
            createdAt: string;
        };
    }>;
    listInvitations(coachId: string): Promise<InvitationView[]>;
    revokeInvitation(coachId: string, invitationId: string): Promise<InvitationView>;
    listCoachClients(coachId: string): Promise<{
        id: string;
        coachId: string;
        clientId: string;
        status: ApprovalStatus;
        rejectionReason: string | null;
        createdAt: string;
        client: PublicUser;
    }[]>;
    transitionClient(input: {
        relationshipId: string;
        coachId: string;
        actorId: string;
        target: 'APPROVED' | 'REJECTED';
        reason: string | null;
    }): Promise<{
        id: string;
        coachId: string;
        clientId: string;
        status: "APPROVED" | "REJECTED";
        rejectionReason: string | null;
        createdAt: string;
        client: PublicUser;
    }>;
    getClientWorkspace(clientId: string): Promise<ClientWorkspace>;
    updateProfile(userId: string, displayName: string, businessName?: string): Promise<PublicUser>;
    createRefreshSession(userId: string): Promise<{
        token: string;
        session: {
            id: string;
            userId: string;
            familyId: `${string}-${string}-${string}-${string}-${string}`;
            tokenHash: string;
            expiresAt: string;
            rotatedAt: null;
            revokedAt: null;
        };
    }>;
    rotateRefreshSession(token: string): Promise<{
        token: string;
        user: StoredUser;
    }>;
    revokeRefreshToken(token: string): Promise<void>;
    revokeAllSessions(userId: string): Promise<void>;
    createPasswordReset(actorId: string, userId: string): Promise<{
        token: string;
        expiresAt: string;
    }>;
    usePasswordReset(token: string, newPassword: string): Promise<void>;
    private requireCoach;
    private audit;
    private tx;
}
