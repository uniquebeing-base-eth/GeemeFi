export const CELO_SEPOLIA_CHAIN_ID = 11142220;
export const CELO_SEPOLIA_NETWORK = 'celo-sepolia';

export function assertCeloSepoliaNetwork(env: NodeJS.ProcessEnv = process.env): void {
  const network = env.GEEMIFI_NETWORK ?? CELO_SEPOLIA_NETWORK;
  const chainId = env.GEEMIFI_CHAIN_ID;

  if (network !== CELO_SEPOLIA_NETWORK) {
    throw new Error(`Unsupported Geemifi blockchain network "${network}". Only Celo Sepolia is enabled.`);
  }
  if (chainId && chainId !== String(CELO_SEPOLIA_CHAIN_ID)) {
    throw new Error(`Unsupported Geemifi chain ID "${chainId}". Only ${CELO_SEPOLIA_CHAIN_ID} is enabled.`);
  }
}
