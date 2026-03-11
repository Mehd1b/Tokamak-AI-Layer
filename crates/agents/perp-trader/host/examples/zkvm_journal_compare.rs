//! Quick diagnostic: run the ELF in dev mode and compare journal with prediction.
//!
//! Usage: cargo run --example zkvm_journal_compare --features prove

use kernel_core::{sha256, CanonicalDecode, CanonicalEncode, KernelJournalV1};

fn main() {
    for nonce in [3u64, 4] {
        let input_path = format!("/tmp/perp-optimistic-nonce-{}.input.bin", nonce);
        let input_bytes = match std::fs::read(&input_path) {
            Ok(b) => b,
            Err(_) => {
                eprintln!("Skipping nonce {}: {} not found", nonce, input_path);
                continue;
            }
        };

        eprintln!("=== Nonce {} ({} bytes input) ===", nonce, input_bytes.len());

        // Load ELF from bundle
        let bundle = reference_integrator::LoadedBundle::load(
            "crates/agents/perp-trader/bundle",
        )
        .expect("Failed to load bundle");

        let elf = bundle.read_elf().expect("Failed to read ELF");
        eprintln!("  ELF size: {} bytes", elf.len());

        // Run dev-mode proof (fast, executes ELF in RISC-V emulator)
        eprintln!("  Running dev-mode proof...");
        let start = std::time::Instant::now();
        let result = reference_integrator::prove::prove(
            &elf,
            &input_bytes,
            reference_integrator::prove::ProvingMode::Dev,
        )
        .expect("Dev-mode proof failed");
        eprintln!("  Dev-mode completed in {:.1}s", start.elapsed().as_secs_f64());

        let zkvm_journal = &result.journal_bytes;
        let zkvm_hash = sha256(zkvm_journal);
        eprintln!(
            "  zkVM journal hash: 0x{}",
            hex::encode(&zkvm_hash)
        );

        // Build predicted journal (host path)
        let input = kernel_core::KernelInputV1::decode(&input_bytes)
            .expect("Failed to decode input");

        let ctx = kernel_sdk::agent::AgentContext {
            protocol_version: input.protocol_version,
            kernel_version: input.kernel_version,
            agent_id: input.agent_id,
            agent_code_hash: input.agent_code_hash,
            constraint_set_hash: input.constraint_set_hash,
            input_root: input.input_root,
            execution_nonce: input.execution_nonce,
        };
        let output = perp_trader::agent_main(&ctx, &input.opaque_agent_inputs);
        let output_bytes = output.encode().expect("encode output");
        let predicted_journal = reference_integrator::predict::build_predicted_journal(
            &input,
            &input_bytes,
            &output_bytes,
        )
        .expect("build predicted journal");
        let predicted_hash = sha256(&predicted_journal);
        eprintln!(
            "  Predicted hash:    0x{}",
            hex::encode(&predicted_hash)
        );

        if zkvm_hash == predicted_hash {
            eprintln!("  MATCH: zkVM and predicted journals are identical!");
        } else {
            eprintln!("  MISMATCH!");
            let zkvm_j = KernelJournalV1::decode(zkvm_journal).expect("decode zkvm journal");
            let pred_j = KernelJournalV1::decode(&predicted_journal).expect("decode predicted");
            eprintln!("    zkVM status: {:?}, predicted status: {:?}", zkvm_j.execution_status, pred_j.execution_status);
            eprintln!(
                "    zkVM action_commitment:      0x{}",
                hex::encode(&zkvm_j.action_commitment)
            );
            eprintln!(
                "    Predicted action_commitment: 0x{}",
                hex::encode(&pred_j.action_commitment)
            );
            eprintln!(
                "    zkVM input_commitment:       0x{}",
                hex::encode(&zkvm_j.input_commitment)
            );
            eprintln!(
                "    Predicted input_commitment:  0x{}",
                hex::encode(&pred_j.input_commitment)
            );

            // Find first differing byte
            for (i, (a, b)) in zkvm_journal.iter().zip(predicted_journal.iter()).enumerate() {
                if a != b {
                    eprintln!("    First diff at byte {}: zkvm=0x{:02x} predicted=0x{:02x}", i, a, b);
                    break;
                }
            }
        }
    }
}
