import {
  createPublicClient,
  http,
  type Address,
  type PublicClient,
  type Chain,
  keccak256,
  toHex,
  encodeEventTopics,
  decodeEventLog,
  type Log,
} from 'viem';
import { mainnet } from 'viem/chains';
import { config, OptimisticKernelVaultAbi } from '../config.js';
import { query } from '../db/client.js';
import { RelayExecutor } from './relay-executor.js';
import * as checkpoint from './checkpoint.js';
import type { VaultRecord } from '../registry/vault-store.js';
import pino from 'pino';

const logger = pino({ name: 'multi-vault-listener' });

const hyperEVM: Chain = {
  id: 999,
  name: 'HyperEVM',
  nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
  rpcUrls: {
    default: { http: [config.hyperRpcUrl] },
  },
};

// Event signatures for topic0 matching
const PROOF_SUBMITTED_TOPIC = keccak256(
  toHex('ProofSubmitted(uint64,address)', { size: undefined })
);
const EXECUTION_SLASHED_TOPIC = keccak256(
  toHex('ExecutionSlashed(uint64,address,uint256)', { size: undefined })
);
const OPTIMISTIC_EXEC_TOPIC = keccak256(
  toHex('OptimisticExecutionSubmitted(uint64,bytes32,uint256,uint256)', { size: undefined })
);

export class MultiVaultListener {
  private hyperClient: PublicClient;
  private ethClient: PublicClient;
  private executor: RelayExecutor;
  private vaultAddresses: Set<string> = new Set();
  private pollInterval: NodeJS.Timeout | null = null;
  private running = false;

  constructor(executor: RelayExecutor) {
    this.executor = executor;
    this.hyperClient = createPublicClient({
      chain: hyperEVM,
      transport: http(config.hyperRpcUrl),
    });
    this.ethClient = createPublicClient({
      chain: mainnet,
      transport: http(config.ethRpcUrl),
    });
  }

  /** Initialize with existing vaults and start polling */
  async start(vaults: VaultRecord[]): Promise<void> {
    for (const v of vaults) {
      if (v.chainId === 999) {
        this.vaultAddresses.add(v.address.toLowerCase());
      }
    }

    // Historical replay for each vault
    for (const v of vaults) {
      if (v.chainId === 999) {
        await this.replayFrom(v.address, v.chainId);
      }
    }

    this.running = true;
    this.pollInterval = setInterval(() => this.poll(), 5_000);
    logger.info({ vaultCount: this.vaultAddresses.size }, 'Multi-vault listener started');
  }

  /** Add a new vault dynamically */
  async addVault(vault: VaultRecord): Promise<void> {
    if (vault.chainId !== 999) return;
    const addr = vault.address.toLowerCase();
    if (this.vaultAddresses.has(addr)) return;
    this.vaultAddresses.add(addr);
    await this.replayFrom(vault.address, vault.chainId);
    logger.info({ vault: addr }, 'Dynamically added vault to listener');
  }

  /** Replay events from last checkpoint */
  async replayFrom(vaultAddress: string, chainId: number, fromBlock?: bigint): Promise<void> {
    const addr = vaultAddress.toLowerCase() as Address;
    const start = fromBlock ?? await checkpoint.getCheckpoint(addr, chainId);
    const head = await this.hyperClient.getBlockNumber();

    if (start >= head) return;

    logger.info({ vault: addr, fromBlock: start.toString(), toBlock: head.toString() }, 'Replaying events');

    // Batch in chunks of 10,000 blocks
    const CHUNK = 10_000n;
    for (let from = start === 0n ? 0n : start + 1n; from <= head; from += CHUNK) {
      const to = from + CHUNK - 1n > head ? head : from + CHUNK - 1n;

      const logs = await this.hyperClient.getLogs({
        address: addr,
        fromBlock: from,
        toBlock: to,
      });

      for (const log of logs) {
        await this.processLog(log, addr, chainId);
      }

      await checkpoint.setCheckpoint(addr, chainId, to);
    }
  }

  private async poll(): Promise<void> {
    if (!this.running || this.vaultAddresses.size === 0) return;

    try {
      const currentBlock = await this.hyperClient.getBlockNumber();
      const confirmedBlock = currentBlock - BigInt(config.confirmationDepth);
      if (confirmedBlock < 0n) return;

      const addresses = [...this.vaultAddresses].map(a => a as Address);

      // Batch getLogs across all vaults
      for (const addr of addresses) {
        const lastBlock = await checkpoint.getCheckpoint(addr, 999);
        if (lastBlock >= confirmedBlock) continue;

        const fromBlock = lastBlock === 0n ? confirmedBlock - 1000n : lastBlock + 1n;
        if (fromBlock > confirmedBlock) continue;

        const logs = await this.hyperClient.getLogs({
          address: addr,
          fromBlock: fromBlock < 0n ? 0n : fromBlock,
          toBlock: confirmedBlock,
        });

        for (const log of logs) {
          await this.processLog(log, addr, 999);
        }

        await checkpoint.setCheckpoint(addr, 999, confirmedBlock);
      }
    } catch (err) {
      logger.error({ err }, 'Polling error');
    }
  }

  private async processLog(log: Log, vaultAddress: Address, chainId: number): Promise<void> {
    const topic0 = log.topics[0];
    if (!topic0) return;

    if (topic0 === PROOF_SUBMITTED_TOPIC) {
      await this.handleProofSubmitted(log, vaultAddress, chainId);
    } else if (topic0 === EXECUTION_SLASHED_TOPIC) {
      await this.handleExecutionSlashed(log, vaultAddress, chainId);
    } else if (topic0 === OPTIMISTIC_EXEC_TOPIC) {
      await this.handleOptimisticExecSubmitted(log, vaultAddress, chainId);
    }
  }

  private async handleOptimisticExecSubmitted(
    log: Log,
    vaultAddress: Address,
    chainId: number
  ): Promise<void> {
    // Index operator for later use in relay
    try {
      const decoded = decodeEventLog({
        abi: OptimisticKernelVaultAbi,
        data: log.data,
        topics: log.topics,
        eventName: 'OptimisticExecutionSubmitted',
      });

      const nonce = decoded.args.executionNonce;

      // Resolve operator from vault owner
      const owner = await this.hyperClient.readContract({
        address: vaultAddress,
        abi: OptimisticKernelVaultAbi,
        functionName: 'owner',
      }) as Address;

      await query(
        `INSERT INTO vault_operators (vault_address, chain_id, execution_nonce, operator)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (vault_address, chain_id, execution_nonce) DO NOTHING`,
        [vaultAddress.toLowerCase(), chainId, nonce.toString(), owner.toLowerCase()]
      );
    } catch (err) {
      logger.error({ err, log: log.transactionHash }, 'Failed to index OptimisticExecutionSubmitted');
    }
  }

  private async handleProofSubmitted(
    log: Log,
    vaultAddress: Address,
    chainId: number
  ): Promise<void> {
    const eventHash = `${log.transactionHash}-${log.logIndex}`;

    // Idempotency check
    if (await this.isAlreadyRelayed(eventHash)) return;

    try {
      const decoded = decodeEventLog({
        abi: OptimisticKernelVaultAbi,
        data: log.data,
        topics: log.topics,
        eventName: 'ProofSubmitted',
      });

      const nonce = decoded.args.executionNonce;
      const operator = await this.resolveOperator(vaultAddress, chainId, nonce);

      if (!operator) {
        logger.error({ vaultAddress, nonce: nonce.toString() }, 'Cannot resolve operator for ProofSubmitted');
        return;
      }

      // Insert pending relay
      await query(
        `INSERT INTO relayed_events (vault_address, chain_id, event_hash, event_type, execution_nonce, operator)
         VALUES ($1, $2, $3, 'ProofSubmitted', $4, $5)
         ON CONFLICT (event_hash) DO NOTHING`,
        [vaultAddress.toLowerCase(), chainId, eventHash, nonce.toString(), operator]
      );

      logger.info({ vault: vaultAddress, nonce: nonce.toString(), operator }, 'Relaying ProofSubmitted → releaseBondByRelayer');

      await this.executor.releaseBond(operator as Address, vaultAddress, nonce, eventHash);
    } catch (err) {
      logger.error({ err, eventHash }, 'Failed to handle ProofSubmitted');
    }
  }

  private async handleExecutionSlashed(
    log: Log,
    vaultAddress: Address,
    chainId: number
  ): Promise<void> {
    const eventHash = `${log.transactionHash}-${log.logIndex}`;

    if (await this.isAlreadyRelayed(eventHash)) return;

    try {
      const decoded = decodeEventLog({
        abi: OptimisticKernelVaultAbi,
        data: log.data,
        topics: log.topics,
        eventName: 'ExecutionSlashed',
      });

      const nonce = decoded.args.executionNonce;
      const slasher = decoded.args.slasher as Address;
      const bondAmount = decoded.args.bondAmount;
      const operator = await this.resolveOperator(vaultAddress, chainId, nonce);

      if (!operator) {
        logger.error({ vaultAddress, nonce: nonce.toString() }, 'Cannot resolve operator for ExecutionSlashed');
        return;
      }

      await query(
        `INSERT INTO relayed_events (vault_address, chain_id, event_hash, event_type, execution_nonce, operator, slasher, bond_amount)
         VALUES ($1, $2, $3, 'ExecutionSlashed', $4, $5, $6, $7)
         ON CONFLICT (event_hash) DO NOTHING`,
        [vaultAddress.toLowerCase(), chainId, eventHash, nonce.toString(), operator, slasher, bondAmount.toString()]
      );

      logger.info(
        { vault: vaultAddress, nonce: nonce.toString(), operator, slasher },
        'Relaying ExecutionSlashed → slashBondByRelayer'
      );

      await this.executor.slashBond(operator as Address, vaultAddress, nonce, slasher, eventHash);
    } catch (err) {
      logger.error({ err, eventHash }, 'Failed to handle ExecutionSlashed');
    }
  }

  private async resolveOperator(
    vaultAddress: Address,
    chainId: number,
    nonce: bigint
  ): Promise<string | null> {
    // Try cached operator first
    const { rows } = await query<{ operator: string }>(
      'SELECT operator FROM vault_operators WHERE vault_address = $1 AND chain_id = $2 AND execution_nonce = $3',
      [vaultAddress.toLowerCase(), chainId, nonce.toString()]
    );

    if (rows.length > 0) return rows[0].operator;

    // Fallback: vault owner
    try {
      const owner = await this.hyperClient.readContract({
        address: vaultAddress,
        abi: OptimisticKernelVaultAbi,
        functionName: 'owner',
      }) as Address;
      return owner.toLowerCase();
    } catch {
      return null;
    }
  }

  private async isAlreadyRelayed(eventHash: string): Promise<boolean> {
    const { rows } = await query(
      'SELECT 1 FROM relayed_events WHERE event_hash = $1',
      [eventHash]
    );
    return rows.length > 0;
  }

  /** Get last relayed block for health check */
  async getLastRelayedBlocks(): Promise<{ hyper: bigint; ethereum: bigint }> {
    const { rows } = await query<{ last_block: string }>(
      'SELECT MAX(last_block) as last_block FROM checkpoints WHERE chain_id = 999'
    );
    const hyperBlock = rows[0]?.last_block ? BigInt(rows[0].last_block) : 0n;

    let ethBlock = 0n;
    try {
      ethBlock = await this.ethClient.getBlockNumber();
    } catch {}

    return { hyper: hyperBlock, ethereum: ethBlock };
  }

  /** Get pending relay count */
  async getPendingCount(): Promise<number> {
    const { rows } = await query<{ count: string }>(
      "SELECT COUNT(*) as count FROM relayed_events WHERE status = 'pending'"
    );
    return parseInt(rows[0].count);
  }

  stop(): void {
    this.running = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    logger.info('Multi-vault listener stopped');
  }
}
