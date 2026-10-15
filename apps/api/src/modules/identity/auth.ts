import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Environment } from '../../config/environment.js';
import type { Role } from './types.js';
import type { Pool } from 'pg';

export type AuthContext = { userId: string; role: Role; approvalStatus?: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' };
declare global { // eslint-disable-next-line @typescript-eslint/no-namespace -- Express request declaration merging
  namespace Express { interface Request { auth?: AuthContext } }
}
export type AuthenticatedRequest = Request;

export function issueAccessToken(environment: Environment, user: { id: string; role: Role; sessionFamilyId?: string | undefined }): string {
  return jwt.sign({ role: user.role, ...(user.sessionFamilyId ? { sessionFamilyId: user.sessionFamilyId } : {}) }, environment.JWT_ACCESS_SECRET, { subject: user.id, expiresIn: '15m' });
}

export function authenticate(environment: Environment, pool?: Pool) {
  return (request: AuthenticatedRequest, response: Response, next: NextFunction): void => {
    const [scheme, token] = request.header('authorization')?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      response.status(401).json({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
      return;
    }
    try {
      const payload = jwt.verify(token, environment.JWT_ACCESS_SECRET);
      if (typeof payload === 'string' || !payload.sub || typeof payload.role !== 'string') throw new Error('Invalid token');
      request.auth = { userId: payload.sub, role: payload.role as Role };
      if (pool && typeof payload.sessionFamilyId === 'string') {
        void pool.query(`SELECT 1 FROM refresh_sessions s WHERE s.family_id=$1 AND s.user_id=$2 AND s.rotated_at IS NULL AND s.revoked_at IS NULL AND s.expires_at>now()
          AND (s.acting_coach_id IS NULL OR EXISTS (SELECT 1 FROM coach_clients cc JOIN users c ON c.id=cc.coach_id WHERE cc.coach_id=s.acting_coach_id AND cc.client_id=s.user_id AND cc.status='APPROVED' AND c.account_status='APPROVED')) LIMIT 1`, [payload.sessionFamilyId, payload.sub]).then(result => {
          if (!result.rowCount) { response.status(401).json({ code: 'UNAUTHENTICATED', message: 'Please sign in again' }); return; }
          next();
        }).catch(next);
        return;
      }
      next();
    } catch {
      response.status(401).json({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    }
  };
}

export function requireRole(role: Role) {
  return (request: AuthenticatedRequest, response: Response, next: NextFunction): void => {
    if (request.auth?.role !== role || request.auth.approvalStatus !== 'APPROVED') {
      response.status(403).json({ code: 'FORBIDDEN', message: 'You do not have access to this resource' });
      return;
    }
    next();
  };
}
