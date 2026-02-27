//! Perpetual Futures Trading Agent (Hyperliquid)
//!
//! Verifiable perp trading agent implementing dual strategy modes with
//! configurable risk parameters. Receives pre-computed indicators and market
//! state via opaque_inputs, makes deterministic trading decisions, and outputs
//! CALL actions for position management.
//!
//! # Input Format (variable length)
//!
//! The `opaque_agent_inputs` field is split into three parts:
//!
//! ## Part 1: StateSnapshotV1 (first 36 bytes)
//!
//! Used by the constraint engine for drawdown/cooldown checks AND by the agent
//! for its own internal drawdown circuit breaker.
//!
//! ```text
//! [0:4]    snapshot_version (u32 LE, must be 1)
//! [4:12]   last_execution_ts (u64 LE)
//! [12:20]  current_ts (u64 LE)
//! [20:28]  current_equity (u64 LE)
//! [28:36]  peak_equity (u64 LE)
//! ```
//!
//! ## Part 2: OraclePriceFeed (variable, 111..607 bytes)
//!
//! Off-chain signed price feed verified inside the ZK proof. The SHA-256 hash
//! of the feed body is bound to `ctx.input_root` in the journal, and the ECDSA
//! signature is verified on-chain via `ecrecover`.
//!
//! ## Part 3: PerpInput (238 bytes)
//!
//! Agent-specific market data, position state, and strategy parameters.
//! All prices are 1e8-scaled u64 values. Signed values use magnitude + bool flag.
//!
//! # Strategy Modes
//!
//! ## Mode 0: SMA Crossover (default)
//!
//! **Entry (requires all 3 confluences):**
//! - SMA crossover (fast crosses slow)
//! - RSI in neutral zone (between oversold and overbought)
//! - Funding rate favorable or negligible
//!
//! ## Mode 1: Funding Rate Arbitrage
//!
//! **Entry (requires both):**
//! - Funding rate exceeds threshold
//! - Go opposite direction to collect funding payments
//!
//! **Common Exit (any single trigger):**
//! - Stop loss hit
//! - Take profit hit
//! - Funding rate reversal (3x threshold against position)
//! - Trend reversal (SMA crosses against position, Mode 0 only)
//! - Drawdown circuit breaker (configurable, default 5%)
//! - Liquidation proximity (within 3% of mark price)
//! - Drawdown cooldown active (host-enforced lockout)
//!
//! # Output Actions
//!
//! CALL actions targeting a Hyperliquid adapter contract:
//! - Open position: approve USDC + openPosition(bool isBuy, uint256 marginAmount, uint256 orderSize, uint256 price)
//! - Close position: closePosition() + withdrawToVault()

#![no_std]
#![deny(unsafe_code)]

extern crate alloc;

use alloc::vec::Vec;
use constraints::StateSnapshotV1;
use kernel_sdk::actions::CallBuilder;
use kernel_sdk::prelude::*;

// Include the generated agent hash constant.
include!(concat!(env!("OUT_DIR"), "/agent_hash.rs"));

// ============================================================================
// Constants
// ============================================================================

/// Price scaling factor: 1e8 (supports prices up to ~184 billion).
/// Used by off-chain host to encode prices. Referenced in tests.
#[cfg(test)]
const PRICE_SCALE: u64 = 100_000_000;

/// Default maximum drawdown in basis points (5%).
/// Used when max_drawdown_bps input is 0 (unconfigured).
const DEFAULT_MAX_DRAWDOWN_BPS: u64 = 500;

/// Safety margin in basis points (1%).
/// The agent closes positions at max_drawdown - safety_margin to leave room
/// before the constraint engine's hard limit triggers.
const DRAWDOWN_SAFETY_MARGIN_BPS: u64 = 100;

/// Liquidation proximity threshold in basis points (3% of mark price).
/// If mark price is within this distance of liquidation price, close immediately.
const LIQUIDATION_PROXIMITY_BPS: u64 = 300;

/// Funding rate reversal multiplier.
/// Exit when funding rate exceeds threshold * this multiplier against position direction.
const FUNDING_REVERSAL_MULTIPLIER: u64 = 3;


/// HyperliquidAdapter.openPosition(bool isBuy, uint256 marginAmount, uint256 orderSize, uint256 limitPrice)
/// Selector: keccak256("openPosition(bool,uint256,uint256,uint256)")[:4] = 0x04ba41cb
const OPEN_POSITION_SELECTOR: u32 = 0x04ba41cb;

/// HyperliquidAdapter.closePosition()
/// Selector: keccak256("closePosition()")[:4] = 0xc393d0e3
const CLOSE_POSITION_SELECTOR: u32 = 0xc393d0e3;

/// HyperliquidAdapter.withdrawToVault()
/// Selector: keccak256("withdrawToVault()")[:4] = 0x84f22721

/// Action flag: evaluate market conditions and decide
const FLAG_EVALUATE: u8 = 0;

/// Action flag: force close any open position
const FLAG_FORCE_CLOSE: u8 = 1;

/// Action flag: force flat (no-op, stay out of market)
const FLAG_FORCE_FLAT: u8 = 2;

/// Strategy mode: SMA crossover with RSI + funding confirmation
const STRATEGY_SMA_CROSSOVER: u8 = 0;

/// Strategy mode: Funding rate arbitrage (delta-neutral yield capture)
const STRATEGY_FUNDING_ARB: u8 = 1;

/// Asset ID for the primary traded asset (e.g., BTC-PERP) in the oracle feed.
/// This is the application-level identifier the host uses when building the feed.
const ORACLE_ASSET_ID_MARK: u32 = 1;

/// Maximum staleness for oracle data (seconds). If feed timestamp is older
/// than snapshot.current_ts - this value, the agent refuses to act.
const MAX_ORACLE_STALENESS_SECONDS: u64 = 120;

// ============================================================================
// Input Parsing
// ============================================================================

kernel_sdk::agent_input! {
    struct PerpInput {
        // Addresses (60 bytes)
        exchange_contract: [u8; 20],
        vault_address:     [u8; 20],
        usdc_token:        [u8; 20],
        // Prices (32 bytes, 1e8 scaled)
        mark_price:  u64,
        index_price: u64,
        best_bid:    u64,
        best_ask:    u64,
        // Funding rate (9 bytes, sign encoded as magnitude + bool)
        funding_rate_abs:    u64,
        funding_rate_is_neg: bool,
        // Position state (26 bytes)
        position_size_abs:   u64,
        position_is_short:   bool,
        entry_price:         u64,
        unrealized_pnl_abs:  u64,
        unrealized_pnl_neg:  bool,
        // Account state (24 bytes)
        available_balance:   u64,
        account_equity:      u64,
        margin_used:         u64,
        // Indicators (36 bytes, pre-computed by host)
        sma_fast:       u64,
        sma_slow:       u64,
        rsi_value:      u32,
        prev_sma_fast:  u64,
        prev_sma_slow:  u64,
        // Risk params (16 bytes, all bps)
        max_leverage_bps:    u32,
        max_position_bps:    u32,
        stop_loss_bps:       u32,
        take_profit_bps:     u32,
        // Strategy config (17 bytes)
        rsi_oversold_bps:    u32,
        rsi_overbought_bps:  u32,
        funding_threshold:   u64,
        action_flag:         u8,
        // Liquidation (8 bytes)
        liquidation_price:   u64,
        // === NEW FIELDS (Enhancement 2, 4) ===
        // Drawdown config (9 bytes)
        max_drawdown_bps:          u32,   // Configurable max drawdown (bps). 0 = use default (500 = 5%)
        drawdown_cooldown_seconds: u32,   // Lockout duration after drawdown-triggered close
        in_drawdown_cooldown:      bool,  // Host signals: vault is in drawdown lockout
        // Strategy mode (1 byte)
        strategy_mode:             u8,    // 0 = SMA crossover, 1 = Funding rate arb
        // Hyperliquid asset size decimals (1 byte)
        sz_decimals:               u8,    // Asset szDecimals (BTC=5, ETH=4, SOL=2)
    }
}

// ============================================================================
// Agent Entry Point
// ============================================================================

/// Canonical agent entrypoint.
///
/// Parses three-part input:
///   1. StateSnapshotV1 (36 bytes) — drawdown/cooldown state
///   2. OraclePriceFeed (variable, 111..607 bytes) — verified market prices
///   3. PerpInput (238 bytes) — strategy parameters, position state
///
/// The oracle feed hash is verified against `ctx.input_root` to bind the
/// price data to the ZK proof. Staleness is checked against the snapshot timestamp.
pub extern "Rust" fn agent_main(ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput {
    let empty = AgentOutput { actions: Vec::new() };

    // Minimum length: snapshot + smallest oracle feed (1 price) + perp input
    let min_len = StateSnapshotV1::ENCODED_SIZE
        + kernel_sdk::oracle::feed_wire_len(1)
        + PerpInput::ENCODED_SIZE;
    if opaque_inputs.len() < min_len {
        return empty;
    }

    // Part 1: Parse StateSnapshotV1 (first 36 bytes)
    let snapshot = match StateSnapshotV1::decode(&opaque_inputs[..StateSnapshotV1::ENCODED_SIZE]) {
        Some(s) => s,
        None => return empty,
    };

    // Part 2: Decode OraclePriceFeed from the middle section
    let oracle_start = StateSnapshotV1::ENCODED_SIZE;
    let oracle_section = &opaque_inputs[oracle_start..];
    let feed = match decode_price_feed(oracle_section) {
        Some(f) => f,
        None => return empty,
    };

    // Verify feed commitment: SHA256(feed body) must equal ctx.input_root
    if !verify_feed_commitment(&feed, ctx) {
        return empty;
    }

    // Staleness check: feed must not be older than MAX_ORACLE_STALENESS_SECONDS
    if snapshot.current_ts > feed.timestamp {
        if snapshot.current_ts - feed.timestamp > MAX_ORACLE_STALENESS_SECONDS {
            return empty;
        }
    }

    // Part 3: Parse PerpInput from bytes after the oracle feed
    let oracle_len = kernel_sdk::oracle::feed_wire_len(feed.price_count);
    let perp_start = oracle_start + oracle_len;
    if opaque_inputs.len() < perp_start + PerpInput::ENCODED_SIZE {
        return empty;
    }
    let mut input = match PerpInput::decode(&opaque_inputs[perp_start..perp_start + PerpInput::ENCODED_SIZE]) {
        Some(m) => m,
        None => return empty,
    };

    // Override mark_price with verified oracle price (if available)
    if let Some(verified_price) = get_price(&feed, ORACLE_ASSET_ID_MARK) {
        input.mark_price = verified_price;
    }

    // Dispatch on action flag
    match input.action_flag {
        FLAG_FORCE_CLOSE => {
            if has_position(&input) {
                build_close_actions(&input)
            } else {
                empty
            }
        }
        FLAG_FORCE_FLAT => empty,
        FLAG_EVALUATE => evaluate_and_act(&snapshot, &input),
        _ => empty,
    }
}

/// Compile-time check that agent_main matches the canonical AgentEntrypoint type.
const _: AgentEntrypoint = agent_main;

// Generate kernel_main, kernel_main_with_constraints, and KernelError re-export.
kernel_sdk::agent_entrypoint!(agent_main);

// ============================================================================
// Strategy Logic
// ============================================================================

/// Resolve the effective max drawdown threshold (agent-internal, below the constraint hard limit).
fn effective_max_drawdown_bps(input: &PerpInput) -> u64 {
    let configured = if input.max_drawdown_bps == 0 {
        DEFAULT_MAX_DRAWDOWN_BPS
    } else {
        input.max_drawdown_bps as u64
    };

    // Apply safety margin: close positions before the constraint engine's hard limit
    if configured > DRAWDOWN_SAFETY_MARGIN_BPS {
        configured - DRAWDOWN_SAFETY_MARGIN_BPS
    } else {
        // If configured is very low, use half of it as threshold
        configured / 2
    }
}

/// Main strategy evaluation: risk checks, exit conditions, entry signals.
fn evaluate_and_act(snapshot: &StateSnapshotV1, input: &PerpInput) -> AgentOutput {
    // Sanity: need valid mark price
    if input.mark_price == 0 {
        return AgentOutput { actions: Vec::new() };
    }

    // ---- Drawdown cooldown lockout ----
    // If we're in drawdown cooldown, only allow closing positions (no new entries)
    if input.in_drawdown_cooldown {
        if has_position(input) {
            return build_close_actions(input);
        }
        return AgentOutput { actions: Vec::new() };
    }

    // ---- Pre-trade risk checks ----

    // 1. Drawdown circuit breaker (configurable, default 5%)
    let max_dd = effective_max_drawdown_bps(input);
    if snapshot.peak_equity > 0 {
        if let Some(dd) = drawdown_bps(snapshot.current_equity, snapshot.peak_equity) {
            if dd >= max_dd && has_position(input) {
                return build_close_actions(input);
            }
            // If drawdown exceeded and no position, don't open new ones
            if dd >= max_dd {
                return AgentOutput { actions: Vec::new() };
            }
        }
    }

    // 2. Liquidation proximity check
    if has_position(input) && input.liquidation_price > 0 {
        let diff = if input.mark_price > input.liquidation_price {
            input.mark_price - input.liquidation_price
        } else {
            input.liquidation_price - input.mark_price
        };
        if let Some(proximity) = checked_mul_div_u64(diff, BPS_DENOMINATOR, input.mark_price) {
            if proximity < LIQUIDATION_PROXIMITY_BPS {
                return build_close_actions(input);
            }
        }
    }

    // ---- Position management ----
    if has_position(input) {
        check_exit_conditions(input)
    } else {
        // Dispatch to strategy-specific entry logic
        match input.strategy_mode {
            STRATEGY_FUNDING_ARB => check_funding_arb_entry(input),
            _ => check_entry_signals(input), // Default to SMA crossover
        }
    }
}

/// Check exit conditions for an existing position. Any single trigger closes.
fn check_exit_conditions(input: &PerpInput) -> AgentOutput {
    // 1. Stop-loss
    if stop_loss_triggered(input) {
        return build_close_actions(input);
    }

    // 2. Take-profit
    if take_profit_triggered(input) {
        return build_close_actions(input);
    }

    // 3. Funding rate reversal (3x threshold against position)
    if funding_reversal_triggered(input) {
        return build_close_actions(input);
    }

    // 4. Trend reversal (SMA cross against position direction)
    //    Only applies in SMA crossover mode
    if input.strategy_mode == STRATEGY_SMA_CROSSOVER && trend_reversal_triggered(input) {
        return build_close_actions(input);
    }

    // No exit trigger -> hold position
    AgentOutput { actions: Vec::new() }
}

/// Check entry signals for SMA crossover mode.
/// Requires 3 confluences: SMA cross + RSI + funding.
fn check_entry_signals(input: &PerpInput) -> AgentOutput {
    // Need equity to trade
    if input.account_equity == 0 || input.available_balance == 0 {
        return AgentOutput { actions: Vec::new() };
    }

    // Check for long entry
    if sma_bullish_cross(input)
        && rsi_in_neutral_zone(input)
        && funding_favorable_for_long(input)
    {
        let margin = compute_margin_amount(input);
        let order_size = compute_order_size(margin, input.mark_price, input.sz_decimals, input.max_leverage_bps);
        if margin > 0 && order_size > 0 {
            return build_open_long_actions(input, margin, order_size);
        }
    }

    // Check for short entry
    if sma_bearish_cross(input)
        && rsi_in_neutral_zone(input)
        && funding_favorable_for_short(input)
    {
        let margin = compute_margin_amount(input);
        let order_size = compute_order_size(margin, input.mark_price, input.sz_decimals, input.max_leverage_bps);
        if margin > 0 && order_size > 0 {
            return build_open_short_actions(input, margin, order_size);
        }
    }

    // No signal
    AgentOutput { actions: Vec::new() }
}

/// Check entry signals for funding rate arbitrage mode.
/// Goes opposite direction of funding to collect yield.
fn check_funding_arb_entry(input: &PerpInput) -> AgentOutput {
    // Need equity to trade
    if input.account_equity == 0 || input.available_balance == 0 {
        return AgentOutput { actions: Vec::new() };
    }

    // Need a funding threshold configured
    if input.funding_threshold == 0 {
        return AgentOutput { actions: Vec::new() };
    }

    // Only enter when funding rate exceeds threshold
    if input.funding_rate_abs < input.funding_threshold {
        return AgentOutput { actions: Vec::new() };
    }

    let margin = compute_margin_amount(input);
    let order_size = compute_order_size(margin, input.mark_price, input.sz_decimals, input.max_leverage_bps);
    if margin == 0 || order_size == 0 {
        return AgentOutput { actions: Vec::new() };
    }

    if input.funding_rate_is_neg {
        // Funding is negative: shorts pay longs -> go LONG to collect
        build_open_long_actions(input, margin, order_size)
    } else {
        // Funding is positive: longs pay shorts -> go SHORT to collect
        build_open_short_actions(input, margin, order_size)
    }
}

// ============================================================================
// Signal Helpers
// ============================================================================

/// True if SMA fast crossed above SMA slow (bullish).
fn sma_bullish_cross(input: &PerpInput) -> bool {
    input.prev_sma_fast <= input.prev_sma_slow && input.sma_fast > input.sma_slow
}

/// True if SMA fast crossed below SMA slow (bearish).
fn sma_bearish_cross(input: &PerpInput) -> bool {
    input.prev_sma_fast >= input.prev_sma_slow && input.sma_fast < input.sma_slow
}

/// True if RSI is between oversold and overbought thresholds (neutral zone).
fn rsi_in_neutral_zone(input: &PerpInput) -> bool {
    input.rsi_value >= input.rsi_oversold_bps && input.rsi_value <= input.rsi_overbought_bps
}

/// True if funding rate is favorable for a long position.
/// Favorable when: funding is negative (shorts pay longs) OR negligible (below threshold).
fn funding_favorable_for_long(input: &PerpInput) -> bool {
    input.funding_rate_is_neg || input.funding_rate_abs < input.funding_threshold
}

/// True if funding rate is favorable for a short position.
/// Favorable when: funding is positive (longs pay shorts) OR negligible (below threshold).
fn funding_favorable_for_short(input: &PerpInput) -> bool {
    !input.funding_rate_is_neg || input.funding_rate_abs < input.funding_threshold
}

/// True if there is an open position.
fn has_position(input: &PerpInput) -> bool {
    input.position_size_abs > 0
}

// ============================================================================
// Exit Condition Helpers
// ============================================================================

/// True if stop-loss price level has been breached.
fn stop_loss_triggered(input: &PerpInput) -> bool {
    if input.entry_price == 0 || input.stop_loss_bps == 0 {
        return false;
    }

    if input.position_is_short {
        // Short: stop-loss when mark >= entry * (1 + stop_loss_bps/10000)
        let stop_level = match apply_bps(input.entry_price, input.stop_loss_bps as u64) {
            Some(delta) => saturating_add_u64(input.entry_price, delta),
            None => return false,
        };
        input.mark_price >= stop_level
    } else {
        // Long: stop-loss when mark <= entry * (1 - stop_loss_bps/10000)
        let stop_level = match apply_bps(input.entry_price, input.stop_loss_bps as u64) {
            Some(delta) => saturating_sub_u64(input.entry_price, delta),
            None => return false,
        };
        input.mark_price <= stop_level
    }
}

/// True if take-profit price level has been reached.
fn take_profit_triggered(input: &PerpInput) -> bool {
    if input.entry_price == 0 || input.take_profit_bps == 0 {
        return false;
    }

    if input.position_is_short {
        // Short: take-profit when mark <= entry * (1 - take_profit_bps/10000)
        let tp_level = match apply_bps(input.entry_price, input.take_profit_bps as u64) {
            Some(delta) => saturating_sub_u64(input.entry_price, delta),
            None => return false,
        };
        input.mark_price <= tp_level
    } else {
        // Long: take-profit when mark >= entry * (1 + take_profit_bps/10000)
        let tp_level = match apply_bps(input.entry_price, input.take_profit_bps as u64) {
            Some(delta) => saturating_add_u64(input.entry_price, delta),
            None => return false,
        };
        input.mark_price >= tp_level
    }
}

/// True if funding rate has reversed strongly against the current position.
/// Triggers when funding exceeds threshold * FUNDING_REVERSAL_MULTIPLIER.
fn funding_reversal_triggered(input: &PerpInput) -> bool {
    if input.funding_threshold == 0 {
        return false;
    }
    let reversal_threshold = saturating_mul_u64(input.funding_threshold, FUNDING_REVERSAL_MULTIPLIER);

    if input.position_is_short {
        // Short position: reversal when funding is negative (shorts pay) and large
        input.funding_rate_is_neg && input.funding_rate_abs >= reversal_threshold
    } else {
        // Long position: reversal when funding is positive (longs pay) and large
        !input.funding_rate_is_neg && input.funding_rate_abs >= reversal_threshold
    }
}

/// True if SMA has crossed against the current position direction.
fn trend_reversal_triggered(input: &PerpInput) -> bool {
    if input.position_is_short {
        // Short position: exit on bullish cross
        sma_bullish_cross(input)
    } else {
        // Long position: exit on bearish cross
        sma_bearish_cross(input)
    }
}

// ============================================================================
// Position Sizing
// ============================================================================

/// Compute USDC margin amount based on equity and risk params.
///
/// Formula: min(equity * max_position_bps / 10000, available_balance)
fn compute_margin_amount(input: &PerpInput) -> u64 {
    let max_margin = match apply_bps(input.account_equity, input.max_position_bps as u64) {
        Some(v) => v,
        None => return 0,
    };

    // Cap to available balance
    core::cmp::min(max_margin, input.available_balance)
}

/// Convert USDC margin to base-asset order size for Hyperliquid CoreWriter.
///
/// Formula (using u128 to avoid overflow):
///   order_sz = margin * max_leverage_bps * 10^(sz_decimals + 2) / (mark_price * 10_000)
///
/// Where:
///   - margin is USDC in 6-decimal raw units (100 USDC = 100_000_000)
///   - mark_price is 1e8-scaled (e.g. $97,000 = 9_700_000_000_000)
///   - sz_decimals is Hyperliquid's szDecimals for the asset (BTC=5, ETH=4)
///   - max_leverage_bps is leverage in bps (30_000 = 3x)
///
/// The factor 10^2 bridges the USDC 1e6 scale to the price 1e8 scale.
fn compute_order_size(margin: u64, mark_price: u64, sz_decimals: u8, max_leverage_bps: u32) -> u64 {
    if mark_price == 0 || margin == 0 {
        return 0;
    }
    // Cap sz_decimals to 8 to prevent unreasonable exponent
    let dec = if sz_decimals > 8 { 8 } else { sz_decimals };
    let scale = 10u128.pow(dec as u32 + 2);
    let numerator = (margin as u128) * (max_leverage_bps as u128) * scale;
    let denominator = (mark_price as u128) * 10_000u128;
    let result = numerator / denominator;
    if result > u64::MAX as u128 {
        return 0;
    }
    result as u64
}

// ============================================================================
// Action Builders
// ============================================================================

/// Build action to close the current position.
/// Note: withdrawToVault is NOT bundled here because HyperCore settlement is async.
/// After closing, USDC remains on HyperCore margin — the vault owner must recover
/// funds manually via the 3-step admin flow: transferPerpToSpot → transferSpotToEvm
/// → withdrawToVaultAdmin.
fn build_close_actions(input: &PerpInput) -> AgentOutput {
    let close = CallBuilder::new(input.exchange_contract)
        .selector(CLOSE_POSITION_SELECTOR)
        .build();
    let mut actions = Vec::with_capacity(1);
    actions.push(close);
    AgentOutput { actions }
}

/// Build actions to open a long position: approve USDC margin + open with base-asset order size.
fn build_open_long_actions(input: &PerpInput, margin: u64, order_size: u64) -> AgentOutput {
    let approve = kernel_sdk::actions::erc20::approve(
        &input.usdc_token,
        &input.exchange_contract,
        margin,
    );
    let open = CallBuilder::new(input.exchange_contract)
        .selector(OPEN_POSITION_SELECTOR)
        .param_bool(true) // isBuy = true (long)
        .param_u256_from_u64(margin)      // marginAmount (USDC)
        .param_u256_from_u64(order_size)  // orderSize (base asset, szDecimals-scaled)
        .param_u256_from_u64(input.best_ask) // limit price for longs
        .build();
    let mut actions = Vec::with_capacity(2);
    actions.push(approve);
    actions.push(open);
    AgentOutput { actions }
}

/// Build actions to open a short position: approve USDC margin + open with base-asset order size.
fn build_open_short_actions(input: &PerpInput, margin: u64, order_size: u64) -> AgentOutput {
    let approve = kernel_sdk::actions::erc20::approve(
        &input.usdc_token,
        &input.exchange_contract,
        margin,
    );
    let open = CallBuilder::new(input.exchange_contract)
        .selector(OPEN_POSITION_SELECTOR)
        .param_bool(false) // isBuy = false (short)
        .param_u256_from_u64(margin)      // marginAmount (USDC)
        .param_u256_from_u64(order_size)  // orderSize (base asset, szDecimals-scaled)
        .param_u256_from_u64(input.best_bid) // limit price for shorts
        .build();
    let mut actions = Vec::with_capacity(2);
    actions.push(approve);
    actions.push(open);
    AgentOutput { actions }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use kernel_sdk::oracle::{
        encode_price_feed, OraclePriceFeed, PricePoint as OraclePricePoint,
        Signature as OracleSignature, MAX_PRICE_COUNT,
    };

    // Default test values
    const EXCHANGE: [u8; 20] = [0x11u8; 20];
    const VAULT: [u8; 20] = [0x22u8; 20];
    const USDC: [u8; 20] = [0x33u8; 20];
    const ORACLE_SIGNER: [u8; 20] = [0xAA; 20];

    /// Snapshot timestamp used in tests (must be close to feed timestamp for staleness check)
    const TEST_SNAPSHOT_TS: u64 = 2000;
    const TEST_FEED_TS: u64 = 1950; // 50 seconds ago, well within MAX_ORACLE_STALENESS_SECONDS

    /// Build a default oracle feed with the given mark price.
    fn make_oracle_feed(mark_price: u64) -> OraclePriceFeed {
        let mut prices = [OraclePricePoint {
            asset_id: 0,
            price: 0,
            conf: 0,
        }; MAX_PRICE_COUNT];
        prices[0] = OraclePricePoint {
            asset_id: ORACLE_ASSET_ID_MARK,
            price: mark_price,
            conf: 50_000_000, // 0.5 confidence
        };
        OraclePriceFeed {
            feed_version: kernel_sdk::oracle::FEED_VERSION,
            signer: ORACLE_SIGNER,
            timestamp: TEST_FEED_TS,
            price_count: 1,
            prices,
            signature: OracleSignature {
                v: 27,
                r: [0xBB; 32],
                s: [0xCC; 32],
            },
        }
    }

    /// Encode a StateSnapshotV1 into bytes.
    fn encode_snapshot(
        current_equity: u64,
        peak_equity: u64,
    ) -> Vec<u8> {
        let mut buf = Vec::with_capacity(StateSnapshotV1::ENCODED_SIZE);
        buf.extend_from_slice(&1u32.to_le_bytes());        // snapshot_version
        buf.extend_from_slice(&1000u64.to_le_bytes());     // last_execution_ts
        buf.extend_from_slice(&TEST_SNAPSHOT_TS.to_le_bytes()); // current_ts
        buf.extend_from_slice(&current_equity.to_le_bytes());
        buf.extend_from_slice(&peak_equity.to_le_bytes());
        buf
    }

    /// Build a full PerpInput byte slice with sensible defaults,
    /// then allow overrides via the returned struct-like helper.
    fn make_default_perp_input() -> PerpInputBuilder {
        PerpInputBuilder {
            exchange_contract: EXCHANGE,
            vault_address: VAULT,
            usdc_token: USDC,
            mark_price: 50_000 * PRICE_SCALE,     // $50,000
            index_price: 50_000 * PRICE_SCALE,
            best_bid: 49_990 * PRICE_SCALE,
            best_ask: 50_010 * PRICE_SCALE,
            funding_rate_abs: 0,
            funding_rate_is_neg: false,
            position_size_abs: 0,
            position_is_short: false,
            entry_price: 0,
            unrealized_pnl_abs: 0,
            unrealized_pnl_neg: false,
            available_balance: 100_000 * PRICE_SCALE,  // $100K
            account_equity: 100_000 * PRICE_SCALE,
            margin_used: 0,
            sma_fast: 50_100 * PRICE_SCALE,
            sma_slow: 50_000 * PRICE_SCALE,
            rsi_value: 5000, // RSI 50
            prev_sma_fast: 49_900 * PRICE_SCALE,
            prev_sma_slow: 50_000 * PRICE_SCALE,
            max_leverage_bps: 30_000,      // 3x
            max_position_bps: 5_000,       // 50%
            stop_loss_bps: 200,            // 2%
            take_profit_bps: 400,          // 4%
            rsi_oversold_bps: 3_000,       // RSI 30
            rsi_overbought_bps: 7_000,     // RSI 70
            funding_threshold: 10_000,     // 0.01% (1e8 scaled)
            action_flag: FLAG_EVALUATE,
            liquidation_price: 0,
            // New fields
            max_drawdown_bps: 500,         // 5% (default)
            drawdown_cooldown_seconds: 3600, // 1 hour
            in_drawdown_cooldown: false,
            strategy_mode: STRATEGY_SMA_CROSSOVER,
            sz_decimals: 5,                // BTC default
        }
    }

    struct PerpInputBuilder {
        exchange_contract: [u8; 20],
        vault_address: [u8; 20],
        usdc_token: [u8; 20],
        mark_price: u64,
        index_price: u64,
        best_bid: u64,
        best_ask: u64,
        funding_rate_abs: u64,
        funding_rate_is_neg: bool,
        position_size_abs: u64,
        position_is_short: bool,
        entry_price: u64,
        unrealized_pnl_abs: u64,
        unrealized_pnl_neg: bool,
        available_balance: u64,
        account_equity: u64,
        margin_used: u64,
        sma_fast: u64,
        sma_slow: u64,
        rsi_value: u32,
        prev_sma_fast: u64,
        prev_sma_slow: u64,
        max_leverage_bps: u32,
        max_position_bps: u32,
        stop_loss_bps: u32,
        take_profit_bps: u32,
        rsi_oversold_bps: u32,
        rsi_overbought_bps: u32,
        funding_threshold: u64,
        action_flag: u8,
        liquidation_price: u64,
        // New fields
        max_drawdown_bps: u32,
        drawdown_cooldown_seconds: u32,
        in_drawdown_cooldown: bool,
        strategy_mode: u8,
        sz_decimals: u8,
    }

    impl PerpInputBuilder {
        fn encode(&self) -> Vec<u8> {
            let mut buf = Vec::with_capacity(PerpInput::ENCODED_SIZE);
            buf.extend_from_slice(&self.exchange_contract);
            buf.extend_from_slice(&self.vault_address);
            buf.extend_from_slice(&self.usdc_token);
            buf.extend_from_slice(&self.mark_price.to_le_bytes());
            buf.extend_from_slice(&self.index_price.to_le_bytes());
            buf.extend_from_slice(&self.best_bid.to_le_bytes());
            buf.extend_from_slice(&self.best_ask.to_le_bytes());
            buf.extend_from_slice(&self.funding_rate_abs.to_le_bytes());
            buf.push(if self.funding_rate_is_neg { 1 } else { 0 });
            buf.extend_from_slice(&self.position_size_abs.to_le_bytes());
            buf.push(if self.position_is_short { 1 } else { 0 });
            buf.extend_from_slice(&self.entry_price.to_le_bytes());
            buf.extend_from_slice(&self.unrealized_pnl_abs.to_le_bytes());
            buf.push(if self.unrealized_pnl_neg { 1 } else { 0 });
            buf.extend_from_slice(&self.available_balance.to_le_bytes());
            buf.extend_from_slice(&self.account_equity.to_le_bytes());
            buf.extend_from_slice(&self.margin_used.to_le_bytes());
            buf.extend_from_slice(&self.sma_fast.to_le_bytes());
            buf.extend_from_slice(&self.sma_slow.to_le_bytes());
            buf.extend_from_slice(&self.rsi_value.to_le_bytes());
            buf.extend_from_slice(&self.prev_sma_fast.to_le_bytes());
            buf.extend_from_slice(&self.prev_sma_slow.to_le_bytes());
            buf.extend_from_slice(&self.max_leverage_bps.to_le_bytes());
            buf.extend_from_slice(&self.max_position_bps.to_le_bytes());
            buf.extend_from_slice(&self.stop_loss_bps.to_le_bytes());
            buf.extend_from_slice(&self.take_profit_bps.to_le_bytes());
            buf.extend_from_slice(&self.rsi_oversold_bps.to_le_bytes());
            buf.extend_from_slice(&self.rsi_overbought_bps.to_le_bytes());
            buf.extend_from_slice(&self.funding_threshold.to_le_bytes());
            buf.push(self.action_flag);
            buf.extend_from_slice(&self.liquidation_price.to_le_bytes());
            // New fields
            buf.extend_from_slice(&self.max_drawdown_bps.to_le_bytes());
            buf.extend_from_slice(&self.drawdown_cooldown_seconds.to_le_bytes());
            buf.push(if self.in_drawdown_cooldown { 1 } else { 0 });
            buf.push(self.strategy_mode);
            buf.push(self.sz_decimals);
            buf
        }
    }

    /// Build full opaque_inputs (snapshot + oracle feed + perp input).
    /// Returns (encoded_bytes, feed_hash) so tests can set ctx.input_root.
    fn build_opaque_inputs(snapshot_equity: u64, snapshot_peak: u64, perp: &PerpInputBuilder) -> (Vec<u8>, [u8; 32]) {
        let feed = make_oracle_feed(perp.mark_price);
        let feed_bytes = encode_price_feed(&feed);
        let feed_hash = compute_feed_hash(&feed);
        let mut buf = encode_snapshot(snapshot_equity, snapshot_peak);
        buf.extend_from_slice(&feed_bytes);
        buf.extend_from_slice(&perp.encode());
        (buf, feed_hash)
    }

    fn test_ctx(feed_hash: [u8; 32]) -> AgentContext {
        AgentContext {
            protocol_version: 1,
            kernel_version: 1,
            agent_id: [0x42u8; 32],
            agent_code_hash: AGENT_CODE_HASH,
            constraint_set_hash: [0xbb; 32],
            input_root: feed_hash,
            execution_nonce: 1,
        }
    }

    /// Convenience: build opaque_inputs and a matching AgentContext.
    fn build_test(snapshot_equity: u64, snapshot_peak: u64, perp: &PerpInputBuilder) -> (AgentContext, Vec<u8>) {
        let (input, feed_hash) = build_opaque_inputs(snapshot_equity, snapshot_peak, perp);
        (test_ctx(feed_hash), input)
    }

    // ====================================================================
    // Basic Input Validation
    // ====================================================================

    #[test]
    fn test_perp_input_encoded_size() {
        // Original 228 + 10 new bytes + 1 sz_decimals = 239
        assert_eq!(PerpInput::ENCODED_SIZE, 239);
    }

    #[test]
    fn test_invalid_input_returns_empty() {
        let ctx = test_ctx([0u8; 32]);
        let short = alloc::vec![0u8; 10];
        let output = agent_main(&ctx, &short);
        assert!(output.actions.is_empty());
    }

    // ====================================================================
    // Entry Signal Tests (SMA Crossover Mode)
    // ====================================================================

    #[test]
    fn test_long_entry_on_bullish_cross() {
        let mut perp = make_default_perp_input();
        // Bullish cross: prev_fast <= prev_slow AND fast > slow
        perp.prev_sma_fast = 49_900 * PRICE_SCALE;
        perp.prev_sma_slow = 50_000 * PRICE_SCALE;
        perp.sma_fast = 50_100 * PRICE_SCALE;
        perp.sma_slow = 50_000 * PRICE_SCALE;
        perp.rsi_value = 5000; // RSI 50, in neutral zone
        // No funding pressure
        perp.funding_rate_abs = 0;
        perp.funding_rate_is_neg = false;

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        // Should produce 2 actions: approve + open long
        assert_eq!(output.actions.len(), 2, "Should produce approve + open long");
        assert_eq!(output.actions[0].action_type, ACTION_TYPE_CALL); // approve
        assert_eq!(output.actions[1].action_type, ACTION_TYPE_CALL); // open

        // First action targets USDC token (approve)
        let expected_usdc_target = address_to_bytes32(&USDC);
        assert_eq!(output.actions[0].target, expected_usdc_target);

        // Second action targets exchange (open position)
        let expected_exchange_target = address_to_bytes32(&EXCHANGE);
        assert_eq!(output.actions[1].target, expected_exchange_target);
    }

    #[test]
    fn test_short_entry_on_bearish_cross() {
        let mut perp = make_default_perp_input();
        // Bearish cross: prev_fast >= prev_slow AND fast < slow
        perp.prev_sma_fast = 50_100 * PRICE_SCALE;
        perp.prev_sma_slow = 50_000 * PRICE_SCALE;
        perp.sma_fast = 49_900 * PRICE_SCALE;
        perp.sma_slow = 50_000 * PRICE_SCALE;
        perp.rsi_value = 5000;
        // Positive funding = favorable for shorts
        perp.funding_rate_abs = 5_000;
        perp.funding_rate_is_neg = false;

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert_eq!(output.actions.len(), 2, "Should produce approve + open short");
        assert_eq!(output.actions[0].action_type, ACTION_TYPE_CALL);
        assert_eq!(output.actions[1].action_type, ACTION_TYPE_CALL);
    }

    #[test]
    fn test_no_signal_no_action() {
        let mut perp = make_default_perp_input();
        // No cross: both prev and current have fast > slow (no crossover)
        perp.prev_sma_fast = 50_100 * PRICE_SCALE;
        perp.prev_sma_slow = 50_000 * PRICE_SCALE;
        perp.sma_fast = 50_200 * PRICE_SCALE;
        perp.sma_slow = 50_000 * PRICE_SCALE;

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert!(output.actions.is_empty(), "No crossover -> no action");
    }

    // ====================================================================
    // Exit Condition Tests
    // ====================================================================

    #[test]
    fn test_stop_loss_triggers_close_and_withdraw() {
        let mut perp = make_default_perp_input();
        // Long position with entry at $50,000
        perp.position_size_abs = 10_000 * PRICE_SCALE;
        perp.position_is_short = false;
        perp.entry_price = 50_000 * PRICE_SCALE;
        perp.stop_loss_bps = 200; // 2%
        // Mark price dropped 3% below entry -> stop loss triggered
        perp.mark_price = 48_500 * PRICE_SCALE;

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        // Enhancement 6: close + withdrawToVault
        assert_eq!(output.actions.len(), 2, "Should close + withdraw on stop loss");
        assert_eq!(output.actions[0].action_type, ACTION_TYPE_CALL); // close
        assert_eq!(output.actions[1].action_type, ACTION_TYPE_CALL); // withdraw
    }

    #[test]
    fn test_take_profit_triggers_close_and_withdraw() {
        let mut perp = make_default_perp_input();
        // Long position with entry at $50,000
        perp.position_size_abs = 10_000 * PRICE_SCALE;
        perp.position_is_short = false;
        perp.entry_price = 50_000 * PRICE_SCALE;
        perp.take_profit_bps = 400; // 4%
        // Mark price rose 5% above entry -> take profit triggered
        perp.mark_price = 52_500 * PRICE_SCALE;

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert_eq!(output.actions.len(), 2, "Should close + withdraw on take profit");
    }

    #[test]
    fn test_configurable_drawdown_5_percent() {
        let mut perp = make_default_perp_input();
        perp.max_drawdown_bps = 500; // 5%
        // Has open position
        perp.position_size_abs = 10_000 * PRICE_SCALE;
        perp.position_is_short = false;
        perp.entry_price = 50_000 * PRICE_SCALE;

        // Effective threshold = 500 - 100 (safety margin) = 400 bps (4%)
        // 5% drawdown: current=95K, peak=100K -> 500 bps > 400 -> triggers
        let (ctx, input) = build_test(95_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert_eq!(output.actions.len(), 2, "5% drawdown should trigger close + withdraw");
    }

    #[test]
    fn test_configurable_drawdown_8_percent() {
        let mut perp = make_default_perp_input();
        perp.max_drawdown_bps = 800; // 8%
        perp.position_size_abs = 10_000 * PRICE_SCALE;
        perp.position_is_short = false;
        perp.entry_price = 50_000 * PRICE_SCALE;

        // Effective threshold = 800 - 100 = 700 bps (7%)
        // 5% drawdown: current=95K, peak=100K -> 500 bps < 700 -> does NOT trigger
        let (ctx, input) = build_test(95_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert!(output.actions.is_empty(), "5% drawdown should not trigger with 8% limit");

        // 8% drawdown: current=92K, peak=100K -> 800 bps > 700 -> triggers
        let (ctx, input2) = build_test(92_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output2 = agent_main(&ctx, &input2);

        assert_eq!(output2.actions.len(), 2, "8% drawdown should trigger close + withdraw");
    }

    #[test]
    fn test_default_drawdown_when_zero() {
        let mut perp = make_default_perp_input();
        perp.max_drawdown_bps = 0; // Use default (500 = 5%)
        perp.position_size_abs = 10_000 * PRICE_SCALE;
        perp.position_is_short = false;
        perp.entry_price = 50_000 * PRICE_SCALE;

        // Default effective = 500 - 100 = 400 bps (4%)
        // 5% drawdown: 500 bps > 400 -> triggers
        let (ctx, input) = build_test(95_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert_eq!(output.actions.len(), 2, "Default 5% drawdown should trigger close + withdraw");
    }

    #[test]
    fn test_drawdown_no_new_entries_when_exceeded() {
        let mut perp = make_default_perp_input();
        perp.max_drawdown_bps = 500;
        perp.position_size_abs = 0; // No position
        // Bullish cross setup
        perp.prev_sma_fast = 49_900 * PRICE_SCALE;
        perp.prev_sma_slow = 50_000 * PRICE_SCALE;
        perp.sma_fast = 50_100 * PRICE_SCALE;
        perp.sma_slow = 50_000 * PRICE_SCALE;
        perp.rsi_value = 5000;
        perp.funding_rate_abs = 0;

        // 5% drawdown with no position -> should NOT enter new position
        let (ctx, input) = build_test(95_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert!(output.actions.is_empty(), "Should not enter new positions during drawdown");
    }

    #[test]
    fn test_drawdown_cooldown_closes_position() {
        let mut perp = make_default_perp_input();
        perp.in_drawdown_cooldown = true;
        perp.position_size_abs = 10_000 * PRICE_SCALE;
        perp.position_is_short = false;
        perp.entry_price = 50_000 * PRICE_SCALE;

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert_eq!(output.actions.len(), 2, "Cooldown should close position + withdraw");
    }

    #[test]
    fn test_drawdown_cooldown_prevents_entry() {
        let mut perp = make_default_perp_input();
        perp.in_drawdown_cooldown = true;
        perp.position_size_abs = 0;
        // Bullish cross
        perp.prev_sma_fast = 49_900 * PRICE_SCALE;
        perp.prev_sma_slow = 50_000 * PRICE_SCALE;
        perp.sma_fast = 50_100 * PRICE_SCALE;
        perp.sma_slow = 50_000 * PRICE_SCALE;
        perp.rsi_value = 5000;
        perp.funding_rate_abs = 0;

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert!(output.actions.is_empty(), "Cooldown should prevent new entries");
    }

    #[test]
    fn test_liquidation_proximity_close() {
        let mut perp = make_default_perp_input();
        // Long position
        perp.position_size_abs = 10_000 * PRICE_SCALE;
        perp.position_is_short = false;
        perp.entry_price = 50_000 * PRICE_SCALE;
        perp.mark_price = 50_000 * PRICE_SCALE;
        // Liquidation price very close (within 2% of mark, threshold is 3%)
        perp.liquidation_price = 49_000 * PRICE_SCALE;

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert_eq!(output.actions.len(), 2, "Should close + withdraw on liquidation proximity");
    }

    #[test]
    fn test_funding_reversal_exit() {
        let mut perp = make_default_perp_input();
        // Long position
        perp.position_size_abs = 10_000 * PRICE_SCALE;
        perp.position_is_short = false;
        perp.entry_price = 50_000 * PRICE_SCALE;
        // Funding rate strongly positive (longs pay) -> reversal for longs
        perp.funding_threshold = 10_000;
        perp.funding_rate_abs = 30_000; // 3x threshold
        perp.funding_rate_is_neg = false;

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert_eq!(output.actions.len(), 2, "Should close + withdraw on funding reversal");
    }

    #[test]
    fn test_trend_reversal_exit() {
        let mut perp = make_default_perp_input();
        // Long position
        perp.position_size_abs = 10_000 * PRICE_SCALE;
        perp.position_is_short = false;
        perp.entry_price = 50_000 * PRICE_SCALE;
        // Bearish cross against long position
        perp.prev_sma_fast = 50_100 * PRICE_SCALE;
        perp.prev_sma_slow = 50_000 * PRICE_SCALE;
        perp.sma_fast = 49_900 * PRICE_SCALE;
        perp.sma_slow = 50_000 * PRICE_SCALE;

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert_eq!(output.actions.len(), 2, "Should close + withdraw on trend reversal");
    }

    // ====================================================================
    // Force Flag Tests
    // ====================================================================

    #[test]
    fn test_force_close_flag_with_withdraw() {
        let mut perp = make_default_perp_input();
        perp.action_flag = FLAG_FORCE_CLOSE;
        perp.position_size_abs = 10_000 * PRICE_SCALE;
        perp.position_is_short = false;
        perp.entry_price = 50_000 * PRICE_SCALE;

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert_eq!(output.actions.len(), 2, "Force close should produce close + withdraw");
    }

    #[test]
    fn test_force_close_no_position() {
        let mut perp = make_default_perp_input();
        perp.action_flag = FLAG_FORCE_CLOSE;
        perp.position_size_abs = 0; // no position

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert!(output.actions.is_empty(), "Force close with no position -> no-op");
    }

    #[test]
    fn test_force_flat_flag() {
        let mut perp = make_default_perp_input();
        perp.action_flag = FLAG_FORCE_FLAT;
        // Even with a bullish cross, force flat should do nothing
        perp.prev_sma_fast = 49_900 * PRICE_SCALE;
        perp.prev_sma_slow = 50_000 * PRICE_SCALE;
        perp.sma_fast = 50_100 * PRICE_SCALE;
        perp.sma_slow = 50_000 * PRICE_SCALE;

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert!(output.actions.is_empty(), "Force flat -> no-op");
    }

    #[test]
    fn test_unknown_flag_no_action() {
        let mut perp = make_default_perp_input();
        perp.action_flag = 99;

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert!(output.actions.is_empty());
    }

    // ====================================================================
    // Position Sizing Tests
    // ====================================================================

    #[test]
    fn test_position_sizing_caps_to_balance() {
        let mut perp = make_default_perp_input();
        // Bullish cross setup
        perp.prev_sma_fast = 49_900 * PRICE_SCALE;
        perp.prev_sma_slow = 50_000 * PRICE_SCALE;
        perp.sma_fast = 50_100 * PRICE_SCALE;
        perp.sma_slow = 50_000 * PRICE_SCALE;
        perp.rsi_value = 5000;
        perp.funding_rate_abs = 0;

        // max_position = 50% of 100K equity = 50K, but only 10K available
        perp.account_equity = 100_000 * PRICE_SCALE;
        perp.available_balance = 10_000 * PRICE_SCALE;
        perp.max_position_bps = 5_000; // 50%

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        // Should still trade but with capped size
        assert_eq!(output.actions.len(), 2, "Should open position with capped size");
    }

    // ====================================================================
    // Determinism Test
    // ====================================================================

    #[test]
    fn test_determinism() {
        let mut perp = make_default_perp_input();
        // Bullish cross
        perp.prev_sma_fast = 49_900 * PRICE_SCALE;
        perp.prev_sma_slow = 50_000 * PRICE_SCALE;
        perp.sma_fast = 50_100 * PRICE_SCALE;
        perp.sma_slow = 50_000 * PRICE_SCALE;
        perp.rsi_value = 5000;
        perp.funding_rate_abs = 0;

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output1 = agent_main(&ctx, &input);
        let output2 = agent_main(&ctx, &input);

        assert_eq!(output1.actions.len(), output2.actions.len());
        for (a, b) in output1.actions.iter().zip(output2.actions.iter()) {
            assert_eq!(a.action_type, b.action_type);
            assert_eq!(a.target, b.target);
            assert_eq!(a.payload, b.payload);
        }
    }

    // ====================================================================
    // Short Position Exit Tests
    // ====================================================================

    #[test]
    fn test_short_stop_loss() {
        let mut perp = make_default_perp_input();
        // Short position with entry at $50,000
        perp.position_size_abs = 10_000 * PRICE_SCALE;
        perp.position_is_short = true;
        perp.entry_price = 50_000 * PRICE_SCALE;
        perp.stop_loss_bps = 200; // 2%
        // Mark price rose 3% above entry -> stop loss for short
        perp.mark_price = 51_500 * PRICE_SCALE;

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert_eq!(output.actions.len(), 2, "Short stop loss should trigger close + withdraw");
    }

    #[test]
    fn test_short_take_profit() {
        let mut perp = make_default_perp_input();
        // Short position with entry at $50,000
        perp.position_size_abs = 10_000 * PRICE_SCALE;
        perp.position_is_short = true;
        perp.entry_price = 50_000 * PRICE_SCALE;
        perp.take_profit_bps = 400; // 4%
        // Mark price dropped 5% below entry -> take profit for short
        perp.mark_price = 47_500 * PRICE_SCALE;

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert_eq!(output.actions.len(), 2, "Short take profit should trigger close + withdraw");
    }

    // ====================================================================
    // Funding Rate Arb Mode (Enhancement 4)
    // ====================================================================

    #[test]
    fn test_funding_arb_opens_short_on_positive_funding() {
        let mut perp = make_default_perp_input();
        perp.strategy_mode = STRATEGY_FUNDING_ARB;
        // Positive funding: longs pay shorts -> go SHORT to collect
        perp.funding_rate_abs = 20_000; // Above threshold (10_000)
        perp.funding_rate_is_neg = false;

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert_eq!(output.actions.len(), 2, "Should open short in funding arb mode");
        // Verify it's a short: isBuy should be false (param_bool(false))
        // The open action is at index 1
        let expected_exchange_target = address_to_bytes32(&EXCHANGE);
        assert_eq!(output.actions[1].target, expected_exchange_target);
    }

    #[test]
    fn test_funding_arb_opens_long_on_negative_funding() {
        let mut perp = make_default_perp_input();
        perp.strategy_mode = STRATEGY_FUNDING_ARB;
        // Negative funding: shorts pay longs -> go LONG to collect
        perp.funding_rate_abs = 20_000; // Above threshold (10_000)
        perp.funding_rate_is_neg = true;

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert_eq!(output.actions.len(), 2, "Should open long in funding arb mode");
    }

    #[test]
    fn test_funding_arb_no_entry_below_threshold() {
        let mut perp = make_default_perp_input();
        perp.strategy_mode = STRATEGY_FUNDING_ARB;
        // Funding below threshold
        perp.funding_rate_abs = 5_000;
        perp.funding_threshold = 10_000;

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert!(output.actions.is_empty(), "No entry when funding below threshold");
    }

    #[test]
    fn test_funding_arb_no_entry_zero_threshold() {
        let mut perp = make_default_perp_input();
        perp.strategy_mode = STRATEGY_FUNDING_ARB;
        perp.funding_threshold = 0;
        perp.funding_rate_abs = 50_000;

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert!(output.actions.is_empty(), "No entry when threshold is zero");
    }

    #[test]
    fn test_funding_arb_exit_on_stop_loss() {
        let mut perp = make_default_perp_input();
        perp.strategy_mode = STRATEGY_FUNDING_ARB;
        // Short position opened via arb
        perp.position_size_abs = 10_000 * PRICE_SCALE;
        perp.position_is_short = true;
        perp.entry_price = 50_000 * PRICE_SCALE;
        perp.stop_loss_bps = 200; // 2%
        perp.mark_price = 51_500 * PRICE_SCALE; // 3% above entry

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert_eq!(output.actions.len(), 2, "Arb mode should still exit on stop loss");
    }

    #[test]
    fn test_funding_arb_no_trend_reversal_exit() {
        let mut perp = make_default_perp_input();
        perp.strategy_mode = STRATEGY_FUNDING_ARB;
        // Short position opened via arb
        perp.position_size_abs = 10_000 * PRICE_SCALE;
        perp.position_is_short = true;
        perp.entry_price = 50_000 * PRICE_SCALE;
        // Bullish SMA cross (would exit in SMA mode for shorts)
        perp.prev_sma_fast = 49_900 * PRICE_SCALE;
        perp.prev_sma_slow = 50_000 * PRICE_SCALE;
        perp.sma_fast = 50_100 * PRICE_SCALE;
        perp.sma_slow = 50_000 * PRICE_SCALE;

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        // In funding arb mode, SMA trend reversal should NOT trigger exit
        assert!(output.actions.is_empty(), "Arb mode should not exit on SMA trend reversal");
    }

    // ====================================================================
    // Withdraw After Close (Enhancement 6)
    // ====================================================================

    #[test]
    fn test_close_always_includes_withdraw() {
        let mut perp = make_default_perp_input();
        // Setup long position that will be stopped out
        perp.position_size_abs = 10_000 * PRICE_SCALE;
        perp.position_is_short = false;
        perp.entry_price = 50_000 * PRICE_SCALE;
        perp.stop_loss_bps = 200;
        perp.mark_price = 48_500 * PRICE_SCALE;

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert_eq!(output.actions.len(), 2);
        // First action: closePosition()
        let exchange_target = address_to_bytes32(&EXCHANGE);
        assert_eq!(output.actions[0].target, exchange_target);
        // Second action: withdrawToVault()
        assert_eq!(output.actions[1].target, exchange_target);
        // Both should be CALL type
        assert_eq!(output.actions[0].action_type, ACTION_TYPE_CALL);
        assert_eq!(output.actions[1].action_type, ACTION_TYPE_CALL);
    }

    #[test]
    fn test_force_close_includes_withdraw() {
        let mut perp = make_default_perp_input();
        perp.action_flag = FLAG_FORCE_CLOSE;
        perp.position_size_abs = 10_000 * PRICE_SCALE;
        perp.entry_price = 50_000 * PRICE_SCALE;

        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);

        assert_eq!(output.actions.len(), 2, "Force close must include withdraw");
    }

    // ====================================================================
    // Oracle Integration Tests
    // ====================================================================

    #[test]
    fn test_oracle_price_overrides_perp_mark_price() {
        let mut perp = make_default_perp_input();
        // PerpInput has mark_price = 50_000, but oracle will provide 55_000
        perp.mark_price = 55_000 * PRICE_SCALE;
        // Long position with entry at $50,000
        perp.position_size_abs = 10_000 * PRICE_SCALE;
        perp.position_is_short = false;
        perp.entry_price = 50_000 * PRICE_SCALE;
        perp.take_profit_bps = 400; // 4% = $52,000
        // Oracle price at $55,000 > TP level -> should trigger take profit
        let (ctx, input) = build_test(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let output = agent_main(&ctx, &input);
        assert_eq!(output.actions.len(), 2, "Oracle-verified price should trigger take profit");
    }

    #[test]
    fn test_stale_oracle_feed_returns_empty() {
        let perp = make_default_perp_input();
        // Build oracle feed with stale timestamp
        let mut feed = make_oracle_feed(perp.mark_price);
        // Make feed 200 seconds old (> MAX_ORACLE_STALENESS_SECONDS = 120)
        feed.timestamp = TEST_SNAPSHOT_TS - 200;
        let feed_bytes = encode_price_feed(&feed);
        let feed_hash = compute_feed_hash(&feed);
        let mut buf = encode_snapshot(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE);
        buf.extend_from_slice(&feed_bytes);
        buf.extend_from_slice(&perp.encode());
        let ctx = test_ctx(feed_hash);
        let output = agent_main(&ctx, &buf);
        assert!(output.actions.is_empty(), "Stale oracle feed should return empty");
    }

    #[test]
    fn test_oracle_commitment_mismatch_returns_empty() {
        let perp = make_default_perp_input();
        // Build valid opaque inputs but with wrong input_root
        let (input, _feed_hash) = build_opaque_inputs(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE, &perp);
        let ctx = test_ctx([0xFF; 32]); // Wrong feed hash
        let output = agent_main(&ctx, &input);
        assert!(output.actions.is_empty(), "Commitment mismatch should return empty");
    }

    #[test]
    fn test_oracle_feed_at_staleness_boundary() {
        let perp = make_default_perp_input();
        // Feed exactly at the staleness boundary (120 seconds)
        let mut feed = make_oracle_feed(perp.mark_price);
        feed.timestamp = TEST_SNAPSHOT_TS - MAX_ORACLE_STALENESS_SECONDS;
        let feed_bytes = encode_price_feed(&feed);
        let feed_hash = compute_feed_hash(&feed);
        let mut buf = encode_snapshot(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE);
        buf.extend_from_slice(&feed_bytes);
        buf.extend_from_slice(&perp.encode());
        let ctx = test_ctx(feed_hash);
        let _output = agent_main(&ctx, &buf);
        // Exactly at boundary: snapshot_ts - feed_ts == 120, NOT > 120, so should pass
        // No trading signal in default config (no crossover), so empty is expected
        // To verify it gets past staleness, use a bullish cross that would produce actions
        let mut perp2 = make_default_perp_input();
        perp2.prev_sma_fast = 49_900 * PRICE_SCALE;
        perp2.prev_sma_slow = 50_000 * PRICE_SCALE;
        perp2.sma_fast = 50_100 * PRICE_SCALE;
        perp2.sma_slow = 50_000 * PRICE_SCALE;
        perp2.rsi_value = 5000;
        perp2.funding_rate_abs = 0;
        let mut feed2 = make_oracle_feed(perp2.mark_price);
        feed2.timestamp = TEST_SNAPSHOT_TS - MAX_ORACLE_STALENESS_SECONDS;
        let feed_bytes2 = encode_price_feed(&feed2);
        let feed_hash2 = compute_feed_hash(&feed2);
        let mut buf2 = encode_snapshot(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE);
        buf2.extend_from_slice(&feed_bytes2);
        buf2.extend_from_slice(&perp2.encode());
        let ctx2 = test_ctx(feed_hash2);
        let output2 = agent_main(&ctx2, &buf2);
        assert_eq!(output2.actions.len(), 2, "Feed at exact boundary should still work");
    }

    #[test]
    fn test_oracle_feed_just_past_staleness() {
        let mut perp = make_default_perp_input();
        perp.prev_sma_fast = 49_900 * PRICE_SCALE;
        perp.prev_sma_slow = 50_000 * PRICE_SCALE;
        perp.sma_fast = 50_100 * PRICE_SCALE;
        perp.sma_slow = 50_000 * PRICE_SCALE;
        perp.rsi_value = 5000;
        perp.funding_rate_abs = 0;
        let mut feed = make_oracle_feed(perp.mark_price);
        // 121 seconds old: just past the boundary
        feed.timestamp = TEST_SNAPSHOT_TS - MAX_ORACLE_STALENESS_SECONDS - 1;
        let feed_bytes = encode_price_feed(&feed);
        let feed_hash = compute_feed_hash(&feed);
        let mut buf = encode_snapshot(100_000 * PRICE_SCALE, 100_000 * PRICE_SCALE);
        buf.extend_from_slice(&feed_bytes);
        buf.extend_from_slice(&perp.encode());
        let ctx = test_ctx(feed_hash);
        let output = agent_main(&ctx, &buf);
        assert!(output.actions.is_empty(), "Feed 1 second past staleness should return empty");
    }
}
