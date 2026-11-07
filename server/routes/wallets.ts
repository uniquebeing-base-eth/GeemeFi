import { Router } from 'express';
import type { AppDatabase } from '../db.ts';
import { provisionEmbeddedWallet, type WalletProvisioner } from '../embedded-wallet.ts';
import {
  loadPublicUser, optionalAuthentication, requireAuthentication, sameOrigin, userFromResponse,
} from '../security.ts';

type WalletRouterOptions = {
  database: AppDatabase;
  provisionWallet?: WalletProvisioner;
};

export function createWalletRouter({ database, provisionWallet }: WalletRouterOptions): Router {
  const router = Router();
  router.use(optionalAuthentication(database));

  router.post('/me/wallet/provision', sameOrigin, requireAuthentication, async (_request, response) => {
    const user = userFromResponse(response);
    try {
      const walletAddress = await provisionEmbeddedWallet(database, user.id, provisionWallet);
      const updatedUser = await loadPublicUser(database, user.id);
      if (!updatedUser) throw new Error('The Geemifi account could not be reloaded after wallet provisioning.');
      response.json({ user: updatedUser, provisioningStatus: 'provisioned', walletAddress });
    } catch (error) {
      console.error('Embedded smart-wallet provisioning failed.', error instanceof Error ? error.message : 'Unknown error.');
      response.status(503).json({
        error: 'Your embedded wallet is not ready yet. Your account is safe; please retry shortly.',
        provisioningStatus: 'failed',
      });
    }
  });

  return router;
}
