# PostgreSQL migration status

## Status

The application runtime and migrations now target PostgreSQL. The SQLite copy command is implemented, but no production PostgreSQL cutover was performed in this workspace because `DATABASE_URL` is not configured. Do not treat this report as confirmation that SQLite records have been imported into a production database.

The repository already contained a SQLite backup made before this code change:

- `data/backups/geemifi-pre-postgresql-20261107.sqlite`
- `data/backups/geemifi-pre-postgresql-20261107.sqlite-shm`
- `data/backups/geemifi-pre-postgresql-20261107.sqlite-wal`

The current SQLite file and that backup each contain one user, one profile-settings row, one wallet-account row and one audit-log row. The backup also contains one session row; the current database has no session rows. No user identifiers or profile contents are included in this report. These counts are observations only, not a successful migration result.

## Performing the cutover

1. Take a separately retained PostgreSQL backup and confirm the target is the intended empty database.
2. Set `DATABASE_URL` for the PostgreSQL target and `SQLITE_SOURCE_PATH` to the legacy SQLite file.
3. Use a migration-capable PostgreSQL role and run:

   ```sh
   npm run db:migrate:sqlite
   ```

4. Retain the generated `data/backups/geemifi-pre-postgresql-<timestamp>.sqlite` file. SQLite's backup API creates a consistent snapshot including committed WAL content while leaving the source database untouched.
5. Review the command's row-count report and independently verify the imported application data before switching production traffic to the PostgreSQL runtime role.

The copy command runs SQLite integrity and foreign-key checks, applies the PostgreSQL schema transactionally, refuses to merge into any populated application table, preserves source IDs and relationships, and verifies per-table row counts after import. A failed copy leaves PostgreSQL transaction data rolled back; the SQLite source and generated backup remain available.

## Runtime configuration

Set `DATABASE_URL` to a least-privilege application role. Do not run the app with a database superuser, table owner, or role with `BYPASSRLS`; wallet tables enforce row-level security using a transaction-local user ID. Apply migrations separately with `npm run db:migrate` using a role authorized to create and alter the schema.

## Validation boundary

The migration command's integrity checks and row-count comparisons are implemented, but have not yet been run against the existing SQLite source and a configured PostgreSQL target. A disposable PostgreSQL integration test can validate schema and route behavior without moving the real database.
