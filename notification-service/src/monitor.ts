import {
  createPublicClient,
  http,
  formatUnits,
  type PublicClient,
  type Log,
  type Address,
  decodeEventLog,
} from 'viem';
import { KernelVaultABI } from './abi.js';
import { config } from './config.js';
import {
  getAllSubscribedVaults,
  getSubscriptionsForVault,
  getLastProcessedBlock,
  setLastProcessedBlock,
} from './db.js';
import { sendNotification } from './bot.js';

// PPS precision — KernelVault uses 18 decimals for price-per-share
const PPS_DECIMALS = 18;

// Alert threshold: notify on PPS changes larger than 1%
const PPS_CHANGE_THRESHOLD_BPS = 100n; // 100 bps = 1%

let client: PublicClient;
let pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Build a viem public client for HyperEVM.
 */
function getClient(): PublicClient {
  if (!client) {
    client = createPublicClient({
      transport: http(config.rpcUrl),
    });
  }
  return client;
}

/**
 * Truncate an address for display: 0x1234...abcd
 */
function short(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * Read the current price-per-share for a vault.
 * PPS = totalAssets / totalShares (with guard against zero shares).
 */
async function readPps(vaultAddress: Address): Promise<bigint | null> {
  try {
    const c = getClient();
    const [totalAssets, totalShares] = await Promise.all([
      c.readContract({
        address: vaultAddress,
        abi: KernelVaultABI,
        functionName: 'totalAssets',
      }),
      c.readContract({
        address: vaultAddress,
        abi: KernelVaultABI,
        functionName: 'totalShares',
      }),
    ]);

    if (totalShares === 0n) return null;
    // PPS with 18 decimals of precision
    return (totalAssets * 10n ** BigInt(PPS_DECIMALS)) / totalShares;
  } catch (err) {
    console.error(`[monitor] Failed to read PPS for ${vaultAddress}:`, (err as Error).message);
    return null;
  }
}

/**
 * Read the pre-execution PPS stored on-chain (set before each execution).
 */
async function readPreExecutionPps(vaultAddress: Address): Promise<bigint | null> {
  try {
    const result = await getClient().readContract({
      address: vaultAddress,
      abi: KernelVaultABI,
      functionName: 'preExecutionPps',
    });
    return result as bigint;
  } catch {
    return null;
  }
}

/**
 * Format a PPS change as a human-readable percentage string.
 */
function formatPpsChange(prePps: bigint, postPps: bigint): string {
  if (prePps === 0n) return 'N/A';
  const changeBps = ((postPps - prePps) * 10000n) / prePps;
  const sign = changeBps >= 0n ? '+' : '';
  // Convert bps to percentage with 2 decimal places
  const pct = Number(changeBps) / 100;
  return `${sign}${pct.toFixed(2)}%`;
}

/**
 * Process logs from a block range for a specific vault.
 */
async function processVaultLogs(
  vaultAddress: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<void> {
  const c = getClient();

  let logs: Log[];
  try {
    logs = await c.getLogs({
      address: vaultAddress,
      fromBlock,
      toBlock,
    });
  } catch (err) {
    console.error(
      `[monitor] getLogs failed for ${short(vaultAddress)} [${fromBlock}-${toBlock}]:`,
      (err as Error).message,
    );
    return;
  }

  if (logs.length === 0) return;

  const chatIds = getSubscriptionsForVault(vaultAddress);
  if (chatIds.length === 0) return;

  for (const log of logs) {
    let decoded;
    try {
      decoded = decodeEventLog({
        abi: KernelVaultABI,
        data: log.data,
        topics: log.topics,
      });
    } catch {
      // Not one of our events — skip
      continue;
    }

    let message: string;

    switch (decoded.eventName) {
      case 'ExecutionApplied': {
        const args = decoded.args as {
          agentId: `0x${string}`;
          executionNonce: bigint;
          actionCommitment: `0x${string}`;
          actionCount: bigint;
        };

        // Read PPS after execution
        const postPps = await readPps(vaultAddress);
        const prePps = await readPreExecutionPps(vaultAddress);

        let ppsLine = '';
        if (postPps !== null) {
          const ppsDisplay = formatUnits(postPps, PPS_DECIMALS);
          ppsLine = `\nPPS: ${Number(ppsDisplay).toFixed(6)}`;

          if (prePps !== null && prePps > 0n) {
            const change = formatPpsChange(prePps, postPps);
            ppsLine += ` (${change})`;

            // Check for large PPS change alert
            const changeBps = ((postPps - prePps) * 10000n) / prePps;
            const absChangeBps = changeBps < 0n ? -changeBps : changeBps;
            if (absChangeBps >= PPS_CHANGE_THRESHOLD_BPS) {
              const alertMsg = [
                `*PPS Alert* for vault \`${short(vaultAddress)}\``,
                '',
                `PPS changed by ${change}`,
                `Before: ${formatUnits(prePps, PPS_DECIMALS)}`,
                `After: ${ppsDisplay}`,
                '',
                `[View vault](https://tokamak.ai/vaults/${vaultAddress})`,
              ].join('\n');

              for (const chatId of chatIds) {
                sendNotification(chatId, alertMsg);
              }
            }
          }
        }

        message = [
          `*Execution Applied* on vault \`${short(vaultAddress)}\``,
          '',
          `Nonce: ${args.executionNonce}`,
          `Actions: ${args.actionCount}`,
          ppsLine,
          '',
          `Tx: \`${log.transactionHash}\``,
          `[View vault](https://tokamak.ai/vaults/${vaultAddress})`,
        ].join('\n');
        break;
      }

      case 'Deposit': {
        const args = decoded.args as {
          sender: Address;
          amount: bigint;
          shares: bigint;
        };

        message = [
          `*Deposit* on vault \`${short(vaultAddress)}\``,
          '',
          `From: \`${short(args.sender)}\``,
          `Amount: ${formatUnits(args.amount, 18)}`,
          `Shares minted: ${formatUnits(args.shares, 18)}`,
          '',
          `Tx: \`${log.transactionHash}\``,
        ].join('\n');
        break;
      }

      case 'Withdraw': {
        const args = decoded.args as {
          sender: Address;
          amount: bigint;
          shares: bigint;
        };

        message = [
          `*Withdrawal* from vault \`${short(vaultAddress)}\``,
          '',
          `By: \`${short(args.sender)}\``,
          `Amount: ${formatUnits(args.amount, 18)}`,
          `Shares burned: ${formatUnits(args.shares, 18)}`,
          '',
          `Tx: \`${log.transactionHash}\``,
        ].join('\n');
        break;
      }

      default:
        continue;
    }

    for (const chatId of chatIds) {
      sendNotification(chatId, message);
    }
  }
}

/**
 * Single poll iteration: fetch new blocks and process events for all subscribed vaults.
 */
async function poll(): Promise<void> {
  const c = getClient();

  let currentBlock: bigint;
  try {
    currentBlock = await c.getBlockNumber();
  } catch (err) {
    console.error('[monitor] Failed to get block number:', (err as Error).message);
    return;
  }

  const lastProcessed = getLastProcessedBlock();
  // On first run, start from the current block (don't scan history)
  const fromBlock = lastProcessed !== null ? lastProcessed + 1n : currentBlock;

  if (fromBlock > currentBlock) {
    // No new blocks
    return;
  }

  const vaults = getAllSubscribedVaults();
  if (vaults.length === 0) {
    // No subscriptions yet — just track the block
    setLastProcessedBlock(currentBlock);
    return;
  }

  // Process in chunks of up to 1000 blocks to avoid RPC limits
  const MAX_RANGE = 1000n;
  let from = fromBlock;

  while (from <= currentBlock) {
    const to = from + MAX_RANGE - 1n > currentBlock ? currentBlock : from + MAX_RANGE - 1n;

    const promises = vaults.map((vault) =>
      processVaultLogs(vault as Address, from, to),
    );
    await Promise.all(promises);

    from = to + 1n;
  }

  setLastProcessedBlock(currentBlock);
  console.log(
    `[monitor] Processed blocks ${fromBlock}–${currentBlock} | ${vaults.length} vault(s) monitored`,
  );
}

/**
 * Start the polling loop.
 */
export function startMonitor(): void {
  console.log(`[monitor] Starting event monitor (poll every ${config.pollIntervalMs}ms)`);

  // Run first poll immediately
  poll().catch((err) => {
    console.error('[monitor] Poll error:', err);
  });

  pollTimer = setInterval(() => {
    poll().catch((err) => {
      console.error('[monitor] Poll error:', err);
    });
  }, config.pollIntervalMs);
}

/**
 * Stop the polling loop.
 */
export function stopMonitor(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log('[monitor] Stopped');
  }
}
