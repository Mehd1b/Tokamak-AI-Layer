---
title: Testing
sidebar_position: 6
---

# Testing Agents

Test your agent at multiple levels using the `tal` CLI, from instant unit tests to full ZK proof generation.

## What you'll learn

- How to run unit tests, integration tests, and proof tests
- How to use `TestHarness` for in-code testing
- How to simulate against fixture files

## Prerequisites

- An agent project created with `tal init`
- `tal doctor` passes (run `tal doctor --install` to fix issues)

## Testing with `tal test`

### Unit tests (instant)

```bash
tal test --local
```

Runs your agent's Rust unit tests natively. No zkVM compilation needed. Results in 2--5 seconds.

### Integration tests (dry run)

```bash
tal test --dry-run
```

Runs the agent host with live market data but does not generate a proof or submit transactions. Use this to verify your agent behaves correctly with real inputs.

### Full ZK proof

```bash
tal test --prove
```

Generates a real ZK proof using the zkVM. Takes 8--10 minutes. Run this before deploying to verify that proof generation works end to end.

### Determinism check

```bash
tal test --local --determinism-check
```

Runs the agent twice with identical inputs and verifies the output is byte-identical. Non-deterministic agents cannot produce valid proofs.

### Test with a fixture file

```bash
tal test --local --input fixtures/btc-long.json
```

Tests against a saved fixture. New projects created with `tal init` include example fixtures in the `fixtures/` directory.

## Verify it worked

After running `tal test --local`, you should see output like:

```
Running tests for my-agent...
  test_supply_when_rate_above_threshold  PASSED
  test_invalid_input_returns_empty       PASSED
  test_determinism                       PASSED

3 passed, 0 failed
```

## Simulating with `tal sim`

For rapid iteration, use the simulator. It runs your agent logic plus constraint enforcement natively -- no zkVM:

```bash
tal sim fixtures/sample.json
```

The simulator prints an actions table and shows which constraints passed or failed. Exit code 0 means all constraints passed (CI-friendly).

## Writing tests in Rust

The SDK provides `TestHarness` for writing unit tests with minimal boilerplate.

### Basic test

```rust
use kernel_sdk::testing::*;
use kernel_sdk::prelude::*;

#[test]
fn test_my_agent() {
    let result = TestHarness::new()
        .input(my_input.encode())
        .execute(agent_main);

    result.assert_action_count(1);
    result.assert_action_type(0, ACTION_TYPE_CALL);
}
```

### Test for empty output on bad input

```rust
#[test]
fn test_invalid_input_returns_empty() {
    let result = TestHarness::new()
        .input(&[0u8; 10])
        .execute(agent_main);

    result.assert_empty();
}
```

### Test determinism

```rust
#[test]
fn test_determinism() {
    let result = TestHarness::new()
        .input(valid_input_bytes())
        .execute(agent_main);

    result.assert_deterministic(agent_main);
}
```

### TestHarness configuration

| Method | Description | Default |
|--------|-------------|---------|
| `.agent_id([u8; 32])` | Set agent ID | `[0x42; 32]` |
| `.code_hash([u8; 32])` | Set agent code hash | `[0; 32]` |
| `.nonce(u64)` | Set execution nonce | `1` |
| `.input(impl AsRef<[u8]>)` | Set opaque input bytes | `[]` |

### TestResult assertions

| Method | Description |
|--------|-------------|
| `assert_action_count(n)` | Exact number of actions |
| `assert_action_type(index, type)` | Action type at position |
| `assert_target(index, &[u8; 20])` | Action target address |
| `assert_empty()` | No actions produced |
| `assert_deterministic(agent_fn)` | Re-runs and asserts identical output |

### Hex helpers

Convert hex strings to byte arrays in tests:

```rust
use kernel_sdk::testing::*;

let pool = addr("0x1111111111111111111111111111111111111111");
let id = bytes32("0x42");
let data = hex_bytes("0xDEADBEEF");
```

## Related

- [Build Your First Agent](/sdk/writing-an-agent) -- write your first agent and test it
- [Constraints](/sdk/constraints-and-commitments) -- understand what the kernel enforces
- [Deployment Guide](/sdk/deploy-guide) -- deploy after testing
