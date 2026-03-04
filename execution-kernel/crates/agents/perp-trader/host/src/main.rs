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
mod seed_trade;

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
    //
    // Exception: when the vault is empty but HyperCore has margin (post-deposit bootstrap),
    // keep the HyperCore-reported equity so the seed trade can compute proper actions.
    let vault_equity_raw = vault_state.total_assets as f64; // raw USDC units (6 decimals)
    let equity_source;
    if vault_equity_raw > 0.0 {
        snapshot.account_equity = vault_equity_raw;
        snapshot.available_balance = vault_equity_raw - snapshot.margin_used;
        equity_source = "vault";
    } else if snapshot.account_equity > 0.0 {
        // Vault is empty but HyperCore has funds (e.g., margin deposited in previous cycle).
        // HyperCore reports equity in decimal USDC (e.g., 18.975391).
        // Agent expects raw USDC units with 6 decimals (e.g., 18975391).
        // Scale up to match the vault-sourced format.
        snapshot.account_equity *= 1_000_000.0;
        snapshot.available_balance = snapshot.account_equity - snapshot.margin_used;
        equity_source = "hypercore";
    } else {
        snapshot.account_equity = 0.0;
        snapshot.available_balance = 0.0;
        equity_source = "none";
    }

    if !cli.json {
        eprintln!(
            "[3/8] Market data: mark={:.2}, pos={:.4}, equity={:.2} ({})",
            snapshot.mark_price, snapshot.position_size, snapshot.account_equity, equity_source
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

    // 7.5: Ensure sub-account has HYPE for CoreWriter gas (moved before seed trade)
    //
    // CoreWriter actions are "intents, not immediate state changes" — they can be
    // silently rejected on HyperCore if the sub-account lacks HYPE gas.
    //
    // TWO checks are needed because HYPE exists in two places:
    //   1. HyperEVM native balance (checked by check_and_fund_hype → triggers bridging)
    //   2. HyperCore spot ledger (where CoreWriter actually reads gas balance)
    //
    // HYPE bridging (HyperEVM → HyperCore via 0x2222...2222) is async: the EVM tx
    // succeeds but HYPE doesn't appear on HyperCore for ~5-10 seconds. ALL CoreWriter
    // actions submitted before settlement are silently rejected.
    #[cfg(feature = "onchain")]
    if action_count > 0 && !cli.dry_run {
        // First: check HyperCore HYPE balance (the authoritative source for CoreWriter gas)
        let core_hype = hl_client.get_core_hype_balance(&cli.sub_account).unwrap_or(0.0);
        let min_core_hype = cli.min_hype as f64 / 1e18; // Convert wei threshold to HYPE

        if core_hype < min_core_hype {
            if !cli.json {
                eprintln!(
                    "[7.5] HyperCore HYPE too low ({:.4} < {:.4}). Funding from HyperEVM...",
                    core_hype, min_core_hype
                );
            }
            let rt = tokio::runtime::Runtime::new()?;
            match rt.block_on(onchain::check_and_fund_hype(&cli)) {
                Ok(funded) => {
                    if funded {
                        if !cli.json {
                            eprintln!("[7.5] Funded sub-account. Waiting 15s for HyperCore HYPE bridge settlement...");
                        }
                        std::thread::sleep(std::time::Duration::from_secs(15));

                        // Verify HYPE arrived on HyperCore
                        let new_core_hype = hl_client.get_core_hype_balance(&cli.sub_account).unwrap_or(0.0);
                        if new_core_hype < min_core_hype {
                            if !cli.json {
                                eprintln!(
                                    "[7.5] WARNING: HYPE bridge may not have settled (core={:.4}). CoreWriter actions may fail.",
                                    new_core_hype
                                );
                            }
                        } else if !cli.json {
                            eprintln!("[7.5] HyperCore HYPE verified: {:.4}", new_core_hype);
                        }
                    }
                }
                Err(e) => {
                    if !cli.json {
                        eprintln!("[7.5] HYPE funding failed (non-fatal): {}", e);
                    }
                }
            }
        } else if !cli.json {
            eprintln!("[7.5] HyperCore HYPE OK: {:.4}", core_hype);
        }
    }

    // ── Seed trade gate ─────────────────────────────────────────────────────
    // When no position exists (position_size == 0), the HyperCore position
    // precompile returns leverage=0, causing ALL CoreWriter limit orders to be
    // silently dropped. To bootstrap the first trade, we use the REST API via
    // the API wallet to set leverage and place the opening order.
    //
    // Before placing the seed trade, we pre-deposit margin from the vault to
    // HyperCore so the REST API order has margin available.
    //
    // Once a position exists (leverage > 0), subsequent trades go through the
    // normal ZK-verified CoreWriter flow.
    if snapshot.position_size == 0.0 && cli.api_wallet_key.is_some() {
        let intent = seed_trade::parse_agent_intent(&agent_output_bytes);
        if let seed_trade::AgentIntent::Open(params) = intent {
            if !cli.json {
                eprintln!("[SEED] No position exists — using REST API for opening trade");
            }

            // Step 1: Try to pre-deposit margin from vault to HyperCore.
            // This requires the vault to have approved the adapter for USDC.
            // If the vault hasn't approved yet (first run), this will fail gracefully
            // and the seed trade will proceed using manually pre-funded margin.
            #[cfg(feature = "onchain")]
            if !cli.dry_run {
                let margin = params.margin_amount;
                if !cli.json {
                    eprintln!("[SEED] Attempting to pre-deposit {} USDC from vault to HyperCore...", margin);
                }
                let rt = tokio::runtime::Runtime::new()?;
                match rt.block_on(onchain::deposit_margin_from_vault(&cli, margin)) {
                    Ok(()) => {
                        if !cli.json {
                            eprintln!("[SEED] EVM tx succeeded. Waiting 10s for HyperCore settlement...");
                        }
                        std::thread::sleep(std::time::Duration::from_secs(10));

                        // Verify margin appeared on HyperCore
                        let perp_equity = hl_client.get_perp_withdrawable(&cli.sub_account).unwrap_or(0.0);
                        if perp_equity < 0.01 {
                            if !cli.json {
                                eprintln!("[SEED] WARNING: Margin deposit may not have settled (equity={:.2}).", perp_equity);
                                eprintln!("[SEED] CoreDepositWallet deposits are async — waiting 10s more...");
                            }
                            std::thread::sleep(std::time::Duration::from_secs(10));
                        } else if !cli.json {
                            eprintln!("[SEED] Margin verified on HyperCore: equity={:.2}", perp_equity);
                        }
                    }
                    Err(e) => {
                        // Non-fatal: margin may have been pre-funded manually via
                        // depositSubBalanceAdmin or depositMarginAdmin.
                        if !cli.json {
                            eprintln!("[SEED] Auto pre-deposit failed (non-fatal): {}", e);
                            eprintln!("[SEED] Proceeding with seed trade — ensure margin was pre-funded manually.");
                        }
                    }
                }
            }

            // Pre-check: verify HyperCore margin is available before spending 30s on seed trade
            let perp_equity = hl_client.get_perp_withdrawable(&cli.sub_account).unwrap_or(0.0);
            if perp_equity < 0.5 {
                if !cli.json {
                    eprintln!(
                        "[SEED] ERROR: Insufficient HyperCore margin ({:.2}). Seed trade would fail.",
                        perp_equity
                    );
                    eprintln!("[SEED] Ensure margin is deposited via depositMarginAdmin or depositMarginFromVaultAdmin.");
                }
                if cli.json {
                    let result_json = serde_json::json!({
                        "status": "seed_trade",
                        "fill_status": "error",
                        "detail": format!("Insufficient HyperCore margin: {:.2}", perp_equity),
                    });
                    println!("{}", serde_json::to_string_pretty(&result_json)?);
                }
                return Ok(());
            }

            // Step 2: Place opening order via REST API (margin is now available)
            match seed_trade::execute_seed_trade(&cli, &params) {
                Ok(result) => {
                    if result.status == "filled" {
                        // Seed trade filled — verify position on HyperCore
                        if !cli.json {
                            eprintln!(
                                "[SEED] Order filled: {} {} @ ${}",
                                result.total_size.as_deref().unwrap_or("?"),
                                cli.asset,
                                result.avg_price.as_deref().unwrap_or("?"),
                            );
                            eprintln!("[SEED] Waiting 5s to verify position on HyperCore...");
                        }
                        std::thread::sleep(std::time::Duration::from_secs(5));

                        let position_verified = hl_client
                            .has_position(&cli.sub_account, &cli.asset)
                            .unwrap_or(false);
                        if !position_verified && !cli.json {
                            eprintln!("[SEED] WARNING: Seed trade reported filled but position not yet visible.");
                            eprintln!("[SEED] This may be normal — HyperCore settles asynchronously.");
                        } else if !cli.json {
                            eprintln!("[SEED] Position verified on HyperCore.");
                        }

                        // Record position state
                        let now = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs();
                        let _ = write_position_state(&cli.state_file, &PositionState {
                            nonce: kernel_input.execution_nonce,
                            opened_at: now,
                        });

                        if cli.json {
                            let result_json = serde_json::json!({
                                "status": "seed_trade",
                                "fill_status": "filled",
                                "avg_price": result.avg_price,
                                "total_size": result.total_size,
                                "is_buy": params.is_buy,
                                "asset": cli.asset,
                                "mark_price": snapshot.mark_price,
                                "position_verified": position_verified,
                            });
                            println!("{}", serde_json::to_string_pretty(&result_json)?);
                        }
                        return Ok(());
                    } else {
                        // Seed trade didn't fill — return error instead of falling through.
                        // The ZK proof path CANNOT open positions when position_size==0
                        // (CoreWriter requires leverage>0 which only exists with a position).
                        // Falling through wastes 8-10 min on proof generation for nothing.
                        if cli.json {
                            let result_json = serde_json::json!({
                                "status": "seed_trade",
                                "fill_status": result.status,
                                "detail": result.detail,
                                "is_buy": params.is_buy,
                                "asset": cli.asset,
                            });
                            println!("{}", serde_json::to_string_pretty(&result_json)?);
                        } else {
                            eprintln!(
                                "[SEED] Order did not fill: status={}, detail={}",
                                result.status,
                                result.detail.as_deref().unwrap_or("none"),
                            );
                        }
                        return Ok(());
                    }
                }
                Err(e) => {
                    // Seed trade script failed — return error, don't waste time on ZK proof
                    if cli.json {
                        let result_json = serde_json::json!({
                            "status": "seed_trade",
                            "fill_status": "error",
                            "detail": format!("{}", e),
                        });
                        println!("{}", serde_json::to_string_pretty(&result_json)?);
                    } else {
                        eprintln!("[SEED] Seed trade failed: {}", e);
                    }
                    return Ok(());
                }
            }
        }
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

            // Post-execution verification: CoreWriter actions inside execute() are
            // "intents, not immediate state changes" — they can be silently rejected.
            // Wait for HyperCore settlement and verify the expected state change.
            let mut verified = false;
            if tx_result.success {
                if !cli.json {
                    eprintln!("Transaction submitted: {}", tx_result.tx_hash);
                    eprintln!("Execution successful at block {:?}. Verifying on HyperCore...", tx_result.block_number);
                }
                std::thread::sleep(std::time::Duration::from_secs(10));

                let had_position = snapshot.position_size != 0.0;
                let has_position_now = hl_client.has_position(&cli.sub_account, &cli.asset)
                    .unwrap_or(had_position); // Assume unchanged on API error

                if !had_position && has_position_now {
                    // Open action took effect
                    if !cli.json {
                        eprintln!("[VERIFY] Position opened on HyperCore.");
                    }
                    verified = true;
                } else if had_position && !has_position_now {
                    // Close action took effect — trigger fund recovery
                    if !cli.json {
                        eprintln!("[VERIFY] Position closed on HyperCore. Starting fund recovery...");
                    }
                    verified = true;
                    clear_position_state(&cli.state_file);

                    // Automated fund recovery: perp → spot → EVM → vault
                    let rt_recover = tokio::runtime::Runtime::new()?;
                    match rt_recover.block_on(onchain::recover_funds_to_vault(&cli, &hl_client)) {
                        Ok(recovered) => {
                            if !cli.json && recovered > 0 {
                                eprintln!("[RECOVER] Successfully recovered {} USDC to vault", recovered);
                            }
                        }
                        Err(e) => {
                            if !cli.json {
                                eprintln!("[RECOVER] Fund recovery failed (manual recovery needed): {}", e);
                            }
                        }
                    }
                } else if !had_position && !has_position_now {
                    // Open action was silently rejected
                    if !cli.json {
                        eprintln!("[VERIFY] WARNING: ZK proof submitted but position did NOT open.");
                        eprintln!("[VERIFY] CoreWriter limit order was silently rejected.");
                        eprintln!("[VERIFY] Possible causes: insufficient HYPE gas, leverage=0, price outside oracle band.");
                    }
                } else {
                    // had_position && has_position_now — close was silently rejected OR hold action
                    if cli.action_flag == 1 {
                        if !cli.json {
                            eprintln!("[VERIFY] WARNING: Force-close submitted but position still open.");
                            eprintln!("[VERIFY] CoreWriter close order was silently rejected.");
                        }
                    } else {
                        verified = true; // Position maintained, which may be expected
                    }
                }
            } else if !cli.json {
                eprintln!("Transaction submitted: {}", tx_result.tx_hash);
                eprintln!("Transaction reverted!");
            }

            if cli.json {
                let result = serde_json::json!({
                    "status": "submitted",
                    "tx_hash": tx_result.tx_hash,
                    "block_number": tx_result.block_number,
                    "success": tx_result.success,
                    "verified": verified,
                });
                println!("{}", serde_json::to_string_pretty(&result)?);
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
