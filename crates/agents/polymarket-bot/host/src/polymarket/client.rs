use anyhow::{Context, Result};
use reqwest::Client;
use super::types::*;

const CLOB_API_BASE: &str = "https://clob.polymarket.com";
const GAMMA_API_BASE: &str = "https://gamma-api.polymarket.com";

/// Polymarket CLOB API client.
pub struct PolymarketClient {
    http: Client,
}

impl PolymarketClient {
    pub fn new() -> Self {
        Self {
            http: Client::new(),
        }
    }

    /// Fetch market info by condition ID.
    pub async fn get_market(&self, condition_id: &str) -> Result<Market> {
        let url = format!("{}/markets/{}", GAMMA_API_BASE, condition_id);
        let resp = self.http.get(&url)
            .send()
            .await
            .context("Failed to fetch market")?;
        resp.json().await.context("Failed to parse market response")
    }

    /// Fetch order book for a specific token.
    pub async fn get_order_book(&self, token_id: &str) -> Result<OrderBook> {
        let url = format!("{}/book", CLOB_API_BASE);
        let resp = self.http.get(&url)
            .query(&[("token_id", token_id)])
            .send()
            .await
            .context("Failed to fetch order book")?;
        resp.json().await.context("Failed to parse order book response")
    }

    /// Get best bid/ask/mid from order book.
    pub async fn get_book_prices(&self, token_id: &str) -> Result<BookPrices> {
        let book = self.get_order_book(token_id).await?;

        let best_bid = book.bids.first()
            .and_then(|b| b.price.parse::<f64>().ok())
            .unwrap_or(0.0);

        let best_ask = book.asks.first()
            .and_then(|a| a.price.parse::<f64>().ok())
            .unwrap_or(1.0);

        let mid_price = (best_bid + best_ask) / 2.0;
        let spread = best_ask - best_bid;

        Ok(BookPrices {
            best_bid,
            best_ask,
            mid_price,
            spread,
        })
    }

    /// Fetch recent trades for volume estimation.
    pub async fn get_trades(&self, token_id: &str, limit: u32) -> Result<Vec<Trade>> {
        let url = format!("{}/trades", CLOB_API_BASE);
        let resp = self.http.get(&url)
            .query(&[
                ("token_id", token_id),
                ("limit", &limit.to_string()),
            ])
            .send()
            .await
            .context("Failed to fetch trades")?;
        resp.json().await.context("Failed to parse trades response")
    }

    /// Estimate 24h volume from recent trades.
    pub async fn estimate_24h_volume(&self, token_id: &str) -> Result<f64> {
        let trades = self.get_trades(token_id, 500).await?;
        let total: f64 = trades.iter()
            .filter_map(|t| {
                let price: f64 = t.price.parse().ok()?;
                let size: f64 = t.size.parse().ok()?;
                Some(price * size)
            })
            .sum();
        Ok(total)
    }
}
