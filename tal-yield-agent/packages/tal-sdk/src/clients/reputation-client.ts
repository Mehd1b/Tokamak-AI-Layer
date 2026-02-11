import type { Address, Hash, PublicClient, WalletClient } from "viem";
import { TALReputationRegistryABI } from "@tal-yield-agent/shared";
import type {
  TALClientConfig,
  Feedback,
  FeedbackSummary,
  StakeWeightedSummary,
  SubmitFeedbackParams,
} from "../types.js";

export class ReputationClient {
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient | undefined;
  private readonly address: Address;

  constructor(config: TALClientConfig) {
    this.publicClient = config.publicClient;
    this.walletClient = config.walletClient;
    this.address = config.addresses.reputationRegistry;
  }

  // === Read Methods ===

  async getFeedback(agentId: bigint, client: Address): Promise<Feedback[]> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: TALReputationRegistryABI,
      functionName: "getFeedback",
      args: [agentId, client],
    });

    return result.map((f) => ({
      value: f.value,
      valueDecimals: f.valueDecimals,
      tag1: f.tag1,
      tag2: f.tag2,
      endpoint: f.endpoint,
      feedbackURI: f.feedbackURI,
      feedbackHash: f.feedbackHash,
      isRevoked: f.isRevoked,
      timestamp: f.timestamp,
    }));
  }

  async getFeedbackCount(agentId: bigint): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.address,
      abi: TALReputationRegistryABI,
      functionName: "getFeedbackCount",
      args: [agentId],
    });
  }

  async getClientList(agentId: bigint): Promise<readonly Address[]> {
    return this.publicClient.readContract({
      address: this.address,
      abi: TALReputationRegistryABI,
      functionName: "getClientList",
      args: [agentId],
    });
  }

  async getSummary(agentId: bigint, clients: Address[]): Promise<FeedbackSummary> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: TALReputationRegistryABI,
      functionName: "getSummary",
      args: [agentId, clients],
    });

    return {
      totalValue: result.totalValue,
      count: result.count,
      min: result.min,
      max: result.max,
    };
  }

  async getStakeWeightedSummary(
    agentId: bigint,
    clients: Address[],
  ): Promise<StakeWeightedSummary> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: TALReputationRegistryABI,
      functionName: "getStakeWeightedSummary",
      args: [agentId, clients],
    });

    return {
      weightedTotalValue: result.weightedTotalValue,
      totalWeight: result.totalWeight,
      count: result.count,
      min: result.min,
      max: result.max,
    };
  }

  async getFullReputation(agentId: bigint): Promise<{
    feedbackCount: bigint;
    clients: readonly Address[];
    summary: FeedbackSummary;
  }> {
    const [feedbackCount, clients] = await Promise.all([
      this.getFeedbackCount(agentId),
      this.getClientList(agentId),
    ]);

    const summary = await this.getSummary(agentId, [...clients]);

    return { feedbackCount, clients, summary };
  }

  // === Write Methods ===

  async submitFeedback(params: SubmitFeedbackParams): Promise<Hash> {
    const wallet = this.requireWallet();
    const { request } = await this.publicClient.simulateContract({
      address: this.address,
      abi: TALReputationRegistryABI,
      functionName: "submitFeedback",
      args: [
        params.agentId,
        params.value,
        params.valueDecimals,
        params.tag1,
        params.tag2,
        params.endpoint,
        params.feedbackURI,
        params.feedbackHash,
      ],
      account: wallet.account!,
    });
    return wallet.writeContract(request);
  }

  async respondToFeedback(
    agentId: bigint,
    client: Address,
    feedbackIndex: bigint,
    responseURI: string,
  ): Promise<Hash> {
    const wallet = this.requireWallet();
    const { request } = await this.publicClient.simulateContract({
      address: this.address,
      abi: TALReputationRegistryABI,
      functionName: "respondToFeedback",
      args: [agentId, client, feedbackIndex, responseURI],
      account: wallet.account!,
    });
    return wallet.writeContract(request);
  }

  private requireWallet(): WalletClient {
    if (!this.walletClient?.account) {
      throw new Error("WalletClient with account required for write operations");
    }
    return this.walletClient;
  }
}
