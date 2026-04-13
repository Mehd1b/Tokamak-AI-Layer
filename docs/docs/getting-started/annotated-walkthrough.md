---
title: Annotated Walkthrough
sidebar_position: 6
description: What happens under the hood at each step of the quickstart
---

# Annotated Walkthrough

The [5-Minute Quickstart](/quickstart) shows you the commands. This page explains what each command does technically — how the CLI, the zkVM, and the on-chain contracts interact at each step.

Read this after you've completed the quickstart, or alongside it if you want to understand the system as you go.

---

## Step 1: Install

```bash
curl -sSL https://raw.githubusercontent.com/tokamak-network/Tokamak-AI-Layer/master/install-tal.sh | sh
tal doctor
```

**What it does:** Downloads the `tal` CLI binary and adds it to your `PATH`. The `tal doctor` command checks that Rust, the RISC Zero toolchain, and Foundry are installed and compatible.

:::info Under the hood
The `tal` CLI is a Rust binary that wraps several tools:
- **Cargo** — for compiling your agent crate
- **risc0-build** — for compiling Rust to RISC-V (the zkVM target architecture)
- **Foundry's forge** — for deploying Solidity contracts

`tal doctor --install` installs missing components automatically:
- Rust via `rustup`
- RISC Zero toolchain via `rzup` (provides `r0vm` and a custom `rustc` for the `riscv32im-risc0-zkvm-elf` target)
- Foundry via `foundryup`
:::

:::tip Key concept — The `tal` CLI
`tal` is the single entry point for the entire development lifecycle: scaffold → test → build → deploy → monitor. It insulates you from the complexity of coordinating Cargo workspaces, RISC Zero compilation, and Foundry deployment. Every `tal` command maps to one or more lower-level operations, but you rarely need to run them directly.
:::

---

## Step 2: Scaffold

```bash
tal init my-agent --template yield
```

**What it does:** Creates a new directory `my-agent/` with a complete agent project. The `yield` template generates a working agent that deposits ETH into a yield source and withdraws it.

:::info Under the hood
`tal init` does the following:

1. **Creates the directory structure:**
   ```
   my-agent/
     agent/
       Cargo.toml          # Dependencies: kernel-sdk, kernel-guest, constraints
       build.rs            # Computes AGENT_CODE_HASH at compile time
       src/lib.rs           # Your agent logic
     risc0-methods/
       zkvm-guest/          # Thin entry point that calls kernel_main_with_agent()
     dist/
       agent-pack.json      # Agent manifest (populated during build)
     .env.example           # Configuration template
   ```

2. **Generates `build.rs`** — This build script computes `AGENT_CODE_HASH = SHA-256(src/lib.rs || 0x00 || Cargo.toml)` at compile time. The hash is embedded as a constant in the binary, and the kernel verifies it at runtime. If someone modifies the source after building, the hash won't match and proof generation aborts.

3. **Populates `agent/src/lib.rs`** with template code that uses two SDK macros:
   - `agent_input!` — declares the input struct and generates `decode()`/`encode()` methods
   - `agent_entrypoint!` — wires `agent_main` into the kernel so the zkVM guest can call it
:::

:::tip Key concept — The `agent_input!` macro
The `agent_input!` macro replaces 30–100 lines of manual byte parsing with a struct declaration. You declare fields with types like `[u8; 20]` (address), `u64`, `u32`, and the macro generates a fixed-size parser:

```rust
kernel_sdk::agent_input! {
    struct YieldInput {
        vault_address: [u8; 20],
        mock_yield_address: [u8; 20],
        transfer_amount: u64,
    }
}
// YieldInput::ENCODED_SIZE == 48 bytes
// YieldInput::decode(&[u8]) -> Option<YieldInput>
```

The host (off-chain) encodes inputs as raw bytes in the same format. The agent never makes network calls — it only sees the bytes the host provided, committed via `input_commitment` in the proof.

See [`agent_input!` Macro](/sdk/agent-input-macro) for the full reference.
:::

---

## Step 3: Test

```bash
tal test --local
```

**What it does:** Compiles your agent as a native binary (not for the zkVM) and runs the Rust unit tests in `agent/src/lib.rs`. Results appear in 2–5 seconds.

:::info Under the hood
`tal test --local` runs `cargo test` on the `agent` crate with the default (native) target. This means:

- Your agent compiles to your machine's architecture (x86_64 or ARM), not RISC-V
- No zkVM is involved — the tests run natively
- The `agent_entrypoint!` macro generates test-compatible wrappers alongside the kernel wrappers
- `#[cfg(test)]` blocks in your code are included

This is the fast feedback loop. Use it during development. Only compile to the zkVM target (`tal build --elf`) when you're ready to deploy.

Other test modes:
- `tal test --dry-run` — runs with live market data but doesn't generate proofs or submit transactions
- `tal test --prove` — generates a real ZK proof (8–10 minutes), verifying end-to-end correctness
- `tal test --local --determinism-check` — runs the agent twice with identical inputs and verifies byte-identical output
:::

:::tip Key concept — Deterministic execution
Agents must be deterministic: same inputs → same outputs, every time. This is required because the prover and verifier must agree on the execution result.

Common sources of non-determinism that will cause proof failures:
- **`HashMap`/`HashSet`** — iteration order is randomized
- **Floating-point math** — rounding can vary across platforms
- **`std::time`** — time-dependent logic produces different results on re-execution
- **`rand`** — randomness is not available inside the zkVM

If `tal test --local --determinism-check` fails, you have non-deterministic code. The test output will show which output bytes differ between the two runs.
:::

---

## Step 4: Build

```bash
tal build --elf
```

**What it does:** Compiles your agent into a RISC-V binary (ELF format) that runs inside the RISC Zero zkVM. Produces two identifiers: `IMAGE_ID` and `AGENT_CODE_HASH`.

:::info Under the hood
`tal build --elf` performs these steps:

1. **Compiles the agent crate** to `riscv32im-risc0-zkvm-elf` target using the RISC Zero toolchain's custom `rustc`. This produces an ELF binary at `target/riscv-guest/.../zkvm-guest.bin`.

2. **Runs `build.rs`** which computes:
   ```
   AGENT_CODE_HASH = SHA-256(src/lib.rs || 0x00 || Cargo.toml)
   ```
   This hash is embedded as a constant in the binary. The kernel verifies it at runtime.

3. **Computes `IMAGE_ID`** — RISC Zero hashes the entire ELF binary (using Poseidon internally) to produce a unique 32-byte identifier. This is the fingerprint that gets registered on-chain. If any byte of the binary changes — your code, the kernel, the SDK, or a dependency — the IMAGE_ID changes.

4. **Updates `dist/agent-pack.json`** with both hashes and the ELF binary path.

The first build is slow (8–10 minutes) because it compiles the RISC Zero toolchain. Subsequent builds are faster due to caching. During development, use `tal test --local` and skip this step until deployment.
:::

:::tip Key concept — IMAGE_ID: your agent's fingerprint
The IMAGE_ID is the most important identifier in the system. It uniquely identifies the exact binary that runs inside the zkVM.

```
Agent source → Rust compiler → ELF binary → RISC Zero hash → IMAGE_ID
```

When you register an agent on-chain, you store this IMAGE_ID. When you deploy a vault, the vault pins this IMAGE_ID immutably. The on-chain verifier checks that the proof was generated by a program with the registered IMAGE_ID.

This creates a cryptographic chain from your source code to on-chain execution — no one can substitute a different program without changing the IMAGE_ID, and no vault will accept a proof from a different IMAGE_ID than the one it was deployed with.

See [Cryptographic Chain](/architecture/cryptographic-chain) for the full hash chain diagram.
:::

---

## Step 5: Deploy

```bash
cp .env.example .env
# Edit .env with your private key
tal deploy --testnet
```

**What it does:** Registers your agent on-chain and deploys a vault that will only accept proofs from your agent.

:::info Under the hood
`tal deploy --testnet` performs two on-chain transactions:

**Transaction 1 — Register the agent:**
```
AgentRegistry.register(salt, imageId, agentCodeHash) → agentId
```
- `salt` — a user-chosen value (from `.env`), used to compute a deterministic agent ID
- `agentId = keccak256(abi.encodePacked(msg.sender, salt))` — your agent's permanent on-chain identity
- The registry stores `imageId` and `agentCodeHash` for lookup

**Transaction 2 — Deploy the vault:**
```
VaultFactory.deployVault(agentId, asset, userSalt, expectedImageId) → vault address
```
- Uses CREATE2 for deterministic addresses (same inputs → same vault address on any chain)
- Deploys a `KernelVault` contract — an ERC4626-compatible shares vault
- **Pins `trustedImageId` immutably** — this vault will only accept proofs from this exact IMAGE_ID

The vault is non-upgradeable. If you change your agent code and rebuild (producing a new IMAGE_ID), you deploy a new vault. The old vault continues operating with the old agent. This is the trust guarantee: depositors know the code managing their funds cannot change.
:::

:::tip Key concept — Immutable vault binding
Once deployed, a vault's `trustedImageId` cannot be changed. This is a deliberate design choice:

- **For depositors:** "The code managing my funds is the code I approved. It cannot be swapped."
- **For builders:** "I deploy a new vault for each agent version. Depositors migrate when they're ready."
- **For auditors:** "One IMAGE_ID = one binary = one audit scope."

Registry updates (new agent versions) don't affect existing vaults. Each vault is a self-contained, immutable contract bound to a specific agent binary.
:::

---

## Step 6: Monitor

```bash
tal monitor --vault <VAULT_ADDRESS> --chain 998
```

**What it does:** Opens a live terminal dashboard showing your vault's state: total assets, total shares, execution nonce, and recent proof history.

:::info Under the hood
`tal monitor` polls the vault contract on the specified chain every 30 seconds (configurable with `--interval`). It reads:

- **`totalAssets()`** — the vault's total balance in the underlying asset
- **`totalShares()`** — total shares issued to depositors
- **`executionNonce()`** — how many verified executions have occurred
- **`getPerformanceMetrics()`** — price-per-share history, drawdown, win rate
- **`trustedImageId()`** — the pinned agent binary fingerprint

You can also use `--json` for machine-readable output (one JSON object per line), useful for piping to monitoring tools or dashboards.
:::

:::tip Key concept — Execution nonce
The `executionNonce` is a monotonic counter that increments with each verified execution. It serves two purposes:

1. **Replay prevention** — each nonce can only be used once. Submitting a proof with a used nonce reverts.
2. **Ordering** — nonces must increase, but gaps are allowed (up to `MAX_NONCE_GAP = 100`). This means executions can be submitted out of order within a window, accommodating network delays.

A freshly deployed vault starts at nonce 0. When you see the nonce increment in the monitor, it means a proof was verified and actions were executed on-chain.
:::

---

## What's next

You now understand what each quickstart step does technically. To go deeper:

| Goal | Guide |
|------|-------|
| Build a custom agent from scratch | [Build a DeFi Rebalancer](/getting-started/build-a-rebalancer) |
| Understand the full hash chain | [Cryptographic Chain](/architecture/cryptographic-chain) |
| Learn the trust model | [Trust Model](/architecture/trust-model) |
| See all SDK features | [SDK Overview](/sdk/overview) |
