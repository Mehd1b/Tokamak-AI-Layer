//! `tal` — Unified CLI for the Tokamak AI Layer.
//!
//! Commands:
//!   tal init <name> [--template <template>]   — Scaffold a new agent project
//!   tal doctor                                 — Validate toolchain and configuration
//!   tal test [--local|--dry-run|--prove]       — Test agent logic
//!   tal build [--elf]                          — Build agent and/or ELF binary
//!   tal deploy [--testnet]                     — Deploy agent + vault on-chain
//!   tal monitor --vault <addr>                 — Live execution dashboard

mod deploy;
mod doctor;
mod init;
mod monitor;
mod onchain;
mod test_cmd;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(
    name = "tal",
    about = "Tokamak AI Layer CLI — scaffold, validate, test, and deploy verifiable agents",
    version
)]
struct Cli {
    /// Enable verbose output
    #[arg(short, long, global = true)]
    verbose: bool,

    /// Path to .env configuration file
    #[arg(long, global = true, default_value = ".env")]
    config: String,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Scaffold a new agent project from a template
    Init {
        /// Agent project name (e.g., "my-trading-agent")
        name: String,

        /// Template to use: minimal, yield, perp-trader
        #[arg(short, long, default_value = "minimal")]
        template: String,

        /// Output directory (defaults to crates/agents/<name>)
        #[arg(short, long)]
        output: Option<String>,

        /// Skip interactive prompts
        #[arg(long)]
        no_interactive: bool,
    },

    /// Validate toolchain, configuration, and on-chain state
    Doctor {
        /// Attempt to install missing dependencies
        #[arg(long)]
        install: bool,

        /// Limit on-chain checks to a specific chain ID
        #[arg(long)]
        chain: Option<u64>,

        /// Path to agent project directory
        #[arg(short, long)]
        path: Option<String>,
    },

    /// Test agent logic locally or with full proving
    Test {
        /// Run agent natively without zkVM (instant feedback)
        #[arg(long)]
        local: bool,

        /// Run with live data but no proof generation or submission
        #[arg(long)]
        dry_run: bool,

        /// Generate a full ZK proof
        #[arg(long)]
        prove: bool,

        /// Input fixture file (JSON)
        #[arg(short, long)]
        input: Option<String>,

        /// Run twice and verify deterministic output
        #[arg(long)]
        determinism_check: bool,

        /// Generate a fixture from live market data
        #[arg(long)]
        generate_fixture: bool,

        /// Agent name or path
        #[arg(short, long)]
        agent: Option<String>,
    },

    /// Build agent crate and/or ELF binary
    Build {
        /// Also build the zkVM ELF binary (requires RISC Zero toolchain)
        #[arg(long)]
        elf: bool,

        /// Agent name or path
        #[arg(short, long)]
        agent: Option<String>,
    },

    /// Deploy agent registration and vault on-chain
    Deploy {
        /// Deploy to testnet instead of mainnet
        #[arg(long)]
        testnet: bool,

        /// Run only a specific step: register, vault
        #[arg(long)]
        step: Option<String>,

        /// Agent name or path
        #[arg(short, long)]
        agent: Option<String>,
    },

    /// Live agent execution dashboard
    Monitor {
        /// Vault contract address to monitor
        #[arg(long)]
        vault: String,

        /// Poll interval in seconds
        #[arg(long, default_value = "30")]
        interval: u64,

        /// Chain ID (default: 999)
        #[arg(long)]
        chain: Option<u64>,

        /// Output as JSON (one object per poll, for piping to jq/logs)
        #[arg(long)]
        json: bool,
    },
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Init {
            name,
            template,
            output,
            no_interactive,
        } => init::run(
            &name,
            &template,
            output.as_deref(),
            !no_interactive,
            cli.verbose,
        ),

        Commands::Doctor {
            install,
            chain,
            path,
        } => doctor::run(install, chain, path.as_deref(), &cli.config, cli.verbose),

        Commands::Test {
            local,
            dry_run,
            prove,
            input,
            determinism_check,
            generate_fixture,
            agent,
        } => test_cmd::run(
            local,
            dry_run,
            prove,
            input.as_deref(),
            determinism_check,
            generate_fixture,
            agent.as_deref(),
            cli.verbose,
        ),

        Commands::Build { elf, agent } => build_agent(elf, agent.as_deref(), cli.verbose),

        Commands::Deploy {
            testnet,
            step,
            agent,
        } => deploy::run(
            testnet,
            step.as_deref(),
            agent.as_deref(),
            &cli.config,
            cli.verbose,
        ),

        Commands::Monitor {
            vault,
            interval,
            chain,
            json,
        } => monitor::run(&vault, interval, chain, json, cli.verbose),
    }
}

/// Build the agent crate and optionally the ELF binary.
fn build_agent(elf: bool, agent: Option<&str>, verbose: bool) -> anyhow::Result<()> {
    use colored::Colorize;
    use std::process::Command;

    let agent_name = match agent {
        Some(name) => name.to_string(),
        None => resolve_agent_name_from_cwd()?,
    };

    // Build the agent crate
    println!("{} Building agent crate...", "●".cyan());
    let mut cmd = Command::new("cargo");
    cmd.args(["build", "--release", "-p", &agent_name]);
    if verbose {
        println!("  Running: {:?}", cmd);
    }
    let status = cmd.status()?;
    if !status.success() {
        anyhow::bail!("Agent build failed");
    }
    println!("  {} Agent crate built successfully", "✓".green());

    if elf {
        let methods_crate = format!("{}-risc0-methods", agent_name);
        println!("{} Building zkVM ELF binary...", "●".cyan());
        println!(
            "  {} This may take 5-10 minutes on first build",
            "ℹ".blue()
        );

        // Clean stale riscv-guest target first
        let target_dir = format!("target/riscv-guest/{}", methods_crate);
        if std::path::Path::new(&target_dir).exists() {
            println!("  Cleaning stale riscv-guest target...");
            std::fs::remove_dir_all(&target_dir)?;
        }

        let mut cmd = Command::new("cargo");
        cmd.args(["build", "--release", "-p", &methods_crate]);
        let status = cmd.status()?;
        if !status.success() {
            anyhow::bail!(
                "ELF build failed. Is the RISC Zero toolchain installed? Run: tal doctor"
            );
        }
        println!("  {} ELF binary built successfully", "✓".green());
        println!();
        println!(
            "  {} Use the .bin file (NOT raw ELF) when creating bundles.",
            "⚠".yellow()
        );
        println!("    Check target/riscv-guest/{}/", methods_crate);
    }

    Ok(())
}

/// Resolve the agent crate name from the current directory structure.
fn resolve_agent_name_from_cwd() -> anyhow::Result<String> {
    let cwd = std::env::current_dir()?;

    // Check if we're in a project root with agent/ subdirectory
    if cwd.join("agent/src/lib.rs").exists() {
        // Read the agent's Cargo.toml to get the package name
        let agent_cargo = cwd.join("agent/Cargo.toml");
        if let Ok(content) = std::fs::read_to_string(&agent_cargo) {
            for line in content.lines() {
                if let Some(name) = line.strip_prefix("name = \"") {
                    if let Some(name) = name.strip_suffix('"') {
                        return Ok(name.to_string());
                    }
                }
            }
        }
        // Fall back to directory name
        if let Some(name) = cwd.file_name() {
            return Ok(name.to_string_lossy().to_string());
        }
    }

    // Check if we're in the agent/ subdirectory itself
    if cwd.join("src/lib.rs").exists() {
        let cargo_toml = cwd.join("Cargo.toml");
        if let Ok(content) = std::fs::read_to_string(&cargo_toml) {
            for line in content.lines() {
                if let Some(name) = line.strip_prefix("name = \"") {
                    if let Some(name) = name.strip_suffix('"') {
                        return Ok(name.to_string());
                    }
                }
            }
        }
    }

    // Try reading the workspace Cargo.toml for the first member
    let cargo_toml = cwd.join("Cargo.toml");
    if let Ok(content) = std::fs::read_to_string(&cargo_toml) {
        if content.contains("[workspace]") {
            // Parse first member that looks like an agent crate
            for line in content.lines() {
                let trimmed = line.trim().trim_matches(',').trim_matches('"');
                if trimmed == "agent" {
                    // Read agent/Cargo.toml
                    if let Ok(agent_content) = std::fs::read_to_string(cwd.join("agent/Cargo.toml")) {
                        for aline in agent_content.lines() {
                            if let Some(name) = aline.strip_prefix("name = \"") {
                                if let Some(name) = name.strip_suffix('"') {
                                    return Ok(name.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    anyhow::bail!(
        "Cannot determine agent name. Use --agent <name> or run from an agent project directory."
    )
}
