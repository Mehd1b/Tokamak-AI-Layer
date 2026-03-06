//! Predicted journal construction for optimistic execution.
//!
//! Builds a [`KernelJournalV1`] journal byte array without running the zkVM,
//! using host-side state that is known immediately after input construction
//! and agent output reconstruction.
//!
//! # Determinism
//!
//! The predicted journal is byte-identical to what the zkVM kernel would
//! produce, because both use the same fields, the same SHA-256 commitment
//! functions, and the same canonical codec. This property is what makes
//! optimistic execution safe: if the predicted journal does not match the
//! proof journal, the on-chain challenge will slash the bond.

use kernel_core::{
    sha256, CanonicalEncode, ExecutionStatus, KernelInputV1, KernelJournalV1, KERNEL_VERSION,
    PROTOCOL_VERSION,
};

/// Error type for journal prediction.
#[derive(Debug, thiserror::Error)]
pub enum PredictError {
    /// Failed to encode the predicted journal.
    #[error("Failed to encode predicted journal: {0}")]
    EncodeError(String),
}

/// Build a predicted journal from host-side state.
///
/// This constructs the exact same 209-byte journal that the zkVM kernel
/// would produce, without actually running the proof. The predicted journal
/// can be submitted optimistically on-chain, with the proof following later.
///
/// # Arguments
///
/// * `input` - The kernel input (provides identity fields: agent_id, agent_code_hash, etc.)
/// * `input_bytes` - The canonical encoding of the input (for `input_commitment` computation)
/// * `agent_output_bytes` - The canonical encoding of agent output (for `action_commitment` computation)
///
/// # Returns
///
/// The 209-byte encoded journal, identical to what the zkVM kernel would produce.
///
/// # Determinism
///
/// This function is deterministic: given the same inputs, it always produces
/// the same output. The journal bytes will match what the zkVM kernel produces
/// because both use the same fields and SHA-256 commitments.
pub fn build_predicted_journal(
    input: &KernelInputV1,
    input_bytes: &[u8],
    agent_output_bytes: &[u8],
) -> Result<Vec<u8>, PredictError> {
    // Compute input commitment = SHA256(input_bytes)
    let input_commitment = sha256(input_bytes);

    // Compute action commitment = SHA256(agent_output_bytes)
    let action_commitment = sha256(agent_output_bytes);

    // Build the journal struct with all fields from input + computed commitments
    let journal = KernelJournalV1 {
        protocol_version: PROTOCOL_VERSION,
        kernel_version: KERNEL_VERSION,
        agent_id: input.agent_id,
        agent_code_hash: input.agent_code_hash,
        constraint_set_hash: input.constraint_set_hash,
        input_root: input.input_root,
        execution_nonce: input.execution_nonce,
        input_commitment,
        action_commitment,
        execution_status: ExecutionStatus::Success,
    };

    // Encode using canonical encoding (same codec as zkVM)
    journal
        .encode()
        .map_err(|e| PredictError::EncodeError(format!("{:?}", e)))
}

/// Build a predicted [`KernelJournalV1`] struct from host-side state.
///
/// Like [`build_predicted_journal`] but returns the structured journal
/// instead of the encoded bytes. Useful when the caller needs to inspect
/// individual fields before encoding.
///
/// # Arguments
///
/// * `input` - The kernel input (provides identity fields)
/// * `input_bytes` - The canonical encoding of the input
/// * `agent_output_bytes` - The canonical encoding of agent output
///
/// # Returns
///
/// A [`KernelJournalV1`] with all fields populated.
pub fn build_predicted_journal_struct(
    input: &KernelInputV1,
    input_bytes: &[u8],
    agent_output_bytes: &[u8],
) -> KernelJournalV1 {
    let input_commitment = sha256(input_bytes);
    let action_commitment = sha256(agent_output_bytes);

    KernelJournalV1 {
        protocol_version: PROTOCOL_VERSION,
        kernel_version: KERNEL_VERSION,
        agent_id: input.agent_id,
        agent_code_hash: input.agent_code_hash,
        constraint_set_hash: input.constraint_set_hash,
        input_root: input.input_root,
        execution_nonce: input.execution_nonce,
        input_commitment,
        action_commitment,
        execution_status: ExecutionStatus::Success,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use kernel_core::{CanonicalDecode, KernelInputV1, KERNEL_VERSION, PROTOCOL_VERSION};

    /// Helper: build a test KernelInputV1 with deterministic values.
    fn test_input() -> KernelInputV1 {
        KernelInputV1 {
            protocol_version: PROTOCOL_VERSION,
            kernel_version: KERNEL_VERSION,
            agent_id: [0x42; 32],
            agent_code_hash: [0xAA; 32],
            constraint_set_hash: [0xBB; 32],
            input_root: [0xCC; 32],
            execution_nonce: 12345,
            opaque_agent_inputs: vec![1, 2, 3, 4, 5],
        }
    }

    /// Helper: build minimal agent output bytes (empty actions list).
    fn empty_agent_output_bytes() -> Vec<u8> {
        use kernel_core::AgentOutput;
        let output = AgentOutput {
            actions: vec![],
        };
        output.encode().unwrap()
    }

    #[test]
    fn test_predicted_journal_is_209_bytes() {
        let input = test_input();
        let input_bytes = input.encode().unwrap();
        let output_bytes = empty_agent_output_bytes();

        let journal_bytes =
            build_predicted_journal(&input, &input_bytes, &output_bytes).unwrap();

        assert_eq!(
            journal_bytes.len(),
            209,
            "Predicted journal must be exactly 209 bytes"
        );
    }

    #[test]
    fn test_predicted_journal_determinism() {
        let input = test_input();
        let input_bytes = input.encode().unwrap();
        let output_bytes = empty_agent_output_bytes();

        let journal1 =
            build_predicted_journal(&input, &input_bytes, &output_bytes).unwrap();
        let journal2 =
            build_predicted_journal(&input, &input_bytes, &output_bytes).unwrap();

        assert_eq!(
            journal1, journal2,
            "Same inputs must produce identical journal bytes"
        );
    }

    #[test]
    fn test_predicted_journal_commitments_are_sha256() {
        let input = test_input();
        let input_bytes = input.encode().unwrap();
        let output_bytes = empty_agent_output_bytes();

        let journal_bytes =
            build_predicted_journal(&input, &input_bytes, &output_bytes).unwrap();

        // Decode the journal to inspect individual fields
        let journal = KernelJournalV1::decode(&journal_bytes).unwrap();

        // Verify input_commitment = SHA256(input_bytes)
        let expected_input_commitment = sha256(&input_bytes);
        assert_eq!(
            journal.input_commitment, expected_input_commitment,
            "input_commitment must be SHA256(input_bytes)"
        );

        // Verify action_commitment = SHA256(agent_output_bytes)
        let expected_action_commitment = sha256(&output_bytes);
        assert_eq!(
            journal.action_commitment, expected_action_commitment,
            "action_commitment must be SHA256(agent_output_bytes)"
        );
    }

    #[test]
    fn test_predicted_journal_roundtrip() {
        let input = test_input();
        let input_bytes = input.encode().unwrap();
        let output_bytes = empty_agent_output_bytes();

        let journal_bytes =
            build_predicted_journal(&input, &input_bytes, &output_bytes).unwrap();

        // Decode and verify all fields
        let journal = KernelJournalV1::decode(&journal_bytes).unwrap();

        assert_eq!(journal.protocol_version, PROTOCOL_VERSION);
        assert_eq!(journal.kernel_version, KERNEL_VERSION);
        assert_eq!(journal.agent_id, input.agent_id);
        assert_eq!(journal.agent_code_hash, input.agent_code_hash);
        assert_eq!(journal.constraint_set_hash, input.constraint_set_hash);
        assert_eq!(journal.input_root, input.input_root);
        assert_eq!(journal.execution_nonce, input.execution_nonce);
        assert_eq!(journal.execution_status, ExecutionStatus::Success);

        // Re-encode and verify byte-level equality
        let re_encoded = journal.encode().unwrap();
        assert_eq!(
            journal_bytes, re_encoded,
            "Decode + re-encode must produce identical bytes"
        );
    }

    #[test]
    fn test_predicted_journal_struct_matches_bytes() {
        let input = test_input();
        let input_bytes = input.encode().unwrap();
        let output_bytes = empty_agent_output_bytes();

        let journal_struct =
            build_predicted_journal_struct(&input, &input_bytes, &output_bytes);
        let journal_bytes =
            build_predicted_journal(&input, &input_bytes, &output_bytes).unwrap();

        let struct_encoded = journal_struct.encode().unwrap();
        assert_eq!(
            struct_encoded, journal_bytes,
            "Struct encoding must match direct byte construction"
        );
    }

    #[test]
    fn test_different_inputs_produce_different_journals() {
        let input1 = test_input();
        let input_bytes1 = input1.encode().unwrap();
        let output_bytes = empty_agent_output_bytes();

        let mut input2 = test_input();
        input2.execution_nonce = 99999;
        let input_bytes2 = input2.encode().unwrap();

        let journal1 =
            build_predicted_journal(&input1, &input_bytes1, &output_bytes).unwrap();
        let journal2 =
            build_predicted_journal(&input2, &input_bytes2, &output_bytes).unwrap();

        assert_ne!(
            journal1, journal2,
            "Different inputs must produce different journals"
        );
    }

    #[test]
    fn test_different_outputs_produce_different_journals() {
        let input = test_input();
        let input_bytes = input.encode().unwrap();

        let output1 = empty_agent_output_bytes();

        // Build a non-empty output
        use kernel_core::{ActionV1, AgentOutput};
        let output2 = AgentOutput {
            actions: vec![ActionV1 {
                action_type: 0x00000004, // NO_OP
                target: [0u8; 32],
                payload: vec![],
            }],
        }
        .encode()
        .unwrap();

        let journal1 =
            build_predicted_journal(&input, &input_bytes, &output1).unwrap();
        let journal2 =
            build_predicted_journal(&input, &input_bytes, &output2).unwrap();

        assert_ne!(
            journal1, journal2,
            "Different agent outputs must produce different journals"
        );
    }
}
