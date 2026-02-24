import type { Log } from 'viem';

// Block range tiers — tried large-to-small until the RPC accepts one.
// HyperEVM supports max 1000; Sepolia/mainnet support 500K+.
const BLOCK_RANGE_TIERS = [BigInt(500_000), BigInt(10_000), BigInt(1_000)];

/**
 * Paginated getLogs that auto-discovers the max block range the RPC supports.
 * Caps total calls to `maxCalls` to avoid hammering limited RPCs.
 */
export async function paginatedGetLogs(
  client: any,
  params: { address: `0x${string}`; event: any; args?: any; fromBlock: bigint; toBlock: bigint },
  maxCalls = 80,
): Promise<Log[]> {
  const { fromBlock, toBlock, ...rest } = params;
  const results: Log[] = [];

  // Discover the largest chunk size the RPC accepts
  let chunkSize = BLOCK_RANGE_TIERS[BLOCK_RANGE_TIERS.length - 1];
  let discovered = false;
  for (const tier of BLOCK_RANGE_TIERS) {
    const testEnd = fromBlock + tier > toBlock ? toBlock : fromBlock + tier;
    try {
      const logs = await client.getLogs({ ...rest, fromBlock, toBlock: testEnd });
      results.push(...(logs as Log[]));
      chunkSize = tier;
      discovered = true;
      if (testEnd >= toBlock) return results;
      break;
    } catch {
      // Tier too large for this RPC, try smaller
    }
  }

  // If even the smallest tier failed, throw
  if (!discovered) {
    throw new Error('getLogs not supported by this RPC');
  }

  // Paginate the rest with the discovered chunk size
  let cursor = fromBlock + chunkSize + BigInt(1);
  let callCount = 1;
  while (cursor <= toBlock && callCount < maxCalls) {
    const end = cursor + chunkSize > toBlock ? toBlock : cursor + chunkSize;
    const logs = await client.getLogs({ ...rest, fromBlock: cursor, toBlock: end });
    results.push(...(logs as Log[]));
    cursor = end + BigInt(1);
    callCount++;
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

/**
 * Find the block at which a vault was deployed via VaultDeployed event.
 * Uses expanding lookback windows to minimize RPC calls.
 * Caps each window scan to avoid excessive calls on RPCs with small max range.
 */
export async function findVaultDeployBlock(
  client: any,
  factoryAddress: `0x${string}`,
  vaultAddress: `0x${string}`,
  currentBlock: bigint,
): Promise<bigint> {
  // Lookback windows — sized for 12s block chains.
  // On fast chains (HyperEVM ~0.5s blocks), the maxCalls cap in
  // paginatedGetLogs prevents excessive requests.
  const LOOKBACK = [BigInt(15_000), BigInt(100_000), BigInt(500_000), BigInt(2_000_000)];

  for (const window of LOOKBACK) {
    const from = currentBlock > window ? currentBlock - window : BigInt(0);
    try {
      const logs = await paginatedGetLogs(
        client,
        { address: factoryAddress, event: vaultDeployedEvent, args: { vault: vaultAddress }, fromBlock: from, toBlock: currentBlock },
        30, // cap at 30 calls per window
      );
      if (logs.length > 0 && logs[0].blockNumber != null) {
        return logs[0].blockNumber;
      }
    } catch {
      // Window failed
    }
    if (from === BigInt(0)) return BigInt(0);
  }

  return BigInt(0);
}
