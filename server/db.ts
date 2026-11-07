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

export async function runMigrations(database: AppDatabase): Promise<void> {
  await database.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const migrationPath = fileURLToPath(new URL('./migrations/postgres/', import.meta.url));
  const migrationNames = (await readdir(migrationPath)).filter((name) => name.endsWith('.sql')).sort();

  for (const name of migrationNames) {
    const applied = await database.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
    if (applied.rowCount) continue;

    const sql = await readFile(resolve(migrationPath, name), 'utf8');
    await database.transaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    });
  }
}

export type { QueryResult };
