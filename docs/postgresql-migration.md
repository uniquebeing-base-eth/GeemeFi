# PostgreSQL migration status

## Status

The application runtime and migrations now target PostgreSQL. The SQLite copy command is implemented, but no production PostgreSQL cutover was performed in this workspace because `DATABASE_URL` is not configured. Do not treat this report as confirmation that SQLite records have been imported into a production database.

The repository already contained a SQLite backup made before this code change:

- `data/backups/geemifi-pre-postgresql-20261107.sqlite`
- `data/backups/geemifi-pre-postgresql-20261107.sqlite-shm`
- `data/backups/geemifi-pre-postgresql-20261107.sqlite-wal`

The current SQLite file and that backup each contain one user, one profile-settings row, one wallet-account row and one audit-log row. The backup also contains one session row; the current database has no session rows. No user identifiers or profile contents are included in this report. These counts are observations only, not a successful migration result.

## Performing the cutover

1. Pause application writes for the cutover window. This command takes a consistent snapshot, not continuous replication; writes after the snapshot must not be lost during traffic switching.
2. Take a separately retained PostgreSQL backup and confirm the target is the intended empty database.
3. Set `DATABASE_URL` for the PostgreSQL target and `SQLITE_SOURCE_PATH` to the legacy SQLite file.
4. Use a migration-capable PostgreSQL role and run:

   ```sh
   npm run db:migrate:sqlite
   ```

5. Retain the generated `data/backups/geemifi-pre-postgresql-<timestamp>.sqlite` file. SQLite's backup API creates a consistent snapshot including committed WAL content while leaving the source database untouched.
6. Review the command's row-count report and independently verify the imported application data before switching production traffic to the PostgreSQL runtime role.

The copy command runs SQLite integrity and foreign-key checks, applies the PostgreSQL schema transactionally, refuses to merge into any populated application table, preserves source IDs and relationships, and verifies per-table row counts after import. A failed copy leaves PostgreSQL transaction data rolled back; the SQLite source and generated backup remain available.

Legacy accounts are marked as email-verified at migration time using their original `created_at` value because the SQLite schema predates email verification. New registrations must complete the new single-use email-verification flow before sign-in.

## Runtime configuration

Set `DATABASE_URL` to a least-privilege application role. Do not run the app with a database superuser, table owner, or role with `BYPASSRLS`; wallet tables enforce row-level security using a transaction-local user ID. Apply migrations separately with `npm run db:migrate` using a role authorized to create and alter the schema. Grant the runtime role `CONNECT` on the database, `USAGE` on `public`, and `SELECT, INSERT, UPDATE, DELETE` on application tables, including `schema_migrations`; the runtime role must not own the tables. Configure matching default privileges for the migration role so later migrations keep the same access model.

## Validation boundary

Validation performed in a disposable PostgreSQL 16 instance:

- API integration test passed for registration, email verification, login, profile access, wallet RLS context, recovery, one-time token use and session revocation.
- Synthetic SQLite copy passed integrity checks and copied 2 users and related profile, session, social, notification, wallet, moderation and audit rows with matching PostgreSQL row counts. The legacy-account verification timestamp was present for both imported test users.
- The configured SQLite database was not copied to PostgreSQL. There is still no production `DATABASE_URL`, and delivery through the live Resend service was not tested.
