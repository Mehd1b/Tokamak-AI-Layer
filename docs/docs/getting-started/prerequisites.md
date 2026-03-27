---
title: Prerequisites
sidebar_position: 1
---

# Prerequisites

**What you'll have:** A fully configured development environment, verified with a single command.

## Step 1: Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

Minimum version: Rust 1.75.0. Check with `rustc --version`.

## Step 2: Install the tal CLI

Pick one:

```bash
# Prebuilt binary (fastest -- no Rust compilation)
curl -sSL https://raw.githubusercontent.com/tokamak-network/Tokamak-AI-Layer/master/install-tal.sh | sh

# Or from crates.io
cargo install tal-cli
```

## Step 3: Install Foundry (optional)

Only needed if you want to interact with smart contracts directly (outside of `tal deploy`):

```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup
```

## Verify it worked

```bash
tal doctor
```

This checks Rust, RISC Zero, Foundry, and any other dependencies in one command. If anything is missing:

```bash
tal doctor --install
```

This auto-installs the missing toolchains, including the RISC Zero zkVM toolchain -- you do not need to install it manually.

## Hardware

- **For development and testing:** Any modern machine with 8GB+ RAM. Tests run instantly without proof generation.
- **For proof generation (deployment):** 8+ CPU cores and 32GB+ RAM recommended. Proof generation is CPU-intensive but only needed when you are ready to deploy.

## Network setup (for deployment)

### HyperEVM Testnet (Chain 998)

1. Get testnet HYPE from `https://app.hyperliquid-testnet.xyz/drip`
2. Bridge to HyperEVM: send HYPE to `0x2222222222222222222222222222222222222222`
3. Copy your `.env.example` to `.env` and add your private key

### Ethereum Sepolia

1. Get Sepolia ETH from any faucet
2. Set `RPC_URL` and `PRIVATE_KEY` in your `.env`

## Next steps

Head to the [5-Minute Quickstart](/quickstart) to build your first agent.
