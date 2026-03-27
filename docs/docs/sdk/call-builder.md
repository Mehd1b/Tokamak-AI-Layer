---
title: CallBuilder & ERC20 Helpers
sidebar_position: 4
---

# CallBuilder & ERC20 Helpers

`CallBuilder` is a fluent API for constructing ABI-encoded contract call actions. The `erc20` module provides one-line helpers for common token operations.

## CallBuilder

### How to use it

Chain methods to build a contract call, then call `.build()` to get an `ActionV1`:

```rust
use kernel_sdk::actions::CallBuilder;

let action = CallBuilder::new(pool_address)   // target contract ([u8; 20])
    .selector(0x617ba037)                      // 4-byte function selector
    .param_address(&asset_token)               // address parameter
    .param_u256_from_u64(amount)               // uint256 from a u64 value
    .param_address(&on_behalf_of)              // another address
    .param_u16(0)                              // uint16 referral code
    .build();                                  // -> ActionV1
```

### Available methods

| Method | What it appends |
|--------|----------------|
| `.selector(u32)` | 4-byte function selector (big-endian) |
| `.param_address(&[u8; 20])` | Address, left-padded to 32 bytes |
| `.param_u256_from_u64(u64)` | uint256 from u64, right-aligned in 32 bytes |
| `.param_u256(u128)` | uint256 from u128, right-aligned in 32 bytes |
| `.param_u16(u16)` | uint16, right-aligned in 32 bytes |
| `.param_bool(bool)` | Boolean (0 or 1), right-aligned in 32 bytes |
| `.param_bytes32(&[u8; 32])` | Raw 32 bytes |
| `.value(u128)` | Set ETH value in wei (encoded in payload prefix) |
| `.build()` | Produce the final `ActionV1` |

### Example: AAVE supply

```rust
let supply = CallBuilder::new(lending_pool)
    .selector(0x617ba037)  // supply(address,uint256,address,uint16)
    .param_address(&asset)
    .param_u256_from_u64(amount)
    .param_address(&vault)
    .param_u16(0)          // referral code
    .build();
```

### Example: ETH transfer (no calldata)

```rust
let deposit = CallBuilder::new(yield_source)
    .value(amount as u128)
    .build();
```

### Example: AAVE withdraw

```rust
let withdraw = CallBuilder::new(lending_pool)
    .selector(0x69328dec)  // withdraw(address,uint256,address)
    .param_address(&asset)
    .param_u256_from_u64(amount)
    .param_address(&vault)
    .build();
```

## ERC20 helpers

One-line constructors for common ERC20 operations. All return `ActionV1`.

```rust
use kernel_sdk::actions::erc20;

// approve(spender, amount)
let approve = erc20::approve(&token, &spender, amount);

// transfer(to, amount)
let transfer = erc20::transfer(&token, &recipient, amount);

// transferFrom(from, to, amount)
let xfer = erc20::transfer_from(&token, &from, &to, amount);
```

## Common selectors

| Function | Selector |
|----------|----------|
| `approve(address,uint256)` | `0x095ea7b3` |
| `transfer(address,uint256)` | `0xa9059cbb` |
| `transferFrom(address,address,uint256)` | `0x23b872dd` |
| `supply(address,uint256,address,uint16)` | `0x617ba037` |
| `withdraw(address,uint256,address)` | `0x69328dec` |

## Related

- [Build Your First Agent](/sdk/writing-an-agent) -- see CallBuilder used in a full agent
- [`agent_input!` Macro](/sdk/agent-input-macro) -- parse inputs before building actions
