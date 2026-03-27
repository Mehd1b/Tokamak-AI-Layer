---
title: 5-Minute Quickstart
sidebar_position: 2
---

# 5-Minute Quickstart

**What you'll build:** A yield farming agent that deposits ETH into a yield source and withdraws the proceeds -- tested locally and deployed to testnet with a live vault.

## Prerequisites

- **Rust** -- Install with `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh` if you don't have it.
- **tal CLI** -- Install with `curl -sSL https://raw.githubusercontent.com/tokamak-network/Tokamak-AI-Layer/master/install-tal.sh | sh` (or `cargo install tal-cli`).

Run `tal doctor` to confirm everything is ready. If anything is missing, run `tal doctor --install` to fix it automatically.

## Step 1: Create your agent

```bash
tal init my-agent --template yield
```

This scaffolds a complete project with agent logic, test fixtures, and deployment configuration. No repository clone needed.

## Step 2: Test locally

```bash
tal test --local
```

This runs your agent's logic instantly (2-5 seconds) without any proof generation. It checks that inputs parse correctly and actions are constructed as expected.

## Step 3: Build

```bash
tal build --elf
```

This compiles your agent into a zkVM binary and produces an `IMAGE_ID` -- the unique fingerprint of your agent that gets registered on-chain. Expect 8-10 minutes on a first build.

:::tip Iterate faster with tal sim
During development, use `tal sim fixtures/sample.json` to test your logic in seconds without a full build. Only run `tal build --elf` when you are ready to deploy.
:::

## Step 4: Deploy to testnet

First, set up your environment:

```bash
cp .env.example .env
# Edit .env with your private key
```

Then deploy:

```bash
tal deploy --testnet
```

This registers your agent on-chain, deploys a vault, and prints the vault address. The whole pipeline is handled for you.

### Getting testnet tokens

To deploy on HyperEVM testnet (chain 998):

1. Get testnet HYPE from `https://app.hyperliquid-testnet.xyz/drip`
2. Bridge to HyperEVM: send HYPE to `0x2222222222222222222222222222222222222222`
3. Wait 10 seconds, then deploy

## Step 5: Verify it worked

```bash
tal monitor --vault <VAULT_ADDRESS> --chain 998
```

This opens a live dashboard showing your vault's status, recent executions, and proof history.

## What's next?

| Goal | Guide |
|------|-------|
| Understand the agent code you just deployed | [Writing an Agent](/sdk/writing-an-agent) |
| Learn input parsing with `agent_input!` | [`agent_input!` Macro](/sdk/agent-input-macro) |
| Build on-chain actions with `CallBuilder` | [CallBuilder & ERC20 Helpers](/sdk/call-builder) |
| Write thorough tests | [Testing](/sdk/testing) |
| See the full `tal deploy` reference | [Deployment Guide](/sdk/deploy-guide) |
| Build a real DeFi agent targeting AAVE | [DeFi Yield Farmer Tutorial](/getting-started/defi-yield-farmer) |
| Understand the system architecture | [Architecture Overview](/architecture/overview) |
