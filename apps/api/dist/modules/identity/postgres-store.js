import { applyClientSetup, clientSetupSchema } from '../mvp/client-setup.js';
import argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
const publicUser = (row) => ({ id: row.id, email: row.email, role: row.role, displayName: row.display_name ?? row.email, businessName: row.business_name, approvalStatus: row.account_status, createdAt: row.created_at.toISOString() });
const storedUser = (row) => ({ ...publicUser(row), passwordHash: row.password_hash });
const userSelect = `SELECT u.*, COALESCE(cp.display_name, clp.display_name) display_name, cp.business_name FROM users u LEFT JOIN coach_profiles cp ON cp.user_id=u.id LEFT JOIN client_profiles clp ON clp.user_id=u.id`;
export class PostgresIdentityStore {
    pool;
    constructor(databaseUrl) { this.pool = new pg.Pool({ connectionString: databaseUrl }); }
    async close() { await this.pool.end(); }
    async previewClientInvitation(token) {
        const row = (await this.pool.query(`SELECT i.email::text,i.setup,i.used_at,i.revoked_at,i.expires_at,u.account_status FROM client_invitations i JOIN users u ON u.id=i.coach_id WHERE i.token_hash=$1`, [hash(token)])).rows[0];
        if (!row || row.revoked_at)
            throw new Error('INVALID_INVITATION');
        if (row.used_at)
            throw new Error('INVITATION_USED');
        if (row.expires_at.getTime() <= Date.now() || row.account_status !== 'APPROVED')
            throw new Error('INVALID_INVITATION');
        return { email: row.email, displayName: [row.setup?.firstName, row.setup?.lastName].filter(Boolean).join(' ') };
    }
    async registerCoach(input) { return this.tx(async (c) => { const hash = await argon2.hash(input.password, { type: argon2.argon2id }); const u = await c.query(`INSERT INTO users(email,password_hash,role,account_status) VALUES($1,$2,'COACH','PENDING_REVIEW') RETURNING *,NULL::text display_name,NULL::text business_name`, [input.email.trim().toLowerCase(), hash]); const row = u.rows[0]; if (!row)
        throw new Error('CREATE_FAILED'); await c.query('INSERT INTO coach_profiles(user_id,display_name,business_name) VALUES($1,$2,$3)', [row.id, input.displayName.trim(), input.businessName.trim()]); row.display_name = input.displayName.trim(); row.business_name = input.businessName.trim(); return publicUser(row); }).catch(e => { if (isUnique(e))
        throw new Error('EMAIL_EXISTS'); throw e; }); }
    async findByEmail(email) { const r = await this.pool.query(`${userSelect} WHERE u.email=$1`, [email.trim().toLowerCase()]); return r.rows[0] ? storedUser(r.rows[0]) : undefined; }
    async findById(id) { const r = await this.pool.query(`${userSelect} WHERE u.id=$1`, [id]); return r.rows[0] ? storedUser(r.rows[0]) : undefined; }
    async listCoaches(status) { const values = status ? [status] : []; const r = await this.pool.query(`${userSelect} WHERE u.role='COACH' ${status ? 'AND u.account_status=$1' : ''} ORDER BY u.created_at DESC`, values); return r.rows.map(publicUser); }
    async getAdminOverview() { const r = await this.pool.query(`SELECT count(*) FILTER (WHERE role='COACH') total_coaches,count(*) FILTER (WHERE role='COACH' AND account_status='PENDING_REVIEW') pending_coaches,count(*) FILTER (WHERE role='COACH' AND account_status='APPROVED') approved_coaches,count(*) FILTER (WHERE role='COACH' AND account_status='SUSPENDED') suspended_coaches,count(*) FILTER (WHERE role='CLIENT') total_clients,count(*) FILTER (WHERE role='CLIENT' AND account_status='PENDING_REVIEW') pending_clients FROM users`); const row = r.rows[0]; return { totalCoaches: Number(row.total_coaches), pendingCoaches: Number(row.pending_coaches), approvedCoaches: Number(row.approved_coaches), suspendedCoaches: Number(row.suspended_coaches), totalClients: Number(row.total_clients), pendingClients: Number(row.pending_clients) }; }
    async listAuditEvents() { const r = await this.pool.query(`SELECT ae.id,ae.action,ae.entity_type,ae.entity_id,actor.email::text actor_email,subject.email::text subject_email,ae.metadata,ae.created_at FROM audit_events ae LEFT JOIN users actor ON actor.id=ae.actor_user_id LEFT JOIN users subject ON subject.id=ae.entity_id ORDER BY ae.created_at DESC LIMIT 100`); return r.rows.map(row => ({ id: row.id, action: row.action, entityType: row.entity_type, entityId: row.entity_id, actorEmail: row.actor_email, subjectEmail: row.subject_email, metadata: row.metadata, createdAt: row.created_at.toISOString() })); }
    async transitionCoach(input) { return this.tx(async (c) => { const r = await c.query(`${userSelect} WHERE u.id=$1 AND u.role='COACH' FOR UPDATE OF u`, [input.coachId]); const row = r.rows[0]; if (!row)
        throw new Error('COACH_NOT_FOUND'); const allowed = { PENDING_REVIEW: ['APPROVED', 'REJECTED'], APPROVED: ['SUSPENDED'], REJECTED: ['PENDING_REVIEW'], SUSPENDED: ['APPROVED'] }; if (!allowed[row.account_status].includes(input.target))
        throw new Error('INVALID_TRANSITION'); await c.query('UPDATE users SET account_status=$1::approval_status,updated_at=now() WHERE id=$2', [input.target, row.id]); await c.query('UPDATE coach_profiles SET approved_at=CASE WHEN $1::approval_status=\'APPROVED\'::approval_status THEN now() ELSE approved_at END,approved_by_user_id=$2,rejection_reason=$3,updated_at=now() WHERE user_id=$4', [input.target, input.actorId, input.reason, row.id]); await this.audit(c, input.actorId, `COACH_${input.target}`, row.id, row.account_status, input.target, input.reason); row.account_status = input.target; return publicUser(row); }); }
    async createClientInvitation(coachId, email) { await this.requireCoach(coachId); const token = randomBytes(32).toString('base64url'); const expiresAt = new Date(Date.now() + 604800000); const r = await this.pool.query('INSERT INTO client_invitations(coach_id,email,token_hash,expires_at) VALUES($1,$2,$3,$4) RETURNING id', [coachId, email.trim().toLowerCase(), hash(token), expiresAt]); return { invitationId: r.rows[0]?.id ?? '', token, expiresAt: expiresAt.toISOString() }; }
    async registerClient(input) { return this.tx(async (c) => { const inv = await c.query(`SELECT * FROM client_invitations WHERE token_hash=$1 FOR UPDATE`, [hash(input.token)]); const i = inv.rows[0]; if (!i || i.used_at || i.revoked_at || i.expires_at.getTime() <= Date.now())
        throw new Error('INVALID_INVITATION'); const ph = await argon2.hash(input.password, { type: argon2.argon2id }); const u = await c.query(`INSERT INTO users(email,password_hash,role,account_status) VALUES($1,$2,'CLIENT','PENDING_REVIEW') RETURNING *, $3::text display_name,NULL::text business_name`, [i.email, ph, input.displayName.trim()]); const row = u.rows[0]; if (!row)
        throw new Error('CREATE_FAILED'); await c.query('INSERT INTO client_profiles(user_id,display_name) VALUES($1,$2)', [row.id, input.displayName.trim()]); const rel = await c.query('INSERT INTO coach_clients(coach_id,client_id) VALUES($1,$2) RETURNING id,created_at', [i.coach_id, row.id]); if (i.setup) {
        const setup = clientSetupSchema.parse(i.setup);
        await applyClientSetup(c, i.coach_id, row.id, setup);
        row.display_name = setup.firstName + ' ' + setup.lastName;
    } await c.query('UPDATE client_invitations SET used_at=now() WHERE id=$1', [i.id]); const rr = rel.rows[0]; return { user: publicUser(row), relationship: { id: rr?.id ?? '', coachId: i.coach_id, clientId: row.id, status: 'PENDING_REVIEW', rejectionReason: null, createdAt: rr?.created_at.toISOString() ?? new Date().toISOString() } }; }).catch(e => { if (isUnique(e))
        throw new Error('EMAIL_EXISTS'); throw e; }); }
    async listInvitations(coachId) { await this.requireCoach(coachId); const r = await this.pool.query(`SELECT id,coach_id,email::text,expires_at,used_at,revoked_at,created_at FROM client_invitations WHERE coach_id=$1 ORDER BY created_at DESC`, [coachId]); return r.rows.map(row => ({ id: row.id, coachId: row.coach_id, email: row.email, expiresAt: row.expires_at.toISOString(), usedAt: row.used_at?.toISOString() ?? null, revokedAt: row.revoked_at?.toISOString() ?? null, createdAt: row.created_at.toISOString(), status: row.revoked_at ? 'REVOKED' : row.used_at ? 'ACCEPTED' : row.expires_at.getTime() <= Date.now() ? 'EXPIRED' : 'PENDING' })); }
    async revokeInvitation(coachId, invitationId) { await this.requireCoach(coachId); const r = await this.pool.query(`UPDATE client_invitations SET revoked_at=now() WHERE id=$1 AND coach_id=$2 AND used_at IS NULL AND revoked_at IS NULL AND expires_at>now() RETURNING id,coach_id,email::text,expires_at,used_at,revoked_at,created_at`, [invitationId, coachId]); const row = r.rows[0]; if (!row)
        throw new Error('INVALID_INVITATION_TRANSITION'); return { id: row.id, coachId: row.coach_id, email: row.email, expiresAt: row.expires_at.toISOString(), usedAt: null, revokedAt: row.revoked_at?.toISOString() ?? null, createdAt: row.created_at.toISOString(), status: 'REVOKED' }; }
    async listCoachClients(coachId) { await this.requireCoach(coachId); const r = await this.pool.query(`SELECT cc.id relationship_id,cc.coach_id,cc.client_id,cc.status,cc.rejection_reason,cc.created_at relationship_created_at,u.*,clp.display_name,NULL::text business_name FROM coach_clients cc JOIN users u ON u.id=cc.client_id JOIN client_profiles clp ON clp.user_id=u.id WHERE cc.coach_id=$1 ORDER BY cc.created_at DESC`, [coachId]); return r.rows.map(row => ({ id: row.relationship_id, coachId: row.coach_id, clientId: row.client_id, status: row.status, rejectionReason: row.rejection_reason, createdAt: row.relationship_created_at.toISOString(), client: publicUser(row) })); }
    async transitionClient(input) { return this.tx(async (c) => { await this.requireCoach(input.coachId, c); const r = await c.query('SELECT * FROM coach_clients WHERE id=$1 AND coach_id=$2 FOR UPDATE', [input.relationshipId, input.coachId]); const rel = r.rows[0]; if (!rel)
        throw new Error('CLIENT_NOT_FOUND'); if (rel.status !== 'PENDING_REVIEW')
        throw new Error('INVALID_TRANSITION'); await c.query('UPDATE coach_clients SET status=$1::approval_status,rejection_reason=$2,approved_at=CASE WHEN $1::approval_status=\'APPROVED\'::approval_status THEN now() END,approved_by_user_id=$3,updated_at=now() WHERE id=$4', [input.target, input.reason, input.actorId, rel.id]); await c.query('UPDATE users SET account_status=$1::approval_status,updated_at=now() WHERE id=$2', [input.target, rel.client_id]); await this.audit(c, input.actorId, `CLIENT_${input.target}`, rel.client_id, rel.status, input.target, input.reason); const user = await c.query(`${userSelect} WHERE u.id=$1`, [rel.client_id]); return { id: rel.id, coachId: rel.coach_id, clientId: rel.client_id, status: input.target, rejectionReason: input.reason, createdAt: rel.created_at.toISOString(), client: publicUser(user.rows[0]) }; }); }
    async getClientWorkspace(clientId) { const r = await this.pool.query(`SELECT cc.id relationship_id,cc.coach_id,cc.client_id,cc.status,cc.rejection_reason,cc.created_at relationship_created_at,u.*,cp.display_name,cp.business_name FROM coach_clients cc JOIN users u ON u.id=cc.coach_id JOIN coach_profiles cp ON cp.user_id=u.id WHERE cc.client_id=$1 ORDER BY cc.created_at DESC LIMIT 1`, [clientId]); const row = r.rows[0]; return row ? { relationship: { id: row.relationship_id, coachId: row.coach_id, clientId: row.client_id, status: row.status, rejectionReason: row.rejection_reason, createdAt: row.relationship_created_at.toISOString() }, coach: publicUser(row) } : { relationship: null, coach: null }; }
    async updateProfile(userId, displayName, businessName) { return this.tx(async (c) => { const u = await c.query(`${userSelect} WHERE u.id=$1 FOR UPDATE OF u`, [userId]); const row = u.rows[0]; if (!row)
        throw new Error('USER_NOT_FOUND'); if (row.role === 'COACH') {
        await c.query('UPDATE coach_profiles SET display_name=$1,business_name=COALESCE($2,business_name),updated_at=now() WHERE user_id=$3', [displayName.trim(), businessName?.trim(), userId]);
        row.business_name = businessName?.trim() ?? row.business_name;
    }
    else if (row.role === 'CLIENT') {
        await c.query('UPDATE client_profiles SET display_name=$1,updated_at=now() WHERE user_id=$2', [displayName.trim(), userId]);
    } row.display_name = displayName.trim(); await c.query("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,'PROFILE_UPDATED','USER',$1,'{}'::jsonb)", [userId]); return publicUser(row); }); }
    async createRefreshSession(userId) { const token = randomBytes(48).toString('base64url'); const familyId = randomUUID(); const expiresAt = new Date(Date.now() + 2592000000); const r = await this.pool.query('INSERT INTO refresh_sessions(user_id,family_id,token_hash,expires_at) VALUES($1,$2,$3,$4) RETURNING id', [userId, familyId, hash(token), expiresAt]); return { token, session: { id: r.rows[0]?.id ?? '', userId, familyId, tokenHash: hash(token), expiresAt: expiresAt.toISOString(), rotatedAt: null, revokedAt: null } }; }
    async rotateRefreshSession(token) { const c = await this.pool.connect(); try {
        await c.query('BEGIN');
        const r = await c.query('SELECT * FROM refresh_sessions WHERE token_hash=$1 FOR UPDATE', [hash(token)]);
        const s = r.rows[0];
        if (!s || s.expires_at.getTime() <= Date.now()) {
            await c.query('ROLLBACK');
            throw new Error('INVALID_REFRESH');
        }
        if (s.rotated_at || s.revoked_at) {
            await c.query('UPDATE refresh_sessions SET revoked_at=now() WHERE family_id=$1', [s.family_id]);
            await c.query('COMMIT');
            throw new Error('REFRESH_REUSE');
        }
        await c.query('UPDATE refresh_sessions SET rotated_at=now() WHERE id=$1', [s.id]);
        const next = randomBytes(48).toString('base64url');
        await c.query('INSERT INTO refresh_sessions(user_id,family_id,token_hash,expires_at) VALUES($1,$2,$3,$4)', [s.user_id, s.family_id, hash(next), s.expires_at]);
        const u = await c.query(`${userSelect} WHERE u.id=$1`, [s.user_id]);
        if (!u.rows[0]) {
            await c.query('ROLLBACK');
            throw new Error('INVALID_REFRESH');
        }
        await c.query('COMMIT');
        return { token: next, user: storedUser(u.rows[0]) };
    }
    catch (e) {
        if (!['INVALID_REFRESH', 'REFRESH_REUSE'].includes(e instanceof Error ? e.message : '')) {
            try {
                await c.query('ROLLBACK');
            }
            catch {
                console.error('Refresh session rollback failed');
            }
        }
        throw e;
    }
    finally {
        c.release();
    } }
    async revokeRefreshToken(token) { await this.pool.query('UPDATE refresh_sessions SET revoked_at=now() WHERE token_hash=$1', [hash(token)]); }
    async revokeAllSessions(userId) { await this.pool.query('UPDATE refresh_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [userId]); }
    async createPasswordReset(actorId, userId) { return this.tx(async (c) => { const u = await c.query(`${userSelect} WHERE u.id=$1`, [userId]); const row = u.rows[0]; if (!row)
        throw new Error('USER_NOT_FOUND'); const token = randomBytes(32).toString('base64url'); const expiresAt = new Date(Date.now() + 1800000); await c.query('INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,$3)', [userId, hash(token), expiresAt]); await this.audit(c, actorId, 'PASSWORD_RESET_ISSUED', userId, row.account_status, row.account_status, null); return { token, expiresAt: expiresAt.toISOString() }; }); }
    async usePasswordReset(token, newPassword) { await this.tx(async (c) => { const r = await c.query('SELECT * FROM password_reset_tokens WHERE token_hash=$1 FOR UPDATE', [hash(token)]); const rec = r.rows[0]; if (!rec || rec.used_at || rec.expires_at.getTime() <= Date.now())
        throw new Error('INVALID_RESET'); const ph = await argon2.hash(newPassword, { type: argon2.argon2id }); await c.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2', [ph, rec.user_id]); await c.query('UPDATE password_reset_tokens SET used_at=now() WHERE id=$1', [rec.id]); await c.query('UPDATE refresh_sessions SET revoked_at=now() WHERE user_id=$1', [rec.user_id]); }); }
    async requireCoach(id, client = this.pool) { const r = await client.query('SELECT 1 FROM users WHERE id=$1 AND role=\'COACH\' AND account_status=\'APPROVED\'', [id]); if (!r.rowCount)
        throw new Error('COACH_NOT_APPROVED'); }
    async audit(c, actor, action, subject, previous, next, reason) { await c.query('INSERT INTO approval_decisions(actor_user_id,subject_user_id,previous_status,new_status,reason) VALUES($1,$2,$3,$4,$5)', [actor, subject, previous, next, reason]); await c.query("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'USER',$3,$4)", [actor, action, subject, JSON.stringify({ previousStatus: previous, newStatus: next })]); }
    async tx(work) { const c = await this.pool.connect(); try {
        await c.query('BEGIN');
        const result = await work(c);
        await c.query('COMMIT');
        return result;
    }
    catch (e) {
        await c.query('ROLLBACK');
        throw e;
    }
    finally {
        c.release();
    } }
}
const hash = (token) => createHash('sha256').update(token).digest('hex');
const isUnique = (error) => typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
//# sourceMappingURL=postgres-store.js.map