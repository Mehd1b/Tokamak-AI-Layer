import type { Address } from 'viem';

export const CONTRACTS = {
  identityRegistry: '0x3f89CD27fD877827E7665A9883b3c0180E22A525' as Address,
  reputationRegistry: '0x0052258E517835081c94c0B685409f2EfC4D502b' as Address,
  validationRegistry: '0x09447147C6E75a60A449f38532F06E19F5F632F3' as Address,
  stakingIntegrationModule: '0x41FF86643f6d550725177af1ABBF4db9715A74b8' as Address,
} as const;

export const L1_CONTRACTS = {
  depositManager: '0x90ffcc7F168DceDBEf1Cb6c6eB00cA73F922956F' as Address,
  seigManager: '0x2320542ae933FbAdf8f5B97cA348c7CeDA90fAd7' as Address,
  layer2Registry: '0xA0a9576b437E52114aDA8b0BC4149F2F5c604581' as Address,
  ton: '0xa30fe40285B8f5c0457DbC3B7C8A280373c40044' as Address,
} as const;

export const CHAIN_ID = 11155420; // Optimism Sepolia
export const L1_CHAIN_ID = 11155111; // Sepolia
