import { randomBytes, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { AppDatabase } from '../db.ts';
import { provisionEmbeddedWallet, type WalletProvisioner } from '../embedded-wallet.ts';
import { sendPasswordResetEmail, sendVerificationEmail } from '../email.ts';
import {
  clearSessionCookie,
  createSession,
  hashPassword,
  hashSessionToken,
  loadPublicUser,
  optionalAuthentication,
  removeSession,
  sameOrigin,
  setSessionCookie,
  verifyPassword,
} from '../security.ts';

const registerSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

const emailSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
});
const tokenSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });
const resetPasswordSchema = tokenSchema.extend({ password: z.string().min(8).max(128) });

type AuthRouterOptions = {
  database: AppDatabase;
  email?: {
    sendVerification: typeof sendVerificationEmail;
    sendPasswordReset: typeof sendPasswordResetEmail;
  };
  provisionWallet?: WalletProvisioner;
};

export function createAuthRouter({ database, email = {
  sendVerification: sendVerificationEmail,
  sendPasswordReset: sendPasswordResetEmail,
}, provisionWallet }: AuthRouterOptions): Router {
  const router = Router();
  const attempts = new Map<string, { count: number; resetAt: number }>();
  router.use(sameOrigin);
  router.use((request, response, next) => {
    if (request.method === 'POST' && [
      '/register', '/login', '/verify-email', '/resend-verification', '/forgot-password', '/reset-password',
    ].includes(request.path)) {
      const key = `${request.ip ?? 'unknown'}:${request.path}`;
      const now = Date.now();
      const current = attempts.get(key);
      if (!current || current.resetAt <= now) {
        attempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
      } else if (current.count >= 10) {
        response.status(429).json({ error: 'Too many attempts. Please try again in a little while.' });
        return;
      } else {
        current.count += 1;
      }
    }
    next();
  });

  router.get('/me', optionalAuthentication(database), (_request, response) => {
    response.json({ user: response.locals.user ?? null });
  });

  router.post('/register', async (request, response, next) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check your details and try again.' });
      return;
    }

    const input = parsed.data;
    try {
      const userId = randomUUID();
      const passwordHash = await hashPassword(input.password);
      const verificationToken = randomBytes(32).toString('hex');
      await database.transaction(async (client) => {
        await client.query(`INSERT INTO users (id, username, display_name, email, password_hash)
          VALUES ($1, $2, $3, $4, $5)`, [userId, input.username, input.displayName, input.email, passwordHash]);
        await client.query('INSERT INTO profile_settings (user_id) VALUES ($1)', [userId]);
        await client.query('INSERT INTO wallet_accounts (user_id) VALUES ($1)', [userId]);
        await client.query(`INSERT INTO email_verification_tokens (token_hash, user_id, expires_at)
          VALUES ($1, $2, $3)`, [hashSessionToken(verificationToken), userId, new Date(Date.now() + 24 * 60 * 60 * 1000)]);
        await client.query(`INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id)
          VALUES ($1, $2, $3, $4, $5)`, [randomUUID(), userId, 'account.created', 'user', userId]);
      }, userId);
      try {
        await email.sendVerification({ email: input.email, displayName: input.displayName, token: verificationToken });
      } catch {
        response.status(503).json({
          error: 'Your account was created, but the verification email could not be sent. Please request another email.',
        });
        return;
      }
      response.status(201).json({ verificationRequired: true });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        response.status(409).json({ error: 'That email or username is already in use.' });
        return;
      }
      next(error);
    }
  });

  router.post('/login', async (request, response) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: 'Enter a valid email address and password.' });
      return;
    }

    const { rows } = await database.query(`SELECT * FROM users WHERE lower(email) = $1`,
      [parsed.data.email]);
    const row = rows[0] as (
      Parameters<typeof publicUser>[0] & {
        password_hash: string;
        status: string;
        email_verified_at: Date | null;
      }
    ) | undefined;
    const valid = row ? await verifyPassword(parsed.data.password, row.password_hash) : false;
    if (!row || !valid || row.status !== 'active') {
      response.status(401).json({ error: 'That email and password combination did not work.' });
      return;
    }
    if (!row.email_verified_at) {
      response.status(403).json({ error: 'Verify your email address before signing in.', verificationRequired: true });
      return;
    }

    setSessionCookie(response, await createSession(database, row.id));
    const user = await loadPublicUser(database, row.id);
    if (!user) {
      response.status(500).json({ error: 'Your account could not be loaded. Please try signing in again.' });
      return;
    }
    response.json({ user });
  });

  router.post('/verify-email', async (request, response) => {
    const parsed = tokenSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: 'This verification link is invalid or expired.' });
      return;
    }
    const userId = await database.transaction(async (client) => {
      const { rows } = await client.query<{ user_id: string }>(`DELETE FROM email_verification_tokens
        WHERE token_hash = $1 AND expires_at > now() RETURNING user_id`,
      [hashSessionToken(parsed.data.token)]);
      if (!rows[0]) return null;
      await client.query(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()),
        account_status = 'email_verified' WHERE id = $1`,
        [rows[0].user_id]);
      await client.query(`INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id)
        VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), rows[0].user_id, 'account.email_verified', 'user', rows[0].user_id]);
      return rows[0].user_id;
    });
    if (!userId) {
      response.status(400).json({ error: 'This verification link is invalid or expired.' });
      return;
    }
    try {
      await provisionEmbeddedWallet(database, userId, provisionWallet);
    } catch (error) {
      console.error('Embedded smart-wallet provisioning failed after email verification.',
        error instanceof Error ? error.message : 'Unknown error.');
    }
    setSessionCookie(response, await createSession(database, userId));
    const user = await loadPublicUser(database, userId);
    if (!user) {
      response.status(500).json({ error: 'Your account could not be loaded. Please try signing in again.' });
      return;
    }
    response.json({ ok: true, user });
  });

  router.post('/resend-verification', async (request, response) => {
    const parsed = emailSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }
    const { rows } = await database.query<{ id: string; display_name: string; email_verified_at: Date | null }>(
      'SELECT id, display_name, email_verified_at FROM users WHERE lower(email) = $1', [parsed.data.email]);
    if (rows[0] && !rows[0].email_verified_at) {
      const token = randomBytes(32).toString('hex');
      await database.transaction(async (client) => {
        await client.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [rows[0].id]);
        await client.query(`INSERT INTO email_verification_tokens (token_hash, user_id, expires_at)
          VALUES ($1, $2, $3)`, [hashSessionToken(token), rows[0].id, new Date(Date.now() + 24 * 60 * 60 * 1000)]);
      });
      try {
        await email.sendVerification({ email: parsed.data.email, displayName: rows[0].display_name, token });
      } catch {
        response.status(503).json({ error: 'The verification email could not be sent. Please try again later.' });
        return;
      }
    }
    response.status(202).json({ ok: true });
  });

  router.post('/forgot-password', async (request, response) => {
    const parsed = emailSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }
    const { rows } = await database.query<{ id: string; display_name: string }>(
      'SELECT id, display_name FROM users WHERE lower(email) = $1', [parsed.data.email]);
    if (rows[0]) {
      const token = randomBytes(32).toString('hex');
      await database.transaction(async (client) => {
        await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [rows[0].id]);
        await client.query(`INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
          VALUES ($1, $2, $3)`, [hashSessionToken(token), rows[0].id, new Date(Date.now() + 60 * 60 * 1000)]);
      });
      try {
        await email.sendPasswordReset({ email: parsed.data.email, displayName: rows[0].display_name, token });
      } catch (error) {
        console.error('Password-reset email delivery failed.', error instanceof Error ? error.message : 'Unknown delivery error.');
      }
    }
    response.status(202).json({ ok: true });
  });

  router.post('/reset-password', async (request, response) => {
    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: 'This reset link or password is invalid.' });
      return;
    }
    const passwordHash = await hashPassword(parsed.data.password);
    const reset = await database.transaction(async (client) => {
      const { rows } = await client.query<{ user_id: string }>(`DELETE FROM password_reset_tokens
        WHERE token_hash = $1 AND expires_at > now() RETURNING user_id`,
      [hashSessionToken(parsed.data.token)]);
      if (!rows[0]) return false;
      await client.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2',
        [passwordHash, rows[0].user_id]);
      await client.query('DELETE FROM sessions WHERE user_id = $1', [rows[0].user_id]);
      await client.query(`INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id)
        VALUES ($1, $2, $3, $4, $5)`, [randomUUID(), rows[0].user_id, 'account.password_reset', 'user', rows[0].user_id]);
      return true;
    });
    if (!reset) {
      response.status(400).json({ error: 'This reset link or password is invalid.' });
      return;
    }
    response.json({ ok: true });
  });

  router.post('/logout', async (request, response) => {
    await removeSession(database, request);
    clearSessionCookie(response);
    response.json({ ok: true });
  });

  router.get('/session', optionalAuthentication(database), (_request, response) => {
    response.json({ user: response.locals.user ?? null });
  });

  return router;
}

export { registerSchema, loginSchema, emailSchema, tokenSchema, resetPasswordSchema };