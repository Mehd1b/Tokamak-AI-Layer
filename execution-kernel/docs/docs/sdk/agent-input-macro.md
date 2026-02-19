---
title: agent_input! Macro
sidebar_position: 3
---

# `agent_input!` Macro

The `agent_input!` macro generates a struct with `decode()` and `encode()` methods for parsing fixed-size agent inputs from opaque byte slices. It eliminates 30-100 lines of manual byte parsing per agent.

## Basic Example

```rust
kernel_sdk::agent_input! {
    struct MyInput {
        target: [u8; 20],
        amount: u64,
        flag: u8,
    }
}

// Generated API:
// MyInput::ENCODED_SIZE == 29  (20 + 8 + 1)
// MyInput::decode(bytes: &[u8]) -> Option<MyInput>
// MyInput.encode() -> Vec<u8>
```

Usage in `agent_main`:

```rust
pub extern "Rust" fn agent_main(_ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput {
    let input = match MyInput::decode(opaque_inputs) {
        Some(i) => i,
        None => return AgentOutput { actions: Vec::new() },
    };

    // Use input.target, input.amount, input.flag ...
}
```

## Supported Types

| Type | Size (bytes) | Description |
|------|-------------|-------------|
| `u8` | 1 | Unsigned 8-bit integer |
| `u16` | 2 | Little-endian unsigned 16-bit |
| `u32` | 4 | Little-endian unsigned 32-bit |
| `u64` | 8 | Little-endian unsigned 64-bit |
| `bool` | 1 | `0x00` = false, `0x01` = true |
| `[u8; 20]` | 20 | EVM address (raw bytes) |
| `[u8; 32]` | 32 | bytes32 (hash, ID, etc.) |

All integer types use **little-endian** encoding.

## DeFi Example: 89-byte MarketInput

This is the actual input struct from the `defi-yield-farmer` agent:

```rust
kernel_sdk::agent_input! {
    struct MarketInput {
        lending_pool: [u8; 20],        // AAVE V3 pool address
        asset_token: [u8; 20],         // ERC20 token (e.g., DAI)
        vault_address: [u8; 20],       // Vault contract address
        vault_balance: u64,            // Idle tokens in vault (wei)
        supplied_amount: u64,          // Tokens supplied to AAVE
        supply_rate_bps: u32,          // Current AAVE supply rate
        min_supply_rate_bps: u32,      // Minimum rate threshold
        target_utilization_bps: u32,   // Target % to deploy
        action_flag: u8,               // 0=evaluate, 1=supply, 2=withdraw
    }
}

// MarketInput::ENCODED_SIZE == 89
// 20*3 + 8*2 + 4*3 + 1 = 60 + 16 + 12 + 1 = 89
```

## Generated API

For a struct `MyInput`, the macro generates:

| Item | Description |
|------|-------------|
| `MyInput::ENCODED_SIZE` | `const usize` — total byte size of the encoded struct |
| `MyInput::decode(bytes: &[u8]) -> Option<Self>` | Decodes from bytes, returns `None` if length != `ENCODED_SIZE` |
| `MyInput.encode() -> Vec<u8>` | Encodes back to canonical bytes (inverse of `decode`) |

### Round-trip guarantee

`decode` and `encode` are inverses:

```rust
let original = /* 89 bytes */;
let parsed = MarketInput::decode(&original).unwrap();
let re_encoded = parsed.encode();
assert_eq!(re_encoded, original);
```

## Testing Inputs

Use `encode()` to construct test inputs from field values:

```rust
#[test]
fn test_supply_when_rate_above_threshold() {
    let input = MarketInput {
        lending_pool: [0x11; 20],
        asset_token: [0x22; 20],
        vault_address: [0x33; 20],
        vault_balance: 1_000_000,
        supplied_amount: 0,
        supply_rate_bps: 500,
        min_supply_rate_bps: 200,
        target_utilization_bps: 8000,
        action_flag: 0,
    };

    let output = agent_main(&ctx, &input.encode());
    assert_eq!(output.actions.len(), 1);
}
```

:::note
Since the struct fields are not `pub` by default, the struct-literal approach above works only within the same module where `agent_input!` is invoked. For external test crates, build input bytes manually or add a constructor.
:::

## When NOT to Use

The macro is designed for **fixed-size** inputs only. Do not use it for:

- Variable-length data (dynamic arrays, strings)
- Nested structures
- Inputs larger than `MAX_AGENT_INPUT_BYTES` (64,000 bytes)

For these cases, use the cursor-style byte readers from the prelude directly:

```rust
let mut offset = 0;
let addr = read_bytes20_at(opaque_inputs, &mut offset)?;
let count = read_u32_le_at(opaque_inputs, &mut offset)?;
// ... read variable-length data manually
```

## Migration Guide

<details>
<summary>Before: manual parsing (30+ lines)</summary>

```rust
if opaque_inputs.len() != 89 {
    return AgentOutput { actions: Vec::new() };
}
let mut offset = 0;
let lending_pool = read_bytes20_at(opaque_inputs, &mut offset)?;
let asset_token = read_bytes20_at(opaque_inputs, &mut offset)?;
let vault_address = read_bytes20_at(opaque_inputs, &mut offset)?;
let vault_balance = read_u64_le_at(opaque_inputs, &mut offset)?;
let supplied_amount = read_u64_le_at(opaque_inputs, &mut offset)?;
let supply_rate_bps = read_u32_le_at(opaque_inputs, &mut offset)?;
let min_supply_rate_bps = read_u32_le_at(opaque_inputs, &mut offset)?;
let target_utilization_bps = read_u32_le_at(opaque_inputs, &mut offset)?;
let action_flag = read_u8_at(opaque_inputs, &mut offset)?;
```

</details>

**After: declarative macro (10 lines)**

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

let market = MarketInput::decode(opaque_inputs)?;
```
