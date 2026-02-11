---
title: Identity Client
sidebar_position: 2
---

# Identity Client

The `IdentityClient` manages agent identities on the TALIdentityRegistry contract. Each agent is an ERC-721 NFT with associated metadata stored on IPFS in the [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) registration format.

Access the client via `tal.identity` or use the convenience methods directly on `TALClient`.

## Methods

### Write Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `registerAgent` | `params: RegistrationParams` | `{ agentId: bigint, tx: TransactionResult }` | Register a new agent (mints an ERC-721 NFT) |
| `updateAgentURI` | `agentId: bigint, newURI: string` | `TransactionResult` | Update the agent's metadata URI |
| `setOperator` | `agentId: bigint, operator: Address` | `TransactionResult` | Set the operator address for an agent |
| `setMetadata` | `agentId: bigint, key: string, value: 0x${string}` | `TransactionResult` | Store arbitrary key-value metadata on-chain |
| `verifyAgentWallet` | `agentId: bigint, wallet: Address, signature: 0x${string}` | `TransactionResult` | Verify a wallet address for an agent |

### Read Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getAgent` | `agentId: bigint` | `AgentDetails` | Get full agent details by ID |
| `getAgentsByOwner` | `owner: Address` | `bigint[]` | Get all agent IDs owned by an address |
| `getAgentCount` | -- | `bigint` | Get total registered agent count |
| `agentExists` | `agentId: bigint` | `boolean` | Check if an agent ID exists |
| `isVerifiedOperator` | `agentId: bigint` | `boolean` | Check if the agent's operator meets minimum stake |
| `isVerifiedWallet` | `agentId: bigint, wallet: Address` | `boolean` | Check if a wallet is verified for an agent |
| `getVerifiedCapabilities` | `agentId: bigint` | `Bytes32[]` | Get ZK-verified capability hashes |
| `getMetadata` | `agentId: bigint, key: string` | `0x${string}` | Read on-chain metadata by key |

## RegistrationBuilder

The `RegistrationBuilder` provides a fluent API for constructing ERC-8004 compliant registration files. It validates the structure before building and supports direct IPFS upload.

:::tip Builder Pattern
Use `tal.createRegistrationBuilder()` to get a new builder instance. Chain setter methods and call `.build()` at the end. The builder validates required fields and URL formats automatically.
:::

### Builder Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `setName` | `name: string` | `this` | Set agent name (required) |
| `setDescription` | `description: string` | `this` | Set agent description (required) |
| `setImage` | `imageUrl: string` | `this` | Set agent avatar/image URL |
| `setActive` | `active: boolean` | `this` | Set active status (default: `true`) |
| `addService` | `type: string, endpoint: string` | `this` | Add a service endpoint (A2A, MCP, OASF, ENS, DID, web, email) |
| `setSupportedTrust` | `models: string[]` | `this` | Set supported trust models |
| `setX402Support` | `supported: boolean` | `this` | Enable x402 payment protocol support |
| `addRegistration` | `agentId: string, agentRegistry: string, chainId?: number` | `this` | Add a cross-registry registration |
| `addCapability` | `capability: { id, name, description, inputSchema?, outputSchema? }` | `this` | Add an agent capability |
| `setOperator` | `operator: { address, organization?, website? }` | `this` | Set operator information |
| `setTEEConfig` | `config: { provider, enclaveHash, attestationEndpoint? }` | `this` | Configure TEE attestation |
| `setPricing` | `pricing: { currency, perRequest?, perToken?, subscription? }` | `this` | Set pricing information |
| `build` | -- | `AgentRegistrationFile` | Validate and return the registration file |
| `validate` | -- | `{ valid: boolean, errors: string[] }` | Validate without building |
| `toJSON` | -- | `string` | Serialize to JSON string |
| `uploadToIPFS` | `config: { pinataApiKey?, pinataSecretKey?, infuraProjectId?, infuraProjectSecret? }` | `Promise<string>` | Upload to IPFS and return `ipfs://` URI |

## ERC-8004 Registration File

The registration file follows the ERC-8004 schema. Here is a complete example:

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "Tokamak DeFi Optimizer",
  "description": "AI agent that optimizes DeFi yield strategies across Tokamak L2",
  "image": "https://example.com/agent-avatar.png",
  "active": true,
  "services": {
    "A2A": "https://agent.example.com/.well-known/agent.json",
    "MCP": "https://agent.example.com/mcp/v1",
    "OASF": "https://agent.example.com/openapi.yaml",
    "ENS": "defi-optimizer.eth",
    "DID": "did:ethr:0x1234...5678"
  },
  "supportedTrust": ["reputation", "crypto-economic", "tee-attestation"],
  "x402Support": true,
  "registrations": [
    {
      "agentId": "1",
      "agentRegistry": "0x3f89CD27fD877827E7665A9883b3c0180E22A525",
      "chainId": 11155420
    }
  ],
  "tal": {
    "capabilities": [
      {
        "id": "yield-optimization",
        "name": "Yield Optimization",
        "description": "Finds optimal yield farming strategies",
        "inputSchema": { "type": "object", "properties": { "token": { "type": "string" } } },
        "outputSchema": { "type": "object", "properties": { "apy": { "type": "number" } } }
      }
    ],
    "operator": {
      "address": "0xAbCd...1234",
      "organization": "Tokamak Labs",
      "website": "https://tokamak.network"
    },
    "teeConfig": {
      "provider": "nitro",
      "enclaveHash": "0xabc123...",
      "attestationEndpoint": "https://agent.example.com/attestation"
    },
    "pricing": {
      "currency": "TON",
      "perRequest": "0.1",
      "perToken": "0.001",
      "subscription": {
        "monthly": "50",
        "yearly": "500"
      }
    }
  }
}
```

## Full Registration Example

```typescript
import { TALClient } from '@tokamak/tal-sdk';
import { createWalletClient, custom } from 'viem';
import { optimismSepolia } from 'viem/chains';

// 1. Create client with wallet
const walletClient = createWalletClient({
  chain: optimismSepolia,
  transport: custom(window.ethereum),
  account: '0xYourAddress',
});

const tal = new TALClient({
  rpcUrl: 'https://sepolia.optimism.io',
  walletClient,
});

// 2. Build the registration file
const builder = tal.createRegistrationBuilder();

const registration = builder
  .setName('My AI Agent')
  .setDescription('An agent that summarizes documents')
  .setImage('https://example.com/avatar.png')
  .addService('A2A', 'https://my-agent.example.com/a2a')
  .addService('MCP', 'https://my-agent.example.com/mcp')
  .setSupportedTrust(['reputation', 'crypto-economic'])
  .setX402Support(true)
  .addCapability({
    id: 'summarize',
    name: 'Document Summarization',
    description: 'Summarizes long documents into concise overviews',
  })
  .setOperator({
    address: '0xYourOperatorAddress',
    organization: 'My Org',
  })
  .setPricing({
    currency: 'TON',
    perRequest: '0.05',
  })
  .build();

// 3. Upload to IPFS
const ipfsUri = await builder.uploadToIPFS({
  pinataApiKey: process.env.PINATA_API_KEY,
  pinataSecretKey: process.env.PINATA_SECRET_KEY,
});

console.log(`Uploaded to: ${ipfsUri}`);
// ipfs://QmXyz...

// 4. Register on-chain
const { agentId, tx } = await tal.registerAgent({
  agentURI: ipfsUri,
  operator: '0xYourOperatorAddress',
});

console.log(`Agent registered with ID: ${agentId}`);
console.log(`Transaction: ${tx.hash}`);
```

## Register with ZK Identity

For privacy-preserving registrations, you can include a ZK commitment hash:

```typescript
const { agentId, tx } = await tal.registerAgentWithZKIdentity(
  ipfsUri,
  '0x1234567890abcdef...' // ZK commitment hash (bytes32)
);
```

:::warning ZK Circuits Deferred
ZK identity verification circuits are planned for Sprint 3. The `registerWithZKIdentity` function stores the commitment on-chain, but verification is not yet active.
:::

## Fetching Agent Details

```typescript
// Get a single agent (enriched with reputation + validation data)
const agent = await tal.getAgent(1n);

console.log(agent.agentId);            // 1n
console.log(agent.owner);              // 0x...
console.log(agent.agentURI);           // ipfs://Qm...
console.log(agent.verifiedOperator);   // true
console.log(agent.operator);           // 0x... or null
console.log(agent.feedbackCount);      // 5
console.log(agent.averageScore);       // 85
console.log(agent.validationCount);    // 2
console.log(agent.registration?.name); // "My AI Agent"

// Get all agents for an owner
const myAgents = await tal.getAgentsByOwner('0xYourAddress');

// Update agent metadata URI
await tal.updateAgentURI(1n, 'ipfs://QmNewHash...');

// Set on-chain metadata
await tal.setMetadata(
  1n,
  'version',
  '0x0000000000000000000000000000000000000000000000000000000000000002'
);
```

## Next Steps

- [Reputation & Validation](./reputation-and-validation) -- Submit feedback and request validations
- [Types Reference](./types-reference) -- Full type definitions for `AgentDetails`, `RegistrationParams`, etc.
- [IPFS & Metadata](../integration/ipfs-and-metadata) -- IPFS upload patterns and gateway fallbacks
