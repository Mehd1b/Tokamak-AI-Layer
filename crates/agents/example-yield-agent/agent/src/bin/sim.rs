fn main() {
    kernel_sdk::simulator::run_and_print(example_yield_agent::agent_main, std::env::args());
}
