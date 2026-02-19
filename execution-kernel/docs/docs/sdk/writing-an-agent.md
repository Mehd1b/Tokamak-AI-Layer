---
title: Writing an Agent
sidebar_position: 2
---

# Writing an Agent

This guide walks through creating an agent from scratch, covering agent logic, input parsing, action construction, and kernel binding.

## Quick Start with `cargo agent`

The fastest way to create a new agent:

```bash
# Install the CLI (once)
cargo install --path crates/tools/cargo-agent

# Create a new agent project
cargo agent new my-agent

# Or use the yield template for a more complete example
cargo agent new my-yield-agent --template yield
```

This generates a complete project:

```
crates/agents/my-agent/
├── agent/               # Agent logic + kernel binding
│   ├── Cargo.toml
│   ├── build.rs         # AGENT_CODE_HASH computation
│   └── src/lib.rs       # agent_main() + agent_entrypoint! macro
├── tests/               # Test harness
│   ├── Cargo.toml
│   └── src/lib.rs
└── dist/
    └── agent-pack.json  # Pre-populated manifest
```

After scaffolding:

```bash
cargo agent build my-agent    # Build and compute AGENT_CODE_HASH
cargo agent test my-agent     # Run unit tests
```

See [`cargo agent` CLI Reference](/sdk/cli-reference) for all scaffold options.

---

The rest of this guide explains what the scaffold creates and how to customize it.

<details>
<summary>Manual setup (without <code>cargo agent</code>)</summary>

If you prefer not to use the scaffold, create a Rust library crate manually:

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

[lib]
crate-type = ["rlib"]

[dependencies]
kernel-sdk = { path = "../sdk/kernel-sdk" }
kernel-guest = { path = "../runtime/kernel-guest" }
constraints = { path = "../protocol/constraints" }

[build-dependencies]
sha2 = "0.10"
```

</details>

## Implementing agent_main

The core of your agent is a single function with the signature `fn(ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput`.

### A Minimal Agent

```rust
use kernel_sdk::prelude::*;

pub extern "Rust" fn agent_main(_ctx: &AgentContext, _opaque_inputs: &[u8]) -> AgentOutput {
    AgentOutput { actions: Vec::new() }
}
```

This agent does nothing—it returns an empty output.

### A Real Agent Example

This is the structure used by the `defi-yield-farmer` agent:

```rust
use kernel_sdk::prelude::*;
use kernel_sdk::actions::{CallBuilder, erc20};

kernel_sdk::agent_input! {
    struct MarketInput {
        lending_pool: [u8; 20],
        asset_token: [u8; 20],
        vault_address: [u8; 20],
        vault_balance: u64,
        supplied_amount: u64,
        supply_rate_bps: u32,
        min_supply_rate_bps: u32,
        target_utilization_bps: u32,
        action_flag: u8,
    }
}

pub extern "Rust" fn agent_main(_ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput {
    let market = match MarketInput::decode(opaque_inputs) {
        Some(m) => m,
        None => return AgentOutput { actions: Vec::new() },
    };

    if market.vault_balance == 0 {
        return AgentOutput { actions: Vec::new() };
    }

    // Approve the lending pool, then supply tokens
    let approve = erc20::approve(
        &market.asset_token,
        &market.lending_pool,
        market.vault_balance,
    );
    let supply = CallBuilder::new(market.lending_pool)
        .selector(0x617ba037) // supply(address,uint256,address,uint16)
        .param_address(&market.asset_token)
        .param_u256_from_u64(market.vault_balance)
        .param_address(&market.vault_address)
        .param_u16(0)
        .build();

    let mut actions = Vec::with_capacity(2);
    actions.push(approve);
    actions.push(supply);
    AgentOutput { actions }
}
```

## Parsing Inputs

Use the [`agent_input!` macro](/sdk/agent-input-macro) for fixed-size inputs:

```rust
kernel_sdk::agent_input! {
    struct YieldInput {
        vault_address: [u8; 20],
        yield_source: [u8; 20],
        amount: u64,
    }
}

// YieldInput::ENCODED_SIZE == 48
// YieldInput::decode(bytes) -> Option<YieldInput>
// input.encode() -> Vec<u8>
```

<details>
<summary>Advanced: Manual cursor-style parsing</summary>

For variable-length inputs or complex formats, use the cursor-style readers:

```rust
let mut offset = 0;

let vault = read_bytes20_at(opaque_inputs, &mut offset)?;
let amount = read_u64_le_at(opaque_inputs, &mut offset)?;
let direction = read_u8_at(opaque_inputs, &mut offset)?;

if direction > 1 {
    return None;
}
```

</details>

### Defensive Parsing

Always return empty output instead of panicking:

```rust
// Good: defensive
let input = match MyInput::decode(opaque_inputs) {
    Some(i) => i,
    None => return AgentOutput { actions: Vec::new() },
};

// Bad: panics on invalid input
let amount = u64::from_le_bytes(opaque_inputs[40..48].try_into().unwrap());
```

## Constructing Actions

Use [`CallBuilder`](/sdk/call-builder) for contract calls and [`erc20` helpers](/sdk/call-builder#erc20-helpers) for token operations:

```rust
use kernel_sdk::actions::{CallBuilder, erc20};

// ERC20 approve
let approve = erc20::approve(&token, &spender, amount);

// ERC20 transfer
let transfer = erc20::transfer(&token, &recipient, amount);

// Custom contract call
let action = CallBuilder::new(pool_address)
    .selector(0x617ba037)
    .param_address(&asset)
    .param_u256_from_u64(amount)
    .build();
```

## The Kernel Binding

After defining `agent_main`, add the `agent_entrypoint!` macro to bind your agent to the kernel:

```rust
kernel_sdk::agent_entrypoint!(agent_main);
```

This single macro generates `kernel_main()` and `kernel_main_with_constraints()` — everything needed for kernel integration, with no separate binding crate required.

## The Code Hash Build Script

Create `build.rs` to compute the agent code hash at compile time. The scaffold generates this automatically. See the [scaffold source](https://github.com/tokamak-network/Tokamak-AI-Layer/blob/master/execution-kernel/crates/agent-pack/src/scaffold.rs) for the full template.

Include the generated constant in `lib.rs`:

```rust
include!(concat!(env!("OUT_DIR"), "/agent_hash.rs"));
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

### Error Handling

Return empty output instead of panicking — panics abort proof generation:

```rust
if condition_failed {
    return AgentOutput { actions: Vec::new() };
}
```

<details>
<summary>Memory management and determinism tips</summary>

**Memory**: Prefer `Vec::with_capacity(n)` over `vec![]` for bounded allocation in the zkVM guest.

**Determinism**: Never iterate over `HashMap` directly — order varies between runs. Collect into a `Vec` and sort first:

```rust
let mut items: Vec<_> = map.iter().collect();
items.sort_by_key(|(k, _)| *k);
```

See [Trust Model](/architecture/trust-model) for a full discussion of determinism requirements.

</details>

## Related

- [`agent_input!` Macro](/sdk/agent-input-macro) - Declarative input parsing
- [CallBuilder & ERC20 Helpers](/sdk/call-builder) - Fluent action construction
- [Constraints](/sdk/constraints-and-commitments) - Understand constraint enforcement
- [Testing](/sdk/testing) - Test at multiple levels
- [Agent Pack](/agent-pack/format) - Package for distribution
