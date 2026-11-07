import 'dotenv/config';
import Database from 'better-sqlite3';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createDatabase, runMigrations } from '../server/db.ts';

const tables = [
  'users',
  'profile_settings',
  'sessions',
  'posts',
  'follows',
  'likes',
  'comments',
  'media',
  'notifications',
  'wallet_accounts',
  'wallet_transactions',
  'activity',
  'moderation_reports',
  'audit_logs',
] as const;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL must point to the PostgreSQL migration target.');

  const sourcePath = resolve(process.env.SQLITE_SOURCE_PATH ?? './data/geemifi.sqlite');
  const sourceInfo = await stat(sourcePath).catch(() => undefined);
  if (!sourceInfo?.isFile()) throw new Error(`SQLite source database does not exist: ${sourcePath}`);

  const backupDirectory = resolve(dirname(sourcePath), 'backups');
  await mkdir(backupDirectory, { recursive: true });
  const backupName = `geemifi-pre-postgresql-${new Date().toISOString().replaceAll(/[:.]/g, '-')}.sqlite`;
  const backupPath = resolve(backupDirectory, backupName);

  const source = new Database(sourcePath);
  let backup: Database.Database | undefined;
  const database = createDatabase(connectionString);
  try {
    const integrity = source.pragma('integrity_check') as Array<{ integrity_check: string }>;
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
      throw new Error('SQLite integrity check failed; migration was not started.');
    }
    const foreignKeyViolations = source.pragma('foreign_key_check') as Array<Record<string, unknown>>;
    if (foreignKeyViolations.length) {
      throw new Error(`SQLite contains ${foreignKeyViolations.length} foreign-key violations; migration was not started.`);
    }

    await source.backup(backupPath);
    backup = new Database(backupPath, { readonly: true, fileMustExist: true });
    const backupIntegrity = backup.pragma('integrity_check') as Array<{ integrity_check: string }>;
    if (backupIntegrity.length !== 1 || backupIntegrity[0].integrity_check !== 'ok') {
      throw new Error('The SQLite backup did not pass its integrity check.');
    }

    await runMigrations(database);
    for (const table of tables) {
      const { rows } = await database.query<{ count: string }>(`SELECT count(*)::text AS count FROM "${table}"`);
      if (rows[0].count !== '0') {
        throw new Error(`PostgreSQL table "${table}" is not empty; refusing to merge or overwrite existing data.`);
      }
    }

    const counts: Record<string, number> = {};
    await database.transaction(async (client) => {
      for (const table of tables) {
        const sourceRows = backup!.prepare(`SELECT * FROM "${table}"`).all() as Array<Record<string, unknown>>;
        counts[table] = sourceRows.length;
        if (!sourceRows.length) continue;

        const columns = Object.keys(sourceRows[0]);
        if (table === 'users') columns.push('email_verified_at');
        const columnList = columns.map((column) => `"${column}"`).join(', ');
        for (const row of sourceRows) {
          if (table === 'wallet_accounts' || table === 'wallet_transactions') {
            await client.query("SELECT set_config('geemifi.user_id', $1, true)", [row.user_id]);
          }
          const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
          const values = columns.map((column) => {
            const value = column === 'email_verified_at' ? row.created_at : row[column];
            if (table === 'profile_settings' && column === 'discoverable') return value === 1;
            if (table === 'notifications' && column === 'payload_json') return JSON.parse(String(value));
            return value;
          });
          await client.query(`INSERT INTO "${table}" (${columnList}) VALUES (${placeholders})`, values);
        }
      }
    });

    for (const table of tables) {
      const { rows } = await database.query<{ count: string }>(`SELECT count(*)::text AS count FROM "${table}"`);
      if (Number(rows[0].count) !== counts[table]) {
        throw new Error(`Post-migration row-count mismatch for "${table}".`);
      }
    }

    console.log(JSON.stringify({
      status: 'verified',
      backupPath,
      sourcePath,
      copiedRows: counts,
      integrityChecks: ['SQLite integrity', 'SQLite foreign keys', 'PostgreSQL row counts', 'PostgreSQL foreign keys'],
    }, null, 2));
  } finally {
    backup?.close();
    source.close();
    await database.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'PostgreSQL migration failed.');
  process.exitCode = 1;
});
