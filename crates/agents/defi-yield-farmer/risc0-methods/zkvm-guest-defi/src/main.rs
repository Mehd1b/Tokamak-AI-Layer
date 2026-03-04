//! RISC Zero zkVM Guest Entry Point for DeFi Yield Farmer
//!
//! Delegates to defi-yield-farmer agent crate for zkVM execution.

fn main() {
    use risc0_zkvm::guest::env;

    let input_bytes: Vec<u8> = env::read();

    match defi_yield_farmer::kernel_main(&input_bytes) {
        Ok(journal_bytes) => {
            env::commit_slice(&journal_bytes);
        }
        Err(error) => {
            panic!("Kernel execution failed: {:?}", error);
        }
    }
}
