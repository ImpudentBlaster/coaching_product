# Render deployment

Repository: `ImpudentBlaster/coaching_product`. Both services deploy **main** only; `dev` is not connected to either service.

- Frontend: https://coaching-product-web.onrender.com
- API: https://coaching-product-api.onrender.com
- Database: `coaching-product-db`, PostgreSQL 18, Oregon, private connections only.
- Initial deployed commit: `cc04c1875b7f26eacd1a67ee8923fd658d1c95d2`.

## Service configuration

Both services build from the repository root with Node 24.14.0 and the repository's pinned pnpm version.

API build: `pnpm install --frozen-lockfile && pnpm --filter @coaching/api build`.

API startup runs committed migrations, imports the authoritative exercise inputs, optionally runs the existing admin seed when both admin environment variables are supplied, and starts the API. The import is idempotent. The initial import loaded 1,324 exercises; `0609.gif` was missing from the supplied inputs.

API environment: `NODE_ENV=production`, `API_HOST=0.0.0.0`, `API_PORT=10000`, `DEMO_MODE=false`, `DOTENV_CONFIG_PATH=/dev/null`, and `WEB_ORIGIN=https://coaching-product-web.onrender.com`. `DATABASE_URL` and a generated `JWT_ACCESS_SECRET` are stored only in Render. Health checks use `/api/v1/health/live`.

Frontend build: `pnpm install --frozen-lockfile && pnpm --filter @coaching/web build`. Publish directory: `apps/web/dist`. `VITE_API_URL=/api/v1`.

Frontend rewrites, in order:

1. `/api/*` to `https://coaching-product-api.onrender.com/api/*`.
2. `/*` to `/index.html`.

The frontend adds `Cache-Control: no-store` to `/api/*`. Same-origin API forwarding preserves the existing refresh-cookie configuration.

## First administrator

In the API service's Render Environment settings, add your own `ADMIN_EMAIL` and `ADMIN_PASSWORD` (at least 12 characters). Save and deploy. Startup invokes `pnpm --filter @coaching/api db:seed-admin` when both values are present. Verify the log says `Platform admin created`, then sign in through the frontend. Remove the two bootstrap variables after successful setup and redeploy. The seed does not replace an existing account's password.

No administrator or default credentials were created as part of infrastructure provisioning.

## Hosting limits and verification

The free API sleeps after inactivity. Render reports that the free database expires on October 18, 2026; upgrade it before expiry to retain it.

All seven migrations applied successfully. Render marked both initial deployments live. The invitation route loads, and a deliberately invalid login through the frontend returned the expected API error, confirming frontend/API/database connectivity. Successful authenticated flows still require the first administrator to be provisioned.

Local lint, typecheck, and build passed. The full test run reported the existing collection-search failure and an API test timeout; the API test passed in a focused rerun.
