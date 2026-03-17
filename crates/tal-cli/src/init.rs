//! `tal init` — Scaffold a new agent project from a template.
//!
//! Generates a complete, ready-to-build agent project with:
//! - agent/src/lib.rs with agent_main() and agent_entrypoint! macro
//! - agent/build.rs with AGENT_CODE_HASH computation
//! - risc0-methods/ with zkvm-guest entry point
//! - host/ with CLI orchestrator (for perp-trader template)
//! - .env.example with all required configuration
//! - README.md with build/test/deploy instructions

use anyhow::{bail, Context, Result};
use colored::Colorize;
use std::fs;
use std::path::{Path, PathBuf};

/// Available templates for agent scaffolding.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Template {
    Minimal,
    Yield,
    PerpTrader,
}

impl Template {
    fn parse(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "minimal" => Some(Self::Minimal),
            "yield" | "yield-farmer" => Some(Self::Yield),
            "perp-trader" | "perp" | "trading" => Some(Self::PerpTrader),
            _ => None,
        }
    }

    fn description(&self) -> &str {
        match self {
            Self::Minimal => "Bare agent with NO_OP action — simplest starting point",
            Self::Yield => "DeFi yield farming agent — deposit/withdraw pattern",
            Self::PerpTrader => "Perpetual trading agent — full Hyperliquid integration",
        }
    }
}

pub fn run(
    name: &str,
    template_str: &str,
    output: Option<&str>,
    interactive: bool,
    verbose: bool,
) -> Result<()> {
    // Parse template
    let template = if interactive && template_str == "minimal" {
        // Interactive mode: ask which template
        select_template_interactive()?
    } else {
        Template::parse(template_str).with_context(|| {
            format!(
                "Unknown template '{}'. Available: minimal, yield, perp-trader",
                template_str
            )
        })?
    };

    // Validate name
    validate_name(name)?;

    // Determine output directory and whether we're inside the workspace
    let workspace_root = find_workspace_root().ok();
    let standalone = workspace_root.is_none();

    let output_dir = match output {
        Some(dir) => PathBuf::from(dir),
        None => {
            if let Some(ref root) = workspace_root {
                root.join(format!("crates/agents/{}", name))
            } else {
                // Standalone mode: create in current directory
                PathBuf::from(name)
            }
        }
    };

    if output_dir.exists() {
        bail!(
            "Directory already exists: {}\n  Remove it first or choose a different name.",
            output_dir.display()
        );
    }

    println!(
        "{} Scaffolding agent '{}' with template '{:?}'",
        "●".cyan(),
        name.bold(),
        template
    );
    println!("  Output: {}", output_dir.display());
    println!("  Template: {}", template.description());
    println!();

    // Create directory structure
    create_dirs(&output_dir)?;

    // Generate all files
    generate_agent_files(&output_dir, name, template, standalone)?;
    generate_risc0_methods(&output_dir, name, standalone)?;
    generate_env_example(&output_dir, template)?;
    generate_readme(&output_dir, name, template)?;

    if matches!(template, Template::PerpTrader) {
        generate_host(&output_dir, name, standalone)?;
    }

    // Generate manifest
    generate_manifest(&output_dir, name)?;

    // Print post-scaffolding instructions
    println!();
    println!("  {} Agent scaffolded successfully!", "✓".green());

    if standalone {
        println!();
        println!("  {} Standalone project created at: {}", "ℹ".blue(), output_dir.display());
        println!("    Dependencies use git sources from the Tokamak-AI-Layer repo.");
    } else {
        println!();
        println!("  {} Add to workspace Cargo.toml:", "→".yellow());

        let rel = output_dir
            .strip_prefix(workspace_root.as_deref().unwrap_or(Path::new("")))
            .unwrap_or(&output_dir);
        println!("    \"{}/agent\",", rel.display());
        println!("    \"{}/risc0-methods\",", rel.display());
        if matches!(template, Template::PerpTrader) {
            println!("    \"{}/host\",", rel.display());
        }
    }

    println!();
    println!("  {} Next steps:", "→".yellow());
    println!("    1. Edit agent/src/lib.rs — implement your agent logic");
    println!("    2. tal test --local — test with instant feedback");
    println!("    3. tal build --elf — build zkVM binary");
    println!("    4. tal doctor — validate everything before deploy");
    println!("    5. tal deploy --testnet — deploy to testnet");

    if verbose {
        println!();
        println!("  Generated files:");
        print_tree(&output_dir, 0)?;
    }

    Ok(())
}

fn validate_name(name: &str) -> Result<()> {
    if name.is_empty() {
        bail!("Agent name cannot be empty");
    }
    if name.chars().next().is_some_and(|c| c.is_ascii_digit()) {
        bail!("Agent name cannot start with a digit");
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        bail!("Agent name must contain only alphanumeric characters, hyphens, or underscores");
    }
    Ok(())
}

fn select_template_interactive() -> Result<Template> {
    use dialoguer::Select;

    let templates = vec![
        format!(
            "{} — {}",
            "minimal".bold(),
            Template::Minimal.description()
        ),
        format!("{} — {}", "yield".bold(), Template::Yield.description()),
        format!(
            "{} — {}",
            "perp-trader".bold(),
            Template::PerpTrader.description()
        ),
    ];

    let selection = Select::new()
        .with_prompt("Select agent template")
        .items(&templates)
        .default(0)
        .interact()?;

    Ok(match selection {
        0 => Template::Minimal,
        1 => Template::Yield,
        2 => Template::PerpTrader,
        _ => Template::Minimal,
    })
}

fn find_workspace_root() -> Result<PathBuf> {
    let mut dir = std::env::current_dir()?;
    loop {
        let cargo_toml = dir.join("Cargo.toml");
        if cargo_toml.exists() {
            let content = fs::read_to_string(&cargo_toml)?;
            if content.contains("[workspace]") {
                return Ok(dir);
            }
        }
        if !dir.pop() {
            bail!("Could not find workspace root (no Cargo.toml with [workspace] found)");
        }
    }
}

fn create_dirs(root: &Path) -> Result<()> {
    let dirs = [
        root.join("agent/src"),
        root.join("risc0-methods/src"),
        root.join("risc0-methods/zkvm-guest/src"),
        root.join("dist"),
    ];
    for dir in dirs {
        fs::create_dir_all(&dir)
            .with_context(|| format!("Failed to create directory: {}", dir.display()))?;
    }
    Ok(())
}

fn write_file(path: &Path, content: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, content).with_context(|| format!("Failed to write: {}", path.display()))
}

// ===========================================================================
// Agent Files
// ===========================================================================

fn generate_agent_files(root: &Path, name: &str, template: Template, standalone: bool) -> Result<()> {
    let _name_snake = name.replace('-', "_");

    let kernel_sdk_dep = if standalone {
        r#"kernel-sdk = { git = "https://github.com/tokamak-network/Tokamak-AI-Layer.git", branch = "master" }"#
    } else {
        r#"kernel-sdk = { path = "../../../../crates/sdk/kernel-sdk" }"#
    };

    // Cargo.toml
    write_file(
        &root.join("agent/Cargo.toml"),
        &format!(
            r#"[package]
name = "{name}"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["rlib"]

[dependencies]
{kernel_sdk_dep}

[build-dependencies]
sha2 = {{ version = "0.10", default-features = false }}
"#
        ),
    )?;

    // build.rs
    write_file(
        &root.join("agent/build.rs"),
        &gen_build_rs(name),
    )?;

    // src/lib.rs
    let lib_rs = match template {
        Template::Minimal => gen_agent_lib_minimal(),
        Template::Yield => gen_agent_lib_yield(),
        Template::PerpTrader => gen_agent_lib_perp_trader(),
    };
    write_file(&root.join("agent/src/lib.rs"), &lib_rs)?;

    Ok(())
}

fn gen_build_rs(name: &str) -> String {
    format!(
        r#"//! Build script for {name} — computes AGENT_CODE_HASH.
//!
//! AGENT_CODE_HASH = SHA256(src/lib.rs || 0x00 || Cargo.toml)
//! This hash binds the zkVM proof to this specific agent implementation.
//!
//! WARNING: Always use the .bin file (NOT the raw ELF) when creating bundles.
//! The raw ELF causes "Malformed ProgramBinary" errors at proof time.

use sha2::{{Digest, Sha256}};
use std::{{env, fs, io::Write, path::Path}};

fn main() {{
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set");
    let manifest_path = Path::new(&manifest_dir);
    let files_to_hash = ["src/lib.rs", "Cargo.toml"];

    for file in &files_to_hash {{
        println!("cargo:rerun-if-changed={{}}", manifest_path.join(file).display());
    }}
    println!("cargo:rerun-if-changed=build.rs");

    let mut hasher = Sha256::new();
    for (i, file) in files_to_hash.iter().enumerate() {{
        let path = manifest_path.join(file);
        let content = fs::read(&path)
            .unwrap_or_else(|e| panic!("Failed to read {{}}: {{}}", path.display(), e));
        hasher.update(&content);
        if i < files_to_hash.len() - 1 {{
            hasher.update([0x00]);
        }}
    }}

    let hash: [u8; 32] = hasher.finalize().into();
    let out_path = Path::new(&env::var("OUT_DIR").unwrap()).join("agent_hash.rs");
    let mut file = fs::File::create(&out_path).unwrap();

    writeln!(file, "// Auto-generated by build.rs — DO NOT EDIT").unwrap();
    write!(file, "pub const AGENT_CODE_HASH: [u8; 32] = [").unwrap();
    for (i, byte) in hash.iter().enumerate() {{
        if i > 0 {{ write!(file, ", ").unwrap(); }}
        write!(file, "0x{{:02x}}", byte).unwrap();
    }}
    writeln!(file, "];").unwrap();

    let hash_hex: String = hash.iter().map(|b| format!("{{:02x}}", b)).collect();
    println!("cargo:warning=AGENT_CODE_HASH ({name}): {{}}", hash_hex);
}}
"#
    )
}

fn gen_agent_lib_minimal() -> String {
    r#"//! Minimal Agent — returns a single NO_OP action.
//!
//! Edit this file to implement your agent logic. The `agent_main` function
//! receives execution context and raw input bytes, and returns actions to
//! execute on-chain.
//!
//! # Quick Start
//!
//! 1. Parse your input bytes in `agent_main()`
//! 2. Build actions using `CallBuilder` or ERC20 helpers
//! 3. Return them in `AgentOutput`
//! 4. Test: `tal test --local`
//! 5. Build: `tal build --elf`

#![no_std]
#![deny(unsafe_code)]

extern crate alloc;

use alloc::vec;
use kernel_sdk::prelude::*;

include!(concat!(env!("OUT_DIR"), "/agent_hash.rs"));

/// Agent entrypoint — implement your logic here.
///
/// # Arguments
/// - `ctx`: Execution context (agent_id, nonce, code_hash, etc.)
/// - `opaque_inputs`: Raw input bytes from the host
///
/// # Returns
/// `AgentOutput` containing the actions to execute on-chain.
pub extern "Rust" fn agent_main(_ctx: &AgentContext, _opaque_inputs: &[u8]) -> AgentOutput {
    // TODO: Parse your inputs
    // TODO: Compute your strategy
    // TODO: Build actions with CallBuilder

    // Placeholder: return a no-op action
    AgentOutput {
        actions: vec![no_op_action()],
    }
}

const _: AgentEntrypoint = agent_main;
kernel_sdk::agent_entrypoint!(agent_main);

#[cfg(test)]
mod tests {
    use super::*;

    fn test_ctx() -> AgentContext {
        AgentContext {
            protocol_version: 1,
            kernel_version: 1,
            agent_id: [0u8; 32],
            agent_code_hash: AGENT_CODE_HASH,
            constraint_set_hash: [0u8; 32],
            input_root: [0u8; 32],
            execution_nonce: 1,
        }
    }

    #[test]
    fn test_produces_output() {
        let output = agent_main(&test_ctx(), &[]);
        assert!(!output.actions.is_empty());
    }

    #[test]
    fn test_deterministic() {
        let input = [1, 2, 3, 4];
        let a = agent_main(&test_ctx(), &input);
        let b = agent_main(&test_ctx(), &input);
        assert_eq!(a.actions.len(), b.actions.len());
    }
}
"#
    .to_string()
}

fn gen_agent_lib_yield() -> String {
    r#"//! Yield Farming Agent — deposit/withdraw pattern.
//!
//! Demonstrates a simple DeFi yield strategy:
//! 1. Deposit funds to a yield source
//! 2. Withdraw funds + yield back to the vault
//!
//! # Input Format (48 bytes)
//! ```text
//! [0:20]   vault_address (20 bytes)
//! [20:40]  yield_source_address (20 bytes)
//! [40:48]  transfer_amount (u64 LE)
//! ```

#![no_std]
#![deny(unsafe_code)]

extern crate alloc;

use alloc::{vec, vec::Vec};
use kernel_sdk::prelude::*;
use kernel_sdk::actions::CallBuilder;

include!(concat!(env!("OUT_DIR"), "/agent_hash.rs"));

/// Withdraw function selector: keccak256("withdraw(address)")[:4]
const WITHDRAW_SELECTOR: u32 = 0x51cff8d9;

kernel_sdk::agent_input! {
    struct YieldInput {
        vault_address: [u8; 20],
        yield_source_address: [u8; 20],
        transfer_amount: u64,
    }
}

pub extern "Rust" fn agent_main(_ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput {
    let input = match YieldInput::decode(opaque_inputs) {
        Some(i) => i,
        None => return AgentOutput { actions: Vec::new() },
    };

    // Action 1: Deposit to yield source
    let deposit = CallBuilder::new(input.yield_source_address)
        .value(input.transfer_amount as u128)
        .build();

    // Action 2: Withdraw from yield source back to vault
    let withdraw = CallBuilder::new(input.yield_source_address)
        .selector(WITHDRAW_SELECTOR)
        .param_address(&input.vault_address)
        .build();

    AgentOutput {
        actions: vec![deposit, withdraw],
    }
}

const _: AgentEntrypoint = agent_main;
kernel_sdk::agent_entrypoint!(agent_main);

#[cfg(test)]
mod tests {
    use super::*;

    fn test_ctx() -> AgentContext {
        AgentContext {
            protocol_version: 1,
            kernel_version: 1,
            agent_id: [0x42u8; 32],
            agent_code_hash: AGENT_CODE_HASH,
            constraint_set_hash: [0u8; 32],
            input_root: [0u8; 32],
            execution_nonce: 1,
        }
    }

    fn make_input(vault: [u8; 20], source: [u8; 20], amount: u64) -> Vec<u8> {
        let mut buf = Vec::with_capacity(48);
        buf.extend_from_slice(&vault);
        buf.extend_from_slice(&source);
        buf.extend_from_slice(&amount.to_le_bytes());
        buf
    }

    #[test]
    fn test_produces_two_actions() {
        let input = make_input([0x11; 20], [0x22; 20], 1_000_000);
        let output = agent_main(&test_ctx(), &input);
        assert_eq!(output.actions.len(), 2);
        assert_eq!(output.actions[0].action_type, ACTION_TYPE_CALL);
        assert_eq!(output.actions[1].action_type, ACTION_TYPE_CALL);
    }

    #[test]
    fn test_invalid_input_returns_empty() {
        let output = agent_main(&test_ctx(), &[0u8; 10]);
        assert!(output.actions.is_empty());
    }
}
"#
    .to_string()
}

fn gen_agent_lib_perp_trader() -> String {
    r#"//! Perpetual Trading Agent — Hyperliquid integration template.
//!
//! This template demonstrates a perpetual futures trading strategy.
//! It reads market data, computes signals, and emits trading actions
//! targeting a HyperliquidAdapter contract.
//!
//! # Input Format
//! ```text
//! Part 1: StateSnapshotV1 (36 bytes) — cooldown/drawdown checks
//! Part 2: Market data (variable) — prices, position state, strategy params
//! ```
//!
//! # Output Actions
//! - `openPosition(bool isBuy, uint256 margin, uint256 size, uint256 price)`
//! - `closePositionAtPrice(uint64 price)`
//! - `depositMargin(uint256 amount)`
//!
//! # Architecture
//! The agent runs inside a zkVM guest. All computation is deterministic.
//! No I/O, no randomness, no system time. The host provides all data.

#![no_std]
#![deny(unsafe_code)]

extern crate alloc;

use alloc::{vec, vec::Vec};
use kernel_sdk::prelude::*;
use kernel_sdk::actions::CallBuilder;

include!(concat!(env!("OUT_DIR"), "/agent_hash.rs"));

// ===========================================================================
// Constants — match your deployed HyperliquidAdapter ABI
// ===========================================================================

/// openPosition(bool,uint256,uint256,uint256) selector
const OPEN_POSITION_SELECTOR: u32 = 0x04ba41cb;
/// closePositionAtPrice(uint64) selector
const CLOSE_AT_PRICE_SELECTOR: u32 = 0x2c0f36da;
/// depositMargin(uint256) selector
const DEPOSIT_MARGIN_SELECTOR: u32 = 0x19bd1776;

/// Price scale factor (prices encoded as fixed-point with 8 decimals)
const PRICE_SCALE: u64 = 100_000_000;

// ===========================================================================
// Input Parsing
// ===========================================================================

/// Trading input data provided by the host.
///
/// Customize these fields based on your strategy's data requirements.
/// The host (host/src/main.rs) is responsible for fetching and encoding
/// this data from external sources (APIs, on-chain state, etc.).
struct TradingInput {
    /// Target contract (HyperliquidAdapter address)
    adapter_address: [u8; 20],
    /// Current mark price (scaled by PRICE_SCALE)
    mark_price: u64,
    /// Current position size (0 = no position, >0 = long, encoding TBD)
    position_size: i64,
    /// Available margin in USDC (6 decimals)
    available_margin: u64,
    /// Strategy signal: 1 = buy, 2 = sell, 0 = hold
    signal: u8,
    /// Order size in asset units (scaled by PRICE_SCALE)
    order_size: u64,
}

impl TradingInput {
    const ENCODED_SIZE: usize = 20 + 8 + 8 + 8 + 1 + 8; // 53 bytes

    fn decode(data: &[u8]) -> Option<Self> {
        if data.len() < Self::ENCODED_SIZE {
            return None;
        }
        let mut offset = 0;

        let mut adapter_address = [0u8; 20];
        adapter_address.copy_from_slice(&data[offset..offset + 20]);
        offset += 20;

        let mark_price = u64::from_le_bytes(data[offset..offset + 8].try_into().ok()?);
        offset += 8;

        let position_size = i64::from_le_bytes(data[offset..offset + 8].try_into().ok()?);
        offset += 8;

        let available_margin = u64::from_le_bytes(data[offset..offset + 8].try_into().ok()?);
        offset += 8;

        let signal = data[offset];
        offset += 1;

        let order_size = u64::from_le_bytes(data[offset..offset + 8].try_into().ok()?);

        Some(Self {
            adapter_address,
            mark_price,
            position_size,
            available_margin,
            signal,
            order_size,
        })
    }
}

// ===========================================================================
// Agent Entry Point
// ===========================================================================

pub extern "Rust" fn agent_main(_ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput {
    // Skip StateSnapshotV1 (36 bytes) — consumed by constraint engine
    let market_data = if opaque_inputs.len() > 36 {
        &opaque_inputs[36..]
    } else {
        return AgentOutput { actions: vec![no_op_action()] };
    };

    let input = match TradingInput::decode(market_data) {
        Some(i) => i,
        None => return AgentOutput { actions: vec![no_op_action()] },
    };

    match input.signal {
        1 => open_long(&input),
        2 => close_position(&input),
        _ => AgentOutput { actions: vec![no_op_action()] },
    }
}

/// Build actions to open a long position.
fn open_long(input: &TradingInput) -> AgentOutput {
    // Compute limit price: mark * 1.05 (5% slippage tolerance)
    let limit_price = input.mark_price.saturating_mul(105) / 100;

    // Action 1: Deposit margin
    let deposit = CallBuilder::new(input.adapter_address)
        .selector(DEPOSIT_MARGIN_SELECTOR)
        .param_u256_from_u64(input.available_margin)
        .build();

    // Action 2: Open long position
    let open = CallBuilder::new(input.adapter_address)
        .selector(OPEN_POSITION_SELECTOR)
        .param_bool(true) // isBuy = true (long)
        .param_u256_from_u64(input.available_margin) // margin amount
        .param_u256_from_u64(input.order_size) // size
        .param_u256_from_u64(limit_price) // limit price
        .build();

    AgentOutput {
        actions: vec![deposit, open],
    }
}

/// Build actions to close an existing position.
fn close_position(input: &TradingInput) -> AgentOutput {
    // Compute limit price: mark * 0.95 (5% slippage for sell)
    let limit_price = input.mark_price.saturating_mul(95) / 100;

    let close = CallBuilder::new(input.adapter_address)
        .selector(CLOSE_AT_PRICE_SELECTOR)
        .param_u256_from_u64(limit_price)
        .build();

    AgentOutput {
        actions: vec![close],
    }
}

const _: AgentEntrypoint = agent_main;
kernel_sdk::agent_entrypoint!(agent_main);

#[cfg(test)]
mod tests {
    use super::*;

    fn test_ctx() -> AgentContext {
        AgentContext {
            protocol_version: 1,
            kernel_version: 1,
            agent_id: [0u8; 32],
            agent_code_hash: AGENT_CODE_HASH,
            constraint_set_hash: [0u8; 32],
            input_root: [0u8; 32],
            execution_nonce: 1,
        }
    }

    fn make_input(signal: u8, mark_price: u64) -> Vec<u8> {
        let mut buf = Vec::new();
        // StateSnapshotV1 placeholder (36 bytes)
        buf.extend_from_slice(&[0u8; 36]);
        // TradingInput
        buf.extend_from_slice(&[0x33; 20]); // adapter address
        buf.extend_from_slice(&mark_price.to_le_bytes());
        buf.extend_from_slice(&0i64.to_le_bytes()); // no position
        buf.extend_from_slice(&1_000_000u64.to_le_bytes()); // $1 margin
        buf.push(signal);
        buf.extend_from_slice(&100_000u64.to_le_bytes()); // order size
        buf
    }

    #[test]
    fn test_buy_signal_opens_long() {
        let input = make_input(1, 97_000 * PRICE_SCALE);
        let output = agent_main(&test_ctx(), &input);
        assert_eq!(output.actions.len(), 2, "Expected deposit + open");
        assert_eq!(output.actions[0].action_type, ACTION_TYPE_CALL);
        assert_eq!(output.actions[1].action_type, ACTION_TYPE_CALL);
    }

    #[test]
    fn test_sell_signal_closes() {
        let input = make_input(2, 97_000 * PRICE_SCALE);
        let output = agent_main(&test_ctx(), &input);
        assert_eq!(output.actions.len(), 1, "Expected close action");
    }

    #[test]
    fn test_hold_signal_noop() {
        let input = make_input(0, 97_000 * PRICE_SCALE);
        let output = agent_main(&test_ctx(), &input);
        assert_eq!(output.actions.len(), 1);
        assert_eq!(output.actions[0].action_type, ACTION_TYPE_NO_OP);
    }

    #[test]
    fn test_invalid_input_noop() {
        let output = agent_main(&test_ctx(), &[0u8; 10]);
        assert_eq!(output.actions[0].action_type, ACTION_TYPE_NO_OP);
    }
}
"#
    .to_string()
}

// ===========================================================================
// RISC Zero Methods
// ===========================================================================

fn generate_risc0_methods(root: &Path, name: &str, standalone: bool) -> Result<()> {
    let methods_name = format!("{}-risc0-methods", name);

    // risc0-methods/Cargo.toml
    write_file(
        &root.join("risc0-methods/Cargo.toml"),
        &format!(
            r#"[package]
name = "{methods_name}"
version = "0.1.0"
edition = "2021"

[build-dependencies]
risc0-build = {{ version = "3.0" }}

[package.metadata.risc0]
methods = ["zkvm-guest"]
"#
        ),
    )?;

    // risc0-methods/build.rs
    write_file(
        &root.join("risc0-methods/build.rs"),
        r#"fn main() {
    risc0_build::embed_methods();
}
"#,
    )?;

    // risc0-methods/src/lib.rs
    write_file(
        &root.join("risc0-methods/src/lib.rs"),
        r#"//! RISC Zero method IDs and ELF binaries for this agent.
//!
//! This crate is auto-generated by risc0-build. It provides:
//! - `ZKVM_GUEST_ELF`: The compiled guest ELF binary
//! - `ZKVM_GUEST_ID`: The IMAGE_ID (method ID) for proof verification

include!(concat!(env!("OUT_DIR"), "/methods.rs"));
"#,
    )?;

    // risc0-methods/zkvm-guest/Cargo.toml
    let kernel_guest_dep = if standalone {
        r#"kernel-guest = { git = "https://github.com/tokamak-network/Tokamak-AI-Layer.git", branch = "master" }"#
    } else {
        r#"kernel-guest = { path = "../../../../crates/runtime/kernel-guest" }"#
    };

    write_file(
        &root.join("risc0-methods/zkvm-guest/Cargo.toml"),
        &format!(
            r#"[package]
name = "{name}-zkvm-guest"
version = "0.1.0"
edition = "2021"

[workspace]

[dependencies]
risc0-zkvm = {{ version = "3.0", default-features = false, features = ["guest"] }}
{kernel_guest_dep}
{name} = {{ path = "../../agent" }}
"#
        ),
    )?;

    // risc0-methods/zkvm-guest/src/main.rs
    write_file(
        &root.join("risc0-methods/zkvm-guest/src/main.rs"),
        &format!(
            r#"//! zkVM guest entry point.
//!
//! This is a thin wrapper that calls the kernel runtime with your agent.
//! You should NOT modify this file — edit agent/src/lib.rs instead.

#![no_main]

risc0_zkvm::guest::entry!(main);

fn main() {{
    // The kernel runtime handles:
    // 1. Decoding KernelInputV1 from the host
    // 2. Verifying agent_code_hash matches this agent
    // 3. Calling your agent_main() function
    // 4. Enforcing constraints (unskippable)
    // 5. Computing action/input commitments
    // 6. Writing KernelJournalV1 (exactly 209 bytes)
    kernel_guest::kernel_main_with_agent(
        {name_snake}::kernel_main_with_constraints,
    );
}}
"#,
            name_snake = name.replace('-', "_")
        ),
    )?;

    Ok(())
}

// ===========================================================================
// Host (perp-trader template only)
// ===========================================================================

fn generate_host(root: &Path, name: &str, standalone: bool) -> Result<()> {
    fs::create_dir_all(root.join("host/src"))?;

    let (kernel_core_dep, constraints_dep) = if standalone {
        (
            r#"kernel-core = { git = "https://github.com/tokamak-network/Tokamak-AI-Layer.git", branch = "master" }"#,
            r#"constraints = { git = "https://github.com/tokamak-network/Tokamak-AI-Layer.git", branch = "master" }"#,
        )
    } else {
        (
            r#"kernel-core = { path = "../../../../crates/protocol/kernel-core" }"#,
            r#"constraints = { path = "../../../../crates/protocol/constraints" }"#,
        )
    };

    // host/Cargo.toml
    write_file(
        &root.join("host/Cargo.toml"),
        &format!(
            r#"[package]
name = "{name}-host"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "{name}-host"
path = "src/main.rs"

[dependencies]
clap = {{ version = "4", features = ["derive"] }}
anyhow = "1"
tokio = {{ version = "1", features = ["rt-multi-thread", "macros", "time"] }}
serde = {{ version = "1", features = ["derive"] }}
serde_json = "1"
hex = "0.4"
reqwest = {{ version = "0.12", features = ["json"] }}
dotenv = "0.15"
sha2 = {{ version = "0.10" }}

# Agent crate (for AGENT_CODE_HASH)
{name} = {{ path = "../agent" }}

# Kernel types
{kernel_core_dep}
{constraints_dep}

# Optional: proving
# risc0-zkvm = {{ version = "3.0", optional = true }}
# {name}-risc0-methods = {{ path = "../risc0-methods", optional = true }}

[features]
default = []
# prove = ["dep:risc0-zkvm", "dep:{name}-risc0-methods"]
"#
        ),
    )?;

    // host/src/main.rs
    write_file(
        &root.join("host/src/main.rs"),
        &format!(
            r#"//! Host orchestrator for {name}.
//!
//! This program:
//! 1. Fetches market data from external sources
//! 2. Builds KernelInputV1 for the agent
//! 3. (Optional) Generates a ZK proof via RISC Zero
//! 4. (Optional) Submits the proof + actions on-chain
//!
//! # Usage
//!
//! ```bash
//! # Dry run — fetch data, build input, run agent logic, no proof
//! {name}-host --dry-run
//!
//! # Full run with proving (requires risc0 feature)
//! {name}-host --prove
//! ```

use clap::Parser;
use anyhow::Result;

#[derive(Parser)]
#[command(name = "{name}-host", about = "Host orchestrator for {name} agent")]
struct Args {{
    /// RPC URL for the target chain
    #[arg(long, env = "RPC_URL")]
    rpc_url: String,

    /// Vault contract address
    #[arg(long, env = "VAULT_ADDRESS")]
    vault_address: String,

    /// Adapter contract address
    #[arg(long, env = "ADAPTER_ADDRESS")]
    adapter_address: String,

    /// Run without proof generation
    #[arg(long)]
    dry_run: bool,

    /// Generate and submit ZK proof
    #[arg(long)]
    prove: bool,

    /// Path to ELF binary (for proving)
    #[arg(long, default_value = "bundle/guest.elf")]
    elf_path: String,
}}

#[tokio::main]
async fn main() -> Result<()> {{
    dotenv::dotenv().ok();
    let args = Args::parse();

    println!("=== {name} Host ===");
    println!("RPC: {{}}", args.rpc_url);
    println!("Vault: {{}}", args.vault_address);
    println!("Mode: {{}}", if args.dry_run {{ "dry-run" }} else {{ "live" }});

    // Step 1: Fetch market data
    println!("\\n[1/4] Fetching market data...");
    let market_data = fetch_market_data(&args).await?;
    println!("  Mark price: {{}}", market_data.mark_price);

    // Step 2: Build kernel input
    println!("[2/4] Building kernel input...");
    let _input_bytes = build_input(&args, &market_data)?;
    println!("  Input size: {{}} bytes", _input_bytes.len());

    // Step 3: Run agent (dry-run) or prove
    if args.dry_run {{
        println!("[3/4] Dry run — skipping proof generation");
        println!("  Agent would process input and produce actions");
    }} else if args.prove {{
        println!("[3/4] Generating ZK proof (this may take 8-10 minutes)...");
        println!("  TODO: Integrate risc0-zkvm proving");
    }} else {{
        println!("[3/4] No mode selected (use --dry-run or --prove)");
    }}

    // Step 4: Submit on-chain (if proving)
    println!("[4/4] Submission — not yet implemented");
    println!("  Use forge/cast to submit manually:");
    println!("  cast send <vault> \"execute(bytes,bytes)\" ...");

    println!("\\n=== Done ===");
    Ok(())
}}

struct MarketData {{
    mark_price: f64,
}}

async fn fetch_market_data(args: &Args) -> Result<MarketData> {{
    // TODO: Fetch from Hyperliquid API or other data source
    // Example: reqwest::get("https://api.hyperliquid.xyz/info").await?
    Ok(MarketData {{
        mark_price: 97000.0,
    }})
}}

fn build_input(args: &Args, market: &MarketData) -> Result<Vec<u8>> {{
    // TODO: Encode KernelInputV1 with:
    // - StateSnapshotV1 (36 bytes)
    // - OraclePriceFeed (variable)
    // - Agent-specific input (TradingInput)
    let mut input = Vec::new();

    // Placeholder — replace with actual encoding
    input.extend_from_slice(&[0u8; 36]); // StateSnapshotV1
    input.extend_from_slice(&[0u8; 53]); // TradingInput placeholder

    Ok(input)
}}
"#
        ),
    )?;

    Ok(())
}

// ===========================================================================
// Supporting Files
// ===========================================================================

fn generate_env_example(root: &Path, template: Template) -> Result<()> {
    let mut content = String::from(
        r#"# =============================================================================
# Agent Configuration
# =============================================================================
# Uncomment ONE section below (testnet or mainnet)

# --- TESTNET (HyperEVM chain 998) --- recommended for first deploy ---
CHAIN_ID=998
RPC_URL=https://rpc.hyperliquid-testnet.xyz/evm
AGENT_REGISTRY=0x09447147C6E75a60A449f38532F06E19F5F632F3
VAULT_FACTORY=0xc7Fc0dD5f1B03E3De0C313eE0D3b06Cb2Dc017BB

# --- MAINNET (HyperEVM chain 999) --- uncomment to deploy to mainnet ---
# CHAIN_ID=999
# RPC_URL=<your-mainnet-rpc-url>
# AGENT_REGISTRY=0xAf58D2191772bcFFB3260F5140E995ec79e4d88B
# VAULT_FACTORY=0xc7Fc0dD5f1B03E3De0C313eE0D3b06Cb2Dc017BB
# USDC_ADDRESS=0xb88339CB7199b77E23DB6E890353E22632Ba630f

# Private key for transaction signing (DO NOT COMMIT)
PRIVATE_KEY=

# Agent salt (bytes32, default 0x00...00)
# AGENT_SALT=0x0000000000000000000000000000000000000000000000000000000000000000

# Vault salt (incremented automatically if imageId changes)
# VAULT_SALT=0x01

# Vault contract address (populated after deploy)
VAULT_ADDRESS=

# =============================================================================
# Get testnet tokens:
#   1. Get testnet HYPE from https://app.hyperliquid-testnet.xyz/drip
#   2. Bridge to HyperEVM: send HYPE to 0x2222222222222222222222222222222222222222
#   3. Wait 10s, then run: tal deploy --testnet
# =============================================================================
"#,
    );

    if matches!(template, Template::PerpTrader) {
        content.push_str(
            r#"
# =============================================================================
# Perp-Trader Specific Configuration
# =============================================================================

# HyperliquidAdapter contract address
ADAPTER_ADDRESS=

# Sub-account address (created by adapter)
SUB_ACCOUNT=

# API wallet private key (for REST API seed trades)
API_WALLET_KEY=

# Oracle signer address
ORACLE_SIGNER=

# Oracle max age in seconds (must be >= proof generation time)
ORACLE_MAX_AGE=900

# Trading parameters
ASSET=BTC
LEVERAGE=3
MAX_POSITION_USDC=100
"#,
        );
    }

    write_file(&root.join(".env.example"), &content)
}

fn generate_readme(root: &Path, name: &str, template: Template) -> Result<()> {
    let template_name = match template {
        Template::Minimal => "minimal",
        Template::Yield => "yield-farmer",
        Template::PerpTrader => "perp-trader",
    };

    let content = format!(
        r#"# {name}

A verifiable agent for the Tokamak Execution Kernel (template: `{template_name}`).

## Quick Start

```bash
# Test locally (instant feedback, no zkVM needed)
tal test --local --agent {name}

# Build the agent crate
tal build --agent {name}

# Build zkVM ELF binary (requires RISC Zero toolchain, ~5-10 min)
tal build --elf --agent {name}

# Validate configuration before deploying
tal doctor --path .

# Deploy to testnet
tal deploy --testnet --agent {name}
```

## Project Structure

```
{name}/
├── agent/                  # Core agent logic (#![no_std])
│   ├── src/lib.rs          # agent_main() — YOUR CODE GOES HERE
│   ├── build.rs            # Computes AGENT_CODE_HASH
│   └── Cargo.toml
├── risc0-methods/          # zkVM compilation wrapper
│   ├── zkvm-guest/         # Guest entry point (don't edit)
│   ├── build.rs            # risc0-build integration
│   └── src/lib.rs          # IMAGE_ID constant
├── host/                   # Host orchestrator (data fetching, proving, submission)
│   └── src/main.rs
├── .env.example            # Configuration template
└── dist/                   # Agent pack manifest and bundles
```

## Development Workflow

1. **Edit** `agent/src/lib.rs` — implement your strategy
2. **Test** `tal test --local` — 2-second feedback loop
3. **Build** `tal build --elf` — compile for zkVM
4. **Validate** `tal doctor` — check everything before deploy
5. **Deploy** `tal deploy` — register agent + deploy vault

## Important Notes

- Agent code runs inside a zkVM guest: **no I/O, no randomness, no system time**
- All data must come from the host via `opaque_inputs`
- Use `CallBuilder` for action construction (see kernel-sdk docs)
- AGENT_CODE_HASH changes when you modify `src/lib.rs` or `Cargo.toml`
- IMAGE_ID changes when the ELF binary changes — requires new vault deployment
- Always use `.bin` file (NOT raw ELF) when creating bundles

## Testing

```bash
# Run unit tests
cargo test -p {name}

# Test with fixture input
tal test --local --agent {name} --input fixtures/example.json

# Verify determinism
tal test --local --agent {name} --determinism-check
```
"#
    );

    write_file(&root.join("README.md"), &content)
}

fn generate_manifest(root: &Path, name: &str) -> Result<()> {
    let placeholder = "0xTODO_RUN_tal_build_--elf_TO_COMPUTE";
    let content = format!(
        r#"{{
  "format_version": "1",
  "agent_name": "{name}",
  "agent_version": "0.1.0",
  "agent_id": "0x0000000000000000000000000000000000000000000000000000000000000000",
  "protocol_version": 1,
  "kernel_version": 1,
  "agent_code_hash": "{placeholder}",
  "image_id": "{placeholder}",
  "artifacts": {{
    "elf_path": "artifacts/zkvm-guest.elf",
    "elf_sha256": "{placeholder}"
  }}
}}"#
    );

    write_file(&root.join("dist/agent-pack.json"), &content)
}

fn print_tree(path: &Path, indent: usize) -> Result<()> {
    let prefix = "  ".repeat(indent + 2);
    if path.is_dir() {
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        println!("{}{}/", prefix, name);
        let mut entries: Vec<_> = fs::read_dir(path)?
            .filter_map(|e| e.ok())
            .collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            print_tree(&entry.path(), indent + 1)?;
        }
    } else {
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        println!("{}{}", prefix, name);
    }
    Ok(())
}
