#![no_main]
risc0_zkvm::guest::entry!(main);

fn main() {
    kernel_guest::run(polymarket_bot::agent_main);
}
