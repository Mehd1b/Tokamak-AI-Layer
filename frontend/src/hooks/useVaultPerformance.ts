'use client';

import { useReadContract } from 'wagmi';
import { useNetwork } from '@/lib/NetworkContext';

export interface VaultPerformance {
  totalReturn: number | null;
  apy: number | null;
  returnSince7d: number | null;
  returnSince30d: number | null;
  maxDrawdown: number | null;
  executionCount: number;
  winRate: number | null;
  sharpeRatio: number | null;
  isLoading: boolean;
  error: Error | null;
}

const PerformanceABI = [
  {
    type: 'function',
    name: 'getPerformanceMetrics',
    inputs: [],
    outputs: [
      { type: 'uint256', name: '_initialPps' },
      { type: 'uint256', name: '_initialPpsTimestamp' },
      { type: 'uint256', name: '_currentPps' },
      { type: 'uint256', name: '_peakPps' },
      { type: 'uint256', name: '_maxDrawdownBps' },
      { type: 'uint256', name: '_executionWins' },
      { type: 'uint256', name: '_totalExecutionCount' },
      { type: 'uint256', name: '_checkpointIndex' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPpsCheckpoints',
    inputs: [],
    outputs: [
      { type: 'uint256[30]', name: 'values' },
      { type: 'uint256[30]', name: 'timestamps' },
      { type: 'uint256', name: 'index' },
    ],
    stateMutability: 'view',
  },
] as const;

export function useVaultPerformance(
  vaultAddress: `0x${string}` | undefined,
): VaultPerformance {
  const { selectedChainId } = useNetwork();

  const metrics = useReadContract({
    address: vaultAddress,
    abi: PerformanceABI,
    functionName: 'getPerformanceMetrics',
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress, staleTime: 30_000 },
  });

  const checkpoints = useReadContract({
    address: vaultAddress,
    abi: PerformanceABI,
    functionName: 'getPpsCheckpoints',
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress && metrics.isSuccess, staleTime: 30_000 },
  });

  const isLoading = metrics.isLoading || (metrics.isSuccess && checkpoints.isLoading);

  if (!metrics.data) {
    return {
      totalReturn: null,
      apy: null,
      returnSince7d: null,
      returnSince30d: null,
      maxDrawdown: null,
      executionCount: 0,
      winRate: null,
      sharpeRatio: null,
      isLoading,
      error: null,
    };
  }

  const [
    initialPps,
    initialPpsTimestamp,
    currentPps,
    peakPps,
    maxDrawdownBps,
    executionWins,
    totalExecutionCount,
    checkpointIndex,
  ] = metrics.data as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];

  const execCount = Number(totalExecutionCount);

  // Total return
  const totalReturn =
    initialPps > 0n
      ? (Number(currentPps - initialPps) / Number(initialPps)) * 100
      : null;

  // APY — annualize total return based on time elapsed since first PPS
  let apy: number | null = null;
  if (totalReturn !== null && initialPpsTimestamp > 0n) {
    const now = Math.floor(Date.now() / 1000);
    const elapsedSeconds = now - Number(initialPpsTimestamp);
    const elapsedDays = elapsedSeconds / 86400;
    if (elapsedDays >= 1) {
      const dailyReturn = totalReturn / 100 / elapsedDays;
      apy = ((1 + dailyReturn) ** 365 - 1) * 100;
    }
  }

  // Max drawdown (already computed on-chain in bps)
  const maxDrawdown =
    maxDrawdownBps > 0n ? -(Number(maxDrawdownBps) / 100) : execCount > 0 ? 0 : null;

  // Win rate
  const winRate =
    execCount > 0 ? (Number(executionWins) / execCount) * 100 : null;

  // Time-windowed returns from checkpoints
  let returnSince7d: number | null = null;
  let returnSince30d: number | null = null;
  let sharpeRatio: number | null = null;

  if (checkpoints.data) {
    const [values, timestamps, idx] = checkpoints.data as unknown as [bigint[], bigint[], bigint];
    const count = Number(idx) < 30 ? Number(idx) : 30;
    const now = Math.floor(Date.now() / 1000);
    const sevenDaysAgo = now - 7 * 86400;
    const thirtyDaysAgo = now - 30 * 86400;

    // Find closest PPS at or before a target time
    let closest7d: bigint | null = null;
    let closest7dDist = Infinity;
    let closest30d: bigint | null = null;
    let closest30dDist = Infinity;

    // Collect valid checkpoints for Sharpe
    const ppsValues: { pps: number; time: number }[] = [];

    for (let i = 0; i < count; i++) {
      const bufIdx = Number(idx) <= 30 ? i : (Number(idx) - 30 + i) % 30;
      const ts = Number(timestamps[bufIdx]);
      const pps = values[bufIdx];
      if (ts === 0 || pps === 0n) continue;

      ppsValues.push({ pps: Number(pps), time: ts });

      // 7d window
      if (ts <= sevenDaysAgo) {
        const dist = sevenDaysAgo - ts;
        if (dist < closest7dDist) {
          closest7dDist = dist;
          closest7d = pps;
        }
      }

      // 30d window
      if (ts <= thirtyDaysAgo) {
        const dist = thirtyDaysAgo - ts;
        if (dist < closest30dDist) {
          closest30dDist = dist;
          closest30d = pps;
        }
      }
    }

    if (closest7d !== null && closest7d > 0n) {
      returnSince7d = (Number(currentPps - closest7d) / Number(closest7d)) * 100;
    }
    if (closest30d !== null && closest30d > 0n) {
      returnSince30d = (Number(currentPps - closest30d) / Number(closest30d)) * 100;
    }

    // Sharpe ratio from checkpoint returns
    if (ppsValues.length >= 3) {
      ppsValues.sort((a, b) => a.time - b.time);
      const dayMap = new Map<string, number[]>();
      for (let i = 1; i < ppsValues.length; i++) {
        const ret =
          ppsValues[i - 1].pps > 0
            ? (ppsValues[i].pps - ppsValues[i - 1].pps) / ppsValues[i - 1].pps
            : 0;
        const dayKey = Math.floor(ppsValues[i].time / 86400).toString();
        const existing = dayMap.get(dayKey);
        if (existing) existing.push(ret);
        else dayMap.set(dayKey, [ret]);
      }

      const dailyReturns: number[] = [];
      for (const returns of dayMap.values()) {
        dailyReturns.push(returns.reduce((acc, r) => acc * (1 + r), 1) - 1);
      }

      if (dailyReturns.length >= 2) {
        const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
        const variance =
          dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / (dailyReturns.length - 1);
        const stdDev = Math.sqrt(variance);
        if (stdDev > 0) sharpeRatio = (mean / stdDev) * Math.sqrt(365);
      }
    }
  }

  return {
    totalReturn,
    apy,
    returnSince7d,
    returnSince30d,
    maxDrawdown,
    executionCount: execCount,
    winRate,
    sharpeRatio,
    isLoading,
    error: null,
  };
}
