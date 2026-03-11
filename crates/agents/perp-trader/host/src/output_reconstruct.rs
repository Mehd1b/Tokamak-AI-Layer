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

    /// Diagnostic: compare predicted journal (host-side) vs what
    /// kernel_main_with_agent would produce (same code path as zkVM guest).
    ///
    /// Uses persisted input files from /tmp/perp-optimistic-nonce-*.input.bin
    /// if they exist. This catches journal mismatches caused by:
    /// - Constraint enforcement changing the output
    /// - Encoding differences
    /// - Agent code hash mismatches
    #[test]
    fn test_predicted_vs_guest_journal_nonce3() {
        predicted_vs_guest_journal_for_nonce(3);
    }

    #[test]
    fn test_predicted_vs_guest_journal_nonce4() {
        predicted_vs_guest_journal_for_nonce(4);
    }

    /// Definitive test: call perp_trader::kernel_main() (exact same function
    /// the zkVM guest calls) on native x86 and compare with predicted journal.
    #[test]
    fn test_kernel_main_vs_predicted_nonce3() {
        kernel_main_vs_predicted_for_nonce(3);
    }

    #[test]
    fn test_kernel_main_vs_predicted_nonce4() {
        kernel_main_vs_predicted_for_nonce(4);
    }

    fn kernel_main_vs_predicted_for_nonce(nonce: u64) {
        use kernel_core::{sha256, KernelJournalV1};

        let input_path = format!("/tmp/perp-optimistic-nonce-{}.input.bin", nonce);
        let input_bytes = match std::fs::read(&input_path) {
            Ok(b) => b,
            Err(_) => {
                eprintln!("Skipping: {} not found", input_path);
                return;
            }
        };

        eprintln!("=== kernel_main() diagnostic for nonce {} ===", nonce);

        // Run kernel_main (same function the zkVM guest calls)
        let kernel_journal_bytes = perp_trader::kernel_main(&input_bytes)
            .expect("kernel_main failed");
        let kernel_hash = sha256(&kernel_journal_bytes);
        eprintln!(
            "  kernel_main journal hash: 0x{}",
            hex::encode(&kernel_hash)
        );
        eprintln!(
            "  kernel_main journal len: {} bytes",
            kernel_journal_bytes.len()
        );

        // Build predicted journal (host path)
        let input = KernelInputV1::decode(&input_bytes).expect("Failed to decode input");
        let (host_output_bytes, _) =
            reconstruct_output(&input, &input_bytes).expect("reconstruct_output failed");
        let predicted_journal = reference_integrator::predict::build_predicted_journal(
            &input,
            &input_bytes,
            &host_output_bytes,
        )
        .expect("build_predicted_journal failed");
        let predicted_hash = sha256(&predicted_journal);
        eprintln!(
            "  predicted journal hash:   0x{}",
            hex::encode(&predicted_hash)
        );

        if kernel_hash == predicted_hash {
            eprintln!("  MATCH: kernel_main and predicted journals are identical on x86.");
        } else {
            // Decode both for field comparison
            let kj = KernelJournalV1::decode(&kernel_journal_bytes).expect("decode kernel journal");
            let pj = KernelJournalV1::decode(&predicted_journal).expect("decode predicted journal");
            eprintln!("  MISMATCH! Field-by-field comparison:");
            eprintln!("    protocol_version: kernel={} predicted={}", kj.protocol_version, pj.protocol_version);
            eprintln!("    kernel_version: kernel={} predicted={}", kj.kernel_version, pj.kernel_version);
            eprintln!("    agent_id match: {}", kj.agent_id == pj.agent_id);
            eprintln!("    agent_code_hash match: {}", kj.agent_code_hash == pj.agent_code_hash);
            eprintln!("    constraint_set_hash match: {}", kj.constraint_set_hash == pj.constraint_set_hash);
            eprintln!("    input_root match: {}", kj.input_root == pj.input_root);
            eprintln!("    execution_nonce: kernel={} predicted={}", kj.execution_nonce, pj.execution_nonce);
            eprintln!("    input_commitment match: {}", kj.input_commitment == pj.input_commitment);
            eprintln!("    action_commitment: kernel=0x{} predicted=0x{}", hex::encode(&kj.action_commitment), hex::encode(&pj.action_commitment));
            eprintln!("    execution_status: kernel={:?} predicted={:?}", kj.execution_status, pj.execution_status);
            panic!(
                "Journal mismatch for nonce {}!",
                nonce
            );
        }
    }

    fn predicted_vs_guest_journal_for_nonce(nonce: u64) {
        use constraints::{enforce_constraints, ConstraintSetV1};
        use kernel_core::{
            sha256, ExecutionStatus, KernelJournalV1, KERNEL_VERSION, PROTOCOL_VERSION,
        };

        let input_path = format!("/tmp/perp-optimistic-nonce-{}.input.bin", nonce);
        let input_bytes = match std::fs::read(&input_path) {
            Ok(b) => b,
            Err(_) => {
                eprintln!("Skipping: {} not found", input_path);
                return;
            }
        };

        eprintln!("=== Diagnostic for nonce {} ({} bytes) ===", nonce, input_bytes.len());

        let input = KernelInputV1::decode(&input_bytes).expect("Failed to decode input");
        eprintln!("  agent_id: 0x{}", hex::encode(&input.agent_id));
        eprintln!("  agent_code_hash: 0x{}", hex::encode(&input.agent_code_hash));
        eprintln!("  execution_nonce: {}", input.execution_nonce);
        eprintln!("  opaque_inputs len: {}", input.opaque_agent_inputs.len());

        // ---- HOST PATH: reconstruct_output + build_predicted_journal ----
        let (host_output_bytes, host_commitment) =
            reconstruct_output(&input, &input_bytes).expect("reconstruct_output failed");
        let host_output =
            kernel_core::AgentOutput::decode(&host_output_bytes).expect("Failed to decode host output");
        eprintln!("  Host output: {} actions", host_output.actions.len());
        for (i, a) in host_output.actions.iter().enumerate() {
            eprintln!(
                "    action[{}]: type=0x{:08x} target=0x{}...  payload={} bytes",
                i,
                a.action_type,
                hex::encode(&a.target[12..20]),
                a.payload.len()
            );
        }

        let predicted_journal = reference_integrator::predict::build_predicted_journal(
            &input,
            &input_bytes,
            &host_output_bytes,
        )
        .expect("build_predicted_journal failed");
        let predicted_hash = sha256(&predicted_journal);
        eprintln!(
            "  Predicted journal hash: 0x{}",
            hex::encode(&predicted_hash)
        );

        // ---- GUEST PATH: enforce_constraints + build journal like kernel_main_with_agent ----
        let constraint_set = ConstraintSetV1::default();
        let (validated_output, execution_status) =
            match enforce_constraints(&input, &host_output, &constraint_set) {
                Ok(validated) => {
                    eprintln!("  Constraints: PASSED");
                    (validated, ExecutionStatus::Success)
                }
                Err(violation) => {
                    eprintln!("  Constraints: FAILED - {:?}", violation);
                    (
                        kernel_core::AgentOutput { actions: vec![] },
                        ExecutionStatus::Failure,
                    )
                }
            };

        // Compute action commitment the way the guest does
        let guest_action_commitment = if execution_status == ExecutionStatus::Success {
            let validated_bytes = validated_output
                .encode()
                .expect("Failed to encode validated output");
            eprintln!(
                "  Validated output bytes len: {} (host: {})",
                validated_bytes.len(),
                host_output_bytes.len()
            );
            if validated_bytes != host_output_bytes {
                eprintln!("  WARNING: Validated output bytes differ from host output bytes!");
                for (i, (a, b)) in validated_bytes.iter().zip(host_output_bytes.iter()).enumerate()
                {
                    if a != b {
                        eprintln!(
                            "    First diff at byte {}: validated=0x{:02x} host=0x{:02x}",
                            i, a, b
                        );
                        break;
                    }
                }
                if validated_bytes.len() != host_output_bytes.len() {
                    eprintln!(
                        "    Length diff: validated={} host={}",
                        validated_bytes.len(),
                        host_output_bytes.len()
                    );
                }
            }
            sha256(&validated_bytes)
        } else {
            eprintln!("  Using EMPTY_OUTPUT_COMMITMENT due to constraint failure");
            constraints::EMPTY_OUTPUT_COMMITMENT
        };

        // Build guest journal
        let input_commitment = sha256(&input_bytes);
        let guest_journal = KernelJournalV1 {
            protocol_version: PROTOCOL_VERSION,
            kernel_version: KERNEL_VERSION,
            agent_id: input.agent_id,
            agent_code_hash: input.agent_code_hash,
            constraint_set_hash: input.constraint_set_hash,
            input_root: input.input_root,
            execution_nonce: input.execution_nonce,
            input_commitment,
            action_commitment: guest_action_commitment,
            execution_status,
        };
        let guest_journal_bytes = guest_journal.encode().expect("Failed to encode guest journal");
        let guest_hash = sha256(&guest_journal_bytes);
        eprintln!("  Guest journal hash: 0x{}", hex::encode(&guest_hash));

        // ---- COMPARE ----
        if predicted_hash == guest_hash {
            eprintln!("  MATCH: Predicted and guest journals are identical.");
        } else {
            eprintln!("  MISMATCH between predicted and guest journals!");
            // Decode both and compare field by field
            let pred_j =
                KernelJournalV1::decode(&predicted_journal).expect("decode predicted");
            eprintln!("  Predicted: status={:?} action_commitment=0x{}", pred_j.execution_status, hex::encode(&pred_j.action_commitment));
            eprintln!("  Guest:     status={:?} action_commitment=0x{}", guest_journal.execution_status, hex::encode(&guest_journal.action_commitment));
            eprintln!("  Predicted input_commitment: 0x{}", hex::encode(&pred_j.input_commitment));
            eprintln!("  Guest     input_commitment: 0x{}", hex::encode(&guest_journal.input_commitment));
            panic!(
                "Journal mismatch for nonce {}! predicted_hash=0x{} guest_hash=0x{}",
                nonce,
                hex::encode(&predicted_hash),
                hex::encode(&guest_hash)
            );
        }
    }
}
