import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type AppDatabase = Database.Database;

export function createDatabase(databasePath: string): AppDatabase {
  if (databasePath !== ':memory:') {
    const absolutePath = resolve(databasePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    databasePath = absolutePath;
  }

  const database = new Database(databasePath);
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');

  database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`);
  const migrationsPath = fileURLToPath(new URL('./migrations/', import.meta.url));
  const appliedMigrations = new Set((database.prepare('SELECT name FROM schema_migrations').all() as Array<{ name: string }>).map(({ name }) => name));
  const existingTables = new Set((database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(({ name }) => name));
  const migrationNames = readdirSync(migrationsPath).filter((name) => name.endsWith('.sql')).sort();

  for (const name of migrationNames) {
    if (appliedMigrations.has(name)) continue;

    const foundationTables = [
      'users', 'profile_settings', 'sessions', 'posts', 'media', 'follows', 'likes', 'comments',
      'notifications', 'wallet_accounts', 'wallet_transactions', 'activity', 'moderation_reports', 'audit_logs',
    ];
    if (name === '001_foundation.sql' && foundationTables.every((table) => existingTables.has(table))) {
      database.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
      continue;
    }

    const sql = readFileSync(resolve(migrationsPath, name), 'utf8');
    database.transaction(() => {
      database.exec(sql);
      database.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
    })();
  }

  return database;
}