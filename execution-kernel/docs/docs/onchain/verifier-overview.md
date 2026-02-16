---
title: Verifier Overview
sidebar_position: 1
---

# On-Chain Verifier Overview

The `KernelExecutionVerifier` contract validates zkVM proofs on-chain. Combined with `AgentRegistry` and `VaultFactory`, it enables fully permissionless agent execution.

## Architecture

```mermaid
flowchart TD
    A[Agent Author] -->|register| B[AgentRegistry]
    B -->|stores imageId| C[AgentInfo]
    D[Author] -->|deployVault| E[VaultFactory]
    E -->|reads imageId| B
    E -->|deploys| F[KernelVault]
    F -->|pinned trustedImageId| F
    G[Submitter] -->|journal + seal| F
    F -->|verifyAndParseWithImageId| H[KernelExecutionVerifier]
    H -->|verify proof| I[RISC Zero Verifier]
    I -->|valid| H
    H -->|verified| F
    F -->|execute actions| J[Target Contracts]
```

## Deployed Contracts (Sepolia)

| Contract | Address |
|----------|---------|
| AgentRegistry | [`0xBa1DA5f7e12F2c8614696D019A2eb48918E1f2AA`](https://sepolia.etherscan.io/address/0xBa1DA5f7e12F2c8614696D019A2eb48918E1f2AA) |
| VaultFactory | [`0x3bB48a146bBC50F8990c86787a41185A6fC474d2`](https://sepolia.etherscan.io/address/0x3bB48a146bBC50F8990c86787a41185A6fC474d2) |
| KernelExecutionVerifier | [`0x9Ef5bAB590AFdE8036D57b89ccD2947D4E3b1EFA`](https://sepolia.etherscan.io/address/0x9Ef5bAB590AFdE8036D57b89ccD2947D4E3b1EFA) |
| RISC Zero Verifier Router | [`0x925d8331ddc0a1F0d96E68CF073DFE1d92b69187`](https://sepolia.etherscan.io/address/0x925d8331ddc0a1F0d96E68CF073DFE1d92b69187) |

## AgentRegistry

Permissionless registry for agent registration with deterministic IDs.

### Key Functions

#### register

```solidity
function register(
    bytes32 salt,
    bytes32 imageId,
    bytes32 agentCodeHash,
    string calldata metadataURI
) external returns (bytes32 agentId)
```

Registers a new agent. The `agentId` is computed deterministically:

```solidity
agentId = keccak256(abi.encodePacked(msg.sender, salt))
```

#### update

```solidity
function update(
    bytes32 agentId,
    bytes32 newImageId,
    bytes32 newAgentCodeHash,
    string calldata newMetadataURI
) external
```

Updates an agent's configuration. Only the original author can call this.

:::warning
Updating the registry does NOT affect existing vaults. Vaults pin their imageId at deployment time.
:::

## VaultFactory

CREATE2 factory for deploying vaults with pinned imageId.

### Key Functions

#### deployVault

```solidity
function deployVault(
    bytes32 agentId,
    address asset,
    bytes32 userSalt
) external returns (address vault)
```

Deploys a new vault with the imageId pinned from the registry at deployment time. Only the agent author can deploy vaults for their agent.

#### computeVaultAddress

```solidity
function computeVaultAddress(
    address owner,
    bytes32 agentId,
    address asset,
    bytes32 userSalt
) external view returns (address vault, bytes32 salt)
```

Computes the deterministic vault address before deployment.

## KernelExecutionVerifier

Stateless verifier that validates zkVM proofs with caller-provided imageId.

### Key Functions

#### verifyAndParseWithImageId

```solidity
function verifyAndParseWithImageId(
    bytes32 expectedImageId,
    bytes calldata journal,
    bytes calldata seal
) external view returns (ParsedJournal memory)
```

Verifies a proof and parses the journal:

1. Validates expectedImageId is not zero
2. Parses the 209-byte journal
3. Computes journal hash: `sha256(journal)`
4. Calls RISC Zero verifier with seal, imageId, and journal hash
5. Returns parsed journal if valid

### Verification Flow

```mermaid
sequenceDiagram
    participant V as Vault
    participant KEV as KernelExecutionVerifier
    participant R as RISC Zero Router

    V->>KEV: verifyAndParseWithImageId(trustedImageId, journal, seal)
    KEV->>KEV: parsed = parseJournal(journal)
    KEV->>KEV: journalHash = sha256(journal)
    KEV->>R: verify(seal, trustedImageId, journalHash)
    R->>R: Groth16 verification
    R->>KEV: (reverts if invalid)
    KEV->>V: parsed
```

## KernelVault

The vault holds capital and executes agent actions after verification.

### State Variables

```solidity
// Verifier contract reference
IKernelExecutionVerifier public immutable verifier;

// Pinned imageId (immutable after deployment)
bytes32 public immutable trustedImageId;

// Bound agent
bytes32 public immutable agentId;

// Replay protection
uint64 public lastExecutionNonce;
```

### execute Function

```solidity
function execute(
    bytes calldata journal,
    bytes calldata seal,
    bytes calldata agentOutput
) external
```

1. Calls `verifier.verifyAndParseWithImageId(trustedImageId, journal, seal)`
2. Validates execution status is Success
3. Validates nonce is greater than lastExecutionNonce (with gap limit)
4. Validates agentId matches bound agent
5. Verifies action commitment matches `sha256(agentOutput)`
6. Parses and executes actions atomically
7. Updates lastExecutionNonce

### Action Execution

```solidity
function _executeAction(Action memory action) internal {
    if (action.actionType == ACTION_TYPE_CALL) {
        _executeCall(action);
    } else if (action.actionType == ACTION_TYPE_TRANSFER_ERC20) {
        _executeTransferERC20(action);
    } else {
        revert UnknownActionType(action.actionType);
    }
}
```

## Complete Flow Example

### 1. Register Agent

```bash
# Get imageId from your RISC Zero build
export IMAGE_ID=0x1234...
export CODE_HASH=0xabcd...

# Register via cast
cast send $AGENT_REGISTRY \
    "register(bytes32,bytes32,bytes32,string)" \
    0x0000000000000000000000000000000000000000000000000000000000000001 \
    $IMAGE_ID $CODE_HASH "ipfs://QmMetadata" \
    --private-key $PRIVATE_KEY --rpc-url $RPC_URL
```

### 2. Deploy Vault

```bash
export AGENT_ID=<returned from register>

# Deploy vault for USDC
cast send $VAULT_FACTORY \
    "deployVault(bytes32,address,bytes32)" \
    $AGENT_ID $USDC_ADDRESS 0x0 \
    --private-key $PRIVATE_KEY --rpc-url $RPC_URL
```

### 3. Execute with Proof

```bash
# Submit proof to vault
cast send $VAULT_ADDRESS \
    "execute(bytes,bytes,bytes)" \
    $JOURNAL $SEAL $AGENT_OUTPUT \
    --private-key $PRIVATE_KEY --rpc-url $RPC_URL
```

## Gas Costs

Typical gas consumption:

| Operation | Gas |
|-----------|-----|
| Agent registration | ~130,000 |
| Vault deployment | ~1,700,000 |
| Groth16 verification | ~300,000 |
| Journal parsing | ~20,000 |
| Action execution | Variable |
| Total execute() | ~400,000 - 500,000 |

## Related

- [Permissionless System](/onchain/permissionless-system) - Detailed design and security model
- [Solidity Integration](/onchain/solidity-integration) - Integration details
- [Security Considerations](/onchain/security-considerations) - Trust assumptions
