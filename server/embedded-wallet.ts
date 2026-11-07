import { createHmac } from 'node:crypto';
import { createThirdwebClient } from 'thirdweb';
import { celoSepoliaTestnet } from 'thirdweb/chains';
import { inAppWallet } from 'thirdweb/wallets';
import type { AppDatabase } from './db.ts';
import { assertCeloSepoliaNetwork, CELO_SEPOLIA_CHAIN_ID } from './blockchain-config.ts';

export type WalletProvisioner = (userId: string) => Promise<string>;

export function deriveThirdwebWalletSecret(userId: string, masterSecret: string): string {
  if (Buffer.byteLength(masterSecret) < 32) {
    throw new Error('THIRDWEB_WALLET_SECRET must contain at least 32 bytes.');
  }
  return createHmac('sha256', masterSecret)
    .update(`geemifi:embedded-wallet:v1:${userId}`)
    .digest('hex');
}

export function createThirdwebWalletProvisioner(env: NodeJS.ProcessEnv = process.env): WalletProvisioner {
  assertCeloSepoliaNetwork(env);
  if (celoSepoliaTestnet.id !== CELO_SEPOLIA_CHAIN_ID) {
    throw new Error('The configured Thirdweb Celo Sepolia chain ID does not match Geemifi configuration.');
  }

  const clientId = env.THIRDWEB_CLIENT_ID;
  const masterSecret = env.THIRDWEB_WALLET_SECRET;
  if (!clientId) throw new Error('THIRDWEB_CLIENT_ID must be configured to provision embedded wallets.');
  if (!masterSecret || Buffer.byteLength(masterSecret) < 32) {
    throw new Error('THIRDWEB_WALLET_SECRET must contain at least 32 bytes.');
  }

  const client = createThirdwebClient({ clientId });
  return async (userId) => {
    const wallet = inAppWallet({
      executionMode: {
        mode: 'EIP4337',
        smartAccount: { chain: celoSepoliaTestnet, sponsorGas: false },
      },
    });
    const account = await wallet.connect({
      client,
      chain: celoSepoliaTestnet,
      strategy: 'backend',
      walletSecret: deriveThirdwebWalletSecret(userId, masterSecret),
    });
    return account.address;
  };
}

export async function provisionEmbeddedWallet(
  database: AppDatabase,
  userId: string,
  provisionWallet?: WalletProvisioner,
): Promise<string> {
  const account = await database.withUser(userId, async (client) => {
    const { rows } = await client.query<{
      smart_wallet_address: string | null;
      email_verified_at: Date | null;
      user_status: string;
    }>(
      `SELECT wallet_accounts.smart_wallet_address, users.email_verified_at, users.status AS user_status
        FROM wallet_accounts JOIN users ON users.id = wallet_accounts.user_id
        WHERE wallet_accounts.user_id = $1`,
      [userId],
    );
    return rows[0] ?? null;
  });
  if (!account) throw new Error('The Geemifi account could not be found.');
  if (!account.email_verified_at) throw new Error('Verify the account email before provisioning a wallet.');
  if (account.user_status !== 'active') throw new Error('Suspended accounts cannot provision a wallet.');
  if (account.smart_wallet_address) {
    await database.withUser(userId, async (client) => {
      await client.query(
        `UPDATE wallet_accounts SET provisioning_status = 'provisioned', updated_at = now()
          WHERE user_id = $1`,
        [userId],
      );
      await client.query(`UPDATE users SET account_status = 'active', updated_at = now() WHERE id = $1`, [userId]);
    });
    return account.smart_wallet_address;
  }

  await database.withUser(userId, async (client) => {
    await client.query(
      `UPDATE wallet_accounts SET provisioning_status = 'provisioning', updated_at = now()
        WHERE user_id = $1 AND smart_wallet_address IS NULL`,
      [userId],
    );
    await client.query(
      `UPDATE users SET account_status = 'wallet_provisioning', updated_at = now()
        WHERE id = $1 AND email_verified_at IS NOT NULL AND status = 'active'`,
      [userId],
    );
  });

  try {
    const address = await (provisionWallet ?? createThirdwebWalletProvisioner())(userId);
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error('The embedded wallet provider returned an invalid smart-wallet address.');
    }

    const persisted = await database.withUser(userId, async (client) => {
      const { rows } = await client.query<{ smart_wallet_address: string }>(
        `UPDATE wallet_accounts SET smart_wallet_address = $2, provisioning_status = 'provisioned',
          updated_at = now()
          WHERE user_id = $1 AND (smart_wallet_address IS NULL OR smart_wallet_address = $2)
          RETURNING smart_wallet_address`,
        [userId, address],
      );
      if (!rows[0]) throw new Error('A different smart wallet is already associated with this account.');
      await client.query(
        `UPDATE users SET account_status = 'active', updated_at = now()
          WHERE id = $1 AND email_verified_at IS NOT NULL AND status = 'active'`,
        [userId],
      );
      return rows[0].smart_wallet_address;
    });
    return persisted;
  } catch (error) {
    await database.withUser(userId, (client) => client.query(
      `UPDATE wallet_accounts SET provisioning_status = 'failed', updated_at = now()
        WHERE user_id = $1 AND smart_wallet_address IS NULL`,
      [userId],
    ));
    await database.query(
      `UPDATE users SET account_status = 'wallet_provisioning_failed', updated_at = now()
        WHERE id = $1 AND email_verified_at IS NOT NULL AND status = 'active'`,
      [userId],
    );
    throw error;
  }
}
