---
title: CLI Reference
sidebar_position: 7
---

# `tal` CLI Reference

The `tal` CLI is the unified developer tool for the Execution Kernel. It covers the full agent lifecycle: scaffolding, validation, testing, building, deployment, and monitoring.

## Installation

Install from prebuilt binaries (no Rust toolchain required):

```bash
curl -sSL https://raw.githubusercontent.com/tokamak-network/Tokamak-AI-Layer/master/install-tal.sh | sh
```

Or from [crates.io](https://crates.io/crates/tal-cli) (requires Rust):

```bash
cargo install tal-cli
```

Or from source (inside a cloned repo):

```bash
cargo install --path crates/tal-cli
```

After installation, all commands are available as `tal <subcommand>`.

:::tip
The older `cargo agent` CLI (`cargo install --path crates/tools/cargo-agent`) is still available for basic operations. `tal` is the recommended tool — it includes all `cargo agent` functionality plus deployment, monitoring, and diagnostics.
:::

## `tal init`

Scaffold a new agent project.

```
tal init <NAME> [OPTIONS]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--template <TYPE>` | interactive | Template: `minimal`, `yield` (or `yield-farmer`), `perp-trader` (or `perp`, `trading`) |
| `--output <PATH>` | `crates/agents/<NAME>` | Output directory |
| `--no-interactive` | false | Skip interactive prompts |

### Templates

| Template | Description | Generates |
|----------|-------------|-----------|
| `minimal` | Bare agent returning NO_OP | agent/ + risc0-methods/ |
| `yield` | DeFi yield farming pattern | agent/ + risc0-methods/ |
| `perp-trader` | Perpetual trading with Hyperliquid | agent/ + risc0-methods/ + **host/** |

### Examples

```bash
# Interactive — prompts for template selection
tal init my-agent

# Yield farming agent
tal init my-yield-agent --template yield

# Perpetual trading agent (includes host orchestrator)
tal init my-trader --template perp-trader
```

### Generated Structure

```
crates/agents/my-agent/
├── agent/
│   ├── Cargo.toml           # Dependencies: kernel-sdk, kernel-core
│   ├── build.rs             # AGENT_CODE_HASH computation
│   └── src/lib.rs           # agent_main() — your logic
├── risc0-methods/
│   ├── Cargo.toml           # risc0-build integration
│   ├── build.rs             # embed_methods()
│   ├── src/lib.rs            # IMAGE_ID placeholder
│   └── zkvm-guest/
│       ├── Cargo.toml
│       └── src/main.rs      # Calls kernel_guest::kernel_main_with_agent
├── host/                     # (perp-trader only)
│   ├── Cargo.toml
│   └── src/main.rs          # Data fetching + orchestration stubs
├── .env.example              # Testnet defaults (chain 998)
├── README.md
└── dist/
    └── agent-pack.json      # Agent manifest with placeholder hashes
```

After scaffolding, add the new crates to your workspace `Cargo.toml`:

```toml
[workspace]
members = [
    # ...existing members...
    "crates/agents/my-agent/agent",
    "crates/agents/my-agent/risc0-methods",
]
```

---

## `tal doctor`

Pre-flight configuration validator. Checks toolchain, build state, and configuration.

```
tal doctor [OPTIONS]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--install` | false | Auto-install missing toolchains |
| `--chain <ID>` | auto | Chain ID for chain-specific checks |
| `--path <PATH>` | `.` | Agent project directory |

### What It Checks

**Toolchain:**
- Rust (`rustc --version`)
- RISC Zero (detects `r0vm`, `rzup`, or `cargo risczero`)
- Foundry (`forge --version`)
- Node.js (`node --version`)

**Build State:**
- Agent crate exists (`agent/src/lib.rs` + `agent/Cargo.toml`)
- ELF binary staleness (compares source hash vs ELF mtime)
- Workspace membership (agent in workspace Cargo.toml)

**Configuration:**
- `.env` file exists
- Required variables: `RPC_URL`, `PRIVATE_KEY`, `VAULT_ADDRESS`

### Example Output

```
tal doctor

✓ Rust toolchain (1.88.0)
✓ RISC Zero toolchain (r0vm)
✓ Foundry (forge 0.3.1)
✓ Node.js (v20.11.0)
✓ Agent crate found
✗ ELF is stale — source changed since last build
  → Run: tal build --elf
✓ .env file found
✗ VAULT_ADDRESS not set
  → Add VAULT_ADDRESS to .env

5 passed, 2 failed
```

### Auto-Install

```bash
# Install missing toolchains automatically
tal doctor --install
```

Installs Rust (via rustup), RISC Zero (via rzup), and Foundry (via foundryup) as needed.

---

## `tal test`

Test agent logic at multiple levels.

```
tal test [OPTIONS]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--local` | *(default)* | Run `cargo test` natively (instant, no zkVM) |
| `--dry-run` | | Run host with live data, no proof or submission |
| `--prove` | | Full ZK proof generation (~8-10 min) |
| `--determinism-check` | false | Run twice and verify consistent output |
| `--input <PATH>` | | Test with a JSON fixture file |
| `--generate-fixture` | | Show how to capture live data to a fixture |
| `--agent <NAME>` | auto-detect | Agent name (inferred from current directory) |

### Test Modes

```bash
# Default: run unit tests natively (2-5 seconds)
tal test --local

# With live market data, no proof
tal test --dry-run

# Full ZK proof generation
tal test --prove

# Verify determinism (runs twice, compares output)
tal test --local --determinism-check

# Test with a saved fixture
tal test --local --input fixtures/btc-long.json
```

### Output

```
tal test --local

Running tests for perp-trader-agent...
  ✓ test_bullish_sma_crossover_long_entry
  ✓ test_oracle_price_overrides_perp_mark_price
  ✓ test_stale_oracle_feed_returns_empty
  ✓ test_force_close_emits_single_action

4 passed, 0 failed
```

---

## `tal build`

Compile agent crate and optionally build the zkVM ELF binary.

```
tal build [OPTIONS]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--elf` | false | Also build the zkVM guest ELF binary |
| `--agent <NAME>` | auto-detect | Agent name |

### Examples

```bash
# Build agent crate only (fast)
tal build

# Build agent + zkVM ELF (required before deploy)
tal build --elf
```

When `--elf` is specified, `tal build`:

1. Cleans stale riscv-guest target (`rm -rf target/riscv-guest/{agent}-risc0-methods`)
2. Builds via `cargo build -p {agent}-risc0-methods --release`
3. Warns about using the `.bin` file (not raw ELF) for bundling

---

## `tal deploy`

End-to-end on-chain deployment via alloy.

```
tal deploy [OPTIONS]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--testnet` | false | Deploy to testnet (chain 998) instead of mainnet (999) |
| `--step <STEP>` | all | Run a single step: `register`, `vault`, `adapter`, `fund` |
| `--agent <NAME>` | auto-detect | Agent name |
| `--config <PATH>` | `.env` | Path to .env file |

### Full Pipeline

```bash
# Deploy everything to testnet
tal deploy --testnet

# Deploy to mainnet
tal deploy
```

Steps: preflight → register agent → deploy vault → adapter setup → summary.

Each step has skip-if-exists logic. Vault imageId mismatch is detected automatically — deploys a new vault with incremented salt.

See the [Deployment Guide](/sdk/deploy-guide) for full details.

---

## `tal monitor`

Live execution dashboard for deployed vaults.

```
tal monitor [OPTIONS]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--vault <ADDRESS>` | Required | Vault address to monitor |
| `--interval <SECONDS>` | `30` | Poll frequency |
| `--chain <ID>` | `999` | Chain ID |
| `--json` | false | Output machine-readable JSON per poll |

### Examples

```bash
# Live colored terminal dashboard
tal monitor --vault 0xae55...

# JSON output for automation/logging
tal monitor --vault 0xae55... --json | jq '.vault.total_assets'

# Faster polling on testnet
tal monitor --vault 0x... --chain 998 --interval 10
```

See the [Monitoring Guide](/sdk/monitoring) for full details.

---

## `cargo agent` (Legacy)

The `cargo agent` CLI is still available for basic operations:

| Command | Equivalent `tal` Command |
|---------|--------------------------|
| `cargo agent new <name>` | `tal init <name>` |
| `cargo agent build <name>` | `tal build --agent <name>` |
| `cargo agent test <name>` | `tal test --agent <name>` |
| `cargo agent pack <name>` | `agent-pack verify` |
| `cargo agent list` | `cargo agent list` |

Install: `cargo install --path crates/tools/cargo-agent`

---

## Typical Workflow

```bash
# 1. Scaffold a new agent
tal init my-agent --template yield

# 2. Add to workspace Cargo.toml, then edit agent logic
$EDITOR crates/agents/my-agent/agent/src/lib.rs

# 3. Test locally (instant feedback)
tal test --local

# 4. Validate environment
tal doctor

# 5. Build agent + ELF
tal build --elf

# 6. Deploy to testnet
tal deploy --testnet

# 7. Monitor
tal monitor --vault 0x...

# 8. Deploy to mainnet
tal deploy
```
