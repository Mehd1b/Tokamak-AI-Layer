//! Unified error type for the perp-trader host CLI.

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Market data fetch failed: {0}")]
    MarketData(String),

    #[error("Indicator computation failed: {0}")]
    Indicator(String),

    #[error("Oracle signing failed: {0}")]
    OracleSigning(String),

    #[error("Input building failed: {0}")]
    InputBuild(String),

    #[error("Output reconstruction failed: {0}")]
    OutputReconstruct(String),

    #[error("Proving failed: {0}")]
    Proving(String),

    #[error("On-chain error: {0}")]
    OnChain(String),

    #[error("Bundle error: {0}")]
    Bundle(String),

    #[error("Config error: {0}")]
    Config(String),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Hex decode error: {0}")]
    Hex(#[from] hex::FromHexError),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

pub type Result<T> = std::result::Result<T, Error>;
