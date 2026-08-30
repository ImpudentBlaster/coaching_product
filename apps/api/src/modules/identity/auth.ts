import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Environment } from '../../config/environment.js';
import type { Role } from './types.js';

export type AuthContext = { userId: string; role: Role; approvalStatus?: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' };
declare global { // eslint-disable-next-line @typescript-eslint/no-namespace -- Express request declaration merging
  namespace Express { interface Request { auth?: AuthContext } }
}
export type AuthenticatedRequest = Request;

export function issueAccessToken(environment: Environment, user: { id: string; role: Role }): string {
  return jwt.sign({ role: user.role }, environment.JWT_ACCESS_SECRET, { subject: user.id, expiresIn: '15m' });
}

export function authenticate(environment: Environment) {
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
