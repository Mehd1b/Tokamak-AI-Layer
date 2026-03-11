//! Generate a Groth16 proof, verify locally, save seal for manual on-chain testing.
//!
//! Usage: cargo run --example verify_groth16 --features prove

use kernel_core::{sha256, CanonicalDecode, CanonicalEncode, KernelJournalV1};

fn main() {
    let nonce = 5u64;
    let input_path = format!("/tmp/perp-optimistic-nonce-{}.input.bin", nonce);
    let input_bytes = match std::fs::read(&input_path) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("Failed to read {}: {}", input_path, e);
            std::process::exit(1);
        }
    };

    eprintln!("=== Groth16 Proof Test for nonce {} ({} bytes input) ===", nonce, input_bytes.len());

    // Load ELF from bundle
    let bundle = reference_integrator::LoadedBundle::load(
        "crates/agents/perp-trader/bundle",
    )
    .expect("Failed to load bundle");
    let elf = bundle.read_elf().expect("Failed to read ELF");
    eprintln!("ELF size: {} bytes", elf.len());

    // Generate Groth16 proof
    eprintln!("Generating Groth16 proof (this takes ~7-10 minutes)...");
    let start = std::time::Instant::now();
    let result = reference_integrator::prove::prove(
        &elf,
        &input_bytes,
        reference_integrator::prove::ProvingMode::Groth16,
    )
    .expect("Groth16 proof generation failed");
    eprintln!("Proof generated in {:.1}s", start.elapsed().as_secs_f64());

    // Print seal info
    eprintln!("Journal: {} bytes", result.journal_bytes.len());
    eprintln!("Seal: {} bytes", result.seal_bytes.len());
    eprintln!("Seal selector: 0x{}", hex::encode(&result.seal_bytes[..4]));
    eprintln!("Seal hex: 0x{}", hex::encode(&result.seal_bytes));

    // Compute journal digest
    let journal_digest = sha256(&result.journal_bytes);
    eprintln!("Journal digest: 0x{}", hex::encode(&journal_digest));
    eprintln!("Journal hex: 0x{}", hex::encode(&result.journal_bytes));

    // Save seal and journal
    let seal_path = format!("/tmp/perp-optimistic-nonce-{}.seal.bin", nonce);
    let journal_path = format!("/tmp/perp-optimistic-nonce-{}.journal.bin", nonce);
    std::fs::write(&seal_path, &result.seal_bytes).expect("Failed to save seal");
    std::fs::write(&journal_path, &result.journal_bytes).expect("Failed to save journal");
    eprintln!("Saved seal to {} and journal to {}", seal_path, journal_path);

    // Print cast command for manual verification
    let image_id = "0x31a3ab90ab3391b178f9d9df8351965af3bf8ee642fb6ed38416c5c5503be6e3";
    let verifier = "0x9f8d4D1f7AAf06aab1640abd565A731399862Bc8";
    eprintln!("\n=== Manual verification command ===");
    eprintln!(
        "cast call {} \"verify(bytes,bytes32,bytes32)\" 0x{} {} 0x{} --rpc-url https://rpc.hyperliquid.xyz/evm",
        verifier,
        hex::encode(&result.seal_bytes),
        image_id,
        hex::encode(&journal_digest)
    );
}
