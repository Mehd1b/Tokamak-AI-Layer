---
title: Writing an Agent
sidebar_position: 2
---

# Build Your First Agent

In this tutorial you will create a DeFi yield-farming agent, test it locally, build the zkVM binary, and deploy it to testnet.

**What you'll build:** An agent that reads market data, approves a token on a lending pool, and supplies tokens to earn yield -- all verified by a ZK proof.

## Prerequisites

- `tal` CLI installed ([install instructions](/sdk/cli-reference#installation))
- Run `tal doctor --install` to verify and install required toolchains

## Step 1: Scaffold the project

```bash
tal init my-agent --template yield
```

This generates a complete agent project with all the files you need:

```
my-agent/
  agent/
    Cargo.toml
    build.rs           # Computes AGENT_CODE_HASH
    src/lib.rs          # Your agent logic goes here
  risc0-methods/        # zkVM guest binary
  dist/
    agent-pack.json     # Agent manifest
```

## Step 2: Understand the code

Open `agent/src/lib.rs`. The core of every agent is a single function:

```rust
use kernel_sdk::prelude::*;

pub extern "Rust" fn agent_main(
    _ctx: &AgentContext,
    opaque_inputs: &[u8],
) -> AgentOutput {
    // Your logic here.
    // Return actions the kernel should execute on-chain.
    AgentOutput { actions: Vec::new() }
}

kernel_sdk::agent_entrypoint!(agent_main);
```

**How it works:**

1. The kernel calls `agent_main` with an `AgentContext` (your agent ID, nonce, etc.) and raw input bytes.
2. Your function parses the inputs, decides what to do, and returns an `AgentOutput` containing a list of on-chain actions.
3. The `agent_entrypoint!` macro wires everything together so the kernel can find your function.

The `yield` template generates a more complete example that parses market data and builds supply/approve actions using `CallBuilder` and `erc20` helpers. Read through it to see a real pattern.

:::tip Other templates
Besides `yield`, you can scaffold from `perp-trader` (Hyperliquid perpetuals with SMA/RSI strategies) or `polymarket-bot` (Polymarket prediction markets with probability threshold and spread capture). Each comes with a full host orchestrator, API client, and strategy logic. See [CLI Reference](/sdk/cli-reference) for details.
:::

### Parsing inputs

Use the `agent_input!` macro to declare your input format. The macro auto-generates `decode()` and `encode()` methods:

```rust
kernel_sdk::agent_input! {
    struct MarketInput {
        lending_pool: [u8; 20],
        asset_token: [u8; 20],
        vault_address: [u8; 20],
        vault_balance: u64,
        supply_rate_bps: u32,
        action_flag: u8,
    }
}

// In agent_main:
let market = match MarketInput::decode(opaque_inputs) {
    Some(m) => m,
    None => return AgentOutput { actions: Vec::new() },
};
```

Always return empty output on invalid input -- never panic. Panics abort proof generation.

### Constructing actions

Use `CallBuilder` for contract calls and the `erc20` helpers for token operations:

```rust
use kernel_sdk::actions::{CallBuilder, erc20};

// Approve the lending pool to spend tokens
let approve = erc20::approve(&market.asset_token, &market.lending_pool, amount);

// Call supply() on the lending pool
let supply = CallBuilder::new(market.lending_pool)
    .selector(0x617ba037) // supply(address,uint256,address,uint16)
    .param_address(&market.asset_token)
    .param_u256_from_u64(amount)
    .param_address(&market.vault_address)
    .param_u16(0)
    .build();

let mut actions = Vec::with_capacity(2);
actions.push(approve);
actions.push(supply);
AgentOutput { actions }
```

## Step 3: Test locally

```bash
tal test --local
```

This runs your agent's unit tests natively -- no zkVM needed. Results appear in seconds.

You can also simulate against a fixture file to test constraint enforcement:

```bash
tal sim fixtures/sample.json
```

## Step 4: Build the zkVM binary

```bash
tal build --elf
```

This compiles your agent into a zkVM ELF binary and computes the `IMAGE_ID` and `AGENT_CODE_HASH` -- the two identifiers that get registered on-chain.

## Step 5: Deploy to testnet

```bash
tal deploy --testnet
```

This registers your agent on the `AgentRegistry`, deploys a `KernelVault`, and prints a summary with your vault address.

## Verify it worked

```bash
tal monitor --vault <VAULT_ADDRESS> --chain 998
```

You should see your vault's state, including total assets, shares, and execution nonce.

## Best practices

- **Never panic.** Return empty output instead. Panics abort proof generation.
- **Use `Vec::with_capacity(n)`** instead of `vec![]` for bounded allocation in the zkVM guest.
- **Avoid non-deterministic APIs.** No `HashMap` iteration, no `rand`, no `std::time`, no floating-point math.
- **Use defensive parsing.** Always check `decode()` returns `Some` before proceeding.

## Next steps

- [`agent_input!` Macro](/sdk/agent-input-macro) -- learn input parsing in depth
- [CallBuilder & ERC20 Helpers](/sdk/call-builder) -- all action construction methods
- [Constraints](/sdk/constraints-and-commitments) -- understand what the kernel enforces
- [Testing](/sdk/testing) -- test at every level
- [Deployment Guide](/sdk/deploy-guide) -- advanced deployment options
