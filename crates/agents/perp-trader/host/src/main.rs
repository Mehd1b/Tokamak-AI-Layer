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

/// Pipeline outcome — controls whether main() retries or exits.
enum PipelineOutcome {
    /// No action taken (no entry signal, pending settlement, etc.) — retry after interval.
    Retry,
    /// Execution completed (position opened/closed, dry run done, etc.) — exit.
    Done,
}

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

    let mut prove_handle: Option<std::thread::JoinHandle<()>> = None;
    let mut monitor_handle: Option<std::thread::JoinHandle<()>> = None;

    if cli.optimistic {
        let worker_queue = proof_queue.clone();
        let worker_shutdown = shutdown.clone();
        let worker_status_clone = worker_status.clone();
        prove_handle = Some(std::thread::spawn(move || {
            prove_worker::run_proving_worker(worker_queue, worker_shutdown, worker_status_clone);
        }));

        // Start monitor thread for deadline tracking
        let monitor_shutdown = shutdown.clone();
        let monitor_nonce = last_known_nonce.clone();
        let monitor_rpc = cli.rpc.clone();
        let monitor_vault = cli.vault.clone();
        monitor_handle = Some(std::thread::spawn(move || {
            monitor::run_monitor_loop(
                monitor::MonitorConfig::new(monitor_rpc, monitor_vault),
                1, // first_optimistic_nonce (will check from nonce 1)
                monitor_nonce,
                monitor_shutdown,
            );
        }));

        if !cli.json {
            eprintln!("[optimistic] Background proving worker and monitor started.");
        }
    }

    // Main execution loop: retries every monitor_interval seconds until the agent
    // finds an entry signal or completes an execution cycle.
    let result = loop {
        match run_pipeline(&cli, &proof_queue, &last_known_nonce) {
            Ok(PipelineOutcome::Retry) => {
                if !cli.json {
                    eprintln!(
                        "[main] No action this cycle. Retrying in {}s...\n",
                        cli.monitor_interval
                    );
                }
                std::thread::sleep(Duration::from_secs(cli.monitor_interval));
                continue;
            }
            Ok(PipelineOutcome::Done) => break Ok(()),
            Err(e) => break Err(e),
        }
    };

    // If optimistic mode queued proofs, wait for the prove worker to drain the queue
    // before shutting down. Proofs must be submitted within the challenge window.
    if cli.optimistic {
        let queue_len = proof_queue.lock().unwrap().len();
        let proving_nonce = worker_status.currently_proving.load(Ordering::Relaxed);
        if queue_len > 0 || proving_nonce > 0 {
            if !cli.json {
                eprintln!(
                    "[optimistic] Waiting for proof(s) to complete before exiting (queued={}, proving nonce={})...",
                    queue_len, proving_nonce
                );
            }
            // Poll until queue is empty AND worker is idle
            loop {
                std::thread::sleep(Duration::from_secs(30));
                let remaining = proof_queue.lock().unwrap().len();
                let active = worker_status.currently_proving.load(Ordering::Relaxed);
                if remaining == 0 && active == 0 {
                    if !cli.json {
                        eprintln!("[optimistic] All proofs submitted. Shutting down.");
                    }
                    break;
                }
                if !cli.json {
                    eprintln!(
                        "[optimistic] Proof status: queued={}, currently proving nonce={}",
                        remaining, active
                    );
                }
            }
        }
    }

    // Signal background threads to stop.
    shutdown.store(true, Ordering::Relaxed);

    // Join background threads for clean shutdown
    if let Some(h) = prove_handle {
        let _ = h.join();
    }
    if let Some(h) = monitor_handle {
        let _ = h.join();
    }

    result
}

/// Main execution pipeline, extracted for clean shutdown handling.
/// Returns `Retry` when the agent has no actions (retry after interval),
/// or `Done` when execution completed or an unrecoverable condition was hit.
fn run_pipeline(
    cli: &Cli,
    proof_queue: &prove_worker::ProofQueue,
    last_known_nonce: &Arc<AtomicU64>,
) -> anyhow::Result<PipelineOutcome> {
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

    // 2b. WSTON bond approval — skipped for cross-chain OKV.
    // The BondManager lives on L1 (bondChainId=1), not on HyperEVM.
    // WSTON approval must be done on L1 before running the bot.
    // The vault's bondManager() is not accessible via HyperEVM RPC.

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
            return Ok(PipelineOutcome::Retry);
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
                        return Ok(PipelineOutcome::Retry);
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
        return Ok(PipelineOutcome::Retry);
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
        return Ok(PipelineOutcome::Retry);
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
    let agent_intent = seed_trade::parse_agent_intent(&agent_output_bytes);
    let needs_two_proof = matches!(agent_intent, seed_trade::AgentIntent::Open(_))
        && snapshot.position_size == 0.0;

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
        return Ok(PipelineOutcome::Done);
    }

    // === OPTIMISTIC EXECUTION PATH (RFC-001) ===
    //
    // When --optimistic is enabled, submit actions immediately with a predicted
    // journal (no ZK proof needed yet). The proof is generated asynchronously
    // in the background worker thread and submitted before the challenge window
    // deadline.
    //
    // Two-phase opens: each phase is a separate optimistic execution with its own
    // WSTON bond. Phase 1 deposits margin, waits for HyperCore settlement, then
    // Phase 2 places the order. Both proofs are queued for background generation.
    //
    // FALLBACK: If optimistic submission fails (TooManyPending, InsufficientBond,
    // nonce conflict, WSTON balance, etc.), fall through to synchronous proven
    // execution for this cycle.
    let mut optimistic_succeeded = false;
    if cli.optimistic {
        #[cfg(feature = "onchain")]
        {
            use std::time::Instant;
            let pk = Cli::resolve_key(&cli.pk)?;

            if cli.dev_mode && !cli.json {
                eprintln!("[optimistic] WARNING: --dev-mode ignored for proof generation. Optimistic proofs must be Groth16 for on-chain verification.");
            }

            if needs_two_proof {
                // ── Two-phase optimistic open ──
                // Phase 1: deposit margin (optimistic execution #1, bond #1)
                // Phase 2: place order    (optimistic execution #2, bond #2)
                if !cli.json {
                    eprintln!("[optimistic] Two-phase open: deposit + order (2 bonds)");
                }

                // Phase 1: build deposit-only input (open_phase=1)
                let (deposit_input, deposit_input_bytes) = input_builder::build_input_with_phase(
                    &bundle, &vault_state, &snapshot, &indicator_set, &signed_feed,
                    &cli, &exchange_addr, &vault_addr, &usdc_addr, 1,
                )?;
                let (deposit_output_bytes, _deposit_commitment) =
                    output_reconstruct::reconstruct_output(&deposit_input, &deposit_input_bytes)?;
                let deposit_action_count = kernel_core::AgentOutput::decode(&deposit_output_bytes)
                    .map(|o| o.actions.len())
                    .unwrap_or(0);

                if deposit_action_count == 0 {
                    if !cli.json {
                        eprintln!("[optimistic] Phase 1 produced 0 actions — agent declined to deposit. Falling back.");
                    }
                } else {
                    // Build predicted journal for phase 1
                    let deposit_journal = build_predicted_journal(
                        &deposit_input,
                        &deposit_input_bytes,
                        &deposit_output_bytes,
                    )?;

                    if !cli.json {
                        eprintln!(
                            "[optimistic] Phase 1: submitting deposit ({} actions, journal={} bytes)...",
                            deposit_action_count, deposit_journal.len()
                        );
                    }

                    let rt = tokio::runtime::Runtime::new()?;
                    let phase1_result = rt.block_on(submit_optimistic_execution(
                        &cli.vault, &cli.rpc, &pk,
                        &deposit_journal, &deposit_output_bytes,
                        &signed_feed.onchain_signature, signed_feed.feed.timestamp,
                        cli.bond_amount,
                        cli.oracle_url.as_deref().unwrap_or(""),
                    ));

                    match phase1_result {
                        Ok(nonce1) => {
                            if !cli.json {
                                eprintln!(
                                    "[optimistic] Phase 1 nonce {} submitted. Queuing proof #1.",
                                    nonce1
                                );
                            }
                            last_known_nonce.store(nonce1, Ordering::Relaxed);

                            // Persist input bytes for proof recovery
                            let input_path = format!("/tmp/perp-optimistic-nonce-{}.input.bin", nonce1);
                            if let Err(e) = std::fs::write(&input_path, &deposit_input_bytes) {
                                eprintln!("[optimistic] WARNING: Failed to persist input bytes: {}", e);
                            }

                            // Queue proof job for phase 1
                            {
                                let mut queue = proof_queue.lock().unwrap();
                                queue.push_back(prove_worker::PendingProof {
                                    execution_nonce: nonce1,
                                    input_bytes: deposit_input_bytes.clone(),
                                    bundle_path: cli.bundle.clone(),
                                    rpc_url: cli.rpc.clone(),
                                    vault_address: cli.vault.clone(),
                                    private_key: pk.clone(),
                                    deadline: Instant::now() + Duration::from_secs(cli.challenge_window),
                                    queued_at: Instant::now(),
                                    dev_mode: if cli.optimistic { false } else { cli.dev_mode },
                                    retry_count: 0,
                                });
                            }

                            // Wait for HyperCore deposit settlement
                            if !cli.json {
                                eprintln!("[optimistic] Waiting 10s for HyperCore deposit settlement...");
                            }
                            std::thread::sleep(std::time::Duration::from_secs(10));

                            // Seed trade via REST API: sets leverage + places tiny IOC order.
                            // This creates the position struct on HyperCore (leverage > 0),
                            // which is required for CoreWriter limit orders to not be silently rejected.
                            if let seed_trade::AgentIntent::Open(ref params) = agent_intent {
                                if cli.api_wallet_key.is_some() {
                                    if !cli.json {
                                        eprintln!(
                                            "[optimistic] Seed trade: {} via REST API (leverage={}x) to initialize HyperCore position struct...",
                                            if params.is_buy { "BUY" } else { "SELL" },
                                            cli.seed_leverage,
                                        );
                                    }
                                    match seed_trade::execute_seed_trade(&cli, params) {
                                        Ok(result) if result.status == "filled" => {
                                            if !cli.json {
                                                eprintln!(
                                                    "[optimistic] Seed trade filled: {} {}. Position struct initialized.",
                                                    result.total_size.as_deref().unwrap_or("?"),
                                                    cli.asset,
                                                );
                                            }
                                        }
                                        Ok(result) => {
                                            if !cli.json {
                                                eprintln!(
                                                    "[optimistic] WARNING: Seed trade status={}, Phase 2 CoreWriter order may be rejected.",
                                                    result.status
                                                );
                                            }
                                        }
                                        Err(e) => {
                                            if !cli.json {
                                                eprintln!("[optimistic] WARNING: Seed trade failed: {}. Phase 2 CoreWriter order may be rejected.", e);
                                            }
                                        }
                                    }
                                } else if !cli.json {
                                    eprintln!("[optimistic] WARNING: No --api-wallet-key. Cannot seed trade. CoreWriter order may be rejected.");
                                }
                            }

                            // Phase 2: re-read vault state, re-fetch market data, build order
                            let vault_state_2 = rt.block_on(onchain::read_vault_state(&cli.vault, &cli.rpc))?;
                            let mut snapshot_2 = hl_client.fetch_snapshot(
                                &cli.asset, &cli.sub_account, cli.candles_needed(),
                            )?;

                            // Use HyperCore equity for order sizing (margin was deposited in Phase 1)
                            let hypercore_equity = snapshot_2.account_equity;
                            if hypercore_equity > 0.5 {
                                snapshot_2.account_equity = hypercore_equity * 1_000_000.0;
                                snapshot_2.available_balance = snapshot_2.account_equity - snapshot_2.margin_used;
                            } else {
                                let vault_eq = vault_state_2.total_assets as f64;
                                snapshot_2.account_equity = vault_eq;
                                snapshot_2.available_balance = vault_eq - snapshot_2.margin_used;
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
                            let (order_output_bytes, _order_commitment) =
                                output_reconstruct::reconstruct_output(&order_input, &order_input_bytes)?;
                            let order_action_count = kernel_core::AgentOutput::decode(&order_output_bytes)
                                .map(|o| o.actions.len())
                                .unwrap_or(0);

                            if order_action_count == 0 {
                                if !cli.json {
                                    eprintln!("[optimistic] Phase 2: agent produced 0 actions (market changed). Deposit on HyperCore will be recovered next cycle.");
                                }
                                if cli.json {
                                    println!("{}", serde_json::to_string_pretty(&serde_json::json!({
                                        "status": "optimistic_partial",
                                        "reason": "two_proof_phase2_no_signal",
                                        "phase1_nonce": nonce1,
                                        "phase1_proof_queued": true,
                                    }))?);
                                }
                                optimistic_succeeded = true;
                            } else {
                                // Build predicted journal for phase 2
                                let order_journal = build_predicted_journal(
                                    &order_input,
                                    &order_input_bytes,
                                    &order_output_bytes,
                                )?;

                                if !cli.json {
                                    eprintln!(
                                        "[optimistic] Phase 2: submitting order ({} actions, journal={} bytes)...",
                                        order_action_count, order_journal.len()
                                    );
                                }

                                let phase2_result = rt.block_on(submit_optimistic_execution(
                                    &cli.vault, &cli.rpc, &pk,
                                    &order_journal, &order_output_bytes,
                                    &signed_feed_2.onchain_signature, signed_feed_2.feed.timestamp,
                                    cli.bond_amount,
                                    cli.oracle_url.as_deref().unwrap_or(""),
                                ));

                                match phase2_result {
                                    Ok(nonce2) => {
                                        if !cli.json {
                                            eprintln!(
                                                "[optimistic] Phase 2 nonce {} submitted. Queuing proof #2.",
                                                nonce2
                                            );
                                        }
                                        last_known_nonce.store(nonce2, Ordering::Relaxed);

                                        // Persist input bytes for proof recovery
                                        let input_path = format!("/tmp/perp-optimistic-nonce-{}.input.bin", nonce2);
                                        if let Err(e) = std::fs::write(&input_path, &order_input_bytes) {
                                            eprintln!("[optimistic] WARNING: Failed to persist input bytes: {}", e);
                                        }

                                        // Queue proof job for phase 2
                                        {
                                            let mut queue = proof_queue.lock().unwrap();
                                            queue.push_back(prove_worker::PendingProof {
                                                execution_nonce: nonce2,
                                                input_bytes: order_input_bytes,
                                                bundle_path: cli.bundle.clone(),
                                                rpc_url: cli.rpc.clone(),
                                                vault_address: cli.vault.clone(),
                                                private_key: pk.clone(),
                                                deadline: Instant::now() + Duration::from_secs(cli.challenge_window),
                                                queued_at: Instant::now(),
                                                dev_mode: if cli.optimistic { false } else { cli.dev_mode },
                                                retry_count: 0,
                                            });
                                        }

                                        // Track position state for the open
                                        let now = std::time::SystemTime::now()
                                            .duration_since(std::time::UNIX_EPOCH)
                                            .unwrap_or_default()
                                            .as_secs();
                                        let _ = write_position_state(&cli.state_file, &PositionState {
                                            nonce: nonce2,
                                            opened_at: now,
                                        });

                                        if cli.json {
                                            let result = serde_json::json!({
                                                "status": "optimistic_submitted",
                                                "two_phase": true,
                                                "phase1_nonce": nonce1,
                                                "phase2_nonce": nonce2,
                                                "actions": order_action_count,
                                                "challenge_window_secs": cli.challenge_window,
                                                "proofs_queued": 2,
                                            });
                                            println!("{}", serde_json::to_string_pretty(&result)?);
                                        } else {
                                            eprintln!(
                                                "[optimistic] Both proofs queued (deadlines in {}s). Main thread returning.",
                                                cli.challenge_window
                                            );
                                        }

                                        optimistic_succeeded = true;
                                    }
                                    Err(e) => {
                                        // Phase 2 optimistic failed, but Phase 1 already executed.
                                        // Phase 1 proof is queued. Try Phase 2 synchronously.
                                        if !cli.json {
                                            eprintln!(
                                                "[optimistic] Phase 2 failed: {}. Trying synchronous for phase 2...",
                                                e
                                            );
                                        }
                                        let order_proof = prove::generate_proof(&bundle, &order_input_bytes, cli.dev_mode)?;
                                        let sync_result = rt.block_on(onchain::execute_with_oracle(
                                            &cli.vault, &cli.rpc, &pk,
                                            &order_proof.journal_bytes, &order_proof.seal_bytes,
                                            &order_output_bytes,
                                            &signed_feed_2.onchain_signature, signed_feed_2.feed.timestamp,
                                        ));
                                        match sync_result {
                                            Ok(tx) if tx.success => {
                                                if !cli.json {
                                                    eprintln!("[optimistic] Phase 2 synchronous fallback succeeded: {}", tx.tx_hash);
                                                }
                                                let now = std::time::SystemTime::now()
                                                    .duration_since(std::time::UNIX_EPOCH)
                                                    .unwrap_or_default()
                                                    .as_secs();
                                                let _ = write_position_state(&cli.state_file, &PositionState {
                                                    nonce: order_input.execution_nonce,
                                                    opened_at: now,
                                                });
                                                optimistic_succeeded = true;
                                            }
                                            Ok(tx) => {
                                                if !cli.json {
                                                    eprintln!("[optimistic] Phase 2 synchronous fallback reverted: {}", tx.tx_hash);
                                                }
                                                optimistic_succeeded = true; // Phase 1 still succeeded
                                            }
                                            Err(e) => {
                                                if !cli.json {
                                                    eprintln!("[optimistic] Phase 2 synchronous fallback failed: {}", e);
                                                }
                                                optimistic_succeeded = true; // Phase 1 still succeeded
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            // Phase 1 optimistic failed — fall through to fully synchronous path
                            if !cli.json {
                                eprintln!(
                                    "[optimistic] Phase 1 failed: {}. Falling back to synchronous two-proof.",
                                    e
                                );
                            }
                        }
                    }
                }
            } else {
                // ── Single-proof optimistic (closes, holds) ──
                if !cli.json {
                    eprintln!("[optimistic] Building predicted journal...");
                }

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
                    eprintln!("[optimistic] Submitting optimistic execution to vault...");
                }

                let rt = tokio::runtime::Runtime::new()?;
                let optimistic_result = rt.block_on(submit_optimistic_execution(
                    &cli.vault,
                    &cli.rpc,
                    &pk,
                    &predicted_journal,
                    &agent_output_bytes,
                    &signed_feed.onchain_signature,
                    signed_feed.feed.timestamp,
                    cli.bond_amount,
                    cli.oracle_url.as_deref().unwrap_or(""),
                ));

                match optimistic_result {
                    Ok(execution_nonce) => {
                        if !cli.json {
                            eprintln!(
                                "[optimistic] Execution nonce {} submitted! Actions executed immediately.",
                                execution_nonce
                            );
                        }

                        last_known_nonce.store(execution_nonce, Ordering::Relaxed);

                        // Persist input bytes for proof recovery
                        let input_path = format!("/tmp/perp-optimistic-nonce-{}.input.bin", execution_nonce);
                        if let Err(e) = std::fs::write(&input_path, &input_bytes) {
                            eprintln!("[optimistic] WARNING: Failed to persist input bytes: {}", e);
                        }

                        let proof_job = prove_worker::PendingProof {
                            execution_nonce,
                            input_bytes: input_bytes.clone(),
                            bundle_path: cli.bundle.clone(),
                            rpc_url: cli.rpc.clone(),
                            vault_address: cli.vault.clone(),
                            private_key: pk,
                            deadline: Instant::now() + Duration::from_secs(cli.challenge_window),
                            queued_at: Instant::now(),
                            dev_mode: if cli.optimistic { false } else { cli.dev_mode },
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

                        optimistic_succeeded = true;
                    }
                    Err(e) => {
                        if !cli.json {
                            eprintln!(
                                "[optimistic] Submission failed: {}. Falling back to synchronous proven execution.",
                                e
                            );
                        }
                    }
                }
            }
        }

        #[cfg(not(feature = "onchain"))]
        {
            return Err(anyhow::anyhow!(
                "Optimistic execution requires --features onchain."
            ));
        }
    }

    // If optimistic open succeeded and hold monitoring is enabled, enter the
    // position monitoring loop. Poll HyperCore for TP/SL or max hold timeout,
    // then auto-close and recover funds.
    if optimistic_succeeded && cli.max_hold_secs > 0 {
        // Only monitor if we actually opened a position (not a close or no-op)
        let is_open_intent = matches!(agent_intent, seed_trade::AgentIntent::Open(_));
        if is_open_intent {
            monitor_and_close(
                cli, &bundle, &hl_client, &snapshot, proof_queue, last_known_nonce,
                &exchange_addr, &vault_addr, &usdc_addr,
            )?;
        }
        return Ok(PipelineOutcome::Done);
    }

    // If optimistic succeeded but monitoring disabled, we're done.
    if optimistic_succeeded {
        return Ok(PipelineOutcome::Done);
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

            // Seed trade via REST API: sets leverage + places tiny IOC order.
            // This creates the position struct on HyperCore (leverage > 0),
            // which is required for CoreWriter limit orders to not be silently rejected.
            if let seed_trade::AgentIntent::Open(ref params) = agent_intent {
                if cli.api_wallet_key.is_some() {
                    if !cli.json {
                        eprintln!(
                            "[OPEN] Seed trade: {} via REST API (leverage={}x)...",
                            if params.is_buy { "BUY" } else { "SELL" },
                            cli.seed_leverage,
                        );
                    }
                    match seed_trade::execute_seed_trade(&cli, params) {
                        Ok(result) if result.status == "filled" => {
                            if !cli.json {
                                eprintln!(
                                    "[OPEN] Seed trade filled: {} {}. Position struct initialized.",
                                    result.total_size.as_deref().unwrap_or("?"),
                                    cli.asset,
                                );
                            }
                        }
                        Ok(result) => {
                            if !cli.json {
                                eprintln!("[OPEN] WARNING: Seed trade status={}. CoreWriter order may be rejected.", result.status);
                            }
                        }
                        Err(e) => {
                            if !cli.json {
                                eprintln!("[OPEN] WARNING: Seed trade failed: {}. CoreWriter order may be rejected.", e);
                            }
                        }
                    }
                } else if !cli.json {
                    eprintln!("[OPEN] WARNING: No --api-wallet-key. Cannot seed trade.");
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
            return Ok(PipelineOutcome::Done);
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

    Ok(PipelineOutcome::Done)
}

// ============================================================================
// Position monitoring + auto-close loop
// ============================================================================

/// After an optimistic open, monitor the position and auto-close when:
/// - Take profit threshold is reached (mark moved in our favor by take_profit_bps)
/// - Stop loss threshold is reached (mark moved against us by stop_loss_bps)
/// - Max hold duration elapsed (cli.max_hold_secs)
///
/// Then submits a force-close optimistic execution and triggers fund recovery.
fn monitor_and_close(
    cli: &Cli,
    bundle: &reference_integrator::LoadedBundle,
    hl_client: &hyperliquid::client::HyperliquidClient,
    _open_snapshot: &market::MarketSnapshot,
    proof_queue: &prove_worker::ProofQueue,
    last_known_nonce: &Arc<AtomicU64>,
    exchange_addr: &[u8; 20],
    vault_addr: &[u8; 20],
    usdc_addr: &[u8; 20],
) -> anyhow::Result<()> {
    use std::time::Instant;

    let monitor_start = Instant::now();
    let max_hold = Duration::from_secs(cli.max_hold_secs);
    let poll_interval = Duration::from_secs(cli.monitor_interval);

    if !cli.json {
        eprintln!(
            "\n[MONITOR] Position monitoring started. TP={}bps, SL={}bps, max_hold={}s, poll={}s",
            cli.take_profit_bps, cli.stop_loss_bps, cli.max_hold_secs, cli.monitor_interval
        );
    }

    // Wait a bit for HyperCore position to become visible
    std::thread::sleep(Duration::from_secs(10));

    // Fetch initial position state to get entry price
    let initial_snap = hl_client.fetch_snapshot(&cli.asset, &cli.sub_account, 1)?;
    if initial_snap.position_size == 0.0 {
        if !cli.json {
            eprintln!("[MONITOR] No position visible yet. Waiting 15s more...");
        }
        std::thread::sleep(Duration::from_secs(15));
    }

    let snap = hl_client.fetch_snapshot(&cli.asset, &cli.sub_account, 1)?;
    if snap.position_size == 0.0 {
        if !cli.json {
            eprintln!("[MONITOR] Position still not visible after 25s. Exiting monitor.");
        }
        return Ok(());
    }

    let entry_price = snap.entry_price;
    let is_long = snap.position_size > 0.0;
    let tp_bps = cli.take_profit_bps as f64;
    let sl_bps = cli.stop_loss_bps as f64;

    if !cli.json {
        eprintln!(
            "[MONITOR] Position detected: {} {:.5} {} @ ${:.2}",
            if is_long { "LONG" } else { "SHORT" },
            snap.position_size.abs(),
            cli.asset,
            entry_price,
        );
        let tp_price = if is_long {
            entry_price * (1.0 + tp_bps / 10000.0)
        } else {
            entry_price * (1.0 - tp_bps / 10000.0)
        };
        let sl_price = if is_long {
            entry_price * (1.0 - sl_bps / 10000.0)
        } else {
            entry_price * (1.0 + sl_bps / 10000.0)
        };
        eprintln!(
            "[MONITOR] TP target: ${:.2}, SL target: ${:.2}",
            tp_price, sl_price
        );
    }

    // Monitoring loop
    let close_reason;
    loop {
        std::thread::sleep(poll_interval);

        let elapsed = monitor_start.elapsed();

        // Check max hold timeout first
        if elapsed >= max_hold {
            close_reason = format!("max_hold_timeout ({}s elapsed)", elapsed.as_secs());
            if !cli.json {
                eprintln!("[MONITOR] Max hold duration reached ({}s). Closing position.", elapsed.as_secs());
            }
            break;
        }

        // Fetch current mark price
        let current = match hl_client.fetch_snapshot(&cli.asset, &cli.sub_account, 1) {
            Ok(s) => s,
            Err(e) => {
                if !cli.json {
                    eprintln!("[MONITOR] Failed to fetch snapshot: {}. Retrying...", e);
                }
                continue;
            }
        };

        // If position was closed externally (liquidation, manual), exit
        if current.position_size == 0.0 {
            if !cli.json {
                eprintln!("[MONITOR] Position closed externally. Triggering fund recovery.");
            }
            clear_position_state(&cli.state_file);

            #[cfg(feature = "onchain")]
            {
                let rt = tokio::runtime::Runtime::new()?;
                match rt.block_on(onchain::recover_funds_to_vault(cli, hl_client)) {
                    Ok(recovered) => {
                        if !cli.json && recovered > 0 {
                            eprintln!("[RECOVER] Recovered {} USDC to vault.", recovered);
                        }
                    }
                    Err(e) => {
                        if !cli.json {
                            eprintln!("[RECOVER] Recovery failed: {}", e);
                        }
                    }
                }
            }
            return Ok(());
        }

        let mark = current.mark_price;

        // Calculate PnL in bps
        let pnl_bps = if is_long {
            (mark - entry_price) / entry_price * 10000.0
        } else {
            (entry_price - mark) / entry_price * 10000.0
        };

        let remaining = max_hold.saturating_sub(elapsed);
        if !cli.json {
            eprintln!(
                "[MONITOR] mark=${:.2} entry=${:.2} pnl={:+.1}bps (TP={}, SL=-{}) remaining={}s",
                mark, entry_price, pnl_bps, tp_bps, sl_bps, remaining.as_secs()
            );
        }

        // Check take profit
        if pnl_bps >= tp_bps {
            close_reason = format!("take_profit (pnl={:.1}bps >= TP={}bps)", pnl_bps, tp_bps);
            if !cli.json {
                eprintln!("[MONITOR] Take profit reached! pnl={:+.1}bps. Closing.", pnl_bps);
            }
            break;
        }

        // Check stop loss (pnl_bps is negative when losing)
        if pnl_bps <= -(sl_bps) {
            close_reason = format!("stop_loss (pnl={:.1}bps <= -SL={}bps)", pnl_bps, sl_bps);
            if !cli.json {
                eprintln!("[MONITOR] Stop loss hit! pnl={:+.1}bps. Closing.", pnl_bps);
            }
            break;
        }
    }

    // === Execute force-close ===
    if !cli.json {
        eprintln!("[MONITOR] Close reason: {}", close_reason);
        eprintln!("[MONITOR] Building force-close execution (action_flag=1)...");
    }

    execute_force_close(
        cli, bundle, hl_client, proof_queue, last_known_nonce,
        exchange_addr, vault_addr, usdc_addr, &close_reason,
    )
}

/// Build and submit a force-close optimistic execution, then recover funds.
fn execute_force_close(
    cli: &Cli,
    bundle: &reference_integrator::LoadedBundle,
    hl_client: &hyperliquid::client::HyperliquidClient,
    proof_queue: &prove_worker::ProofQueue,
    last_known_nonce: &Arc<AtomicU64>,
    exchange_addr: &[u8; 20],
    vault_addr: &[u8; 20],
    usdc_addr: &[u8; 20],
    close_reason: &str,
) -> anyhow::Result<()> {
    use std::time::Instant;

    // Fresh market data for close
    let mut close_snapshot = hl_client.fetch_snapshot(&cli.asset, &cli.sub_account, cli.candles_needed())?;

    if close_snapshot.position_size == 0.0 {
        if !cli.json {
            eprintln!("[CLOSE] No position to close. Skipping.");
        }
        return Ok(());
    }

    // Read vault state
    #[cfg(feature = "onchain")]
    let close_vault_state = {
        let rt = tokio::runtime::Runtime::new()?;
        rt.block_on(onchain::read_vault_state(&cli.vault, &cli.rpc))?
    };
    #[cfg(not(feature = "onchain"))]
    let close_vault_state = onchain::VaultState::default_for_dry_run();

    // Use HyperCore equity for the close cycle (funds are on HyperCore, not in vault)
    let hypercore_equity = close_snapshot.account_equity;
    if hypercore_equity > 0.5 {
        close_snapshot.account_equity = hypercore_equity * 1_000_000.0;
        close_snapshot.available_balance = close_snapshot.account_equity - close_snapshot.margin_used;
    }

    // Compute indicators (needed for input encoding, even though action_flag=1 bypasses strategy)
    let close_indicators = indicators::compute_indicators(&close_snapshot.candle_closes, cli)?;

    // Build oracle feed
    let oracle_key = Cli::resolve_key(&cli.oracle_key)?;
    let close_feed = oracle_signer::build_and_sign_feed(
        &close_snapshot, &oracle_key, exchange_addr, vault_addr, cli.chain_id,
    )?;

    // Build force-close input (action_flag=1 makes agent produce close actions)
    let mut close_cli = cli.clone();
    close_cli.action_flag = 1;

    let (close_input, close_input_bytes) = input_builder::build_input_with_phase(
        bundle, &close_vault_state, &close_snapshot, &close_indicators, &close_feed,
        &close_cli, exchange_addr, vault_addr, usdc_addr, 0,
    )?;
    let (close_output_bytes, _close_commitment) =
        output_reconstruct::reconstruct_output(&close_input, &close_input_bytes)?;
    let close_action_count = kernel_core::AgentOutput::decode(&close_output_bytes)
        .map(|o| o.actions.len())
        .unwrap_or(0);

    if close_action_count == 0 {
        if !cli.json {
            eprintln!("[CLOSE] Agent produced 0 close actions. Falling back to adapter admin close.");
        }
        // Fallback: use REST API close or adapter admin
        return fallback_close_and_recover(cli, hl_client, &close_snapshot);
    }

    if !cli.json {
        eprintln!(
            "[CLOSE] Force-close: {} actions, nonce={}",
            close_action_count, close_input.execution_nonce
        );
    }

    // Submit optimistic close
    #[cfg(feature = "onchain")]
    {
        let pk = Cli::resolve_key(&cli.pk)?;

        let close_journal = build_predicted_journal(
            &close_input,
            &close_input_bytes,
            &close_output_bytes,
        )?;

        let rt = tokio::runtime::Runtime::new()?;
        let close_result = rt.block_on(submit_optimistic_execution(
            &cli.vault, &cli.rpc, &pk,
            &close_journal, &close_output_bytes,
            &close_feed.onchain_signature, close_feed.feed.timestamp,
            cli.bond_amount,
            cli.oracle_url.as_deref().unwrap_or(""),
        ));

        match close_result {
            Ok(close_nonce) => {
                if !cli.json {
                    eprintln!(
                        "[CLOSE] Optimistic close submitted (nonce={}). Queuing proof.",
                        close_nonce
                    );
                }
                last_known_nonce.store(close_nonce, Ordering::Relaxed);

                // Persist input for proof recovery
                let input_path = format!("/tmp/perp-optimistic-nonce-{}.input.bin", close_nonce);
                let _ = std::fs::write(&input_path, &close_input_bytes);

                // Queue proof job
                {
                    let mut queue = proof_queue.lock().unwrap();
                    queue.push_back(prove_worker::PendingProof {
                        execution_nonce: close_nonce,
                        input_bytes: close_input_bytes,
                        bundle_path: cli.bundle.clone(),
                        rpc_url: cli.rpc.clone(),
                        vault_address: cli.vault.clone(),
                        private_key: pk.clone(),
                        deadline: Instant::now() + Duration::from_secs(cli.challenge_window),
                        queued_at: Instant::now(),
                        dev_mode: false,
                        retry_count: 0,
                    });
                }

                clear_position_state(&cli.state_file);

                // Wait for HyperCore settlement then recover funds
                if !cli.json {
                    eprintln!("[CLOSE] Waiting 15s for HyperCore close settlement...");
                }
                std::thread::sleep(Duration::from_secs(15));

                // Verify close
                let still_open = hl_client.has_position(&cli.sub_account, &cli.asset).unwrap_or(true);
                if still_open {
                    if !cli.json {
                        eprintln!("[CLOSE] CoreWriter close may have been silently rejected. Trying REST API fallback...");
                    }
                    return fallback_close_and_recover(cli, hl_client, &close_snapshot);
                }

                // Recover funds: perp → spot → EVM → vault
                if !cli.json {
                    eprintln!("[CLOSE] Position closed. Starting fund recovery...");
                }
                match rt.block_on(onchain::recover_funds_to_vault(cli, hl_client)) {
                    Ok(recovered) => {
                        if !cli.json && recovered > 0 {
                            eprintln!("[RECOVER] Successfully recovered {} USDC to vault.", recovered);
                        }
                    }
                    Err(e) => {
                        if !cli.json {
                            eprintln!("[RECOVER] Fund recovery failed: {}", e);
                        }
                    }
                }

                if cli.json {
                    let result = serde_json::json!({
                        "status": "closed",
                        "reason": close_reason,
                        "close_nonce": close_nonce,
                        "proof_queued": true,
                    });
                    println!("{}", serde_json::to_string_pretty(&result)?);
                }
            }
            Err(e) => {
                if !cli.json {
                    eprintln!("[CLOSE] Optimistic close failed: {}. Falling back to REST API close.", e);
                }
                return fallback_close_and_recover(cli, hl_client, &close_snapshot);
            }
        }
    }

    #[cfg(not(feature = "onchain"))]
    {
        return Err(anyhow::anyhow!("Force-close requires --features onchain"));
    }

    Ok(())
}

/// Fallback close using REST API (adapter admin or seed_trade close) + fund recovery.
fn fallback_close_and_recover(
    cli: &Cli,
    hl_client: &hyperliquid::client::HyperliquidClient,
    snapshot: &market::MarketSnapshot,
) -> anyhow::Result<()> {
    let is_long = snapshot.position_size > 0.0;
    let close_is_buy = !is_long;
    let close_size = snapshot.position_size.abs();

    if cli.api_wallet_key.is_some() {
        if !cli.json {
            eprintln!(
                "[FALLBACK] REST API close: {} {:.5} {} @ ${:.0}",
                if close_is_buy { "BUY" } else { "SELL" },
                close_size,
                cli.asset,
                snapshot.mark_price,
            );
        }
        match seed_trade::execute_close_trade(cli, close_is_buy, close_size, snapshot.mark_price) {
            Ok(result) if result.status == "filled" => {
                if !cli.json {
                    eprintln!("[FALLBACK] Close filled. Waiting 15s for settlement...");
                }
                std::thread::sleep(Duration::from_secs(15));
                clear_position_state(&cli.state_file);

                #[cfg(feature = "onchain")]
                {
                    let rt = tokio::runtime::Runtime::new()?;
                    match rt.block_on(onchain::recover_funds_to_vault(cli, hl_client)) {
                        Ok(recovered) => {
                            if !cli.json && recovered > 0 {
                                eprintln!("[RECOVER] Recovered {} USDC to vault.", recovered);
                            }
                        }
                        Err(e) => {
                            if !cli.json {
                                eprintln!("[RECOVER] Recovery failed: {}", e);
                            }
                        }
                    }
                }
            }
            Ok(result) => {
                if !cli.json {
                    eprintln!("[FALLBACK] Close not filled: status={}", result.status);
                }
            }
            Err(e) => {
                if !cli.json {
                    eprintln!("[FALLBACK] Close failed: {}", e);
                }
            }
        }
    } else if !cli.json {
        eprintln!("[FALLBACK] No API wallet key. Cannot close via REST API.");
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
/// Actions execute immediately. WSTON bond is escrowed via BondManager.
/// Returns the execution nonce assigned by the vault contract.
///
/// The operator must have previously approved the BondManager to spend their
/// WSTON tokens (handled by ensure_wston_approval at startup).
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
    oracle_url: &str,
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
                uint64 oracleTimestamp,
                uint256 bondAmount,
                bytes calldata bondAttestation
            ) external;

            function lastExecutionNonce() external view returns (uint64);
            function bondManager() external view returns (address);
            function minBond() external view returns (uint256);
            function bondChainId() external view returns (uint256);
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

    let operator_address = signer.address();
    let wallet = EthereumWallet::from(signer);
    let provider = ProviderBuilder::new()
        .with_recommended_fillers()
        .wallet(wallet)
        .on_http(url);

    let contract = IOptimisticKernelVault::new(vault, &provider);

    // Determine bond amount: use provided value or query vault.minBond().
    // Note: bondManager lives on L1, not on HyperEVM. We only check the vault's minBond here.
    let bond = if bond_amount > 0 {
        U256::from(bond_amount)
    } else {
        let vault_min = contract
            .minBond()
            .call()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to query vault minBond: {}", e))?
            ._0;

        eprintln!(
            "[optimistic] Auto-queried min bond from vault: {}",
            vault_min
        );
        vault_min
    };

    // Read nonce before submission to detect the new one
    let nonce_before = contract
        .lastExecutionNonce()
        .call()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to read nonce: {}", e))?
        ._0;

    let execution_nonce = nonce_before + 1;

    // Query bondChainId from the contract (this is the L1 chain where bonds are locked)
    let bond_chain_id = contract
        .bondChainId()
        .call()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to query bondChainId: {}", e))?
        ._0;
    let bond_chain_id_u64: u64 = bond_chain_id.try_into()
        .map_err(|_| anyhow::anyhow!("bondChainId too large for u64: {}", bond_chain_id))?;

    // Fetch bond attestation from oracle service
    let bond_attestation_bytes = fetch_bond_attestation(
        oracle_url,
        &operator_address.to_string(),
        vault_address,
        execution_nonce,
        &bond.to_string(),
        bond_chain_id_u64,
    )
    .await?;

    let journal = Bytes::copy_from_slice(journal_bytes);
    let output = Bytes::copy_from_slice(agent_output_bytes);
    let oracle_sig = Bytes::copy_from_slice(oracle_signature);
    let bond_att = Bytes::copy_from_slice(&bond_attestation_bytes);

    eprintln!(
        "[optimistic] Submitting executeOptimistic nonce={} bond={} ...",
        execution_nonce, bond
    );

    let tx = contract
        .executeOptimistic(journal, output, oracle_sig, oracle_timestamp, bond, bond_att)
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

    Ok(execution_nonce)
}

/// Fetch a bond attestation from the oracle service.
/// Returns the raw 65-byte ECDSA signature.
async fn fetch_bond_attestation(
    oracle_url: &str,
    operator: &str,
    vault: &str,
    nonce: u64,
    amount: &str,
    chain_id: u64,
) -> anyhow::Result<Vec<u8>> {
    let url = format!("{}/api/v1/attest-bond", oracle_url.trim_end_matches('/'));

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "operator": operator,
        "vault": vault,
        "nonce": nonce.to_string(),
        "amount": amount,
        "chainId": chain_id.to_string(),
    });

    eprintln!(
        "[optimistic] Fetching bond attestation from {} for nonce={}...",
        url, nonce
    );

    let resp = client
        .post(&url)
        .json(&body)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("Oracle request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(anyhow::anyhow!(
            "Oracle returned {}: {}",
            status,
            text
        ));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to parse oracle response: {}", e))?;

    let attestation_hex = json["attestation"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("Missing 'attestation' in oracle response"))?;

    let clean = attestation_hex
        .strip_prefix("0x")
        .unwrap_or(attestation_hex);
    let bytes = hex::decode(clean)
        .map_err(|e| anyhow::anyhow!("Invalid attestation hex: {}", e))?;

    eprintln!(
        "[optimistic] Got bond attestation ({} bytes) from signer {}",
        bytes.len(),
        json["signer"].as_str().unwrap_or("unknown")
    );

    Ok(bytes)
}
