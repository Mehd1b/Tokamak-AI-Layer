//! Optimistic execution submission and proof finalization.
//!
//! Provides functions to submit optimistic executions (without proof)
//! and later submit proofs to finalize them on-chain.
//!
//! All public items in this module are feature-gated behind `onchain`
//! since they require network access via alloy.

#[cfg(feature = "onchain")]
use crate::ExecuteError;

/// Information about a pending optimistic execution.
#[cfg(feature = "onchain")]
#[derive(Debug, Clone)]
pub struct PendingExecutionInfo {
    /// SHA-256 hash of the submitted journal.
    pub journal_hash: [u8; 32],
    /// Action commitment from the journal.
    pub action_commitment: [u8; 32],
    /// Bond amount escrowed (in wei).
    pub bond_amount: u128,
    /// Block timestamp deadline for proof submission.
    pub deadline: u64,
    /// Status: 0 = empty, 1 = pending, 2 = finalized, 3 = slashed.
    pub status: u8,
}

/// Submit an optimistic execution to an OptimisticKernelVault.
///
/// Calls `vault.executeOptimistic{value: bond}(journal, agentOutputBytes, oracleSig, oracleTs)`.
/// Actions execute immediately on-chain. The bond is escrowed until the proof
/// is submitted or the challenge window expires.
///
/// # Arguments
///
/// * `rpc_url` - RPC endpoint URL
/// * `vault_address` - OptimisticKernelVault contract address (0x-prefixed)
/// * `private_key` - Private key for signing (0x-prefixed hex)
/// * `journal` - The 209-byte predicted journal
/// * `agent_output_bytes` - The raw agent output (actions that were committed)
/// * `oracle_signature` - Oracle attestation signature
/// * `oracle_timestamp` - Oracle attestation timestamp
/// * `bond_wei` - Bond amount in wei to send with the transaction
///
/// # Returns
///
/// The execution nonce from the emitted `OptimisticExecutionSubmitted` event.
#[cfg(feature = "onchain")]
pub async fn submit_optimistic(
    rpc_url: &str,
    vault_address: &str,
    private_key: &str,
    journal: &[u8],
    agent_output_bytes: &[u8],
    oracle_signature: &[u8],
    oracle_timestamp: u64,
    bond_wei: u128,
) -> Result<u64, ExecuteError> {
    use alloy::network::EthereumWallet;
    use alloy::primitives::{Address, Bytes, U256};
    use alloy::providers::ProviderBuilder;
    use alloy::signers::local::PrivateKeySigner;
    use alloy::sol;
    use std::str::FromStr;

    // Define the optimistic vault interface
    sol! {
        #[sol(rpc)]
        interface IOptimisticKernelVault {
            function executeOptimistic(
                bytes calldata journal,
                bytes calldata agentOutputBytes,
                bytes calldata oracleSig,
                uint64 oracleTs
            ) external payable;

            event OptimisticExecutionSubmitted(
                uint64 indexed executionNonce,
                bytes32 journalHash,
                bytes32 actionCommitment,
                uint256 bondAmount,
                uint256 deadline
            );
        }
    }

    // Parse vault address
    let vault = Address::from_str(vault_address)
        .map_err(|_| ExecuteError::InvalidVaultAddress(vault_address.to_string()))?;

    // Parse RPC URL
    let url = rpc_url
        .parse()
        .map_err(|_| ExecuteError::InvalidRpcUrl(rpc_url.to_string()))?;

    // Parse private key
    let pk_clean = private_key.strip_prefix("0x").unwrap_or(private_key);
    let signer: PrivateKeySigner = pk_clean
        .parse()
        .map_err(|_| ExecuteError::InvalidPrivateKey)?;

    let wallet = EthereumWallet::from(signer);

    // Create provider with wallet and recommended fillers
    let provider = ProviderBuilder::new()
        .with_recommended_fillers()
        .wallet(wallet)
        .on_http(url);

    // Create contract instance
    let contract = IOptimisticKernelVault::new(vault, provider);

    // Build the transaction
    let journal_bytes = Bytes::copy_from_slice(journal);
    let output_bytes = Bytes::copy_from_slice(agent_output_bytes);
    let oracle_sig = Bytes::copy_from_slice(oracle_signature);

    // Send the transaction with bond value
    let tx = contract
        .executeOptimistic(journal_bytes, output_bytes, oracle_sig, oracle_timestamp)
        .value(U256::from(bond_wei))
        .send()
        .await
        .map_err(|e| ExecuteError::TransactionFailed(e.to_string()))?;

    // Wait for confirmation
    let receipt = tx
        .get_receipt()
        .await
        .map_err(|e| ExecuteError::RpcError(e.to_string()))?;

    if !receipt.status() {
        return Err(ExecuteError::TransactionFailed(
            "Transaction reverted".to_string(),
        ));
    }

    // Parse OptimisticExecutionSubmitted event for the nonce
    use alloy::sol_types::SolEvent;
    for log in receipt.inner.logs() {
        if let Ok(event) =
            IOptimisticKernelVault::OptimisticExecutionSubmitted::decode_log(&log.inner, true)
        {
            return Ok(event.data.executionNonce);
        }
    }

    Err(ExecuteError::TransactionFailed(
        "OptimisticExecutionSubmitted event not found in receipt".to_string(),
    ))
}

/// Submit a proof to finalize a pending optimistic execution.
///
/// Calls `vault.submitProof(executionNonce, seal)` on the OptimisticKernelVault.
/// This is permissionless -- anyone can submit a valid proof to finalize
/// a pending execution and release the bond.
///
/// # Arguments
///
/// * `rpc_url` - RPC endpoint URL
/// * `vault_address` - OptimisticKernelVault contract address (0x-prefixed)
/// * `private_key` - Private key for signing (0x-prefixed hex)
/// * `execution_nonce` - The nonce of the pending execution to finalize
/// * `seal` - The proof seal bytes from zkVM proving
///
/// # Returns
///
/// `Ok(())` if the proof was submitted and the transaction confirmed.
#[cfg(feature = "onchain")]
pub async fn submit_proof(
    rpc_url: &str,
    vault_address: &str,
    private_key: &str,
    execution_nonce: u64,
    seal: &[u8],
) -> Result<(), ExecuteError> {
    use alloy::network::EthereumWallet;
    use alloy::primitives::{Address, Bytes};
    use alloy::providers::ProviderBuilder;
    use alloy::signers::local::PrivateKeySigner;
    use alloy::sol;
    use std::str::FromStr;

    sol! {
        #[sol(rpc)]
        interface IOptimisticKernelVault {
            function submitProof(uint64 executionNonce, bytes calldata seal) external;
        }
    }

    // Parse vault address
    let vault = Address::from_str(vault_address)
        .map_err(|_| ExecuteError::InvalidVaultAddress(vault_address.to_string()))?;

    // Parse RPC URL
    let url = rpc_url
        .parse()
        .map_err(|_| ExecuteError::InvalidRpcUrl(rpc_url.to_string()))?;

    // Parse private key
    let pk_clean = private_key.strip_prefix("0x").unwrap_or(private_key);
    let signer: PrivateKeySigner = pk_clean
        .parse()
        .map_err(|_| ExecuteError::InvalidPrivateKey)?;

    let wallet = EthereumWallet::from(signer);

    // Create provider with wallet and recommended fillers
    let provider = ProviderBuilder::new()
        .with_recommended_fillers()
        .wallet(wallet)
        .on_http(url);

    // Create contract instance
    let contract = IOptimisticKernelVault::new(vault, provider);

    // Build and send the transaction
    let seal_bytes = Bytes::copy_from_slice(seal);

    let tx = contract
        .submitProof(execution_nonce, seal_bytes)
        .send()
        .await
        .map_err(|e| ExecuteError::TransactionFailed(e.to_string()))?;

    // Wait for confirmation
    let receipt = tx
        .get_receipt()
        .await
        .map_err(|e| ExecuteError::RpcError(e.to_string()))?;

    if !receipt.status() {
        return Err(ExecuteError::TransactionFailed(
            "submitProof transaction reverted".to_string(),
        ));
    }

    Ok(())
}

/// Query a pending execution's status from the vault.
///
/// Reads the `pendingExecutions(uint64)` mapping on the OptimisticKernelVault
/// to retrieve the current state of an optimistic execution.
///
/// # Arguments
///
/// * `rpc_url` - RPC endpoint URL
/// * `vault_address` - OptimisticKernelVault contract address (0x-prefixed)
/// * `execution_nonce` - The nonce of the execution to query
///
/// # Returns
///
/// A [`PendingExecutionInfo`] with the execution's current state.
#[cfg(feature = "onchain")]
pub async fn query_pending_execution(
    rpc_url: &str,
    vault_address: &str,
    execution_nonce: u64,
) -> Result<PendingExecutionInfo, ExecuteError> {
    use alloy::primitives::Address;
    use alloy::providers::ProviderBuilder;
    use alloy::sol;
    use std::str::FromStr;

    sol! {
        #[sol(rpc)]
        interface IOptimisticKernelVault {
            function pendingExecutions(uint64 nonce) external view returns (
                bytes32 journalHash,
                bytes32 actionCommitment,
                uint256 bondAmount,
                uint256 deadline,
                uint8 status
            );
        }
    }

    // Parse vault address
    let vault = Address::from_str(vault_address)
        .map_err(|_| ExecuteError::InvalidVaultAddress(vault_address.to_string()))?;

    // Parse RPC URL
    let url = rpc_url
        .parse()
        .map_err(|_| ExecuteError::InvalidRpcUrl(rpc_url.to_string()))?;

    // Create provider (no wallet needed for view calls)
    let provider = ProviderBuilder::new().on_http(url);

    // Create contract instance
    let contract = IOptimisticKernelVault::new(vault, provider);

    // Call the view function
    let result = contract
        .pendingExecutions(execution_nonce)
        .call()
        .await
        .map_err(|e| ExecuteError::RpcError(e.to_string()))?;

    // Convert fixed bytes to arrays
    let mut journal_hash = [0u8; 32];
    journal_hash.copy_from_slice(result.journalHash.as_slice());

    let mut action_commitment = [0u8; 32];
    action_commitment.copy_from_slice(result.actionCommitment.as_slice());

    // Convert U256 bond amount to u128 (safe for reasonable bond sizes)
    let bond_amount: u128 = result
        .bondAmount
        .try_into()
        .map_err(|_| ExecuteError::RpcError("Bond amount exceeds u128".to_string()))?;

    // Convert U256 deadline to u64
    let deadline: u64 = result
        .deadline
        .try_into()
        .map_err(|_| ExecuteError::RpcError("Deadline exceeds u64".to_string()))?;

    Ok(PendingExecutionInfo {
        journal_hash,
        action_commitment,
        bond_amount,
        deadline,
        status: result.status,
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_module_compiles() {
        // This test verifies the module compiles correctly.
        // On-chain functions cannot be unit tested without a network.
        assert!(true);
    }
}
