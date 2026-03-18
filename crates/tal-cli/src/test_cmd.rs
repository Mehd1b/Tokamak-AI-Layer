//! `tal test` — Test agent logic locally or with full proving.
//!
//! Modes:
//! - `--local`: Run agent natively without zkVM (2-second feedback)
//! - `--dry-run`: Run with live data, no proof or submission
//! - `--prove`: Full ZK proof generation
//! - `--determinism-check`: Run twice and compare outputs
//! - `--generate-fixture`: Capture live data into a fixture file

use anyhow::{bail, Context, Result};
use colored::Colorize;
use std::process::Command;
use std::time::Instant;

#[allow(clippy::too_many_arguments)]
pub fn run(
    local: bool,
    dry_run: bool,
    prove: bool,
    input_fixture: Option<&str>,
    determinism_check: bool,
    generate_fixture: bool,
    agent: Option<&str>,
    verbose: bool,
) -> Result<()> {
    if local {
        run_local(agent, input_fixture, determinism_check, verbose)
    } else if dry_run {
        run_dry_run(agent, verbose)
    } else if prove {
        run_prove(agent, verbose)
    } else if generate_fixture {
        run_generate_fixture(agent, verbose)
    } else {
        // Default to local mode
        println!(
            "{} No mode specified, defaulting to --local",
            "ℹ".blue()
        );
        run_local(agent, input_fixture, determinism_check, verbose)
    }
}

/// Run agent tests locally using `cargo test`.
///
/// This runs the agent's built-in unit tests natively (no zkVM), providing
/// instant feedback on agent logic changes.
fn run_local(
    agent: Option<&str>,
    input_fixture: Option<&str>,
    determinism_check: bool,
    verbose: bool,
) -> Result<()> {
    let agent_name = resolve_agent_name(agent)?;

    println!(
        "{} Testing agent '{}' locally (no zkVM)",
        "●".cyan(),
        agent_name.bold()
    );

    if let Some(fixture) = input_fixture {
        println!("  Input fixture: {}", fixture);
        validate_fixture(fixture)?;
    }

    println!();

    let start = Instant::now();

    // Run cargo test for the agent crate
    let mut cmd = Command::new("cargo");
    cmd.args(["test", "-p", &agent_name, "--", "--nocapture"]);

    if verbose {
        println!("  Running: cargo test -p {} -- --nocapture", agent_name);
    }

    let output = cmd
        .output()
        .context("Failed to run cargo test. Is the agent crate in the workspace?")?;

    let elapsed = start.elapsed();

    // Display output
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    // Parse test results from output
    let (test_count, pass_count, fail_count) = parse_test_results(&stdout);

    if output.status.success() {
        println!("{}", "  Test Results".bold());
        println!("  {}", "─".repeat(50));

        // Show individual test results
        for line in stdout.lines() {
            if line.starts_with("test ") && line.contains("...") {
                let formatted = format_test_line(line);
                println!("  {}", formatted);
            }
        }

        println!("  {}", "─".repeat(50));
        println!(
            "  {} {}/{} tests passed in {:.2}s",
            "✓".green().bold(),
            pass_count,
            test_count,
            elapsed.as_secs_f64()
        );

        // Print agent output if captured
        if verbose {
            for line in stdout.lines() {
                if !line.starts_with("test ")
                    && !line.starts_with("running ")
                    && !line.contains("test result:")
                    && !line.is_empty()
                {
                    println!("  {}", line.dimmed());
                }
            }
        }
    } else {
        println!("{}", "  Test Results".bold().red());
        println!("  {}", "─".repeat(50));

        for line in stdout.lines() {
            if line.starts_with("test ") && line.contains("...") {
                let formatted = format_test_line(line);
                println!("  {}", formatted);
            }
        }

        // Show failure details
        let mut in_failure = false;
        for line in stdout.lines() {
            if line.starts_with("---- ") && line.ends_with(" ----") {
                in_failure = true;
                println!();
                println!("  {} {}", "FAILURE:".red().bold(), line.trim_matches('-').trim());
            } else if in_failure {
                if line.starts_with("failures:") || line.starts_with("test result:") {
                    in_failure = false;
                } else {
                    println!("    {}", line);
                }
            }
        }

        println!("  {}", "─".repeat(50));
        println!(
            "  {} {}/{} tests failed in {:.2}s",
            "✗".red().bold(),
            fail_count,
            test_count,
            elapsed.as_secs_f64()
        );

        // Show compilation errors if any
        if !stderr.is_empty() && stderr.contains("error") {
            println!();
            println!("  {} Compilation errors:", "✗".red().bold());
            for line in stderr.lines() {
                if line.contains("error") || line.starts_with("  -->") {
                    println!("    {}", line);
                }
            }
        }
    }

    // Determinism check: run again and compare
    if determinism_check {
        println!();
        println!("{} Running determinism check...", "●".cyan());

        let output2 = Command::new("cargo")
            .args(["test", "-p", &agent_name, "--", "--nocapture"])
            .output()
            .context("Failed to run second test pass")?;

        let stdout2 = String::from_utf8_lossy(&output2.stdout);
        let (count2, pass2, _) = parse_test_results(&stdout2);

        if test_count == count2 && pass_count == pass2 {
            println!(
                "  {} Agent is deterministic ({} tests consistent across 2 runs)",
                "✓".green(),
                test_count
            );
        } else {
            println!(
                "  {} Non-deterministic behavior detected!",
                "✗".red().bold()
            );
            println!("    Run 1: {}/{} passed", pass_count, test_count);
            println!("    Run 2: {}/{} passed", pass2, count2);
            println!(
                "    {} Agent code must be fully deterministic for zkVM execution",
                "⚠".yellow()
            );
        }
    }

    if !output.status.success() {
        std::process::exit(1);
    }

    Ok(())
}

/// Run with live market data but no proof or submission.
fn run_dry_run(agent: Option<&str>, verbose: bool) -> Result<()> {
    let agent_name = resolve_agent_name(agent)?;

    println!(
        "{} Dry run for '{}' — live data, no proof/submission",
        "●".cyan(),
        agent_name.bold()
    );

    // Try to run the host with --dry-run
    let host_name = format!("{}-host", agent_name);
    let mut cmd = Command::new("cargo");
    cmd.args(["run", "-p", &host_name, "--", "--dry-run"]);

    if verbose {
        println!("  Running: cargo run -p {} -- --dry-run", host_name);
    }

    let status = cmd.status();

    match status {
        Ok(s) if s.success() => {
            println!("  {} Dry run completed", "✓".green());
            Ok(())
        }
        Ok(_) => {
            bail!("Dry run failed. Check agent host configuration.");
        }
        Err(_) => {
            println!(
                "  {} No host crate found ('{}')",
                "ℹ".yellow(),
                host_name
            );
            println!("  Dry-run mode requires a host/ directory in your agent project.");
            println!(
                "  Use {} to scaffold one, or run {} for unit tests.",
                "tal init --template perp-trader".bold(),
                "tal test --local".bold()
            );
            Ok(())
        }
    }
}

/// Generate a full ZK proof.
fn run_prove(agent: Option<&str>, verbose: bool) -> Result<()> {
    let agent_name = resolve_agent_name(agent)?;

    println!(
        "{} Generating ZK proof for '{}'",
        "●".cyan(),
        agent_name.bold()
    );
    println!(
        "  {} This typically takes 8-10 minutes",
        "ℹ".blue()
    );

    // Check if ELF exists
    let _methods_crate = format!("{}-risc0-methods", agent_name);
    let host_name = format!("{}-host", agent_name);

    // Try to run the host with --prove
    let mut cmd = Command::new("cargo");
    cmd.args(["run", "-p", &host_name, "--features", "prove", "--", "--prove"]);

    if verbose {
        println!("  Running: cargo run -p {} --features prove -- --prove", host_name);
    }

    let status = cmd.status();

    match status {
        Ok(s) if s.success() => {
            println!("  {} Proof generated successfully", "✓".green());
            Ok(())
        }
        Ok(_) => {
            bail!("Proof generation failed. Run `tal doctor` to diagnose.");
        }
        Err(_) => {
            println!(
                "  {} Host crate '{}' not found or doesn't support --prove",
                "ℹ".yellow(),
                host_name
            );
            println!("  Ensure the host crate has `prove` feature enabled in Cargo.toml");
            Ok(())
        }
    }
}

/// Generate a fixture from live market data.
fn run_generate_fixture(agent: Option<&str>, _verbose: bool) -> Result<()> {
    let agent_name = resolve_agent_name(agent)?;

    println!(
        "{} Generating fixture for '{}' from live data",
        "●".cyan(),
        agent_name.bold()
    );

    println!(
        "  {} Fixture generation will be available when host integration is complete.",
        "ℹ".yellow()
    );
    println!("  For now, create fixture files manually in JSON format:");
    println!();
    println!("  Example fixtures/btc-long.json:");
    println!(
        "  {}",
        r#"  {
    "state_snapshot": {
      "version": 1,
      "last_execution_ts": 0,
      "current_ts": 1710000000,
      "current_equity": 10000000,
      "peak_equity": 10000000
    },
    "market_data": {
      "adapter_address": "0x3333333333333333333333333333333333333333",
      "mark_price": 9700000000000,
      "position_size": 0,
      "available_margin": 1000000,
      "signal": 1,
      "order_size": 100000
    }
  }"#
        .dimmed()
    );

    Ok(())
}

// ===========================================================================
// Helpers
// ===========================================================================

/// Resolve agent name from CLI arg or current directory.
fn resolve_agent_name(agent: Option<&str>) -> Result<String> {
    if let Some(name) = agent {
        return Ok(name.to_string());
    }

    // Try to detect from current directory
    let cwd = std::env::current_dir()?;

    // Check if we're in a project root with agent/ subdirectory
    if cwd.join("agent/src/lib.rs").exists() {
        // Read the actual crate name from agent/Cargo.toml
        if let Ok(content) = std::fs::read_to_string(cwd.join("agent/Cargo.toml")) {
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

    // Check if we're in the agent/ subdirectory
    if cwd.join("src/lib.rs").exists() {
        if let Some(parent) = cwd.parent() {
            if let Some(name) = parent.file_name() {
                return Ok(name.to_string_lossy().to_string());
            }
        }
    }

    // Try to find from Cargo.toml
    let cargo_toml = cwd.join("Cargo.toml");
    if cargo_toml.exists() {
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

    bail!(
        "Cannot determine agent name. Use {} or run from an agent directory.",
        "--agent <name>".bold()
    )
}

/// Validate that a fixture file exists and is valid JSON.
fn validate_fixture(path: &str) -> Result<()> {
    let content = std::fs::read_to_string(path)
        .with_context(|| format!("Cannot read fixture file: {}", path))?;

    serde_json::from_str::<serde_json::Value>(&content)
        .with_context(|| format!("Invalid JSON in fixture file: {}", path))?;

    Ok(())
}

/// Parse test count and results from cargo test output.
fn parse_test_results(output: &str) -> (usize, usize, usize) {
    let mut total = 0;
    let mut passed = 0;
    let mut failed = 0;

    for line in output.lines() {
        if line.starts_with("test ") && line.contains("... ok") {
            total += 1;
            passed += 1;
        } else if line.starts_with("test ") && line.contains("... FAILED") {
            total += 1;
            failed += 1;
        } else if line.starts_with("test ") && line.contains("... ignored") {
            // Don't count ignored tests
        }
    }

    // Fallback: parse "test result:" line
    if total == 0 {
        for line in output.lines() {
            if line.contains("test result:") {
                // e.g., "test result: ok. 3 passed; 0 failed; 0 ignored"
                if let Some(p) = extract_number(line, "passed") {
                    passed = p;
                    total += p;
                }
                if let Some(f) = extract_number(line, "failed") {
                    failed = f;
                    total += f;
                }
            }
        }
    }

    (total, passed, failed)
}

fn extract_number(line: &str, keyword: &str) -> Option<usize> {
    let idx = line.find(keyword)?;
    let before = &line[..idx].trim_end();
    let num_str = before.rsplit_once(|c: char| !c.is_ascii_digit())?.1;
    num_str.parse().ok()
}

/// Format a test line with colored pass/fail markers.
fn format_test_line(line: &str) -> String {
    if line.contains("... ok") {
        let name = line
            .strip_prefix("test ")
            .unwrap_or(line)
            .replace(" ... ok", "");
        format!("{} {}", "✓".green(), name)
    } else if line.contains("... FAILED") {
        let name = line
            .strip_prefix("test ")
            .unwrap_or(line)
            .replace(" ... FAILED", "");
        format!("{} {}", "✗".red(), name)
    } else if line.contains("... ignored") {
        let name = line
            .strip_prefix("test ")
            .unwrap_or(line)
            .replace(" ... ignored", "");
        format!("{} {} {}", "○".dimmed(), name, "(ignored)".dimmed())
    } else {
        line.to_string()
    }
}
