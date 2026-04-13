# Design Stress Testing Findings

**Agent**: Design Stress Testing Agent (Unconditional Thorough Mode)
**Date**: 2026-04-13
**Scope**: Architecture assumptions, capacity limits, economic limits, timing limits, scale limits, adversarial design, and recovery limits

---

## Chain Summary

| Finding ID | Type | Severity | Precondition | Postcondition |
|------------|------|----------|-------------|---------------|
| DST-1 | Capacity Limit | Medium | MAX_ACTIONS_PER_OUTPUT fully used | Gas explosion in payload loop; no on-chain protection |
| DST-2 | Capacity Limit | Low | MAX_NONCE_GAP=10 exhausted | Vault permanently halted until unpaused and new proof cycle starts |
| DST-3 | Economic Limit | Medium | MAX_COMBINED_FEE_BPS=5000, 100% allocation to mgmt+perf | Effective annual cost exceeds 50%+ of depositor capital in worst-case scenario |
| DST-4 | Economic Limit | Medium | Bond system at scale with small vaults | Bond economics become unprofitable for legitimate operators at any TVL below WSTON opportunity cost |
| DST-5 | Timing Limit | High | Relayer offline for challenge window duration | Vault TVL drained with 0 economic penalty; bond reclaimed in 90 days |
| DST-6 | Timing Limit | Medium | Strategy active, owner disappears | Minimum 7-day recovery; may be extended indefinitely by repeated deposits to a new vault |
| DST-7 | Scale Limit | Low | 100 vaults per HyperliquidAdapter | Gas explosion in per-vault iteration; no enumeration cap on adapter |
| DST-8 | Scale Limit | Informational | 1000+ agents in AgentRegistry | Governance unregistration blocked by 50-vault check cap; stale agents remain |
| DST-9 | Adversarial Design | Medium | Depositor grief via 40% action cap exploitation | Depositor can time deposits to force sub-optimal execution ordering on other depositors |
| DST-10 | Adversarial Design | High | Operator profitable default on bonds | At small TVL, slash economics do NOT deter operator malice; the bond-to-TVL ratio is the only deterrent, and no minimum is enforced at vault level |

---

## Finding [DST-1]: MAX_ACTIONS_PER_OUTPUT Full Load Gas Explosion

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,5 | ✗4(N/A — capacity test)
**Rules Applied**: [R10:✓, R5:✗(single-entity vault), R14:✗(no aggregate variable), R8:✗(single execution)]
**Depth Evidence**: [BOUNDARY: actionCount=64, payloadLen=16384 → agentOutputBytes = 64 × (4+40+16384) = ~1,051,648 bytes]
**Severity**: Medium
**Location**: KernelOutputParser.sol:L81-182, KernelVault.sol:L1055-1069

**Description**:
`MAX_ACTIONS_PER_OUTPUT = 64` and `MAX_ACTION_PAYLOAD_BYTES = 16,384` are the hard limits. A fully-loaded output takes up:
- Outer header: 4 bytes (action_count)
- Per action: 4 bytes (action_len prefix) + 4 (action_type) + 32 (target) + 4 (payload_len) + up to 16,384 (payload) = up to 16,428 bytes per action
- Maximum total wire size: 4 + 64 × 16,428 = **1,051,396 bytes (~1 MB)**

The `parseActions` function copies payload bytes using a byte-by-byte Solidity loop (`for (uint256 j = 0; j < payloadLen; j++) { payload[j] = data[offset + j]; }`). At maximum payload per action (16,384 bytes × 64 actions), this loop executes **1,048,576 iterations**. On HyperEVM with a 3M block gas limit (~32 gas per byte copy + overhead), this vastly exceeds the block gas limit.

**Design Assumption Being Tested**: The protocol assumes 64 actions × 16 KB payloads are always feasible within a single transaction.

**Boundary Computation**:
- Approximate gas per byte copy in a Solidity loop: ~32–50 gas (memory write + index increment)
- 64 × 16,384 = 1,048,576 bytes × 40 gas = ~41,943,040 gas
- HyperEVM block limit: 3,000,000 gas
- **Overshoot factor: ~14x**

Even at 10% payload utilization (1,638 bytes per action × 64 actions = 104,858 iterations), gas consumption approaches ~4,194,320 — still exceeds the 3M block limit.

**Impact**: A legitimate agent that generates a near-maximum output (e.g., a portfolio rebalancer issuing 50 swap actions across Uniswap V4 pools) will produce a transaction that reverts on HyperEVM due to OOG. This is a liveness failure — no fund loss but no execution, forcing operators to redesign agents to stay within practical gas budgets that are far below the nominal protocol limits. The constant MAX_ACTIONS_PER_OUTPUT=64 advertises a capacity the runtime cannot deliver on the target chain.

**Evidence**:
```solidity
// KernelOutputParser.sol:L164-168
bytes memory payload = new bytes(payloadLen);
for (uint256 j = 0; j < payloadLen; j++) {
    payload[j] = data[offset + j];  // 1 MSTORE per byte = ~32 gas per iteration
}
```

---

## Finding [DST-2]: MAX_NONCE_GAP=10 Exhaustion Permanently Halts Vault Until Operator Manually Recovers

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,5 | ✗4(N/A — capacity test)
**Rules Applied**: [R10:✓, R8:✗(single-step)]
**Depth Evidence**: [BOUNDARY: lastNonce=100, attacker submits nonce=111 → gap=11 → NonceGapTooLarge. All of nonces 101-110 are PERMANENTLY skipped.]
**Severity**: Low
**Location**: KernelVault.sol:L1016-1027

**Description**:
`MAX_NONCE_GAP = 10` (reduced from 100 via L-03 fix). The design assumption: "Ten covers legitimate short-term failures and retries."

Stress test: The operator loses 10 consecutive proofs in sequence (proof generation fails, network partition, zkVM bug, etc.). At `lastNonce = N`:
- Nonces N+1 through N+10 are skippable.
- Any proof with nonce N+11 or higher is accepted (gap = 11 > 10 → `NonceGapTooLarge`).
- **The vault is completely locked until a valid proof with nonce in range (N+1, N+10] is produced.**

The design implies the operator must REGENERATE a proof with a nonce ≤ N+10. If the underlying zkVM host failure is persistent (hardware failure, key loss, agent code regression), the vault cannot accept any execution until the host recovers. Unlike pausing, there is no permissionless recovery mechanism — no one other than the operator (who holds the imageId-matching guest) can produce a valid proof.

**Boundary Computation**:
- After 10 consecutive failures: vault is locked for all future nonces.
- Recovery time = time to fix the host + time to regenerate a RISC Zero proof (~8-10 minutes each) + time to submit.
- With RISC Zero proof generation time of ~10 minutes, worst-case: if the host has been down for >10 execution cycles AND all of those proofs are missing (not just late), the vault cannot self-recover — the operator must coordinate with depositors to trigger `emergencySettle` after 7 days, then re-deploy a new vault.

**Impact**: Vault liveness failure for up to the full 7-day `EMERGENCY_SETTLE_DELAY` if proof infrastructure fails during active strategy and nonce gap is exhausted. Low severity because this requires a persistent infrastructure failure (not a one-time transient), but the design assumption that "10 covers legitimate short-term failures" underestimates aggressive proof infrastructure outages.

**Evidence**:
```solidity
// KernelVault.sol:L1020-1023
uint64 gap = providedNonce - lastNonce;
if (gap > MAX_NONCE_GAP) {
    revert NonceGapTooLarge(lastNonce, providedNonce, MAX_NONCE_GAP);
}
```

---

## Finding [DST-3]: Maximum Fee Configuration Effective Annual Cost Exceeds 50% of Depositor Capital

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,5 | ✗4(N/A — economic boundary test)
**Rules Applied**: [R10:✓, R13:✓, R14:✓]
**Depth Evidence**: [BOUNDARY: mgmtBps=500 + perfBps=4500 = MAX_COMBINED_FEE_BPS=5000 boundary. Protocol fee split=5000. Effective depositor extraction: computed below.]
**Severity**: Medium
**Location**: KernelVault.sol:L284-303, constraint_variables.md

**Description**:
The protocol enforces `MAX_COMBINED_FEE_BPS = 5000` (50%), meaning management fee + performance fee cannot exceed 50% in aggregate. Additionally, the protocol treasury can take `MAX_PROTOCOL_FEE_SPLIT_BPS = 5000` (50%) of the collected fees.

**At maximum configuration**:
- `managementFeeBps = 500` (5% annual AUM)
- `performanceFeeBps = 4500` (45% of profits, to stay within combined cap)
- `protocolFeeSplitBps = 5000` (50% of fees go to protocol)

**Annual cost computation for a vault with $1M AUM earning 20% gross returns**:

Step 1 — Management fee:
- Fee shares minted = `totalShares × 500 / 10000 × elapsed / 365 days` continuously
- Annual dilution = 5% of AUM = $50,000 → after protocol split: $25,000 agent + $25,000 protocol

Step 2 — Performance fee on $200,000 profit:
- Fee shares = `(currentPps - hwm) / currentPps × totalShares × 4500 / 10000`
- Performance fee = 45% × $200,000 = $90,000 → after protocol split: $45,000 agent + $45,000 protocol

Step 3 — Net to depositor:
- Gross profit: $200,000
- Management fee: $50,000
- Performance fee: $90,000
- **Net depositor profit: $60,000 on $1M (6% effective return on 20% gross)**
- Total extracted: 70% of gross profit

**Design Assumption Tested**: `MAX_COMBINED_FEE_BPS = 5000` prevents excessive extraction.

**Finding**: The combined cap of 50% applies only to the mgmt+perf BPS sum. It does NOT cap the **effective extraction rate** on gross returns, which reaches 70% of profits at maximum settings. The protocol claims the combined cap prevents "75% of gross profit extraction" (per contract comment), but at 5% management + 45% performance + 50% protocol split, effective extraction approaches 70% of gross returns at moderate yield rates (20% annual), and approaches 50% of **AUM** at low-yield environments.

**Economic boundary for depositors**: At maximum fees with 5% gross annual return, depositors receive negative real returns after fees:
- Gross return on $1M: $50,000
- Management fee: $50,000
- Performance fee: $22,500 (45% × $50K)
- **Net to depositor: -$22,500 (negative real return)**

This is a DESIGN LIMIT, not a code bug — the fee caps technically allow configurations that are net-negative for depositors at normal yield levels.

**Evidence**:
```solidity
// KernelVault.sol:L689-690 — combined cap enforced
if (mgmtBps + perfBps > MAX_COMBINED_FEE_BPS) {
    revert CombinedFeeTooHigh(mgmtBps + perfBps, MAX_COMBINED_FEE_BPS);
}
// But protocolFeeSplitBps is NOT included in the combined cap:
// setProtocolTreasury allows up to 5000 bps independently
```

---

## Finding [DST-4]: Bond System Economics Become Unprofitable for Legitimate Operators Below a Minimum TVL Threshold

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,5 | ✗4(N/A)
**Rules Applied**: [R10:✓, R5:✗(single operator), R15:✗(no flash loan path)]
**Depth Evidence**: [BOUNDARY: minBond=1e27 WSTON (1 WSTON), challengeWindow=1h, proofGenerationTime=10m. Breakeven TVL computed below.]
**Severity**: Medium
**Location**: OptimisticKernelVault.sol:L344-352, WSTONBondManager.sol:L55

**Description**:
**Design Assumption**: The bond-to-TVL ratio deters economic attack. Operators who would extract vault TVL must stake a bond ≥ `minBond`, which will be slashed if no proof is submitted.

**Stress test: At what TVL does the bond system STOP deterring malicious behavior?**

Parameters (from deployed state per MEMORY.md and code):
- `minBondFloor` in WSTONBondManager = 1e27 (approximately 1 WSTON on Ethereum mainnet)
- WSTON value ≈ 1 TON (approximately $2–5 USD at typical prices)
- `challengeWindow` = 1 hour (minimum = 30 minutes)
- Slash distribution: 10% finder + 80% vault + 10% treasury

**Profitable attack threshold**:
An operator can profitably drain a vault if:
```
vault_TVL_extracted × attack_success_probability > bond_value_at_risk
```

With `slashPending` flag (H-02 fix), the only timing vulnerability requires the relayer to be offline. But the DESIGN LIMIT is:

If vault TVL < minBond_value, the operator has NO economic incentive to attack (bond > TVL). But:
- `minBond` is set per-vault by the vault owner, not globally enforced as a fraction of TVL.
- `minBondFloor` = 1e27 ≈ 1 WSTON ≈ $2–5. This is a trivially small absolute number.
- A vault with $10,000 TVL and `minBond = 1 WSTON` ($5) has a bond-to-TVL ratio of **0.05%**.
- A vault owner who is ALSO the operator can drain $10,000 for a $5 loss — a 2000x return.

**Design gap**: There is no protocol-level enforcement that `minBond` must be a minimum FRACTION of vault TVL. The vault owner sets `minBond` independently of TVL. The entire deterrence model breaks if the vault owner (who is FULLY_TRUSTED) is also the operator — there is no adversarial check between vault owner and operator roles.

**Recovery scenario for legitimate relayer offline attack (DST-5 companion)**:
If the relayer is legitimately offline and `slashPending` was NOT set before the 90-day expiry:
- Operator drains vault via malicious `executeOptimistic` (attacker IS vault owner)
- `slashExpired` fires on HyperEVM — relayer is offline, cannot call `slashBondByRelayer` on L1
- `slashPending` was not set (relayer offline from the start)
- After 90 days: operator calls `reclaimExpiredBond` → gets full bond back
- Net loss to operator: 0 (minus gas costs)
- Net loss to depositors: 100% of TVL

**Economic calculation at production minBondFloor**:
- Deployed `minBondFloor` per MEMORY.md: 1e27 (1 WSTON)
- Required TVL for bond deterrence to work (bond ≥ 50% TVL minimum): `1 WSTON × 2 = 2 WSTON` of TVL = ~$10
- Any vault with TVL > ~$10 and `minBond = 1 WSTON` is economically exploitable if the relayer is offline.

**Impact**: The bond system's deterrence depends entirely on vault owners setting `minBond` to a meaningful fraction of TVL. There is no protocol enforcement of this ratio. Small vaults (< $5000 TVL) with default `minBond` near the floor have essentially no slash deterrence.

---

## Finding [DST-5]: Relayer Offline for Full Challenge Window Enables Zero-Penalty TVL Drain

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,5 | ✗4(N/A)
**Rules Applied**: [R10:✓, R4:✓, R5:✗(single vault), R6:✓, R8:✓]
**Depth Evidence**: [TRACE: executeOptimistic → 1h challenge window → slashExpired → ExecutionSlashed event → relayer offline → no slashBondByRelayer on L1 → 90d → reclaimExpiredBond succeeds if slashPending not set]
**Severity**: High
**Location**: OptimisticKernelVault.sol:L293-307, WSTONBondManager.sol:L487-514, design_context.md INV-9

**Description**:
**Design Assumption Being Tested**: "The relayer is a single point of failure — if the relayer goes offline permanently, operators need a way to recover locked capital" (design_context.md INV-9 implication).

The protocol implicitly assumes the relayer's downtime is bounded and tolerable. This finding computes the exact failure scenario where the relayer offline duration intersects with the 90-day bond expiry.

**Full attack sequence with timing**:

1. T=0: Operator (vault owner) executes malicious `executeOptimistic`, draining vault TVL. Bond is locked on L1 via `lockBondDirect`.
2. T=0 to T=1h: Challenge window. Operator does NOT submit proof.
3. T=1h: Anyone calls `slashExpired(nonce)` on HyperEVM → emits `ExecutionSlashed` event. Pending execution marked as `STATUS_SLASHED`.
4. T=1h to T=90d: Relayer MUST call `slashBondByRelayer` on L1. If relayer is offline, this never happens.
5. The H-02 fix (`slashPending` flag) requires the relayer to call `markSlashPending` BEFORE the 90-day expiry. If the relayer is offline, this never happens either.
6. T=90d (lockedAt + BOND_EXPIRY): Operator calls `reclaimExpiredBond` on L1. Since `slashPending[operator][vault][nonce] = false` (never set), the call succeeds. Operator recovers full bond.
7. Net result: 100% TVL drained, 0% economic penalty.

**The H-02 fix (slashPending flag) only works if**:
- The relayer observes the `ExecutionSlashed` event on HyperEVM AND
- The relayer calls `markSlashPending` on L1 within 90 days AND
- The relayer is online for this purpose

If the relayer is offline from T=0 onwards, the H-02 fix provides zero protection. The `slashPending` flag is never set, so `reclaimExpiredBond` is callable at T=90d.

**Design limit boundary**:
- Safe relayer uptime requirement: relayer must be online at least ONCE within 90 days of ANY `ExecutionSlashed` event.
- 90 days = 7,776,000 seconds. This is a very long downtime to protect against — typical infrastructure SLAs are 99.9% uptime (~8.7 hours/year offline).
- However, a TARGETED outage (e.g., DoS attack on the relayer infrastructure precisely when the 90-day window is approaching) is a concrete threat model.

**Residual risk**: After all fixes (H-02), the system remains vulnerable to a scenario where:
- A malicious operator IS ALSO the vault owner (both roles, which is the standard deployment pattern)
- The relayer is knocked offline via DoS for the ~1-hour window immediately after `slashExpired`
- The `markSlashPending` call never lands on L1
- The operator waits 90 days and reclaims

The design assumes the relayer is independently operated and monitored. No protocol-level enforcement of this independence exists.

**Evidence**:
```solidity
// WSTONBondManager.sol:L487-499
function reclaimExpiredBond(address vault, uint64 nonce) external nonReentrant {
    // ...
    if (slashPending[msg.sender][vault][nonce]) {
        revert UnresolvedSlashPending();
    }
    // If slashPending was never set (relayer offline), falls through:
    uint256 expiry = bond.lockedAt + BOND_EXPIRY; // 90 days
    if (block.timestamp < expiry) {
        revert BondNotExpired(bond.lockedAt, expiry, block.timestamp);
    }
    // Bond returned to operator — zero penalty
```

---

## Finding [DST-6]: Emergency Settle Minimum Recovery Time is 7 Days; Strategy Cannot Self-Terminate

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,5 | ✗4(N/A)
**Rules Applied**: [R10:✓, R8:✗(single-step)]
**Depth Evidence**: [BOUNDARY: strategyActivatedAt = T → emergencySettle callable at T+7d → withdraw callable → total minimum recovery = 7d. Can be extended by repeated vault deployment cycles.]
**Severity**: Medium
**Location**: KernelVault.sol:L1452-1458, KernelVault.sol:L1461-1473

**Description**:
**Design Assumption**: "EMERGENCY_SETTLE_DELAY (7 days) is the recovery floor. After emergency settle, depositors can withdraw normally."

**Stress test: What happens if the owner disappears?**

Timeline with owner disappearance at T=0 (strategy active):
1. T=0: Owner disappears. Strategy is active (funds deployed to adapter).
2. T=0 to T+7d: Depositors CANNOT withdraw (strategy active → `DepositsLockedDuringStrategy` for new deposits; withdrawals use `effectiveTotalAssets = snapshotTotalAssets` — but funds are not in the vault). During active strategy, `_processWithdraw` uses `snapshotTotalAssets` for PPS but checks actual available balance. If funds are deployed (vault balance = 0), withdrawals revert with `InsufficientAvailableAssets`.
3. T+7d: Anyone calls `emergencySettle()`. This clears `strategyActive = false` and restores live accounting.
4. HOWEVER: If the adapter funds are not returned to the vault (they're still in Aave, Hyperliquid, etc.), `totalAssets()` still reflects the deployed assets, but the vault's `asset.balanceOf(this)` is near zero.
5. Depositors who call `withdraw()` after `emergencySettle` will compute their share correctly, but the transfer call (`safeTransfer`) will fail because the vault doesn't hold enough liquid assets.

**Extended scenario**: After `emergencySettle`, the vault no longer has a live agent. Without an active operator:
- Assets remain stranded in adapter contracts (Aave positions, Hyperliquid sub-account, etc.)
- The vault contract itself has no permissionless "return assets" function
- Only the vault owner (missing) can call adapter functions to recover assets

**Recovery floor**: 7 days minimum. Recovery CEILING: indefinite if adapter recovery requires owner action.

**Design gap**: The protocol documents `EMERGENCY_SETTLE_DELAY` as the recovery mechanism, but `emergencySettle` only changes the `strategyActive` flag — it does NOT pull assets back from adapters. Depositors may complete emergency settle and then find they cannot withdraw because assets remain stranded in external protocols.

For the MetaVault layer, `emergencyWithdraw` routes through each underlying `emergencyWithdraw`, which has a 14-day delay from `pausedAt`. So MetaVault depositors face:
- 14-day delay from first pause + 7-day strategy delay = up to 21 days minimum recovery
- Both delays must be satisfied independently

**Evidence**:
```solidity
// KernelVault.sol:L1452-1458
function emergencySettle() external {
    if (!strategyActive) revert StrategyNotActive();
    uint256 earliest = strategyActivatedAt + EMERGENCY_SETTLE_DELAY;
    if (block.timestamp < earliest) {
        revert EmergencySettleTooEarly(earliest, block.timestamp);
    }
    _settle();  // clears strategyActive — but does NOT pull assets from adapters
}
```

---

## Finding [DST-7]: HyperliquidAdapter Has No Enumeration Cap — 100 Vaults Sharing One Adapter Would Cause Gas Exhaustion

**Verdict**: PARTIAL
**Step Execution**: ✓1,2,3 | ✗4(adapter code not fully analyzed) | ✗5(N/A)
**Rules Applied**: [R10:✓, R14:✗(no aggregate variable here)]
**Depth Evidence**: [BOUNDARY: If 100 vaults share a HyperliquidAdapter, any iteration over registered vaults in the adapter is O(N)]
**Severity**: Low
**Location**: src/adapters/HyperliquidAdapter.sol

**Description**:
**Design Assumption**: The HyperliquidAdapter and TradingSubAccount architecture assumes a bounded number of vaults per adapter. This assumption is implicit — no cap is documented.

Per the architecture (CLAUDE.md): "HyperliquidAdapter routes CALL actions to per-vault TradingSubAccount contracts." Each vault gets its own TradingSubAccount. If the adapter stores a mapping of vault → sub-account, storage reads are O(1) per vault. However:

1. The adapter may need to iterate registered vaults for cleanup or accounting operations.
2. The CoreWriter precompile's non-atomic nature means each sub-account must be independently monitored.
3. If any `onlyOwner` function iterates the registered sub-account list (e.g., a batch operation), 100 vaults × sub-account call overhead could exceed HyperEVM's 3M gas limit.

**Design limit boundary**:
- HyperEVM block gas limit: 3,000,000
- Typical adapter function call overhead: ~30,000–50,000 gas per vault
- Safe batch limit: 3,000,000 / 50,000 = **60 vaults per batch operation**
- With 100 vaults: batch operations OOG

This is PARTIAL because the specific HyperliquidAdapter iteration patterns require reading the full source (not available in this analysis), but the design principle of sharing one adapter across many vaults lacks any documented maximum.

**Impact**: Liveness degradation for large-scale deployments. Not fund loss.

---

## Finding [DST-8]: AgentRegistry.unregister() Capped at 50 Vaults Creates Permanent Registry Pollution at Scale

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,5
**Rules Applied**: [R10:✓, R14:✗(registry entry count, not accounting variable)]
**Depth Evidence**: [BOUNDARY: 1000 agents × 50+ vaults each → unregister() reverts with TooManyVaultsToUnregister for any agent with >50 deployed vaults]
**Severity**: Informational
**Location**: AgentRegistry.sol:L39, L301

**Description**:
`MAX_VAULTS_PER_UNREGISTER = 50`: `unregister()` checks up to 50 vaults for the agent being unregistered. If any vault has >0 assets (protects against unregistering active agents), the call reverts with `TooManyVaultsToUnregister`.

**Scale stress test**: A popular agent (e.g., a well-performing yield strategy agent) that has been deployed to 200 vaults by different operators:
1. The agent author wants to deprecate v1 in favor of v2.
2. `unregister()` iterates up to 50 vaults.
3. If any of the 200 vaults still holds >0 assets, the call reverts.
4. Even if all 200 vaults are empty, the author cannot unregister in a single call — they'd need to call `unregister()` 4 times.

**Additionally** (per finding INV-43): "1-wei deposit permanently blocks `AgentRegistry.unregister()`". Any vault with 1 wei of assets blocks the unregistration. Since vault owners are UNTRUSTED (can be any depositor), any depositor in any of the 200 vaults can permanently block the agent from being unregistered by maintaining a 1-wei balance.

**Design gap**: The `MAX_VAULTS_PER_UNREGISTER = 50` cap was added to prevent OOG, but it creates a permanent griefing surface at scale. The protocol provides no alternative (e.g., batch-deprecate with pagination, or deprecate-and-ignore-remaining).

**Evidence**:
```solidity
// AgentRegistry.sol:L39
uint256 public constant MAX_VAULTS_PER_UNREGISTER = 50;
```

---

## Finding [DST-9]: Depositor Can Time Deposits Against Strategy Activation Window to Extract Value From Other Depositors

**Verdict**: PARTIAL
**Step Execution**: ✓1,2,3 | ?4(incomplete — requires MEV analysis) | ✓5
**Rules Applied**: [R4:✓, R5:✓, R8:✓, R10:✓, R13:✓]
**Depth Evidence**: [BOUNDARY: Deposit immediately before execute() at t=0 → depositor gets shares at pre-execution PPS. If execute() increases PPS (profitable trade), depositor immediately profits from trade they did not fund.]
**Severity**: Medium
**Location**: KernelVault.sol:L820-864, KernelVault.sol:L1036

**Description**:
**Design Assumption**: "Deposits are locked while a strategy is active (prevents yield dilution)." The `DepositsLockedDuringStrategy` guard prevents deposits during active strategy.

**But the window between execute() clearing strategyActive and a new execute() is an exploitable gap:**

1. Vault has no active strategy (between execution cycles). Deposits are OPEN.
2. The vault owner's next execution is deterministic (running on a schedule, visible via mempool or timing analysis).
3. A depositor monitors the mempool for `execute()` transactions.
4. The depositor front-runs `execute()`: deposits just before the profitable execution is applied.
5. `execute()` applies a profitable trade — PPS increases.
6. The depositor immediately withdraws at the new higher PPS, capturing the profit with zero risk exposure.

**40% cap analysis**: The `MAX_CALL_ASSET_DELTA_BPS = 4000` (40%) cap means a single execution can move at most 40% of vault assets. A depositor entering with 10% of TVL just before a profitable execution that returns 40% gains 40% × 10% = 4% of TVL they just deposited. If they deposited $100K, they extract $4K in one transaction.

**Precondition Analysis**:
- The vault must not have `strategyActive = true` (execution window must have JUST closed).
- The depositor must be able to predict WHEN the next profitable execution will be submitted (observable from agent logic, timestamps, or oracle data that the agent uses).
- HyperEVM has sequencer MEV considerations — front-running may be harder than on L1.

**Why PARTIAL**: The front-running window exists by design (deposits intentionally blocked only DURING strategy, not BEFORE). The question of economic feasibility depends on:
- How predictable the execution timing is (high for algorithmic agents)
- HyperEVM's sequencer properties (not fully analyzed here)
- Gas costs vs. profit extraction ratio

**Impact**: Dilution of existing depositors' returns by late joiners who time deposits around profitable executions. This is a known ERC4626-adjacent design pattern tension.

**Evidence**:
```solidity
// KernelVault.sol:L820-821 — deposits blocked DURING strategy, not before execution
function depositERC20Tokens(uint256 assets) external nonReentrant whenNotPaused returns (uint256 sharesMinted) {
    if (strategyActive) revert DepositsLockedDuringStrategy();
```

---

## Finding [DST-10]: Vault-Level minBond Has No TVL-Proportional Floor — Bond Deterrence Breaks at Any TVL if Owner Colludes with Operator

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,5 | ✗4(N/A)
**Rules Applied**: [R6:✓, R10:✓, R4:✓, R15:✗(no flash loan path)]
**Depth Evidence**: [BOUNDARY: minBond = 1 WSTON = ~$5. Vault TVL = $1M. Bond-to-TVL ratio = 0.0005%. Profitable attack: drain $1M, lose $5 = 200,000x return on investment.]
**Severity**: High
**Location**: OptimisticKernelVault.sol:L344-352, WSTONBondManager.sol:L577-584

**Description**:
**Design Assumption**: "The bond mechanism deters malicious optimistic execution — operators who fail to submit proofs lose their bond, which compensates depositors."

**Stress test: Can an operator profitably default?**

The deterrence model requires:
```
expected_loss_from_slash ≥ expected_gain_from_drain
```

At maximum vault configuration:
- `minBond` (vault-level): set by vault owner, no minimum enforced relative to TVL
- `minBondFloor` (WSTONBondManager): ~1 WSTON ≈ $5 at production deployment
- Vault TVL: can be any amount — $1M, $10M, $100M

**At $1M TVL with minBond = 1 WSTON ($5)**:
- Operator stakes $5
- Operator executes malicious trade (drains vault)
- Operator fails to submit proof within `challengeWindow = 1h`
- Operator's bond is slashed: 10% ($0.50) to finder, 80% ($4) to vault, 10% ($0.50) to treasury
- Vault receives $4 on a $1M TVL drain
- **Depositors lose $999,996**

**Why the vault owner would not set a meaningful minBond**: In the standard deployment pattern, the vault owner IS the operator (agent author deploys vault, agent author is the operator). There is no adversarial check. The vault owner has every incentive to set `minBond` to the minimum to reduce their own capital at risk.

**No protocol-level safeguard**: 
- `WSTONBondManager.minBondFloor` is set by the BondManager owner (separate from vault owner) but is a global floor, not a per-vault TVL fraction.
- `KernelVault.setMinBond()` requires only `amount > 0` — no validation against current TVL.
- Depositors have no mechanism to force the vault owner to set a higher `minBond`.

**Design limit**: The optimistic execution security model is fundamentally trust-based at the vault level — it is not collateral-secured for TVL above `minBond`. The system is architecturally sound for large, well-capitalized operators (who set `minBond` ≫ TVL as reputation collateral), but provides near-zero deterrence for small vaults or vaults where owner=operator.

**Postcondition Analysis**:
**Postconditions Created**: Depositors lose TVL, operator retains extracted assets minus trivial bond.
**Postcondition Types**: BALANCE, EXTERNAL
**Who Benefits**: Malicious operator/vault owner in low-bond, high-TVL vaults.

**Evidence**:
```solidity
// OptimisticKernelVault.sol:L344-352
function setMinBond(uint256 amount) external {
    if (msg.sender != owner) revert NotOwner();
    if (amount == 0) revert InvalidMinBond();  // Only checks > 0
    minBond = amount;
    _emitConfig();
}
// No check: require(amount >= totalAssets() / 10, "bond too small for TVL");
```

---

## Summary Statistics

| Finding | Design Dimension | Severity | Verdict |
|---------|-----------------|----------|---------|
| DST-1 | Capacity | Medium | CONFIRMED |
| DST-2 | Capacity | Low | CONFIRMED |
| DST-3 | Economic | Medium | CONFIRMED |
| DST-4 | Economic | Medium | CONFIRMED |
| DST-5 | Timing | High | CONFIRMED |
| DST-6 | Timing | Medium | CONFIRMED |
| DST-7 | Scale | Low | PARTIAL |
| DST-8 | Scale | Informational | CONFIRMED |
| DST-9 | Adversarial | Medium | PARTIAL |
| DST-10 | Adversarial | High | CONFIRMED |

**Count by severity**: High: 2, Medium: 5, Low: 2, Informational: 1 = **10 total design stress findings**
