# Perp-Trader Agent Guide

A verifiable perpetual futures trading agent for Hyperliquid, built on the Tokamak Execution Kernel. This guide explains the algorithm, architecture, and how to build your own agent using perp-trader as a template.

## Table of Contents

1. [How It Works (Big Picture)](#1-how-it-works-big-picture)
2. [The Trading Algorithm](#2-the-trading-algorithm)
3. [Project Structure](#3-project-structure)
4. [What You Can Customize](#4-what-you-can-customize)
5. [What You Cannot Change](#5-what-you-cannot-change)
6. [Building & Running](#6-building--running)
7. [Deployment Walkthrough](#7-deployment-walkthrough)
8. [Understanding the Execution Modes](#8-understanding-the-execution-modes)
9. [The Two-Proof Problem](#9-the-two-proof-problem)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. How It Works (Big Picture)

```
                    Off-chain (Host)                          On-chain (HyperEVM)
               ┌─────────────────────┐                  ┌──────────────────────┐
               │                     │                  │                      │
  Market ───>  │  Fetch prices       │                  │   KernelVault        │
  Data         │  Compute indicators │                  │   ├─ verify proof    │
               │  Build input        │                  │   ├─ parse actions   │
               │       │             │                  │   └─ execute trades  │
               │       ▼             │                  │         │            │
               │  Run agent_main()   │                  │         ▼            │
               │  (deterministic)    │                  │   HyperliquidAdapter │
               │       │             │                  │   └─ CoreWriter      │
               │       ▼             │                  │      (limit orders)  │
               │  Generate ZK proof  │ ── proof+actions ──>     │            │
               │  (RISC Zero, ~9min) │                  │         ▼            │
               │                     │                  │   HyperCore          │
               └─────────────────────┘                  │   (order matching)   │
                                                        └──────────────────────┘
```

**The key insight:** The trading logic runs *inside a ZK virtual machine*. This means:
- Every trade decision is cryptographically provable
- No one (not even the operator) can fake a trade signal
- The vault only executes actions that come with a valid proof

The agent itself (`agent/src/lib.rs`) is a pure function: same input always produces the same output. No randomness, no I/O, no network calls. The host handles all the messy real-world stuff (fetching prices, submitting transactions).

---

## 2. The Trading Algorithm

### Strategy Mode 0: SMA Crossover (Default)

A trend-following strategy that enters positions when short-term momentum confirms a direction change.

**Entry signal — ALL three must be true:**

| Confluence | Condition | Why |
|---|---|---|
| SMA Crossover | Fast SMA crosses above slow SMA (bullish) or below (bearish) | Trend direction confirmation |
| RSI Neutral Zone | RSI between 15 and 85 (configurable) | Avoid entering at extremes |
| Funding Rate | Favorable or negligible | Don't fight the market's cost of carry |

**Exit signal — ANY one triggers a close:**

| Trigger | Condition | Default |
|---|---|---|
| Stop Loss | Price moves against entry by `stop_loss_bps` | 200 bps (2%) |
| Take Profit | Price moves in favor by `take_profit_bps` | 400 bps (4%) |
| Trend Reversal | SMA crosses back against position direction | — |
| Funding Reversal | Funding rate flips 3x threshold against position | — |
| Drawdown Breaker | Portfolio drawdown exceeds `max_drawdown_bps` | 500 bps (5%) |
| Liquidation Proximity | Mark price within 3% of liquidation price | — |

### Strategy Mode 1: Funding Rate Arbitrage

A mean-reversion strategy that captures funding payments.

**Entry:** Funding rate exceeds threshold → go opposite direction (positive funding → short, negative → long).
**Exit:** Same as Mode 0, except trend reversal is ignored (funding arb doesn't depend on trend).

### Position Sizing

```
margin = min(equity * max_position_bps / 10000, available_balance)
order_size = margin * leverage * 10^(sz_decimals + 2) / (mark_price * 10000)
```

With defaults (90% equity, 5x leverage, BTC):
- $5 equity → $4.50 margin → ~0.00032 BTC at $70k

### Price Computation

**Open:** Mark price + 5% for buys, - 5% for sells (IOC fills at market, limit just needs to be within oracle band).
**Close:** Mark price - 3% for long close, + 3% for short close. Rounded to $1 tick.

---

## 3. Project Structure

```
crates/agents/perp-trader/
├── agent/                     # The verifiable trading logic
│   ├── src/lib.rs             #   Entry/exit algorithm, position sizing
│   ├── build.rs               #   Computes AGENT_CODE_HASH at build time
│   └── Cargo.toml             #   Dependencies (kernel-sdk, constraints)
│
├── host/                      # The off-chain orchestrator
│   └── src/
│       ├── main.rs            #   Main loop, optimistic execution, monitoring
│       ├── config.rs          #   CLI arguments & configuration
│       ├── input_builder.rs   #   Assembles market data into kernel input
│       ├── indicators.rs      #   SMA and RSI computation
│       ├── oracle_signer.rs   #   Signs price feeds (EIP-191)
│       ├── output_reconstruct.rs  # Runs agent locally to predict output
│       ├── onchain.rs         #   On-chain interactions (vault, adapter, bonds)
│       ├── prove.rs           #   ZK proof generation
│       ├── prove_worker.rs    #   Background proof worker for optimistic mode
│       ├── monitor.rs         #   Position monitoring (TP/SL polling)
│       ├── seed_trade.rs      #   REST API seed trades (leverage=0 workaround)
│       └── hyperliquid/       #   Hyperliquid API client
│
├── risc0-methods/             # Compiles agent → RISC Zero guest ELF
│   └── zkvm-guest/            #   Thin wrapper calling kernel runtime
│
├── bundle/                    # Deployment artifacts
│   ├── guest.elf              #   ZK VM binary (.bin format)
│   └── agent-pack.json        #   Manifest (agent_id, image_id, code_hash)
│
├── scripts/
│   └── hl_seed_trade.py       # Python helper for REST API trades
│
├── run-bot.sh                 # Main entry point for running the bot
└── PERP_TRADER_GUIDE.md       # This file
```

### What lives where

| Concern | File | Runs in |
|---|---|---|
| Trading decisions | `agent/src/lib.rs` | ZK VM (proven) |
| Market data fetching | `host/src/hyperliquid/` | Host (trusted) |
| Indicator computation | `host/src/indicators.rs` | Host (verified via proof) |
| Proof generation | `host/src/prove.rs` | Host |
| On-chain submission | `host/src/onchain.rs` | Host |
| Configuration | `host/src/config.rs` + `run-bot.sh` | Host |

---

## 4. What You Can Customize

### Strategy Parameters (via CLI / run-bot.sh)

These are passed to the agent as input. Change them freely without rebuilding the ELF.

| Parameter | Flag | Default | Description |
|---|---|---|---|
| Asset | `--asset` | BTC | Any Hyperliquid perp (ETH, SOL, etc.) |
| Stop Loss | `--stop-loss-bps` | 200 | Stop loss in basis points (200 = 2%) |
| Take Profit | `--take-profit-bps` | 400 | Take profit in basis points (400 = 4%) |
| SMA Fast Period | `--sma-fast` | 3 | Fast SMA period (number of candles) |
| SMA Slow Period | `--sma-slow` | 8 | Slow SMA period (number of candles) |
| RSI Period | `--rsi-period` | 14 | RSI computation period |
| Strategy Mode | `--strategy-mode` | 0 | 0 = SMA crossover, 1 = Funding arb |
| Max Drawdown | `--max-drawdown-bps` | 500 | Circuit breaker threshold (500 = 5%) |
| Action Flag | `--action-flag` | 0 | 0 = evaluate, 1 = force close, 2 = force flat |
| Leverage | `--seed-leverage` | 5 | Leverage multiplier for HyperCore |
| Max Hold | `--max-hold-secs` | 900 | Auto-close after this many seconds |
| Poll Interval | `--monitor-interval` | 15 | Seconds between retry/poll cycles |
| Min Balance | `--min-balance` | 1000000 | Minimum vault USDC to trade (1e6 units) |

**Example: run with ETH, tighter stops, 10x leverage:**
```bash
ASSET=ETH STOP_LOSS_BPS=100 TAKE_PROFIT_BPS=300 SEED_LEVERAGE=10 \
  ./crates/agents/perp-trader/run-bot.sh
```

### Host-Side Parameters (in `input_builder.rs`)

These are hardcoded in the host but don't require ELF rebuild — only recompile the host binary.

| Parameter | Current Value | What it controls |
|---|---|---|
| `max_leverage_bps` | 50,000 (5x) | Maximum leverage sent to agent |
| `max_position_bps` | 9,000 (90%) | Max equity allocated to a single position |
| `rsi_oversold_bps` | 1,500 (RSI 15) | RSI level considered oversold |
| `rsi_overbought_bps` | 8,500 (RSI 85) | RSI level considered overbought |
| `funding_threshold` | 500 | Funding rate threshold (0.0005%) |
| `drawdown_cooldown_seconds` | 3,600 | Lockout after drawdown close (1 hour) |

### Agent Logic (in `agent/src/lib.rs`)

Modifying the agent logic **requires rebuilding the ELF and deploying a new vault**. Changes you might make:

- Add new indicators (MACD, Bollinger Bands, etc.)
- Change entry/exit conditions
- Add new strategy modes
- Modify position sizing formula
- Add new action types

**After modifying `agent/src/lib.rs`:**
```bash
# 1. Rebuild the ELF (MUST delete old build artifacts)
rm -rf target/riscv-guest/perp-trader-risc0-methods
cargo build -p perp-trader-risc0-methods --release

# 2. Copy the NEW .bin file to bundle
cp target/riscv-guest/perp-trader-risc0-methods/zkvm-guest/\
riscv32im-risc0-zkvm-elf/release/zkvm-guest.bin bundle/guest.elf

# 3. Register updated agent in AgentRegistry (new IMAGE_ID + CODE_HASH)
# 4. Deploy new vault via VaultFactory (pins the new IMAGE_ID)
```

---

## 5. What You Cannot Change

These are protocol-level invariants enforced by the kernel runtime inside the ZK VM.

| Invariant | Why |
|---|---|
| **Agent code hash** | `SHA256(src/lib.rs \|\| 0x00 \|\| Cargo.toml)` is verified inside the guest. Tampering = proof fails. |
| **IMAGE_ID per vault** | Pinned at vault creation. Changing agent code = new vault. |
| **Binary encoding** | Little-endian, length-prefixed. Must match Solidity `KernelOutputParser` byte-for-byte. |
| **Nonce ordering** | Monotonic with MAX_NONCE_GAP = 100. Can't skip more than 100 nonces. |
| **Constraint enforcement** | Drawdown limits, cooldowns are enforced *inside* the guest — unskippable even on agent failure. |
| **Determinism** | `#![no_std]`, no unsafe, no I/O, no randomness. Same input = same output, always. |
| **Journal format** | `KernelJournalV1` is exactly 209 bytes. This is the proof's public output. |

---

## 6. Building & Running

### Prerequisites

- Rust toolchain (1.75+)
- RISC Zero toolchain (`cargo install cargo-binstall && cargo binstall cargo-risczero`)
- Foundry (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- Python 3.9+ with `hyperliquid-python-sdk` and `eth-account`
- An Ethereum wallet with:
  - HYPE on HyperEVM (for gas)
  - USDC on HyperEVM (for trading)
  - WSTON on Ethereum L1 (for optimistic bonds, optional)

### Build

```bash
# Build the host binary (release mode, with on-chain + proving features)
cargo build -p perp-trader-host --release --features onchain,prove

# The binary is at:
target/release/perp-host
```

### Configure

All configuration lives in `contracts/.env` and `run-bot.sh`. Required env vars:

```bash
# In contracts/.env:
PRIVATE_KEY=0x...          # Operator wallet (signs txs, owns vault)
ORACLE_KEY=0x...           # Oracle signer (signs price feeds)
API_WALLET_KEY=0x...       # API wallet (REST API seed trades)
RPC_URL_MAINNET=https://...  # Ethereum L1 RPC (for WSTON bonds)
```

### Run

```bash
# Default: BTC, optimistic execution, 15s polling
./crates/agents/perp-trader/run-bot.sh

# Override any parameter:
ASSET=ETH MAX_HOLD=600 STOP_LOSS_BPS=150 ./crates/agents/perp-trader/run-bot.sh
```

### What the bot does on startup

1. Loads `.env` from `contracts/.env`
2. Resolves sub-account address from adapter
3. Builds the host binary (if not cached)
4. Starts the main loop:
   - Fetches market data from Hyperliquid
   - Computes indicators (SMA, RSI)
   - Runs agent logic
   - If signal found → executes on-chain
   - If no signal → waits `--monitor-interval` seconds and retries

---

## 7. Deployment Walkthrough

To deploy your own agent from scratch:

### Step 1: Register the agent

```bash
# The agent_id is deterministic: keccak256(author, salt)
cast send $AGENT_REGISTRY "registerAgent(bytes32,bytes32,string)" \
  $SALT $IMAGE_ID "my-agent" \
  --private-key $PK --rpc-url $RPC --legacy
```

### Step 2: Deploy a vault

```bash
# Vaults are deployed via VaultFactory (CREATE2)
cast send $VAULT_FACTORY "deployVault(bytes32,address,address,uint256)" \
  $AGENT_ID $USDC_ADDRESS $VERIFIER_ADDRESS $SALT \
  --private-key $PK --rpc-url $RPC --legacy --gas-limit 3000000
```

### Step 3: Register a sub-account on the adapter

The adapter creates a `TradingSubAccount` contract for each vault:

```bash
cast send $ADAPTER "registerVault(address,uint16,uint8)" \
  $VAULT_ADDRESS $PERP_ASSET $SZ_DECIMALS \
  --private-key $PK --rpc-url $RPC --legacy --gas-limit 3000000
```

### Step 4: Fund the sub-account

```bash
# Fund with HYPE for CoreWriter gas
cast send $ADAPTER "fundSubAccountHype(address)" $VAULT_ADDRESS \
  --value 0.01ether \
  --private-key $PK --rpc-url $RPC --legacy

# Register API wallet for REST API seed trades
cast send $ADAPTER "addApiWalletAdmin(address,address,string)" \
  $VAULT_ADDRESS $API_WALLET "bot" \
  --private-key $PK --rpc-url $RPC --legacy
```

### Step 5: Deposit USDC to the vault

```bash
# Approve vault to spend USDC
cast send $USDC "approve(address,uint256)" $VAULT_ADDRESS $(cast max-uint) \
  --private-key $PK --rpc-url $RPC --legacy

# Deposit USDC
cast send $VAULT "deposit(uint256,address)" $AMOUNT $YOUR_ADDRESS \
  --private-key $PK --rpc-url $RPC --legacy
```

### Step 6: Run the bot

```bash
./crates/agents/perp-trader/run-bot.sh
```

---

## 8. Understanding the Execution Modes

### Synchronous (Default)

```
Fetch data → Run agent → Generate proof (9 min) → Submit proof + actions on-chain
```

- **Pros:** Simple, fully trustless
- **Cons:** 9-minute delay between signal and execution. Price can drift.

### Optimistic (`--optimistic`)

```
Fetch data → Run agent → Submit actions immediately → Generate proof in background → Submit proof later
```

- **Pros:** Instant execution (sub-second from signal to trade)
- **Cons:** Requires WSTON bond on Ethereum L1. Bond slashed if proof not submitted within challenge window (default: 1 hour).

**Optimistic flow in detail:**

```
1. Agent produces actions
2. Bot locks WSTON bond on Ethereum L1 (WSTONBondManager.lockBondDirect)
3. Oracle service attests the bond is locked (POST /api/v1/attest-bond)
4. Bot submits executeOptimistic() on HyperEVM with bond attestation
5. Actions execute immediately on-chain
6. Background thread generates ZK proof (~9 min)
7. Bot submits submitProof() on HyperEVM
8. Bot releases bond on L1 (WSTONBondManager.releaseBondByRelayer)
```

---

## 9. The Two-Proof Problem

Hyperliquid's CoreWriter is asynchronous — actions are queued after EVM block finalization, not executed instantly. This creates a fundamental problem:

**The problem:** If you deposit margin AND place a limit order in the same transaction, the order is processed before the deposit settles. HyperCore sees zero margin and silently rejects the order.

**The solution:** Split into two proofs:

```
Proof 1 (Phase 1): approve USDC + depositMargin
     ↓  wait ~5-10 seconds for HyperCore settlement
Proof 2 (Phase 2): openPosition with margin=0 (deposit already settled)
```

The agent handles this via the `open_phase` field:
- Phase 0: Normal single-proof mode (legacy, can fail on first trade)
- Phase 1: Deposit only (first proof)
- Phase 2: Order only (second proof, margin already on HyperCore)

**Additionally**, HyperCore requires `leverage > 0` before accepting limit orders. When no position exists, the bot uses a REST API seed trade (via `hl_seed_trade.py`) to set leverage and place the initial order.

---

## 10. Troubleshooting

### "No-op: no_entry_signal"

The agent didn't find a valid entry signal. This is normal — the strategy is waiting for SMA crossover + RSI confirmation + favorable funding. The bot retries every `--monitor-interval` seconds.

### "Seed trade status=error"

The REST API order was rejected by HyperCore. Common causes:
- Insufficient margin on HyperCore
- Price outside oracle band (too stale)
- HYPE gas depleted on HyperCore

### Silent order rejection (no error, order just doesn't fill)

CoreWriter actions are never reverted — they're queued and can be silently rejected. Causes:
- No HYPE on HyperCore for gas
- Leverage = 0 (no position exists, needs seed trade)
- Price outside oracle band (~5% of mark)
- Amount exceeds available margin

### "Vault balance < min_balance"

The vault doesn't have enough USDC. Either:
- Deposit more USDC to the vault
- Lower `--min-balance`
- If funds are stranded on HyperCore, the bot will auto-recover them

### Bond release failed

Transient L1 RPC error. The bot retries 3 times. If all fail, the bond remains locked but can be released manually later via `releaseBondByRelayer` or by the oracle service relayer.

### "Malformed ProgramBinary" during proof generation

You copied the raw ELF instead of the `.bin` file to `bundle/guest.elf`. Fix:
```bash
cp target/riscv-guest/perp-trader-risc0-methods/zkvm-guest/\
riscv32im-risc0-zkvm-elf/release/zkvm-guest.bin bundle/guest.elf
```

### How to force-close a stuck position

```bash
# Compute close price (3% below bid for long, 3% above ask for short)
# Price in 1e8 units: e.g., $70,000 → 7000000000000

cast send $ADAPTER "closePositionAtPriceAdmin(address,uint64)" \
  $VAULT $CLOSE_PRICE_1E8 \
  --private-key $PK --rpc-url https://rpc.hyperliquid.xyz/evm --legacy --gas-limit 500000

# Wait 30s for HyperCore settlement, then recover funds:
cast send $ADAPTER "transferPerpToSpot(address,uint64)" $VAULT $AMOUNT_1E6 ...
# Wait 10s
cast send $ADAPTER "transferSpotToEvm(address,uint64)" $VAULT $AMOUNT_1E6 ...
# Wait 10s
cast send $ADAPTER "withdrawToVaultAdmin(address)" $VAULT ...
```

---

## Building Your Own Agent

To create a new agent using perp-trader as a template:

1. **Copy the agent directory:**
   ```bash
   cp -r crates/agents/perp-trader crates/agents/my-agent
   ```

2. **Modify the agent logic** (`agent/src/lib.rs`):
   - Define your own `PerpInput` struct (or rename it)
   - Implement your strategy in `agent_main()`
   - Use `CallBuilder` to construct on-chain actions

3. **Update the host** (`host/src/`):
   - Modify `input_builder.rs` to fetch your data sources
   - Update `indicators.rs` with your indicators
   - Adjust `config.rs` for your parameters

4. **Build and register:**
   ```bash
   cargo build -p my-agent-risc0-methods --release  # Build ELF
   cargo build -p my-agent-host --release --features onchain,prove  # Build host
   # Register agent → deploy vault → run
   ```

The kernel runtime (`kernel-guest`) and SDK (`kernel-sdk`) handle all the ZK plumbing. Your agent just needs to be a pure function: `(context, inputs) → actions`.
