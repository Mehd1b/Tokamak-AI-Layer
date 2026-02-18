---
title: Writing an Agent
sidebar_position: 2
---

# Writing an Agent

This guide walks through the process of creating an agent from scratch, covering the agent logic, build infrastructure, binding crate, and zkVM guest.

## Quick Start with Scaffold

The fastest way to create a new agent is using the `agent-pack scaffold` command:

```bash
# Install agent-pack (if not already installed)
cargo install --git https://github.com/tokamak-network/Tokamak-AI-Layer agent-pack

# Create a new agent project
agent-pack scaffold my-agent

# Or use the yield template for a more complete example
agent-pack scaffold my-yield-agent --template yield
```

This generates a complete project structure with:
- Agent crate with `agent_main()` template
- Binding crate implementing `AgentEntrypoint`
- Test harness with unit tests
- Pre-populated `agent-pack.json` manifest
- Build script for `AGENT_CODE_HASH` computation

After scaffolding:

```bash
cd my-agent
cargo build    # Build and compute AGENT_CODE_HASH
cargo test     # Run unit tests
```

See [Agent Pack Format](/agent-pack/format#agent-pack-scaffold) for full scaffold options.

---

The rest of this guide explains what the scaffold creates and how to customize it.

## Setting Up Your Agent Crate

Create a new Rust library crate:

```bash
cargo new --lib my-agent
cd my-agent
```

Add dependencies to `Cargo.toml`:

```toml
[package]
name = "my-agent"
version = "0.1.0"
edition = "2021"

[dependencies]
kernel-sdk = { path = "../sdk/kernel-sdk" }
kernel-core = { path = "../protocol/kernel-core" }

[build-dependencies]
sha2 = "0.10"
hex = "0.4"
```

## Implementing agent_main

The core of your agent is a single function:

```rust
use kernel_sdk::prelude::*;

pub fn agent_main(ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput {
    // Your logic here
}
```

### A Minimal Agent

```rust
use kernel_sdk::prelude::*;

pub fn agent_main(_ctx: &AgentContext, _opaque_inputs: &[u8]) -> AgentOutput {
    AgentOutput { actions: Vec::new() }
}
```

This agent does nothing—it returns an empty output.

### A Real Agent Example

```rust
use kernel_sdk::prelude::*;

pub fn agent_main(ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput {
    // Validate kernel version
    if !ctx.is_kernel_v1() {
        return AgentOutput { actions: Vec::new() };
    }

    // Parse agent-specific inputs (after 36-byte snapshot prefix if present)
    let inputs = ctx.agent_inputs();
    if inputs.len() < 41 {
        return AgentOutput { actions: Vec::new() };
    }

    // Decode trading parameters
    let mut offset = 0;
    let asset_id = match read_bytes32_at(inputs, &mut offset) {
        Some(id) => id,
        None => return AgentOutput { actions: Vec::new() },
    };
    let notional = match read_u64_le_at(inputs, &mut offset) {
        Some(n) => n,
        None => return AgentOutput { actions: Vec::new() },
    };
    let direction = match read_u8_at(inputs, &mut offset) {
        Some(d) if d <= 1 => d,
        _ => return AgentOutput { actions: Vec::new() },
    };

    // Create action with bounded allocation
    let action = open_position_action(
        *ctx.agent_id,
        asset_id,
        notional,
        10_000,  // 1x leverage
        direction,
    );

    let mut actions = Vec::with_capacity(1);
    actions.push(action);
    AgentOutput { actions }
}
```

## Parsing Inputs

The `opaque_inputs` slice is your responsibility. Common patterns:

### Fixed Layout

```rust
if opaque_inputs.len() != 48 {
    return AgentOutput { actions: Vec::new() };
}

let vault_address: [u8; 20] = opaque_inputs[0..20].try_into().unwrap();
let target_address: [u8; 20] = opaque_inputs[20..40].try_into().unwrap();
let amount = u64::from_le_bytes(opaque_inputs[40..48].try_into().unwrap());
```

### With Cursor-Style Reading

```rust
let mut offset = 0;

let vault = read_bytes32_at(opaque_inputs, &mut offset)?;
let amount = read_u64_le_at(opaque_inputs, &mut offset)?;
let direction = read_u8_at(opaque_inputs, &mut offset)?;

// Validate direction
if direction > 1 {
    return None;
}
```

### Defensive Parsing

Always return empty output instead of panicking:

```rust
// Good: defensive
if opaque_inputs.len() < 48 {
    return AgentOutput { actions: Vec::new() };
}

// Bad: panics on invalid input
let amount = u64::from_le_bytes(opaque_inputs[40..48].try_into().unwrap());
```

## The Code Hash Build Script

Create `build.rs` to compute the agent code hash:

```rust
use sha2::{Digest, Sha256};
use std::{env, fs, path::Path};

fn main() {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let src_dir = Path::new(&manifest_dir).join("src");

    // Collect all .rs files in src/
    let mut source_files: Vec<_> = fs::read_dir(&src_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "rs"))
        .map(|e| e.path())
        .collect();
    source_files.sort();  // Deterministic ordering

    // Hash the contents
    let mut hasher = Sha256::new();
    for path in &source_files {
        let contents = fs::read_to_string(path).unwrap();
        hasher.update(path.file_name().unwrap().to_string_lossy().as_bytes());
        hasher.update(contents.as_bytes());
    }
    let hash = hasher.finalize();

    // Generate the constant
    let hash_hex = hex::encode(&hash);
    let hash_bytes: Vec<String> = hash.iter().map(|b| format!("0x{:02x}", b)).collect();

    let out_dir = env::var("OUT_DIR").unwrap();
    let dest = Path::new(&out_dir).join("agent_code_hash.rs");

    fs::write(
        &dest,
        format!(
            "pub const AGENT_CODE_HASH: [u8; 32] = [{}];\n",
            hash_bytes.join(", ")
        ),
    )
    .unwrap();

    println!("cargo:warning=AGENT_CODE_HASH: {}", hash_hex);
    println!("cargo:rerun-if-changed=src/");
}
```

Include the generated constant in `lib.rs`:

```rust
include!(concat!(env!("OUT_DIR"), "/agent_code_hash.rs"));
```

## Creating the Binding Crate

The binding crate connects your agent to the kernel. Each agent has its own `binding/` directory alongside the `agent/` crate.

Create `my-agent/binding/Cargo.toml`:

```toml
[package]
name = "my-agent-binding"
version = "0.1.0"
edition = "2021"

[dependencies]
kernel-guest = { path = "../../runtime/kernel-guest" }
kernel-core = { path = "../../protocol/kernel-core" }
kernel-sdk = { path = "../../sdk/kernel-sdk" }
my-agent = { path = "../agent" }
```

Create `my-agent/binding/src/lib.rs`:

```rust
use kernel_guest::AgentEntrypoint;
use kernel_sdk::agent::AgentContext;
use kernel_core::AgentOutput;

pub use my_agent::AGENT_CODE_HASH;

pub struct MyAgentWrapper;

impl AgentEntrypoint for MyAgentWrapper {
    fn code_hash(&self) -> [u8; 32] {
        my_agent::AGENT_CODE_HASH
    }

    fn run(&self, ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput {
        my_agent::agent_main(ctx, opaque_inputs)
    }
}

pub fn kernel_main(input_bytes: &[u8]) -> Result<Vec<u8>, kernel_guest::KernelError> {
    kernel_guest::kernel_main_with_agent(input_bytes, &MyAgentWrapper)
}
```

## The zkVM Guest Entry Point

Create the zkVM guest in `my-agent/risc0-methods/zkvm-guest/src/main.rs`:

```rust
#![no_main]

risc0_zkvm::guest::entry!(main);

fn main() {
    use risc0_zkvm::guest::env;

    let input_bytes: Vec<u8> = env::read();

    match my_agent_binding::kernel_main(&input_bytes) {
        Ok(journal_bytes) => {
            env::commit_slice(&journal_bytes);
        }
        Err(error) => {
            panic!("Kernel execution failed: {:?}", error);
        }
    }
}
```

## Build Artifacts

After building, you have three critical artifacts:

| Artifact | Description |
|----------|-------------|
| **AGENT_CODE_HASH** | SHA-256 of agent source, identifies agent logic |
| **ZKVM_GUEST_ELF** | Compiled zkVM guest binary, used by prover |
| **ZKVM_GUEST_ID** | imageId, hash of ELF, registered on-chain |

## Deployment Checklist

1. Verify agent_code_hash is stable across builds
2. Build zkVM guest with Docker for reproducible imageId
3. Note the imageId from build output
4. Register imageId with KernelExecutionVerifier contract
5. Configure vault to trust your agent's identifier
6. Run on-chain E2E test to verify full flow

```bash
# Register agent on-chain
cast send $VERIFIER_ADDRESS "registerAgent(bytes32,bytes32)" \
    $AGENT_ID $IMAGE_ID \
    --private-key $PRIVATE_KEY --rpc-url $RPC_URL
```

## Best Practices

### Memory Management

```rust
// Good: bounded allocation
let mut actions = Vec::with_capacity(1);
actions.push(action);

// Avoid: unbounded allocation
let actions = vec![action];  // vec! macro not in prelude
```

### Error Handling

```rust
// Good: return empty output
if condition_failed {
    return AgentOutput { actions: Vec::new() };
}

// Avoid: panicking
assert!(condition, "this will abort proof generation");
```

### Determinism

```rust
// Good: deterministic iteration
let mut items: Vec<_> = map.iter().collect();
items.sort_by_key(|(k, _)| *k);

// Avoid: HashMap iteration (non-deterministic)
for (k, v) in hash_map.iter() { /* order varies! */ }
```

## Next Steps

- [Constraints](/sdk/constraints-and-commitments) - Understand constraint enforcement
- [Testing](/sdk/testing) - Test at multiple levels
- [Agent Pack](/agent-pack/format) - Package for distribution
