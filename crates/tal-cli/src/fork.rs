//! `tal fork` — Fork an existing agent to create your own version.
//!
//! Resolves on-chain metadata for an agent, optionally clones its source
//! repository, and scaffolds a new agent project ready for customization.

use crate::onchain::{build_read_provider, get_chain_config, parse_bytes32, resolve_env};
use alloy::sol;
use anyhow::{Context, Result};
use colored::Colorize;
use std::process::Command;

// ===========================================================================
// Contract Interfaces
// ===========================================================================

sol! {
    #[sol(rpc)]
    interface IAgentRegistry {
        function getMetadataURI(bytes32 agentId) external view returns (string);
        function get(bytes32 agentId) external view returns (address author, bytes32 imageId, bytes32 agentCodeHash, string deprecated, bool exists);
    }
}

// ===========================================================================
// Metadata
// ===========================================================================

#[derive(serde::Deserialize, Debug)]
struct AgentMetadata {
    name: Option<String>,
    description: Option<String>,
    #[serde(rename = "sourceRepo")]
    source_repo: Option<String>,
    tags: Option<Vec<String>>,
    version: Option<String>,
}

// ===========================================================================
// Main Fork Entry Point
// ===========================================================================

pub fn run(
    agent_id: &str,
    name: Option<&str>,
    output: Option<&str>,
    config: &str,
    verbose: bool,
) -> anyhow::Result<()> {
    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(run_async(agent_id, name, output, config, verbose))
}

async fn run_async(
    agent_id_str: &str,
    name: Option<&str>,
    output: Option<&str>,
    _config: &str,
    verbose: bool,
) -> Result<()> {
    println!(
        "{} tal fork — Fork an Existing Agent",
        "●".cyan().bold()
    );
    println!();

    // ===================================================================
    // Step 1: Parse agent ID and connect to chain
    // ===================================================================
    println!("{}", "[1/4] Resolving agent on-chain".bold());

    let agent_id = parse_bytes32(agent_id_str)
        .with_context(|| format!("Invalid agent ID: {}. Expected 0x-prefixed 32-byte hex.", agent_id_str))?;
    println!("  Agent ID: 0x{}", hex::encode(agent_id));

    // Resolve RPC URL: env > chain config > default
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

    // Query agent existence
    let registry_addr = chain.agent_registry;
    let registry = IAgentRegistry::new(registry_addr, &provider);

    let agent_info = registry
        .get(agent_id)
        .call()
        .await
        .with_context(|| "Failed to query AgentRegistry.get()")?;

    if !agent_info.exists {
        anyhow::bail!(
            "Agent 0x{} not found on {} (registry: {})",
            hex::encode(agent_id),
            chain.name,
            registry_addr
        );
    }

    println!("  Author: {}", agent_info.author);
    println!("  Image ID: 0x{}...", &hex::encode(agent_info.imageId)[..16]);
    println!("  Code Hash: 0x{}...", &hex::encode(agent_info.agentCodeHash)[..16]);
    println!("  {} Agent found on-chain", "✓".green());
    println!();

    // ===================================================================
    // Step 2: Fetch metadata
    // ===================================================================
    println!("{}", "[2/4] Fetching metadata".bold());

    let metadata_uri = registry
        .getMetadataURI(agent_id)
        .call()
        .await
        .with_context(|| "Failed to query AgentRegistry.getMetadataURI()")?;

    let metadata_uri_str = &metadata_uri._0;

    let metadata: Option<AgentMetadata> = if metadata_uri_str.is_empty() {
        println!("  {} No metadata URI set for this agent", "ℹ".yellow());
        None
    } else {
        println!("  Metadata URI: {}", metadata_uri_str);

        match reqwest::get(metadata_uri_str).await {
            Ok(resp) if resp.status().is_success() => {
                match resp.json::<AgentMetadata>().await {
                    Ok(m) => {
                        if let Some(ref n) = m.name {
                            println!("  Name: {}", n);
                        }
                        if let Some(ref d) = m.description {
                            println!("  Description: {}", d);
                        }
                        if let Some(ref v) = m.version {
                            println!("  Version: {}", v);
                        }
                        if let Some(ref tags) = m.tags {
                            if !tags.is_empty() {
                                println!("  Tags: {}", tags.join(", "));
                            }
                        }
                        if let Some(ref repo) = m.source_repo {
                            println!("  Source repo: {}", repo);
                        }
                        println!("  {} Metadata fetched", "✓".green());
                        Some(m)
                    }
                    Err(e) => {
                        println!("  {} Failed to parse metadata JSON: {}", "⚠".yellow(), e);
                        None
                    }
                }
            }
            Ok(resp) => {
                println!(
                    "  {} Metadata fetch returned HTTP {}",
                    "⚠".yellow(),
                    resp.status()
                );
                None
            }
            Err(e) => {
                println!("  {} Failed to fetch metadata: {}", "⚠".yellow(), e);
                None
            }
        }
    };
    println!();

    // ===================================================================
    // Step 3: Clone or scaffold
    // ===================================================================
    println!("{}", "[3/4] Creating forked project".bold());

    let original_name = metadata
        .as_ref()
        .and_then(|m| m.name.as_deref())
        .unwrap_or("agent");
    let fork_name = name.unwrap_or_else(|| "").to_string();
    let fork_name = if fork_name.is_empty() {
        format!("{}-fork", original_name)
    } else {
        fork_name
    };

    let output_dir = output
        .map(|s| s.to_string())
        .unwrap_or_else(|| fork_name.clone());

    let source_repo = metadata.as_ref().and_then(|m| m.source_repo.clone());

    if let Some(repo_url) = source_repo {
        println!("  Cloning source repository: {}", repo_url);
        let status = Command::new("git")
            .args(["clone", "--depth", "1", &repo_url, &output_dir])
            .status()
            .context("Failed to run git clone. Is git installed?")?;

        if status.success() {
            // Remove .git directory so the fork starts fresh
            let git_dir = std::path::Path::new(&output_dir).join(".git");
            if git_dir.exists() {
                std::fs::remove_dir_all(&git_dir).ok();
            }
            println!("  {} Source cloned to {}/", "✓".green(), output_dir);
        } else {
            println!(
                "  {} git clone failed, falling back to template scaffold",
                "⚠".yellow()
            );
            scaffold_from_template(&fork_name, &output_dir, verbose)?;
        }
    } else {
        println!("  No source repository available, scaffolding from minimal template");
        scaffold_from_template(&fork_name, &output_dir, verbose)?;
    }
    println!();

    // ===================================================================
    // Step 4: Generate salt and print summary
    // ===================================================================
    println!("{}", "[4/4] Summary".bold());

    // Generate a deterministic salt from the fork name
    let fork_salt = {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(fork_name.as_bytes());
        hasher.update(b"fork-salt");
        let hash: [u8; 32] = hasher.finalize().into();
        format!("0x{}", hex::encode(hash))
    };

    println!("  Forked from: 0x{}...", &hex::encode(agent_id)[..16]);
    println!("  Project name: {}", fork_name);
    println!("  Output directory: {}/", output_dir);
    println!("  Suggested salt: {}...{}", &fork_salt[..10], &fork_salt[fork_salt.len()-6..]);
    println!();
    println!("  {} Agent forked successfully!", "✓".green().bold());
    println!();
    println!("  {} Next steps:", "→".cyan());
    println!("    1. cd {}", output_dir);
    println!("    2. Edit agent/src/lib.rs with your strategy");
    println!("    3. tal build --elf");
    println!("    4. tal deploy");
    if verbose {
        println!();
        println!("  Full salt: {}", fork_salt);
        println!("  Original author: {}", agent_info.author);
        println!("  Original image ID: 0x{}", hex::encode(agent_info.imageId));
    }

    Ok(())
}

/// Fall back to `tal init <name> --template minimal` when no source repo is available.
fn scaffold_from_template(name: &str, output_dir: &str, verbose: bool) -> Result<()> {
    // Try to invoke `tal init` as a subprocess first
    let status = Command::new("tal")
        .args(["init", name, "--template", "minimal", "--output", output_dir, "--no-interactive"])
        .status();

    match status {
        Ok(s) if s.success() => {
            println!("  {} Scaffolded from minimal template", "✓".green());
            Ok(())
        }
        _ => {
            // If `tal` binary not available (e.g., running via cargo run), use init module directly
            if verbose {
                println!("  tal binary not found, using init module directly");
            }
            crate::init::run(name, "minimal", Some(output_dir), false, verbose)?;
            Ok(())
        }
    }
}
