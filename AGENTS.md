# Repository instructions

## Phase boundary

Phase 1 identity, tenancy, and approvals is complete. The repository is now open for the locally runnable Phase 2 demo MVP: exercises, fixed client onboarding, workout templates/programs/assignments/execution, nutrition targets/logging, numeric progress, fixed check-ins, contextual text feedback, and informational manual subscriptions. Preserve the root `exercises_1.json` and `exercise_images/` as user-owned authoritative import inputs; do not modify or move them.

Online payments, email delivery, external nutrition databases, real-time chat, video calls, calendar integrations, mobile applications, wearables, automations, AI features, white-label functionality, Redis, queues, microservices, and Kubernetes remain out of scope. Progress-photo uploads remain deferred unless a secure private-storage abstraction is explicitly introduced.

## Required application stack

- Frontend: client-rendered React.js SPA with Vite and TypeScript.
- Backend: Node.js with Express and TypeScript.
- Database: PostgreSQL using the `pg` driver. Do not add Prisma or another ORM without an explicit product decision.
- Do not add or migrate to Next.js, React Server Components, or a framework that combines frontend and backend rendering.
- Keep the frontend and backend as separate applications under `apps/web` and `apps/api`.

## Engineering rules

- Preserve strict TypeScript and deny-by-default server authorization.
- Never store access or refresh tokens in browser storage.
- Never commit secrets or create default credentials.
- Use reviewed, committed SQL migrations executed by the repository migration command.
- Phase 2 continues to use PostgreSQL and the `pg` driver. Do not interpret specifications mentioning Prisma as authorization to add it; express all schema changes as committed SQL migrations.
- Every sensitive state transition and its audit event must share a database transaction.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before handoff.
