import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { mainnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { config, WSTONBondManagerAbi } from '../config.js';
import { query } from '../db/client.js';
import pino from 'pino';

const logger = pino({ name: 'relay-executor' });

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2_000;

export class RelayExecutor {
  private walletClient: WalletClient;
  private publicClient: PublicClient;
  private relayerAddress: Address;
  private account: ReturnType<typeof privateKeyToAccount>;

  constructor() {
    this.account = privateKeyToAccount(config.relayerPrivateKey);
    this.relayerAddress = this.account.address;

    this.publicClient = createPublicClient({
      chain: mainnet,
      transport: http(config.ethRpcUrl),
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain: mainnet,
      transport: http(config.ethRpcUrl),
    });

    logger.info({ relayer: this.relayerAddress }, 'Relay executor initialized');
  }

  get address(): Address {
    return this.relayerAddress;
  }

  /**
   * Release a bond on L1 after ProofSubmitted on HyperEVM
   */
  async releaseBond(
    operator: Address,
    vault: Address,
    nonce: bigint,
    eventHash: string
  ): Promise<Hex | null> {
    return this.executeWithRetry(eventHash, async () => {
      const hash = await this.walletClient.writeContract({
        chain: mainnet,
        account: this.account,
        address: config.wstonBondManager,
        abi: WSTONBondManagerAbi,
        functionName: 'releaseBondByRelayer',
        args: [operator, vault, nonce],
      });

      logger.info(
        { operator, vault, nonce: nonce.toString(), txHash: hash },
        'releaseBondByRelayer submitted'
      );

      // Wait for confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === 'reverted') {
        throw new Error(`releaseBondByRelayer reverted: ${hash}`);
      }

      return hash;
    });
  }

  /**
   * Slash a bond on L1 after ExecutionSlashed on HyperEVM
   */
  async slashBond(
    operator: Address,
    vault: Address,
    nonce: bigint,
    slasher: Address,
    eventHash: string
  ): Promise<Hex | null> {
    return this.executeWithRetry(eventHash, async () => {
      const hash = await this.walletClient.writeContract({
        chain: mainnet,
        account: this.account,
        address: config.wstonBondManager,
        abi: WSTONBondManagerAbi,
        functionName: 'slashBondByRelayer',
        args: [operator, vault, nonce, slasher],
      });

      logger.info(
        { operator, vault, nonce: nonce.toString(), slasher, txHash: hash },
        'slashBondByRelayer submitted'
      );

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === 'reverted') {
        throw new Error(`slashBondByRelayer reverted: ${hash}`);
      }

      return hash;
    });
  }

  private async executeWithRetry(
    eventHash: string,
    fn: () => Promise<Hex>
  ): Promise<Hex | null> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const txHash = await fn();

        // Update DB
        await query(
          `UPDATE relayed_events SET status = 'relayed', l1_tx_hash = $1, relayed_at = NOW(), retry_count = $2
           WHERE event_hash = $3`,
          [txHash, attempt, eventHash]
        );

        return txHash;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'unknown error';
        logger.error(
          { err: errMsg, eventHash, attempt, maxRetries: MAX_RETRIES },
          'Relay attempt failed'
        );

        await query(
          `UPDATE relayed_events SET retry_count = $1, error_message = $2
           WHERE event_hash = $3`,
          [attempt + 1, errMsg, eventHash]
        );

        if (attempt === MAX_RETRIES) {
          await query(
            `UPDATE relayed_events SET status = 'failed' WHERE event_hash = $1`,
            [eventHash]
          );
          logger.error({ eventHash }, 'Relay permanently failed after max retries');
          return null;
        }

        // Exponential backoff
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    return null;
  }
}
