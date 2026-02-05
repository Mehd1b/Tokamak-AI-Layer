# Tokamak Agent Layer (TAL) — Full Implementation Prompt

## Project Overview

You are a senior protocol engineer. Build the **Tokamak Agent Layer (TAL)**: an ERC-8004-compliant infrastructure layer for trustless AI agent discovery, reputation, and execution verification. TAL is deployed on a Tokamak L2 (EVM-compatible) and integrates with Tokamak's Decentralized Random Beacon (DRB), Staking V2, and ZK-EVM stack.

The system consists of **three on-chain registries** (Identity, Reputation, Validation), **three enhancement modules** (ZK Verifier, DRB Fairness, TON Economics), an **off-chain indexing layer** (Subgraph + IPFS), and a **frontend discovery portal**.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.24+, Foundry (forge, cast, anvil) |
| ZK Circuits | Circom 2.x + snarkjs (Groth16/PLONK), Poseidon hash |
| Indexing | The Graph (subgraph), IPFS (Pinata/Infura) |
| Frontend | Next.js 14+, TypeScript, wagmi/viem, TailwindCSS, shadcn/ui |
| SDK | TypeScript SDK (ethers.js v6 or viem), published to npm |
| Testing | Foundry tests (Solidity), Hardhat for integration, Vitest for SDK |
| CI/CD | GitHub Actions |
| Deployment | Tokamak L2 testnet → mainnet, Ethereum Sepolia for L1 reference |

---

## Repository Structure

```
tokamak-agent-layer/
├── contracts/                    # Foundry project root
│   ├── src/
│   │   ├── core/
│   │   │   ├── TALIdentityRegistry.sol
│   │   │   ├── TALReputationRegistry.sol
│   │   │   └── TALValidationRegistry.sol
│   │   ├── modules/
│   │   │   ├── ZKVerifierModule.sol
│   │   │   ├── DRBIntegrationModule.sol
│   │   │   └── StakingIntegrationModule.sol
│   │   ├── interfaces/
│   │   │   ├── IERC8004IdentityRegistry.sol
│   │   │   ├── IERC8004ReputationRegistry.sol
│   │   │   ├── IERC8004ValidationRegistry.sol
│   │   │   ├── ITALIdentityRegistry.sol
│   │   │   ├── ITALReputationRegistry.sol
│   │   │   ├── ITALValidationRegistry.sol
│   │   │   ├── IStakingV2.sol
│   │   │   ├── IDRB.sol
│   │   │   └── ITEEAttestation.sol
│   │   ├── libraries/
│   │   │   ├── PoseidonHasher.sol
│   │   │   ├── ReputationMath.sol
│   │   │   ├── ValidationUtils.sol
│   │   │   └── SlashingCalculator.sol
│   │   ├── governance/
│   │   │   ├── TALGovernor.sol
│   │   │   └── TALTimelock.sol
│   │   └── proxy/
│   │       └── TALProxy.sol
│   ├── test/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── invariant/
│   ├── script/
│   │   ├── Deploy.s.sol
│   │   └── Upgrade.s.sol
│   └── foundry.toml
├── circuits/                     # ZK circuits (Circom)
│   ├── identity/
│   │   ├── identity_commitment.circom
│   │   └── capability_proof.circom
│   ├── reputation/
│   │   ├── reputation_threshold.circom
│   │   └── merkle_inclusion.circom
│   ├── build/                    # Compiled artifacts
│   └── scripts/
│       ├── compile.sh
│       ├── setup.sh              # Trusted setup (powers of tau)
│       └── generate_verifier.sh  # Export Solidity verifier
├── sdk/                          # TypeScript SDK
│   ├── src/
│   │   ├── TALClient.ts
│   │   ├── identity/
│   │   ├── reputation/
│   │   ├── validation/
│   │   ├── zk/
│   │   └── types/
│   ├── package.json
│   └── tsconfig.json
├── subgraph/                     # The Graph indexer
│   ├── schema.graphql
│   ├── subgraph.yaml
│   └── src/
│       ├── identity.ts
│       ├── reputation.ts
│       └── validation.ts
├── frontend/                     # Next.js app
│   ├── app/
│   ├── components/
│   ├── hooks/
│   └── lib/
└── docs/
    ├── architecture.md
    ├── api-reference.md
    └── integration-guide.md
```

---

## PART 1 — Smart Contracts

### 1.1 Interfaces (ERC-8004 Compliance)

Implement the three standard ERC-8004 interfaces exactly as specified, then extend them with TAL-specific functionality.

#### `IERC8004IdentityRegistry.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IERC8004IdentityRegistry is IERC721 {
    event Registered(uint256 indexed agentId, address indexed owner, string agentURI);
    event AgentURIUpdated(uint256 indexed agentId, string newURI);
    event MetadataUpdated(uint256 indexed agentId, string key);
    event AgentWalletVerified(uint256 indexed agentId, address wallet);

    function register(string calldata agentURI) external returns (uint256 agentId);
    function updateAgentURI(uint256 agentId, string calldata newURI) external;
    function agentURI(uint256 agentId) external view returns (string memory);
    function setMetadata(uint256 agentId, string calldata key, bytes calldata value) external;
    function getMetadata(uint256 agentId, string calldata key) external view returns (bytes memory);
    function verifyAgentWallet(uint256 agentId, address wallet, bytes calldata signature) external;
    function isVerifiedWallet(uint256 agentId, address wallet) external view returns (bool);
}
```

#### `IERC8004ReputationRegistry.sol`

```solidity
interface IERC8004ReputationRegistry {
    struct Feedback {
        int128 value;
        uint8 valueDecimals;
        string tag1;
        string tag2;
        string endpoint;
        string feedbackURI;
        bytes32 feedbackHash;
        bool isRevoked;
        uint256 timestamp;
    }

    struct FeedbackSummary {
        int256 totalValue;
        uint256 count;
        int128 min;
        int128 max;
    }

    event FeedbackSubmitted(uint256 indexed agentId, address indexed client, int128 value, string tag1, string tag2);
    event FeedbackRevoked(uint256 indexed agentId, address indexed client, uint256 feedbackIndex);
    event ResponseSubmitted(uint256 indexed agentId, address indexed client, uint256 feedbackIndex);

    function submitFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external;

    function revokeFeedback(uint256 agentId, uint256 feedbackIndex) external;
    function respondToFeedback(uint256 agentId, address client, uint256 feedbackIndex, string calldata responseURI) external;
    function getFeedback(uint256 agentId, address client) external view returns (Feedback[] memory);
    function getSummary(uint256 agentId, address[] calldata clientAddresses) external view returns (FeedbackSummary memory);
}
```

#### `IERC8004ValidationRegistry.sol`

```solidity
interface IERC8004ValidationRegistry {
    enum ValidationStatus { Pending, Completed, Expired, Disputed }
    enum ValidationModel { ReputationOnly, StakeSecured, TEEAttested, Hybrid }

    struct ValidationRequest {
        uint256 agentId;
        address requester;
        bytes32 taskHash;
        bytes32 outputHash;
        ValidationModel model;
        uint256 bounty;
        uint256 deadline;
        ValidationStatus status;
    }

    struct ValidationResponse {
        address validator;
        uint8 score;        // 0-100
        bytes proof;        // ZK proof, TEE attestation, or empty
        string detailsURI;
        uint256 timestamp;
    }

    event ValidationRequested(bytes32 indexed requestHash, uint256 indexed agentId, ValidationModel model);
    event ValidationCompleted(bytes32 indexed requestHash, address indexed validator, uint8 score);
    event ValidationDisputed(bytes32 indexed requestHash, address indexed disputer);

    function requestValidation(
        uint256 agentId,
        bytes32 taskHash,
        bytes32 outputHash,
        ValidationModel model,
        uint256 deadline
    ) external payable returns (bytes32 requestHash);

    function submitValidation(
        bytes32 requestHash,
        uint8 score,
        bytes calldata proof,
        string calldata detailsURI
    ) external;

    function getValidation(bytes32 requestHash) external view returns (ValidationRequest memory, ValidationResponse memory);
    function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory);
}
```

### 1.2 Core Contracts — Detailed Specifications

#### `TALIdentityRegistry.sol`

Extends ERC-8004 Identity Registry with:

**State Variables:**
```
mapping(uint256 => bytes32) public zkIdentities;              // agentId → Poseidon commitment
mapping(uint256 => mapping(bytes32 => bool)) public zkCapabilities;  // agentId → capHash → verified
mapping(uint256 => bool) public verifiedOperators;            // agentId → has min stake
mapping(address => bool) public verifiedWallets;              // wallet → is verified agent wallet
uint256 private _nextTokenId;
address public stakingV2;                                      // Staking V2 contract
uint256 public constant MIN_OPERATOR_STAKE = 1000 ether;      // 1000 TON
```

**Key Functions (TAL Extensions):**

- `registerWithZKIdentity(string calldata agentURI, bytes32 zkCommitment) → uint256 agentId`
  - Mint ERC-721, store URI, store ZK identity commitment
  - Emit `Registered` + `ZKIdentitySet` events

- `verifyCapability(uint256 agentId, bytes32 capabilityHash, bytes calldata zkProof) → bool`
  - Verify SNARK proof against stored commitment
  - Use the ZKVerifierModule for on-chain proof verification
  - Mark capability as verified on success

- `checkOperatorStatus(uint256 agentId) → bool`
  - Query Staking V2 contract for owner's staked TON
  - Return true if stake ≥ MIN_OPERATOR_STAKE
  - Cache result in `verifiedOperators` mapping

- `refreshOperatorStatus(uint256 agentId)`
  - Re-check stake and update `verifiedOperators`
  - Anyone can call this (permissionless refresh)

**Access Control:**
- `register` / `registerWithZKIdentity`: open to anyone
- `updateAgentURI`, `setMetadata`: only agent owner (`ownerOf(agentId)`)
- `verifyAgentWallet`: only agent owner, requires EIP-712 or ERC-1271 signature from the wallet
- Admin functions (pause, upgrade): governance timelock only

**Upgradeability:** Use UUPS proxy pattern (OpenZeppelin) with timelock-gated upgrades.

---

#### `TALReputationRegistry.sol`

Extends ERC-8004 Reputation Registry with Sybil resistance and stake weighting.

**State Variables:**
```
address public identityRegistry;
mapping(uint256 => mapping(address => Feedback[])) private _feedbacks;
mapping(uint256 => address[]) private _clientLists;
mapping(bytes32 => string[]) private _responses;               // feedbackKey → response URIs
mapping(address => uint256) public reviewerReputation;          // emergent reviewer scoring
```

**Key Functions (TAL Extensions):**

- `getStakeWeightedSummary(uint256 agentId, address[] calldata clients) → FeedbackSummary`
  - Same as `getSummary` but weights each feedback by reviewer's TON stake
  - Query Staking V2 for each client's stake amount
  - Formula: `weightedValue = feedback.value × sqrt(reviewerStake)`

- `getVerifiedSummary(uint256 agentId, address[] calldata clients) → FeedbackSummary`
  - Only includes feedback linked to validated tasks (cross-reference ValidationRegistry)
  - Higher trust signal

- `submitFeedbackWithPaymentProof(uint256 agentId, ..., bytes calldata x402Proof)`
  - Standard feedback + x402 payment proof verification
  - Payment-backed feedback gets a "verified purchase" flag

**Sybil Resistance Implementation:**
1. Client filtering via `getSummary` requiring explicit client list (ERC-8004 native)
2. x402 payment proof linkage (optional but weighted higher)
3. Stake-weighted influence (TAL extension)
4. Cross-reference with ValidationRegistry for "verified reputation" scores
5. Emergent reviewer reputation based on historical accuracy

---

#### `TALValidationRegistry.sol`

Extends ERC-8004 Validation with DRB fairness, TEE attestation, and bounty distribution.

**State Variables:**
```
address public identityRegistry;
address public drbContract;                                    // DRB Commit-Reveal²
address public stakingV2;
mapping(bytes32 => ValidationRequest) private _requests;
mapping(bytes32 => ValidationResponse) private _responses;
mapping(uint256 => bytes32[]) private _agentValidations;
mapping(address => bytes32[]) private _validatorRequests;
mapping(address => bool) public trustedTEEProviders;           // whitelisted TEE attestation signers
uint256 public constant PROTOCOL_FEE_BPS = 1000;              // 10%
uint256 public constant AGENT_REWARD_BPS = 1000;               // 10%
uint256 public constant VALIDATOR_REWARD_BPS = 8000;            // 80%
address public treasury;
```

**Key Functions:**

- `requestValidation(...)` — Handles all 4 models:
  - **ReputationOnly**: No bounty required, instant (just check reputation from ReputationRegistry)
  - **StakeSecured**: Requires bounty ≥ 10 TON. Uses DRB to select validator from eligible staked validators. Validator must re-execute and submit score within deadline.
  - **TEEAttested**: Requires bounty ≥ 1 TON. Accepts attestation from whitelisted TEE providers (Intel SGX, AWS Nitro, ARM TrustZone). Verifies attestation signature + enclave measurement.
  - **Hybrid**: Requires both TEE attestation AND stake-secured consensus.

- `selectValidator(bytes32 requestHash, address[] calldata candidates) → address`
  - Request randomness from DRB (Commit-Reveal²)
  - Select validator weighted by stake amount
  - `selectedIndex = random % totalStake` → map to validator

- `submitValidation(bytes32 requestHash, uint8 score, bytes calldata proof, string calldata detailsURI)`
  - For StakeSecured: verify caller is the DRB-selected validator
  - For TEEAttested: verify `proof` is a valid attestation from a `trustedTEEProvider`, check enclave measurement hash matches, verify attestation binds to `requestHash`
  - Distribute bounty: 80% validator, 10% agent (if score ≥ 50), 10% treasury
  - Update ValidationStatus to Completed
  - Cross-update ReputationRegistry with validation result

- `disputeValidation(bytes32 requestHash, bytes calldata evidence)`
  - Start dispute flow, pause bounty distribution
  - For StakeSecured: trigger additional validators via DRB
  - For TEE: require counter-attestation from different TEE provider

**TEE Attestation Verification (on-chain):**
```solidity
function _verifyTEEAttestation(
    bytes calldata attestation,
    bytes32 requestHash,
    bytes32 expectedOutputHash
) internal view returns (bool) {
    // 1. Decode attestation: (address teeSigner, bytes32 enclaveHash, bytes32 inputHash, bytes32 outputHash, bytes sig)
    // 2. Verify teeSigner is in trustedTEEProviders
    // 3. Verify signature over (enclaveHash, inputHash, outputHash, requestHash)
    // 4. Verify outputHash == expectedOutputHash
    // 5. Verify enclaveHash matches expected agent enclave measurement
    return true;
}
```

**Slashing Integration:**
- On failed validation (score < 50 AND agent was a Verified Operator), trigger slashing assessment
- If fraud detected (score = 0 with proof), call StakingIntegrationModule to slash agent's stake
- Slashing percentages: 50% for failed TEE attestation, 100% for proven fraud, 25% for repeated low reputation

---

### 1.3 Enhancement Modules

#### `ZKVerifierModule.sol`

- Deploy Groth16 or PLONK verifier contracts (auto-generated from Circom compilation)
- Expose `verifyIdentityCommitment(bytes32 commitment, bytes calldata proof, uint256[] calldata publicInputs) → bool`
- Expose `verifyCapabilityProof(bytes32 commitment, bytes32 capabilityHash, bytes calldata proof) → bool`
- Expose `verifyReputationThreshold(bytes32 merkleRoot, uint256 threshold, bytes calldata proof) → bool`
- Internal Poseidon hasher (2-input and 4-input, optimized for BLS12-381 or BN254)

#### `DRBIntegrationModule.sol`

- Interface with Tokamak's DRB contract (Commit-Reveal² protocol)
- `requestRandomness(bytes32 seed) → uint256 requestId`
- `getRandomness(uint256 requestId) → uint256 randomValue` (reverts if not yet available)
- `selectFromWeightedList(address[] calldata candidates, uint256[] calldata weights, uint256 randomValue) → address`
- Handle DRB callback pattern or polling

#### `StakingIntegrationModule.sol`

- Interface with Staking V2 contract
- `getStake(address operator) → uint256 stakedAmount`
- `isVerifiedOperator(address operator) → bool` (stake ≥ 1000 TON)
- `registerSlashingCondition(uint256 agentId, bytes32 conditionHash)`
- `executeSlash(uint256 agentId, uint256 percentage, bytes calldata evidence)`
- `routeSeigniorage(uint256 agentId)` — bonus emissions for high-reputation agents
  - Formula: `emission × (1 + reputation_score / 100)`

---

### 1.4 Contract Testing Requirements

Write comprehensive Foundry tests covering:

**Unit Tests (`test/unit/`):**
- Identity: register, registerWithZK, updateURI, verifyCapability, operatorStatus
- Reputation: submitFeedback, revoke, respond, getSummary, getStakeWeightedSummary, Sybil resistance
- Validation: requestValidation for each model, submitValidation, distributeRewards, disputeFlow
- ZK: verifyIdentityCommitment, verifyCapabilityProof (with mock proofs)
- DRB: selectValidator fairness distribution test (run 10k iterations, verify statistical fairness)
- Staking: verifyOperatorStake, slashing execution, seigniorage routing

**Integration Tests (`test/integration/`):**
- Full flow: register agent → submit task → request validation → DRB selects validator → submit proof → distribute rewards → update reputation
- TEE attestation flow with mock TEE signer
- Multi-agent coordination scenario
- Slashing + dispute resolution flow

**Invariant Tests (`test/invariant/`):**
- Total bounty in = total bounty distributed (validator + agent + treasury)
- Agent reputation never goes below historical minimum without slashing event
- DRB selection is statistically fair across many calls
- No double-validation for same request

**Gas Benchmarks:**
- `register()`: target < 200k gas
- `submitFeedback()`: target < 150k gas
- `requestValidation()`: target < 300k gas
- `submitValidation()` with TEE proof: target < 500k gas

---

## PART 2 — ZK Circuits (Circom)

### 2.1 Identity Commitment Circuit

**File: `circuits/identity/identity_commitment.circom`**

```
template IdentityCommitment() {
    // Private inputs
    signal input name;              // Field element (hash of name string)
    signal input capabilities[8];   // Up to 8 capability hashes (0-padded)
    signal input organization;      // Field element
    signal input nonce;             // Random blinding factor

    // Public output
    signal output commitment;       // Poseidon hash of all inputs

    // Compute: commitment = Poseidon(name, capabilities[0..7], organization, nonce)
    // Use Poseidon hash with t=12 (11 inputs + 1 capacity)
}
```

### 2.2 Capability Proof Circuit

**File: `circuits/identity/capability_proof.circom`**

```
template CapabilityProof() {
    // Private inputs
    signal input name;
    signal input capabilities[8];
    signal input organization;
    signal input nonce;

    // Public inputs
    signal input commitment;          // Must match stored on-chain commitment
    signal input targetCapability;    // The capability being proved

    // 1. Recompute commitment from private inputs
    // 2. Assert recomputed == public commitment
    // 3. Assert targetCapability ∈ capabilities[0..7]
    // Output: 1 if valid, constraint failure otherwise
}
```

### 2.3 Reputation Threshold Proof Circuit

**File: `circuits/reputation/reputation_threshold.circom`**

```
template ReputationThreshold(TREE_DEPTH) {
    // Private inputs
    signal input score;                          // Actual reputation score
    signal input merkleProof[TREE_DEPTH];        // Siblings
    signal input merklePathIndices[TREE_DEPTH];  // Left/right

    // Public inputs
    signal input merkleRoot;        // On-chain reputation Merkle root
    signal input threshold;         // Minimum score to prove (e.g., 80)
    signal input agentId;           // Which agent's score

    // 1. Verify Merkle inclusion: Poseidon(agentId, score) is a leaf in the tree
    // 2. Assert score >= threshold
    // Output: valid proof means "agent has reputation ≥ threshold" without revealing exact score
}
```

### 2.4 Circuit Build Pipeline

```bash
# compile.sh
circom circuits/identity/identity_commitment.circom --r1cs --wasm --sym -o circuits/build/
circom circuits/identity/capability_proof.circom --r1cs --wasm --sym -o circuits/build/
circom circuits/reputation/reputation_threshold.circom --r1cs --wasm --sym -o circuits/build/

# setup.sh (Powers of Tau ceremony — use existing ptau for production)
snarkjs powersoftau new bn128 14 pot14_0000.ptau
snarkjs powersoftau contribute pot14_0000.ptau pot14_final.ptau
snarkjs groth16 setup circuits/build/identity_commitment.r1cs pot14_final.ptau identity_commitment.zkey
snarkjs zkey contribute identity_commitment.zkey identity_commitment_final.zkey
snarkjs zkey export verificationkey identity_commitment_final.zkey identity_commitment_vkey.json

# generate_verifier.sh (Export Solidity verifier for on-chain deployment)
snarkjs zkey export solidityverifier identity_commitment_final.zkey IdentityCommitmentVerifier.sol
snarkjs zkey export solidityverifier capability_proof_final.zkey CapabilityProofVerifier.sol
snarkjs zkey export solidityverifier reputation_threshold_final.zkey ReputationThresholdVerifier.sol
```

---

## PART 3 — Subgraph (The Graph)

### 3.1 Schema

**File: `subgraph/schema.graphql`**

```graphql
type Agent @entity {
  id: ID!                          # agentId (uint256 as string)
  owner: Bytes!
  agentURI: String!
  zkIdentity: Bytes                # ZK commitment (null if public identity)
  verifiedOperator: Boolean!
  stakedAmount: BigInt!
  registeredAt: BigInt!
  updatedAt: BigInt!
  feedbackCount: BigInt!
  averageScore: BigDecimal
  verifiedScore: BigDecimal        # Only from validated tasks
  validationCount: BigInt!
  capabilities: [CapabilityVerification!]! @derivedFrom(field: "agent")
  feedbacks: [FeedbackEntry!]! @derivedFrom(field: "agent")
  validations: [Validation!]! @derivedFrom(field: "agent")
}

type CapabilityVerification @entity {
  id: ID!
  agent: Agent!
  capabilityHash: Bytes!
  verified: Boolean!
  verifiedAt: BigInt
}

type FeedbackEntry @entity {
  id: ID!
  agent: Agent!
  client: Bytes!
  value: BigInt!
  valueDecimals: Int!
  tag1: String!
  tag2: String!
  endpoint: String
  feedbackURI: String
  isRevoked: Boolean!
  timestamp: BigInt!
  hasPaymentProof: Boolean!
}

type Validation @entity {
  id: ID!                          # requestHash
  agent: Agent!
  requester: Bytes!
  taskHash: Bytes!
  outputHash: Bytes!
  model: String!                   # "ReputationOnly" | "StakeSecured" | "TEEAttested" | "Hybrid"
  bounty: BigInt!
  deadline: BigInt!
  status: String!                  # "Pending" | "Completed" | "Expired" | "Disputed"
  validator: Bytes
  score: Int
  proof: Bytes
  completedAt: BigInt
}

type ProtocolStats @entity {
  id: ID!                          # "singleton"
  totalAgents: BigInt!
  totalFeedbacks: BigInt!
  totalValidations: BigInt!
  totalBountiesPaid: BigInt!
  totalStaked: BigInt!
}
```

### 3.2 Event Handlers

Map every contract event to entity updates:
- `Registered` → Create `Agent` entity
- `FeedbackSubmitted` → Create `FeedbackEntry`, update `Agent.feedbackCount` + `Agent.averageScore`
- `ValidationRequested` → Create `Validation` with status "Pending"
- `ValidationCompleted` → Update `Validation` with score, validator, proof; update `Agent.verifiedScore`
- `ZKIdentitySet` → Update `Agent.zkIdentity`
- `OperatorStatusChanged` → Update `Agent.verifiedOperator`

---

## PART 4 — TypeScript SDK

### 4.1 Core Client

**File: `sdk/src/TALClient.ts`**

```typescript
export class TALClient {
  constructor(config: {
    provider: ethers.Provider;
    signer?: ethers.Signer;
    identityRegistryAddress: string;
    reputationRegistryAddress: string;
    validationRegistryAddress: string;
    subgraphUrl: string;
    ipfsGateway: string;
  });

  // Identity
  async registerAgent(agentURI: string, zkCommitment?: string): Promise<{ agentId: bigint; tx: TransactionReceipt }>;
  async getAgent(agentId: bigint): Promise<AgentDetails>;
  async updateAgentURI(agentId: bigint, newURI: string): Promise<TransactionReceipt>;
  async verifyCapability(agentId: bigint, capabilityHash: string, proof: ZKProof): Promise<boolean>;
  async isVerifiedOperator(agentId: bigint): Promise<boolean>;

  // Reputation
  async submitFeedback(agentId: bigint, feedback: FeedbackInput): Promise<TransactionReceipt>;
  async getReputation(agentId: bigint, options?: ReputationQueryOptions): Promise<ReputationSummary>;
  async getStakeWeightedReputation(agentId: bigint): Promise<ReputationSummary>;

  // Validation
  async requestValidation(params: ValidationRequestParams): Promise<{ requestHash: string; tx: TransactionReceipt }>;
  async submitValidation(requestHash: string, score: number, proof: bytes, detailsURI: string): Promise<TransactionReceipt>;
  async getValidationStatus(requestHash: string): Promise<ValidationDetails>;

  // Discovery (via subgraph)
  async searchAgents(query: AgentSearchQuery): Promise<AgentDetails[]>;
  async getTopAgents(options: { limit: number; sortBy: 'reputation' | 'validations' | 'stake' }): Promise<AgentDetails[]>;
  async getAgentsByCapability(capability: string): Promise<AgentDetails[]>;
}
```

### 4.2 ZK Proof Generation (Client-Side)

**File: `sdk/src/zk/ProofGenerator.ts`**

```typescript
export class ProofGenerator {
  constructor(config: { circuitWasmPath: string; zkeyPath: string });

  // Generate identity commitment (off-chain Poseidon hash)
  async generateIdentityCommitment(attributes: {
    name: string;
    capabilities: string[];
    organization: string;
    nonce: bigint;
  }): Promise<{ commitment: string; privateInputs: IdentityPrivateInputs }>;

  // Generate capability proof (SNARK)
  async generateCapabilityProof(
    privateInputs: IdentityPrivateInputs,
    targetCapability: string
  ): Promise<{ proof: ZKProof; publicSignals: string[] }>;

  // Generate reputation threshold proof
  async generateReputationThresholdProof(
    score: number,
    threshold: number,
    merkleProof: MerkleProof
  ): Promise<{ proof: ZKProof; publicSignals: string[] }>;
}
```

### 4.3 Agent Registration File Builder

**File: `sdk/src/identity/RegistrationBuilder.ts`**

```typescript
export class RegistrationBuilder {
  setName(name: string): this;
  setDescription(description: string): this;
  setImage(imageUrl: string): this;
  setActive(active: boolean): this;
  addService(type: 'A2A' | 'MCP' | 'OASF' | 'ENS' | 'DID' | 'web' | 'email', endpoint: string): this;
  setSupportedTrust(models: ('reputation' | 'crypto-economic' | 'tee-attestation')[]): this;
  setX402Support(supported: boolean): this;
  addRegistration(agentId: string, agentRegistry: string): this;
  build(): AgentRegistrationFile;
  async uploadToIPFS(pinataApiKey: string): Promise<string>; // Returns IPFS CID
}
```

---

## PART 5 — Frontend (Next.js)

### 5.1 Pages & Features

| Route | Feature | Description |
|-------|---------|-------------|
| `/` | Landing / Dashboard | Protocol stats, recent activity, featured agents |
| `/agents` | Agent Discovery | Search, filter by capability/trust model/stake, sort by reputation |
| `/agents/[id]` | Agent Detail | Full profile, reputation history, validation records, capabilities |
| `/agents/register` | Agent Registration | Step-by-step: upload reg file to IPFS → register on-chain → optional ZK identity |
| `/reputation/[agentId]` | Reputation Dashboard | Detailed feedback breakdown, tag analysis, charts over time |
| `/validation` | Validation Monitor | Active validation requests, bounty marketplace, validator leaderboard |
| `/validation/[hash]` | Validation Detail | Request details, proof, score, dispute status |
| `/staking` | Staking Portal | Stake TON, check operator status, view seigniorage earnings |
| `/governance` | DAO Governance | Proposals, voting, parameter changes |

### 5.2 Key Components

- `<AgentCard>`: Compact card showing name, score, stake, verification badges
- `<ReputationChart>`: Line chart of reputation over time (recharts)
- `<ValidationTimeline>`: Step-by-step visual of validation flow
- `<ZKIdentityBadge>`: Visual indicator for ZK-committed agents with "verify capability" modal
- `<TrustModelSelector>`: Interactive selector showing which trust model to use (based on value-at-risk matrix)
- `<DRBFairnessIndicator>`: Shows that validator selection used DRB Commit-Reveal²
- `<StakeGuard>`: Displays operator stake level and slashing history

### 5.3 Wallet Integration

Use wagmi + viem with support for:
- MetaMask, WalletConnect, Coinbase Wallet
- Tokamak L2 network auto-add
- TON token balance display
- Transaction confirmation modals for all state-changing operations

---

## PART 6 — Deployment & Operations

### 6.1 Deployment Script

**File: `contracts/script/Deploy.s.sol`**

Deploy order (respecting dependencies):
1. Deploy ZKVerifierModule (with compiled Circom verifier contracts)
2. Deploy DRBIntegrationModule (pointing to existing DRB contract)
3. Deploy StakingIntegrationModule (pointing to existing Staking V2 contract)
4. Deploy TALIdentityRegistry (with proxy) → links to ZKVerifier + Staking modules
5. Deploy TALReputationRegistry (with proxy) → links to IdentityRegistry + Staking
6. Deploy TALValidationRegistry (with proxy) → links to all modules + registries
7. Deploy TALGovernor + TALTimelock
8. Transfer ownership of all proxies to Timelock
9. Whitelist initial TEE providers (Intel SGX signer, AWS Nitro signer)

### 6.2 Network Configuration

```
Tokamak L2 Testnet:
  RPC: <tokamak-testnet-rpc>
  Chain ID: <tokamak-testnet-chain-id>
  Explorer: <tokamak-testnet-explorer>

Tokamak L2 Mainnet:
  RPC: <tokamak-mainnet-rpc>
  Chain ID: <tokamak-mainnet-chain-id>

External Dependencies:
  Staking V2: <staking-v2-address>
  DRB Contract: <drb-contract-address>
  TON Token: <ton-token-address>
```

### 6.3 Security Checklist (Pre-Deployment)

- [ ] All contracts pass `forge test` with 100% of tests passing
- [ ] Gas benchmarks within targets
- [ ] Slither + Mythril static analysis: zero high/critical findings
- [ ] External audit #1 complete (e.g., OpenZeppelin)
- [ ] External audit #2 complete (e.g., CertiK)
- [ ] ZK circuit formal verification
- [ ] Trusted setup ceremony for production zkeys
- [ ] Upgrade timelock set to ≥ 48 hours
- [ ] Circuit breaker / pause functionality tested
- [ ] Emergency multisig configured
- [ ] Bug bounty program prepared (Immunefi)

---

## PART 7 — Implementation Order (Phase 1 Focus)

Execute in this order for Phase 1 (Foundation):

### Sprint 1 (Weeks 1-2): Core Contracts
1. Set up Foundry project structure
2. Implement `IERC8004IdentityRegistry` + `TALIdentityRegistry` (without ZK extensions)
3. Implement `IERC8004ReputationRegistry` + `TALReputationRegistry` (without stake weighting)
4. Implement `IERC8004ValidationRegistry` + `TALValidationRegistry` (ReputationOnly model only)
5. Write unit tests for all three registries
6. Deploy to local anvil fork

### Sprint 2 (Weeks 3-4): Enhancement Modules
7. Implement `StakingIntegrationModule` (mock Staking V2 for testnet)
8. Implement `DRBIntegrationModule` (mock DRB for testnet)
9. Add StakeSecured validation model to ValidationRegistry
10. Add TEEAttested validation model (with mock TEE signer for testing)
11. Implement bounty distribution logic (80/10/10 split)
12. Implement slashing conditions
13. Integration tests for full validation flows

### Sprint 3 (Weeks 5-6): ZK + Subgraph
14. Write Circom circuits (identity commitment, capability proof, reputation threshold)
15. Compile circuits, generate Solidity verifiers
16. Implement `ZKVerifierModule` wrapping auto-generated verifiers
17. Add ZK identity functions to TALIdentityRegistry
18. Set up subgraph with schema and event handlers
19. Deploy subgraph to hosted service / Graph Node

### Sprint 4 (Weeks 7-8): SDK + Frontend
20. Build TypeScript SDK with all client functions
21. Implement client-side ZK proof generation (snarkjs in browser/Node)
22. Build agent registration flow (RegistrationBuilder → IPFS → on-chain)
23. Build Next.js frontend: discovery, agent details, registration
24. Integrate wagmi for wallet connection
25. Build reputation dashboard and validation monitor

### Sprint 5 (Weeks 9-10): Integration + Testnet
26. Deploy all contracts to Tokamak testnet
27. Deploy subgraph to index testnet events
28. End-to-end testing: register agents, submit tasks, validate, check reputation
29. Performance testing and gas optimization
30. Documentation: developer docs, API reference, integration guide

---

## Critical Design Decisions & Constraints

1. **ZK is for identity/reputation ONLY, not execution verification.** Most agent workloads (LLM inference, API calls) cannot be circuitized. Off-chain execution verification uses TEE attestation (Intel SGX, AWS Nitro, ARM TrustZone) or stake-secured re-execution.

2. **DRB Commit-Reveal² for fairness.** All validator and agent selection must use Tokamak's DRB to prevent last-revealer manipulation. Never use `block.timestamp` or `block.prevrandao` for selection.

3. **Proportional security.** Trust models scale with value at risk. Don't require TEE attestation for a simple info lookup (reputation-only is fine). Don't allow reputation-only for a $10k DeFi trade.

4. **ERC-8004 compliance is non-negotiable.** All TAL extensions are additive. A vanilla ERC-8004 client must be able to interact with TAL registries without knowing about TAL-specific features.

5. **TON is the native economic unit.** All bounties, staking, fees, and slashing denominated in TON. No additional token.

6. **UUPS proxy pattern** for all core contracts with governance-controlled upgrades behind a 48-hour timelock minimum.

7. **Poseidon hash** (not Keccak) for all ZK identity commitments — ZK-friendly, drastically reduces circuit constraints.

8. **TEE attestation is verified on-chain** by checking the attestation signature against whitelisted TEE provider public keys. The enclave measurement must match the expected agent code hash.