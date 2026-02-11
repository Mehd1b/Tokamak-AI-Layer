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
    validationRegistry: Address;
    stakingIntegrationModule: Address;
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

// ============================================================
// Validation Types
// ============================================================

export enum ValidationModel {
  ReputationOnly = 0,
  StakeSecured = 1,
  TEEAttested = 2,
  Hybrid = 3,
}

export enum ValidationStatus {
  Pending = 0,
  Completed = 1,
  Expired = 2,
  Disputed = 3,
}

export interface ValidationRequest {
  agentId: bigint;
  requester: Address;
  taskHash: Hash;
  outputHash: Hash;
  model: ValidationModel;
  bounty: bigint;
  deadline: bigint;
  status: ValidationStatus;
}

export interface ValidationResponse {
  validator: Address;
  score: number;
  proof: Hash;
  detailsURI: string;
  timestamp: bigint;
}

export interface ValidationResult {
  request: ValidationRequest;
  response: ValidationResponse;
}

// ============================================================
// Staking Types
// ============================================================

export interface OperatorStatus {
  stakedAmount: bigint;
  isVerified: boolean;
  slashingCount: bigint;
  lastSlashTime: bigint;
}
