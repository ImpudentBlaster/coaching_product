# ADR 001: Separate Node.js API and React.js SPA

Status: accepted

## Decision

The product will use two independently built applications:

- `apps/web`: React.js, Vite, and TypeScript as a client-rendered SPA.
- `apps/api`: Node.js, Express, and TypeScript as a REST API.
- PostgreSQL provides relational persistence through the `pg` driver. Database changes use committed SQL migrations; no ORM is used.

Next.js is not part of the stack. Future implementation must not add Next.js pages, routing, server components, server actions, or API routes.

## Reason

The product owner selected a conventional Node.js backend and React.js frontend that can be developed, tested, deployed, and scaled separately on a VPS. The explicit separation also keeps authorization in the API rather than relying on frontend routing.

## Consequences

- Browser code talks to the API under `/api/v1`.
- Vite builds static frontend assets for later Nginx hosting.
- The Node.js API owns authentication, authorization, validation, and data access.
- PostgreSQL remains the approved database; “Node/React stack” does not implicitly change persistence to MongoDB.
