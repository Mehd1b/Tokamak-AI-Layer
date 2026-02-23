import type { Log } from 'viem';

// Max block range per getLogs call
const MAX_BLOCK_RANGE = BigInt(500_000);

// Lookback windows for vault deploy search (tried in order, first success wins).
// Covers ~2 days, ~2 weeks, ~3 months on 12s block-time chains.
// Most vaults will be found in the first window.
const LOOKBACK_WINDOWS = [
  BigInt(15_000),     // ~2 days
  BigInt(100_000),    // ~2 weeks
  BigInt(500_000),    // ~2 months
  BigInt(2_000_000),  // ~9 months
];

/**
 * Paginated getLogs that splits large ranges into MAX_BLOCK_RANGE chunks.
 */
export async function paginatedGetLogs(
  client: any,
  params: { address: `0x${string}`; event: any; args?: any; fromBlock: bigint; toBlock: bigint },
): Promise<Log[]> {
  const { fromBlock, toBlock, ...rest } = params;
  const results: Log[] = [];

  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end = cursor + MAX_BLOCK_RANGE > toBlock ? toBlock : cursor + MAX_BLOCK_RANGE;
    const logs = await client.getLogs({ ...rest, fromBlock: cursor, toBlock: end });
    results.push(...(logs as Log[]));
    cursor = end + BigInt(1);
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
 * Uses expanding lookback windows to minimize RPC calls — most vaults are
 * recent, so the first small window usually hits.
 * Falls back to full-chain scan as last resort.
 */
export async function findVaultDeployBlock(
  client: any,
  factoryAddress: `0x${string}`,
  vaultAddress: `0x${string}`,
  currentBlock: bigint,
): Promise<bigint> {
  // Try expanding lookback windows (fast path for recent vaults)
  for (const window of LOOKBACK_WINDOWS) {
    const from = currentBlock > window ? currentBlock - window : BigInt(0);
    try {
      const logs = await paginatedGetLogs(client, {
        address: factoryAddress,
        event: vaultDeployedEvent,
        args: { vault: vaultAddress },
        fromBlock: from,
        toBlock: currentBlock,
      });
      if (logs.length > 0 && logs[0].blockNumber != null) {
        return logs[0].blockNumber;
      }
    } catch {
      // This window failed, try the next one
    }
    // If we already scanned from 0, stop
    if (from === BigInt(0)) return BigInt(0);
  }

  // Final fallback: full scan from block 0
  try {
    const logs = await paginatedGetLogs(client, {
      address: factoryAddress,
      event: vaultDeployedEvent,
      args: { vault: vaultAddress },
      fromBlock: BigInt(0),
      toBlock: currentBlock,
    });
    if (logs.length > 0 && logs[0].blockNumber != null) {
      return logs[0].blockNumber;
    }
  } catch {
    // Full scan failed
  }

  return BigInt(0);
}
