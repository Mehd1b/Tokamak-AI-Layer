---
title: "Hyperliquid Integration: Bottlenecks & Architecture Alternatives"
sidebar_position: 6
---

# Hyperliquid Integration: Bottlenecks & Architecture Alternatives

This document describes the fundamental architectural bottlenecks discovered during mainnet E2E testing of the Execution Kernel's Hyperliquid perpetual futures integration, and proposes alternative architectures that would eliminate them.

## Executive Summary

The current integration routes ZK-verified agent actions from HyperEVM smart contracts to HyperCore's order book via system contracts (CoreWriter, CoreDepositWallet). This architecture suffers from a fundamental mismatch: **HyperEVM is synchronous (atomic EVM transactions) while HyperCore is asynchronous (settlement happens after the EVM tx finalizes)**. This mismatch causes a cascade of issues:

1. Deposit + order in the same tx = order rejected (margin not settled)
2. Close + withdraw in the same tx = withdraw reverts (USDC not returned yet)
3. No position = leverage 0 = all CoreWriter orders silently dropped
4. No error feedback from CoreWriter = silent failures with no diagnosis path

The result is a protocol that requires **5+ separate transactions** and manual admin intervention to complete a single open→close→recover cycle, instead of the ideal **2 transactions** (one ZK proof for open, one for close).

---

## Bottleneck 1: CoreWriter Async Settlement (Critical)

### Problem

CoreWriter (`0x3333...3333`) is the HyperEVM system contract for submitting actions to HyperCore. It accepts actions synchronously (the EVM tx succeeds), but **processes them asynchronously** on HyperCore with a multi-second delay for anti-frontrunning.

This means:

```
EVM Transaction:
  1. deposit(USDC)     → Queued on HyperCore ✓
  2. limitOrder(BTC)   → Processed on HyperCore...
                          but margin from step 1 hasn't settled yet
                          → SILENTLY REJECTED (0 margin available)
```

The `openPosition()` function deposits USDC and places an order in the **same EVM transaction**. By the time HyperCore processes the limit order, the margin deposit hasn't settled. The order is rejected with no on-chain error — CoreWriter never reverts.

### Impact

- Every first-trade attempt through the ZK proof path fails silently
- The USDC is deposited to HyperCore (step 1 succeeds) but the order is dropped (step 2 fails)
- The agent's USDC becomes "trapped" on HyperCore margin with no position opened
- The host must detect this on the next cycle and retry, wasting 8-10 minutes of ZK proof generation

### Current Workaround

Pre-deposit margin in a **separate transaction** before the ZK proof execution:

```
Tx 1: depositMarginFromVaultAdmin(vault, amount)   ← Admin pre-deposits
      ... wait 5 seconds for HyperCore settlement ...
Tx 2: vault.execute(proof, agentOutput)             ← ZK proof places order
      → openPosition() now only places the order (margin already available)
```

This breaks the trustless model — an admin must pre-deposit before each cycle.

---

## Bottleneck 2: Leverage-Zero Bootstrap Problem (Critical)

### Problem

HyperCore's position precompile (`0x0800`) returns a struct:

```solidity
struct Position {
    int64 szi;        // position size (szDecimals-scaled)
    uint32 leverage;   // current leverage
    uint64 entryNtl;   // entry notional
}
```

When no position exists, `leverage = 0`. HyperCore **requires `leverage > 0`** before processing any limit order. CoreWriter has **no `updateLeverage` action** (only 15 actions defined, leverage is not one of them). The only way to set leverage is via the REST API's `updateLeverage` endpoint.

This creates a chicken-and-egg problem:
- Can't place an order without leverage > 0
- Can't set leverage via CoreWriter (no action exists)
- REST API requires an API wallet registered on the sub-account
- API wallet registration itself requires CoreWriter (action 9) + settlement delay

### Impact

- The ZK-verified path **cannot open the first position**. Period.
- Every position lifecycle requires bootstrapping via the REST API
- If a position is fully closed (leverage returns to 0), the ZK path stops working again
- The protocol degrades to REST API → ZK-verified management → REST API close/recover

### Current Workaround ("Seed Trade")

1. Register an API wallet on the sub-account via CoreWriter action 9
2. Wait for settlement (~5 seconds)
3. Use the API wallet to call `updateLeverage` via REST API
4. Place the opening order via REST API (IOC at market-crossing price)
5. Once a position exists (leverage > 0), CoreWriter works for subsequent trades

This means the first trade is **not ZK-verified** — it's placed by a privileged API wallet via the REST API, bypassing the proof system entirely.

---

## Bottleneck 3: Silent Failure Mode (High)

### Problem

CoreWriter's `sendRawAction(bytes data)` function **never reverts on HyperCore failures**. If the action is:
- Rejected for insufficient margin → silent drop
- Rejected for price outside oracle band → silent drop
- Rejected for insufficient HYPE gas → silent drop
- Rejected for leverage=0 → silent drop
- Malformed encoding → silent drop

There is no return value, no event, no callback, no error code. The EVM transaction succeeds with status 1, the gas is consumed, but nothing happens on HyperCore.

### Impact

- Debugging requires comparing HyperCore API state before/after each transaction
- Failed orders waste 8-10 minutes of ZK proof generation time
- Users see "Execution successful" on the block explorer while their order was actually rejected
- The host cannot programmatically distinguish between "order filled" and "order silently rejected"

### Current Workaround

The host polls the Hyperliquid API after each execution to check if the position changed. If not, it logs a warning and retries on the next cycle. This is inherently unreliable — a slow-filling GTC order is indistinguishable from a rejected order.

---

## Bottleneck 4: Three-Step Fund Recovery (High)

### Problem

After closing a position, USDC must be moved from HyperCore back to the vault through **three separate async transactions**, each requiring settlement time:

```
Step 1: transferPerpToSpot(amount)     ← CoreWriter action 7 (perp → spot on HyperCore)
        ... wait ~5 seconds ...
Step 2: transferSpotToEvm(amount)      ← CoreWriter action 6 (spot → HyperEVM)
        ... wait ~15 seconds ...
Step 3: withdrawToVaultAdmin(vault)    ← ERC-20 transfer (sub-account → vault)
```

Each step can fail silently (Bottleneck 3). Step 2 (`spotSend` to the EVM bridge) has been observed to fail silently on mainnet even with sufficient HYPE gas, leaving funds permanently stuck on HyperCore's spot ledger with no automated recovery path.

### Impact

- Minimum 20+ seconds of settlement time between close and vault rebalancing
- Three admin transactions required (can't be done in the ZK proof path)
- Funds can get stuck at any stage with no automated diagnosis
- Vault's `totalAssets()` and share price are stale until recovery completes
- Depositors/withdrawers see incorrect share prices during the recovery window

### Current State

On the v14 sub-account (`0xB4Fb1b...`), $4.96 USDC was stuck on HyperCore spot after Step 1 succeeded but Step 2 (spotSend) was silently rejected. **Root cause identified**: HYPE bridge hadn't settled when spotSend was called (see Bottleneck 7). After waiting for HYPE settlement and retrying, **$3.95 was recovered** to the vault. ~$1 was lost to the initial failed attempt.

---

## Bottleneck 5: Position Size Scaling Mismatch (Fixed in v15)

### Problem

The HyperCore position precompile returns `szi` in **szDecimals format** (e.g., `37` for 0.00037 BTC with szDecimals=5), but CoreWriter expects order sizes in **1e8 format** (e.g., `37000`).

The `closePositionAtPrice()` and `executeClose()` functions in TradingSubAccount were passing the raw precompile value directly to CoreWriter without scaling, resulting in close orders that were **1000x too small** (for BTC, where the scale factor is 10^3).

### Impact

- Close orders filled for dust amounts instead of the full position
- Position remained open after the "close" tx succeeded on-chain
- Required manual REST API intervention to close positions

### Fix (Applied)

Added `szDecimals` as an immutable to `TradingSubAccount` and scale the close size:

```solidity
// Before (broken):
sz = uint64(szi);

// After (fixed):
uint64 szRaw = uint64(szi);
uint64 sz = szRaw * uint64(10 ** (8 - szDecimals));
```

---

## Bottleneck 6: HYPE Gas Dependency (Medium)

### Problem

Every CoreWriter action costs HYPE on HyperCore for gas. HYPE exists on a separate gas ledger from HyperEVM's native gas. When HYPE is depleted, **all CoreWriter actions are silently rejected** — including the orders placed by ZK-verified executions that cost 8-10 minutes of proof generation.

HYPE must be:
1. Held as native HYPE on HyperEVM (the sub-account's balance)
2. Bridged to HyperCore via `0x2222...2222` (the HYPE system address)
3. Consumed by each CoreWriter action

There is no way to query the HyperCore HYPE balance from HyperEVM — only the HyperEVM native balance is visible via `address.balance`.

### Impact

- Actions fail silently when HYPE runs out
- No on-chain way to check if HYPE is sufficient before submitting
- The host must rely on the Hyperliquid API to estimate gas costs

---

## Bottleneck 7: HYPE Bridge Async Settlement (High)

### Problem

HYPE bridging from HyperEVM to HyperCore via the system address `0x2222...2222` is **asynchronous**, just like other CoreWriter actions. The bridge EVM transaction succeeds immediately (status=1), but the HYPE doesn't appear on HyperCore's gas ledger for **5-10 seconds**.

If any CoreWriter action (limit order, spotSend, usdClassTransfer) is submitted before the bridged HYPE settles, it is **silently rejected** because HyperCore sees 0 HYPE available for gas.

### Discovery

This was the root cause of `spotSend` (action 6) failures during fund recovery on the v14 sub-account. The pattern was:
1. `fundSubAccountHype()` succeeded on HyperEVM (HYPE bridged to `0x2222...`)
2. Immediately called `transferSpotToEvm()` which submits a `spotSend` CoreWriter action
3. spotSend was silently rejected — HYPE hadn't settled on HyperCore yet
4. After waiting 10+ seconds and retrying, spotSend succeeded

The same pattern applies to ALL CoreWriter actions executed after HYPE funding — not just spotSend.

### Fix (Applied in host v15)

Added a **10-second settlement wait** after HYPE funding in `main.rs` step 7.5:

```rust
// In main.rs, after check_and_fund_hype() returns Ok(true):
if funded {
    eprintln!("[7.5] Waiting 10s for HyperCore HYPE bridge settlement...");
    std::thread::sleep(std::time::Duration::from_secs(10));
}
```

### Rule

**Always wait 10+ seconds after any HYPE bridge operation before submitting CoreWriter actions.** This includes:
- `fundSubAccountHype()` (adapter function)
- Direct HYPE transfers to `0x2222...2222`
- Any operation that bridges HYPE from HyperEVM to HyperCore

---

## Bottleneck 8: Vault Stuck Funds (ERC4626 Virtual Offset) (Medium)

### Problem

When USDC is returned to the vault via admin recovery functions (`withdrawToVaultAdmin`) but all shares have already been burned (totalShares == 0), the USDC becomes permanently stuck. The ERC4626 virtual offset mechanism (1000 virtual shares) prevents anyone from extracting tokens that have no corresponding shares.

The math:
- Vault has B USDC, totalShares = 0
- User deposits X USDC → gets `X * 1000 / (B + 1)` shares
- User withdraws all shares → gets `shares * (B + X + 1) / (shares + 1000)` USDC
- The virtual 1000 shares always retain: `(B + X) * 1000 / (shares + 1000)` ≈ B USDC
- Net result: user gets back ~X USDC (their deposit), stuck B USDC remains stuck

No matter how large the deposit, the virtual shares always capture approximately B USDC. This is **by design** (prevents ERC4626 inflation/donation attacks) but becomes a trap when funds re-enter the vault outside the deposit flow.

### Impact

- $3.95 USDC stuck in vault `0x7be46c2b...` (recovered from v14 sub-account but no shares exist)
- No admin rescue function exists — the vault owner cannot extract unaccounted tokens
- The only recovery path would be a ZK proof execution with a TRANSFER_ERC20 action, but the perp-trader agent doesn't output such actions

### Fix (Applied to vault source code)

Added `rescueTokens()` owner-only function to `KernelVault.sol` that allows withdrawing tokens when no depositors have shares:

```solidity
function rescueTokens(address token, address to, uint256 amount) external {
    if (msg.sender != owner) revert NotOwner();
    if (totalShares != 0) revert SharesStillOutstanding();
    IERC20(token).safeTransfer(to, amount);
}
```

This is safe because:
1. Only callable by the vault owner
2. Only works when `totalShares == 0` (no depositor has a claim)
3. Doesn't affect share accounting (no shares exist to dilute)

---

## Current Transaction Flow (Actual)

A complete open→close→recover cycle requires:

| # | Transaction | Purpose | Async? |
|---|-------------|---------|--------|
| 1 | `fundSubAccountHype(vault)` | Gas for CoreWriter | Yes (bridge) |
| 2 | `addApiWalletAdmin(vault, wallet, name)` | Register API wallet for seed trade | Yes (CoreWriter) |
| 3 | REST API `updateLeverage` | Set leverage (no CoreWriter action exists) | No (REST) |
| 4 | REST API `order` (IOC) | Seed trade to bootstrap position | No (REST) |
| 5 | `vault.execute(proof, output)` | ZK-verified close (when position exists) | Yes (CoreWriter) |
| 6 | `transferPerpToSpot(vault, amount)` | Perp margin → spot (recovery step 1) | Yes (CoreWriter) |
| 7 | `transferSpotToEvm(vault, amount)` | Spot → HyperEVM (recovery step 2) | Yes (CoreWriter) |
| 8 | `withdrawToVaultAdmin(vault)` | Sub-account → vault (recovery step 3) | No (ERC-20) |

**8 transactions, 3 async settlement waits, 1 REST API call, 1 non-ZK-verified trade.**

The ideal is **2 transactions**: one ZK proof to open, one ZK proof to close+recover.

---

## Proposed Architecture Alternatives

### Alternative A: Single ZK Proof with Batched Actions + Timelock

**Concept**: Instead of executing CoreWriter actions in the same tx as the ZK proof verification, use the proof to authorize a **time-locked batch** of actions that a keeper executes across multiple transactions.

```
Vault.execute(proof, agentOutput)
  → Stores authorized actions in a queue with timestamps
  → Emits ActionQueued events

Keeper (off-chain, watches events):
  → T+0s:  execute depositMargin (from queue)
  → T+5s:  execute limitOrder (margin settled)
  → T+close: execute recovery steps sequentially
```

**Pros**: Single ZK proof covers the full lifecycle. Actions are still ZK-authorized.
**Cons**: Introduces a trusted keeper. Requires time-delayed execution infrastructure.

### Alternative B: Dedicated ZK Proof Per Phase

**Concept**: Split the lifecycle into three ZK-provable phases, each generating its own proof:

```
Phase 1 — Deposit Proof:
  Agent input: vault balance, target margin
  Agent output: depositMargin(amount)
  → Single action, no ordering dependency

Phase 2 — Trade Proof (5s after Phase 1):
  Agent input: HyperCore margin balance, market data
  Agent output: limitOrder(asset, side, price, size)
  → Margin is already settled from Phase 1

Phase 3 — Recovery Proof (after close):
  Agent input: HyperCore position state, spot balance
  Agent output: transferPerpToSpot → transferSpotToEvm → withdrawToVault
  → Sequential with built-in delays
```

**Pros**: Every action is ZK-verified. No trusted keeper.
**Cons**: 3x proof generation cost (24-30 minutes total). More complex orchestration.

### Alternative C: REST API Bridge with ZK Attestation (Recommended)

**Concept**: Accept that HyperCore interaction is fundamentally off-chain and design the protocol around it. The ZK proof verifies the agent's **decision** (what to trade, how much, at what price), and a separate attestation system verifies the **execution** (that the REST API trade matched the agent's intent).

```
┌─────────────────────────────────────────────────────────┐
│                     ZK Proof Domain                      │
│                                                          │
│  Agent Input → Agent Decision → ZK Proof                │
│  (market data)  (buy 0.001 BTC    (proves decision was  │
│                  @ $67,000,        computed correctly     │
│                  5x leverage)      from the input data)  │
│                                                          │
└──────────────────────┬──────────────────────────────────┘
                       │ Authorized Intent
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   Execution Domain                       │
│                                                          │
│  1. Deposit USDC from vault to sub-account (EVM tx)     │
│  2. Bridge USDC to HyperCore (CoreDepositWallet)        │
│  3. Set leverage via REST API                            │
│  4. Place order via REST API (matches ZK intent)        │
│  5. Wait for fill                                        │
│  6. Report execution result + fill proof                │
│                                                          │
└──────────────────────┬──────────────────────────────────┘
                       │ Execution Attestation
                       ▼
┌─────────────────────────────────────────────────────────┐
│                  Settlement Domain                       │
│                                                          │
│  Vault.settleExecution(                                  │
│    zkProof,           // proves agent decision           │
│    executionReport,   // REST API fill data              │
│    attestation        // oracle signature on fill        │
│  )                                                       │
│  → Verifies: fill matches intent (side, size, price)    │
│  → Updates: vault equity, share price                    │
│  → Authorizes: margin movement (vault → sub-account)    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Key insight**: The ZK proof guarantees the agent's **reasoning** is correct. The oracle attestation guarantees the **execution** matched the reasoning. Together, they provide end-to-end verifiability without fighting HyperCore's async settlement model.

**Trade lifecycle (2 transactions)**:

```
Tx 1 — Open:
  1. Host runs agent in zkVM → proof of "buy 0.001 BTC @ $67,000"
  2. Host executes trade via REST API → gets fill confirmation
  3. Host submits: vault.executeWithAttestation(proof, fillReport, oracleSig)
  4. Vault verifies proof + attestation, transfers USDC to sub-account
  5. USDC is already on HyperCore (deposited by REST API flow)

Tx 2 — Close + Recover:
  1. Host runs agent in zkVM → proof of "close position"
  2. Host closes via REST API → gets fill confirmation
  3. Host withdraws from HyperCore to sub-account (REST API)
  4. Host submits: vault.settleClose(proof, fillReport, oracleSig)
  5. Vault verifies, sub-account transfers USDC back to vault
  6. Share prices updated atomically
```

**Pros**:
- Only 2 on-chain transactions per full cycle
- No CoreWriter dependency (bypasses all silent failure modes)
- No leverage-zero bootstrap problem (REST API handles leverage natively)
- No async settlement issues (REST API waits for fills)
- Full ZK verification of agent decisions
- Oracle attestation ensures execution integrity
- Fund recovery is atomic (REST API withdrawal completes before on-chain settlement)

**Cons**:
- Requires a trusted oracle to attest execution results (but the oracle already exists for price feeds)
- Slightly weaker trust model: oracle could attest a fill that didn't happen (mitigated by on-chain position checks)
- REST API wallet becomes a critical component (but it's already required for seed trades)

### Alternative D: Hybrid — CoreWriter for Managed, REST for Bootstrap

**Concept**: Use CoreWriter for all **steady-state** operations (where margin is pre-deposited and leverage is set) and REST API only for bootstrap/recovery phases.

```
Bootstrap (REST API — not ZK-verified):
  1. Vault owner deposits margin via depositMarginAdmin()
  2. Wait for settlement
  3. REST API sets leverage + places first order

Steady State (CoreWriter — ZK-verified):
  4. vault.execute(proof) → adapter.openPosition() [margin already on HyperCore]
  5. vault.execute(proof) → adapter.closePositionAtPrice()

Recovery (Admin — not ZK-verified):
  6. transferPerpToSpot → transferSpotToEvm → withdrawToVaultAdmin
```

**Pros**: Minimal changes from current architecture. ZK verification for trade decisions.
**Cons**: Still requires 3-step recovery. Still has silent failure risk. Still needs pre-deposited margin.

---

## Comparison Matrix

| Property | Current | Alt A (Timelock) | Alt B (Multi-Proof) | Alt C (REST+Attest) | Alt D (Hybrid) |
|----------|---------|-----------------|--------------------|--------------------|----------------|
| Txs per cycle | 8 | 3-4 | 6 | 2 | 5-6 |
| ZK-verified trades | Partial | Full | Full | Decision only | Steady-state |
| Silent failures | Yes | Reduced | Yes | No | Reduced |
| Bootstrap problem | Yes | Yes | Yes | No | Yes (once) |
| Recovery complexity | High (3-step) | Medium | High | Low (atomic) | High (3-step) |
| Trusted components | Admin + Oracle | Keeper + Oracle | Oracle | Oracle | Admin + Oracle |
| Proof generation time | 8-10 min | 8-10 min | 24-30 min | 8-10 min | 8-10 min |
| Mainnet-ready | No (bugs) | Medium | Low | High | Medium |

---

## Recommendation

**Short term (v15)**: Apply Bottleneck 5 fix (size scaling), deploy adapter v15, and continue with Alternative D (Hybrid) to unblock E2E testing. This requires minimal code changes.

**Medium term (v2.0)**: Implement Alternative C (REST API Bridge with ZK Attestation). This eliminates all CoreWriter-related bottlenecks and reduces the transaction count from 8 to 2. The oracle attestation infrastructure already exists (the `oracleSigner` is used for price feed verification). Extending it to attest trade fills is a natural evolution.

The core insight is: **don't fight HyperCore's async model — embrace it.** The REST API is the native, reliable interface to HyperCore. The ZK proof should verify the agent's decision-making, not the low-level order routing. Separating "what to trade" (ZK domain) from "how to trade" (execution domain) produces a cleaner, more reliable architecture.

---

## Appendix: Bugs Discovered During E2E Testing

| Bug | Severity | Status | Description |
|-----|----------|--------|-------------|
| Close size scaling | Critical | **Fixed (v15)** | `closePositionAtPrice` passed szDecimals-scaled size to CoreWriter (expects 1e8) |
| spotSend silent failure | High | **Fixed** | Root cause: HYPE bridge async settlement. Fix: 10s wait after HYPE funding |
| API wallet stickiness | Medium | Workaround | HyperCore maps API wallets to first sub-account; re-registration doesn't override |
| HYPE depletion | Medium | Mitigated | Auto-funding added, but no on-chain way to check HyperCore HYPE balance |
| HYPE bridge async | High | **Fixed** | HYPE bridge takes ~5-10s to settle; CoreWriter actions fail if called too early |
| Vault stuck funds | Medium | **Fixed (source)** | ERC4626 virtual offset traps tokens with 0 shares; added `rescueTokens()` |

## Appendix: Deployed Adapter Versions

| Version | Address | Status | Notes |
|---------|---------|--------|-------|
| v12 | `0x30C1ab0F82CDE134A9eb91CC8AEBAD503aa736dA` | Deprecated | $0.62 stuck |
| v13 | `0x0Cb59d461a366d2377ebc7eD7E50F960bEa67dc9` | Deprecated | closePositionAtPrice, HYPE auto-fund |
| v14 | `0x26d2B5a9C0174f6Ec106970ddAB5c0CCe0819410` | Deprecated | depositMarginFromVaultAdmin, close size bug |
| v15 | `0x641aDfDD98007Ea18507Aab6579C9b652c600007` | **Active** | Close size scaling fix, szDecimals in sub-account |
