export type User = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  bio: string;
  walletAddress: string | null;
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
  balance: number;
  received: number;
  given: number;
  allowance: null;
  transactions: Array<{ id: string; kind: string; amount: number; status: string; createdAt: string }>;
};