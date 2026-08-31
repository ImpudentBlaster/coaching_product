# Developer documentation

This document is the practical handoff guide for the Forme fitness coaching application. It explains how the repository is organized, how data and permissions flow, how to run it locally, and which conventions future work must preserve.

## 1. Product and stack

Forme is a multi-tenant coaching SaaS with three roles: platform administrator, coach, and client.

- Frontend: client-rendered React 19 SPA, Vite, and strict TypeScript.
- Backend: Node.js, Express 5, and strict TypeScript.
- Database: PostgreSQL accessed directly with the `pg` driver.
- Package manager: pnpm workspaces with Turborepo orchestration.
- Authentication: short-lived access tokens held only in memory plus rotating refresh tokens in `HttpOnly` cookies.

The project does **not** use Next.js, MongoDB, Prisma, or another ORM. Keep the web and API applications separate.

## 2. Repository map

```text
apps/
  web/                 React/Vite browser application
    src/app/           Router and application entry shell
    src/components/    Shared layouts and display components
    src/features/      Role and workflow pages
    src/lib/api.ts     Authenticated API client and refresh handling
  api/                 Express API
    db/migrations/     Reviewed, ordered SQL migrations
    src/db/            Connection, migrations, imports, and seed commands
    src/modules/
      identity/        Login, sessions, approvals, invitations, tenancy
      mvp/             Coaching workflows and exercise media
packages/              Shared workspace packages
docs/architecture/     Architecture decision records
exercise_images/       User-owned exercise GIF import source
exercises_1.json       User-owned exercise metadata import source
```

Do not edit, move, or delete `exercise_images/` or `exercises_1.json`. Import commands read these sources and write normalized records to PostgreSQL.

## 3. Application routing and navigation

Routes are defined in `apps/web/src/app/app.tsx` and rendered inside `AppLayout`.

| Role | Main route | Purpose |
| --- | --- | --- |
| Public | `/`, `/login`, `/register/coach`, `/register/client` | Marketing and identity entry points |
| Admin | `/admin` | Platform metrics, coach approval, account controls, and audit events |
| Coach | `/coach` | Clients, invitations, and business profile |
| Coach | `/coach/studio?tab=...` | Exercises, workouts, programs, check-ins, and activity |
| Client | `/client` | Today dashboard and next actions |
| Client | `/client/hub?tab=...` | Plan, onboarding, nutrition, progress, check-ins, feedback, and membership |

Authenticated desktop navigation lives in the fixed left sidebar. Items are grouped by the user's mental model (overview, coaching/build, or account), not by backend module names. Mobile uses a compact bottom bar with the five highest-priority destinations. Query-string tabs are deep-linkable and must remain stable because dashboard calls-to-action use them.

When adding a major workflow, first decide which existing group owns it. Avoid adding a second global navigation row inside a page. Page tabs are appropriate only for switching related views within one workflow.

## 4. Authentication and authorization

`AuthProvider` owns browser session state. The access token is kept in memory and attached by `apps/web/src/lib/api.ts`. The API client performs one shared refresh attempt after an unauthorized response and retries the original request. Tokens must never be written to local storage or session storage.

The API validates JWTs and applies role guards on protected routes. Server authorization is deny-by-default. Frontend route visibility is only a usability feature; it is never a security boundary.

Tenant ownership is represented by coach/client relationships. Every coach operation that accepts a client identifier must verify that the coach owns an approved relationship. Return `404` for inaccessible tenant resources where revealing existence would leak information.

Sensitive state transitions, including approvals and their audit events, must occur in one PostgreSQL transaction.

## 5. Data management

SQL migrations are stored in `apps/api/db/migrations` and applied by the migration command. Never alter an already-applied migration; add a new ordered migration instead. Do not introduce schema synchronization or Prisma migrations.

The explicit demo seed is idempotent and development-only. It requires credentials to be supplied through environment variables and refuses production. It creates connected admin, coach, client, program, nutrition, check-in, feedback, and subscription data without embedding default credentials in source control.

Exercise imports use the external string ID as the stable key. GIF URLs use `/api/v1/exercises/:id/gif`. IDs are validated before building a file path, the GIF signature is checked, and missing media returns a neutral unavailable state. The media endpoint intentionally permits cross-origin embedding from the separately hosted Vite app.

## 6. Local setup

1. Copy `.env.example` to `.env` and supply a PostgreSQL password.
2. Copy `apps/api/.env.example` to `apps/api/.env` and set `DATABASE_URL`, `WEB_ORIGIN`, and a strong `JWT_ACCESS_SECRET`.
3. Copy `apps/web/.env.example` to `apps/web/.env`.
4. Start PostgreSQL:

   ```powershell
   docker compose --env-file .env -f compose.dev.yml up -d
   ```

5. Install and prepare the applications:

   ```powershell
   pnpm install
   pnpm --filter @coaching/api build
   pnpm --filter @coaching/api db:migrate
   pnpm --filter @coaching/api db:import-exercises
   ```

6. Start the API and web app together:

   ```powershell
   pnpm dev
   ```

The web app is served at `http://127.0.0.1:5173` (or `localhost:5173`) and the API at `http://127.0.0.1:3000/api/v1`. Health endpoints are `/health/live` and `/health/ready` under that prefix.

To confirm PostgreSQL persistence without changing any records, run `pnpm --filter @coaching/api db:inspect`. It prints the active database identity and current row count for every application table.

## 7. Demo seed

Set all seed values explicitly in the current shell, then run:

```powershell
$env:DEMO_SEED_PASSWORD='choose-a-strong-local-password'
$env:DEMO_SEED_ADMIN_EMAIL='admin@example.test'
$env:DEMO_SEED_COACH_EMAIL='coach@example.test'
$env:DEMO_SEED_PENDING_COACH_EMAIL='pending-coach@example.test'
$env:DEMO_SEED_CLIENT_EMAIL='client@example.test'
$env:DEMO_SEED_PENDING_CLIENT_EMAIL='pending-client@example.test'
pnpm --filter @coaching/api db:seed-demo
```

Do not commit these values. Re-running the command is safe and restores the expected connected demo state.

## 8. API conventions

- All application endpoints use the `/api/v1` prefix.
- Validate request bodies with Zod at the route boundary.
- Use parameterized SQL only.
- Return structured errors such as `{ code, message }`.
- Prefer `201` for creation, `204` for successful deletion with no body, `409` for invalid state transitions, and `404` for unavailable or unauthorized tenant resources.
- Keep state-transition rules on the server. UI disabled states are not enforcement.
- Add tests for input validation, authorization, and important transitions.

## 9. Frontend conventions

- Use `apiRequest` rather than direct `fetch` for authenticated application calls.
- Keep pages role-focused and action-oriented. Dashboard cards should lead to a real route or operation.
- Reuse shared `card`, `primary`, `secondary`, status, skeleton, and navigation styles.
- Always provide loading, empty, error, disabled, and success states.
- Preserve responsive behavior: left sidebar on desktop and bottom navigation below 850 px.
- Keep forms labelled and keyboard accessible; use semantic buttons and links.
- Never hide a failed image silently. `ExerciseGif` renders a neutral placeholder when media is unavailable.

## 10. Workflow ownership

- Admin approves, rejects, suspends, or reopens coaches and can inspect audit history.
- Coach invites and approves clients, creates workout templates and programs, publishes and assigns programs, configures nutrition/check-ins/subscriptions, and exchanges feedback.
- Client completes onboarding, performs assigned workouts, logs nutrition and measurements, submits check-ins, and reads or sends feedback.

Coach-authored program assignments store immutable snapshots. Editing a source template later must not silently change an already assigned client plan.

## 11. Quality gate

Run every command before handoff:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

Also perform browser checks for all three roles at desktop and mobile widths. Verify navigation active states, refresh/session restoration, at least one state-changing workflow per role, exercise GIF rendering, and clean browser console/network logs.

## 12. Current deliberate limitations

Private progress-photo uploads, payments, email delivery, and real-time messaging are not implemented. Do not simulate these as working integrations. Add them only after an explicit product decision and an appropriate secure storage or provider design.
