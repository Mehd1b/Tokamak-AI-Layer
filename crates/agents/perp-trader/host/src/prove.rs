//! Thin wrapper over reference-integrator's proving functionality.

use crate::error::{Error, Result};
use reference_integrator::{LoadedBundle, ProveResult, ProvingMode};

/// Generate a ZK proof of kernel execution.
pub fn generate_proof(
    bundle: &LoadedBundle,
    input_bytes: &[u8],
    dev_mode: bool,
) -> Result<ProveResult> {
    let elf = bundle
        .read_elf()
        .map_err(|e| Error::Bundle(format!("Failed to read ELF: {}", e)))?;

    let mode = if dev_mode {
        ProvingMode::Dev
    } else {
        ProvingMode::Groth16
    };

    reference_integrator::prove::prove(&elf, input_bytes, mode)
        .map_err(|e| Error::Proving(format!("Proof generation failed: {}", e)))
}
