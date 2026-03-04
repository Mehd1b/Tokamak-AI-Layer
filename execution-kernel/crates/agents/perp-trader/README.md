# Perp-Trader Agent

Verifiable perpetual futures trading agent for Hyperliquid, built on the Execution Kernel zkVM framework. Implements dual strategy modes (SMA crossover + funding rate arbitrage) with configurable risk parameters. All trading decisions are deterministic and provable via RISC Zero zero-knowledge proofs.

## Overview

The perp-trader is a self-contained agent package with four components:

```
perp-trader/
├── agent/          # Core trading logic (no_std, runs inside zkVM)
├── host/           # CLI orchestrator (fetch → build → prove → submit)
├── risc0-methods/  # zkVM guest binding (compiles agent as ELF)
├── bundle/         # Agent pack manifest (ELF + metadata for deployment)
├── scripts/        # Python helper for REST API seed trades
└── run-bot.sh      # Production bot loop with auto-close timer
```

**Pipeline (8 stages):**

1. Load agent bundle (ELF + metadata)
2. Read vault state from on-chain (nonce, agent ID, total assets)
3. Fetch market data from Hyperliquid API (prices, position, funding, candles)
4. Compute indicators (SMA fast/slow, RSI, previous values)
5. Build and sign oracle feed (ECDSA, verified on-chain)
6. Assemble `KernelInputV1` (snapshot + oracle feed + PerpInput)
7. Reconstruct agent output and verify action commitment
8. Generate ZK proof + submit proof + actions on-chain via `KernelVault.executeWithOracle()`

**No-op optimization:** Steps 1–7 are cheap (~500ms). If the agent produces no actions (no signal), the pipeline exits before step 8 (proof generation takes ~8-10 minutes). This enables high-frequency scheduling (every 30s) with negligible cost on idle cycles.

## Chain Architecture

Hyperliquid is its own L1 chain with two layers:

- **HyperCore** — The off-chain order book engine (accessed via REST API at `api.hyperliquid.xyz`)
- **HyperEVM** — An EVM-compatible execution layer (Chain ID **999** mainnet, **998** testnet)

```
Host CLI                          HyperEVM (Chain ID 999)
┌──────────────┐                  ┌────────────────────────────────┐
│ 1. Fetch API │─── REST ───────▶ │ Hyperliquid API                │
│ 2. Build     │                  │ (api.hyperliquid.xyz)          │
│ 3. Prove     │─── RPC ────────▶ │ KernelVault                    │
│ 4. Submit    │                  │   ├─ executeWithOracle()       │
└──────────────┘                  │   └─ CALL → HyperliquidAdapter │
                                  │         ├─ CoreWriter (0x3333) │
                                  │         └─ CoreDepositWallet   │
                                  └──────────────┬─────────────────┘
                                                 │ async settlement
                                  ┌──────────────▼─────────────────┐
                                  │ HyperCore Order Book           │
                                  └────────────────────────────────┘
```

## Critical Requirements & Bottlenecks

This section documents every non-obvious requirement and silent failure mode discovered during mainnet operation. **Read this before deploying.**

### 1. CoreWriter Actions Are Asynchronous (Silent Failures)

CoreWriter (`0x3333...3333`) is the bridge between HyperEVM and HyperCore. All actions sent to CoreWriter are **non-atomic**: the EVM transaction succeeds even if HyperCore rejects the underlying action. There is **no revert, no error, no event** when an order is rejected.

**Impact:** You cannot know from the EVM tx receipt whether an order was filled, partially filled, or silently dropped. You must poll the Hyperliquid REST API to verify position state after submission.

### 2. HYPE Gas on HyperCore (Silent Rejection)

CoreWriter actions require **HYPE tokens on HyperCore** for gas — not HyperEVM gas (which is native HYPE on the EVM side). These are separate balances.

- Without HYPE on HyperCore, **all** CoreWriter actions silently fail: limit orders, margin transfers (`usdClassTransfer`), spot sends, everything.
- 0.005 HYPE is not enough for multiple actions. Fund with **0.01+ HYPE** minimum.
- The bot auto-funds via `--min-hype` / `--hype-topup` flags, calling `adapter.fundSubAccountHype()` before execution.

**To fund manually:**
```bash
cast send $ADAPTER "fundSubAccountHype(address)" $VAULT \
  --value 10000000000000000 \
  --rpc-url https://rpc.hyperliquid.xyz/evm \
  --private-key $PK --legacy
```

The adapter forwards HYPE to the sub-account, which bridges it to HyperCore via system contract `0x2222...2222`.

### 3. Leverage Bootstrap Problem (No Position = No Orders)

HyperCore's position precompile returns `leverage=0` when no position exists. CoreWriter silently drops all limit orders when leverage is 0 — there is no `updateLeverage` CoreWriter action.

**Consequence:** The very first trade **cannot** go through CoreWriter/ZK proof. It must be bootstrapped via the REST API.

**Solution — Seed Trade Flow:**
1. The host detects `position_size == 0` and an open signal from the agent
2. Instead of submitting the ZK proof, it calls the Python helper (`hl_seed_trade.py`)
3. The helper uses the **API wallet** (registered on the sub-account via CoreWriter action 9) to call the REST API: `updateLeverage` → place IOC order
4. Once a position exists, all subsequent trades go through the normal ZK-verified CoreWriter flow

**Risk:** If the position is fully closed, leverage goes back to 0 and CoreWriter stops working again. The next open must go through the seed trade flow.

**Required setup:**
```bash
# Register API wallet on sub-account (one-time, via adapter admin)
cast send $ADAPTER "addApiWalletAdmin(address,address,string)" \
  $VAULT $API_WALLET_ADDRESS "perp-bot" \
  --rpc-url https://rpc.hyperliquid.xyz/evm \
  --private-key $PK --legacy
```

### 4. HyperCore Oracle Price Band (Silent Order Rejection)

HyperCore rejects limit orders with prices outside ~5-10% of the oracle price. Using extreme prices (e.g., `MAX_UINT64` for "market order") causes silent rejection.

**Impact on closing:** The agent must compute a limit price within the oracle band:
- Closing a long (selling): `mark_price * 0.95` (5% below mark)
- Closing a short (buying): `mark_price * 1.05` (5% above mark)

The agent emits `closePositionAtPrice(uint64 px)` with the computed price. The old `closePosition()` using MIN_PRICE/MAX_PRICE is deprecated (silently rejected by HyperCore).

### 5. Async Settlement: Close + Withdraw Cannot Be Bundled

When the agent closes a position, HyperCore settles the close asynchronously (~seconds). USDC does **not** return to the sub-account's EVM balance in the same transaction.

**Impact:** If `closePositionAtPrice()` and `withdrawToVault()` are bundled in the same `vault.execute()` call, the withdraw reverts (no USDC available), which rolls back the close too — **the entire execution fails**.

**Solution:** The agent emits only a single close action. Fund recovery is done manually via the 3-step admin flow after settlement:

```bash
# Step 1: HyperCore perp margin → spot (amount in 1e6 = USDC native)
cast send $ADAPTER "transferPerpToSpot(address,uint64)" $VAULT $AMOUNT_1E6 \
  --rpc-url ... --private-key ... --legacy

# Wait ~5-10 seconds for HyperCore settlement

# Step 2: HyperCore spot → HyperEVM (amount in 1e6, contract multiplies to 1e8 internally)
cast send $ADAPTER "transferSpotToEvm(address,uint64)" $VAULT $AMOUNT_1E6 \
  --rpc-url ... --private-key ... --legacy

# Wait ~15 seconds for cross-layer settlement

# Step 3: Sub-account EVM → Vault
cast send $ADAPTER "withdrawToVaultAdmin(address)" $VAULT \
  --rpc-url ... --private-key ... --legacy
```

### 6. CoreWriter Amount Scaling

Different CoreWriter actions use different unit scales:

| Action | ID | Scale | Example: $10 USDC |
|--------|----|-------|-------------------|
| `usdClassTransfer` (perp↔spot) | 7 | 1e6 (USDC native) | `10000000` |
| `spotSend` (spot→EVM) | 6 | 1e8 (HyperCore wei) | `1000000000` |
| Limit orders | 1 | 1e8 for price, szDecimals for size | varies |

**The `transferSpotToEvm` adapter function takes 1e6 and multiplies by 100 internally.** If you pass 1e8 directly, the amount overflows the balance and is silently rejected.

### 7. Margin Deposit + Order Atomicity

Depositing USDC via CoreDepositWallet and placing a limit order in the same EVM transaction does **not** work. CoreWriter actions are delayed ~seconds for anti-frontrunning. The deposit hasn't settled when the order is processed, causing rejection for "0 margin".

**Solution:** The adapter's `openPosition()` deposits margin, which becomes "rolling margin" available for the **next** trade. The first trade is handled by the seed trade flow (see #3).

### 8. IMAGE_ID Immutability

`KernelVault.trustedImageId` is immutable — set at deployment and cannot be changed. Any change to the agent source code produces a new ELF → new IMAGE_ID → requires deploying a new vault via `VaultFactory`.

### 9. ELF Rebuild Pitfalls

`cargo clean -p perp-trader-risc0-methods --release` does **NOT** clean the riscv-guest target. The ELF at `target/riscv-guest/` will remain stale.

**Correct rebuild procedure:**
```bash
rm -rf target/riscv-guest/perp-trader-risc0-methods
cargo build -p perp-trader-risc0-methods --release
```

After rebuilding, update `bundle/agent-pack.json` with new `image_id`, `agent_code_hash`, and `elf_sha256`. If IMAGE_ID changed, deploy a new vault.

### 10. HyperEVM Gas Constraints

- HyperEVM does **not** support EIP-1559. Always use `--legacy` with forge/cast.
- Block gas limit is **3M**. Large contracts (like HyperliquidAdapter) must use `FOUNDRY_PROFILE=small` (via_ir=true, optimizer_runs=1) to fit.
- Deploy vaults via `VaultFactory` with `cast send`, not forge scripts (which may exceed gas).

### 11. Position State File Stale Lock

The host writes a state file (`/tmp/perp-trader-mainnet-state.json`) when a position is opened. On subsequent cycles, if HyperCore hasn't settled the position yet (`position_size == 0` but state file exists), the host skips execution.

**Failure mode:** If the seed trade reports "filled" but the order was actually rejected (e.g., no margin), the state file locks out all cycles for `--position-timeout` seconds (default 30 minutes).

**Fix:** Delete the state file and restart the bot:
```bash
rm -f /tmp/perp-trader-mainnet-state.json
```

### 12. Proof Generation Time

ZK proof generation (STARK → SNARK via RISC Zero) takes **8-10 minutes** on a modern machine. Set `--oracle-key` max age >= 900 seconds to avoid stale oracle errors during proving.

The bot loop (`run-bot.sh`) runs every 30 seconds but only enters the proving step when the agent produces actions. No-op cycles complete in ~500ms.

### 13. CDW Deposits From EOAs Don't Work

Sending USDC directly to the CoreDepositWallet from an EOA does **not** trigger a HyperCore deposit. HyperCore only processes deposits from contract calls. Funds sent directly are lost.

## Mainnet Addresses (v13)

| Component | Address |
|-----------|---------|
| HyperliquidAdapter | `0x0Cb59d461a366d2377ebc7eD7E50F960bEa67dc9` |
| KernelVault | `0x7be46c2b091197dc8a0ae8d9b0821ac5c7666e74` |
| TradingSubAccount | `0x4e38d0e0342b3af5c866e3ab8fcb92294441d699` |
| KernelExecutionVerifier | `0xDc9d9A78676C600E7Ca55a8D0c63da9462Acfe30` |
| AgentRegistry | `0xAf58D2191772bcFFB3260F5140E995ec79e4d88B` |
| VaultFactory | `0xc7Fc0dD5f1B03E3De0C313eE0D3b06Cb2Dc017BB` |
| USDC (HyperEVM) | `0xb88339CB7199b77E23DB6E890353E22632Ba630f` |
| CoreWriter (system) | `0x3333333333333333333333333333333333333333` |
| API Wallet | `0xe4D18C78Fb4d9033506f74D33F24a4cD1089B1c7` |

## Prerequisites

- **Rust 1.75+** with `cargo`
- **Foundry** (`forge`, `cast`) for contract deployment
- **RISC Zero toolchain** for proof generation:
  ```bash
  cargo install cargo-risczero
  cargo risczero install
  ```
- **Python 3** with `hyperliquid-python-sdk` for seed trades:
  ```bash
  pip install hyperliquid-python-sdk
  ```
- **HYPE tokens** on HyperEVM for gas fees + CoreWriter gas
- **USDC on HyperEVM** for vault deposits (bridge from Arbitrum if needed)
- **Two private keys**: executor (vault owner) and oracle signer
- **One API wallet key**: registered on the sub-account for REST API seed trades

## Environment Setup

Create a `.env` file in `execution-kernel/contracts/`:

```bash
# Executor wallet (vault owner, signs transactions)
PRIVATE_KEY=0x...

# Oracle signer (signs price feeds, verified on-chain)
ORACLE_KEY=0x...

# HyperEVM RPC endpoint
RPC_URL_HYPER_MAINNET=https://rpc.hyperliquid.xyz/evm

# Deployed contracts
HYPER_MAINNET_VAULT=0x...
HYPER_MAINNET_ADAPTER=0x...
HYPER_MAINNET_SUB_ACCOUNT=0x...
HYPER_MAINNET_USDC=0xb88339CB7199b77E23DB6E890353E22632Ba630f

# API wallet for REST API seed trades
API_WALLET_KEY=0x...
API_WALLET_ADDRESS=0x...
```

### Bridging USDC to HyperEVM

1. Hold native USDC on **Arbitrum One** (`0xaf88d065e77c8cC2239327C5EDb3A432268e5831`)
2. Send USDC to the Hyperliquid bridge: `0x2df1c51e09aecf9cacb7bc98cb1742757f163df7` on Arbitrum
3. Funds arrive on Hyperliquid within ~1 minute (minimum 5 USDC)
4. Transfer from HyperCore to HyperEVM via the Hyperliquid UI or API

## Deployment Checklist

Full deployment from scratch (assuming EK infrastructure contracts already on HyperEVM):

```bash
# 1. Build agent ELF
rm -rf target/riscv-guest/perp-trader-risc0-methods
cargo build -p perp-trader-risc0-methods --release
# Note the IMAGE_ID from build output

# 2. Register agent in AgentRegistry (if not already)
cast send $AGENT_REGISTRY "registerAgent(bytes32,bytes32)" \
  $AGENT_ID $IMAGE_ID \
  --rpc-url $RPC --private-key $PK --legacy

# 3. Deploy vault via VaultFactory
cast send $VAULT_FACTORY \
  "deployVault(bytes32,bytes32,address,address,uint64)" \
  $AGENT_ID $IMAGE_ID $USDC $ORACLE_SIGNER 900 \
  --rpc-url $RPC --private-key $PK --legacy --gas-limit 2500000

# 4. Deploy adapter (if new version needed)
FOUNDRY_PROFILE=small forge build
cast send --create $(cat out/HyperliquidAdapter.sol/HyperliquidAdapter.json | jq -r '.bytecode.object')$(cast abi-encode "constructor(address,address)" $USDC $CDW) \
  --rpc-url $RPC --private-key $PK --legacy --gas-limit 2900000

# 5. Register vault on adapter
cast send $ADAPTER "registerVault(address,uint32)" $VAULT 0 \
  --rpc-url $RPC --private-key $PK --legacy

# 6. Fund sub-account with HYPE
cast send $ADAPTER "fundSubAccountHype(address)" $VAULT \
  --value 20000000000000000 \
  --rpc-url $RPC --private-key $PK --legacy

# 7. Register API wallet on sub-account
cast send $ADAPTER "addApiWalletAdmin(address,address,string)" \
  $VAULT $API_WALLET "perp-bot" \
  --rpc-url $RPC --private-key $PK --legacy

# 8. Deposit USDC into vault
cast send $USDC "approve(address,uint256)" $VAULT $AMOUNT \
  --rpc-url $RPC --private-key $PK --legacy
cast send $VAULT "deposit(uint256)" $AMOUNT \
  --rpc-url $RPC --private-key $PK --legacy

# 9. Update bundle/agent-pack.json with new image_id, agent_code_hash, vault
# 10. Start the bot
./crates/agents/perp-trader/run-bot.sh
```

## Building the Agent Bundle

```bash
# Build with Docker for deterministic output (recommended)
cd crates/agents/perp-trader/risc0-methods
RISC0_USE_DOCKER=1 cargo build --release

# Or build with local toolchain (faster, non-reproducible)
rm -rf target/riscv-guest/perp-trader-risc0-methods
cargo build -p perp-trader-risc0-methods --release
```

After building, update `bundle/agent-pack.json`:
- `image_id`: from the risc0-methods build output
- `agent_code_hash`: from the perp-trader agent build output (printed as warning)
- `elf_sha256`: `sha256sum bundle/guest.elf`

## Running the Bot

### Production (bot loop with auto-close timer)

```bash
cd execution-kernel
./crates/agents/perp-trader/run-bot.sh
```

The bot loop:
- Runs every 30 seconds (`INTERVAL=30`)
- Skips no-op cycles instantly (~500ms)
- Generates ZK proof only when agent produces actions (~8-10 min)
- Auto-funds HYPE when sub-account is low
- Force-closes position after 15 minutes if TP/SL not hit (`MAX_HOLD=900`)

**Override defaults via environment variables:**
```bash
INTERVAL=60 MAX_HOLD=1800 STOP_LOSS_BPS=150 TAKE_PROFIT_BPS=300 ./run-bot.sh
```

### Single-shot execution

```bash
cargo run -p perp-trader-host --features full -- \
  --vault $VAULT \
  --rpc $RPC \
  --pk env:PRIVATE_KEY \
  --oracle-key env:ORACLE_KEY \
  --bundle ./crates/agents/perp-trader/bundle \
  --hl-url https://api.hyperliquid.xyz \
  --sub-account $SUB_ACCOUNT \
  --exchange-contract $ADAPTER \
  --usdc-address $USDC \
  --adapter-address $ADAPTER \
  --api-wallet-key env:API_WALLET_KEY \
  --seed-script ./crates/agents/perp-trader/scripts/hl_seed_trade.py \
  --seed-leverage 5 \
  --min-hype 5000000000000000 \
  --hype-topup 10000000000000000 \
  --json
```

### Dry-run (skip proof + submission)

```bash
cargo run -p perp-trader-host --features full -- \
  --vault $VAULT --rpc $RPC --pk env:PRIVATE_KEY \
  --oracle-key env:ORACLE_KEY --bundle ./crates/agents/perp-trader/bundle \
  --hl-url https://api.hyperliquid.xyz --sub-account $SUB_ACCOUNT \
  --exchange-contract $ADAPTER --usdc-address $USDC \
  --dry-run --json
```

## Testing

### Agent logic tests (37 tests, no network)

```bash
cargo test -p perp-trader
```

Tests entry signals, exit conditions, risk checks, position sizing, force flags, oracle verification, and determinism.

### Host unit tests (13 tests, no network)

```bash
cargo test -p perp-trader-host
```

Tests input building, output reconstruction, oracle signing, and market data parsing.

### Integration tests (requires network)

```bash
cargo test -p perp-trader-host -- --ignored
```

Tests live Hyperliquid API fetching, candle retrieval, and indicator computation.

## Command Reference

| Flag | Default | Description |
|------|---------|-------------|
| `--vault` | *required* | KernelVault contract address |
| `--rpc` | *required* | HyperEVM RPC endpoint |
| `--pk` | *required* | Executor private key (hex or `env:VAR`) |
| `--oracle-key` | *required* | Oracle signer private key |
| `--bundle` | *required* | Path to agent bundle directory |
| `--hl-url` | testnet | Hyperliquid REST API base URL |
| `--sub-account` | *required* | TradingSubAccount address |
| `--exchange-contract` | *required* | HyperliquidAdapter address |
| `--usdc-address` | *required* | USDC token address |
| `--adapter-address` | — | Adapter address for HYPE funding (usually same as exchange-contract) |
| `--asset` | `BTC` | Hyperliquid asset symbol |
| `--sma-fast` | `3` | Fast SMA period (candles) |
| `--sma-slow` | `8` | Slow SMA period (candles) |
| `--rsi-period` | `14` | RSI period (candles) |
| `--strategy-mode` | `0` | 0=SMA crossover, 1=Funding arb |
| `--action-flag` | `0` | 0=evaluate, 1=force close, 2=force flat |
| `--stop-loss-bps` | `200` | Stop loss in basis points (2%) |
| `--take-profit-bps` | `400` | Take profit in basis points (4%) |
| `--max-drawdown-bps` | `0` | Max drawdown bps (0=agent default 500 = 5%) |
| `--min-balance` | `1000000` | Min vault USDC (raw 1e6) to execute |
| `--position-timeout` | `1800` | Seconds before stale position state is cleared |
| `--sz-decimals` | `5` | Hyperliquid szDecimals (BTC=5, ETH=4, SOL=2) |
| `--seed-leverage` | `5` | Leverage for REST API seed trades |
| `--api-wallet-key` | — | API wallet key for seed trades |
| `--seed-script` | — | Path to Python seed trade helper |
| `--min-hype` | `5e15` | Min HYPE (wei) before auto-funding |
| `--hype-topup` | `1e16` | HYPE (wei) to send when funding |
| `--chain-id` | `999` | Chain ID for oracle signature domain |
| `--dev-mode` | `false` | Use dev-mode proving (fast, not verifiable) |
| `--dry-run` | `false` | Skip proof generation + on-chain submission |
| `--json` | `false` | JSON output |

## Lifecycle: Open → Monitor → Close → Recover

```
┌─── Cycle 1: Open ───────────────────────────────────────────┐
│ Agent detects entry signal → emits openPosition() action    │
│ Host: position_size==0 → seed trade via REST API            │
│ REST API: updateLeverage → IOC order → position opened      │
│ State file written: {nonce, opened_at}                      │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─── Cycles 2-N: Monitor ────────────────────────────────────┐
│ Agent evaluates exit conditions every 30s                   │
│ No exit signal → no-op (skips proving, <500ms)              │
│ Exit signal → emits closePositionAtPrice(px) action         │
│ Host: generates ZK proof (~8-10 min) → submits on-chain     │
│ Vault.execute() → Adapter → Sub-account → CoreWriter close  │
└─────────────────────────────────────────────────────────────┘
        │
        ▼ (or force-close after MAX_HOLD seconds)
┌─── Post-Close: Recovery (manual admin) ────────────────────┐
│ Wait ~5s for HyperCore settlement                           │
│ 1. transferPerpToSpot(vault, amount_1e6)                    │
│ Wait ~5s                                                    │
│ 2. transferSpotToEvm(vault, amount_1e6)                     │
│ Wait ~15s for cross-layer settlement                        │
│ 3. withdrawToVaultAdmin(vault)                              │
│ USDC is back in vault → ready for next cycle                │
└─────────────────────────────────────────────────────────────┘
```

## Troubleshooting

**`position_pending_settlement` loop** — The state file records a position open, but HyperCore shows no position. Likely the seed trade reported "filled" but was actually rejected (no margin). Fix: `rm /tmp/perp-trader-mainnet-state.json` and restart.

**Orders silently rejected** — Check in order: (1) Does the sub-account have HYPE on HyperCore? (2) Is the price within oracle band (~5-10%)? (3) Is there a position open (leverage > 0)? (4) Was margin deposited in a previous transaction (not same tx)?

**`Stale oracle feed`** — The oracle feed timestamp is older than the configured max age. Proof generation takes 8-10 min — set oracle max age >= 900s on the vault: `cast send $VAULT "setOracleSigner(address,uint64)" $ORACLE_SIGNER 900 --rpc-url $RPC --private-key $PK --legacy`.

**`InvalidNonce`** — Nonce must be strictly greater than `lastExecutionNonce` on the vault, gap <= 100. Check: `cast call $VAULT "lastExecutionNonce()" --rpc-url $RPC`.

**`AgentIdMismatch`** — The `agent_id` in `agent-pack.json` doesn't match the vault. Check: `cast call $VAULT "agentId()" --rpc-url $RPC`.

**`ActionCommitmentMismatch`** — Host's reconstructed output diverges from the ZK proof. Indicates a determinism bug. Run with `--json` to inspect committed vs reconstructed hashes.

**Recovery flow fails silently** — If `transferSpotToEvm` or `transferPerpToSpot` completes on EVM but nothing moves on HyperCore, the sub-account likely ran out of HYPE gas. Fund more HYPE and retry.

**Adapter deployment exceeds 3M gas** — Use `FOUNDRY_PROFILE=small` (via_ir=true, optimizer_runs=1) and deploy via `cast send --create`, not forge scripts.

**ELF not updated after code change** — `cargo clean -p` doesn't clean riscv-guest target. Must `rm -rf target/riscv-guest/perp-trader-risc0-methods` then rebuild.

**CDW deposits from EOAs lost** — Never send USDC directly to CoreDepositWallet from an EOA. HyperCore ignores EOA deposits. Only contract calls trigger the deposit.

**`RPC rate limit`** — Public HyperEVM RPC is limited to ~100 req/min/IP. Use Alchemy or dRPC for production.
