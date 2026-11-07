import assert from 'node:assert/strict';
import { once } from 'node:events';
import { afterEach, test } from 'node:test';
import express from 'express';
import { createDatabase } from '../server/db.ts';
import { createAuthRouter } from '../server/routes/auth.ts';
import { createProfileRouter } from '../server/routes/profiles.ts';

const servers: Array<{ close: (callback: (error?: Error) => void) => void; database: ReturnType<typeof createDatabase> }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(({ close, database }) => new Promise<void>((resolve, reject) => {
    close((error) => {
      database.close();
      if (error) reject(error);
      else resolve();
    });
  })));
});

test('accounts persist securely and profile edits require an active session', async () => {
  const database = createDatabase(':memory:');
  assert.deepEqual(database.prepare('SELECT name FROM schema_migrations').all(), [{ name: '001_foundation.sql' }]);
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter({ database }));
  app.use('/api', createProfileRouter(database));
  const server = app.listen(0);
  servers.push({ close: (callback) => server.close(callback), database });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}/api`;

  const blocked = await fetch(`${baseUrl}/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Gee', bio: '', avatarUrl: '' }),
  });
  assert.equal(blocked.status, 401);

  const registration = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Ada Gee', username: 'ada_gee', email: 'Ada@example.com', password: 'a-secure-passphrase' }),
  });
  assert.equal(registration.status, 201);
  const cookie = registration.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  const account = await registration.json() as { user: { username: string; email: string } };
  assert.equal(account.user.username, 'ada_gee');
  assert.equal(account.user.email, 'ada@example.com');

  const update = await fetch(`${baseUrl}/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ displayName: 'Ada Builds', bio: 'Learning out loud.', avatarUrl: '' }),
  });
  assert.equal(update.status, 200);
  const updated = await update.json() as { user: { displayName: string; bio: string } };
  assert.equal(updated.user.displayName, 'Ada Builds');
  assert.equal(updated.user.bio, 'Learning out loud.');

  const publicProfileResponse = await fetch(`${baseUrl}/users/ada_gee`);
  assert.equal(publicProfileResponse.status, 200);
  const publicProfile = await publicProfileResponse.json() as { profile: Record<string, unknown> };
  assert.equal(publicProfile.profile.displayName, 'Ada Builds');
  assert.equal('email' in publicProfile.profile, false);

  const registeredUser = database.prepare('SELECT id FROM users WHERE username = ?').get('ada_gee') as { id: string };
  database.prepare('UPDATE profile_settings SET discoverable = 0 WHERE user_id = ?').run(registeredUser.id);
  const privateProfileResponse = await fetch(`${baseUrl}/users/ada_gee`);
  assert.equal(privateProfileResponse.status, 404);

  const wallet = await fetch(`${baseUrl}/me/wallet`, { headers: { Cookie: cookie } });
  assert.equal(wallet.status, 200);
  const walletData = await wallet.json() as { balance: number; allowance: null };
  assert.equal(walletData.balance, 0);
  assert.equal(walletData.allowance, null);
});