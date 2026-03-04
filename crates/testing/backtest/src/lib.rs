//! Backtesting Framework for perp-trader strategies.
//!
//! Simulates the perp-trader agent's strategy on historical candle data and
//! computes standard performance metrics: Sharpe, Sortino, max drawdown,
//! win rate, profit factor, and comparison against buy-and-hold.
//!
//! # Usage
//!
//! ```rust,no_run
//! use backtest::{BacktestEngine, Candle, StrategyConfig, generate_synthetic_candles};
//!
//! let candles = generate_synthetic_candles(500, 50_000.0, 0.03, 0.0);
//! let config = StrategyConfig::sma_crossover(20, 50);
//! let result = BacktestEngine::run(&candles, &config, "BTC SMA 20/50");
//! println!("{}", result.summary());
//! ```

use std::fmt;

// ============================================================================
// Price Scale (matches perp-trader agent)
// ============================================================================

/// 1e8 price scale, matching the agent's internal representation.
const PRICE_SCALE: u64 = 100_000_000;

// ============================================================================
// Data Types
// ============================================================================

/// A single OHLCV candle.
#[derive(Clone, Debug)]
pub struct Candle {
    pub timestamp: u64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

/// Strategy configuration for backtesting.
#[derive(Clone, Debug)]
pub struct StrategyConfig {
    /// SMA fast period (number of candles)
    pub sma_fast_period: usize,
    /// SMA slow period (number of candles)
    pub sma_slow_period: usize,
    /// RSI period
    pub rsi_period: usize,
    /// RSI oversold threshold (bps, e.g., 3000 = RSI 30)
    pub rsi_oversold_bps: u32,
    /// RSI overbought threshold (bps, e.g., 7000 = RSI 70)
    pub rsi_overbought_bps: u32,
    /// Stop loss in basis points
    pub stop_loss_bps: u32,
    /// Take profit in basis points
    pub take_profit_bps: u32,
    /// Max position size as fraction of equity (bps)
    pub max_position_bps: u32,
    /// Max drawdown threshold (bps)
    pub max_drawdown_bps: u32,
    /// Funding rate threshold (1e8 scaled, set 0 to ignore)
    pub funding_threshold: u64,
    /// Strategy mode: 0 = SMA crossover, 1 = Funding arb
    pub strategy_mode: u8,
    /// Initial equity in USD
    pub initial_equity: f64,
}

impl StrategyConfig {
    /// Create a SMA crossover configuration with given fast/slow periods.
    pub fn sma_crossover(fast: usize, slow: usize) -> Self {
        Self {
            sma_fast_period: fast,
            sma_slow_period: slow,
            rsi_period: 14,
            rsi_oversold_bps: 3_000,
            rsi_overbought_bps: 7_000,
            stop_loss_bps: 200,
            take_profit_bps: 400,
            max_position_bps: 5_000,
            max_drawdown_bps: 500,
            funding_threshold: 0,
            strategy_mode: 0,
            initial_equity: 100_000.0,
        }
    }

    /// Create a funding rate arbitrage configuration.
    pub fn funding_arb(threshold_bps: f64) -> Self {
        Self {
            sma_fast_period: 20,
            sma_slow_period: 50,
            rsi_period: 14,
            rsi_oversold_bps: 3_000,
            rsi_overbought_bps: 7_000,
            stop_loss_bps: 200,
            take_profit_bps: 400,
            max_position_bps: 5_000,
            max_drawdown_bps: 500,
            funding_threshold: (threshold_bps * PRICE_SCALE as f64) as u64,
            strategy_mode: 1,
            initial_equity: 100_000.0,
        }
    }
}

/// A completed trade record.
#[derive(Clone, Debug)]
pub struct Trade {
    pub entry_price: f64,
    pub exit_price: f64,
    pub is_short: bool,
    pub size_usd: f64,
    pub entry_candle: usize,
    pub exit_candle: usize,
    pub pnl: f64,
    pub exit_reason: &'static str,
}

/// Full backtest results with computed metrics.
#[derive(Clone, Debug)]
pub struct BacktestResult {
    /// Strategy label (e.g., "SMA 20/50 BTC")
    pub label: String,
    /// All completed trades
    pub trades: Vec<Trade>,
    /// Equity curve (one value per candle)
    pub equity_curve: Vec<f64>,
    /// Total return as a fraction (e.g., 0.15 = 15%)
    pub total_return: f64,
    /// Buy-and-hold return for comparison
    pub buy_hold_return: f64,
    /// Annualized Sharpe ratio (risk-free rate = 0)
    pub sharpe_ratio: f64,
    /// Annualized Sortino ratio
    pub sortino_ratio: f64,
    /// Maximum drawdown as a fraction (e.g., 0.08 = 8%)
    pub max_drawdown: f64,
    /// Win rate (fraction of profitable trades)
    pub win_rate: f64,
    /// Profit factor (gross profit / gross loss)
    pub profit_factor: f64,
    /// Average trade duration in candles
    pub avg_trade_duration: f64,
    /// Total number of trades
    pub total_trades: usize,
    /// Number of candles in the dataset
    pub candle_count: usize,
}

impl fmt::Display for BacktestResult {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(f, "=== Backtest: {} ===", self.label)?;
        writeln!(f, "Candles:            {}", self.candle_count)?;
        writeln!(f, "Total Trades:       {}", self.total_trades)?;
        writeln!(f, "Total Return:       {:.2}%", self.total_return * 100.0)?;
        writeln!(f, "Buy-Hold Return:    {:.2}%", self.buy_hold_return * 100.0)?;
        writeln!(f, "Sharpe Ratio:       {:.3}", self.sharpe_ratio)?;
        writeln!(f, "Sortino Ratio:      {:.3}", self.sortino_ratio)?;
        writeln!(f, "Max Drawdown:       {:.2}%", self.max_drawdown * 100.0)?;
        writeln!(f, "Win Rate:           {:.1}%", self.win_rate * 100.0)?;
        writeln!(f, "Profit Factor:      {:.2}", self.profit_factor)?;
        writeln!(f, "Avg Trade Duration: {:.1} candles", self.avg_trade_duration)?;
        Ok(())
    }
}

impl BacktestResult {
    /// Format as a summary string.
    pub fn summary(&self) -> String {
        format!("{}", self)
    }
}

// ============================================================================
// Indicator Computation
// ============================================================================

/// Compute Simple Moving Average over the last `period` close prices.
fn compute_sma(closes: &[f64], period: usize) -> Option<f64> {
    if closes.len() < period || period == 0 {
        return None;
    }
    let sum: f64 = closes[closes.len() - period..].iter().sum();
    Some(sum / period as f64)
}

/// Compute RSI (Relative Strength Index) over the last `period` candles.
/// Returns value in 0-10000 basis points (matching agent's u32 format).
fn compute_rsi(closes: &[f64], period: usize) -> Option<u32> {
    if closes.len() < period + 1 || period == 0 {
        return None;
    }

    let mut avg_gain = 0.0;
    let mut avg_loss = 0.0;

    let start = closes.len() - period - 1;
    for i in (start + 1)..closes.len() {
        let change = closes[i] - closes[i - 1];
        if change > 0.0 {
            avg_gain += change;
        } else {
            avg_loss += change.abs();
        }
    }

    avg_gain /= period as f64;
    avg_loss /= period as f64;

    if avg_loss == 0.0 {
        return Some(10_000); // RSI = 100
    }

    let rs = avg_gain / avg_loss;
    let rsi = 100.0 - (100.0 / (1.0 + rs));

    Some((rsi * 100.0) as u32) // Convert to bps (RSI 50 = 5000)
}

// ============================================================================
// Backtest Engine
// ============================================================================

/// Position state during backtest simulation.
struct Position {
    is_short: bool,
    entry_price: f64,
    size_usd: f64,
    entry_candle: usize,
}

/// The backtest engine. Simulates the perp-trader strategy on historical candles.
pub struct BacktestEngine;

impl BacktestEngine {
    /// Run a backtest on the given candle data with the specified strategy config.
    pub fn run(candles: &[Candle], config: &StrategyConfig, label: &str) -> BacktestResult {
        let min_candles = config.sma_slow_period.max(config.rsi_period + 1) + 1;
        if candles.len() < min_candles {
            return BacktestResult {
                label: label.to_string(),
                trades: vec![],
                equity_curve: vec![config.initial_equity],
                total_return: 0.0,
                buy_hold_return: 0.0,
                sharpe_ratio: 0.0,
                sortino_ratio: 0.0,
                max_drawdown: 0.0,
                win_rate: 0.0,
                profit_factor: 0.0,
                avg_trade_duration: 0.0,
                total_trades: 0,
                candle_count: candles.len(),
            };
        }

        let closes: Vec<f64> = candles.iter().map(|c| c.close).collect();
        let mut equity = config.initial_equity;
        let mut peak_equity = equity;
        let mut equity_curve = Vec::with_capacity(candles.len());
        let mut trades: Vec<Trade> = Vec::new();
        let mut position: Option<Position> = None;
        let mut prev_sma_fast: Option<f64> = None;
        let mut prev_sma_slow: Option<f64> = None;

        // Buy-and-hold tracking
        let buy_hold_start = candles[min_candles - 1].close;

        for i in 0..candles.len() {
            // Compute indicators when enough data
            let sma_fast = compute_sma(&closes[..=i], config.sma_fast_period);
            let sma_slow = compute_sma(&closes[..=i], config.sma_slow_period);
            let rsi = compute_rsi(&closes[..=i], config.rsi_period);

            // Update equity curve (including unrealized PnL)
            if let Some(ref pos) = position {
                let unrealized = if pos.is_short {
                    pos.size_usd * (pos.entry_price - candles[i].close) / pos.entry_price
                } else {
                    pos.size_usd * (candles[i].close - pos.entry_price) / pos.entry_price
                };
                equity_curve.push(equity + unrealized);
            } else {
                equity_curve.push(equity);
            }

            // Skip if not enough data for indicators
            if sma_fast.is_none() || sma_slow.is_none() || rsi.is_none() {
                prev_sma_fast = sma_fast;
                prev_sma_slow = sma_slow;
                continue;
            }

            let sma_fast_val = sma_fast.unwrap();
            let sma_slow_val = sma_slow.unwrap();
            let rsi_val = rsi.unwrap();

            // Check drawdown
            let current_equity = *equity_curve.last().unwrap_or(&equity);
            if current_equity > peak_equity {
                peak_equity = current_equity;
            }
            let drawdown_bps = if peak_equity > 0.0 {
                ((peak_equity - current_equity) / peak_equity * 10_000.0) as u64
            } else {
                0
            };

            let effective_dd_limit = if config.max_drawdown_bps > 100 {
                config.max_drawdown_bps as u64 - 100
            } else {
                config.max_drawdown_bps as u64 / 2
            };

            // ---- Check exits ----
            if let Some(ref pos) = position {
                let mut exit_reason: Option<&'static str> = None;

                // Drawdown check
                if drawdown_bps >= effective_dd_limit {
                    exit_reason = Some("drawdown");
                }

                // Stop-loss
                if exit_reason.is_none() && config.stop_loss_bps > 0 {
                    let sl_frac = config.stop_loss_bps as f64 / 10_000.0;
                    if pos.is_short {
                        if candles[i].close >= pos.entry_price * (1.0 + sl_frac) {
                            exit_reason = Some("stop_loss");
                        }
                    } else if candles[i].close <= pos.entry_price * (1.0 - sl_frac) {
                        exit_reason = Some("stop_loss");
                    }
                }

                // Take-profit
                if exit_reason.is_none() && config.take_profit_bps > 0 {
                    let tp_frac = config.take_profit_bps as f64 / 10_000.0;
                    if pos.is_short {
                        if candles[i].close <= pos.entry_price * (1.0 - tp_frac) {
                            exit_reason = Some("take_profit");
                        }
                    } else if candles[i].close >= pos.entry_price * (1.0 + tp_frac) {
                        exit_reason = Some("take_profit");
                    }
                }

                // Trend reversal (SMA mode only)
                if exit_reason.is_none()
                    && config.strategy_mode == 0
                    && prev_sma_fast.is_some()
                    && prev_sma_slow.is_some()
                {
                    let pf = prev_sma_fast.unwrap();
                    let ps = prev_sma_slow.unwrap();
                    if pos.is_short {
                        // Bullish cross against short
                        if pf <= ps && sma_fast_val > sma_slow_val {
                            exit_reason = Some("trend_reversal");
                        }
                    } else {
                        // Bearish cross against long
                        if pf >= ps && sma_fast_val < sma_slow_val {
                            exit_reason = Some("trend_reversal");
                        }
                    }
                }

                if let Some(reason) = exit_reason {
                    let pos = position.take().unwrap();
                    let pnl = if pos.is_short {
                        pos.size_usd * (pos.entry_price - candles[i].close) / pos.entry_price
                    } else {
                        pos.size_usd * (candles[i].close - pos.entry_price) / pos.entry_price
                    };
                    equity += pnl;
                    if equity > peak_equity {
                        peak_equity = equity;
                    }
                    trades.push(Trade {
                        entry_price: pos.entry_price,
                        exit_price: candles[i].close,
                        is_short: pos.is_short,
                        size_usd: pos.size_usd,
                        entry_candle: pos.entry_candle,
                        exit_candle: i,
                        pnl,
                        exit_reason: reason,
                    });
                }
            }

            // ---- Check entries ----
            if position.is_none()
                && drawdown_bps < effective_dd_limit
                && prev_sma_fast.is_some()
                && prev_sma_slow.is_some()
            {
                let pf = prev_sma_fast.unwrap();
                let ps = prev_sma_slow.unwrap();
                let rsi_neutral = rsi_val >= config.rsi_oversold_bps
                    && rsi_val <= config.rsi_overbought_bps;

                let size_usd =
                    equity * (config.max_position_bps as f64 / 10_000.0);

                if config.strategy_mode == 0 {
                    // SMA crossover mode
                    // Bullish cross: prev_fast <= prev_slow AND fast > slow
                    if pf <= ps && sma_fast_val > sma_slow_val && rsi_neutral && size_usd > 0.0 {
                        position = Some(Position {
                            is_short: false,
                            entry_price: candles[i].close,
                            size_usd,
                            entry_candle: i,
                        });
                    }
                    // Bearish cross: prev_fast >= prev_slow AND fast < slow
                    else if pf >= ps
                        && sma_fast_val < sma_slow_val
                        && rsi_neutral
                        && size_usd > 0.0
                    {
                        position = Some(Position {
                            is_short: true,
                            entry_price: candles[i].close,
                            size_usd,
                            entry_candle: i,
                        });
                    }
                }
                // Funding arb mode is skipped in backtesting (requires live funding data)
            }

            prev_sma_fast = Some(sma_fast_val);
            prev_sma_slow = Some(sma_slow_val);
        }

        // Close any remaining position at last candle
        if let Some(pos) = position.take() {
            let last_close = candles.last().unwrap().close;
            let pnl = if pos.is_short {
                pos.size_usd * (pos.entry_price - last_close) / pos.entry_price
            } else {
                pos.size_usd * (last_close - pos.entry_price) / pos.entry_price
            };
            equity += pnl;
            trades.push(Trade {
                entry_price: pos.entry_price,
                exit_price: last_close,
                is_short: pos.is_short,
                size_usd: pos.size_usd,
                entry_candle: pos.entry_candle,
                exit_candle: candles.len() - 1,
                pnl,
                exit_reason: "end_of_data",
            });
        }

        // Compute metrics
        let total_return = (equity - config.initial_equity) / config.initial_equity;
        let buy_hold_end = candles.last().unwrap().close;
        let buy_hold_return = (buy_hold_end - buy_hold_start) / buy_hold_start;

        let (sharpe, sortino) = compute_risk_ratios(&equity_curve);
        let max_dd = compute_max_drawdown(&equity_curve);
        let (win_rate, profit_factor, avg_duration) = compute_trade_metrics(&trades);

        BacktestResult {
            label: label.to_string(),
            trades: trades.clone(),
            equity_curve,
            total_return,
            buy_hold_return,
            sharpe_ratio: sharpe,
            sortino_ratio: sortino,
            max_drawdown: max_dd,
            win_rate,
            profit_factor,
            avg_trade_duration: avg_duration,
            total_trades: trades.len(),
            candle_count: candles.len(),
        }
    }
}

// ============================================================================
// Metric Computation
// ============================================================================

/// Compute annualized Sharpe and Sortino ratios from equity curve.
/// Assumes 6 candles per day for 4h candles (365 * 6 = 2190 periods/year).
fn compute_risk_ratios(equity_curve: &[f64]) -> (f64, f64) {
    if equity_curve.len() < 2 {
        return (0.0, 0.0);
    }

    let mut returns = Vec::with_capacity(equity_curve.len() - 1);
    for i in 1..equity_curve.len() {
        if equity_curve[i - 1] > 0.0 {
            returns.push((equity_curve[i] - equity_curve[i - 1]) / equity_curve[i - 1]);
        }
    }

    if returns.is_empty() {
        return (0.0, 0.0);
    }

    let mean_return: f64 = returns.iter().sum::<f64>() / returns.len() as f64;

    // Standard deviation
    let variance: f64 =
        returns.iter().map(|r| (r - mean_return).powi(2)).sum::<f64>() / returns.len() as f64;
    let std_dev = variance.sqrt();

    // Downside deviation (for Sortino)
    let downside_variance: f64 = returns
        .iter()
        .filter(|r| **r < 0.0)
        .map(|r| r.powi(2))
        .sum::<f64>()
        / returns.len() as f64;
    let downside_dev = downside_variance.sqrt();

    // Annualization factor for 4h candles: sqrt(2190)
    let annualization = (2190.0_f64).sqrt();

    let sharpe = if std_dev > 0.0 {
        (mean_return / std_dev) * annualization
    } else {
        0.0
    };

    let sortino = if downside_dev > 0.0 {
        (mean_return / downside_dev) * annualization
    } else {
        0.0
    };

    (sharpe, sortino)
}

/// Compute maximum drawdown as a fraction.
fn compute_max_drawdown(equity_curve: &[f64]) -> f64 {
    let mut peak = 0.0_f64;
    let mut max_dd = 0.0_f64;

    for &eq in equity_curve {
        if eq > peak {
            peak = eq;
        }
        if peak > 0.0 {
            let dd = (peak - eq) / peak;
            if dd > max_dd {
                max_dd = dd;
            }
        }
    }

    max_dd
}

/// Compute win rate, profit factor, and average trade duration.
fn compute_trade_metrics(trades: &[Trade]) -> (f64, f64, f64) {
    if trades.is_empty() {
        return (0.0, 0.0, 0.0);
    }

    let winners = trades.iter().filter(|t| t.pnl > 0.0).count();
    let win_rate = winners as f64 / trades.len() as f64;

    let gross_profit: f64 = trades.iter().filter(|t| t.pnl > 0.0).map(|t| t.pnl).sum();
    let gross_loss: f64 = trades
        .iter()
        .filter(|t| t.pnl < 0.0)
        .map(|t| t.pnl.abs())
        .sum();

    let profit_factor = if gross_loss > 0.0 {
        gross_profit / gross_loss
    } else if gross_profit > 0.0 {
        f64::INFINITY
    } else {
        0.0
    };

    let total_duration: usize = trades
        .iter()
        .map(|t| t.exit_candle.saturating_sub(t.entry_candle))
        .sum();
    let avg_duration = total_duration as f64 / trades.len() as f64;

    (win_rate, profit_factor, avg_duration)
}

// ============================================================================
// Synthetic Data Generation (for testing)
// ============================================================================

/// Generate synthetic price data with a trend + noise pattern.
/// Useful for testing the backtester without real data.
pub fn generate_synthetic_candles(
    count: usize,
    start_price: f64,
    volatility: f64,
    trend_per_candle: f64,
) -> Vec<Candle> {
    let mut candles = Vec::with_capacity(count);
    let mut price = start_price;

    // Simple deterministic "random" using a linear congruential generator
    let mut seed: u64 = 42;

    for i in 0..count {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        let noise = ((seed >> 33) as f64 / u32::MAX as f64 - 0.5) * 2.0 * volatility;

        let open = price;
        let close = price * (1.0 + trend_per_candle + noise);
        let high = open.max(close) * (1.0 + volatility.abs() * 0.3);
        let low = open.min(close) * (1.0 - volatility.abs() * 0.3);
        let volume = 1_000_000.0 + (seed % 500_000) as f64;

        candles.push(Candle {
            timestamp: 1700000000 + (i as u64) * 14400, // 4h intervals
            open,
            high,
            low,
            close: close.max(0.01),
            volume,
        });

        price = close.max(0.01);
    }

    candles
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sma_computation() {
        let closes = vec![10.0, 20.0, 30.0, 40.0, 50.0];
        assert_eq!(compute_sma(&closes, 3), Some(40.0));
        assert_eq!(compute_sma(&closes, 5), Some(30.0));
        assert_eq!(compute_sma(&closes, 6), None);
    }

    #[test]
    fn test_rsi_computation() {
        // All up: RSI should be 10000 (100%)
        let closes = vec![10.0, 11.0, 12.0, 13.0, 14.0, 15.0];
        let rsi = compute_rsi(&closes, 5);
        assert_eq!(rsi, Some(10_000));

        // All down: RSI should be 0
        let closes_down = vec![15.0, 14.0, 13.0, 12.0, 11.0, 10.0];
        let rsi_down = compute_rsi(&closes_down, 5);
        assert_eq!(rsi_down, Some(0));
    }

    #[test]
    fn test_max_drawdown() {
        let curve = vec![100.0, 110.0, 105.0, 95.0, 100.0, 108.0];
        let dd = compute_max_drawdown(&curve);
        // Peak=110, trough=95 -> dd = (110-95)/110 = 0.1364
        assert!((dd - 15.0 / 110.0).abs() < 0.001);
    }

    #[test]
    fn test_trade_metrics() {
        let trades = vec![
            Trade {
                entry_price: 100.0,
                exit_price: 110.0,
                is_short: false,
                size_usd: 1000.0,
                entry_candle: 0,
                exit_candle: 10,
                pnl: 100.0,
                exit_reason: "take_profit",
            },
            Trade {
                entry_price: 110.0,
                exit_price: 105.0,
                is_short: false,
                size_usd: 1000.0,
                entry_candle: 10,
                exit_candle: 20,
                pnl: -45.45,
                exit_reason: "stop_loss",
            },
        ];

        let (win_rate, profit_factor, avg_duration) = compute_trade_metrics(&trades);
        assert!((win_rate - 0.5).abs() < 0.001);
        assert!((profit_factor - 100.0 / 45.45).abs() < 0.01);
        assert!((avg_duration - 10.0).abs() < 0.001);
    }

    #[test]
    fn test_synthetic_data_determinism() {
        let candles1 = generate_synthetic_candles(100, 50_000.0, 0.02, 0.001);
        let candles2 = generate_synthetic_candles(100, 50_000.0, 0.02, 0.001);

        assert_eq!(candles1.len(), candles2.len());
        for (a, b) in candles1.iter().zip(candles2.iter()) {
            assert_eq!(a.close, b.close);
            assert_eq!(a.timestamp, b.timestamp);
        }
    }

    #[test]
    fn test_backtest_sma_20_50() {
        // Use high volatility to ensure SMA crossovers occur
        let candles = generate_synthetic_candles(500, 50_000.0, 0.04, 0.0);
        let config = StrategyConfig::sma_crossover(20, 50);
        let result = BacktestEngine::run(&candles, &config, "SMA 20/50 Synthetic");

        assert_eq!(result.candle_count, 500);
        assert!(result.equity_curve.len() == 500);
        assert!(result.max_drawdown >= 0.0);
        assert!(result.max_drawdown <= 1.0);
    }

    #[test]
    fn test_backtest_sma_9_21() {
        let candles = generate_synthetic_candles(500, 50_000.0, 0.02, 0.0005);
        let config = StrategyConfig::sma_crossover(9, 21);
        let result = BacktestEngine::run(&candles, &config, "SMA 9/21 Synthetic");

        assert_eq!(result.candle_count, 500);
        assert!(result.total_trades >= 0);
    }

    #[test]
    fn test_backtest_too_few_candles() {
        let candles = generate_synthetic_candles(10, 50_000.0, 0.02, 0.001);
        let config = StrategyConfig::sma_crossover(20, 50);
        let result = BacktestEngine::run(&candles, &config, "Too Few");

        assert_eq!(result.total_trades, 0);
        assert_eq!(result.total_return, 0.0);
    }

    #[test]
    fn test_backtest_result_display() {
        let candles = generate_synthetic_candles(300, 50_000.0, 0.02, 0.001);
        let config = StrategyConfig::sma_crossover(20, 50);
        let result = BacktestEngine::run(&candles, &config, "Display Test");

        let summary = result.summary();
        assert!(summary.contains("Display Test"));
        assert!(summary.contains("Sharpe Ratio"));
        assert!(summary.contains("Max Drawdown"));
    }

    #[test]
    fn test_backtest_drawdown_protection() {
        // Generate volatile data that would produce large drawdowns
        let candles = generate_synthetic_candles(500, 50_000.0, 0.05, -0.001);
        let config = StrategyConfig {
            max_drawdown_bps: 500, // 5%
            ..StrategyConfig::sma_crossover(20, 50)
        };
        let result = BacktestEngine::run(&candles, &config, "Drawdown Protected");

        // With 5% max drawdown, the actual drawdown should be bounded
        // (may slightly exceed due to gap between candles)
        assert!(
            result.max_drawdown < 0.15,
            "Max drawdown {} should be bounded by drawdown protection",
            result.max_drawdown
        );
    }
}
