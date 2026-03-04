'use client';

import { usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { useNetwork } from '@/lib/NetworkContext';
import { paginatedGetLogs, executionAppliedEvent, findVaultDeployBlock, getLogsClient } from '@/lib/vaultEvents';

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

      // Use native RPC for getLogs on chains where third-party RPCs may not support it
      const logClient = getLogsClient(client, selectedChainId);

      const mapLogs = (logs: any[]): ExecutionEvent[] =>
        logs.slice(-10).reverse().map((log: any) => ({
          executionNonce: String(log.args?.executionNonce ?? '0'),
          agentId: log.args?.agentId ?? '0x',
          actionCommitment: log.args?.actionCommitment ?? '0x',
          actionCount: String(log.args?.actionCount ?? '0'),
          transactionHash: log.transactionHash ?? undefined,
          blockNumber: log.blockNumber ? String(log.blockNumber) : undefined,
        }));

      const currentBlock = await logClient.getBlockNumber();
      const fromBlock = await findVaultDeployBlock(
        logClient, contracts.vaultFactory, vaultAddress, currentBlock,
      );
      const logs = await paginatedGetLogs(logClient, {
        address: vaultAddress,
        event: executionAppliedEvent,
        fromBlock,
        toBlock: currentBlock,
      });
      return mapLogs(logs);
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
