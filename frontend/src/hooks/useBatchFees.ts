'use client';

import { usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { KernelVaultABI } from '@/lib/contracts';
import { useNetwork } from '@/lib/NetworkContext';

export interface BatchFee {
  managementFeeBps: number;
  performanceFeeBps: number;
}

/**
 * Batch-read management + performance fee bps for a list of vaults via
 * multicall. Mirrors the useBatchPerformance pattern in vaults/page.tsx so the
 * listing can display fee info without making N individual RPC calls.
 */
export function useBatchFees(vaultAddresses: `0x${string}`[]) {
  const { selectedChainId } = useNetwork();
  const client = usePublicClient({ chainId: selectedChainId });

  return useQuery<Record<string, BatchFee>>({
    queryKey: ['batchFees', selectedChainId, vaultAddresses.join(',')],
    queryFn: async () => {
      if (!client || vaultAddresses.length === 0) return {};

      const mgmtCalls = vaultAddresses.map((addr) => ({
        address: addr,
        abi: KernelVaultABI,
        functionName: 'managementFeeBps' as const,
      }));
      const perfCalls = vaultAddresses.map((addr) => ({
        address: addr,
        abi: KernelVaultABI,
        functionName: 'performanceFeeBps' as const,
      }));

      let mgmtResults: any[] = [];
      let perfResults: any[] = [];
      try {
        [mgmtResults, perfResults] = await Promise.all([
          client.multicall({ contracts: mgmtCalls }),
          client.multicall({ contracts: perfCalls }),
        ]);
      } catch {
        return {};
      }

      const result: Record<string, BatchFee> = {};
      for (let i = 0; i < vaultAddresses.length; i++) {
        const addr = vaultAddresses[i].toLowerCase();
        const mgmt = mgmtResults[i];
        const perf = perfResults[i];
        result[addr] = {
          managementFeeBps: mgmt?.status === 'success' ? Number(mgmt.result) : 0,
          performanceFeeBps: perf?.status === 'success' ? Number(perf.result) : 0,
        };
      }
      return result;
    },
    enabled: !!client && vaultAddresses.length > 0,
    staleTime: 60_000,
  });
}
