use serde::{Deserialize, Serialize};

/// Polymarket market summary from the CLOB API.
#[derive(Debug, Clone, Deserialize)]
pub struct Market {
    pub condition_id: String,
    pub question_id: String,
    pub tokens: Vec<Token>,
    pub minimum_order_size: Option<f64>,
    pub minimum_tick_size: Option<f64>,
    pub active: bool,
    pub closed: bool,
    pub end_date_iso: Option<String>,
}

/// Outcome token metadata.
#[derive(Debug, Clone, Deserialize)]
pub struct Token {
    pub token_id: String,
    pub outcome: String, // "Yes" or "No"
    pub price: f64,
    pub winner: bool,
}

/// Order book entry.
#[derive(Debug, Clone, Deserialize)]
pub struct OrderBookEntry {
    pub price: String,
    pub size: String,
}

/// Order book snapshot.
#[derive(Debug, Clone, Deserialize)]
pub struct OrderBook {
    pub bids: Vec<OrderBookEntry>,
    pub asks: Vec<OrderBookEntry>,
    pub market: String,
    pub asset_id: String,
    pub hash: String,
    pub timestamp: String,
}

/// Simplified order book prices.
#[derive(Debug, Clone, Default)]
pub struct BookPrices {
    pub best_bid: f64,
    pub best_ask: f64,
    pub mid_price: f64,
    pub spread: f64,
}

/// Trade history entry.
#[derive(Debug, Clone, Deserialize)]
pub struct Trade {
    pub id: String,
    pub price: String,
    pub size: String,
    pub side: String,
    pub timestamp: String,
}

/// Position in an outcome token.
#[derive(Debug, Clone, Default, Serialize)]
pub struct Position {
    pub token_id: String,
    pub side: String, // "Yes" or "No"
    pub size: f64,
    pub entry_price: f64,
}

/// Bot configuration parsed from env.
#[derive(Debug, Clone)]
pub struct BotConfig {
    pub condition_id: String,
    pub yes_token_id: String,
    pub no_token_id: String,
    pub strategy_mode: u8,
    pub buy_threshold: f64,
    pub sell_threshold: f64,
    pub max_position_usdc: f64,
    pub slippage_bps: u64,
    pub stop_loss_bps: u64,
    pub take_profit_bps: u64,
    pub monitor_interval_secs: u64,
}
