//! Polymarket Bot — Host-side orchestrator
//!
//! Fetches market data from Polymarket CLOB API, builds agent inputs,
//! runs the agent (local or zkVM), and submits execution to the vault.

mod polymarket;
mod input_builder;

use anyhow::{bail, Context, Result};
use clap::Parser;
use colored::Colorize;
use std::time::Duration;

use polymarket::client::PolymarketClient;
use polymarket::types::{BotConfig, Position};

#[derive(Parser)]
#[command(name = "polymarket-bot", about = "Polymarket prediction market trading bot")]
struct Args {
    /// Run once and exit (don't loop)
    #[arg(long)]
    once: bool,

    /// Dry run — compute actions but don't submit on-chain
    #[arg(long)]
    dry_run: bool,
}

fn load_config() -> Result<BotConfig> {
    dotenv::dotenv().ok();

    Ok(BotConfig {
        condition_id: std::env::var("CONDITION_ID")
            .context("CONDITION_ID not set")?,
        yes_token_id: std::env::var("YES_TOKEN_ID")
            .context("YES_TOKEN_ID not set")?,
        no_token_id: std::env::var("NO_TOKEN_ID")
            .context("NO_TOKEN_ID not set")?,
        strategy_mode: std::env::var("STRATEGY_MODE")
            .unwrap_or_else(|_| "0".into())
            .parse()
            .unwrap_or(0),
        buy_threshold: std::env::var("BUY_THRESHOLD")
            .unwrap_or_else(|_| "0.40".into())
            .parse()
            .unwrap_or(0.40),
        sell_threshold: std::env::var("SELL_THRESHOLD")
            .unwrap_or_else(|_| "0.70".into())
            .parse()
            .unwrap_or(0.70),
        max_position_usdc: std::env::var("MAX_POSITION_USDC")
            .unwrap_or_else(|_| "100".into())
            .parse()
            .unwrap_or(100.0),
        slippage_bps: std::env::var("SLIPPAGE_BPS")
            .unwrap_or_else(|_| "100".into())
            .parse()
            .unwrap_or(100),
        stop_loss_bps: std::env::var("STOP_LOSS_BPS")
            .unwrap_or_else(|_| "500".into())
            .parse()
            .unwrap_or(500),
        take_profit_bps: std::env::var("TAKE_PROFIT_BPS")
            .unwrap_or_else(|_| "1000".into())
            .parse()
            .unwrap_or(1000),
        monitor_interval_secs: std::env::var("MONITOR_INTERVAL")
            .unwrap_or_else(|_| "30".into())
            .parse()
            .unwrap_or(30),
    })
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    let config = load_config()?;

    println!("{}", "╔══════════════════════════════════════════╗".cyan());
    println!("{}", "║     Polymarket Trading Bot (Tokamak)     ║".cyan());
    println!("{}", "╚══════════════════════════════════════════╝".cyan());
    println!();
    println!("  Market:    {}", config.condition_id);
    println!("  Strategy:  {}", if config.strategy_mode == 0 { "Probability Threshold" } else { "Spread Capture" });
    println!("  Buy < {}  |  Sell > {}", config.buy_threshold, config.sell_threshold);
    println!("  Max pos:   ${}", config.max_position_usdc);
    println!("  Slippage:  {} bps", config.slippage_bps);
    println!("  SL/TP:     -{}/{} bps", config.stop_loss_bps, config.take_profit_bps);
    println!();

    let client = PolymarketClient::new();

    // Track position locally (in production, read from on-chain state)
    let mut current_position: Option<Position> = None;

    loop {
        match run_cycle(&client, &config, &current_position, args.dry_run).await {
            Ok(pos_update) => {
                if let Some(pos) = pos_update {
                    current_position = Some(pos);
                }
            }
            Err(e) => {
                eprintln!("  {} Cycle error: {}", "✗".red(), e);
            }
        }

        if args.once {
            break;
        }

        println!(
            "  {} Sleeping {}s...",
            "⏳".yellow() if cfg!(target_os = "macos") else "...".yellow(),
            config.monitor_interval_secs
        );
        tokio::time::sleep(Duration::from_secs(config.monitor_interval_secs)).await;
    }

    Ok(())
}

async fn run_cycle(
    client: &PolymarketClient,
    config: &BotConfig,
    position: &Option<Position>,
    dry_run: bool,
) -> Result<Option<Position>> {
    // 1. Fetch market data
    println!("  {} Fetching market data...", "●".cyan());

    let prices = client.get_book_prices(&config.yes_token_id).await?;
    let volume = client.estimate_24h_volume(&config.yes_token_id).await.unwrap_or(0.0);

    println!(
        "    Bid: {:.4}  Ask: {:.4}  Mid: {:.4}  Spread: {:.4}  Vol: ${:.0}",
        prices.best_bid, prices.best_ask, prices.mid_price, prices.spread, volume
    );

    // 2. Check market status
    let market = client.get_market(&config.condition_id).await?;
    let resolved = market.closed;
    let winning_side = if resolved {
        market.tokens.iter()
            .position(|t| t.winner)
            .map(|i| i as u8)
            .unwrap_or(0)
    } else {
        0
    };

    if resolved {
        println!("    {} Market resolved! Winning side: {}", "!".yellow(),
            if winning_side == 0 { "YES" } else { "NO" });
    }

    // 3. Build agent input
    let adapter_addr = hex_to_addr(&std::env::var("ADAPTER_ADDRESS").unwrap_or_default())?;
    let usdc_addr = hex_to_addr(&std::env::var("USDC_ADDRESS").unwrap_or_default())?;
    let usdc_balance: f64 = std::env::var("VAULT_USDC_BALANCE")
        .unwrap_or_else(|_| "0".into())
        .parse()
        .unwrap_or(0.0);

    let agent_input = input_builder::build_polymarket_input(
        &adapter_addr,
        &usdc_addr,
        &prices,
        volume,
        position,
        usdc_balance,
        config,
        resolved,
        winning_side,
    )?;

    println!("    Agent input: {} bytes", agent_input.len());

    // 4. Run agent (local execution for now)
    // In production, this would go through the zkVM prover
    println!("  {} Running agent logic...", "●".cyan());

    // TODO: Execute via reference-integrator (local mode or zkVM)
    // For now, the host just logs the decision

    if dry_run {
        println!("  {} Dry run — skipping on-chain submission", "⚠".yellow());
    } else {
        // TODO: Submit execution to vault via on-chain module
        println!("  {} On-chain submission not yet wired (use --dry-run)", "⚠".yellow());
    }

    Ok(None)
}

fn hex_to_addr(hex: &str) -> Result<[u8; 20]> {
    let hex = hex.strip_prefix("0x").unwrap_or(hex);
    if hex.len() != 40 {
        bail!("Invalid address length: {}", hex.len());
    }
    let bytes = hex::decode(hex)?;
    let mut addr = [0u8; 20];
    addr.copy_from_slice(&bytes);
    Ok(addr)
}
