# Coaching Product

Locally runnable multi-tenant fitness coaching demo MVP. Phase 1 identity, approvals, secure sessions and tenant isolation are preserved, with the agreed Phase 2 coaching workflow implemented on top. The product supports `PLATFORM_ADMIN`, `COACH`, and `CLIENT` roles.

## Technology decision

This product uses a separate Node.js API and React.js single-page application:

- **Frontend:** React.js + Vite + TypeScript. It is client rendered and does not use Next.js.
- **Backend:** Node.js + Express + TypeScript.
- **Data:** PostgreSQL through the `pg` driver; no Prisma or other ORM.

The frontend and backend remain separate applications. Do not introduce Next.js, server components, or Next.js API routes in future phases. In this project, references to a “Node/React stack” mean this architecture; it is not a migration to MongoDB unless that database decision is explicitly changed later.

## Prerequisites

- Node.js 22 LTS (Node 24 is also accepted locally)
- pnpm 11.19
- Docker with Compose (for PostgreSQL)

## Local setup

1. Copy `.env.example` to `.env` and replace its password placeholder.
2. Copy `apps/api/.env.example` to `apps/api/.env` and make its `DATABASE_URL` use the same credentials.
3. Copy `apps/web/.env.example` to `apps/web/.env`.
4. Start PostgreSQL: `docker compose --env-file .env -f compose.dev.yml up -d`.
5. Install dependencies: `pnpm install`.
6. Start both applications: `pnpm dev`.

The web application runs at `http://localhost:5173`. API routes use the `http://localhost:3000/api/v1` prefix; health checks are `/api/v1/health/live` and `/api/v1/health/ready`.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

## Database commands

Reviewed SQL migrations are committed under `apps/api/db/migrations`; an ORM schema synchronizer is not used. After configuring `DATABASE_URL`:

```powershell
pnpm --filter @coaching/api build
pnpm --filter @coaching/api db:migrate
pnpm --filter @coaching/api db:import-exercises
$env:ADMIN_EMAIL='admin@example.com'
$env:ADMIN_PASSWORD='supply-a-strong-password'
pnpm --filter @coaching/api db:seed-admin
```

The seed is idempotent, refuses missing or weak credentials, and never prints the password. The HTTP identity repository uses PostgreSQL by default; all identity, approval, invitation, password-reset, refresh-session, and audit data persists there.

## Local identity demo

For isolated UI development without PostgreSQL, the application can run with an explicit ephemeral demo adapter. Data is erased whenever the API restarts. Supply your own temporary admin credentials; none are committed:

```powershell
$env:DATABASE_URL='postgresql://demo:demo@127.0.0.1:5432/demo'
$env:WEB_ORIGIN='http://127.0.0.1:5173'
$env:JWT_ACCESS_SECRET='replace-with-at-least-32-random-characters'
$env:DEMO_MODE='true'
$env:DEMO_ADMIN_EMAIL='your-admin@example.test'
$env:DEMO_ADMIN_PASSWORD='replace-with-a-strong-demo-password'
pnpm --filter @coaching/api dev
```

Run `pnpm --filter @coaching/web dev --host 127.0.0.1` in another terminal. The real deployment will use the committed SQL migrations under `apps/api/db/migrations` and the PostgreSQL adapter, not demo mode.

The demo includes coach/client approvals, rotating `HttpOnly` refresh sessions, logout, logout-all API support, admin-issued one-time password reset codes, and session restoration after page reload. Demo data and sessions are erased when the API restarts.

## Source data

`exercises_1.json` and `exercise_images/` are local Phase 2 import inputs and are ignored by Git. The application does not mutate them.

## Current scope

Phase 1 now includes persistent identity, secure rotating sessions, coach registration and admin approval, invitation-based client registration, coach-managed client approvals, password resets, transactional audit records, and server-side role/tenant enforcement. Exercise, workout, program, nutrition, progress, messaging, payment, and upload functionality remains intentionally deferred to Phase 2 or later.

The admin dashboard exposes live PostgreSQL metrics, coach status filtering, approval/rejection/suspension/restoration, one-time password reset issuance, and the security audit stream. The coach Planning Studio includes the global exercise library, workout templates, published programs and immutable client assignments, nutrition planning, fixed weekly check-ins, subscriptions, feedback, and completed workout activity. The client Coaching Hub includes fixed onboarding, assigned-program execution and history, nutrition logging, numeric progress, check-in submission/history, contextual feedback, and subscription status.

Exercise imports are idempotent by external string ID. GIF paths are derived only from validated safe IDs, GIF signatures are checked before import and delivery, and missing media produces a neutral unavailable state. Extra files are reported and never deleted.

Progress photos are intentionally deferred. The numeric progress workflow is complete, while private uploads will remain disabled until a reviewed private-storage abstraction exists.
