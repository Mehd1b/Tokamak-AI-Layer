import {
  createPublicClient,
  http,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { optimismSepolia } from 'viem/chains';
import { IdentityClient } from './identity/IdentityClient';
import { ReputationClient } from './reputation/ReputationClient';
import { ValidationClient } from './validation/ValidationClient';
import { RegistrationBuilder } from './identity/RegistrationBuilder';
import { SubgraphClient } from './subgraph/SubgraphClient';
import { ProofGenerator } from './zk/ProofGenerator';
import type {
  Address,
  Bytes32,
  TALClientConfig,
  AgentDetails,
  AgentV2Details,
  RegistrationParams,
  RegisterV2Params,
  OperatorConsentData,
  FeedbackInput,
  FeedbackSummary,
  ReputationQueryOptions,
  ValidationRequestParams,
  ValidationDetails,
  ValidationStats,
  AgentSearchQuery,
  AgentSearchResult,
  ProtocolStats,
  TransactionResult,
  ZKProof,
} from './types';
import {
  OPTIMISM_SEPOLIA_ADDRESSES,
  DEFAULT_CHAIN_ID,
} from './types';

export class TALClient {
  readonly identity: IdentityClient;
  readonly reputation: ReputationClient;
  readonly validation: ValidationClient;
  readonly subgraph: SubgraphClient;
  readonly proofGenerator: ProofGenerator;

  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient | undefined;
  private readonly config: TALClientConfig;

  constructor(config: TALClientConfig & { walletClient?: WalletClient }) {
    this.config = config;

    // Create public client
    this.publicClient = createPublicClient({
      chain: optimismSepolia,
      transport: http(config.rpcUrl),
    }) as PublicClient;

    this.walletClient = config.walletClient;

    // Resolve contract addresses
    const addresses = {
      identityRegistry:
        config.contracts?.identityRegistry ??
        OPTIMISM_SEPOLIA_ADDRESSES.identityRegistry,
      reputationRegistry:
        config.contracts?.reputationRegistry ??
        OPTIMISM_SEPOLIA_ADDRESSES.reputationRegistry,
      validationRegistry:
        config.contracts?.validationRegistry ??
        OPTIMISM_SEPOLIA_ADDRESSES.validationRegistry,
    };

    // Initialize domain clients
    this.identity = new IdentityClient(
      this.publicClient,
      addresses.identityRegistry,
      this.walletClient,
    );

    this.reputation = new ReputationClient(
      this.publicClient,
      addresses.reputationRegistry,
      this.walletClient,
    );

    this.validation = new ValidationClient(
      this.publicClient,
      addresses.validationRegistry,
      this.walletClient,
    );

    this.subgraph = new SubgraphClient(config.subgraphUrl);

    this.proofGenerator = new ProofGenerator();
  }

  // ==========================================
  // IDENTITY CONVENIENCE METHODS
  // ==========================================

  async registerAgent(
    params: RegistrationParams,
  ): Promise<{ agentId: bigint; tx: TransactionResult }> {
    return this.identity.registerAgent(params);
  }

  async registerAgentWithZKIdentity(
    agentURI: string,
    zkCommitment: Bytes32,
  ): Promise<{ agentId: bigint; tx: TransactionResult }> {
    return this.identity.registerAgent({ agentURI, zkCommitment });
  }

  async getAgent(agentId: bigint): Promise<AgentDetails> {
    const agent = await this.identity.getAgent(agentId);

    // Enrich with reputation data
    try {
      const feedbackCount = await this.reputation.getFeedbackCount(agentId);
      agent.feedbackCount = feedbackCount;

      if (feedbackCount > 0) {
        const clients = await this.reputation.getClientList(agentId);
        if (clients.length > 0) {
          const summary = await this.reputation.getReputation(agentId, {
            clients,
          });
          agent.averageScore = summary.average;
        }
      }
    } catch {
      // Reputation data not available, leave defaults
    }

    // Enrich with validation data
    try {
      const validations =
        await this.validation.getAgentValidations(agentId);
      agent.validationCount = validations.length;
    } catch {
      // Validation data not available, leave defaults
    }

    // Fetch and parse registration file
    try {
      if (agent.agentURI) {
        const registration = await this.fetchRegistrationFile(agent.agentURI);
        if (registration) {
          agent.registration = registration;
        }
      }
    } catch {
      // Registration file not available
    }

    return agent;
  }

  async getAgentsByOwner(owner: Address): Promise<AgentDetails[]> {
    const agentIds = await this.identity.getAgentsByOwner(owner);
    return Promise.all(agentIds.map((id) => this.getAgent(id)));
  }

  async updateAgentURI(
    agentId: bigint,
    newURI: string,
  ): Promise<TransactionResult> {
    return this.identity.updateAgentURI(agentId, newURI);
  }

  async setMetadata(
    agentId: bigint,
    key: string,
    value: `0x${string}`,
  ): Promise<TransactionResult> {
    return this.identity.setMetadata(agentId, key, value);
  }

  async verifyAgentWallet(
    agentId: bigint,
    wallet: Address,
    signature: `0x${string}`,
  ): Promise<TransactionResult> {
    return this.identity.verifyAgentWallet(agentId, wallet, signature);
  }

  async verifyCapability(
    agentId: bigint,
    capabilityHash: Bytes32,
    proof: ZKProof,
    publicInputs: bigint[],
  ): Promise<{ verified: boolean; tx: TransactionResult }> {
    // Encode ZK proof for the contract
    const encodedProof = this.proofGenerator.encodeProof(proof);
    // This would call the contract's verifyCapability function
    // For now, pass through to identity client
    throw new Error(
      'ZK capability verification requires Sprint 3 ZK circuits (postponed)',
    );
  }

  async isVerifiedOperator(agentId: bigint): Promise<boolean> {
    return this.identity.isVerifiedOperator(agentId);
  }

  async setOperator(
    agentId: bigint,
    operator: Address,
  ): Promise<TransactionResult> {
    return this.identity.setOperator(agentId, operator);
  }

  // ==========================================
  // REPUTATION CONVENIENCE METHODS
  // ==========================================

  async submitFeedback(
    agentId: bigint,
    feedback: FeedbackInput,
  ): Promise<TransactionResult> {
    return this.reputation.submitFeedback(agentId, feedback);
  }

  async submitFeedbackWithPaymentProof(
    agentId: bigint,
    feedback: FeedbackInput,
    x402Proof: Uint8Array,
  ): Promise<TransactionResult> {
    return this.reputation.submitFeedback(agentId, {
      ...feedback,
      x402Proof,
    });
  }

  async revokeFeedback(
    agentId: bigint,
    feedbackIndex: number,
  ): Promise<TransactionResult> {
    return this.reputation.revokeFeedback(agentId, feedbackIndex);
  }

  async respondToFeedback(
    agentId: bigint,
    client: Address,
    feedbackIndex: number,
    responseURI: string,
  ): Promise<TransactionResult> {
    return this.reputation.respondToFeedback(
      agentId,
      client,
      feedbackIndex,
      responseURI,
    );
  }

  async getReputation(
    agentId: bigint,
    options?: ReputationQueryOptions,
  ): Promise<FeedbackSummary> {
    return this.reputation.getReputation(agentId, options);
  }

  async getStakeWeightedReputation(
    agentId: bigint,
  ): Promise<FeedbackSummary> {
    return this.reputation.getStakeWeightedReputation(agentId);
  }

  async getVerifiedReputation(agentId: bigint): Promise<FeedbackSummary> {
    return this.reputation.getVerifiedReputation(agentId);
  }

  async getFeedback(
    agentId: bigint,
    options?: { client?: Address; offset?: number; limit?: number },
  ): Promise<{ feedbacks: import('./types').FeedbackEntry[]; total: number }> {
    if (options?.client) {
      const feedbacks = await this.reputation.getFeedback(
        agentId,
        options.client,
      );
      return { feedbacks, total: feedbacks.length };
    }

    // Get all clients and aggregate
    const clients = await this.reputation.getClientList(agentId);
    const allFeedbacks: import('./types').FeedbackEntry[] = [];
    for (const client of clients) {
      const feedbacks = await this.reputation.getFeedback(agentId, client);
      allFeedbacks.push(...feedbacks);
    }

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? allFeedbacks.length;
    return {
      feedbacks: allFeedbacks.slice(offset, offset + limit),
      total: allFeedbacks.length,
    };
  }

  // ==========================================
  // VALIDATION CONVENIENCE METHODS
  // ==========================================

  async requestValidation(
    params: ValidationRequestParams,
  ): Promise<{ requestHash: Bytes32; tx: TransactionResult }> {
    return this.validation.requestValidation(params);
  }

  async submitValidation(
    requestHash: Bytes32,
    score: number,
    proof: `0x${string}`,
    detailsURI: string,
  ): Promise<TransactionResult> {
    return this.validation.submitValidation(
      requestHash,
      score,
      proof,
      detailsURI,
    );
  }

  async getValidationStatus(
    requestHash: Bytes32,
  ): Promise<ValidationDetails> {
    return this.validation.getValidation(requestHash);
  }

  async getAgentValidations(
    agentId: bigint,
    options?: {
      status?: import('./types').ValidationStatus;
      limit?: number;
    },
  ): Promise<ValidationDetails[]> {
    const hashes = await this.validation.getAgentValidations(agentId);
    const details = await Promise.all(
      hashes.map((h) => this.validation.getValidation(h)),
    );

    let filtered = details;
    if (options?.status !== undefined) {
      filtered = filtered.filter(
        (d) => d.request.status === options.status,
      );
    }
    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  async disputeValidation(
    requestHash: Bytes32,
    evidence: `0x${string}`,
  ): Promise<TransactionResult> {
    return this.validation.disputeValidation(requestHash, evidence);
  }

  // ==========================================
  // V2 IDENTITY CONVENIENCE METHODS
  // ==========================================

  async registerAgentV2(
    params: RegisterV2Params,
  ): Promise<{ agentId: bigint; tx: TransactionResult }> {
    return this.identity.registerAgentV2(params);
  }

  async getAgentV2(agentId: bigint): Promise<AgentV2Details> {
    return this.identity.getAgentV2(agentId);
  }

  async checkAndSlash(agentId: bigint): Promise<TransactionResult> {
    return this.identity.checkAndSlash(agentId);
  }

  async reactivateAgent(agentId: bigint): Promise<TransactionResult> {
    return this.identity.reactivate(agentId);
  }

  async addOperator(
    agentId: bigint,
    consent: OperatorConsentData,
    signature: `0x${string}`,
  ): Promise<TransactionResult> {
    return this.identity.addOperator(agentId, consent, signature);
  }

  async removeOperator(
    agentId: bigint,
    operator: Address,
  ): Promise<TransactionResult> {
    return this.identity.removeOperator(agentId, operator);
  }

  // ==========================================
  // V2 VALIDATION CONVENIENCE METHODS
  // ==========================================

  async getAgentValidationStats(
    agentId: bigint,
    windowSeconds?: bigint,
  ): Promise<ValidationStats> {
    return this.validation.getAgentValidationStats(agentId, windowSeconds);
  }

  // ==========================================
  // DISCOVERY METHODS
  // ==========================================

  async searchAgents(query: AgentSearchQuery): Promise<AgentSearchResult> {
    // When subgraph is available, delegate to it
    // For now, use direct contract reads
    const totalCount = Number(await this.identity.getAgentCount());
    const first = query.first ?? 20;
    const skip = query.skip ?? 0;

    const agents: AgentDetails[] = [];
    const maxId = totalCount;

    for (let i = skip + 1; i <= Math.min(skip + first, maxId); i++) {
      try {
        const exists = await this.identity.agentExists(BigInt(i));
        if (exists) {
          const agent = await this.getAgent(BigInt(i));

          // Apply filters
          if (query.verifiedOperatorOnly && !agent.verifiedOperator) continue;
          if (query.zkIdentityOnly && !agent.zkIdentity) continue;
          if (
            query.minReputation !== undefined &&
            (agent.averageScore ?? 0) < query.minReputation
          )
            continue;

          agents.push(agent);
        }
      } catch {
        // Agent may not exist at this ID
      }
    }

    return {
      agents,
      totalCount,
      hasMore: skip + first < totalCount,
    };
  }

  async getTopAgents(options: {
    limit: number;
    sortBy: 'reputation' | 'validations' | 'stake';
  }): Promise<AgentDetails[]> {
    const result = await this.searchAgents({ first: options.limit * 2 });
    const sorted = result.agents.sort((a, b) => {
      switch (options.sortBy) {
        case 'reputation':
          return (b.averageScore ?? 0) - (a.averageScore ?? 0);
        case 'validations':
          return b.validationCount - a.validationCount;
        default:
          return 0;
      }
    });
    return sorted.slice(0, options.limit);
  }

  async getAgentsByCapability(capability: string): Promise<AgentDetails[]> {
    // When subgraph is available, this would be a filtered query
    // For now, return empty - requires ZK capability proofs (Sprint 3)
    return [];
  }

  async getProtocolStats(): Promise<ProtocolStats> {
    const totalAgents = Number(await this.identity.getAgentCount());

    return {
      totalAgents,
      activeAgents: totalAgents, // All agents considered active for now
      totalFeedbacks: 0, // Would need subgraph or event scanning
      totalValidations: 0,
      completedValidations: 0,
      totalBountiesPaid: 0n,
      totalStaked: 0n,
    };
  }

  // ==========================================
  // BUILDER FACTORY
  // ==========================================

  createRegistrationBuilder(): RegistrationBuilder {
    return new RegistrationBuilder();
  }

  // ==========================================
  // PRIVATE HELPERS
  // ==========================================

  private async fetchRegistrationFile(
    uri: string,
  ): Promise<import('./types').AgentRegistrationFile | null> {
    try {
      let fetchUrl = uri;
      if (uri.startsWith('ipfs://')) {
        const gateway =
          this.config.ipfsGateway ?? 'https://ipfs.io/ipfs/';
        fetchUrl = gateway + uri.slice(7);
      }
      const response = await fetch(fetchUrl);
      if (!response.ok) return null;
      return (await response.json()) as import('./types').AgentRegistrationFile;
    } catch {
      return null;
    }
  }
}
