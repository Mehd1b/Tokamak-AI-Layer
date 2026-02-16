---
title: Prerequisites
sidebar_position: 1
---

# Prerequisites

Before building and running the Execution Kernel, you need to install several tools and dependencies.

## Required Tools

### Rust

Install Rust using rustup:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Verify installation:

```bash
rustc --version
cargo --version
```

**Minimum version**: Rust 1.75.0 or later

### RISC Zero Toolchain

The RISC Zero toolchain is required for zkVM proof generation.

```bash
# Install cargo-risczero
cargo install cargo-risczero

# Install the RISC Zero toolchain (includes riscv32im target)
cargo risczero install
```

Verify installation:

```bash
cargo risczero --version
```

### Foundry (for on-chain integration)

Foundry is required for smart contract interaction and testing.

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

Verify installation:

```bash
forge --version
cast --version
```

## Optional Tools

### Docker

Docker is required for reproducible builds. This ensures deterministic imageId computation.

```bash
# macOS
brew install --cask docker

# Linux
curl -fsSL https://get.docker.com | sh
```

### Just

The project uses [just](https://github.com/casey/just) as a command runner:

```bash
cargo install just
```

## Environment Setup

### Clone the Repository

```bash
git clone https://github.com/tokamak-network/Tokamak-AI-Layer.git
cd Tokamak-AI-Layer/execution-kernel
```

### Verify Setup

Run the test suite to verify your environment is configured correctly:

```bash
# Run all unit tests
cargo test

# Run with verbose output
cargo test -- --nocapture
```

## Hardware Requirements

### Development

- **CPU**: Any modern x86_64 or ARM64 processor
- **RAM**: 8GB minimum, 16GB recommended
- **Disk**: 10GB free space

### Proof Generation

zkVM proof generation is computationally intensive:

- **CPU**: Multi-core processor recommended (8+ cores ideal)
- **RAM**: 32GB+ recommended for complex agents
- **Disk**: SSD recommended for faster build times

:::tip
For development, you can run tests without proof generation using the default feature set. Only enable `risc0-e2e` features when you need actual proof generation.
:::

## Network Configuration

### Sepolia Testnet

For on-chain testing, you'll need:

1. **Sepolia ETH**: Get testnet ETH from a faucet
2. **RPC URL**: An Ethereum Sepolia RPC endpoint (Alchemy, Infura, etc.)
3. **Private Key**: A wallet private key for signing transactions

Set environment variables:

```bash
export RPC_URL="https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY"
export PRIVATE_KEY="0x..."
```

### Contract Addresses

The following contracts are deployed on Sepolia:

| Contract | Address |
|----------|---------|
| AgentRegistry | `0xBa1DA5f7e12F2c8614696D019A2eb48918E1f2AA` |
| VaultFactory | `0x3bB48a146bBC50F8990c86787a41185A6fC474d2` |
| KernelExecutionVerifier | `0x9Ef5bAB590AFdE8036D57b89ccD2947D4E3b1EFA` |
| RISC Zero Verifier Router | `0x925d8331ddc0a1F0d96E68CF073DFE1d92b69187` |

## Next Steps

Once your environment is set up:

1. [Build the project locally](/getting-started/local-build)
2. [Run the example yield agent](/getting-started/run-an-example)
3. [Start writing your own agent](/sdk/writing-an-agent)
