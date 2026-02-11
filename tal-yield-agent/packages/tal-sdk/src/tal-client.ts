import type { Address, Hash, PublicClient, WalletClient } from "viem";
import { THANOS_SEPOLIA_ADDRESSES, thanosSepolia } from "@tal-yield-agent/shared";
import { IdentityClient } from "./clients/identity-client.js";
import { EscrowClient } from "./clients/escrow-client.js";
import { ReputationClient } from "./clients/reputation-client.js";
import type {
  TALClientConfig,
  AgentInfo,
  TaskEscrowData,
  Feedback,
  FeedbackSummary,
  SubmitFeedbackParams,
} from "./types.js";

export interface TALClientOptions {
  publicClient: PublicClient;
  walletClient?: WalletClient;
  addresses?: Partial<TALClientConfig["addresses"]>;
}

/**
 * Facade client for all TAL contract interactions.
 * Wraps IdentityClient, EscrowClient, and ReputationClient.
 */
export class TALClient {
  readonly identity: IdentityClient;
  readonly escrow: EscrowClient;
  readonly reputation: ReputationClient;
  readonly chain = thanosSepolia;

  constructor(options: TALClientOptions) {
    const config: TALClientConfig = {
      publicClient: options.publicClient,
      walletClient: options.walletClient,
      addresses: {
        identityRegistry:
          options.addresses?.identityRegistry ?? THANOS_SEPOLIA_ADDRESSES.TALIdentityRegistry,
        taskFeeEscrow:
          options.addresses?.taskFeeEscrow ?? THANOS_SEPOLIA_ADDRESSES.TaskFeeEscrow,
        reputationRegistry:
          options.addresses?.reputationRegistry ?? THANOS_SEPOLIA_ADDRESSES.TALReputationRegistry,
      },
    };

    this.identity = new IdentityClient(config);
    this.escrow = new EscrowClient(config);
    this.reputation = new ReputationClient(config);
  }

  // === Identity Shortcuts ===

  async registerAgent(agentURI: string): Promise<Hash> {
    return this.identity.register(agentURI);
  }

  async setOperator(agentId: bigint, operator: Address): Promise<Hash> {
    return this.identity.setOperator(agentId, operator);
  }

  async getAgentInfo(agentId: bigint): Promise<AgentInfo> {
    return this.identity.getAgentInfo(agentId);
  }

  // === Escrow Shortcuts ===

  async payForTask(agentId: bigint, taskRef: Hash, value: bigint): Promise<Hash> {
    return this.escrow.payForTask(agentId, taskRef, value);
  }

  async confirmTask(taskRef: Hash): Promise<Hash> {
    return this.escrow.confirmTask(taskRef);
  }

  async claimFees(agentId: bigint): Promise<Hash> {
    return this.escrow.claimFees(agentId);
  }

  async getTaskEscrow(taskRef: Hash): Promise<TaskEscrowData> {
    return this.escrow.getTaskEscrow(taskRef);
  }

  // === Reputation Shortcuts ===

  async submitFeedback(params: SubmitFeedbackParams): Promise<Hash> {
    return this.reputation.submitFeedback(params);
  }

  async getReputation(agentId: bigint): Promise<{
    feedbackCount: bigint;
    clients: readonly Address[];
    summary: FeedbackSummary;
  }> {
    return this.reputation.getFullReputation(agentId);
  }

  async getFeedback(agentId: bigint, client: Address): Promise<Feedback[]> {
    return this.reputation.getFeedback(agentId, client);
  }
}
