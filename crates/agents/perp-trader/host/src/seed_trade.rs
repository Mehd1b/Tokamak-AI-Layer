//! REST API seed trade module.
//!
//! When no position exists on HyperCore (leverage=0 in position precompile),
//! CoreWriter limit orders are silently dropped. This module uses a Python
//! helper script (calling the Hyperliquid Exchange REST API via the API wallet)
//! to place the opening trade, after which CoreWriter works normally.
//!
//! The API wallet is a fresh EOA registered on the sub-account via CoreWriter
//! action 9. Its REST API actions route to the sub-account automatically.

use crate::config::Cli;
use kernel_core::{AgentOutput, CanonicalDecode, ACTION_TYPE_CALL};

/// Selector for openPosition(bool,uint256,uint256,uint256) = 0x04ba41cb
const OPEN_POSITION_SELECTOR: [u8; 4] = [0x04, 0xba, 0x41, 0xcb];

/// Selector for closePositionAtPrice(uint64) = 0x2c0f36da
const CLOSE_AT_PRICE_SELECTOR: [u8; 4] = [0x2c, 0x0f, 0x36, 0xda];

/// Selector for closePosition() = 0xc393d0e3 [legacy]
const CLOSE_POSITION_SELECTOR: [u8; 4] = [0xc3, 0x93, 0xd0, 0xe3];

/// Parsed parameters from an openPosition CALL action.
#[derive(Debug)]
pub struct OpenPositionParams {
    pub is_buy: bool,
    pub margin_amount: u64,  // USDC raw (1e6)
    pub order_size: u64,     // szDecimals-scaled
    pub limit_price: u64,    // 1e8-scaled
}

/// Parsed parameters from a closePosition CALL action.
#[derive(Debug)]
pub struct ClosePositionParams {
    pub _detected: bool,
}

/// What kind of trade the agent wants to make.
#[derive(Debug)]
pub enum AgentIntent {
    Open(OpenPositionParams),
    Close,
    NoOp,
}

/// Result from the seed trade Python script.
#[derive(Debug, serde::Deserialize)]
pub struct SeedTradeResult {
    pub status: String,
    #[serde(default)]
    pub avg_price: Option<String>,
    #[serde(default)]
    pub total_size: Option<String>,
    #[serde(default)]
    pub step: Option<String>,
    #[serde(default)]
    pub detail: Option<String>,
}

/// Parse agent output bytes to determine the agent's intent.
pub fn parse_agent_intent(agent_output_bytes: &[u8]) -> AgentIntent {
    let output = match AgentOutput::decode(agent_output_bytes) {
        Ok(o) => o,
        Err(_) => return AgentIntent::NoOp,
    };

    if output.actions.is_empty() {
        return AgentIntent::NoOp;
    }

    // Look for openPosition or closePosition CALL actions
    for action in &output.actions {
        if action.action_type != ACTION_TYPE_CALL {
            continue;
        }

        // Extract calldata from the CALL payload.
        // Payload format: abi.encode(uint256 value, bytes callData)
        //   bytes 0-31:  value
        //   bytes 32-63: offset to bytes data (always 64)
        //   bytes 64-95: length of callData
        //   bytes 96+:   callData
        if action.payload.len() < 100 {
            continue;
        }

        // Read calldata length from bytes 64-95 (big-endian u256, last 8 bytes)
        let cd_len = u64::from_be_bytes(
            action.payload[88..96].try_into().unwrap_or([0u8; 8])
        ) as usize;

        if action.payload.len() < 96 + cd_len || cd_len < 4 {
            continue;
        }

        let calldata = &action.payload[96..96 + cd_len];
        let selector: [u8; 4] = calldata[0..4].try_into().unwrap_or([0; 4]);

        if selector == OPEN_POSITION_SELECTOR && cd_len >= 132 {
            // openPosition(bool isBuy, uint256 marginAmount, uint256 orderSize, uint256 limitPrice)
            // Each param is 32 bytes after the 4-byte selector
            let is_buy = calldata[35] != 0; // byte 4+31
            let margin_amount = u64::from_be_bytes(
                calldata[60..68].try_into().unwrap_or([0u8; 8])
            );
            let order_size = u64::from_be_bytes(
                calldata[92..100].try_into().unwrap_or([0u8; 8])
            );
            let limit_price = u64::from_be_bytes(
                calldata[124..132].try_into().unwrap_or([0u8; 8])
            );

            return AgentIntent::Open(OpenPositionParams {
                is_buy,
                margin_amount,
                order_size,
                limit_price,
            });
        }

        if selector == CLOSE_AT_PRICE_SELECTOR || selector == CLOSE_POSITION_SELECTOR {
            return AgentIntent::Close;
        }
    }

    AgentIntent::NoOp
}

/// Resolve the Python script path from CLI config.
fn resolve_script_path(cli: &Cli) -> String {
    if let Some(ref path) = cli.seed_script {
        path.clone()
    } else {
        let bundle_dir = std::path::Path::new(&cli.bundle);
        let script = bundle_dir.parent()
            .unwrap_or(bundle_dir)
            .join("scripts")
            .join("hl_seed_trade.py");
        script.to_string_lossy().to_string()
    }
}

/// Spawn a Python subprocess, wait with timeout, and return stdout.
///
/// Stderr is inherited (goes directly to terminal for real-time diagnostics).
/// On timeout, the child process is killed via SIGKILL.
fn run_python_with_timeout(
    mut child: std::process::Child,
    timeout_secs: u64,
    label: &str,
) -> anyhow::Result<String> {
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(timeout_secs);

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let mut stdout_buf = String::new();
                if let Some(mut stdout) = child.stdout.take() {
                    use std::io::Read;
                    let _ = stdout.read_to_string(&mut stdout_buf);
                }

                if !status.success() {
                    return Err(anyhow::anyhow!("{} script exited with status: {}", label, status));
                }
                return Ok(stdout_buf);
            }
            Ok(None) => {
                if start.elapsed() > timeout {
                    eprintln!("  [{}] Timeout after {}s — killing process", label, timeout_secs);
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(anyhow::anyhow!("{} timed out after {}s", label, timeout_secs));
                }
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
            Err(e) => return Err(anyhow::anyhow!("{} wait failed: {}", label, e)),
        }
    }
}

/// Execute a seed trade via the Python helper script.
///
/// Sets leverage on HyperCore and places the opening order via the REST API.
/// Returns the result from the Python script.
pub fn execute_seed_trade(
    cli: &Cli,
    params: &OpenPositionParams,
) -> anyhow::Result<SeedTradeResult> {
    let api_key = cli.api_wallet_key.as_ref()
        .ok_or_else(|| anyhow::anyhow!(
            "api_wallet_key is required for seed trades (no position exists, CoreWriter can't place orders)"
        ))?;

    let api_key = Cli::resolve_key(api_key)?;
    let script_path = resolve_script_path(cli);

    // Convert order_size from szDecimals-scaled to float
    let sz_divisor = 10u64.pow(cli.sz_decimals as u32);
    let size_float = params.order_size as f64 / sz_divisor as f64;

    // Convert limit_price from 1e8 to float
    let price_float = params.limit_price as f64 / 100_000_000.0;

    // Round price to tick size ($1 for BTC)
    let price_rounded = price_float.round();

    eprintln!(
        "  Seed trade: {} {:.5} {} @ ${:.0} (leverage={}x)",
        if params.is_buy { "BUY" } else { "SELL" },
        size_float,
        cli.asset,
        price_rounded,
        cli.seed_leverage,
    );

    let child = std::process::Command::new("python3")
        .arg(&script_path)
        .arg("seed_trade")
        .arg("--key")
        .arg(&api_key)
        .arg("--hl-url")
        .arg(&cli.hl_url)
        .arg("--asset")
        .arg(&cli.asset)
        .arg("--leverage")
        .arg(cli.seed_leverage.to_string())
        .arg("--is-buy")
        .arg(if params.is_buy { "true" } else { "false" })
        .arg("--size")
        .arg(format!("{:.width$}", size_float, width = cli.sz_decimals as usize))
        .arg("--price")
        .arg(format!("{:.0}", price_rounded))
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::inherit())
        .spawn()
        .map_err(|e| anyhow::anyhow!("Failed to spawn seed trade script: {}", e))?;

    let stdout = run_python_with_timeout(child, 30, "seed_trade")?;
    let result: SeedTradeResult = serde_json::from_str(stdout.trim())
        .map_err(|e| anyhow::anyhow!("Failed to parse seed trade result: {} (raw: {})", e, stdout))?;

    Ok(result)
}

/// Execute a close trade via the Python helper script (REST API fallback).
///
/// When a ZK-proven close order is silently rejected by HyperCore (e.g., due to
/// price staleness after proof generation), this function places the closing order
/// via the REST API using real-time L2 orderbook prices that are always within
/// the oracle band.
pub fn execute_close_trade(
    cli: &Cli,
    is_buy: bool,
    size: f64,
    fallback_price: f64,
) -> anyhow::Result<SeedTradeResult> {
    let api_key = cli.api_wallet_key.as_ref()
        .ok_or_else(|| anyhow::anyhow!(
            "api_wallet_key is required for REST API close fallback"
        ))?;
    let api_key = Cli::resolve_key(api_key)?;
    let script_path = resolve_script_path(cli);

    // Round price to tick size ($1 for BTC)
    let price_rounded = fallback_price.round();

    eprintln!(
        "  REST API close: {} {:.5} {} @ ${:.0} (reduce-only)",
        if is_buy { "BUY" } else { "SELL" },
        size,
        cli.asset,
        price_rounded,
    );

    let child = std::process::Command::new("python3")
        .arg(&script_path)
        .arg("close_position")
        .arg("--key")
        .arg(&api_key)
        .arg("--hl-url")
        .arg(&cli.hl_url)
        .arg("--asset")
        .arg(&cli.asset)
        .arg("--is-buy")
        .arg(if is_buy { "true" } else { "false" })
        .arg("--size")
        .arg(format!("{:.width$}", size, width = cli.sz_decimals as usize))
        .arg("--price")
        .arg(format!("{:.0}", price_rounded))
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::inherit())
        .spawn()
        .map_err(|e| anyhow::anyhow!("Failed to spawn close trade script: {}", e))?;

    let stdout = run_python_with_timeout(child, 30, "close_trade")?;
    let result: SeedTradeResult = serde_json::from_str(stdout.trim())
        .map_err(|e| anyhow::anyhow!("Failed to parse close trade result: {} (raw: {})", e, stdout))?;

    Ok(result)
}

/// Set leverage via REST API without placing any order.
///
/// CoreWriter requires leverage > 0 to process limit orders. When no position
/// exists, the precompile returns leverage=0. This function calls the Hyperliquid
/// REST API to set leverage so that the ZK-proven openPosition via CoreWriter
/// will be accepted by HyperCore.
pub fn set_leverage_only(cli: &Cli) -> anyhow::Result<()> {
    let api_key = cli.api_wallet_key.as_ref()
        .ok_or_else(|| anyhow::anyhow!("api_wallet_key required for leverage setting"))?;
    let api_key = Cli::resolve_key(api_key)?;
    let script_path = resolve_script_path(cli);

    let child = std::process::Command::new("python3")
        .arg(&script_path)
        .arg("set_leverage")
        .arg("--key")
        .arg(&api_key)
        .arg("--hl-url")
        .arg(&cli.hl_url)
        .arg("--asset")
        .arg(&cli.asset)
        .arg("--leverage")
        .arg(cli.seed_leverage.to_string())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::inherit())
        .spawn()
        .map_err(|e| anyhow::anyhow!("Failed to spawn set_leverage script: {}", e))?;

    let stdout = run_python_with_timeout(child, 15, "set_leverage")?;
    let result: serde_json::Value = serde_json::from_str(stdout.trim())
        .map_err(|e| anyhow::anyhow!("Failed to parse set_leverage result: {}", e))?;

    if result.get("status").and_then(|s| s.as_str()) != Some("ok") {
        return Err(anyhow::anyhow!("set_leverage returned error: {}", result));
    }

    Ok(())
}
