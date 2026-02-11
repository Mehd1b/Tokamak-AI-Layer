import type { Address, Hash, PublicClient, WalletClient } from "viem";

// ============================================================
// Configuration
// ============================================================

export interface TALClientConfig {
  publicClient: PublicClient;
  walletClient?: WalletClient;
  addresses: {
    identityRegistry: Address;
    taskFeeEscrow: Address;
    reputationRegistry: Address;
  };
}

// ============================================================
// Identity Types
// ============================================================

export interface AgentMetadata {
  name: string;
  version: string;
  description: string;
  capabilities: string[];
  supportedProtocols: string[];
  supportedChains: number[];
  pricing: Record<string, string>;
  validationModel: string;
}

export interface AgentInfo {
  agentId: bigint;
  owner: Address;
  operator: Address;
  uri: string;
  isVerifiedOperator: boolean;
}

// ============================================================
// Escrow Types
// ============================================================

export enum TaskStatus {
  Escrowed = 0,
  Confirmed = 1,
  Refunded = 2,
}

export interface TaskEscrowData {
  payer: Address;
  agentId: bigint;
  amount: bigint;
  paidAt: bigint;
  status: TaskStatus;
}

// ============================================================
// Reputation Types
// ============================================================

export interface Feedback {
  value: bigint;
  valueDecimals: number;
  tag1: string;
  tag2: string;
  endpoint: string;
  feedbackURI: string;
  feedbackHash: Hash;
  isRevoked: boolean;
  timestamp: bigint;
}

export interface FeedbackSummary {
  totalValue: bigint;
  count: bigint;
  min: bigint;
  max: bigint;
}

export interface StakeWeightedSummary {
  weightedTotalValue: bigint;
  totalWeight: bigint;
  count: bigint;
  min: bigint;
  max: bigint;
}

export interface SubmitFeedbackParams {
  agentId: bigint;
  value: bigint;
  valueDecimals: number;
  tag1: string;
  tag2: string;
  endpoint: string;
  feedbackURI: string;
  feedbackHash: Hash;
}
