//! DeFi Yield Farming Agent
//!
//! Verifiable yield farming agent targeting AAVE-like lending pools.
//! Receives market state via opaque_inputs, computes optimal allocation,
//! and outputs CALL actions for supply/withdraw operations.
//!
//! # Input Format (89 bytes)
//!
//! ```text
//! [0:20]   lending_pool address (20 bytes)
//! [20:40]  asset_token address (20 bytes)
//! [40:60]  vault_address (20 bytes) — used as onBehalfOf/to in AAVE calls
//! [60:68]  vault_balance (u64 LE)
//! [68:76]  supplied_amount (u64 LE)
//! [76:80]  supply_rate_bps (u32 LE)
//! [80:84]  min_supply_rate_bps (u32 LE)
//! [84:88]  target_utilization_bps (u32 LE)
//! [88]     action_flag (u8)
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
use kernel_sdk::actions::CallBuilder;

// Include the generated agent hash constant.
include!(concat!(env!("OUT_DIR"), "/agent_hash.rs"));

// ============================================================================
// Constants
// ============================================================================

/// AAVE supply function selector: keccak256("supply(address,uint256,address,uint16)")[:4]
const SUPPLY_SELECTOR: u32 = 0x617ba037;

/// AAVE withdraw function selector: keccak256("withdraw(address,uint256,address)")[:4]
const WITHDRAW_SELECTOR: u32 = 0x69328dec;

/// Action flag: evaluate market conditions and decide
const FLAG_EVALUATE: u8 = 0;

/// Action flag: force supply (operator override)
const FLAG_FORCE_SUPPLY: u8 = 1;

/// Action flag: force full withdrawal (operator override)
const FLAG_FORCE_WITHDRAW: u8 = 2;

/// Action flag: approve spender then force supply (operator override for first-time setup)
const FLAG_APPROVE_AND_SUPPLY: u8 = 3;

// ============================================================================
// Input Parsing
// ============================================================================

kernel_sdk::agent_input! {
    struct MarketInput {
        lending_pool: [u8; 20],
        asset_token: [u8; 20],
        vault_address: [u8; 20],
        vault_balance: u64,
        supplied_amount: u64,
        supply_rate_bps: u32,
        min_supply_rate_bps: u32,
        target_utilization_bps: u32,
        action_flag: u8,
    }
}

// ============================================================================
// Helpers
// ============================================================================

/// Return the smaller of two u64 values.
fn min_u64(a: u64, b: u64) -> u64 {
    if a < b { a } else { b }
}

// ============================================================================
// Agent Entry Point
// ============================================================================

/// Canonical agent entrypoint.
///
/// Note: `#[no_mangle]` is intentionally omitted to avoid symbol collisions
/// when multiple agent crates are linked into the same binary (e.g., tests).
/// The wrapper crate calls this through the Rust module path.
pub extern "Rust" fn agent_main(_ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput {
    let market = match MarketInput::decode(opaque_inputs) {
        Some(m) => m,
        None => return AgentOutput { actions: Vec::new() },
    };

    match market.action_flag {
        FLAG_FORCE_SUPPLY => force_supply(&market),
        FLAG_FORCE_WITHDRAW => force_withdraw(&market),
        FLAG_EVALUATE => evaluate_and_act(&market),
        FLAG_APPROVE_AND_SUPPLY => approve_and_supply(&market),
        _ => AgentOutput { actions: Vec::new() }, // Unknown flag -> no-op
    }
}

/// Compile-time check that agent_main matches the canonical AgentEntrypoint type.
const _: AgentEntrypoint = agent_main;

// Generate kernel_main, kernel_main_with_constraints, and KernelError re-export.
kernel_sdk::agent_entrypoint!(agent_main);

// ============================================================================
// Strategy Logic
// ============================================================================

/// Evaluate market conditions and decide supply/withdraw/no-op.
///
/// Strategy:
/// 1. If supply_rate >= min_rate AND vault has idle capital -> supply up to target utilization
/// 2. If supply_rate < min_rate AND we have supplied capital -> withdraw everything
/// 3. Otherwise -> no-op
fn evaluate_and_act(market: &MarketInput) -> AgentOutput {
    let rate_ok = market.supply_rate_bps >= market.min_supply_rate_bps;
    let total_capital = saturating_add_u64(market.vault_balance, market.supplied_amount);

    if total_capital == 0 {
        return AgentOutput { actions: Vec::new() };
    }

    if rate_ok && market.vault_balance > 0 {
        // Calculate target supply amount based on utilization target
        let target_supplied = match apply_bps(total_capital, market.target_utilization_bps as u64) {
            Some(v) => v,
            None => return AgentOutput { actions: Vec::new() },
        };

        // How much more to supply (could be 0 if already at/above target)
        let additional = saturating_sub_u64(target_supplied, market.supplied_amount);
        // Don't supply more than available balance
        let supply_amount = min_u64(additional, market.vault_balance);

        if supply_amount == 0 {
            return AgentOutput { actions: Vec::new() };
        }

        let action = build_supply_action(market, supply_amount);
        let mut actions = Vec::with_capacity(1);
        actions.push(action);
        AgentOutput { actions }
    } else if !rate_ok && market.supplied_amount > 0 {
        // Rate dropped below threshold -> withdraw all supplied capital
        let action = build_withdraw_action(market, market.supplied_amount);
        let mut actions = Vec::with_capacity(1);
        actions.push(action);
        AgentOutput { actions }
    } else {
        AgentOutput { actions: Vec::new() }
    }
}

/// Force supply all available vault balance.
fn force_supply(market: &MarketInput) -> AgentOutput {
    if market.vault_balance == 0 {
        return AgentOutput { actions: Vec::new() };
    }
    let action = build_supply_action(market, market.vault_balance);
    let mut actions = Vec::with_capacity(1);
    actions.push(action);
    AgentOutput { actions }
}

/// Force withdraw all supplied capital.
fn force_withdraw(market: &MarketInput) -> AgentOutput {
    if market.supplied_amount == 0 {
        return AgentOutput { actions: Vec::new() };
    }
    let action = build_withdraw_action(market, market.supplied_amount);
    let mut actions = Vec::with_capacity(1);
    actions.push(action);
    AgentOutput { actions }
}

/// Approve the lending pool to spend the asset, then supply all available balance.
///
/// Emits two actions in order:
/// 1. CALL: asset_token.approve(lending_pool, amount)
/// 2. CALL: lending_pool.supply(asset_token, amount, vault_address, 0)
///
/// Used for first-time setup or when approval has expired.
fn approve_and_supply(market: &MarketInput) -> AgentOutput {
    if market.vault_balance == 0 {
        return AgentOutput { actions: Vec::new() };
    }
    let approve = build_approve_action(market, &market.lending_pool, market.vault_balance);
    let supply = build_supply_action(market, market.vault_balance);
    let mut actions = Vec::with_capacity(2);
    actions.push(approve);
    actions.push(supply);
    AgentOutput { actions }
}

// ============================================================================
// ABI Encoding — AAVE Lending Pool Interface
// ============================================================================

/// Build a CALL action for ERC20.approve(address spender, uint256 amount).
fn build_approve_action(market: &MarketInput, spender: &[u8; 20], amount: u64) -> ActionV1 {
    kernel_sdk::actions::erc20::approve(&market.asset_token, spender, amount)
}

/// Build a CALL action for AAVE supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode).
fn build_supply_action(market: &MarketInput, amount: u64) -> ActionV1 {
    CallBuilder::new(market.lending_pool)
        .selector(SUPPLY_SELECTOR)
        .param_address(&market.asset_token)
        .param_u256_from_u64(amount)
        .param_address(&market.vault_address)
        .param_u16(0) // referralCode
        .build()
}

/// Build a CALL action for AAVE withdraw(address asset, uint256 amount, address to).
fn build_withdraw_action(market: &MarketInput, amount: u64) -> ActionV1 {
    CallBuilder::new(market.lending_pool)
        .selector(WITHDRAW_SELECTOR)
        .param_address(&market.asset_token)
        .param_u256_from_u64(amount)
        .param_address(&market.vault_address)
        .build()
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    /// Approve selector bytes for test assertions.
    const APPROVE_SELECTOR_BYTES: [u8; 4] = [0x09, 0x5e, 0xa7, 0xb3];

    fn make_market_input(
        lending_pool: [u8; 20],
        asset_token: [u8; 20],
        vault_address: [u8; 20],
        vault_balance: u64,
        supplied_amount: u64,
        supply_rate_bps: u32,
        min_supply_rate_bps: u32,
        target_utilization_bps: u32,
        action_flag: u8,
    ) -> Vec<u8> {
        let mut input = Vec::with_capacity(MarketInput::ENCODED_SIZE);
        input.extend_from_slice(&lending_pool);
        input.extend_from_slice(&asset_token);
        input.extend_from_slice(&vault_address);
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
            [0x33u8; 20],  // vault_address
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
            [0x33u8; 20],
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
            [0x33u8; 20],
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

    #[test]
    fn test_force_supply_all_balance() {
        let ctx = test_ctx();
        let input = make_market_input(
            [0x11u8; 20],
            [0x22u8; 20],
            [0x33u8; 20],
            500_000,  // vault_balance
            0,        // supplied
            100,      // rate doesn't matter for force
            200,
            8000,
            1,        // FLAG_FORCE_SUPPLY
        );
        let output = agent_main(&ctx, &input);
        assert_eq!(output.actions.len(), 1);
        assert_eq!(output.actions[0].action_type, ACTION_TYPE_CALL);
    }

    #[test]
    fn test_force_supply_zero_balance_no_action() {
        let ctx = test_ctx();
        let input = make_market_input(
            [0x11u8; 20],
            [0x22u8; 20],
            [0x33u8; 20],
            0,        // no balance
            500_000,
            500,
            200,
            8000,
            1,        // FLAG_FORCE_SUPPLY
        );
        let output = agent_main(&ctx, &input);
        assert!(output.actions.is_empty());
    }

    #[test]
    fn test_force_withdraw_all_supplied() {
        let ctx = test_ctx();
        let input = make_market_input(
            [0x11u8; 20],
            [0x22u8; 20],
            [0x33u8; 20],
            200_000,
            800_000,  // supplied
            500,
            200,
            8000,
            2,        // FLAG_FORCE_WITHDRAW
        );
        let output = agent_main(&ctx, &input);
        assert_eq!(output.actions.len(), 1);
        assert_eq!(output.actions[0].action_type, ACTION_TYPE_CALL);
    }

    #[test]
    fn test_force_withdraw_nothing_supplied() {
        let ctx = test_ctx();
        let input = make_market_input(
            [0x11u8; 20],
            [0x22u8; 20],
            [0x33u8; 20],
            500_000,
            0,        // nothing supplied
            500,
            200,
            8000,
            2,        // FLAG_FORCE_WITHDRAW
        );
        let output = agent_main(&ctx, &input);
        assert!(output.actions.is_empty());
    }

    #[test]
    fn test_already_at_target_utilization() {
        let ctx = test_ctx();
        let input = make_market_input(
            [0x11u8; 20],
            [0x22u8; 20],
            [0x33u8; 20],
            200_000,    // vault_balance
            800_000,    // supplied: 80% of 1M total
            500,        // rate ok
            200,
            8000,       // target: 80%
            0,
        );
        let output = agent_main(&ctx, &input);
        // Already at target (800K / 1M = 80%) -> no additional supply needed
        assert!(output.actions.is_empty());
    }

    #[test]
    fn test_partial_supply_to_reach_target() {
        let ctx = test_ctx();
        let input = make_market_input(
            [0x11u8; 20],
            [0x22u8; 20],
            [0x33u8; 20],
            500_000,    // vault_balance: 500K
            300_000,    // supplied: 300K
            500,        // rate ok
            200,
            8000,       // target: 80% of 800K total = 640K
            0,
        );
        let output = agent_main(&ctx, &input);
        // Need: 640K - 300K = 340K, have 500K available -> supply 340K
        assert_eq!(output.actions.len(), 1);
    }

    #[test]
    fn test_zero_total_capital_no_action() {
        let ctx = test_ctx();
        let input = make_market_input(
            [0x11u8; 20],
            [0x22u8; 20],
            [0x33u8; 20],
            0,
            0,
            500,
            200,
            8000,
            0,
        );
        let output = agent_main(&ctx, &input);
        assert!(output.actions.is_empty());
    }

    #[test]
    fn test_unknown_flag_no_action() {
        let ctx = test_ctx();
        let input = make_market_input(
            [0x11u8; 20],
            [0x22u8; 20],
            [0x33u8; 20],
            500_000,
            0,
            500,
            200,
            8000,
            99,  // unknown flag
        );
        let output = agent_main(&ctx, &input);
        assert!(output.actions.is_empty());
    }

    #[test]
    fn test_supply_calldata_format() {
        let ctx = test_ctx();
        let input = make_market_input(
            [0x11u8; 20],
            [0x22u8; 20],
            [0x33u8; 20],
            1_000_000,
            0,
            500,
            200,
            8000,
            1,  // force supply
        );
        let output = agent_main(&ctx, &input);
        assert_eq!(output.actions.len(), 1);

        let payload = &output.actions[0].payload;
        // CALL payload: 32 (value) + 32 (offset) + 32 (length) + padded_calldata
        // value should be 0 (ERC20 supply, not ETH)
        assert_eq!(&payload[0..32], &[0u8; 32], "Value should be 0 for ERC20 supply");

        // Offset should be 64
        assert_eq!(payload[63], 64);

        // calldata length = 132 (4 selector + 32 asset + 32 amount + 32 onBehalf + 32 referral)
        assert_eq!(payload[95], 132);

        // Check supply selector inside calldata
        assert_eq!(&payload[96..100], &SUPPLY_SELECTOR.to_be_bytes());
    }

    #[test]
    fn test_determinism() {
        let ctx = test_ctx();
        let input = make_market_input(
            [0x11u8; 20],
            [0x22u8; 20],
            [0x33u8; 20],
            1_000_000,
            0,
            500,
            200,
            8000,
            0,
        );
        let output1 = agent_main(&ctx, &input);
        let output2 = agent_main(&ctx, &input);
        assert_eq!(output1.actions.len(), output2.actions.len());
        for (a, b) in output1.actions.iter().zip(output2.actions.iter()) {
            assert_eq!(a.action_type, b.action_type);
            assert_eq!(a.target, b.target);
            assert_eq!(a.payload, b.payload);
        }
    }

    #[test]
    fn test_approve_and_supply() {
        let ctx = test_ctx();
        let input = make_market_input(
            [0x11u8; 20],  // lending_pool
            [0x22u8; 20],  // asset_token
            [0x33u8; 20],  // vault_address
            500_000,       // vault_balance
            0,             // supplied
            100,           // rate doesn't matter for approve_and_supply
            200,
            8000,
            3,             // FLAG_APPROVE_AND_SUPPLY
        );
        let output = agent_main(&ctx, &input);
        // Should produce 2 actions: approve + supply
        assert_eq!(output.actions.len(), 2);
        assert_eq!(output.actions[0].action_type, ACTION_TYPE_CALL); // approve
        assert_eq!(output.actions[1].action_type, ACTION_TYPE_CALL); // supply

        // First action target = asset_token (for approve)
        let expected_token_target = address_to_bytes32(&[0x22u8; 20]);
        assert_eq!(output.actions[0].target, expected_token_target);

        // Second action target = lending_pool (for supply)
        let expected_pool_target = address_to_bytes32(&[0x11u8; 20]);
        assert_eq!(output.actions[1].target, expected_pool_target);

        // Check approve selector in first action's calldata
        let approve_payload = &output.actions[0].payload;
        assert_eq!(&approve_payload[96..100], &APPROVE_SELECTOR_BYTES);

        // Check supply selector in second action's calldata
        let supply_payload = &output.actions[1].payload;
        assert_eq!(&supply_payload[96..100], &SUPPLY_SELECTOR.to_be_bytes());
    }

    #[test]
    fn test_approve_and_supply_zero_balance_no_action() {
        let ctx = test_ctx();
        let input = make_market_input(
            [0x11u8; 20],
            [0x22u8; 20],
            [0x33u8; 20],
            0,        // no balance
            500_000,
            500,
            200,
            8000,
            3,        // FLAG_APPROVE_AND_SUPPLY
        );
        let output = agent_main(&ctx, &input);
        assert!(output.actions.is_empty());
    }
}
