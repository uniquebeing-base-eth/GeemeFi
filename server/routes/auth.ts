import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { AppDatabase } from '../db.ts';
import {
  clearSessionCookie,
  createSession,
  hashPassword,
  optionalAuthentication,
  publicUser,
  removeSession,
  sameOrigin,
  setSessionCookie,
  userFromResponse,
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

type AuthRouterOptions = { database: AppDatabase };

export function createAuthRouter({ database }: AuthRouterOptions): Router {
  const router = Router();
  const attempts = new Map<string, { count: number; resetAt: number }>();
  router.use(sameOrigin);
  router.use((request, response, next) => {
    if (request.method === 'POST' && ['/register', '/login'].includes(request.path)) {
      const key = request.ip ?? 'unknown';
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

  router.get('/me', optionalAuthentication(database), (request, response) => {
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
      const createUser = database.transaction(() => {
        database.prepare(`INSERT INTO users (id, username, display_name, email, password_hash)
          VALUES (?, ?, ?, ?, ?)`).run(userId, input.username, input.displayName, input.email, passwordHash);
        database.prepare('INSERT INTO profile_settings (user_id) VALUES (?)').run(userId);
        database.prepare('INSERT INTO wallet_accounts (user_id) VALUES (?)').run(userId);
        database.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id)
          VALUES (?, ?, ?, ?, ?)').run(randomUUID(), userId, 'account.created', 'user', userId);
      });
      createUser();
      const token = createSession(database, userId);
      setSessionCookie(response, token);
      const row = database.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      response.status(201).json({ user: publicUser(row as Parameters<typeof publicUser>[0]) });
    } catch (error) {
      if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
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

    const row = database.prepare('SELECT * FROM users WHERE email = ?')
      .get(parsed.data.email) as (Parameters<typeof publicUser>[0] & { password_hash: string; status: string }) | undefined;
    const valid = row ? await verifyPassword(parsed.data.password, row.password_hash) : false;
    if (!row || !valid || row.status !== 'active') {
      response.status(401).json({ error: 'That email and password combination did not work.' });
      return;
    }

    setSessionCookie(response, createSession(database, row.id));
    response.json({ user: publicUser(row) });
  });

  router.post('/logout', (request, response) => {
    removeSession(database, request);
    clearSessionCookie(response);
    response.json({ ok: true });
  });

  router.get('/session', optionalAuthentication(database), (request, response) => {
    response.json({ user: response.locals.user ?? null });
  });

  return router;
}

export { registerSchema, loginSchema };