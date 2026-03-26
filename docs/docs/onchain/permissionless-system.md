---
sidebar_position: 4
---

# Permissionless Agent Registry & Vault Factory

This document describes the permissionless system for agent registration and vault deployment, introduced to enable trustless and decentralized agent management.

## Overview

The permissionless system consists of two core components:

1. **AgentRegistry**: Permissionless registration of agents with deterministic IDs
2. **VaultFactory**: CREATE2-based vault deployment with imageId pinning

This design removes the need for a trusted operator to register agents, enabling anyone to deploy and run agents in a fully decentralized manner.

## Deployed Contracts

### Ethereum Mainnet

| Contract | Address |
|----------|---------|
| AgentRegistry | [`0x2BF56f889Ab5E535C3194bB2B356f10D6fa2FBEc`](https://etherscan.io/address/0x2BF56f889Ab5E535C3194bB2B356f10D6fa2FBEc) |
| VaultFactory | [`0x47E6EfFf516E8b899092ebEEF92fddCE579e9d39`](https://etherscan.io/address/0x47E6EfFf516E8b899092ebEEF92fddCE579e9d39) |
| KernelExecutionVerifier | [`0x5c0F88e27FADAb50EA82572950a616b4Cf4fd8B3`](https://etherscan.io/address/0x5c0F88e27FADAb50EA82572950a616b4Cf4fd8B3) |
| RISC Zero Verifier Router | [`0x8EaB2D97Dfce405A1692a21b3ff3A172d593D319`](https://etherscan.io/address/0x8EaB2D97Dfce405A1692a21b3ff3A172d593D319) |

### HyperEVM Mainnet (Chain ID: 999)

| Contract | Address |
|----------|---------|
| AgentRegistry | [`0x47E6EfFf516E8b899092ebEEF92fddCE579e9d39`](https://hyperliquid.cloud.blockscout.com/address/0x47E6EfFf516E8b899092ebEEF92fddCE579e9d39) |
| VaultFactory | [`0xd27A7470a34903b7e215EA8d07d9cd2d21238F83`](https://hyperliquid.cloud.blockscout.com/address/0xd27A7470a34903b7e215EA8d07d9cd2d21238F83) |
| KernelExecutionVerifier | [`0xD1478689f829c4B4F882eB8Ef7914C7874ddC707`](https://hyperliquid.cloud.blockscout.com/address/0xD1478689f829c4B4F882eB8Ef7914C7874ddC707) |
| RISC Zero Verifier Router | `0x9f8d4D1f7AAf06aab1640abd565A731399862Bc8` |

### Arbitrum One (Chain ID: 42161)

| Contract | Address |
|----------|---------|
| AgentRegistry | [`0xa6b363872aC1AA91Bc6a270958A06230c10aa473`](https://arbiscan.io/address/0xa6b363872aC1AA91Bc6a270958A06230c10aa473) |
| VaultFactory | [`0x7b0E7eDf494acF2E90fBc9Fc97b8C412606B0611`](https://arbiscan.io/address/0x7b0E7eDf494acF2E90fBc9Fc97b8C412606B0611) |
| KernelExecutionVerifier | [`0x936782d6bB65C75dFeC03228d1a5cb5d38C59318`](https://arbiscan.io/address/0x936782d6bB65C75dFeC03228d1a5cb5d38C59318) |
| RISC Zero Verifier Router | [`0x0b144e07a0826182b6b59788c34b32bfa86fb711`](https://arbiscan.io/address/0x0b144e07a0826182b6b59788c34b32bfa86fb711) |

### Optimism (Chain ID: 10)

| Contract | Address |
|----------|---------|
| AgentRegistry | [`0xa6b363872aC1AA91Bc6a270958A06230c10aa473`](https://optimistic.etherscan.io/address/0xa6b363872aC1AA91Bc6a270958A06230c10aa473) |
| VaultFactory | [`0x7b0E7eDf494acF2E90fBc9Fc97b8C412606B0611`](https://optimistic.etherscan.io/address/0x7b0E7eDf494acF2E90fBc9Fc97b8C412606B0611) |
| KernelExecutionVerifier | [`0x936782d6bB65C75dFeC03228d1a5cb5d38C59318`](https://optimistic.etherscan.io/address/0x936782d6bB65C75dFeC03228d1a5cb5d38C59318) |
| RISC Zero Verifier Router | [`0x0b144e07a0826182b6b59788c34b32bfa86fb711`](https://optimistic.etherscan.io/address/0x0b144e07a0826182b6b59788c34b32bfa86fb711) |

### Ethereum Sepolia (Testnet)

| Contract | Address |
|----------|---------|
| AgentRegistry | [`0xED27f8fbB7D576f02D516d01593eEfBaAfe4b168`](https://sepolia.etherscan.io/address/0xED27f8fbB7D576f02D516d01593eEfBaAfe4b168) |
| VaultFactory | [`0x580e55fDE87fFC1cF1B6a446d6DBf8068EB07b8C`](https://sepolia.etherscan.io/address/0x580e55fDE87fFC1cF1B6a446d6DBf8068EB07b8C) |
| KernelExecutionVerifier | [`0x1eB41537037fB771CBA8Cd088C7c806936325eB5`](https://sepolia.etherscan.io/address/0x1eB41537037fB771CBA8Cd088C7c806936325eB5) |
| RISC Zero Verifier Router | [`0x925d8331ddc0a1F0d96E68CF073DFE1d92b69187`](https://sepolia.etherscan.io/address/0x925d8331ddc0a1F0d96E68CF073DFE1d92b69187) |

## Architecture

```mermaid
graph TD
    Author[Agent Author] -->|register| Registry[AgentRegistry]
    Registry -->|stores| AgentInfo[AgentInfo: author, imageId, codeHash, metadataURI]
    User[Vault Deployer] -->|deployVault| Factory[VaultFactory]
    Factory -->|reads imageId| Registry
    Factory -->|deploys with pinned imageId| Vault[KernelVault]
    Vault -->|verifyAndParseWithImageId| Verifier[KernelExecutionVerifier]
    Verifier -->|verify| RiscZero[RISC Zero Verifier]
```

## Deterministic Agent ID

Agent IDs are computed deterministically from the author's address and a salt:

```solidity
agentId = keccak256(abi.encodePacked(author, salt))
```

This ensures:
- **Author-bound**: Only the original author can update agent configuration
- **Collision-free**: Different authors with same salt produce different IDs
- **Predictable**: Agent ID can be computed before registration

## ImageId Pinning

A critical security property: **imageId is pinned at vault deployment time**.

```
At Deployment:
  VaultFactory.deployVault(agentId, asset, salt)
  → reads AgentRegistry.get(agentId).imageId
  → deploys KernelVault with trustedImageId = imageId (immutable)

At Execution:
  Vault.execute(journal, seal, agentOutput)
  → calls verifier.verifyAndParseWithImageId(trustedImageId, ...)
  → RISC Zero verifies proof against pinned imageId
```

### Why Pinning Matters

If the vault looked up `imageId` from the registry at execution time, a malicious author could:
1. Register a legitimate agent
2. Wait for users to deposit funds
3. Update the registry to point to a malicious agent
4. Execute the malicious agent and drain funds

By pinning `imageId` at deployment, vaults are **immutable** to registry changes. Users know exactly what agent code will be executed.

## Upgrade Policy

Since `trustedImageId` is immutable, upgrading an agent requires:

1. Author updates registry with new imageId
2. Users deploy NEW vaults via VaultFactory
3. Users migrate funds from old vault to new vault

Existing vaults continue operating with their pinned imageId indefinitely.

## Contract Interfaces

### IAgentRegistry

```solidity
interface IAgentRegistry {
    struct AgentInfo {
        address author;
        bytes32 imageId;
        bytes32 agentCodeHash;
        string _deprecated; // formerly metadataURI — retained for storage layout
        bool exists;
    }

    function computeAgentId(address author, bytes32 salt) external pure returns (bytes32);
    function register(bytes32 salt, bytes32 imageId, bytes32 agentCodeHash) external returns (bytes32);
    function update(bytes32 agentId, bytes32 newImageId, bytes32 newAgentCodeHash) external;
    function get(bytes32 agentId) external view returns (AgentInfo memory);
    function agentExists(bytes32 agentId) external view returns (bool);

    // Agent deprecation
    function deprecate(bytes32 agentId) external;
    function undeprecate(bytes32 agentId) external;
    function setSuccessor(bytes32 agentId, bytes32 successorAgentId) external;
    function isDeprecated(bytes32 agentId) external view returns (bool);
    function getSuccessor(bytes32 agentId) external view returns (bytes32);
}
```

### IVaultFactory

```solidity
interface IVaultFactory {
    function computeVaultAddress(address owner, bytes32 agentId, address asset, bytes32 userSalt) external view returns (address, bytes32);
    function deployVault(bytes32 agentId, address asset, bytes32 userSalt) external returns (address);
    function registry() external view returns (address);
    function verifier() external view returns (address);
    function isDeployedVault(address vault) external view returns (bool);
}
```

### verifyAndParseWithImageId

```solidity
function verifyAndParseWithImageId(
    bytes32 expectedImageId,
    bytes calldata journal,
    bytes calldata seal
) external view returns (ParsedJournal memory);
```

Unlike `verifyAndParse`, this method does NOT look up imageId from internal mappings. The vault provides its pinned `trustedImageId`, enabling permissionless verification.

## Security Considerations

### Invariants Maintained

- **agentId binding**: Vault is bound to a specific agentId (unchanged)
- **Nonce replay protection**: Nonces must be strictly increasing (unchanged)
- **action_commitment binding**: Actions match committed hash (unchanged)
- **Atomic execution**: All-or-nothing action execution (unchanged)
- **NEW: imageId pinning**: Vault's imageId is immutable after deployment

### Trust Model

| Party | Trust Level | Actions |
|-------|-------------|---------|
| Agent Author | Untrusted | Can only update registry (not existing vaults) |
| Vault Deployer | Untrusted | Can only deploy vaults, not modify them |
| Registry | Trusted for initial imageId lookup | Immutable after vault deployment |
| Vault | Trusted with deposited funds | Executes only verified proofs |

### Registry Update Attack Prevention

```mermaid
sequenceDiagram
    participant Author
    participant Registry
    participant Vault
    participant User

    Author->>Registry: register(agentId, imageId_v1)
    User->>Vault: deployVault() [pins imageId_v1]
    User->>Vault: deposit funds

    Note over Author: Malicious update attempt
    Author->>Registry: update(agentId, imageId_malicious)

    Note over Vault: Vault still uses imageId_v1
    User->>Vault: execute() [verifies against imageId_v1]
    Vault-->>User: Protected! Malicious proof rejected
```

## Usage Examples

### Registering an Agent

```solidity
// Deploy your agent and get the imageId from RISC Zero build
bytes32 imageId = 0x1234...;
bytes32 agentCodeHash = 0xabcd...;

// Register with any unique salt
bytes32 salt = keccak256("my-agent-v1");
bytes32 agentId = registry.register(salt, imageId, agentCodeHash, "ipfs://QmMetadata");
```

### Deploying a Vault

```solidity
// Compute address first (optional, for pre-funding)
(address vaultAddr, ) = factory.computeVaultAddress(
    msg.sender,
    agentId,
    address(usdc),
    bytes32(0) // user salt
);

// Deploy vault
address vault = factory.deployVault(agentId, address(usdc), bytes32(0));

// Deposit and use
KernelVault(payable(vault)).depositERC20Tokens(1000e6);
```

### Upgrading to New Agent Version

```solidity
// Author releases new version
bytes32 newImageId = 0x5678...;
registry.update(agentId, newImageId, newCodeHash, "ipfs://QmNewMetadata");

// Users deploy new vaults with updated imageId
address newVault = factory.deployVault(agentId, address(usdc), bytes32(uint256(1)));

// Migrate funds from old vault
oldVault.withdraw(oldVault.shares(msg.sender));
newVault.depositERC20Tokens(amount);
```

## Agent Deprecation

Authors can deprecate agents to signal that a newer version is available. This provides a clean upgrade path without breaking existing vaults.

### Deprecation Functions

```solidity
// Mark an agent as deprecated (author only)
registry.deprecate(agentId);

// Set a successor agent for migration guidance
registry.setSuccessor(agentId, newAgentId);

// Remove deprecation if needed
registry.undeprecate(agentId);

// Query deprecation status
bool deprecated = registry.isDeprecated(agentId);
bytes32 successor = registry.getSuccessor(agentId);
```

### Deprecation Flow

```mermaid
sequenceDiagram
    participant Author
    participant Registry
    participant Frontend

    Author->>Registry: register(salt, imageId_v2, codeHash_v2)
    Note over Author: New agent version deployed

    Author->>Registry: deprecate(agentId_v1)
    Author->>Registry: setSuccessor(agentId_v1, agentId_v2)

    Note over Frontend: Shows deprecation banner on v1 vaults
    Frontend->>Registry: isDeprecated(agentId_v1) → true
    Frontend->>Registry: getSuccessor(agentId_v1) → agentId_v2
```

### Important Notes

- Deprecation does **not** affect existing vault operation — vaults continue executing with their pinned imageId
- Deprecation is purely informational, helping depositors and the frontend show migration guidance
- Only the original agent author can deprecate/undeprecate
- Setting a successor requires the successor agent to exist in the registry
- Undeprecation clears the successor mapping

## Agent Metadata

Agents can store metadata on-chain via a URI pointing to JSON:

```solidity
function setMetadataURI(bytes32 agentId, string calldata uri) external;
function getMetadataURI(bytes32 agentId) external view returns (string memory);
```

Only the agent author can set metadata. The URI can point to IPFS, HTTPS, or Arweave.

**Metadata JSON schema:**

```json
{
  "name": "ETH-BTC Momentum",
  "description": "Mean-reversion strategy on ETH/BTC ratio using 4h TWAP",
  "tags": ["perpetuals", "hyperliquid", "momentum"],
  "sourceRepo": "https://github.com/alice/eth-btc-momentum",
  "version": "1.2.0"
}
```

You can also manage metadata directly from the CLI:

```bash
# Set metadata for your agent
tal metadata set <agent-id> --name "ETH-BTC Momentum" --description "Mean-reversion strategy" --tags perpetuals,hyperliquid

# View metadata for any agent
tal metadata show <agent-id>
```

Setting metadata enables:
- **Frontend discovery** — vault cards show agent names instead of hex IDs
- **Marketplace** — agents with metadata appear in the public marketplace at [`/marketplace`](https://tokagent.network/marketplace)
- **Leaderboard** — agent performance rankings at [`/leaderboard`](https://tokagent.network/leaderboard)
- **Deploy UI** — one-click vault deployment at [`/deploy`](https://tokagent.network/deploy)
- **Referrals** — earn referral rewards by sharing agent links at [`/referrals`](https://tokagent.network/referrals)
- **Forking** — `tal fork <agent-id>` clones the source repo and scaffolds a new project
- **Ecosystem indexing** — third-party dashboards and aggregators can discover agents

## Comparison: Before and After

| Aspect | Before (Owner-controlled) | After (Permissionless) |
|--------|---------------------------|------------------------|
| Agent Registration | Owner only | Anyone |
| Vault Deployment | Manual | Factory + CREATE2 |
| ImageId Source | Registry lookup at execute | Pinned at deployment |
| Upgrade Path | Owner updates registry | Deploy new vault, migrate funds |
| Trust Requirement | Trust owner | Trust only your vault's pinned imageId |
