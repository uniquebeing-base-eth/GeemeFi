import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { afterEach, test } from 'node:test';
import express from 'express';
import { assertMigrationsCurrent, createDatabase, runMigrations, type AppDatabase } from '../server/db.ts';
import { createAuthRouter } from '../server/routes/auth.ts';
import { createProfileRouter } from '../server/routes/profiles.ts';
import { createWalletRouter } from '../server/routes/wallets.ts';

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const servers: Array<{ close: () => Promise<void>; database: AppDatabase }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async ({ close, database }) => {
    await close();
    await database.close();
  }));
});

test('accounts persist securely and profile edits require an active session', { skip: !connectionString }, async () => {
  const database = createDatabase(connectionString);
  let verificationToken = '';
  let resetToken = '';
  let failedUserId = '';
  let failedUserProvisionAttempts = 0;
  let successfulProvisionCount = 0;
  const provisionWallet = async (userId: string) => {
    if (userId === failedUserId) {
      failedUserProvisionAttempts += 1;
      if (failedUserProvisionAttempts === 1) throw new Error('Temporary provider outage.');
    }
    successfulProvisionCount += 1;
    return `0x${userId.replaceAll('-', '').slice(0, 40)}`;
  };
  servers.push({
    close: async () => {},
    database,
  });
  await runMigrations(database);
  await assertMigrationsCurrent(database);
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter({
    database,
    email: {
      sendVerification: async ({ token }) => { verificationToken = token; },
      sendPasswordReset: async ({ token }) => { resetToken = token; },
    },
    provisionWallet,
  }));
  app.use('/api', createProfileRouter(database));
  app.use('/api', createWalletRouter({ database, provisionWallet }));
  const server = app.listen(0);
  servers[servers.length - 1].close = () => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}/api`;
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const username = `test_${suffix}`;
  const email = `${suffix}@example.test`;

  const blocked = await fetch(`${baseUrl}/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Gee', bio: '', avatarUrl: '' }),
  });
  assert.equal(blocked.status, 401);

  const registration = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Ada Gee', username, email, password: 'a-secure-passphrase' }),
  });
  assert.equal(registration.status, 201);
  assert.equal(registration.headers.get('set-cookie'), null);
  assert.deepEqual(await registration.json(), { verificationRequired: true });
  assert.equal(successfulProvisionCount, 0);
  const { rows: registeredRows } = await database.query<{ id: string; account_status: string }>(
    'SELECT id, account_status FROM users WHERE username = $1', [username]);
  assert.equal(registeredRows[0].account_status, 'pending_email_verification');
  const registeredWallet = await database.withUser(registeredRows[0].id, (client) => client.query<{
    provisioning_status: string;
    smart_wallet_address: string | null;
  }>('SELECT provisioning_status, smart_wallet_address FROM wallet_accounts WHERE user_id = $1', [registeredRows[0].id]));
  assert.equal(registeredWallet.rows[0].provisioning_status, 'pending');
  assert.equal(registeredWallet.rows[0].smart_wallet_address, null);

  const firstVerificationToken = verificationToken;
  const unverifiedLogin = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'a-secure-passphrase' }),
  });
  assert.equal(unverifiedLogin.status, 403);
  const resendVerification = await fetch(`${baseUrl}/auth/resend-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  assert.equal(resendVerification.status, 202);
  assert.notEqual(verificationToken, firstVerificationToken);
  const replacedVerification = await fetch(`${baseUrl}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: firstVerificationToken }),
  });
  assert.equal(replacedVerification.status, 400);

  const verified = await fetch(`${baseUrl}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: verificationToken }),
  });
  assert.equal(verified.status, 200);
  const verificationResult = await verified.json() as {
    user: { accountStatus: string; emailVerified: boolean; walletAddress: string | null };
  };
  assert.equal(verificationResult.user.emailVerified, true);
  assert.equal(verificationResult.user.accountStatus, 'active');
  assert.match(verificationResult.user.walletAddress ?? '', /^0x[a-f0-9]{40}$/);
  assert.equal(successfulProvisionCount, 1);
  const verifiedCookie = verified.headers.get('set-cookie')?.split(';')[0];
  assert.ok(verifiedCookie);
  const reusedVerification = await fetch(`${baseUrl}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: verificationToken }),
  });
  assert.equal(reusedVerification.status, 400);

  const retryWallet = await fetch(`${baseUrl}/me/wallet/provision`, {
    method: 'POST',
    headers: { Cookie: verifiedCookie },
  });
  assert.equal(retryWallet.status, 200);
  const retryWalletResult = await retryWallet.json() as {
    user: { accountStatus: string; walletAddress: string | null };
  };
  assert.equal(retryWalletResult.user.walletAddress, verificationResult.user.walletAddress);
  assert.equal(successfulProvisionCount, 1);

  const login = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'a-secure-passphrase' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);

  const update = await fetch(`${baseUrl}/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ displayName: 'Ada Builds', bio: 'Learning out loud.', avatarUrl: '' }),
  });
  assert.equal(update.status, 200);
  const updated = await update.json() as { user: { displayName: string; bio: string } };
  assert.equal(updated.user.displayName, 'Ada Builds');
  assert.equal(updated.user.bio, 'Learning out loud.');

  const publicProfileResponse = await fetch(`${baseUrl}/users/${username}`);
  assert.equal(publicProfileResponse.status, 200);
  const publicProfile = await publicProfileResponse.json() as { profile: Record<string, unknown> };
  assert.equal(publicProfile.profile.displayName, 'Ada Builds');
  assert.equal('email' in publicProfile.profile, false);

  const { rows } = await database.query<{ id: string }>('SELECT id FROM users WHERE username = $1', [username]);
  await database.query('UPDATE profile_settings SET discoverable = FALSE WHERE user_id = $1', [rows[0].id]);
  const privateProfileResponse = await fetch(`${baseUrl}/users/${username}`);
  assert.equal(privateProfileResponse.status, 404);

  const wallet = await fetch(`${baseUrl}/me/wallet`, { headers: { Cookie: cookie } });
  assert.equal(wallet.status, 200);
  const walletData = await wallet.json() as { balance: number; allowance: null };
  assert.equal(walletData.balance, 0);
  assert.equal(walletData.allowance, null);
  const otherUserWallet = await database.withUser(randomUUID(), (client) => client.query(
    'SELECT user_id FROM wallet_accounts WHERE user_id = $1', [rows[0].id]));
  const { rows: roleRows } = await database.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
    'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
  if (!roleRows[0].rolsuper && !roleRows[0].rolbypassrls) assert.equal(otherUserWallet.rowCount, 0);

  const retryEmail = `retry_${suffix}@example.test`;
  const retryRegister = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: 'Retry Gee', username: `retry_${suffix}`, email: retryEmail, password: 'a-secure-passphrase',
    }),
  });
  assert.equal(retryRegister.status, 201);
  const { rows: retryUsers } = await database.query<{ id: string }>(
    'SELECT id FROM users WHERE lower(email) = $1', [retryEmail]);
  failedUserId = retryUsers[0].id;
  const failedVerification = await fetch(`${baseUrl}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: verificationToken }),
  });
  assert.equal(failedVerification.status, 200);
  const failedVerificationResult = await failedVerification.json() as {
    user: { accountStatus: string; walletProvisioningStatus: string; walletAddress: string | null };
  };
  assert.equal(failedVerificationResult.user.accountStatus, 'wallet_provisioning_failed');
  assert.equal(failedVerificationResult.user.walletProvisioningStatus, 'failed');
  assert.equal(failedVerificationResult.user.walletAddress, null);
  const failedUserCookie = failedVerification.headers.get('set-cookie')?.split(';')[0];
  assert.ok(failedUserCookie);
  const incompleteProfile = await fetch(`${baseUrl}/me`, { headers: { Cookie: failedUserCookie } });
  assert.equal(incompleteProfile.status, 403);
  const retriedProvisioning = await fetch(`${baseUrl}/me/wallet/provision`, {
    method: 'POST',
    headers: { Cookie: failedUserCookie },
  });
  assert.equal(retriedProvisioning.status, 200);
  const retriedProvisioningResult = await retriedProvisioning.json() as {
    user: { accountStatus: string; walletAddress: string | null };
  };
  assert.equal(retriedProvisioningResult.user.accountStatus, 'active');
  assert.match(retriedProvisioningResult.user.walletAddress ?? '', /^0x[a-f0-9]{40}$/);
  assert.equal(failedUserProvisionAttempts, 2);
  const retryLogin = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: retryEmail, password: 'a-secure-passphrase' }),
  });
  assert.equal(retryLogin.status, 200);
  const retryLoginResult = await retryLogin.json() as { user: { walletAddress: string | null; accountStatus: string } };
  assert.equal(retryLoginResult.user.accountStatus, 'active');
  assert.equal(retryLoginResult.user.walletAddress, retriedProvisioningResult.user.walletAddress);

  const forgotPassword = await fetch(`${baseUrl}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  assert.equal(forgotPassword.status, 202);
  const firstResetToken = resetToken;
  const secondForgotPassword = await fetch(`${baseUrl}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  assert.equal(secondForgotPassword.status, 202);
  assert.notEqual(resetToken, firstResetToken);
  const replacedReset = await fetch(`${baseUrl}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: firstResetToken, password: 'a-new-secure-passphrase' }),
  });
  assert.equal(replacedReset.status, 400);
  const resetPassword = await fetch(`${baseUrl}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: resetToken, password: 'a-new-secure-passphrase' }),
  });
  assert.equal(resetPassword.status, 200);
  const reusedReset = await fetch(`${baseUrl}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: resetToken, password: 'a-new-secure-passphrase' }),
  });
  assert.equal(reusedReset.status, 400);

  const oldSession = await fetch(`${baseUrl}/me`, { headers: { Cookie: cookie } });
  assert.equal(oldSession.status, 401);
  const oldPasswordLogin = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'a-secure-passphrase' }),
  });
  assert.equal(oldPasswordLogin.status, 401);
  const newPasswordLogin = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'a-new-secure-passphrase' }),
  });
  assert.equal(newPasswordLogin.status, 200);
});
