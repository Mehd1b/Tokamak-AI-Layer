'use client';

import { usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { useNetwork } from '@/lib/NetworkContext';
import {
  isExplorerAvailable,
  fetchVaultLogs,
  fetchVaultTxActions,
  decodeExecuteTxActions,
  type ParsedAction,
} from '@/lib/explorerApi';
import {
  paginatedGetLogs,
  executionAppliedEvent,
  optimisticExecutionSubmittedEvent,
  proofSubmittedEvent,
  executionSlashedEvent,
  findVaultDeployBlock,
  recentFromBlock,
  getLogsClient,
} from '@/lib/vaultEvents';

export interface ActionInfo {
  actionType: number;
  label: string;
}

export interface ExecutionEvent {
  executionNonce: string;
  actionCommitment: string;
  actionCount: string;
  actions: ActionInfo[];
  transactionHash?: string;
  blockNumber?: string;
  timestamp?: number;
  optimisticStatus?: 'proven' | 'pending' | 'finalized' | 'slashed';
}

/**
 * Primary path: Etherscan V2 API.
 * Fetches event logs + tx list in parallel, decodes agentOutput from execute() txs.
 */
async function fetchViaExplorer(
  chainId: number,
  vaultAddress: `0x${string}`,
): Promise<ExecutionEvent[]> {
  const [logs, txActions] = await Promise.all([
    fetchVaultLogs(chainId, vaultAddress),
    fetchVaultTxActions(chainId, vaultAddress).catch(() => new Map<string, ParsedAction[]>()),
  ]);

  const optimisticNonces = new Set(logs.optimisticSubmissions.map((l) => String(l.args.executionNonce)));
  const proofNonces = new Set(logs.proofs.map((l) => String(l.args.executionNonce)));
  const slashNonces = new Set(logs.slashes.map((l) => String(l.args.executionNonce)));

  return logs.executions.reverse().map((log) => {
    const nonce = String(log.args.executionNonce ?? '0');

    let optimisticStatus: ExecutionEvent['optimisticStatus'] = 'proven';
    if (optimisticNonces.has(nonce)) {
      if (proofNonces.has(nonce)) optimisticStatus = 'finalized';
      else if (slashNonces.has(nonce)) optimisticStatus = 'slashed';
      else optimisticStatus = 'pending';
    }

    // Resolve actions from decoded tx calldata
    const txHash = log.transactionHash?.toLowerCase();
    const parsedActions = txHash ? txActions.get(txHash) : undefined;
    const actions: ActionInfo[] = parsedActions
      ? parsedActions.map((a) => ({ actionType: a.actionType, label: a.label }))
      : [];

    return {
      executionNonce: nonce,
      actionCommitment: log.args.actionCommitment ?? '0x',
      actionCount: String(log.args.actionCount ?? '0'),
      actions,
      transactionHash: log.transactionHash ?? undefined,
      blockNumber: log.blockNumber ? String(log.blockNumber) : undefined,
      timestamp: log.timeStamp || undefined,
      optimisticStatus,
    };
  });
}

/**
 * Fallback path: RPC paginated getLogs.
 * No function name resolution — shows generic action type labels.
 */
async function fetchViaRpc(
  client: any,
  logClient: any,
  vaultAddress: `0x${string}`,
  factoryAddress: `0x${string}`,
  chainId: number,
): Promise<ExecutionEvent[]> {
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

  const [execLogs, optimisticLogs, proofLogs, slashLogs] = await Promise.all([
    paginatedGetLogs(logClient, {
      address: vaultAddress, event: executionAppliedEvent, fromBlock, toBlock: currentBlock,
    }),
    paginatedGetLogs(logClient, {
      address: vaultAddress, event: optimisticExecutionSubmittedEvent, fromBlock, toBlock: currentBlock,
    }).catch(() => []),
    paginatedGetLogs(logClient, {
      address: vaultAddress, event: proofSubmittedEvent, fromBlock, toBlock: currentBlock,
    }).catch(() => []),
    paginatedGetLogs(logClient, {
      address: vaultAddress, event: executionSlashedEvent, fromBlock, toBlock: currentBlock,
    }).catch(() => []),
  ]);

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

  return execLogs.reverse().map((log: any) => {
    const nonce = String(log.args?.executionNonce ?? '0');

    let optimisticStatus: ExecutionEvent['optimisticStatus'] = 'proven';
    if (optimisticNonces.has(nonce)) {
      if (proofNonces.has(nonce)) optimisticStatus = 'finalized';
      else if (slashNonces.has(nonce)) optimisticStatus = 'slashed';
      else optimisticStatus = 'pending';
    }

    return {
      executionNonce: nonce,
      actionCommitment: log.args?.actionCommitment ?? '0x',
      actionCount: String(log.args?.actionCount ?? '0'),
      actions: [],
      transactionHash: log.transactionHash ?? undefined,
      blockNumber: log.blockNumber ? String(log.blockNumber) : undefined,
      optimisticStatus,
    };
  });
}

/**
 * Resolve action names by fetching tx calldata via RPC getTransaction.
 * Fills in actions for any execution that has a tx hash but no resolved actions.
 */
async function resolveActionsViaRpc(
  rpcClient: any,
  executions: ExecutionEvent[],
): Promise<void> {
  const unresolved = executions.filter(
    (e) => e.actions.length === 0 && e.transactionHash && parseInt(e.actionCount, 10) > 0,
  );
  if (unresolved.length === 0) return;

  const uniqueHashes = [...new Set(unresolved.map((e) => e.transactionHash!.toLowerCase()))];

  const BATCH = 10;
  const txMap = new Map<string, ActionInfo[]>();

  for (let i = 0; i < uniqueHashes.length; i += BATCH) {
    const batch = uniqueHashes.slice(i, i + BATCH);
    await Promise.allSettled(
      batch.map(async (hash) => {
        try {
          const tx = await rpcClient.getTransaction({ hash: hash as `0x${string}` });
          if (tx?.input) {
            const parsed = decodeExecuteTxActions(tx.input);
            if (parsed.length > 0) {
              txMap.set(hash, parsed.map((a: any) => ({ actionType: a.actionType, label: a.label })));
            }
          }
        } catch {
          // Skip failed tx fetches
        }
      }),
    );
  }

  for (const exec of unresolved) {
    const hash = exec.transactionHash?.toLowerCase();
    if (hash && txMap.has(hash)) {
      exec.actions = txMap.get(hash)!;
    }
  }
}

export function useVaultExecutions(vaultAddress: `0x${string}` | undefined) {
  const { selectedChainId, contracts } = useNetwork();
  const client = usePublicClient({ chainId: selectedChainId });

  const { data, isLoading, error } = useQuery({
    queryKey: ['vaultExecutions', vaultAddress, selectedChainId],
    queryFn: async (): Promise<ExecutionEvent[]> => {
      if (!client || !vaultAddress) return [];

      let executions: ExecutionEvent[] | undefined;

      if (isExplorerAvailable()) {
        try {
          executions = await fetchViaExplorer(selectedChainId, vaultAddress);
        } catch {
          // Fall through to RPC
        }
      }

      const rpcClient = getLogsClient(client, selectedChainId);

      if (!executions) {
        executions = await fetchViaRpc(client, rpcClient, vaultAddress, contracts.vaultFactory, selectedChainId);
      }

      // Resolve action names from tx calldata for any executions still missing them
      await resolveActionsViaRpc(rpcClient, executions);

      return executions;
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
