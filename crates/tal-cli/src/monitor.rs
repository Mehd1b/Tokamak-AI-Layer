//! `tal monitor` — Live agent execution dashboard.
//!
//! Polls vault state, position data, and recent executions at a configurable
//! interval. Supports colored terminal output and --json for machine-readable
//! piping.

use crate::onchain::{build_read_provider, get_chain_config, resolve_env};
use alloy::primitives::{Address, U256};
use alloy::providers::Provider;
use alloy::sol;
use anyhow::{Context, Result};
use colored::Colorize;
use serde::Serialize;
use std::str::FromStr;

// ===========================================================================
// Contract Interfaces
// ===========================================================================

sol! {
    #[sol(rpc)]
    interface IKernelVault {
        function agentId() external view returns (bytes32);
        function trustedImageId() external view returns (bytes32);
        function totalAssets() external view returns (uint256);
        function totalShares() external view returns (uint256);
        function lastExecutionNonce() external view returns (uint64);
        function oracleSigner() external view returns (address);
        function asset() external view returns (address);
    }

    #[sol(rpc)]
    interface IERC20 {
        function balanceOf(address account) external view returns (uint256);
        function symbol() external view returns (string);
    }
}

// ===========================================================================
// Monitor Data Structures
// ===========================================================================

#[derive(Debug, Serialize)]
struct MonitorSnapshot {
    timestamp: u64,
    vault: VaultState,
    #[serde(skip_serializing_if = "Option::is_none")]
    position: Option<PositionState>,
    recent_executions: Vec<ExecutionEntry>,
}

#[derive(Debug, Serialize)]
struct VaultState {
    address: String,
    agent_id: String,
    total_assets_usdc: f64,
    total_shares: String,
    last_nonce: u64,
    oracle_signer: String,
    image_id: String,
}

#[derive(Debug, Serialize)]
struct PositionState {
    asset: String,
    side: String,
    size: f64,
    entry_price: f64,
    unrealized_pnl: f64,
    margin_used: f64,
}

#[derive(Debug, Serialize)]
struct ExecutionEntry {
    nonce: u64,
    status: String,
    action_count: u32,
    timestamp: String,
}

// ===========================================================================
// Main Monitor Entry Point
// ===========================================================================

pub fn run(
    vault_address: &str,
    interval: u64,
    chain_id: Option<u64>,
    json: bool,
    verbose: bool,
) -> Result<()> {
    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(run_async(vault_address, interval, chain_id, json, verbose))
}

async fn run_async(
    vault_address: &str,
    interval: u64,
    chain_id_opt: Option<u64>,
    json: bool,
    verbose: bool,
) -> Result<()> {
    let vault_addr = Address::from_str(vault_address)
        .with_context(|| format!("Invalid vault address: {}", vault_address))?;

    // Resolve chain
    let chain_id = chain_id_opt
        .or_else(|| resolve_env("CHAIN_ID").and_then(|s| s.parse().ok()))
        .unwrap_or(999);
    let chain = get_chain_config(chain_id)?;

    // Resolve RPC URL
    let rpc_url = resolve_env("RPC_URL")
        .or_else(|| {
            if !chain.rpc_url.is_empty() {
                Some(chain.rpc_url.to_string())
            } else {
                None
            }
        })
        .with_context(|| "RPC_URL not set")?;

    let provider = build_read_provider(&rpc_url)?;

    if !json {
        println!(
            "{} tal monitor — Agent Execution Dashboard",
            "●".cyan().bold()
        );
        println!("  Vault: {}", vault_address);
        println!("  Chain: {} ({})", chain.name, chain.chain_id);
        println!("  Interval: {}s", interval);
        println!("  Press Ctrl+C to exit");
        println!();
    }

    // Main poll loop
    loop {
        let snapshot = poll_state(&provider, vault_addr, verbose).await;

        match snapshot {
            Ok(snap) => {
                if json {
                    println!("{}", serde_json::to_string(&snap).unwrap_or_default());
                } else {
                    display_snapshot(&snap);
                }
            }
            Err(e) => {
                if json {
                    println!(
                        "{}",
                        serde_json::json!({"error": format!("{:#}", e)})
                    );
                } else {
                    println!(
                        "  {} Failed to poll: {:#}",
                        "✗".red(),
                        e
                    );
                }
            }
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(interval)).await;
    }
}

// ===========================================================================
// State Polling
// ===========================================================================

async fn poll_state(
    provider: &impl Provider<alloy::transports::http::Http<reqwest::Client>>,
    vault_addr: Address,
    _verbose: bool,
) -> Result<MonitorSnapshot> {
    let vault = IKernelVault::new(vault_addr, provider);

    // Read vault state (parallel calls)
    let (agent_id, total_assets, total_shares, last_nonce, oracle_signer, image_id) = tokio::try_join!(
        async { vault.agentId().call().await.map(|r| r._0).context("agentId") },
        async { vault.totalAssets().call().await.map(|r| r._0).context("totalAssets") },
        async { vault.totalShares().call().await.map(|r| r._0).context("totalShares") },
        async { vault.lastExecutionNonce().call().await.map(|r| r._0).context("nonce") },
        async { vault.oracleSigner().call().await.map(|r| r._0).context("oracleSigner") },
        async { vault.trustedImageId().call().await.map(|r| r._0).context("imageId") },
    )?;

    let assets_usdc = u256_to_usdc(total_assets);

    // Try to fetch position from Hyperliquid API (graceful degradation)
    let position = fetch_hyperliquid_position(vault_addr).await.ok();

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    Ok(MonitorSnapshot {
        timestamp: now,
        vault: VaultState {
            address: format!("{}", vault_addr),
            agent_id: format!("0x{}", hex::encode(agent_id)),
            total_assets_usdc: assets_usdc,
            total_shares: format!("{}", total_shares),
            last_nonce,
            oracle_signer: format!("{}", oracle_signer),
            image_id: format!("0x{}", hex::encode(image_id)),
        },
        position,
        recent_executions: vec![], // Event scanning would go here
    })
}

// ===========================================================================
// Hyperliquid Position Fetch (Graceful Degradation)
// ===========================================================================

async fn fetch_hyperliquid_position(vault_addr: Address) -> Result<PositionState> {
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "type": "clearinghouseState",
        "user": format!("{}", vault_addr)
    });

    let resp = client
        .post("https://api.hyperliquid.xyz/info")
        .json(&body)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .context("Hyperliquid API request failed")?;

    let data: serde_json::Value = resp.json().await.context("Invalid Hyperliquid response")?;

    // Parse position from clearinghouseState
    let positions = data["assetPositions"]
        .as_array()
        .context("No assetPositions")?;

    if positions.is_empty() {
        anyhow::bail!("No open positions");
    }

    let pos = &positions[0]["position"];
    let szi: f64 = pos["szi"]
        .as_str()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0.0);

    let entry_px: f64 = pos["entryPx"]
        .as_str()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0.0);

    let unrealized_pnl: f64 = pos["unrealizedPnl"]
        .as_str()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0.0);

    let margin_used: f64 = pos["marginUsed"]
        .as_str()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0.0);

    let coin = pos["coin"]
        .as_str()
        .unwrap_or("???")
        .to_string();

    let side = if szi > 0.0 { "LONG" } else { "SHORT" };

    Ok(PositionState {
        asset: coin,
        side: side.to_string(),
        size: szi.abs(),
        entry_price: entry_px,
        unrealized_pnl,
        margin_used,
    })
}

// ===========================================================================
// Terminal Display
// ===========================================================================

fn display_snapshot(snap: &MonitorSnapshot) {
    // Clear screen
    print!("\x1B[2J\x1B[1;1H");

    let v = &snap.vault;

    println!(
        "  {} Agent Monitor — {} ({})",
        "●".cyan(),
        &v.address[..10],
        short_id(&v.agent_id)
    );
    println!("  {}", "─".repeat(52));

    // Vault state
    println!(
        "  Vault     {} USDC  │  Nonce: {}",
        format!("${:.2}", v.total_assets_usdc).bold(),
        v.last_nonce
    );

    // Position (if available)
    if let Some(ref pos) = snap.position {
        let pnl_color = if pos.unrealized_pnl >= 0.0 {
            format!("+${:.2}", pos.unrealized_pnl).green()
        } else {
            format!("-${:.2}", pos.unrealized_pnl.abs()).red()
        };

        println!(
            "  Position  {} {} {} @ ${:.2}  │  PnL: {}",
            pos.asset,
            pos.side.bold(),
            pos.size,
            pos.entry_price,
            pnl_color
        );
        println!(
            "  Margin    ${:.2}",
            pos.margin_used
        );
    } else {
        println!("  Position  {}", "No open position".dimmed());
    }

    // Oracle
    let oracle_display = if v.oracle_signer == format!("{}", Address::ZERO) {
        "not configured".red().to_string()
    } else {
        format!("{}...{}", &v.oracle_signer[..6], &v.oracle_signer[38..])
    };
    println!("  Oracle    {}", oracle_display);

    println!("  {}", "─".repeat(52));

    // Recent executions
    if snap.recent_executions.is_empty() {
        println!(
            "  {}",
            "No recent executions (event scanning not yet implemented)".dimmed()
        );
    } else {
        println!("  {}", "Recent Executions".bold());
        for exec in &snap.recent_executions {
            let icon = if exec.status == "ok" {
                "✓".green()
            } else {
                "✗".red()
            };
            println!(
                "  {} #{:<4} {} actions  {}",
                icon, exec.nonce, exec.action_count, exec.timestamp
            );
        }
    }

    println!("  {}", "─".repeat(52));

    let time_str = chrono_lite(snap.timestamp);
    println!(
        "  Last poll: {}  │  Ctrl+C to exit",
        time_str.dimmed()
    );
}

// ===========================================================================
// Helpers
// ===========================================================================

fn u256_to_usdc(amount: U256) -> f64 {
    let raw: u128 = amount.try_into().unwrap_or(0);
    raw as f64 / 1_000_000.0
}

fn short_id(hex_str: &str) -> String {
    if hex_str.len() > 12 {
        format!("{}...{}", &hex_str[..6], &hex_str[hex_str.len() - 4..])
    } else {
        hex_str.to_string()
    }
}

fn chrono_lite(timestamp: u64) -> String {
    // Simple UTC time without chrono dependency
    let secs = timestamp % 86400;
    let hours = secs / 3600;
    let mins = (secs % 3600) / 60;
    let s = secs % 60;
    format!("{:02}:{:02}:{:02} UTC", hours, mins, s)
}
