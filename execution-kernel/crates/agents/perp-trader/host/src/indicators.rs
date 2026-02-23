//! Technical indicator computation (SMA, RSI).

use crate::config::Cli;
use crate::error::{Error, Result};

/// Computed indicator values for current and previous candle.
#[derive(Debug, Clone)]
pub struct IndicatorSet {
    pub sma_fast: f64,
    pub sma_slow: f64,
    pub rsi_bps: u32,
    pub prev_sma_fast: f64,
    pub prev_sma_slow: f64,
}

/// Compute Simple Moving Average over the last `period` close prices.
pub fn compute_sma(closes: &[f64], period: usize) -> Option<f64> {
    if closes.len() < period || period == 0 {
        return None;
    }
    let sum: f64 = closes[closes.len() - period..].iter().sum();
    Some(sum / period as f64)
}

/// Compute RSI (Relative Strength Index) over the last `period` candles.
/// Returns value in 0-10000 basis points (matching agent's u32 format).
pub fn compute_rsi(closes: &[f64], period: usize) -> Option<u32> {
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

/// Compute full indicator set: current + previous SMA values.
pub fn compute_indicators(candle_closes: &[f64], cli: &Cli) -> Result<IndicatorSet> {
    let n = candle_closes.len();

    // Current indicators (all candles)
    let sma_fast = compute_sma(candle_closes, cli.sma_fast)
        .ok_or_else(|| Error::Indicator(format!(
            "Not enough candles for fast SMA: have {}, need {}", n, cli.sma_fast
        )))?;

    let sma_slow = compute_sma(candle_closes, cli.sma_slow)
        .ok_or_else(|| Error::Indicator(format!(
            "Not enough candles for slow SMA: have {}, need {}", n, cli.sma_slow
        )))?;

    let rsi_bps = compute_rsi(candle_closes, cli.rsi_period)
        .ok_or_else(|| Error::Indicator(format!(
            "Not enough candles for RSI: have {}, need {}", n, cli.rsi_period + 1
        )))?;

    // Previous indicators (all candles except the last one)
    let prev_closes = &candle_closes[..n - 1];

    let prev_sma_fast = compute_sma(prev_closes, cli.sma_fast)
        .ok_or_else(|| Error::Indicator("Not enough candles for previous fast SMA".into()))?;

    let prev_sma_slow = compute_sma(prev_closes, cli.sma_slow)
        .ok_or_else(|| Error::Indicator("Not enough candles for previous slow SMA".into()))?;

    Ok(IndicatorSet {
        sma_fast,
        sma_slow,
        rsi_bps,
        prev_sma_fast,
        prev_sma_slow,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sma_basic() {
        let closes = vec![10.0, 20.0, 30.0, 40.0, 50.0];
        assert_eq!(compute_sma(&closes, 3), Some(40.0)); // (30+40+50)/3
        assert_eq!(compute_sma(&closes, 5), Some(30.0)); // (10+20+30+40+50)/5
    }

    #[test]
    fn test_sma_insufficient_data() {
        let closes = vec![10.0, 20.0];
        assert_eq!(compute_sma(&closes, 5), None);
    }

    #[test]
    fn test_rsi_all_gains() {
        let closes = vec![10.0, 20.0, 30.0, 40.0, 50.0];
        assert_eq!(compute_rsi(&closes, 3), Some(10_000)); // RSI 100
    }

    #[test]
    fn test_rsi_mixed() {
        let closes = vec![100.0, 110.0, 105.0, 115.0, 110.0, 120.0];
        let rsi = compute_rsi(&closes, 5).unwrap();
        assert!(rsi > 0 && rsi < 10_000);
    }

    #[test]
    fn test_rsi_insufficient_data() {
        let closes = vec![10.0, 20.0];
        assert_eq!(compute_rsi(&closes, 5), None);
    }
}
