---
title: Constraints and Commitments
sidebar_position: 3
---

# Constraints and Commitments

Constraints are economic safety rules that the kernel enforces after every agent execution. Your agent cannot bypass them -- they are checked automatically, and violations produce a valid proof with a `Failure` status.

## What constraints do

Every time your agent returns actions, the kernel checks them against a `ConstraintSetV1`:

| Parameter | What it limits |
|-----------|---------------|
| `max_actions_per_output` | Maximum number of actions per execution (up to 64) |
| `max_position_notional` | Maximum position size |
| `max_leverage_bps` | Maximum leverage in basis points (10000 = 1x) |
| `max_drawdown_bps` | Maximum portfolio drawdown in basis points |
| `cooldown_seconds` | Minimum seconds between executions |
| `allowed_asset_id` | Restricts which asset the agent can operate on (`[0; 32]` = all allowed) |

The default constraint set is maximally permissive -- no limits on position size, 10x max leverage, 100% drawdown allowed, no cooldown, and all assets allowed.

## Violation codes

When a constraint is violated, the kernel sets the execution status to `Failure` and records a reason code:

| Code | Name | Meaning |
|------|------|---------|
| `0x01` | `InvalidOutputStructure` | Too many actions or payload too large |
| `0x02` | `UnknownActionType` | Action type not recognized |
| `0x03` | `AssetNotWhitelisted` | Asset not in the allowed list |
| `0x04` | `PositionTooLarge` | Position exceeds size limit |
| `0x05` | `LeverageTooHigh` | Leverage exceeds limit |
| `0x06` | `DrawdownExceeded` | Portfolio drawdown too high |
| `0x07` | `CooldownNotElapsed` | Too soon since last execution |
| `0x08` | `InvalidStateSnapshot` | State snapshot malformed or missing |
| `0x09` | `InvalidConstraintSet` | Constraint configuration is invalid |
| `0x0A` | `InvalidActionPayload` | Payload does not match the expected schema |

Evaluation stops at the first violation.

## How to check constraints

### During development

Use `tal sim` to run your agent against a fixture and see which constraints pass or fail:

```bash
tal sim fixtures/sample.json
```

The output shows each constraint with a pass/fail indicator:

```
Constraints:
  [+] Max actions     2 / 64
  [+] Drawdown        (disabled)
  [+] Cooldown        OK (no cooldown)
  [+] Leverage        (reserved)

Result: PASS
```

### In tests

Use `TestHarness` with `execute_kernel_with_constraints` to test constraint behavior in Rust:

```rust
let result = TestHarness::new()
    .input(my_input.encode())
    .execute_kernel_with_constraints(kernel_main, &my_constraints);

result.assert_success();  // or assert_failure()
```

## Best practices for agents

- Return empty output when you know constraints will fail -- this avoids wasting proof computation.
- Keep your action count well below the limit.
- Test edge cases around constraint boundaries with `tal sim`.

## Related

- [Testing](/sdk/testing) -- test constraint behavior with `tal sim` and `TestHarness`
- [Build Your First Agent](/sdk/writing-an-agent) -- defensive parsing patterns
