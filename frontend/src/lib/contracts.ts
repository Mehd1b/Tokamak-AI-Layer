import type { Address } from 'viem';

// ============ Chain IDs ============

export const THANOS_CHAIN_ID = 111551119090;
export const L1_CHAIN_ID = 11155111; // Sepolia

/** Default L2 chain */
export const CHAIN_ID = THANOS_CHAIN_ID;

// ============ L2 config (Thanos Sepolia) ============

export const CONTRACTS = {
  identityRegistry: '0x3f89CD27fD877827E7665A9883b3c0180E22A525' as Address,
  reputationRegistry: '0x0052258E517835081c94c0B685409f2EfC4D502b' as Address,
  validationRegistry: '0x09447147C6E75a60A449f38532F06E19F5F632F3' as Address,
  stakingIntegrationModule: '0xDc9d9A78676C600E7Ca55a8D0c63da9462Acfe30' as Address,
  taskFeeEscrow: '0x6D68Cd8fD89BF1746A1948783C92A00E591d1227' as Address,
  explorerUrl: 'https://explorer.thanos-sepolia.tokamak.network',
  nativeCurrency: 'TON',
  name: 'Thanos Sepolia',
};

export function isL2Chain(chainId: number): boolean {
  return chainId === THANOS_CHAIN_ID;
}

// ============ L1 Contracts (Sepolia) ============

export const L1_CONTRACTS = {
  depositManager: '0x90ffcc7F168DceDBEF1Cb6c6eB00cA73F922956F' as Address,
  seigManager: '0x2320542ae933FbAdf8f5B97cA348c7CeDA90fAd7' as Address,
  layer2Registry: '0xA0a9576b437E52114aDA8b0BC4149F2F5c604581' as Address,
  layer2: '0xCBeF7Cc221c04AD2E68e623613cc5d33b0fE1599' as Address, // Registered Layer2 operator for staking
  ton: '0xa30fe40285B8f5c0457DbC3B7C8A280373c40044' as Address,
  wton: '0x79E0d92670106c85E9067b56B8F674340dCa0Bbd' as Address,
} as const;
