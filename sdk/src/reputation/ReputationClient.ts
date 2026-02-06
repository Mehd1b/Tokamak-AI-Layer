import { type PublicClient, type WalletClient } from 'viem';
import { TALReputationRegistryABI } from '../abi/TALReputationRegistry';
import type {
  Address,
  Bytes32,
  FeedbackInput,
  FeedbackEntry,
  FeedbackSummary,
  ReputationQueryOptions,
  TransactionResult,
} from '../types';

export class ReputationClient {
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient | undefined;
  private readonly contractAddress: Address;

  constructor(
    publicClient: PublicClient,
    contractAddress: Address,
    walletClient?: WalletClient,
  ) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.contractAddress = contractAddress;
  }

  /**
   * Submit feedback for an agent
   */
  async submitFeedback(
    agentId: bigint,
    feedback: FeedbackInput,
  ): Promise<TransactionResult> {
    this.requireWallet();

    const feedbackHash =
      feedback.feedbackHash ??
      ('0x0000000000000000000000000000000000000000000000000000000000000000' as Bytes32);

    let hash: Bytes32;

    if (feedback.x402Proof) {
      hash = await this.walletClient!.writeContract({
        address: this.contractAddress,
        abi: TALReputationRegistryABI,
        functionName: 'submitFeedbackWithPaymentProof',
        args: [
          agentId,
          BigInt(feedback.value),
          feedback.valueDecimals,
          feedback.tag1,
          feedback.tag2,
          feedback.endpoint ?? '',
          feedback.feedbackURI ?? '',
          feedbackHash,
          `0x${Buffer.from(feedback.x402Proof).toString('hex')}` as `0x${string}`,
        ],
        chain: this.walletClient!.chain,
        account: this.walletClient!.account!,
      });
    } else {
      hash = await this.walletClient!.writeContract({
        address: this.contractAddress,
        abi: TALReputationRegistryABI,
        functionName: 'submitFeedback',
        args: [
          agentId,
          BigInt(feedback.value),
          feedback.valueDecimals,
          feedback.tag1,
          feedback.tag2,
          feedback.endpoint ?? '',
          feedback.feedbackURI ?? '',
          feedbackHash,
        ],
        chain: this.walletClient!.chain,
        account: this.walletClient!.account!,
      });
    }

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    return {
      hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 'success' ? 'success' : 'reverted',
    };
  }

  /**
   * Revoke feedback
   */
  async revokeFeedback(
    agentId: bigint,
    feedbackIndex: number,
  ): Promise<TransactionResult> {
    this.requireWallet();
    const hash = await this.walletClient!.writeContract({
      address: this.contractAddress,
      abi: TALReputationRegistryABI,
      functionName: 'revokeFeedback',
      args: [agentId, BigInt(feedbackIndex)],
      chain: this.walletClient!.chain,
      account: this.walletClient!.account!,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    return {
      hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 'success' ? 'success' : 'reverted',
    };
  }

  /**
   * Respond to feedback (agent owner/operator only)
   */
  async respondToFeedback(
    agentId: bigint,
    client: Address,
    feedbackIndex: number,
    responseURI: string,
  ): Promise<TransactionResult> {
    this.requireWallet();
    const hash = await this.walletClient!.writeContract({
      address: this.contractAddress,
      abi: TALReputationRegistryABI,
      functionName: 'respondToFeedback',
      args: [agentId, client, BigInt(feedbackIndex), responseURI],
      chain: this.walletClient!.chain,
      account: this.walletClient!.account!,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    return {
      hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 'success' ? 'success' : 'reverted',
    };
  }

  /**
   * Get reputation summary for an agent
   */
  async getReputation(
    agentId: bigint,
    options?: ReputationQueryOptions,
  ): Promise<FeedbackSummary> {
    const clients = options?.clients ?? [];

    if (options?.stakeWeighted) {
      return this.getStakeWeightedReputation(agentId, clients);
    }

    if (options?.verifiedOnly) {
      return this.getVerifiedReputation(agentId, clients);
    }

    const summary = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALReputationRegistryABI,
      functionName: 'getSummary',
      args: [agentId, clients],
    })) as any;

    return this.parseSummary(summary);
  }

  /**
   * Get stake-weighted reputation
   */
  async getStakeWeightedReputation(
    agentId: bigint,
    clients: Address[] = [],
  ): Promise<FeedbackSummary> {
    const summary = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALReputationRegistryABI,
      functionName: 'getStakeWeightedSummary',
      args: [agentId, clients],
    })) as any;

    return this.parseSummary(summary);
  }

  /**
   * Get verified reputation (validated tasks only)
   */
  async getVerifiedReputation(
    agentId: bigint,
    clients: Address[] = [],
  ): Promise<FeedbackSummary> {
    const summary = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALReputationRegistryABI,
      functionName: 'getVerifiedSummary',
      args: [agentId, clients],
    })) as any;

    return this.parseSummary(summary);
  }

  /**
   * Get feedback entries for an agent from a specific client
   */
  async getFeedback(
    agentId: bigint,
    client: Address,
  ): Promise<FeedbackEntry[]> {
    const feedbacks = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALReputationRegistryABI,
      functionName: 'getFeedback',
      args: [agentId, client],
    })) as any[];

    return feedbacks.map((f: any) => ({
      value: BigInt(f.value),
      valueDecimals: Number(f.valueDecimals),
      tag1: f.tag1,
      tag2: f.tag2,
      endpoint: f.endpoint,
      feedbackURI: f.feedbackURI,
      feedbackHash: f.feedbackHash as Bytes32,
      isRevoked: f.isRevoked,
      timestamp: new Date(Number(f.timestamp) * 1000),
      hasPaymentProof: f.hasPaymentProof,
    }));
  }

  /**
   * Get client list for an agent
   */
  async getClientList(agentId: bigint): Promise<Address[]> {
    const clients = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALReputationRegistryABI,
      functionName: 'getClientList',
      args: [agentId],
    });
    return clients as Address[];
  }

  /**
   * Get feedback count for an agent
   */
  async getFeedbackCount(agentId: bigint): Promise<number> {
    const count = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALReputationRegistryABI,
      functionName: 'getFeedbackCount',
      args: [agentId],
    });
    return Number(count);
  }

  /**
   * Get reviewer reputation score
   */
  async getReviewerReputation(reviewer: Address): Promise<bigint> {
    const rep = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: TALReputationRegistryABI,
      functionName: 'getReviewerReputation',
      args: [reviewer],
    });
    return rep as bigint;
  }

  private parseSummary(summary: any): FeedbackSummary {
    return {
      totalValue: BigInt(summary.totalValue ?? summary[0] ?? 0),
      count: Number(summary.count ?? summary[1] ?? 0),
      min: BigInt(summary.min ?? summary[2] ?? 0),
      max: BigInt(summary.max ?? summary[3] ?? 0),
      average: Number(summary.average ?? summary[4] ?? 0),
    };
  }

  private requireWallet(): void {
    if (!this.walletClient) {
      throw new Error(
        'WalletClient required for write operations. Pass a walletClient to TALClient config.',
      );
    }
    if (!this.walletClient.account) {
      throw new Error('WalletClient must have an account connected.');
    }
  }
}
