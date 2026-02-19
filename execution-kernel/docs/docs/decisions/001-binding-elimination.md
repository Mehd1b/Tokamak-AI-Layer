---
title: "ADR-001: Binding Elimination"
sidebar_position: 1
---

# ADR-001: Binding Crate Elimination

**Status**: Accepted
**Date**: 2025

## Context

Each agent required three sub-crates: `agent/`, `binding/`, and `risc0-methods/`. The `binding/` crate existed solely to implement the `AgentEntrypoint` trait by wrapping the agent's `agent_main` function:

```rust
// binding/src/lib.rs — 12 lines of pure boilerplate
pub struct MyAgentWrapper;

impl AgentEntrypoint for MyAgentWrapper {
    fn code_hash(&self) -> [u8; 32] {
        my_agent::AGENT_CODE_HASH
    }

    fn run(&self, ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput {
        my_agent::agent_main(ctx, opaque_inputs)
    }
}

pub fn kernel_main(input_bytes: &[u8]) -> Result<Vec<u8>, KernelError> {
    kernel_guest::kernel_main_with_agent(input_bytes, &MyAgentWrapper)
}
```

This meant every agent had:
- An extra `Cargo.toml` with 4 dependencies
- A boilerplate `lib.rs` that was nearly identical across agents
- A separate crate to compile in the workspace

For N agents, this was N extra crates with identical structure.

## Decision

Replace the `binding/` crate with the `agent_entrypoint!` macro in `kernel-sdk`. Agents add one line at the bottom of their `lib.rs`:

```rust
kernel_sdk::agent_entrypoint!(agent_main);
```

This generates:
- The `__KernelAgentWrapper` struct implementing `AgentEntrypoint`
- `pub fn kernel_main(input_bytes: &[u8]) -> Result<Vec<u8>, KernelError>`
- `pub fn kernel_main_with_constraints(input_bytes: &[u8], cs: &ConstraintSetV1) -> Result<Vec<u8>, KernelError>`
- Re-export of `KernelError`

## Consequences

### Positive

- **2 crates per agent** instead of 3 (`agent/` + `risc0-methods/`)
- Zero boilerplate — the macro generates all binding code
- Faster compilation (fewer crates in workspace)
- Scaffold generates a simpler project structure

### Negative

- Agent crate now depends on `kernel-guest` and `constraints` (previously only the binding had these)
- The macro hides the `AgentEntrypoint` implementation — developers must trust it

### Migration

Remove the `binding/` directory entirely. Add `kernel-guest` and `constraints` to the agent's `Cargo.toml` dependencies, then add `kernel_sdk::agent_entrypoint!(agent_main);` to `lib.rs`.
