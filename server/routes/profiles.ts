import { Router } from 'express';
import { z } from 'zod';
import type { AppDatabase } from '../db.ts';
import { optionalAuthentication, requireAuthentication, sameOrigin, userFromResponse } from '../security.ts';

const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
  bio: z.string().trim().max(240),
  avatarUrl: z.union([z.literal(''), z.string().url().max(500).refine((value) => value.startsWith('https://'))]),
});

export function createProfileRouter(database: AppDatabase): Router {
  const router = Router();
  router.use(optionalAuthentication(database));

  router.get('/me', requireAuthentication, (_request, response) => {
    response.json({ user: userFromResponse(response) });
  });

  router.get('/users', (request, response) => {
    const query = typeof request.query.q === 'string' ? request.query.q.trim().slice(0, 40) : '';
    const currentUserId = response.locals.user?.id ?? '';
    const users = database.prepare(`SELECT id, username, display_name, avatar_url, bio,
      verification_status, created_at FROM users
      WHERE status = 'active' AND id <> ? AND (? = '' OR username LIKE ? OR display_name LIKE ?)
      ORDER BY created_at DESC LIMIT 30`).all(currentUserId, query, `%${query}%`, `%${query}%`);
    response.json({ members: users.map((entry) => {
      const member = entry as {
        id: string; username: string; display_name: string; avatar_url: string | null;
        bio: string; verification_status: string; created_at: string;
      };
      return {
        id: member.id,
        username: member.username,
        displayName: member.display_name,
        avatarUrl: member.avatar_url,
        bio: member.bio,
        verificationStatus: member.verification_status,
        createdAt: member.created_at,
      };
    }) });
  });

  router.patch('/me', sameOrigin, requireAuthentication, (request, response) => {
    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check your profile details.' });
      return;
    }

    const user = userFromResponse(response);
    database.prepare(`UPDATE users SET display_name = ?, bio = ?, avatar_url = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`)
      .run(parsed.data.displayName, parsed.data.bio, parsed.data.avatarUrl || null, user.id);
    database.prepare(`INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id)
      VALUES (?, ?, ?, ?, ?)`).run(crypto.randomUUID(), user.id, 'profile.updated', 'user', user.id);
    const updated = database.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as Parameters<typeof userFromResponse>[0];
    response.json({ user: {
      ...user,
      displayName: (updated as unknown as { display_name: string }).display_name,
      bio: (updated as unknown as { bio: string }).bio,
      avatarUrl: (updated as unknown as { avatar_url: string | null }).avatar_url,
    } });
  });

  router.get('/users/:username', (request, response) => {
    const user = database.prepare(`SELECT id, username, display_name, avatar_url, bio,
      verification_status, created_at FROM users WHERE username = ? COLLATE NOCASE AND status = 'active'`)
      .get(request.params.username) as {
        id: string; username: string; display_name: string; avatar_url: string | null;
        bio: string; verification_status: string; created_at: string;
      } | undefined;
    if (!user) {
      response.status(404).json({ error: 'We could not find that profile.' });
      return;
    }
    const counts = database.prepare(`SELECT
      (SELECT COUNT(*) FROM follows WHERE followed_id = ?) AS followers,
      (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following,
      (SELECT COUNT(*) FROM posts WHERE author_id = ?) AS posts`).get(user.id, user.id, user.id) as {
        followers: number; following: number; posts: number;
      };
    response.json({ profile: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      bio: user.bio,
      verificationStatus: user.verification_status,
      createdAt: user.created_at,
      ...counts,
    } });
  });

  router.get('/me/wallet', requireAuthentication, (_request, response) => {
    const user = userFromResponse(response);
    const wallet = database.prepare(`SELECT balance_units, received_units, given_units
      FROM wallet_accounts WHERE user_id = ?`).get(user.id) as {
        balance_units: number; received_units: number; given_units: number;
      };
    response.json({
      balance: wallet.balance_units / 1_000_000,
      received: wallet.received_units / 1_000_000,
      given: wallet.given_units / 1_000_000,
      allowance: null,
      transactions: [],
    });
  });

  return router;
}

export { updateProfileSchema };