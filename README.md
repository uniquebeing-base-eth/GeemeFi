# Geemifi

Geemifi is a community for generosity, practical learning and shared opportunity. This repository contains the Phase 1 application foundation: authentication, editable profiles, member discovery, a protected wallet summary and the database structures for later social modules.

## Run locally

Requirements: Node.js 22.18 or newer, npm and PostgreSQL.

```sh
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

Set `DATABASE_URL` in `.env` to a PostgreSQL database you control. The legacy SQLite database is not modified or removed by the application. To copy it to a new, empty PostgreSQL database, set `SQLITE_SOURCE_PATH` and run `npm run db:migrate:sqlite`. This command makes a consistent SQLite backup (including committed WAL data) before copying records, and refuses to merge into populated PostgreSQL tables.

Open [http://localhost:5173](http://localhost:5173). Create an account, edit your profile and explore the application.

```sh
npm test       # API integration test (requires TEST_DATABASE_URL or DATABASE_URL)
npm run check  # TypeScript check
npm run build  # Production frontend build and TypeScript check
```

For a production-style local run, build first and then start the Node server:

```sh
NODE_ENV=production npm run build
NODE_ENV=production npm start
```

Set `PORT`, `DATABASE_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, and `APP_BASE_URL` in the deployment environment. Apply schema updates with `npm run db:migrate` using a migration-capable database role; run the app with a least-privilege PostgreSQL role. Terminate TLS at the host or trusted proxy.

## What works

- Account registration with single-use email verification, sign-in, sign-out and persistent sessions.
- Branded verification and password-reset emails sent through Resend; reset tokens are hashed at rest, expire, are single-use, and revoke prior sessions.
- Passwords hashed with Node.js `scrypt`; opaque session tokens are stored as SHA-256 hashes and delivered through `HttpOnly`, `SameSite=Lax` cookies.
- Protected profile editing with server-side validation and audit records.
- Discoverable member search and public profiles that omit email and wallet identifiers.
- Responsive application shell, working navigation, loading/error/empty states, and branded Phase 1 previews for later modules.
- Wallet summary backed by server-owned database values. New accounts start at zero; no client-supplied balance or allowance is accepted.
- Versioned, transactional PostgreSQL migrations for users, settings, sessions, social infrastructure, notifications, wallet records, moderation reports and audit logs.

## Project layout

```text
server/
  db.ts                 PostgreSQL connection, transactions and migration runner
  index.ts              HTTP server, API registration and SPA hosting
  security.ts            Passwords, sessions, origin checks and auth guards
  routes/
    auth.ts              Registration, login, logout and current session
    profiles.ts          Public profiles, profile updates and wallet summary
  migrations/postgres/   Ordered PostgreSQL migrations
src/
  app.tsx                Route table and protected route boundary
  components/            Brand, shell, avatar and authentication context
  lib/                   Typed API client and domain types
  pages/                 Account, profile, discovery and foundation views
  styles.css             Responsive Geemifi design system
tests/                   API integration coverage
docs/                    Architecture and implementation boundaries
```

See [docs/architecture.md](docs/architecture.md) for module responsibilities, data boundaries and future integration points.

## Architecture and security notes

The browser only communicates with the same-origin Express API. The PostgreSQL database is never exposed to the client. Private operations require a database-backed session, and request bodies are validated on the server. Writes also check the request origin. Wallet-account and wallet-transaction rows use PostgreSQL row-level security keyed to a transaction-local user ID; configure the runtime database role without table ownership or `BYPASSRLS`. The application stores no real token balance: wallet fields are a foundation model and do not authorize transfers.

The auth rate limiter is process-local and intended as a basic foundation only; configure shared rate limiting before horizontally scaling.

## Not included yet

- Embedded smart-wallet provisioning, GoodDollar identity verification and on-chain G$ transfers are not implemented yet.
- Feed posts, media uploads, follows, likes, comments, notifications and moderation workflows have schema foundations only.
- Gifts, bounty funding/settlement, courses, certificates and tutor applications are not active.
- Admin role data is modeled, but there is no admin UI or administrative API.
- Avatar uploads and object storage are not configured; profiles currently accept secure HTTPS image URLs.

These are intentional phase boundaries. The visible Bounty and Academy routes explain their state rather than offering inert actions.