//! DeFi Yield Farmer E2E Test
//!
//! Complete execution flow:
//! 1. Build KernelInputV1 with 89-byte opaque input for defi-yield-farmer
//! 2. Generate Groth16 proof via RISC Zero zkVM
//! 3. Submit vault.execute(journal, seal, agentOutput) on Sepolia
//!
//! # Running
//!
//! ```bash
//! cd execution-kernel
//! source contracts/.env
//! DEFI_VAULT=0xdced20520ffc386b23cbc72192ce1b95a6b280c8 \
//! cargo test --release -p e2e-tests --features defi-e2e \
//!   test_defi_yield_farmer_execution -- --ignored --nocapture
//! ```

#![cfg(feature = "defi-e2e")]

use kernel_core::{KernelInputV1, KERNEL_VERSION, PROTOCOL_VERSION};

/// AAVE V3 Sepolia Pool address.
const AAVE_POOL: [u8; 20] = [
    0x6A, 0xe4, 0x3d, 0x32, 0x71, 0xff, 0x68, 0x88, 0xe7, 0xfc,
    0x43, 0xfd, 0x73, 0x21, 0xa5, 0x03, 0xff, 0x73, 0x89, 0x51,
];

/// AAVE V3 Sepolia DAI address.
const DAI_TOKEN: [u8; 20] = [
    0xFF, 0x34, 0xB3, 0xd4, 0xAe, 0xe8, 0xdd, 0xCd, 0x6F, 0x9A,
    0xFF, 0xFB, 0x6F, 0xe4, 0x9B, 0xD3, 0x71, 0xb8, 0xa3, 0x57,
];

/// AAVE V3 Sepolia WETH address.
const WETH_TOKEN: [u8; 20] = [
    0xC5, 0x58, 0xDB, 0xdd, 0x85, 0x65, 0x01, 0xFC, 0xd9, 0xaa,
    0xF1, 0xE6, 0x2E, 0xAE, 0x57, 0xA9, 0xF0, 0x62, 0x9A, 0x3c,
];

/// Action flags for the defi-yield-farmer agent.
const FLAG_EVALUATE: u8 = 0;
const FLAG_FORCE_SUPPLY: u8 = 1;
const FLAG_APPROVE_AND_SUPPLY: u8 = 3;

/// Build the 89-byte opaque input for the defi-yield-farmer agent.
pub fn build_defi_agent_input(
    lending_pool: &[u8; 20],
    asset_token: &[u8; 20],
    vault_address: &[u8; 20],
    vault_balance: u64,
    supplied_amount: u64,
    supply_rate_bps: u32,
    min_supply_rate_bps: u32,
    target_utilization_bps: u32,
    action_flag: u8,
) -> Vec<u8> {
    let mut input = Vec::with_capacity(89);
    input.extend_from_slice(lending_pool);
    input.extend_from_slice(asset_token);
    input.extend_from_slice(vault_address);
    input.extend_from_slice(&vault_balance.to_le_bytes());
    input.extend_from_slice(&supplied_amount.to_le_bytes());
    input.extend_from_slice(&supply_rate_bps.to_le_bytes());
    input.extend_from_slice(&min_supply_rate_bps.to_le_bytes());
    input.extend_from_slice(&target_utilization_bps.to_le_bytes());
    input.push(action_flag);
    input
}

/// Build a KernelInputV1 for the defi-yield-farmer.
pub fn build_defi_kernel_input(
    agent_id: [u8; 32],
    execution_nonce: u64,
    opaque_inputs: Vec<u8>,
) -> KernelInputV1 {
    KernelInputV1 {
        protocol_version: PROTOCOL_VERSION,
        kernel_version: KERNEL_VERSION,
        agent_id,
        agent_code_hash: defi_yield_farmer::AGENT_CODE_HASH,
        constraint_set_hash: [0u8; 32], // Default constraints
        input_root: [0u8; 32],
        execution_nonce,
        opaque_agent_inputs: opaque_inputs,
    }
}

/// Reconstruct the agent output bytes for a force-supply scenario.
///
/// We run the agent function directly to get the exact output that matches
/// the commitment in the proof journal.
pub fn compute_defi_agent_output_bytes(opaque_inputs: &[u8]) -> Vec<u8> {
    use kernel_sdk::prelude::{AgentContext, AgentOutput};
    use kernel_core::CanonicalEncode;

    let ctx = AgentContext {
        protocol_version: 1,
        kernel_version: 1,
        agent_id: [0u8; 32],
        agent_code_hash: defi_yield_farmer::AGENT_CODE_HASH,
        constraint_set_hash: [0u8; 32],
        input_root: [0u8; 32],
        execution_nonce: 1,
    };

    let output: AgentOutput = defi_yield_farmer::agent_main(&ctx, opaque_inputs);
    output.encode().expect("encode agent output")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_defi_agent_input_length() {
        let input = build_defi_agent_input(
            &AAVE_POOL, &DAI_TOKEN, &[0x33u8; 20],
            1_000_000, 0,
            500, 200, 8000,
            FLAG_EVALUATE,
        );
        assert_eq!(input.len(), 89);
    }

    #[test]
    fn test_compute_defi_agent_output_bytes_force_supply() {
        let input = build_defi_agent_input(
            &AAVE_POOL, &DAI_TOKEN, &[0x33u8; 20],
            1_000_000, 0,
            500, 200, 8000,
            FLAG_FORCE_SUPPLY,
        );
        let output = compute_defi_agent_output_bytes(&input);
        // force supply with balance > 0 should produce non-empty output
        assert!(!output.is_empty());
    }
}

// ============================================================================
// zkVM Proof + On-Chain Execution
// ============================================================================

#[cfg(test)]
mod e2e {
    use super::*;
    use kernel_core::{
        compute_action_commitment, CanonicalDecode, CanonicalEncode, ExecutionStatus,
        KernelJournalV1,
    };
    use risc0_methods_defi::{ZKVM_GUEST_DEFI_ELF, ZKVM_GUEST_DEFI_ID};
    use risc0_zkvm::{default_prover, ExecutorEnv, ProverOpts};

    /// Generate a Groth16 proof for the defi-yield-farmer agent.
    ///
    /// This test generates the proof and prints hex-encoded data
    /// suitable for on-chain submission.
    #[test]
    #[ignore = "requires RISC Zero Groth16 prover (Bonsai or local)"]
    fn test_defi_yield_farmer_proof_generation() {
        // Use approve-and-supply scenario: approve AAVE + supply 1 DAI
        let vault_balance: u64 = 1_000_000_000_000_000_000; // 1 DAI in wei

        // Vault address placeholder (update for actual deployment)
        let vault_addr_bytes: [u8; 20] = [
            0xb2, 0x3e, 0xe0, 0x4b, 0x3e, 0x62, 0xb9, 0xee, 0xee, 0x86,
            0xf7, 0x3f, 0x1a, 0x30, 0x08, 0x43, 0xf6, 0x30, 0xeb, 0x7a,
        ];

        let opaque_inputs = build_defi_agent_input(
            &AAVE_POOL,
            &DAI_TOKEN,
            &vault_addr_bytes,
            vault_balance,
            0, // nothing supplied yet
            500, // 5% supply rate
            200, // 2% min threshold
            8000, // 80% target utilization
            FLAG_APPROVE_AND_SUPPLY,
        );

        // Build kernel input with the registered agent ID
        let agent_id = hex::decode("a25971153b6762e25011c7e8cfef60f745e5ee606e78b4999d244529a8bec386")
            .expect("valid hex");
        let mut agent_id_arr = [0u8; 32];
        agent_id_arr.copy_from_slice(&agent_id);

        let kernel_input = build_defi_kernel_input(agent_id_arr, 1, opaque_inputs.clone());
        let input_bytes = kernel_input.encode().expect("encode kernel input");

        println!("=== Building Proof ===");
        println!("Agent ID: 0x{}", hex::encode(&agent_id_arr));
        println!("Code Hash: 0x{}", hex::encode(&defi_yield_farmer::AGENT_CODE_HASH));
        println!("Input bytes: {} bytes", input_bytes.len());

        // Build executor environment
        let env = ExecutorEnv::builder()
            .write(&input_bytes)
            .expect("failed to write input")
            .build()
            .expect("failed to build executor env");

        // Generate Groth16 proof
        println!("\nStarting Groth16 proof generation...");
        let prover = default_prover();
        let prove_info = prover
            .prove_with_opts(env, ZKVM_GUEST_DEFI_ELF, &ProverOpts::groth16())
            .expect("proof generation failed");

        println!("Proof generated!");

        // Verify receipt
        let receipt = prove_info.receipt;
        receipt
            .verify(ZKVM_GUEST_DEFI_ID)
            .expect("receipt verification failed");

        println!("Receipt verified against IMAGE_ID");

        // Decode journal
        let journal_bytes = receipt.journal.bytes.clone();
        let journal = KernelJournalV1::decode(&journal_bytes)
            .expect("journal decode failed");

        assert_eq!(journal.execution_status, ExecutionStatus::Success);
        println!("Execution status: Success");

        // Compute expected agent output
        let agent_output_bytes = compute_defi_agent_output_bytes(&opaque_inputs);
        let expected_commitment = compute_action_commitment(&agent_output_bytes);
        assert_eq!(journal.action_commitment, expected_commitment, "commitment mismatch");

        // Extract Groth16 seal
        let encoded_seal = match &receipt.inner {
            risc0_zkvm::InnerReceipt::Groth16(g) => {
                let selector = &g.verifier_parameters.as_bytes()[..4];
                let mut seal = Vec::with_capacity(4 + g.seal.len());
                seal.extend_from_slice(selector);
                seal.extend_from_slice(&g.seal);
                seal
            }
            _ => panic!("Expected Groth16 receipt"),
        };

        let image_id_bytes: Vec<u8> = ZKVM_GUEST_DEFI_ID
            .iter()
            .flat_map(|x| x.to_le_bytes())
            .collect();

        println!("\n=== On-Chain Execution Data ===");
        println!("IMAGE_ID: 0x{}", hex::encode(&image_id_bytes));
        println!("JOURNAL: 0x{}", hex::encode(&journal_bytes));
        println!("SEAL: 0x{}", hex::encode(&encoded_seal));
        println!("AGENT_OUTPUT: 0x{}", hex::encode(&agent_output_bytes));
        println!("Journal: {} bytes", journal_bytes.len());
        println!("Seal: {} bytes", encoded_seal.len());
        println!("Agent output: {} bytes", agent_output_bytes.len());

        // Print cast command for manual submission
        println!("\n=== Submit with cast ===");
        println!("cast send $DEFI_VAULT \\");
        println!("  \"execute(bytes,bytes,bytes)\" \\");
        println!("  0x{} \\", hex::encode(&journal_bytes));
        println!("  0x{} \\", hex::encode(&encoded_seal));
        println!("  0x{} \\", hex::encode(&agent_output_bytes));
        println!("  --private-key $PRIVATE_KEY --rpc-url $RPC_URL");
    }

    /// Full on-chain E2E: generate proof + submit to vault on Sepolia.
    #[tokio::test]
    #[ignore = "requires deployed contracts and Groth16 prover"]
    async fn test_defi_yield_farmer_execution() {
        use alloy::{
            network::EthereumWallet,
            primitives::{Address, Bytes},
            providers::ProviderBuilder,
            signers::local::PrivateKeySigner,
            sol,
        };
        use kernel_core::{CanonicalDecode, CanonicalEncode, ExecutionStatus, KernelJournalV1};
        use risc0_methods_defi::{ZKVM_GUEST_DEFI_ELF, ZKVM_GUEST_DEFI_ID};
        use risc0_zkvm::{default_prover, ExecutorEnv, ProverOpts};
        use std::env;
        use std::str::FromStr;

        sol! {
            #[sol(rpc)]
            interface IKernelVault {
                function execute(bytes calldata journal, bytes calldata seal, bytes calldata agentOutputBytes) external;
                function lastExecutionNonce() external view returns (uint64);
                function totalAssets() external view returns (uint256);
                function agentId() external view returns (bytes32);
            }
        }

        // Load .env from contracts/ directory
        let _ = dotenvy::from_filename("contracts/.env");
        let _ = dotenvy::dotenv();

        let vault_addr: Address = env::var("DEFI_VAULT")
            .expect("DEFI_VAULT not set")
            .parse()
            .expect("invalid vault address");
        let rpc_url = env::var("RPC_URL").expect("RPC_URL not set");
        let private_key = env::var("PRIVATE_KEY").expect("PRIVATE_KEY not set");

        // Setup provider
        let signer = PrivateKeySigner::from_str(&private_key).expect("Invalid private key");
        let wallet = EthereumWallet::from(signer);
        let provider = ProviderBuilder::new()
            .with_recommended_fillers()
            .wallet(wallet)
            .on_http(rpc_url.parse().expect("Invalid RPC URL"));

        let vault = IKernelVault::new(vault_addr, &provider);

        // Get current state
        let nonce = vault.lastExecutionNonce().call().await.expect("get nonce")._0;
        let total_assets = vault.totalAssets().call().await.expect("get assets")._0;
        let agent_id_bytes = vault.agentId().call().await.expect("get agentId")._0;
        let agent_id: [u8; 32] = agent_id_bytes.into();

        println!("=== Vault State ===");
        println!("Vault: {}", vault_addr);
        println!("Total Assets: {} DAI wei", total_assets);
        println!("Last Nonce: {}", nonce);
        println!("Agent ID: 0x{}", hex::encode(&agent_id));

        let execution_nonce = nonce + 1;

        // Convert vault address to 20-byte array for agent input
        let vault_addr_bytes: [u8; 20] = vault_addr.into_array();

        // Build agent input: approve-and-supply mode with WETH
        // This emits two actions: WETH.approve(AAVE_POOL, amount) + AAVE.supply(WETH, amount, vault, 0)
        // Using WETH because DAI/USDC supply caps are exceeded on Sepolia testnet.
        let vault_balance: u64 = 5_000_000_000_000_000; // 0.005 WETH
        let opaque_inputs = build_defi_agent_input(
            &AAVE_POOL, &WETH_TOKEN,
            &vault_addr_bytes,
            vault_balance,
            0,    // nothing supplied
            500,  // supply_rate: 5%
            200,  // min_supply_rate: 2%
            8000, // target_utilization: 80%
            FLAG_APPROVE_AND_SUPPLY,
        );

        let kernel_input = build_defi_kernel_input(agent_id, execution_nonce, opaque_inputs.clone());
        let input_bytes = kernel_input.encode().expect("encode");

        // Generate Groth16 proof
        println!("\n=== Generating Groth16 Proof ===");
        let env = ExecutorEnv::builder()
            .write(&input_bytes)
            .expect("write input")
            .build()
            .expect("build env");

        let prover = default_prover();
        let prove_info = prover
            .prove_with_opts(env, ZKVM_GUEST_DEFI_ELF, &ProverOpts::groth16())
            .expect("proof generation failed");

        let receipt = prove_info.receipt;
        receipt.verify(ZKVM_GUEST_DEFI_ID).expect("verify failed");

        let journal_bytes = receipt.journal.bytes.clone();
        let journal = KernelJournalV1::decode(&journal_bytes).expect("decode");
        assert_eq!(journal.execution_status, ExecutionStatus::Success);

        let encoded_seal = match &receipt.inner {
            risc0_zkvm::InnerReceipt::Groth16(g) => {
                let sel = &g.verifier_parameters.as_bytes()[..4];
                let mut s = Vec::with_capacity(4 + g.seal.len());
                s.extend_from_slice(sel);
                s.extend_from_slice(&g.seal);
                s
            }
            _ => panic!("Expected Groth16"),
        };

        let agent_output_bytes = compute_defi_agent_output_bytes(&opaque_inputs);

        println!("Proof generated! Journal: {} bytes, Seal: {} bytes", journal_bytes.len(), encoded_seal.len());

        // Submit execution
        println!("\n=== Submitting Execution ===");
        let tx = vault.execute(
            Bytes::from(journal_bytes),
            Bytes::from(encoded_seal),
            Bytes::from(agent_output_bytes),
        );

        let pending = tx.send().await.expect("send tx");
        println!("TX sent: {:?}", pending.tx_hash());

        let receipt = pending.get_receipt().await.expect("get receipt");
        println!("Confirmed in block: {:?}", receipt.block_number);
        println!("Gas used: {}", receipt.gas_used);
        assert!(receipt.status(), "Execution failed on-chain");

        // Verify final state
        let final_nonce = vault.lastExecutionNonce().call().await.expect("nonce")._0;
        let final_assets = vault.totalAssets().call().await.expect("assets")._0;

        println!("\n=== Final State ===");
        println!("Nonce: {} -> {}", nonce, final_nonce);
        println!("Total Assets: {} -> {} DAI wei", total_assets, final_assets);
        assert_eq!(final_nonce, execution_nonce);

        // Verify assets decreased (1 DAI was supplied to AAVE)
        assert!(
            final_assets < total_assets,
            "Total assets should decrease after supply (DAI transferred to AAVE)"
        );
        let supplied = total_assets - final_assets;
        println!("Supplied to AAVE: {} DAI wei", supplied);

        println!("\n=== DeFi Yield Farmer E2E — Real AAVE Supply Passed! ===");
    }
}
