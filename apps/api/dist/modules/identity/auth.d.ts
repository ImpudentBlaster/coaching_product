import type { NextFunction, Request, Response } from 'express';
import type { Environment } from '../../config/environment.js';
import type { Role } from './types.js';
export type AuthContext = {
    userId: string;
    role: Role;
    approvalStatus?: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
};
declare global {
    namespace Express {
        interface Request {
            auth?: AuthContext;
        }
    }
}
export type AuthenticatedRequest = Request;
export declare function issueAccessToken(environment: Environment, user: {
    id: string;
    role: Role;
}): string;
export declare function authenticate(environment: Environment): (request: AuthenticatedRequest, response: Response, next: NextFunction) => void;
export declare function requireRole(role: Role): (request: AuthenticatedRequest, response: Response, next: NextFunction) => void;
