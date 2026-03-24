import {
  createPublicClient,
  http,
  type PublicClient,
  type Address,
  type Log,
  type Chain,
  keccak256,
  toHex,
  decodeEventLog,
} from 'viem';
import { mainnet } from 'viem/chains';
import { config, VaultFactoryAbi, OptimisticKernelVaultAbi } from '../config.js';
import * as vaultStore from './vault-store.js';
import pino from 'pino';

const logger = pino({ name: 'vault-registry' });

// Chain definitions
const hyperEVM: Chain = {
  id: 999,
  name: 'HyperEVM',
  nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
  rpcUrls: { default: { http: [config.hyperRpcUrl] } },
};

const hyperEVMTestnet: Chain = {
  id: 998,
  name: 'HyperEVM Testnet',
  nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
  rpcUrls: { default: { http: [config.hyperTestnetRpcUrl || 'https://rpc.hyperliquid-testnet.xyz/evm'] } },
};

export type NewVaultCallback = (vault: vaultStore.VaultRecord) => void;

export class VaultRegistry {
  private ethClient: PublicClient;
  private hyperClient: PublicClient;
  private hyperTestnetClient: PublicClient | null = null;
  private onNewVault: NewVaultCallback | null = null;
  private unwatchHyper: (() => void) | null = null;
  private unwatchEth: (() => void) | null = null;
  private unwatchHyperTestnet: (() => void) | null = null;

  constructor() {
    this.ethClient = createPublicClient({
      chain: mainnet,
      transport: http(config.ethRpcUrl),
    });
    this.hyperClient = createPublicClient({
      chain: hyperEVM,
      transport: http(config.hyperRpcUrl),
    });
    // Only create testnet client if configured
    if (config.hyperTestnetRpcUrl && config.vaultFactoryHyperTestnet) {
      this.hyperTestnetClient = createPublicClient({
        chain: hyperEVMTestnet,
        transport: http(config.hyperTestnetRpcUrl),
      });
    }
  }

  /** Register callback for new vault discovery (used by relayer) */
  setNewVaultCallback(cb: NewVaultCallback): void {
    this.onNewVault = cb;
  }

  /** Start discovery: scan historical + subscribe to new */
  async start(): Promise<void> {
    logger.info('Starting vault registry...');

    // Scan historical events on all configured chains
    const scanPromises = [
      this.scanHistorical(this.hyperClient, 999, config.vaultFactoryHyper, config.scanStartBlockHyper),
      this.scanHistorical(this.ethClient, 1, config.vaultFactoryEth, config.scanStartBlockEth),
    ];

    if (this.hyperTestnetClient && config.vaultFactoryHyperTestnet) {
      scanPromises.push(
        this.scanHistorical(this.hyperTestnetClient, 998, config.vaultFactoryHyperTestnet, config.scanStartBlockHyperTestnet)
      );
    }

    // Don't block startup — scan in background
    Promise.all(scanPromises).then(() => {
      logger.info('Historical scan complete on all chains');
    }).catch((err) => {
      logger.error({ err }, 'Historical scan failed');
    });

    // Subscribe to new events immediately
    this.subscribeNew(this.hyperClient, 999, config.vaultFactoryHyper);
    this.subscribeNew(this.ethClient, 1, config.vaultFactoryEth);
    if (this.hyperTestnetClient && config.vaultFactoryHyperTestnet) {
      this.subscribeNew(this.hyperTestnetClient, 998, config.vaultFactoryHyperTestnet);
    }

    const count = await vaultStore.getVaultCount();
    logger.info({ registeredVaults: count }, 'Vault registry started');
  }

  private async scanHistorical(
    client: PublicClient,
    chainId: number,
    factoryAddress: Address,
    startBlock: bigint = 0n
  ): Promise<void> {
    logger.info({ chainId, factory: factoryAddress, startBlock: startBlock.toString() }, 'Scanning historical OptimisticVaultDeployed events');

    try {
      const head = await client.getBlockNumber();
      // HyperEVM RPCs limit getLogs to 1000 blocks; Alchemy to 10,000
      const CHUNK = (chainId === 999 || chainId === 998) ? 999n : 9_999n;
      let totalFound = 0;

      for (let from = startBlock; from <= head; from += CHUNK + 1n) {
        const to = from + CHUNK > head ? head : from + CHUNK;

        const logs = await client.getLogs({
          address: factoryAddress,
          event: VaultFactoryAbi[0] as any, // OptimisticVaultDeployed
          fromBlock: from,
          toBlock: to,
        });

        for (const log of logs) {
          await this.processVaultEvent(log, chainId);
        }
        totalFound += logs.length;
      }

      logger.info({ chainId, count: totalFound }, 'Historical events found');
    } catch (err) {
      logger.error({ err, chainId }, 'Failed to scan historical events');
    }
  }

  private subscribeNew(
    client: PublicClient,
    chainId: number,
    factoryAddress: Address
  ): void {
    logger.info({ chainId, factory: factoryAddress }, 'Subscribing to new OptimisticVaultDeployed events');

    // Use polling since not all RPCs support WebSocket
    const intervalMs = chainId === 999 ? 5_000 : 15_000;
    let lastBlock = 0n;

    const poll = async () => {
      try {
        const currentBlock = await client.getBlockNumber();
        if (lastBlock === 0n) {
          lastBlock = currentBlock;
          return;
        }
        if (currentBlock <= lastBlock) return;

        const logs = await client.getLogs({
          address: factoryAddress,
          event: VaultFactoryAbi[0] as any,
          fromBlock: lastBlock + 1n,
          toBlock: currentBlock,
        });

        for (const log of logs) {
          await this.processVaultEvent(log, chainId);
        }

        lastBlock = currentBlock;
      } catch (err) {
        logger.error({ err, chainId }, 'Polling error');
      }
    };

    const interval = setInterval(poll, intervalMs);

    if (chainId === 999) {
      this.unwatchHyper = () => clearInterval(interval);
    } else if (chainId === 998) {
      this.unwatchHyperTestnet = () => clearInterval(interval);
    } else {
      this.unwatchEth = () => clearInterval(interval);
    }
  }

  private async processVaultEvent(log: any, chainId: number): Promise<void> {
    const args = log.args;
    if (!args) return;

    const record: vaultStore.VaultRecord = {
      address: (args.vault as string).toLowerCase(),
      chainId,
      agentId: args.agentId as string,
      owner: (args.owner as string).toLowerCase(),
      bondChainId: Number(args.bondChainId),
      discoveredAt: new Date(),
    };

    await vaultStore.upsertVault(record);

    if (this.onNewVault) {
      this.onNewVault(record);
    }
  }

  /** Get all registered vaults */
  async getVaults(): Promise<vaultStore.VaultRecord[]> {
    return vaultStore.getVaults();
  }

  /** Check if vault is registered */
  async isRegisteredVault(address: string, chainId: number): Promise<boolean> {
    return vaultStore.isRegisteredVault(address, chainId);
  }

  /** Get vault info */
  async getVault(address: string, chainId: number): Promise<vaultStore.VaultRecord | null> {
    return vaultStore.getVault(address, chainId);
  }

  /** Stop all subscriptions */
  stop(): void {
    this.unwatchHyper?.();
    this.unwatchEth?.();
    this.unwatchHyperTestnet?.();
    logger.info('Vault registry stopped');
  }
}
