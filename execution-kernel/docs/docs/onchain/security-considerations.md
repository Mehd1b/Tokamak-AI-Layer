---
title: Security Considerations
sidebar_position: 3
---

# Security Considerations

This document outlines the security model, trust assumptions, and potential risks when integrating with the Execution Kernel on-chain.

## Trust Model

### What the Proof Guarantees

A valid zkVM proof guarantees:

| Guarantee | Description |
|-----------|-------------|
| **Correct execution** | The kernel ran with the given inputs |
| **Agent binding** | The specific agent (by code hash) executed |
| **Constraint enforcement** | All constraints were checked |
| **Output authenticity** | The action commitment matches actual output |

### What the Proof Does NOT Guarantee

| Non-Guarantee | Description |
|---------------|-------------|
| **Input correctness** | Inputs may not reflect reality |
| **Economic safety** | Actions may lose money |
| **Target safety** | Called contracts may be malicious |
| **Timeliness** | Proof may be stale |

## On-Chain Trust Assumptions

### RISC Zero Verifier

The system trusts the RISC Zero Groth16 verifier:

```solidity
// We trust this contract to correctly verify proofs
IRiscZeroVerifier public immutable riscZeroVerifier;
```

**Risk**: If the RISC Zero verifier has bugs, invalid proofs could pass.

**Mitigation**: RISC Zero verifier is audited and battle-tested.

### ImageId Registration

The system trusts that imageIds are correctly registered:

```solidity
// Admin registers imageId for agent
function registerAgent(bytes32 agentId, bytes32 imageId) external onlyOwner;
```

**Risk**: If wrong imageId is registered, unauthorized code could produce valid proofs.

**Mitigation**: Careful verification of imageId before registration. Use reproducible builds.

### Journal Parsing

The system trusts journal parsing is correct:

```solidity
function parse(bytes calldata journal) internal pure returns (ParsedJournal memory);
```

**Risk**: Parsing bugs could misinterpret journal data.

**Mitigation**: Fixed-size journal (209 bytes), explicit offset parsing.

## Attack Vectors

### Replay Attacks

**Attack**: Resubmit a valid proof multiple times.

**Defense**: Monotonic nonce enforcement:

```solidity
require(
    parsed.executionNonce == lastExecutionNonce + 1,
    "Invalid nonce"
);
lastExecutionNonce = parsed.executionNonce;
```

### Stale Proofs

**Attack**: Submit a proof generated long ago when conditions were different.

**Defense**: Consider adding timestamp validation if time-sensitive:

```solidity
// In input_root or separate field
require(block.timestamp - proofTimestamp < MAX_PROOF_AGE, "Proof too old");
```

### Front-Running

**Attack**: Observer sees pending proof submission, frontruns with their own transaction.

**Defense**: Nonce prevents arbitrary frontrunning. State changes may still cause revert.

### Reentrancy

**Attack**: Malicious target contract calls back during action execution.

**Defense**: Update state before external calls:

```solidity
// Update nonce BEFORE executing actions
lastExecutionNonce = parsed.executionNonce;

// Then execute
for (uint i = 0; i < actions.length; i++) {
    _executeAction(actions[i]);
}
```

### Target Manipulation

**Attack**: Agent specifies malicious target address.

**Defense**: The constraint system does NOT validate targets (P0.3 limitation).

:::warning
Vaults must implement their own target validation. Never blindly execute calls to arbitrary addresses.
:::

```solidity
// Example: whitelist allowed targets
mapping(address => bool) public allowedTargets;

function _executeAction(Action memory action) internal {
    address target = _extractAddress(action.target);
    require(allowedTargets[target], "Target not allowed");
    // ...
}
```

### Signature Malleability

**Attack**: Modify proof without invalidating it.

**Defense**: Groth16 proofs are not malleable. Journal is fixed-format.

## Validation Checklist

### Before Executing Actions

- [ ] Journal length is exactly 209 bytes
- [ ] Protocol version matches expected
- [ ] Kernel version matches expected
- [ ] Agent ID matches authorized agent
- [ ] Nonce is exactly lastNonce + 1
- [ ] Execution status is Success (0x01)
- [ ] Proof verifies against registered imageId
- [ ] Action commitment matches sha256(agentOutput)
- [ ] Each action type is recognized
- [ ] Each target is authorized (application-specific)

### Before Registering an Agent

- [ ] ImageId verified via reproducible build
- [ ] Agent code reviewed/audited
- [ ] Agent Pack manifest verified
- [ ] Test execution on testnet successful

## Common Vulnerabilities

### Missing Nonce Check

```solidity
// VULNERABLE - no nonce check
function execute(bytes calldata journal, bytes calldata seal, ...) {
    // Missing: nonce validation
    // Allows replay attacks
}
```

### Missing Status Check

```solidity
// VULNERABLE - executes on failure
function execute(bytes calldata journal, ...) {
    ParsedJournal memory p = parse(journal);
    // Missing: require(p.executionStatus == SUCCESS)
    // Would execute empty actions on failure
}
```

### Missing Commitment Verification

```solidity
// VULNERABLE - trusts unverified output
function execute(bytes calldata journal, bytes calldata seal, bytes calldata output) {
    // Missing: require(sha256(output) == parsed.actionCommitment)
    // Attacker could submit different actions than proven
}
```

### Unchecked External Calls

```solidity
// VULNERABLE - ignores call result
function _executeCall(address target, uint256 value, bytes memory data) {
    target.call{value: value}(data);
    // Missing: success check
}
```

## Best Practices

### Use Access Control

```solidity
// Limit who can submit proofs
modifier onlyOperator() {
    require(operators[msg.sender], "Not operator");
    _;
}

function execute(...) external onlyOperator {
    // ...
}
```

### Implement Circuit Breakers

```solidity
// Emergency pause
bool public paused;

function execute(...) external {
    require(!paused, "Contract paused");
    // ...
}

function pause() external onlyOwner {
    paused = true;
}
```

### Limit Action Types

```solidity
// Only allow specific action types
function _executeAction(Action memory action) internal {
    require(
        action.actionType == ACTION_TYPE_CALL ||
        action.actionType == ACTION_TYPE_TRANSFER_ERC20,
        "Unsupported action type"
    );
    // ...
}
```

### Log Everything

```solidity
event ProofVerified(
    bytes32 indexed agentId,
    bytes32 inputCommitment,
    bytes32 actionCommitment,
    uint64 nonce
);

event ActionExecuted(
    uint256 indexed index,
    uint32 actionType,
    address target,
    bool success
);
```

## Related

- [Verifier Overview](/onchain/verifier-overview) - Contract details
- [Trust Model](/architecture/trust-model) - Full security model
- [Solidity Integration](/onchain/solidity-integration) - Implementation guide
