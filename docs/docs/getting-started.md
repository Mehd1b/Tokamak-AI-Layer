---
sidebar_position: 1
title: Getting Started
description: Build and deploy your first verifiable agent in 15 minutes
---

# Zero to Proof in 15 Minutes

This guide takes you from zero to a working agent producing ZK proofs on the Tokamak Execution Kernel. By the end, you will have scaffolded an agent, run it through the kernel, and generated a cryptographic proof of correct execution.

## Prerequisites (2 min)

Install the required toolchains. If you already have Rust and Foundry, skip to [Create Your First Agent](#create-your-first-agent-1-min).

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Install RISC Zero toolchain (for ZK proof generation)
curl -L https://risczero.com/install | bash && rzup install

# Install Foundry (for smart contract interaction)
curl -L https://foundry.paradigm.xyz | bash && foundryup
```

Clone the repository and install the agent CLI:

```bash
git clone https://github.com/tokamak-network/Tokamak-AI-Layer.git
cd Tokamak-AI-Layer

# Install the cargo-agent CLI
cargo install --path crates/tools/cargo-agent
```

Validate everything is working:

```bash
rustc --version          # Rust 1.75.0+
cargo risczero --version # RISC Zero toolchain
forge --version          # Foundry
```

:::tip Hardware
Development and testing works on any modern machine (8GB+ RAM). Proof generation is CPU-intensive and benefits from 8+ cores and 32GB+ RAM. You can develop and test without generating proofs -- only the final build step requires the RISC Zero toolchain.
:::

## Create Your First Agent (1 min)

```bash
# Scaffold a yield farming agent from the built-in template
cargo agent new my-first-agent --template yield
```

This creates a complete project structure:

```
crates/agents/my-first-agent/
├── agent/                   # Core agent logic
│   ├── Cargo.toml           # Dependencies: kernel-sdk, kernel-core
│   ├── build.rs             # Computes AGENT_CODE_HASH at build time
│   └── src/lib.rs           # agent_main() — your decision logic
├── tests/                   # Test harness
│   ├── Cargo.toml
│   └── src/lib.rs           # Unit and integration tests
└── dist/
    └── agent-pack.json      # Agent manifest for deployment
```

Other available templates:

```bash
cargo agent new my-trader --template perp-trader   # Perpetual futures trading
cargo agent new my-agent  --template minimal       # Bare-bones starting point
```

## Understand the Code (5 min)

Open `crates/agents/my-first-agent/agent/src/lib.rs`. Here is the annotated yield agent:

```rust
#![no_std]                    // Agents run inside a zkVM — no OS, no stdlib
#![deny(unsafe_code)]         // Safety: no unsafe allowed

extern crate alloc;
use alloc::{vec, vec::Vec};
use kernel_sdk::prelude::*;       // AgentContext, AgentOutput, AgentEntrypoint, etc.
use kernel_sdk::actions::CallBuilder;  // Fluent builder for on-chain actions

// ── Input declaration ────────────────────────────────────────────────
// The agent_input! macro generates a struct with automatic
// fixed-size decoding. Each field is read sequentially from
// the raw byte slice provided by the kernel.

kernel_sdk::agent_input! {
    struct YieldInput {
        vault_address: [u8; 20],       // 20 bytes — the vault holding funds
        mock_yield_address: [u8; 20],  // 20 bytes — yield source contract
        transfer_amount: u64,          // 8 bytes  — amount in wei (LE)
    }
}
// Total: 48 bytes. Inputs larger or smaller are rejected.

// ── Agent entry point ────────────────────────────────────────────────
// This is the function the kernel calls. It receives:
//   - ctx: execution context (agent_id, nonce, code hash, etc.)
//   - opaque_inputs: raw bytes from the host (market data, parameters)
// It must return AgentOutput containing zero or more actions.

pub extern "Rust" fn agent_main(
    _ctx: &AgentContext,
    opaque_inputs: &[u8],
) -> AgentOutput {
    // Parse input — returns None if size doesn't match
    let input = match YieldInput::decode(opaque_inputs) {
        Some(i) => i,
        None => return AgentOutput { actions: Vec::new() },
    };

    // Action 1: Deposit ETH to the yield source
    let deposit = CallBuilder::new(input.mock_yield_address)
        .value(input.transfer_amount as u128) // ETH value to send
        .build();                             // Empty calldata = plain transfer

    // Action 2: Withdraw yield back to vault
    let withdraw = CallBuilder::new(input.mock_yield_address)
        .selector(0x51cff8d9)                 // withdraw(address)
        .param_address(&input.vault_address)  // Pass vault as recipient
        .build();

    AgentOutput {
        actions: vec![deposit, withdraw],
    }
}

// ── Kernel binding ───────────────────────────────────────────────────
// Compile-time check: agent_main must match the AgentEntrypoint signature
const _: AgentEntrypoint = agent_main;

// Generates the kernel wrappers that the zkVM guest calls
kernel_sdk::agent_entrypoint!(agent_main);
```

### How It All Fits Together

```mermaid
flowchart LR
    A["Host<br/><i>fetch market data</i>"] --> B["KernelInputV1<br/><i>serialize inputs</i>"]
    B --> C["zkVM Guest<br/><i>deterministic execution</i>"]
    C --> D["agent_main()<br/><i>your logic runs here</i>"]
    D --> E["Actions<br/><i>deposits, trades, transfers</i>"]
    E --> F["Constraints<br/><i>safety checks (unskippable)</i>"]
    F --> G["KernelJournalV1 + Proof<br/><i>209 bytes + ZK proof</i>"]
    G --> H["On-chain Vault<br/><i>verify proof, execute actions</i>"]
```

**Key concepts:**

| Concept | What it does |
|---------|-------------|
| `agent_input!` | Generates zero-copy struct decoding from raw bytes. No serde, no allocations. |
| `CallBuilder` | Fluent API for building ABI-encoded `CALL` actions. Handles value, selector, and parameter encoding. |
| `agent_entrypoint!` | Macro that generates `kernel_main` — the actual zkVM entry point that wraps your `agent_main` with input decoding, code hash verification, and constraint enforcement. |
| `AgentContext` | Read-only context: protocol version, agent ID, code hash, execution nonce, input root hash. |
| `AgentOutput` | Your return value: a list of `Action` structs the vault will execute on-chain. |
| `AGENT_CODE_HASH` | SHA-256 of `src/lib.rs || 0x00 || Cargo.toml`. Computed by `build.rs`, verified inside the zkVM to bind proofs to your exact code. |

## Test Locally (1 min)

Run your agent's unit tests without any zkVM or proof generation:

```bash
# Run agent unit tests
cargo agent test my-first-agent
```

This tests input parsing, action construction, and code hash consistency.

For integration tests through the full kernel pipeline (still no proof generation):

```bash
# Run kernel integration tests
cargo test -p kernel-host-tests -- --nocapture
```

To verify your agent is fully deterministic (same input always produces same output):

```bash
# Run the determinism test
cargo test test_determinism -- --nocapture
```

:::note Why determinism matters
The zkVM generates proofs of execution. If your agent is non-deterministic (e.g., uses randomness or system time), the proof would be for a different execution than what actually ran. The kernel SDK enforces this: `#![no_std]`, no I/O, no randomness, no unsafe code.
:::

## Build the Proof (8 min)

This is the step that compiles your agent into a zkVM guest binary and generates the `IMAGE_ID` — a unique fingerprint of your compiled agent that gets registered on-chain.

```bash
# Install the RISC Zero toolchain if you haven't already
cargo risczero install

# Build the zkVM guest ELF binary
cargo agent build my-first-agent
```

Under the hood, this compiles your agent + the kernel runtime into a RISC-V ELF binary targeting the RISC Zero zkVM. The build produces:

| Artifact | Location | Purpose |
|----------|----------|---------|
| `zkvm-guest.bin` | `target/riscv-guest/.../release/zkvm-guest.bin` | The processed binary for proof generation |
| `IMAGE_ID` | Embedded as a Rust constant in `risc0-methods` | Unique hash of the guest binary, used for on-chain verification |
| `AGENT_CODE_HASH` | Printed during build | SHA-256 binding your source code to the proof |

For reproducible builds (required for production — ensures identical `IMAGE_ID` across machines):

```bash
RISC0_USE_DOCKER=1 cargo agent build my-first-agent
```

To run a full end-to-end proof generation test:

```bash
cargo test -p e2e-tests --features risc0-e2e -- --nocapture
```

:::warning
Proof generation is CPU-intensive. Expect 8-10 minutes on a modern machine. For development iteration, use `cargo agent test` (instant) and only generate proofs when you are ready to deploy.
:::

## Deploy to Testnet (3 min)

With your agent built and tested, deploy it to Ethereum Sepolia.

### Step 1: Set environment variables

```bash
export RPC_URL="https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY"
export PRIVATE_KEY="0x..."
```

### Step 2: Register your agent

Every agent is identified on-chain by its `agentId = keccak256(author, salt)`. Registration is permissionless — anyone can register.

```bash
# Get your IMAGE_ID from the build output
export IMAGE_ID="0x..."

# Register the agent in the AgentRegistry
cast send 0xED27f8fbB7D576f02D516d01593eEfBaAfe4b168 \
    "registerAgent(bytes32,bytes32,string)" \
    $IMAGE_ID \
    $(cast keccak "my-first-agent-salt") \
    "ipfs://QmYourManifestCID" \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL
```

### Step 3: Deploy a vault

Vaults hold capital and execute agent-produced actions after proof verification. The `trustedImageId` is pinned at deployment — only proofs from your specific agent binary are accepted.

```bash
# Deploy via the VaultFactory (Sepolia)
cast send 0x580e55fDE87fFC1cF1B6a446d6DBf8068EB07b8C \
    "deployVault(bytes32,bytes32)" \
    $IMAGE_ID \
    $(cast keccak "my-vault-salt") \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL
```

### Step 4: Execute with proof

```bash
# Generate a proof for a specific execution
cargo run -p e2e-tests --release --features risc0-e2e -- \
    --rpc-url $RPC_URL \
    --private-key $PRIVATE_KEY \
    --vault $VAULT_ADDRESS
```

### Testnet Contract Addresses

| Contract | Sepolia Address |
|----------|----------------|
| AgentRegistry | [`0xED27f8fbB7D576f02D516d01593eEfBaAfe4b168`](https://sepolia.etherscan.io/address/0xED27f8fbB7D576f02D516d01593eEfBaAfe4b168) |
| VaultFactory | [`0x580e55fDE87fFC1cF1B6a446d6DBf8068EB07b8C`](https://sepolia.etherscan.io/address/0x580e55fDE87fFC1cF1B6a446d6DBf8068EB07b8C) |
| KernelExecutionVerifier | [`0x1eB41537037fB771CBA8Cd088C7c806936325eB5`](https://sepolia.etherscan.io/address/0x1eB41537037fB771CBA8Cd088C7c806936325eB5) |
| RISC Zero Verifier Router | [`0x925d8331ddc0a1F0d96E68CF073DFE1d92b69187`](https://sepolia.etherscan.io/address/0x925d8331ddc0a1F0d96E68CF073DFE1d92b69187) |

## What's Next?

Now that you have a working agent, explore these topics:

| Topic | Description |
|-------|-------------|
| [Writing an Agent](/sdk/writing-an-agent) | Full guide to agent logic, input parsing, and action construction |
| [`agent_input!` Macro](/sdk/agent-input-macro) | Declarative input parsing with compile-time size checks |
| [CallBuilder & ERC20 Helpers](/sdk/call-builder) | Fluent action builder, ERC20 approve/transfer shortcuts |
| [Constraints](/sdk/constraints-and-commitments) | Position limits, leverage bounds, cooldown periods |
| [Testing](/sdk/testing) | TestHarness, ContextBuilder, and snapshot testing |
| [Agent Pack](/agent-pack/format) | Bundle and publish your agent for deployment |
| [Architecture Overview](/architecture/overview) | Full system design and security model |
| [On-Chain Verification](/onchain/verifier-overview) | How proofs are verified and actions executed on-chain |
| [Hyperliquid Integration](/onchain/hyperliquid-integration) | Perpetual futures trading via CoreWriter precompile |
| [Optimistic Execution](/onchain/security-considerations) | Execute immediately with deferred proofs (WSTON-bonded) |

## Troubleshooting -- Top 8 Footguns

These are the most common issues developers hit when building on the Execution Kernel. Each one can cost hours of debugging if you are not aware of it.

### 1. Use `.bin`, NOT the raw ELF

When bundling or deploying your agent, you must use the **processed binary** (`zkvm-guest.bin`), not the raw ELF file (`zkvm-guest`).

```bash
# Correct — use the .bin file
cp target/riscv-guest/.../release/zkvm-guest.bin bundle/guest.elf

# Wrong — raw ELF causes "Malformed ProgramBinary" at proof time
cp target/riscv-guest/.../release/zkvm-guest bundle/guest.elf
```

The raw ELF is ~893KB while the processed `.bin` is ~926KB. If you see `Malformed ProgramBinary` during proof generation, this is almost certainly the cause.

### 2. Force ELF rebuild with `rm -rf`, not `cargo clean -p`

After modifying agent source code, `cargo clean -p` does **not** clean the RISC-V guest target. You must manually delete the build directory:

```bash
# This does NOT work
cargo clean -p my-first-agent-risc0-methods

# This works
rm -rf target/riscv-guest/my-first-agent-risc0-methods
cargo build -p my-first-agent-risc0-methods --release
```

If your code changes are not reflected in the proof, stale ELF artifacts are the reason.

### 3. Vault `trustedImageId` is immutable

The `IMAGE_ID` is pinned at vault creation and cannot be updated. If you rebuild your agent (changing the `IMAGE_ID`), you must deploy a **new vault**. The old vault will only accept proofs from the old agent binary.

This is a security feature: depositors can audit exactly which code their vault runs.

### 4. HyperEVM has a 3M block gas limit

On HyperEVM (chain 999), the block gas limit is 3,000,000. Standard `forge script` adds a ~1.3x gas safety margin that pushes transactions over the limit.

```bash
# Wrong — forge script exceeds block gas limit
forge script Deploy.s.sol --broadcast

# Correct — use forge create with explicit gas limit
forge create --private-key $PK --legacy --gas-limit 3000000 --broadcast \
    src/MyContract.sol:MyContract --constructor-args arg1 arg2
```

Also note: HyperEVM does **not** support EIP-1559. Always use `--legacy` for deployments.

### 5. CoreWriter actions are async intents, not immediate state changes

On Hyperliquid, CoreWriter precompile calls are **queued** and processed after a delay (a few seconds) for anti-frontrunning. They never revert on failure -- they are silently rejected.

```
Deposit + limit order in same tx → order rejected (deposit hasn't settled)
```

**Workaround:** Pre-deposit margin in a separate transaction, wait ~5 seconds, then place orders.

### 6. HYPE gas required on HyperCore

All CoreWriter actions (orders, transfers) require HYPE on HyperCore for gas. Without it, every action is silently rejected -- no revert, no error, no logs.

```bash
# Bridge HYPE to HyperCore by sending to the bridge address
cast send 0x2222222222222222222222222222222222222222 \
    --value 0.01ether \
    --private-key $PK --rpc-url $HYPER_RPC --legacy
```

Fund with 0.01+ HYPE and wait 10 seconds after bridging before executing any CoreWriter actions.

### 7. Limit prices must be within the oracle price band

HyperCore rejects limit orders with prices outside the oracle price band (~5-10% from mark). Using `MAX_UINT64` as a "market order" price does **not** work -- the order is silently dropped.

```
Mark price: $100,000
Valid buy:  $105,000 (within 5% band)
Invalid:    $999,999 (outside band, silently rejected)
```

Use the agent-computed limit price based on current mark price (e.g., `mark * 1.05` for buys).

### 8. Set leverage before the first trade via REST API

HyperCore requires `leverage > 0` before processing limit orders. When no position exists, leverage defaults to 0 in the precompile. CoreWriter has **no** `updateLeverage` action.

**Workaround:** Open the first position via the Hyperliquid REST API (using an API wallet), which sets leverage. After that, CoreWriter orders work normally.

---

:::tip Still stuck?
Check the [FAQ](/getting-started/faq) or open an issue on [GitHub](https://github.com/tokamak-network/Tokamak-AI-Layer/issues).
:::
