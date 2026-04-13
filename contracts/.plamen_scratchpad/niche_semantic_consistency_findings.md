# Niche Agent: Semantic Consistency Audit

**Agent**: Semantic Consistency Audit (NSC)
**Phase**: 4b Iteration 1
**Scope**: Cross-contract consistency of config variables, formulas, and magic numbers
**Focus Areas**: BPS_DENOMINATOR, DECIMALS_OFFSET, fee formula consistency, MAX_CALL_VALUE_BPS, oracle timestamp format

---

## Processing Protocol Execution Log

### CHECK 1: Config Variable Unit Consistency

**Entities Enumerated (BPS-related constants shared across 2+ contracts):**
1. `BPS_DENOMINATOR` — KernelVault, MetaVault, WSTONBondManager, PointsProgram, BuilderProgram, UniswapV4Adapter, MorphoAdapter (implicit via `10000`)
2. `DECIMALS_OFFSET` — KernelVault, MetaVault

**Processing:**
1. DONE — `BPS_DENOMINATOR`: divergent literal formatting across contracts (see NSC-1)
2. DONE — `DECIMALS_OFFSET`: same value (1e3 = 1000) in both KernelVault and MetaVault; consistent usage — N/A

**Coverage Gate:** 2/2 processed. ✓

---

### CHECK 2: Formula Semantic Drift

**Entities Enumerated (structurally similar arithmetic across 2+ locations):**
1. Deposit share formula — KernelVault vs MetaVault
2. Withdrawal asset formula — KernelVault vs MetaVault
3. MetaVault `_vaultAllocation` internal valuation vs KernelVault `_processWithdraw`
4. BPS cap enforcement for CALL actions vs TRANSFER_ERC20 actions within KernelVault
5. Management fee formula — uses `BPS_DENOMINATOR` constant vs inline `10000`
6. Performance fee formula — uses inline `10000` not `BPS_DENOMINATOR`
7. Protocol fee split formula — uses inline `10000` not `BPS_DENOMINATOR`

**Processing:**
1. DONE — Deposit formula: KernelVault uses `(actualReceived * (totalShares + _DECIMALS_OFFSET)) / (effectiveAssets + 1)` (L835); MetaVault uses `(actualReceived * (totalShares + DECIMALS_OFFSET)) / (nav + 1)` (L183). Semantically equivalent — N/A
2. DONE — Withdrawal formula: KernelVault `(shareAmount * (effectiveAssets + 1)) / (denomShares + _DECIMALS_OFFSET)` (L1141); MetaVault `(metaShares * (nav + 1)) / (totalShares + DECIMALS_OFFSET)` (L210). Semantically equivalent — N/A
3. DONE — MetaVault `_vaultAllocation` (L619): `(myShares * (vaultTotalAssets + 1)) / (vaultTotalShares + DECIMALS_OFFSET)`. Comment says "Same formula as KernelVault._processWithdraw". Consistent with KernelVault L1141 — N/A
4. DONE — Cap enforcement divergence between CALL and TRANSFER_ERC20: semantic drift found (see NSC-2)
5. DONE — Management fee: inline `10000` at L1853 instead of `BPS_DENOMINATOR`. Also `drawdownBps` at L1088 and `profitBps` at L1894 use `10000` inline. See NSC-3
6. DONE — Performance fee: `(10000 * 10000)` at L1897 — double-denominator structure. See NSC-3
7. DONE — Protocol fee split: inline `10000` at L1919. See NSC-3

**Coverage Gate:** 7/7 processed. ✓

---

### CHECK 3: Magic Number Consistency

**Entities Enumerated (magic numbers appearing in arithmetic):**
1. `10000` / `10_000` — BPS denominator across all contracts
2. `1e3` — DECIMALS_OFFSET, KernelVault and MetaVault
3. `1e18` — WAD precision in MorphoAdapter (L735) `(1e18 * 10000)` denominator
4. `10000` inline in KernelVault fee formulas (L1853, L1088, L1894, L1897, L1919)
5. `10000` inline in MorphoAdapter `HEALTH_FACTOR_BPS` division (L735)

**Processing:**
1. DONE — `10000` vs `10_000`: inconsistency found (see NSC-1)
2. DONE — `1e3`: same in both KernelVault (L42) and MetaVault (L41) — N/A
3. DONE — `1e18` in MorphoAdapter: `(1e18 * 10000)` is a combined denominator for `collatValueLoan * lltv * HEALTH_FACTOR_BPS`. The `10000` here scales `HEALTH_FACTOR_BPS` from BPS to a ratio. MorphoAdapter has no `BPS_DENOMINATOR` constant — uses implicit `10000`. Inconsistency with other adapters — see NSC-1
4. DONE — KernelVault inline `10000` in fee formulas: inconsistency found (see NSC-3)
5. DONE — MorphoAdapter inline `10000`: inconsistency with other adapters — see NSC-1

**Coverage Gate:** 5/5 processed. ✓

---

## Findings

---

## Finding [NSC-1]: BPS Denominator Literal Inconsistency Across Contracts

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3 | ✗4(N/A - single semantic role, no cross-contract value divergence) | ✓5
**Rules Applied**: [R14:✗(not a settable constraint - this is a constant), R13:✓]
**Severity**: Informational
**Location**: Multiple
- `WSTONBondManager.sol:L49` — `BPS_DENOMINATOR = 10000`
- `PointsProgram.sol:L55` — `BPS_DENOMINATOR = 10000`
- `MorphoAdapter.sol:L735` — implicit `10000` in denominator
- `KernelVault.sol:L282` — `BPS_DENOMINATOR = 10_000` (correct form)
- `MetaVault.sol:L44` — `BPS_DENOMINATOR = 10_000` (correct form)
- `UniswapV4Adapter.sol:L151` — `BPS_DENOMINATOR = 10_000` (correct form)
- `BuilderProgram.sol:L54` — `BPS_DENOMINATOR = 10_000` (correct form)

**Description**:
Two contracts define `BPS_DENOMINATOR` as the numeric literal `10000` (without underscore separator), while five contracts use the stylistically preferred `10_000` form. The **numeric value is identical** in all cases — this is not a value divergence but a **style and maintenance consistency gap**.

Additionally, `MorphoAdapter.sol` has no `BPS_DENOMINATOR` constant at all and uses the inline `10000` directly in `_checkVaultHealth()` at L735, making it an outlier relative to all other contracts in the codebase.

**Impact**:
- No runtime impact — both `10000` and `10_000` compile to the same value in Solidity.
- Maintenance risk: A future developer searching for `BPS_DENOMINATOR` in the codebase will miss `MorphoAdapter`'s implicit denominator. A refactor changing the BPS base (e.g., to `100_000` for finer-grained fees) would require updating 4 locations (`WSTONBondManager`, `PointsProgram`, `MorphoAdapter` inline, and any tests) that are not linked to `BPS_DENOMINATOR` by name.
- Code review friction: `10000` in `WSTONBondManager` and `PointsProgram` requires a reader to confirm the semantic role, while `BPS_DENOMINATOR = 10_000` in other contracts is self-documenting.

**Evidence**:
```solidity
// WSTONBondManager.sol:L49 — no underscore
uint256 public constant BPS_DENOMINATOR = 10000;

// PointsProgram.sol:L55 — no underscore
uint256 public constant BPS_DENOMINATOR = 10000;

// MorphoAdapter.sol:L735 — no named constant at all
uint256 maxBorrow = (collatValueLoan * lltv * HEALTH_FACTOR_BPS) / (1e18 * 10000);

// KernelVault.sol:L282 — preferred form
uint256 public constant BPS_DENOMINATOR = 10_000;

// MetaVault.sol:L44 — preferred form
uint256 public constant BPS_DENOMINATOR = 10_000;
```

**Consistency Type**: MAGIC_NUMBER_DRIFT (style, no value difference)

---

## Finding [NSC-2]: Asymmetric Cap Enforcement: CALL Actions Use Cumulative Delta Cap; TRANSFER_ERC20 Uses Per-Action Current-Balance Cap

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5,6,7
**Rules Applied**: [R10:✓, R5:✗(single contract), R14:✗(no settable constraint involved)]
**Depth Evidence**: [BOUNDARY: TRANSFER_ERC20 cap uses `balanceBefore` per-action, allowing cumulative drain beyond 40%], [TRACE: 3× TRANSFER_ERC20 each at 40% of current → cumulative drain = 1-(0.6)³ = 78.4% vs CALL cap fixed at 40%], [VARIATION: mixed CALL+TRANSFER batches allow up to 78.4% drain where pure-CALL batch is capped at 40%]
**Severity**: Medium
**Location**: `KernelVault.sol:L1284-1292` (`_executeTransferERC20`), `KernelVault.sol:L1411-1424` (`_executeCall`)

**Description**:
`KernelVault` defines two action dispatch functions that enforce the same-named 40% cap (`MAX_CALL_VALUE_BPS = 4000`) using **structurally different formulas** with different reference denominators:

- **`_executeCall`** (L1410–1424): uses `_executionInitialBalance` — a snapshot captured ONCE at the start of `_executeActions`. The cumulative drain across all CALL actions in a single `execute()` is hard-capped at 40% of the initial balance. Comment at L1411–1415 explicitly documents this design: *"This prevents compound drain: with the old code, 3 actions each draining 40% of current balance would remove 78.4%."*

- **`_executeTransferERC20`** (L1284–1292): uses `balanceBefore` — the current balance BEFORE EACH action. There is **no cumulative tracking**. Each TRANSFER_ERC20 action is independently capped at 40% of the current (already-reduced) balance.

This means a batch of 3 TRANSFER_ERC20 actions at the cap each time produces:
- Action 1: 40% drain → balance = 60% of initial
- Action 2: 40% of 60% = 24% drain → balance = 36% of initial
- Action 3: 40% of 36% = 14.4% drain → balance = 21.6% of initial
**Cumulative drain = 78.4% in one `execute()` call**

The same agent output containing only CALL actions would be limited to 40% cumulative drain. The discrepancy violates the design invariant stated in the H-03 fix comment at L1044–1048: *"cumulative drain across ALL actions is capped at 40% of the initial balance."*

Mixed batches (CALL + TRANSFER) are also asymmetric: the CALL's delta cap checks `_executionInitialBalance`, but each TRANSFER_ERC20 is checked independently against `balanceBefore`, so the CALL cap may pass even as TRANSFERs have already reduced the balance, allowing a combined drain above 40%.

**Impact**:
A malicious or compromised ZK guest (or proof-forgery exploiting C-03) can drain up to 78.4% of vault assets in a single `execute()` call by packing three TRANSFER_ERC20 actions at the 40% cap each time — compared to the intended 40% cumulative maximum. The design intent of leaving monitoring systems a >2-block window to react is undermined for TRANSFER_ERC20–based strategies. All `KernelVault` instances are affected regardless of whether they hold ERC20 or ETH assets.

**Evidence**:
```solidity
// _executeTransferERC20 (L1284-1292): cap against CURRENT balanceBefore
if (balanceBefore > 0) {
    uint256 maxAmount = (balanceBefore * MAX_CALL_VALUE_BPS) / BPS_DENOMINATOR;
    if (amount > maxAmount) {
        revert CallValueExceedsLimit(amount, maxAmount);
    }
}
// ❌ No cumulative drain tracking. Each action's 40% is independent.

// _executeCall (L1417-1424): cap against INITIAL _executionInitialBalance
uint256 cumulativeDrain = _executionInitialBalance > balanceAfter
    ? _executionInitialBalance - balanceAfter
    : 0;
uint256 maxDelta = (_executionInitialBalance * MAX_CALL_ASSET_DELTA_BPS) / BPS_DENOMINATOR;
if (cumulativeDrain > maxDelta) {
    revert CallAssetDeltaExceedsLimit(cumulativeDrain, maxDelta);
}
// ✓ Cumulative drain across all CALL actions capped at 40% of initial balance.
```

**Consistency Type**: FORMULA_DRIFT

### Postcondition Analysis
**Postconditions Created**: After a batch of 3 TRANSFER_ERC20 actions at cap, up to 78.4% of vault assets are transferred out within a single `execute()` call. The monitoring window (designed to be "multiple blocks") is eliminated.
**Postcondition Types**: BALANCE
**Who Benefits**: Malicious agent (compromised ZK guest or forged proof) can exceed the intended single-execute drain limit.

---

## Finding [NSC-3]: Fee Formulas Use Inline `10000` Literals Instead of `BPS_DENOMINATOR` Constant

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3 | ✗4(N/A - single contract) | ✓5
**Rules Applied**: [R14:✗(not a settable limit), R13:✓]
**Severity**: Informational
**Location**: `KernelVault.sol`
- L1853: `(totalShares * managementFeeBps * timeElapsed) / (365 days * 10000)`
- L1088: `uint256 drawdownBps = ((peakPps - ppsAfter) * 10000) / peakPps`
- L1894: `uint256 profitBps = ((pps - highWaterMark) * 10000) / highWaterMark`
- L1897: `feeShares = (totalShares * profitBps * performanceFeeBps) / (10000 * 10000)`
- L1919: `protocolShares = (feeShares * protocolFeeSplitBps) / 10000`

**Description**:
`KernelVault` defines `BPS_DENOMINATOR = 10_000` as an explicit named constant (L282) for use in the CALL value caps (`MAX_CALL_VALUE_BPS` / `MAX_CALL_ASSET_DELTA_BPS`) and fee-rate setters. However, the fee computation functions (`_collectManagementFee`, `_collectPerformanceFee`, `_distributeFeeShares`, and `_updatePerformanceMetrics`) use the raw literal `10000` instead of `BPS_DENOMINATOR` in 5 separate locations.

The management fee formula compounds the inconsistency: `365 days * 10000` — the denominator for annual basis point conversion — uses a bare `10000` while the constant is named and accessible.

The performance fee uses a double-denominator: `(10000 * 10000)` = `100_000_000`, which converts `profitBps` (in BPS) times `performanceFeeBps` (in BPS) to a unitless ratio. While arithmetically correct, this construction is opaque and cannot be updated atomically if the BPS base were ever changed.

**Impact**:
- No current runtime impact — all instances evaluate to the same value.
- Consistency drift between fee-related and action-dispatch code within the same contract: `MAX_CALL_VALUE_BPS` divisions correctly reference `BPS_DENOMINATOR`, but five fee formulas bypass it.
- If a future change replaces `BPS_DENOMINATOR` with a higher-resolution denominator (e.g., `100_000` for 0.001% granularity), a developer using IDE refactoring would miss these 5 inline literal sites, silently introducing a 10× fee error on management and performance fees.

**Evidence**:
```solidity
// INCONSISTENT (fee formulas — inline literals):
feeShares = (totalShares * managementFeeBps * timeElapsed) / (365 days * 10000); // L1853
uint256 profitBps = ((pps - highWaterMark) * 10000) / highWaterMark;             // L1894
feeShares = (totalShares * profitBps * performanceFeeBps) / (10000 * 10000);     // L1897
protocolShares = (feeShares * protocolFeeSplitBps) / 10000;                       // L1919
uint256 drawdownBps = ((peakPps - ppsAfter) * 10000) / peakPps;                  // L1088

// CONSISTENT (action cap code in same contract):
uint256 maxAmount = (balanceBefore * MAX_CALL_VALUE_BPS) / BPS_DENOMINATOR;      // L1290
uint256 maxDelta = (_executionInitialBalance * MAX_CALL_ASSET_DELTA_BPS) / BPS_DENOMINATOR; // L1421
```

**Consistency Type**: MAGIC_NUMBER_DRIFT

---

## Finding [NSC-4]: Oracle Timestamp Type Consistent — No Cross-Contract Mismatch Found

**Verdict**: REFUTED
**Step Execution**: ✓1,2,3
**Rules Applied**: [R14:✗(not a settable variable)]
**Severity**: Informational (non-finding — included for audit completeness per CHECK 1)
**Location**: N/A

**Description**:
`oracleTimestamp` and `maxOracleAge` are declared as `uint64` consistently in:
- `KernelVault.sol:L232` (`maxOracleAge uint64`)
- `KernelVault.sol:L970, L981` (function parameter `uint64 oracleTimestamp`)
- `IOptimisticKernelVault.sol:L37` (`uint64 oracleTimestamp`)
- `OracleVerifier.sol:L49, L52, L213, L216` (both parameters `uint64`)

The error `OracleDataStale(uint64, uint64, uint256)` correctly uses `uint256` for `blockTimestamp` (EVM block.timestamp is uint256), while the oracle-side timestamp is `uint64`. This is intentional: oracle timestamps are off-chain-generated and bounded to reasonable ranges; using `uint64` saves calldata gas. There is no cross-contract type mismatch.

### Precondition Analysis
**Missing Precondition**: No inconsistency exists.
**Precondition Type**: N/A

---

## Chain Summary

| Finding ID | Location | Root Cause (1-line) | Verdict | Severity | Precondition Type | Postcondition Type |
|-----------|----------|---------------------|---------|----------|-------------------|--------------------|
| NSC-1 | WSTONBondManager.sol:L49, PointsProgram.sol:L55, MorphoAdapter.sol:L735 | `BPS_DENOMINATOR` defined without underscore separator or not defined at all; value identical but inconsistent style | CONFIRMED | Informational | N/A | N/A |
| NSC-2 | KernelVault.sol:L1284-1292, L1411-1424 | `_executeTransferERC20` caps drain per-action against current balance while `_executeCall` caps cumulatively against initial balance | CONFIRMED | Medium | N/A | BALANCE |
| NSC-3 | KernelVault.sol:L1853, L1088, L1894, L1897, L1919 | Fee formulas use inline `10000` literal while action cap code uses `BPS_DENOMINATOR` constant | CONFIRMED | Informational | N/A | N/A |
| NSC-4 | N/A | Oracle timestamp `uint64` vs `uint256`: investigated, no inconsistency found | REFUTED | N/A | N/A | N/A |

---

## Coverage Summary

| CHECK | Entities Enumerated | Entities Processed | Coverage |
|-------|--------------------|--------------------|---------|
| CHECK 1: Config Variable Unit Consistency | 2 | 2 | 100% |
| CHECK 2: Formula Semantic Drift | 7 | 7 | 100% |
| CHECK 3: Magic Number Consistency | 5 | 5 | 100% |
| **Total** | **14** | **14** | **100%** |
