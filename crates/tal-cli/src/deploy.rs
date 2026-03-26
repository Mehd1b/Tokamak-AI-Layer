//! `tal deploy` — End-to-end on-chain deployment.
//!
//! Steps:
//! 1. Preflight — read manifest, resolve config, connect provider
//! 2. Register agent on AgentRegistry (skip if exists, update if imageId changed)
//! 3. Deploy vault via VaultFactory (regular or optimistic)
//! 4. (--hyperliquid) Deploy adapter, register vault, fund HYPE, register API wallet
//! 5. Summary

use crate::onchain::{
    self, build_provider, get_chain_config, parse_bytes32, read_and_link_artifact, read_manifest,
    resolve_chain_id, resolve_env, resolve_private_key, send_tx, ChainConfig,
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
        function deployOptimisticVault(bytes32 agentId, address asset, bytes32 userSalt, bytes32 expectedImageId, uint256 bondChainId, uint256 challengeWindow) external returns (address vault);
        function computeVaultAddress(address owner, bytes32 agentId, address asset, bytes32 userSalt) external view returns (address vault, bytes32 salt);
        function isDeployedVault(address vault) external view returns (bool);
        function getAgentVaults(bytes32 agentId) external view returns (address[] memory);
        function setVaultProtocolType(address vault, uint8 protocolType) external;
        function vaultProtocolType(address vault) external view returns (uint8);
    }

    #[sol(rpc)]
    interface IKernelVault {
        function trustedImageId() external view returns (bytes32);
        function agentId() external view returns (bytes32);
        function totalAssets() external view returns (uint256);
        function lastExecutionNonce() external view returns (uint64);
        function owner() external view returns (address);
    }

    #[sol(rpc)]
    interface IOptimisticKernelVault {
        function optimisticEnabled() external view returns (bool);
        function setOptimisticEnabled(bool enabled) external;
        function setOracleSigner(address signer, uint64 maxAge) external;
        function oracleSigner() external view returns (address);
        function setMinBond(uint256 amount) external;
        function minBond() external view returns (uint256);
    }

    #[sol(rpc)]
    interface IHyperliquidAdapter {
        function registerVault(address vault, uint32 perpAsset, uint8 szDecimals) external returns (address subAccount);
        function fundSubAccountHype(address vault) external payable;
        function addApiWalletAdmin(address vault, address wallet, string name) external;
        function vaultConfigs(address vault) external view returns (address subAccount, uint32 perpAsset, uint8 szDecimals);
    }
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
    hyperliquid: bool,
    optimistic: bool,
    min_bond: Option<&str>,
) -> Result<()> {
    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(run_async(testnet, step, config_path, verbose, hyperliquid, optimistic, min_bond))
}

async fn run_async(
    testnet: bool,
    step: Option<&str>,
    config_path: &str,
    verbose: bool,
    hyperliquid: bool,
    optimistic: bool,
    min_bond: Option<&str>,
) -> Result<()> {
    let mode = if hyperliquid && optimistic {
        "Hyperliquid + Optimistic"
    } else if hyperliquid {
        "Hyperliquid"
    } else if optimistic {
        "Optimistic"
    } else {
        "Standard"
    };

    let total_steps = if hyperliquid { 7 } else { 5 };

    println!(
        "{} tal deploy — On-Chain Deployment ({})",
        "●".cyan().bold(),
        mode
    );
    println!();

    // ===================================================================
    // Step 1: PREFLIGHT
    // ===================================================================
    println!("{}", format!("[1/{}] Preflight", total_steps).bold());

    let chain_id = resolve_chain_id(testnet, resolve_env("CHAIN_ID").and_then(|s| s.parse().ok()));
    let chain = get_chain_config(chain_id)?;
    println!("  Chain: {} ({})", chain.name, chain.chain_id);

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

    let private_key = resolve_private_key("PRIVATE_KEY")?;

    let agent_salt = resolve_env("AGENT_SALT")
        .map(|s| parse_bytes32(&s))
        .transpose()?
        .unwrap_or_else(|| FixedBytes::from([0u8; 32]));

    let vault_salt_str = resolve_env("VAULT_SALT").unwrap_or_else(|| "0x01".to_string());
    let vault_salt = parse_bytes32(&format!("{:0>64}", vault_salt_str.strip_prefix("0x").unwrap_or(&vault_salt_str)))?;

    let provider = build_provider(&rpc_url, &private_key)?;

    let deployer_addr = {
        let pk_clean = private_key.strip_prefix("0x").unwrap_or(&private_key);
        let signer: alloy::signers::local::PrivateKeySigner = pk_clean.parse()?;
        signer.address()
    };
    println!("  Deployer: {}", deployer_addr);

    let balance = provider.get_balance(deployer_addr).await?;
    let balance_eth = balance.to::<u128>() as f64 / 1e18;
    if balance.is_zero() {
        bail!("Deployer has zero balance on {}. Fund with native token first.", chain.name);
    }
    println!("  Balance: {:.4} native", balance_eth);
    println!("  {} Preflight passed", "✓".green());
    println!();

    // Check if running a specific step
    if let Some(s) = step {
        match s {
            "register" => {
                let agent_id = step_register(&provider, &chain, deployer_addr, agent_salt, image_id, agent_code_hash, verbose, total_steps).await?;
                if std::path::Path::new(config_path).exists() {
                    update_env_file(config_path, "AGENT_ID", &format!("0x{}", hex::encode(agent_id)))?;
                    println!("  {} Updated {} with AGENT_ID", "✓".green(), config_path);
                }
                return Ok(());
            }
            "vault" => {
                let agent_id = compute_agent_id(&provider, &chain, deployer_addr, agent_salt).await?;
                let vault_addr = step_deploy_vault(&provider, &chain, deployer_addr, agent_id, image_id, vault_salt, verbose, optimistic, total_steps).await?;
                if std::path::Path::new(config_path).exists() {
                    update_env_file(config_path, "AGENT_ID", &format!("0x{}", hex::encode(agent_id)))?;
                    update_env_file(config_path, "VAULT_ADDRESS", &format!("{}", vault_addr))?;
                    println!("  {} Updated {} with AGENT_ID, VAULT_ADDRESS", "✓".green(), config_path);
                }
                return Ok(());
            }
            "adapter" => {
                if !hyperliquid {
                    bail!("--step adapter requires --hyperliquid flag");
                }
                let vault_addr: Address = resolve_env("VAULT_ADDRESS")
                    .with_context(|| "VAULT_ADDRESS not set")?
                    .parse()
                    .context("Invalid VAULT_ADDRESS")?;
                let (_adapter, sub_account) = step_deploy_adapter(&provider, &chain, deployer_addr, vault_addr, verbose, total_steps).await?;
                if std::path::Path::new(config_path).exists() {
                    if let Some(sub) = sub_account {
                        update_env_file(config_path, "SUB_ACCOUNT", &format!("{}", sub))?;
                        println!("  {} Updated {} with SUB_ACCOUNT", "✓".green(), config_path);
                    }
                }
                return Ok(());
            }
            "fund" => {
                if !hyperliquid {
                    bail!("--step fund requires --hyperliquid flag");
                }
                let vault_addr: Address = resolve_env("VAULT_ADDRESS")
                    .with_context(|| "VAULT_ADDRESS not set")?
                    .parse()
                    .context("Invalid VAULT_ADDRESS")?;
                let adapter_addr: Address = resolve_env("ADAPTER_ADDRESS")
                    .with_context(|| "ADAPTER_ADDRESS not set")?
                    .parse()
                    .context("Invalid ADAPTER_ADDRESS")?;
                step_fund_and_configure(&provider, deployer_addr, vault_addr, adapter_addr, verbose, total_steps).await?;
                return Ok(());
            }
            _ => bail!("Unknown step '{}'. Available: register, vault, adapter, fund", s),
        }
    }

    // ===================================================================
    // Step 2: REGISTER AGENT
    // ===================================================================
    let agent_id = step_register(&provider, &chain, deployer_addr, agent_salt, image_id, agent_code_hash, verbose, total_steps).await?;

    // ===================================================================
    // Step 3: DEPLOY VAULT
    // ===================================================================
    let vault_addr = step_deploy_vault(&provider, &chain, deployer_addr, agent_id, image_id, vault_salt, verbose, optimistic, total_steps).await?;

    // ===================================================================
    // Set protocol type on VaultFactory
    // ===================================================================
    if hyperliquid {
        let factory = IVaultFactory::new(chain.vault_factory, &provider);
        let current_type = factory.vaultProtocolType(vault_addr).call().await.map(|r| r._0).unwrap_or(0);

        if current_type != 1 {
            println!("  Setting vault protocol type to Hyperliquid (1)...");
            let tx_data = IVaultFactory::setVaultProtocolTypeCall {
                vault: vault_addr,
                protocolType: 1, // HYPERLIQUID
            }
            .abi_encode();

            let result = send_tx(&provider, Some(chain.vault_factory), tx_data, U256::ZERO, None).await?;
            println!("  {} Protocol type set (tx: {:?})", "✓".green(), result.tx_hash);
        } else {
            println!("  {} Vault protocol type already set to Hyperliquid", "✓".green());
        }
        println!();
    }

    // ===================================================================
    // Configure optimistic vault (oracle signer + enable)
    // ===================================================================
    if optimistic {
        let okv = IOptimisticKernelVault::new(vault_addr, &provider);
        let already_enabled = okv.optimisticEnabled().call().await.map(|r| r._0).unwrap_or(false);

        if !already_enabled {
            // Set oracle signer (required before enabling optimistic)
            // Resolution order:
            //   1. ORACLE_SIGNER env var (explicit address)
            //   2. Production bond oracle (0x2394...3AB) — the signer used by the
            //      hosted oracle service for bond attestations
            //   3. Derived from ORACLE_KEY (only for custom/self-hosted oracle setups)
            const PRODUCTION_BOND_ORACLE: &str = "0x2394F355E086Aa3Fcec2ff28EeDdDbf09d3f03AB";

            let oracle_signer: Option<Address> = if let Some(addr_str) = resolve_env("ORACLE_SIGNER") {
                Some(addr_str.parse().context("Invalid ORACLE_SIGNER")?)
            } else {
                // Default to the production bond oracle signer
                println!("  Using production bond oracle signer: {}", PRODUCTION_BOND_ORACLE);
                Some(PRODUCTION_BOND_ORACLE.parse().unwrap())
            };

            if let Some(oracle_signer) = oracle_signer {
                let current_signer = okv.oracleSigner().call().await.map(|r| r._0).unwrap_or(Address::ZERO);

                if current_signer == Address::ZERO {
                    let max_oracle_age: u64 = resolve_env("ORACLE_MAX_AGE")
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(900); // Default: 900s (15 min)
                    println!("  Setting oracle signer to {} (maxAge={}s)...", oracle_signer, max_oracle_age);
                    let tx_data = IOptimisticKernelVault::setOracleSignerCall {
                        signer: oracle_signer,
                        maxAge: max_oracle_age,
                    }
                    .abi_encode();
                    let result = send_tx(&provider, Some(vault_addr), tx_data, U256::ZERO, None).await?;
                    println!("  {} Oracle signer set (tx: {:?})", "✓".green(), result.tx_hash);
                }

                // Set minimum bond amount
                let bond_str = min_bond
                    .map(|s| s.to_string())
                    .or_else(|| resolve_env("MIN_BOND"));
                let bond_amount = bond_str
                    .map(|s| {
                        let clean = s.strip_prefix("0x").unwrap_or(&s);
                        let radix = if s.starts_with("0x") { 16 } else { 10 };
                        U256::from_str_radix(clean, radix)
                    })
                    .transpose()
                    .context("Invalid --min-bond value")?;

                if let Some(amount) = bond_amount {
                    let current_bond = okv.minBond().call().await.map(|r| r._0).unwrap_or(U256::ZERO);
                    if current_bond != amount {
                        println!("  Setting minimum bond to {}...", amount);
                        let tx_data = IOptimisticKernelVault::setMinBondCall {
                            amount,
                        }
                        .abi_encode();
                        let result = send_tx(&provider, Some(vault_addr), tx_data, U256::ZERO, None).await?;
                        println!("  {} Min bond set (tx: {:?})", "✓".green(), result.tx_hash);
                    } else {
                        println!("  {} Min bond already set to {}", "✓".green(), amount);
                    }
                }

                // Enable optimistic execution
                println!("  Enabling optimistic execution...");
                let tx_data = IOptimisticKernelVault::setOptimisticEnabledCall {
                    enabled: true,
                }
                .abi_encode();
                let result = send_tx(&provider, Some(vault_addr), tx_data, U256::ZERO, None).await?;
                println!("  {} Optimistic execution enabled (tx: {:?})", "✓".green(), result.tx_hash);
            } else {
                println!("  {} Neither ORACLE_SIGNER nor ORACLE_KEY set — optimistic execution not enabled", "⚠".yellow());
                println!("    Set ORACLE_KEY (private key) or ORACLE_SIGNER (address) in .env, then re-run deploy.");
            }
        } else {
            println!("  {} Optimistic execution already enabled", "✓".green());
        }
        println!();
    }

    // ===================================================================
    // Step 4+: HYPERLIQUID STACK
    // ===================================================================
    let mut adapter_addr = None;
    let mut sub_account = None;

    if hyperliquid {
        let (adapter, sub) = step_deploy_adapter(&provider, &chain, deployer_addr, vault_addr, verbose, total_steps).await?;
        adapter_addr = Some(adapter);
        sub_account = sub;

        // Step 5: Fund HYPE
        step_fund_and_configure(&provider, deployer_addr, vault_addr, adapter, verbose, total_steps).await?;
    }

    // ===================================================================
    // SUMMARY
    // ===================================================================
    println!();
    println!("{}", format!("[{}/{}] Deployment Summary", total_steps, total_steps).bold());
    println!("  {}", "─".repeat(55));
    println!("  Chain:      {} ({})", chain.name, chain.chain_id);
    println!("  Mode:       {}", mode);
    println!("  Agent ID:   0x{}", hex::encode(agent_id));
    println!("  Vault:      {}", vault_addr);
    println!("  IMAGE_ID:   {}", manifest.image_id);
    if let Some(adapter) = adapter_addr {
        println!("  Adapter:    {}", adapter);
    }
    if let Some(sub) = sub_account {
        println!("  Sub-Acct:   {}", sub);
    }
    println!("  {}", "─".repeat(55));

    // Persist deployment outputs to .env
    let agent_id_hex = format!("0x{}", hex::encode(agent_id));
    let vault_addr_str = format!("{}", vault_addr);

    let env_path = config_path;
    if std::path::Path::new(env_path).exists() {
        update_env_file(env_path, "AGENT_ID", &agent_id_hex)?;
        update_env_file(env_path, "VAULT_ADDRESS", &vault_addr_str)?;
        if let Some(sub) = sub_account {
            update_env_file(env_path, "SUB_ACCOUNT", &format!("{}", sub))?;
        }
        println!();
        println!("  {} Updated {} with AGENT_ID, VAULT_ADDRESS{}", "✓".green(),
            env_path,
            if sub_account.is_some() { ", SUB_ACCOUNT" } else { "" });
    }

    println!();
    println!("  {} Deployment complete!", "✓".green().bold());
    println!();
    println!("  {} Next steps:", "→".yellow());
    println!("    • Fund vault with USDC: transfer to {}", vault_addr);
    if hyperliquid {
        println!("    • Run bot: ./run-bot.sh");
    }
    println!("    • Monitor: tal monitor --vault {}", vault_addr);
    println!();
    println!("  {} Tip: Run `tal metadata set` to add a name and description to your agent", "ℹ".blue());

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
    total_steps: usize,
) -> Result<FixedBytes<32>> {
    println!("{}", format!("[2/{}] Register Agent", total_steps).bold());

    let registry = IAgentRegistry::new(chain.agent_registry, provider);

    let agent_id = registry
        .computeAgentId(deployer, salt)
        .call()
        .await
        .context("Failed to compute agentId")?
        ._0;

    println!("  Agent ID: 0x{}", hex::encode(agent_id));

    let info = registry.get(agent_id).call().await;

    match info {
        Ok(result) if result._0.exists => {
            let existing = result._0;
            println!("  Agent already registered (author: {})", existing.author);

            if existing.imageId != image_id || existing.agentCodeHash != agent_code_hash {
                println!("  {} imageId or codeHash changed — updating registry...", "↻".yellow());
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

                let result = send_tx(provider, Some(chain.agent_registry), tx_data, U256::ZERO, None).await?;
                println!("  {} Agent updated (tx: {:?}, gas: {})", "✓".green(), result.tx_hash, result.gas_used);
            } else {
                println!("  {} Agent is up-to-date", "✓".green());
            }
        }
        _ => {
            println!("  Registering new agent...");

            let tx_data = IAgentRegistry::registerCall {
                salt,
                imageId: image_id,
                agentCodeHash: agent_code_hash,
            }
            .abi_encode();

            let result = send_tx(provider, Some(chain.agent_registry), tx_data, U256::ZERO, None).await?;
            println!("  {} Agent registered (tx: {:?}, gas: {})", "✓".green(), result.tx_hash, result.gas_used);
        }
    }

    println!();
    Ok(agent_id)
}

// ===========================================================================
// Step 3: Deploy Vault (regular or optimistic)
// ===========================================================================

async fn step_deploy_vault(
    provider: &onchain::SignerProvider,
    chain: &ChainConfig,
    deployer: Address,
    agent_id: FixedBytes<32>,
    image_id: FixedBytes<32>,
    mut vault_salt: FixedBytes<32>,
    _verbose: bool,
    optimistic: bool,
    total_steps: usize,
) -> Result<Address> {
    let vault_type = if optimistic { "Optimistic Vault" } else { "Vault" };
    println!("{}", format!("[3/{}] Deploy {}", total_steps, vault_type).bold());

    let factory = IVaultFactory::new(chain.vault_factory, provider);

    // Check for existing vaults
    let existing_vaults = factory
        .getAgentVaults(agent_id)
        .call()
        .await
        .map(|r| r._0)
        .unwrap_or_default();

    if !existing_vaults.is_empty() {
        println!("  Found {} existing vault(s) for this agent", existing_vaults.len());

        for vault_addr in &existing_vaults {
            let vault = IKernelVault::new(*vault_addr, provider);
            if let Ok(trusted) = vault.trustedImageId().call().await {
                if trusted._0 == image_id {
                    let assets = vault.totalAssets().call().await.map(|r| r._0).unwrap_or(U256::ZERO);
                    println!("  {} Vault {} has matching imageId (assets: {} USDC)", "✓".green(), vault_addr, format_usdc(assets));
                    return Ok(*vault_addr);
                } else {
                    println!("  {} Vault {} has stale imageId (0x{}...)", "⚠".yellow(), vault_addr, &hex::encode(trusted._0)[..8]);
                }
            }
        }

        let new_salt_val = existing_vaults.len() as u8 + 1;
        vault_salt = FixedBytes::left_padding_from(&[new_salt_val]);
        println!("  {} All existing vaults have stale imageId — deploying new vault with salt 0x{:02x}", "⚠".yellow(), new_salt_val);
    }

    // Deploy vault
    let vault_count_before = factory
        .getAgentVaults(agent_id)
        .call()
        .await
        .map(|r| r._0.len())
        .unwrap_or(0);

    if optimistic {
        let bond_chain_id = resolve_env("BOND_CHAIN_ID")
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(1);
        let challenge_window = resolve_env("CHALLENGE_WINDOW")
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(3600);

        println!("  Deploying OptimisticKernelVault (bondChainId={}, challengeWindow={}s)...", bond_chain_id, challenge_window);

        let tx_data = IVaultFactory::deployOptimisticVaultCall {
            agentId: agent_id,
            asset: chain.usdc,
            userSalt: vault_salt,
            expectedImageId: image_id,
            bondChainId: U256::from(bond_chain_id),
            challengeWindow: U256::from(challenge_window),
        }
        .abi_encode();

        let result = send_tx(provider, Some(chain.vault_factory), tx_data, U256::ZERO, Some(3_000_000)).await?;
        println!("  {} OptimisticKernelVault deployed (tx: {:?}, gas: {})", "✓".green(), result.tx_hash, result.gas_used);
    } else {
        // For regular vaults, compute expected address first
        let (expected_addr, _) = factory
            .computeVaultAddress(deployer, agent_id, chain.usdc, vault_salt)
            .call()
            .await
            .context("Failed to compute vault address")?
            .into();

        println!("  Expected vault address: {}", expected_addr);

        let code = provider.get_code_at(expected_addr).await?;
        if !code.is_empty() {
            println!("  {} Vault already deployed at {}", "✓".green(), expected_addr);
            return Ok(expected_addr);
        }

        println!("  Deploying vault via VaultFactory...");

        let tx_data = IVaultFactory::deployVaultCall {
            agentId: agent_id,
            asset: chain.usdc,
            userSalt: vault_salt,
            expectedImageId: image_id,
        }
        .abi_encode();

        let result = send_tx(provider, Some(chain.vault_factory), tx_data, U256::ZERO, Some(3_000_000)).await?;
        println!("  {} Vault deployed (tx: {:?}, gas: {})", "✓".green(), result.tx_hash, result.gas_used);
    }

    // Get the actual deployed vault address from the factory
    let vaults_after = factory
        .getAgentVaults(agent_id)
        .call()
        .await
        .map(|r| r._0)
        .unwrap_or_default();

    let deployed_addr = if vaults_after.len() > vault_count_before {
        *vaults_after.last().unwrap()
    } else {
        bail!("Vault deployment tx succeeded but no new vault found in factory.\n  Check VaultFactory events.");
    };

    // Verify it's tracked
    let is_deployed = factory
        .isDeployedVault(deployed_addr)
        .call()
        .await
        .map(|r| r._0)
        .unwrap_or(false);

    if !is_deployed {
        bail!("Vault {} not tracked by factory", deployed_addr);
    }

    println!("  Vault address: {}", deployed_addr);

    println!();
    Ok(deployed_addr)
}

// ===========================================================================
// Step 4: Deploy HyperliquidAdapter + register vault
// ===========================================================================

async fn step_deploy_adapter(
    provider: &onchain::SignerProvider,
    chain: &ChainConfig,
    deployer: Address,
    vault_addr: Address,
    verbose: bool,
    total_steps: usize,
) -> Result<(Address, Option<Address>)> {
    println!("{}", format!("[4/{}] Hyperliquid Adapter", total_steps).bold());

    // Check if adapter is already deployed (from env)
    let adapter_addr: Address = if let Some(addr_str) = resolve_env("ADAPTER_ADDRESS") {
        let addr: Address = addr_str.parse().context("Invalid ADAPTER_ADDRESS")?;
        let code = provider.get_code_at(addr).await?;
        if code.is_empty() {
            bail!("ADAPTER_ADDRESS {} has no code on-chain", addr);
        }
        println!("  Using existing adapter: {}", addr);
        addr
    } else {
        // Deploy adapter from forge build artifact with library linking
        println!("  Deploying HyperliquidAdapter...");

        if chain.libraries.is_empty() {
            bail!(
                "No pre-deployed libraries configured for chain {}. \
                 Deploy OracleVerifier and KernelOutputParser first, then add them to the chain config.",
                chain.chain_id
            );
        }

        // Resolve contracts directory — try common locations
        let contracts_dir = ["contracts", "../contracts", "../../contracts"]
            .iter()
            .find(|d| std::path::Path::new(d).join("out").exists())
            .with_context(|| {
                "Cannot find contracts/out/ directory. Run `forge build` in contracts/ first."
            })?;

        let artifact_path = format!(
            "{}/out/HyperliquidAdapter.sol/HyperliquidAdapter.json",
            contracts_dir
        );

        // Read artifact and link libraries
        let linked_bytecode = read_and_link_artifact(&artifact_path, &chain.libraries)
            .context("Failed to link HyperliquidAdapter bytecode. Run `forge build` in contracts/ first.")?;

        // Encode constructor args: (address _usdc, address _coreDepositWallet, address _vaultFactory)
        let core_deposit = if chain.core_deposit_wallet != Address::ZERO {
            chain.core_deposit_wallet
        } else {
            let addr_str = resolve_env("CORE_DEPOSIT_WALLET")
                .with_context(|| "CORE_DEPOSIT_WALLET not set and not in chain config")?;
            addr_str.parse().context("Invalid CORE_DEPOSIT_WALLET")?
        };

        let constructor_args = alloy::sol_types::SolValue::abi_encode(&(
            chain.usdc,
            core_deposit,
            chain.vault_factory,
        ));

        let mut deploy_data = linked_bytecode;
        deploy_data.extend_from_slice(&constructor_args);

        let result = send_tx(provider, None, deploy_data, U256::ZERO, Some(3_000_000))
            .await
            .context("HyperliquidAdapter deployment failed")?;

        let addr = result.contract_address
            .context("No contract address in deployment receipt")?;

        println!(
            "  {} HyperliquidAdapter deployed: {} (tx: {:?}, gas: {})",
            "✓".green(),
            addr,
            result.tx_hash,
            result.gas_used
        );
        println!("  {} Add to .env: ADAPTER_ADDRESS={}", "ℹ".yellow(), addr);

        addr
    };

    // Check if vault is already registered on the adapter
    let adapter = IHyperliquidAdapter::new(adapter_addr, provider);
    let config = adapter.vaultConfigs(vault_addr).call().await;

    let sub_account = match config {
        Ok(cfg) if cfg.subAccount != Address::ZERO => {
            println!("  {} Vault already registered on adapter (sub-account: {})", "✓".green(), cfg.subAccount);
            Some(cfg.subAccount)
        }
        _ => {
            // Register vault on adapter
            let perp_asset: u32 = resolve_env("PERP_ASSET")
                .and_then(|s| s.parse().ok())
                .unwrap_or(0); // Default: BTC = 0

            let sz_decimals: u8 = resolve_env("SZ_DECIMALS")
                .and_then(|s| s.parse().ok())
                .unwrap_or(5); // Default: BTC = 5

            let asset_name = match perp_asset {
                0 => "BTC",
                1 => "ETH",
                3 => "SOL",
                _ => "unknown",
            };

            println!("  Registering vault on adapter (asset={}, szDecimals={})...", asset_name, sz_decimals);

            let tx_data = IHyperliquidAdapter::registerVaultCall {
                vault: vault_addr,
                perpAsset: perp_asset,
                szDecimals: sz_decimals,
            }
            .abi_encode();

            let result = send_tx(provider, Some(adapter_addr), tx_data, U256::ZERO, Some(3_000_000)).await?;

            // Read the sub-account address
            let sub = adapter.vaultConfigs(vault_addr).call().await
                .map(|c| c.subAccount)
                .unwrap_or(Address::ZERO);

            println!("  {} Vault registered (sub-account: {}, tx: {:?}, gas: {})",
                "✓".green(), sub, result.tx_hash, result.gas_used);

            if sub != Address::ZERO { Some(sub) } else { None }
        }
    };

    if verbose {
        println!("  Adapter: {}", adapter_addr);
        if let Some(sub) = sub_account {
            println!("  Sub-account: {}", sub);
        }
    }

    println!();
    Ok((adapter_addr, sub_account))
}

// ===========================================================================
// Step 5: Fund HYPE + configure API wallet
// ===========================================================================

async fn step_fund_and_configure(
    provider: &onchain::SignerProvider,
    deployer: Address,
    vault_addr: Address,
    adapter_addr: Address,
    _verbose: bool,
    total_steps: usize,
) -> Result<()> {
    println!("{}", format!("[5/{}] Fund & Configure", total_steps).bold());

    let adapter = IHyperliquidAdapter::new(adapter_addr, provider);

    // Fund sub-account with HYPE for CoreWriter gas
    let hype_amount = resolve_env("HYPE_FUND_AMOUNT")
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.01); // Default: 0.01 HYPE

    let hype_wei = U256::from((hype_amount * 1e18) as u64);

    let deployer_balance = provider.get_balance(deployer).await?;
    if deployer_balance < hype_wei {
        println!(
            "  {} Insufficient HYPE for funding ({:.4} needed, {:.4} available)",
            "⚠".yellow(),
            hype_amount,
            deployer_balance.to::<u128>() as f64 / 1e18
        );
        println!("    Skipping HYPE funding. Fund manually later:");
        println!("    cast send <adapter> 'fundSubAccountHype(address)' {} --value {}",
            vault_addr, hype_amount);
    } else {
        println!("  Funding sub-account with {} HYPE...", hype_amount);

        let tx_data = IHyperliquidAdapter::fundSubAccountHypeCall {
            vault: vault_addr,
        }
        .abi_encode();

        let result = send_tx(provider, Some(adapter_addr), tx_data, hype_wei, Some(500_000)).await?;
        println!("  {} HYPE funded (tx: {:?}, gas: {})", "✓".green(), result.tx_hash, result.gas_used);

        println!("  {} Waiting 10s for HyperCore bridge settlement...", "ℹ".blue());
        tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
    }

    // Register deployer as API wallet (for REST API seed trades)
    let api_wallet = resolve_env("API_WALLET_ADDRESS")
        .map(|s| s.parse::<Address>())
        .transpose()
        .context("Invalid API_WALLET_ADDRESS")?
        .unwrap_or(deployer);

    let wallet_name = resolve_env("API_WALLET_NAME").unwrap_or_else(|| "tal-bot".to_string());

    println!("  Registering API wallet {} as '{}'...", api_wallet, wallet_name);

    let tx_data = IHyperliquidAdapter::addApiWalletAdminCall {
        vault: vault_addr,
        wallet: api_wallet,
        name: wallet_name.clone(),
    }
    .abi_encode();

    match send_tx(provider, Some(adapter_addr), tx_data, U256::ZERO, Some(500_000)).await {
        Ok(result) => {
            println!("  {} API wallet registered (tx: {:?}, gas: {})", "✓".green(), result.tx_hash, result.gas_used);
        }
        Err(e) => {
            // May already be registered — not fatal
            println!("  {} API wallet registration skipped (may already exist): {}", "ℹ".blue(), e);
        }
    }

    println!();
    Ok(())
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

/// Update a KEY=VALUE line in a .env file. If the key exists, replace its value.
/// If not, append it at the end.
fn update_env_file(path: &str, key: &str, value: &str) -> Result<()> {
    let content = std::fs::read_to_string(path).unwrap_or_default();
    let mut found = false;
    let mut lines: Vec<String> = content
        .lines()
        .map(|line| {
            if line.starts_with(&format!("{}=", key)) {
                found = true;
                format!("{}={}", key, value)
            } else {
                line.to_string()
            }
        })
        .collect();

    if !found {
        lines.push(format!("{}={}", key, value));
    }

    std::fs::write(path, lines.join("\n") + "\n")?;
    Ok(())
}
