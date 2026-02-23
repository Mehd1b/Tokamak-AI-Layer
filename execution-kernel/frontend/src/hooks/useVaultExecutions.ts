'use client';

import { usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { useNetwork } from '@/lib/NetworkContext';
import { paginatedGetLogs, executionAppliedEvent, findVaultDeployBlock } from '@/lib/vaultEvents';

export interface ExecutionEvent {
  executionNonce: string;
  agentId: string;
  actionCommitment: string;
  actionCount: string;
  transactionHash?: string;
  blockNumber?: string;
}

export function useVaultExecutions(vaultAddress: `0x${string}` | undefined) {
  const { selectedChainId, contracts } = useNetwork();
  const client = usePublicClient({ chainId: selectedChainId });

  const { data, isLoading, error } = useQuery({
    queryKey: ['vaultExecutions', vaultAddress, selectedChainId],
    queryFn: async (): Promise<ExecutionEvent[]> => {
      if (!client || !vaultAddress) return [];

      try {
        const currentBlock = await client.getBlockNumber();

        // Find vault deploy block dynamically — works on any chain
        const fromBlock = await findVaultDeployBlock(
          client, contracts.vaultFactory, vaultAddress, currentBlock,
        );

        const logs = await paginatedGetLogs(client, {
          address: vaultAddress,
          event: executionAppliedEvent,
          fromBlock,
          toBlock: currentBlock,
        });

        // Take last 10, sorted newest-first
        const recent = logs.slice(-10).reverse();

        return recent.map((log: any) => ({
          executionNonce: String(log.args.executionNonce ?? '0'),
          agentId: log.args.agentId ?? '0x',
          actionCommitment: log.args.actionCommitment ?? '0x',
          actionCount: String(log.args.actionCount ?? '0'),
          transactionHash: log.transactionHash ?? undefined,
          blockNumber: log.blockNumber ? String(log.blockNumber) : undefined,
        }));
      } catch {
        // Some RPCs (e.g. HyperEVM) have limited getLogs support
        return [];
      }
    },
    enabled: !!client && !!vaultAddress,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    executions: data ?? [],
    isLoading,
    error: error as Error | null,
  };
}
