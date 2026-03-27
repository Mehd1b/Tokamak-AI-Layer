---
title: agent_input! Macro
sidebar_position: 3
---

# `agent_input!` Macro

The `agent_input!` macro generates a struct with `decode()` and `encode()` methods for parsing fixed-size agent inputs from raw bytes. It replaces 30--100 lines of manual byte parsing with a single declaration.

## What it does

You declare a struct with typed fields. The macro generates:

| Generated item | Description |
|----------------|-------------|
| `MyInput::ENCODED_SIZE` | Total byte size of the struct (computed at compile time) |
| `MyInput::decode(bytes)` | Parses bytes into the struct. Returns `None` if length is wrong |
| `my_input.encode()` | Serializes the struct back to bytes (inverse of `decode`) |

## Example

```rust
kernel_sdk::agent_input! {
    struct SwapInput {
        token_in:  [u8; 20],   // 20 bytes -- EVM address
        token_out: [u8; 20],   // 20 bytes
        amount:    u64,        //  8 bytes (little-endian)
        slippage:  u32,        //  4 bytes (little-endian)
    }
}
// SwapInput::ENCODED_SIZE == 52  (20 + 20 + 8 + 4)
```

Use it in `agent_main`:

```rust
pub extern "Rust" fn agent_main(_ctx: &AgentContext, opaque_inputs: &[u8]) -> AgentOutput {
    let input = match SwapInput::decode(opaque_inputs) {
        Some(i) => i,
        None => return AgentOutput { actions: Vec::new() },
    };

    // Use input.token_in, input.amount, etc.
}
```

## Supported types

| Type | Size (bytes) | Notes |
|------|-------------|-------|
| `u8` | 1 | |
| `u16` | 2 | Little-endian |
| `u32` | 4 | Little-endian |
| `u64` | 8 | Little-endian |
| `bool` | 1 | `0x00` = false, `0x01` = true |
| `[u8; 20]` | 20 | EVM address |
| `[u8; 32]` | 32 | Hash, ID, or bytes32 |

## When not to use it

The macro only handles **fixed-size** inputs. For variable-length data (dynamic arrays, strings, nested structures), use the cursor-style byte readers from the prelude:

```rust
let mut offset = 0;
let addr = read_bytes20_at(opaque_inputs, &mut offset)?;
let count = read_u32_le_at(opaque_inputs, &mut offset)?;
```

## Related

- [Build Your First Agent](/sdk/writing-an-agent) -- see the macro in context
- [Testing](/sdk/testing) -- use `encode()` to construct test inputs
