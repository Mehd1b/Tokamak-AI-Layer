use async_trait::async_trait;
use thiserror::Error;

use crate::queue::ProofResult;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, Error)]
#[allow(dead_code)]
pub enum ProverError {
    #[error("Proof generation failed: {0}")]
    ProofGenerationFailed(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Prover backend unavailable: {0}")]
    Unavailable(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

/// Abstraction over proof generation backends.
///
/// Implementations must be `Send + Sync` so they can be shared across
/// Tokio tasks in the background worker.
#[async_trait]
pub trait Prover: Send + Sync {
    /// Generate a proof for the given guest image and encoded input.
    ///
    /// # Arguments
    ///
    /// * `image_id` - 32-byte RISC Zero image ID of the agent guest ELF.
    /// * `input`    - Encoded `KernelInputV1` bytes to feed the guest.
    ///
    /// # Returns
    ///
    /// A [`ProofResult`] containing the seal and journal on success.
    async fn prove(
        &self,
        image_id: [u8; 32],
        input: Vec<u8>,
    ) -> Result<ProofResult, ProverError>;
}

// ---------------------------------------------------------------------------
// MockProver (for testing / development)
// ---------------------------------------------------------------------------

/// A mock prover that returns deterministic fake proofs after a short delay.
///
/// The mock seal is `SHA-256(image_id || input)` and the journal is a
/// 209-byte buffer filled with a recognisable pattern so callers can
/// distinguish it from a real proof.
pub struct MockProver;

#[async_trait]
impl Prover for MockProver {
    async fn prove(
        &self,
        image_id: [u8; 32],
        input: Vec<u8>,
    ) -> Result<ProofResult, ProverError> {
        use sha2::{Digest, Sha256};

        // Simulate proving time.
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;

        // Deterministic fake seal: SHA-256(image_id || input).
        let mut hasher = Sha256::new();
        hasher.update(image_id);
        hasher.update(&input);
        let seal = hasher.finalize().to_vec();

        // Deterministic fake journal: 209 bytes (KernelJournalV1 fixed size).
        // Fill with a recognisable pattern so tests can verify structure.
        let mut journal = vec![0u8; 209];
        // protocol_version = 1 (big-endian u32 at offset 0)
        journal[3] = 0x01;
        // kernel_version = 1 (big-endian u32 at offset 4)
        journal[7] = 0x01;
        // Copy agent_image_id into agent_id field (offset 8..40).
        journal[8..40].copy_from_slice(&image_id);
        // execution_status = Success (0x01) at offset 208.
        journal[208] = 0x01;

        Ok(ProofResult { seal, journal })
    }
}

// ---------------------------------------------------------------------------
// RiscZeroProver (placeholder)
// ---------------------------------------------------------------------------

/// Real RISC Zero prover. Requires `risc0-zkvm` with the `prove` feature.
///
/// This is a placeholder. To enable it:
/// 1. Add `risc0-zkvm = { version = "3.0", features = ["prove"] }` to deps.
/// 2. Implement the body below using `risc0_zkvm::default_prover()`.
#[allow(dead_code)]
pub struct RiscZeroProver;

#[async_trait]
impl Prover for RiscZeroProver {
    async fn prove(
        &self,
        _image_id: [u8; 32],
        _input: Vec<u8>,
    ) -> Result<ProofResult, ProverError> {
        // TODO: implement with real risc0-zkvm prover.
        //
        // Rough sketch:
        //   let env = ExecutorEnv::builder()
        //       .write(&input)
        //       .build()?;
        //   let prover = risc0_zkvm::default_prover();
        //   let receipt = prover.prove_with_opts(env, elf_bytes, &opts)?;
        //   Ok(ProofResult {
        //       seal: extract_seal(&receipt),
        //       journal: receipt.journal.bytes,
        //   })
        todo!("RiscZeroProver requires risc0-zkvm dependency — see prover-service README")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_prover_deterministic() {
        let prover = MockProver;
        let image_id = [0xAA; 32];
        let input = vec![1, 2, 3];

        let r1 = prover.prove(image_id, input.clone()).await.unwrap();
        let r2 = prover.prove(image_id, input).await.unwrap();

        assert_eq!(r1.seal, r2.seal, "Mock prover must be deterministic");
        assert_eq!(r1.journal, r2.journal);
    }

    #[tokio::test]
    async fn test_mock_prover_journal_size() {
        let prover = MockProver;
        let result = prover.prove([0; 32], vec![]).await.unwrap();
        assert_eq!(
            result.journal.len(),
            209,
            "Journal must be KernelJournalV1 fixed size"
        );
    }

    #[tokio::test]
    async fn test_mock_prover_different_inputs_different_seals() {
        let prover = MockProver;
        let r1 = prover.prove([0; 32], vec![1]).await.unwrap();
        let r2 = prover.prove([0; 32], vec![2]).await.unwrap();
        assert_ne!(r1.seal, r2.seal);
    }
}
