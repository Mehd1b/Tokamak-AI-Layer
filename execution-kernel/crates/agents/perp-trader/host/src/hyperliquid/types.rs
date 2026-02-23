//! Serde response types for the Hyperliquid REST API.

use serde::Deserialize;

/// Response from the "metaAndAssetCtxs" info endpoint.
/// Returns a tuple: [meta, [assetCtx, ...]]
#[derive(Debug, Deserialize)]
pub struct MetaAndAssetCtxsResponse(pub MetaResponse, pub Vec<AssetCtx>);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaResponse {
    pub universe: Vec<AssetMeta>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetMeta {
    pub name: String,
    pub sz_decimals: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetCtx {
    pub funding: String,
    pub open_interest: String,
    pub prev_day_px: String,
    pub day_ntl_vlm: String,
    pub premium: Option<String>,
    pub oracle_px: String,
    pub mark_px: String,
}

/// Response from the "l2Book" info endpoint.
#[derive(Debug, Deserialize)]
pub struct L2BookResponse {
    pub levels: Vec<Vec<L2Level>>,
}

#[derive(Debug, Deserialize)]
pub struct L2Level {
    pub px: String,
    pub sz: String,
    pub n: u32,
}

/// Response from the "clearinghouseState" info endpoint.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearinghouseState {
    pub margin_summary: MarginSummary,
    pub cross_margin_summary: MarginSummary,
    pub asset_positions: Vec<AssetPosition>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarginSummary {
    pub account_value: String,
    pub total_ntl_pos: String,
    pub total_raw_usd: String,
    pub total_margin_used: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetPosition {
    pub position: PositionData,
    #[serde(rename = "type")]
    pub position_type: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionData {
    pub coin: String,
    pub szi: String,
    pub entry_px: Option<String>,
    pub position_value: String,
    pub unrealized_pnl: String,
    pub liquidation_px: Option<String>,
    pub leverage: Option<LeverageInfo>,
    pub margin_used: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeverageInfo {
    #[serde(rename = "type")]
    pub leverage_type: String,
    pub value: u32,
}

/// Response from the "candleSnapshot" info endpoint.
#[derive(Debug, Deserialize)]
pub struct CandleSnapshot {
    #[serde(rename = "t")]
    pub time: u64,
    #[serde(rename = "T")]
    pub time_close: u64,
    #[serde(rename = "s")]
    pub symbol: String,
    #[serde(rename = "i")]
    pub interval: String,
    #[serde(rename = "o")]
    pub open: String,
    #[serde(rename = "c")]
    pub close: String,
    #[serde(rename = "h")]
    pub high: String,
    #[serde(rename = "l")]
    pub low: String,
    #[serde(rename = "v")]
    pub volume: String,
    #[serde(rename = "n")]
    pub num_trades: u64,
}
