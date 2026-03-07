'use client';

import { usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { useNetwork } from '@/lib/NetworkContext';
import {
  paginatedGetLogs,
  executionAppliedEvent,
  optimisticExecutionSubmittedEvent,
  proofSubmittedEvent,
  executionSlashedEvent,
  findVaultDeployBlock,
  getLogsClient,
} from '@/lib/vaultEvents';

export interface ExecutionEvent {
  executionNonce: string;
  agentId: string;
  actionCommitment: string;
  actionCount: string;
  transactionHash?: string;
  blockNumber?: string;
  optimisticStatus?: 'proven' | 'pending' | 'finalized' | 'slashed';
}

export function useVaultExecutions(vaultAddress: `0x${string}` | undefined) {
  const { selectedChainId, contracts } = useNetwork();
  const client = usePublicClient({ chainId: selectedChainId });

  const { data, isLoading, error } = useQuery({
    queryKey: ['vaultExecutions', vaultAddress, selectedChainId],
    queryFn: async (): Promise<ExecutionEvent[]> => {
      if (!client || !vaultAddress) return [];

      const logClient = getLogsClient(client, selectedChainId);
      const currentBlock = await logClient.getBlockNumber();
      const fromBlock = await findVaultDeployBlock(
        logClient, contracts.vaultFactory, vaultAddress, currentBlock,
      );

      const [execLogs, optimisticLogs, proofLogs, slashLogs] = await Promise.all([
        paginatedGetLogs(logClient, {
          address: vaultAddress,
          event: executionAppliedEvent,
          fromBlock,
          toBlock: currentBlock,
        }),
        paginatedGetLogs(logClient, {
          address: vaultAddress,
          event: optimisticExecutionSubmittedEvent,
          fromBlock,
          toBlock: currentBlock,
        }).catch(() => []),
        paginatedGetLogs(logClient, {
          address: vaultAddress,
          event: proofSubmittedEvent,
          fromBlock,
          toBlock: currentBlock,
        }).catch(() => []),
        paginatedGetLogs(logClient, {
          address: vaultAddress,
          event: executionSlashedEvent,
          fromBlock,
          toBlock: currentBlock,
        }).catch(() => []),
      ]);

      // Build optimistic nonce sets
      const optimisticNonces = new Set<string>();
      for (const log of optimisticLogs) {
        const nonce = (log as any).args?.executionNonce;
        if (nonce !== undefined) optimisticNonces.add(String(nonce));
      }

      const proofNonces = new Set<string>();
      for (const log of proofLogs) {
        const nonce = (log as any).args?.executionNonce;
        if (nonce !== undefined) proofNonces.add(String(nonce));
      }

      const slashNonces = new Set<string>();
      for (const log of slashLogs) {
        const nonce = (log as any).args?.executionNonce;
        if (nonce !== undefined) slashNonces.add(String(nonce));
      }

      return execLogs.slice(-10).reverse().map((log: any) => {
        const nonce = String(log.args?.executionNonce ?? '0');

        let optimisticStatus: ExecutionEvent['optimisticStatus'] = 'proven';
        if (optimisticNonces.has(nonce)) {
          if (proofNonces.has(nonce)) {
            optimisticStatus = 'finalized';
          } else if (slashNonces.has(nonce)) {
            optimisticStatus = 'slashed';
          } else {
            optimisticStatus = 'pending';
          }
        }

        return {
          executionNonce: nonce,
          agentId: log.args?.agentId ?? '0x',
          actionCommitment: log.args?.actionCommitment ?? '0x',
          actionCount: String(log.args?.actionCount ?? '0'),
          transactionHash: log.transactionHash ?? undefined,
          blockNumber: log.blockNumber ? String(log.blockNumber) : undefined,
          optimisticStatus,
        };
      });
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
