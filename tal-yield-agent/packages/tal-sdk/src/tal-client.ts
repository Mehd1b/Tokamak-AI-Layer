import type { Address, Hash, PublicClient, WalletClient } from "viem";
import { OPTIMISM_SEPOLIA_ADDRESSES, optimismSepolia } from "@tal-yield-agent/shared";
import { IdentityClient } from "./clients/identity-client.js";
import { EscrowClient } from "./clients/escrow-client.js";
import { ReputationClient } from "./clients/reputation-client.js";
import { ValidationClient } from "./clients/validation-client.js";
import { StakingClient } from "./clients/staking-client.js";
import type {
  TALClientConfig,
  AgentInfo,
  TaskEscrowData,
  Feedback,
  FeedbackSummary,
  SubmitFeedbackParams,
  ValidationResult,
  ValidationModel,
  OperatorStatus,
} from "./types.js";

export interface TALClientOptions {
  publicClient: PublicClient;
  walletClient?: WalletClient;
  addresses?: Partial<TALClientConfig["addresses"]>;
}

/**
 * Facade client for all TAL contract interactions.
 * Wraps IdentityClient, EscrowClient, ReputationClient,
 * ValidationClient, and StakingClient.
 */
export class TALClient {
  readonly identity: IdentityClient;
  readonly escrow: EscrowClient;
  readonly reputation: ReputationClient;
  readonly validation: ValidationClient;
  readonly staking: StakingClient;
  readonly chain = optimismSepolia;

  constructor(options: TALClientOptions) {
    const config: TALClientConfig = {
      publicClient: options.publicClient,
      walletClient: options.walletClient,
      addresses: {
        identityRegistry:
          options.addresses?.identityRegistry ?? OPTIMISM_SEPOLIA_ADDRESSES.TALIdentityRegistry,
        taskFeeEscrow:
          options.addresses?.taskFeeEscrow ?? OPTIMISM_SEPOLIA_ADDRESSES.TaskFeeEscrow,
        reputationRegistry:
          options.addresses?.reputationRegistry ?? OPTIMISM_SEPOLIA_ADDRESSES.TALReputationRegistry,
        validationRegistry:
          options.addresses?.validationRegistry ?? OPTIMISM_SEPOLIA_ADDRESSES.TALValidationRegistry,
        stakingIntegrationModule:
          options.addresses?.stakingIntegrationModule ?? OPTIMISM_SEPOLIA_ADDRESSES.StakingIntegrationModule,
      },
    };

    this.identity = new IdentityClient(config);
    this.escrow = new EscrowClient(config);
    this.reputation = new ReputationClient(config);
    this.validation = new ValidationClient(config);
    this.staking = new StakingClient(config);
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

  async updateAPYAccuracy(agentId: bigint, taskId: string, actualAPY: bigint): Promise<Hash> {
    return this.reputation.updateAPYAccuracy(agentId, taskId, actualAPY);
  }

  // === Validation Shortcuts ===

  async getValidationResult(requestHash: Hash): Promise<ValidationResult> {
    return this.validation.getValidation(requestHash);
  }

  async submitValidation(
    requestHash: Hash,
    score: number,
    proof: Hash,
    detailsURI: string,
  ): Promise<Hash> {
    return this.validation.submitValidation(requestHash, score, proof, detailsURI);
  }

  async requestValidation(
    agentId: bigint,
    taskHash: Hash,
    outputHash: Hash,
    model: ValidationModel,
    deadline: bigint,
    bounty: bigint,
  ): Promise<Hash> {
    return this.validation.requestValidation(agentId, taskHash, outputHash, model, deadline, bounty);
  }

  // === Staking Shortcuts ===

  async getStakeBalance(operator: Address): Promise<bigint> {
    return this.staking.getStakeBalance(operator);
  }

  async getOperatorStatus(operator: Address): Promise<OperatorStatus> {
    return this.staking.getOperatorStatus(operator);
  }
}
