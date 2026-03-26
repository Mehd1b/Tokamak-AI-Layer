'use client';

import { usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { KernelVaultABI, VaultFactoryABI } from '@/lib/contracts';
import { useNetwork } from '@/lib/NetworkContext';

export interface ProtocolStats {
  totalTVL: bigint;
  activeVaults: number;
  verifiedExecutions: number;
  totalDepositors: number;
  isLoading: boolean;
  error: Error | null;
}

const DepositEvent = {
  type: 'event',
  name: 'Deposited',
  inputs: [
    { type: 'address', name: 'depositor', indexed: true },
    { type: 'uint256', name: 'assets' },
    { type: 'uint256', name: 'shares' },
  ],
} as const;

/**
 * Aggregates on-chain data across all deployed vaults:
 * - Total TVL (sum of totalValueLocked across all vaults)
 * - Number of active vaults (vaults with TVL > 0)
 * - Total verified executions (sum of lastExecutionNonce across all vaults)
 * - Total unique depositors (unique addresses from Deposited events)
 */
export function useProtocolStats(): ProtocolStats {
  const { contracts, selectedChainId } = useNetwork();
  const client = usePublicClient({ chainId: selectedChainId });

  const { data, isLoading, error } = useQuery({
    queryKey: ['protocolStats', selectedChainId],
    queryFn: async (): Promise<Omit<ProtocolStats, 'isLoading' | 'error'>> => {
      if (!client) {
        return { totalTVL: 0n, activeVaults: 0, verifiedExecutions: 0, totalDepositors: 0 };
      }

      // 1. Get all vault addresses
      const vaultAddresses = await client.readContract({
        address: contracts.vaultFactory,
        abi: VaultFactoryABI,
        functionName: 'getAllVaults',
      }) as `0x${string}`[];

      if (vaultAddresses.length === 0) {
        return { totalTVL: 0n, activeVaults: 0, verifiedExecutions: 0, totalDepositors: 0 };
      }

      // 2. Batch-read TVL and lastExecutionNonce for each vault
      const tvlCalls = vaultAddresses.map((addr) => ({
        address: addr,
        abi: KernelVaultABI,
        functionName: 'totalValueLocked' as const,
      }));

      const nonceCalls = vaultAddresses.map((addr) => ({
        address: addr,
        abi: KernelVaultABI,
        functionName: 'lastExecutionNonce' as const,
      }));

      const [tvlResults, nonceResults] = await Promise.all([
        client.multicall({ contracts: tvlCalls }).catch(() =>
          tvlCalls.map(() => ({ status: 'failure' as const, result: undefined, error: new Error('multicall failed') }))
        ),
        client.multicall({ contracts: nonceCalls }).catch(() =>
          nonceCalls.map(() => ({ status: 'failure' as const, result: undefined, error: new Error('multicall failed') }))
        ),
      ]);

      let totalTVL = 0n;
      let activeVaults = 0;
      let verifiedExecutions = 0;

      for (let i = 0; i < vaultAddresses.length; i++) {
        const tvl = tvlResults[i]?.status === 'success' ? (tvlResults[i].result as bigint) : 0n;
        const nonce = nonceResults[i]?.status === 'success' ? Number(nonceResults[i].result) : 0;

        totalTVL += tvl;
        if (tvl > 0n) activeVaults++;
        verifiedExecutions += nonce;
      }

      // 3. Count unique depositors across all vaults via Deposited events
      //    This is best-effort — if event fetching fails, we return 0.
      let totalDepositors = 0;
      try {
        const depositors = new Set<string>();
        for (const vaultAddr of vaultAddresses) {
          try {
            const logs = await client.getLogs({
              address: vaultAddr,
              event: DepositEvent,
              fromBlock: 0n,
              toBlock: 'latest',
            });
            for (const log of logs) {
              if (log.args?.depositor) {
                depositors.add(log.args.depositor.toLowerCase());
              }
            }
          } catch {
            // Skip vaults where log fetching fails (RPC limits)
          }
        }
        totalDepositors = depositors.size;
      } catch {
        // Best-effort: depositor count unavailable
      }

      return { totalTVL, activeVaults, verifiedExecutions, totalDepositors };
    },
    enabled: !!client,
    staleTime: 60_000, // 1 min — stats don't change rapidly
    refetchOnWindowFocus: false,
  });

  return {
    totalTVL: data?.totalTVL ?? 0n,
    activeVaults: data?.activeVaults ?? 0,
    verifiedExecutions: data?.verifiedExecutions ?? 0,
    totalDepositors: data?.totalDepositors ?? 0,
    isLoading,
    error: error as Error | null,
  };
}
