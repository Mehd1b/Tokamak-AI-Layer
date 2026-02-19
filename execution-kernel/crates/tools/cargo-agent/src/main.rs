//! `cargo agent` — Cargo subcommand for Execution Kernel agent development.
//!
//! # Installation
//!
//! ```bash
//! cargo install --path crates/tools/cargo-agent
//! ```
//!
//! # Usage
//!
//! ```bash
//! cargo agent new my-agent                    # Scaffold a new agent
//! cargo agent new my-agent --template yield   # With yield template
//! cargo agent build my-agent                  # Build agent crate
//! cargo agent test my-agent                   # Run agent tests
//! cargo agent pack my-agent                   # Create distributable bundle
//! ```

use agent_pack::{parse_hex_32, scaffold, ScaffoldOptions, TemplateType};
use clap::{Parser, Subcommand};
use std::path::PathBuf;
use std::process::{Command, ExitCode};

/// Cargo subcommand for Execution Kernel agent development.
///
/// When invoked as `cargo agent`, cargo passes "agent" as the first argument,
/// so we use a hidden subcommand to consume it.
#[derive(Parser)]
#[command(
    name = "cargo-agent",
    bin_name = "cargo",
    about = "Execution Kernel agent development toolkit"
)]
struct Cli {
    #[command(subcommand)]
    command: CargoSubcommand,
}

#[derive(Subcommand)]
enum CargoSubcommand {
    /// Agent development commands
    Agent {
        #[command(subcommand)]
        command: AgentCommand,
    },
}

#[derive(Subcommand)]
enum AgentCommand {
    /// Create a new agent project
    New {
        /// Agent name (e.g., "my-yield-agent")
        name: String,

        /// Template: minimal | yield
        #[arg(long, default_value = "minimal")]
        template: String,

        /// Output directory (defaults to crates/agents/<name>)
        #[arg(long, short)]
        out: Option<PathBuf>,

        /// Pre-set agent ID (64-char hex with 0x prefix)
        #[arg(
            long,
            default_value = "0x0000000000000000000000000000000000000000000000000000000000000000"
        )]
        agent_id: String,

        /// Skip git init
        #[arg(long)]
        no_git: bool,
    },

    /// Build an agent crate
    Build {
        /// Agent name (must exist in crates/agents/)
        name: String,

        /// Build in release mode
        #[arg(long)]
        release: bool,
    },

    /// Run agent tests
    Test {
        /// Agent name (must exist in crates/agents/)
        name: String,

        /// Extra arguments passed to cargo test
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Create a distributable bundle (wraps agent-pack pack)
    Pack {
        /// Agent name (must exist in crates/agents/)
        name: String,

        /// Agent version for the manifest
        #[arg(long, default_value = "0.1.0")]
        version: String,
    },

    /// List all agents in crates/agents/
    List,
}

fn main() -> ExitCode {
    let cli = Cli::parse();

    let CargoSubcommand::Agent { command } = cli.command;

    match command {
        AgentCommand::New {
            name,
            template,
            out,
            agent_id,
            no_git,
        } => cmd_new(name, template, out, agent_id, no_git),
        AgentCommand::Build { name, release } => cmd_build(name, release),
        AgentCommand::Test { name, args } => cmd_test(name, args),
        AgentCommand::Pack { name, version } => cmd_pack(name, version),
        AgentCommand::List => cmd_list(),
    }
}

// ============================================================================
// Commands
// ============================================================================

fn cmd_new(
    name: String,
    template: String,
    out: Option<PathBuf>,
    agent_id: String,
    no_git: bool,
) -> ExitCode {
    let template_type = match TemplateType::parse(&template) {
        Some(t) => t,
        None => {
            eprintln!("Error: unknown template '{}' — use 'minimal' or 'yield'", template);
            return ExitCode::FAILURE;
        }
    };

    let agent_id_bytes = match parse_agent_id(&agent_id) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("Error: invalid agent_id: {}", e);
            return ExitCode::FAILURE;
        }
    };

    // Default output: crates/agents/<name>
    let output_dir = out.unwrap_or_else(|| {
        find_workspace_root()
            .map(|root| root.join("crates/agents").join(&name))
            .unwrap_or_else(|| PathBuf::from(&name))
    });

    let options = ScaffoldOptions {
        name: name.clone(),
        agent_id: agent_id_bytes,
        output_dir: output_dir.clone(),
        template: template_type,
        init_git: !no_git,
    };

    match scaffold(&options) {
        Ok(result) => {
            println!("Created agent '{}' at {}/", name, result.project_dir.display());
            println!();
            println!("  agent/src/lib.rs    — agent logic");
            println!("  tests/src/lib.rs    — test suite");
            println!("  dist/agent-pack.json — manifest");
            if result.git_initialized {
                println!("  .git/               — initialized");
            }
            println!();

            // Try to register in workspace Cargo.toml
            if let Some(root) = find_workspace_root() {
                let agent_rel = pathdiff(&output_dir.join("agent"), &root);
                let tests_rel = pathdiff(&output_dir.join("tests"), &root);
                println!("Add to your workspace Cargo.toml:");
                println!(
                    "  \"{}\"",
                    agent_rel.unwrap_or_else(|| output_dir.join("agent"))
                        .display()
                );
                println!(
                    "  \"{}\"",
                    tests_rel.unwrap_or_else(|| output_dir.join("tests"))
                        .display()
                );
            }

            println!();
            println!("Next steps:");
            println!("  cargo agent build {}      — build the agent", name);
            println!("  cargo agent test {}       — run tests", name);

            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("Error: {}", e);
            ExitCode::FAILURE
        }
    }
}

fn cmd_build(name: String, release: bool) -> ExitCode {
    let agent_dir = match resolve_agent_dir(&name) {
        Some(d) => d,
        None => {
            eprintln!("Error: agent '{}' not found in crates/agents/", name);
            eprintln!("Run 'cargo agent list' to see available agents.");
            return ExitCode::FAILURE;
        }
    };

    let agent_crate = agent_dir.join("agent");
    if !agent_crate.exists() {
        eprintln!(
            "Error: agent crate not found at {}",
            agent_crate.display()
        );
        return ExitCode::FAILURE;
    }

    let mut cmd = Command::new("cargo");
    cmd.arg("build").arg("-p").arg(&name);
    if release {
        cmd.arg("--release");
    }

    // Run from workspace root if possible
    if let Some(root) = find_workspace_root() {
        cmd.current_dir(&root);
    }

    println!("Building agent '{}'...", name);
    match cmd.status() {
        Ok(status) if status.success() => {
            println!("Build successful.");
            ExitCode::SUCCESS
        }
        Ok(status) => ExitCode::from(status.code().unwrap_or(1) as u8),
        Err(e) => {
            eprintln!("Error: failed to run cargo: {}", e);
            ExitCode::FAILURE
        }
    }
}

fn cmd_test(name: String, extra_args: Vec<String>) -> ExitCode {
    let agent_dir = match resolve_agent_dir(&name) {
        Some(d) => d,
        None => {
            eprintln!("Error: agent '{}' not found in crates/agents/", name);
            eprintln!("Run 'cargo agent list' to see available agents.");
            return ExitCode::FAILURE;
        }
    };

    let agent_crate = agent_dir.join("agent");
    if !agent_crate.exists() {
        eprintln!("Error: agent crate not found at {}", agent_crate.display());
        return ExitCode::FAILURE;
    }

    let mut cmd = Command::new("cargo");
    cmd.arg("test").arg("-p").arg(&name);

    // Pass any extra arguments
    for arg in &extra_args {
        cmd.arg(arg);
    }

    if let Some(root) = find_workspace_root() {
        cmd.current_dir(&root);
    }

    println!("Testing agent '{}'...", name);
    match cmd.status() {
        Ok(status) if status.success() => ExitCode::SUCCESS,
        Ok(status) => ExitCode::from(status.code().unwrap_or(1) as u8),
        Err(e) => {
            eprintln!("Error: failed to run cargo: {}", e);
            ExitCode::FAILURE
        }
    }
}

fn cmd_pack(name: String, version: String) -> ExitCode {
    let agent_dir = match resolve_agent_dir(&name) {
        Some(d) => d,
        None => {
            eprintln!("Error: agent '{}' not found in crates/agents/", name);
            return ExitCode::FAILURE;
        }
    };

    let manifest_path = agent_dir.join("dist/agent-pack.json");
    if !manifest_path.exists() {
        eprintln!(
            "Error: manifest not found at {}",
            manifest_path.display()
        );
        eprintln!("Run 'cargo agent new' to create the agent with a manifest.");
        return ExitCode::FAILURE;
    }

    // Delegate to agent-pack CLI
    let mut cmd = Command::new("agent-pack");
    cmd.args([
        "verify",
        "--manifest",
        &manifest_path.to_string_lossy(),
        "--structure-only",
    ]);

    println!("Verifying agent '{}' v{}...", name, version);
    match cmd.status() {
        Ok(status) if status.success() => {
            println!("Manifest verified.");
            println!();
            println!("To create a full bundle with ELF:");
            println!(
                "  agent-pack pack --manifest {} --elf <path-to-elf> --out {}/dist/bundle",
                manifest_path.display(),
                agent_dir.display()
            );
            ExitCode::SUCCESS
        }
        Ok(_) => {
            eprintln!("Manifest verification failed.");
            ExitCode::FAILURE
        }
        Err(_) => {
            // agent-pack not installed, try cargo run
            eprintln!("'agent-pack' not found in PATH.");
            eprintln!("Install it with: cargo install --path crates/agent-pack");
            ExitCode::FAILURE
        }
    }
}

fn cmd_list() -> ExitCode {
    let agents_dir = match find_workspace_root() {
        Some(root) => root.join("crates/agents"),
        None => {
            eprintln!("Error: could not find workspace root (no Cargo.toml with [workspace])");
            return ExitCode::FAILURE;
        }
    };

    if !agents_dir.exists() {
        eprintln!("No agents directory at {}", agents_dir.display());
        return ExitCode::FAILURE;
    }

    let mut agents = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&agents_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && path.join("agent/src/lib.rs").exists() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    agents.push(name.to_string());
                }
            }
        }
    }

    agents.sort();

    if agents.is_empty() {
        println!("No agents found in crates/agents/.");
        println!("Create one with: cargo agent new my-agent");
    } else {
        println!("Agents ({}):", agents.len());
        for agent in &agents {
            println!("  {}", agent);
        }
    }

    ExitCode::SUCCESS
}

// ============================================================================
// Helpers
// ============================================================================

/// Find the workspace root by walking up from the current directory.
fn find_workspace_root() -> Option<PathBuf> {
    let mut dir = std::env::current_dir().ok()?;
    loop {
        let cargo_toml = dir.join("Cargo.toml");
        if cargo_toml.exists() {
            if let Ok(content) = std::fs::read_to_string(&cargo_toml) {
                if content.contains("[workspace]") {
                    return Some(dir);
                }
            }
        }
        if !dir.pop() {
            return None;
        }
    }
}

/// Resolve agent directory from name. Checks crates/agents/<name>.
fn resolve_agent_dir(name: &str) -> Option<PathBuf> {
    let root = find_workspace_root()?;
    let agent_dir = root.join("crates/agents").join(name);
    if agent_dir.exists() {
        Some(agent_dir)
    } else {
        None
    }
}

/// Parse agent ID from hex string.
fn parse_agent_id(s: &str) -> Result<[u8; 32], String> {
    parse_hex_32(s).map_err(|e| e.to_string())
}

/// Compute relative path from `base` to `target`.
fn pathdiff(target: &std::path::Path, base: &std::path::Path) -> Option<PathBuf> {
    let target = target.canonicalize().ok()?;
    let base = base.canonicalize().ok()?;

    let mut base_components = base.components().peekable();
    let mut target_components = target.components().peekable();

    // Skip common prefix
    while let (Some(b), Some(t)) = (base_components.peek(), target_components.peek()) {
        if b == t {
            base_components.next();
            target_components.next();
        } else {
            break;
        }
    }

    let mut result = PathBuf::new();
    for _ in base_components {
        result.push("..");
    }
    for component in target_components {
        result.push(component);
    }

    Some(result)
}
