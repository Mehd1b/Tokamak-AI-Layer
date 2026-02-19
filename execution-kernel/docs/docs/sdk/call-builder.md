---
title: CallBuilder & ERC20 Helpers
sidebar_position: 4
---

# CallBuilder & ERC20 Helpers

The `CallBuilder` provides a fluent API for constructing ABI-encoded contract call actions. The `erc20` module provides pre-built helpers for common ERC20 operations.

## CallBuilder

### Basic Usage

```rust
use kernel_sdk::actions::CallBuilder;

let action = CallBuilder::new(pool_address)  // [u8; 20] target
    .selector(0x617ba037)                     // 4-byte function selector
    .param_address(&asset_token)              // address parameter
    .param_u256_from_u64(amount)              // uint256 from u64
    .param_address(&on_behalf_of)             // another address
    .param_u16(0)                             // uint16 referral code
    .build();                                 // -> ActionV1
```

### Available Methods

| Method | Description | ABI encoding |
|--------|-------------|-------------|
| `.selector(u32)` | Append 4-byte function selector | Big-endian 4 bytes |
| `.param_address(&[u8; 20])` | Append address parameter | Left-padded to 32 bytes |
| `.param_u256_from_u64(u64)` | Append uint256 from u64 | Right-aligned in 32 bytes (BE) |
| `.param_u256(u128)` | Append uint256 from u128 | Right-aligned in 32 bytes (BE) |
| `.param_u16(u16)` | Append uint16 | Right-aligned in 32 bytes (BE) |
| `.param_bool(bool)` | Append bool | 0 or 1, right-aligned in 32 bytes |
| `.param_bytes32(&[u8; 32])` | Append bytes32 | Raw 32 bytes |
| `.value(u128)` | Set ETH value in wei | Encoded in payload prefix |
| `.build()` | Produce final `ActionV1` | `ACTION_TYPE_CALL` |

All parameter methods encode values as standard 32-byte ABI words.

### AAVE Supply Example

```rust
const SUPPLY_SELECTOR: u32 = 0x617ba037;  // supply(address,uint256,address,uint16)

fn build_supply_action(market: &MarketInput, amount: u64) -> ActionV1 {
    CallBuilder::new(market.lending_pool)
        .selector(SUPPLY_SELECTOR)
        .param_address(&market.asset_token)
        .param_u256_from_u64(amount)
        .param_address(&market.vault_address)
        .param_u16(0)  // referralCode
        .build()
}
```

### ETH Transfer Example

To send ETH with no calldata, use `.value()` without a selector:

```rust
let deposit = CallBuilder::new(yield_source_address)
    .value(amount as u128)
    .build();
```

## ERC20 Helpers

The `kernel_sdk::actions::erc20` module provides one-line constructors for common ERC20 operations:

```rust
use kernel_sdk::actions::erc20;
```

### `erc20::approve`

```rust
let action = erc20::approve(&token, &spender, amount);
// Encodes: token.approve(spender, amount)
// Selector: 0x095ea7b3
```

### `erc20::transfer`

```rust
let action = erc20::transfer(&token, &to, amount);
// Encodes: token.transfer(to, amount)
// Selector: 0xa9059cbb
```

### `erc20::transfer_from`

```rust
let action = erc20::transfer_from(&token, &from, &to, amount);
// Encodes: token.transferFrom(from, to, amount)
// Selector: 0x23b872dd
```

All helpers return `ActionV1` with `action_type = ACTION_TYPE_CALL`.

## Common Selectors

| Protocol | Function | Selector |
|----------|----------|----------|
| ERC20 | `approve(address,uint256)` | `0x095ea7b3` |
| ERC20 | `transfer(address,uint256)` | `0xa9059cbb` |
| ERC20 | `transferFrom(address,address,uint256)` | `0x23b872dd` |
| AAVE V3 | `supply(address,uint256,address,uint16)` | `0x617ba037` |
| AAVE V3 | `withdraw(address,uint256,address)` | `0x69328dec` |

Compute selectors with `cast sig`:

```bash
cast sig "supply(address,uint256,address,uint16)"
# 0x617ba037
```

## Byte Identity

`CallBuilder` produces byte-identical output to manual encoding. This is verified in the SDK test suite — you can safely migrate from manual `call_action()` calls to `CallBuilder` without changing behavior.

<details>
<summary>Before: manual ABI encoding</summary>

```rust
let target = address_to_bytes32(&pool);
let mut calldata = Vec::with_capacity(132);
calldata.extend_from_slice(&[0x61, 0x7b, 0xa0, 0x37]); // selector
calldata.extend_from_slice(&address_to_bytes32(&asset));
let mut amount_bytes = [0u8; 32];
amount_bytes[24..32].copy_from_slice(&amount.to_be_bytes());
calldata.extend_from_slice(&amount_bytes);
calldata.extend_from_slice(&address_to_bytes32(&vault));
calldata.extend_from_slice(&[0u8; 32]); // referralCode = 0
let action = call_action(target, 0, &calldata);
```

</details>

**After: CallBuilder**

```rust
let action = CallBuilder::new(pool)
    .selector(0x617ba037)
    .param_address(&asset)
    .param_u256_from_u64(amount)
    .param_address(&vault)
    .param_u16(0)
    .build();
```
