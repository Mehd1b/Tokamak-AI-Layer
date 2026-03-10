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

export interface TimeSeriesPoint {
  time: number;
  value: number;
}

export interface VaultHistoryData {
  tvl: TimeSeriesPoint[];
  pps: TimeSeriesPoint[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * Try reading totalValueLocked(); fall back to totalAssets() for old vaults.
 */
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

export function useVaultHistory(vaultAddress: `0x${string}` | undefined, assetDecimals = 18): VaultHistoryData {
  const { contracts, selectedChainId } = useNetwork();
  const client = usePublicClient({ chainId: selectedChainId });

  const { data, isLoading, error } = useQuery({
    queryKey: ['vaultHistory', vaultAddress, selectedChainId, assetDecimals],
    queryFn: async () => {
      if (!client || !vaultAddress) return { tvl: [], pps: [] };

      // Always read current on-chain state first — this works on any RPC
      const [currentTvl, currentAssets, currentShares] = await Promise.all([
        readTvlOrFallback(client, vaultAddress),
        client.readContract({
          address: vaultAddress,
          abi: KernelVaultABI,
          functionName: 'totalAssets',
        }) as Promise<bigint>,
        client.readContract({
          address: vaultAddress,
          abi: KernelVaultABI,
          functionName: 'totalShares',
        }) as Promise<bigint>,
      ]);

      const now = Math.floor(Date.now() / 1000);
      const divisor = 10 ** assetDecimals;
      const liveTvl = Number(currentTvl) / divisor;
      const livePps = currentShares > BigInt(0) ? Number(currentAssets) / Number(currentShares) : 1.0;

      // Try to fetch historical events for richer chart data
      const tvlPoints: TimeSeriesPoint[] = [];
      const ppsPoints: TimeSeriesPoint[] = [];

      try {
        // Unified event shape used by both explorer and RPC paths
        type HistoryEvent = { type: 'deposit' | 'withdraw' | 'execution'; blockNumber: bigint; logIndex: number; timeStamp?: number; args: any };
        let allEvents: HistoryEvent[] = [];
        let hasTimestamps = false;

        // ── Primary: Etherscan V2 API (all events, any age, includes timestamps) ──
        if (isExplorerAvailable()) {
          try {
            const logs = await fetchVaultLogs(selectedChainId, vaultAddress);
            const toHistoryEvent = (type: HistoryEvent['type']) => (l: DecodedVaultLog): HistoryEvent => ({
              type, blockNumber: l.blockNumber, logIndex: l.logIndex, timeStamp: l.timeStamp, args: l.args,
            });
            allEvents = [
              ...logs.deposits.map(toHistoryEvent('deposit')),
              ...logs.withdrawals.map(toHistoryEvent('withdraw')),
              ...logs.executions.map(toHistoryEvent('execution')),
            ];
            hasTimestamps = true;
          } catch {
            // Fall through to RPC
          }
        }

        // ── Fallback: RPC paginated getLogs ──
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

          const toHistoryEvent = (type: HistoryEvent['type']) => (log: Log): HistoryEvent => ({
            type, blockNumber: log.blockNumber ?? BigInt(0), logIndex: log.logIndex ?? 0, args: (log as any).args,
          });
          allEvents = [
            ...depositLogs.map(toHistoryEvent('deposit')),
            ...withdrawLogs.map(toHistoryEvent('withdraw')),
            ...executionLogs.map(toHistoryEvent('execution')),
          ];
        }

        // Sort by (blockNumber, logIndex)
        allEvents.sort((a, b) => {
          const blockDiff = Number(a.blockNumber - b.blockNumber);
          return blockDiff !== 0 ? blockDiff : a.logIndex - b.logIndex;
        });

        if (allEvents.length > 0) {
          // Resolve timestamps — use explorer timestamps if available, else fetch blocks
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
              const blocks = await Promise.all(
                batch.map((blockNumber) => client.getBlock({ blockNumber })),
              );
              blocks.forEach((block, idx) => {
                timestampMap.set(batch[idx].toString(), Number(block.timestamp));
              });
            }
          }

          // Compute TVL + PPS at each event
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
              const blockNumber = event.blockNumber;
              const timestamp = timestampMap.get(blockNumber.toString())!;

              const [tvlVal, assets, shares] = await Promise.all([
                readTvlOrFallback(client, vaultAddress, blockNumber),
                client.readContract({
                  address: vaultAddress,
                  abi: KernelVaultABI,
                  functionName: 'totalAssets',
                  blockNumber,
                }) as Promise<bigint>,
                client.readContract({
                  address: vaultAddress,
                  abi: KernelVaultABI,
                  functionName: 'totalShares',
                  blockNumber,
                }) as Promise<bigint>,
              ]);

              tvlPoints.push({ time: timestamp, value: Number(tvlVal) / divisor });
              ppsPoints.push({ time: timestamp, value: shares > BigInt(0) ? Number(assets) / Number(shares) : 1.0 });
            }
          } else {
            let cumulativeAssets = 0;
            let cumulativeShares = 0;

            for (const event of allEvents) {
              const timestamp = timestampMap.get(event.blockNumber.toString())!;
              const args = event.args;

              if (event.type === 'deposit') {
                cumulativeAssets += Number(args.amount ?? BigInt(0)) / divisor;
                cumulativeShares += Number(args.shares ?? BigInt(0)) / divisor;
              } else if (event.type === 'withdraw') {
                cumulativeAssets -= Number(args.amount ?? BigInt(0)) / divisor;
                cumulativeShares -= Number(args.shares ?? BigInt(0)) / divisor;
              }

              tvlPoints.push({ time: timestamp, value: cumulativeAssets });
              ppsPoints.push({ time: timestamp, value: cumulativeShares > 0 ? cumulativeAssets / cumulativeShares : 1.0 });
            }
          }
        }
      } catch {
        // Historical event fetching failed — fall through to live-only data point
      }

      // Always append live data point
      tvlPoints.push({ time: now, value: liveTvl });
      ppsPoints.push({ time: now, value: livePps });

      return { tvl: tvlPoints, pps: ppsPoints };
    },
    enabled: !!client && !!vaultAddress,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    tvl: data?.tvl ?? [],
    pps: data?.pps ?? [],
    isLoading,
    error: error as Error | null,
  };
}
