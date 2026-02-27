//! Perp-trader host CLI: single-shot execution cycle.
//!
//! Pipeline: fetch → build → prove → submit

mod config;
mod error;
mod hyperliquid;
mod indicators;
mod input_builder;
mod market;
mod oracle_signer;
mod onchain;
mod output_reconstruct;
mod prove;

use clap::Parser;
use config::Cli;
use kernel_core::CanonicalDecode;
use market::MarketDataProvider;

/// Persistent state between single-shot cycles to track open positions.
#[derive(serde::Serialize, serde::Deserialize)]
struct PositionState {
    /// Nonce at which the position was opened.
    nonce: u64,
    /// Unix timestamp when the position was opened.
    opened_at: u64,
}

/// Read position state from file (returns None if file doesn't exist or is invalid).
fn read_position_state(path: &str) -> Option<PositionState> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
}

/// Write position state to file.
fn write_position_state(path: &str, state: &PositionState) -> anyhow::Result<()> {
    let json = serde_json::to_string(state)?;
    std::fs::write(path, json)?;
    Ok(())
}

/// Clear position state file.
fn clear_position_state(path: &str) {
    let _ = std::fs::remove_file(path);
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    // 1. Load agent-pack bundle
    let bundle = reference_integrator::LoadedBundle::load(&cli.bundle)
        .map_err(|e| anyhow::anyhow!("Failed to load bundle: {}", e))?;

    if !cli.json {
        eprintln!("[1/8] Bundle loaded: {}", cli.bundle);
    }

    // 2. Read vault state (on-chain)
    #[cfg(feature = "onchain")]
    let vault_state = {
        let rt = tokio::runtime::Runtime::new()?;
        let state = rt.block_on(onchain::read_vault_state(&cli.vault, &cli.rpc))?;
        if !cli.json {
            eprintln!(
                "[2/8] Vault state: nonce={}, agent_id=0x{}",
                state.last_execution_nonce,
                hex::encode(&state.agent_id[..4])
            );
        }
        state
    };

    #[cfg(not(feature = "onchain"))]
    let vault_state = onchain::VaultState::default_for_dry_run();

    // 3. Fetch market data
    let hl_client = hyperliquid::client::HyperliquidClient::new(&cli.hl_url);
    let mut snapshot = hl_client.fetch_snapshot(&cli.asset, &cli.sub_account, cli.candles_needed())?;

    // Position state guard: if we previously opened a position and it hasn't
    // appeared in the Hyperliquid API yet, skip this cycle to avoid re-entry.
    // HyperCore settles asynchronously — positions may not be visible for minutes.
    if let Some(pos_state) = read_position_state(&cli.state_file) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let age = now.saturating_sub(pos_state.opened_at);

        if snapshot.position_size == 0.0 && age < cli.position_timeout {
            // Position was opened but not yet visible on HyperCore
            if cli.json {
                let result = serde_json::json!({
                    "status": "no_op",
                    "reason": "position_pending_settlement",
                    "actions": 0,
                    "opened_nonce": pos_state.nonce,
                    "age_seconds": age,
                    "timeout_seconds": cli.position_timeout,
                    "vault_balance": vault_state.total_assets,
                });
                println!("{}", serde_json::to_string_pretty(&result)?);
            } else {
                eprintln!(
                    "Position pending settlement (nonce={}, age={}s). Skipping.",
                    pos_state.nonce, age
                );
            }
            return Ok(());
        }

        // Position is now visible OR timed out — clear state and proceed
        if !cli.json {
            if snapshot.position_size != 0.0 {
                eprintln!("Position now visible on HyperCore (size={:.4}). Resuming.", snapshot.position_size);
            } else {
                eprintln!("Position state timed out after {}s. Clearing and resuming.", age);
            }
        }
        clear_position_state(&cli.state_file);
    }

    // Minimum balance guard: skip execution if vault balance is below threshold
    // AND no position is open. When a position IS open, the vault balance being
    // low is expected (USDC was sent to the sub-account for margin). The agent
    // must still run to evaluate exit conditions (stop-loss, take-profit, etc.).
    if snapshot.position_size == 0.0 && vault_state.total_assets < cli.min_balance {
        if cli.json {
            let result = serde_json::json!({
                "status": "no_op",
                "reason": "vault_balance_below_minimum",
                "actions": 0,
                "vault_balance": vault_state.total_assets,
                "min_balance": cli.min_balance,
            });
            println!("{}", serde_json::to_string_pretty(&result)?);
        } else {
            eprintln!(
                "Vault balance {} < min_balance {}. Skipping execution.",
                vault_state.total_assets, cli.min_balance
            );
        }
        return Ok(());
    }

    // Override account equity with vault's on-chain USDC balance in raw units (6 decimals).
    // The agent passes size directly to openPosition() which does a USDC transfer,
    // so equity/balance must be in USDC's native denomination (1e6), NOT 1e8 scaled.
    // This way compute_position_size() output matches what the adapter expects.
    let vault_equity_raw = vault_state.total_assets as f64; // raw USDC units (6 decimals)
    snapshot.account_equity = vault_equity_raw;
    snapshot.available_balance = vault_equity_raw - snapshot.margin_used;

    if !cli.json {
        eprintln!(
            "[3/8] Market data: mark={:.2}, pos={:.4}, equity={:.2} (vault balance)",
            snapshot.mark_price, snapshot.position_size, snapshot.account_equity
        );
    }

    // 4. Compute indicators
    let indicator_set = indicators::compute_indicators(&snapshot.candle_closes, &cli)?;
    if !cli.json {
        eprintln!(
            "[4/8] Indicators: sma_fast={:.2}, sma_slow={:.2}, rsi={}",
            indicator_set.sma_fast, indicator_set.sma_slow, indicator_set.rsi_bps
        );
    }

    // 5. Build + sign oracle feed
    let oracle_key = Cli::resolve_key(&cli.oracle_key)?;
    let exchange_addr = Cli::parse_address(&cli.exchange_contract)?;
    let vault_addr = Cli::parse_address(&cli.vault)?;
    let usdc_addr = Cli::parse_address(&cli.usdc_address)?;
    let signed_feed = oracle_signer::build_and_sign_feed(
        &snapshot,
        &oracle_key,
        &exchange_addr,
        &vault_addr,
        cli.chain_id,
    )?;
    if !cli.json {
        eprintln!(
            "[5/8] Oracle feed signed: hash=0x{}",
            hex::encode(&signed_feed.feed_hash[..4])
        );
    }

    // 6. Assemble KernelInputV1
    let (kernel_input, input_bytes) = input_builder::build_input(
        &bundle,
        &vault_state,
        &snapshot,
        &indicator_set,
        &signed_feed,
        &cli,
        &exchange_addr,
        &vault_addr,
        &usdc_addr,
    )?;
    if !cli.json {
        eprintln!(
            "[6/8] Input assembled: {} bytes, nonce={}",
            input_bytes.len(),
            kernel_input.execution_nonce
        );
    }

    // 7. Reconstruct agent output
    let (agent_output_bytes, action_commitment) =
        output_reconstruct::reconstruct_output(&kernel_input, &input_bytes)?;
    let action_count = kernel_core::AgentOutput::decode(&agent_output_bytes)
        .map(|o| o.actions.len())
        .unwrap_or(0);
    if !cli.json {
        eprintln!(
            "[7/8] Output reconstructed: {} bytes, {} actions, commitment=0x{}",
            agent_output_bytes.len(),
            action_count,
            hex::encode(&action_commitment[..4])
        );
    }

    // No-op gate: skip proving and on-chain submission when the agent has no actions.
    // Steps 1–7 are cheap (~500ms). Proving (step 8) and submitting are expensive.
    // This enables high-frequency scheduling (e.g. every 30s) with negligible cost
    // on cycles where the strategy produces no signal.
    if action_count == 0 {
        let reason = if snapshot.position_size != 0.0 {
            "position_open_no_exit_signal"
        } else {
            "no_entry_signal"
        };
        if cli.json {
            let result = serde_json::json!({
                "status": "no_op",
                "reason": reason,
                "actions": 0,
                "mark_price": snapshot.mark_price,
                "position_size": snapshot.position_size,
                "account_equity": snapshot.account_equity,
            });
            println!("{}", serde_json::to_string_pretty(&result)?);
        } else {
            eprintln!("No-op: {}. Skipping proof generation and on-chain submission.", reason);
        }
        return Ok(());
    }

    // In dry-run mode, skip proving and on-chain submission — just report the signal.
    if cli.dry_run {
        if cli.json {
            let result = serde_json::json!({
                "status": "dry_run",
                "actions": action_count,
                "mark_price": snapshot.mark_price,
                "position_size": snapshot.position_size,
                "account_equity": snapshot.account_equity,
                "agent_output_hex": hex::encode(&agent_output_bytes),
                "action_commitment": hex::encode(action_commitment),
                "execution_nonce": kernel_input.execution_nonce,
            });
            println!("{}", serde_json::to_string_pretty(&result)?);
        } else {
            eprintln!("Dry run complete. {} actions detected. Skipping proof + submission.", action_count);
        }
        return Ok(());
    }

    // 8. Generate proof (if prove feature enabled)
    let proof_result = prove::generate_proof(&bundle, &input_bytes, cli.dev_mode)?;
    if !cli.json {
        eprintln!(
            "[8/8] Proof: journal={} bytes, seal={} bytes",
            proof_result.journal_bytes.len(),
            proof_result.seal_bytes.len()
        );
    }

    // Verify commitment match
    if proof_result.journal.action_commitment != action_commitment {
        return Err(anyhow::anyhow!(
            "Action commitment mismatch: proof={}, reconstructed={}",
            hex::encode(proof_result.journal.action_commitment),
            hex::encode(action_commitment)
        ));
    }

    {
        #[cfg(feature = "onchain")]
        {
            let pk = Cli::resolve_key(&cli.pk)?;
            let rt = tokio::runtime::Runtime::new()?;
            let tx_result = rt.block_on(onchain::execute_with_oracle(
                &cli.vault,
                &cli.rpc,
                &pk,
                &proof_result.journal_bytes,
                &proof_result.seal_bytes,
                &agent_output_bytes,
                &signed_feed.onchain_signature,
                signed_feed.feed.timestamp,
            ))?;

            // Record open position state so next cycle doesn't re-enter.
            // Only write state if the transaction succeeded and had actions
            // (which means a position was opened).
            if tx_result.success {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();
                let _ = write_position_state(&cli.state_file, &PositionState {
                    nonce: kernel_input.execution_nonce,
                    opened_at: now,
                });
            }

            if cli.json {
                let result = serde_json::json!({
                    "status": "submitted",
                    "tx_hash": tx_result.tx_hash,
                    "block_number": tx_result.block_number,
                    "success": tx_result.success,
                });
                println!("{}", serde_json::to_string_pretty(&result)?);
            } else {
                eprintln!("Transaction submitted: {}", tx_result.tx_hash);
                if tx_result.success {
                    eprintln!("Execution successful at block {:?}", tx_result.block_number);
                } else {
                    eprintln!("Transaction reverted!");
                }
            }
        }

        #[cfg(not(feature = "onchain"))]
        {
            return Err(anyhow::anyhow!(
                "On-chain submission requires --features onchain. Use --dry-run for offline mode."
            ));
        }
    }

    Ok(())
}
