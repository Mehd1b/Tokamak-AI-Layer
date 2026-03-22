'use client';

import { useChainId } from 'wagmi';
import { DEPLOYMENTS } from '../addresses';

const LEGACY_GAS_CHAINS = new Set([999, 998]);

export function useIsLegacyChain(): boolean {
  const chainId = useChainId();
  return LEGACY_GAS_CHAINS.has(chainId);
}

export function useIsChainSupported(): boolean {
  const chainId = useChainId();
  return chainId in DEPLOYMENTS;
}

export function useChainMismatch(expectedChainId?: number): boolean {
  const chainId = useChainId();
  if (!expectedChainId) return false;
  return chainId !== expectedChainId;
}

export function getLegacyGasOverrides(chainId: number): { type?: 'legacy' } {
  return LEGACY_GAS_CHAINS.has(chainId) ? { type: 'legacy' as const } : {};
}
