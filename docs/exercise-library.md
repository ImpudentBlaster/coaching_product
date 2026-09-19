# Exercise library

Coaches can add exercises from **Training → Exercises → Add exercise**. The form uses the imported library's fields: name, body part, equipment, target muscle, secondary muscles, and ordered instruction steps. An optional animated GIF can be uploaded (8 MB, at most 200 frames and 30 million decoded pixels across all frames). The server validates and re-encodes GIFs while preserving animation. The exercise, its private animation, and audit event are saved in one PostgreSQL transaction.

Imported exercises remain shared. Custom exercises are visible only to their creating coach and currently approved clients of that coach. Other coaches cannot discover them, fetch their animations, or add them to workout templates. Custom GIFs are stored in PostgreSQL, separate from user-owned `exercises_1.json` and `exercise_images/`. A coach can create up to 1,000 exercises and store up to 200 MB of animations.

Search runs after 350 ms without typing. Up to four random suggestions match the current search; an empty query suggests exercises across the accessible library. Shuffle requests another random sample (overlap is possible). Selecting a suggestion searches immediately. Search resets pagination and ignores stale responses. Workout exercise selectors also search the full accessible library, so custom exercises can be used without being in the first 50 rows.

## Animation loading and deployment

The previous image component used a hardcoded `http://127.0.0.1:3000` URL; on another device that points to that device, and HTTPS pages may also block it as mixed content. Media now uses the same configured API and authentication/refresh flow as the rest of the application, with temporary blob URLs revoked on unmount. Failed loads can be retried and changing exercises resets failure state. The server checks actual imported files even when the database's availability flag is stale.

`VITE_API_URL` defaults to `/api/v1`. The Vite development server proxies `/api` to Express at `http://127.0.0.1:3000`. The local web `.env` and example use the relative URL. Restart Vite after changing its configuration. To test on a phone on the same trusted network, explicitly run Vite with `pnpm --filter @coaching/web dev --host 0.0.0.0` and open the computer's reachable address on port 5173. Express may remain bound to loopback behind the proxy. Do not put localhost/127.0.0.1 in the browser API URL for remote devices.

In production, serve `/api` through the same-origin reverse proxy to Express, or configure `VITE_API_URL` to a reachable HTTPS API and set the API's `WEB_ORIGIN` accordingly. The Vite dev proxy is not included in the static production build.

Imported asset paths are resolved from the module's repository location, independent of the process working directory. An optional `EXERCISE_IMAGES_DIR` can point to a separate asset mount; absolute paths are recommended. Include the imported files on the API host, not the browser host. The import command uses the same path resolver and will not overwrite custom exercise rows.

The provided input has 1,324 exercises and one missing GIF: `0609`, **london bridge**. Its instructions remain usable; the missing animation cannot be restored through a URL change. No authoritative import files were modified.

## Setup and verification

Build the API and run `pnpm --filter @coaching/api db:migrate` to apply `009_custom_exercises.sql`. Then run the existing development servers. API tests cover creation, GIF validation and frame preservation, atomic audit rollback, scoped search/suggestions/media, cross-coach workout rejection, and imported asset delivery. UI tests cover debounce, pagination reset, stale responses, form submission/failure, and animation retry/cleanup.
