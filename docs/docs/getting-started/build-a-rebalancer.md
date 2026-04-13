---
title: "Tutorial: Build a DeFi Rebalancer"
sidebar_position: 7
description: Build an agent that compares yield rates and rebalances between two protocols
---

# Tutorial: Build a DeFi Rebalancer

In this tutorial you will build an agent that receives two yield rates, compares them, and deposits into the higher-yielding protocol. You will write the input struct, implement the decision logic, write tests, and deploy to testnet.

**Time:** ~30 minutes
**Prerequisites:** `tal` CLI installed, `tal doctor` passes. See the [5-Minute Quickstart](/quickstart) if you haven't set up yet.

## What we're building

A rebalancer agent that handles three scenarios:

1. **Source A yields more** (by at least a configurable threshold) → deposit into source A
2. **Source B yields more** → deposit into source B
3. **Rates are close** → do nothing (no rebalance needed)

The agent targets two DeFi adapters: the [AaveV3Adapter](/onchain/solidity-integration) for lending yield and the [LidoAdapter](/onchain/solidity-integration) for staking yield. The host (off-chain) fetches the current rates and encodes them into the agent's input.

## Step 1: Scaffold the project

Start from the `minimal` template -- we'll build everything from scratch:

```bash
tal init rebalancer --template minimal
cd rebalancer
```

This generates a project with an empty `agent_main` function:

```
rebalancer/
  agent/
    Cargo.toml
    build.rs
    src/lib.rs       ← your agent logic goes here
  risc0-methods/
  dist/
    agent-pack.json
  .env.example
```

Open `agent/src/lib.rs`. You'll see a skeleton agent that returns empty output. We'll replace it entirely.

## Step 2: Define the input format

Replace the contents of `agent/src/lib.rs` with the following. We start by declaring the input struct using the `agent_input!` macro:

```rust
#![no_std]
#![deny(unsafe_code)]

extern crate alloc;

use alloc::vec::Vec;
use kernel_sdk::prelude::*;
use kernel_sdk::actions::CallBuilder;

// Include the generated agent hash constant.
include!(concat!(env!("OUT_DIR"), "/agent_hash.rs"));

// ============================================================================
// Input Format
// ============================================================================

kernel_sdk::agent_input! {
    struct RebalancerInput {
        vault_address: [u8; 20],   // The vault that owns the funds
        source_a: [u8; 20],       // Adapter address for protocol A (e.g., Aave)
        source_b: [u8; 20],       // Adapter address for protocol B (e.g., Lido)
        asset: [u8; 20],          // The ERC20 asset to deposit (e.g., USDC)
        current_balance: u64,      // Vault's available balance (asset units)
        rate_a: u32,               // Protocol A yield rate in basis points
        rate_b: u32,               // Protocol B yield rate in basis points
        threshold_bps: u32,        // Minimum difference to trigger rebalance
    }
}
```

Each field maps to a fixed number of bytes. The macro generates `RebalancerInput::decode(bytes)` which parses the raw input, and `RebalancerInput::ENCODED_SIZE` which equals `20 + 20 + 20 + 20 + 8 + 4 + 4 + 4 = 100` bytes.

:::tip Why fixed-size inputs?
Agents run inside a zkVM where every byte of input is committed to the proof. Fixed-size inputs make the commitment deterministic and the parsing branchless -- no length ambiguity, no out-of-bounds risk.
:::

The **host** (off-chain orchestrator) is responsible for:
- Reading the current rates from Aave and Lido
- Encoding them into 100 bytes using little-endian format
- Feeding them to the agent via `KernelInputV1.opaque_agent_inputs`

The agent only sees the encoded bytes. It never makes network calls.

## Step 3: Write the decision logic

Add the agent entry point below the input struct:

```rust
// ============================================================================
// Constants
// ============================================================================

/// AaveV3Adapter.supply(address,uint256) selector
const AAVE_SUPPLY_SELECTOR: u32 = 0xf2b9fdb8;

/// LidoAdapter.stakeETH() selector
const LIDO_STAKE_SELECTOR: u32 = 0xdceb986d;

// ============================================================================
// Agent Entry Point
// ============================================================================

pub extern "Rust" fn agent_main(_ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput {
    // Parse input -- return empty on failure (never panic)
    let input = match RebalancerInput::decode(opaque_inputs) {
        Some(i) => i,
        None => return AgentOutput { actions: Vec::new() },
    };

    // Don't rebalance dust amounts
    if input.current_balance == 0 {
        return AgentOutput { actions: Vec::new() };
    }

    // Compare rates with threshold
    if input.rate_a > input.rate_b + input.threshold_bps {
        // Source A wins -- deposit into Aave via AaveV3Adapter
        let approve = kernel_sdk::actions::erc20::approve(
            &input.asset,
            &input.source_a,
            input.current_balance,
        );

        let supply = CallBuilder::new(input.source_a)
            .selector(AAVE_SUPPLY_SELECTOR)
            .param_address(&input.asset)
            .param_u256_from_u64(input.current_balance)
            .build();

        let mut actions = Vec::with_capacity(2);
        actions.push(approve);
        actions.push(supply);
        AgentOutput { actions }

    } else if input.rate_b > input.rate_a + input.threshold_bps {
        // Source B wins -- stake ETH via LidoAdapter
        let stake = CallBuilder::new(input.source_b)
            .selector(LIDO_STAKE_SELECTOR)
            .value(input.current_balance as u128)
            .build();

        AgentOutput { actions: alloc::vec![stake] }

    } else {
        // Rates within threshold -- no action
        AgentOutput { actions: Vec::new() }
    }
}

// ============================================================================
// Wiring
// ============================================================================

/// Compile-time check that agent_main matches the canonical AgentEntrypoint type.
const _: AgentEntrypoint = agent_main;

// Generate kernel_main, kernel_main_with_constraints, and KernelError re-export.
kernel_sdk::agent_entrypoint!(agent_main);
```

Let's walk through the logic:

1. **Parse** -- `RebalancerInput::decode` returns `None` if the byte length doesn't match. We return empty output instead of panicking (panics abort proof generation).

2. **Guard** -- Skip if balance is zero. Rebalancing nothing wastes gas.

3. **Compare** -- We check if `rate_a` exceeds `rate_b` by more than `threshold_bps` (or vice versa). The threshold prevents churning when rates are similar.

4. **Build actions** -- For Aave, we need two actions: `erc20::approve` (let the adapter pull tokens) then `AaveV3Adapter.supply(asset, amount)`. For Lido, we send ETH with `stakeETH()`.

:::warning Don't use HashMap
The zkVM requires deterministic execution. `HashMap` iterates in random order across runs, which means two executions of the same input could produce different output. Use `Vec` or fixed-size arrays instead.
:::

## Step 4: Write tests

Add these tests at the bottom of `agent/src/lib.rs`:

```rust
// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // Helper: build encoded input bytes
    fn make_input(
        vault: [u8; 20],
        source_a: [u8; 20],
        source_b: [u8; 20],
        asset: [u8; 20],
        balance: u64,
        rate_a: u32,
        rate_b: u32,
        threshold: u32,
    ) -> Vec<u8> {
        let mut buf = Vec::with_capacity(RebalancerInput::ENCODED_SIZE);
        buf.extend_from_slice(&vault);
        buf.extend_from_slice(&source_a);
        buf.extend_from_slice(&source_b);
        buf.extend_from_slice(&asset);
        buf.extend_from_slice(&balance.to_le_bytes());
        buf.extend_from_slice(&rate_a.to_le_bytes());
        buf.extend_from_slice(&rate_b.to_le_bytes());
        buf.extend_from_slice(&threshold.to_le_bytes());
        buf
    }

    fn test_ctx() -> AgentContext {
        AgentContext {
            protocol_version: 1,
            kernel_version: 1,
            agent_id: [0x42; 32],
            agent_code_hash: AGENT_CODE_HASH,
            constraint_set_hash: [0xbb; 32],
            input_root: [0xcc; 32],
            execution_nonce: 1,
        }
    }

    #[test]
    fn test_rebalance_to_source_a() {
        let ctx = test_ctx();
        let input = make_input(
            [0x11; 20], // vault
            [0xAA; 20], // source A (Aave)
            [0xBB; 20], // source B (Lido)
            [0xCC; 20], // asset
            1_000_000,  // 1 USDC (6 decimals)
            500,        // rate A = 5.00%
            200,        // rate B = 2.00%
            50,         // threshold = 0.50%
        );

        let output = agent_main(&ctx, &input);

        // Should produce 2 actions: approve + supply to source A
        assert_eq!(output.actions.len(), 2, "Expected 2 actions (approve + supply)");
        assert_eq!(output.actions[0].action_type, ACTION_TYPE_TRANSFER_ERC20.max(ACTION_TYPE_CALL));
        assert_eq!(output.actions[1].action_type, ACTION_TYPE_CALL);

        // Both should target source A's addresses
        let expected_supply_target = address_to_bytes32(&[0xAA; 20]);
        assert_eq!(output.actions[1].target, expected_supply_target);
    }

    #[test]
    fn test_rebalance_to_source_b() {
        let ctx = test_ctx();
        let input = make_input(
            [0x11; 20],
            [0xAA; 20],
            [0xBB; 20],
            [0xCC; 20],
            1_000_000_000_000_000_000, // 1 ETH (18 decimals)
            200,  // rate A = 2.00%
            500,  // rate B = 5.00%
            50,   // threshold = 0.50%
        );

        let output = agent_main(&ctx, &input);

        // Should produce 1 action: stakeETH to source B
        assert_eq!(output.actions.len(), 1, "Expected 1 action (stakeETH)");
        assert_eq!(output.actions[0].action_type, ACTION_TYPE_CALL);

        let expected_target = address_to_bytes32(&[0xBB; 20]);
        assert_eq!(output.actions[0].target, expected_target);
    }

    #[test]
    fn test_no_rebalance_within_threshold() {
        let ctx = test_ctx();
        let input = make_input(
            [0x11; 20],
            [0xAA; 20],
            [0xBB; 20],
            [0xCC; 20],
            1_000_000,
            300,  // rate A = 3.00%
            310,  // rate B = 3.10%
            50,   // threshold = 0.50% -- difference is only 0.10%
        );

        let output = agent_main(&ctx, &input);

        // Rates are within threshold -- no action
        assert!(
            output.actions.is_empty(),
            "Expected empty output when rates are within threshold"
        );
    }

    #[test]
    fn test_invalid_input_returns_empty() {
        let ctx = test_ctx();

        // Too short
        let output = agent_main(&ctx, &[0u8; 50]);
        assert!(output.actions.is_empty(), "Short input should produce empty output");

        // Too long
        let output = agent_main(&ctx, &[0u8; 120]);
        assert!(output.actions.is_empty(), "Long input should produce empty output");
    }
}
```

The tests cover all three branches plus invalid input. Each test:
1. Constructs input bytes manually using `make_input()`
2. Calls `agent_main` with those bytes
3. Asserts the expected number and type of actions

## Step 5: Test locally

Run the tests:

```bash
tal test --local
```

You should see output like:

```
Running tests for rebalancer...
  test_rebalance_to_source_a        PASSED
  test_rebalance_to_source_b        PASSED
  test_no_rebalance_within_threshold PASSED
  test_invalid_input_returns_empty  PASSED

4 passed, 0 failed
```

:::tip Fast iteration
During development, use `tal test --local` for instant feedback (2-5 seconds). Only run `tal build --elf` when you're ready to deploy.
:::

## Step 6: Build and deploy

When your tests pass, build the zkVM binary and deploy:

```bash
# Build the ELF binary (8-10 minutes on first run)
tal build --elf

# Configure your environment
cp .env.example .env
# Edit .env with your private key and testnet RPC

# Deploy to HyperEVM testnet
tal deploy --testnet
```

`tal deploy` registers your agent on the `AgentRegistry` and deploys a `KernelVault` via the `VaultFactory`. The vault pins your `IMAGE_ID` -- it will only accept proofs from this exact agent binary.

For full deployment details, see the [Deployment Guide](/sdk/deploy-guide).

## Complete source

Here's the complete `agent/src/lib.rs` for reference:

```rust
#![no_std]
#![deny(unsafe_code)]

extern crate alloc;

use alloc::vec::Vec;
use kernel_sdk::prelude::*;
use kernel_sdk::actions::CallBuilder;

include!(concat!(env!("OUT_DIR"), "/agent_hash.rs"));

// ============================================================================
// Input Format (100 bytes)
// ============================================================================

kernel_sdk::agent_input! {
    struct RebalancerInput {
        vault_address: [u8; 20],
        source_a: [u8; 20],
        source_b: [u8; 20],
        asset: [u8; 20],
        current_balance: u64,
        rate_a: u32,
        rate_b: u32,
        threshold_bps: u32,
    }
}

// ============================================================================
// Constants
// ============================================================================

/// AaveV3Adapter.supply(address,uint256)
const AAVE_SUPPLY_SELECTOR: u32 = 0xf2b9fdb8;

/// LidoAdapter.stakeETH()
const LIDO_STAKE_SELECTOR: u32 = 0xdceb986d;

// ============================================================================
// Agent Entry Point
// ============================================================================

pub extern "Rust" fn agent_main(_ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput {
    let input = match RebalancerInput::decode(opaque_inputs) {
        Some(i) => i,
        None => return AgentOutput { actions: Vec::new() },
    };

    if input.current_balance == 0 {
        return AgentOutput { actions: Vec::new() };
    }

    if input.rate_a > input.rate_b + input.threshold_bps {
        // Deposit into Aave: approve + supply
        let approve = kernel_sdk::actions::erc20::approve(
            &input.asset,
            &input.source_a,
            input.current_balance,
        );
        let supply = CallBuilder::new(input.source_a)
            .selector(AAVE_SUPPLY_SELECTOR)
            .param_address(&input.asset)
            .param_u256_from_u64(input.current_balance)
            .build();

        let mut actions = Vec::with_capacity(2);
        actions.push(approve);
        actions.push(supply);
        AgentOutput { actions }
    } else if input.rate_b > input.rate_a + input.threshold_bps {
        // Stake ETH via Lido
        let stake = CallBuilder::new(input.source_b)
            .selector(LIDO_STAKE_SELECTOR)
            .value(input.current_balance as u128)
            .build();
        AgentOutput { actions: alloc::vec![stake] }
    } else {
        AgentOutput { actions: Vec::new() }
    }
}

const _: AgentEntrypoint = agent_main;
kernel_sdk::agent_entrypoint!(agent_main);
```

## What's next

| Goal | Guide |
|------|-------|
| Understand the full SDK | [SDK Overview](/sdk/overview) |
| Learn how constraints are enforced | [Constraints & Commitments](/sdk/constraints-and-commitments) |
| See a production DeFi agent | [DeFi Yield Farmer](/getting-started/defi-yield-farmer) |
| Deploy with advanced options | [Deployment Guide](/sdk/deploy-guide) |
