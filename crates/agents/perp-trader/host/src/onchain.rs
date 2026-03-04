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

/// Deposit USDC from a vault's ERC-20 balance to HyperCore perp margin.
///
/// Calls adapter.depositMarginFromVaultAdmin(vault, amount).
/// Used to pre-deposit margin before REST API seed trades.
#[cfg(feature = "onchain")]
pub async fn deposit_margin_from_vault(cli: &crate::config::Cli, amount: u64) -> Result<()> {
    use alloy::network::EthereumWallet;
    use alloy::primitives::{Address, U256};
    use alloy::providers::ProviderBuilder;
    use alloy::signers::local::PrivateKeySigner;
    use alloy::sol;
    use std::str::FromStr;

    sol! {
        #[sol(rpc)]
        interface IAdapter {
            function depositMarginFromVaultAdmin(address vault, uint256 amount) external;
        }
    }

    let adapter_addr_str = cli.adapter_address.as_deref().unwrap_or(&cli.exchange_contract);
    let adapter = Address::from_str(adapter_addr_str)
        .map_err(|_| Error::OnChain(format!("Invalid adapter address: {}", adapter_addr_str)))?;
    let vault = Address::from_str(&cli.vault)
        .map_err(|_| Error::OnChain(format!("Invalid vault address: {}", cli.vault)))?;

    let url: reqwest::Url = cli.rpc
        .parse()
        .map_err(|_| Error::OnChain(format!("Invalid RPC URL: {}", cli.rpc)))?;

    let pk = crate::config::Cli::resolve_key(&cli.pk)?;
    let pk_clean = pk.strip_prefix("0x").unwrap_or(&pk);
    let signer: PrivateKeySigner = pk_clean
        .parse()
        .map_err(|_| Error::OnChain("Invalid private key for margin deposit".into()))?;

    let wallet = EthereumWallet::from(signer);
    let provider = ProviderBuilder::new()
        .with_recommended_fillers()
        .wallet(wallet)
        .on_http(url);

    let contract = IAdapter::new(adapter, &provider);

    let tx = contract
        .depositMarginFromVaultAdmin(vault, U256::from(amount))
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

    // Step 1: Transfer perp margin → spot (if any withdrawable)
    let perp_withdrawable = hl_client.get_perp_withdrawable(&cli.sub_account)
        .unwrap_or(0.0);
    if perp_withdrawable > 0.01 {
        // Leave 0.005 USDC buffer to avoid exceeding actual balance
        let amount_1e6 = ((perp_withdrawable - 0.005) * 1_000_000.0) as u64;
        if amount_1e6 > 0 {
            eprintln!("  [RECOVER] Step 1: perpToSpot({} raw USDC)...", amount_1e6);
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
    if spot_usdc > 0.01 {
        // adapter.transferSpotToEvm takes amount in 1e6 and internally multiplies by 100
        let amount_1e6 = ((spot_usdc - 0.005) * 1_000_000.0) as u64;
        if amount_1e6 > 0 {
            eprintln!("  [RECOVER] Step 2: spotToEvm({} raw USDC)...", amount_1e6);
            let tx = contract.transferSpotToEvm(vault, amount_1e6).send().await
                .map_err(|e| Error::OnChain(format!("spotToEvm tx failed: {}", e)))?;
            let receipt = tx.get_receipt().await
                .map_err(|e| Error::OnChain(format!("spotToEvm receipt failed: {}", e)))?;
            if !receipt.status() {
                return Err(Error::OnChain("spotToEvm transaction reverted".into()));
            }
            // Wait for HyperCore → EVM settlement
            tokio::time::sleep(std::time::Duration::from_secs(10)).await;

            // Verify USDC appeared on sub-account's EVM balance
            let evm_balance = usdc_contract.balanceOf(sub).call().await
                .map_err(|e| Error::OnChain(format!("balanceOf failed: {}", e)))?._0;
            if evm_balance.is_zero() {
                eprintln!("  [RECOVER] WARNING: spotToEvm may have been silently rejected (EVM USDC=0)");
                // Retry once after additional wait
                eprintln!("  [RECOVER] Waiting 15s and retrying...");
                tokio::time::sleep(std::time::Duration::from_secs(15)).await;
                let tx2 = contract.transferSpotToEvm(vault, amount_1e6).send().await
                    .map_err(|e| Error::OnChain(format!("spotToEvm retry tx failed: {}", e)))?;
                let receipt2 = tx2.get_receipt().await
                    .map_err(|e| Error::OnChain(format!("spotToEvm retry receipt failed: {}", e)))?;
                if !receipt2.status() {
                    return Err(Error::OnChain("spotToEvm retry reverted".into()));
                }
                tokio::time::sleep(std::time::Duration::from_secs(10)).await;
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
        eprintln!("  [RECOVER] Recovered {} USDC to vault", recovered);
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
