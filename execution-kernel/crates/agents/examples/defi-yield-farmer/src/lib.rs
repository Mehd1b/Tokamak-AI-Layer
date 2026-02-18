//! DeFi Yield Farming Agent
//!
//! Verifiable yield farming agent targeting AAVE-like lending pools.
//! Receives market state via opaque_inputs, computes optimal allocation,
//! and outputs CALL actions for supply/withdraw operations.
//!
//! # Input Format (69 bytes)
//!
//! ```text
//! [0:20]   lending_pool address (20 bytes)
//! [20:40]  asset_token address (20 bytes)
//! [40:48]  vault_balance (u64 LE)
//! [48:56]  supplied_amount (u64 LE)
//! [56:60]  supply_rate_bps (u32 LE)
//! [60:64]  min_supply_rate_bps (u32 LE)
//! [64:68]  target_utilization_bps (u32 LE)
//! [68]     action_flag (u8)
//! ```
//!
//! # Output Actions
//!
//! CALL actions targeting the AAVE lending pool:
//! - Supply: `supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)`
//! - Withdraw: `withdraw(address asset, uint256 amount, address to)`

#![no_std]
#![deny(unsafe_code)]

extern crate alloc;

use alloc::vec::Vec;
use kernel_sdk::prelude::*;

// Include the generated agent hash constant.
include!(concat!(env!("OUT_DIR"), "/agent_hash.rs"));

// ============================================================================
// Constants
// ============================================================================

/// Input size: 20 (pool) + 20 (token) + 8 (balance) + 8 (supplied)
///           + 4 (rate) + 4 (min_rate) + 4 (target_util) + 1 (flag) = 69 bytes
const INPUT_SIZE: usize = 69;

/// AAVE supply function selector: keccak256("supply(address,uint256,address,uint16)")[:4]
const SUPPLY_SELECTOR: [u8; 4] = [0x61, 0x7b, 0xa0, 0x37];

/// AAVE withdraw function selector: keccak256("withdraw(address,uint256,address)")[:4]
const WITHDRAW_SELECTOR: [u8; 4] = [0x69, 0x32, 0x8d, 0xec];

/// Action flag: evaluate market conditions and decide
const FLAG_EVALUATE: u8 = 0;

/// Action flag: force supply (operator override)
const FLAG_FORCE_SUPPLY: u8 = 1;

/// Action flag: force full withdrawal (operator override)
const FLAG_FORCE_WITHDRAW: u8 = 2;

// ============================================================================
// Input Parsing
// ============================================================================

struct MarketInput {
    lending_pool: [u8; 20],
    asset_token: [u8; 20],
    vault_balance: u64,
    supplied_amount: u64,
    supply_rate_bps: u32,
    min_supply_rate_bps: u32,
    target_utilization_bps: u32,
    action_flag: u8,
}

fn parse_input(opaque_inputs: &[u8]) -> Option<MarketInput> {
    if opaque_inputs.len() != INPUT_SIZE {
        return None;
    }

    let mut offset = 0usize;

    let mut lending_pool = [0u8; 20];
    lending_pool.copy_from_slice(&opaque_inputs[offset..offset + 20]);
    offset += 20;

    let mut asset_token = [0u8; 20];
    asset_token.copy_from_slice(&opaque_inputs[offset..offset + 20]);
    offset += 20;

    let vault_balance = u64::from_le_bytes(
        opaque_inputs[offset..offset + 8].try_into().ok()?
    );
    offset += 8;

    let supplied_amount = u64::from_le_bytes(
        opaque_inputs[offset..offset + 8].try_into().ok()?
    );
    offset += 8;

    let supply_rate_bps = u32::from_le_bytes(
        opaque_inputs[offset..offset + 4].try_into().ok()?
    );
    offset += 4;

    let min_supply_rate_bps = u32::from_le_bytes(
        opaque_inputs[offset..offset + 4].try_into().ok()?
    );
    offset += 4;

    let target_utilization_bps = u32::from_le_bytes(
        opaque_inputs[offset..offset + 4].try_into().ok()?
    );
    offset += 4;

    let action_flag = opaque_inputs[offset];

    Some(MarketInput {
        lending_pool,
        asset_token,
        vault_balance,
        supplied_amount,
        supply_rate_bps,
        min_supply_rate_bps,
        target_utilization_bps,
        action_flag,
    })
}

// ============================================================================
// Agent Entry Point
// ============================================================================

/// Canonical agent entrypoint.
#[no_mangle]
#[allow(unsafe_code)]
pub extern "Rust" fn agent_main(_ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput {
    // Parse input; return empty on invalid
    let _market = match parse_input(opaque_inputs) {
        Some(m) => m,
        None => return AgentOutput { actions: Vec::new() },
    };

    // Strategy not yet implemented - return empty
    AgentOutput { actions: Vec::new() }
}

/// Compile-time check that agent_main matches the canonical AgentEntrypoint type.
const _: AgentEntrypoint = agent_main;

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn make_market_input(
        lending_pool: [u8; 20],
        asset_token: [u8; 20],
        vault_balance: u64,
        supplied_amount: u64,
        supply_rate_bps: u32,
        min_supply_rate_bps: u32,
        target_utilization_bps: u32,
        action_flag: u8,
    ) -> Vec<u8> {
        let mut input = Vec::with_capacity(INPUT_SIZE);
        input.extend_from_slice(&lending_pool);
        input.extend_from_slice(&asset_token);
        input.extend_from_slice(&vault_balance.to_le_bytes());
        input.extend_from_slice(&supplied_amount.to_le_bytes());
        input.extend_from_slice(&supply_rate_bps.to_le_bytes());
        input.extend_from_slice(&min_supply_rate_bps.to_le_bytes());
        input.extend_from_slice(&target_utilization_bps.to_le_bytes());
        input.push(action_flag);
        input
    }

    fn test_ctx() -> AgentContext {
        AgentContext {
            protocol_version: 1,
            kernel_version: 1,
            agent_id: [0x42u8; 32],
            agent_code_hash: AGENT_CODE_HASH,
            constraint_set_hash: [0xbb; 32],
            input_root: [0xcc; 32],
            execution_nonce: 1,
        }
    }

    #[test]
    fn test_invalid_input_returns_empty() {
        let ctx = test_ctx();
        let short = alloc::vec![0u8; 10];
        let output = agent_main(&ctx, &short);
        assert!(output.actions.is_empty());
    }

    #[test]
    fn test_supply_when_rate_above_threshold() {
        let ctx = test_ctx();
        let input = make_market_input(
            [0x11u8; 20],  // lending_pool
            [0x22u8; 20],  // asset_token
            1_000_000,     // vault_balance: 1M tokens available
            0,             // supplied_amount: nothing supplied yet
            500,           // supply_rate: 5% APY
            200,           // min_supply_rate: 2% APY threshold
            8000,          // target_utilization: 80%
            0,             // action_flag: evaluate
        );
        let output = agent_main(&ctx, &input);
        // Rate (500 bps) > min (200 bps) and vault has balance -> should supply
        assert_eq!(output.actions.len(), 1, "Should produce 1 supply action");
        assert_eq!(output.actions[0].action_type, ACTION_TYPE_CALL);
    }

    #[test]
    fn test_no_action_when_rate_below_threshold() {
        let ctx = test_ctx();
        let input = make_market_input(
            [0x11u8; 20],
            [0x22u8; 20],
            1_000_000,
            0,
            100,           // supply_rate: 1% APY -- below threshold
            200,           // min_supply_rate: 2% APY threshold
            8000,
            0,
        );
        let output = agent_main(&ctx, &input);
        assert!(output.actions.is_empty(), "Rate below threshold -> no action");
    }

    #[test]
    fn test_withdraw_when_rate_drops_below_threshold() {
        let ctx = test_ctx();
        let input = make_market_input(
            [0x11u8; 20],
            [0x22u8; 20],
            200_000,       // vault_balance: some idle
            800_000,       // supplied_amount: 800K supplied
            100,           // supply_rate: 1% -- dropped below threshold
            200,           // min_supply_rate: 2%
            8000,
            0,
        );
        let output = agent_main(&ctx, &input);
        // Rate dropped below min while we have supplied -> should withdraw
        assert_eq!(output.actions.len(), 1, "Should produce 1 withdraw action");
        assert_eq!(output.actions[0].action_type, ACTION_TYPE_CALL);
    }
}
