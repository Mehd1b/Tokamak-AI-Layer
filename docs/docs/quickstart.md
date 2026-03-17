---
title: Quickstart
sidebar_position: 2
---

# Build an Agent in 5 Minutes

This guide takes you from zero to a working, tested agent using the `tal` CLI.

## Prerequisites

- Rust toolchain (`rustup`) — only needed if installing via `cargo install`

## Step 1: Install the CLI

Install from prebuilt binaries (fastest — no Rust required):

```bash
curl -sSL https://raw.githubusercontent.com/tokamak-network/Tokamak-AI-Layer/master/install-tal.sh | sh
```

Or from [crates.io](https://crates.io/crates/tal-cli):

```bash
cargo install tal-cli
```

:::tip No repo clone needed
`tal` can be installed and used without cloning the repository. You only need the repo if you want to build from source or contribute.
:::

## Step 2: Validate your environment

```bash
tal doctor
```

If anything is missing, run `tal doctor --install` to auto-install toolchains.

## Step 3: Scaffold a new agent

```bash
tal init my-agent --template yield
```

This creates a ready-to-build project:

```
crates/agents/my-agent/
├── agent/               # Agent logic + kernel binding
│   ├── Cargo.toml
│   ├── build.rs         # AGENT_CODE_HASH computation
│   └── src/lib.rs       # agent_main() + agent_entrypoint! macro
├── risc0-methods/       # zkVM guest compilation
├── .env.example         # Testnet defaults
└── dist/
    └── agent-pack.json  # Agent manifest
```

## Step 4: Edit your agent

Open `crates/agents/my-agent/agent/src/lib.rs` and implement your logic:

```rust
use kernel_sdk::prelude::*;
use kernel_sdk::actions::erc20;

kernel_sdk::agent_input! {
    struct MyInput {
        token: [u8; 20],
        recipient: [u8; 20],
        amount: u64,
    }
}

pub extern "Rust" fn agent_main(_ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput {
    let input = match MyInput::decode(opaque_inputs) {
        Some(i) => i,
        None => return AgentOutput { actions: Vec::new() },
    };

    let action = erc20::transfer(&input.token, &input.recipient, input.amount);

    let mut actions = Vec::with_capacity(1);
    actions.push(action);
    AgentOutput { actions }
}

const _: AgentEntrypoint = agent_main;
kernel_sdk::agent_entrypoint!(agent_main);
```

## Step 5: Test

```bash
tal test --local
```

## Step 6: Build

```bash
tal build
```

## Step 7: Deploy to testnet

```bash
# Build the zkVM ELF binary
tal build --elf

# Deploy agent + vault
tal deploy --testnet

# Monitor your vault
tal monitor --vault <VAULT_ADDRESS> --chain 998
```

## What's next?

- [Writing an Agent](/sdk/writing-an-agent) — Full development guide
- [`agent_input!` Macro](/sdk/agent-input-macro) — Declarative input parsing
- [CallBuilder & ERC20 Helpers](/sdk/call-builder) — Fluent action construction
- [Testing](/sdk/testing) — `TestHarness`, `ContextBuilder`, and snapshot testing
- [Deployment Guide](/sdk/deploy-guide) — Full `tal deploy` reference
- [Monitoring](/sdk/monitoring) — Live dashboard for deployed agents
- [`tal` CLI Reference](/sdk/cli-reference) — All subcommands and flags
