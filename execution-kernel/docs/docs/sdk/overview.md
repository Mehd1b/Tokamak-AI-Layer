---
title: SDK Overview
sidebar_position: 1
---

# Kernel SDK Overview

The `kernel-sdk` crate provides the canonical interface for developing agents that execute inside the zkVM guest environment.

## Design Principles

1. **Stability** - Versioned interface, backwards-compatible within major versions
2. **Minimalism** - Agents receive only what they strictly need
3. **Isolation** - Agents cannot access forbidden APIs or kernel internals
4. **Determinism** - Agent execution must be fully deterministic
5. **Auditability** - Agent behavior must be inspectable and reproducible

## Crate Attributes

```rust
#![no_std]
#![forbid(unsafe_code)]
#![deny(clippy::std_instead_of_alloc)]
#![deny(clippy::std_instead_of_core)]
```

The SDK is `no_std` and forbids unsafe code. Agents inherit these constraints.

## Module Structure

```
kernel-sdk/
├── src/
│   ├── lib.rs          # Crate root, macros (agent_input!, agent_entrypoint!)
│   ├── agent.rs        # AgentContext and AgentEntrypoint
│   ├── types.rs        # ActionV1, AgentOutput
│   ├── actions.rs      # CallBuilder, erc20 helpers
│   ├── math.rs         # Checked/saturating arithmetic
│   ├── bytes.rs        # Binary reading/writing helpers
│   └── testing.rs      # TestHarness, ContextBuilder, hex helpers (behind "testing" feature)
```

## Using the SDK

Add to your `Cargo.toml`:

```toml
[dependencies]
kernel-sdk = { path = "../sdk/kernel-sdk" }
kernel-guest = { path = "../runtime/kernel-guest" }
constraints = { path = "../protocol/constraints" }
```

Import the prelude for common types:

```rust
use kernel_sdk::prelude::*;
```

## Macros

### `agent_input!`

Generates a struct with `decode()` and `encode()` for fixed-size input parsing:

```rust
kernel_sdk::agent_input! {
    struct MyInput {
        target: [u8; 20],
        amount: u64,
    }
}
// MyInput::ENCODED_SIZE == 28
// MyInput::decode(bytes) -> Option<MyInput>
```

See [`agent_input!` Macro](/sdk/agent-input-macro) for full documentation.

### `agent_entrypoint!`

Generates kernel binding code, eliminating the need for a separate binding crate:

```rust
kernel_sdk::agent_entrypoint!(agent_main);
// Generates: kernel_main(), kernel_main_with_constraints(), KernelError re-export
```

## The Prelude

The prelude exports commonly used items:

| Category | Items |
|----------|-------|
| Context | `AgentContext`, `AgentEntrypoint` |
| Types | `ActionV1`, `AgentOutput`, `MAX_ACTIONS_PER_OUTPUT`, `MAX_ACTION_PAYLOAD_BYTES` |
| Action Constants | `ACTION_TYPE_CALL`, `ACTION_TYPE_TRANSFER_ERC20`, `ACTION_TYPE_NO_OP` (production); `ACTION_TYPE_ECHO` (testing only) |
| Constructors | `call_action`, `transfer_erc20_action`, `no_op_action`, `address_to_bytes32` (production); `echo_action` (testing only) |
| Builders | `CallBuilder` |
| Math | `checked_add_u64`, `checked_mul_div_u64`, `apply_bps`, `calculate_bps`, `BPS_DENOMINATOR` |
| Bytes | `read_u32_le`, `read_u64_le`, `read_bytes32`, `read_u32_le_at`, etc. |
| Alloc | `Vec` (NOT `vec![]` macro) |

## Core Types

### AgentContext

Contains execution context passed to the agent:

```rust
pub struct AgentContext {
    pub protocol_version: u32,
    pub kernel_version: u32,
    pub agent_id: [u8; 32],
    pub agent_code_hash: [u8; 32],
    pub constraint_set_hash: [u8; 32],
    pub input_root: [u8; 32],
    pub execution_nonce: u64,
}
```

### AgentOutput

The agent's return value containing actions:

```rust
pub struct AgentOutput {
    pub actions: Vec<ActionV1>,
}
```

### ActionV1

A single action to be executed:

```rust
pub struct ActionV1 {
    pub action_type: u32,
    pub target: [u8; 32],
    pub payload: Vec<u8>,
}
```

## Action Types

| Constant | Value | Description |
|----------|-------|-------------|
| `ACTION_TYPE_CALL` | `0x00000002` | Generic contract call |
| `ACTION_TYPE_TRANSFER_ERC20` | `0x00000003` | ERC20 token transfer |
| `ACTION_TYPE_NO_OP` | `0x00000004` | No operation (skipped) |
| `ACTION_TYPE_ECHO` | `0x00000001` | Test/debug action (requires `testing` feature) |

## Action Construction

### CallBuilder (recommended)

```rust
use kernel_sdk::actions::CallBuilder;

let action = CallBuilder::new(target_address)
    .selector(0x617ba037)
    .param_address(&asset)
    .param_u256_from_u64(amount)
    .build();
```

### ERC20 helpers

```rust
use kernel_sdk::actions::erc20;

let approve = erc20::approve(&token, &spender, amount);
let transfer = erc20::transfer(&token, &to, amount);
let transfer_from = erc20::transfer_from(&token, &from, &to, amount);
```

### Low-level constructors

```rust
let target = address_to_bytes32(&contract_address);
let action = call_action(target, value, calldata);
let action = transfer_erc20_action(&token, &recipient, amount);
let action = no_op_action();
```

See [CallBuilder & ERC20 Helpers](/sdk/call-builder) for full documentation.

## Forbidden Behavior

| Forbidden | Reason |
|-----------|--------|
| `std::time` | Non-deterministic |
| `rand` / randomness | Non-deterministic |
| `std::fs`, `std::net` | I/O forbidden in guest |
| Syscalls / host functions | Isolation violation |
| Kernel internals | Isolation violation |
| Unbounded memory | Resource exhaustion |
| Floating-point operations | Non-deterministic across platforms |
| HashMap, HashSet | Non-deterministic iteration order |

## Size Limits

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_ACTIONS_PER_OUTPUT` | 64 | Maximum actions per output |
| `MAX_ACTION_PAYLOAD_BYTES` | 16,384 | Maximum payload per action |
| `MAX_AGENT_INPUT_BYTES` | 64,000 | Maximum opaque input size |

## Next Steps

- [Writing an Agent](/sdk/writing-an-agent) - Build your first agent
- [`agent_input!` Macro](/sdk/agent-input-macro) - Declarative input parsing
- [CallBuilder & ERC20 Helpers](/sdk/call-builder) - Fluent action construction
- [Testing](/sdk/testing) - TestHarness and testing utilities
- [`cargo agent` CLI Reference](/sdk/cli-reference) - Development workflow
