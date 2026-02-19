'use client';

import { usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { sepolia } from 'wagmi/chains';
import { KERNEL_CONTRACTS, VaultFactoryABI, KernelVaultABI } from '@/lib/contracts';
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

// Max block range per getLogs call (Alchemy supports large ranges)
const MAX_BLOCK_RANGE = BigInt(500_000);

/**
 * Paginated getLogs that splits large ranges into MAX_BLOCK_RANGE chunks.
 */
async function paginatedGetLogs(
  client: any,
  params: { address: `0x${string}`; event: any; args?: any; fromBlock: bigint; toBlock: bigint },
): Promise<Log[]> {
  const { fromBlock, toBlock, ...rest } = params;
  const results: Log[] = [];

  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end = cursor + MAX_BLOCK_RANGE > toBlock ? toBlock : cursor + MAX_BLOCK_RANGE;
    const logs = await client.getLogs({ ...rest, fromBlock: cursor, toBlock: end });
    results.push(...(logs as Log[]));
    cursor = end + BigInt(1);
  }

  return results;
}

export function useVaultHistory(vaultAddress: `0x${string}` | undefined): VaultHistoryData {
  const client = usePublicClient({ chainId: sepolia.id });

  const { data, isLoading, error } = useQuery({
    queryKey: ['vaultHistory', vaultAddress],
    queryFn: async () => {
      if (!client || !vaultAddress) return { tvl: [], pps: [] };

      const currentBlock = await client.getBlockNumber();

      // Step 1: Find deployment block via VaultDeployed event
      // VaultFactory deployed at block ~10,107,378 (Dec 31, 2024)
      // Use that as earliest possible block to avoid scanning pre-deployment history
      const FACTORY_DEPLOY_BLOCK = BigInt(10_100_000);
      const searchFrom = currentBlock > FACTORY_DEPLOY_BLOCK ? FACTORY_DEPLOY_BLOCK : BigInt(0);

      let fromBlock = searchFrom;
      try {
        const deployLogs = await paginatedGetLogs(client, {
          address: KERNEL_CONTRACTS.vaultFactory as `0x${string}`,
          event: {
            type: 'event',
            name: 'VaultDeployed',
            inputs: [
              { name: 'vault', type: 'address', indexed: true },
              { name: 'owner', type: 'address', indexed: true },
              { name: 'agentId', type: 'bytes32', indexed: true },
              { name: 'asset', type: 'address', indexed: false },
              { name: 'trustedImageId', type: 'bytes32', indexed: false },
              { name: 'salt', type: 'bytes32', indexed: false },
            ],
          },
          args: { vault: vaultAddress },
          fromBlock: searchFrom,
          toBlock: currentBlock,
        });

        if (deployLogs.length > 0) {
          fromBlock = deployLogs[0].blockNumber ?? searchFrom;
        }
      } catch {
        // VaultDeployed lookup failed — proceed with searchFrom
      }

      // Step 2: Fetch Deposit, Withdraw, ExecutionApplied events in parallel
      const depositEvent = {
        type: 'event' as const,
        name: 'Deposit' as const,
        inputs: [
          { name: 'sender', type: 'address' as const, indexed: true },
          { name: 'amount', type: 'uint256' as const, indexed: false },
          { name: 'shares', type: 'uint256' as const, indexed: false },
        ],
      };

      const withdrawEvent = {
        type: 'event' as const,
        name: 'Withdraw' as const,
        inputs: [
          { name: 'sender', type: 'address' as const, indexed: true },
          { name: 'amount', type: 'uint256' as const, indexed: false },
          { name: 'shares', type: 'uint256' as const, indexed: false },
        ],
      };

      const executionEvent = {
        type: 'event' as const,
        name: 'ExecutionApplied' as const,
        inputs: [
          { name: 'agentId', type: 'bytes32' as const, indexed: true },
          { name: 'executionNonce', type: 'uint64' as const, indexed: true },
          { name: 'actionCommitment', type: 'bytes32' as const, indexed: false },
          { name: 'actionCount', type: 'uint256' as const, indexed: false },
        ],
      };

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
          event: executionEvent,
          fromBlock,
          toBlock: currentBlock,
        }),
      ]);

      // Step 3: Merge and sort all events by (blockNumber, logIndex)
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

      // Even with no historical events, still show a live data point
      if (allEvents.length === 0) {
        const [currentTvl, currentAssets, currentShares] = await Promise.all([
          client.readContract({
            address: vaultAddress,
            abi: KernelVaultABI,
            functionName: 'totalValueLocked',
          }) as Promise<bigint>,
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
        const tvl = Number(currentTvl) / 1e18;
        const pps = currentShares > BigInt(0) ? Number(currentAssets) / Number(currentShares) : 1.0;

        // Only show a point if there's actually value in the vault
        if (tvl > 0) {
          return {
            tvl: [{ time: now, value: tvl }],
            pps: [{ time: now, value: pps }],
          };
        }
        return { tvl: [], pps: [] };
      }

      // Step 4: Fetch block timestamps for unique blocks
      const seenBlocks = new Map<string, bigint>();
      allEvents.forEach((e) => {
        const bn = e.log.blockNumber!;
        seenBlocks.set(bn.toString(), bn);
      });
      const uniqueBlocks = Array.from(seenBlocks.values());
      const timestampMap = new Map<string, number>();

      // Batch fetch block headers (20 at a time)
      for (let i = 0; i < uniqueBlocks.length; i += 20) {
        const batch = uniqueBlocks.slice(i, i + 20);
        const blocks = await Promise.all(
          batch.map((blockNumber) => client.getBlock({ blockNumber })),
        );
        blocks.forEach((block, idx) => {
          timestampMap.set(batch[idx].toString(), Number(block.timestamp));
        });
      }

      // Step 5: Compute TVL + PPS at each event
      const tvlPoints: TimeSeriesPoint[] = [];
      const ppsPoints: TimeSeriesPoint[] = [];

      let useArchive = true;

      // Test archive node availability with the first event
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
        // Archive node path: read totalValueLocked for TVL, totalAssets/totalShares for PPS
        for (const event of allEvents) {
          const blockNumber = event.log.blockNumber!;
          const timestamp = timestampMap.get(blockNumber.toString())!;

          const [tvlVal, assets, shares] = await Promise.all([
            client.readContract({
              address: vaultAddress,
              abi: KernelVaultABI,
              functionName: 'totalValueLocked',
              blockNumber,
            }) as Promise<bigint>,
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

          const tvl = Number(tvlVal) / 1e18;
          const pps = shares > BigInt(0) ? Number(assets) / Number(shares) : 1.0;

          tvlPoints.push({ time: timestamp, value: tvl });
          ppsPoints.push({ time: timestamp, value: pps });
        }
      } else {
        // Fallback: cumulative tracking from events
        let cumulativeAssets = 0;
        let cumulativeShares = 0;

        for (const event of allEvents) {
          const timestamp = timestampMap.get(event.log.blockNumber!.toString())!;
          const args = (event.log as any).args;

          if (event.type === 'deposit') {
            const amount = Number(args.amount ?? BigInt(0)) / 1e18;
            const shares = Number(args.shares ?? BigInt(0)) / 1e18;
            cumulativeAssets += amount;
            cumulativeShares += shares;
          } else if (event.type === 'withdraw') {
            const amount = Number(args.amount ?? BigInt(0)) / 1e18;
            const shares = Number(args.shares ?? BigInt(0)) / 1e18;
            cumulativeAssets -= amount;
            cumulativeShares -= shares;
          }
          // ExecutionApplied: keep values unchanged (PPS stays flat without archive)

          const pps = cumulativeShares > 0 ? cumulativeAssets / cumulativeShares : 1.0;

          tvlPoints.push({ time: timestamp, value: cumulativeAssets });
          ppsPoints.push({ time: timestamp, value: pps });
        }
      }

      // Step 6: Append live data point
      const [currentTvl, currentAssets, currentShares] = await Promise.all([
        client.readContract({
          address: vaultAddress,
          abi: KernelVaultABI,
          functionName: 'totalValueLocked',
        }) as Promise<bigint>,
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
      const liveTvl = Number(currentTvl) / 1e18;
      const livePps = currentShares > BigInt(0) ? Number(currentAssets) / Number(currentShares) : 1.0;

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
