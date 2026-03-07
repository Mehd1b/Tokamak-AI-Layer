'use client';

import { usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { useNetwork } from '@/lib/NetworkContext';
import {
  paginatedGetLogs,
  optimisticExecutionSubmittedEvent,
  proofSubmittedEvent,
  executionSlashedEvent,
  findVaultDeployBlock,
  getLogsClient,
} from '@/lib/vaultEvents';

export interface OptimisticExecution {
  executionNonce: bigint;
  journalHash: string;
  bondAmount: bigint;
  deadline: bigint;
  status: 'pending' | 'finalized' | 'slashed';
  transactionHash?: string;
  blockNumber?: string;
  proofSubmittedBy?: string;
  slashedBy?: string;
}

export function useOptimisticExecutions(vaultAddress: `0x${string}` | undefined, enabled = true) {
  const { selectedChainId, contracts } = useNetwork();
  const client = usePublicClient({ chainId: selectedChainId });

  const { data, isLoading, error } = useQuery({
    queryKey: ['optimisticExecutions', vaultAddress, selectedChainId],
    queryFn: async (): Promise<OptimisticExecution[]> => {
      if (!client || !vaultAddress) return [];

      const logClient = getLogsClient(client, selectedChainId);
      const currentBlock = await logClient.getBlockNumber();
      const fromBlock = await findVaultDeployBlock(
        logClient, contracts.vaultFactory, vaultAddress, currentBlock,
      );

      const [submitLogs, proofLogs, slashLogs] = await Promise.all([
        paginatedGetLogs(logClient, {
          address: vaultAddress,
          event: optimisticExecutionSubmittedEvent,
          fromBlock,
          toBlock: currentBlock,
        }),
        paginatedGetLogs(logClient, {
          address: vaultAddress,
          event: proofSubmittedEvent,
          fromBlock,
          toBlock: currentBlock,
        }),
        paginatedGetLogs(logClient, {
          address: vaultAddress,
          event: executionSlashedEvent,
          fromBlock,
          toBlock: currentBlock,
        }),
      ]);

      // Build lookup maps for proof and slash events
      const proofMap = new Map<string, any>();
      for (const log of proofLogs) {
        const args = (log as any).args;
        if (args?.executionNonce !== undefined) {
          proofMap.set(String(args.executionNonce), args);
        }
      }

      const slashMap = new Map<string, any>();
      for (const log of slashLogs) {
        const args = (log as any).args;
        if (args?.executionNonce !== undefined) {
          slashMap.set(String(args.executionNonce), args);
        }
      }

      return submitLogs.map((log: any) => {
        const args = log.args;
        const nonceKey = String(args.executionNonce);

        let status: 'pending' | 'finalized' | 'slashed' = 'pending';
        let proofSubmittedBy: string | undefined;
        let slashedBy: string | undefined;

        if (proofMap.has(nonceKey)) {
          status = 'finalized';
          proofSubmittedBy = proofMap.get(nonceKey)?.submitter;
        } else if (slashMap.has(nonceKey)) {
          status = 'slashed';
          slashedBy = slashMap.get(nonceKey)?.slasher;
        }

        return {
          executionNonce: args.executionNonce,
          journalHash: args.journalHash ?? '0x',
          bondAmount: args.bondAmount ?? BigInt(0),
          deadline: args.deadline ?? BigInt(0),
          status,
          transactionHash: log.transactionHash ?? undefined,
          blockNumber: log.blockNumber ? String(log.blockNumber) : undefined,
          proofSubmittedBy,
          slashedBy,
        };
      }).reverse();
    },
    enabled: !!client && !!vaultAddress && enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  return {
    executions: data ?? [],
    isLoading,
    error: error as Error | null,
  };
}
