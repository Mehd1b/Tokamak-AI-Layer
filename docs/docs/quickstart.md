---
title: Quickstart
sidebar_position: 2
---

# Build an Agent in 5 Minutes

This guide takes you from zero to a working, tested agent using the `cargo agent` CLI.

## Prerequisites

- Rust toolchain (`rustup`)
- The Execution Kernel repository cloned locally

## Step 1: Install the CLI

```bash
cd execution-kernel
cargo install --path crates/tools/cargo-agent
```

## Step 2: Scaffold a new agent

```bash
cargo agent new my-agent
```

This creates a ready-to-build project:

```
crates/agents/my-agent/
├── agent/               # Agent logic + kernel binding
│   ├── Cargo.toml
│   ├── build.rs         # AGENT_CODE_HASH computation
│   └── src/lib.rs       # agent_main() + agent_entrypoint! macro
├── tests/               # Test harness
│   ├── Cargo.toml
│   └── src/lib.rs
└── dist/
    └── agent-pack.json  # Agent manifest
```

## Step 3: Edit your agent

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

## Step 4: Test

```bash
cargo agent test my-agent
```

## Step 5: Build

```bash
cargo agent build my-agent
```

## What's next?

- [Writing an Agent](/sdk/writing-an-agent) — Full development guide
- [`agent_input!` Macro](/sdk/agent-input-macro) — Declarative input parsing
- [CallBuilder & ERC20 Helpers](/sdk/call-builder) — Fluent action construction
- [Testing](/sdk/testing) — `TestHarness`, `ContextBuilder`, and snapshot testing
- [`cargo agent` CLI Reference](/sdk/cli-reference) — All subcommands and flags
