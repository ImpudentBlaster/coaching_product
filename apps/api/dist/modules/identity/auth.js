import jwt from 'jsonwebtoken';
export function issueAccessToken(environment, user) {
    return jwt.sign({ role: user.role }, environment.JWT_ACCESS_SECRET, { subject: user.id, expiresIn: '15m' });
}
export function authenticate(environment) {
    return (request, response, next) => {
        const [scheme, token] = request.header('authorization')?.split(' ') ?? [];
        if (scheme !== 'Bearer' || !token) {
            response.status(401).json({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
            return;
        }
        try {
            const payload = jwt.verify(token, environment.JWT_ACCESS_SECRET);
            if (typeof payload === 'string' || !payload.sub || typeof payload.role !== 'string')
                throw new Error('Invalid token');
            request.auth = { userId: payload.sub, role: payload.role };
            next();
        }
        catch {
            response.status(401).json({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
        }
    };
}
export function requireRole(role) {
    return (request, response, next) => {
        if (request.auth?.role !== role || request.auth.approvalStatus !== 'APPROVED') {
            response.status(403).json({ code: 'FORBIDDEN', message: 'You do not have access to this resource' });
            return;
        }
        next();
    };
}
//# sourceMappingURL=auth.js.map