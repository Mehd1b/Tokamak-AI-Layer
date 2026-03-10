'use client';

import { usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { useNetwork } from '@/lib/NetworkContext';
import { isExplorerAvailable, fetchVaultLogs } from '@/lib/explorerApi';
import {
  paginatedGetLogs,
  optimisticExecutionSubmittedEvent,
  proofSubmittedEvent,
  executionSlashedEvent,
  findVaultDeployBlock,
  recentFromBlock,
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

async function fetchViaExplorer(
  chainId: number,
  vaultAddress: `0x${string}`,
): Promise<OptimisticExecution[]> {
  const logs = await fetchVaultLogs(chainId, vaultAddress);

  const proofMap = new Map<string, any>();
  for (const log of logs.proofs) {
    proofMap.set(String(log.args.executionNonce), log.args);
  }

  const slashMap = new Map<string, any>();
  for (const log of logs.slashes) {
    slashMap.set(String(log.args.executionNonce), log.args);
  }

  return logs.optimisticSubmissions.map((log) => {
    const nonceKey = String(log.args.executionNonce);

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
      executionNonce: log.args.executionNonce,
      journalHash: log.args.journalHash ?? '0x',
      bondAmount: log.args.bondAmount ?? BigInt(0),
      deadline: log.args.deadline ?? BigInt(0),
      status,
      transactionHash: log.transactionHash ?? undefined,
      blockNumber: log.blockNumber ? String(log.blockNumber) : undefined,
      proofSubmittedBy,
      slashedBy,
    };
  }).reverse();
}

async function fetchViaRpc(
  logClient: any,
  vaultAddress: `0x${string}`,
  factoryAddress: `0x${string}`,
  chainId: number,
): Promise<OptimisticExecution[]> {
  const currentBlock = await logClient.getBlockNumber();

  let fromBlock: bigint;
  try {
    fromBlock = await findVaultDeployBlock(
      logClient, factoryAddress, vaultAddress, currentBlock, chainId,
    );
  } catch {
    fromBlock = BigInt(0);
  }
  if (fromBlock === BigInt(0)) {
    fromBlock = recentFromBlock(currentBlock);
  }

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
}

export function useOptimisticExecutions(vaultAddress: `0x${string}` | undefined, enabled = true) {
  const { selectedChainId, contracts } = useNetwork();
  const client = usePublicClient({ chainId: selectedChainId });

  const { data, isLoading, error } = useQuery({
    queryKey: ['optimisticExecutions', vaultAddress, selectedChainId],
    queryFn: async (): Promise<OptimisticExecution[]> => {
      if (!client || !vaultAddress) return [];

      // Primary: Etherscan V2 API
      if (isExplorerAvailable()) {
        try {
          return await fetchViaExplorer(selectedChainId, vaultAddress);
        } catch {
          // Fall through to RPC
        }
      }

      // Fallback: RPC paginated getLogs
      const logClient = getLogsClient(client, selectedChainId);
      return fetchViaRpc(logClient, vaultAddress, contracts.vaultFactory, selectedChainId);
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
