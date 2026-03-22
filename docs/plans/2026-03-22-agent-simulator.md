# Native-Mode Agent Simulator (`tal sim`) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `tal sim` CLI subcommand that runs agent logic + constraint enforcement natively (~5s) instead of requiring a full zkVM ELF build (~10min).

**Architecture:** A `simulator` feature in `kernel-sdk` enables `std` and exposes a `simulator` module with fixture loading, agent execution, constraint checking, and pretty-printed output. Each agent gets a `src/bin/sim.rs` (3 lines) and `fixtures/sample.json`. The `tal sim` subcommand detects the agent directory, auto-scaffolds the sim binary if missing, and runs `cargo run --bin sim --features simulator`.

**Tech Stack:** Rust (kernel-sdk, tal-cli), serde/serde_json for fixtures, constraints crate for enforcement.

---

### Task 1: Add `simulator` feature to kernel-sdk Cargo.toml

**Files:**
- Modify: `crates/sdk/kernel-sdk/Cargo.toml`

**Step 1: Add serde dependencies and simulator feature**

In `crates/sdk/kernel-sdk/Cargo.toml`, add optional deps and the new feature:

```toml
[dependencies]
kernel-core = { path = "../../protocol/kernel-core", default-features = false }
constraints = { path = "../../protocol/constraints", optional = true }
serde = { version = "1", features = ["derive"], optional = true }
serde_json = { version = "1", optional = true }

[features]
default = []
guest = []
std = ["kernel-core/std"]
testing = ["kernel-core/testing", "dep:constraints"]
simulator = ["std", "dep:constraints", "dep:serde", "dep:serde_json"]
```

**Step 2: Verify it compiles**

Run: `cargo check -p kernel-sdk --features simulator`
Expected: Compiles with no errors.

**Step 3: Commit**

```bash
git add crates/sdk/kernel-sdk/Cargo.toml
git commit -m "feat(kernel-sdk): add simulator feature with serde deps"
```

---

### Task 2: Create `simulator` module in kernel-sdk

**Files:**
- Create: `crates/sdk/kernel-sdk/src/simulator.rs`
- Modify: `crates/sdk/kernel-sdk/src/lib.rs` (add module declaration)

**Step 1: Create `simulator.rs` with SimFixture and parsing**

Create `crates/sdk/kernel-sdk/src/simulator.rs`:

```rust
//! Native-mode agent simulator for rapid iteration.
//!
//! Run agent logic + constraint enforcement without zkVM compilation.
//! Reduces iteration time from ~10 minutes to ~5 seconds.
//!
//! # Usage
//!
//! From your agent's `src/bin/sim.rs`:
//! ```ignore
//! fn main() {
//!     kernel_sdk::simulator::run_and_print(my_agent::agent_main, std::env::args());
//! }
//! ```

use crate::agent::AgentContext;
use crate::types::AgentOutput;
use constraints::{ConstraintSetV1, StateSnapshotV1};
use kernel_core::{
    KernelInputV1, ACTION_TYPE_CALL, ACTION_TYPE_NO_OP, ACTION_TYPE_TRANSFER_ERC20,
};
use serde::Deserialize;
use std::path::Path;

// ============================================================================
// Fixture Types
// ============================================================================

/// JSON fixture for simulation input.
///
/// Framework fields are in JSON. Opaque agent data is either
/// an inline hex string or a path to a binary file.
#[derive(Deserialize)]
pub struct SimFixture {
    /// Agent ID (hex string, 0x-prefixed, 64 hex chars)
    #[serde(default = "default_bytes32_hex")]
    pub agent_id: String,

    /// Agent code hash (hex string)
    #[serde(default = "default_bytes32_hex")]
    pub agent_code_hash: String,

    /// Vault address (hex string, 0x-prefixed, 40 hex chars)
    #[serde(default = "default_address_hex")]
    pub vault_address: String,

    /// Current equity in raw units (e.g., 10000000 = 10 USDC with 6 decimals)
    #[serde(default)]
    pub equity: u64,

    /// Execution nonce (monotonic)
    #[serde(default = "default_nonce")]
    pub execution_nonce: u64,

    /// Opaque agent inputs as hex string (0x-prefixed)
    #[serde(default)]
    pub opaque_inputs: Option<String>,

    /// Path to binary file containing opaque agent inputs
    #[serde(default)]
    pub opaque_inputs_file: Option<String>,

    /// Optional constraint overrides
    #[serde(default)]
    pub constraints: Option<ConstraintOverrides>,
}

/// Optional constraint configuration overrides.
#[derive(Deserialize, Default)]
pub struct ConstraintOverrides {
    #[serde(default)]
    pub max_drawdown_bps: Option<u32>,
    #[serde(default)]
    pub cooldown_seconds: Option<u32>,
    #[serde(default)]
    pub max_leverage_bps: Option<u32>,
    #[serde(default)]
    pub max_actions_per_output: Option<u32>,
}

fn default_bytes32_hex() -> String {
    format!("0x{}", "00".repeat(32))
}

fn default_address_hex() -> String {
    format!("0x{}", "00".repeat(20))
}

fn default_nonce() -> u64 {
    1
}

// ============================================================================
// Simulation Result Types
// ============================================================================

/// Human-readable description of a single action.
pub struct ActionDisplay {
    pub index: usize,
    pub action_type: &'static str,
    pub target: String,
    pub details: String,
}

/// Constraint check results.
pub struct ConstraintReport {
    pub max_actions_ok: bool,
    pub max_actions_used: usize,
    pub max_actions_limit: usize,
    pub drawdown_ok: bool,
    pub drawdown_bps: Option<u32>,
    pub drawdown_limit_bps: u32,
    pub cooldown_ok: bool,
    pub cooldown_detail: String,
    pub leverage_ok: bool,
    pub overall_pass: bool,
}

// ============================================================================
// Core Functions
// ============================================================================

/// Parse a hex string (with or without 0x prefix) into bytes.
fn parse_hex(s: &str) -> Result<Vec<u8>, String> {
    let s = s.strip_prefix("0x").unwrap_or(s);
    if s.is_empty() {
        return Ok(Vec::new());
    }
    hex_decode(s).map_err(|e| format!("Invalid hex: {}", e))
}

/// Simple hex decoder (avoids pulling in the `hex` crate).
fn hex_decode(s: &str) -> Result<Vec<u8>, String> {
    if s.len() % 2 != 0 {
        return Err("Odd-length hex string".to_string());
    }
    (0..s.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&s[i..i + 2], 16)
                .map_err(|e| format!("Invalid hex at position {}: {}", i, e))
        })
        .collect()
}

/// Encode bytes as 0x-prefixed hex string.
fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(2 + bytes.len() * 2);
    s.push_str("0x");
    for b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

/// Parse a hex string into a fixed-size byte array.
fn parse_hex_fixed<const N: usize>(s: &str) -> Result<[u8; N], String> {
    let bytes = parse_hex(s)?;
    if bytes.len() != N {
        return Err(format!("Expected {} bytes, got {}", N, bytes.len()));
    }
    let mut arr = [0u8; N];
    arr.copy_from_slice(&bytes);
    Ok(arr)
}

/// Load and parse a fixture file.
pub fn load_fixture(path: &str) -> Result<SimFixture, String> {
    let content =
        std::fs::read_to_string(path).map_err(|e| format!("Cannot read {}: {}", path, e))?;
    serde_json::from_str(&content).map_err(|e| format!("Invalid JSON in {}: {}", path, e))
}

/// Resolve opaque inputs from fixture (inline hex or file reference).
fn resolve_opaque_inputs(fixture: &SimFixture, fixture_dir: &Path) -> Result<Vec<u8>, String> {
    if let Some(ref file_path) = fixture.opaque_inputs_file {
        let resolved = if Path::new(file_path).is_absolute() {
            std::path::PathBuf::from(file_path)
        } else {
            fixture_dir.join(file_path)
        };
        std::fs::read(&resolved)
            .map_err(|e| format!("Cannot read opaque_inputs_file '{}': {}", resolved.display(), e))
    } else if let Some(ref hex_str) = fixture.opaque_inputs {
        parse_hex(hex_str)
    } else {
        Ok(Vec::new())
    }
}

/// Build an AgentContext from the fixture.
fn build_context(fixture: &SimFixture) -> Result<AgentContext, String> {
    let agent_id = parse_hex_fixed::<32>(&fixture.agent_id)?;
    let agent_code_hash = parse_hex_fixed::<32>(&fixture.agent_code_hash)?;

    Ok(AgentContext::new(
        1, // protocol_version
        1, // kernel_version
        agent_id,
        agent_code_hash,
        [0u8; 32], // constraint_set_hash (computed at runtime)
        [0u8; 32], // input_root (not relevant for simulation)
        fixture.execution_nonce,
    ))
}

/// Build a KernelInputV1 for constraint enforcement.
fn build_kernel_input(fixture: &SimFixture, opaque_inputs: &[u8]) -> Result<KernelInputV1, String> {
    let agent_id = parse_hex_fixed::<32>(&fixture.agent_id)?;
    let agent_code_hash = parse_hex_fixed::<32>(&fixture.agent_code_hash)?;

    Ok(KernelInputV1 {
        protocol_version: 1,
        kernel_version: 1,
        agent_id,
        agent_code_hash,
        constraint_set_hash: [0u8; 32],
        input_root: [0u8; 32],
        execution_nonce: fixture.execution_nonce,
        opaque_agent_inputs: opaque_inputs.to_vec(),
    })
}

/// Build a ConstraintSetV1 with optional overrides.
fn build_constraints(fixture: &SimFixture) -> ConstraintSetV1 {
    let mut cs = ConstraintSetV1::default();
    if let Some(ref overrides) = fixture.constraints {
        if let Some(v) = overrides.max_drawdown_bps {
            cs.max_drawdown_bps = v;
        }
        if let Some(v) = overrides.cooldown_seconds {
            cs.cooldown_seconds = v;
        }
        if let Some(v) = overrides.max_leverage_bps {
            cs.max_leverage_bps = v;
        }
        if let Some(v) = overrides.max_actions_per_output {
            cs.max_actions_per_output = v;
        }
    }
    cs
}

/// Format an action for display.
fn format_action(action: &kernel_core::ActionV1, index: usize) -> ActionDisplay {
    let action_type = match action.action_type {
        ACTION_TYPE_CALL => "CALL",
        ACTION_TYPE_TRANSFER_ERC20 => "TRANSFER_ERC20",
        ACTION_TYPE_NO_OP => "NO_OP",
        _ => "UNKNOWN",
    };

    // Extract target address (lower 20 bytes of bytes32)
    let target = hex_encode(&action.target[12..32]);

    let details = match action.action_type {
        ACTION_TYPE_CALL => {
            if action.payload.len() >= 96 {
                // ABI-encoded: value (32 bytes) + offset (32) + calldata_len (32) + calldata
                let calldata_len = if action.payload.len() >= 96 {
                    let mut len_bytes = [0u8; 32];
                    len_bytes.copy_from_slice(&action.payload[64..96]);
                    u256_to_usize(&len_bytes)
                } else {
                    0
                };
                if action.payload.len() >= 100 {
                    let selector = &action.payload[96..100.min(action.payload.len())];
                    format!(
                        "selector=0x{} calldata={}B",
                        hex_encode(selector).trim_start_matches("0x"),
                        calldata_len
                    )
                } else {
                    format!("payload={}B", action.payload.len())
                }
            } else {
                format!("payload={}B", action.payload.len())
            }
        }
        ACTION_TYPE_TRANSFER_ERC20 => {
            if action.payload.len() == 96 {
                // ABI-encoded: token (32) + to (32) + amount (32)
                let token = hex_encode(&action.payload[12..32]);
                let to = hex_encode(&action.payload[44..64]);
                let amount_bytes = &action.payload[64..96];
                let amount = u256_to_u128(amount_bytes);
                format!("token={} to={} amount={}", token, to, amount)
            } else {
                format!("payload={}B (invalid)", action.payload.len())
            }
        }
        ACTION_TYPE_NO_OP => "(skip)".to_string(),
        _ => format!("payload={}B", action.payload.len()),
    };

    ActionDisplay {
        index,
        action_type,
        target,
        details,
    }
}

/// Extract a u128 from the lower 16 bytes of a 32-byte big-endian u256.
fn u256_to_u128(bytes: &[u8]) -> u128 {
    if bytes.len() < 32 {
        return 0;
    }
    let mut arr = [0u8; 16];
    arr.copy_from_slice(&bytes[16..32]);
    u128::from_be_bytes(arr)
}

/// Extract a usize from the lower bytes of a 32-byte big-endian u256.
fn u256_to_usize(bytes: &[u8]) -> usize {
    if bytes.len() < 32 {
        return 0;
    }
    let mut arr = [0u8; 8];
    arr.copy_from_slice(&bytes[24..32]);
    u64::from_be_bytes(arr) as usize
}

/// Run constraint checks and produce a report.
fn check_constraints(
    output: &AgentOutput,
    kernel_input: &KernelInputV1,
    constraint_set: &ConstraintSetV1,
) -> ConstraintReport {
    let max_actions_used = output.actions.len();
    let max_actions_limit = constraint_set.max_actions_per_output as usize;
    let max_actions_ok = max_actions_used <= max_actions_limit;

    // Parse snapshot for cooldown/drawdown
    let snapshot = StateSnapshotV1::decode(&kernel_input.opaque_agent_inputs);

    let (drawdown_ok, drawdown_bps) = if constraint_set.max_drawdown_bps < 10_000 {
        if let Some(ref snap) = snapshot {
            if snap.peak_equity > 0 && snap.current_equity <= snap.peak_equity {
                let dd = ((snap.peak_equity - snap.current_equity) as u128 * 10_000)
                    / snap.peak_equity as u128;
                let dd = dd as u32;
                (dd <= constraint_set.max_drawdown_bps, Some(dd))
            } else {
                (true, Some(0))
            }
        } else {
            (false, None) // snapshot required but missing
        }
    } else {
        (true, None) // drawdown disabled
    };

    let (cooldown_ok, cooldown_detail) = if constraint_set.cooldown_seconds > 0 {
        if let Some(ref snap) = snapshot {
            let required = snap.last_execution_ts + constraint_set.cooldown_seconds as u64;
            if snap.current_ts >= required {
                (true, "OK (cooldown elapsed)".to_string())
            } else {
                (
                    false,
                    format!(
                        "FAILED ({}s remaining)",
                        required - snap.current_ts
                    ),
                )
            }
        } else {
            (false, "FAILED (no state snapshot)".to_string())
        }
    } else {
        (true, "OK (no cooldown)".to_string())
    };

    // Run the actual constraint enforcement to catch action-level violations
    let enforcement_ok =
        constraints::enforce_constraints(kernel_input, output, constraint_set).is_ok();

    let overall_pass = enforcement_ok && max_actions_ok && drawdown_ok && cooldown_ok;

    ConstraintReport {
        max_actions_ok,
        max_actions_used,
        max_actions_limit,
        drawdown_ok,
        drawdown_bps,
        drawdown_limit_bps: constraint_set.max_drawdown_bps,
        cooldown_ok,
        cooldown_detail,
        leverage_ok: true, // leverage check is reserved in v1
        overall_pass,
    }
}

/// Pretty-print the simulation results.
fn print_results(
    actions: &[ActionDisplay],
    report: &ConstraintReport,
    equity: u64,
    nonce: u64,
    agent_id: &str,
) {
    // Header
    println!();
    println!("--- Simulation Result -------------------------------------------");
    println!();
    println!(
        "  Agent:   {}...{}",
        &agent_id[..10.min(agent_id.len())],
        if agent_id.len() > 10 {
            &agent_id[agent_id.len() - 4..]
        } else {
            ""
        }
    );
    println!("  Nonce:   {}", nonce);

    // Format equity assuming 6 decimals (USDC-like)
    let equity_whole = equity / 1_000_000;
    let equity_frac = equity % 1_000_000;
    println!("  Equity:  {}.{:06} USDC", equity_whole, equity_frac);
    println!();

    // Actions table
    if actions.is_empty() {
        println!("  Actions: (none)");
    } else {
        println!("  Actions ({}):", actions.len());

        // Calculate column widths
        let type_width = actions
            .iter()
            .map(|a| a.action_type.len())
            .max()
            .unwrap_or(4)
            .max(4);
        let target_width = 14; // 0x + 12 hex chars (truncated)

        println!(
            "  {:<3} {:<width_t$} {:<width_a$} {}",
            "#",
            "Type",
            "Target",
            "Details",
            width_t = type_width,
            width_a = target_width
        );
        println!(
            "  {:-<3} {:-<width_t$} {:-<width_a$} {:-<30}",
            "",
            "",
            "",
            "",
            width_t = type_width,
            width_a = target_width
        );

        for action in actions {
            let short_target = if action.target.len() > 14 {
                format!("{}..{}", &action.target[..8], &action.target[action.target.len() - 4..])
            } else {
                action.target.clone()
            };
            println!(
                "  {:<3} {:<width_t$} {:<width_a$} {}",
                action.index + 1,
                action.action_type,
                short_target,
                action.details,
                width_t = type_width,
                width_a = target_width
            );
        }
    }

    println!();

    // Constraints
    println!("  Constraints:");

    let check = |ok: bool| if ok { "+" } else { "x" };

    println!(
        "    [{}] Max actions     {} / {}",
        check(report.max_actions_ok),
        report.max_actions_used,
        report.max_actions_limit
    );

    if let Some(dd) = report.drawdown_bps {
        let dd_pct = dd as f64 / 100.0;
        let limit_pct = report.drawdown_limit_bps as f64 / 100.0;
        println!(
            "    [{}] Drawdown        {:.2}% / {:.2}% max",
            check(report.drawdown_ok),
            dd_pct,
            limit_pct
        );
    } else if report.drawdown_limit_bps < 10_000 {
        println!(
            "    [{}] Drawdown        (no snapshot)",
            check(report.drawdown_ok)
        );
    } else {
        println!("    [+] Drawdown        (disabled)");
    }

    println!(
        "    [{}] Cooldown        {}",
        check(report.cooldown_ok),
        report.cooldown_detail
    );
    println!("    [+] Leverage        (reserved)");

    println!();

    if report.overall_pass {
        println!("  Result: PASS");
    } else {
        println!("  Result: FAIL (constraint violation)");
    }

    println!("  -----------------------------------------------------------------");
    println!();
}

/// Main entry point for agent simulation binaries.
///
/// Call this from your agent's `src/bin/sim.rs`:
/// ```ignore
/// fn main() {
///     kernel_sdk::simulator::run_and_print(my_agent::agent_main, std::env::args());
/// }
/// ```
pub fn run_and_print(
    agent_fn: fn(&AgentContext, &[u8]) -> AgentOutput,
    mut args: std::env::Args,
) {
    let _program = args.next(); // skip binary name
    let fixture_path = match args.next() {
        Some(path) => path,
        None => {
            eprintln!("Usage: sim <fixture.json>");
            eprintln!();
            eprintln!("  Run agent simulation against a JSON fixture file.");
            eprintln!();
            // List available fixtures
            if let Ok(entries) = std::fs::read_dir("fixtures") {
                let fixtures: Vec<_> = entries
                    .filter_map(|e| e.ok())
                    .filter(|e| {
                        e.path()
                            .extension()
                            .map_or(false, |ext| ext == "json")
                    })
                    .collect();
                if !fixtures.is_empty() {
                    eprintln!("Available fixtures:");
                    for f in &fixtures {
                        eprintln!("  fixtures/{}", f.file_name().to_string_lossy());
                    }
                }
            }
            std::process::exit(1);
        }
    };

    // Load fixture
    let fixture = match load_fixture(&fixture_path) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("Error loading fixture: {}", e);
            std::process::exit(1);
        }
    };

    // Resolve fixture directory for relative file paths
    let fixture_dir = Path::new(&fixture_path)
        .parent()
        .unwrap_or_else(|| Path::new("."));

    // Resolve opaque inputs
    let opaque_inputs = match resolve_opaque_inputs(&fixture, fixture_dir) {
        Ok(inputs) => inputs,
        Err(e) => {
            eprintln!("Error resolving opaque inputs: {}", e);
            std::process::exit(1);
        }
    };

    // Build context
    let ctx = match build_context(&fixture) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Error building context: {}", e);
            std::process::exit(1);
        }
    };

    // Execute agent
    let output = agent_fn(&ctx, &opaque_inputs);

    // Format actions
    let action_displays: Vec<ActionDisplay> = output
        .actions
        .iter()
        .enumerate()
        .map(|(i, a)| format_action(a, i))
        .collect();

    // Build kernel input for constraint checking
    let kernel_input = match build_kernel_input(&fixture, &opaque_inputs) {
        Ok(ki) => ki,
        Err(e) => {
            eprintln!("Error building kernel input: {}", e);
            std::process::exit(1);
        }
    };

    // Check constraints
    let constraint_set = build_constraints(&fixture);
    let report = check_constraints(&output, &kernel_input, &constraint_set);

    // Print results
    print_results(
        &action_displays,
        &report,
        fixture.equity,
        fixture.execution_nonce,
        &fixture.agent_id,
    );

    // Exit code: 0 = pass, 1 = fail
    if !report.overall_pass {
        std::process::exit(1);
    }
}
```

**Step 2: Add module declaration to lib.rs**

In `crates/sdk/kernel-sdk/src/lib.rs`, after the testing module (line 103), add:

```rust
#[cfg(feature = "simulator")]
pub mod simulator;
```

**Step 3: Verify it compiles**

Run: `cargo check -p kernel-sdk --features simulator`
Expected: Compiles with no errors.

**Step 4: Commit**

```bash
git add crates/sdk/kernel-sdk/src/simulator.rs crates/sdk/kernel-sdk/src/lib.rs
git commit -m "feat(kernel-sdk): add simulator module for native-mode agent execution"
```

---

### Task 3: Add `sim` subcommand to tal-cli

**Files:**
- Create: `crates/tal-cli/src/sim.rs`
- Modify: `crates/tal-cli/src/main.rs`

**Step 1: Create `sim.rs` module**

Create `crates/tal-cli/src/sim.rs`:

```rust
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
        let bin_section = format!(
            r#"
[[bin]]
name = "sim"
path = "src/bin/sim.rs"
required-features = ["simulator"]
"#
        );

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
                            .map_or(false, |ext| ext == "json")
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
```

**Step 2: Add `Sim` variant to Commands enum and routing in `main.rs`**

In `crates/tal-cli/src/main.rs`, add:

1. At line 11, add the module declaration:
```rust
mod sim;
```

2. In the `Commands` enum (after the `Monitor` variant), add:
```rust
    /// Simulate agent execution against a fixture (no zkVM required)
    Sim {
        /// Path to fixture JSON file
        fixture: Option<String>,

        /// List available fixtures
        #[arg(long)]
        list: bool,
    },
```

3. In the `match cli.command` block (after the `Monitor` arm), add:
```rust
        Commands::Sim { fixture, list } => sim::run(fixture.as_deref(), list, cli.verbose),
```

**Step 3: Verify it compiles**

Run: `cargo check -p tal-cli`
Expected: Compiles with no errors.

**Step 4: Commit**

```bash
git add crates/tal-cli/src/sim.rs crates/tal-cli/src/main.rs
git commit -m "feat(tal-cli): add tal sim subcommand for native agent simulation"
```

---

### Task 4: Add sim binary and fixture to example-yield-agent

**Files:**
- Create: `crates/agents/example-yield-agent/agent/src/bin/sim.rs`
- Create: `crates/agents/example-yield-agent/agent/fixtures/sample.json`
- Modify: `crates/agents/example-yield-agent/agent/Cargo.toml`

**Step 1: Create `src/bin/sim.rs`**

Create `crates/agents/example-yield-agent/agent/src/bin/sim.rs`:

```rust
fn main() {
    kernel_sdk::simulator::run_and_print(example_yield_agent::agent_main, std::env::args());
}
```

**Step 2: Create `fixtures/sample.json`**

Create `crates/agents/example-yield-agent/agent/fixtures/sample.json`:

```json
{
  "agent_id": "0x0000000000000000000000000000000000000000000000000000000000000001",
  "vault_address": "0x1111111111111111111111111111111111111111",
  "equity": 10000000,
  "execution_nonce": 1,
  "opaque_inputs": "0x11111111111111111111111111111111111111112222222222222222222222222222222222222222a086010000000000"
}
```

This fixture encodes a `YieldInput` with:
- `vault_address`: `0x1111...1111` (20 bytes)
- `mock_yield_address`: `0x2222...2222` (20 bytes)
- `transfer_amount`: 100000 (u64 LE = `0xa086010000000000`)

**Step 3: Update Cargo.toml**

In `crates/agents/example-yield-agent/agent/Cargo.toml`, add after the `[lib]` section:

```toml
[[bin]]
name = "sim"
path = "src/bin/sim.rs"
required-features = ["simulator"]

[features]
default = []
simulator = ["kernel-sdk/simulator"]
```

**Step 4: Verify it compiles and runs**

Run: `cd crates/agents/example-yield-agent/agent && cargo run --bin sim --features simulator -- fixtures/sample.json`

Expected output:
```
--- Simulation Result -------------------------------------------

  Agent:   0x00000000...0001
  Nonce:   1
  Equity:  10.000000 USDC

  Actions (2):
  #   Type           Target         Details
  --- -------------- -------------- ------------------------------
  1   CALL           0x2222..2222   selector=0x00000000 calldata=0B
  2   CALL           0x2222..2222   selector=0x51cff8d9 calldata=32B

  Constraints:
    [+] Max actions     2 / 64
    [+] Drawdown        (disabled)
    [+] Cooldown        OK (no cooldown)
    [+] Leverage        (reserved)

  Result: PASS
  -----------------------------------------------------------------
```

**Step 5: Commit**

```bash
git add crates/agents/example-yield-agent/agent/src/bin/sim.rs \
        crates/agents/example-yield-agent/agent/fixtures/sample.json \
        crates/agents/example-yield-agent/agent/Cargo.toml
git commit -m "feat(example-yield-agent): add simulator binary and sample fixture"
```

---

### Task 5: Update `tal init` templates to include sim binary + fixtures

**Files:**
- Modify: `crates/tal-cli/src/init.rs`

**Step 1: Update the scaffold functions**

In `crates/tal-cli/src/init.rs`, find the template generation functions. For each template (minimal, yield), update:

1. **Add `src/bin/` to `create_dirs()`**: Include `agent/src/bin` in the directory creation.

2. **Generate `src/bin/sim.rs`**: After writing `agent/src/lib.rs`, also write:

```rust
let sim_content = format!(
    "fn main() {{\n    kernel_sdk::simulator::run_and_print({}::agent_main, std::env::args());\n}}\n",
    agent_ident
);
std::fs::write(agent_dir.join("src/bin/sim.rs"), &sim_content)?;
```

3. **Generate `fixtures/sample.json`**: Write an appropriate fixture for each template:

For **minimal** template:
```json
{
  "agent_id": "0x0000000000000000000000000000000000000000000000000000000000000001",
  "equity": 1000000,
  "execution_nonce": 1,
  "opaque_inputs": "0x"
}
```

For **yield** template:
```json
{
  "agent_id": "0x0000000000000000000000000000000000000000000000000000000000000001",
  "vault_address": "0x1111111111111111111111111111111111111111",
  "equity": 10000000,
  "execution_nonce": 1,
  "opaque_inputs": "0x11111111111111111111111111111111111111112222222222222222222222222222222222222222a086010000000000"
}
```

4. **Add `[[bin]]` and `[features]` to generated Cargo.toml**: In the Cargo.toml generation, append:

```toml
[[bin]]
name = "sim"
path = "src/bin/sim.rs"
required-features = ["simulator"]

[features]
default = []
simulator = ["kernel-sdk/simulator"]
```

**Step 2: Verify by running `tal init`**

Run: `cd /tmp && tal init test-sim-agent --template minimal --no-interactive`
Then: `cd test-sim-agent/agent && ls src/bin/sim.rs fixtures/sample.json`

Expected: Both files exist.

Run: `cargo run --bin sim --features simulator -- fixtures/sample.json`
Expected: Simulation runs and prints results.

**Step 3: Commit**

```bash
git add crates/tal-cli/src/init.rs
git commit -m "feat(tal-cli): include simulator binary and fixtures in init templates"
```

---

### Task 6: Add tests for the simulator module

**Files:**
- Modify: `crates/sdk/kernel-sdk/src/simulator.rs` (add tests module)

**Step 1: Add unit tests at the bottom of `simulator.rs`**

Append to `crates/sdk/kernel-sdk/src/simulator.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_hex_valid() {
        assert_eq!(parse_hex("0xdeadbeef").unwrap(), vec![0xde, 0xad, 0xbe, 0xef]);
        assert_eq!(parse_hex("deadbeef").unwrap(), vec![0xde, 0xad, 0xbe, 0xef]);
        assert_eq!(parse_hex("0x").unwrap(), vec![]);
    }

    #[test]
    fn test_parse_hex_invalid() {
        assert!(parse_hex("0xgg").is_err());
        assert!(parse_hex("0xabc").is_err()); // odd length
    }

    #[test]
    fn test_parse_hex_fixed() {
        let result = parse_hex_fixed::<4>("0xdeadbeef").unwrap();
        assert_eq!(result, [0xde, 0xad, 0xbe, 0xef]);

        // Wrong size
        assert!(parse_hex_fixed::<3>("0xdeadbeef").is_err());
    }

    #[test]
    fn test_hex_encode() {
        assert_eq!(hex_encode(&[0xde, 0xad]), "0xdead");
        assert_eq!(hex_encode(&[]), "0x");
    }

    #[test]
    fn test_load_fixture_json() {
        let json = r#"{
            "agent_id": "0x0000000000000000000000000000000000000000000000000000000000000001",
            "equity": 10000000,
            "execution_nonce": 5,
            "opaque_inputs": "0xdeadbeef"
        }"#;

        let fixture: SimFixture = serde_json::from_str(json).unwrap();
        assert_eq!(fixture.equity, 10_000_000);
        assert_eq!(fixture.execution_nonce, 5);
        assert_eq!(
            fixture.opaque_inputs.as_deref(),
            Some("0xdeadbeef")
        );
    }

    #[test]
    fn test_load_fixture_defaults() {
        let json = "{}";
        let fixture: SimFixture = serde_json::from_str(json).unwrap();
        assert_eq!(fixture.equity, 0);
        assert_eq!(fixture.execution_nonce, 1);
        assert!(fixture.opaque_inputs.is_none());
    }

    #[test]
    fn test_build_context() {
        let fixture = SimFixture {
            agent_id: format!("0x{}", "ab".repeat(32)),
            agent_code_hash: format!("0x{}", "cd".repeat(32)),
            vault_address: format!("0x{}", "11".repeat(20)),
            equity: 5_000_000,
            execution_nonce: 42,
            opaque_inputs: None,
            opaque_inputs_file: None,
            constraints: None,
        };

        let ctx = build_context(&fixture).unwrap();
        assert_eq!(ctx.execution_nonce, 42);
        assert_eq!(ctx.agent_id, [0xab; 32]);
        assert_eq!(ctx.agent_code_hash, [0xcd; 32]);
    }

    #[test]
    fn test_build_constraints_defaults() {
        let fixture = SimFixture {
            agent_id: default_bytes32_hex(),
            agent_code_hash: default_bytes32_hex(),
            vault_address: default_address_hex(),
            equity: 0,
            execution_nonce: 1,
            opaque_inputs: None,
            opaque_inputs_file: None,
            constraints: None,
        };

        let cs = build_constraints(&fixture);
        assert_eq!(cs.max_drawdown_bps, 10_000);
        assert_eq!(cs.cooldown_seconds, 0);
    }

    #[test]
    fn test_build_constraints_overrides() {
        let fixture = SimFixture {
            agent_id: default_bytes32_hex(),
            agent_code_hash: default_bytes32_hex(),
            vault_address: default_address_hex(),
            equity: 0,
            execution_nonce: 1,
            opaque_inputs: None,
            opaque_inputs_file: None,
            constraints: Some(ConstraintOverrides {
                max_drawdown_bps: Some(500),
                cooldown_seconds: Some(60),
                max_leverage_bps: None,
                max_actions_per_output: Some(10),
            }),
        };

        let cs = build_constraints(&fixture);
        assert_eq!(cs.max_drawdown_bps, 500);
        assert_eq!(cs.cooldown_seconds, 60);
        assert_eq!(cs.max_actions_per_output, 10);
    }

    #[test]
    fn test_format_action_no_op() {
        let action = kernel_core::ActionV1 {
            action_type: ACTION_TYPE_NO_OP,
            target: [0u8; 32],
            payload: Vec::new(),
        };
        let display = format_action(&action, 0);
        assert_eq!(display.action_type, "NO_OP");
        assert_eq!(display.details, "(skip)");
    }

    #[test]
    fn test_u256_to_u128() {
        let mut bytes = [0u8; 32];
        bytes[31] = 42;
        assert_eq!(u256_to_u128(&bytes), 42);
    }
}
```

**Step 2: Run the tests**

Run: `cargo test -p kernel-sdk --features simulator`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add crates/sdk/kernel-sdk/src/simulator.rs
git commit -m "test(kernel-sdk): add unit tests for simulator module"
```

---

### Task 7: Integration test — end-to-end simulation

**Files:**
- (No new files — test from the example-yield-agent directory)

**Step 1: Run the full simulation end-to-end**

Run from repo root:
```bash
cd crates/agents/example-yield-agent/agent && \
cargo run --bin sim --features simulator -- fixtures/sample.json
```

Expected: Exit code 0, output shows 2 CALL actions and all constraints passing.

**Step 2: Test constraint failure**

Create a temporary fixture with tight drawdown:
```bash
cat > /tmp/tight-drawdown.json << 'EOF'
{
  "agent_id": "0x0000000000000000000000000000000000000000000000000000000000000001",
  "equity": 10000000,
  "execution_nonce": 1,
  "opaque_inputs": "0x11111111111111111111111111111111111111112222222222222222222222222222222222222222a086010000000000",
  "constraints": {
    "max_drawdown_bps": 100,
    "cooldown_seconds": 9999
  }
}
EOF
```

Run: `cargo run --bin sim --features simulator -- /tmp/tight-drawdown.json; echo "EXIT: $?"`

Expected: Exit code 1, output shows cooldown FAILED (no snapshot in opaque_inputs for cooldown check).

**Step 3: Verify `tal sim` command**

From repo root:
```bash
cd crates/agents/example-yield-agent && tal sim agent/fixtures/sample.json
```

Expected: Same output as Step 1.

**Step 4: Commit (no changes needed — verification only)**

No commit needed for this task.

---

### Task 8: Verify full workspace builds cleanly

**Step 1: Run workspace check**

Run: `cargo check --workspace`
Expected: No errors.

**Step 2: Run clippy**

Run: `cargo clippy -p kernel-sdk --features simulator -- -D warnings`
Expected: No warnings.

Run: `cargo clippy -p tal-cli -- -D warnings`
Expected: No warnings.

**Step 3: Run existing tests**

Run: `cargo test -p kernel-sdk`
Expected: All existing tests still pass.

Run: `cargo test -p kernel-sdk --features simulator`
Expected: All tests (existing + new simulator tests) pass.

**Step 4: Final commit if any fixes needed**

```bash
git commit -m "chore: fix clippy warnings from simulator integration"
```
