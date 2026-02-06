// ============================================
// CORE TYPES
// ============================================

export type Address = `0x${string}`;
export type Bytes32 = `0x${string}`;
export type BigIntish = bigint | string | number;

// ============================================
// IDENTITY TYPES
// ============================================

export interface AgentRegistrationFile {
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";
  name: string;
  description: string;
  image?: string;
  active: boolean;
  services?: {
    A2A?: string;
    MCP?: string;
    OASF?: string;
    ENS?: string;
    DID?: string;
    web?: string;
    email?: string;
    [key: string]: string | undefined;
  };
  supportedTrust?: Array<"reputation" | "crypto-economic" | "tee-attestation">;
  x402Support?: boolean;
  registrations?: Array<{
    agentId: string;
    agentRegistry: string;
    chainId?: number;
  }>;
  tal?: {
    capabilities?: Array<{
      id: string;
      name: string;
      description: string;
      inputSchema?: object;
      outputSchema?: object;
    }>;
    operator?: {
      address: string;
      organization?: string;
      website?: string;
    };
    teeConfig?: {
      provider: "sgx" | "nitro" | "trustzone";
      enclaveHash: string;
      attestationEndpoint?: string;
    };
    pricing?: {
      currency: "TON" | "USD";
      perRequest?: string;
      perToken?: string;
      subscription?: {
        monthly?: string;
        yearly?: string;
      };
    };
  };
}

export interface AgentDetails {
  agentId: bigint;
  owner: Address;
  agentURI: string;
  zkIdentity: Bytes32 | null;
  verifiedOperator: boolean;
  operator: Address | null;
  registeredAt: Date;
  updatedAt: Date;
  feedbackCount: number;
  averageScore: number | null;
  verifiedScore: number | null;
  validationCount: number;
  successfulValidations: number;
  registration?: AgentRegistrationFile;
}

export interface RegistrationParams {
  agentURI: string;
  zkCommitment?: Bytes32;
  operator?: Address;
}

export interface ZKIdentityInputs {
  name: string;
  capabilities: string[];
  organization: string;
  nonce: bigint;
}

// ============================================
// REPUTATION TYPES
// ============================================

export interface FeedbackInput {
  value: number;
  valueDecimals: number;
  tag1: string;
  tag2: string;
  endpoint?: string;
  feedbackURI?: string;
  feedbackHash?: Bytes32;
  x402Proof?: Uint8Array;
}

export interface FeedbackEntry {
  value: bigint;
  valueDecimals: number;
  tag1: string;
  tag2: string;
  endpoint: string;
  feedbackURI: string;
  feedbackHash: Bytes32;
  isRevoked: boolean;
  timestamp: Date;
  hasPaymentProof: boolean;
}

export interface FeedbackSummary {
  totalValue: bigint;
  count: number;
  min: bigint;
  max: bigint;
  average: number;
}

export interface ReputationQueryOptions {
  clients?: Address[];
  stakeWeighted?: boolean;
  verifiedOnly?: boolean;
  tags?: string[];
  fromDate?: Date;
  toDate?: Date;
}

// ============================================
// VALIDATION TYPES
// ============================================

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

export interface ValidationRequestParams {
  agentId: bigint;
  taskHash: Bytes32;
  outputHash: Bytes32;
  model: ValidationModel;
  deadline: Date;
  bounty: bigint;
}

export interface ValidationRequest {
  requestHash: Bytes32;
  agentId: bigint;
  requester: Address;
  taskHash: Bytes32;
  outputHash: Bytes32;
  model: ValidationModel;
  bounty: bigint;
  deadline: Date;
  status: ValidationStatus;
}

export interface ValidationResponse {
  validator: Address;
  score: number;
  proof: Uint8Array;
  detailsURI: string;
  timestamp: Date;
}

export interface ValidationDetails {
  request: ValidationRequest;
  response: ValidationResponse | null;
  isDisputed: boolean;
  disputeDeadline: Date | null;
}

// ============================================
// ZK PROOF TYPES
// ============================================

export interface ZKProof {
  pi_a: [string, string];
  pi_b: [[string, string], [string, string]];
  pi_c: [string, string];
  protocol: "groth16" | "plonk";
  curve: "bn128";
}

export interface MerkleProof {
  root: Bytes32;
  siblings: Bytes32[];
  pathIndices: number[];
}

export interface IdentityPrivateInputs {
  name: bigint;
  capabilities: bigint[];
  organization: bigint;
  nonce: bigint;
}

// ============================================
// DISCOVERY TYPES
// ============================================

export interface AgentSearchQuery {
  query?: string;
  capabilities?: string[];
  minReputation?: number;
  minStake?: bigint;
  verifiedOperatorOnly?: boolean;
  zkIdentityOnly?: boolean;
  supportedTrust?: Array<"reputation" | "crypto-economic" | "tee-attestation">;
  first?: number;
  skip?: number;
  orderBy?: "reputation" | "validations" | "stake" | "registeredAt";
  orderDirection?: "asc" | "desc";
}

export interface AgentSearchResult {
  agents: AgentDetails[];
  totalCount: number;
  hasMore: boolean;
}

// ============================================
// PROTOCOL STATS
// ============================================

export interface ProtocolStats {
  totalAgents: number;
  activeAgents: number;
  totalFeedbacks: number;
  totalValidations: number;
  completedValidations: number;
  totalBountiesPaid: bigint;
  totalStaked: bigint;
}

// ============================================
// CLIENT CONFIG
// ============================================

export interface TALClientConfig {
  chainId?: number;
  rpcUrl?: string;
  contracts?: {
    identityRegistry?: Address;
    reputationRegistry?: Address;
    validationRegistry?: Address;
  };
  subgraphUrl?: string;
  ipfsGateway?: string;
  cacheTimeout?: number;
}

// ============================================
// CONTRACT ADDRESSES (DEFAULTS)
// ============================================

export const OPTIMISM_SEPOLIA_ADDRESSES = {
  identityRegistry: "0x3f89CD27fD877827E7665A9883b3c0180E22A525" as Address,
  reputationRegistry: "0x0052258E517835081c94c0B685409f2EfC4D502b" as Address,
  validationRegistry: "0x09447147C6E75a60A449f38532F06E19F5F632F3" as Address,
  stakingIntegrationModule: "0x41FF86643f6d550725177af1ABBF4db9715A74b8" as Address,
} as const;

export const DEFAULT_CHAIN_ID = 11155420; // Optimism Sepolia

// ============================================
// EXTENDED FEEDBACK DATA (IPFS)
// ============================================

export interface ExtendedFeedbackData {
  version: "1.0";
  onChainRef: {
    agentId: string;
    feedbackIndex: number;
    txHash: string;
  };
  details: {
    taskDescription?: string;
    inputSummary?: string;
    outputSummary?: string;
    ratings?: {
      accuracy?: number;
      speed?: number;
      reliability?: number;
      costEfficiency?: number;
    };
    review?: string;
    attachments?: Array<{
      type: "image" | "document" | "log";
      uri: string;
      description?: string;
    }>;
  };
  signature?: string;
  timestamp: number;
}

// ============================================
// TRANSACTION TYPES
// ============================================

export interface TransactionResult {
  hash: Bytes32;
  blockNumber: bigint;
  status: "success" | "reverted";
}
