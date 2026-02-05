# Tokamak Agent Layer (TAL) - Technical Specification

**Version:** 1.0
**Date:** February 2026
**Status:** Draft

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Contract Architecture](#2-contract-architecture)
3. [ZK Circuit Specifications](#3-zk-circuit-specifications)
4. [Data Models](#4-data-models)
5. [API Specifications](#5-api-specifications)
6. [Security Considerations](#6-security-considerations)
7. [Implementation Phases](#7-implementation-phases)

---

## 1. SYSTEM ARCHITECTURE

### 1.1 High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              TOKAMAK AGENT LAYER (TAL)                              │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                           FRONTEND LAYER (Next.js 14+)                       │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │   │
│  │  │ Discovery│ │  Agent   │ │Reputation│ │Validation│ │    Governance    │   │   │
│  │  │  Portal  │ │  Detail  │ │Dashboard │ │ Monitor  │ │      Portal      │   │   │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘   │   │
│  │       └────────────┴────────────┴────────────┴────────────────┘             │   │
│  │                                    │                                         │   │
│  │                            wagmi / viem                                      │   │
│  └────────────────────────────────────┼─────────────────────────────────────────┘   │
│                                       │                                             │
│  ┌────────────────────────────────────┼─────────────────────────────────────────┐   │
│  │                          SDK LAYER (TypeScript)                              │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐    │   │
│  │  │  TALClient   │ │ProofGenerator│ │Registration  │ │  Subgraph        │    │   │
│  │  │   (Core)     │ │   (ZK)       │ │  Builder     │ │   Client         │    │   │
│  │  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └────────┬─────────┘    │   │
│  │         └────────────────┴────────────────┴──────────────────┘              │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                         │                              │                            │
│           ┌─────────────┘                              └─────────────┐              │
│           │                                                          │              │
│           ▼                                                          ▼              │
│  ┌─────────────────────────────────────────┐    ┌────────────────────────────────┐ │
│  │         INDEXING LAYER (The Graph)       │    │      STORAGE LAYER (IPFS)      │ │
│  │  ┌─────────────────────────────────────┐ │    │  ┌──────────────────────────┐  │ │
│  │  │           Subgraph                  │ │    │  │  Agent Registration      │  │ │
│  │  │  • Agent entities                   │ │    │  │  Files (JSON)            │  │ │
│  │  │  • Feedback entries                 │ │    │  │                          │  │ │
│  │  │  • Validation records               │ │    │  │  Extended Feedback       │  │ │
│  │  │  • Protocol statistics              │ │    │  │  Data                    │  │ │
│  │  └─────────────────────────────────────┘ │    │  └──────────────────────────┘  │ │
│  └──────────────────┬──────────────────────┘    └────────────────────────────────┘ │
│                     │                                                               │
│                     ▼                                                               │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │                        ON-CHAIN LAYER (Tokamak L2)                            │  │
│  │                                                                               │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │                         CORE REGISTRIES                                 │  │  │
│  │  │  ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────────┐  │  │  │
│  │  │  │ TALIdentityRegistry│ │TALReputationRegistry│ │TALValidationRegistry│  │  │  │
│  │  │  │     (ERC-721)      │ │                     │ │                     │  │  │  │
│  │  │  │  • register()      │ │  • submitFeedback() │ │ • requestValidation()│  │  │  │
│  │  │  │  • verifyCapability│ │  • getSummary()     │ │ • submitValidation() │  │  │  │
│  │  │  │  • setMetadata()   │ │  • revokeFeedback() │ │ • disputeValidation()│  │  │  │
│  │  │  └─────────┬─────────┘ └─────────┬───────────┘ └──────────┬──────────┘  │  │  │
│  │  │            └─────────────────────┼─────────────────────────┘            │  │  │
│  │  └──────────────────────────────────┼──────────────────────────────────────┘  │  │
│  │                                     │                                         │  │
│  │  ┌──────────────────────────────────┼──────────────────────────────────────┐  │  │
│  │  │                      ENHANCEMENT MODULES                                │  │  │
│  │  │  ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────────┐  │  │  │
│  │  │  │  ZKVerifierModule │ │DRBIntegrationModule│ │StakingIntegrationModule│  │  │  │
│  │  │  │                   │ │                   │ │                       │  │  │  │
│  │  │  │ • verifyIdentity()│ │ • requestRandom() │ │ • getStake()          │  │  │  │
│  │  │  │ • verifyCapability│ │ • selectValidator()│ │ • executeSlash()      │  │  │  │
│  │  │  │ • verifyReputation│ │ • getRandomness() │ │ • routeSeigniorage()  │  │  │  │
│  │  │  └───────────────────┘ └───────────────────┘ └───────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                     │                                         │  │
│  │  ┌──────────────────────────────────┼──────────────────────────────────────┐  │  │
│  │  │                       GOVERNANCE                                        │  │  │
│  │  │  ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────────┐  │  │  │
│  │  │  │   TALGovernor     │ │   TALTimelock     │ │      TALProxy         │  │  │  │
│  │  │  │   (OZ Governor)   │ │   (48h+ delay)    │ │      (UUPS)           │  │  │  │
│  │  │  └───────────────────┘ └───────────────────┘ └───────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                       │                                             │
│                                       ▼                                             │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │                      EXTERNAL DEPENDENCIES                                    │  │
│  │  ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────────────┐   │  │
│  │  │   Staking V2      │ │   DRB Contract    │ │   TEE Attestation         │   │  │
│  │  │   (TON Staking)   │ │ (Commit-Reveal²)  │ │   Providers               │   │  │
│  │  │                   │ │                   │ │ (SGX, Nitro, TrustZone)   │   │  │
│  │  └───────────────────┘ └───────────────────┘ └───────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              DATA FLOW OVERVIEW                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  AGENT REGISTRATION FLOW                                                            │
│  ───────────────────────                                                            │
│                                                                                     │
│  [Agent Owner] ──► [SDK: RegistrationBuilder] ──► [IPFS: Store Registration File]  │
│       │                                                    │                        │
│       │                                                    ▼                        │
│       └──────────────────► [TALIdentityRegistry.register(ipfsURI)] ──► [Event]     │
│                                          │                               │          │
│                                          ▼                               ▼          │
│                              [ERC-721 NFT Minted]              [Subgraph Indexes]   │
│                                                                                     │
│  REPUTATION FLOW                                                                    │
│  ───────────────                                                                    │
│                                                                                     │
│  [Client] ──► [TALReputationRegistry.submitFeedback()] ──► [FeedbackSubmitted]     │
│                         │                                         │                 │
│                         ▼                                         ▼                 │
│               [Feedback Stored On-chain]              [Subgraph Calculates Score]   │
│                         │                                         │                 │
│                         └──────────┬──────────────────────────────┘                 │
│                                    ▼                                                │
│                      [Agent Reputation Updated]                                     │
│                                                                                     │
│  VALIDATION FLOW (StakeSecured)                                                     │
│  ──────────────────────────────                                                     │
│                                                                                     │
│  [Requester] ──► [TALValidationRegistry.requestValidation()] ◄── [Bounty in TON]   │
│       │                            │                                                │
│       │                            ▼                                                │
│       │              [DRBIntegrationModule.selectValidator()]                       │
│       │                            │                                                │
│       │                            ▼                                                │
│       │              [Validator Selected via DRB]                                   │
│       │                            │                                                │
│       │                            ▼                                                │
│  [Validator] ──► [Re-execute Task] ──► [submitValidation(score, proof)]            │
│                                                   │                                 │
│                                                   ▼                                 │
│                              [Bounty Distribution: 80/10/10]                        │
│                              [Validator / Agent / Treasury]                         │
│                                                                                     │
│  ZK IDENTITY FLOW                                                                   │
│  ────────────────                                                                   │
│                                                                                     │
│  [Agent] ──► [SDK: ProofGenerator.generateIdentityCommitment()]                    │
│                         │                                                           │
│                         ▼                                                           │
│          [Poseidon(name, capabilities, org, nonce)]                                │
│                         │                                                           │
│                         ▼                                                           │
│  [TALIdentityRegistry.registerWithZKIdentity(uri, commitment)]                     │
│                         │                                                           │
│                         ▼                                                           │
│  [Later: verifyCapability() with SNARK proof]                                      │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Network Topology

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              NETWORK TOPOLOGY                                       │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│                              ┌─────────────────┐                                    │
│                              │   ETHEREUM L1   │                                    │
│                              │   (Settlement)  │                                    │
│                              └────────┬────────┘                                    │
│                                       │                                             │
│                                       │ State Roots                                 │
│                                       │ Fraud Proofs                                │
│                                       │                                             │
│                              ┌────────▼────────┐                                    │
│                              │  TOKAMAK L2     │                                    │
│                              │  (Execution)    │                                    │
│                              │                 │                                    │
│                              │ ┌─────────────┐ │                                    │
│                              │ │TAL Contracts│ │                                    │
│                              │ └─────────────┘ │                                    │
│                              │ ┌─────────────┐ │                                    │
│                              │ │ Staking V2  │ │                                    │
│                              │ └─────────────┘ │                                    │
│                              │ ┌─────────────┐ │                                    │
│                              │ │    DRB      │ │                                    │
│                              │ └─────────────┘ │                                    │
│                              └────────┬────────┘                                    │
│                                       │                                             │
│           ┌───────────────────────────┼───────────────────────────┐                 │
│           │                           │                           │                 │
│           ▼                           ▼                           ▼                 │
│  ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐          │
│  │  Graph Node     │        │    IPFS         │        │  TEE Providers  │          │
│  │  (Indexing)     │        │  (Metadata)     │        │  (Attestation)  │          │
│  │                 │        │                 │        │                 │          │
│  │ • Subgraph      │        │ • Pinata        │        │ • Intel SGX     │          │
│  │ • GraphQL API   │        │ • Infura        │        │ • AWS Nitro     │          │
│  │ • Subscriptions │        │ • IPFS Cluster  │        │ • ARM TrustZone │          │
│  └────────┬────────┘        └────────┬────────┘        └────────┬────────┘          │
│           │                          │                          │                   │
│           └──────────────────────────┼──────────────────────────┘                   │
│                                      │                                              │
│                                      ▼                                              │
│                          ┌───────────────────────┐                                  │
│                          │    Frontend / SDK     │                                  │
│                          │    (User Interface)   │                                  │
│                          └───────────────────────┘                                  │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.4 External Dependencies and Interfaces

| Dependency | Type | Interface | Purpose |
|------------|------|-----------|---------|
| Staking V2 | Contract | `IStakingV2` | TON staking, operator verification, slashing |
| DRB | Contract | `IDRB` | Commit-Reveal² randomness for validator selection |
| TON Token | Contract | `IERC20` | Native economic unit for bounties/staking |
| The Graph | Service | GraphQL | Event indexing and query API |
| IPFS | Service | HTTP Gateway | Metadata storage (registration files, feedback) |
| TEE Providers | Service | Attestation API | Hardware attestation verification |

---

## 2. CONTRACT ARCHITECTURE

### 2.1 Contract Inheritance Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         CONTRACT INHERITANCE HIERARCHY                              │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  IDENTITY REGISTRY                                                                  │
│  ─────────────────                                                                  │
│                                                                                     │
│  ┌─────────────────────┐                                                            │
│  │ IERC721 (OZ)        │                                                            │
│  └──────────┬──────────┘                                                            │
│             │                                                                       │
│             ▼                                                                       │
│  ┌─────────────────────┐                                                            │
│  │IERC8004IdentityReg  │◄─────────────────────────────────────────┐                 │
│  └──────────┬──────────┘                                          │                 │
│             │                                                     │                 │
│             ▼                                                     │                 │
│  ┌─────────────────────┐                                          │                 │
│  │ITALIdentityRegistry │ (TAL extensions)                         │                 │
│  └──────────┬──────────┘                                          │                 │
│             │                                                     │                 │
│             ▼                                                     │                 │
│  ┌─────────────────────────────────────────────────────────┐      │                 │
│  │                  TALIdentityRegistry                    │      │                 │
│  │  extends: ERC721Upgradeable, UUPSUpgradeable,          │      │                 │
│  │           AccessControlUpgradeable, PausableUpgradeable │      │                 │
│  │  implements: ITALIdentityRegistry                       │◄─────┘                 │
│  └─────────────────────────────────────────────────────────┘                        │
│                                                                                     │
│  REPUTATION REGISTRY                                                                │
│  ───────────────────                                                                │
│                                                                                     │
│  ┌─────────────────────┐                                                            │
│  │IERC8004ReputationReg│◄─────────────────────────────────────────┐                 │
│  └──────────┬──────────┘                                          │                 │
│             │                                                     │                 │
│             ▼                                                     │                 │
│  ┌─────────────────────┐                                          │                 │
│  │ITALReputationRegistry│ (TAL extensions)                        │                 │
│  └──────────┬──────────┘                                          │                 │
│             │                                                     │                 │
│             ▼                                                     │                 │
│  ┌─────────────────────────────────────────────────────────┐      │                 │
│  │                 TALReputationRegistry                   │      │                 │
│  │  extends: UUPSUpgradeable, AccessControlUpgradeable,   │      │                 │
│  │           PausableUpgradeable, ReentrancyGuardUpgradeable│     │                 │
│  │  implements: ITALReputationRegistry                     │◄─────┘                 │
│  └─────────────────────────────────────────────────────────┘                        │
│                                                                                     │
│  VALIDATION REGISTRY                                                                │
│  ───────────────────                                                                │
│                                                                                     │
│  ┌─────────────────────┐                                                            │
│  │IERC8004ValidationReg│◄─────────────────────────────────────────┐                 │
│  └──────────┬──────────┘                                          │                 │
│             │                                                     │                 │
│             ▼                                                     │                 │
│  ┌─────────────────────┐                                          │                 │
│  │ITALValidationRegistry│ (TAL extensions)                        │                 │
│  └──────────┬──────────┘                                          │                 │
│             │                                                     │                 │
│             ▼                                                     │                 │
│  ┌─────────────────────────────────────────────────────────┐      │                 │
│  │                TALValidationRegistry                    │      │                 │
│  │  extends: UUPSUpgradeable, AccessControlUpgradeable,   │      │                 │
│  │           PausableUpgradeable, ReentrancyGuardUpgradeable│     │                 │
│  │  implements: ITALValidationRegistry                     │◄─────┘                 │
│  └─────────────────────────────────────────────────────────┘                        │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 TALIdentityRegistry

#### 2.2.1 Interface: IERC8004IdentityRegistry

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IERC8004IdentityRegistry is IERC721 {
    // Events
    event Registered(uint256 indexed agentId, address indexed owner, string agentURI);
    event AgentURIUpdated(uint256 indexed agentId, string newURI);
    event MetadataUpdated(uint256 indexed agentId, string key);
    event AgentWalletVerified(uint256 indexed agentId, address wallet);

    // Functions
    function register(string calldata agentURI) external returns (uint256 agentId);
    function updateAgentURI(uint256 agentId, string calldata newURI) external;
    function agentURI(uint256 agentId) external view returns (string memory);
    function setMetadata(uint256 agentId, string calldata key, bytes calldata value) external;
    function getMetadata(uint256 agentId, string calldata key) external view returns (bytes memory);
    function verifyAgentWallet(uint256 agentId, address wallet, bytes calldata signature) external;
    function isVerifiedWallet(uint256 agentId, address wallet) external view returns (bool);
}
```

#### 2.2.2 Interface: ITALIdentityRegistry (TAL Extensions)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IERC8004IdentityRegistry.sol";

interface ITALIdentityRegistry is IERC8004IdentityRegistry {
    // Events
    event ZKIdentitySet(uint256 indexed agentId, bytes32 commitment);
    event CapabilityVerified(uint256 indexed agentId, bytes32 capabilityHash);
    event OperatorStatusChanged(uint256 indexed agentId, bool isVerified);
    event OperatorSet(uint256 indexed agentId, address indexed operator);

    // Errors
    error AgentNotFound(uint256 agentId);
    error NotAgentOwner(uint256 agentId, address caller);
    error NotAgentOperator(uint256 agentId, address caller);
    error InvalidZKProof();
    error InvalidSignature();
    error CapabilityAlreadyVerified(uint256 agentId, bytes32 capabilityHash);
    error InsufficientStake(address operator, uint256 required, uint256 actual);

    // ZK Identity Functions
    function registerWithZKIdentity(
        string calldata agentURI,
        bytes32 zkCommitment
    ) external returns (uint256 agentId);

    function setZKIdentity(uint256 agentId, bytes32 zkCommitment) external;

    function verifyCapability(
        uint256 agentId,
        bytes32 capabilityHash,
        bytes calldata zkProof,
        uint256[] calldata publicInputs
    ) external returns (bool);

    function getZKIdentity(uint256 agentId) external view returns (bytes32);
    function isCapabilityVerified(uint256 agentId, bytes32 capabilityHash) external view returns (bool);

    // Operator Functions
    function setOperator(uint256 agentId, address operator) external;
    function getOperator(uint256 agentId) external view returns (address);
    function checkOperatorStatus(uint256 agentId) external returns (bool);
    function refreshOperatorStatus(uint256 agentId) external;
    function isVerifiedOperator(uint256 agentId) external view returns (bool);

    // View Functions
    function getAgentCount() external view returns (uint256);
    function getAgentsByOwner(address owner) external view returns (uint256[] memory);
}
```

#### 2.2.3 TALIdentityRegistry Implementation Specification

**State Variables:**

```solidity
contract TALIdentityRegistry is
    ERC721Upgradeable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ITALIdentityRegistry
{
    // Roles
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // Constants
    uint256 public constant MIN_OPERATOR_STAKE = 1000 ether; // 1000 TON

    // Counter
    uint256 private _nextTokenId;

    // External contracts
    address public stakingV2;
    address public zkVerifierModule;

    // Core mappings
    mapping(uint256 => string) private _agentURIs;
    mapping(uint256 => mapping(string => bytes)) private _metadata;
    mapping(uint256 => mapping(address => bool)) private _verifiedWallets;

    // ZK Identity mappings
    mapping(uint256 => bytes32) public zkIdentities;
    mapping(uint256 => mapping(bytes32 => bool)) public verifiedCapabilities;

    // Operator mappings
    mapping(uint256 => address) private _operators;
    mapping(uint256 => bool) public verifiedOperators;

    // Owner lookup
    mapping(address => uint256[]) private _ownerAgents;

    // Storage gap for upgrades
    uint256[40] private __gap;
}
```

**Function Signatures:**

| Function | Visibility | Modifiers | Gas Target |
|----------|------------|-----------|------------|
| `initialize(address stakingV2_, address zkVerifier_)` | external | initializer | N/A |
| `register(string calldata agentURI)` | external | whenNotPaused | <200k |
| `registerWithZKIdentity(string calldata agentURI, bytes32 zkCommitment)` | external | whenNotPaused | <250k |
| `updateAgentURI(uint256 agentId, string calldata newURI)` | external | onlyOwnerOrOperator | <80k |
| `setMetadata(uint256 agentId, string calldata key, bytes calldata value)` | external | onlyOwnerOrOperator | <100k |
| `verifyAgentWallet(uint256 agentId, address wallet, bytes calldata signature)` | external | onlyOwner | <150k |
| `setZKIdentity(uint256 agentId, bytes32 zkCommitment)` | external | onlyOwner | <80k |
| `verifyCapability(uint256 agentId, bytes32 capHash, bytes calldata proof, uint256[] calldata inputs)` | external | whenNotPaused | <400k |
| `setOperator(uint256 agentId, address operator)` | external | onlyOwner | <60k |
| `checkOperatorStatus(uint256 agentId)` | external | - | <100k |
| `refreshOperatorStatus(uint256 agentId)` | external | - | <100k |

**Access Control Matrix:**

| Function | Owner | Operator | Anyone | Governance |
|----------|-------|----------|--------|------------|
| register | X | - | X | - |
| updateAgentURI | X | X | - | - |
| setMetadata | X | X | - | - |
| verifyAgentWallet | X | - | - | - |
| setZKIdentity | X | - | - | - |
| verifyCapability | X | X | X | - |
| setOperator | X | - | - | - |
| checkOperatorStatus | - | - | X | - |
| pause/unpause | - | - | - | X |
| upgrade | - | - | - | X |

---

### 2.3 TALReputationRegistry

#### 2.3.1 Interface: IERC8004ReputationRegistry

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

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

    event FeedbackSubmitted(
        uint256 indexed agentId,
        address indexed client,
        int128 value,
        string tag1,
        string tag2
    );
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

    function respondToFeedback(
        uint256 agentId,
        address client,
        uint256 feedbackIndex,
        string calldata responseURI
    ) external;

    function getFeedback(uint256 agentId, address client) external view returns (Feedback[] memory);
    function getSummary(uint256 agentId, address[] calldata clientAddresses) external view returns (FeedbackSummary memory);
}
```

#### 2.3.2 Interface: ITALReputationRegistry (TAL Extensions)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IERC8004ReputationRegistry.sol";

interface ITALReputationRegistry is IERC8004ReputationRegistry {
    // Events
    event PaymentProofVerified(uint256 indexed agentId, address indexed client, bytes32 paymentHash);
    event ReputationMerkleRootUpdated(bytes32 newRoot);
    event ReviewerReputationUpdated(address indexed reviewer, uint256 newScore);

    // Errors
    error AgentNotRegistered(uint256 agentId);
    error SelfFeedbackNotAllowed(uint256 agentId);
    error FeedbackNotFound(uint256 agentId, address client, uint256 index);
    error NotFeedbackOwner(address caller, address expected);
    error InvalidPaymentProof();
    error FeedbackAlreadyRevoked(uint256 agentId, uint256 index);

    // Extended Feedback Functions
    function submitFeedbackWithPaymentProof(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash,
        bytes calldata x402Proof
    ) external;

    // Stake-Weighted Functions
    function getStakeWeightedSummary(
        uint256 agentId,
        address[] calldata clients
    ) external view returns (FeedbackSummary memory);

    // Verified Feedback (linked to validation)
    function getVerifiedSummary(uint256 agentId) external view returns (FeedbackSummary memory);

    // Merkle Tree Functions (for ZK proofs)
    function getReputationMerkleRoot() external view returns (bytes32);
    function getAgentScoreProof(uint256 agentId) external view returns (bytes32[] memory);
    function updateReputationMerkleRoot() external;

    // Reviewer Reputation
    function getReviewerReputation(address reviewer) external view returns (uint256);

    // Batch Operations
    function getFeedbackBatch(
        uint256 agentId,
        uint256 offset,
        uint256 limit
    ) external view returns (Feedback[] memory, uint256 total);
}
```

#### 2.3.3 TALReputationRegistry Implementation Specification

**State Variables:**

```solidity
contract TALReputationRegistry is
    UUPSUpgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    ITALReputationRegistry
{
    // Roles
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant MERKLE_UPDATER_ROLE = keccak256("MERKLE_UPDATER_ROLE");

    // External contracts
    address public identityRegistry;
    address public validationRegistry;
    address public stakingV2;

    // Core feedback storage
    mapping(uint256 => mapping(address => Feedback[])) private _feedbacks;
    mapping(uint256 => address[]) private _clientLists;

    // Response storage
    mapping(bytes32 => string[]) private _responses; // keccak256(agentId, client, index) => URIs

    // Payment proof tracking
    mapping(uint256 => mapping(address => mapping(uint256 => bool))) public hasPaymentProof;

    // Reviewer reputation (emergent scoring)
    mapping(address => uint256) public reviewerReputation;

    // Merkle tree state
    bytes32 public reputationMerkleRoot;
    mapping(uint256 => uint256) public agentScores; // Cached aggregate scores
    uint256 public lastMerkleUpdate;

    // Storage gap
    uint256[35] private __gap;
}
```

**Function Signatures:**

| Function | Visibility | Modifiers | Gas Target |
|----------|------------|-----------|------------|
| `initialize(address identity_, address staking_)` | external | initializer | N/A |
| `submitFeedback(...)` | external | whenNotPaused, nonReentrant | <150k |
| `submitFeedbackWithPaymentProof(...)` | external | whenNotPaused, nonReentrant | <200k |
| `revokeFeedback(uint256 agentId, uint256 index)` | external | - | <80k |
| `respondToFeedback(...)` | external | onlyAgentOwnerOrOperator | <100k |
| `getSummary(uint256 agentId, address[] calldata clients)` | external view | - | <50k |
| `getStakeWeightedSummary(...)` | external view | - | <100k |
| `getVerifiedSummary(uint256 agentId)` | external view | - | <80k |
| `updateReputationMerkleRoot()` | external | onlyRole(MERKLE_UPDATER) | <200k |

**Sybil Resistance Mechanisms:**

1. **Client Filtering**: `getSummary` requires explicit client list (ERC-8004 native)
2. **Payment Proof**: x402 payment proof linkage weights feedback higher
3. **Stake Weighting**: `sqrt(reviewerStake)` multiplier in `getStakeWeightedSummary`
4. **Validation Linkage**: `getVerifiedSummary` only counts validated task feedback
5. **Reviewer Reputation**: Historical accuracy tracking

---

### 2.4 TALValidationRegistry

#### 2.4.1 Interface: IERC8004ValidationRegistry

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

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

#### 2.4.2 Interface: ITALValidationRegistry (TAL Extensions)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IERC8004ValidationRegistry.sol";

interface ITALValidationRegistry is IERC8004ValidationRegistry {
    // Events
    event ValidatorSelected(bytes32 indexed requestHash, address indexed validator, uint256 drbRequestId);
    event BountyDistributed(bytes32 indexed requestHash, uint256 validatorAmount, uint256 agentAmount, uint256 treasuryAmount);
    event TEEProviderAdded(address indexed provider, bytes32 enclaveHash);
    event TEEProviderRemoved(address indexed provider);
    event SlashingTriggered(uint256 indexed agentId, uint256 amount, bytes32 requestHash);
    event DisputeResolved(bytes32 indexed requestHash, bool upheld);

    // Errors
    error InvalidValidationModel(ValidationModel model);
    error InsufficientBounty(uint256 provided, uint256 required);
    error ValidationNotPending(bytes32 requestHash);
    error NotSelectedValidator(bytes32 requestHash, address caller);
    error InvalidTEEAttestation();
    error TEEProviderNotWhitelisted(address provider);
    error ValidationExpired(bytes32 requestHash);
    error DisputePeriodNotEnded(bytes32 requestHash);

    // Validation Model Constants
    function MIN_STAKE_SECURED_BOUNTY() external view returns (uint256); // 10 TON
    function MIN_TEE_BOUNTY() external view returns (uint256);           // 1 TON
    function PROTOCOL_FEE_BPS() external view returns (uint256);         // 1000 (10%)
    function AGENT_REWARD_BPS() external view returns (uint256);         // 1000 (10%)
    function VALIDATOR_REWARD_BPS() external view returns (uint256);     // 8000 (80%)

    // Validator Selection
    function selectValidator(
        bytes32 requestHash,
        address[] calldata candidates
    ) external returns (address selected);

    function getSelectedValidator(bytes32 requestHash) external view returns (address);

    // TEE Management
    function addTEEProvider(address provider, bytes32 enclaveHash) external;
    function removeTEEProvider(address provider) external;
    function isTrustedTEEProvider(address provider) external view returns (bool);
    function getTEEEnclaveHash(address provider) external view returns (bytes32);

    // Dispute Functions
    function disputeValidation(bytes32 requestHash, bytes calldata evidence) external;
    function resolveDispute(bytes32 requestHash, bool upheld) external;
    function getDisputeStatus(bytes32 requestHash) external view returns (bool isDisputed, uint256 disputeDeadline);

    // Slashing
    function triggerSlashing(bytes32 requestHash) external;

    // Query Functions
    function getValidatorHistory(address validator) external view returns (bytes32[] memory);
    function getPendingValidations() external view returns (bytes32[] memory);
    function getValidationsByStatus(ValidationStatus status, uint256 limit) external view returns (bytes32[] memory);
}
```

#### 2.4.3 TALValidationRegistry Implementation Specification

**State Variables:**

```solidity
contract TALValidationRegistry is
    UUPSUpgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    ITALValidationRegistry
{
    // Roles
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant TEE_ADMIN_ROLE = keccak256("TEE_ADMIN_ROLE");
    bytes32 public constant DISPUTE_RESOLVER_ROLE = keccak256("DISPUTE_RESOLVER_ROLE");

    // Constants
    uint256 public constant MIN_STAKE_SECURED_BOUNTY = 10 ether;  // 10 TON
    uint256 public constant MIN_TEE_BOUNTY = 1 ether;             // 1 TON
    uint256 public constant PROTOCOL_FEE_BPS = 1000;              // 10%
    uint256 public constant AGENT_REWARD_BPS = 1000;              // 10%
    uint256 public constant VALIDATOR_REWARD_BPS = 8000;          // 80%
    uint256 public constant DISPUTE_PERIOD = 24 hours;
    uint256 public constant CHALLENGE_PERIOD = 48 hours;

    // External contracts
    address public identityRegistry;
    address public reputationRegistry;
    address public drbContract;
    address public stakingV2;
    address public treasury;

    // Core storage
    mapping(bytes32 => ValidationRequest) private _requests;
    mapping(bytes32 => ValidationResponse) private _responses;
    mapping(uint256 => bytes32[]) private _agentValidations;
    mapping(address => bytes32[]) private _validatorRequests;

    // Validator selection
    mapping(bytes32 => address) private _selectedValidators;
    mapping(bytes32 => uint256) private _drbRequestIds;

    // TEE provider management
    mapping(address => bool) public trustedTEEProviders;
    mapping(address => bytes32) public teeEnclaveHashes;

    // Dispute tracking
    mapping(bytes32 => bool) public isDisputed;
    mapping(bytes32 => uint256) public disputeDeadlines;
    mapping(bytes32 => bytes) public disputeEvidence;

    // Storage gap
    uint256[30] private __gap;
}
```

**Validation Model Requirements:**

| Model | Min Bounty | Proof Type | Validator Selection | Timeout |
|-------|------------|------------|---------------------|---------|
| ReputationOnly | 0 TON | None | N/A (instant) | N/A |
| StakeSecured | 10 TON | Re-execution result | DRB weighted by stake | 24h |
| TEEAttested | 1 TON | TEE attestation | Any whitelisted TEE | 1h |
| Hybrid | 10 TON | TEE + stake consensus | DRB + TEE | 24h |

**Bounty Distribution Logic:**

```solidity
function _distributeBounty(bytes32 requestHash, uint8 score) internal {
    ValidationRequest storage req = _requests[requestHash];
    uint256 bounty = req.bounty;

    uint256 protocolFee = (bounty * PROTOCOL_FEE_BPS) / 10000;
    uint256 validatorReward = (bounty * VALIDATOR_REWARD_BPS) / 10000;
    uint256 agentReward = score >= 50 ? (bounty * AGENT_REWARD_BPS) / 10000 : 0;

    // If agent score < 50, agent reward goes to treasury
    if (score < 50) {
        protocolFee += agentReward;
        agentReward = 0;
    }

    // Transfer TON
    IERC20(tonToken).safeTransfer(treasury, protocolFee);
    IERC20(tonToken).safeTransfer(_responses[requestHash].validator, validatorReward);
    if (agentReward > 0) {
        address agentOwner = IERC721(identityRegistry).ownerOf(req.agentId);
        IERC20(tonToken).safeTransfer(agentOwner, agentReward);
    }

    emit BountyDistributed(requestHash, validatorReward, agentReward, protocolFee);
}
```

---

### 2.5 Enhancement Modules

#### 2.5.1 ZKVerifierModule

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IZKVerifierModule {
    // Events
    event ProofVerified(bytes32 indexed proofType, bytes32 indexed commitment);
    event VerifierUpdated(bytes32 indexed proofType, address newVerifier);

    // Errors
    error InvalidProof();
    error UnknownProofType(bytes32 proofType);

    // Proof Types
    function IDENTITY_COMMITMENT() external pure returns (bytes32);
    function CAPABILITY_PROOF() external pure returns (bytes32);
    function REPUTATION_THRESHOLD() external pure returns (bytes32);

    // Verification Functions
    function verifyIdentityCommitment(
        bytes32 commitment,
        bytes calldata proof,
        uint256[] calldata publicInputs
    ) external view returns (bool);

    function verifyCapabilityProof(
        bytes32 commitment,
        bytes32 capabilityHash,
        bytes calldata proof,
        uint256[] calldata publicInputs
    ) external view returns (bool);

    function verifyReputationThreshold(
        bytes32 merkleRoot,
        uint256 threshold,
        uint256 agentId,
        bytes calldata proof,
        uint256[] calldata publicInputs
    ) external view returns (bool);

    // Poseidon Hash
    function poseidonHash2(uint256 a, uint256 b) external pure returns (uint256);
    function poseidonHash4(uint256 a, uint256 b, uint256 c, uint256 d) external pure returns (uint256);

    // Admin
    function setVerifier(bytes32 proofType, address verifier) external;
    function getVerifier(bytes32 proofType) external view returns (address);
}
```

**Implementation Notes:**
- Wraps auto-generated Groth16/PLONK verifiers from Circom compilation
- Each proof type has its own verifier contract address
- Poseidon hash uses BN254 curve (compatible with Circom)
- Gas cost for verification: ~200-300k depending on proof complexity

#### 2.5.2 DRBIntegrationModule

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDRBIntegrationModule {
    // Events
    event RandomnessRequested(uint256 indexed requestId, bytes32 indexed seed);
    event RandomnessReceived(uint256 indexed requestId, uint256 randomValue);
    event ValidatorSelected(bytes32 indexed requestHash, address indexed validator);

    // Errors
    error RandomnessNotAvailable(uint256 requestId);
    error InvalidCandidateList();
    error DRBRequestFailed();

    // Randomness Functions
    function requestRandomness(bytes32 seed) external returns (uint256 requestId);
    function getRandomness(uint256 requestId) external view returns (uint256 randomValue);
    function isRandomnessAvailable(uint256 requestId) external view returns (bool);

    // Validator Selection
    function selectFromWeightedList(
        address[] calldata candidates,
        uint256[] calldata weights,
        uint256 randomValue
    ) external pure returns (address selected);

    // Integrated Selection
    function requestValidatorSelection(
        bytes32 requestHash,
        address[] calldata candidates,
        uint256[] calldata stakes
    ) external returns (uint256 drbRequestId);

    function finalizeValidatorSelection(
        bytes32 requestHash,
        uint256 drbRequestId
    ) external returns (address selected);
}
```

**Implementation Notes:**
- Interfaces with Tokamak's DRB Commit-Reveal² contract
- Two-phase selection: request randomness, then finalize when available
- Weighted selection uses cumulative sum approach
- Never uses `block.timestamp` or `prevrandao` for randomness

#### 2.5.3 StakingIntegrationModule

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IStakingIntegrationModule {
    // Events
    event SlashingConditionRegistered(uint256 indexed agentId, bytes32 conditionHash);
    event SlashingExecuted(uint256 indexed agentId, uint256 amount, bytes32 reason);
    event SeigniorageRouted(uint256 indexed agentId, uint256 amount);

    // Errors
    error InsufficientStake(address operator);
    error SlashingConditionNotMet(bytes32 conditionHash);
    error UnauthorizedSlashing();

    // Stake Query Functions
    function getStake(address operator) external view returns (uint256 stakedAmount);
    function isVerifiedOperator(address operator) external view returns (bool);
    function getOperatorStatus(address operator) external view returns (
        uint256 stakedAmount,
        bool isVerified,
        uint256 slashingCount,
        uint256 lastSlashTime
    );

    // Slashing Functions
    function registerSlashingCondition(
        uint256 agentId,
        bytes32 conditionHash,
        uint256 percentage
    ) external;

    function executeSlash(
        uint256 agentId,
        uint256 percentage,
        bytes calldata evidence,
        bytes32 reason
    ) external returns (uint256 slashedAmount);

    // Seigniorage Functions
    function routeSeigniorage(uint256 agentId) external;
    function calculateSeigniorageBonus(
        uint256 agentId,
        uint256 baseEmission
    ) external view returns (uint256 bonusAmount);

    // Constants
    function MIN_OPERATOR_STAKE() external view returns (uint256); // 1000 TON
    function SLASHING_FAILED_TEE() external view returns (uint256); // 50%
    function SLASHING_PROVEN_FRAUD() external view returns (uint256); // 100%
    function SLASHING_LOW_REPUTATION() external view returns (uint256); // 25%
}
```

---

### 2.6 Governance Contracts

#### 2.6.1 TALGovernor

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";

contract TALGovernor is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl
{
    constructor(
        IVotes _token,
        TimelockController _timelock
    )
        Governor("TAL Governor")
        GovernorSettings(
            1 days,     // voting delay
            1 weeks,    // voting period
            100_000e18  // proposal threshold (100k TON)
        )
        GovernorVotes(_token)
        GovernorVotesQuorumFraction(4) // 4% quorum
        GovernorTimelockControl(_timelock)
    {}

    // Required overrides...
}
```

#### 2.6.2 TALTimelock

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/governance/TimelockController.sol";

contract TALTimelock is TimelockController {
    constructor(
        uint256 minDelay,           // 48 hours minimum
        address[] memory proposers,  // Governor contract
        address[] memory executors,  // Governor contract
        address admin                // Initial admin (renounced after setup)
    ) TimelockController(minDelay, proposers, executors, admin) {}
}
```

**Governance Parameters:**

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Timelock Delay | 48 hours | Allow users to exit before changes |
| Voting Delay | 1 day | Time to review proposals |
| Voting Period | 1 week | Sufficient participation time |
| Proposal Threshold | 100k TON | Prevent spam |
| Quorum | 4% | Balance participation vs efficiency |

---

## 3. ZK CIRCUIT SPECIFICATIONS

### 3.1 Identity Commitment Circuit

**File:** `circuits/identity/identity_commitment.circom`

```circom
pragma circom 2.1.0;

include "../../node_modules/circomlib/circuits/poseidon.circom";

template IdentityCommitment() {
    // Private inputs
    signal input name;                  // Hash of agent name
    signal input capabilities[8];       // Up to 8 capability hashes (0-padded)
    signal input organization;          // Organization identifier
    signal input nonce;                 // Random blinding factor

    // Public output
    signal output commitment;

    // Intermediate: hash capabilities first (Poseidon-8)
    component capHash = Poseidon(8);
    for (var i = 0; i < 8; i++) {
        capHash.inputs[i] <== capabilities[i];
    }

    // Final commitment: Poseidon(name, capHash, organization, nonce)
    component commitmentHash = Poseidon(4);
    commitmentHash.inputs[0] <== name;
    commitmentHash.inputs[1] <== capHash.out;
    commitmentHash.inputs[2] <== organization;
    commitmentHash.inputs[3] <== nonce;

    commitment <== commitmentHash.out;
}

component main {public []} = IdentityCommitment();
```

**Signals:**

| Signal | Type | Visibility | Description |
|--------|------|------------|-------------|
| name | input | private | Poseidon hash of agent name string |
| capabilities[8] | input | private | Array of capability hashes |
| organization | input | private | Organization identifier |
| nonce | input | private | Random blinding factor |
| commitment | output | public | Final identity commitment |

**Constraints:** ~300 (Poseidon is constraint-efficient)

**Circuit Size Estimate:** ~500 constraints total

---

### 3.2 Capability Proof Circuit

**File:** `circuits/identity/capability_proof.circom`

```circom
pragma circom 2.1.0;

include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";

template CapabilityProof() {
    // Private inputs (must match commitment)
    signal input name;
    signal input capabilities[8];
    signal input organization;
    signal input nonce;

    // Public inputs
    signal input commitment;           // Must match stored on-chain commitment
    signal input targetCapability;     // The capability being proved

    // 1. Recompute commitment
    component capHash = Poseidon(8);
    for (var i = 0; i < 8; i++) {
        capHash.inputs[i] <== capabilities[i];
    }

    component commitmentHash = Poseidon(4);
    commitmentHash.inputs[0] <== name;
    commitmentHash.inputs[1] <== capHash.out;
    commitmentHash.inputs[2] <== organization;
    commitmentHash.inputs[3] <== nonce;

    // 2. Assert commitment matches
    commitmentHash.out === commitment;

    // 3. Assert targetCapability is in capabilities array
    signal hasCapability;
    var found = 0;
    component isEqual[8];

    for (var i = 0; i < 8; i++) {
        isEqual[i] = IsEqual();
        isEqual[i].in[0] <== capabilities[i];
        isEqual[i].in[1] <== targetCapability;
        found += isEqual[i].out;
    }

    // At least one match required
    signal atLeastOne;
    component gt = GreaterThan(4);
    gt.in[0] <== found;
    gt.in[1] <== 0;
    atLeastOne <== gt.out;

    atLeastOne === 1;
}

component main {public [commitment, targetCapability]} = CapabilityProof();
```

**Signals:**

| Signal | Type | Visibility | Description |
|--------|------|------------|-------------|
| name | input | private | Agent name hash |
| capabilities[8] | input | private | Full capability array |
| organization | input | private | Organization identifier |
| nonce | input | private | Blinding factor |
| commitment | input | public | On-chain stored commitment |
| targetCapability | input | public | Capability to prove |

**Constraints:** ~800 (Poseidon + comparators)

---

### 3.3 Reputation Threshold Proof Circuit

**File:** `circuits/reputation/reputation_threshold.circom`

```circom
pragma circom 2.1.0;

include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../node_modules/circomlib/circuits/mux1.circom";

template ReputationThreshold(TREE_DEPTH) {
    // Private inputs
    signal input score;                              // Actual reputation score
    signal input merkleProof[TREE_DEPTH];           // Sibling hashes
    signal input merklePathIndices[TREE_DEPTH];     // 0 = left, 1 = right

    // Public inputs
    signal input merkleRoot;          // On-chain reputation Merkle root
    signal input threshold;           // Minimum score to prove
    signal input agentId;             // Agent identifier

    // 1. Compute leaf: Poseidon(agentId, score)
    component leafHash = Poseidon(2);
    leafHash.inputs[0] <== agentId;
    leafHash.inputs[1] <== score;

    // 2. Verify Merkle path
    signal computedPath[TREE_DEPTH + 1];
    computedPath[0] <== leafHash.out;

    component pathHashers[TREE_DEPTH];
    component mux[TREE_DEPTH];

    for (var i = 0; i < TREE_DEPTH; i++) {
        mux[i] = MultiMux1(2);
        mux[i].c[0][0] <== computedPath[i];
        mux[i].c[0][1] <== merkleProof[i];
        mux[i].c[1][0] <== merkleProof[i];
        mux[i].c[1][1] <== computedPath[i];
        mux[i].s <== merklePathIndices[i];

        pathHashers[i] = Poseidon(2);
        pathHashers[i].inputs[0] <== mux[i].out[0];
        pathHashers[i].inputs[1] <== mux[i].out[1];

        computedPath[i + 1] <== pathHashers[i].out;
    }

    // 3. Assert computed root matches public root
    computedPath[TREE_DEPTH] === merkleRoot;

    // 4. Assert score >= threshold
    component gte = GreaterEqThan(32);
    gte.in[0] <== score;
    gte.in[1] <== threshold;
    gte.out === 1;
}

component main {public [merkleRoot, threshold, agentId]} = ReputationThreshold(20);
```

**Signals:**

| Signal | Type | Visibility | Description |
|--------|------|------------|-------------|
| score | input | private | Actual reputation score |
| merkleProof[20] | input | private | Merkle siblings |
| merklePathIndices[20] | input | private | Path directions |
| merkleRoot | input | public | On-chain Merkle root |
| threshold | input | public | Score threshold |
| agentId | input | public | Agent identifier |

**Constraints:** ~6,000 (20-level Merkle tree)

---

### 3.4 Poseidon Hash Configuration

| Parameter | Value |
|-----------|-------|
| Curve | BN254 |
| t (width) | Variable (2, 4, 8, 12) |
| Full rounds | 8 |
| Partial rounds | 57 |
| S-box | x^5 |

**Solidity Poseidon:**
- Use `contracts/src/libraries/PoseidonHasher.sol`
- Pre-computed round constants for t=2, t=4, t=8
- Gas cost: ~25k for 2-input, ~45k for 4-input

---

### 3.5 Circuit Build Pipeline

```bash
#!/bin/bash
# circuits/scripts/compile.sh

set -e

CIRCUITS_DIR="circuits"
BUILD_DIR="circuits/build"
PTAU_FILE="powersoftau/pot14_final.ptau"

mkdir -p $BUILD_DIR

# Compile circuits
echo "Compiling identity_commitment..."
circom $CIRCUITS_DIR/identity/identity_commitment.circom \
    --r1cs --wasm --sym \
    -o $BUILD_DIR/

echo "Compiling capability_proof..."
circom $CIRCUITS_DIR/identity/capability_proof.circom \
    --r1cs --wasm --sym \
    -o $BUILD_DIR/

echo "Compiling reputation_threshold..."
circom $CIRCUITS_DIR/reputation/reputation_threshold.circom \
    --r1cs --wasm --sym \
    -o $BUILD_DIR/

# Generate verification keys and Solidity verifiers
for circuit in identity_commitment capability_proof reputation_threshold; do
    echo "Setting up $circuit..."

    snarkjs groth16 setup \
        $BUILD_DIR/${circuit}.r1cs \
        $PTAU_FILE \
        $BUILD_DIR/${circuit}_0000.zkey

    snarkjs zkey contribute \
        $BUILD_DIR/${circuit}_0000.zkey \
        $BUILD_DIR/${circuit}_final.zkey \
        --name="First contribution" -v

    snarkjs zkey export verificationkey \
        $BUILD_DIR/${circuit}_final.zkey \
        $BUILD_DIR/${circuit}_vkey.json

    snarkjs zkey export solidityverifier \
        $BUILD_DIR/${circuit}_final.zkey \
        contracts/src/verifiers/${circuit^}Verifier.sol
done

echo "Circuit compilation complete!"
```

---

## 4. DATA MODELS

### 4.1 Subgraph Schema

**File:** `subgraph/schema.graphql`

```graphql
"""
Agent entity representing a registered AI agent
"""
type Agent @entity {
  "Agent ID (uint256 as string)"
  id: ID!

  "Owner address"
  owner: Bytes!

  "Agent metadata URI (IPFS or HTTPS)"
  agentURI: String!

  "ZK identity commitment (null if public identity)"
  zkIdentity: Bytes

  "Whether owner meets minimum stake requirement"
  verifiedOperator: Boolean!

  "Owner's staked TON amount"
  stakedAmount: BigInt!

  "Designated operator address"
  operator: Bytes

  "Registration timestamp"
  registeredAt: BigInt!

  "Last update timestamp"
  updatedAt: BigInt!

  "Total feedback count"
  feedbackCount: BigInt!

  "Average feedback score (null if no feedback)"
  averageScore: BigDecimal

  "Score from validated tasks only"
  verifiedScore: BigDecimal

  "Total validation count"
  validationCount: BigInt!

  "Successful validation count"
  successfulValidations: BigInt!

  "Whether agent is active"
  isActive: Boolean!

  "Verified capabilities"
  capabilities: [CapabilityVerification!]! @derivedFrom(field: "agent")

  "Feedback entries"
  feedbacks: [FeedbackEntry!]! @derivedFrom(field: "agent")

  "Validation records"
  validations: [Validation!]! @derivedFrom(field: "agent")

  "Verified wallets"
  verifiedWallets: [VerifiedWallet!]! @derivedFrom(field: "agent")

  "Metadata entries"
  metadata: [MetadataEntry!]! @derivedFrom(field: "agent")
}

"""
Verified capability for an agent
"""
type CapabilityVerification @entity {
  "Composite ID: agentId-capabilityHash"
  id: ID!

  "Parent agent"
  agent: Agent!

  "Capability hash"
  capabilityHash: Bytes!

  "Whether capability is verified via ZK proof"
  verified: Boolean!

  "Verification timestamp"
  verifiedAt: BigInt

  "Proof transaction hash"
  proofTxHash: Bytes
}

"""
Feedback entry from a client
"""
type FeedbackEntry @entity {
  "Composite ID: agentId-client-index"
  id: ID!

  "Parent agent"
  agent: Agent!

  "Client address"
  client: Bytes!

  "Feedback index for this client"
  index: BigInt!

  "Feedback value"
  value: BigInt!

  "Value decimals"
  valueDecimals: Int!

  "Primary tag"
  tag1: String!

  "Secondary tag"
  tag2: String!

  "Endpoint being rated"
  endpoint: String

  "Extended feedback URI"
  feedbackURI: String

  "Feedback content hash"
  feedbackHash: Bytes

  "Whether feedback is revoked"
  isRevoked: Boolean!

  "Submission timestamp"
  timestamp: BigInt!

  "Whether feedback has payment proof"
  hasPaymentProof: Boolean!

  "Client's stake at time of feedback"
  clientStake: BigInt!

  "Linked validation (if any)"
  validation: Validation

  "Responses from agent"
  responses: [FeedbackResponse!]! @derivedFrom(field: "feedback")
}

"""
Agent response to feedback
"""
type FeedbackResponse @entity {
  "Composite ID: feedbackId-index"
  id: ID!

  "Parent feedback"
  feedback: FeedbackEntry!

  "Response URI"
  responseURI: String!

  "Response timestamp"
  timestamp: BigInt!
}

"""
Validation request and response
"""
type Validation @entity {
  "Request hash"
  id: ID!

  "Parent agent"
  agent: Agent!

  "Requester address"
  requester: Bytes!

  "Task hash"
  taskHash: Bytes!

  "Output hash"
  outputHash: Bytes!

  "Validation model"
  model: ValidationModel!

  "Bounty amount in TON"
  bounty: BigInt!

  "Deadline timestamp"
  deadline: BigInt!

  "Current status"
  status: ValidationStatus!

  "Selected validator"
  validator: Bytes

  "Validation score (0-100)"
  score: Int

  "Proof data"
  proof: Bytes

  "Details URI"
  detailsURI: String

  "Request timestamp"
  requestedAt: BigInt!

  "Completion timestamp"
  completedAt: BigInt

  "Whether disputed"
  isDisputed: Boolean!

  "Dispute deadline"
  disputeDeadline: BigInt

  "DRB request ID"
  drbRequestId: BigInt
}

"""
Verified wallet for an agent
"""
type VerifiedWallet @entity {
  "Composite ID: agentId-wallet"
  id: ID!

  "Parent agent"
  agent: Agent!

  "Verified wallet address"
  wallet: Bytes!

  "Verification timestamp"
  verifiedAt: BigInt!
}

"""
On-chain metadata entry
"""
type MetadataEntry @entity {
  "Composite ID: agentId-key"
  id: ID!

  "Parent agent"
  agent: Agent!

  "Metadata key"
  key: String!

  "Metadata value"
  value: Bytes!

  "Last update timestamp"
  updatedAt: BigInt!
}

"""
Protocol-wide statistics
"""
type ProtocolStats @entity {
  "Singleton ID: 'singleton'"
  id: ID!

  "Total registered agents"
  totalAgents: BigInt!

  "Total active agents"
  activeAgents: BigInt!

  "Total feedback entries"
  totalFeedbacks: BigInt!

  "Total validation requests"
  totalValidations: BigInt!

  "Completed validations"
  completedValidations: BigInt!

  "Total bounties paid"
  totalBountiesPaid: BigInt!

  "Total TON staked by operators"
  totalStaked: BigInt!

  "Last update block"
  lastUpdateBlock: BigInt!
}

"""
Daily protocol metrics
"""
type DailyStats @entity {
  "Date string: YYYY-MM-DD"
  id: ID!

  "Date timestamp (start of day)"
  date: BigInt!

  "New registrations"
  newAgents: BigInt!

  "Feedback submissions"
  feedbackCount: BigInt!

  "Validation requests"
  validationRequests: BigInt!

  "Completed validations"
  validationsCompleted: BigInt!

  "Bounties distributed"
  bountiesDistributed: BigInt!
}

enum ValidationModel {
  ReputationOnly
  StakeSecured
  TEEAttested
  Hybrid
}

enum ValidationStatus {
  Pending
  Completed
  Expired
  Disputed
}
```

---

### 4.2 IPFS Metadata Schemas

#### 4.2.1 Agent Registration File

```typescript
interface AgentRegistrationFile {
  // Required: Schema identifier
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";

  // Required: Agent display name
  name: string;

  // Required: Natural language description
  description: string;

  // Optional: Visual representation URL
  image?: string;

  // Required: Operational status
  active: boolean;

  // Service endpoints
  services?: {
    A2A?: string;          // Agent-to-Agent protocol
    MCP?: string;          // Model Context Protocol
    OASF?: string;         // Open Agent Service Format
    ENS?: string;          // Ethereum Name Service
    DID?: string;          // Decentralized Identifier
    web?: string;          // Web interface
    email?: string;        // Contact email
    [key: string]: string | undefined;
  };

  // Trust model support
  supportedTrust?: Array<"reputation" | "crypto-economic" | "tee-attestation">;

  // x402 payment support
  x402Support?: boolean;

  // Cross-chain registrations
  registrations?: Array<{
    agentId: string;
    agentRegistry: string;
    chainId?: number;
  }>;

  // TAL Extensions
  tal?: {
    // Capability declarations
    capabilities?: Array<{
      id: string;
      name: string;
      description: string;
      inputSchema?: object;
      outputSchema?: object;
    }>;

    // Operator information
    operator?: {
      address: string;
      organization?: string;
      website?: string;
    };

    // TEE configuration
    teeConfig?: {
      provider: "sgx" | "nitro" | "trustzone";
      enclaveHash: string;
      attestationEndpoint?: string;
    };

    // Pricing information
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

#### 4.2.2 Extended Feedback Data

```typescript
interface ExtendedFeedbackData {
  // Schema version
  version: "1.0";

  // Reference to on-chain feedback
  onChainRef: {
    agentId: string;
    feedbackIndex: number;
    txHash: string;
  };

  // Detailed feedback
  details: {
    // Task description
    taskDescription?: string;

    // Input provided to agent
    inputSummary?: string;

    // Output received
    outputSummary?: string;

    // Specific ratings
    ratings?: {
      accuracy?: number;      // 0-100
      speed?: number;         // 0-100
      reliability?: number;   // 0-100
      costEfficiency?: number; // 0-100
    };

    // Textual review
    review?: string;

    // Attachments
    attachments?: Array<{
      type: "image" | "document" | "log";
      uri: string;
      description?: string;
    }>;
  };

  // Verification
  signature?: string;
  timestamp: number;
}
```

---

### 4.3 SDK Type Definitions

**File:** `sdk/src/types/index.ts`

```typescript
// ============================================
// CORE TYPES
// ============================================

export type Address = `0x${string}`;
export type Bytes32 = `0x${string}`;
export type BigIntish = bigint | string | number;

// ============================================
// IDENTITY TYPES
// ============================================

export interface AgentDetails {
  agentId: bigint;
  owner: Address;
  agentURI: string;
  zkIdentity: Bytes32 | null;
  verifiedOperator: boolean;
  operator: Address | null;
  registeredAt: Date;
  updatedAt: Date;

  // Reputation summary
  feedbackCount: number;
  averageScore: number | null;
  verifiedScore: number | null;

  // Validation summary
  validationCount: number;
  successfulValidations: number;

  // Parsed registration file
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
  Hybrid = 3
}

export enum ValidationStatus {
  Pending = 0,
  Completed = 1,
  Expired = 2,
  Disputed = 3
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
  // Text search
  query?: string;

  // Filters
  capabilities?: string[];
  minReputation?: number;
  minStake?: bigint;
  verifiedOperatorOnly?: boolean;
  zkIdentityOnly?: boolean;

  // Trust model filter
  supportedTrust?: Array<"reputation" | "crypto-economic" | "tee-attestation">;

  // Pagination
  first?: number;
  skip?: number;

  // Sorting
  orderBy?: "reputation" | "validations" | "stake" | "registeredAt";
  orderDirection?: "asc" | "desc";
}

export interface AgentSearchResult {
  agents: AgentDetails[];
  totalCount: number;
  hasMore: boolean;
}

// ============================================
// CLIENT CONFIG
// ============================================

export interface TALClientConfig {
  // Provider
  provider: any; // ethers.Provider or viem PublicClient
  signer?: any;  // ethers.Signer or viem WalletClient

  // Contract addresses
  identityRegistryAddress: Address;
  reputationRegistryAddress: Address;
  validationRegistryAddress: Address;

  // External services
  subgraphUrl: string;
  ipfsGateway: string;

  // Optional
  chainId?: number;
  cacheTimeout?: number;
}
```

---

## 5. API SPECIFICATIONS

### 5.1 SDK Public Methods

#### 5.1.1 TALClient Class

```typescript
class TALClient {
  constructor(config: TALClientConfig);

  // ==========================================
  // IDENTITY METHODS
  // ==========================================

  /**
   * Register a new agent
   * @param params Registration parameters
   * @returns Agent ID and transaction receipt
   */
  async registerAgent(params: RegistrationParams): Promise<{
    agentId: bigint;
    tx: TransactionReceipt;
  }>;

  /**
   * Register agent with ZK identity commitment
   */
  async registerAgentWithZKIdentity(
    agentURI: string,
    zkCommitment: Bytes32
  ): Promise<{ agentId: bigint; tx: TransactionReceipt }>;

  /**
   * Get agent details by ID
   */
  async getAgent(agentId: bigint): Promise<AgentDetails>;

  /**
   * Get agents owned by address
   */
  async getAgentsByOwner(owner: Address): Promise<AgentDetails[]>;

  /**
   * Update agent URI
   */
  async updateAgentURI(agentId: bigint, newURI: string): Promise<TransactionReceipt>;

  /**
   * Set agent metadata
   */
  async setMetadata(
    agentId: bigint,
    key: string,
    value: Uint8Array
  ): Promise<TransactionReceipt>;

  /**
   * Verify agent wallet
   */
  async verifyAgentWallet(
    agentId: bigint,
    wallet: Address,
    signature: Uint8Array
  ): Promise<TransactionReceipt>;

  /**
   * Verify capability with ZK proof
   */
  async verifyCapability(
    agentId: bigint,
    capabilityHash: Bytes32,
    proof: ZKProof,
    publicInputs: bigint[]
  ): Promise<{ verified: boolean; tx: TransactionReceipt }>;

  /**
   * Check if agent is verified operator
   */
  async isVerifiedOperator(agentId: bigint): Promise<boolean>;

  /**
   * Set agent operator
   */
  async setOperator(agentId: bigint, operator: Address): Promise<TransactionReceipt>;

  // ==========================================
  // REPUTATION METHODS
  // ==========================================

  /**
   * Submit feedback for an agent
   */
  async submitFeedback(
    agentId: bigint,
    feedback: FeedbackInput
  ): Promise<TransactionReceipt>;

  /**
   * Submit feedback with x402 payment proof
   */
  async submitFeedbackWithPaymentProof(
    agentId: bigint,
    feedback: FeedbackInput,
    x402Proof: Uint8Array
  ): Promise<TransactionReceipt>;

  /**
   * Revoke feedback
   */
  async revokeFeedback(agentId: bigint, feedbackIndex: number): Promise<TransactionReceipt>;

  /**
   * Respond to feedback
   */
  async respondToFeedback(
    agentId: bigint,
    client: Address,
    feedbackIndex: number,
    responseURI: string
  ): Promise<TransactionReceipt>;

  /**
   * Get reputation summary
   */
  async getReputation(
    agentId: bigint,
    options?: ReputationQueryOptions
  ): Promise<FeedbackSummary>;

  /**
   * Get stake-weighted reputation
   */
  async getStakeWeightedReputation(agentId: bigint): Promise<FeedbackSummary>;

  /**
   * Get verified reputation (from validated tasks only)
   */
  async getVerifiedReputation(agentId: bigint): Promise<FeedbackSummary>;

  /**
   * Get feedback entries
   */
  async getFeedback(
    agentId: bigint,
    options?: { client?: Address; offset?: number; limit?: number }
  ): Promise<{ feedbacks: FeedbackEntry[]; total: number }>;

  // ==========================================
  // VALIDATION METHODS
  // ==========================================

  /**
   * Request validation
   */
  async requestValidation(
    params: ValidationRequestParams
  ): Promise<{ requestHash: Bytes32; tx: TransactionReceipt }>;

  /**
   * Submit validation response
   */
  async submitValidation(
    requestHash: Bytes32,
    score: number,
    proof: Uint8Array,
    detailsURI: string
  ): Promise<TransactionReceipt>;

  /**
   * Get validation status
   */
  async getValidationStatus(requestHash: Bytes32): Promise<ValidationDetails>;

  /**
   * Get agent's validations
   */
  async getAgentValidations(
    agentId: bigint,
    options?: { status?: ValidationStatus; limit?: number }
  ): Promise<ValidationDetails[]>;

  /**
   * Dispute validation
   */
  async disputeValidation(
    requestHash: Bytes32,
    evidence: Uint8Array
  ): Promise<TransactionReceipt>;

  // ==========================================
  // DISCOVERY METHODS (via Subgraph)
  // ==========================================

  /**
   * Search agents
   */
  async searchAgents(query: AgentSearchQuery): Promise<AgentSearchResult>;

  /**
   * Get top agents
   */
  async getTopAgents(options: {
    limit: number;
    sortBy: "reputation" | "validations" | "stake";
  }): Promise<AgentDetails[]>;

  /**
   * Get agents by capability
   */
  async getAgentsByCapability(capability: string): Promise<AgentDetails[]>;

  /**
   * Get protocol statistics
   */
  async getProtocolStats(): Promise<ProtocolStats>;
}
```

#### 5.1.2 ProofGenerator Class

```typescript
class ProofGenerator {
  constructor(config: {
    circuitWasmPath: string;
    zkeyPath: string;
  });

  /**
   * Generate identity commitment (Poseidon hash)
   */
  async generateIdentityCommitment(attributes: {
    name: string;
    capabilities: string[];
    organization: string;
    nonce?: bigint;
  }): Promise<{
    commitment: Bytes32;
    privateInputs: IdentityPrivateInputs;
  }>;

  /**
   * Generate capability proof (SNARK)
   */
  async generateCapabilityProof(
    privateInputs: IdentityPrivateInputs,
    commitment: Bytes32,
    targetCapability: string
  ): Promise<{
    proof: ZKProof;
    publicSignals: bigint[];
  }>;

  /**
   * Generate reputation threshold proof
   */
  async generateReputationThresholdProof(
    score: number,
    threshold: number,
    agentId: bigint,
    merkleProof: MerkleProof
  ): Promise<{
    proof: ZKProof;
    publicSignals: bigint[];
  }>;

  /**
   * Verify proof locally
   */
  async verifyProof(
    proof: ZKProof,
    publicSignals: bigint[],
    verificationKey: object
  ): Promise<boolean>;
}
```

#### 5.1.3 RegistrationBuilder Class

```typescript
class RegistrationBuilder {
  /**
   * Set agent name
   */
  setName(name: string): this;

  /**
   * Set agent description
   */
  setDescription(description: string): this;

  /**
   * Set agent image URL
   */
  setImage(imageUrl: string): this;

  /**
   * Set active status
   */
  setActive(active: boolean): this;

  /**
   * Add service endpoint
   */
  addService(
    type: "A2A" | "MCP" | "OASF" | "ENS" | "DID" | "web" | "email" | string,
    endpoint: string
  ): this;

  /**
   * Set supported trust models
   */
  setSupportedTrust(
    models: Array<"reputation" | "crypto-economic" | "tee-attestation">
  ): this;

  /**
   * Set x402 support
   */
  setX402Support(supported: boolean): this;

  /**
   * Add cross-chain registration
   */
  addRegistration(agentId: string, agentRegistry: string, chainId?: number): this;

  /**
   * Add capability
   */
  addCapability(capability: {
    id: string;
    name: string;
    description: string;
    inputSchema?: object;
    outputSchema?: object;
  }): this;

  /**
   * Set operator info
   */
  setOperator(operator: {
    address: string;
    organization?: string;
    website?: string;
  }): this;

  /**
   * Set TEE configuration
   */
  setTEEConfig(config: {
    provider: "sgx" | "nitro" | "trustzone";
    enclaveHash: string;
    attestationEndpoint?: string;
  }): this;

  /**
   * Set pricing
   */
  setPricing(pricing: {
    currency: "TON" | "USD";
    perRequest?: string;
    perToken?: string;
    subscription?: { monthly?: string; yearly?: string };
  }): this;

  /**
   * Build registration file
   */
  build(): AgentRegistrationFile;

  /**
   * Validate registration file
   */
  validate(): { valid: boolean; errors: string[] };

  /**
   * Upload to IPFS
   */
  async uploadToIPFS(config: {
    pinataApiKey?: string;
    pinataSecretKey?: string;
    infuraProjectId?: string;
    infuraProjectSecret?: string;
  }): Promise<string>; // Returns IPFS CID
}
```

---

### 5.2 Subgraph GraphQL Queries

```graphql
# Get agent by ID
query GetAgent($id: ID!) {
  agent(id: $id) {
    id
    owner
    agentURI
    zkIdentity
    verifiedOperator
    stakedAmount
    operator
    registeredAt
    updatedAt
    feedbackCount
    averageScore
    verifiedScore
    validationCount
    successfulValidations
    isActive
    capabilities {
      capabilityHash
      verified
      verifiedAt
    }
  }
}

# Search agents
query SearchAgents(
  $first: Int!
  $skip: Int!
  $orderBy: Agent_orderBy
  $orderDirection: OrderDirection
  $where: Agent_filter
) {
  agents(
    first: $first
    skip: $skip
    orderBy: $orderBy
    orderDirection: $orderDirection
    where: $where
  ) {
    id
    owner
    agentURI
    verifiedOperator
    averageScore
    validationCount
    isActive
  }
}

# Get agent feedback
query GetAgentFeedback(
  $agentId: ID!
  $first: Int!
  $skip: Int!
) {
  feedbackEntries(
    where: { agent: $agentId, isRevoked: false }
    first: $first
    skip: $skip
    orderBy: timestamp
    orderDirection: desc
  ) {
    id
    client
    value
    valueDecimals
    tag1
    tag2
    timestamp
    hasPaymentProof
    clientStake
  }
}

# Get agent validations
query GetAgentValidations(
  $agentId: ID!
  $status: ValidationStatus
  $first: Int!
) {
  validations(
    where: { agent: $agentId, status: $status }
    first: $first
    orderBy: requestedAt
    orderDirection: desc
  ) {
    id
    requester
    model
    bounty
    status
    validator
    score
    requestedAt
    completedAt
  }
}

# Get protocol stats
query GetProtocolStats {
  protocolStats(id: "singleton") {
    totalAgents
    activeAgents
    totalFeedbacks
    totalValidations
    completedValidations
    totalBountiesPaid
    totalStaked
  }
}

# Get top agents by reputation
query GetTopAgentsByReputation($first: Int!) {
  agents(
    first: $first
    orderBy: averageScore
    orderDirection: desc
    where: { isActive: true, feedbackCount_gt: "0" }
  ) {
    id
    agentURI
    averageScore
    feedbackCount
    validationCount
    verifiedOperator
  }
}

# Get daily stats
query GetDailyStats($from: BigInt!, $to: BigInt!) {
  dailyStats(
    where: { date_gte: $from, date_lte: $to }
    orderBy: date
    orderDirection: asc
  ) {
    id
    date
    newAgents
    feedbackCount
    validationRequests
    validationsCompleted
    bountiesDistributed
  }
}
```

---

### 5.3 Frontend API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/agents` | GET | List agents with filtering |
| `/api/agents/[id]` | GET | Get agent details |
| `/api/agents/[id]/reputation` | GET | Get agent reputation |
| `/api/agents/[id]/validations` | GET | Get agent validations |
| `/api/validations` | GET | List validations |
| `/api/validations/[hash]` | GET | Get validation details |
| `/api/stats` | GET | Get protocol statistics |
| `/api/ipfs/upload` | POST | Upload to IPFS (proxied) |
| `/api/health` | GET | Health check |

---

## 6. SECURITY CONSIDERATIONS

### 6.1 Access Control Matrix

| Contract | Function | Owner | Operator | Anyone | Governance | TEE Admin |
|----------|----------|-------|----------|--------|------------|-----------|
| Identity | register | - | - | X | - | - |
| Identity | updateAgentURI | X | X | - | - | - |
| Identity | setMetadata | X | X | - | - | - |
| Identity | verifyAgentWallet | X | - | - | - | - |
| Identity | setZKIdentity | X | - | - | - | - |
| Identity | verifyCapability | X | X | X | - | - |
| Identity | setOperator | X | - | - | - | - |
| Identity | pause/unpause | - | - | - | X | - |
| Identity | upgrade | - | - | - | X | - |
| Reputation | submitFeedback | - | - | X | - | - |
| Reputation | revokeFeedback | - | - | Submitter | - | - |
| Reputation | respondToFeedback | X | X | - | - | - |
| Reputation | updateMerkleRoot | - | - | - | - | Updater |
| Validation | requestValidation | - | - | X | - | - |
| Validation | submitValidation | - | - | Selected | - | - |
| Validation | disputeValidation | - | - | X | - | - |
| Validation | resolveDispute | - | - | - | X | - |
| Validation | addTEEProvider | - | - | - | - | X |
| Validation | removeTEEProvider | - | - | - | - | X |

### 6.2 Attack Vectors and Mitigations

| Attack Vector | Risk Level | Mitigation |
|---------------|------------|------------|
| **Sybil Attack on Reputation** | High | Client filtering, stake weighting, payment proof, validation linkage |
| **Front-running Validator Selection** | High | DRB Commit-Reveal² prevents last-revealer manipulation |
| **TEE Attestation Forgery** | High | Whitelist providers, verify signatures on-chain, check enclave hash |
| **Reentrancy** | Medium | ReentrancyGuard on all state-changing functions |
| **Flash Loan Stake Manipulation** | Medium | Snapshot-based stake weight, time-weighted stake |
| **Griefing via Disputes** | Medium | Dispute bond requirement, slashing for frivolous disputes |
| **Upgrade Attacks** | High | 48h+ timelock, governance-controlled upgrades |
| **Oracle Manipulation** | Medium | DRB for randomness, multiple data sources |
| **Denial of Service** | Low | Gas limits, pagination, rate limiting via gas costs |
| **Private Key Compromise** | Critical | Multi-sig governance, timelock buffer for exit |

### 6.3 Upgrade Safety Checklist

- [ ] Storage layout unchanged (no variable reordering)
- [ ] Storage gap maintained (`uint256[N] __gap`)
- [ ] No constructor logic (use initializer)
- [ ] Initializer protected with `initializer` modifier
- [ ] New variables added after existing ones
- [ ] Interface compatibility maintained
- [ ] Events remain backward compatible
- [ ] Timelock delay >= 48 hours
- [ ] Upgrade tested on fork of mainnet state
- [ ] Rollback plan documented

### 6.4 TEE Attestation Verification Steps

1. **Decode Attestation:**
   ```solidity
   (address teeSigner, bytes32 enclaveHash, bytes32 inputHash,
    bytes32 outputHash, uint256 timestamp, bytes memory sig) =
       abi.decode(attestation, (address, bytes32, bytes32, bytes32, uint256, bytes));
   ```

2. **Verify Provider Whitelist:**
   ```solidity
   require(trustedTEEProviders[teeSigner], "TEE provider not whitelisted");
   ```

3. **Verify Enclave Hash:**
   ```solidity
   require(teeEnclaveHashes[teeSigner] == enclaveHash, "Invalid enclave hash");
   ```

4. **Verify Signature:**
   ```solidity
   bytes32 messageHash = keccak256(abi.encodePacked(
       enclaveHash, inputHash, outputHash, requestHash, timestamp
   ));
   require(ECDSA.recover(messageHash, sig) == teeSigner, "Invalid signature");
   ```

5. **Verify Freshness:**
   ```solidity
   require(block.timestamp - timestamp <= 1 hours, "Attestation too old");
   ```

6. **Verify Output Binding:**
   ```solidity
   require(outputHash == _requests[requestHash].outputHash, "Output mismatch");
   ```

---

## 7. IMPLEMENTATION PHASES

### Sprint 1: Core Contracts (Weeks 1-2)

**Objective:** Implement ERC-8004 compliant registries without ZK or DRB extensions.

**Files to Create:**

```
contracts/
├── src/
│   ├── interfaces/
│   │   ├── IERC8004IdentityRegistry.sol
│   │   ├── IERC8004ReputationRegistry.sol
│   │   ├── IERC8004ValidationRegistry.sol
│   │   ├── ITALIdentityRegistry.sol
│   │   ├── ITALReputationRegistry.sol
│   │   └── ITALValidationRegistry.sol
│   ├── core/
│   │   ├── TALIdentityRegistry.sol
│   │   ├── TALReputationRegistry.sol
│   │   └── TALValidationRegistry.sol
│   ├── libraries/
│   │   ├── ReputationMath.sol
│   │   └── ValidationUtils.sol
│   └── proxy/
│       └── TALProxy.sol
├── test/
│   └── unit/
│       ├── TALIdentityRegistry.t.sol
│       ├── TALReputationRegistry.t.sol
│       └── TALValidationRegistry.t.sol
└── foundry.toml
```

**Dependencies:** None (first sprint)

**Test Coverage Requirements:**
- Line coverage: >= 95%
- Branch coverage: >= 90%
- All public functions tested
- All error conditions tested

**Definition of Done:**
- [ ] All interfaces implemented per ERC-8004 spec
- [ ] TALIdentityRegistry: register, updateURI, setMetadata, verifyWallet
- [ ] TALReputationRegistry: submitFeedback, revoke, respond, getSummary
- [ ] TALValidationRegistry: requestValidation (ReputationOnly only), basic getters
- [ ] UUPS proxy pattern implemented
- [ ] Unit tests passing with >= 95% coverage
- [ ] Gas benchmarks within targets
- [ ] Deploys successfully to local Anvil

---

### Sprint 2: Enhancement Modules (Weeks 3-4)

**Objective:** Add staking integration, DRB integration, and full validation models.

**Files to Create:**

```
contracts/
├── src/
│   ├── interfaces/
│   │   ├── IStakingV2.sol
│   │   ├── IDRB.sol
│   │   ├── ITEEAttestation.sol
│   │   ├── IZKVerifierModule.sol
│   │   ├── IDRBIntegrationModule.sol
│   │   └── IStakingIntegrationModule.sol
│   ├── modules/
│   │   ├── DRBIntegrationModule.sol
│   │   └── StakingIntegrationModule.sol
│   ├── libraries/
│   │   └── SlashingCalculator.sol
│   └── mocks/
│       ├── MockStakingV2.sol
│       ├── MockDRB.sol
│       └── MockTEEProvider.sol
├── test/
│   ├── unit/
│   │   ├── DRBIntegrationModule.t.sol
│   │   └── StakingIntegrationModule.t.sol
│   └── integration/
│       ├── StakeSecuredValidation.t.sol
│       └── TEEAttestedValidation.t.sol
```

**Dependencies:** Sprint 1 contracts

**Test Coverage Requirements:**
- DRB selection fairness test (10k iterations)
- TEE attestation verification test
- Bounty distribution test (80/10/10 split)
- Slashing execution test

**Definition of Done:**
- [ ] StakingIntegrationModule: getStake, isVerifiedOperator, executeSlash
- [ ] DRBIntegrationModule: requestRandomness, selectFromWeightedList
- [ ] TALValidationRegistry extended with StakeSecured, TEEAttested, Hybrid models
- [ ] Bounty distribution implemented (80/10/10 split)
- [ ] Mock contracts for testing without external dependencies
- [ ] Integration tests for full validation flows
- [ ] Statistical fairness verified for DRB selection

---

### Sprint 3: ZK + Subgraph (Weeks 5-6)

**Objective:** Implement ZK circuits and subgraph indexer.

**Files to Create:**

```
circuits/
├── identity/
│   ├── identity_commitment.circom
│   └── capability_proof.circom
├── reputation/
│   └── reputation_threshold.circom
├── scripts/
│   ├── compile.sh
│   ├── setup.sh
│   └── generate_verifier.sh
└── test/
    ├── identity_commitment.test.js
    ├── capability_proof.test.js
    └── reputation_threshold.test.js

contracts/
├── src/
│   ├── modules/
│   │   └── ZKVerifierModule.sol
│   ├── libraries/
│   │   └── PoseidonHasher.sol
│   └── verifiers/
│       ├── IdentityCommitmentVerifier.sol
│       ├── CapabilityProofVerifier.sol
│       └── ReputationThresholdVerifier.sol

subgraph/
├── schema.graphql
├── subgraph.yaml
├── src/
│   ├── identity.ts
│   ├── reputation.ts
│   ├── validation.ts
│   └── helpers.ts
├── tests/
│   └── integration.test.ts
└── package.json
```

**Dependencies:** Sprint 1-2 contracts

**Test Coverage Requirements:**
- All circuit constraints verified
- Proof generation and verification tested
- Subgraph entity mappings tested
- Cross-reference between on-chain and indexed data

**Definition of Done:**
- [ ] Circom circuits compile without errors
- [ ] Trusted setup completed (dev ceremony)
- [ ] Solidity verifiers generated and deployed
- [ ] ZKVerifierModule wraps verifiers
- [ ] TALIdentityRegistry extended with ZK functions
- [ ] Subgraph schema matches contract events
- [ ] Subgraph handlers index all events
- [ ] Subgraph deploys to hosted service

---

### Sprint 4: SDK + Frontend (Weeks 7-8)

**Objective:** Build TypeScript SDK and Next.js frontend.

**Files to Create:**

```
sdk/
├── src/
│   ├── TALClient.ts
│   ├── identity/
│   │   ├── IdentityClient.ts
│   │   └── RegistrationBuilder.ts
│   ├── reputation/
│   │   └── ReputationClient.ts
│   ├── validation/
│   │   └── ValidationClient.ts
│   ├── zk/
│   │   └── ProofGenerator.ts
│   ├── subgraph/
│   │   └── SubgraphClient.ts
│   └── types/
│       └── index.ts
├── tests/
│   ├── TALClient.test.ts
│   ├── ProofGenerator.test.ts
│   └── integration.test.ts
├── package.json
└── tsconfig.json

frontend/
├── app/
│   ├── page.tsx
│   ├── layout.tsx
│   ├── agents/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   ├── agents/register/page.tsx
│   ├── reputation/[agentId]/page.tsx
│   ├── validation/
│   │   ├── page.tsx
│   │   └── [hash]/page.tsx
│   ├── staking/page.tsx
│   └── governance/page.tsx
├── components/
│   ├── AgentCard.tsx
│   ├── ReputationChart.tsx
│   ├── ValidationTimeline.tsx
│   ├── ZKIdentityBadge.tsx
│   ├── TrustModelSelector.tsx
│   └── ...
├── hooks/
│   ├── useAgent.ts
│   ├── useReputation.ts
│   ├── useValidation.ts
│   └── useWallet.ts
├── lib/
│   ├── tal-client.ts
│   └── subgraph.ts
└── package.json
```

**Dependencies:** Sprint 1-3 contracts and subgraph

**Test Coverage Requirements:**
- SDK unit tests >= 90% coverage
- E2E tests for critical flows
- Accessibility audit passed
- Mobile responsive verified

**Definition of Done:**
- [ ] TALClient implements all methods
- [ ] ProofGenerator works in browser
- [ ] RegistrationBuilder validates and uploads
- [ ] All frontend pages implemented
- [ ] Wallet connection working
- [ ] Subgraph integration working
- [ ] SDK published to npm (beta)
- [ ] Frontend deploys to Vercel

---

### Sprint 5: Integration + Testnet (Weeks 9-10)

**Objective:** End-to-end testing and testnet deployment.

**Files to Create:**

```
contracts/
├── script/
│   ├── Deploy.s.sol
│   ├── Upgrade.s.sol
│   └── ConfigureTestnet.s.sol
└── deployments/
    └── tokamak-testnet.json

docs/
├── architecture.md
├── api-reference.md
├── integration-guide.md
├── security-audit-prep.md
└── deployment-runbook.md
```

**Dependencies:** All previous sprints

**Test Coverage Requirements:**
- E2E flows on testnet
- Load testing completed
- Security checklist verified
- Documentation reviewed

**Definition of Done:**
- [ ] All contracts deployed to Tokamak testnet
- [ ] Subgraph indexing testnet events
- [ ] Frontend connected to testnet
- [ ] Full E2E flow tested: register → feedback → validation → reputation
- [ ] Gas optimization completed (within targets)
- [ ] Documentation complete
- [ ] Security self-audit completed
- [ ] Bug bounty scope defined
- [ ] Ready for external audit

---

### Milestone Summary

| Sprint | Duration | Key Deliverables | Blockers |
|--------|----------|------------------|----------|
| 1 | Weeks 1-2 | Core registries (ERC-8004 compliant) | None |
| 2 | Weeks 3-4 | Enhancement modules, full validation | Sprint 1 |
| 3 | Weeks 5-6 | ZK circuits, subgraph | Sprint 1-2 |
| 4 | Weeks 7-8 | SDK, frontend | Sprint 1-3 |
| 5 | Weeks 9-10 | Testnet deployment, docs | Sprint 1-4 |

**Total Duration:** 10 weeks

**Post-Sprint Activities:**
- External security audit (2-4 weeks)
- Audit remediation (1-2 weeks)
- Mainnet deployment preparation
- Public launch

---

## Appendix A: Gas Optimization Strategies

| Strategy | Contract | Estimated Savings |
|----------|----------|-------------------|
| Struct packing | All | 20-30% on storage |
| Custom errors | All | 10-15% vs require strings |
| Unchecked arithmetic | Libraries | 5-10% on math |
| Calldata vs memory | All | 15-20% on parameters |
| Bitmap for booleans | Identity | 90% for multiple flags |
| Merkle proofs batch | Reputation | 40% vs individual |
| Lazy evaluation | Reputation | Variable (defer computation) |

---

## Appendix B: Contract Addresses (TBD)

| Contract | Testnet | Mainnet |
|----------|---------|---------|
| TALIdentityRegistry | TBD | TBD |
| TALReputationRegistry | TBD | TBD |
| TALValidationRegistry | TBD | TBD |
| ZKVerifierModule | TBD | TBD |
| DRBIntegrationModule | TBD | TBD |
| StakingIntegrationModule | TBD | TBD |
| TALGovernor | TBD | TBD |
| TALTimelock | TBD | TBD |
| Staking V2 (external) | TBD | TBD |
| DRB (external) | TBD | TBD |

---

*End of Technical Specification*
