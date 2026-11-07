# Architecture

## Runtime shape

The browser runs a React 19 single-page application with React Router. Vite serves it during development and builds static assets for production. Express hosts the `/api` endpoints and serves the production SPA. The API modules are separated by responsibility under `server/routes` so later product areas can be added without putting their rules into UI components.

SQLite is the initial persistence adapter. `server/db.ts` opens a private database and applies ordered SQL files from `server/migrations` inside transactions. `DATABASE_PATH` controls the file location. The schema is designed to keep user, profile, social, notification, wallet, moderation and audit records separate.

## Authentication and authorization

Registration validates and normalizes identity fields, hashes passwords with salted `scrypt`, and creates the user, profile settings and zeroed wallet in one database transaction. A random session token is sent only in an `HttpOnly`, `SameSite=Lax` cookie; only its SHA-256 hash is persisted. Protected API routes resolve the session server-side and reject missing, expired or suspended accounts. Profile changes and account creation are written to the audit table.

Public profile responses use explicit field selection and never return email, password hash or wallet address. Discovery and direct profile lookup both honor the profile's `discoverable` setting. SQLite is not directly reachable from the browser, so authorization boundaries currently live in the API. SQLite cannot provide row-level security. A PostgreSQL migration and independently tested RLS policies are required before a public multi-tenant deployment.

## Modules

| Module | Current responsibility | Future boundary |
| --- | --- | --- |
| Authentication | Registration, sign-in/out, sessions and auth guards | Email recovery/verification and external identity providers |
| Users and Profiles | Private profile editing and public discoverable views | Verification, profile settings, achievements |
| Social Feed | Tables for posts, media, follows, likes and comments | Feed ranking, uploads, moderation and interactions |
| Notifications | User-scoped notification records | Delivery, read state and preferences |
| Wallet | Zeroed account data and private summary | Verified chain indexer/transaction service; never trust browser balances |
| Tips and Gifts | Not active | Allowance accounting and secured settlement |
| Bounties and Academy | Informational routes only | Separate opportunity, course and reward workflows |
| Admin | Member role field and moderation data | Role-gated operations API and admin interface |

## API surface

- `GET /api/health`: liveness check.
- `GET /api/auth/me`: current session or `null`.
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`.
- `GET /api/me`: authenticated user's profile.
- `PATCH /api/me`: validate and persist profile edits.
- `GET /api/users?q=...`, `GET /api/users/:username`: discoverable, privacy-safe public profiles.
- `GET /api/me/wallet`: server-owned wallet summary; allowance is `null` until a real allocation service exists.

## Production constraints

The included SQLite adapter is appropriate for local development or a single persistent Node instance. It is not a distributed database. Before horizontal scaling, introduce a PostgreSQL-backed repository/adapter, RLS policies, shared session and rate-limit storage, managed media storage, and operational backups. Deploy behind HTTPS and ensure proxy trust is configured correctly before relying on secure cookies.