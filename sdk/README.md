# @tokamak/tal-sdk

TypeScript SDK for the **Tokamak Agent Layer (TAL)** — an ERC-8004 compliant agent identity, reputation, and validation registry on Optimism Sepolia.

## Overview

The TAL SDK provides a type-safe interface to interact with the Tokamak Agent Layer smart contracts. It supports:

- **Agent Identity** — Register, query, and manage AI agent identities (ERC-721 NFTs)
- **Reputation** — Submit, query, and aggregate on-chain feedback with multiple scoring models
- **Validation** — Request and submit agent capability validations across trust models
- **Subgraph** — GraphQL client for indexed on-chain data (when deployed)
- **ZK Proofs** — Interface for zero-knowledge identity and capability proofs (Sprint 3)
- **Registration Builder** — Fluent builder for ERC-8004 compliant agent registration files with IPFS upload

## Installation

```bash
npm install @tokamak/tal-sdk viem
```

`viem` is a peer dependency (>= 2.0.0).

## Quick Start

### Read-Only Client (No Wallet)

```typescript
import { TALClient } from '@tokamak/tal-sdk';

const client = new TALClient({
  rpcUrl: 'https://sepolia.optimism.io',
});

// Get agent details
const agent = await client.getAgent(1n);
console.log(agent.owner, agent.agentURI, agent.verifiedOperator);

// Search agents
const result = await client.searchAgents({
  verifiedOperatorOnly: true,
  first: 10,
});

// Get protocol stats
const stats = await client.getProtocolStats();
console.log(`Total agents: ${stats.totalAgents}`);
```

### Write Client (With Wallet)

```typescript
import { TALClient } from '@tokamak/tal-sdk';
import { createWalletClient, http } from 'viem';
import { optimismSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const walletClient = createWalletClient({
  account: privateKeyToAccount('0x...'),
  chain: optimismSepolia,
  transport: http('https://sepolia.optimism.io'),
});

const client = new TALClient({
  rpcUrl: 'https://sepolia.optimism.io',
  walletClient,
});

// Register a new agent
const { agentId, tx } = await client.registerAgent({
  agentURI: 'ipfs://QmYourRegistrationFile',
});
console.log(`Registered agent #${agentId}, tx: ${tx.hash}`);
```

## Architecture

```
TALClient (facade)
├── IdentityClient      — Agent registration, metadata, operator management
├── ReputationClient    — Feedback submission, reputation queries, scoring
├── ValidationClient    — Validation requests, submissions, disputes
├── SubgraphClient      — GraphQL queries (stubbed until subgraph deployment)
└── ProofGenerator      — ZK proof generation (interface only, Sprint 3)
```

### TALClient

The main entry point. Wraps all domain clients and provides convenience methods that enrich data across registries (e.g., `getAgent()` fetches identity + reputation + validation data).

```typescript
const client = new TALClient({
  rpcUrl: 'https://sepolia.optimism.io',        // Required: JSON-RPC endpoint
  walletClient,                                   // Optional: for write operations
  contracts: {                                    // Optional: override contract addresses
    identityRegistry: '0x...',
    reputationRegistry: '0x...',
    validationRegistry: '0x...',
  },
  subgraphUrl: 'https://api.thegraph.com/...',   // Optional: subgraph endpoint
  ipfsGateway: 'https://ipfs.io/ipfs/',          // Optional: IPFS gateway
});
```

## API Reference

### Identity

| Method | Description | Wallet Required |
|--------|-------------|-----------------|
| `registerAgent(params)` | Register a new agent (returns agentId + tx) | Yes |
| `registerAgentWithZKIdentity(uri, commitment)` | Register with ZK identity commitment | Yes |
| `getAgent(agentId)` | Get enriched agent details | No |
| `getAgentsByOwner(owner)` | Get all agents owned by an address | No |
| `updateAgentURI(agentId, newURI)` | Update agent's metadata URI | Yes |
| `setMetadata(agentId, key, value)` | Set agent metadata key-value | Yes |
| `verifyAgentWallet(agentId, wallet, signature)` | Verify a wallet for the agent | Yes |
| `isVerifiedOperator(agentId)` | Check operator verification status | No |
| `setOperator(agentId, operator)` | Set agent operator address | Yes |

#### Register Agent Example

```typescript
const { agentId, tx } = await client.registerAgent({
  agentURI: 'ipfs://QmRegistrationFile',
  operator: '0xOperatorAddress',       // Optional
  zkCommitment: '0x...',               // Optional: ZK identity commitment
});
```

### Reputation

| Method | Description | Wallet Required |
|--------|-------------|-----------------|
| `submitFeedback(agentId, feedback)` | Submit feedback for an agent | Yes |
| `submitFeedbackWithPaymentProof(agentId, feedback, proof)` | Submit with x402 payment proof | Yes |
| `revokeFeedback(agentId, feedbackIndex)` | Revoke previously submitted feedback | Yes |
| `respondToFeedback(agentId, client, index, uri)` | Respond to feedback (owner only) | Yes |
| `getReputation(agentId, options?)` | Get reputation summary | No |
| `getStakeWeightedReputation(agentId)` | Get stake-weighted reputation | No |
| `getVerifiedReputation(agentId)` | Get verified-only reputation | No |
| `getFeedback(agentId, options?)` | Get feedback entries | No |

#### Submit Feedback Example

```typescript
await client.submitFeedback(1n, {
  value: 85,
  valueDecimals: 0,
  tag1: 'accuracy',
  tag2: 'text-generation',
  endpoint: 'https://agent.example.com/api',
  feedbackURI: 'ipfs://QmDetailedFeedback',
});
```

#### Query Reputation

```typescript
// Standard reputation
const rep = await client.getReputation(1n);
console.log(`Average: ${rep.average}, Count: ${rep.count}`);

// Stake-weighted (considers staker weight)
const stakeRep = await client.getStakeWeightedReputation(1n);

// Verified-only (validated tasks)
const verifiedRep = await client.getVerifiedReputation(1n);
```

### Validation

| Method | Description | Wallet Required |
|--------|-------------|-----------------|
| `requestValidation(params)` | Request agent output validation | Yes |
| `submitValidation(hash, score, proof, uri)` | Submit validation result | Yes |
| `getValidationStatus(requestHash)` | Get validation details | No |
| `getAgentValidations(agentId, options?)` | Get all validations for agent | No |
| `disputeValidation(requestHash, evidence)` | Dispute a validation result | Yes |

#### Validation Trust Models

```typescript
import { ValidationModel } from '@tokamak/tal-sdk';

await client.requestValidation({
  agentId: 1n,
  taskHash: '0x...',
  outputHash: '0x...',
  model: ValidationModel.StakeSecured,  // 0=ReputationOnly, 1=StakeSecured, 2=TEEAttested, 3=Hybrid
  deadline: new Date(Date.now() + 86400000),
  bounty: 100000000000000000n,           // 0.1 ETH
});
```

### Registration Builder

Fluent builder for creating ERC-8004 compliant agent registration files.

```typescript
import { RegistrationBuilder } from '@tokamak/tal-sdk';

const builder = new RegistrationBuilder()
  .setName('My AI Agent')
  .setDescription('Autonomous text generation agent')
  .setImage('https://example.com/avatar.png')
  .addService('A2A', 'https://agent.example.com/a2a')
  .addService('MCP', 'https://agent.example.com/mcp')
  .setSupportedTrust(['reputation', 'crypto-economic'])
  .setX402Support(true)
  .addCapability({
    id: 'text-gen',
    name: 'Text Generation',
    description: 'Generates text from natural language prompts',
    inputSchema: { type: 'object', properties: { prompt: { type: 'string' } } },
  })
  .setOperator({
    address: '0xOperatorAddress',
    organization: 'Tokamak Labs',
    website: 'https://tokamak.network',
  })
  .setPricing({
    currency: 'TON',
    perRequest: '0.001',
  });

// Validate before building
const { valid, errors } = builder.validate();

// Build the registration file
const registrationFile = builder.build();

// Upload to IPFS
const ipfsURI = await builder.uploadToIPFS({
  pinataApiKey: 'your-key',
  pinataSecretKey: 'your-secret',
});
```

### Subgraph Client

GraphQL client for querying indexed on-chain data. Gracefully degrades when no subgraph URL is provided.

```typescript
const client = new TALClient({
  rpcUrl: 'https://sepolia.optimism.io',
  subgraphUrl: 'https://api.thegraph.com/subgraphs/name/tokamak/tal',
});

// Check availability
console.log(client.subgraph.isAvailable); // true

// Search with filters
const results = await client.subgraph.searchAgents({
  verifiedOperatorOnly: true,
  minReputation: 70,
  orderBy: 'reputation',
  first: 20,
});

// Get protocol-wide stats
const stats = await client.subgraph.getProtocolStats();
```

### ZK Proof Generator

Interface for zero-knowledge proof generation. Full implementation depends on Sprint 3 Circom circuits.

```typescript
const generator = new ProofGenerator({
  circuitWasmPath: '/path/to/circuit.wasm',
  zkeyPath: '/path/to/circuit.zkey',
});

// Check if ZK is available
console.log(generator.isAvailable); // true if circuit files configured

// Encode/decode proofs for on-chain submission
const encoded = generator.encodeProof(proof);
const decoded = generator.decodeProof(encoded);
```

> **Note:** `generateIdentityCommitment()`, `generateCapabilityProof()`, `generateReputationThresholdProof()`, and `verifyProof()` are stubbed and will throw until Sprint 3 circuits are compiled.

## Types

All types are exported from the package root:

```typescript
import type {
  // Core
  Address,
  Bytes32,
  TransactionResult,

  // Identity
  AgentDetails,
  AgentRegistrationFile,
  RegistrationParams,

  // Reputation
  FeedbackInput,
  FeedbackEntry,
  FeedbackSummary,
  ReputationQueryOptions,

  // Validation
  ValidationRequest,
  ValidationResponse,
  ValidationDetails,
  ValidationRequestParams,

  // Enums
  ValidationModel,
  ValidationStatus,

  // Discovery
  AgentSearchQuery,
  AgentSearchResult,
  ProtocolStats,

  // ZK
  ZKProof,
  MerkleProof,

  // Config
  TALClientConfig,
} from '@tokamak/tal-sdk';
```

## Contract Addresses

Default addresses for Optimism Sepolia (chain ID 11155420):

| Contract | Address |
|----------|---------|
| TALIdentityRegistry | `0x3f89CD27fD877827E7665A9883b3c0180E22A525` |
| TALReputationRegistry | `0x0052258E517835081c94c0B685409f2EfC4D502b` |
| TALValidationRegistry | `0x09447147C6E75a60A449f38532F06E19F5F632F3` |
| StakingIntegrationModule | `0x41FF86643f6d550725177af1ABBF4db9715A74b8` |

Override with the `contracts` config option if deploying to a different network.

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type checking
npm run typecheck

# Build
npm run build

# Build in watch mode
npm run dev
```

### Test Coverage

The SDK includes 35 unit tests across 4 test suites:

| Suite | Tests | Coverage |
|-------|-------|----------|
| `types.test.ts` | 5 | Enums, constants, deployed addresses |
| `RegistrationBuilder.test.ts` | 13 | Builder API, validation, serialization, IPFS |
| `ProofGenerator.test.ts` | 11 | Availability, encode/decode, stub errors |
| `SubgraphClient.test.ts` | 6 | Stubbed mode, availability, graceful degradation |

## Project Structure

```
sdk/
├── src/
│   ├── index.ts                    # Public API exports
│   ├── TALClient.ts                # Main facade client
│   ├── types/
│   │   └── index.ts                # All TypeScript types & constants
│   ├── identity/
│   │   ├── IdentityClient.ts       # Agent identity operations
│   │   └── RegistrationBuilder.ts  # ERC-8004 registration file builder
│   ├── reputation/
│   │   └── ReputationClient.ts     # Feedback & reputation operations
│   ├── validation/
│   │   └── ValidationClient.ts     # Validation request/submit/dispute
│   ├── zk/
│   │   └── ProofGenerator.ts       # ZK proof interface (Sprint 3)
│   ├── subgraph/
│   │   └── SubgraphClient.ts       # GraphQL subgraph client
│   ├── abi/
│   │   ├── TALIdentityRegistry.ts  # Identity registry ABI
│   │   ├── TALReputationRegistry.ts # Reputation registry ABI
│   │   └── TALValidationRegistry.ts # Validation registry ABI
│   └── __tests__/
│       ├── types.test.ts
│       ├── RegistrationBuilder.test.ts
│       ├── ProofGenerator.test.ts
│       └── SubgraphClient.test.ts
├── package.json
└── tsconfig.json
```

## ERC-8004 Compliance

The SDK implements the [ERC-8004 Agent Registry Standard](https://eips.ethereum.org/EIPS/eip-8004):

- Agent identities are ERC-721 NFTs with associated metadata URIs
- Registration files follow the `eip-8004#registration-v1` schema
- Supports ZK identity commitments for privacy-preserving agent registration
- Service endpoint discovery (A2A, MCP, OASF, ENS, DID)
- On-chain capability verification via zero-knowledge proofs

## Limitations (MVP)

- **ZK Circuits** — Proof generation methods are stubbed (Sprint 3 postponed)
- **Subgraph** — GraphQL client gracefully returns empty results until deployed
- **DRB Integration** — Distributed Randomness Beacon for validator selection awaiting coordinator deployment
- **Cross-Layer Bridge** — L1↔L2 staking bridge contracts are TBD

## License

MIT
