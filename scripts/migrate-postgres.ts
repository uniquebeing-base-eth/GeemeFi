import 'dotenv/config';
import { createDatabase, runMigrations } from '../server/db.ts';

const database = createDatabase();
try {
  await runMigrations(database);
  console.log('PostgreSQL migrations are up to date.');
} finally {
  await database.close();
}
