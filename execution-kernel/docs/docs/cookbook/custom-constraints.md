---
title: "Recipe: Custom Constraints"
sidebar_position: 3
---

# Recipe: Testing with Constraints

This recipe demonstrates how to test kernel-level execution with custom constraints, using `execute_kernel_with_constraints` and `assert_failure()`.

## Kernel-Level Testing

While `TestHarness::execute()` tests agent logic directly, `execute_kernel()` and `execute_kernel_with_constraints()` test through the full kernel pipeline — including input commitment, constraint enforcement, and journal construction.

## Basic Kernel Test

```rust
use kernel_sdk::testing::*;
use my_agent::{agent_main, kernel_main};

#[test]
fn test_kernel_execution_success() {
    let result = TestHarness::new()
        .agent_id([0x42; 32])
        .input(valid_input_bytes)
        .execute_kernel(kernel_main);

    result.assert_success();
    result.assert_agent_id(&[0x42; 32]);
    result.assert_nonce(1);
}
```

## Testing Constraint Violations

Use `execute_kernel_with_constraints` to test with a custom `ConstraintSetV1`:

```rust
use constraints::ConstraintSetV1;

#[test]
fn test_constraint_violation_produces_failure() {
    // Create restrictive constraints
    let constraints = ConstraintSetV1 {
        max_actions_per_output: 0, // Disallow all actions
        ..ConstraintSetV1::default()
    };

    let result = TestHarness::new()
        .input(valid_input_bytes)
        .execute_kernel_with_constraints(
            kernel_main_with_constraints,
            &constraints,
        );

    result.assert_failure();
}
```

## Assertion Methods

### `TestResult` (agent-level)

| Method | Description |
|--------|-------------|
| `assert_action_count(n)` | Exact action count |
| `assert_action_type(index, type)` | Action type at index |
| `assert_target(index, &addr)` | Action target address |
| `assert_empty()` | No actions produced |
| `assert_deterministic(agent_fn)` | Re-run produces identical output |
| `assert_payload(index, &bytes)` | Raw payload match |

### `KernelTestResult` (kernel-level)

| Method | Description |
|--------|-------------|
| `assert_success()` | Execution status is `Success` |
| `assert_failure()` | Execution status is `Failure` |
| `assert_deterministic(kernel_fn)` | Re-run produces identical journal |
| `assert_agent_id(&id)` | Agent ID in journal matches |
| `assert_nonce(n)` | Execution nonce in journal matches |

### Inspectors

| Method | Returns | Description |
|--------|---------|-------------|
| `status()` | `ExecutionStatus` | Success or Failure |
| `is_success()` | `bool` | Check success |
| `is_failure()` | `bool` | Check failure |
| `action_commitment()` | `[u8; 32]` | Action commitment hash |
| `input_commitment()` | `[u8; 32]` | Input commitment hash |

## Testing Determinism

Every agent and kernel execution must be deterministic. Use the built-in assertion:

```rust
#[test]
fn test_agent_determinism() {
    let result = TestHarness::new()
        .input(some_input)
        .execute(agent_main);

    result.assert_deterministic(agent_main);
}

#[test]
fn test_kernel_determinism() {
    let result = TestHarness::new()
        .input(some_input)
        .execute_kernel(kernel_main);

    result.assert_deterministic(kernel_main);
}
```

## Snapshot Testing

With the `std` feature enabled, you can use snapshot testing to detect unexpected output changes:

```rust
#[test]
fn test_output_snapshot() {
    let result = TestHarness::new()
        .input(canonical_input)
        .execute(agent_main);

    result.assert_snapshot("my_agent_basic");
}
```

Snapshots are saved to `tests/snapshots/<name>.snap`. Set `BLESS=1` to update:

```bash
BLESS=1 cargo test test_output_snapshot
```
