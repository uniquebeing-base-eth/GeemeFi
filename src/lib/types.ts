export type User = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  bio: string;
  walletAddress: string | null;
  emailVerified: boolean;
  walletProvisioningStatus: 'pending' | 'provisioning' | 'provisioned' | 'failed';
  accountStatus: 'pending_email_verification' | 'email_verified' | 'wallet_provisioning' | 'wallet_provisioning_failed' | 'active' | 'suspended';
  status: string;
  role: string;
  verificationStatus: string;
  createdAt: string;
};

export type Member = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  verificationStatus: string;
  createdAt: string;
};

export type Wallet = {
  balance: number | null;
  received: number | null;
  given: number | null;
  allowance: null;
  transactions: Array<{ id: string; kind: string; amount: number; status: string; createdAt: string }>;
  provisioningStatus: 'pending' | 'provisioning' | 'provisioned' | 'failed';
  network: 'celo-sepolia';
};