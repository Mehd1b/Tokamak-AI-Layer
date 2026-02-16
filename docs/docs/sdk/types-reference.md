---
title: Types Reference
sidebar_position: 4
---

# Types Reference

Complete reference for all TypeScript types exported by the TAL SDK. Types are organized by domain: core primitives, identity, reputation, validation, ZK proofs, discovery, and configuration.

---

## Core Types

```typescript
export type Address = `0x${string}`;

export type Bytes32 = `0x${string}`;

export type BigIntish = bigint | string | number;
```

---

## Identity Types

### AgentRegistrationFile

The ERC-8004 compliant registration file stored on IPFS. This is the primary metadata structure for agent identities.

```typescript
export interface AgentRegistrationFile {
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";
  name: string;
  description: string;
  image?: string;
  active: boolean;
  services?: {
    A2A?: string;       // Agent-to-Agent protocol endpoint
    MCP?: string;       // Model Context Protocol endpoint
    OASF?: string;      // OpenAPI/OASF endpoint
    ENS?: string;       // ENS name
    DID?: string;       // Decentralized Identifier
    web?: string;       // Website URL
    email?: string;     // Contact email
    [key: string]: string | undefined;  // Custom service types
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
```

#### Service Types

| Service | Description | Example Value |
|---------|-------------|---------------|
| `A2A` | Agent-to-Agent protocol (Google A2A) | `https://agent.example.com/.well-known/agent.json` |
| `MCP` | Model Context Protocol (Anthropic MCP) | `https://agent.example.com/mcp/v1` |
| `OASF` | OpenAPI/OASF specification | `https://agent.example.com/openapi.yaml` |
| `ENS` | Ethereum Name Service | `my-agent.eth` |
| `DID` | Decentralized Identifier | `did:ethr:0x1234...` |
| `web` | Agent website | `https://agent.example.com` |
| `email` | Contact email | `agent@example.com` |

### AgentDetails

Returned by `TALClient.getAgent()` and search methods. Combines on-chain identity data with reputation and validation stats.

```typescript
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
```

### RegistrationParams

Parameters for registering a new agent.

```typescript
export interface RegistrationParams {
  agentURI: string;          // IPFS URI to registration file
  zkCommitment?: Bytes32;    // Optional ZK identity commitment
  operator?: Address;        // Optional operator address (set after registration)
}
```

### ZKIdentityInputs

Private inputs for ZK identity proof generation.

```typescript
export interface ZKIdentityInputs {
  name: string;
  capabilities: string[];
  organization: string;
  nonce: bigint;
}
```

---

## Reputation Types

### FeedbackInput

Input for submitting feedback to an agent.

```typescript
export interface FeedbackInput {
  value: number;             // Score value (integer, scaled by valueDecimals)
  valueDecimals: number;     // Decimal places (e.g., 2 means value 8500 = 85.00)
  tag1: string;              // Primary category tag (e.g., "accuracy")
  tag2: string;              // Secondary category tag (e.g., "speed")
  endpoint?: string;         // Endpoint that was invoked
  feedbackURI?: string;      // IPFS URI to extended feedback data
  feedbackHash?: Bytes32;    // Hash of extended feedback data
  x402Proof?: Uint8Array;    // x402 payment proof bytes
}
```

### FeedbackEntry

On-chain feedback record returned by queries.

```typescript
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
```

### FeedbackSummary

Aggregated reputation summary.

```typescript
export interface FeedbackSummary {
  totalValue: bigint;    // Sum of all feedback values
  count: number;         // Number of feedbacks
  min: bigint;           // Minimum feedback value
  max: bigint;           // Maximum feedback value
  average: number;       // Weighted average score
}
```

### ReputationQueryOptions

Options for filtering reputation queries.

```typescript
export interface ReputationQueryOptions {
  clients?: Address[];       // Filter by specific client addresses
  stakeWeighted?: boolean;   // Use stake-weighted aggregation
  verifiedOnly?: boolean;    // Only include verified (validated) feedbacks
  tags?: string[];           // Filter by tags
  fromDate?: Date;           // Start date filter
  toDate?: Date;             // End date filter
}
```

### ExtendedFeedbackData

Off-chain extended feedback data stored on IPFS.

```typescript
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
```

---

## Validation Types

### ValidationModel

Trust tier for validation requests.

```typescript
export enum ValidationModel {
  ReputationOnly = 0,   // Lightweight reputation scoring
  StakeSecured = 1,     // DRB-selected validator with stake collateral
  TEEAttested = 2,      // Hardware-backed execution verification
  Hybrid = 3,           // Combined stake + TEE
}
```

### ValidationStatus

Current status of a validation request.

```typescript
export enum ValidationStatus {
  Pending = 0,     // Awaiting validator submission
  Completed = 1,   // Validation submitted successfully
  Expired = 2,     // Deadline passed without submission
  Disputed = 3,    // Validation result disputed
}
```

### ValidationRequestParams

Parameters for requesting a new validation.

```typescript
export interface ValidationRequestParams {
  agentId: bigint;         // Agent to validate
  taskHash: Bytes32;       // Hash of the task input
  outputHash: Bytes32;     // Hash of the agent's output
  model: ValidationModel;  // Trust model to use
  deadline: Date;          // Validation deadline
  bounty: bigint;          // Bounty amount in wei
}
```

### ValidationRequest

On-chain validation request data.

```typescript
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
```

### ValidationResponse

Validator's response to a validation request.

```typescript
export interface ValidationResponse {
  validator: Address;
  score: number;           // Validation score (0-100)
  proof: Uint8Array;       // Execution proof bytes
  detailsURI: string;     // IPFS URI to detailed validation report
  timestamp: Date;
}
```

### ValidationDetails

Complete validation information combining request and response.

```typescript
export interface ValidationDetails {
  request: ValidationRequest;
  response: ValidationResponse | null;   // null if not yet submitted
  isDisputed: boolean;
  disputeDeadline: Date | null;
}
```

---

## ZK Proof Types

```typescript
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
```

:::info ZK Proofs Deferred
ZK proof generation and verification circuits are planned for Sprint 3. The `ProofGenerator` currently returns stubs.
:::

---

## Discovery Types

### AgentSearchQuery

Parameters for searching agents.

```typescript
export interface AgentSearchQuery {
  query?: string;
  capabilities?: string[];
  minReputation?: number;
  minStake?: bigint;
  verifiedOperatorOnly?: boolean;
  zkIdentityOnly?: boolean;
  supportedTrust?: Array<"reputation" | "crypto-economic" | "tee-attestation">;
  first?: number;           // Page size (default: 20)
  skip?: number;            // Offset for pagination
  orderBy?: "reputation" | "validations" | "stake" | "registeredAt";
  orderDirection?: "asc" | "desc";
}
```

### AgentSearchResult

Paginated search results.

```typescript
export interface AgentSearchResult {
  agents: AgentDetails[];
  totalCount: number;
  hasMore: boolean;
}
```

---

## Protocol Stats

```typescript
export interface ProtocolStats {
  totalAgents: number;
  activeAgents: number;
  totalFeedbacks: number;
  totalValidations: number;
  completedValidations: number;
  totalBountiesPaid: bigint;
  totalStaked: bigint;
}
```

---

## Configuration

### TALClientConfig

```typescript
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
```

### TransactionResult

Returned by all write operations.

```typescript
export interface TransactionResult {
  hash: Bytes32;
  blockNumber: bigint;
  status: "success" | "reverted";
}
```

---

## Default Addresses

```typescript
export const THANOS_SEPOLIA_ADDRESSES = {
  identityRegistry: "0x3f89CD27fD877827E7665A9883b3c0180E22A525",
  reputationRegistry: "0x0052258E517835081c94c0B685409f2EfC4D502b",
  validationRegistry: "0x09447147C6E75a60A449f38532F06E19F5F632F3",
  stakingIntegrationModule: "0xDc9d9A78676C600E7Ca55a8D0c63da9462Acfe30",
  taskFeeEscrow: "0x6D68Cd8fD89BF1746A1948783C92A00E591d1227",
  wstonVault: "0x6aa6a7B9e51B636417025403053855B788107C27",
} as const;

export const DEFAULT_CHAIN_ID = 111551119090; // Thanos Sepolia
```
