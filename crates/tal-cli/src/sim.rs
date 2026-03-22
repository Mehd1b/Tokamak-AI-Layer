//! `tal sim` — Run agent simulation against a JSON fixture.

use anyhow::{bail, Context, Result};
use colored::Colorize;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Run the simulation subcommand.
pub fn run(fixture: Option<&str>, list: bool, verbose: bool) -> Result<()> {
    let agent_dir = find_agent_dir()?;

    if list {
        return list_fixtures(&agent_dir);
    }

    let fixture_path = match fixture {
        Some(p) => p.to_string(),
        None => {
            // Try default fixture
            let default = agent_dir.join("fixtures/sample.json");
            if default.exists() {
                default.to_string_lossy().to_string()
            } else {
                println!("{} No fixture specified. Available fixtures:", "!".yellow());
                list_fixtures(&agent_dir)?;
                bail!("Usage: tal sim <fixture.json> or tal sim --list");
            }
        }
    };

    // Verify fixture exists
    if !Path::new(&fixture_path).exists() {
        // Try relative to agent dir
        let relative = agent_dir.join(&fixture_path);
        if !relative.exists() {
            bail!(
                "Fixture not found: {}\nTry: tal sim --list",
                fixture_path
            );
        }
    }

    // Ensure sim binary exists
    ensure_sim_binary(&agent_dir, verbose)?;

    // Get the agent crate name
    let agent_name = read_agent_name(&agent_dir)?;

    println!(
        "{} Simulating {} with {}",
        "●".cyan(),
        agent_name.bold(),
        fixture_path
    );

    // Run: cargo run --bin sim --features simulator -- <fixture>
    let mut cmd = Command::new("cargo");
    cmd.current_dir(&agent_dir);
    cmd.args([
        "run",
        "--bin",
        "sim",
        "--features",
        "simulator",
        "--",
        &fixture_path,
    ]);

    if verbose {
        println!("  Running: {:?}", cmd);
    }

    let status = cmd.status().context("Failed to run cargo")?;

    if status.success() {
        Ok(())
    } else {
        std::process::exit(status.code().unwrap_or(1));
    }
}

/// Find the agent directory (walk up from CWD looking for agent/src/lib.rs).
fn find_agent_dir() -> Result<PathBuf> {
    let cwd = std::env::current_dir()?;

    // Case 1: CWD is the project root with agent/ subdirectory
    if cwd.join("agent/src/lib.rs").exists() {
        return Ok(cwd.join("agent"));
    }

    // Case 2: CWD is inside agent/ directory
    if cwd.join("src/lib.rs").exists() {
        let cargo = cwd.join("Cargo.toml");
        if cargo.exists() {
            let content = std::fs::read_to_string(&cargo)?;
            if content.contains("kernel-sdk") {
                return Ok(cwd);
            }
        }
    }

    // Case 3: Walk up looking for agent/src/lib.rs
    let mut dir = cwd.as_path();
    while let Some(parent) = dir.parent() {
        if parent.join("agent/src/lib.rs").exists() {
            return Ok(parent.join("agent"));
        }
        dir = parent;
    }

    bail!(
        "Not inside an agent project. Run from an agent directory \
         (must contain src/lib.rs with kernel-sdk dependency)."
    );
}

/// Read the package name from agent Cargo.toml.
fn read_agent_name(agent_dir: &Path) -> Result<String> {
    let cargo_path = agent_dir.join("Cargo.toml");
    let content = std::fs::read_to_string(&cargo_path)
        .context("Cannot read agent Cargo.toml")?;
    for line in content.lines() {
        if let Some(name) = line.strip_prefix("name = \"") {
            if let Some(name) = name.strip_suffix('"') {
                return Ok(name.to_string());
            }
        }
    }
    bail!("Cannot find package name in {}", cargo_path.display());
}

/// Ensure the sim binary target exists, auto-scaffold if missing.
fn ensure_sim_binary(agent_dir: &Path, verbose: bool) -> Result<()> {
    let sim_rs = agent_dir.join("src/bin/sim.rs");
    let cargo_path = agent_dir.join("Cargo.toml");

    if sim_rs.exists() {
        // Check Cargo.toml has the [[bin]] entry
        let content = std::fs::read_to_string(&cargo_path)?;
        if content.contains("name = \"sim\"") {
            return Ok(());
        }
    }

    println!(
        "  {} No simulator binary found. Auto-scaffolding...",
        "!".yellow()
    );

    // Create src/bin/ directory
    let bin_dir = agent_dir.join("src/bin");
    std::fs::create_dir_all(&bin_dir)?;

    // Read the agent crate name
    let agent_name = read_agent_name(agent_dir)?;
    let agent_ident = agent_name.replace('-', "_");

    // Write sim.rs
    let sim_content = format!(
        r#"fn main() {{
    kernel_sdk::simulator::run_and_print({}::agent_main, std::env::args());
}}
"#,
        agent_ident
    );
    std::fs::write(&sim_rs, &sim_content)?;

    // Update Cargo.toml: add [[bin]] and simulator feature
    let mut cargo_content = std::fs::read_to_string(&cargo_path)?;

    // Add [[bin]] section if not present
    if !cargo_content.contains("name = \"sim\"") {
        // Insert after [lib] section or at end
        let bin_section = r#"
[[bin]]
name = "sim"
path = "src/bin/sim.rs"
required-features = ["simulator"]
"#
        .to_string();

        if let Some(pos) = cargo_content.find("[dependencies]") {
            cargo_content.insert_str(pos, &bin_section);
        } else {
            cargo_content.push_str(&bin_section);
        }
    }

    // Add simulator feature if not present
    if !cargo_content.contains("simulator") {
        if let Some(pos) = cargo_content.find("[features]") {
            // Find end of [features] section
            let features_rest = &cargo_content[pos..];
            if let Some(next_section) = features_rest[1..].find("\n[") {
                let insert_pos = pos + 1 + next_section;
                cargo_content.insert_str(
                    insert_pos,
                    "simulator = [\"kernel-sdk/simulator\"]\n",
                );
            } else {
                cargo_content.push_str("\nsimulator = [\"kernel-sdk/simulator\"]\n");
            }
        } else {
            cargo_content.push_str("\n[features]\ndefault = []\nsimulator = [\"kernel-sdk/simulator\"]\n");
        }
    }

    std::fs::write(&cargo_path, &cargo_content)?;

    if verbose {
        println!("  Created: {}", sim_rs.display());
        println!("  Updated: {}", cargo_path.display());
    }

    println!("  {} Simulator binary scaffolded", "+".green());

    Ok(())
}

/// List available fixture files.
fn list_fixtures(agent_dir: &Path) -> Result<()> {
    // Check both agent_dir/fixtures and parent/fixtures
    let fixture_dirs = [
        agent_dir.join("fixtures"),
        agent_dir
            .parent()
            .map(|p| p.join("fixtures"))
            .unwrap_or_default(),
    ];

    let mut found = false;
    for dir in &fixture_dirs {
        if dir.exists() {
            if let Ok(entries) = std::fs::read_dir(dir) {
                let jsons: Vec<_> = entries
                    .filter_map(|e| e.ok())
                    .filter(|e| {
                        e.path()
                            .extension()
                            .is_some_and(|ext| ext == "json")
                    })
                    .collect();
                if !jsons.is_empty() {
                    println!("  Fixtures in {}:", dir.display());
                    for f in &jsons {
                        println!("    {}", f.path().display());
                    }
                    found = true;
                }
            }
        }
    }

    if !found {
        println!(
            "  {} No fixtures found. Create fixtures/*.json",
            "!".yellow()
        );
    }

    Ok(())
}
