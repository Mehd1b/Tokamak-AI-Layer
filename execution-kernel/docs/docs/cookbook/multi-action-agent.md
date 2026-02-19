---
title: "Recipe: Multi-Action Agent"
sidebar_position: 2
---

# Recipe: Multi-Action Agent

An agent that emits multiple actions in sequence — the approve-then-supply pattern used by the DeFi Yield Farmer. Demonstrates `CallBuilder` with custom selectors and `erc20::approve`.

## Agent Code

```rust title="agent/src/lib.rs"
#![no_std]
#![deny(unsafe_code)]

extern crate alloc;

use alloc::vec::Vec;
use kernel_sdk::prelude::*;
use kernel_sdk::actions::{CallBuilder, erc20};

include!(concat!(env!("OUT_DIR"), "/agent_hash.rs"));

const SUPPLY_SELECTOR: u32 = 0x617ba037; // supply(address,uint256,address,uint16)

kernel_sdk::agent_input! {
    struct SupplyInput {
        lending_pool: [u8; 20],
        asset_token: [u8; 20],
        vault_address: [u8; 20],
        amount: u64,
    }
}

pub extern "Rust" fn agent_main(_ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput {
    let input = match SupplyInput::decode(opaque_inputs) {
        Some(i) => i,
        None => return AgentOutput { actions: Vec::new() },
    };

    if input.amount == 0 {
        return AgentOutput { actions: Vec::new() };
    }

    // Action 1: Approve the lending pool to spend our tokens
    let approve = erc20::approve(
        &input.asset_token,
        &input.lending_pool,
        input.amount,
    );

    // Action 2: Supply tokens to the lending pool
    let supply = CallBuilder::new(input.lending_pool)
        .selector(SUPPLY_SELECTOR)
        .param_address(&input.asset_token)
        .param_u256_from_u64(input.amount)
        .param_address(&input.vault_address)
        .param_u16(0) // referralCode
        .build();

    let mut actions = Vec::with_capacity(2);
    actions.push(approve);
    actions.push(supply);
    AgentOutput { actions }
}

const _: AgentEntrypoint = agent_main;
kernel_sdk::agent_entrypoint!(agent_main);
```

## Input Format

`SupplyInput::ENCODED_SIZE` = 20 + 20 + 20 + 8 = **68 bytes**

## Tests

```rust title="agent/src/lib.rs (tests module)"
#[cfg(test)]
mod tests {
    use super::*;
    use kernel_sdk::testing::*;

    fn make_input(pool: [u8; 20], token: [u8; 20], vault: [u8; 20], amount: u64) -> Vec<u8> {
        let mut buf = Vec::with_capacity(SupplyInput::ENCODED_SIZE);
        buf.extend_from_slice(&pool);
        buf.extend_from_slice(&token);
        buf.extend_from_slice(&vault);
        buf.extend_from_slice(&amount.to_le_bytes());
        buf
    }

    #[test]
    fn test_approve_then_supply() {
        let result = TestHarness::new()
            .input(make_input([0x11; 20], [0x22; 20], [0x33; 20], 1_000_000))
            .execute(agent_main);

        result.assert_action_count(2);

        // First action targets the token (approve)
        result.assert_action_type(0, ACTION_TYPE_CALL);
        result.assert_target(0, &[0x22; 20]);

        // Second action targets the pool (supply)
        result.assert_action_type(1, ACTION_TYPE_CALL);
        result.assert_target(1, &[0x11; 20]);
    }

    #[test]
    fn test_zero_amount_no_actions() {
        let result = TestHarness::new()
            .input(make_input([0x11; 20], [0x22; 20], [0x33; 20], 0))
            .execute(agent_main);

        result.assert_empty();
    }

    #[test]
    fn test_determinism() {
        let input = make_input([0x11; 20], [0x22; 20], [0x33; 20], 500_000);
        let result = TestHarness::new()
            .input(input)
            .execute(agent_main);

        result.assert_deterministic(agent_main);
    }
}
```

## Key Patterns

1. **Approve before interact** — Always approve the target contract to spend tokens before calling functions that transfer from the vault.
2. **`Vec::with_capacity(n)`** — Pre-allocate the exact number of actions to avoid unbounded allocation.
3. **`assert_target()`** — Verify each action targets the correct contract (token vs. pool).
4. **`assert_deterministic()`** — Re-runs the agent and asserts identical output.
