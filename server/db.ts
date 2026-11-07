import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type QueryResult, type QueryResultRow } from 'pg';

export type Queryable = {
  query<Row extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<Row>>;
};

export type AppDatabase = Queryable & {
  transaction<T>(callback: (database: Queryable) => Promise<T>, userId?: string): Promise<T>;
  withUser<T>(userId: string, callback: (database: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

class PostgresDatabase implements AppDatabase {
  constructor(private readonly pool: Pool) {}

  query<Row extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<Row>> {
    return this.pool.query<Row>(sql, values);
  }

  async transaction<T>(callback: (database: Queryable) => Promise<T>, userId?: string): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (userId) await client.query("SELECT set_config('geemifi.user_id', $1, true)", [userId]);
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  withUser<T>(userId: string, callback: (database: Queryable) => Promise<T>): Promise<T> {
    return this.transaction(callback, userId);
  }

  close(): Promise<void> {
    return this.pool.end();
  }
}

export function createDatabase(connectionString = process.env.DATABASE_URL): AppDatabase {
  if (!connectionString) {
    throw new Error('DATABASE_URL must be configured to use PostgreSQL.');
  }
  return new PostgresDatabase(new Pool({ connectionString }));
}

async function migrationNames(): Promise<string[]> {
  const migrationPath = fileURLToPath(new URL('./migrations/postgres/', import.meta.url));
  return (await readdir(migrationPath)).filter((name) => name.endsWith('.sql')).sort();
}

export async function runMigrations(database: AppDatabase): Promise<void> {
  const migrationTable = await database.query<{ name: string | null }>(
    "SELECT to_regclass('schema_migrations')::text AS name");
  if (!migrationTable.rows[0]?.name) {
    await database.query(`CREATE TABLE schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  }
  const migrationPath = fileURLToPath(new URL('./migrations/postgres/', import.meta.url));
  const names = await migrationNames();

  for (const name of names) {
    const applied = await database.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
    if (applied.rowCount) continue;

    const sql = await readFile(resolve(migrationPath, name), 'utf8');
    await database.transaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    });
  }
}

export async function assertMigrationsCurrent(database: Queryable): Promise<void> {
  const { rows: tableRows } = await database.query<{ name: string | null }>(
    "SELECT to_regclass('schema_migrations')::text AS name");
  if (!tableRows[0]?.name) {
    throw new Error('PostgreSQL schema is not initialized. Run npm run db:migrate before starting Geemifi.');
  }
  const { rows } = await database.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map(({ name }) => name));
  const pending = (await migrationNames()).filter((name) => !applied.has(name));
  if (pending.length) {
    throw new Error(`PostgreSQL migrations are pending (${pending.join(', ')}). Run npm run db:migrate before starting Geemifi.`);
  }
}

export type { QueryResult };
