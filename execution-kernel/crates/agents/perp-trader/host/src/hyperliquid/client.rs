//! Hyperliquid REST API client implementing MarketDataProvider.

use crate::error::{Error, Result};
use crate::market::{MarketDataProvider, MarketSnapshot};
use super::types::*;

/// Hyperliquid REST API client (blocking).
pub struct HyperliquidClient {
    base_url: String,
    client: reqwest::blocking::Client,
}

impl HyperliquidClient {
    pub fn new(base_url: &str) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            client: reqwest::blocking::Client::new(),
        }
    }

    /// POST to /info endpoint with a JSON body.
    fn post_info<T: serde::de::DeserializeOwned>(&self, body: &serde_json::Value) -> Result<T> {
        let url = format!("{}/info", self.base_url);
        let resp = self.client.post(&url).json(body).send()?;
        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().unwrap_or_default();
            return Err(Error::MarketData(format!(
                "Hyperliquid API returned {}: {}",
                status, text
            )));
        }
        let result = resp.json::<T>()?;
        Ok(result)
    }

    /// Fetch asset contexts (prices, funding, etc.)
    fn fetch_meta_and_asset_ctxs(&self) -> Result<MetaAndAssetCtxsResponse> {
        self.post_info(&serde_json::json!({
            "type": "metaAndAssetCtxs"
        }))
    }

    /// Fetch L2 order book for an asset.
    fn fetch_l2_book(&self, coin: &str) -> Result<L2BookResponse> {
        self.post_info(&serde_json::json!({
            "type": "l2Book",
            "coin": coin
        }))
    }

    /// Fetch clearinghouse state for a user.
    fn fetch_clearinghouse_state(&self, user: &str) -> Result<ClearinghouseState> {
        self.post_info(&serde_json::json!({
            "type": "clearinghouseState",
            "user": user
        }))
    }

    /// Fetch candle snapshots.
    fn fetch_candles(&self, coin: &str, interval: &str, count: usize) -> Result<Vec<CandleSnapshot>> {
        // Hyperliquid uses startTime. We request from far enough back.
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        // Each 1h candle = 3600s. Request enough history.
        let interval_ms: u64 = match interval {
            "1m" => 60_000,
            "15m" => 900_000,
            "1h" => 3_600_000,
            "4h" => 14_400_000,
            "1d" => 86_400_000,
            _ => 60_000,
        };
        let start_time = now_ms - (count as u64 + 5) * interval_ms;

        let candles: Vec<CandleSnapshot> = self.post_info(&serde_json::json!({
            "type": "candleSnapshot",
            "req": {
                "coin": coin,
                "interval": interval,
                "startTime": start_time,
                "endTime": now_ms
            }
        }))?;

        Ok(candles)
    }

    /// Find the asset index for a given coin name in the meta response.
    fn find_asset_index(meta: &MetaResponse, coin: &str) -> Option<usize> {
        meta.universe.iter().position(|a| a.name == coin)
    }
}

/// Parse a decimal string to f64, returning 0.0 on failure.
fn parse_decimal(s: &str) -> f64 {
    s.parse::<f64>().unwrap_or(0.0)
}

impl MarketDataProvider for HyperliquidClient {
    fn fetch_snapshot(
        &self,
        asset: &str,
        sub_account: &str,
        candle_count: usize,
    ) -> Result<MarketSnapshot> {
        // 1. Fetch meta + asset contexts
        let meta_resp = self.fetch_meta_and_asset_ctxs()?;
        let asset_idx = Self::find_asset_index(&meta_resp.0, asset)
            .ok_or_else(|| Error::MarketData(format!("Asset '{}' not found on Hyperliquid", asset)))?;
        let ctx = meta_resp
            .1
            .get(asset_idx)
            .ok_or_else(|| Error::MarketData("Asset context missing".into()))?;

        let mark_price = parse_decimal(&ctx.mark_px);
        let index_price = parse_decimal(&ctx.oracle_px);
        let funding_rate = parse_decimal(&ctx.funding);

        // 2. Fetch L2 book
        let book = self.fetch_l2_book(asset)?;
        let best_bid = book
            .levels
            .first()
            .and_then(|bids| bids.first())
            .map(|l| parse_decimal(&l.px))
            .unwrap_or(mark_price);
        let best_ask = book
            .levels
            .get(1)
            .and_then(|asks| asks.first())
            .map(|l| parse_decimal(&l.px))
            .unwrap_or(mark_price);

        // 3. Fetch clearinghouse state
        let ch_state = self.fetch_clearinghouse_state(sub_account)?;

        // Find position for this asset
        let position = ch_state
            .asset_positions
            .iter()
            .find(|p| p.position.coin == asset);

        let (position_size, entry_price, unrealized_pnl, liquidation_price, margin_used_pos) =
            if let Some(pos) = position {
                (
                    parse_decimal(&pos.position.szi),
                    pos.position
                        .entry_px
                        .as_deref()
                        .map(parse_decimal)
                        .unwrap_or(0.0),
                    parse_decimal(&pos.position.unrealized_pnl),
                    pos.position
                        .liquidation_px
                        .as_deref()
                        .map(parse_decimal)
                        .unwrap_or(0.0),
                    parse_decimal(&pos.position.margin_used),
                )
            } else {
                (0.0, 0.0, 0.0, 0.0, 0.0)
            };

        let account_equity = parse_decimal(&ch_state.margin_summary.account_value);
        let total_margin_used = parse_decimal(&ch_state.margin_summary.total_margin_used);
        let available_balance = account_equity - total_margin_used;

        // 4. Fetch candles (1m for high-frequency signal response)
        let candles = self.fetch_candles(asset, "1m", candle_count)?;
        let candle_closes: Vec<f64> = candles.iter().map(|c| parse_decimal(&c.close)).collect();

        // Use current time as timestamp
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        Ok(MarketSnapshot {
            mark_price,
            index_price,
            best_bid,
            best_ask,
            funding_rate,
            position_size,
            entry_price,
            unrealized_pnl,
            available_balance,
            account_equity,
            margin_used: total_margin_used,
            liquidation_price,
            candle_closes,
            timestamp,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_decimal() {
        assert_eq!(parse_decimal("50123.45"), 50123.45);
        assert_eq!(parse_decimal("-0.001"), -0.001);
        assert_eq!(parse_decimal("invalid"), 0.0);
    }

    /// Integration test hitting testnet API. Run with: cargo test -p perp-trader-host -- --ignored
    #[test]
    #[ignore]
    fn test_fetch_snapshot_testnet() {
        let client = HyperliquidClient::new("https://api.hyperliquid-testnet.xyz");
        // Use a dummy sub-account address
        let result = client.fetch_snapshot(
            "BTC",
            "0x0000000000000000000000000000000000000000",
            30,
        );
        match result {
            Ok(snapshot) => {
                assert!(snapshot.mark_price > 0.0, "Mark price should be positive");
                assert!(snapshot.best_bid > 0.0);
                assert!(snapshot.best_ask > 0.0);
                assert!(!snapshot.candle_closes.is_empty());
                eprintln!("Snapshot: mark={:.2}, candles={}", snapshot.mark_price, snapshot.candle_closes.len());
            }
            Err(e) => {
                eprintln!("Testnet fetch failed (may be expected in CI): {}", e);
            }
        }
    }
}
