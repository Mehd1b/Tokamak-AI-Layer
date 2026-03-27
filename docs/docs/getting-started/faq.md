---
title: FAQ
sidebar_position: 5
---

# Frequently Asked Questions

### What is Tokagent?

Tokagent is a framework for building verifiable DeFi agents. Your agent runs inside a zero-knowledge virtual machine (zkVM) that produces a cryptographic proof of correct execution. Vaults on-chain verify the proof before executing any actions, so depositors never have to trust the agent operator.

### What language do I write agents in?

Rust. The SDK provides a `no_std` environment compatible with the zkVM. You use the `agent_input!` macro for input parsing and `CallBuilder` for constructing on-chain actions.

### Do I need to understand zero-knowledge proofs?

No. The `tal` CLI handles proof generation, and the SDK handles all the cryptographic plumbing. You write standard Rust logic; the framework makes it provable.

### Can I use external Rust crates?

Yes, with restrictions. Crates must be `no_std` compatible and must not use floating-point math, randomness, system time, or unordered collections (`HashMap`, `HashSet`). These restrictions ensure your agent is fully deterministic inside the zkVM.

### How do I create a new agent?

```bash
tal init my-agent --template yield
```

Available templates: `yield`, `perp-trader`, `minimal`. See the [Quickstart](/quickstart) for the full walkthrough.

### How do I test my agent?

```bash
# Unit tests (instant, no proof generation)
tal test --local

# Simulate with fixture data
tal sim fixtures/sample.json

# Full proof tests (slow, only needed before deployment)
tal test --proof
```

See [Testing](/sdk/testing) for the full API.

### How long does proof generation take?

- Simple agents: 30 seconds to 2 minutes
- Complex agents: 2 to 10 minutes

For development, use `tal test --local` and `tal sim` which run instantly. Only generate proofs when you are ready to deploy.

### Can an agent steal funds from a vault?

No. Agents produce instructions (actions), not transactions. The vault executes the actions, and the Execution Kernel enforces safety constraints (position limits, leverage bounds, cooldown periods) inside the proof. These constraints cannot be bypassed.

### Can I update a deployed agent?

Yes, but it requires deploying a new vault. The vault's `IMAGE_ID` is set at creation and cannot be changed -- this is a security feature so depositors always know which code is running. To update:

```bash
# Modify your agent code, then:
tal build --elf
tal deploy --testnet
```

`tal deploy` detects the changed `IMAGE_ID` and deploys a new vault automatically.

### What networks are supported?

Tokagent contracts are deployed on Ethereum mainnet, Arbitrum One, Optimism, HyperEVM mainnet, HyperEVM testnet, and Ethereum Sepolia. See the [contract addresses table](/) for full details.

## Still stuck?

Open an issue on [GitHub](https://github.com/tokamak-network/Tokamak-AI-Layer/issues).
