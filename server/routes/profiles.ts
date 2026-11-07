import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { AppDatabase } from '../db.ts';
import {
  optionalAuthentication, requireActiveAccount, requireAuthentication, sameOrigin, userFromResponse,
} from '../security.ts';

const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
  bio: z.string().trim().max(240),
  avatarUrl: z.union([z.literal(''), z.string().url().max(500).refine((value) => value.startsWith('https://'))]),
});

function isoDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function createProfileRouter(database: AppDatabase): Router {
  const router = Router();
  router.use(optionalAuthentication(database));

  router.get('/me', requireAuthentication, requireActiveAccount, (_request, response) => {
    response.json({ user: userFromResponse(response) });
  });

  router.get('/users', async (request, response) => {
    const query = typeof request.query.q === 'string' ? request.query.q.trim().slice(0, 40) : '';
    const currentUserId = response.locals.user?.id ?? '';
    const { rows } = await database.query(`SELECT users.id, users.username, users.display_name, users.avatar_url, users.bio,
      users.verification_status, users.created_at FROM users
      JOIN profile_settings ON profile_settings.user_id = users.id
      WHERE users.status = 'active' AND users.account_status = 'active'
      AND profile_settings.discoverable = TRUE AND users.id <> $1
      AND ($2 = '' OR users.username ILIKE $3 OR users.display_name ILIKE $3)
      ORDER BY users.created_at DESC LIMIT 30`, [currentUserId, query, `%${query}%`]);
    response.json({ members: rows.map((member) => ({
      id: member.id,
      username: member.username,
      displayName: member.display_name,
      avatarUrl: member.avatar_url,
      bio: member.bio,
      verificationStatus: member.verification_status,
      createdAt: isoDate(member.created_at),
    })) });
  });

  router.patch('/me', sameOrigin, requireAuthentication, requireActiveAccount, async (request, response) => {
    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check your profile details.' });
      return;
    }

    const user = userFromResponse(response);
    const updated = await database.transaction(async (client) => {
      await client.query(`UPDATE users SET display_name = $1, bio = $2, avatar_url = $3,
        updated_at = now() WHERE id = $4`,
      [parsed.data.displayName, parsed.data.bio, parsed.data.avatarUrl || null, user.id]);
      await client.query(`INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id)
        VALUES ($1, $2, $3, $4, $5)`, [randomUUID(), user.id, 'profile.updated', 'user', user.id]);
      const { rows } = await client.query('SELECT * FROM users WHERE id = $1', [user.id]);
      return rows[0] as {
        id: string; username: string; display_name: string; email: string; avatar_url: string | null;
        bio: string; wallet_address: string | null; status: string; role: string;
        verification_status: string; created_at: string | Date;
      };
    });
    response.json({ user: {
      id: updated.id,
      username: updated.username,
      displayName: updated.display_name,
      email: updated.email,
      avatarUrl: updated.avatar_url,
      bio: updated.bio,
      walletAddress: user.walletAddress,
      status: updated.status,
      role: updated.role,
      verificationStatus: updated.verification_status,
      createdAt: isoDate(updated.created_at),
    } });
  });

  router.get('/users/:username', async (request, response) => {
    const { rows } = await database.query(`SELECT users.id, users.username, users.display_name, users.avatar_url, users.bio,
      users.verification_status, users.created_at FROM users
      JOIN profile_settings ON profile_settings.user_id = users.id
      WHERE lower(users.username) = lower($1) AND users.status = 'active'
      AND users.account_status = 'active'
      AND profile_settings.discoverable = TRUE`,
    [request.params.username]);
    const user = rows[0] as {
      id: string; username: string; display_name: string; avatar_url: string | null;
      bio: string; verification_status: string; created_at: string | Date;
    } | undefined;
    if (!user) {
      response.status(404).json({ error: 'We could not find that profile.' });
      return;
    }
    const { rows: countRows } = await database.query(`SELECT
      (SELECT COUNT(*)::int FROM follows WHERE followed_id = $1) AS followers,
      (SELECT COUNT(*)::int FROM follows WHERE follower_id = $1) AS following,
      (SELECT COUNT(*)::int FROM posts WHERE author_id = $1) AS posts`, [user.id]);
    response.json({ profile: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      bio: user.bio,
      verificationStatus: user.verification_status,
      createdAt: isoDate(user.created_at),
      ...countRows[0],
    } });
  });

  router.get('/me/wallet', requireAuthentication, requireActiveAccount, async (_request, response) => {
    const user = userFromResponse(response);
    const { rows } = await database.withUser(user.id, (client) => client.query(`SELECT balance_units, received_units, given_units,
      provisioning_status
      FROM wallet_accounts WHERE user_id = $1`, [user.id]));
    const wallet = rows[0] as {
      balance_units: string | number; received_units: string | number; given_units: string | number;
      provisioning_status: 'pending' | 'provisioning' | 'provisioned' | 'failed';
    };
    response.json({
      balance: null,
      received: null,
      given: null,
      allowance: null,
      transactions: [],
      provisioningStatus: wallet.provisioning_status,
      network: 'celo-sepolia',
    });
  });

  return router;
}

export { updateProfileSchema };
