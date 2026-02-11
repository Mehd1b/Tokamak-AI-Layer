'use client';

import { useChainId } from 'wagmi';
import { getL2Config } from '@/lib/contracts';

/**
 * Returns the L2 chain config (contracts, explorer URL, native currency)
 * based on the user's connected chain. Falls back to Optimism Sepolia.
 */
export function useL2Config() {
  const chainId = useChainId();
  const config = getL2Config(chainId);
  return { ...config, chainId };
}
