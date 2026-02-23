# Perp-Trader Agent

Verifiable perpetual futures trading agent for Hyperliquid, built on the Execution Kernel zkVM framework. Implements dual strategy modes (SMA crossover + funding rate arbitrage) with configurable risk parameters. All trading decisions are deterministic and provable via RISC Zero zero-knowledge proofs.

## Overview

The perp-trader is a self-contained agent package with four components:

```
perp-trader/
├── agent/          # Core trading logic (no_std, runs inside zkVM)
├── host/           # CLI orchestrator (fetch → build → prove → submit)
├── risc0-methods/  # zkVM guest binding (compiles agent as ELF)
└── bundle/         # Agent pack manifest (ELF + metadata for deployment)
```

**Pipeline (8 stages):**

1. Load agent bundle (ELF + metadata)
2. Read vault state from on-chain (nonce, agent ID)
3. Fetch market data from Hyperliquid API (prices, position, funding)
4. Compute indicators (SMA fast/slow, RSI, previous values)
5. Build `KernelInputV1` (snapshot + oracle feed + PerpInput)
6. Generate ZK proof (RISC Zero prover)
7. Reconstruct output and verify action commitment
8. Submit proof + actions on-chain via `KernelVault.executeWithOracle()`

## Chain Architecture

Hyperliquid is its own L1 chain with two layers:

- **HyperCore** — The off-chain order book engine (accessed via REST API at `api.hyperliquid.xyz`)
- **HyperEVM** — An EVM-compatible execution layer (Chain ID **999** mainnet, **998** testnet)

The perp-trader agent's CALL actions target the `HyperliquidAdapter` contract, which uses HyperEVM system contracts (`CoreWriter` at `0x3333...3333`, `CoreDepositWallet`) to route orders to HyperCore. Therefore:

- **KernelVault** must be deployed on **HyperEVM** (same chain as the adapter)
- **KernelExecutionVerifier** + **RiscZeroVerifierRouter** must also be on HyperEVM
- **USDC** is the native USDC on HyperEVM (bridged from Arbitrum via the Hyperliquid bridge at `0x2df1c51e09aecf9cacb7bc98cb1742757f163df7` on Arbitrum One)
- The **Hyperliquid REST API** is separate from HyperEVM RPC — it runs on Hyperliquid's own infra

```
Host CLI                          HyperEVM (Chain ID 999/998)
┌──────────────┐                  ┌────────────────────────────────┐
│ 1. Fetch API │─── REST ───────▶ │ Hyperliquid API                │
│ 2. Build     │                  │ (api.hyperliquid.xyz)          │
│ 3. Prove     │                  └────────────────────────────────┘
│ 4. Submit    │─── RPC ────────▶ ┌────────────────────────────────┐
└──────────────┘                  │ KernelVault                    │
                                  │   ├─ executeWithOracle()       │
                                  │   └─ CALL → HyperliquidAdapter │
                                  │         └─ CoreWriter (0x3333) │
                                  │         └─ CoreDepositWallet   │
                                  └────────────────────────────────┘
```

## Prerequisites

- **Rust 1.75+** with `cargo`
- **Foundry** (`forge`, `cast`) for contract deployment
- **RISC Zero toolchain** for proof generation:
  ```bash
  cargo install cargo-risczero
  cargo risczero install
  ```
- **Hyperliquid account** with a sub-account address (testnet or mainnet)
- **HYPE tokens** on HyperEVM for gas fees
- **USDC on HyperEVM** for vault deposits (bridge from Arbitrum if needed)
- **Two private keys**: executor (vault owner) and oracle signer

## Environment Setup

Create a `.env` file in the execution-kernel root:

```bash
# Executor wallet (vault owner, signs transactions)
PRIVATE_KEY=0x...

# Oracle signer (signs price feeds, verified on-chain)
ORACLE_KEY=0x...

# HyperEVM RPC endpoint
# Testnet: https://rpc.hyperliquid-testnet.xyz/evm
# Mainnet: https://rpc.hyperliquid.xyz/evm
RPC_URL=https://rpc.hyperliquid-testnet.xyz/evm

# Deployed vault address (set after deployment)
VAULT_ADDRESS=0x...

# Hyperliquid sub-account address (the TradingSubAccount's HyperCore identity)
SUB_ACCOUNT=0x...

# HyperliquidAdapter contract address (singleton on HyperEVM)
EXCHANGE_CONTRACT=0x...

# USDC token address on HyperEVM
USDC_ADDRESS=0x...

# Execution Kernel contracts (must be deployed on HyperEVM)
# These are NOT the Ethereum Sepolia addresses from the EK docs.
# Deploy fresh instances on HyperEVM using the EK deployment scripts.
KERNEL_EXECUTION_VERIFIER=0x...
AGENT_REGISTRY=0x...
VAULT_FACTORY=0x...
```

### Bridging USDC to HyperEVM

To get USDC onto HyperEVM for vault deposits:

1. Hold native USDC on **Arbitrum One** (`0xaf88d065e77c8cC2239327C5EDb3A432268e5831`)
2. Send USDC to the Hyperliquid bridge: `0x2df1c51e09aecf9cacb7bc98cb1742757f163df7` on Arbitrum
3. Funds arrive on Hyperliquid within ~1 minute (minimum 5 USDC)
4. Transfer from HyperCore to HyperEVM via the Hyperliquid UI or API

## Building the Agent Bundle

The agent must be compiled as a RISC Zero guest ELF before proofs can be generated.

```bash
# Build with Docker for deterministic output (recommended)
cd crates/agents/perp-trader/risc0-methods
RISC0_USE_DOCKER=1 cargo build --release

# Or build with local toolchain (faster, non-reproducible)
cargo build --release
```

After building:

1. Copy the ELF: `cp target/riscv-guest/riscv32im-risc0-zkvm-elf/release/zkvm-guest bundle/guest.elf`
2. Update `bundle/agent-pack.json` with the `image_id` from build output
3. Update `agent_id` (SHA-256 of the agent code, printed during agent crate build)

## Testing Layers

### Layer 1: Offline Unit Tests (no network)

Tests the agent's trading logic in isolation. No network, no Hyperliquid, no blockchain.

```bash
# Run agent logic tests (37 tests)
cargo test -p perp-trader

# Run host unit tests (13 tests)
cargo test -p perp-trader-host

# Run both
cargo test -p perp-trader -p perp-trader-host
```

**What's tested:**
- Entry signals (SMA crossover, funding rate arb)
- Exit conditions (stop loss, take profit, funding reversal, trend reversal)
- Risk checks (drawdown circuit breaker, liquidation proximity, cooldown)
- Position sizing (caps to available balance)
- Force flags (force close, force flat)
- Oracle verification (commitment, staleness)
- Determinism (same input always produces same output)

### Layer 2: Hyperliquid Integration (network, no proving)

Tests the market data fetching and indicator computation against the live Hyperliquid testnet API. These tests are `#[ignore]` by default.

```bash
# Run integration tests (requires network access)
cargo test -p perp-trader-host -- --ignored
```

**What's tested:**
- Snapshot fetching (prices, position state, funding rates)
- Candle history retrieval
- Indicator computation on real data
- Input encoding round-trip

### Layer 3: Dry-Run Pipeline (network + dev-mode proving)

Runs the full 8-stage pipeline but skips on-chain submission. Uses RISC Zero dev-mode for fast (non-verifiable) proof generation.

```bash
source .env

cargo run -p perp-trader-host --features full -- \
  --vault $VAULT_ADDRESS \
  --rpc $RPC_URL \
  --pk env:PRIVATE_KEY \
  --oracle-key env:ORACLE_KEY \
  --bundle ./crates/agents/perp-trader/bundle \
  --hl-url https://api.hyperliquid-testnet.xyz \
  --sub-account $SUB_ACCOUNT \
  --exchange-contract $EXCHANGE_CONTRACT \
  --usdc-address $USDC_ADDRESS \
  --dev-mode \
  --dry-run \
  --json
```

**What's validated:**
- End-to-end input construction
- Oracle feed signing and commitment
- ZK proof generation (dev-mode)
- Output reconstruction and action commitment matching
- Journal parsing

### Layer 4: On-Chain E2E (full pipeline on HyperEVM)

Full pipeline with real proof generation and on-chain submission to HyperEVM.

```bash
source .env

cargo run -p perp-trader-host --features full -- \
  --vault $VAULT_ADDRESS \
  --rpc $RPC_URL \
  --pk env:PRIVATE_KEY \
  --oracle-key env:ORACLE_KEY \
  --bundle ./crates/agents/perp-trader/bundle \
  --hl-url https://api.hyperliquid-testnet.xyz \
  --sub-account $SUB_ACCOUNT \
  --exchange-contract $EXCHANGE_CONTRACT \
  --usdc-address $USDC_ADDRESS \
  --json
```

For mainnet, replace the Hyperliquid API URL:
```bash
  --hl-url https://api.hyperliquid.xyz
```

**What's validated:**
- Everything from Layer 3, plus:
- Real RISC Zero proof generation (STARK -> SNARK)
- On-chain proof verification via `KernelExecutionVerifier`
- Action execution through `KernelVault.executeWithOracle()`
- Oracle signature verification on-chain via `ecrecover`
- Nonce sequencing and replay protection
- HyperliquidAdapter routing to CoreWriter on HyperEVM

## Deploying a Test Vault

Before deploying the vault, ensure the EK infrastructure contracts are deployed on HyperEVM:
1. `RiscZeroVerifierRouter` — RISC Zero proof verification
2. `KernelExecutionVerifier` — journal parsing + proof routing
3. `AgentRegistry` + `VaultFactory` — optional, vault can be deployed standalone

```bash
cd contracts
source ../.env

# Set deployment parameters
export USDC_ADDRESS=0x...            # USDC on HyperEVM
export AGENT_ID=0x...                # From agent build output
export TRUSTED_IMAGE_ID=0x...        # From risc0-methods build output
export ORACLE_SIGNER=0x...           # Address derived from ORACLE_KEY
export ORACLE_MAX_AGE=120            # 2 minutes

# Deploy to HyperEVM (testnet)
forge script script/DeployPerpTraderVault.s.sol \
  --rpc-url https://rpc.hyperliquid-testnet.xyz/evm \
  --broadcast

# Deposit USDC into the vault
cast send $USDC_ADDRESS "approve(address,uint256)" $VAULT_ADDRESS 1000000000 \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY

cast send $VAULT_ADDRESS "deposit(uint256)" 1000000000 \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```

## Command Reference

| Flag | Env Var | Default | Description |
|------|---------|---------|-------------|
| `--vault` | `VAULT_ADDRESS` | *required* | KernelVault contract address (on HyperEVM) |
| `--rpc` | `RPC_URL` | *required* | HyperEVM RPC endpoint |
| `--pk` | `PRIVATE_KEY` | *required* | Executor private key (hex or `env:VAR`) |
| `--oracle-key` | `ORACLE_KEY` | *required* | Oracle signer private key (hex or `env:VAR`) |
| `--bundle` | — | *required* | Path to agent bundle directory |
| `--asset` | — | `BTC` | Hyperliquid asset symbol |
| `--hl-url` | — | `https://api.hyperliquid-testnet.xyz` | Hyperliquid REST API base URL |
| `--sub-account` | `SUB_ACCOUNT` | *required* | TradingSubAccount address on HyperEVM |
| `--exchange-contract` | `EXCHANGE_CONTRACT` | *required* | HyperliquidAdapter address (on HyperEVM) |
| `--usdc-address` | `USDC_ADDRESS` | *required* | USDC token address (on HyperEVM) |
| `--sma-fast` | — | `7` | Fast SMA period (candles) |
| `--sma-slow` | — | `25` | Slow SMA period (candles) |
| `--rsi-period` | — | `14` | RSI period (candles) |
| `--strategy-mode` | — | `0` | Strategy: 0=SMA crossover, 1=Funding arb |
| `--action-flag` | — | `0` | Action: 0=evaluate, 1=force close, 2=force flat |
| `--max-drawdown-bps` | — | `0` | Max drawdown bps (0=agent default 500) |
| `--stop-loss-bps` | — | `200` | Stop loss in basis points |
| `--take-profit-bps` | — | `400` | Take profit in basis points |
| `--dev-mode` | — | `false` | Use dev-mode proving (fast, not verifiable) |
| `--dry-run` | — | `false` | Skip on-chain submission |
| `--json` | — | `false` | Output results as JSON |

## Troubleshooting

**`Stale oracle feed`** — The oracle feed timestamp is more than 120 seconds behind the snapshot timestamp. The host must sign a fresh feed close to execution time. Check clock synchronization between the host machine and the Hyperliquid API.

**`InvalidNonce`** — The execution nonce must be strictly greater than `lastExecutionNonce` on the vault, and the gap must not exceed 100. Run `cast call $VAULT_ADDRESS "lastExecutionNonce()" --rpc-url $RPC_URL` to check the current nonce.

**`AgentIdMismatch`** — The `agent_id` in `agent-pack.json` doesn't match the vault's `agentId`. Verify with `cast call $VAULT_ADDRESS "agentId()" --rpc-url $RPC_URL` and compare against the bundle manifest.

**`Failed to read ELF`** — The bundle directory is missing `guest.elf`. Build the risc0-methods crate first and copy the ELF to the bundle directory. See [Building the Agent Bundle](#building-the-agent-bundle).

**`SignerMismatch`** — The oracle key used by the host doesn't match the vault's configured `oracleSigner`. Verify with `cast call $VAULT_ADDRESS "oracleSigner()" --rpc-url $RPC_URL`. Reconfigure with `cast send $VAULT_ADDRESS "setOracleSigner(address,uint64)" $ORACLE_SIGNER 120 --rpc-url $RPC_URL --private-key $PRIVATE_KEY`.

**`ActionCommitmentMismatch`** — The host's reconstructed action commitment diverged from what the ZK proof committed. This indicates a determinism bug in output reconstruction. Ensure the host uses the exact same action encoding as the agent (little-endian, length-prefixed). Run with `--json` to inspect the committed vs reconstructed hashes.

**`RPC rate limit`** — The public HyperEVM RPC (`rpc.hyperliquid.xyz/evm`) is rate-limited to 100 requests/minute/IP. For production use, consider third-party providers (Alchemy, dRPC, QuickNode, Chainstack) that offer higher limits.
