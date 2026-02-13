'use client';

import { CONTRACTS } from '@/lib/contracts';

/**
 * Returns the L2 chain config (contracts, explorer URL, native currency).
 * Thanos Sepolia is the only L2.
 */
export function useL2Config() {
  return CONTRACTS;
}
