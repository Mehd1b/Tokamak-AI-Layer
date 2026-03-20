'use client';

import { useReadContract } from 'wagmi';
import { useNetwork } from '@/lib/NetworkContext';

const StrategyABI = [
  { type: 'function', name: 'isStrategyActive', inputs: [], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'snapshotTotalAssets', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'snapshotTotalShares', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalAssets', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'lastExecutionTimestamp', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;

export interface StrategyStatus {
  isActive: boolean;
  snapshotAssets: bigint | undefined;
  snapshotShares: bigint | undefined;
  currentAssets: bigint | undefined;
  lastExecutionTime: bigint | undefined;
  availableLiquidity: bigint | undefined;
  isLoading: boolean;
}

export function useStrategyStatus(vaultAddress: `0x${string}` | undefined): StrategyStatus {
  const { selectedChainId } = useNetwork();

  const isStrategyActive = useReadContract({
    address: vaultAddress,
    abi: StrategyABI,
    functionName: 'isStrategyActive',
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress },
  });

  const active = isStrategyActive.data === true;

  const snapshotTotalAssets = useReadContract({
    address: vaultAddress,
    abi: StrategyABI,
    functionName: 'snapshotTotalAssets',
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress && active },
  });

  const snapshotTotalShares = useReadContract({
    address: vaultAddress,
    abi: StrategyABI,
    functionName: 'snapshotTotalShares',
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress && active },
  });

  const totalAssets = useReadContract({
    address: vaultAddress,
    abi: StrategyABI,
    functionName: 'totalAssets',
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress && active },
  });

  const lastExecutionTimestamp = useReadContract({
    address: vaultAddress,
    abi: StrategyABI,
    functionName: 'lastExecutionTimestamp',
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress && active },
  });

  // If isStrategyActive reverts (older vault without the function), default to false
  const isActive = isStrategyActive.isError ? false : active;

  const currentAssets = totalAssets.data as bigint | undefined;

  return {
    isActive,
    snapshotAssets: snapshotTotalAssets.data as bigint | undefined,
    snapshotShares: snapshotTotalShares.data as bigint | undefined,
    currentAssets,
    lastExecutionTime: lastExecutionTimestamp.data as bigint | undefined,
    availableLiquidity: currentAssets,
    isLoading: isStrategyActive.isLoading,
  };
}
