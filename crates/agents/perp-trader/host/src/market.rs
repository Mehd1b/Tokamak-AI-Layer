//! Market data provider trait and snapshot type.

use crate::error::Result;

/// Aggregated market snapshot from a single fetch cycle.
#[derive(Debug, Clone)]
pub struct MarketSnapshot {
    /// Mark price (float, will be scaled to 1e8 later)
    pub mark_price: f64,
    /// Oracle/index price
    pub index_price: f64,
    /// Best bid price
    pub best_bid: f64,
    /// Best ask price
    pub best_ask: f64,
    /// Funding rate (signed, positive = longs pay shorts)
    pub funding_rate: f64,
    /// Current position size (negative = short)
    pub position_size: f64,
    /// Entry price of current position (0 if no position)
    pub entry_price: f64,
    /// Unrealized PnL (signed)
    pub unrealized_pnl: f64,
    /// Available balance (USDC)
    pub available_balance: f64,
    /// Account equity (USDC)
    pub account_equity: f64,
    /// Margin used (USDC)
    pub margin_used: f64,
    /// Liquidation price (0 if no position)
    pub liquidation_price: f64,
    /// OHLCV candle close prices (newest last)
    pub candle_closes: Vec<f64>,
    /// Timestamp (unix seconds)
    pub timestamp: u64,
}

/// Trait for fetching market data from an exchange.
pub trait MarketDataProvider {
    /// Fetch a complete market snapshot for the given asset.
    fn fetch_snapshot(&self, asset: &str, sub_account: &str, candle_count: usize)
        -> Result<MarketSnapshot>;
}
