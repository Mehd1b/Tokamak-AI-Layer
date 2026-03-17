//! `tal doctor` — Pre-flight configuration validator.
//!
//! Validates the entire development stack before expensive operations:
//! - Toolchain: Rust, RISC Zero, Foundry, Node.js
//! - Build state: ELF staleness, IMAGE_ID consistency
//! - Configuration: .env, RPC URLs, addresses
//! - On-chain state: agent registration, vault, balances (future)

use anyhow::Result;
use colored::Colorize;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Result of a single diagnostic check.
struct CheckResult {
    passed: bool,
    label: String,
    detail: Option<String>,
    fix: Option<String>,
}

impl CheckResult {
    fn pass(label: impl Into<String>, detail: impl Into<String>) -> Self {
        Self {
            passed: true,
            label: label.into(),
            detail: Some(detail.into()),
            fix: None,
        }
    }

    fn fail(label: impl Into<String>, detail: impl Into<String>, fix: impl Into<String>) -> Self {
        Self {
            passed: false,
            label: label.into(),
            detail: Some(detail.into()),
            fix: Some(fix.into()),
        }
    }

    fn print(&self) {
        if self.passed {
            print!("  {} {}", "✓".green(), self.label);
            if let Some(ref detail) = self.detail {
                print!(" ({})", detail.dimmed());
            }
            println!();
        } else {
            print!("  {} {}", "✗".red(), self.label.red());
            println!();
            if let Some(ref detail) = self.detail {
                println!("    {}", detail);
            }
            if let Some(ref fix) = self.fix {
                println!("    {} {}", "→".yellow(), fix);
            }
        }
    }
}

pub fn run(
    install: bool,
    _chain: Option<u64>,
    agent_path: Option<&str>,
    config_path: &str,
    _verbose: bool,
) -> Result<()> {
    println!("{}", "tal doctor — Pre-flight Configuration Validator".bold());
    println!();

    let mut total = 0;
    let mut passed = 0;
    let mut failed = 0;

    // =======================================================================
    // Toolchain Checks
    // =======================================================================
    println!("{}", "Toolchain".bold().underline());

    let checks = vec![
        check_rust(install),
        check_risc_zero(install),
        check_foundry(install),
        check_node(),
    ];

    for check in &checks {
        check.print();
        total += 1;
        if check.passed {
            passed += 1;
        } else {
            failed += 1;
        }
    }
    println!();

    // =======================================================================
    // Build Checks (only if inside an agent project or workspace)
    // =======================================================================
    let agent_dir = agent_path.map(PathBuf::from).unwrap_or_else(|| {
        std::env::current_dir().unwrap_or_default()
    });

    let has_agent = agent_dir.join("agent/src/lib.rs").exists()
        || agent_dir.join("src/lib.rs").exists();
    let has_workspace = find_workspace_root_from(&agent_dir).is_ok();

    if has_agent || has_workspace {
        println!("{}", "Build State".bold().underline());

        let mut build_checks = vec![
            check_agent_crate(&agent_dir),
            check_elf_staleness(&agent_dir),
        ];

        if has_workspace {
            build_checks.push(check_workspace_membership(&agent_dir));
        }

        for check in &build_checks {
            check.print();
            total += 1;
            if check.passed {
                passed += 1;
            } else {
                failed += 1;
            }
        }
        println!();
    } else {
        println!("{}", "Build State".bold().underline());
        println!(
            "  {} Not inside an agent project or workspace — skipping build checks",
            "ℹ".blue()
        );
        println!("    Run {} to scaffold a new agent", "tal init <name>".bold());
        println!();
    }

    // =======================================================================
    // Configuration Checks
    // =======================================================================
    println!("{}", "Configuration".bold().underline());

    let config_checks = vec![
        check_env_file(config_path),
        check_env_variables(config_path),
    ];

    for check in &config_checks {
        check.print();
        total += 1;
        if check.passed {
            passed += 1;
        } else {
            failed += 1;
        }
    }
    println!();

    // =======================================================================
    // Summary
    // =======================================================================
    println!("{}", "Summary".bold().underline());
    if failed == 0 {
        println!(
            "  {} All {} checks passed — ready to build and deploy!",
            "✓".green().bold(),
            total
        );
    } else {
        println!(
            "  {} {}/{} checks passed, {} failed",
            "✗".red().bold(),
            passed,
            total,
            failed
        );
        println!();
        println!("  Fix the issues above, then run {} again.", "tal doctor".bold());
    }

    if failed > 0 {
        std::process::exit(1);
    }
    Ok(())
}

// ===========================================================================
// Toolchain Checks
// ===========================================================================

fn check_rust(install: bool) -> CheckResult {
    match get_command_version("rustc", &["--version"]) {
        Some(version) => CheckResult::pass("Rust toolchain", version),
        None => {
            if install {
                println!("  {} Installing Rust...", "↓".blue());
                let _ = Command::new("sh")
                    .args(["-c", "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y"])
                    .status();
                match get_command_version("rustc", &["--version"]) {
                    Some(v) => CheckResult::pass("Rust toolchain", format!("{} (just installed)", v)),
                    None => CheckResult::fail(
                        "Rust toolchain",
                        "Installation failed",
                        "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
                    ),
                }
            } else {
                CheckResult::fail(
                    "Rust toolchain",
                    "Not found",
                    "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
                )
            }
        }
    }
}

fn check_risc_zero(install: bool) -> CheckResult {
    // Check for rzup or r0vm
    if let Some(version) = get_command_version("r0vm", &["--version"]) {
        return CheckResult::pass("RISC Zero toolchain", version);
    }

    if let Some(version) = get_command_version("rzup", &["--version"]) {
        return CheckResult::pass("RISC Zero toolchain (rzup)", version);
    }

    // Check if cargo-risczero exists
    if let Some(version) = get_command_version("cargo", &["risczero", "--version"]) {
        return CheckResult::pass("RISC Zero toolchain (cargo-risczero)", version);
    }

    if install {
        println!("  {} Installing RISC Zero toolchain...", "↓".blue());
        let _ = Command::new("sh")
            .args(["-c", "curl -L https://risczero.com/install | bash && rzup install"])
            .status();
        if get_command_version("r0vm", &["--version"]).is_some() {
            CheckResult::pass("RISC Zero toolchain", "just installed")
        } else {
            CheckResult::fail(
                "RISC Zero toolchain",
                "Not found — required for zkVM proof generation",
                "curl -L https://risczero.com/install | bash && rzup install",
            )
        }
    } else {
        CheckResult::fail(
            "RISC Zero toolchain",
            "Not found — required for zkVM proof generation (tal build --elf)",
            "curl -L https://risczero.com/install | bash && rzup install",
        )
    }
}

fn check_foundry(install: bool) -> CheckResult {
    match get_command_version("forge", &["--version"]) {
        Some(version) => CheckResult::pass("Foundry (forge)", version),
        None => {
            if install {
                println!("  {} Installing Foundry...", "↓".blue());
                let _ = Command::new("sh")
                    .args(["-c", "curl -L https://foundry.paradigm.xyz | bash && foundryup"])
                    .status();
                match get_command_version("forge", &["--version"]) {
                    Some(v) => CheckResult::pass("Foundry (forge)", format!("{} (just installed)", v)),
                    None => CheckResult::fail(
                        "Foundry (forge)",
                        "Installation failed",
                        "curl -L https://foundry.paradigm.xyz | bash && foundryup",
                    ),
                }
            } else {
                CheckResult::fail(
                    "Foundry (forge)",
                    "Not found — required for contract deployment",
                    "curl -L https://foundry.paradigm.xyz | bash && foundryup",
                )
            }
        }
    }
}

fn check_node() -> CheckResult {
    match get_command_version("node", &["--version"]) {
        Some(version) => CheckResult::pass("Node.js", version),
        None => CheckResult::fail(
            "Node.js",
            "Not found — required for SDK and frontend",
            "Install via https://nodejs.org or: brew install node",
        ),
    }
}

// ===========================================================================
// Build State Checks
// ===========================================================================

fn check_agent_crate(agent_dir: &Path) -> CheckResult {
    let agent_lib = agent_dir.join("agent/src/lib.rs");
    let agent_cargo = agent_dir.join("agent/Cargo.toml");

    if agent_lib.exists() && agent_cargo.exists() {
        CheckResult::pass("Agent crate", format!("{}", agent_dir.display()))
    } else if agent_dir.join("src/lib.rs").exists() {
        // Might be inside the agent/ subdirectory already
        CheckResult::pass("Agent crate", format!("{}", agent_dir.display()))
    } else {
        CheckResult::fail(
            "Agent crate",
            format!("No agent/src/lib.rs found in {}", agent_dir.display()),
            "tal init <name> --template <template>",
        )
    }
}

fn check_elf_staleness(agent_dir: &Path) -> CheckResult {
    let agent_lib = agent_dir.join("agent/src/lib.rs");
    let agent_cargo = agent_dir.join("agent/Cargo.toml");

    if !agent_lib.exists() {
        return CheckResult::fail(
            "ELF binary",
            "No agent source found — cannot check staleness",
            "tal init <name>",
        );
    }

    // Compute current source hash
    let lib_content = match std::fs::read(&agent_lib) {
        Ok(c) => c,
        Err(_) => {
            return CheckResult::fail(
                "ELF binary",
                "Cannot read agent/src/lib.rs",
                "Check file permissions",
            );
        }
    };

    let cargo_content = std::fs::read(&agent_cargo).unwrap_or_default();

    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(&lib_content);
    hasher.update([0x00]);
    hasher.update(&cargo_content);
    let current_hash: [u8; 32] = hasher.finalize().into();
    let current_hash_hex = hex::encode(current_hash);

    // Try to find the ELF and check if it matches
    // Look for any risc0-methods directory
    let methods_dir = agent_dir.join("risc0-methods");
    if !methods_dir.exists() {
        return CheckResult::fail(
            "ELF binary",
            "No risc0-methods/ directory found",
            "tal init will create this structure",
        );
    }

    // Check if ELF exists in target
    let agent_name = agent_dir
        .file_name()
        .unwrap_or_default()
        .to_string_lossy();
    let elf_path = format!(
        "target/riscv-guest/{}-risc0-methods/zkvm-guest/riscv32im-risc0-zkvm-elf/release/zkvm-guest.bin",
        agent_name
    );

    // Find workspace root to check target/
    if let Ok(workspace) = find_workspace_root_from(agent_dir) {
        let full_elf_path = workspace.join(&elf_path);
        if full_elf_path.exists() {
            // ELF exists — check modification time vs source
            let elf_modified = std::fs::metadata(&full_elf_path)
                .and_then(|m| m.modified())
                .ok();
            let src_modified = std::fs::metadata(&agent_lib)
                .and_then(|m| m.modified())
                .ok();

            if let (Some(elf_time), Some(src_time)) = (elf_modified, src_modified) {
                if src_time > elf_time {
                    return CheckResult::fail(
                        "ELF binary",
                        format!(
                            "Stale — agent source changed since last ELF build\n    Source hash: 0x{}",
                            &current_hash_hex[..16]
                        ),
                        "tal build --elf",
                    );
                } else {
                    return CheckResult::pass(
                        "ELF binary",
                        format!("Up-to-date (source hash: 0x{}...)", &current_hash_hex[..12]),
                    );
                }
            }

            return CheckResult::pass("ELF binary", "Found (unable to check staleness)");
        }
    }

    CheckResult::fail(
        "ELF binary",
        "Not built yet",
        "tal build --elf",
    )
}

fn check_workspace_membership(agent_dir: &Path) -> CheckResult {
    let agent_name = agent_dir
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    if let Ok(workspace) = find_workspace_root_from(agent_dir) {
        let cargo_toml = workspace.join("Cargo.toml");
        if let Ok(content) = std::fs::read_to_string(&cargo_toml) {
            if content.contains(&agent_name) {
                return CheckResult::pass(
                    "Workspace membership",
                    format!("'{}' found in workspace Cargo.toml", agent_name),
                );
            } else {
                return CheckResult::fail(
                    "Workspace membership",
                    format!("'{}' not listed in workspace Cargo.toml members", agent_name),
                    format!(
                        "Add to [workspace] members in Cargo.toml:\n    \"crates/agents/{}/agent\",\n    \"crates/agents/{}/risc0-methods\",",
                        agent_name, agent_name
                    ),
                );
            }
        }
    }

    CheckResult::fail(
        "Workspace membership",
        "Cannot find workspace Cargo.toml",
        "Run from within the Tokamak AI Layer workspace",
    )
}

// ===========================================================================
// Configuration Checks
// ===========================================================================

fn check_env_file(config_path: &str) -> CheckResult {
    if Path::new(config_path).exists() {
        let content = std::fs::read_to_string(config_path).unwrap_or_default();
        let lines: Vec<&str> = content
            .lines()
            .filter(|l| !l.starts_with('#') && !l.trim().is_empty())
            .collect();
        CheckResult::pass(
            ".env configuration",
            format!("{} ({} variables)", config_path, lines.len()),
        )
    } else {
        CheckResult::fail(
            ".env configuration",
            format!("File '{}' not found", config_path),
            "cp .env.example .env && edit with your values",
        )
    }
}

fn check_env_variables(config_path: &str) -> CheckResult {
    if !Path::new(config_path).exists() {
        return CheckResult::fail(
            "Required env variables",
            "No .env file — cannot check variables",
            "cp .env.example .env",
        );
    }

    let content = std::fs::read_to_string(config_path).unwrap_or_default();

    let required = ["RPC_URL", "PRIVATE_KEY", "VAULT_ADDRESS"];
    let mut missing = Vec::new();

    for var in &required {
        let has_value = content.lines().any(|line| {
            if let Some(rest) = line.strip_prefix(var) {
                rest.starts_with('=') && rest.len() > 1 && rest != "="
            } else {
                false
            }
        });
        if !has_value {
            missing.push(*var);
        }
    }

    if missing.is_empty() {
        CheckResult::pass("Required env variables", "RPC_URL, PRIVATE_KEY, VAULT_ADDRESS")
    } else {
        CheckResult::fail(
            "Required env variables",
            format!("Missing: {}", missing.join(", ")),
            format!("Set in {}: {}", config_path, missing.join(", ")),
        )
    }
}

// ===========================================================================
// Helpers
// ===========================================================================

fn get_command_version(cmd: &str, args: &[&str]) -> Option<String> {
    Command::new(cmd)
        .args(args)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .trim()
                .lines()
                .next()
                .unwrap_or("")
                .to_string()
        })
}

fn find_workspace_root_from(start: &Path) -> Result<PathBuf> {
    let mut dir = if start.is_absolute() {
        start.to_path_buf()
    } else {
        std::env::current_dir()?.join(start)
    };

    loop {
        let cargo_toml = dir.join("Cargo.toml");
        if cargo_toml.exists() {
            if let Ok(content) = std::fs::read_to_string(&cargo_toml) {
                if content.contains("[workspace]") {
                    return Ok(dir);
                }
            }
        }
        if !dir.pop() {
            anyhow::bail!("Cannot find workspace root");
        }
    }
}
