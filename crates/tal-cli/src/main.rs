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

    let agent_name = agent.unwrap_or(".");

    // Build the agent crate
    println!("{} Building agent crate...", "●".cyan());
    let mut cmd = Command::new("cargo");
    cmd.args(["build", "--release", "-p", agent_name]);
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
            "  {} Use the .bin file (NOT raw ELF) when creating bundles:",
            "⚠".yellow()
        );
        println!(
            "    target/riscv-guest/{}/zkvm-guest/riscv32im-risc0-zkvm-elf/release/zkvm-guest.bin",
            methods_crate
        );
    }

    Ok(())
}
