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

## `tal fork`

Fork an existing on-chain agent to create your own version. Fetches agent metadata from the registry, clones the source repository (if available), and scaffolds a new project with a fresh salt.

```bash
tal fork <agent-id>                          # Fork with auto-detected name
tal fork <agent-id> --name my-strategy       # Fork with custom name
tal fork <agent-id> --output ./my-agents/    # Fork to specific directory
```

**How it works:**

1. Queries `AgentRegistry.get(agentId)` to verify the agent exists
2. Queries `AgentRegistry.getMetadataURI(agentId)` for metadata
3. If metadata contains a `sourceRepo` URL, clones it via `git clone --depth 1`
4. If no source repo is available, falls back to `tal init --template minimal`
5. Generates a new deterministic salt and updates the project name
6. Prints next steps (`tal sim`, `tal build`, `tal deploy`)

**Agent metadata JSON schema** (stored at the URI):

```json
{
  "name": "ETH-BTC Momentum",
  "description": "Mean-reversion strategy on ETH/BTC ratio",
  "tags": ["perpetuals", "hyperliquid", "momentum"],
  "sourceRepo": "https://github.com/alice/eth-btc-momentum",
  "version": "1.2.0"
}
```

Agent authors can set their metadata URI on-chain:
```bash
cast send <registry> "setMetadataURI(bytes32,string)" <agentId> "https://..." --private-key $PK
```

---

## `tal metadata set`

Set on-chain metadata for a registered agent. Metadata makes your agent discoverable in the marketplace, leaderboard, and deploy UI.

```
tal metadata set <AGENT_ID> [OPTIONS]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--name <NAME>` | — | Human-readable agent name |
| `--description <DESC>` | — | Short description of the agent strategy |
| `--tags <TAGS>` | — | Comma-separated tags (e.g. `perpetuals,hyperliquid,momentum`) |
| `--source-repo <URL>` | — | Source repository URL (enables `tal fork`) |
| `--version <VER>` | — | Semantic version string |
| `--uri <URI>` | — | Raw metadata URI (IPFS, HTTPS, or Arweave). Overrides individual fields |
| `--chain <ID>` | `999` | Chain ID |

### Examples

```bash
# Set metadata with individual fields
tal metadata set 0x12c3edf... \
  --name "ETH-BTC Momentum" \
  --description "Mean-reversion strategy on ETH/BTC ratio using 4h TWAP" \
  --tags perpetuals,hyperliquid,momentum \
  --source-repo https://github.com/alice/eth-btc-momentum \
  --version 1.2.0

# Set metadata with a raw URI
tal metadata set 0x12c3edf... --uri "ipfs://QmMetadata..."

# Set metadata on Arbitrum
tal metadata set 0x12c3edf... --name "My Agent" --chain 42161
```

---

## `tal metadata show`

Display on-chain metadata for any registered agent.

```
tal metadata show <AGENT_ID> [OPTIONS]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--chain <ID>` | `999` | Chain ID |
| `--json` | false | Output raw JSON metadata |

### Examples

```bash
# View agent metadata
tal metadata show 0x12c3edf...

# JSON output for scripting
tal metadata show 0x12c3edf... --json

# Query on a specific chain
tal metadata show 0x12c3edf... --chain 42161
```

### Example Output

```
Agent Metadata: 0x12c3edf...
  Name:         ETH-BTC Momentum
  Description:  Mean-reversion strategy on ETH/BTC ratio using 4h TWAP
  Tags:         perpetuals, hyperliquid, momentum
  Source Repo:  https://github.com/alice/eth-btc-momentum
  Version:      1.2.0
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

## `tal sim`

Run agent logic and constraint enforcement natively against a JSON fixture — no zkVM compilation required. Reduces iteration time from ~10 minutes to ~5 seconds.

```bash
tal sim <fixture.json>          # Run simulation with fixture
tal sim --list                  # List available fixtures
tal sim                         # Run with default fixtures/sample.json
```

**How it works:**

1. Detects the agent directory (walks up from CWD looking for `agent/src/lib.rs`)
2. Checks for a `src/bin/sim.rs` binary target — auto-generates it if missing
3. Runs `cargo run --bin sim --features simulator -- <fixture>`
4. Prints actions table and constraint pass/fail results
5. Exit code 0 = all constraints pass, 1 = any fail (CI-friendly)

**Fixture format (JSON):**

```json
{
  "agent_id": "0x0000...0001",
  "vault_address": "0x1111...1111",
  "equity": 10000000,
  "execution_nonce": 1,
  "opaque_inputs": "0xdeadbeef...",
  "constraints": {
    "max_drawdown_bps": 500,
    "cooldown_seconds": 60
  }
}
```

- `opaque_inputs`: hex string with agent-specific input data
- `opaque_inputs_file`: alternative — path to a binary file
- `constraints`: optional overrides (defaults are permissive)

**Example output:**

```
--- Simulation Result -------------------------------------------

  Agent:   0x00000000...0001
  Nonce:   1
  Equity:  10.000000 USDC

  Actions (2):
  #   Type           Target         Details
  --- -------------- -------------- ------------------------------
  1   CALL           0x2222..2222   selector=0x00000000 calldata=0B
  2   CALL           0x2222..2222   selector=0x51cff8d9 calldata=32B

  Constraints:
    [+] Max actions     2 / 64
    [+] Drawdown        (disabled)
    [+] Cooldown        OK (no cooldown)
    [+] Leverage        (reserved)

  Result: PASS
```

New agents scaffolded with `tal init` include a `fixtures/sample.json` and `src/bin/sim.rs` automatically.

---

## `tal deploy`

End-to-end on-chain deployment via alloy. Supports three deployment modes: standard vaults, optimistic vaults (with WSTON bonds), and Hyperliquid perp trading (full adapter stack).

```
tal deploy [OPTIONS]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--testnet` | false | Deploy to testnet (chain 998) instead of mainnet (999) |
| `--hyperliquid` | false | Deploy full Hyperliquid stack (adapter + sub-account + HYPE funding) |
| `--optimistic` | false | Deploy OptimisticKernelVault instead of regular KernelVault |
| `--min-bond <AMOUNT>` | — | Minimum bond amount in wei for optimistic vaults (e.g. `1000000000000000000000000000` for 1e27 WSTON) |
| `--step <STEP>` | all | Run a single step: `register`, `vault`, `adapter`, `fund` |
| `--agent <NAME>` | auto-detect | Agent name |
| `--config <PATH>` | `.env` | Path to .env file |

### Deployment Modes

```bash
# Standard vault (simplest)
tal deploy --testnet

# Optimistic vault (WSTON-bonded, deferred proofs)
tal deploy --testnet --optimistic --min-bond 1000000000000000000000000000

# Hyperliquid perp trading (full stack: vault + adapter + sub-account)
tal deploy --testnet --hyperliquid

# Hyperliquid + optimistic (production perp trading)
tal deploy --testnet --hyperliquid --optimistic --min-bond 1000000000000000000000000000
```

### What Each Mode Does

**Standard** (`tal deploy`):
1. Register agent on AgentRegistry
2. Deploy KernelVault via VaultFactory

**`--optimistic`** adds:
3. Set oracle signer (`ORACLE_SIGNER` env var)
4. Set minimum bond (`--min-bond` or `MIN_BOND` env var)
5. Enable optimistic execution

**`--hyperliquid`** adds:
3. Set vault protocol type to Hyperliquid (1) on VaultFactory
4. Register vault on HyperliquidAdapter (`ADAPTER_ADDRESS` env var)
5. Fund sub-account with HYPE for CoreWriter gas
6. Register API wallet (`API_WALLET_ADDRESS` env var, optional)

### Environment Variables

| Variable | Used by | Description |
|----------|---------|-------------|
| `ADAPTER_ADDRESS` | `--hyperliquid` | Deployed HyperliquidAdapter address |
| `PERP_ASSET` | `--hyperliquid` | Asset index (0=BTC, 1=ETH, 3=SOL, default: 0) |
| `SZ_DECIMALS` | `--hyperliquid` | Size decimals (BTC=5, ETH=4, SOL=2, default: 5) |
| `HYPE_FUND_AMOUNT` | `--hyperliquid` | HYPE to fund sub-account (default: 0.01) |
| `API_WALLET_ADDRESS` | `--hyperliquid` | API wallet to register (optional) |
| `ORACLE_SIGNER` | `--optimistic` | Oracle signer address (required to enable optimistic) |
| `ORACLE_MAX_AGE` | `--optimistic` | Max oracle data age in seconds (default: 900) |
| `MIN_BOND` | `--optimistic` | Min bond amount in wei (alternative to `--min-bond` flag) |
| `BOND_CHAIN_ID` | `--optimistic` | L1 chain ID for bonds (default: 1) |
| `CHALLENGE_WINDOW` | `--optimistic` | Challenge period in seconds (default: 3600) |

### Step-by-Step Execution

Run individual steps with `--step`:

```bash
tal deploy --step register              # Only register agent
tal deploy --step vault                 # Only deploy vault
tal deploy --hyperliquid --step adapter # Only register vault on adapter
tal deploy --hyperliquid --step fund    # Only fund HYPE + API wallet
```

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

## Typical Workflows

### Yield / Generic Agent

```bash
tal init my-agent --template yield
tal test --local
tal build --elf
tal deploy --testnet
tal monitor --vault 0x...
```

### Perp-Trader (Hyperliquid)

```bash
tal init my-trader --template perp-trader
tal test --local
tal build --elf
tal deploy --testnet --hyperliquid
tal monitor --vault 0x...
./run-bot.sh
```

### Optimistic Perp-Trader (Production)

```bash
tal init my-trader --template perp-trader
tal build --elf
tal deploy --testnet --hyperliquid --optimistic --min-bond 1000000000000000000000000000
tal monitor --vault 0x...
./run-bot.sh
```
