---
title: "Recipe: ERC20 Token Agent"
sidebar_position: 1
---

# Recipe: ERC20 Token Agent

A minimal agent that approves a spender and transfers ERC20 tokens. Demonstrates `agent_input!` for input parsing and `erc20` helpers for action construction.

## Agent Code

```rust title="agent/src/lib.rs"
#![no_std]
#![deny(unsafe_code)]

extern crate alloc;

use alloc::vec::Vec;
use kernel_sdk::prelude::*;
use kernel_sdk::actions::erc20;

include!(concat!(env!("OUT_DIR"), "/agent_hash.rs"));

kernel_sdk::agent_input! {
    struct TokenInput {
        token: [u8; 20],
        spender: [u8; 20],
        recipient: [u8; 20],
        amount: u64,
        approve_first: bool,
    }
}

pub extern "Rust" fn agent_main(_ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput {
    let input = match TokenInput::decode(opaque_inputs) {
        Some(i) => i,
        None => return AgentOutput { actions: Vec::new() },
    };

    if input.amount == 0 {
        return AgentOutput { actions: Vec::new() };
    }

    if input.approve_first {
        let approve = erc20::approve(&input.token, &input.spender, input.amount);
        let transfer = erc20::transfer(&input.token, &input.recipient, input.amount);
        let mut actions = Vec::with_capacity(2);
        actions.push(approve);
        actions.push(transfer);
        AgentOutput { actions }
    } else {
        let transfer = erc20::transfer(&input.token, &input.recipient, input.amount);
        let mut actions = Vec::with_capacity(1);
        actions.push(transfer);
        AgentOutput { actions }
    }
}

const _: AgentEntrypoint = agent_main;
kernel_sdk::agent_entrypoint!(agent_main);
```

## Input Format

`TokenInput::ENCODED_SIZE` = 20 + 20 + 20 + 8 + 1 = **69 bytes**

## Tests

```rust title="agent/src/lib.rs (tests module)"
#[cfg(test)]
mod tests {
    use super::*;
    use kernel_sdk::testing::*;

    #[test]
    fn test_transfer_only() {
        let result = TestHarness::new()
            .input({
                let mut buf = Vec::with_capacity(TokenInput::ENCODED_SIZE);
                buf.extend_from_slice(&[0x11; 20]); // token
                buf.extend_from_slice(&[0x22; 20]); // spender
                buf.extend_from_slice(&[0x33; 20]); // recipient
                buf.extend_from_slice(&1000u64.to_le_bytes());
                buf.push(0x00); // approve_first = false
                buf
            })
            .execute(agent_main);

        result.assert_action_count(1);
        result.assert_action_type(0, ACTION_TYPE_CALL);
    }

    #[test]
    fn test_approve_and_transfer() {
        let result = TestHarness::new()
            .input({
                let mut buf = Vec::with_capacity(TokenInput::ENCODED_SIZE);
                buf.extend_from_slice(&[0x11; 20]);
                buf.extend_from_slice(&[0x22; 20]);
                buf.extend_from_slice(&[0x33; 20]);
                buf.extend_from_slice(&500u64.to_le_bytes());
                buf.push(0x01); // approve_first = true
                buf
            })
            .execute(agent_main);

        result.assert_action_count(2);
        result.assert_action_type(0, ACTION_TYPE_CALL); // approve
        result.assert_action_type(1, ACTION_TYPE_CALL); // transfer
    }

    #[test]
    fn test_zero_amount_no_action() {
        let result = TestHarness::new()
            .input({
                let mut buf = Vec::with_capacity(TokenInput::ENCODED_SIZE);
                buf.extend_from_slice(&[0x11; 20]);
                buf.extend_from_slice(&[0x22; 20]);
                buf.extend_from_slice(&[0x33; 20]);
                buf.extend_from_slice(&0u64.to_le_bytes());
                buf.push(0x00);
                buf
            })
            .execute(agent_main);

        result.assert_empty();
    }
}
```
