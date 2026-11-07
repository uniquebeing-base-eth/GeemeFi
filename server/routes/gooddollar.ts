import { Router } from 'express';
import type { AppDatabase } from '../db.ts';
import type { GoodDollarIdentityProvider } from '../gooddollar.ts';
import { optionalAuthentication, requireAuthentication, sameOrigin, userFromResponse } from '../security.ts';

type GoodDollarRouterOptions = {
  database: AppDatabase;
  identityProvider: GoodDollarIdentityProvider | null;
};

export function createGoodDollarRouter({ database, identityProvider }: GoodDollarRouterOptions): Router {
  const router = Router();
  router.use(optionalAuthentication(database));

  router.get('/me/gooddollar/verification', requireAuthentication, async (_request, response) => {
    const user = userFromResponse(response);
    const { rows } = await database.withUser(user.id, (client) => client.query<{
      verification_status: string; wallet_address: string | null;
    }>(
      `SELECT users.verification_status, wallet_accounts.smart_wallet_address AS wallet_address
        FROM users JOIN wallet_accounts ON wallet_accounts.user_id = users.id
        WHERE users.id = $1`,
      [user.id],
    ));
    if (!rows[0]) {
      response.status(404).json({ error: 'Your account could not be found.' });
      return;
    }
    response.json({
      status: rows[0].verification_status,
      walletProvisioned: Boolean(rows[0].wallet_address),
    });
  });

  router.post('/me/gooddollar/verification/start', sameOrigin, requireAuthentication, async (_request, response) => {
    const user = userFromResponse(response);
    if (!identityProvider) {
      response.status(503).json({ error: 'GoodDollar identity verification is disabled until its Celo Sepolia deployment is verified.' });
      return;
    }
    const { rows } = await database.withUser(user.id, (client) => client.query<{ smart_wallet_address: string | null }>(
      'SELECT smart_wallet_address FROM wallet_accounts WHERE user_id = $1',
      [user.id],
    ));
    const walletAddress = rows[0]?.smart_wallet_address;
    if (!walletAddress) {
      response.status(409).json({ error: 'Provision your embedded smart wallet before starting identity verification.' });
      return;
    }
    const callbackUrl = new URL('/gooddollar/callback', process.env.APP_BASE_URL ?? 'http://localhost:5173').toString();
    try {
      const verificationUrl = await identityProvider.startVerification({ walletAddress, callbackUrl });
      response.json({ verificationUrl });
    } catch (error) {
      console.error('GoodDollar identity verification could not be started.', error instanceof Error ? error.message : 'Unknown error.');
      response.status(503).json({ error: 'GoodDollar identity verification is temporarily unavailable.' });
    }
  });

  router.post('/me/gooddollar/verification/refresh', sameOrigin, requireAuthentication, async (_request, response) => {
    const user = userFromResponse(response);
    if (!identityProvider) {
      response.status(503).json({ error: 'GoodDollar identity verification is disabled until its Celo Sepolia deployment is verified.' });
      return;
    }
    const { rows } = await database.withUser(user.id, (client) => client.query<{ smart_wallet_address: string | null }>(
      'SELECT smart_wallet_address FROM wallet_accounts WHERE user_id = $1',
      [user.id],
    ));
    const walletAddress = rows[0]?.smart_wallet_address;
    if (!walletAddress) {
      response.status(409).json({ error: 'Provision your embedded smart wallet before checking identity status.' });
      return;
    }
    try {
      const status = await identityProvider.getVerificationStatus(walletAddress);
      await database.query('UPDATE users SET verification_status = $1, updated_at = now() WHERE id = $2',
        [status, user.id]);
      response.json({ status });
    } catch (error) {
      console.error('GoodDollar identity status could not be refreshed.', error instanceof Error ? error.message : 'Unknown error.');
      response.status(503).json({ error: 'GoodDollar identity status is temporarily unavailable.' });
    }
  });

  return router;
}
