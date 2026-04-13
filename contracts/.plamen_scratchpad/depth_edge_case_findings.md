# Depth Edge Case Analysis

**Agent**: Depth Edge Case  
**Phase**: 4b Iteration 1  
**Methodology**: ZERO_STATE_RETURN skill, boundary substitution, parameter variation, trace-to-termination  

---

## Finding [DEPTH-EC-1]: TRANSFER_ERC20 Cap Uses Current Balance — H-03 Fix Bypass Allows Compound Drain

**Verdict**: CONFIRMED  
**Step Execution**: ✓1,2,3,4,5 | ✓6  
**Rules Applied**: [R4:✓, R5:✗(single vault), R6:✗(no role), R8:✗(single-step per action), R10:✓, R11:✗(no external tokens), R12:✓, R13:✗(not design-related), R14:✗(no settable constraints involved), R15:✗(no flash loan path), R16:✗(no oracle)]  
**Depth Evidence**: [BOUNDARY:N=10 → drain=99.4%], [BOUNDARY:N=20 → drain=99.997%], [BOUNDARY:N=64 → drain≈100%], [VARIATION:action_type CALL→TRANSFER_ERC20 → _executionInitialBalance guard bypassed], [TRACE:_executeTransferERC20 L1281 balanceBefore=totalAssets() CURRENT → not _executionInitialBalance → no cumulative cap enforced]  
**Severity**: High  
**Location**: `KernelVault.sol:L1264-1324` (`_executeTransferERC20`), contrast with `L1364-1437` (`_executeCall`)  

**Description**:  
The H-03 fix introduced `_executionInitialBalance` (captured once at the start of `_executeActions`, L1049) and applied a CUMULATIVE 40% drain cap in `_executeCall` (L1418-1424). However, `_executeTransferERC20` (the other action type for ERC20 movements) does **not** use `_executionInitialBalance`. Instead it reads `balanceBefore = totalAssets()` fresh on every action (L1281), then computes `maxAmount = (balanceBefore * MAX_CALL_VALUE_BPS) / BPS_DENOMINATOR` (L1290) — this is a per-action cap against the CURRENT balance, which decreases with each transfer.

**Evidence**:
```solidity
// _executeTransferERC20 (L1281-1293) — uses current balance, NOT _executionInitialBalance:
uint256 balanceBefore = totalAssets();           // recomputed each action
if (balanceBefore > 0) {
    uint256 maxAmount = (balanceBefore * MAX_CALL_VALUE_BPS) / BPS_DENOMINATOR;
    if (amount > maxAmount) revert CallValueExceedsLimit(amount, maxAmount);
}

// _executeCall (L1418-1424) — correctly uses _executionInitialBalance:
uint256 cumulativeDrain = _executionInitialBalance > balanceAfter
    ? _executionInitialBalance - balanceAfter : 0;
uint256 maxDelta = (_executionInitialBalance * MAX_CALL_ASSET_DELTA_BPS) / BPS_DENOMINATOR;
if (cumulativeDrain > maxDelta) revert CallAssetDeltaExceedsLimit(cumulativeDrain, maxDelta);
```

#### Real Constants
| Constant | Value | Source |
|----------|-------|--------|
| MAX_ACTIONS_PER_OUTPUT | 64 | KernelOutputParser.sol:L19 |
| MAX_CALL_VALUE_BPS | 4000 (40%) | KernelVault.sol:L105 |
| _executionInitialBalance | set once at start of _executeActions | KernelVault.sol:L1049 |

#### Concrete Calculations — Compound Drain via 64 TRANSFER_ERC20 Actions

Starting balance `B₀`. Each TRANSFER_ERC20 action drains 40% of current balance:
- After action 1: B₁ = B₀ × 0.60 (drained 0.40 × B₀)
- After action 2: B₂ = B₀ × 0.60² (cumulative drain = 1 - 0.60²  = 64%)
- After action 10: B₁₀ = B₀ × 0.60¹⁰ = B₀ × 0.00605 → **drain = 99.4%**
- After action 20: B₂₀ = B₀ × 0.60²⁰ = B₀ × 0.0000366 → **drain = 99.997%**
- After action 64: B₆₄ = B₀ × 0.60⁶⁴ ≈ B₀ × 10⁻¹⁴ → **drain ≈ 100%**

With a $1,000,000 vault: 10 TRANSFER_ERC20 actions drain $994,000 in a single transaction. The `_executionInitialBalance` guard — which caps `_executeCall` at 40% cumulative — does not apply.

**Impact**: A malicious or compromised zkVM guest (via proof forgery, e.g. CVE-2025-52484 as documented in the C-04 comment block) can encode 64 TRANSFER_ERC20 actions and drain virtually the entire vault in a single execute() call. This undermines the core defense-in-depth purpose of the H-03 fix: the comment at L1047 explicitly states "cumulative drain across ALL actions is capped at 40%", but this cap only holds for CALL actions. The token outflow cap documented in L108 ("applied to BOTH ETH and ERC20 vaults") is misleading — it refers to `_executeCall`'s post-call delta check, not to TRANSFER_ERC20.

**INVARIANT CONSISTENCY CHECK**: The design context (INV-6 Implication) states "the vault trusts the agent + constraints to output safe targets." The H-03 comment explicitly documents the 40% cap as a HARD limit. This finding shows the cap is incomplete — TRANSFER_ERC20 bypasses the cumulative guard entirely. No operational implication contradicts this — the fix was applied selectively.

### Postcondition Analysis
**Postconditions Created**: Vault drained to near-zero in single transaction; depositors lose funds  
**Postcondition Types**: [BALANCE, STATE]  
**Who Benefits**: Attacker with a valid-but-malicious proof (compromised zkVM guest)

---

## Finding [DEPTH-EC-2]: Zero-State Re-Deposit — `initialPps` / Performance Metrics Not Reset on Full Withdrawal

**Verdict**: CONFIRMED  
**Step Execution**: ✓1,2,3,5 | ✗4(N/A — no external dependency)  
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗(no external tokens), R12:✗(no dangerous precondition), R13:✓, R14:✗(no settable limits), R15:✗, R16:✗]  
**Depth Evidence**: [BOUNDARY:totalShares=0 → _resetFeeEpochIfEmpty clears highWaterMark+lastFeeTimestamp but NOT initialPps/peakPps/maxDrawdownBps], [TRACE:deposit L844 initialPps==0 check → first-ever deposit sets initialPps, subsequent re-deposits after drain do NOT reset], [VARIATION:vault lifecycle: deposit→full_drain→re-deposit → initialPps reflects prior generation's PPS, not fresh start]  
**Severity**: Low  
**Location**: `KernelVault.sol:L1225-1230` (`_resetFeeEpochIfEmpty`), `L844-848` (initialPps init check)  

**Description**:  
When all depositors withdraw and `totalShares` reaches 0, `_resetFeeEpochIfEmpty()` correctly resets `highWaterMark = 0` and `lastFeeTimestamp = 0` so the new cohort gets a fresh fee epoch. However, performance tracking variables — `initialPps`, `initialPpsTimestamp`, `peakPps`, `maxDrawdownBps`, `executionWins`, `totalExecutionCount`, `ppsCheckpointValues[]`, `ppsCheckpointIndex` — are **not reset**.

The initialization guard at L844 (`if (initialPps == 0)`) fires only when `initialPps` has never been set (first-ever deposit in the vault's lifetime). After a full drain, `initialPps != 0` still holds from the prior generation. When new depositors arrive, `getPerformanceMetrics()` returns stale data from the prior vault generation, potentially showing:
- `initialPps` anchored at an old generation's starting price  
- `peakPps` from the prior strategy  
- `maxDrawdownBps` accumulated across both generations  
- Circular `ppsCheckpointValues[]` buffer populated with old data

#### Real Constants
```solidity
function _resetFeeEpochIfEmpty() internal {
    if (totalShares == 0) {
        highWaterMark = 0;      // RESET ✓
        lastFeeTimestamp = 0;   // RESET ✓
        // initialPps NOT RESET
        // peakPps NOT RESET
        // maxDrawdownBps NOT RESET
        // ppsCheckpointValues NOT RESET
    }
}

// depositERC20Tokens L844-848:
if (initialPps == 0) {       // Only fires on vault's first-ever deposit
    uint256 pps = currentPps();
    initialPps = pps;
    initialPpsTimestamp = block.timestamp;
    peakPps = pps;             // peakPps only reset here
}
```

**Impact**: Depositors and off-chain monitoring systems reading `getPerformanceMetrics()` see misleading data from a prior vault generation. In particular, `maxDrawdownBps` from a prior generation's losses appears as the current vault's drawdown, potentially deterring new depositors. `peakPps` from a prior profitable run may prevent `peakPps` from being set correctly for the current generation. The fee collection logic is unaffected (`highWaterMark` is reset correctly). This is primarily an observability/reporting issue — no funds are at risk.

**INVARIANT CONSISTENCY CHECK**: INV-7 (Share/Asset Ratio) is not violated since fee epoch resets are correct. INV-11 (HWM Monotonicity) is correctly preserved. The impact is limited to performance reporting accuracy.

### Postcondition Analysis
**Postconditions Created**: Stale performance metrics visible to new depositors  
**Postcondition Types**: [STATE]  
**Who Benefits**: No direct attacker benefit; impact is informational misleading

---

## Finding [DEPTH-EC-3]: MetaVault Emergency Withdrawal Bypasses `trackedIdle` — Leaves NAV Accounting Consistent But Strands Proceeds if Underlying reverts Mid-Loop

**Verdict**: PARTIAL  
**Step Execution**: ✓1,2,3,5 | ✗4(no precondition needed for the accounting gap) | ?6(impact depends on whether intermediate revert strands tracked)  
**Rules Applied**: [R4:✓, R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗(no external tokens), R12:✗, R13:✗, R14:✗, R15:✗, R16:✗]  
**Depth Evidence**: [TRACE:MetaVault.emergencyWithdraw L335-344 → KernelVault.emergencyWithdraw sends tokens to MetaVault → delta = balanceOf AFTER - balBefore → MetaVault immediately forwards to caller → trackedIdle NOT incremented], [BOUNDARY:all underlyings revert except last → only idleShare pays out → remaining shares burned with no recovery → user loses pro-rata claim on all underlying vaults], [VARIATION:underlying vault emergencyWithdraw succeeds → assets forwarded correctly; underlying vault reverts → shares burned, assets NOT recovered]  
**Severity**: Medium  
**Location**: `MetaVault.sol:L281-348` (`emergencyWithdraw`), specifically L336-344 (try-catch per vault)  

**Description**:  
MetaVault's `emergencyWithdraw` burns meta shares BEFORE attempting underlying vault withdrawals (L304-305). It then attempts each underlying KernelVault's `emergencyWithdraw` via try-catch (L336-344). For each success, assets are forwarded to the caller via `baseAsset.safeTransfer(msg.sender, delta)` — these assets pass through MetaVault and are forwarded without updating `trackedIdle`. For each failure, the underlying vault's `kvSharesToBurn` shares are skipped with an event, but those shares are already burned from `totalShares` and `shares[msg.sender]`.

**The core asymmetry**: shares are burned UNCONDITIONALLY (L304-305 precedes the per-vault loop), but asset recovery is CONDITIONAL on each underlying vault's emergencyWithdraw succeeding. If an underlying KernelVault's `emergencyWithdraw` reverts (e.g., the vault is not paused or the 14-day delay has not elapsed), the caller loses the pro-rata claim corresponding to that vault's allocation **permanently** — their MetaVault shares were already burned.

#### Concrete Trace

State: MetaVault with 2 underlying vaults A and B, each with 50% allocation. MetaVault totalShares = 1000. User has 500 shares. trackedIdle = 0. Vault A is paused + 14-day delay elapsed. Vault B is paused but 14-day delay NOT elapsed (paused 10 days ago).

1. `emergencyWithdraw(500)` called
2. L304-305: shares[user] -= 500, totalShares = 500 (shares BURNED)
3. L310: idleShare = 0 (trackedIdle = 0)
4. L332: kvSharesToBurn for vault A = (shareA * 500) / 1000 = shareA/2
5. L336: `this._emergencyWithdrawExternal(vaultA, shareA/2)` — SUCCESS, user receives 50% of vault A allocation
6. L332: kvSharesToBurn for vault B = (shareB * 500) / 1000 = shareB/2
7. L336: `this._emergencyWithdrawExternal(vaultB, shareB/2)` — REVERTS (14-day delay not elapsed)
8. L342-344: `emit UnderlyingWithdrawFailed(vaultB, shareB/2)` and skip
9. Result: User burned 500 shares and received only vault A's portion (≈50% of their claim). Vault B's MetaVault-held shares are still intact on the KernelVault — they belong to the MetaVault contract — but the user's MetaVault shares are gone.

[CROSS-DOMAIN-DEP: temporal — impact depends on whether all underlyings have satisfied the 14-day emergency withdraw delay simultaneously]

**Missing Precondition**: Not all underlying KernelVaults have their emergency withdraw delay elapsed.

### Precondition Analysis
**Missing Precondition**: All underlying KernelVault pause delays must have elapsed  
**Precondition Type**: TIMING  
**Why This Blocks**: If any underlying hasn't satisfied its 14-day delay, that portion is unrecoverable to the user while shares are burned

### Postcondition Analysis
**Postconditions Created**: User's shares burned; partial asset recovery; remaining MetaVault shares are the remaining depositors' claim on unrecovered underlying assets  
**Postcondition Types**: [STATE, BALANCE, TIMING]  
**Who Benefits**: Remaining MetaVault holders absorb the orphaned underlying vault shares

---

## Finding [DEPTH-EC-4]: Management Fee Zero-Duration Epoch — Same-Block Deposit + Fee Collection Charges 0 Fee But Advances `lastFeeTimestamp`

**Verdict**: CONFIRMED  
**Step Execution**: ✓1,2,3,5  
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗, R12:✗, R13:✓, R14:✗, R15:✗, R16:✗]  
**Depth Evidence**: [BOUNDARY:timeElapsed=0 → feeShares=0 AND lastFeeTimestamp advanced], [TRACE:deposit L856-857 → lastFeeTimestamp=block.timestamp → collectManagementFee() same block → timeElapsed = block.timestamp - block.timestamp = 0 → feeShares=0, lastFeeTimestamp=block.timestamp (no-op advance)], [VARIATION:collectManagementFee called 1 second vs 0 seconds after deposit → 0 shares vs floor(totalShares * 500 * 1 / (365 days * 10000)) shares = 0 for small vaults]  
**Severity**: Informational  
**Location**: `KernelVault.sol:L1849-1859` (`_collectManagementFee`)  

**Description**:  
When management fees are active and a deposit occurs in the same block as a fee collection attempt, `timeElapsed = block.timestamp - lastFeeTimestamp = 0` (L1849-1850), and `feeShares = 0` is returned at L1861 (after the unconditional timestamp advance at L1859). This is the L-19 fix behavior: advance the timestamp even when fee rounds to zero.

This is **by design** and functions correctly — the timestamp is advanced to prevent accumulation. However, there is an edge: when `lastFeeTimestamp` was just set at deposit time (L857), a same-block `collectManagementFee()` call correctly charges nothing AND advances the timestamp. The next collection will be anchored from that block, not from the initial deposit. This is fine for management fees (legitimate zero-charge) but creates a window where a depositor can prevent a pending fee collection by depositing in the same block as the fee collector attempts to call `collectManagementFee`, since the timestamp is advanced and the fee window resets.

**Impact**: A depositor who happens to deposit in the same block as a management fee collection (via MEV or coordination) causes the epoch to reset with no fee charged. Given that management fees are collected at low frequency (the formula divides by 365 days), and this requires same-block timing, the practical economic impact is negligible. Single block of management fee forgone at most.

---

## Finding [DEPTH-EC-5]: Management Fee with 1-Year Vault Inactivity — `_collectManagementFee` + `_resetFeeEpochIfEmpty` Interaction Prevents Retroactive Lump-Sum Correctly

**Verdict**: REFUTED  
**Step Execution**: ✓1,2,3  
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗, R10:✓, R11:✗, R12:✗, R13:✓, R14:✗, R15:✗, R16:✗]  
**Depth Evidence**: [TRACE:full vault drain → _resetFeeEpochIfEmpty sets lastFeeTimestamp=0 → re-deposit L856 sets lastFeeTimestamp=block.timestamp → new epoch starts fresh → timeElapsed for new epoch = 0 at deposit → correct], [VARIATION:1-year inactivity with NO drain (shares persist) → lastFeeTimestamp NOT reset → collectManagementFee after 1 year → timeElapsed = 365 days → feeShares = totalShares * 500 * 365 days / (365 days * 10000) = totalShares * 0.05 = 5% of shares minted as fee → correct and EXPECTED behavior]  
**Severity**: N/A (Not a finding)  

**Description**:  
Two separate scenarios analyzed:

**Scenario A: Full drain + 1-year inactivity + re-deposit**  
After all depositors exit (`totalShares = 0`), `_resetFeeEpochIfEmpty()` sets `lastFeeTimestamp = 0`. If the vault sits empty for 1 year and a new depositor arrives, L856 initializes `lastFeeTimestamp = block.timestamp` at deposit time. Management fee accrual begins from the re-deposit, not from the vault's creation. No retroactive fee. [CONFIRMED SAFE]

**Scenario B: Vault with funds, 1-year inactivity (no withdrawals, owner disappears)**  
`lastFeeTimestamp` remains set from the last collection/deposit. After 1 year, `timeElapsed = 365 days`. Fee charged = `totalShares * MAX_MANAGEMENT_FEE_BPS * 365 days / (365 days * 10000) = totalShares * 500 / 10000 = totalShares * 5%`. With `totalShares = S`, fee recipient receives `S * 0.05` new shares, diluting depositors by ~5%. This is the correct 5% annual management fee being charged correctly after 1 year of AUM.

[BOUNDARY: 1 year elapsed, managementFeeBps=500] → `feeShares = S * 500 * 31,536,000 / (31,536,000 * 10000) = S/20 = 5% of totalShares` → expected

The ACCUMULATION_EXPOSURE flagged in the assignment (priority #7) is REFUTED: the L-19 fix (unconditional timestamp advance) prevents accumulation; the `_resetFeeEpochIfEmpty` fix prevents retroactive charging after re-deposit; the `_settle()` M-01 fix advances `lastFeeTimestamp` to prevent strategy-period accumulation. All three vectors are covered.

---

## Finding [DEPTH-EC-6]: `executionNonce` uint64 Overflow — lastExecutionNonce=type(uint64).max Permanently Bricks Vault

**Verdict**: CONFIRMED  
**Step Execution**: ✓1,2,3,5  
**Rules Applied**: [R4:✓, R5:✗(single vault), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗, R12:✗, R13:✗, R14:✗, R15:✗, R16:✗]  
**Depth Evidence**: [BOUNDARY:lastExecutionNonce=type(uint64).max (18446744073709551615) → any providedNonce ≤ lastExecutionNonce → InvalidNonce revert → vault permanently unexecutable], [TRACE:_validateParsedJournal L1016 "if (providedNonce <= lastNonce) revert InvalidNonce" → when lastNonce=MAX_UINT64, ALL possible nonces satisfy providedNonce ≤ lastNonce → no valid nonce exists → vault bricked], [VARIATION:MAX_NONCE_GAP=10, lastNonce=type(uint64).max-9 → operator can execute 9 more times with nonces max-8..max → then last execute sets lastNonce=max → bricked]  
**Severity**: Medium  
**Location**: `KernelVault.sol:L1013-1023` (`_validateParsedJournal`), `L143` (`lastExecutionNonce` type `uint64`)  

**Description**:  
`lastExecutionNonce` is declared as `uint64`. The nonce validation at L1016 checks `if (providedNonce <= lastNonce) revert InvalidNonce`. When `lastNonce = type(uint64).max = 18,446,744,073,709,551,615`, there is no valid `uint64` value that satisfies `providedNonce > lastNonce`. The vault can never execute another action — it is permanently bricked from a proof-submission perspective.

#### Real Constants
```solidity
uint64 public constant MAX_NONCE_GAP = 10;         // L52
uint64 public lastExecutionNonce;                   // L143

// L1016-1022 validation:
if (providedNonce <= lastNonce) {
    revert InvalidNonce(lastNonce, providedNonce);   // triggers when lastNonce = MAX_UINT64
}
uint64 gap = providedNonce - lastNonce;             // wraps only if providedNonce < lastNonce (already guarded)
if (gap > MAX_NONCE_GAP) {
    revert NonceGapTooLarge(lastNonce, providedNonce, MAX_NONCE_GAP);
}
```

**Reachability**: Reaching `uint64` max requires approximately 18.4 × 10¹⁸ executions. With a conservative estimate of one proof per minute, this takes approximately 35 billion years — far beyond any practical vault lifetime. The overflow is theoretically possible but practically unreachable.

[CROSS-DOMAIN-DEP: access — requires vault owner to be able to keep submitting proofs]

**Practical Impact Assessment**: Given 18.4 × 10¹⁸ executions to overflow and realistic execution rates of at most a few thousand per day, this would take longer than the age of the universe. However, the lack of a guard is a latent design issue. If the design intent is MAX_NONCE_GAP=10 and an agent could somehow skip to near-max (e.g., via a very large initial nonce in the zkVM guest), the remaining guard `gap > MAX_NONCE_GAP` provides only a 10-nonce window before brick. The Rust guest controls nonce values — if a malicious or buggy guest produces nonce=type(uint64).max directly, the vault is immediately bricked after one such execution.

[BOUNDARY:providedNonce=type(uint64).max AND lastNonce=0 → gap = type(uint64).max = 18446744073709551615 > MAX_NONCE_GAP=10 → revert NonceGapTooLarge] — this means a single jump to max IS caught by the gap check. However, a sequence of MAX_NONCE_GAP advances could reach max: e.g., at `lastNonce = type(uint64).max - 1`, a `providedNonce = type(uint64).max` is valid (gap=1 ≤ 10) → sets `lastNonce = type(uint64).max` → vault bricked from next execution.

**INVARIANT CONSISTENCY CHECK**: INV-4 (Nonce Monotonicity) states "skipped nonces are PERMANENTLY lost." The overflow scenario is consistent with the documented operational implication. The INV-4 Implication does not address the final `lastNonce = max` terminal state. This is a latent design issue.

**Severity Adjustment**: Due to the extreme impracticality of reaching max nonce through normal execution, severity is Low in normal operation. However, if a buggy guest directly emits a near-max nonce, severity escalates to Medium (permanent vault execution halt). Rated Medium per R10 (worst-state).

### Postcondition Analysis
**Postconditions Created**: Vault execution permanently halted; depositors must use emergency paths  
**Postcondition Types**: [STATE]  
**Who Benefits**: No direct attacker benefit; operational failure mode

---

## Finding [DEPTH-EC-7]: MetaVault `deposit()` at NAV=0 with `totalShares > 0` — Mints Inflated Shares, Diluting Existing Holders

**Verdict**: CONTESTED  
**Step Execution**: ✓1,2,3 | ?4(reachability of NAV=0 with totalShares>0 requires specific preconditions), ?5(CROSS-DOMAIN-DEP)  
**Rules Applied**: [R4:✓, R5:✗(single MetaVault), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗, R12:✗, R13:✗, R14:✗, R15:✗, R16:✗]  
**Depth Evidence**: [BOUNDARY:nav=0, totalShares=S>0 → sharesOut = assets * (S + 1000) / 1 = assets * (S + 1000) → mints (S + 1000) × assets shares for assets deposited], [TRACE:getNav() L545-556 → idle=trackedIdle=0 + sum(_vaultAllocation()) → _vaultAllocation L604-619 → returns myShares=0 if MetaVault has 0 shares in all underlyings → NAV=0], [VARIATION:underlying vault sets trackedIdle=0 and MetaVault holds 0 shares → NAV=0 despite existing totalShares]  
**Severity**: Medium  
**Location**: `MetaVault.sol:L172-193` (`deposit`), `L545-556` (`getNav`)  

**Description**:  
The MetaVault uses the formula `sharesOut = assets * (totalShares + DECIMALS_OFFSET) / (nav + 1)` at L183. When `nav = 0` and `totalShares = S`, this becomes `sharesOut = assets * (S + 1000)`.

**How NAV=0 with totalShares>0 arises**: This occurs when:
1. MetaVault holds shares in underlying vaults (reflected via `_vaultAllocation`)  
2. ALL underlying KernelVaults have their strategies FULLY deployed (zero local `totalAssets()`) AND `effectiveTotalAssets()` also approaches zero  
3. OR: MetaVault holds 0 underlying shares AND `trackedIdle = 0` (all idle deposits have been deployed to underlyings that have since fully exited)

More concretely: if `trackedIdle = 0` AND all underlying KernelVaults have `shares[address(metaVault)] = 0` (either never deployed or fully withdrawn), then `getNav() = 0` even if `totalShares > 0`.

This state is reachable if:
- Rebalance deploys all idle to underlying vaults
- Owner calls `removeVault` on all underlyings (which redeems shares and adds to `trackedIdle`)
- Then `trackedIdle` is depleted via a normal `withdraw` that precisely zeros it
- State: `totalShares > 0` (remaining depositors haven't withdrawn), `trackedIdle = 0`, `underlyingVaults = []`

**Concrete attack scenario**: After NAV=0 is reached with `totalShares = S`, an attacker deposits `X` tokens → receives `X * (S + 1000)` shares — disproportionately large. The attacker now holds `X*(S+1000) / (S + X*(S+1000))` fraction of the total shares. When the original depositors recover their assets (if possible), the attacker takes a proportional cut.

[BOUNDARY:assets=1, totalShares=1000, nav=0 → sharesOut = 1 * (1000 + 1000) / 1 = 2000] — attacker gets 2000 shares for depositing 1 wei, existing 1000 shares now represent only 33% of the total.

**Missing Precondition Analysis**: Reaching NAV=0 with totalShares>0 requires a degenerate state where all MetaVault value has been deployed/withdrawn except the share count. The DECIMALS_OFFSET prevents this from being free — the first depositor at NAV=0 would get `assets * (S + 1000) / 1` shares which is only disproportionate if S is large. If original holders exit via withdraw() before NAV reaches 0, this state would reduce S.

[CROSS-DOMAIN-DEP: state — requires a specific operational sequence where MetaVault ends up with totalShares > 0 but zero NAV]

### Precondition Analysis
**Missing Precondition**: NAV=0 with totalShares>0 requires specific operational sequence (full deploy + full remove + precise idle drain)  
**Precondition Type**: STATE  
**Why This Blocks**: Normal operations would cause depositors to exit before NAV reaches exactly 0

### Postcondition Analysis
**Postconditions Created**: Inflated shares minted; existing holders diluted if underlying assets are later recovered  
**Postcondition Types**: [STATE, BALANCE]

---

## Finding [DEPTH-EC-8]: WSTONBondManager `reclaimExpiredBond` — Bond Expiry Boundary at Exactly `lockedAt + BOND_EXPIRY`

**Verdict**: CONFIRMED  
**Step Execution**: ✓1,2,3,5  
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗, R12:✗, R13:✗, R14:✗, R15:✗, R16:✗]  
**Depth Evidence**: [BOUNDARY:block.timestamp = lockedAt + BOND_EXPIRY exactly → "if (block.timestamp < expiry) revert BondNotExpired" → block.timestamp < expiry is FALSE → reclaim SUCCEEDS at exact boundary], [BOUNDARY:block.timestamp = lockedAt + BOND_EXPIRY - 1 → block.timestamp < expiry is TRUE → revert], [TRACE:reclaimExpiredBond L501-503 → expiry = bond.lockedAt + BOND_EXPIRY (90 days = 7,776,000 seconds) → strict less-than check → reclaim allowed AT and AFTER expiry]  
**Severity**: Informational  
**Location**: `WSTONBondManager.sol:L501-503` (`reclaimExpiredBond`)  

**Description**:  
The expiry check uses strict less-than (`block.timestamp < expiry`), meaning a bond CAN be reclaimed at the exact boundary second (`block.timestamp == expiry`). This is consistent and correct behavior (at the boundary, the bond has expired and reclaim should succeed). The operator can reclaim at `lockedAt + BOND_EXPIRY` seconds.

#### Real Constants
```solidity
uint256 public constant BOND_EXPIRY = 90 days;  // 7,776,000 seconds
// L501-503:
uint256 expiry = bond.lockedAt + BOND_EXPIRY;
if (block.timestamp < expiry) {
    revert BondNotExpired(bond.lockedAt, expiry, block.timestamp);
}
```

[BOUNDARY:block.timestamp=lockedAt+7776000 → block.timestamp < expiry is FALSE → reclaim allowed]  
[BOUNDARY:block.timestamp=lockedAt+7775999 → block.timestamp < expiry is TRUE → revert BondNotExpired]

**The H-02 Fix interaction**: The `slashPending` check at L497-499 PRECEDES the expiry check. This means: even if the bond is expired (90+ days old), if `slashPending[operator][vault][nonce] == true`, reclaim is blocked. The ordering is correct — slash-pending gate takes priority over expiry gate. There is no race condition at the boundary: if a relayer marks slash-pending at timestamp T, and the bond expires at T (same block), `reclaimExpiredBond` would revert on the slash-pending check before reaching the expiry check.

**Severity**: Informational — behavior is correct and boundary is well-defined. The strict less-than is appropriate.

---

## FINDING INDEX

| ID | Severity | Location | Title | Verdict |
|----|----------|----------|-------|---------|
| DEPTH-EC-1 | High | KernelVault.sol:L1264-1324 | TRANSFER_ERC20 compound drain bypasses H-03 cumulative cap | CONFIRMED |
| DEPTH-EC-2 | Low | KernelVault.sol:L1225-1230 | Performance metrics not reset on full-drain re-deposit | CONFIRMED |
| DEPTH-EC-3 | Medium | MetaVault.sol:L281-348 | Emergency withdraw shares burned before underlying recovery can fail | PARTIAL |
| DEPTH-EC-4 | Informational | KernelVault.sol:L1849-1859 | Same-block deposit+fee-collect charges zero fee (expected by design) | CONFIRMED |
| DEPTH-EC-5 | N/A | KernelVault.sol:L1839-1866 | 1-year vault inactivity fee accumulation — REFUTED by M-01/L-19 fixes | REFUTED |
| DEPTH-EC-6 | Medium | KernelVault.sol:L1013-1023 | uint64 nonce overflow permanently bricks vault (impractical but terminal) | CONFIRMED |
| DEPTH-EC-7 | Medium | MetaVault.sol:L172-193 | NAV=0 with totalShares>0 allows inflated share minting, diluting existing holders | CONTESTED |
| DEPTH-EC-8 | Informational | WSTONBondManager.sol:L501-503 | Bond expiry boundary check correct — reclaim allowed at exact expiry second | CONFIRMED |

---

## Chain Summary

| Finding ID | Location | Root Cause (1-line) | Verdict | Severity | Precondition Type | Postcondition Type |
|------------|----------|---------------------|---------|----------|-------------------|-------------------|
| DEPTH-EC-1 | KernelVault.sol:L1281 | TRANSFER_ERC20 uses per-action current balance, not initial balance for cap | CONFIRMED | High | None (design gap) | BALANCE |
| DEPTH-EC-2 | KernelVault.sol:L844 | initialPps/peakPps not in _resetFeeEpochIfEmpty | CONFIRMED | Low | STATE (totalShares=0) | STATE |
| DEPTH-EC-3 | MetaVault.sol:L304 | Shares burned before underlying recovery, partial failure not compensated | PARTIAL | Medium | TIMING (14-day delay) | BALANCE, STATE |
| DEPTH-EC-4 | KernelVault.sol:L1850 | timeElapsed=0 → zero fee + timestamp advance correct, enables MEV reset | CONFIRMED | Informational | TIMING (same block) | STATE |
| DEPTH-EC-5 | KernelVault.sol | Management fee accumulation during inactivity | REFUTED | N/A | N/A | N/A |
| DEPTH-EC-6 | KernelVault.sol:L1016 | uint64 lastExecutionNonce overflow = vault bricked | CONFIRMED | Medium | STATE (max nonce reached) | STATE |
| DEPTH-EC-7 | MetaVault.sol:L183 | NAV=0 with shares>0 mints inflated shares at deposit | CONTESTED | Medium | STATE (specific sequence) | BALANCE |
| DEPTH-EC-8 | WSTONBondManager.sol:L502 | Strict less-than expiry check boundary behavior | CONFIRMED | Informational | N/A | N/A |

---

## Coverage: 7/7 priority edge cases addressed (EC-1 through EC-8, with EC-5 being the inactivity fee analysis which resolves as REFUTED).

Priority case mapping:
1. PC1-1 (TRANSFER_ERC20 compound drain) → DEPTH-EC-1 (CONFIRMED High)
2. Zero-state re-deposit fee epoch reset → DEPTH-EC-2 (CONFIRMED Low) + DEPTH-EC-5 (REFUTED)
3. MetaVault NAV=0 with underlying assets → DEPTH-EC-7 (CONTESTED Medium)
4. WSTONBondManager bond expiry boundary → DEPTH-EC-8 (Informational)
5. MAX_NONCE_GAP / uint64 overflow → DEPTH-EC-6 (Confirmed Medium)
6. Zero-duration same-block fee collection → DEPTH-EC-4 (Informational)
7. Management fee 1-year inactivity → DEPTH-EC-5 (REFUTED)
