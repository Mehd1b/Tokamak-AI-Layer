---
title: "ADR-002: Declarative Input Parsing"
sidebar_position: 2
---

# ADR-002: Declarative Input Parsing

**Status**: Accepted
**Date**: 2025

## Context

Every agent needed to parse its `opaque_inputs` byte slice manually. The `defi-yield-farmer` agent required 30+ lines of cursor-style byte reading:

```rust
if opaque_inputs.len() != 89 {
    return AgentOutput { actions: Vec::new() };
}
let mut offset = 0;
let lending_pool = read_bytes20_at(opaque_inputs, &mut offset)?;
let asset_token = read_bytes20_at(opaque_inputs, &mut offset)?;
let vault_address = read_bytes20_at(opaque_inputs, &mut offset)?;
let vault_balance = read_u64_le_at(opaque_inputs, &mut offset)?;
// ... 5 more fields
```

This pattern was:
- Repetitive across agents
- Error-prone (wrong offsets, wrong field order)
- Hard to maintain when input formats change
- Missing size validation in some agents

## Decision

Introduce the `agent_input!` declarative macro in `kernel-sdk` that generates a struct with `decode()`, `encode()`, and `ENCODED_SIZE`:

```rust
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
```

The macro supports 7 fixed-size types: `u8`, `u16`, `u32`, `u64`, `bool`, `[u8; 20]`, `[u8; 32]`.

## Consequences

### Positive

- **10 lines** replace 30+ lines of manual parsing
- Compile-time `ENCODED_SIZE` computation — no manual byte counting
- Automatic length validation in `decode()` — rejects inputs with wrong size
- `encode()` enables easy test input construction
- Type-safe field access

### Negative

- Fixed-size types only — no variable-length fields (dynamic arrays, strings)
- Agents needing complex parsing must still use manual byte readers
- Struct fields are not `pub` — cross-module access requires constructors

### Trade-off

The macro is intentionally limited to fixed-size types. This is a deliberate constraint: zkVM agent inputs should be compact, deterministic, and bounded. Variable-length parsing can be done with the cursor-style readers in `kernel_sdk::bytes` for advanced cases.
