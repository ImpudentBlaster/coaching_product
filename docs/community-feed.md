# Community feed

The Community feed is available in the coach and client navigation at `/coach/feed` and `/client/feed`. An approved coach and their approved clients share one private timeline. Platform administrators do not have feed access. Suspension or loss of the approved relationship immediately removes API and attachment access; posts remain in their original community.

Members can publish text (5,000 characters), photos, and arbitrary file attachments, like/unlike posts, and write comments (2,000 characters). Filters include all posts, photos, files, and the current member's posts. Timelines and comments use 20-item cursor pagination. Authors can delete their own content; the community's coach can moderate all posts and comments. Deleting a post also deletes its attachments, comments, and likes. Posting, interactions, and deletion record an audit event in the same database transaction.

## Running locally

Use the existing PostgreSQL setup and API `.env`, build the API, and run the repository migration command:

```sh
pnpm --filter @coaching/api build
pnpm --filter @coaching/api db:migrate
pnpm dev
```

Migration `008_community_feed.sql` creates the feed tables. This module requires PostgreSQL; the identity-only in-memory `DEMO_MODE` does not implement the feed.

## Attachments

Up to four attachments, 10 MB each, 20 MB combined per post. Previewable JPEG, PNG, and WebP photos must be no larger than 8 MB and 20 megapixels. They are decoded, stripped of metadata, resized, and re-encoded as JPEG before storage. Other formats (including GIF, SVG, documents, archives, audio, and video) can be attached and downloaded but are not rendered inline. Total stored attachments are capped at 200 MB per author; deleting older posts frees space.

The demo uses private PostgreSQL `bytea` storage, consistent with existing private check-in photo storage. Attachments have no public URLs, are fetched with the in-memory bearer token, and use no-store responses. Non-photo files are served as octet-stream downloads with nosniff and a sandbox CSP. Uploaded filenames never become filesystem paths. There is no malware scanner: downloading files does not certify their safety. A production deployment should introduce private object storage, scanning, and operational quotas before expanding these limits. No tokens or private media are saved to browser storage.

## Reference and scope

Kahunas' official [community roadmap](https://pipeline.kahunas.io/) describes forums/groups as in testing, and its [chat feature documentation](https://help.kahunas.io/en/articles/219-chat-features) describes media attachments and reactions. This module adapts those coaching-community concepts into the requested Twitter-style chronological feed; it does not claim to reproduce an existing Kahunas feed. It uses the existing Forme visual design. Real-time chat, push/email notifications, external social sharing, and automated features remain outside this implementation.

## Verification

`pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Feed API integration tests use an isolated PostgreSQL schema when `DATABASE_URL` is configured. They cover cross-tenant access, approval revocation, attachment delivery, atomic audit rollback, moderation, idempotent likes, and pagination. Frontend tests cover composer success/failure, audience disclosure, filters, comments, likes, deletion confirmation, and private photo URL cleanup.
