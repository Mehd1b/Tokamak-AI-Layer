//! Polymarket Prediction Market Trading Agent
//!
//! Verifiable prediction market agent that buys/sells outcome tokens on
//! Polymarket based on probability thresholds, with configurable slippage
//! and risk parameters. Runs inside RISC Zero zkVM for provable execution.
//!
//! # Input Format (fixed 196 bytes)
//!
//! The `opaque_agent_inputs` field is split into two parts:
//!
//! ## Part 1: StateSnapshotV1 (first 36 bytes)
//!
//! Used by the constraint engine for drawdown/cooldown checks.
//!
//! ```text
//! [0:4]    snapshot_version (u32 LE, must be 1)
//! [4:12]   last_execution_ts (u64 LE)
//! [12:20]  current_ts (u64 LE)
//! [20:28]  current_equity (u64 LE)
//! [28:36]  peak_equity (u64 LE)
//! ```
//!
//! ## Part 2: PolymarketInput (160 bytes)
//!
//! Agent-specific market data, position state, and strategy parameters.
//! All prices/probabilities are 1e6-scaled u64 (i.e. 500000 = 0.50 = 50%).
//! Amounts are in USDC raw units (6 decimals, i.e. 1000000 = $1.00).
//!
//! ```text
//! Offset  Size  Field                  Description
//! ------  ----  -----                  -----------
//! [0:20]  20    adapter_address        PolymarketAdapter contract address
//! [20:40] 20    usdc_address           USDC token address
//! [40:48]  8    best_bid               Best bid price (1e6-scaled probability)
//! [48:56]  8    best_ask               Best ask price (1e6-scaled probability)
//! [56:64]  8    mid_price              Mid-market probability (1e6)
//! [64:72]  8    volume_24h             24h volume in USDC raw
//! [72:80]  8    yes_token_balance      Current YES token holding (1e6)
//! [80:88]  8    no_token_balance       Current NO token holding (1e6)
//! [88:96]  8    entry_price            Average entry price of position (1e6)
//! [96:104] 8    usdc_balance           Vault USDC balance available
//! [104:105] 1   has_position           1 = has open position, 0 = flat
//! [105:106] 1   position_side          0 = YES, 1 = NO
//! [106:107] 1   strategy_mode          0 = threshold, 1 = spread
//! [107:115] 8   buy_threshold          Buy when price below this (1e6)
//! [115:123] 8   sell_threshold         Sell when price above this (1e6)
//! [123:131] 8   max_position_usdc      Max position size in USDC raw
//! [131:139] 8   slippage_bps           Max slippage in basis points
//! [139:147] 8   stop_loss_bps          Stop loss in basis points
//! [147:155] 8   take_profit_bps        Take profit in basis points
//! [155:157] 2   max_drawdown_bps       Max drawdown in basis points (0 = default 5%)
//! [157:158] 1   market_resolved        1 = market has resolved
//! [158:159] 1   winning_side           0 = YES won, 1 = NO won (only if resolved)
//! [159:160] 1   _padding               Reserved
//! ```
//!
//! # Strategy Modes
//!
//! ## Mode 0: Probability Threshold (default)
//!
//! **Buy YES tokens:**
//! - Current ask price <= buy_threshold (market is undervalued)
//! - No existing position or position is YES
//! - Position size < max_position_usdc
//!
//! **Buy NO tokens (sell YES probability):**
//! - Current bid price >= sell_threshold (market is overvalued)
//! - No existing position or position is NO
//! - Position size < max_position_usdc
//!
//! **Close position:**
//! - Stop loss hit: position PnL < -stop_loss_bps
//! - Take profit hit: position PnL > +take_profit_bps
//! - Market resolved: redeem winning tokens
//! - Drawdown circuit breaker
//!
//! ## Mode 1: Spread Capture
//!
//! **Buy YES** when bid-ask spread > 2 * slippage_bps and price near 50%.
//! **Sell YES** when price moves away from entry by take_profit_bps.
//!
//! # Output Actions
//!
//! CALL actions targeting the PolymarketAdapter contract:
//! - Buy outcome tokens: approve USDC + buyOutcome(bool isYes, uint256 usdcAmount, uint256 minTokens)
//! - Sell outcome tokens: sellOutcome(bool isYes, uint256 tokenAmount, uint256 minUsdc)
//! - Redeem resolved: redeemResolved()
//! - Withdraw to vault: withdrawToVault()

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

/// Probability scaling factor: 1e6 (0.50 = 500_000).
const PROB_SCALE: u64 = 1_000_000;

/// Basis points denominator.
const BPS_DENOM: u64 = 10_000;

/// Default maximum drawdown in basis points (5%).
const DEFAULT_MAX_DRAWDOWN_BPS: u64 = 500;

/// Safety margin in basis points (1%) — close before constraint engine triggers.
const DRAWDOWN_SAFETY_MARGIN_BPS: u64 = 100;

/// Minimum spread (in 1e6 units) to consider spread capture viable.
const MIN_SPREAD_FOR_CAPTURE: u64 = 20_000; // 2%

/// USDC decimals.
const USDC_DECIMALS: u64 = 1_000_000;

// Function selectors for PolymarketAdapter
const SEL_BUY_OUTCOME: u32 = 0x193099a8;   // buyOutcome(bool,uint256,uint256)
const SEL_SELL_OUTCOME: u32 = 0xe88b997b;   // sellOutcome(bool,uint256,uint256)
const SEL_REDEEM_RESOLVED: u32 = 0xe48f8d53; // redeemResolved()
const SEL_WITHDRAW: u32 = 0x84f22721;       // withdrawToVault()

// ERC-20 approve selector
const SEL_APPROVE: u32 = 0x095ea7b3; // approve(address,uint256)

// ============================================================================
// Input parsing
// ============================================================================

/// Parsed Polymarket-specific input data.
struct PolymarketInput {
    adapter_address: [u8; 20],
    usdc_address: [u8; 20],
    best_bid: u64,
    best_ask: u64,
    mid_price: u64,
    volume_24h: u64,
    yes_token_balance: u64,
    no_token_balance: u64,
    entry_price: u64,
    usdc_balance: u64,
    has_position: bool,
    position_side: u8, // 0 = YES, 1 = NO
    strategy_mode: u8,
    buy_threshold: u64,
    sell_threshold: u64,
    max_position_usdc: u64,
    slippage_bps: u64,
    stop_loss_bps: u64,
    take_profit_bps: u64,
    max_drawdown_bps: u64,
    market_resolved: bool,
    winning_side: u8,
}

fn parse_polymarket_input(data: &[u8]) -> PolymarketInput {
    assert!(data.len() >= 160, "PolymarketInput too short");

    let mut adapter_address = [0u8; 20];
    adapter_address.copy_from_slice(&data[0..20]);

    let mut usdc_address = [0u8; 20];
    usdc_address.copy_from_slice(&data[20..40]);

    let r = |off: usize| -> u64 { u64::from_le_bytes(data[off..off + 8].try_into().unwrap()) };

    PolymarketInput {
        adapter_address,
        usdc_address,
        best_bid: r(40),
        best_ask: r(48),
        mid_price: r(56),
        volume_24h: r(64),
        yes_token_balance: r(72),
        no_token_balance: r(80),
        entry_price: r(88),
        usdc_balance: r(96),
        has_position: data[104] != 0,
        position_side: data[105],
        strategy_mode: data[106],
        buy_threshold: r(107),
        sell_threshold: r(115),
        max_position_usdc: r(123),
        slippage_bps: r(131),
        stop_loss_bps: r(139),
        take_profit_bps: r(147),
        max_drawdown_bps: {
            let v = u16::from_le_bytes(data[155..157].try_into().unwrap()) as u64;
            if v == 0 { DEFAULT_MAX_DRAWDOWN_BPS } else { v }
        },
        market_resolved: data[157] != 0,
        winning_side: data[158],
    }
}

// ============================================================================
// Action builders
// ============================================================================

fn build_approve_usdc(usdc: &[u8; 20], spender: &[u8; 20], amount: u64) -> ActionV1 {
    CallBuilder::new(*usdc)
        .selector(SEL_APPROVE)
        .param_address(spender)
        .param_u256_from_u64(amount)
        .build()
}

fn build_buy_outcome(adapter: &[u8; 20], is_yes: bool, usdc_amount: u64, min_tokens: u64) -> ActionV1 {
    CallBuilder::new(*adapter)
        .selector(SEL_BUY_OUTCOME)
        .param_bool(is_yes)
        .param_u256_from_u64(usdc_amount)
        .param_u256_from_u64(min_tokens)
        .build()
}

fn build_sell_outcome(adapter: &[u8; 20], is_yes: bool, token_amount: u64, min_usdc: u64) -> ActionV1 {
    CallBuilder::new(*adapter)
        .selector(SEL_SELL_OUTCOME)
        .param_bool(is_yes)
        .param_u256_from_u64(token_amount)
        .param_u256_from_u64(min_usdc)
        .build()
}

fn build_redeem_resolved(adapter: &[u8; 20]) -> ActionV1 {
    CallBuilder::new(*adapter)
        .selector(SEL_REDEEM_RESOLVED)
        .build()
}

fn build_withdraw_to_vault(adapter: &[u8; 20]) -> ActionV1 {
    CallBuilder::new(*adapter)
        .selector(SEL_WITHDRAW)
        .build()
}

// ============================================================================
// Strategy helpers
// ============================================================================

/// Calculate slippage-adjusted minimum output.
/// For buying tokens: min_tokens = usdc_amount / price * (1 - slippage)
/// For selling tokens: min_usdc = token_amount * price * (1 - slippage)
fn apply_slippage(amount: u64, slippage_bps: u64) -> u64 {
    if slippage_bps >= BPS_DENOM { return 0; }
    amount * (BPS_DENOM - slippage_bps) / BPS_DENOM
}

/// Check if drawdown circuit breaker should trigger.
fn drawdown_breaker_active(snapshot: &StateSnapshotV1, max_drawdown_bps: u64) -> bool {
    if snapshot.peak_equity == 0 {
        return false;
    }
    let effective_limit = max_drawdown_bps.saturating_sub(DRAWDOWN_SAFETY_MARGIN_BPS);
    let current = snapshot.current_equity;
    let peak = snapshot.peak_equity;
    if current >= peak {
        return false;
    }
    let drawdown_bps = (peak - current) * BPS_DENOM / peak;
    drawdown_bps >= effective_limit
}

/// Calculate PnL in basis points for a position.
/// For YES: pnl = (mid_price - entry_price) / entry_price * 10000
/// For NO: cost = (1 - entry_price), value = (1 - mid_price)
///         pnl = (value - cost) / cost * 10000
///              = (entry_price - mid_price) / (PROB_SCALE - entry_price) * 10000
fn position_pnl_bps(entry_price: u64, mid_price: u64, is_yes: bool) -> i64 {
    if is_yes {
        if entry_price == 0 { return 0; }
        (mid_price as i64 - entry_price as i64) * BPS_DENOM as i64 / entry_price as i64
    } else {
        let no_cost = PROB_SCALE.saturating_sub(entry_price);
        if no_cost == 0 { return 0; }
        (entry_price as i64 - mid_price as i64) * BPS_DENOM as i64 / no_cost as i64
    }
}

/// Calculate order size respecting max position and available balance.
fn calculate_order_size(usdc_balance: u64, max_position_usdc: u64) -> u64 {
    // Use 10% of available balance per trade, capped at max_position
    let trade_size = usdc_balance / 10;
    if trade_size > max_position_usdc {
        max_position_usdc
    } else if trade_size < USDC_DECIMALS {
        // Don't trade less than $1
        0
    } else {
        trade_size
    }
}

// ============================================================================
// Main agent entry point
// ============================================================================

pub fn agent_main(ctx: &AgentContext) -> Vec<ActionV1> {
    let opaque = ctx.opaque_agent_inputs;
    assert!(opaque.len() >= 36 + 160, "input too short");

    // Parse state snapshot (first 36 bytes)
    let snapshot = StateSnapshotV1::from_bytes(&opaque[..36]);

    // Parse Polymarket-specific input (next 160 bytes)
    let input = parse_polymarket_input(&opaque[36..]);

    let mut actions: Vec<ActionV1> = Vec::new();

    // ---- Market resolved: redeem and withdraw ----
    if input.market_resolved {
        let is_winner = (input.winning_side == 0 && input.yes_token_balance > 0)
            || (input.winning_side == 1 && input.no_token_balance > 0);

        if is_winner {
            actions.push(build_redeem_resolved(&input.adapter_address));
            actions.push(build_withdraw_to_vault(&input.adapter_address));
        }
        // If we lost, nothing to redeem — tokens are worthless
        if !is_winner && input.has_position {
            // Withdraw any remaining USDC
            actions.push(build_withdraw_to_vault(&input.adapter_address));
        }
        return if actions.is_empty() {
            alloc::vec![ActionV1::no_op()]
        } else {
            actions
        };
    }

    // ---- Drawdown circuit breaker ----
    if drawdown_breaker_active(&snapshot, input.max_drawdown_bps) {
        if input.has_position {
            let (is_yes, amount) = if input.position_side == 0 {
                (true, input.yes_token_balance)
            } else {
                (false, input.no_token_balance)
            };
            let min_usdc = apply_slippage(
                amount * input.mid_price / PROB_SCALE,
                input.slippage_bps,
            );
            actions.push(build_sell_outcome(&input.adapter_address, is_yes, amount, min_usdc));
            actions.push(build_withdraw_to_vault(&input.adapter_address));
        }
        return if actions.is_empty() {
            alloc::vec![ActionV1::no_op()]
        } else {
            actions
        };
    }

    // ---- Check for stop loss / take profit on existing position ----
    if input.has_position && input.entry_price > 0 {
        let is_yes = input.position_side == 0;
        let pnl = position_pnl_bps(input.entry_price, input.mid_price, is_yes);

        let should_close = pnl <= -(input.stop_loss_bps as i64)
            || pnl >= input.take_profit_bps as i64;

        if should_close {
            let amount = if is_yes { input.yes_token_balance } else { input.no_token_balance };
            let min_usdc = apply_slippage(
                amount * input.mid_price / PROB_SCALE,
                input.slippage_bps,
            );
            actions.push(build_sell_outcome(&input.adapter_address, is_yes, amount, min_usdc));
            actions.push(build_withdraw_to_vault(&input.adapter_address));
            return actions;
        }
    }

    // ---- Strategy Mode 0: Probability Threshold ----
    if input.strategy_mode == 0 {
        if !input.has_position {
            // Look for entry opportunity
            if input.best_ask > 0 && input.best_ask <= input.buy_threshold {
                // Price is low → buy YES tokens (market is undervalued)
                let order_usdc = calculate_order_size(input.usdc_balance, input.max_position_usdc);
                if order_usdc > 0 {
                    // min_tokens = usdc / ask_price * (1 - slippage)
                    let raw_tokens = order_usdc * PROB_SCALE / input.best_ask;
                    let min_tokens = apply_slippage(raw_tokens, input.slippage_bps);

                    actions.push(build_approve_usdc(
                        &input.usdc_address,
                        &input.adapter_address,
                        order_usdc,
                    ));
                    actions.push(build_buy_outcome(
                        &input.adapter_address,
                        true, // YES
                        order_usdc,
                        min_tokens,
                    ));
                }
            } else if input.best_bid > 0 && input.best_bid >= input.sell_threshold {
                // Price is high → buy NO tokens (market is overvalued)
                let order_usdc = calculate_order_size(input.usdc_balance, input.max_position_usdc);
                if order_usdc > 0 {
                    let no_price = PROB_SCALE - input.best_bid;
                    let raw_tokens = if no_price > 0 {
                        order_usdc * PROB_SCALE / no_price
                    } else {
                        0
                    };
                    let min_tokens = apply_slippage(raw_tokens, input.slippage_bps);

                    if min_tokens > 0 {
                        actions.push(build_approve_usdc(
                            &input.usdc_address,
                            &input.adapter_address,
                            order_usdc,
                        ));
                        actions.push(build_buy_outcome(
                            &input.adapter_address,
                            false, // NO
                            order_usdc,
                            min_tokens,
                        ));
                    }
                }
            }
        }
        // If we have a position, hold until stop loss / take profit / drawdown
    }

    // ---- Strategy Mode 1: Spread Capture ----
    if input.strategy_mode == 1 {
        let spread = input.best_ask.saturating_sub(input.best_bid);

        if !input.has_position && spread >= MIN_SPREAD_FOR_CAPTURE {
            // Wide spread near 50% → buy YES at bid
            let mid = PROB_SCALE / 2;
            let distance_from_mid = if input.mid_price > mid {
                input.mid_price - mid
            } else {
                mid - input.mid_price
            };

            // Only capture spread when probability is between 30-70%
            if distance_from_mid < 200_000 {
                let order_usdc = calculate_order_size(input.usdc_balance, input.max_position_usdc);
                if order_usdc > 0 {
                    let raw_tokens = order_usdc * PROB_SCALE / input.best_ask;
                    let min_tokens = apply_slippage(raw_tokens, input.slippage_bps);

                    actions.push(build_approve_usdc(
                        &input.usdc_address,
                        &input.adapter_address,
                        order_usdc,
                    ));
                    actions.push(build_buy_outcome(
                        &input.adapter_address,
                        true,
                        order_usdc,
                        min_tokens,
                    ));
                }
            }
        }
    }

    if actions.is_empty() {
        alloc::vec![ActionV1::no_op()]
    } else {
        actions
    }
}

// Register the agent entry point
kernel_sdk::agent_entrypoint!(agent_main);

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use kernel_sdk::testing::*;

    fn make_snapshot(current_equity: u64, peak_equity: u64) -> Vec<u8> {
        let mut buf = Vec::with_capacity(36);
        buf.extend_from_slice(&1u32.to_le_bytes()); // version
        buf.extend_from_slice(&0u64.to_le_bytes()); // last_execution_ts
        buf.extend_from_slice(&100u64.to_le_bytes()); // current_ts
        buf.extend_from_slice(&current_equity.to_le_bytes());
        buf.extend_from_slice(&peak_equity.to_le_bytes());
        buf
    }

    fn make_input(overrides: PolymarketInputBuilder) -> Vec<u8> {
        let mut buf = vec![0u8; 160];

        buf[0..20].copy_from_slice(&overrides.adapter_address);
        buf[20..40].copy_from_slice(&overrides.usdc_address);
        buf[40..48].copy_from_slice(&overrides.best_bid.to_le_bytes());
        buf[48..56].copy_from_slice(&overrides.best_ask.to_le_bytes());
        buf[56..64].copy_from_slice(&overrides.mid_price.to_le_bytes());
        buf[64..72].copy_from_slice(&overrides.volume_24h.to_le_bytes());
        buf[72..80].copy_from_slice(&overrides.yes_token_balance.to_le_bytes());
        buf[80..88].copy_from_slice(&overrides.no_token_balance.to_le_bytes());
        buf[88..96].copy_from_slice(&overrides.entry_price.to_le_bytes());
        buf[96..104].copy_from_slice(&overrides.usdc_balance.to_le_bytes());
        buf[104] = overrides.has_position as u8;
        buf[105] = overrides.position_side;
        buf[106] = overrides.strategy_mode;
        buf[107..115].copy_from_slice(&overrides.buy_threshold.to_le_bytes());
        buf[115..123].copy_from_slice(&overrides.sell_threshold.to_le_bytes());
        buf[123..131].copy_from_slice(&overrides.max_position_usdc.to_le_bytes());
        buf[131..139].copy_from_slice(&overrides.slippage_bps.to_le_bytes());
        buf[139..147].copy_from_slice(&overrides.stop_loss_bps.to_le_bytes());
        buf[147..155].copy_from_slice(&overrides.take_profit_bps.to_le_bytes());
        buf[155..157].copy_from_slice(&overrides.max_drawdown_bps.to_le_bytes());
        buf[157] = overrides.market_resolved as u8;
        buf[158] = overrides.winning_side;
        buf
    }

    struct PolymarketInputBuilder {
        adapter_address: [u8; 20],
        usdc_address: [u8; 20],
        best_bid: u64,
        best_ask: u64,
        mid_price: u64,
        volume_24h: u64,
        yes_token_balance: u64,
        no_token_balance: u64,
        entry_price: u64,
        usdc_balance: u64,
        has_position: bool,
        position_side: u8,
        strategy_mode: u8,
        buy_threshold: u64,
        sell_threshold: u64,
        max_position_usdc: u64,
        slippage_bps: u64,
        stop_loss_bps: u64,
        take_profit_bps: u64,
        max_drawdown_bps: u16,
        market_resolved: bool,
        winning_side: u8,
    }

    impl Default for PolymarketInputBuilder {
        fn default() -> Self {
            Self {
                adapter_address: [0xAA; 20],
                usdc_address: [0xBB; 20],
                best_bid: 450_000,    // 0.45
                best_ask: 460_000,    // 0.46
                mid_price: 455_000,   // 0.455
                volume_24h: 100_000_000_000, // $100k
                yes_token_balance: 0,
                no_token_balance: 0,
                entry_price: 0,
                usdc_balance: 10_000_000_000, // $10,000
                has_position: false,
                position_side: 0,
                strategy_mode: 0,
                buy_threshold: 400_000,   // buy YES below 0.40
                sell_threshold: 700_000,  // buy NO above 0.70
                max_position_usdc: 1_000_000_000, // $1,000
                slippage_bps: 100,        // 1%
                stop_loss_bps: 500,       // 5%
                take_profit_bps: 1000,    // 10%
                max_drawdown_bps: 0,      // default 5%
                market_resolved: false,
                winning_side: 0,
            }
        }
    }

    #[test]
    fn test_no_op_when_price_in_neutral_zone() {
        // Price is between buy_threshold and sell_threshold — should NO_OP
        let snapshot = make_snapshot(10_000, 10_000);
        let input = make_input(PolymarketInputBuilder::default());
        let mut opaque = snapshot;
        opaque.extend_from_slice(&input);

        let ctx = mock_context(&opaque);
        let actions = agent_main(&ctx);
        assert_eq!(actions.len(), 1);
        assert!(actions[0].is_no_op());
    }

    #[test]
    fn test_buy_yes_when_below_threshold() {
        let snapshot = make_snapshot(10_000, 10_000);
        let input = make_input(PolymarketInputBuilder {
            best_ask: 350_000, // 0.35, below buy_threshold of 0.40
            mid_price: 345_000,
            ..Default::default()
        });
        let mut opaque = snapshot;
        opaque.extend_from_slice(&input);

        let ctx = mock_context(&opaque);
        let actions = agent_main(&ctx);
        // Should have 2 actions: approve USDC + buyOutcome(YES)
        assert_eq!(actions.len(), 2);
        assert!(!actions[0].is_no_op());
        assert!(!actions[1].is_no_op());
    }

    #[test]
    fn test_buy_no_when_above_threshold() {
        let snapshot = make_snapshot(10_000, 10_000);
        let input = make_input(PolymarketInputBuilder {
            best_bid: 750_000, // 0.75, above sell_threshold of 0.70
            best_ask: 760_000,
            mid_price: 755_000,
            ..Default::default()
        });
        let mut opaque = snapshot;
        opaque.extend_from_slice(&input);

        let ctx = mock_context(&opaque);
        let actions = agent_main(&ctx);
        assert_eq!(actions.len(), 2);
    }

    #[test]
    fn test_stop_loss_closes_position() {
        let snapshot = make_snapshot(9_000, 10_000);
        let input = make_input(PolymarketInputBuilder {
            has_position: true,
            position_side: 0, // YES
            entry_price: 500_000,
            mid_price: 400_000, // -20% loss, exceeds 5% stop loss
            yes_token_balance: 2_000_000,
            stop_loss_bps: 500,
            ..Default::default()
        });
        let mut opaque = snapshot;
        opaque.extend_from_slice(&input);

        let ctx = mock_context(&opaque);
        let actions = agent_main(&ctx);
        // Should sell + withdraw
        assert_eq!(actions.len(), 2);
    }

    #[test]
    fn test_take_profit_closes_position() {
        let snapshot = make_snapshot(12_000, 12_000);
        let input = make_input(PolymarketInputBuilder {
            has_position: true,
            position_side: 0, // YES
            entry_price: 400_000,
            mid_price: 500_000, // +25% gain, exceeds 10% take profit
            yes_token_balance: 2_000_000,
            take_profit_bps: 1000,
            ..Default::default()
        });
        let mut opaque = snapshot;
        opaque.extend_from_slice(&input);

        let ctx = mock_context(&opaque);
        let actions = agent_main(&ctx);
        assert_eq!(actions.len(), 2);
    }

    #[test]
    fn test_redeem_on_market_resolution() {
        let snapshot = make_snapshot(10_000, 10_000);
        let input = make_input(PolymarketInputBuilder {
            market_resolved: true,
            winning_side: 0, // YES won
            yes_token_balance: 5_000_000,
            has_position: true,
            position_side: 0,
            ..Default::default()
        });
        let mut opaque = snapshot;
        opaque.extend_from_slice(&input);

        let ctx = mock_context(&opaque);
        let actions = agent_main(&ctx);
        // redeemResolved + withdrawToVault
        assert_eq!(actions.len(), 2);
    }

    #[test]
    fn test_drawdown_breaker_closes_position() {
        // 6% drawdown with default 5% limit
        let snapshot = make_snapshot(9_400, 10_000);
        let input = make_input(PolymarketInputBuilder {
            has_position: true,
            position_side: 0,
            yes_token_balance: 2_000_000,
            mid_price: 500_000,
            ..Default::default()
        });
        let mut opaque = snapshot;
        opaque.extend_from_slice(&input);

        let ctx = mock_context(&opaque);
        let actions = agent_main(&ctx);
        // sell + withdraw
        assert_eq!(actions.len(), 2);
    }
}
