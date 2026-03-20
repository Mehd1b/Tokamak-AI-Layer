'use client';

import { usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { KernelVaultABI } from '@/lib/contracts';
import { useNetwork } from '@/lib/NetworkContext';
import { isExplorerAvailable, fetchVaultLogs, type DecodedVaultLog } from '@/lib/explorerApi';
import {
  paginatedGetLogs,
  depositEvent,
  withdrawEvent,
  executionAppliedEvent,
  findVaultDeployBlock,
  recentFromBlock,
  getLogsClient,
} from '@/lib/vaultEvents';
import type { Log } from 'viem';

export interface VaultPerformance {
  totalReturn: number | null;
  returnSince7d: number | null;
  returnSince30d: number | null;
  maxDrawdown: number | null;
  executionCount: number;
  winRate: number | null;
  sharpeRatio: number | null;
  isLoading: boolean;
  error: Error | null;
}

type HistoryEvent = {
  type: 'deposit' | 'withdraw' | 'execution';
  blockNumber: bigint;
  logIndex: number;
  timeStamp?: number;
  args: any;
};

interface PpsSnapshot {
  time: number;
  pps: number;
  isExecution: boolean;
}

async function readTvlOrFallback(
  client: any,
  vaultAddress: `0x${string}`,
  blockNumber?: bigint,
): Promise<bigint> {
  try {
    return await client.readContract({
      address: vaultAddress,
      abi: KernelVaultABI,
      functionName: 'totalValueLocked',
      ...(blockNumber !== undefined ? { blockNumber } : {}),
    }) as bigint;
  } catch {
    return await client.readContract({
      address: vaultAddress,
      abi: KernelVaultABI,
      functionName: 'totalAssets',
      ...(blockNumber !== undefined ? { blockNumber } : {}),
    }) as bigint;
  }
}

function computeMetrics(snapshots: PpsSnapshot[], currentPps: number) {
  if (snapshots.length === 0) {
    return {
      totalReturn: null,
      returnSince7d: null,
      returnSince30d: null,
      maxDrawdown: null,
      executionCount: 0,
      winRate: null,
      sharpeRatio: null,
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const initialPps = snapshots[0].pps;
  const totalReturn = initialPps > 0
    ? ((currentPps - initialPps) / initialPps) * 100
    : null;

  const sevenDaysAgo = now - 7 * 24 * 3600;
  const thirtyDaysAgo = now - 30 * 24 * 3600;

  const ppsAtOrBefore = (targetTime: number): number | null => {
    let closest: PpsSnapshot | null = null;
    for (const s of snapshots) {
      if (s.time <= targetTime) closest = s;
      else break;
    }
    return closest ? closest.pps : null;
  };

  const pps7dAgo = ppsAtOrBefore(sevenDaysAgo);
  const returnSince7d = pps7dAgo !== null && pps7dAgo > 0
    ? ((currentPps - pps7dAgo) / pps7dAgo) * 100
    : null;

  const pps30dAgo = ppsAtOrBefore(thirtyDaysAgo);
  const returnSince30d = pps30dAgo !== null && pps30dAgo > 0
    ? ((currentPps - pps30dAgo) / pps30dAgo) * 100
    : null;

  let peak = snapshots[0].pps;
  let maxDd = 0;
  for (const s of snapshots) {
    if (s.pps > peak) peak = s.pps;
    const dd = peak > 0 ? ((s.pps - peak) / peak) * 100 : 0;
    if (dd < maxDd) maxDd = dd;
  }
  const maxDrawdown = snapshots.length > 1 ? maxDd : null;

  const executionSnapshots = snapshots.filter((s) => s.isExecution);
  const executionCount = executionSnapshots.length;

  let winRate: number | null = null;
  if (executionCount > 0) {
    let wins = 0;
    for (let i = 0; i < snapshots.length; i++) {
      if (!snapshots[i].isExecution) continue;
      const prevPps = i > 0 ? snapshots[i - 1].pps : snapshots[i].pps;
      if (snapshots[i].pps >= prevPps) wins++;
    }
    winRate = (wins / executionCount) * 100;
  }

  let sharpeRatio: number | null = null;
  if (snapshots.length >= 3) {
    const dayMap = new Map<string, number[]>();
    for (let i = 1; i < snapshots.length; i++) {
      const ret = snapshots[i - 1].pps > 0
        ? (snapshots[i].pps - snapshots[i - 1].pps) / snapshots[i - 1].pps
        : 0;
      const dayKey = Math.floor(snapshots[i].time / 86400).toString();
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
      const variance = dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / (dailyReturns.length - 1);
      const stdDev = Math.sqrt(variance);
      if (stdDev > 0) sharpeRatio = (mean / stdDev) * Math.sqrt(365);
    }
  }

  return { totalReturn, returnSince7d, returnSince30d, maxDrawdown, executionCount, winRate, sharpeRatio };
}

export function useVaultPerformance(
  vaultAddress: `0x${string}` | undefined,
  assetDecimals = 18,
): VaultPerformance {
  const { contracts, selectedChainId } = useNetwork();
  const client = usePublicClient({ chainId: selectedChainId });

  const { data, isLoading } = useQuery({
    queryKey: ['vaultPerformance', vaultAddress, selectedChainId, assetDecimals],
    queryFn: async () => {
      if (!client || !vaultAddress) return null;

      // 1. Read current on-chain state — same as useVaultHistory
      const [currentAssets, currentShares] = await Promise.all([
        readTvlOrFallback(client, vaultAddress),
        client.readContract({
          address: vaultAddress,
          abi: KernelVaultABI,
          functionName: 'totalShares',
        }) as Promise<bigint>,
      ]);

      const now = Math.floor(Date.now() / 1000);
      const divisor = 10 ** assetDecimals;
      const currentPps = currentShares > BigInt(0)
        ? Number(currentAssets) / Number(currentShares)
        : 1.0;

      // 2. Fetch historical events — mirrors useVaultHistory exactly
      const snapshots: PpsSnapshot[] = [];

      try {
        type HEvent = HistoryEvent;
        let allEvents: HEvent[] = [];
        let hasTimestamps = false;

        // Primary: Etherscan V2 API
        if (isExplorerAvailable()) {
          try {
            const logs = await fetchVaultLogs(selectedChainId, vaultAddress);
            const toHE = (type: HEvent['type']) => (l: DecodedVaultLog): HEvent => ({
              type, blockNumber: l.blockNumber, logIndex: l.logIndex, timeStamp: l.timeStamp, args: l.args,
            });
            allEvents = [
              ...logs.deposits.map(toHE('deposit')),
              ...logs.withdrawals.map(toHE('withdraw')),
              ...logs.executions.map(toHE('execution')),
            ];
            hasTimestamps = true;
          } catch {
            // Fall through to RPC
          }
        }

        // Fallback: RPC paginated getLogs
        if (allEvents.length === 0) {
          const logClient = getLogsClient(client, selectedChainId);
          const currentBlock = await logClient.getBlockNumber();

          let fromBlock: bigint;
          try {
            fromBlock = await findVaultDeployBlock(
              logClient, contracts.vaultFactory, vaultAddress, currentBlock, selectedChainId,
            );
          } catch {
            fromBlock = BigInt(0);
          }
          if (fromBlock === BigInt(0)) {
            fromBlock = recentFromBlock(currentBlock);
          }

          const [depositLogs, withdrawLogs, executionLogs] = await Promise.all([
            paginatedGetLogs(logClient, { address: vaultAddress, event: depositEvent, fromBlock, toBlock: currentBlock }),
            paginatedGetLogs(logClient, { address: vaultAddress, event: withdrawEvent, fromBlock, toBlock: currentBlock }),
            paginatedGetLogs(logClient, { address: vaultAddress, event: executionAppliedEvent, fromBlock, toBlock: currentBlock }),
          ]);

          const toHE = (type: HEvent['type']) => (log: Log): HEvent => ({
            type, blockNumber: log.blockNumber ?? BigInt(0), logIndex: log.logIndex ?? 0, args: (log as any).args,
          });
          allEvents = [
            ...depositLogs.map(toHE('deposit')),
            ...withdrawLogs.map(toHE('withdraw')),
            ...executionLogs.map(toHE('execution')),
          ];
        }

        // Sort by (blockNumber, logIndex)
        allEvents.sort((a, b) => {
          const blockDiff = Number(a.blockNumber - b.blockNumber);
          return blockDiff !== 0 ? blockDiff : a.logIndex - b.logIndex;
        });

        if (allEvents.length > 0) {
          // Resolve timestamps
          const timestampMap = new Map<string, number>();
          if (hasTimestamps) {
            for (const e of allEvents) {
              if (e.timeStamp) timestampMap.set(e.blockNumber.toString(), e.timeStamp);
            }
          } else {
            const seenBlocks = new Map<string, bigint>();
            allEvents.forEach((e) => seenBlocks.set(e.blockNumber.toString(), e.blockNumber));
            const uniqueBlocks = Array.from(seenBlocks.values());
            for (let i = 0; i < uniqueBlocks.length; i += 20) {
              const batch = uniqueBlocks.slice(i, i + 20);
              try {
                const blocks = await Promise.all(
                  batch.map((blockNumber) => client.getBlock({ blockNumber })),
                );
                blocks.forEach((block, idx) => {
                  timestampMap.set(batch[idx].toString(), Number(block.timestamp));
                });
              } catch {
                // Assign approximate timestamps if getBlock fails
                batch.forEach((bn) => {
                  timestampMap.set(bn.toString(), now - 86400);
                });
              }
            }
          }

          // Compute PPS at each event
          let useArchive = true;
          try {
            await client.readContract({
              address: vaultAddress,
              abi: KernelVaultABI,
              functionName: 'totalAssets',
              blockNumber: allEvents[0].blockNumber,
            });
          } catch {
            useArchive = false;
          }

          if (useArchive) {
            for (const event of allEvents) {
              const timestamp = timestampMap.get(event.blockNumber.toString()) ?? now;

              try {
                const [assets, shares] = await Promise.all([
                  client.readContract({
                    address: vaultAddress,
                    abi: KernelVaultABI,
                    functionName: 'totalAssets',
                    blockNumber: event.blockNumber,
                  }) as Promise<bigint>,
                  client.readContract({
                    address: vaultAddress,
                    abi: KernelVaultABI,
                    functionName: 'totalShares',
                    blockNumber: event.blockNumber,
                  }) as Promise<bigint>,
                ]);

                snapshots.push({
                  time: timestamp,
                  pps: shares > BigInt(0) ? Number(assets) / Number(shares) : 1.0,
                  isExecution: event.type === 'execution',
                });
              } catch {
                // Skip events where archive read fails
              }
            }
          } else {
            let cumulativeAssets = 0;
            let cumulativeShares = 0;

            for (const event of allEvents) {
              const timestamp = timestampMap.get(event.blockNumber.toString()) ?? now;
              const args = event.args;

              if (event.type === 'deposit') {
                cumulativeAssets += Number(args.amount ?? BigInt(0)) / divisor;
                cumulativeShares += Number(args.shares ?? BigInt(0)) / divisor;
              } else if (event.type === 'withdraw') {
                cumulativeAssets -= Number(args.amount ?? BigInt(0)) / divisor;
                cumulativeShares -= Number(args.shares ?? BigInt(0)) / divisor;
              }

              snapshots.push({
                time: timestamp,
                pps: cumulativeShares > 0 ? cumulativeAssets / cumulativeShares : 1.0,
                isExecution: event.type === 'execution',
              });
            }
          }
        }
      } catch {
        // Historical event fetching failed entirely — fall through to live-only
      }

      // 3. Always append live data point (same as useVaultHistory)
      snapshots.push({ time: now, pps: currentPps, isExecution: false });

      return computeMetrics(snapshots, currentPps);
    },
    enabled: !!client && !!vaultAddress,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  return {
    totalReturn: data?.totalReturn ?? null,
    returnSince7d: data?.returnSince7d ?? null,
    returnSince30d: data?.returnSince30d ?? null,
    maxDrawdown: data?.maxDrawdown ?? null,
    executionCount: data?.executionCount ?? 0,
    winRate: data?.winRate ?? null,
    sharpeRatio: data?.sharpeRatio ?? null,
    isLoading,
    error: null,
  };
}
