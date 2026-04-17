'use client';

import { useReadContract } from 'wagmi';
import { KernelVaultABI } from '@/lib/contracts';
import { useNetwork } from '@/lib/NetworkContext';

/*
 * `lastFeeRateChange` isn't in the SDK ABI export. It's a public state variable
 * on KernelVault (cooldown tracker for setFees()), so Solidity auto-generates a
 * getter. Inline minimal ABI here to read it without modifying the SDK.
 */
const LastFeeRateChangeABI = [
  {
    type: 'function',
    name: 'lastFeeRateChange',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

export interface VaultFees {
  managementFeeBps: bigint;
  performanceFeeBps: bigint;
  feeRecipient: `0x${string}` | undefined;
  protocolTreasury: `0x${string}` | undefined;
  protocolFeeSplitBps: bigint;
  lastFeeTimestamp: bigint;
  highWaterMark: bigint;
  lastFeeRateChange: bigint;
  isLoading: boolean;
}

/**
 * Hook to read vault fee configuration from on-chain. Uses `getFeeInfo()` for a
 * single aggregated view read (7 fields) plus one extra `lastFeeRateChange`
 * read for cooldown display — 2 RPC calls total, down from 4.
 */
export function useVaultFees(vaultAddress: `0x${string}` | undefined): VaultFees | null {
  const { selectedChainId } = useNetwork();

  const feeInfo = useReadContract({
    address: vaultAddress,
    abi: KernelVaultABI,
    functionName: 'getFeeInfo',
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress },
  });

  const lastFeeRateChange = useReadContract({
    address: vaultAddress,
    abi: LastFeeRateChangeABI,
    functionName: 'lastFeeRateChange',
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress },
  });

  if (feeInfo.isLoading) return null;
  if (feeInfo.isError) return null;

  const info = feeInfo.data as
    | readonly [bigint, bigint, `0x${string}`, `0x${string}`, bigint, bigint, bigint]
    | undefined;

  if (!info) return null;

  const [
    managementFeeBps,
    performanceFeeBps,
    feeRecipient,
    protocolTreasury,
    protocolFeeSplitBps,
    lastFeeTimestamp,
    highWaterMark,
  ] = info;

  return {
    managementFeeBps,
    performanceFeeBps,
    feeRecipient,
    protocolTreasury,
    protocolFeeSplitBps,
    lastFeeTimestamp,
    highWaterMark,
    lastFeeRateChange: (lastFeeRateChange.data as bigint) ?? 0n,
    isLoading: feeInfo.isLoading || lastFeeRateChange.isLoading,
  };
}
