//! Perp-trader host CLI: single-shot execution cycle.
//!
//! Pipeline: fetch → build → prove → submit
//!
//! With `--optimistic`: fetch → build → reconstruct → submitOptimistic → queue proof
//! (proof generated asynchronously in background thread)

mod config;
mod error;
mod hyperliquid;
mod indicators;
mod input_builder;
mod market;
mod monitor;
mod oracle_signer;
mod onchain;
mod output_reconstruct;
mod prove;
mod prove_worker;
mod seed_trade;

use clap::Parser;
use config::Cli;
use kernel_core::CanonicalDecode;
use market::MarketDataProvider;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

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

    // Start background proving worker if optimistic mode is enabled.
    // The worker runs in a separate thread, dequeuing proof jobs and submitting
    // proofs on-chain as they complete.
    let proof_queue = prove_worker::new_proof_queue();
    let shutdown = Arc::new(AtomicBool::new(false));
    let worker_status = prove_worker::WorkerStatus::new();
    let last_known_nonce = Arc::new(AtomicU64::new(0));

    if cli.optimistic {
        let worker_queue = proof_queue.clone();
        let worker_shutdown = shutdown.clone();
        let worker_status_clone = worker_status.clone();
        std::thread::spawn(move || {
            prove_worker::run_proving_worker(worker_queue, worker_shutdown, worker_status_clone);
        });

        // Start monitor thread for deadline tracking
        let monitor_shutdown = shutdown.clone();
        let monitor_nonce = last_known_nonce.clone();
        let monitor_rpc = cli.rpc.clone();
        let monitor_vault = cli.vault.clone();
        std::thread::spawn(move || {
            monitor::run_monitor_loop(
                monitor::MonitorConfig::new(monitor_rpc, monitor_vault),
                1, // first_optimistic_nonce (will check from nonce 1)
                monitor_nonce,
                monitor_shutdown,
            );
        });

        if !cli.json {
            eprintln!("[optimistic] Background proving worker and monitor started.");
        }
    }

    let result = run_pipeline(&cli, &proof_queue, &last_known_nonce);

    // Signal background threads to stop.
    // In single-shot mode, the main thread exits after one cycle, so background
    // threads are cleaned up by process termination. In a future daemon mode,
    // this flag allows graceful shutdown.
    shutdown.store(true, Ordering::Relaxed);

    // Give background threads a moment to notice the shutdown signal before
    // the process exits and kills them. Only needed if optimistic mode is active
    // and we want clean log output from the worker.
    if cli.optimistic {
        std::thread::sleep(Duration::from_millis(100));
    }

    result
}

/// Main execution pipeline, extracted for clean shutdown handling.
fn run_pipeline(
    cli: &Cli,
    proof_queue: &prove_worker::ProofQueue,
    last_known_nonce: &Arc<AtomicU64>,
) -> anyhow::Result<()> {
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

    // Ensure sub-account has HYPE for CoreWriter gas EVERY cycle.
    // This runs unconditionally (before agent intent is known) because CoreWriter
    // is needed for multiple paths: ZK proof execution, fund recovery, spotToEvm, etc.
    // Without HYPE, ALL CoreWriter actions are silently rejected.
    #[cfg(feature = "onchain")]
    if !cli.dry_run {
        let core_hype = hl_client.get_core_hype_balance(&cli.sub_account).unwrap_or(0.0);
        let min_core_hype = cli.min_hype as f64 / 1e18;

        if core_hype < min_core_hype {
            if !cli.json {
                eprintln!(
                    "[HYPE] HyperCore HYPE too low ({:.4} < {:.4}). Funding...",
                    core_hype, min_core_hype
                );
            }
            let rt = tokio::runtime::Runtime::new()?;
            match rt.block_on(onchain::check_and_fund_hype(&cli)) {
                Ok(funded) => {
                    if funded {
                        if !cli.json {
                            eprintln!("[HYPE] Funded. Waiting 15s for bridge settlement...");
                        }
                        std::thread::sleep(std::time::Duration::from_secs(15));
                    }
                }
                Err(e) => {
                    if !cli.json {
                        eprintln!("[HYPE] Funding failed (non-fatal): {}", e);
                    }
                }
            }
        } else if !cli.json {
            eprintln!("[HYPE] OK: {:.4}", core_hype);
        }
    }

    // Minimum balance guard: skip execution if vault balance is below threshold
    // AND no position is open. When a position IS open, the vault balance being
    // low is expected (USDC was sent to the sub-account for margin). The agent
    // must still run to evaluate exit conditions (stop-loss, take-profit, etc.).
    //
    // Exception: when action_flag == 1 (force-close), bypass this guard entirely.
    // Force-close is triggered by the hold timer and must run to close + recover funds.
    // Also: if no position is open but HyperCore has stranded funds, attempt recovery.
    if snapshot.position_size == 0.0 && vault_state.total_assets < cli.min_balance && cli.action_flag != 1 {
        // Before giving up, check if HyperCore has stranded funds from a previous
        // close that didn't recover (e.g., bot was restarted mid-cycle).
        #[cfg(feature = "onchain")]
        {
            let sub_equity = hl_client.get_perp_withdrawable(&cli.sub_account).unwrap_or(0.0);
            if sub_equity > 0.5 {
                if !cli.json {
                    eprintln!(
                        "Vault balance {} < min_balance {}, but sub-account has ${:.2} stranded on HyperCore.",
                        vault_state.total_assets, cli.min_balance, sub_equity
                    );
                    eprintln!("Attempting fund recovery...");
                }
                let rt_recover = tokio::runtime::Runtime::new()?;
                match rt_recover.block_on(onchain::recover_funds_to_vault(&cli, &hl_client)) {
                    Ok(recovered) => {
                        if cli.json {
                            let result = serde_json::json!({
                                "status": "recovered",
                                "reason": "stranded_funds_on_hypercore",
                                "recovered_usdc": recovered,
                                "vault_balance": vault_state.total_assets,
                            });
                            println!("{}", serde_json::to_string_pretty(&result)?);
                        } else if recovered > 0 {
                            eprintln!("[RECOVER] Successfully recovered {} USDC to vault.", recovered);
                        }
                        return Ok(());
                    }
                    Err(e) => {
                        if !cli.json {
                            eprintln!("[RECOVER] Fund recovery failed: {}", e);
                        }
                    }
                }
            }
        }

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

    // 6. Assemble KernelInputV1 (with open_phase=0 for initial strategy evaluation)
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

    // 7. Reconstruct agent output (open_phase=0 to evaluate strategy intent)
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

    // ── Two-proof open: detect if agent wants to open with no existing position ──
    // CoreWriter deposits are async — deposit + order in the same tx means the
    // order is processed before the deposit settles, causing silent rejection.
    //
    // Solution: split into two ZK proofs.
    //   Proof 1 (open_phase=1): approve + depositMargin — vault's USDC → HyperCore
    //   Wait 10s for settlement + set leverage via REST API
    //   Proof 2 (open_phase=2): openPosition(margin=0) — order against settled margin
    //
    // For closes and holds, a single proof (open_phase=0) suffices.
    let needs_two_proof = matches!(
        seed_trade::parse_agent_intent(&agent_output_bytes),
        seed_trade::AgentIntent::Open(_)
    ) && snapshot.position_size == 0.0;

    // In dry-run mode, skip proving and on-chain submission — just report the signal.
    if cli.dry_run {
        if cli.json {
            let result = serde_json::json!({
                "status": "dry_run",
                "actions": action_count,
                "two_proof": needs_two_proof,
                "mark_price": snapshot.mark_price,
                "position_size": snapshot.position_size,
                "account_equity": snapshot.account_equity,
                "agent_output_hex": hex::encode(&agent_output_bytes),
                "action_commitment": hex::encode(action_commitment),
                "execution_nonce": kernel_input.execution_nonce,
            });
            println!("{}", serde_json::to_string_pretty(&result)?);
        } else {
            eprintln!(
                "Dry run complete. {} actions detected (two_proof={}). Skipping proof + submission.",
                action_count, needs_two_proof
            );
        }
        return Ok(());
    }

    // === OPTIMISTIC EXECUTION PATH (RFC-001) ===
    //
    // When --optimistic is enabled, submit actions immediately with a predicted
    // journal (no ZK proof needed yet). The proof is generated asynchronously
    // in the background worker thread and submitted before the challenge window
    // deadline.
    //
    // NOTE: Optimistic mode is incompatible with two-proof opens. If the agent
    // wants to open a new position, fall through to the synchronous path.
    if cli.optimistic && !needs_two_proof {
        if !cli.json {
            eprintln!("[optimistic] Building predicted journal...");
        }

        // Build predicted journal: identical to what the zkVM would produce,
        // but computed entirely on the host side (no proving needed).
        let predicted_journal = build_predicted_journal(
            &kernel_input,
            &input_bytes,
            &agent_output_bytes,
        )?;

        if !cli.json {
            eprintln!(
                "[optimistic] Predicted journal: {} bytes",
                predicted_journal.len()
            );
        }

        // Submit optimistically (actions execute immediately, bond escrowed)
        #[cfg(feature = "onchain")]
        {
            use std::time::Instant;
            let pk = Cli::resolve_key(&cli.pk)?;
            if !cli.json {
                eprintln!("[optimistic] Submitting optimistic execution to vault...");
            }

            let rt = tokio::runtime::Runtime::new()?;
            let execution_nonce = rt.block_on(submit_optimistic_execution(
                &cli.vault,
                &cli.rpc,
                &pk,
                &predicted_journal,
                &agent_output_bytes,
                &signed_feed.onchain_signature,
                signed_feed.feed.timestamp,
                cli.bond_amount,
            ))?;

            if !cli.json {
                eprintln!(
                    "[optimistic] Execution nonce {} submitted! Actions executed immediately.",
                    execution_nonce
                );
            }

            // Update last known nonce for the monitor thread
            last_known_nonce.store(execution_nonce, Ordering::Relaxed);

            // Queue proof job for background worker
            let proof_job = prove_worker::PendingProof {
                execution_nonce,
                input_bytes: input_bytes.clone(),
                bundle_path: cli.bundle.clone(),
                rpc_url: cli.rpc.clone(),
                vault_address: cli.vault.clone(),
                private_key: pk,
                deadline: Instant::now() + Duration::from_secs(cli.challenge_window),
                queued_at: Instant::now(),
                dev_mode: cli.dev_mode,
                retry_count: 0,
            };

            {
                let mut queue = proof_queue.lock().unwrap();
                queue.push_back(proof_job);
            }

            if cli.json {
                let result = serde_json::json!({
                    "status": "optimistic_submitted",
                    "execution_nonce": execution_nonce,
                    "actions": action_count,
                    "challenge_window_secs": cli.challenge_window,
                    "proof_queued": true,
                });
                println!("{}", serde_json::to_string_pretty(&result)?);
            } else {
                eprintln!(
                    "[optimistic] Proof job queued (deadline in {}s). Main thread returning.",
                    cli.challenge_window
                );
            }

            return Ok(());
        }

        #[cfg(not(feature = "onchain"))]
        {
            return Err(anyhow::anyhow!(
                "Optimistic execution requires --features onchain."
            ));
        }
    }

    // 8. Generate proof(s) and produce the final proof package for submission.
    //
    // For two-proof opens: generate + submit deposit proof, wait, then generate
    // order proof. The order proof becomes the "final" proof for the submission block.
    // For single-proof: generate one proof directly.
    //
    // Returns: (proof_result, agent_output_bytes, signed_feed, execution_nonce)
    let (final_proof, final_output, final_feed, final_nonce) = if needs_two_proof {
        if !cli.json {
            eprintln!("[OPEN] Two-proof mode: deposit proof + order proof");
        }

        // ── Proof 1: deposit only (open_phase=1) ──
        let (deposit_input, deposit_input_bytes) = input_builder::build_input_with_phase(
            &bundle, &vault_state, &snapshot, &indicator_set, &signed_feed,
            &cli, &exchange_addr, &vault_addr, &usdc_addr, 1,
        )?;
        let (deposit_output_bytes, deposit_commitment) =
            output_reconstruct::reconstruct_output(&deposit_input, &deposit_input_bytes)?;
        let deposit_action_count = kernel_core::AgentOutput::decode(&deposit_output_bytes)
            .map(|o| o.actions.len()).unwrap_or(0);

        if deposit_action_count == 0 {
            return Err(anyhow::anyhow!("Deposit phase produced 0 actions — agent declined to deposit"));
        }

        if !cli.json {
            eprintln!("[OPEN] Phase 1: generating deposit proof ({} actions)...", deposit_action_count);
        }
        let deposit_proof = prove::generate_proof(&bundle, &deposit_input_bytes, cli.dev_mode)?;

        if deposit_proof.journal.action_commitment != deposit_commitment {
            return Err(anyhow::anyhow!(
                "Deposit proof commitment mismatch: proof={}, reconstructed={}",
                hex::encode(deposit_proof.journal.action_commitment),
                hex::encode(deposit_commitment)
            ));
        }

        // Submit proof 1
        #[cfg(feature = "onchain")]
        {
            let pk = Cli::resolve_key(&cli.pk)?;
            if !cli.json {
                eprintln!("[OPEN] Phase 1: submitting deposit proof...");
            }
            let rt = tokio::runtime::Runtime::new()?;
            let tx1 = rt.block_on(onchain::execute_with_oracle(
                &cli.vault, &cli.rpc, &pk,
                &deposit_proof.journal_bytes, &deposit_proof.seal_bytes,
                &deposit_output_bytes,
                &signed_feed.onchain_signature, signed_feed.feed.timestamp,
            ))?;

            if !tx1.success {
                return Err(anyhow::anyhow!("Deposit proof tx reverted: {}", tx1.tx_hash));
            }
            if !cli.json {
                eprintln!("[OPEN] Phase 1: deposit tx {} confirmed. Waiting 10s for HyperCore settlement...", tx1.tx_hash);
            }
            std::thread::sleep(std::time::Duration::from_secs(10));

            let perp_equity = hl_client.get_perp_withdrawable(&cli.sub_account).unwrap_or(0.0);
            if !cli.json {
                eprintln!("[OPEN] HyperCore perp equity after deposit: ${:.2}", perp_equity);
            }

            // Set leverage via REST API (CoreWriter has no updateLeverage action)
            if cli.api_wallet_key.is_some() {
                if !cli.json {
                    eprintln!("[OPEN] Setting leverage to {}x via REST API...", cli.seed_leverage);
                }
                if let Err(e) = seed_trade::set_leverage_only(&cli) {
                    if !cli.json { eprintln!("[OPEN] WARNING: Failed to set leverage: {}", e); }
                } else if !cli.json {
                    eprintln!("[OPEN] Leverage set.");
                }
            }
        }

        // ── Proof 2: order only (open_phase=2) ──
        // Re-read vault state (nonce incremented by proof 1, balance changed)
        #[cfg(feature = "onchain")]
        let vault_state_2 = {
            let rt = tokio::runtime::Runtime::new()?;
            rt.block_on(onchain::read_vault_state(&cli.vault, &cli.rpc))?
        };
        #[cfg(not(feature = "onchain"))]
        let vault_state_2 = onchain::VaultState::default_for_dry_run();

        // Re-fetch market data (fresh prices for the order)
        let mut snapshot_2 = hl_client.fetch_snapshot(&cli.asset, &cli.sub_account, cli.candles_needed())?;

        // Phase 2 equity: use HyperCore equity (where margin was deposited in Phase 1),
        // NOT vault balance (which only has the 10% leftover after deposit).
        let hypercore_equity = snapshot_2.account_equity; // decimal USDC from HyperCore API
        if hypercore_equity > 0.5 {
            // HyperCore has the deposited margin — use it for order sizing
            snapshot_2.account_equity = hypercore_equity * 1_000_000.0;
            snapshot_2.available_balance = snapshot_2.account_equity - snapshot_2.margin_used;
            if !cli.json {
                eprintln!("[OPEN] Phase 2: using HyperCore equity ${:.2} for order sizing", hypercore_equity);
            }
        } else {
            // Fallback: use vault balance (shouldn't happen in normal two-proof flow)
            let vault_equity_2 = vault_state_2.total_assets as f64;
            snapshot_2.account_equity = vault_equity_2;
            snapshot_2.available_balance = vault_equity_2 - snapshot_2.margin_used;
        }

        let indicator_set_2 = indicators::compute_indicators(&snapshot_2.candle_closes, &cli)?;
        let oracle_key_2 = Cli::resolve_key(&cli.oracle_key)?;
        let signed_feed_2 = oracle_signer::build_and_sign_feed(
            &snapshot_2, &oracle_key_2, &exchange_addr, &vault_addr, cli.chain_id,
        )?;

        let (order_input, order_input_bytes) = input_builder::build_input_with_phase(
            &bundle, &vault_state_2, &snapshot_2, &indicator_set_2, &signed_feed_2,
            &cli, &exchange_addr, &vault_addr, &usdc_addr, 2,
        )?;
        let (order_output, order_commitment) =
            output_reconstruct::reconstruct_output(&order_input, &order_input_bytes)?;
        let order_action_count = kernel_core::AgentOutput::decode(&order_output)
            .map(|o| o.actions.len()).unwrap_or(0);

        if order_action_count == 0 {
            if !cli.json {
                eprintln!("[OPEN] Phase 2: agent produced 0 actions (market changed). Deposit on HyperCore will be recovered next cycle.");
            }
            if cli.json {
                println!("{}", serde_json::to_string_pretty(&serde_json::json!({
                    "status": "no_op",
                    "reason": "two_proof_phase2_no_signal",
                    "deposit_tx_submitted": true,
                }))?);
            }
            return Ok(());
        }

        if !cli.json {
            eprintln!("[OPEN] Phase 2: generating order proof ({} actions)...", order_action_count);
        }
        let order_proof = prove::generate_proof(&bundle, &order_input_bytes, cli.dev_mode)?;

        if order_proof.journal.action_commitment != order_commitment {
            return Err(anyhow::anyhow!(
                "Order proof commitment mismatch: proof={}, reconstructed={}",
                hex::encode(order_proof.journal.action_commitment),
                hex::encode(order_commitment)
            ));
        }

        if !cli.json {
            eprintln!(
                "[8/8] Order proof: journal={} bytes, seal={} bytes",
                order_proof.journal_bytes.len(), order_proof.seal_bytes.len()
            );
        }

        (order_proof, order_output, signed_feed_2, order_input.execution_nonce)
    } else {
        // Single proof path (closes, holds, normal operation)
        let proof_result = prove::generate_proof(&bundle, &input_bytes, cli.dev_mode)?;
        if !cli.json {
            eprintln!(
                "[8/8] Proof: journal={} bytes, seal={} bytes",
                proof_result.journal_bytes.len(), proof_result.seal_bytes.len()
            );
        }

        if proof_result.journal.action_commitment != action_commitment {
            return Err(anyhow::anyhow!(
                "Action commitment mismatch: proof={}, reconstructed={}",
                hex::encode(proof_result.journal.action_commitment),
                hex::encode(action_commitment)
            ));
        }

        (proof_result, agent_output_bytes, signed_feed, kernel_input.execution_nonce)
    };

    // 9. Submit proof and verify on-chain
    {
        #[cfg(feature = "onchain")]
        {
            if !cli.json {
                let sub_equity = hl_client.get_perp_withdrawable(&cli.sub_account).ok();
                eprintln!("[EXEC] Sub-account (HyperCore): ${:.2}", sub_equity.unwrap_or(0.0));
                eprintln!("[EXEC] Submitting ZK proof to vault.executeWithOracle()...");
            }

            let pk = Cli::resolve_key(&cli.pk)?;
            let rt = tokio::runtime::Runtime::new()?;
            let tx_result = rt.block_on(onchain::execute_with_oracle(
                &cli.vault,
                &cli.rpc,
                &pk,
                &final_proof.journal_bytes,
                &final_proof.seal_bytes,
                &final_output,
                &final_feed.onchain_signature,
                final_feed.feed.timestamp,
            ))?;

            let agent_intent = seed_trade::parse_agent_intent(&final_output);
            let is_close_intent = matches!(agent_intent, seed_trade::AgentIntent::Close);

            let mut verified = false;
            if tx_result.success {
                if !cli.json {
                    eprintln!("Transaction submitted: {}", tx_result.tx_hash);
                    eprintln!("Execution successful at block {:?}. Verifying on HyperCore...", tx_result.block_number);
                }
                std::thread::sleep(std::time::Duration::from_secs(10));

                let had_position = snapshot.position_size != 0.0;
                let has_position_now = hl_client.has_position(&cli.sub_account, &cli.asset)
                    .unwrap_or(had_position);

                if !had_position && has_position_now {
                    if !cli.json {
                        eprintln!("[VERIFY] Position OPENED on HyperCore via ZK proof!");
                        if let Ok(new_snap) = hl_client.fetch_snapshot(&cli.asset, &cli.sub_account, 1) {
                            let side = if new_snap.position_size > 0.0 { "LONG" } else { "SHORT" };
                            eprintln!("[VERIFY]   Side:       {}", side);
                            eprintln!("[VERIFY]   Size:       {:.5} {}", new_snap.position_size.abs(), cli.asset);
                            eprintln!("[VERIFY]   Entry:      ${:.2}", new_snap.entry_price);
                            eprintln!("[VERIFY]   Mark:       ${:.2}", new_snap.mark_price);
                            eprintln!("[VERIFY]   UPnL:       ${:.4}", new_snap.unrealized_pnl);
                            eprintln!("[VERIFY]   Margin:     ${:.2}", new_snap.margin_used);
                            eprintln!("[VERIFY]   Equity:     ${:.2}", new_snap.account_equity);
                            eprintln!("[VERIFY]   Liq price:  ${:.2}", new_snap.liquidation_price);
                        }
                    }
                    verified = true;

                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();
                    let _ = write_position_state(&cli.state_file, &PositionState {
                        nonce: final_nonce,
                        opened_at: now,
                    });
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
                    // Open action was silently rejected by CoreWriter.
                    // This should be rare if pre-deposit succeeded (margin was settled).
                    // Possible causes: pre-deposit failed, insufficient margin, price outside
                    // oracle band, or HyperCore issue. REST API fallback as last resort.
                    eprintln!("[VERIFY] WARNING: ZK proof submitted but position did NOT open.");
                    eprintln!("[VERIFY] CoreWriter order rejected (pre-deposit may have failed or margin insufficient).");
                    eprintln!("[VERIFY] agent_intent = {:?}", agent_intent);

                    if let seed_trade::AgentIntent::Open(ref params) = agent_intent {
                        eprintln!("[VERIFY] Attempting REST API fallback open (is_buy={}, size={}, price={})...",
                            params.is_buy, params.order_size, params.limit_price);
                        if cli.api_wallet_key.is_some() {
                            // Verify margin is actually on HyperCore before placing order
                            let perp_equity = hl_client.get_perp_withdrawable(&cli.sub_account).unwrap_or(0.0);
                            eprintln!("[VERIFY] HyperCore perp equity: {:.2}", perp_equity);
                            if perp_equity < 1.0 {
                                eprintln!("[VERIFY] Margin still not settled (equity={:.2}). Waiting 10s more...", perp_equity);
                                std::thread::sleep(std::time::Duration::from_secs(10));
                                let perp_equity2 = hl_client.get_perp_withdrawable(&cli.sub_account).unwrap_or(0.0);
                                eprintln!("[VERIFY] After wait: perp equity = {:.2}", perp_equity2);
                            }

                            // Use seed_trade (sets leverage + places IOC at L2 prices)
                            match seed_trade::execute_seed_trade(&cli, params) {
                                Ok(result) if result.status == "filled" => {
                                    eprintln!(
                                        "[VERIFY] REST API open FILLED: {} {} @ ${}",
                                        result.total_size.as_deref().unwrap_or("?"),
                                        cli.asset,
                                        result.avg_price.as_deref().unwrap_or("?"),
                                    );
                                    std::thread::sleep(std::time::Duration::from_secs(10));

                                    // Verify position appeared
                                    let opened = hl_client.has_position(&cli.sub_account, &cli.asset)
                                        .unwrap_or(false);
                                    if opened {
                                        verified = true;
                                        let now = std::time::SystemTime::now()
                                            .duration_since(std::time::UNIX_EPOCH)
                                            .unwrap_or_default()
                                            .as_secs();
                                        let _ = write_position_state(&cli.state_file, &PositionState {
                                            nonce: final_nonce,
                                            opened_at: now,
                                        });
                                        eprintln!("[VERIFY] Position confirmed open via REST API fallback.");
                                    } else {
                                        eprintln!("[VERIFY] WARNING: REST API filled but position not visible yet.");
                                    }
                                }
                                Ok(result) => {
                                    eprintln!(
                                        "[VERIFY] REST API open did not fill: status={}, detail={}",
                                        result.status,
                                        result.detail.as_deref().unwrap_or("none"),
                                    );
                                }
                                Err(e) => {
                                    eprintln!("[VERIFY] REST API open failed: {}", e);
                                }
                            }
                        } else {
                            eprintln!("[VERIFY] No API wallet configured — cannot attempt REST API fallback.");
                        }
                    } else {
                        eprintln!("[VERIFY] Agent intent was not Open — skipping REST API fallback.");
                    }
                } else {
                    // had_position && has_position_now — close was silently rejected OR hold
                    if is_close_intent {
                        // Agent intended to close but CoreWriter order was rejected
                        // (likely price drifted outside oracle band during proof generation)
                        if !cli.json {
                            eprintln!("[VERIFY] WARNING: Close order silently rejected by HyperCore.");
                            eprintln!("[VERIFY] Price likely drifted outside oracle band during ZK proof (~8-10 min).");
                            eprintln!("[VERIFY] Attempting REST API fallback close...");
                        }

                        // Use REST API to close with real-time L2 orderbook prices
                        if cli.api_wallet_key.is_some() {
                            // Determine close direction: closing a long = sell (is_buy=false),
                            // closing a short = buy (is_buy=true)
                            let is_long = snapshot.position_size > 0.0;
                            let close_is_buy = !is_long; // sell to close long, buy to close short
                            let close_size = snapshot.position_size.abs();

                            match seed_trade::execute_close_trade(
                                &cli,
                                close_is_buy,
                                close_size,
                                snapshot.mark_price,
                            ) {
                                Ok(result) if result.status == "filled" => {
                                    if !cli.json {
                                        eprintln!(
                                            "[VERIFY] REST API close FILLED: {} {} @ ${}",
                                            result.total_size.as_deref().unwrap_or("?"),
                                            cli.asset,
                                            result.avg_price.as_deref().unwrap_or("?"),
                                        );
                                        eprintln!("[VERIFY] Waiting 10s for HyperCore settlement...");
                                    }
                                    std::thread::sleep(std::time::Duration::from_secs(10));

                                    // Verify position is actually closed
                                    let still_open = hl_client.has_position(&cli.sub_account, &cli.asset)
                                        .unwrap_or(true);
                                    if !still_open {
                                        verified = true;
                                        clear_position_state(&cli.state_file);
                                        if !cli.json {
                                            eprintln!("[VERIFY] Position confirmed closed. Starting fund recovery...");
                                        }
                                        // Trigger fund recovery
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
                                    } else if !cli.json {
                                        eprintln!("[VERIFY] WARNING: REST API close filled but position still visible. May need more settlement time.");
                                    }
                                }
                                Ok(result) => {
                                    if !cli.json {
                                        eprintln!(
                                            "[VERIFY] REST API close did not fill: status={}, detail={}",
                                            result.status,
                                            result.detail.as_deref().unwrap_or("none"),
                                        );
                                    }
                                }
                                Err(e) => {
                                    if !cli.json {
                                        eprintln!("[VERIFY] REST API close failed: {}", e);
                                    }
                                }
                            }
                        } else if !cli.json {
                            eprintln!("[VERIFY] No API wallet configured — cannot attempt REST API fallback.");
                        }
                    } else {
                        // Not a close intent — agent chose to hold, position maintained as expected
                        verified = true;
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
                    "was_close": is_close_intent,
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

// ============================================================================
// Optimistic execution helpers (RFC-001)
// ============================================================================

/// Build a predicted journal without running the zkVM prover.
///
/// The journal is deterministic given the input and agent output. This function
/// replicates the kernel's journal construction logic on the host side:
///   - Identity fields copied from KernelInputV1
///   - input_commitment = SHA256(input_bytes)
///   - action_commitment = SHA256(agent_output_bytes)
///   - execution_status = Success (0x01)
///
/// The resulting bytes are identical to what the zkVM guest would produce.
fn build_predicted_journal(
    kernel_input: &kernel_core::KernelInputV1,
    input_bytes: &[u8],
    agent_output_bytes: &[u8],
) -> anyhow::Result<Vec<u8>> {
    use kernel_core::{CanonicalEncode, ExecutionStatus, KernelJournalV1};
    use sha2::{Digest, Sha256};

    // Compute input commitment
    let input_commitment: [u8; 32] = {
        let mut hasher = Sha256::new();
        hasher.update(input_bytes);
        hasher.finalize().into()
    };

    // Compute action commitment
    let action_commitment: [u8; 32] = {
        let mut hasher = Sha256::new();
        hasher.update(agent_output_bytes);
        hasher.finalize().into()
    };

    let journal = KernelJournalV1 {
        protocol_version: kernel_input.protocol_version,
        kernel_version: kernel_input.kernel_version,
        agent_id: kernel_input.agent_id,
        agent_code_hash: kernel_input.agent_code_hash,
        constraint_set_hash: kernel_input.constraint_set_hash,
        input_root: kernel_input.input_root,
        execution_nonce: kernel_input.execution_nonce,
        input_commitment,
        action_commitment,
        execution_status: ExecutionStatus::Success,
    };

    journal
        .encode()
        .map_err(|e| anyhow::anyhow!("Failed to encode predicted journal: {:?}", e))
}

/// Submit an optimistic execution on-chain via vault.executeOptimistic().
///
/// Actions execute immediately. Bond is escrowed. Returns the execution nonce
/// assigned by the vault contract.
#[cfg(feature = "onchain")]
async fn submit_optimistic_execution(
    vault_address: &str,
    rpc_url: &str,
    private_key: &str,
    journal_bytes: &[u8],
    agent_output_bytes: &[u8],
    oracle_signature: &[u8],
    oracle_timestamp: u64,
    bond_amount: u128,
) -> anyhow::Result<u64> {
    use alloy::network::EthereumWallet;
    use alloy::primitives::{Address, Bytes, U256};
    use alloy::providers::ProviderBuilder;
    use alloy::signers::local::PrivateKeySigner;
    use alloy::sol;
    use std::str::FromStr;

    sol! {
        #[sol(rpc)]
        interface IOptimisticKernelVault {
            function executeOptimistic(
                bytes calldata journal,
                bytes calldata agentOutputBytes,
                bytes calldata oracleSignature,
                uint64 oracleTimestamp
            ) external payable returns (uint64 executionNonce);

            function lastExecutionNonce() external view returns (uint64);

            function getMinBond() external view returns (uint256);
        }
    }

    let vault = Address::from_str(vault_address)
        .map_err(|_| anyhow::anyhow!("Invalid vault address: {}", vault_address))?;

    let url: reqwest::Url = rpc_url
        .parse()
        .map_err(|_| anyhow::anyhow!("Invalid RPC URL: {}", rpc_url))?;

    let pk_clean = private_key.strip_prefix("0x").unwrap_or(private_key);
    let signer: PrivateKeySigner = pk_clean
        .parse()
        .map_err(|_| anyhow::anyhow!("Invalid private key"))?;

    let wallet = EthereumWallet::from(signer);
    let provider = ProviderBuilder::new()
        .with_recommended_fillers()
        .wallet(wallet)
        .on_http(url);

    let contract = IOptimisticKernelVault::new(vault, &provider);

    // Determine bond amount: use provided value or query on-chain min
    let bond = if bond_amount > 0 {
        U256::from(bond_amount)
    } else {
        let min_bond = contract
            .getMinBond()
            .call()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to query getMinBond: {}", e))?
            ._0;
        eprintln!("[optimistic] Auto-queried min bond: {} wei", min_bond);
        min_bond
    };

    // Read nonce before submission to detect the new one
    let nonce_before = contract
        .lastExecutionNonce()
        .call()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to read nonce: {}", e))?
        ._0;

    let journal = Bytes::copy_from_slice(journal_bytes);
    let output = Bytes::copy_from_slice(agent_output_bytes);
    let oracle_sig = Bytes::copy_from_slice(oracle_signature);

    let tx = contract
        .executeOptimistic(journal, output, oracle_sig, oracle_timestamp)
        .value(bond)
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("executeOptimistic tx failed: {}", e))?;

    let receipt = tx
        .get_receipt()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to get executeOptimistic receipt: {}", e))?;

    if !receipt.status() {
        let tx_hash = format!("0x{}", hex::encode(receipt.transaction_hash.as_slice()));
        return Err(anyhow::anyhow!(
            "executeOptimistic transaction reverted: {}",
            tx_hash
        ));
    }

    let tx_hash = format!("0x{}", hex::encode(receipt.transaction_hash.as_slice()));
    eprintln!(
        "[optimistic] executeOptimistic tx confirmed: {} (block {:?})",
        tx_hash, receipt.block_number
    );

    // The execution nonce is nonce_before + 1 (vault increments atomically)
    let execution_nonce = nonce_before + 1;
    Ok(execution_nonce)
}
