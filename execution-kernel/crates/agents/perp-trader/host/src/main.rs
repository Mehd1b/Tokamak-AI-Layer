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

    // Override account equity with vault's on-chain USDC balance.
    // The agent should see the vault's available capital, not the sub-account's
    // HyperCore margin (which is only populated after openPosition deposits USDC).
    // USDC has 6 decimals, so total_assets / 1e6 gives the human-readable amount.
    let vault_equity = vault_state.total_assets as f64 / 1_000_000.0;
    snapshot.account_equity = vault_equity;
    snapshot.available_balance = vault_equity - snapshot.margin_used;

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
    let signed_feed = oracle_signer::build_and_sign_feed(
        &snapshot,
        &oracle_key,
        &exchange_addr,
    )?;
    if !cli.json {
        eprintln!(
            "[5/8] Oracle feed signed: hash=0x{}",
            hex::encode(&signed_feed.feed_hash[..4])
        );
    }

    // 6. Assemble KernelInputV1
    let vault_addr = Cli::parse_address(&cli.vault)?;
    let usdc_addr = Cli::parse_address(&cli.usdc_address)?;
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
        if cli.json {
            let result = serde_json::json!({
                "status": "no_op",
                "actions": 0,
                "mark_price": snapshot.mark_price,
                "position_size": snapshot.position_size,
                "account_equity": snapshot.account_equity,
            });
            println!("{}", serde_json::to_string_pretty(&result)?);
        } else {
            eprintln!("No action signal. Skipping proof generation and on-chain submission.");
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

    // Submit on-chain (unless dry-run)
    if cli.dry_run {
        if cli.json {
            let result = serde_json::json!({
                "status": "dry_run",
                "journal_hex": hex::encode(&proof_result.journal_bytes),
                "seal_hex": hex::encode(&proof_result.seal_bytes),
                "agent_output_hex": hex::encode(&agent_output_bytes),
                "oracle_signature_hex": hex::encode(&signed_feed.onchain_signature),
                "action_commitment": hex::encode(action_commitment),
                "execution_nonce": kernel_input.execution_nonce,
            });
            println!("{}", serde_json::to_string_pretty(&result)?);
        } else {
            eprintln!("Dry run complete. Skipping on-chain submission.");
        }
    } else {
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
            ))?;

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
