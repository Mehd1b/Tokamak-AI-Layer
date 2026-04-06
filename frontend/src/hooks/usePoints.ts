'use client';

import { useReadContract } from 'wagmi';
import { useNetwork } from '@/lib/NetworkContext';
import { PointsProgramABI } from '@/lib/contracts';

/**
 * Get the PointsProgram address for the current network.
 * Falls back to env var if not in deployment config.
 */
export function usePointsProgramAddress(): `0x${string}` | undefined {
  const { contracts } = useNetwork();
  return (contracts as any).pointsProgram as `0x${string}` | undefined
    ?? (process.env.NEXT_PUBLIC_POINTS_PROGRAM as `0x${string}` | undefined);
}

/**
 * Check if the PointsProgram contract is available on the current network.
 */
export function usePointsAvailable(): boolean {
  const pointsProgram = usePointsProgramAddress();
  return !!pointsProgram;
}

/**
 * Read total points for a user.
 */
export function useGetPoints(address: `0x${string}` | undefined) {
  const { selectedChainId } = useNetwork();
  const pointsProgram = usePointsProgramAddress();

  return useReadContract({
    address: pointsProgram,
    abi: PointsProgramABI,
    functionName: 'getPoints',
    args: address ? [address] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!pointsProgram && !!address },
  });
}

/**
 * Read the current multiplier (3x or 1x).
 */
export function useGetMultiplier() {
  const { selectedChainId } = useNetwork();
  const pointsProgram = usePointsProgramAddress();

  return useReadContract({
    address: pointsProgram,
    abi: PointsProgramABI,
    functionName: 'getMultiplier',
    chainId: selectedChainId,
    query: { enabled: !!pointsProgram },
  });
}

/**
 * Read the season end timestamp.
 */
export function useSeasonEnd() {
  const { selectedChainId } = useNetwork();
  const pointsProgram = usePointsProgramAddress();

  return useReadContract({
    address: pointsProgram,
    abi: PointsProgramABI,
    functionName: 'seasonEnd',
    chainId: selectedChainId,
    query: { enabled: !!pointsProgram },
  });
}

/**
 * Read the deployedAt timestamp.
 */
export function useDeployedAt() {
  const { selectedChainId } = useNetwork();
  const pointsProgram = usePointsProgramAddress();

  return useReadContract({
    address: pointsProgram,
    abi: PointsProgramABI,
    functionName: 'deployedAt',
    chainId: selectedChainId,
    query: { enabled: !!pointsProgram },
  });
}

/**
 * Read the points breakdown for a user.
 */
export function usePointsBreakdown(address: `0x${string}` | undefined) {
  const { selectedChainId } = useNetwork();
  const pointsProgram = usePointsProgramAddress();

  return useReadContract({
    address: pointsProgram,
    abi: PointsProgramABI,
    functionName: 'getPointsBreakdown',
    args: address ? [address] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!pointsProgram && !!address },
  });
}

/**
 * Read pending points for a user in a specific vault.
 */
export function usePendingPoints(vault: `0x${string}` | undefined, address: `0x${string}` | undefined) {
  const { selectedChainId } = useNetwork();
  const pointsProgram = usePointsProgramAddress();

  return useReadContract({
    address: pointsProgram,
    abi: PointsProgramABI,
    functionName: 'getPendingPoints',
    args: vault && address ? [vault, address] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!pointsProgram && !!vault && !!address },
  });
}

/**
 * Read daily rate for a user in a specific vault.
 */
export function useDailyRate(vault: `0x${string}` | undefined, address: `0x${string}` | undefined) {
  const { selectedChainId } = useNetwork();
  const pointsProgram = usePointsProgramAddress();

  return useReadContract({
    address: pointsProgram,
    abi: PointsProgramABI,
    functionName: 'getDailyRate',
    args: vault && address ? [vault, address] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!pointsProgram && !!vault && !!address },
  });
}

/**
 * Composite hook that aggregates all points data for a user.
 * Returns: { points, multiplier, seasonEnd, depositPoints, executionPoints, referralPoints, isLoading }
 */
export function usePoints(address: `0x${string}` | undefined) {
  const { data: points, isLoading: pointsLoading } = useGetPoints(address);
  const { data: multiplier, isLoading: multiplierLoading } = useGetMultiplier();
  const { data: seasonEndTs, isLoading: seasonEndLoading } = useSeasonEnd();
  const { data: breakdown, isLoading: breakdownLoading } = usePointsBreakdown(address);

  const isLoading = pointsLoading || multiplierLoading || seasonEndLoading || breakdownLoading;

  return {
    points: points as bigint | undefined,
    multiplier: multiplier as bigint | undefined,
    seasonEnd: seasonEndTs as bigint | undefined,
    depositPoints: breakdown ? (breakdown as [bigint, bigint, bigint, bigint])[0] : undefined,
    executionPoints: breakdown ? (breakdown as [bigint, bigint, bigint, bigint])[1] : undefined,
    referralPoints: breakdown ? (breakdown as [bigint, bigint, bigint, bigint])[2] : undefined,
    isLoading,
  };
}
