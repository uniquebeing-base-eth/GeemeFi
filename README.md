# Geemifi

Geemifi is a community for generosity, practical learning and shared opportunity. This repository contains the Phase 1 application foundation: authentication, editable profiles, member discovery, a protected wallet summary and the database structures for later social modules.

## Run locally

Requirements: Node.js 22.18 or newer and npm.

```sh
npm install
cp .env.example .env
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Create an account, edit your profile and explore the application. SQLite data is stored in `data/geemifi.sqlite` by default; set `DATABASE_PATH` to choose another location.

```sh
npm test       # API integration test against an isolated SQLite database
npm run check  # TypeScript check
npm run build  # Production frontend build and TypeScript check
```

For a production-style local run, build first and then start the Node server:

```sh
NODE_ENV=production npm run build
NODE_ENV=production npm start
```

Set `PORT` and `DATABASE_PATH` in the deployment environment. Use a persistent volume for the database, terminate TLS at the host or trusted proxy, and keep the database file private. The current SQLite setup is intended for local development and a single application instance, not a horizontally scaled service.

## What works

- Account registration, sign-in, sign-out and persistent sessions.
- Passwords hashed with Node.js `scrypt`; opaque session tokens are stored as SHA-256 hashes and delivered through `HttpOnly`, `SameSite=Lax` cookies.
- Protected profile editing with server-side validation and audit records.
- Discoverable member search and public profiles that omit email and wallet identifiers.
- Responsive application shell, working navigation, loading/error/empty states, and branded Phase 1 previews for later modules.
- Wallet summary backed by server-owned database values. New accounts start at zero; no client-supplied balance or allowance is accepted.
- Versioned, transactional SQLite migration for users, settings, sessions, social infrastructure, notifications, wallet records, moderation reports and audit logs.

## Project layout

```text
server/
  db.ts                 SQLite connection and migration runner
  index.ts              HTTP server, API registration and SPA hosting
  security.ts            Passwords, sessions, origin checks and auth guards
  routes/
    auth.ts              Registration, login, logout and current session
    profiles.ts          Public profiles, profile updates and wallet summary
  migrations/            Ordered SQL migrations
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

The browser only communicates with the same-origin Express API. The SQLite file is never exposed to the client. Private operations require a database-backed session, and request bodies are validated on the server. Writes also check the request origin. The application stores no real token balance: wallet fields are a foundation model and do not authorize transfers.

SQLite has no row-level security (RLS). Access control is enforced in the private server API, not by database RLS policies. Before serving a public multi-instance deployment, move persistence to PostgreSQL, add and verify database RLS policies, configure production-grade shared rate limiting, and review the deployment threat model. The current process-local authentication rate limiter is intended as a basic foundation only.

## Not included yet

- Password recovery and email verification require a configured email provider.
- Wallet connection, GoodDollar identity verification, on-chain transfers and allowance allocation are not implemented.
- Feed posts, media uploads, follows, likes, comments, notifications and moderation workflows have schema foundations only.
- Gifts, bounty funding/settlement, courses, certificates and tutor applications are not active.
- Admin role data is modeled, but there is no admin UI or administrative API.
- Avatar uploads and object storage are not configured; profiles currently accept secure HTTPS image URLs.

These are intentional phase boundaries. The visible Bounty and Academy routes explain their state rather than offering inert actions.