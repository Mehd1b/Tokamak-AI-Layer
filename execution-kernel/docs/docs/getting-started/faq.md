---
title: FAQ
sidebar_position: 4
---

# Frequently Asked Questions

## General

### What is the Execution Kernel?

The Execution Kernel is a consensus-critical, deterministic agent execution framework for RISC Zero zkVM. It enables verifiable DeFi ML agents that make capital allocation decisions with cryptographic proof of correct execution.

### What makes an agent "verifiable"?

An agent is verifiable because:
1. It runs inside a zkVM that produces cryptographic proofs
2. The proof commits to the exact inputs and outputs
3. Anyone can verify the proof on-chain without re-executing the logic

### Why use zero-knowledge proofs?

Zero-knowledge proofs allow:
- **Trust minimization**: Vaults don't need to trust agents
- **Scalability**: Complex logic executes off-chain, only verification on-chain
- **Privacy**: Agent strategies can remain private while proving correct execution

## Development

### What language do I write agents in?

Agents are written in Rust. The SDK provides a `no_std` environment compatible with the zkVM.

### Can I use external crates?

Yes, but with restrictions:
- Must be `no_std` compatible
- Must not use floating-point, randomness, or time
- Must not use unordered collections (HashMap, HashSet)
- Should not have unbounded memory usage

### How do I test my agent?

Testing happens at multiple levels:

1. **Unit tests**: Test `agent_main` directly in native Rust
2. **Integration tests**: Run through the kernel without zkVM
3. **E2E tests**: Generate actual proofs

```bash
# Unit tests
cargo test -p my-agent

# Integration tests
cargo test -p kernel-host-tests

# E2E proof tests
cargo test -p e2e-tests --features risc0-e2e
```

### How long does proof generation take?

Proof generation time depends on:
- Execution complexity
- Number of constraints
- Hardware capabilities

Typical times:
- Simple agent: 30 seconds - 2 minutes
- Complex agent: 2-10 minutes

### What happens if my agent panics?

If `agent_main` panics:
- The zkVM execution aborts
- No valid proof is produced
- This is a "hard failure"

Best practice: Return empty output instead of panicking.

## Security

### Can an agent steal funds?

No. Agents produce instructions; they don't have custody. The vault executes actions, and constraint checking prevents obviously malicious behavior.

### What if I submit a bad agent?

Bad agents result in:
- Constraint violations → Failure status in journal, no actions executed
- Hard failures → No proof generated, nothing submitted

### How is the imageId verified?

The imageId is:
1. Computed from the compiled zkVM guest binary
2. Registered on-chain with the verifier contract
3. Checked during proof verification

### Can I update my agent?

Yes. Updates require:
1. Modify agent code
2. Rebuild with new imageId
3. Register new imageId on-chain
4. Old version can be deprecated

## On-Chain

### What networks are supported?

Currently deployed on Sepolia testnet. Mainnet deployment is planned.

### How much gas does verification cost?

Typical gas costs:
- Groth16 verification: ~300,000 gas (fixed)
- Journal parsing: ~20,000 gas
- Action execution: Variable (depends on actions)

### What if on-chain state changes after proof generation?

The proof is valid, but actions might fail if:
- Vault has insufficient balance
- Target contracts reject calls
- Nonce becomes stale

Design agents to handle this with slippage tolerances or validity windows.

### How do I register my agent's imageId?

```bash
# Using cast
cast send $VERIFIER_ADDRESS "registerAgent(bytes32,bytes32)" \
    $AGENT_ID $IMAGE_ID \
    --private-key $PRIVATE_KEY --rpc-url $RPC_URL
```

## Constraints

### What constraints can I configure?

- `max_position_notional`: Maximum position size
- `max_leverage_bps`: Maximum leverage (basis points)
- `max_drawdown_bps`: Maximum portfolio drawdown
- `cooldown_seconds`: Minimum time between executions
- `max_actions_per_output`: Maximum actions per execution
- `allowed_asset_id`: Asset whitelist

### What happens when constraints are violated?

1. `execution_status` is set to `Failure`
2. `action_commitment` is set to empty output hash
3. A valid proof is still produced
4. On-chain verifier sees Failure status
5. No actions are executed

### Can I bypass constraints?

No. Constraint checking is hardcoded in the kernel and runs unconditionally.

## Performance

### How can I make proof generation faster?

- Use simpler agent logic
- Minimize memory allocations
- Avoid deep recursion
- Use bounded loops with known iteration counts

### What are the size limits?

| Limit | Value |
|-------|-------|
| Max input size | 64,000 bytes |
| Max actions per output | 64 |
| Max payload per action | 16,384 bytes |

### Can I batch multiple agent executions?

Each proof covers one agent execution. For multiple operations, either:
- Produce multiple actions in one execution
- Generate multiple proofs and submit separately

## Troubleshooting

### My build fails with "risc0 not found"

Install the RISC Zero toolchain:

```bash
cargo install cargo-risczero
cargo risczero install
```

### My imageId keeps changing

Ensure reproducible builds:

```bash
RISC0_USE_DOCKER=1 cargo build --release --features risc0
```

### Proof verification fails on-chain

Check:
1. imageId is correctly registered
2. Journal is correctly formatted (209 bytes)
3. Seal is complete (260 bytes with selector)

### My agent produces empty output

Common causes:
- Invalid input size (check expected format)
- Parsing error (add logging)
- Version mismatch (check protocol/kernel versions)

## Getting Help

- [GitHub Issues](https://github.com/tokamak-network/Tokamak-AI-Layer/issues)
- [Architecture Overview](/architecture/overview)
- [SDK Documentation](/sdk/overview)
