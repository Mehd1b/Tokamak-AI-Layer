//! Assembles the 3-part opaque_agent_inputs and wraps in KernelInputV1.
//!
//! Layout: [StateSnapshotV1 (36B)] [OraclePriceFeed (variable)] [PerpInput (238B)]

use crate::config::Cli;
use crate::error::{Error, Result};
use crate::indicators::IndicatorSet;
use crate::market::MarketSnapshot;
use crate::onchain::VaultState;
use crate::oracle_signer::{to_scaled_u64, SignedFeed};
use constraints::StateSnapshotV1;
use kernel_core::{CanonicalEncode, KernelInputV1};
use reference_integrator::{build_kernel_input, InputParams, LoadedBundle};

/// PerpInput encoded size (must match agent's PerpInput::ENCODED_SIZE = 238).
const PERP_INPUT_SIZE: usize = 238;

/// Build a complete KernelInputV1 from all components.
///
/// Returns (kernel_input, encoded_bytes).
pub fn build_input(
    bundle: &LoadedBundle,
    vault_state: &VaultState,
    snapshot: &MarketSnapshot,
    indicators: &IndicatorSet,
    signed_feed: &SignedFeed,
    cli: &Cli,
    exchange_addr: &[u8; 20],
    vault_addr: &[u8; 20],
    usdc_addr: &[u8; 20],
) -> Result<(KernelInputV1, Vec<u8>)> {
    // Part 1: StateSnapshotV1 (36 bytes)
    let snapshot_bytes = encode_state_snapshot(vault_state, snapshot);

    // Part 2: Oracle feed bytes (already encoded in signed_feed)
    // (variable, 111 bytes for 1 price)

    // Part 3: PerpInput (238 bytes)
    let perp_bytes = encode_perp_input(
        snapshot,
        indicators,
        cli,
        exchange_addr,
        vault_addr,
        usdc_addr,
    );
    assert_eq!(perp_bytes.len(), PERP_INPUT_SIZE);

    // Concatenate all three parts
    let mut opaque = Vec::with_capacity(
        StateSnapshotV1::ENCODED_SIZE + signed_feed.feed_bytes.len() + PERP_INPUT_SIZE,
    );
    opaque.extend_from_slice(&snapshot_bytes);
    opaque.extend_from_slice(&signed_feed.feed_bytes);
    opaque.extend_from_slice(&perp_bytes);

    // Build KernelInputV1 via reference-integrator
    let params = InputParams {
        constraint_set_hash: [0u8; 32], // TODO: compute from actual constraints
        input_root: signed_feed.feed_hash,
        execution_nonce: vault_state.last_execution_nonce + 1,
        opaque_agent_inputs: opaque,
    };

    let input = build_kernel_input(bundle, &params)
        .map_err(|e| Error::InputBuild(format!("Failed to build kernel input: {}", e)))?;

    let encoded = input
        .encode()
        .map_err(|e| Error::InputBuild(format!("Failed to encode kernel input: {:?}", e)))?;

    Ok((input, encoded))
}

/// Encode StateSnapshotV1 (36 bytes).
fn encode_state_snapshot(vault_state: &VaultState, snapshot: &MarketSnapshot) -> Vec<u8> {
    let mut buf = Vec::with_capacity(StateSnapshotV1::ENCODED_SIZE);
    buf.extend_from_slice(&1u32.to_le_bytes()); // snapshot_version
    buf.extend_from_slice(&vault_state.last_execution_ts.to_le_bytes()); // last_execution_ts
    buf.extend_from_slice(&snapshot.timestamp.to_le_bytes()); // current_ts
    buf.extend_from_slice(&to_scaled_u64(snapshot.account_equity).to_le_bytes()); // current_equity
    buf.extend_from_slice(&vault_state.peak_equity.to_le_bytes()); // peak_equity
    buf
}

/// Encode PerpInput (238 bytes). Matches the agent_input! macro field order exactly.
fn encode_perp_input(
    snapshot: &MarketSnapshot,
    indicators: &IndicatorSet,
    cli: &Cli,
    exchange_addr: &[u8; 20],
    vault_addr: &[u8; 20],
    usdc_addr: &[u8; 20],
) -> Vec<u8> {
    let mut buf = Vec::with_capacity(PERP_INPUT_SIZE);

    // Addresses (60 bytes)
    buf.extend_from_slice(exchange_addr);
    buf.extend_from_slice(vault_addr);
    buf.extend_from_slice(usdc_addr);

    // Prices (32 bytes, 1e8 scaled)
    buf.extend_from_slice(&to_scaled_u64(snapshot.mark_price).to_le_bytes());
    buf.extend_from_slice(&to_scaled_u64(snapshot.index_price).to_le_bytes());
    buf.extend_from_slice(&to_scaled_u64(snapshot.best_bid).to_le_bytes());
    buf.extend_from_slice(&to_scaled_u64(snapshot.best_ask).to_le_bytes());

    // Funding rate (9 bytes): magnitude + is_negative
    let (funding_abs, funding_is_neg) = split_signed(snapshot.funding_rate);
    buf.extend_from_slice(&funding_abs.to_le_bytes());
    buf.push(if funding_is_neg { 1 } else { 0 });

    // Position state (26 bytes)
    let (pos_abs, pos_is_short) = split_signed(snapshot.position_size);
    buf.extend_from_slice(&pos_abs.to_le_bytes());
    buf.push(if pos_is_short { 1 } else { 0 });
    buf.extend_from_slice(&to_scaled_u64(snapshot.entry_price).to_le_bytes());
    let (pnl_abs, pnl_neg) = split_signed(snapshot.unrealized_pnl);
    buf.extend_from_slice(&pnl_abs.to_le_bytes());
    buf.push(if pnl_neg { 1 } else { 0 });

    // Account state (24 bytes)
    buf.extend_from_slice(&to_scaled_u64(snapshot.available_balance.max(0.0)).to_le_bytes());
    buf.extend_from_slice(&to_scaled_u64(snapshot.account_equity).to_le_bytes());
    buf.extend_from_slice(&to_scaled_u64(snapshot.margin_used).to_le_bytes());

    // Indicators (36 bytes, pre-computed)
    buf.extend_from_slice(&to_scaled_u64(indicators.sma_fast).to_le_bytes());
    buf.extend_from_slice(&to_scaled_u64(indicators.sma_slow).to_le_bytes());
    buf.extend_from_slice(&indicators.rsi_bps.to_le_bytes());
    buf.extend_from_slice(&to_scaled_u64(indicators.prev_sma_fast).to_le_bytes());
    buf.extend_from_slice(&to_scaled_u64(indicators.prev_sma_slow).to_le_bytes());

    // Risk params (16 bytes, all bps)
    buf.extend_from_slice(&30_000u32.to_le_bytes()); // max_leverage_bps (3x)
    buf.extend_from_slice(&5_000u32.to_le_bytes()); // max_position_bps (50%)
    buf.extend_from_slice(&cli.stop_loss_bps.to_le_bytes());
    buf.extend_from_slice(&cli.take_profit_bps.to_le_bytes());

    // Strategy config (17 bytes)
    buf.extend_from_slice(&3_000u32.to_le_bytes()); // rsi_oversold_bps (RSI 30)
    buf.extend_from_slice(&7_000u32.to_le_bytes()); // rsi_overbought_bps (RSI 70)
    buf.extend_from_slice(&10_000u64.to_le_bytes()); // funding_threshold (0.01%)
    buf.push(cli.action_flag);

    // Liquidation (8 bytes)
    buf.extend_from_slice(&to_scaled_u64(snapshot.liquidation_price).to_le_bytes());

    // Drawdown config (9 bytes)
    buf.extend_from_slice(&cli.max_drawdown_bps.to_le_bytes());
    buf.extend_from_slice(&3600u32.to_le_bytes()); // drawdown_cooldown_seconds (1 hour)
    buf.push(0); // in_drawdown_cooldown: false (TODO: compute from vault state)

    // Strategy mode (1 byte)
    buf.push(cli.strategy_mode);

    debug_assert_eq!(buf.len(), PERP_INPUT_SIZE, "PerpInput encoding size mismatch");
    buf
}

/// Split a signed f64 into (scaled_abs_u64, is_negative).
fn split_signed(val: f64) -> (u64, bool) {
    let is_neg = val < 0.0;
    let abs = to_scaled_u64(val.abs());
    (abs, is_neg)
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::Parser;

    #[test]
    fn test_split_signed_positive() {
        let (abs, neg) = split_signed(1.5);
        assert_eq!(abs, 150_000_000);
        assert!(!neg);
    }

    #[test]
    fn test_split_signed_negative() {
        let (abs, neg) = split_signed(-0.001);
        assert_eq!(abs, 100_000);
        assert!(neg);
    }

    #[test]
    fn test_split_signed_zero() {
        let (abs, neg) = split_signed(0.0);
        assert_eq!(abs, 0);
        assert!(!neg);
    }

    #[test]
    fn test_encode_perp_input_size() {
        let snapshot = crate::market::MarketSnapshot {
            mark_price: 50000.0,
            index_price: 50000.0,
            best_bid: 49990.0,
            best_ask: 50010.0,
            funding_rate: 0.0001,
            position_size: 0.0,
            entry_price: 0.0,
            unrealized_pnl: 0.0,
            available_balance: 100000.0,
            account_equity: 100000.0,
            margin_used: 0.0,
            liquidation_price: 0.0,
            candle_closes: vec![],
            timestamp: 1700000000,
        };
        let indicators = IndicatorSet {
            sma_fast: 50100.0,
            sma_slow: 50000.0,
            rsi_bps: 5000,
            prev_sma_fast: 49900.0,
            prev_sma_slow: 50000.0,
        };

        // Minimal CLI for testing
        let cli = Cli::parse_from(["test",
            "--vault", "0x0000000000000000000000000000000000000001",
            "--rpc", "http://localhost:8545",
            "--pk", "0x01",
            "--oracle-key", "0x01",
            "--bundle", ".",
            "--sub-account", "0x01",
            "--exchange-contract", "0x0000000000000000000000000000000000000001",
            "--usdc-address", "0x0000000000000000000000000000000000000001",
        ]);

        let exchange = [0x11u8; 20];
        let vault = [0x22u8; 20];
        let usdc = [0x33u8; 20];

        let bytes = encode_perp_input(&snapshot, &indicators, &cli, &exchange, &vault, &usdc);
        assert_eq!(bytes.len(), PERP_INPUT_SIZE, "PerpInput must be {} bytes", PERP_INPUT_SIZE);
    }
}
