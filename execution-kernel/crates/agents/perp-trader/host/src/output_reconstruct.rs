//! Agent output reconstruction.
//!
//! Re-runs agent_main() on the host side to produce the actual output bytes
//! that match the action_commitment in the ZK journal. The ZK proof only
//! commits to SHA256(agent_output_bytes), so the host must reconstruct them.

use crate::error::{Error, Result};
use kernel_core::{CanonicalDecode, CanonicalEncode, KernelInputV1};
use kernel_sdk::agent::AgentContext;
use sha2::{Digest, Sha256};

/// Re-run the perp-trader agent and return (encoded_output_bytes, action_commitment).
pub fn reconstruct_output(
    kernel_input: &KernelInputV1,
    _input_bytes: &[u8],
) -> Result<(Vec<u8>, [u8; 32])> {
    // Build AgentContext from kernel input fields
    let ctx = AgentContext {
        protocol_version: kernel_input.protocol_version,
        kernel_version: kernel_input.kernel_version,
        agent_id: kernel_input.agent_id,
        agent_code_hash: kernel_input.agent_code_hash,
        constraint_set_hash: kernel_input.constraint_set_hash,
        input_root: kernel_input.input_root,
        execution_nonce: kernel_input.execution_nonce,
    };

    // Call the agent's entry point directly
    let output = perp_trader::agent_main(&ctx, &kernel_input.opaque_agent_inputs);

    // Encode the output using canonical encoding
    let output_bytes = output
        .encode()
        .map_err(|e| Error::OutputReconstruct(format!("Failed to encode output: {:?}", e)))?;

    // Compute action commitment = SHA256(output_bytes)
    let mut hasher = Sha256::new();
    hasher.update(&output_bytes);
    let hash = hasher.finalize();
    let mut commitment = [0u8; 32];
    commitment.copy_from_slice(&hash);

    Ok((output_bytes, commitment))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reconstruct_deterministic() {
        // Build a minimal kernel input that produces a no-op (empty actions)
        let input = KernelInputV1 {
            protocol_version: 1,
            kernel_version: 1,
            agent_id: [0x42; 32],
            agent_code_hash: [0; 32], // Won't match real hash, but agent doesn't check
            constraint_set_hash: [0; 32],
            input_root: [0; 32],
            execution_nonce: 1,
            opaque_agent_inputs: vec![0u8; 10], // Too short → agent returns empty
        };
        let input_bytes = input.encode().unwrap();

        let (bytes1, commit1) = reconstruct_output(&input, &input_bytes).unwrap();
        let (bytes2, commit2) = reconstruct_output(&input, &input_bytes).unwrap();

        assert_eq!(bytes1, bytes2, "Output must be deterministic");
        assert_eq!(commit1, commit2, "Commitment must be deterministic");
    }
}
