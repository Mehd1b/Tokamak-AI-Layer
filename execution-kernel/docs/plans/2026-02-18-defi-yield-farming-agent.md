# DeFi Yield Farming Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a verifiable DeFi yield farming agent that allocates vault capital to AAVE-like lending pools, register it on-chain via AgentRegistry, and deploy a KernelVault for it.

**Architecture:** The agent runs inside the RISC Zero zkVM as a deterministic function: it receives market state (supply/borrow rates, balances, thresholds) via `opaque_inputs`, computes an optimal capital allocation strategy using integer-only basis-points math, and outputs ordered `CALL` actions targeting an AAVE lending pool (supply, withdraw, or rebalance). A mock lending pool Solidity contract simulates AAVE's `supply()`/`withdraw()` interface for testnet deployment.

**Tech Stack:** Rust (no_std), kernel-sdk, Foundry (Solidity 0.8.24), TypeScript SDK (viem), Optimism Sepolia testnet

---

## Team Roles

- **DeFi Specialist**: Designs the yield farming strategy, rate comparison logic, input/output format, and basis-points math. Owns Tasks 1-4.
- **Blockchain Engineer**: Builds the mock lending pool contract, deployment script, on-chain registration, and vault deployment. Owns Tasks 5-8.

---

## Task 1: Create the Agent Crate Skeleton

**Owner:** DeFi Specialist

**Files:**
- Create: `crates/agents/examples/defi-yield-farmer/Cargo.toml`
- Create: `crates/agents/examples/defi-yield-farmer/build.rs`
- Create: `crates/agents/examples/defi-yield-farmer/src/lib.rs`
- Modify: `Cargo.toml` (workspace root — add new member)

**Step 1: Create `Cargo.toml`**

```toml
[package]
name = "defi-yield-farmer"
version = "0.1.0"
edition = "2021"
description = "DeFi yield farming agent targeting AAVE-like lending pools"
license = "Apache-2.0"

[lib]
crate-type = ["rlib"]

[dependencies]
kernel-sdk = { path = "../../../sdk/kernel-sdk" }

[build-dependencies]
sha2 = "0.10"
```

**Step 2: Create `build.rs`**

Copy from `crates/agents/examples/example-yield-agent/build.rs` and change the agent name string in comments from "example-yield-agent" to "defi-yield-farmer". The hash computation logic (`SHA256(src/lib.rs || 0x00 || Cargo.toml)`) is identical.

**Step 3: Create initial `src/lib.rs`**

Start with a minimal agent that returns empty output:

```rust
//! DeFi Yield Farming Agent
//!
//! Verifiable yield farming agent targeting AAVE-like lending pools.
//! Receives market state via opaque_inputs, computes optimal allocation,
//! and outputs CALL actions for supply/withdraw operations.

#![no_std]
#![deny(unsafe_code)]

extern crate alloc;

use alloc::vec::Vec;
use kernel_sdk::prelude::*;

// Include the generated agent hash constant.
include!(concat!(env!("OUT_DIR"), "/agent_hash.rs"));

/// Canonical agent entrypoint.
#[no_mangle]
#[allow(unsafe_code)]
pub extern "Rust" fn agent_main(_ctx: &AgentContext, _opaque_inputs: &[u8]) -> AgentOutput {
    AgentOutput {
        actions: Vec::new(),
    }
}

/// Compile-time check that agent_main matches the canonical AgentEntrypoint type.
const _: AgentEntrypoint = agent_main;
```

**Step 4: Add to workspace `Cargo.toml`**

In the root `Cargo.toml`, add `"crates/agents/examples/defi-yield-farmer"` to the `members` array, after the existing `"crates/agents/examples/example-yield-agent"` line.

**Step 5: Build to verify**

Run: `cargo build -p defi-yield-farmer`
Expected: Compiles successfully, prints `AGENT_CODE_HASH` warning.

**Step 6: Commit**

```bash
git add crates/agents/examples/defi-yield-farmer/ Cargo.toml
git commit -m "feat(agent): scaffold defi-yield-farmer agent crate"
```

---

## Task 2: Define the Input Format and Strategy Constants

**Owner:** DeFi Specialist

**Files:**
- Modify: `crates/agents/examples/defi-yield-farmer/src/lib.rs`

**Step 1: Write failing test for input parsing**

Add to `src/lib.rs`:

```rust
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
            100,           // supply_rate: 1% APY — below threshold
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
            100,           // supply_rate: 1% — dropped below threshold
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
```

**Step 2: Run tests to verify they fail**

Run: `cargo test -p defi-yield-farmer`
Expected: `test_supply_when_rate_above_threshold` fails (agent returns empty), etc.

**Step 3: Implement input parsing and constants**

Add to `src/lib.rs` (above `agent_main`):

```rust
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
```

**Step 4: Run tests again to confirm parsing works but strategy still fails**

Run: `cargo test -p defi-yield-farmer`
Expected: Still failing on strategy tests (we haven't implemented the logic yet).

**Step 5: Commit**

```bash
git add crates/agents/examples/defi-yield-farmer/src/lib.rs
git commit -m "feat(agent): define input format and parsing for defi-yield-farmer"
```

---

## Task 3: Implement the Yield Farming Strategy

**Owner:** DeFi Specialist

**Files:**
- Modify: `crates/agents/examples/defi-yield-farmer/src/lib.rs`

**Step 1: Implement the strategy logic in `agent_main`**

Replace the empty `agent_main` with:

```rust
#[no_mangle]
#[allow(unsafe_code)]
pub extern "Rust" fn agent_main(_ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput {
    let market = match parse_input(opaque_inputs) {
        Some(m) => m,
        None => return AgentOutput { actions: Vec::new() },
    };

    match market.action_flag {
        FLAG_FORCE_SUPPLY => force_supply(&market),
        FLAG_FORCE_WITHDRAW => force_withdraw(&market),
        FLAG_EVALUATE => evaluate_and_act(&market),
        _ => AgentOutput { actions: Vec::new() }, // Unknown flag -> no-op
    }
}
```

**Step 2: Implement the three strategy branches**

```rust
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
```

**Step 3: Implement the ABI-encoding helpers for AAVE calldata**

```rust
// ============================================================================
// ABI Encoding — AAVE Lending Pool Interface
// ============================================================================

/// Build a CALL action for AAVE supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode).
///
/// - target: lending_pool address
/// - value: 0 (ERC20 supply, not ETH)
/// - calldata: supply(asset, amount, vault_address, 0)
///
/// Note: The vault must have approved the lending pool to spend `amount` of `asset` before this call.
/// That approval is a separate action or pre-configured.
fn build_supply_action(market: &MarketInput, amount: u64) -> ActionV1 {
    let target = address_to_bytes32(&market.lending_pool);
    let calldata = encode_supply_call(&market.asset_token, amount, &market.lending_pool);
    call_action(target, 0, &calldata)
}

/// Build a CALL action for AAVE withdraw(address asset, uint256 amount, address to).
///
/// - target: lending_pool address
/// - value: 0
/// - calldata: withdraw(asset, amount, vault_address_as_recipient)
fn build_withdraw_action(market: &MarketInput, amount: u64) -> ActionV1 {
    let target = address_to_bytes32(&market.lending_pool);
    let calldata = encode_withdraw_call(&market.asset_token, amount, &market.lending_pool);
    call_action(target, 0, &calldata)
}

/// Encode supply(address, uint256, address, uint16) calldata.
///
/// Format: selector(4) + asset(32) + amount(32) + onBehalfOf(32) + referralCode(32) = 132 bytes
fn encode_supply_call(asset: &[u8; 20], amount: u64, _on_behalf_of: &[u8; 20]) -> Vec<u8> {
    let mut calldata = Vec::with_capacity(132);
    calldata.extend_from_slice(&SUPPLY_SELECTOR);
    // address asset (left-padded to 32 bytes)
    calldata.extend_from_slice(&address_to_bytes32(asset));
    // uint256 amount (big-endian, right-aligned in 32 bytes)
    calldata.extend_from_slice(&u64_to_u256_be(amount));
    // address onBehalfOf = address(0) — the vault itself will be msg.sender
    calldata.extend_from_slice(&[0u8; 32]);
    // uint16 referralCode = 0
    calldata.extend_from_slice(&[0u8; 32]);
    calldata
}

/// Encode withdraw(address, uint256, address) calldata.
///
/// Format: selector(4) + asset(32) + amount(32) + to(32) = 100 bytes
fn encode_withdraw_call(asset: &[u8; 20], amount: u64, _to: &[u8; 20]) -> Vec<u8> {
    let mut calldata = Vec::with_capacity(100);
    calldata.extend_from_slice(&WITHDRAW_SELECTOR);
    // address asset
    calldata.extend_from_slice(&address_to_bytes32(asset));
    // uint256 amount
    calldata.extend_from_slice(&u64_to_u256_be(amount));
    // address to = address(0) — recipient is msg.sender (vault)
    calldata.extend_from_slice(&[0u8; 32]);
    calldata
}

/// Convert a u64 to a big-endian u256 (32 bytes, right-aligned).
fn u64_to_u256_be(value: u64) -> [u8; 32] {
    let mut result = [0u8; 32];
    result[24..32].copy_from_slice(&value.to_be_bytes());
    result
}
```

**Step 4: Run all tests**

Run: `cargo test -p defi-yield-farmer`
Expected: All 4 tests pass.

**Step 5: Commit**

```bash
git add crates/agents/examples/defi-yield-farmer/src/lib.rs
git commit -m "feat(agent): implement yield farming strategy with supply/withdraw/evaluate"
```

---

## Task 4: Add Comprehensive Tests and Edge Cases

**Owner:** DeFi Specialist

**Files:**
- Modify: `crates/agents/examples/defi-yield-farmer/src/lib.rs`

**Step 1: Add edge-case and strategy tests**

Append to the `tests` module:

```rust
    #[test]
    fn test_force_supply_all_balance() {
        let ctx = test_ctx();
        let input = make_market_input(
            [0x11u8; 20],
            [0x22u8; 20],
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
        assert_eq!(&payload[96..100], &SUPPLY_SELECTOR);
    }

    #[test]
    fn test_determinism() {
        let ctx = test_ctx();
        let input = make_market_input(
            [0x11u8; 20],
            [0x22u8; 20],
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
```

**Step 2: Run all tests**

Run: `cargo test -p defi-yield-farmer`
Expected: All tests pass (12+ tests).

**Step 3: Run the full workspace tests to ensure no regressions**

Run: `cargo test`
Expected: All existing tests + new tests pass.

**Step 4: Commit**

```bash
git add crates/agents/examples/defi-yield-farmer/src/lib.rs
git commit -m "test(agent): comprehensive tests for defi-yield-farmer strategy"
```

---

## Task 5: Create the Kernel Guest Wrapper

**Owner:** Blockchain Engineer

**Files:**
- Create: `crates/agents/wrappers/kernel-guest-binding-defi-yield/Cargo.toml`
- Create: `crates/agents/wrappers/kernel-guest-binding-defi-yield/src/lib.rs`
- Modify: `Cargo.toml` (workspace root — add new member)

**Step 1: Create `Cargo.toml`**

```toml
[package]
name = "kernel-guest-binding-defi-yield"
version = "0.1.0"
edition = "2021"
description = "Wrapper crate binding defi-yield-farmer to kernel-guest"
license = "Apache-2.0"

[lib]
crate-type = ["rlib"]

[dependencies]
kernel-guest = { path = "../../../runtime/kernel-guest" }
kernel-sdk = { path = "../../../sdk/kernel-sdk" }
kernel-core = { path = "../../../protocol/kernel-core", default-features = false }
constraints = { path = "../../../protocol/constraints" }
defi-yield-farmer = { path = "../../examples/defi-yield-farmer" }

[features]
default = []
risc0 = ["kernel-guest/risc0"]
```

**Step 2: Create `src/lib.rs`**

```rust
//! Wrapper crate binding defi-yield-farmer to kernel-guest.
//!
//! Implements [`kernel_guest::AgentEntrypoint`] for the DeFi yield farming agent.

use kernel_core::AgentOutput;
use kernel_guest::AgentEntrypoint;
use kernel_sdk::agent::AgentContext;

pub use defi_yield_farmer::AGENT_CODE_HASH;

/// Wrapper implementing [`AgentEntrypoint`] for the defi-yield-farmer.
pub struct DefiYieldFarmerWrapper;

impl AgentEntrypoint for DefiYieldFarmerWrapper {
    fn code_hash(&self) -> [u8; 32] {
        defi_yield_farmer::AGENT_CODE_HASH
    }

    fn run(&self, ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput {
        defi_yield_farmer::agent_main(ctx, opaque_inputs)
    }
}

/// Convenience function for kernel execution with the defi-yield-farmer.
pub fn kernel_main(input_bytes: &[u8]) -> Result<Vec<u8>, kernel_guest::KernelError> {
    kernel_guest::kernel_main_with_agent(input_bytes, &DefiYieldFarmerWrapper)
}

/// Convenience function for kernel execution with custom constraints.
pub fn kernel_main_with_constraints(
    input_bytes: &[u8],
    constraint_set: &constraints::ConstraintSetV1,
) -> Result<Vec<u8>, kernel_guest::KernelError> {
    kernel_guest::kernel_main_with_agent_and_constraints(
        input_bytes,
        &DefiYieldFarmerWrapper,
        constraint_set,
    )
}

pub use kernel_guest::KernelError;
```

**Step 3: Add to workspace `Cargo.toml`**

Add `"crates/agents/wrappers/kernel-guest-binding-defi-yield"` to the `members` array, after `"crates/agents/wrappers/kernel-guest-binding-yield"`.

**Step 4: Build to verify**

Run: `cargo build -p kernel-guest-binding-defi-yield`
Expected: Compiles successfully.

**Step 5: Commit**

```bash
git add crates/agents/wrappers/kernel-guest-binding-defi-yield/ Cargo.toml
git commit -m "feat(agent): create kernel-guest wrapper for defi-yield-farmer"
```

---

## Task 6: Create the Mock AAVE Lending Pool Contract

**Owner:** Blockchain Engineer

**Files:**
- Create: `contracts/src/MockLendingPool.sol`
- Create: `contracts/test/MockLendingPool.t.sol`

**Step 1: Write the mock contract**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20 } from "./IERC20.sol";

/// @title MockLendingPool
/// @notice Mock AAVE-like lending pool for testing the DeFi yield farming agent.
/// @dev Simplified: tracks deposits per user, returns 5% yield on withdraw.
contract MockLendingPool {
    // ============ State ============

    /// @notice Deposited amounts per (user, asset) pair
    mapping(address => mapping(address => uint256)) public deposits;

    /// @notice Allowed vaults that can interact
    mapping(address => bool) public allowedVaults;

    /// @notice Owner for vault allowlisting
    address public owner;

    // ============ Events ============

    event Supply(address indexed user, address indexed asset, uint256 amount);
    event Withdraw(address indexed user, address indexed asset, uint256 amount, address to);

    // ============ Errors ============

    error InsufficientDeposit();
    error TransferFailed();

    // ============ Constructor ============

    constructor() {
        owner = msg.sender;
    }

    // ============ Admin ============

    /// @notice Allow a vault to interact with this pool
    function allowVault(address vault) external {
        require(msg.sender == owner, "Only owner");
        allowedVaults[vault] = true;
    }

    // ============ AAVE-Compatible Interface ============

    /// @notice Supply assets to the lending pool (AAVE V3 compatible signature)
    /// @param asset The ERC20 token to supply
    /// @param amount Amount to supply
    /// @param onBehalfOf Unused in mock (always msg.sender)
    /// @param referralCode Unused in mock
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external {
        // Suppress unused variable warnings
        onBehalfOf;
        referralCode;

        // Transfer tokens from sender to this contract
        bool success = IERC20(asset).transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();

        deposits[msg.sender][asset] += amount;
        emit Supply(msg.sender, asset, amount);
    }

    /// @notice Withdraw assets from the lending pool (AAVE V3 compatible signature)
    /// @param asset The ERC20 token to withdraw
    /// @param amount Amount to withdraw
    /// @param to Recipient address (unused in mock — always sends to msg.sender)
    /// @return The actual amount withdrawn (principal + 5% yield)
    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        to; // suppress unused

        uint256 deposited = deposits[msg.sender][asset];
        if (deposited < amount) revert InsufficientDeposit();

        deposits[msg.sender][asset] = deposited - amount;

        // Return principal + 5% mock yield
        uint256 yieldAmount = amount / 20; // 5%
        uint256 totalReturn = amount + yieldAmount;

        // Transfer back to sender
        bool success = IERC20(asset).transfer(msg.sender, totalReturn);
        if (!success) revert TransferFailed();

        emit Withdraw(msg.sender, asset, totalReturn, msg.sender);
        return totalReturn;
    }

    // ============ View ============

    /// @notice Get deposit amount for a user/asset pair
    function getDeposit(address user, address asset) external view returns (uint256) {
        return deposits[user][asset];
    }

    /// @notice Receive ETH (for funding yield reserves)
    receive() external payable {}
}
```

**Step 2: Write tests for the mock contract**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockLendingPool } from "../src/MockLendingPool.sol";

// Minimal ERC20 for testing
contract MockERC20 {
    string public name = "Mock Token";
    string public symbol = "MOCK";
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "No allowance");
        require(balanceOf[from] >= amount, "Insufficient");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockLendingPoolTest is Test {
    MockLendingPool pool;
    MockERC20 token;
    address vault = address(0xBEEF);

    function setUp() public {
        pool = new MockLendingPool();
        token = new MockERC20();

        // Fund pool with extra tokens for yield payments
        token.mint(address(pool), 100_000 ether);

        // Give vault some tokens
        token.mint(vault, 10_000 ether);
    }

    function test_supply() public {
        vm.startPrank(vault);
        token.approve(address(pool), 1000 ether);
        pool.supply(address(token), 1000 ether, address(0), 0);
        vm.stopPrank();

        assertEq(pool.getDeposit(vault, address(token)), 1000 ether);
    }

    function test_withdraw_with_yield() public {
        vm.startPrank(vault);
        token.approve(address(pool), 1000 ether);
        pool.supply(address(token), 1000 ether, address(0), 0);

        uint256 balanceBefore = token.balanceOf(vault);
        pool.withdraw(address(token), 1000 ether, vault);
        uint256 balanceAfter = token.balanceOf(vault);
        vm.stopPrank();

        // Should receive 1000 + 5% = 1050
        assertEq(balanceAfter - balanceBefore, 1050 ether);
        assertEq(pool.getDeposit(vault, address(token)), 0);
    }

    function test_withdraw_insufficient_reverts() public {
        vm.startPrank(vault);
        token.approve(address(pool), 100 ether);
        pool.supply(address(token), 100 ether, address(0), 0);

        vm.expectRevert(MockLendingPool.InsufficientDeposit.selector);
        pool.withdraw(address(token), 200 ether, vault);
        vm.stopPrank();
    }
}
```

**Step 3: Run contract tests**

Run: `cd contracts && forge test --match-contract MockLendingPoolTest -vv`
Expected: All 3 tests pass.

**Step 4: Commit**

```bash
git add contracts/src/MockLendingPool.sol contracts/test/MockLendingPool.t.sol
git commit -m "feat(contracts): add MockLendingPool with AAVE-compatible interface"
```

---

## Task 7: Create the Deployment Script

**Owner:** Blockchain Engineer

**Files:**
- Create: `contracts/script/DeployDefiYieldAgent.s.sol`

**Step 1: Write the deployment script**

This script registers the agent, deploys a vault, and deploys the mock lending pool.

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { VaultFactory } from "../src/VaultFactory.sol";
import { MockLendingPool } from "../src/MockLendingPool.sol";

/// @title DeployDefiYieldAgent
/// @notice Registers the DeFi yield farming agent, deploys a vault, and deploys MockLendingPool
contract DeployDefiYieldAgent is Script {
    function run() external {
        // Load addresses from environment
        address registryAddr = vm.envAddress("AGENT_REGISTRY");
        address factoryAddr = vm.envAddress("VAULT_FACTORY");

        AgentRegistry registry = AgentRegistry(registryAddr);
        VaultFactory factory = VaultFactory(factoryAddr);

        // DeFi yield farmer agent parameters
        // These values come from `cargo build -p defi-yield-farmer` output
        // and RISC Zero compilation. For testnet, use placeholder imageId.
        bytes32 imageId = vm.envBytes32("DEFI_AGENT_IMAGE_ID");
        bytes32 agentCodeHash = vm.envBytes32("DEFI_AGENT_CODE_HASH");
        bytes32 salt = keccak256("defi-yield-farmer-v1");

        // Vault: ETH-based for simplicity (address(0))
        address asset = address(0);
        bytes32 userSalt = keccak256("defi-yield-vault-v1");

        console.log("=== Deploy DeFi Yield Farming Agent ===");
        console.log("AgentRegistry:", registryAddr);
        console.log("VaultFactory:", factoryAddr);

        vm.startBroadcast();

        // Step 1: Register the agent
        bytes32 agentId = registry.register(salt, imageId, agentCodeHash);
        console.log("Agent registered with ID:");
        console.logBytes32(agentId);

        // Step 2: Deploy vault via factory
        address vault = factory.deployVault(agentId, asset, userSalt);
        console.log("Vault deployed at:", vault);

        // Step 3: Deploy MockLendingPool
        MockLendingPool lendingPool = new MockLendingPool();
        console.log("MockLendingPool deployed at:", address(lendingPool));

        // Step 4: Allow the vault to use the lending pool
        lendingPool.allowVault(vault);
        console.log("Vault allowed on MockLendingPool");

        // Step 5: Fund lending pool with ETH for yield reserves
        (bool success,) = address(lendingPool).call{ value: 0.01 ether }("");
        require(success, "Failed to fund MockLendingPool");
        console.log("MockLendingPool funded with 0.01 ETH");

        vm.stopBroadcast();

        // Verification
        console.log("\n=== Verification ===");
        console.log("Agent count:", registry.agentCount());
        console.log("Vault count:", factory.vaultCount());
        console.log("Agent exists:", registry.agentExists(agentId));
        console.log("Vault is deployed:", factory.isDeployedVault(vault));
    }
}
```

**Step 2: Verify the script compiles**

Run: `cd contracts && forge build`
Expected: Compiles without errors.

**Step 3: Commit**

```bash
git add contracts/script/DeployDefiYieldAgent.s.sol
git commit -m "feat(deploy): add deployment script for defi yield farming agent"
```

---

## Task 8: Deploy On-Chain — Register Agent and Deploy Vault

**Owner:** Blockchain Engineer

**Prerequisites:** Requires funded wallet on Optimism Sepolia and `.env` configuration.

**Files:**
- Create: `contracts/script/deploy-defi-yield-agent.sh`

**Step 1: Create the shell deployment script**

```bash
#!/bin/bash
set -e

cd "$(dirname "$0")/.."

source .env

# Get the agent code hash from cargo build output
echo "Building defi-yield-farmer agent..."
AGENT_HASH_LINE=$(cd ../.. && cargo build -p defi-yield-farmer 2>&1 | grep "AGENT_CODE_HASH")
echo "Agent hash output: $AGENT_HASH_LINE"

echo ""
echo "=== Deploying DeFi Yield Farming Agent ==="
echo "Registry: $AGENT_REGISTRY"
echo "Factory: $VAULT_FACTORY"
echo ""

# Use placeholder imageId for testnet (real imageId requires RISC Zero compilation)
export DEFI_AGENT_IMAGE_ID=${DEFI_AGENT_IMAGE_ID:-0x0000000000000000000000000000000000000000000000000000000000000001}
export DEFI_AGENT_CODE_HASH=${DEFI_AGENT_CODE_HASH:-0x0000000000000000000000000000000000000000000000000000000000000001}

forge script script/DeployDefiYieldAgent.s.sol:DeployDefiYieldAgent \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  -vvvv
```

**Step 2: Make it executable**

Run: `chmod +x contracts/script/deploy-defi-yield-agent.sh`

**Step 3: Deploy to Optimism Sepolia**

This step requires:
- `contracts/.env` with `RPC_URL`, `PRIVATE_KEY`, `AGENT_REGISTRY`, `VAULT_FACTORY` set
- Funded wallet on Optimism Sepolia

Run: `cd contracts && ./script/deploy-defi-yield-agent.sh`

Expected output:
```
=== Deploy DeFi Yield Farming Agent ===
Agent registered with ID: 0x...
Vault deployed at: 0x...
MockLendingPool deployed at: 0x...
=== Verification ===
Agent exists: true
Vault is deployed: true
```

**Step 4: Record the deployed addresses**

After deployment, save the output addresses:
- Agent ID
- Vault address
- MockLendingPool address

**Step 5: Commit the deployment script**

```bash
git add contracts/script/deploy-defi-yield-agent.sh
git commit -m "feat(deploy): shell script for deploying defi yield agent to Optimism Sepolia"
```

---

## Task 9: Integration Test — Full Kernel Execution

**Owner:** Blockchain Engineer (with DeFi Specialist review)

**Files:**
- Modify: `crates/testing/kernel-host-tests/src/lib.rs` (or create a new test file)

**Step 1: Write a kernel-level integration test**

Add a test that constructs `KernelInputV1`, runs through the kernel with the DeFi yield farmer wrapper, and validates the journal output.

```rust
#[test]
fn test_defi_yield_farmer_kernel_integration() {
    use kernel_core::{KernelInputV1, KernelJournalV1};
    use kernel_core::codec::{CanonicalEncode, CanonicalDecode};
    use kernel_guest_binding_defi_yield::{kernel_main, AGENT_CODE_HASH};

    // Build opaque inputs: supply scenario
    let lending_pool = [0x11u8; 20];
    let asset_token = [0x22u8; 20];
    let vault_balance: u64 = 1_000_000;
    let supplied_amount: u64 = 0;
    let supply_rate_bps: u32 = 500;      // 5%
    let min_supply_rate_bps: u32 = 200;  // 2%
    let target_util_bps: u32 = 8000;     // 80%
    let action_flag: u8 = 0;             // evaluate

    let mut opaque = Vec::with_capacity(69);
    opaque.extend_from_slice(&lending_pool);
    opaque.extend_from_slice(&asset_token);
    opaque.extend_from_slice(&vault_balance.to_le_bytes());
    opaque.extend_from_slice(&supplied_amount.to_le_bytes());
    opaque.extend_from_slice(&supply_rate_bps.to_le_bytes());
    opaque.extend_from_slice(&min_supply_rate_bps.to_le_bytes());
    opaque.extend_from_slice(&target_util_bps.to_le_bytes());
    opaque.push(action_flag);

    // Build kernel input
    let input = KernelInputV1 {
        protocol_version: 1,
        kernel_version: 1,
        agent_id: [0x42u8; 32],
        agent_code_hash: AGENT_CODE_HASH,
        constraint_set_hash: [0u8; 32],
        input_root: [0u8; 32],
        execution_nonce: 1,
        opaque_agent_inputs: opaque,
    };

    let input_bytes = input.encode().expect("encoding input");
    let journal_bytes = kernel_main(&input_bytes).expect("kernel execution");
    let journal = KernelJournalV1::decode(&journal_bytes).expect("decoding journal");

    // Verify journal
    assert_eq!(journal.protocol_version, 1);
    assert_eq!(journal.kernel_version, 1);
    assert_eq!(journal.agent_id, [0x42u8; 32]);
    assert_eq!(journal.agent_code_hash, AGENT_CODE_HASH);
    assert_eq!(journal.execution_nonce, 1);
    // execution_status should be Success (0x01)
    assert_eq!(journal.execution_status as u8, 0x01);
    // action_commitment should NOT be the empty-output commitment
    // (since the agent should produce a supply action)
    let empty_commitment = kernel_core::hash::compute_action_commitment(&[0x00, 0x00, 0x00, 0x00]);
    assert_ne!(journal.action_commitment, empty_commitment);
}
```

**Step 2: Add `kernel-guest-binding-defi-yield` as a dependency to the test crate**

In `crates/testing/kernel-host-tests/Cargo.toml`, add:
```toml
kernel-guest-binding-defi-yield = { path = "../../agents/wrappers/kernel-guest-binding-defi-yield" }
```

**Step 3: Run the integration test**

Run: `cargo test -p kernel-host-tests test_defi_yield_farmer_kernel_integration`
Expected: Test passes.

**Step 4: Run full test suite**

Run: `cargo test`
Expected: All tests pass (existing + new).

**Step 5: Commit**

```bash
git add crates/testing/kernel-host-tests/
git commit -m "test(integration): kernel integration test for defi-yield-farmer"
```

---

## Summary

| Task | Owner | Description | Deliverable |
|------|-------|-------------|-------------|
| 1 | DeFi Specialist | Agent crate skeleton | Compiling `defi-yield-farmer` crate |
| 2 | DeFi Specialist | Input format + parsing | Parsed `MarketInput` struct with tests |
| 3 | DeFi Specialist | Strategy implementation | Supply/withdraw/evaluate logic |
| 4 | DeFi Specialist | Edge-case tests | 12+ comprehensive tests |
| 5 | Blockchain Engineer | Kernel wrapper | `kernel-guest-binding-defi-yield` crate |
| 6 | Blockchain Engineer | Mock lending pool | `MockLendingPool.sol` + tests |
| 7 | Blockchain Engineer | Deployment script | `DeployDefiYieldAgent.s.sol` |
| 8 | Blockchain Engineer | On-chain deployment | Agent registered, vault deployed |
| 9 | Blockchain Engineer | Integration test | Full kernel execution test |

**Parallelizable work:** Tasks 1-4 (DeFi Specialist) and Tasks 5-7 (Blockchain Engineer) can run in parallel after Task 1 completes (since the wrapper in Task 5 depends on the crate existing). Task 8 depends on Tasks 1-7. Task 9 depends on Tasks 1-5.
