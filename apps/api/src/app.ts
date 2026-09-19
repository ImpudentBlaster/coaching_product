import cors from 'cors';
import cookieParser from 'cookie-parser';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import type { Environment } from './config/environment.js';
import { DemoIdentityStore } from './modules/identity/demo-store.js';
import { PostgresIdentityStore } from './modules/identity/postgres-store.js';
import { createIdentityRouter } from './modules/identity/router.js';
import { createMvpRouter } from './modules/mvp/router.js';
import { createFeedRouter } from './modules/mvp/feed.js';
import { authenticate } from './modules/identity/auth.js';

export async function createApp(environment: Environment): Promise<Express> {
  const app = express();
  const identityStore = environment.DEMO_MODE
    ? await DemoIdentityStore.create(environment.DEMO_ADMIN_EMAIL!, environment.DEMO_ADMIN_PASSWORD!)
    : new PostgresIdentityStore(environment.DATABASE_URL);

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: environment.WEB_ORIGIN, credentials: true }));
  app.use(cookieParser());
  app.use('/api/v1/exercises', authenticate(environment), express.json({ limit: '12mb' }));
  if (identityStore instanceof PostgresIdentityStore) app.use('/api/v1/feed', createFeedRouter(environment, identityStore.pool));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/v1', createIdentityRouter(environment, identityStore));
  if (identityStore instanceof PostgresIdentityStore) app.use('/api/v1', createMvpRouter(environment, identityStore.pool));

  app.get('/api/v1/health/live', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.get('/api/v1/health/ready', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.use((_request, response) => {
    response.status(404).json({ code: 'NOT_FOUND', message: 'Resource not found' });
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    void _next;
    if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
      response.status(413).json({ code: 'PAYLOAD_TOO_LARGE', message: 'Request too large. Please reduce the attachment size.' });
      return;
    }
    console.error(error instanceof Error ? error.message : 'Unknown request error');
    response.status(500).json({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
  });

  return app;
}
