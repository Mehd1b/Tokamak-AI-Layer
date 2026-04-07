---
title: CLI Reference
sidebar_position: 7
---

# `tal` CLI Reference

The `tal` CLI is the unified developer tool for the Execution Kernel. It covers the full agent lifecycle: scaffolding, testing, building, deployment, and monitoring.

## Installation

Install from prebuilt binaries (no Rust toolchain required):

```bash
curl -sSL https://raw.githubusercontent.com/tokamak-network/Tokamak-AI-Layer/master/install-tal.sh | sh
```

Or from [crates.io](https://crates.io/crates/tal-cli) (requires Rust):

```bash
cargo install tal-cli
```

After installation, all commands are available as `tal <subcommand>`.

---

## `tal init`

Scaffold a new agent project.

```bash
tal init <NAME> [OPTIONS]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--template <TYPE>` | interactive | `minimal`, `yield`, `perp-trader`, or `polymarket-bot` |
| `--output <PATH>` | auto | Output directory |
| `--no-interactive` | false | Skip prompts |

### Examples

```bash
# Interactive -- prompts for template
tal init my-agent

# Yield farming agent
tal init my-yield-agent --template yield

# Perpetual trading agent with Hyperliquid support
tal init my-trader --template perp-trader

# Prediction market agent for Polymarket
tal init my-predictor --template polymarket-bot
```

### What it generates

```
my-agent/
  agent/
    Cargo.toml
    build.rs            # AGENT_CODE_HASH computation
    src/lib.rs           # agent_main() -- your logic
  risc0-methods/         # zkVM guest binary setup
  fixtures/
    sample.json          # Example simulation fixture
  dist/
    agent-pack.json      # Agent manifest
  .env.example           # Testnet defaults
```

---

## `tal fork`

Fork an existing on-chain agent to create your own version.

```bash
tal fork <AGENT_ID>                         # Fork with auto-detected name
tal fork <AGENT_ID> --name my-strategy      # Fork with custom name
tal fork <AGENT_ID> --output ./my-agents/   # Fork to specific directory
```

Fetches agent metadata from the registry, clones the source repository if available, and scaffolds a new project with a fresh salt.

---

## `tal doctor`

Pre-flight configuration validator. Checks your toolchain, build state, and environment.

```bash
tal doctor              # Check everything
tal doctor --install    # Auto-install missing toolchains
```

### What it checks

- **Toolchain:** Rust, RISC Zero, Foundry, Node.js
- **Build state:** Agent crate exists, ELF binary is up to date, workspace membership
- **Configuration:** `.env` file exists, required variables set (`RPC_URL`, `PRIVATE_KEY`, `VAULT_ADDRESS`)

### Example output

```
tal doctor

  Rust toolchain (1.88.0)                 OK
  RISC Zero toolchain (r0vm)              OK
  Foundry (forge 0.3.1)                   OK
  Node.js (v20.11.0)                      OK
  Agent crate found                       OK
  ELF is stale -- source changed          FAIL
    -> Run: tal build --elf
  .env file found                         OK
  VAULT_ADDRESS not set                   FAIL
    -> Add VAULT_ADDRESS to .env

5 passed, 2 failed
```

---

## `tal test`

Test agent logic at multiple levels.

```bash
tal test [OPTIONS]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--local` | *(default)* | Run unit tests natively (2--5 seconds) |
| `--dry-run` | | Run with live data, no proof or submission |
| `--prove` | | Full ZK proof generation (~8--10 min) |
| `--determinism-check` | false | Run twice and compare outputs |
| `--input <PATH>` | | Test with a JSON fixture file |
| `--agent <NAME>` | auto-detect | Agent name |

### Examples

```bash
# Unit tests (default, instant)
tal test --local

# Live market data, no proof
tal test --dry-run

# Full ZK proof
tal test --prove

# Verify determinism
tal test --local --determinism-check

# Test with a saved fixture
tal test --local --input fixtures/btc-long.json
```

---

## `tal build`

Compile the agent crate and optionally build the zkVM ELF binary.

```bash
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

---

## `tal sim`

Run agent logic and constraint enforcement natively against a JSON fixture. No zkVM compilation required. Reduces iteration time from minutes to seconds.

```bash
tal sim <FIXTURE>       # Run with specific fixture
tal sim                 # Run with default fixtures/sample.json
tal sim --list          # List available fixtures
```

### Example output

```
--- Simulation Result -------------------------------------------

  Agent:   0x00000000...0001
  Nonce:   1
  Equity:  10.000000 USDC

  Actions (2):
  #   Type           Target         Details
  --- -------------- -------------- --------------
  1   CALL           0x2222..2222   selector=0x617ba037
  2   CALL           0x2222..2222   selector=0x51cff8d9

  Constraints:
    [+] Max actions     2 / 64
    [+] Drawdown        (disabled)
    [+] Cooldown        OK
    [+] Leverage        (reserved)

  Result: PASS
```

Exit code 0 = all constraints pass, 1 = any fail (CI-friendly).

---

## `tal deploy`

End-to-end on-chain deployment. Supports standard vaults, optimistic vaults, and Hyperliquid perp trading.

```bash
tal deploy [OPTIONS]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--testnet` | false | Deploy to testnet (chain 998) |
| `--hyperliquid` | false | Deploy full Hyperliquid stack |
| `--optimistic` | false | Deploy OptimisticKernelVault |
| `--min-bond <AMOUNT>` | -- | Minimum bond in wei for optimistic vaults |
| `--step <STEP>` | all | Run a single step: `register`, `vault`, `adapter`, `fund` |
| `--agent <NAME>` | auto-detect | Agent name |
| `--config <PATH>` | `.env` | Path to .env file |

### Examples

```bash
# Standard vault on testnet
tal deploy --testnet

# Hyperliquid perp trading
tal deploy --testnet --hyperliquid

# Optimistic vault
tal deploy --testnet --optimistic --min-bond 1000000000000000000000000000

# Run only the registration step
tal deploy --step register
```

See the [Deployment Guide](/sdk/deploy-guide) for full details.

---

## `tal metadata set`

Set on-chain metadata for a registered agent. Makes your agent discoverable in the marketplace and leaderboard.

```bash
tal metadata set <AGENT_ID> [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--name <NAME>` | Human-readable agent name |
| `--description <DESC>` | Short description of the strategy |
| `--tags <TAGS>` | Comma-separated tags |
| `--source-repo <URL>` | Source repository URL (enables `tal fork`) |
| `--version <VER>` | Semantic version string |
| `--uri <URI>` | Raw metadata URI (overrides individual fields) |
| `--chain <ID>` | Chain ID (default: 999) |

### Examples

```bash
tal metadata set 0x12c3edf... \
  --name "ETH-BTC Momentum" \
  --description "Mean-reversion on ETH/BTC ratio using 4h TWAP" \
  --tags perpetuals,hyperliquid,momentum \
  --source-repo https://github.com/alice/eth-btc-momentum \
  --version 1.2.0
```

---

## `tal metadata show`

Display on-chain metadata for any registered agent.

```bash
tal metadata show <AGENT_ID> [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--chain <ID>` | Chain ID (default: 999) |
| `--json` | Output raw JSON |

### Examples

```bash
# View metadata
tal metadata show 0x12c3edf...

# JSON output for scripting
tal metadata show 0x12c3edf... --json
```

---

## `tal monitor`

Live execution dashboard for deployed vaults.

```bash
tal monitor [OPTIONS]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--vault <ADDRESS>` | required | Vault address to monitor |
| `--interval <SECONDS>` | `30` | Poll frequency |
| `--chain <ID>` | `999` | Chain ID |
| `--json` | false | Machine-readable JSON output |

### Examples

```bash
# Live terminal dashboard
tal monitor --vault 0xae55...

# JSON output for automation
tal monitor --vault 0xae55... --json | jq '.vault.total_assets'

# Faster polling on testnet
tal monitor --vault 0x... --chain 998 --interval 10
```

See the [Monitoring Guide](/sdk/monitoring) for full details.

---

## Typical Workflows

### Yield / generic agent

```bash
tal init my-agent --template yield
tal test --local
tal build --elf
tal deploy --testnet
tal monitor --vault 0x...
```

### Perp trader (Hyperliquid)

```bash
tal init my-trader --template perp-trader
tal test --local
tal build --elf
tal deploy --testnet --hyperliquid
tal monitor --vault 0x...
```

### Optimistic perp trader (production)

```bash
tal init my-trader --template perp-trader
tal build --elf
tal deploy --testnet --hyperliquid --optimistic --min-bond 1000000000000000000000000000
tal monitor --vault 0x...
```

### Polymarket prediction market bot

```bash
tal init my-predictor --template polymarket-bot
# Edit .env with market condition ID, token IDs, and thresholds
tal test --local
tal build --elf
tal deploy
./run-bot.sh --dry-run --once    # Test without on-chain submission
./run-bot.sh                     # Start the bot
```
