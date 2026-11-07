import { IdentitySDK, SupportedChains } from '@goodsdks/citizen-sdk';
import { getAddress, type Address } from 'viem';
import { CELO_SEPOLIA_CHAIN_ID, CELO_SEPOLIA_NETWORK } from './blockchain-config.ts';

export type GoodDollarVerificationStatus = 'unverified' | 'verified';
export type GoodDollarTransactionStatus = 'pending' | 'confirmed' | 'failed';

export interface GoodDollarIdentityProvider {
  startVerification(input: { walletAddress: string; callbackUrl: string }): Promise<string>;
  getVerificationStatus(walletAddress: string): Promise<GoodDollarVerificationStatus>;
}

export class CitizenSdkIdentityAdapter implements GoodDollarIdentityProvider {
  constructor(private readonly sdk: IdentitySDK) {}

  startVerification(input: { walletAddress: string; callbackUrl: string }): Promise<string> {
    if (input.walletAddress.toLowerCase() !== this.sdk.account.toLowerCase()) {
      throw new Error('The GoodDollar identity wallet does not match the authenticated Geemifi wallet.');
    }
    return this.sdk.generateFVLink(false, input.callbackUrl, SupportedChains.CELO);
  }

  async getVerificationStatus(walletAddress: string): Promise<GoodDollarVerificationStatus> {
    const data = await this.sdk.getIdentityExpiryData(walletAddress as Address);
    const expiry = this.sdk.calculateIdentityExpiry(data.lastAuthenticated, data.authPeriod);
    return data.lastAuthenticated > 0n && expiry.expiryTimestamp > BigInt(Date.now())
      ? 'verified'
      : 'unverified';
  }
}

export class MockGoodDollarIdentityProvider implements GoodDollarIdentityProvider {
  private readonly statuses = new Map<string, GoodDollarVerificationStatus>();

  async startVerification({ walletAddress }: { walletAddress: string; callbackUrl: string }): Promise<string> {
    this.statuses.set(walletAddress.toLowerCase(), 'unverified');
    const url = new URL('https://mock.gooddollar.invalid/verify');
    url.searchParams.set('wallet', walletAddress);
    return url.toString();
  }

  async getVerificationStatus(walletAddress: string): Promise<GoodDollarVerificationStatus> {
    return this.statuses.get(walletAddress.toLowerCase()) ?? 'unverified';
  }

  markVerified(walletAddress: string): void {
    this.statuses.set(walletAddress.toLowerCase(), 'verified');
  }
}

export type GoodDollarContractConfiguration = {
  network: typeof CELO_SEPOLIA_NETWORK;
  chainId: typeof CELO_SEPOLIA_CHAIN_ID;
  identityAddress: string;
  tokenAddress: string;
};

function isAddress(value: string | undefined): value is string {
  return value !== undefined && /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function validateGoodDollarContractConfiguration(
  env: NodeJS.ProcessEnv,
): GoodDollarContractConfiguration {
  if (env.GOODDOLLAR_NETWORK !== CELO_SEPOLIA_NETWORK) {
    throw new Error(`GOODDOLLAR_NETWORK must be "${CELO_SEPOLIA_NETWORK}". SDK environment names are not network IDs.`);
  }
  if (env.GOODDOLLAR_CHAIN_ID !== String(CELO_SEPOLIA_CHAIN_ID)) {
    throw new Error(`GOODDOLLAR_CHAIN_ID must be ${CELO_SEPOLIA_CHAIN_ID}; GoodDollar mainnet is not enabled.`);
  }
  if (!isAddress(env.GOODDOLLAR_IDENTITY_ADDRESS) || !isAddress(env.GOODDOLLAR_TOKEN_ADDRESS)) {
    throw new Error('GoodDollar identity and token contract addresses must both be configured.');
  }
  if (env.GOODDOLLAR_CONTRACTS_VERIFIED !== 'true') {
    throw new Error('GoodDollar contract deployments must be independently verified before enabling the Citizen SDK.');
  }
  let identityAddress: string;
  let tokenAddress: string;
  try {
    identityAddress = getAddress(env.GOODDOLLAR_IDENTITY_ADDRESS);
    tokenAddress = getAddress(env.GOODDOLLAR_TOKEN_ADDRESS);
  } catch {
    throw new Error('GoodDollar contract addresses must be valid checksummed EVM addresses.');
  }
  return {
    network: CELO_SEPOLIA_NETWORK,
    chainId: CELO_SEPOLIA_CHAIN_ID,
    identityAddress,
    tokenAddress,
  };
}

export function assertGoodDollarConfiguration(env: NodeJS.ProcessEnv = process.env): void {
  if (env.GOODDOLLAR_SDK_ENV) {
    throw new Error('GOODDOLLAR_SDK_ENV is not a network setting. Do not map development or staging to Celo Sepolia.');
  }
  const provider = env.GOODDOLLAR_IDENTITY_PROVIDER ?? 'disabled';
  if (provider === 'mock') {
    if (env.NODE_ENV === 'production') {
      throw new Error('The GoodDollar mock identity provider cannot be enabled in production.');
    }
    if (env.GOODDOLLAR_NETWORK && env.GOODDOLLAR_NETWORK !== CELO_SEPOLIA_NETWORK) {
      throw new Error(`Unsupported GoodDollar network "${env.GOODDOLLAR_NETWORK}".`);
    }
    if (env.GOODDOLLAR_CHAIN_ID && env.GOODDOLLAR_CHAIN_ID !== String(CELO_SEPOLIA_CHAIN_ID)) {
      throw new Error(`Unsupported GoodDollar chain ID "${env.GOODDOLLAR_CHAIN_ID}".`);
    }
    return;
  }
  if (provider === 'disabled') {
    if (env.GOODDOLLAR_NETWORK && env.GOODDOLLAR_NETWORK !== CELO_SEPOLIA_NETWORK) {
      throw new Error(`Unsupported GoodDollar network "${env.GOODDOLLAR_NETWORK}".`);
    }
    if (env.GOODDOLLAR_CHAIN_ID && env.GOODDOLLAR_CHAIN_ID !== String(CELO_SEPOLIA_CHAIN_ID)) {
      throw new Error(`Unsupported GoodDollar chain ID "${env.GOODDOLLAR_CHAIN_ID}".`);
    }
    return;
  }
  if (provider === 'citizen') {
    validateGoodDollarContractConfiguration(env);
    throw new Error('The Citizen SDK is not enabled: its published deployment configuration does not include Celo Sepolia.');
  }
  throw new Error(`Unsupported GOODDOLLAR_IDENTITY_PROVIDER "${provider}".`);
}

export function createGoodDollarIdentityProvider(
  env: NodeJS.ProcessEnv = process.env,
): GoodDollarIdentityProvider | null {
  assertGoodDollarConfiguration(env);
  return env.GOODDOLLAR_IDENTITY_PROVIDER === 'mock' ? new MockGoodDollarIdentityProvider() : null;
}

export type GoodDollarTransfer = {
  id: string;
  hash: string | null;
  status: GoodDollarTransactionStatus;
  amount: string;
  createdAt: string;
};

export interface GoodDollarTransactionService {
  getBalance(walletAddress: string): Promise<bigint>;
  transfer(input: { walletAddress: string; recipient: string; amount: bigint }): Promise<GoodDollarTransfer>;
  verifyReceipt(transactionHash: string): Promise<GoodDollarTransfer>;
  listTransactions(walletAddress: string): Promise<GoodDollarTransfer[]>;
}

export class DisabledGoodDollarTransactionService implements GoodDollarTransactionService {
  private disabled(): never {
    throw new Error('G$ balance and transfer operations are disabled until Celo Sepolia contracts are independently verified.');
  }

  async getBalance(_walletAddress: string): Promise<bigint> {
    this.disabled();
  }

  async transfer(_input: { walletAddress: string; recipient: string; amount: bigint }): Promise<GoodDollarTransfer> {
    this.disabled();
  }

  async verifyReceipt(_transactionHash: string): Promise<GoodDollarTransfer> {
    this.disabled();
  }

  async listTransactions(_walletAddress: string): Promise<GoodDollarTransfer[]> {
    this.disabled();
  }
}
