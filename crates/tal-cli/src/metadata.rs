//! `tal metadata` — Manage agent metadata (name, description, strategy, etc.).
//!
//! Subcommands:
//!   tal metadata set   — Generate metadata JSON and/or set the metadata URI on-chain
//!   tal metadata show  — Fetch and display metadata for an agent

use crate::onchain::{
    build_provider, build_read_provider, get_chain_config, parse_bytes32, resolve_env,
    resolve_private_key, send_tx,
};
use alloy::primitives::{FixedBytes, U256};
use alloy::sol;
use alloy::sol_types::SolCall;
use anyhow::{Context, Result};
use colored::Colorize;

// ===========================================================================
// Contract Interface
// ===========================================================================

sol! {
    #[sol(rpc)]
    interface IAgentRegistry {
        function getMetadataURI(bytes32 agentId) external view returns (string);
        function setMetadataURI(bytes32 agentId, string uri) external;
    }
}

// ===========================================================================
// Metadata Schema
// ===========================================================================

#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct AgentMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub strategy: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub website: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub twitter: Option<String>,
}

// ===========================================================================
// CLI Argument Types
// ===========================================================================

/// Arguments for `tal metadata set`.
pub struct SetArgs {
    pub name: Option<String>,
    pub description: Option<String>,
    pub strategy: Option<String>,
    pub tags: Option<String>,
    pub website: Option<String>,
    pub twitter: Option<String>,
    pub agent_id: Option<String>,
    pub uri: Option<String>,
}

/// Arguments for `tal metadata show`.
pub struct ShowArgs {
    pub agent_id: Option<String>,
}

// ===========================================================================
// Entry Points
// ===========================================================================

pub fn run_set(args: SetArgs, config: &str, verbose: bool) -> Result<()> {
    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(run_set_async(args, config, verbose))
}

pub fn run_show(args: ShowArgs, _config: &str, verbose: bool) -> Result<()> {
    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(run_show_async(args, verbose))
}

// ===========================================================================
// `tal metadata set`
// ===========================================================================

async fn run_set_async(args: SetArgs, _config: &str, verbose: bool) -> Result<()> {
    println!(
        "{} tal metadata set — Set Agent Metadata",
        "●".cyan().bold()
    );
    println!();

    // ===================================================================
    // Step 1: Resolve agent ID
    // ===================================================================
    println!("{}", "[1/3] Resolving agent".bold());

    let agent_id_str = args
        .agent_id
        .or_else(|| resolve_env("AGENT_ID"))
        .with_context(|| {
            "No agent ID provided. Use --agent-id or set AGENT_ID in .env"
        })?;

    let agent_id = parse_bytes32(&agent_id_str)
        .with_context(|| format!("Invalid agent ID: {}. Expected 0x-prefixed 32-byte hex.", agent_id_str))?;
    println!("  Agent ID: 0x{}", hex::encode(agent_id));
    println!("  {} Agent ID resolved", "✓".green());
    println!();

    // ===================================================================
    // Step 2: Generate or skip metadata JSON
    // ===================================================================
    println!("{}", "[2/3] Preparing metadata".bold());

    let final_uri: Option<String>;

    if let Some(ref uri) = args.uri {
        // URI provided directly — skip JSON generation
        println!("  Using provided URI: {}", uri);
        println!("  {} Skipping JSON generation", "ℹ".blue());
        final_uri = Some(uri.clone());
    } else {
        // Build metadata JSON from flags
        let has_any_field = args.name.is_some()
            || args.description.is_some()
            || args.strategy.is_some()
            || args.tags.is_some()
            || args.website.is_some()
            || args.twitter.is_some();

        if !has_any_field {
            println!(
                "  {} No metadata fields provided. Use --name, --description, --strategy, etc.",
                "⚠".yellow()
            );
            println!();
            println!("  Usage examples:");
            println!("    tal metadata set --name \"My Agent\" --description \"A yield optimizer\"");
            println!("    tal metadata set --uri https://example.com/metadata.json");
            return Ok(());
        }

        let tags = args.tags.map(|t| {
            t.split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect::<Vec<String>>()
        });

        let metadata = AgentMetadata {
            name: args.name,
            description: args.description,
            strategy: args.strategy,
            tags,
            website: args.website,
            twitter: args.twitter,
        };

        let json = serde_json::to_string_pretty(&metadata)
            .context("Failed to serialize metadata JSON")?;

        // Save locally
        std::fs::write("metadata.json", &json)
            .context("Failed to write metadata.json")?;

        println!("  {} Saved metadata.json", "✓".green());
        println!();
        println!("  Generated JSON:");
        println!("  {}", "─".repeat(50));
        for line in json.lines() {
            println!("  {}", line);
        }
        println!("  {}", "─".repeat(50));
        println!();

        // No upload target — instruct user
        println!(
            "  {} No --uri provided. Host metadata.json and set the URI on-chain:",
            "ℹ".yellow()
        );
        println!();
        println!(
            "    tal metadata set --uri <url-to-hosted-metadata.json>"
        );
        println!();

        final_uri = None;
    }

    // ===================================================================
    // Step 3: Set URI on-chain (only if we have a URI)
    // ===================================================================
    if let Some(uri) = final_uri {
        println!("{}", "[3/3] Setting metadata URI on-chain".bold());

        let chain_id = resolve_env("CHAIN_ID")
            .and_then(|s| s.parse().ok())
            .unwrap_or(999u64);
        let chain = get_chain_config(chain_id)?;

        let rpc_url = resolve_env("RPC_URL")
            .or_else(|| {
                if !chain.rpc_url.is_empty() {
                    Some(chain.rpc_url.to_string())
                } else {
                    None
                }
            })
            .with_context(|| "RPC_URL not set. Add to .env or environment.")?;

        if verbose {
            println!("  RPC: {}", rpc_url);
            println!("  Chain: {} ({})", chain.name, chain.chain_id);
        }

        let private_key = resolve_private_key("PRIVATE_KEY")?;
        let provider = build_provider(&rpc_url, &private_key)?;

        println!("  URI: {}", uri);
        println!("  Registry: {}", chain.agent_registry);

        let tx_data = IAgentRegistry::setMetadataURICall {
            agentId: agent_id,
            uri: uri.clone(),
        }
        .abi_encode();

        let result = send_tx(
            &provider,
            Some(chain.agent_registry),
            tx_data,
            U256::ZERO,
            None,
        )
        .await?;

        println!(
            "  {} Metadata URI set on-chain (tx: {:?}, gas: {})",
            "✓".green(),
            result.tx_hash,
            result.gas_used
        );
        println!();
        println!(
            "  {} Metadata is now live! View it with:",
            "✓".green().bold()
        );
        println!(
            "    tal metadata show {}",
            agent_id_str
        );
    } else {
        println!("{}", "[3/3] Skipped — no URI to set on-chain".dimmed());
    }

    println!();
    Ok(())
}

// ===========================================================================
// `tal metadata show`
// ===========================================================================

async fn run_show_async(args: ShowArgs, verbose: bool) -> Result<()> {
    println!(
        "{} tal metadata show — View Agent Metadata",
        "●".cyan().bold()
    );
    println!();

    // ===================================================================
    // Step 1: Resolve agent ID
    // ===================================================================
    println!("{}", "[1/2] Resolving agent".bold());

    let agent_id_str = args
        .agent_id
        .or_else(|| resolve_env("AGENT_ID"))
        .with_context(|| {
            "No agent ID provided. Use a positional argument or set AGENT_ID in .env"
        })?;

    let agent_id = parse_bytes32(&agent_id_str)
        .with_context(|| format!("Invalid agent ID: {}. Expected 0x-prefixed 32-byte hex.", agent_id_str))?;
    println!("  Agent ID: 0x{}", hex::encode(agent_id));

    // ===================================================================
    // Step 2: Fetch metadata URI from chain
    // ===================================================================
    println!("{}", "[2/2] Fetching metadata".bold());

    let chain_id = resolve_env("CHAIN_ID")
        .and_then(|s| s.parse().ok())
        .unwrap_or(999u64);
    let chain = get_chain_config(chain_id)?;

    let rpc_url = resolve_env("RPC_URL")
        .or_else(|| {
            if !chain.rpc_url.is_empty() {
                Some(chain.rpc_url.to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| "https://rpc.hyperliquid.xyz/evm".to_string());

    if verbose {
        println!("  RPC: {}", rpc_url);
        println!("  Chain: {} ({})", chain.name, chain.chain_id);
    }

    let provider = build_read_provider(&rpc_url)?;
    let registry = IAgentRegistry::new(chain.agent_registry, &provider);

    let metadata_uri = registry
        .getMetadataURI(agent_id)
        .call()
        .await
        .with_context(|| "Failed to query AgentRegistry.getMetadataURI()")?;

    let uri = &metadata_uri._0;

    if uri.is_empty() {
        println!(
            "  {} No metadata set for agent 0x{}",
            "ℹ".yellow(),
            hex::encode(agent_id)
        );
        println!();
        println!("  Set metadata with:");
        println!(
            "    tal metadata set --name \"My Agent\" --description \"...\""
        );
        return Ok(());
    }

    println!("  Metadata URI: {}", uri);

    // Fetch and pretty-print the JSON
    match reqwest::get(uri).await {
        Ok(resp) if resp.status().is_success() => {
            match resp.json::<serde_json::Value>().await {
                Ok(json) => {
                    let pretty = serde_json::to_string_pretty(&json)
                        .unwrap_or_else(|_| format!("{:?}", json));
                    println!("  {} Metadata fetched", "✓".green());
                    println!();
                    println!("  {}", "─".repeat(50));
                    for line in pretty.lines() {
                        println!("  {}", line);
                    }
                    println!("  {}", "─".repeat(50));
                }
                Err(e) => {
                    println!(
                        "  {} Failed to parse metadata JSON: {}",
                        "⚠".yellow(),
                        e
                    );
                    println!("  URI returned non-JSON content. Check the URL manually.");
                }
            }
        }
        Ok(resp) => {
            println!(
                "  {} Metadata fetch returned HTTP {}",
                "⚠".yellow(),
                resp.status()
            );
        }
        Err(e) => {
            println!("  {} Failed to fetch metadata: {}", "⚠".yellow(), e);
            println!("  URI: {}", uri);
        }
    }

    println!();
    Ok(())
}
