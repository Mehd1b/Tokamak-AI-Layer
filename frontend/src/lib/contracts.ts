import type { Address } from 'viem';

export const CONTRACTS = {
  identityRegistry: '0x3f89CD27fD877827E7665A9883b3c0180E22A525' as Address,
  reputationRegistry: '0x0052258E517835081c94c0B685409f2EfC4D502b' as Address,
  validationRegistry: '0x09447147C6E75a60A449f38532F06E19F5F632F3' as Address,
  stakingIntegrationModule: '0x41FF86643f6d550725177af1ABBF4db9715A74b8' as Address,
} as const;

export const CHAIN_ID = 11155420; // Optimism Sepolia
