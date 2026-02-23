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
                bytes calldata oracleSignature
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
        .executeWithOracle(journal, seal, output, oracle_sig)
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
