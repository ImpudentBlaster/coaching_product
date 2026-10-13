import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export class ClientAccessError extends Error { constructor(public status: number, message: string) { super(message); } }
export class ClientAccess {
  constructor(private readonly pool: Pool) {}
  private async tx<T>(work: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const value = await work(client); await client.query('COMMIT'); return value; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  private async client(c: PoolClient, coachId: string, clientId: string) {
    const coach = await c.query("SELECT 1 FROM users WHERE id=$1 AND role='COACH' AND account_status='APPROVED' FOR SHARE", [coachId]);
    if (!coach.rowCount) throw new ClientAccessError(403, 'Coach approval is required.');
    const row = (await c.query<{ email: string; status: string; account_status: string }>(`SELECT u.email::text,cc.status,u.account_status FROM coach_clients cc JOIN users u ON u.id=cc.client_id WHERE cc.coach_id=$1 AND cc.client_id=$2 AND cc.deleted_at IS NULL AND u.role='CLIENT' FOR UPDATE OF cc,u`, [coachId, clientId])).rows[0];
    if (!row) throw new ClientAccessError(404, 'Client not found.');
    return row;
  }
  private async audit(c: PoolClient, actor: string, action: string, id: string) {
    await c.query("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'CLIENT',$3)", [actor, action, id]);
  }
  async remove(coachId: string, clientId: string) {
    await this.tx(async c => {
      await this.client(c, coachId, clientId);
      await c.query("UPDATE coach_clients SET deleted_at=now(),status='SUSPENDED',updated_at=now() WHERE coach_id=$1 AND client_id=$2", [coachId, clientId]);
      const deactivated = await c.query("UPDATE users SET account_status='SUSPENDED',updated_at=now() WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM coach_clients WHERE client_id=$1 AND status IN ('APPROVED','PENDING_REVIEW'))", [clientId]);
      if (deactivated.rowCount) {
        await c.query('UPDATE refresh_sessions SET revoked_at=now() WHERE user_id=$1', [clientId]);
        await c.query('UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL', [clientId]);
      }
      await this.audit(c, coachId, 'CLIENT_DELETED', clientId);
    });
  }
  async reset(coachId: string, clientId: string) {
    return this.tx(async c => {
      const row = await this.client(c, coachId, clientId);
      if (!['APPROVED','PENDING_REVIEW'].includes(row.status) || !['APPROVED','PENDING_REVIEW'].includes(row.account_status)) throw new ClientAccessError(409, 'Password reset is unavailable for this client.');
      const token = randomBytes(32).toString('base64url');
      await c.query('UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL', [clientId]);
      await c.query("INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '30 minutes')", [clientId, tokenHash(token)]);
      await this.audit(c, coachId, 'CLIENT_PASSWORD_RESET_ISSUED', clientId);
      return { email: row.email, token };
    });
  }
  async resendRegistered(coachId: string, clientId: string) {
    return this.tx(async c => { const row = await this.client(c, coachId, clientId); if (!['APPROVED','PENDING_REVIEW'].includes(row.status) || !['APPROVED','PENDING_REVIEW'].includes(row.account_status)) throw new ClientAccessError(409, 'Registration reminders are unavailable for this client.'); await this.audit(c, coachId, 'CLIENT_REGISTRATION_MAIL_REQUESTED', clientId); return { email: row.email }; });
  }
  async resendInvitation(coachId: string, invitationId: string) {
    return this.tx(async c => {
      if (!(await c.query("SELECT id FROM users WHERE id=$1 AND role='COACH' AND account_status='APPROVED' FOR UPDATE", [coachId])).rowCount) throw new ClientAccessError(403, 'Coach approval is required.');
      const row = (await c.query<{ email: string }>(`SELECT email::text FROM client_invitations WHERE id=$1 AND coach_id=$2 AND used_at IS NULL AND revoked_at IS NULL FOR UPDATE`, [invitationId, coachId])).rows[0];
      if (!row) throw new ClientAccessError(404, 'This invitation cannot be resent.');
      if ((await c.query('SELECT 1 FROM users WHERE email=$1', [row.email])).rowCount) throw new ClientAccessError(409, 'This client is already registered.');
      const token = randomBytes(32).toString('base64url');
      await c.query("UPDATE client_invitations SET token_hash=$1,expires_at=now()+interval '7 days' WHERE id=$2", [tokenHash(token), invitationId]);
      await this.audit(c, coachId, 'CLIENT_INVITATION_REISSUED', invitationId);
      return { email: row.email, token };
    });
  }
  async switchClient(coachId: string, clientId: string, currentToken: string) {
    return this.tx(async c => {
      const row = await this.client(c, coachId, clientId);
      if (row.status !== 'APPROVED' || row.account_status !== 'APPROVED') throw new ClientAccessError(409, 'Only approved clients can be switched into.');
      const session = (await c.query<{ family_id: string }>('SELECT family_id FROM refresh_sessions WHERE token_hash=$1 AND user_id=$2 AND revoked_at IS NULL AND rotated_at IS NULL AND expires_at>now() FOR UPDATE', [tokenHash(currentToken), coachId])).rows[0];
      if (!session) throw new ClientAccessError(401, 'Please sign in again before switching.');
      await c.query('UPDATE refresh_sessions SET revoked_at=now() WHERE family_id=$1', [session.family_id]);
      const token = randomBytes(48).toString('base64url'), familyId = randomUUID();
      await c.query("INSERT INTO refresh_sessions(user_id,family_id,token_hash,expires_at,acting_coach_id) VALUES($1,$2,$3,now()+interval '1 hour',$4)", [clientId, familyId, tokenHash(token), coachId]);
      await this.audit(c, coachId, 'COACH_SWITCHED_TO_CLIENT', clientId);
      return { token, familyId };
    });
  }
}
