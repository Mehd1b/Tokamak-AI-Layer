import { createPublicClient, http, type Log } from 'viem';
import { hyperEvmMainnet, hyperEvmTestnet } from '@/lib/chains';

// Block range tiers — tried large-to-small until the RPC accepts one.
// HyperEVM supports max 1000; Sepolia/mainnet support 500K+.
const BLOCK_RANGE_TIERS = [BigInt(500_000), BigInt(10_000), BigInt(1_000), BigInt(100)];

// Parallel batch size for concurrent getLogs calls
const PARALLEL_BATCH_SIZE = 10;

/**
 * Native RPC URLs for chains where third-party RPCs (e.g. Alchemy) may not
 * support eth_getLogs reliably. Used as fallback for event fetching.
 */
const NATIVE_RPC_URLS: Record<number, string> = {
  [hyperEvmMainnet.id]: '/api/rpc/999',
  [hyperEvmTestnet.id]: '/api/rpc/998',
};

const CHAIN_BY_ID: Record<number, any> = {
  [hyperEvmMainnet.id]: hyperEvmMainnet,
  [hyperEvmTestnet.id]: hyperEvmTestnet,
};

/**
 * Returns a viem public client that uses the native RPC for chains where
 * third-party providers don't support getLogs well. Falls back to the
 * provided client if no native override exists.
 */
export function getLogsClient(primaryClient: any, chainId?: number): any {
  if (chainId && NATIVE_RPC_URLS[chainId] && CHAIN_BY_ID[chainId]) {
    return createPublicClient({
      chain: CHAIN_BY_ID[chainId],
      transport: http(NATIVE_RPC_URLS[chainId]),
    });
  }
  return primaryClient;
}

/**
 * Discover the max block range the RPC supports for getLogs.
 * Returns the discovered chunk size or throws if no tier works.
 */
async function discoverChunkSize(
  client: any,
  rest: Record<string, any>,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<{ chunkSize: bigint; initialLogs: Log[]; discoveryEnd: bigint }> {
  for (const tier of BLOCK_RANGE_TIERS) {
    const testEnd = fromBlock + tier > toBlock ? toBlock : fromBlock + tier;
    try {
      const logs = await client.getLogs({ ...rest, fromBlock, toBlock: testEnd });
      return { chunkSize: tier, initialLogs: logs as Log[], discoveryEnd: testEnd };
    } catch {
      // Tier too large for this RPC, try smaller
    }
  }
  throw new Error('getLogs not supported by this RPC');
}

/**
 * Paginated getLogs that auto-discovers the max block range the RPC supports.
 * Uses parallel batching for speed on chains with small max ranges (e.g. HyperEVM).
 * Caps total calls to `maxCalls` to avoid hammering limited RPCs.
 */
export async function paginatedGetLogs(
  client: any,
  params: { address: `0x${string}`; event: any; args?: any; fromBlock: bigint; toBlock: bigint },
  maxCalls = 200,
): Promise<Log[]> {
  const { fromBlock, toBlock, ...rest } = params;

  const { chunkSize, initialLogs, discoveryEnd } = await discoverChunkSize(
    client, rest, fromBlock, toBlock,
  );

  // If the discovery call covered the entire range, return immediately
  if (discoveryEnd >= toBlock) return initialLogs;

  const results: Log[] = [...initialLogs];

  // Build remaining chunks
  const chunks: Array<{ from: bigint; to: bigint }> = [];
  let cursor = discoveryEnd + BigInt(1);
  while (cursor <= toBlock && chunks.length < maxCalls - 1) {
    const end = cursor + chunkSize > toBlock ? toBlock : cursor + chunkSize;
    chunks.push({ from: cursor, to: end });
    cursor = end + BigInt(1);
  }

  // Process chunks in parallel batches for speed
  for (let i = 0; i < chunks.length; i += PARALLEL_BATCH_SIZE) {
    const batch = chunks.slice(i, i + PARALLEL_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(({ from, to }) =>
        client.getLogs({ ...rest, fromBlock: from, toBlock: to })
          .catch(() => [] as Log[]),
      ),
    );
    for (const logs of batchResults) {
      results.push(...(logs as Log[]));
    }
  }

  return results;
}

export const vaultDeployedEvent = {
  type: 'event' as const,
  name: 'VaultDeployed' as const,
  inputs: [
    { name: 'vault', type: 'address' as const, indexed: true },
    { name: 'owner', type: 'address' as const, indexed: true },
    { name: 'agentId', type: 'bytes32' as const, indexed: true },
    { name: 'asset', type: 'address' as const, indexed: false },
    { name: 'trustedImageId', type: 'bytes32' as const, indexed: false },
    { name: 'salt', type: 'bytes32' as const, indexed: false },
  ],
};

export const optimisticVaultDeployedEvent = {
  type: 'event' as const,
  name: 'OptimisticVaultDeployed' as const,
  inputs: [
    { name: 'vault', type: 'address' as const, indexed: true },
    { name: 'agentId', type: 'bytes32' as const, indexed: true },
    { name: 'owner', type: 'address' as const, indexed: true },
    { name: 'bondChainId', type: 'uint256' as const, indexed: false },
  ],
};

export const executionAppliedEvent = {
  type: 'event' as const,
  name: 'ExecutionApplied' as const,
  inputs: [
    { name: 'agentId', type: 'bytes32' as const, indexed: true },
    { name: 'executionNonce', type: 'uint64' as const, indexed: true },
    { name: 'actionCommitment', type: 'bytes32' as const, indexed: false },
    { name: 'actionCount', type: 'uint256' as const, indexed: false },
  ],
};

export const depositEvent = {
  type: 'event' as const,
  name: 'Deposit' as const,
  inputs: [
    { name: 'sender', type: 'address' as const, indexed: true },
    { name: 'amount', type: 'uint256' as const, indexed: false },
    { name: 'shares', type: 'uint256' as const, indexed: false },
  ],
};

export const withdrawEvent = {
  type: 'event' as const,
  name: 'Withdraw' as const,
  inputs: [
    { name: 'sender', type: 'address' as const, indexed: true },
    { name: 'amount', type: 'uint256' as const, indexed: false },
    { name: 'shares', type: 'uint256' as const, indexed: false },
  ],
};

export const optimisticExecutionSubmittedEvent = {
  type: 'event' as const,
  name: 'OptimisticExecutionSubmitted' as const,
  inputs: [
    { name: 'executionNonce', type: 'uint64' as const, indexed: true },
    { name: 'journalHash', type: 'bytes32' as const, indexed: false },
    { name: 'bondAmount', type: 'uint256' as const, indexed: false },
    { name: 'deadline', type: 'uint256' as const, indexed: false },
  ],
};

export const proofSubmittedEvent = {
  type: 'event' as const,
  name: 'ProofSubmitted' as const,
  inputs: [
    { name: 'executionNonce', type: 'uint64' as const, indexed: true },
    { name: 'submitter', type: 'address' as const, indexed: true },
  ],
};

export const executionSlashedEvent = {
  type: 'event' as const,
  name: 'ExecutionSlashed' as const,
  inputs: [
    { name: 'executionNonce', type: 'uint64' as const, indexed: true },
    { name: 'slasher', type: 'address' as const, indexed: true },
    { name: 'bondAmount', type: 'uint256' as const, indexed: false },
  ],
};

export const actionExecutedEvent = {
  type: 'event' as const,
  name: 'ActionExecuted' as const,
  inputs: [
    { name: 'actionIndex', type: 'uint256' as const, indexed: true },
    { name: 'actionType', type: 'uint32' as const, indexed: false },
    { name: 'target', type: 'bytes32' as const, indexed: false },
    { name: 'success', type: 'bool' as const, indexed: false },
  ],
};

export const noOpActionExecutedEvent = {
  type: 'event' as const,
  name: 'NoOpActionExecuted' as const,
  inputs: [
    { name: 'actionIndex', type: 'uint256' as const, indexed: true },
    { name: 'actionType', type: 'uint32' as const, indexed: false },
  ],
};

/**
 * localStorage cache key for deploy blocks to avoid re-scanning.
 */
const DEPLOY_BLOCK_CACHE_PREFIX = 'ek-deploy-block';

function getDeployBlockCacheKey(chainId: number, vaultAddress: string): string {
  return `${DEPLOY_BLOCK_CACHE_PREFIX}:${chainId}:${vaultAddress.toLowerCase()}`;
}

function getCachedDeployBlock(chainId: number, vaultAddress: string): bigint | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(getDeployBlockCacheKey(chainId, vaultAddress));
    if (cached) {
      const val = BigInt(cached);
      if (val > BigInt(0)) return val;
    }
  } catch {
    // localStorage unavailable or corrupted
  }
  return null;
}

function cacheDeployBlock(chainId: number, vaultAddress: string, block: bigint): void {
  if (typeof window === 'undefined' || block <= BigInt(0)) return;
  try {
    localStorage.setItem(getDeployBlockCacheKey(chainId, vaultAddress), block.toString());
  } catch {
    // localStorage full or unavailable
  }
}

/**
 * Find the block at which a vault was deployed via VaultDeployed or
 * OptimisticVaultDeployed events. Searches both event types and uses
 * parallel batching to cover large block ranges on fast chains.
 *
 * Results are cached in localStorage to avoid re-scanning on page reloads.
 */
export async function findVaultDeployBlock(
  client: any,
  factoryAddress: `0x${string}`,
  vaultAddress: `0x${string}`,
  currentBlock: bigint,
  chainId?: number,
): Promise<bigint> {
  // Check localStorage cache first
  if (chainId) {
    const cached = getCachedDeployBlock(chainId, vaultAddress);
    if (cached) return cached;
  }

  const deployEvents = [vaultDeployedEvent, optimisticVaultDeployedEvent];

  // Lookback windows — generous sizes for fast-block chains like HyperEVM.
  // With parallel batching, we can cover much larger ranges efficiently.
  const LOOKBACK = [BigInt(50_000), BigInt(200_000), BigInt(1_000_000), BigInt(5_000_000)];

  for (const window of LOOKBACK) {
    const from = currentBlock > window ? currentBlock - window : BigInt(0);

    // Search both event types in parallel for each window
    const results = await Promise.allSettled(
      deployEvents.map((event) =>
        paginatedGetLogs(
          client,
          { address: factoryAddress, event, args: { vault: vaultAddress }, fromBlock: from, toBlock: currentBlock },
          500,
        ),
      ),
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.length > 0) {
        const deployBlock = result.value[0].blockNumber;
        if (deployBlock != null) {
          // Cache for future use
          if (chainId) cacheDeployBlock(chainId, vaultAddress, deployBlock);
          return deployBlock;
        }
      }
    }

    if (from === BigInt(0)) return BigInt(0);
  }

  return BigInt(0);
}

/**
 * Compute a safe fromBlock for scanning recent vault events.
 * On HyperEVM (1K block limit, 500 maxCalls), covers ~500K blocks (~3 days).
 * On Ethereum (500K block limit), covers 100M+ blocks (entire history).
 * Used as fallback when findVaultDeployBlock() can't locate the deploy block.
 */
export function recentFromBlock(currentBlock: bigint, maxCalls = 500): bigint {
  // Pessimistically assume the smallest chunk size (1000 blocks)
  // to guarantee we cover this many blocks on any chain
  const coverage = BigInt(maxCalls) * BigInt(1_000);
  return currentBlock > coverage ? currentBlock - coverage : BigInt(0);
}
