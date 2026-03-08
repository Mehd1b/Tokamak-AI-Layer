import type { Address } from 'viem';

// ============ Chain IDs ============

export const L1_CHAIN_ID = 1; // Ethereum Mainnet

// ============ L1 Contracts (Ethereum Mainnet) ============

export const L1_CONTRACTS = {
  ton: '0x2be5e8c109e2197D077D13A82dAead6a9b3433C5' as Address,
  wton: '0xc4A11aaf6ea915Ed7Ac194161d2fC9384F15bff2' as Address,
  wston: '0x26C8F112769fb3A3A8de267CfFf60E9f317445e5' as Address,
  bondManager: '0x7D5AD89633251136062dbCCd9AFaE3AE1B377261' as Address,
} as const;
