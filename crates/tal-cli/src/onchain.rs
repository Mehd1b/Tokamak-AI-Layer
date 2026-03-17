//! Shared on-chain infrastructure for `tal` CLI commands.
//!
//! Provides:
//! - Chain configuration registry (addresses per chain ID)
//! - Transaction helper (legacy tx, optional gas limit)
//! - Library linker (patch forge artifact placeholders)
//! - Private key resolver (env var + interactive fallback)

use alloy::network::{EthereumWallet, TransactionBuilder};
use alloy::primitives::{Address, FixedBytes, U256};
use alloy::providers::{Provider, ProviderBuilder};
use alloy::rpc::types::TransactionRequest;
use alloy::signers::local::PrivateKeySigner;
use anyhow::{bail, Context, Result};
use colored::Colorize;
use std::collections::HashMap;

/// Contract addresses and configuration for a specific chain.
#[derive(Debug, Clone)]
pub struct ChainConfig {
    pub chain_id: u64,
    pub name: &'static str,
    pub rpc_url: &'static str,
    pub agent_registry: Address,
    pub vault_factory: Address,
    pub usdc: Address,
    /// Pre-deployed library addresses for linking
    pub libraries: HashMap<&'static str, Address>,
}

/// Get chain configuration by chain ID.
pub fn get_chain_config(chain_id: u64) -> Result<ChainConfig> {
    match chain_id {
        999 => Ok(ChainConfig {
            chain_id: 999,
            name: "HyperEVM Mainnet",
            rpc_url: "", // Must be provided via env
            agent_registry: "0xAf58D2191772bcFFB3260F5140E995ec79e4d88B".parse().unwrap(),
            vault_factory: "0xc7Fc0dD5f1B03E3De0C313eE0D3b06Cb2Dc017BB".parse().unwrap(),
            usdc: "0xb88339CB7199b77E23DB6E890353E22632Ba630f".parse().unwrap(),
            libraries: HashMap::from([
                (
                    "src/libraries/OracleVerifier.sol:OracleVerifier",
                    "0x49D2F7419f15eD00700dE325FE9F945C26353c18".parse().unwrap(),
                ),
                (
                    "src/KernelOutputParser.sol:KernelOutputParser",
                    "0x23d9B155ed33a248085ae15Ed76b305D97F0D8fd".parse().unwrap(),
                ),
            ]),
        }),
        998 => Ok(ChainConfig {
            chain_id: 998,
            name: "HyperEVM Testnet",
            rpc_url: "https://rpc.hyperliquid-testnet.xyz/evm",
            agent_registry: "0x09447147C6E75a60A449f38532F06E19F5F632F3".parse().unwrap(),
            vault_factory: "0xc7Fc0dD5f1B03E3De0C313eE0D3b06Cb2Dc017BB".parse().unwrap(),
            usdc: "0x2B3370eE501B4a559b57D449569354196457D8Ab".parse().unwrap(),
            libraries: HashMap::new(),
        }),
        _ => bail!("Unsupported chain ID: {}. Supported: 999 (HyperEVM), 998 (HyperEVM Testnet)", chain_id),
    }
}

/// Resolve chain ID from --testnet flag and env.
pub fn resolve_chain_id(testnet: bool, env_chain_id: Option<u64>) -> u64 {
    if testnet {
        998
    } else {
        env_chain_id.unwrap_or(999)
    }
}

// ===========================================================================
// Provider + Signer
// ===========================================================================

pub type SignerProvider = alloy::providers::fillers::FillProvider<
    alloy::providers::fillers::JoinFill<
        alloy::providers::fillers::JoinFill<
            alloy::providers::Identity,
            alloy::providers::fillers::JoinFill<
                alloy::providers::fillers::GasFiller,
                alloy::providers::fillers::JoinFill<
                    alloy::providers::fillers::BlobGasFiller,
                    alloy::providers::fillers::JoinFill<
                        alloy::providers::fillers::NonceFiller,
                        alloy::providers::fillers::ChainIdFiller,
                    >,
                >,
            >,
        >,
        alloy::providers::fillers::WalletFiller<EthereumWallet>,
    >,
    alloy::providers::RootProvider<alloy::transports::http::Http<reqwest::Client>>,
    alloy::transports::http::Http<reqwest::Client>,
    alloy::network::Ethereum,
>;

/// Build an alloy provider with signer for write transactions.
pub fn build_provider(rpc_url: &str, private_key: &str) -> Result<SignerProvider> {
    let url: reqwest::Url = rpc_url
        .parse()
        .with_context(|| format!("Invalid RPC URL: {}", rpc_url))?;

    let pk_clean = private_key.strip_prefix("0x").unwrap_or(private_key);
    let signer: PrivateKeySigner = pk_clean
        .parse()
        .context("Invalid private key format")?;

    let wallet = EthereumWallet::from(signer);

    let provider = ProviderBuilder::new()
        .with_recommended_fillers()
        .wallet(wallet)
        .on_http(url);

    Ok(provider)
}

/// Build a read-only provider (no signer).
pub fn build_read_provider(
    rpc_url: &str,
) -> Result<
    impl Provider<alloy::transports::http::Http<reqwest::Client>> + Clone,
> {
    let url: reqwest::Url = rpc_url
        .parse()
        .with_context(|| format!("Invalid RPC URL: {}", rpc_url))?;
    Ok(ProviderBuilder::new().on_http(url))
}

// ===========================================================================
// Transaction Helper
// ===========================================================================

/// Send a transaction (contract call or deployment).
///
/// - `to: None` → contract creation (deploy), returns deployed address
/// - `to: Some(addr)` → regular call
/// - `gas_limit: None` → let provider estimate
/// - `gas_limit: Some(n)` → override (use 3_000_000 for HyperEVM deploys)
pub async fn send_tx(
    provider: &SignerProvider,
    to: Option<Address>,
    data: Vec<u8>,
    value: U256,
    gas_limit: Option<u64>,
) -> Result<TxResult> {
    let mut tx = TransactionRequest::default()
        .with_input(data)
        .with_value(value)
        // HyperEVM: legacy transactions (no EIP-1559)
        .transaction_type(0);

    if let Some(addr) = to {
        tx = tx.with_to(addr);
    }

    if let Some(limit) = gas_limit {
        tx = tx.with_gas_limit(limit);
    }

    let pending = provider
        .send_transaction(tx)
        .await
        .context("Failed to send transaction")?;

    let receipt = pending
        .get_receipt()
        .await
        .context("Failed to get transaction receipt")?;

    if !receipt.status() {
        bail!(
            "Transaction reverted (tx: {:?})",
            receipt.transaction_hash
        );
    }

    Ok(TxResult {
        tx_hash: receipt.transaction_hash,
        contract_address: receipt.contract_address,
        gas_used: receipt.gas_used,
    })
}

/// Result of a successful transaction.
#[derive(Debug)]
pub struct TxResult {
    pub tx_hash: FixedBytes<32>,
    pub contract_address: Option<Address>,
    pub gas_used: u128,
}

// ===========================================================================
// Library Linker
// ===========================================================================

/// Read a forge build artifact and extract bytecode, linking libraries.
///
/// Forge artifacts are at `contracts/out/ContractName.sol/ContractName.json`.
/// Unlinked libraries appear as `__$<34 hex chars>$__` placeholders.
/// The placeholder is derived from keccak256 of the fully qualified library name.
pub fn read_and_link_artifact(
    artifact_path: &str,
    libraries: &HashMap<&str, Address>,
) -> Result<Vec<u8>> {
    let content = std::fs::read_to_string(artifact_path)
        .with_context(|| format!("Cannot read artifact: {}", artifact_path))?;

    let artifact: serde_json::Value = serde_json::from_str(&content)
        .with_context(|| format!("Invalid JSON in artifact: {}", artifact_path))?;

    let bytecode_hex = artifact["bytecode"]["object"]
        .as_str()
        .with_context(|| format!("No bytecode.object in artifact: {}", artifact_path))?;

    let mut hex_str = bytecode_hex
        .strip_prefix("0x")
        .unwrap_or(bytecode_hex)
        .to_string();

    // Link libraries by replacing placeholders
    for (lib_name, lib_addr) in libraries {
        let placeholder = library_placeholder(lib_name);
        let addr_hex = format!("{:x}", lib_addr); // 40 hex chars, no 0x prefix
        hex_str = hex_str.replace(&placeholder, &addr_hex);
    }

    // Check for remaining unlinked placeholders
    if hex_str.contains("__$") {
        let remaining: Vec<&str> = hex_str
            .match_indices("__$")
            .map(|(i, _)| &hex_str[i..i + 40.min(hex_str.len() - i)])
            .collect();
        bail!(
            "Unlinked library placeholders remain in bytecode: {:?}\n  \
             Provide library addresses in chain config or via --libraries flag",
            remaining
        );
    }

    hex::decode(&hex_str).context("Invalid hex in linked bytecode")
}

/// Compute the Solidity compiler library placeholder for a fully qualified name.
///
/// Format: `__$<keccak256(name)[:34]>$__` (34 hex chars = 17 bytes)
fn library_placeholder(fully_qualified_name: &str) -> String {
    use alloy::primitives::keccak256;

    let hash = keccak256(fully_qualified_name.as_bytes());
    let hash_hex = hex::encode(hash);
    format!("__${}$__", &hash_hex[..34])
}

// ===========================================================================
// Private Key Resolver
// ===========================================================================

/// Resolve private key from environment variable or interactive prompt.
pub fn resolve_private_key(env_key: &str) -> Result<String> {
    // Try environment variable first
    if let Ok(key) = std::env::var(env_key) {
        if !key.is_empty() {
            return Ok(key);
        }
    }

    // Try .env file
    if let Ok(content) = std::fs::read_to_string(".env") {
        for line in content.lines() {
            if let Some(rest) = line.strip_prefix(&format!("{}=", env_key)) {
                let val = rest.trim().trim_matches('"').trim_matches('\'');
                if !val.is_empty() {
                    return Ok(val.to_string());
                }
            }
        }
    }

    // Interactive fallback
    println!(
        "  {} {} not found in environment or .env file",
        "ℹ".yellow(),
        env_key
    );
    let key = dialoguer::Password::new()
        .with_prompt("Enter private key (0x...)")
        .interact()
        .context("Failed to read private key")?;

    if key.is_empty() {
        bail!("Private key cannot be empty");
    }

    Ok(key)
}

/// Read a value from .env file or environment.
pub fn resolve_env(key: &str) -> Option<String> {
    // Environment variable first
    if let Ok(val) = std::env::var(key) {
        if !val.is_empty() {
            return Some(val);
        }
    }

    // .env file fallback
    if let Ok(content) = std::fs::read_to_string(".env") {
        for line in content.lines() {
            let line = line.trim();
            if line.starts_with('#') || line.is_empty() {
                continue;
            }
            if let Some(rest) = line.strip_prefix(&format!("{}=", key)) {
                let val = rest.trim().trim_matches('"').trim_matches('\'');
                if !val.is_empty() {
                    return Some(val.to_string());
                }
            }
        }
    }

    None
}

// ===========================================================================
// Manifest Reader
// ===========================================================================

/// Agent manifest data from dist/agent-pack.json.
#[derive(Debug, serde::Deserialize)]
pub struct AgentManifest {
    pub agent_name: String,
    pub agent_id: String,
    pub image_id: String,
    pub agent_code_hash: String,
}

/// Read and validate agent-pack.json manifest.
pub fn read_manifest(path: &str) -> Result<AgentManifest> {
    let content = std::fs::read_to_string(path)
        .with_context(|| format!("Cannot read manifest: {}", path))?;

    let manifest: AgentManifest = serde_json::from_str(&content)
        .with_context(|| format!("Invalid manifest JSON: {}", path))?;

    // Check for placeholder values
    if manifest.image_id.contains("TODO") || manifest.image_id.contains("placeholder") {
        bail!(
            "Manifest has placeholder image_id.\n  \
             Run: tal build --elf && agent-pack compute --elf <path> --out {}", path
        );
    }

    if manifest.agent_code_hash.contains("TODO") || manifest.agent_code_hash.contains("placeholder") {
        bail!(
            "Manifest has placeholder agent_code_hash.\n  \
             Run: tal build --elf && agent-pack compute --elf <path> --out {}", path
        );
    }

    Ok(manifest)
}

/// Parse a 0x-prefixed hex string into a 32-byte FixedBytes.
pub fn parse_bytes32(hex_str: &str) -> Result<FixedBytes<32>> {
    let clean = hex_str.strip_prefix("0x").unwrap_or(hex_str);
    let bytes = hex::decode(clean).context("Invalid hex string")?;
    if bytes.len() != 32 {
        bail!("Expected 32 bytes, got {}", bytes.len());
    }
    Ok(FixedBytes::from_slice(&bytes))
}

/// Detect if an agent project is a perp-trader template.
///
/// Checks for presence of host/ directory or template field in manifest.
pub fn is_perp_trader_project(agent_dir: &str) -> bool {
    let host_dir = std::path::Path::new(agent_dir).join("host");
    host_dir.exists() && host_dir.is_dir()
}
