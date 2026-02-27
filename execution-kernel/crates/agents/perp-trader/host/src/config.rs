//! CLI arguments and configuration.

use clap::Parser;

/// Perp-trader host CLI: single-shot execution cycle.
///
/// Fetches market data, builds inputs, optionally generates a ZK proof,
/// and submits on-chain via KernelVault.executeWithOracle().
#[derive(Parser, Debug)]
#[command(name = "perp-host", version, about)]
pub struct Cli {
    // ---- On-chain config ----
    /// KernelVault contract address (0x-prefixed)
    #[arg(long, env = "VAULT_ADDRESS")]
    pub vault: String,

    /// RPC endpoint URL
    #[arg(long, env = "RPC_URL")]
    pub rpc: String,

    /// Private key for transaction signing (0x-prefixed hex, or env:VAR_NAME)
    #[arg(long, env = "PRIVATE_KEY")]
    pub pk: String,

    /// Oracle signer private key (0x-prefixed hex, or env:VAR_NAME)
    #[arg(long, env = "ORACLE_KEY")]
    pub oracle_key: String,

    /// Path to agent-pack bundle directory
    #[arg(long)]
    pub bundle: String,

    // ---- Market config ----
    /// Asset symbol for Hyperliquid (e.g., "BTC", "ETH")
    #[arg(long, default_value = "BTC")]
    pub asset: String,

    /// Hyperliquid API base URL
    #[arg(long, default_value = "https://api.hyperliquid-testnet.xyz")]
    pub hl_url: String,

    /// Sub-account address on Hyperliquid (0x-prefixed)
    #[arg(long, env = "SUB_ACCOUNT")]
    pub sub_account: String,

    // ---- Strategy config ----
    /// Fast SMA period (candles)
    #[arg(long, default_value_t = 3)]
    pub sma_fast: usize,

    /// Slow SMA period (candles)
    #[arg(long, default_value_t = 8)]
    pub sma_slow: usize,

    /// RSI period (candles)
    #[arg(long, default_value_t = 14)]
    pub rsi_period: usize,

    /// Strategy mode: 0 = SMA crossover, 1 = Funding rate arb
    #[arg(long, default_value_t = 0)]
    pub strategy_mode: u8,

    /// Action flag: 0 = evaluate, 1 = force close, 2 = force flat
    #[arg(long, default_value_t = 0)]
    pub action_flag: u8,

    /// Max drawdown in basis points (0 = use agent default of 500)
    #[arg(long, default_value_t = 0)]
    pub max_drawdown_bps: u32,

    /// Stop loss in basis points
    #[arg(long, default_value_t = 200)]
    pub stop_loss_bps: u32,

    /// Take profit in basis points
    #[arg(long, default_value_t = 400)]
    pub take_profit_bps: u32,

    // ---- Contract addresses ----
    /// HyperliquidAdapter contract address (0x-prefixed)
    #[arg(long, env = "EXCHANGE_CONTRACT")]
    pub exchange_contract: String,

    /// USDC token address (0x-prefixed)
    #[arg(long, env = "USDC_ADDRESS")]
    pub usdc_address: String,

    /// Minimum vault balance (raw USDC units, 6 decimals) to proceed with execution.
    /// If vault balance is below this, the host returns no_op immediately.
    /// Default: 1_000_000 (1 USDC). Prevents dust-level re-entry loops.
    #[arg(long, default_value_t = 1_000_000)]
    pub min_balance: u64,

    /// State file path for tracking open positions between cycles.
    /// Prevents re-entry when HyperCore hasn't settled the previous position.
    #[arg(long, default_value = "/tmp/perp-trader-state.json")]
    pub state_file: String,

    /// Timeout (seconds) for position pending state. If the state file is older
    /// than this, assume the position settled or failed and clear it.
    #[arg(long, default_value_t = 1800)]
    pub position_timeout: u64,

    /// Chain ID for oracle signature domain binding
    #[arg(long, default_value_t = 999)]
    pub chain_id: u64,

    /// Hyperliquid szDecimals for the traded asset (BTC=5, ETH=4, SOL=2)
    #[arg(long, default_value_t = 5)]
    pub sz_decimals: u8,

    // ---- Execution modes ----
    /// Use dev-mode proving (fast, not on-chain verifiable)
    #[arg(long, default_value_t = false)]
    pub dev_mode: bool,

    /// Build everything but skip on-chain submission
    #[arg(long, default_value_t = false)]
    pub dry_run: bool,

    /// Output results as JSON
    #[arg(long, default_value_t = false)]
    pub json: bool,
}

impl Cli {
    /// Resolve a key argument that may be a direct hex value or an env: reference.
    pub fn resolve_key(value: &str) -> crate::error::Result<String> {
        if let Some(var_name) = value.strip_prefix("env:") {
            std::env::var(var_name).map_err(|e| {
                crate::error::Error::Config(format!(
                    "Failed to read env var '{}': {}",
                    var_name, e
                ))
            })
        } else {
            Ok(value.to_string())
        }
    }

    /// Parse a 0x-prefixed hex address into a 20-byte array.
    pub fn parse_address(hex_str: &str) -> crate::error::Result<[u8; 20]> {
        let clean = hex_str.strip_prefix("0x").unwrap_or(hex_str);
        let bytes = hex::decode(clean)?;
        if bytes.len() != 20 {
            return Err(crate::error::Error::Config(format!(
                "Address must be 20 bytes, got {}",
                bytes.len()
            )));
        }
        let mut arr = [0u8; 20];
        arr.copy_from_slice(&bytes);
        Ok(arr)
    }

    /// Number of candles needed to compute all indicators with current + previous values.
    pub fn candles_needed(&self) -> usize {
        // Need max(sma_slow, rsi_period + 1) + 1 for previous values
        let indicator_max = self.sma_slow.max(self.rsi_period + 1);
        indicator_max + 2
    }
}
