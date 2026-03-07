//! On-chain vault interaction: state reads and executeWithOracle submission.

use crate::error::{Error, Result};

/// Vault state read from on-chain.
#[derive(Debug, Clone)]
pub struct VaultState {
    pub last_execution_nonce: u64,
    pub last_execution_ts: u64,
    pub agent_id: [u8; 32],
    pub oracle_signer: [u8; 20],
    pub peak_equity: u64,
    pub total_assets: u64,
}

impl VaultState {
    /// Default state for dry-run mode when on-chain feature is not enabled.
    pub fn default_for_dry_run() -> Self {
        Self {
            last_execution_nonce: 0,
            last_execution_ts: 0,
            agent_id: [0u8; 32],
            oracle_signer: [0u8; 20],
            peak_equity: 0,
            total_assets: 0,
        }
    }
}

/// Result of on-chain execution.
#[cfg(feature = "onchain")]
#[derive(Debug, Clone)]
pub struct ExecuteResult {
    pub tx_hash: String,
    pub block_number: Option<u64>,
    pub success: bool,
}

/// Read vault state from on-chain.
#[cfg(feature = "onchain")]
pub async fn read_vault_state(vault_address: &str, rpc_url: &str) -> Result<VaultState> {
    use alloy::primitives::Address;
    use alloy::providers::ProviderBuilder;
    use alloy::sol;
    use std::str::FromStr;

    sol! {
        #[sol(rpc)]
        interface IKernelVault {
            function lastExecutionNonce() external view returns (uint64);
            function agentId() external view returns (bytes32);
            function oracleSigner() external view returns (address);
            function totalAssets() external view returns (uint256);
        }
    }

    let vault = Address::from_str(vault_address)
        .map_err(|_| Error::OnChain(format!("Invalid vault address: {}", vault_address)))?;

    let url: reqwest::Url = rpc_url
        .parse()
        .map_err(|_| Error::OnChain(format!("Invalid RPC URL: {}", rpc_url)))?;

    let provider = ProviderBuilder::new().on_http(url);
    let contract = IKernelVault::new(vault, &provider);

    let nonce = contract
        .lastExecutionNonce()
        .call()
        .await
        .map_err(|e| Error::OnChain(format!("Failed to read nonce: {}", e)))?
        ._0;

    let agent_id = contract
        .agentId()
        .call()
        .await
        .map_err(|e| Error::OnChain(format!("Failed to read agentId: {}", e)))?
        ._0;

    let oracle_signer_addr = contract
        .oracleSigner()
        .call()
        .await
        .map_err(|e| Error::OnChain(format!("Failed to read oracleSigner: {}", e)))?
        ._0;

    let total_assets = contract
        .totalAssets()
        .call()
        .await
        .map_err(|e| Error::OnChain(format!("Failed to read totalAssets: {}", e)))?
        ._0;

    let mut oracle_signer = [0u8; 20];
    oracle_signer.copy_from_slice(oracle_signer_addr.as_slice());

    // Convert total_assets U256 to u64 (safe for reasonable vault sizes)
    let total_assets_u64: u64 = total_assets.try_into().unwrap_or(u64::MAX);

    Ok(VaultState {
        last_execution_nonce: nonce,
        last_execution_ts: 0, // TODO: read from vault if available
        agent_id: agent_id.into(),
        oracle_signer,
        peak_equity: total_assets_u64, // Approximate: use totalAssets as peak
        total_assets: total_assets_u64,
    })
}

/// Check sub-account HYPE balance and fund if below threshold.
///
/// CoreWriter actions (limit orders, usdClassTransfer, spotSend) require HYPE on
/// HyperCore for gas. Without it, all actions are silently rejected. This function
/// checks the native HYPE balance of the sub-account on HyperEVM and, if below
/// `min_hype`, sends `hype_topup` wei via the adapter's `fundSubAccountHype()`.
#[cfg(feature = "onchain")]
pub async fn check_and_fund_hype(cli: &crate::config::Cli) -> Result<bool> {
    use alloy::network::EthereumWallet;
    use alloy::primitives::{Address, U256};
    use alloy::providers::{Provider, ProviderBuilder};
    use alloy::signers::local::PrivateKeySigner;
    use alloy::sol;
    use std::str::FromStr;

    // Resolve adapter address (defaults to exchange_contract)
    let adapter_addr_str = cli.adapter_address.as_deref().unwrap_or(&cli.exchange_contract);

    sol! {
        #[sol(rpc)]
        interface IAdapter {
            function getSubAccount(address vault) external view returns (address);
            function fundSubAccountHype(address vault) external payable;
        }
    }

    let adapter = Address::from_str(adapter_addr_str)
        .map_err(|_| Error::OnChain(format!("Invalid adapter address: {}", adapter_addr_str)))?;
    let vault = Address::from_str(&cli.vault)
        .map_err(|_| Error::OnChain(format!("Invalid vault address: {}", cli.vault)))?;

    let url: reqwest::Url = cli.rpc
        .parse()
        .map_err(|_| Error::OnChain(format!("Invalid RPC URL: {}", cli.rpc)))?;

    // Read-only provider for balance check
    let read_provider = ProviderBuilder::new().on_http(url.clone());
    let read_contract = IAdapter::new(adapter, &read_provider);

    // Get sub-account address
    let sub_account = read_contract
        .getSubAccount(vault)
        .call()
        .await
        .map_err(|e| Error::OnChain(format!("Failed to get sub-account: {}", e)))?
        ._0;

    if sub_account == Address::ZERO {
        return Err(Error::OnChain("Vault has no sub-account registered".into()));
    }

    // Check native HYPE balance
    let balance = read_provider
        .get_balance(sub_account)
        .await
        .map_err(|e| Error::OnChain(format!("Failed to get HYPE balance: {}", e)))?;

    let min_hype = U256::from(cli.min_hype);
    if balance >= min_hype {
        return Ok(false); // No funding needed
    }

    // Fund the sub-account
    let pk = crate::config::Cli::resolve_key(&cli.pk)?;
    let pk_clean = pk.strip_prefix("0x").unwrap_or(&pk);
    let signer: PrivateKeySigner = pk_clean
        .parse()
        .map_err(|_| Error::OnChain("Invalid private key for HYPE funding".into()))?;

    let wallet = EthereumWallet::from(signer);
    let write_provider = ProviderBuilder::new()
        .with_recommended_fillers()
        .wallet(wallet)
        .on_http(url);

    let write_contract = IAdapter::new(adapter, &write_provider);
    let topup = U256::from(cli.hype_topup);

    let tx = write_contract
        .fundSubAccountHype(vault)
        .value(topup)
        .send()
        .await
        .map_err(|e| Error::OnChain(format!("HYPE funding tx failed: {}", e)))?;

    let receipt = tx
        .get_receipt()
        .await
        .map_err(|e| Error::OnChain(format!("Failed to get HYPE funding receipt: {}", e)))?;

    if !receipt.status() {
        return Err(Error::OnChain("HYPE funding transaction reverted".into()));
    }

    Ok(true) // Funded successfully
}

/// Pre-deposit USDC from the deployer to HyperCore perp margin.
///
/// Calls adapter.depositMarginAdmin(vault, amount) which pulls USDC from the
/// deployer (msg.sender), not the vault. This avoids the chicken-and-egg problem
/// where the vault hasn't approved the adapter yet (approval only happens inside
/// ZK proof execution).
///
/// The deployer must have USDC and have approved the adapter for spending.
/// If the deployer hasn't approved yet, this function approves max uint first.
#[cfg(feature = "onchain")]
pub async fn deposit_margin_from_deployer(cli: &crate::config::Cli, amount: u64) -> Result<()> {
    use alloy::network::EthereumWallet;
    use alloy::primitives::{Address, U256};
    use alloy::providers::ProviderBuilder;
    use alloy::signers::local::PrivateKeySigner;
    use alloy::sol;
    use std::str::FromStr;

    sol! {
        #[sol(rpc)]
        interface IAdapter {
            function depositMarginAdmin(address vault, uint256 amount) external;
        }
        #[sol(rpc)]
        interface IERC20 {
            function allowance(address owner, address spender) external view returns (uint256);
            function approve(address spender, uint256 amount) external returns (bool);
        }
    }

    let adapter_addr_str = cli.adapter_address.as_deref().unwrap_or(&cli.exchange_contract);
    let adapter = Address::from_str(adapter_addr_str)
        .map_err(|_| Error::OnChain(format!("Invalid adapter address: {}", adapter_addr_str)))?;
    let vault = Address::from_str(&cli.vault)
        .map_err(|_| Error::OnChain(format!("Invalid vault address: {}", cli.vault)))?;
    let usdc = Address::from_str(&cli.usdc_address)
        .map_err(|_| Error::OnChain(format!("Invalid USDC address: {}", cli.usdc_address)))?;

    let url: reqwest::Url = cli.rpc
        .parse()
        .map_err(|_| Error::OnChain(format!("Invalid RPC URL: {}", cli.rpc)))?;

    let pk = crate::config::Cli::resolve_key(&cli.pk)?;
    let pk_clean = pk.strip_prefix("0x").unwrap_or(&pk);
    let signer: PrivateKeySigner = pk_clean
        .parse()
        .map_err(|_| Error::OnChain("Invalid private key for margin deposit".into()))?;
    let deployer = signer.address();

    let wallet = EthereumWallet::from(signer);
    let provider = ProviderBuilder::new()
        .with_recommended_fillers()
        .wallet(wallet)
        .on_http(url);

    // Check if deployer has approved adapter for USDC, approve if needed
    let usdc_contract = IERC20::new(usdc, &provider);
    let allowance = usdc_contract.allowance(deployer, adapter).call().await
        .map_err(|e| Error::OnChain(format!("Failed to check USDC allowance: {}", e)))?._0;

    if allowance < U256::from(amount) {
        eprintln!("  [PRE-DEPOSIT] Approving adapter for USDC...");
        let approve_tx = usdc_contract.approve(adapter, U256::MAX).send().await
            .map_err(|e| Error::OnChain(format!("USDC approve tx failed: {}", e)))?;
        let approve_receipt = approve_tx.get_receipt().await
            .map_err(|e| Error::OnChain(format!("USDC approve receipt failed: {}", e)))?;
        if !approve_receipt.status() {
            return Err(Error::OnChain("USDC approve reverted".into()));
        }
    }

    // Deposit margin from deployer to HyperCore via adapter
    let contract = IAdapter::new(adapter, &provider);
    let tx = contract
        .depositMarginAdmin(vault, U256::from(amount))
        .send()
        .await
        .map_err(|e| Error::OnChain(format!("Margin deposit tx failed: {}", e)))?;

    let receipt = tx
        .get_receipt()
        .await
        .map_err(|e| Error::OnChain(format!("Failed to get margin deposit receipt: {}", e)))?;

    if !receipt.status() {
        return Err(Error::OnChain("Margin deposit transaction reverted".into()));
    }

    Ok(())
}

/// Execute the 3-step HyperCore fund recovery: perpToSpot → spotToEvm → withdrawToVault.
///
/// Each step uses CoreWriter actions that can be silently rejected on HyperCore.
/// This function verifies each step took effect before proceeding to the next,
/// and waits for HyperCore settlement between steps.
///
/// Returns the total USDC recovered to the vault (in raw 1e6 units), or 0 if nothing was recovered.
#[cfg(feature = "onchain")]
pub async fn recover_funds_to_vault(
    cli: &crate::config::Cli,
    hl_client: &crate::hyperliquid::client::HyperliquidClient,
) -> Result<u64> {
    use alloy::network::EthereumWallet;
    use alloy::primitives::Address;
    use alloy::providers::ProviderBuilder;
    use alloy::signers::local::PrivateKeySigner;
    use alloy::sol;
    use std::str::FromStr;

    sol! {
        #[sol(rpc)]
        interface IAdapter {
            function transferPerpToSpot(address vault, uint64 usdcAmount) external;
            function transferSpotToEvm(address vault, uint64 usdcAmount) external;
            function withdrawToVaultAdmin(address vault) external;
        }
        #[sol(rpc)]
        interface IERC20 {
            function balanceOf(address account) external view returns (uint256);
        }
    }

    let adapter_addr_str = cli.adapter_address.as_deref().unwrap_or(&cli.exchange_contract);
    let adapter = Address::from_str(adapter_addr_str)
        .map_err(|_| Error::OnChain(format!("Invalid adapter address: {}", adapter_addr_str)))?;
    let vault = Address::from_str(&cli.vault)
        .map_err(|_| Error::OnChain(format!("Invalid vault address: {}", cli.vault)))?;
    let usdc = Address::from_str(&cli.usdc_address)
        .map_err(|_| Error::OnChain(format!("Invalid USDC address: {}", cli.usdc_address)))?;
    let sub = Address::from_str(&cli.sub_account)
        .map_err(|_| Error::OnChain(format!("Invalid sub-account: {}", cli.sub_account)))?;

    let url: reqwest::Url = cli.rpc.parse()
        .map_err(|_| Error::OnChain(format!("Invalid RPC URL: {}", cli.rpc)))?;

    let pk = crate::config::Cli::resolve_key(&cli.pk)?;
    let pk_clean = pk.strip_prefix("0x").unwrap_or(&pk);
    let signer: PrivateKeySigner = pk_clean.parse()
        .map_err(|_| Error::OnChain("Invalid private key for recovery".into()))?;

    let wallet = EthereumWallet::from(signer);
    let provider = ProviderBuilder::new()
        .with_recommended_fillers()
        .wallet(wallet)
        .on_http(url.clone());
    let read_provider = ProviderBuilder::new().on_http(url);

    let contract = IAdapter::new(adapter, &provider);
    let usdc_contract = IERC20::new(usdc, &read_provider);

    // Pre-flight: ensure HYPE is available for CoreWriter gas.
    // Recovery uses up to 3 CoreWriter actions (perpToSpot, spotToEvm, withdrawToVault).
    // Without HYPE, ALL are silently rejected.
    eprintln!("  [RECOVER] Checking HYPE for CoreWriter gas...");
    match check_and_fund_hype(cli).await {
        Ok(funded) => {
            if funded {
                eprintln!("  [RECOVER] HYPE funded. Waiting 15s for bridge settlement...");
                tokio::time::sleep(std::time::Duration::from_secs(15)).await;
            } else {
                eprintln!("  [RECOVER] HYPE OK.");
            }
        }
        Err(e) => {
            eprintln!("  [RECOVER] HYPE check failed (proceeding anyway): {}", e);
        }
    }

    // Dust buffer: leave 0.02 USDC behind to avoid HyperCore rounding rejections.
    // Trying to withdraw the exact amount risks silent rejection if HyperCore's
    // internal ledger rounds differently from what the API reports.
    const DUST_BUFFER: f64 = 0.02;

    // Step 1: Transfer perp margin → spot (if any withdrawable)
    let perp_withdrawable = hl_client.get_perp_withdrawable(&cli.sub_account)
        .unwrap_or(0.0);
    if perp_withdrawable > DUST_BUFFER + 0.01 {
        let amount_1e6 = ((perp_withdrawable - DUST_BUFFER) * 1_000_000.0) as u64;
        if amount_1e6 > 0 {
            eprintln!("  [RECOVER] Step 1: perpToSpot({} raw = ${:.2})...", amount_1e6, amount_1e6 as f64 / 1e6);
            let tx = contract.transferPerpToSpot(vault, amount_1e6).send().await
                .map_err(|e| Error::OnChain(format!("perpToSpot tx failed: {}", e)))?;
            let receipt = tx.get_receipt().await
                .map_err(|e| Error::OnChain(format!("perpToSpot receipt failed: {}", e)))?;
            if !receipt.status() {
                return Err(Error::OnChain("perpToSpot transaction reverted".into()));
            }
            // Wait for HyperCore settlement
            tokio::time::sleep(std::time::Duration::from_secs(10)).await;

            // Verify spot balance increased
            let spot_usdc = hl_client.get_spot_usdc(&cli.sub_account).unwrap_or(0.0);
            if spot_usdc < 0.01 {
                eprintln!("  [RECOVER] WARNING: perpToSpot may have been silently rejected (spot={:.2})", spot_usdc);
            } else {
                eprintln!("  [RECOVER] Step 1 verified: spot USDC = {:.2}", spot_usdc);
            }
        }
    }

    // Step 2: Transfer spot → EVM (if any spot USDC)
    let spot_usdc = hl_client.get_spot_usdc(&cli.sub_account).unwrap_or(0.0);
    if spot_usdc > DUST_BUFFER + 0.01 {
        // adapter.transferSpotToEvm takes amount in 1e6, internally multiplies by 100 for 1e8
        let amount_1e6 = ((spot_usdc - DUST_BUFFER) * 1_000_000.0) as u64;
        if amount_1e6 > 0 {
            eprintln!("  [RECOVER] Step 2: spotToEvm({} raw = ${:.2})...", amount_1e6, amount_1e6 as f64 / 1e6);
            let tx = contract.transferSpotToEvm(vault, amount_1e6).send().await
                .map_err(|e| Error::OnChain(format!("spotToEvm tx failed: {}", e)))?;
            let receipt = tx.get_receipt().await
                .map_err(|e| Error::OnChain(format!("spotToEvm receipt failed: {}", e)))?;
            if !receipt.status() {
                return Err(Error::OnChain("spotToEvm transaction reverted".into()));
            }
            // Wait for HyperCore → EVM settlement (longer wait — this is the most fragile step)
            tokio::time::sleep(std::time::Duration::from_secs(15)).await;

            // Verify USDC appeared on sub-account's EVM balance
            let evm_balance = usdc_contract.balanceOf(sub).call().await
                .map_err(|e| Error::OnChain(format!("balanceOf failed: {}", e)))?._0;
            if evm_balance.is_zero() {
                eprintln!("  [RECOVER] WARNING: spotToEvm not settled yet. Waiting 15s more...");
                tokio::time::sleep(std::time::Duration::from_secs(15)).await;

                // Re-check before retrying (the first tx might just be slow)
                let evm_balance2 = usdc_contract.balanceOf(sub).call().await
                    .map_err(|e| Error::OnChain(format!("balanceOf failed: {}", e)))?._0;
                if evm_balance2.is_zero() {
                    // Still nothing — re-fund HYPE and retry the spotToEvm
                    eprintln!("  [RECOVER] Still 0. Re-checking HYPE and retrying...");
                    if let Ok(funded) = check_and_fund_hype(cli).await {
                        if funded {
                            tokio::time::sleep(std::time::Duration::from_secs(15)).await;
                        }
                    }
                    let tx2 = contract.transferSpotToEvm(vault, amount_1e6).send().await
                        .map_err(|e| Error::OnChain(format!("spotToEvm retry tx failed: {}", e)))?;
                    let receipt2 = tx2.get_receipt().await
                        .map_err(|e| Error::OnChain(format!("spotToEvm retry receipt failed: {}", e)))?;
                    if !receipt2.status() {
                        return Err(Error::OnChain("spotToEvm retry reverted".into()));
                    }
                    tokio::time::sleep(std::time::Duration::from_secs(15)).await;
                } else {
                    eprintln!("  [RECOVER] Step 2 settled (delayed): EVM USDC = {}", evm_balance2);
                }
            } else {
                eprintln!("  [RECOVER] Step 2 verified: EVM USDC = {}", evm_balance);
            }
        }
    }

    // Step 3: Withdraw from sub-account EVM to vault
    let evm_balance = usdc_contract.balanceOf(sub).call().await
        .map_err(|e| Error::OnChain(format!("balanceOf failed: {}", e)))?._0;
    if !evm_balance.is_zero() {
        eprintln!("  [RECOVER] Step 3: withdrawToVault({} raw USDC)...", evm_balance);
        let tx = contract.withdrawToVaultAdmin(vault).send().await
            .map_err(|e| Error::OnChain(format!("withdrawToVault tx failed: {}", e)))?;
        let receipt = tx.get_receipt().await
            .map_err(|e| Error::OnChain(format!("withdrawToVault receipt failed: {}", e)))?;
        if !receipt.status() {
            return Err(Error::OnChain("withdrawToVault transaction reverted".into()));
        }
        let recovered: u64 = evm_balance.try_into().unwrap_or(0);
        eprintln!("  [RECOVER] Recovered {} USDC (${:.2}) to vault", recovered, recovered as f64 / 1e6);
        return Ok(recovered);
    }

    Ok(0)
}

/// Submit execution with oracle signature on-chain.
#[cfg(feature = "onchain")]
pub async fn execute_with_oracle(
    vault_address: &str,
    rpc_url: &str,
    private_key: &str,
    journal_bytes: &[u8],
    seal_bytes: &[u8],
    agent_output_bytes: &[u8],
    oracle_signature: &[u8],
    oracle_timestamp: u64,
) -> Result<ExecuteResult> {
    use alloy::network::EthereumWallet;
    use alloy::primitives::{Address, Bytes};
    use alloy::providers::ProviderBuilder;
    use alloy::signers::local::PrivateKeySigner;
    use alloy::sol;
    use std::str::FromStr;

    sol! {
        #[sol(rpc)]
        interface IKernelVault {
            function executeWithOracle(
                bytes calldata journal,
                bytes calldata seal,
                bytes calldata agentOutputBytes,
                bytes calldata oracleSignature,
                uint64 oracleTimestamp
            ) external;
        }
    }

    let vault = Address::from_str(vault_address)
        .map_err(|_| Error::OnChain(format!("Invalid vault address: {}", vault_address)))?;

    let url: reqwest::Url = rpc_url
        .parse()
        .map_err(|_| Error::OnChain(format!("Invalid RPC URL: {}", rpc_url)))?;

    let pk_clean = private_key.strip_prefix("0x").unwrap_or(private_key);
    let signer: PrivateKeySigner = pk_clean
        .parse()
        .map_err(|_| Error::OnChain("Invalid private key".into()))?;

    let wallet = EthereumWallet::from(signer);
    let provider = ProviderBuilder::new()
        .with_recommended_fillers()
        .wallet(wallet)
        .on_http(url);

    let contract = IKernelVault::new(vault, provider);

    let journal = Bytes::copy_from_slice(journal_bytes);
    let seal = Bytes::copy_from_slice(seal_bytes);
    let output = Bytes::copy_from_slice(agent_output_bytes);
    let oracle_sig = Bytes::copy_from_slice(oracle_signature);

    let tx = contract
        .executeWithOracle(journal, seal, output, oracle_sig, oracle_timestamp)
        .send()
        .await
        .map_err(|e| Error::OnChain(format!("Transaction failed: {}", e)))?;

    let receipt = tx
        .get_receipt()
        .await
        .map_err(|e| Error::OnChain(format!("Failed to get receipt: {}", e)))?;

    let tx_hash = format!("0x{}", hex::encode(receipt.transaction_hash.as_slice()));

    Ok(ExecuteResult {
        tx_hash,
        block_number: receipt.block_number,
        success: receipt.status(),
    })
}

// ============================================================================
// Optimistic execution helpers
// ============================================================================

/// Bond configuration read from the vault and its BondManager.
#[cfg(feature = "onchain")]
#[derive(Debug, Clone)]
pub struct BondConfig {
    /// BondManager contract address (0x-prefixed)
    pub bond_manager: String,
    /// WSTON token address (0x-prefixed)
    pub wston_token: String,
    /// Effective minimum bond: max(vault.minBond, bondManager.getMinBond)
    pub min_bond: u128,
}

/// Read optimistic bond configuration from the vault and its BondManager.
///
/// Queries `vault.bondManager()`, `vault.minBond()`, `bondManager.bondToken()`,
/// and `bondManager.getMinBond(vault)` to determine the WSTON token address
/// and effective minimum bond amount.
#[cfg(feature = "onchain")]
pub async fn read_bond_config(vault_address: &str, rpc_url: &str) -> Result<BondConfig> {
    use alloy::primitives::Address;
    use alloy::providers::ProviderBuilder;
    use alloy::sol;
    use std::str::FromStr;

    sol! {
        #[sol(rpc)]
        interface IOptimisticVault {
            function bondManager() external view returns (address);
            function minBond() external view returns (uint256);
        }
        #[sol(rpc)]
        interface IBondManager {
            function bondToken() external view returns (address);
            function getMinBond(address vault) external view returns (uint256);
        }
    }

    let vault = Address::from_str(vault_address)
        .map_err(|_| Error::OnChain(format!("Invalid vault address: {}", vault_address)))?;
    let url: reqwest::Url = rpc_url
        .parse()
        .map_err(|_| Error::OnChain(format!("Invalid RPC URL: {}", rpc_url)))?;
    let provider = ProviderBuilder::new().on_http(url);

    let vault_contract = IOptimisticVault::new(vault, &provider);

    let bm_addr = vault_contract
        .bondManager()
        .call()
        .await
        .map_err(|e| Error::OnChain(format!("Failed to read bondManager: {}", e)))?
        ._0;
    if bm_addr == Address::ZERO {
        return Err(Error::OnChain(
            "BondManager not configured on vault".into(),
        ));
    }

    let vault_min = vault_contract
        .minBond()
        .call()
        .await
        .map_err(|e| Error::OnChain(format!("Failed to read vault minBond: {}", e)))?
        ._0;

    let bm_contract = IBondManager::new(bm_addr, &provider);

    let wston_addr = bm_contract
        .bondToken()
        .call()
        .await
        .map_err(|e| Error::OnChain(format!("Failed to read bondToken: {}", e)))?
        ._0;

    let bm_min = bm_contract
        .getMinBond(vault)
        .call()
        .await
        .map_err(|e| Error::OnChain(format!("Failed to read getMinBond: {}", e)))?
        ._0;

    let effective_min = if vault_min > bm_min {
        vault_min
    } else {
        bm_min
    };
    let min_bond: u128 = effective_min.try_into().unwrap_or(u128::MAX);

    Ok(BondConfig {
        bond_manager: format!("{}", bm_addr),
        wston_token: format!("{}", wston_addr),
        min_bond,
    })
}

/// Ensure the operator has approved sufficient WSTON for the BondManager.
///
/// Checks the operator's WSTON allowance for the BondManager contract.
/// If below `min_required`, approves max uint256 (standard DeFi pattern).
/// Returns `true` if a new approval was sent, `false` if already sufficient.
#[cfg(feature = "onchain")]
pub async fn ensure_wston_approval(
    wston_address: &str,
    bond_manager_address: &str,
    rpc_url: &str,
    private_key: &str,
    min_required: u128,
) -> Result<bool> {
    use alloy::network::EthereumWallet;
    use alloy::primitives::{Address, U256};
    use alloy::providers::ProviderBuilder;
    use alloy::signers::local::PrivateKeySigner;
    use alloy::sol;
    use std::str::FromStr;

    sol! {
        #[sol(rpc)]
        interface IERC20 {
            function allowance(address owner, address spender) external view returns (uint256);
            function approve(address spender, uint256 amount) external returns (bool);
        }
    }

    let wston = Address::from_str(wston_address)
        .map_err(|_| Error::OnChain(format!("Invalid WSTON address: {}", wston_address)))?;
    let bm = Address::from_str(bond_manager_address)
        .map_err(|_| {
            Error::OnChain(format!(
                "Invalid BondManager address: {}",
                bond_manager_address
            ))
        })?;
    let url: reqwest::Url = rpc_url
        .parse()
        .map_err(|_| Error::OnChain(format!("Invalid RPC URL: {}", rpc_url)))?;

    let pk_clean = private_key.strip_prefix("0x").unwrap_or(private_key);
    let signer: PrivateKeySigner = pk_clean
        .parse()
        .map_err(|_| Error::OnChain("Invalid private key for WSTON approval".into()))?;
    let operator = signer.address();
    let wallet = EthereumWallet::from(signer);
    let provider = ProviderBuilder::new()
        .with_recommended_fillers()
        .wallet(wallet)
        .on_http(url);

    let token = IERC20::new(wston, &provider);
    let current_allowance = token
        .allowance(operator, bm)
        .call()
        .await
        .map_err(|e| Error::OnChain(format!("Failed to check WSTON allowance: {}", e)))?
        ._0;

    if current_allowance >= U256::from(min_required) {
        return Ok(false); // Already approved
    }

    eprintln!("[WSTON] Approving BondManager for WSTON spending...");
    let tx = token
        .approve(bm, U256::MAX)
        .send()
        .await
        .map_err(|e| Error::OnChain(format!("WSTON approve tx failed: {}", e)))?;
    let receipt = tx
        .get_receipt()
        .await
        .map_err(|e| Error::OnChain(format!("WSTON approve receipt failed: {}", e)))?;
    if !receipt.status() {
        return Err(Error::OnChain("WSTON approve transaction reverted".into()));
    }

    Ok(true) // Approved
}

/// Call vault.selfSlash(nonce) to gracefully forfeit the bond.
///
/// Used by the prove_worker when proof generation has exhausted all retries.
/// Self-slash distributes the bond: 90% to vault depositors, 10% to treasury
/// (no finder fee since the operator initiates it).
#[cfg(feature = "onchain")]
pub async fn self_slash(
    vault_address: &str,
    rpc_url: &str,
    private_key: &str,
    execution_nonce: u64,
) -> Result<()> {
    use alloy::network::EthereumWallet;
    use alloy::primitives::Address;
    use alloy::providers::ProviderBuilder;
    use alloy::signers::local::PrivateKeySigner;
    use alloy::sol;
    use std::str::FromStr;

    sol! {
        #[sol(rpc)]
        interface IOptimisticKernelVault {
            function selfSlash(uint64 executionNonce) external;
        }
    }

    let vault = Address::from_str(vault_address)
        .map_err(|_| Error::OnChain(format!("Invalid vault address: {}", vault_address)))?;
    let url: reqwest::Url = rpc_url
        .parse()
        .map_err(|_| Error::OnChain(format!("Invalid RPC URL: {}", rpc_url)))?;

    let pk_clean = private_key.strip_prefix("0x").unwrap_or(private_key);
    let signer: PrivateKeySigner = pk_clean
        .parse()
        .map_err(|_| Error::OnChain("Invalid private key for self-slash".into()))?;
    let wallet = EthereumWallet::from(signer);
    let provider = ProviderBuilder::new()
        .with_recommended_fillers()
        .wallet(wallet)
        .on_http(url);

    let contract = IOptimisticKernelVault::new(vault, provider);
    let tx = contract
        .selfSlash(execution_nonce)
        .send()
        .await
        .map_err(|e| Error::OnChain(format!("selfSlash tx failed: {}", e)))?;
    let receipt = tx
        .get_receipt()
        .await
        .map_err(|e| Error::OnChain(format!("selfSlash receipt failed: {}", e)))?;
    if !receipt.status() {
        return Err(Error::OnChain(format!(
            "selfSlash transaction reverted for nonce {}",
            execution_nonce
        )));
    }

    let tx_hash = format!("0x{}", hex::encode(receipt.transaction_hash.as_slice()));
    eprintln!(
        "[self-slash] selfSlash tx confirmed: {} (nonce {})",
        tx_hash, execution_nonce
    );

    Ok(())
}
