---
title: Run an Example
sidebar_position: 3
---

# Run an Example

**What you'll do:** Run the built-in example agents to see how testing works, from quick unit tests to full proof generation.

## Prerequisites

- tal CLI installed (`tal doctor` passes)

## Run unit tests

Test agent logic instantly, without any proof generation:

```bash
# Test the example yield agent
tal test --local --agent example-yield-agent

# Test the DeFi yield farmer
tal test --local --agent defi-yield-farmer
```

These tests check input parsing, action construction, and code hash consistency. They complete in 2-5 seconds.

## Simulate with fixture data

Run an agent with sample inputs and see the output actions:

```bash
tal sim fixtures/sample.json
```

This executes your `agent_main()` natively with full constraint enforcement but no proof generation. Use this for rapid iteration during development.

## Run proof tests

Generate actual zkVM proofs to verify the full pipeline:

```bash
tal test --proof --agent example-yield-agent
```

This is computationally intensive (several minutes) and confirms that:
- The agent compiles to a valid zkVM binary
- Proof generation succeeds
- The journal and commitments are well-formed

## Verify it worked

A successful test run prints a summary with pass/fail status for each test case. If all tests pass, your agent is ready for `tal build --elf` and deployment.

## Next steps

- [5-Minute Quickstart](/quickstart) -- Build and deploy your own agent
- [DeFi Yield Farmer](/getting-started/defi-yield-farmer) -- Walkthrough of a production-grade agent
- [Testing](/sdk/testing) -- Full testing API (`TestHarness`, `ContextBuilder`, snapshots)
