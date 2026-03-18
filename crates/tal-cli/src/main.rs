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

        // Update dist/agent-pack.json with computed values
        if let Err(e) = update_manifest_from_build(&agent_name, &methods_crate, verbose) {
            println!(
                "  {} Could not auto-update manifest: {}",
                "⚠".yellow(),
                e
            );
            println!("    Update dist/agent-pack.json manually with IMAGE_ID and AGENT_CODE_HASH.");
        }
    }

    Ok(())
}

/// After a successful ELF build, parse the generated methods.rs to extract
/// IMAGE_ID and update dist/agent-pack.json automatically.
fn update_manifest_from_build(
    agent_name: &str,
    methods_crate: &str,
    verbose: bool,
) -> anyhow::Result<()> {
    use colored::Colorize;

    let manifest_path = "dist/agent-pack.json";
    if !std::path::Path::new(manifest_path).exists() {
        // Create dist/ and a skeleton manifest
        std::fs::create_dir_all("dist")?;
        let skeleton = format!(
            r#"{{"format_version":"1","agent_name":"{}","agent_version":"0.1.0","agent_id":"0x0","protocol_version":1,"kernel_version":1,"agent_code_hash":"","image_id":"","artifacts":{{"elf_path":"","elf_sha256":""}}}}"#,
            agent_name
        );
        std::fs::write(manifest_path, &skeleton)?;
    }

    // Find the generated methods.rs in the build output
    let build_dir = format!("target/release/build/{}-", methods_crate);
    let mut methods_rs_path = None;

    if let Ok(entries) = std::fs::read_dir("target/release/build") {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(&format!("{}-", methods_crate)) {
                let candidate = entry.path().join("out/methods.rs");
                if candidate.exists() {
                    methods_rs_path = Some(candidate);
                    break;
                }
            }
        }
    }

    let methods_rs = methods_rs_path
        .ok_or_else(|| anyhow::anyhow!("Cannot find generated methods.rs in target/release/build/"))?;

    let content = std::fs::read_to_string(&methods_rs)?;

    // Parse IMAGE_ID: `pub const ..._ID: [u32; 8] = [n1, n2, ..., n8];`
    let image_id_hex = if let Some(id_line) = content.lines().find(|l| l.contains("_ID: [u32; 8]")) {
        let bracket_start = id_line.find('[').and_then(|i| id_line[i+1..].find('[').map(|j| i + 1 + j));
        if let Some(start) = bracket_start {
            let end = id_line[start..].find(']').map(|e| start + e).unwrap_or(id_line.len());
            let nums: Vec<u32> = id_line[start+1..end]
                .split(',')
                .filter_map(|s| s.trim().parse().ok())
                .collect();
            if nums.len() == 8 {
                // Convert [u32; 8] to bytes32 hex (little-endian per u32)
                let mut bytes = Vec::with_capacity(32);
                for n in &nums {
                    bytes.extend_from_slice(&n.to_le_bytes());
                }
                format!("0x{}", hex::encode(&bytes))
            } else {
                anyhow::bail!("Cannot parse IMAGE_ID array from methods.rs");
            }
        } else {
            anyhow::bail!("Cannot find IMAGE_ID array brackets in methods.rs");
        }
    } else {
        anyhow::bail!("No _ID: [u32; 8] found in methods.rs");
    };

    // Compute AGENT_CODE_HASH from source
    let agent_lib = std::path::Path::new("agent/src/lib.rs");
    let agent_cargo = std::path::Path::new("agent/Cargo.toml");
    let agent_code_hash = if agent_lib.exists() && agent_cargo.exists() {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(std::fs::read(agent_lib)?);
        hasher.update([0x00]);
        hasher.update(std::fs::read(agent_cargo)?);
        let hash: [u8; 32] = hasher.finalize().into();
        format!("0x{}", hex::encode(hash))
    } else {
        anyhow::bail!("Cannot find agent/src/lib.rs or agent/Cargo.toml");
    };

    // Find the ELF path from methods.rs
    let elf_sha256 = if let Some(path_line) = content.lines().find(|l| l.contains("_PATH: &str")) {
        if let Some(start) = path_line.find('"') {
            if let Some(end) = path_line[start+1..].find('"') {
                let elf_path = &path_line[start+1..start+1+end];
                if std::path::Path::new(elf_path).exists() {
                    use sha2::{Digest, Sha256};
                    let elf_bytes = std::fs::read(elf_path)?;
                    let hash: [u8; 32] = Sha256::digest(&elf_bytes).into();
                    format!("0x{}", hex::encode(hash))
                } else {
                    "unknown".to_string()
                }
            } else { "unknown".to_string() }
        } else { "unknown".to_string() }
    } else { "unknown".to_string() };

    // Update the manifest
    let manifest_content = std::fs::read_to_string(manifest_path)?;
    let mut manifest: serde_json::Value = serde_json::from_str(&manifest_content)?;

    manifest["image_id"] = serde_json::Value::String(image_id_hex.clone());
    manifest["agent_code_hash"] = serde_json::Value::String(agent_code_hash.clone());
    if let Some(artifacts) = manifest.get_mut("artifacts") {
        artifacts["elf_sha256"] = serde_json::Value::String(elf_sha256);
    }

    std::fs::write(manifest_path, serde_json::to_string_pretty(&manifest)?)?;

    println!();
    println!("{} Updated dist/agent-pack.json", "●".cyan());
    println!("  IMAGE_ID:        {}", &image_id_hex[..18]);
    println!("  AGENT_CODE_HASH: {}", &agent_code_hash[..18]);

    if verbose {
        println!("  IMAGE_ID (full):        {}", image_id_hex);
        println!("  AGENT_CODE_HASH (full): {}", agent_code_hash);
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
