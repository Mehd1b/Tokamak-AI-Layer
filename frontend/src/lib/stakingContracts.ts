import type { Address } from 'viem';

// ============ Chain IDs ============

export const L1_CHAIN_ID = 1; // Ethereum Mainnet

// ============ L1 Contracts (Ethereum Mainnet) ============

export const L1_CONTRACTS = {
  ton: '0x2be5e8c109e2197D077D13A82dAead6a9b3433C5' as Address,
  wton: '0xc4A11aaf6ea915Ed7Ac194161d2fC9384F15bff2' as Address,
  wston: '0x0000000000000000000000000000000000000000' as Address, // TODO: deploy on mainnet
  bondManager: '0x0000000000000000000000000000000000000000' as Address, // TODO: deploy
} as const;
