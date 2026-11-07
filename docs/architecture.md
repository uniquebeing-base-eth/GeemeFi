# Architecture

## Runtime shape

The browser runs a React 19 single-page application with React Router. Vite serves it during development and builds static assets for production. Express hosts the `/api` endpoints and serves the production SPA. The API modules are separated by responsibility under `server/routes` so later product areas can be added without putting their rules into UI components.

PostgreSQL is the application persistence layer. `server/db.ts` owns a pooled connection and exposes parameterized queries plus transaction-scoped helpers. Ordered SQL files under `server/migrations/postgres` are applied with `npm run db:migrate`; the app does not run schema changes on startup. `DATABASE_URL` configures the connection. `npm run db:migrate:sqlite` makes a consistent SQLite backup before copying legacy records into an empty PostgreSQL database.

## Authentication and authorization

Registration validates and normalizes identity fields, hashes passwords with salted `scrypt`, and creates the user, profile settings, zeroed wallet and hashed email-verification token in one database transaction. Sign-in remains blocked until the single-use 24-hour verification link is redeemed. Password reset uses a separate hashed, single-use, one-hour token and revokes existing sessions. A random session token is sent only in an `HttpOnly`, `SameSite=Lax` cookie; only its SHA-256 hash is persisted. Protected API routes resolve the session server-side and reject missing, expired or suspended accounts. Profile changes and account creation are written to the audit table.

Public profile responses use explicit field selection and never return email, password hash or wallet address. Discovery and direct profile lookup both honor the profile's `discoverable` setting. PostgreSQL is not directly reachable from the browser. Wallet-account and wallet-transaction rows enforce row-level security against the transaction-local `geemifi.user_id` setting. The production runtime role must not own these tables or have `BYPASSRLS`; schema migrations must use a separate migration-capable role.

## Modules

| Module | Current responsibility | Future boundary |
| --- | --- | --- |
| Authentication | Registration, email verification, password reset, sign-in/out, sessions and auth guards | Shared rate limiting and external identity providers |
| Users and Profiles | Private profile editing and public discoverable views | Verification, profile settings, achievements |
| Social Feed | Tables for posts, media, follows, likes and comments | Feed ranking, uploads, moderation and interactions |
| Notifications | User-scoped notification records | Delivery, read state and preferences |
| Wallet | Zeroed account data and private summary | Embedded smart-wallet provisioning, verified chain indexer/transaction service; never trust browser balances |
| Tips and Gifts | Not active | Allowance accounting and secured settlement |
| Bounties and Academy | Informational routes only | Separate opportunity, course and reward workflows |
| Admin | Member role field and moderation data | Role-gated operations API and admin interface |

## API surface

- `GET /api/health`: liveness check.
- `GET /api/auth/me`: current session or `null`.
- `POST /api/auth/register`, `POST /api/auth/verify-email`, `POST /api/auth/resend-verification`.
- `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`.
- `POST /api/auth/login`, `POST /api/auth/logout`.
- `GET /api/me`: authenticated user's profile.
- `PATCH /api/me`: validate and persist profile edits.
- `GET /api/users?q=...`, `GET /api/users/:username`: discoverable, privacy-safe public profiles.
- `GET /api/me/wallet`: server-owned wallet summary; allowance is `null` until a real allocation service exists.

## Production constraints

Use a PostgreSQL migration-capable role only for `npm run db:migrate`; run the service with a least-privilege role and `DATABASE_URL`. Before horizontal scaling, configure shared rate-limit storage, managed media storage, operational backups, and appropriate trusted-proxy settings for secure cookies.