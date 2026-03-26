'use client';

import { useReadContract } from 'wagmi';
import { KernelVaultABI } from '@/lib/contracts';
import { useNetwork } from '@/lib/NetworkContext';

/**
 * Hook to read vault fee configuration from on-chain.
 * Returns null if no fees are configured or data is still loading.
 */
export function useVaultFees(vaultAddress: `0x${string}` | undefined) {
  const { selectedChainId } = useNetwork();

  const managementFeeBps = useReadContract({
    address: vaultAddress,
    abi: KernelVaultABI,
    functionName: 'managementFeeBps',
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress },
  });

  const performanceFeeBps = useReadContract({
    address: vaultAddress,
    abi: KernelVaultABI,
    functionName: 'performanceFeeBps',
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress },
  });

  const feeRecipient = useReadContract({
    address: vaultAddress,
    abi: KernelVaultABI,
    functionName: 'feeRecipient',
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress },
  });

  const highWaterMark = useReadContract({
    address: vaultAddress,
    abi: KernelVaultABI,
    functionName: 'highWaterMark',
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress },
  });

  // If still loading or errored, return null
  if (managementFeeBps.isLoading || performanceFeeBps.isLoading) return null;
  if (managementFeeBps.isError && performanceFeeBps.isError) return null;

  return {
    managementFeeBps: (managementFeeBps.data as bigint) ?? 0n,
    performanceFeeBps: (performanceFeeBps.data as bigint) ?? 0n,
    feeRecipient: feeRecipient.data as `0x${string}` | undefined,
    highWaterMark: (highWaterMark.data as bigint) ?? 0n,
    isLoading: managementFeeBps.isLoading || performanceFeeBps.isLoading,
  };
}
