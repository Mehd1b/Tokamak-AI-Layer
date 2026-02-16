import { createPublicClient, http, type PublicClient, type WalletClient } from 'viem';
import { optimismSepolia } from 'viem/chains';
import { AgentRegistryClient } from './clients/AgentRegistryClient';
import { VaultFactoryClient } from './clients/VaultFactoryClient';
import { KernelVaultClient } from './clients/KernelVaultClient';
import { VerifierClient } from './clients/VerifierClient';
import type {
  ExecutionKernelConfig,
  KernelAgentInfo,
  DeployVaultParams,
  ParsedJournal,
} from './types';
import { OPTIMISM_SEPOLIA_ADDRESSES } from './types';

export class ExecutionKernelClient {
  readonly agents: AgentRegistryClient;
  readonly vaultFactory: VaultFactoryClient;
  readonly verifier: VerifierClient;

  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient | undefined;
  private readonly config: ExecutionKernelConfig;

  constructor(config: ExecutionKernelConfig) {
    this.config = config;

    // Use provided publicClient or create one
    this.publicClient = (config.publicClient ??
      createPublicClient({
        chain: optimismSepolia,
        transport: http(config.rpcUrl),
      })) as PublicClient;

    this.walletClient = config.walletClient;

    // Resolve addresses with defaults
    const addresses = {
      agentRegistry: config.agentRegistry ?? OPTIMISM_SEPOLIA_ADDRESSES.agentRegistry,
      vaultFactory: config.vaultFactory ?? OPTIMISM_SEPOLIA_ADDRESSES.vaultFactory,
      kernelExecutionVerifier:
        config.kernelExecutionVerifier ?? OPTIMISM_SEPOLIA_ADDRESSES.kernelExecutionVerifier,
    };

    // Initialize sub-clients
    this.agents = new AgentRegistryClient(
      this.publicClient,
      addresses.agentRegistry,
      this.walletClient,
    );
    this.vaultFactory = new VaultFactoryClient(
      this.publicClient,
      addresses.vaultFactory,
      this.walletClient,
    );
    this.verifier = new VerifierClient(
      this.publicClient,
      addresses.kernelExecutionVerifier,
    );
  }

  /**
   * Create a KernelVaultClient for a specific vault address
   */
  createVaultClient(vaultAddress: `0x${string}`): KernelVaultClient {
    return new KernelVaultClient(this.publicClient, vaultAddress, this.walletClient);
  }

  // ============ Convenience Methods ============

  /**
   * Register a new agent on the AgentRegistry
   */
  async registerAgent(params: {
    salt: `0x${string}`;
    imageId: `0x${string}`;
    agentCodeHash: `0x${string}`;
    metadataURI: string;
  }): Promise<{ agentId: `0x${string}`; txHash: `0x${string}` }> {
    return this.agents.register(params);
  }

  /**
   * Get agent information by ID
   */
  async getAgent(agentId: `0x${string}`): Promise<KernelAgentInfo> {
    return this.agents.get(agentId);
  }

  /**
   * Deploy a new vault via VaultFactory
   */
  async deployVault(
    params: DeployVaultParams,
  ): Promise<{ vaultAddress: `0x${string}`; txHash: `0x${string}` }> {
    return this.vaultFactory.deployVault(params);
  }

  /**
   * Verify an execution proof and parse the journal
   */
  async verifyExecution(
    imageId: `0x${string}`,
    journal: `0x${string}`,
    seal: `0x${string}`,
  ): Promise<{ valid: boolean; parsed: ParsedJournal }> {
    try {
      const parsed = await this.verifier.verifyAndParse(imageId, journal, seal);
      return { valid: true, parsed };
    } catch {
      // Verification failed (invalid proof)
      throw new Error('Proof verification failed');
    }
  }
}
