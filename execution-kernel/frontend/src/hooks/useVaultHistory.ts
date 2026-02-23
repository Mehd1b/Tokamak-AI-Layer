'use client';

import { usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { KernelVaultABI } from '@/lib/contracts';
import { useNetwork } from '@/lib/NetworkContext';
import {
  paginatedGetLogs,
  depositEvent,
  withdrawEvent,
  executionAppliedEvent,
  findVaultDeployBlock,
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
      // Some RPCs (e.g. HyperEVM) have limited getLogs support, so wrap in try/catch
      const tvlPoints: TimeSeriesPoint[] = [];
      const ppsPoints: TimeSeriesPoint[] = [];

      try {
        const currentBlock = await client.getBlockNumber();

        // Find vault deploy block dynamically — works on any chain
        const fromBlock = await findVaultDeployBlock(
          client, contracts.vaultFactory, vaultAddress, currentBlock,
        );

        // Fetch Deposit, Withdraw, ExecutionApplied events in parallel
        const [depositLogs, withdrawLogs, executionLogs] = await Promise.all([
          paginatedGetLogs(client, {
            address: vaultAddress,
            event: depositEvent,
            fromBlock,
            toBlock: currentBlock,
          }),
          paginatedGetLogs(client, {
            address: vaultAddress,
            event: withdrawEvent,
            fromBlock,
            toBlock: currentBlock,
          }),
          paginatedGetLogs(client, {
            address: vaultAddress,
            event: executionAppliedEvent,
            fromBlock,
            toBlock: currentBlock,
          }),
        ]);

        // Merge and sort all events by (blockNumber, logIndex)
        type TaggedLog = { type: 'deposit' | 'withdraw' | 'execution'; log: Log };
        const allEvents: TaggedLog[] = [
          ...depositLogs.map((log) => ({ type: 'deposit' as const, log })),
          ...withdrawLogs.map((log) => ({ type: 'withdraw' as const, log })),
          ...executionLogs.map((log) => ({ type: 'execution' as const, log })),
        ];

        allEvents.sort((a, b) => {
          const blockDiff = Number((a.log.blockNumber ?? BigInt(0)) - (b.log.blockNumber ?? BigInt(0)));
          if (blockDiff !== 0) return blockDiff;
          return Number((a.log.logIndex ?? 0) - (b.log.logIndex ?? 0));
        });

        if (allEvents.length > 0) {
          // Fetch block timestamps for unique blocks
          const seenBlocks = new Map<string, bigint>();
          allEvents.forEach((e) => {
            const bn = e.log.blockNumber!;
            seenBlocks.set(bn.toString(), bn);
          });
          const uniqueBlocks = Array.from(seenBlocks.values());
          const timestampMap = new Map<string, number>();

          for (let i = 0; i < uniqueBlocks.length; i += 20) {
            const batch = uniqueBlocks.slice(i, i + 20);
            const blocks = await Promise.all(
              batch.map((blockNumber) => client.getBlock({ blockNumber })),
            );
            blocks.forEach((block, idx) => {
              timestampMap.set(batch[idx].toString(), Number(block.timestamp));
            });
          }

          // Compute TVL + PPS at each event
          let useArchive = true;
          try {
            await client.readContract({
              address: vaultAddress,
              abi: KernelVaultABI,
              functionName: 'totalAssets',
              blockNumber: allEvents[0].log.blockNumber!,
            });
          } catch {
            useArchive = false;
          }

          if (useArchive) {
            for (const event of allEvents) {
              const blockNumber = event.log.blockNumber!;
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
              const timestamp = timestampMap.get(event.log.blockNumber!.toString())!;
              const args = (event.log as any).args;

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
        // Historical event fetching failed (e.g. RPC doesn't support getLogs well)
        // Fall through to live-only data point below
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
