---
title: Validation Registry
sidebar_position: 3
---

# Validation Registry

The **TALValidationRegistry** is the multi-model validation engine of the Tokamak AI Layer. It implements ERC-8004 compliant task validation with four trust tiers, DRB-based validator selection, TEE attestation verification, bounty distribution, and a dispute mechanism.

## Overview

When an AI agent executes a task, how do you know the output is correct? The Validation Registry answers this by providing multiple validation models ranging from lightweight reputation checks to hardware-attested execution verification. Validators are selected fairly using decentralized randomness (Commit-Reveal2), and economic incentives are aligned through bounty distribution.

### Validation Models

| Model | Enum Value | Bounty Required | Security Level | Use Case |
|-------|-----------|-----------------|----------------|----------|
| **ReputationOnly** | `0` | None | Basic | Low-stakes tasks, community feedback |
| **StakeSecured** | `1` | 10 TON minimum | Medium | Financial operations, data processing |
| **TEEAttested** | `2` | 1 TON minimum | High | Sensitive computations, privacy-critical tasks |
| **Hybrid** | `3` | max(10, 1) TON | Maximum | Critical infrastructure, high-value operations |

:::tip Where in the code?
**Contract**: [`contracts/src/core/TALValidationRegistry.sol`](https://github.com/tokamak-network/Tokamak-AI-Layer/blob/master/contracts/src/core/TALValidationRegistry.sol) (1052 lines)
**Interface**: [`contracts/src/interfaces/ITALValidationRegistry.sol`](https://github.com/tokamak-network/Tokamak-AI-Layer/blob/master/contracts/src/interfaces/ITALValidationRegistry.sol)
**SDK Client**: `sdk/src/validation/ValidationClient.ts`
:::

## Validation Lifecycle

```mermaid
sequenceDiagram
    participant R as Requester
    participant VR as ValidationRegistry
    participant DRB as DRBIntegrationModule
    participant V as Validator
    participant T as Treasury

    R->>VR: requestValidation{value: bounty}(agentId, taskHash, outputHash, model, deadline)
    VR->>VR: Validate agent, bounty, deadline
    VR-->>R: requestHash

    Note over VR,DRB: StakeSecured / Hybrid models only
    VR->>DRB: selectValidator(requestHash, candidates)
    DRB->>DRB: Commit-Reveal2 randomness
    DRB-->>VR: selectedValidator

    V->>VR: submitValidation(requestHash, score, proof, detailsURI)
    VR->>VR: Verify model-specific requirements
    VR->>VR: Store response, mark Completed

    Note over VR,T: Bounty Distribution
    VR->>T: 10% protocol fee
    VR->>R: 9% agent reward (to agent owner)
    VR->>V: 81% validator reward
    VR-->>V: emit ValidationCompleted
```

## Bounty Distribution

When a validation is completed with a bounty, funds are distributed as follows:

```mermaid
pie title Bounty Distribution (100 TON example)
    "Validator (81 TON)" : 81
    "Protocol Treasury (10 TON)" : 10
    "Agent Owner (9 TON)" : 9
```

The exact calculation:

1. **Protocol fee**: `bounty * protocolFeeBps / 10000` = 10% to treasury
2. **Remaining**: `bounty - protocolFee` = 90 TON
3. **Agent reward**: `remaining * AGENT_REWARD_BPS / 10000` = 10% of remaining = 9 TON
4. **Validator reward**: `remaining - agentReward` = 81 TON

## Function Reference

### Core Validation

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `requestValidation` | `uint256 agentId, bytes32 taskHash, bytes32 outputHash, ValidationModel model, uint256 deadline` | `bytes32 requestHash` | Create a validation request. Send ETH/TON as `msg.value` for bounty. Payable. |
| `submitValidation` | `bytes32 requestHash, uint8 score, bytes proof, string detailsURI` | -- | Submit validation result. Score must be 0-100. Model-specific checks apply. |
| `getValidation` | `bytes32 requestHash` | `(ValidationRequest, ValidationResponse)` | Retrieve request and response data. |
| `getAgentValidations` | `uint256 agentId` | `bytes32[]` | All validation request hashes for an agent. |

### Validator Selection

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `selectValidator` | `bytes32 requestHash, address[] candidates` | `address` | Select a validator via DRB randomness. Restricted to `DRB_ROLE`. |
| `getSelectedValidator` | `bytes32 requestHash` | `address` | Get the validator selected for a request. Returns `address(0)` if none. |
| `finalizeValidatorSelection` | `bytes32 requestHash, address[] candidates, uint256[] stakes` | -- | Finalize DRB-based selection after Commit-Reveal2 callback delivers randomness. |

### TEE Attestation Management

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `setTrustedTEEProvider` | `address provider` | -- | Whitelist a TEE attestation provider. `TEE_MANAGER_ROLE` only. |
| `removeTrustedTEEProvider` | `address provider` | -- | Remove a provider from the whitelist. `TEE_MANAGER_ROLE` only. |
| `isTrustedTEEProvider` | `address provider` | `bool` | Check if a provider is trusted. |
| `getTrustedTEEProviders` | -- | `address[]` | List all trusted TEE providers. |
| `setTEEEnclaveHash` | `address provider, bytes32 enclaveHash` | -- | Set expected enclave hash for a provider. `TEE_MANAGER_ROLE` only. |

### Dispute Handling

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `disputeValidation` | `bytes32 requestHash, bytes evidence` | -- | Dispute a completed validation. Authorized for requester, agent owner, or registered validators. |
| `resolveDispute` | `bytes32 requestHash, bool upholdOriginal` | -- | Resolve a dispute. `DISPUTE_RESOLVER_ROLE` only. If overturned, validator is slashed and bounty refunded. |
| `isDisputed` | `bytes32 requestHash` | `bool` | Check if a validation is under dispute. |

### Query Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getValidationsByRequester` | `address requester` | `bytes32[]` | All validation requests initiated by an address. |
| `getValidationsByValidator` | `address validator` | `bytes32[]` | All validations handled by a validator. |
| `getPendingValidationCount` | `uint256 agentId` | `uint256` | Number of pending validations for an agent. |
| `getTreasury` | -- | `address` | Current treasury address. |

### Admin Functions

| Function | Parameters | Access | Description |
|----------|-----------|--------|-------------|
| `pause` / `unpause` | -- | `PAUSER_ROLE` | Emergency pause/unpause. |
| `setTreasury` | `address` | `DEFAULT_ADMIN_ROLE` | Update treasury address. |
| `setIdentityRegistry` | `address` | `DEFAULT_ADMIN_ROLE` | Update identity registry reference. |
| `setReputationRegistry` | `address` | `DEFAULT_ADMIN_ROLE` | Update reputation registry reference. |
| `setStakingBridge` | `address` | `DEFAULT_ADMIN_ROLE` | Update staking bridge reference. |
| `setDRBContract` | `address` | `DEFAULT_ADMIN_ROLE` | Update DRB contract address. |
| `setDRBModule` | `address` | `DEFAULT_ADMIN_ROLE` | Update DRB integration module address. |
| `updateValidationParameters` | `uint256 minStakeSecuredBounty, uint256 minTEEBounty, uint256 protocolFeeBps` | `DEFAULT_ADMIN_ROLE` | Update economic parameters. |

## Events

| Event | Parameters | Description |
|-------|-----------|-------------|
| `ValidationRequested` | `bytes32 indexed requestHash, uint256 indexed agentId, ValidationModel model` | New validation request created. |
| `ValidationCompleted` | `bytes32 indexed requestHash, address indexed validator, uint8 score` | Validation result submitted. |
| `ValidationDisputed` | `bytes32 indexed requestHash, address indexed disputer` | Dispute initiated. |
| `ValidatorSelected` | `bytes32 indexed requestHash, address indexed validator, uint256 randomSeed` | Validator selected via DRB. |
| `BountyDistributed` | `bytes32 indexed requestHash, address indexed validator, uint256 validatorAmount, uint256 agentAmount, uint256 treasuryAmount` | Bounty split distributed. |
| `TEEProviderUpdated` | `address indexed provider, bool trusted` | TEE provider whitelist changed. |
| `ValidationParametersUpdated` | `uint256 minStakeSecuredBounty, uint256 minTEEBounty, uint256 protocolFeeBps` | Economic parameters updated. |

## Access Control Roles

| Role | Purpose |
|------|---------|
| `DEFAULT_ADMIN_ROLE` | Full admin access: manage roles, update references, change parameters |
| `UPGRADER_ROLE` | Authorize UUPS proxy upgrades |
| `PAUSER_ROLE` | Pause and unpause the contract |
| `TEE_MANAGER_ROLE` | Manage trusted TEE providers and enclave hashes |
| `DISPUTE_RESOLVER_ROLE` | Resolve validation disputes |
| `DRB_ROLE` | Execute validator selection via DRB |

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MIN_STAKE_SECURED_BOUNTY` | `10 ether` (10 TON) | Default minimum bounty for StakeSecured |
| `MIN_TEE_BOUNTY` | `1 ether` (1 TON) | Default minimum bounty for TEEAttested |
| `PROTOCOL_FEE_BPS` | `1000` (10%) | Protocol fee taken from bounty |
| `AGENT_REWARD_BPS` | `1000` (10%) | Agent's share of remaining bounty |
| `VALIDATOR_REWARD_BPS` | `8000` (80%) | Validator's share of remaining bounty |
| `MAX_SCORE` | `100` | Maximum validation score |
| `BPS_DENOMINATOR` | `10000` | Basis points denominator |

## TEE Attestation Verification

For `TEEAttested` and `Hybrid` models, the proof must contain a valid TEE attestation:

```solidity
// Attestation proof structure (ABI-encoded):
(
    bytes32 enclaveHash,    // Must match registered hash for provider
    address teeSigner,      // Must be a trusted TEE provider
    uint256 timestamp,      // Must be within 1 hour of current time
    bytes signature         // 65-byte ECDSA signature over (enclaveHash, taskHash, outputHash, requestHash, timestamp)
)
```

The verification checks:
1. TEE provider is whitelisted
2. Enclave hash matches the registered hash for the provider
3. Attestation is fresh (within 1 hour)
4. Signature recovers to the TEE provider address

## Code Example: Requesting a Validation

```solidity
// Request a ReputationOnly validation (no bounty needed)
bytes32 requestHash = validationRegistry.requestValidation(
    agentId,
    keccak256(abi.encodePacked(taskInput)),
    keccak256(abi.encodePacked(taskOutput)),
    IERC8004ValidationRegistry.ValidationModel.ReputationOnly,
    block.timestamp + 1 days
);

// Request a StakeSecured validation with 10 TON bounty
bytes32 requestHash = validationRegistry.requestValidation{value: 10 ether}(
    agentId,
    taskHash,
    outputHash,
    IERC8004ValidationRegistry.ValidationModel.StakeSecured,
    block.timestamp + 1 days
);

// Submit a validation result
validationRegistry.submitValidation(
    requestHash,
    85,                         // score out of 100
    hex"",                      // proof (empty for ReputationOnly)
    "ipfs://QmValidationReport" // detailed report URI
);
```

:::danger Dispute Resolution
When a dispute is resolved against the original validation (`upholdOriginal = false`), the validator faces cross-layer slashing via the staking bridge. The bounty is refunded to the requester. This mechanism deters malicious or negligent validation.
:::

## Related Pages

- [Identity Registry](./identity-registry) -- agent existence is validated before accepting requests
- [Reputation Registry](./reputation-registry) -- validation results can trigger reputation updates
- [Task Fee Escrow](./task-fee-escrow) -- payment layer for task execution
- [Deployment & Security](./deployment-and-security) -- proxy patterns, roles, and deployed addresses
