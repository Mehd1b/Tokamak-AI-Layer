//! `tal deploy` — End-to-end on-chain deployment.
//!
//! Steps:
//! 1. Preflight — read manifest, resolve config, connect provider
//! 2. Register agent on AgentRegistry (skip if exists, update if imageId changed)
//! 3. Deploy vault via VaultFactory (detect stale imageId → new salt)
//! 4. Deploy adapter (perp-trader only, skip if exists)
//! 5. Fund and configure (HYPE gas, API wallet)

use crate::onchain::{
    self, build_provider, get_chain_config, parse_bytes32, read_manifest, resolve_chain_id,
    resolve_env, resolve_private_key, send_tx, ChainConfig,
};
use alloy::primitives::{Address, FixedBytes, U256};
use alloy::providers::Provider;
use alloy::sol;
use alloy::sol_types::SolCall;
use anyhow::{bail, Context, Result};
use colored::Colorize;

// ===========================================================================
// Contract Interfaces (alloy sol! macro)
// ===========================================================================

sol! {
    #[sol(rpc)]
    interface IAgentRegistry {
        struct AgentInfo {
            address author;
            bytes32 imageId;
            bytes32 agentCodeHash;
            string metadataUri;
            bool exists;
        }

        function register(bytes32 salt, bytes32 imageId, bytes32 agentCodeHash) external returns (bytes32 agentId);
        function update(bytes32 agentId, bytes32 newImageId, bytes32 newAgentCodeHash) external;
        function get(bytes32 agentId) external view returns (AgentInfo memory);
        function computeAgentId(address author, bytes32 salt) external pure returns (bytes32);
    }

    #[sol(rpc)]
    interface IVaultFactory {
        function deployVault(bytes32 agentId, address asset, bytes32 userSalt, bytes32 expectedImageId) external returns (address vault);
        function computeVaultAddress(address owner, bytes32 agentId, address asset, bytes32 userSalt) external view returns (address vault, bytes32 salt);
        function isDeployedVault(address vault) external view returns (bool);
        function getAgentVaults(bytes32 agentId) external view returns (address[] memory);
    }

    #[sol(rpc)]
    interface IKernelVault {
        function trustedImageId() external view returns (bytes32);
        function agentId() external view returns (bytes32);
        function totalAssets() external view returns (uint256);
        function lastExecutionNonce() external view returns (uint64);
    }
}

// ===========================================================================
// Deploy Config
// ===========================================================================

struct DeployConfig {
    chain: ChainConfig,
    rpc_url: String,
    private_key: String,
    image_id: FixedBytes<32>,
    agent_code_hash: FixedBytes<32>,
    agent_salt: FixedBytes<32>,
    vault_salt: FixedBytes<32>,
    agent_dir: String,
}

// ===========================================================================
// Main Deploy Entry Point
// ===========================================================================

pub fn run(
    testnet: bool,
    step: Option<&str>,
    _agent: Option<&str>,
    config_path: &str,
    verbose: bool,
) -> Result<()> {
    // Use tokio runtime for async on-chain calls
    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(run_async(testnet, step, config_path, verbose))
}

async fn run_async(
    testnet: bool,
    step: Option<&str>,
    _config_path: &str,
    verbose: bool,
) -> Result<()> {
    println!(
        "{} tal deploy — On-Chain Deployment",
        "●".cyan().bold()
    );
    println!();

    // ===================================================================
    // Step 1: PREFLIGHT
    // ===================================================================
    println!("{}", "[1/5] Preflight".bold());

    let chain_id = resolve_chain_id(testnet, resolve_env("CHAIN_ID").and_then(|s| s.parse().ok()));
    let chain = get_chain_config(chain_id)?;
    println!("  Chain: {} ({})", chain.name, chain.chain_id);

    // Resolve RPC URL
    let rpc_url = resolve_env("RPC_URL")
        .or_else(|| {
            if !chain.rpc_url.is_empty() {
                Some(chain.rpc_url.to_string())
            } else {
                None
            }
        })
        .with_context(|| "RPC_URL not set. Add to .env or environment.")?;
    println!("  RPC: {}", rpc_url);

    // Read manifest
    let manifest_path = "dist/agent-pack.json";
    let manifest = read_manifest(manifest_path)
        .with_context(|| format!("Failed to read {}. Run: tal build --elf first.", manifest_path))?;
    println!("  Agent: {}", manifest.agent_name);

    let image_id = parse_bytes32(&manifest.image_id)?;
    let agent_code_hash = parse_bytes32(&manifest.agent_code_hash)?;
    if verbose {
        println!("  IMAGE_ID: {}", manifest.image_id);
        println!("  CODE_HASH: {}", manifest.agent_code_hash);
    }

    // Resolve private key
    let private_key = resolve_private_key("PRIVATE_KEY")?;

    // Resolve salts
    let agent_salt = resolve_env("AGENT_SALT")
        .map(|s| parse_bytes32(&s))
        .transpose()?
        .unwrap_or_else(|| FixedBytes::from([0u8; 32]));

    let vault_salt_str = resolve_env("VAULT_SALT").unwrap_or_else(|| "0x01".to_string());
    let vault_salt = parse_bytes32(&format!("{:0>64}", vault_salt_str.strip_prefix("0x").unwrap_or(&vault_salt_str)))?;

    // Build provider
    let provider = build_provider(&rpc_url, &private_key)?;

    // Get deployer address
    let deployer_addr = {
        let pk_clean = private_key.strip_prefix("0x").unwrap_or(&private_key);
        let signer: alloy::signers::local::PrivateKeySigner = pk_clean.parse()?;
        signer.address()
    };
    println!("  Deployer: {}", deployer_addr);

    // Check balance
    let balance = provider.get_balance(deployer_addr).await?;
    let balance_eth = balance.to::<u128>() as f64 / 1e18;
    if balance.is_zero() {
        bail!(
            "Deployer has zero balance on {}. Fund with native token first.",
            chain.name
        );
    }
    println!("  Balance: {:.4} native", balance_eth);
    println!("  {} Preflight passed", "✓".green());
    println!();

    // Check if running a specific step
    if let Some(s) = step {
        match s {
            "register" => {
                step_register(&provider, &chain, deployer_addr, agent_salt, image_id, agent_code_hash, verbose).await?;
                return Ok(());
            }
            "vault" => {
                let agent_id = compute_agent_id(&provider, &chain, deployer_addr, agent_salt).await?;
                step_deploy_vault(&provider, &chain, deployer_addr, agent_id, image_id, vault_salt, verbose).await?;
                return Ok(());
            }
            _ => bail!("Unknown step '{}'. Available: register, vault", s),
        }
    }

    // ===================================================================
    // Step 2: REGISTER AGENT
    // ===================================================================
    let agent_id = step_register(&provider, &chain, deployer_addr, agent_salt, image_id, agent_code_hash, verbose).await?;

    // ===================================================================
    // Step 3: DEPLOY VAULT
    // ===================================================================
    let vault_addr = step_deploy_vault(&provider, &chain, deployer_addr, agent_id, image_id, vault_salt, verbose).await?;

    // ===================================================================
    // Step 4: ADAPTER (perp-trader only)
    // ===================================================================
    // Detect perp-trader project
    let is_perp = onchain::is_perp_trader_project(".");
    if is_perp {
        println!();
        println!("{}", "[4/5] Adapter (perp-trader)".bold());
        println!(
            "  {} Adapter deployment requires manual setup for now:",
            "ℹ".yellow()
        );
        println!("    1. Build adapter: FOUNDRY_PROFILE=small forge build");
        println!("    2. Deploy via tal or forge create with library linking");
        println!("    3. Register vault: adapter.registerVault(vault, perpAsset, szDecimals)");
        println!("    4. Fund HYPE: adapter.fundSubAccountHype{{value: 0.01 ether}}(vault)");
        println!("    5. Register API wallet: adapter.addApiWalletAdmin(vault, wallet, name)");
    } else {
        println!();
        println!("{}", "[4/5] Adapter — skipped (not perp-trader template)".dimmed());
    }

    // ===================================================================
    // Step 5: SUMMARY
    // ===================================================================
    println!();
    println!("{}", "[5/5] Deployment Summary".bold());
    println!("  {}", "─".repeat(50));
    println!("  Chain:    {} ({})", chain.name, chain.chain_id);
    println!("  Agent ID: 0x{}", hex::encode(agent_id));
    println!("  Vault:    {}", vault_addr);
    println!("  IMAGE_ID: {}", manifest.image_id);
    println!("  {}", "─".repeat(50));
    println!();
    println!("  {} Deployment complete!", "✓".green().bold());
    println!();
    println!("  {} Next steps:", "→".yellow());
    println!("    • Fund vault with USDC: transfer to {}", vault_addr);
    println!("    • Monitor: tal monitor --vault {}", vault_addr);
    println!("    • Check: tal doctor");

    Ok(())
}

// ===========================================================================
// Step 2: Register Agent
// ===========================================================================

async fn step_register(
    provider: &onchain::SignerProvider,
    chain: &ChainConfig,
    deployer: Address,
    salt: FixedBytes<32>,
    image_id: FixedBytes<32>,
    agent_code_hash: FixedBytes<32>,
    verbose: bool,
) -> Result<FixedBytes<32>> {
    println!("{}", "[2/5] Register Agent".bold());

    let registry = IAgentRegistry::new(chain.agent_registry, provider);

    // Compute expected agent ID
    let agent_id = registry
        .computeAgentId(deployer, salt)
        .call()
        .await
        .context("Failed to compute agentId")?
        ._0;

    println!("  Agent ID: 0x{}", hex::encode(agent_id));

    // Check if already registered
    let info = registry.get(agent_id).call().await;

    match info {
        Ok(result) if result._0.exists => {
            let existing = result._0;
            println!("  Agent already registered (author: {})", existing.author);

            // Check if imageId needs updating
            if existing.imageId != image_id || existing.agentCodeHash != agent_code_hash {
                println!(
                    "  {} imageId or codeHash changed — updating registry...",
                    "↻".yellow()
                );
                if verbose {
                    println!("    Old imageId: 0x{}", hex::encode(existing.imageId));
                    println!("    New imageId: 0x{}", hex::encode(image_id));
                }

                let tx_data = IAgentRegistry::updateCall {
                    agentId: agent_id,
                    newImageId: image_id,
                    newAgentCodeHash: agent_code_hash,
                }
                .abi_encode();

                let result = send_tx(
                    provider,
                    Some(chain.agent_registry),
                    tx_data,
                    U256::ZERO,
                    None,
                )
                .await?;

                println!(
                    "  {} Agent updated (tx: {:?}, gas: {})",
                    "✓".green(),
                    result.tx_hash,
                    result.gas_used
                );
            } else {
                println!("  {} Agent is up-to-date", "✓".green());
            }
        }
        _ => {
            // Not registered — register now
            println!("  Registering new agent...");

            let tx_data = IAgentRegistry::registerCall {
                salt,
                imageId: image_id,
                agentCodeHash: agent_code_hash,
            }
            .abi_encode();

            let result = send_tx(
                provider,
                Some(chain.agent_registry),
                tx_data,
                U256::ZERO,
                None,
            )
            .await?;

            println!(
                "  {} Agent registered (tx: {:?}, gas: {})",
                "✓".green(),
                result.tx_hash,
                result.gas_used
            );
        }
    }

    println!();
    Ok(agent_id)
}

// ===========================================================================
// Step 3: Deploy Vault
// ===========================================================================

async fn step_deploy_vault(
    provider: &onchain::SignerProvider,
    chain: &ChainConfig,
    deployer: Address,
    agent_id: FixedBytes<32>,
    image_id: FixedBytes<32>,
    mut vault_salt: FixedBytes<32>,
    _verbose: bool,
) -> Result<Address> {
    println!("{}", "[3/5] Deploy Vault".bold());

    let factory = IVaultFactory::new(chain.vault_factory, provider);

    // Check for existing vaults for this agent
    let existing_vaults = factory
        .getAgentVaults(agent_id)
        .call()
        .await
        .map(|r| r._0)
        .unwrap_or_default();

    if !existing_vaults.is_empty() {
        println!(
            "  Found {} existing vault(s) for this agent",
            existing_vaults.len()
        );

        // Check each vault's trustedImageId
        for vault_addr in &existing_vaults {
            let vault = IKernelVault::new(*vault_addr, provider);
            if let Ok(trusted) = vault.trustedImageId().call().await {
                if trusted._0 == image_id {
                    // Vault with matching imageId exists
                    let assets = vault
                        .totalAssets()
                        .call()
                        .await
                        .map(|r| r._0)
                        .unwrap_or(U256::ZERO);

                    println!(
                        "  {} Vault {} has matching imageId (assets: {} USDC)",
                        "✓".green(),
                        vault_addr,
                        format_usdc(assets)
                    );
                    return Ok(*vault_addr);
                } else {
                    println!(
                        "  {} Vault {} has stale imageId (0x{}...)",
                        "⚠".yellow(),
                        vault_addr,
                        &hex::encode(trusted._0)[..8]
                    );
                }
            }
        }

        // All existing vaults have stale imageId — deploy new one with incremented salt
        let new_salt_val = existing_vaults.len() as u8 + 1;
        vault_salt = FixedBytes::left_padding_from(&[new_salt_val]);
        println!(
            "  {} All existing vaults have stale imageId — deploying new vault with salt 0x{:02x}",
            "⚠".yellow(),
            new_salt_val
        );
    }

    // Compute expected vault address
    let (expected_addr, _) = factory
        .computeVaultAddress(deployer, agent_id, chain.usdc, vault_salt)
        .call()
        .await
        .context("Failed to compute vault address")?
        .into();

    println!("  Expected vault address: {}", expected_addr);

    // Check if already deployed at this address
    let code = provider.get_code_at(expected_addr).await?;
    if !code.is_empty() {
        println!("  {} Vault already deployed at {}", "✓".green(), expected_addr);
        return Ok(expected_addr);
    }

    // Deploy vault
    println!("  Deploying vault via VaultFactory...");

    let tx_data = IVaultFactory::deployVaultCall {
        agentId: agent_id,
        asset: chain.usdc,
        userSalt: vault_salt,
        expectedImageId: image_id,
    }
    .abi_encode();

    let result = send_tx(
        provider,
        Some(chain.vault_factory),
        tx_data,
        U256::ZERO,
        Some(3_000_000), // HyperEVM block gas limit
    )
    .await?;

    // Verify vault was deployed
    let is_deployed = factory
        .isDeployedVault(expected_addr)
        .call()
        .await
        .map(|r| r._0)
        .unwrap_or(false);

    if is_deployed {
        println!(
            "  {} Vault deployed at {} (tx: {:?}, gas: {})",
            "✓".green(),
            expected_addr,
            result.tx_hash,
            result.gas_used
        );
    } else {
        bail!(
            "Vault deployment tx succeeded but vault not found at {}.\n  \
             Check VaultFactory events for the actual deployed address.",
            expected_addr
        );
    }

    println!();
    Ok(expected_addr)
}

// ===========================================================================
// Helpers
// ===========================================================================

async fn compute_agent_id(
    provider: &onchain::SignerProvider,
    chain: &ChainConfig,
    deployer: Address,
    salt: FixedBytes<32>,
) -> Result<FixedBytes<32>> {
    let registry = IAgentRegistry::new(chain.agent_registry, provider);
    let agent_id = registry
        .computeAgentId(deployer, salt)
        .call()
        .await
        .context("Failed to compute agentId")?
        ._0;
    Ok(agent_id)
}

fn format_usdc(amount: U256) -> String {
    let raw: u128 = amount.try_into().unwrap_or(0);
    let dollars = raw as f64 / 1_000_000.0;
    format!("{:.2}", dollars)
}
