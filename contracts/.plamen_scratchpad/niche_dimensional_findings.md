# Dimensional Analysis — Niche Agent Output

**Phase executed**: 4-phase sequential methodology  
**Contracts analyzed**: StakingRouter, HyperliquidAdapter, TradingSubAccount, MorphoAdapter, PointsProgram, AaveV3Adapter, BuilderProgram, KernelOutputParser  
**Finding prefix**: [NDA-N]  
**Date**: 2026-04-13

---

## Expression Disposition Table

| # | Expression | Location | Operand Scales | Output Scale | Consumer Expected Scale | Mismatch? | Disposition | Finding ID |
|---|-----------|----------|---------------|-------------|------------------------|-----------|-------------|-----------|
| 1 | `tonAmount * 1e9` | StakingRouter.sol:L90 | TON[18-dec] × scalar[9] | WTON[27-dec] | WTON 27-dec ✓ | NO | SAFE | — |
| 2 | `wtonAmount / 1e9` in Staked event | StakingRouter.sol:L141 | WTON[27-dec] / scalar[1e9] | TON[18-dec] | TON 18-dec ✓ | NO | SAFE | — |
| 3 | `orderSize * (10 ** (8 - szDecimals))` | HyperliquidAdapter.sol:L201 | szDecimals-units × scalar | 1e8-units | CoreWriter 1e8 ✓ | NO | SAFE | — |
| 4 | `usdcAmount * 100` (spotSend) | HyperliquidAdapter.sol:L367 | USDC[1e6] × 100 | 1e8-units | spotSend wei-format ✓ | NO | SAFE | — |
| 5 | `vaultCollat * price / ORACLE_PRICE_SCALE` | MorphoAdapter.sol:L728 | collateral-units × oracle-price / 1e36 | loan-units | loan-units (needs matching oracle) | CONDITIONAL | SAFE (per-oracle) | — |
| 6 | `collatValueLoan * lltv * HF_BPS / (1e18 * 10000)` | MorphoAdapter.sol:L735 | loan-units × WAD × BPS / (WAD × 10000) | loan-units | loan-units ✓ | NO | SAFE | — |
| 7 | `amount * upScale` in _normalizeBalance | PointsProgram.sol:L505 | asset-units × 10^(18-dec) | WAD[18-dec] | POINTS_PRECISION=1e18 ✓ | NO | SAFE (state path) | — |
| 8 | `_normalizeBalanceView` fallback (no cache) | PointsProgram.sol:L520 | asset-units (raw, no scaling) | asset-units | WAD[18-dec] expected | YES | MISMATCH | [NDA-1] |
| 9 | `getUserAccountData` HF (Aave) | AaveV3Adapter.sol:L584 | Aave's own 1e18 WAD HF | WAD[18-dec] | minHealthFactor[1e18] ✓ | NO | SAFE | — |
| 10 | `rawTvl / (10**(assetDecimals-18))` | BuilderProgram.sol:L248 | >18-dec native / downscale | WAD[18-dec] | SILVER/GOLD thresholds (1e18) ✓ | NO | SAFE (math) | — |
| 11 | `rawTvl * (10**(18-assetDecimals))` | BuilderProgram.sol:L250 | <18-dec native × upscale | WAD[18-dec] | SILVER/GOLD thresholds (1e18) ✓ | NO | SAFE (math) | — |
| 12 | `updateStats(tvl=...)` (no normalization) | BuilderProgram.sol:L216-222 | Any units — no enforcement | raw | SILVER/GOLD thresholds (1e18) expected | YES | MISMATCH | [NDA-2] |
| 13 | `szRaw * (10**(8-szDecimals))` close path | TradingSubAccount.sol:L268 | szDecimals-precompile × scalar | 1e8-units | CoreWriter 1e8 ✓ | NO | SAFE | — |
| 14 | LE u32/bytes32 parsing in parseActions | KernelOutputParser.sol:L267-282 | binary bytes → uint32/bytes32 | no numeric scale | abi.decode by consumer | NO | SAFE | — |
| 15 | `abi.decode(action.payload, (address, address, uint256))` | KernelVault.sol:L1273 | ABI-encoded uint256 amount | native token units | KernelVault passes to safeTransfer ✓ | NO | SAFE | — |
| 16 | `(normalized * elapsed * multiplier) / (POINTS_PRECISION * SECONDS_PER_DAY)` | PointsProgram.sol:L300 | WAD × seconds × {1} / (1e18 × 86400) | points[unitless] | points[unitless] ✓ | NO | SAFE | — |
| 17 | Staked event `wtonAmount/1e9` in stakeFromWTON | StakingRouter.sol:L141 | WTON[27-dec]/1e9 = TON[18-dec] | TON[18-dec] | event tonAmount field | MINOR | SAFE (event only) | — |

---

## PHASE 1: Dimension Vocabulary Discovery

### 1.1 Scale Constant Inventory

| Constant | Numeric Value | Inferred Scale | Locations |
|----------|-------------|----------------|-----------|
| `1e9` | 1,000,000,000 | TON↔WTON conversion factor (9 decimal shift) | StakingRouter.sol:L90, L141 |
| `1e18` | 1,000,000,000,000,000,000 | WAD, POINTS_PRECISION | PointsProgram.sol:L58, MorphoAdapter.sol:L735, AaveV3Adapter.sol:L200,L529 |
| `1e27` | 10^27 | WTON/WSTON decimals | StakingRouter.sol comments, WSTONBondManager |
| `1e36` | 10^36 | ORACLE_PRICE_SCALE | MorphoAdapter.sol:L702 |
| `ORACLE_PRICE_SCALE = 1e36` | 10^36 | Morpho price oracle canonical scale | MorphoAdapter.sol:L702 |
| `HEALTH_FACTOR_BPS = 8000` | 8000 | 80% in BPS (out of 10000) | MorphoAdapter.sol:L144 |
| `BPS_DENOMINATOR = 10_000` | 10,000 | BPS denominator | BuilderProgram.sol:L54 |
| `POINTS_PRECISION = 1e18` | 10^18 | Points formula denominator | PointsProgram.sol:L58 |
| `SILVER_THRESHOLD = 100_000e18` | 10^23 | TVL threshold (18-dec normalized) | BuilderProgram.sol:L48 |
| `GOLD_THRESHOLD = 1_000_000e18` | 10^24 | TVL threshold (18-dec normalized) | BuilderProgram.sol:L51 |
| `10**(8 - szDecimals)` | 10^3 (BTC) | CoreWriter size scale conversion | HyperliquidAdapter.sol:L201, TradingSubAccount.sol:L268 |
| `100` | 100 | USDC 1e6 → spotSend 1e8 factor | HyperliquidAdapter.sol:L367 |
| `minHealthFactor >= 1e18` | ≥ 10^18 | Aave health factor floor (1.0 = 1e18) | AaveV3Adapter.sol:L200 |

### 1.2 Token and Feed Decimal Survey

| Asset/Feed | Decimals Source | Value | Dynamic? |
|-----------|----------------|-------|---------|
| TON | Comment: "18 decimals" | 18 | No (hardcoded comment) |
| WTON | Comment: "27 decimals" | 27 | No |
| WSTON | Comment: "27 decimals" | 27 | No |
| USDC (HyperEVM) | Native ERC20 | 6 | No (assumed) |
| Vault asset (PointsProgram) | `decimals()` at runtime via try/catch | varies | YES — dynamic |
| Vault asset (BuilderProgram) | caller-supplied `assetDecimals` param | varies | YES — caller-supplied |
| Aave oracle (BASE_CURRENCY_UNIT) | pool.getAssetPrice() result | 1e8 (USD) | Protocol-defined |
| Morpho oracle price() | IMorphoOracle.price() | Morpho-spec scaled | YES — per-market |
| CoreWriter sizes (BTC) | szDecimals=5 | 5 | Per-asset config |

Red flags identified:
- PointsProgram: `decimals()` called at runtime; `_normalizeBalanceView` has a fallback path that bypasses normalization when cache is not populated.
- BuilderProgram: `updateStats()` accepts un-typed `tvl` with no on-chain unit enforcement.

---

## PHASE 2: Expression Annotation

### StakingRouter

**Expression 1**: `uint256 wtonAmount = tonAmount * 1e9` (L90)
```
// DA: tonAmount[TON, 18-dec] * 1e9[scale] = wtonAmount[WTON, 27-dec]
// WTON wraps TON at 1:1 value with 9 extra decimal places
// 1 TON-atom (1e-18 TON) = 1e9 WTON-atoms (1e-27 WTON)
// stakeFromWTON passes wtonAmount (27-dec) to depositWTONAndGetWSTON → CORRECT
```
→ SAFE

**Expression 2**: `emit Staked(msg.sender, wtonAmount / 1e9, wstonReceived)` (L141, stakeFromWTON)
```
// DA: wtonAmount[WTON, 27-dec] / 1e9[scale] = [TON, 18-dec] equivalent
// Staked event tonAmount field convention: 18-dec TON units (as in stakeFromTON)
// Comment acknowledges this is the TON-equivalent, not the raw WTON value
// stakeFromTON emits tonAmount as-is (18-dec): consistent convention
```
→ SAFE (consistent event encoding)

### HyperliquidAdapter

**Expression 3**: `uint256 scaledSize = orderSize * (10 ** (8 - config.szDecimals))` (L201)
```
// DA: orderSize[szDecimals-units] * 10^(8-szDecimals) = orderSize[1e8-scaled]
// For BTC (szDecimals=5): 72 * 10^3 = 72000 (= 0.00072 BTC in 1e8 scale)
// CoreWriter limit order expects 1e8-scaled size → CORRECT
```
→ SAFE

**Expression 4**: `TradingSubAccount.executeSpotToEvm(usdcAmount * 100)` (L367, after overflow check)
```
// DA: usdcAmount[USDC, 1e6] * 100 = amount[1e8-wei-format]
// spotSend action 6 expects 1e8 "wei" format (1 USDC = 1e8 wei)
// Overflow guard: require(usdcAmount <= type(uint64).max / 100) → correct
```
→ SAFE

### MorphoAdapter

**Expression 5**: `uint256 collatValueLoan = (vaultCollat * price) / ORACLE_PRICE_SCALE` (L728)
```
// DA: vaultCollat[collateral-units] * price[oracle-scaled] / 1e36 = [loan-units]
// Morpho spec: price = 1 unit collateral in loan token × 10^(36 + loanDec - collatDec)
// For standard 18-dec/18-dec markets: 1e36 is correct.
// For USDC-loan (6-dec) / ETH-collateral (18-dec): price scale = 10^24, using 1e36 → off by 1e12 (underestimates collateral value)
// This is the existing INV-03 issue (informational, PARTIAL).
// Health impact: overly conservative → prevents legitimate borrowing on non-standard markets.
// NOT a loss-of-funds path (it's conservative, not permissive).
```
→ SAFE for loss-of-funds; INV-03 covers the non-standard oracle issue

**Expression 6**: `(collatValueLoan * lltv * HEALTH_FACTOR_BPS) / (1e18 * 10000)` (L735)
```
// DA: collatValueLoan[loan-units] * lltv[WAD, 1e18] * 8000[BPS] / (1e18 * 10000)
// = collatValueLoan * (lltv/1e18) * (8000/10000)
// = collatValueLoan * ltv_ratio * 0.8 (dimensionless scalars applied correctly)
// Result: maxBorrow[loan-units] = collatValueLoan × 0.64 (for lltv=0.8)
// Dimensional analysis: CORRECT — scales cancel, result in loan-units
```
→ SAFE

### PointsProgram

**Expression 7**: `amount * upScale` in `_normalizeBalance` (L505)
```
// DA: depositBalance[asset-units, D-dec] * 10^(18-D) = [WAD, 18-dec]
// State-mutating path. Always called from accruePoints and updateDepositBalance (when balance>0).
// CORRECT normalization.
```
→ SAFE (state-mutating path)

**Expression 8**: `_normalizeBalanceView(vault, state.depositBalance)` — fallback when cache not populated (L520)
```
// DA: if (!vaultDecimalsCached[vault]) return amount; // returns raw asset units
// For USDC vault (6-dec): returns depositBalance in 1e6 units instead of 1e18 units
// Consumer: (normalized * elapsed * multiplier) / (POINTS_PRECISION * SECONDS_PER_DAY)
// POINTS_PRECISION = 1e18 expects WAD input
// With 1e6 raw: 1000e6 * 86400 / (1e18 * 86400) = 1e-9 points (rounds to 0)
// With 1e18 normalized: 1000e18 * 86400 / (1e18 * 86400) = 1000 points
// ERROR: 1e12x undercount in view functions before first accruePoints call
```
→ MISMATCH → [NDA-1]

**Expression 9**: `(normalized * elapsed * multiplier) / (POINTS_PRECISION * SECONDS_PER_DAY)` (L300)
```
// DA (state path): normalized[WAD, 18-dec] * elapsed[seconds] * multiplier[{1}] / (1e18 * 86400)
// = (depositBalance_normalized / 1e18) * (elapsed / 86400) * multiplier
// Units: points per day per unit of 18-dec balance. Correct.
```
→ SAFE (state path after cache population)

### AaveV3Adapter

**Expression 10**: `pool.getUserAccountData(address(this))` returns healthFactor [WAD, 1e18] (L584)
```
// DA: Aave returns health factor as (totalCollateral * LT) / totalDebt, all in base currency.
// The ratio is dimensionless and scaled to WAD (1e18 = 1.0 health factor)
// minHealthFactor is set with require(>= 1e18) — same WAD scale
// Comparison: aaveHealthFactor[WAD] < minHealthFactor[WAD] — CORRECT
```
→ SAFE

### BuilderProgram

**Expression 11**: `rawTvl * (10**(18-assetDecimals))` for assetDecimals < 18 (L250)
```
// DA: rawTvl[D-dec, D<18] * 10^(18-D) = tvl[WAD, 18-dec]
// Compared against SILVER_THRESHOLD = 100_000e18 and GOLD_THRESHOLD = 1_000_000e18
// CORRECT for caller-supplied assetDecimals
```
→ SAFE (when updateStatsWithDecimals used)

**Expression 12**: `updateStats(builder, tvl, ...)` with no unit enforcement (L216-222)
```
// DA: tvl[unknown units] passed directly to _computeTier(tvl) which compares vs 100_000e18
// No on-chain validation that tvl is in 18-dec normalized units
// Caller contract could pass raw USDC amount (1e6 scale) believing it's normalized
// 1M USDC TVL in 6-dec units: 1e12. SILVER_THRESHOLD = 1e23.
// Ratio: 1e12 / 1e23 = 1e-11 → permanently stuck at Bronze tier
// No revert, no event warning of wrong scale
```
→ MISMATCH → [NDA-2]

### KernelOutputParser

**Expression 13**: LE u32 reading and bytes32 parsing (L267-282)
```
// DA: binary codec only. No numeric arithmetic, no decimal scale.
// _readU32LE correctly reconstructs uint32 from 4 LE bytes.
// _readBytes32 uses calldataload(add(data.offset, offset)) — assembly is correct.
// payload is passed as raw bytes; consumer (KernelVault) abi.decodes it.
// abi.decode(action.payload, (address, address, uint256)) at L1273 in KernelVault:
//   the agent (Rust) encodes ABI-packed uint256 amount; Solidity decodes same way.
//   No decimal mismatch at encoding/decoding layer.
```
→ SAFE

---

## PHASE 3: Propagation Tracing

### Finding [NDA-1] Propagation

**State variable affected**: `vaultDecimalsCached[vault]`, `vaultDecimalUpScale[vault]`, `vaultDecimalDownScale[vault]`

**Code flow**:
```
updateDepositBalance(vault, user, newBalance)
  → if (depositBalance == 0) → skip accruePoints → cache NOT populated
  → sets accrualStates[user][vault].depositBalance = newBalance
  
getPendingPoints(vault, user)  ← view, called externally anytime
  → _normalizeBalanceView(vault, state.depositBalance)
     → if (!vaultDecimalsCached[vault]) return amount  ← FALLS THROUGH with raw amount
  → return (raw_amount * elapsed * multiplier) / (1e18 * 86400)
     = 1000e6 * elapsed / (1e18 * 86400) ≈ 0 for USDC (rounds to 0 for 1-day elapsed)

getDailyRate(vault, user)  ← view, called externally anytime
  → same fallback path → returns ~0 for USDC vaults before first accruePoints
```

**Cross-function boundary**:
| Call Site | Value Passed | Caller's Scale | Callee's Assumed Scale | Mismatch? |
|-----------|-------------|---------------|----------------------|-----------|
| getPendingPoints | depositBalance[6-dec] | raw USDC units | WAD 18-dec | YES |
| getDailyRate | depositBalance[6-dec] | raw USDC units | WAD 18-dec | YES |

**Who can trigger**: Any external observer querying `getPendingPoints` or `getDailyRate` for a user whose vault cache has not been populated. The cache is populated only when `_normalizeBalance` (state-mutating) is called, which happens inside `accruePoints`. New users always have `depositBalance == 0` before their first `updateDepositBalance` call, so the first call always misses the pre-accrual step.

**Trace**: `[TRACE: updateDepositBalance(first call, depositBalance was 0) → skip accruePoints → cache not set → getPendingPoints returns 0 instead of 1000 for 1000 USDC depositor]`

### Finding [NDA-2] Propagation

**State variable affected**: `builders[builder].totalTvl`, `builders[builder].tier`

**Code flow**:
```
updateStats(builder, tvl=1_000_000e6, fees, executions)  ← authorized caller
  → _updateStatsNormalized(builder, 1_000_000e6, ...)
     → b.totalTvl = 1_000_000e6 (raw USDC units)
     → _computeTier(1_000_000e6):
         1_000_000e6 = 1e12 < SILVER_THRESHOLD=1e23 → returns Bronze
     → builder permanently stuck at Bronze (7000/3000 fee split)
     → correct tier should be Gold (9000/1000 split)
```

**Impact on getFeeSplit**:
| Tier | Builder BPS | Protocol BPS |
|------|------------|-------------|
| Bronze (wrong) | 7000 (70%) | 3000 (30%) |
| Gold (correct) | 9000 (90%) | 1000 (10%) |
Difference: 2000 BPS = 20% of all fees routed to protocol instead of builder.

**Trace**: `[TRACE: updateStats(tvl=1e12 raw USDC) → tier=Bronze → getFeeSplit returns 70/30 → builder loses 20% of fees to protocol indefinitely]`

---

## PHASE 4: Validation and Severity

### 4.1 Rationalization Rejection Pass

**[NDA-1]**: The `_normalizeBalanceView` view function fallback to raw amount when cache is not populated.
- "Tests pass" → Rationalization rejected: tests likely use 18-decimal mock tokens where upScale=1 (neutral case passes without cache).
- "The formula appears correct" → Rationalization rejected: the state-mutating path IS correct; the view path has an explicit missing-cache fallback that bypasses normalization.
- "Only a view function" → Not accepted as sufficient justification. The view functions getPendingPoints and getDailyRate are the primary user-facing display of their accrual. Returning 1e12x wrong values misleads users and off-chain integrators about their earned points. If off-chain systems use these values to make decisions (e.g. UI display, airdrop calculations), the error propagates.

**[NDA-2]**: The `updateStats()` missing unit enforcement.
- "Restricted to authorized callers" → Partially mitigates exploitability but does not eliminate the dimensional mismatch. The authorized updater is likely an off-chain bot that tracks USDC TVL in native units. The bug is in the missing guard, not necessarily malicious intent.
- "updateStatsWithDecimals exists" → The safer function exists but both are equally accessible to authorized callers. Nothing prevents calling the wrong one.

### 4.2 Severity Calibration

| Finding | Mismatch Magnitude | Impact | Exploitability | Severity |
|---------|-------------------|--------|----------------|---------|
| [NDA-1] | 10^12 (USDC 6-dec vs 18-dec in view) | Wrong point display / off-chain integrator corruption | First deposit before any accruePoints | Low (view-only path — no on-chain fund loss; 1e12 incorrect display) |
| [NDA-2] | 10^11 (USDC 6-dec vs threshold 18-dec) | Wrong tier → wrong fee split (20% builder fee loss) | Authorized caller must pass wrong-scale value | Low (access-controlled; requires authorized caller to make the wrong call) |

### 4.3 Boundary Substitution

**[NDA-1]**:
```
[BOUNDARY: USDC vault, depositBalance=1000e6 (1000 USDC), cache not populated
 getPendingPoints with elapsed=86400 (1 day), multiplier=1:
 normalized_view = 1000e6 (raw, no upscale)
 points = (1000e6 * 86400 * 1) / (1e18 * 86400) = 1e-9 → rounds to 0
 Expected (after cache): (1000e18 * 86400) / (1e18 * 86400) = 1000 points
 ERROR: User sees 0 pending points instead of 1000 for a full day of 1000 USDC deposit]`
```

**[NDA-2]**:
```
[BOUNDARY: builder with $1M USDC vault, updateStats(builder, rawTvl=1_000_000e6, ...)
 _computeTier(1e12): 1e12 < SILVER_THRESHOLD(1e23) → Bronze tier
 Correct: updateStatsWithDecimals(builder, 1_000_000e6, 6, ...) → normalized = 1e24 → Gold tier
 VARIATION: With 18-dec asset and same $1M: updateStats(builder, 1_000_000e18, ...) → Gold tier
 ERROR: Authorized caller using updateStats with USDC vault locks builder at Bronze tier, losing 20% of all fees (2000 BPS) indefinitely]`
```

---

## Findings

---

## Finding [NDA-1]: PointsProgram.getPendingPoints and getDailyRate Return 1e12-Wrong Values for Non-18-Decimal Vaults Before Cache Population

**Verdict**: CONFIRMED  
**Step Execution**: ✓1,2,3,4 | ✓5,6,7  
**Rules Applied**: [R10:✓ (worst-state = first deposit, cache never populated), R13:✓ (view behavior not "by design" — the state-mutating path normalizes correctly), R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗(no stored external state), R11:✗(no external tokens), R14:✗(no aggregate variables), R15:✗(no flash-loan-accessible state), R16:✗(no oracle)]  
**Depth Evidence**: [BOUNDARY: depositBalance=1000e6, no cache → getPendingPoints returns 0 instead of 1000 for 1-day elapsed], [TRACE: updateDepositBalance(first call, prior balance=0) → skip accruePoints → vaultDecimalsCached=false → _normalizeBalanceView returns raw → points rounds to zero], [VARIATION: 18-dec vault → upScale neutral → no mismatch; 6-dec USDC vault → 1e12x discrepancy]  
**Mismatch Type**: MISSING_NORMALIZATION (view path fallback)  
**Severity**: Low  
**Location**: PointsProgram.sol:L518-521 (`_normalizeBalanceView`), L468 (`getPendingPoints`), L482 (`getDailyRate`)  

**Description**: `PointsProgram._normalizeBalanceView()` — used by the view functions `getPendingPoints` and `getDailyRate` — returns the raw `amount` without decimal normalization when the per-vault decimal cache has not yet been populated. The cache is populated only during `_normalizeBalance` (state-mutating), which is called exclusively inside `accruePoints()`. A user whose `depositBalance` is set for the first time via `updateDepositBalance()` (when their prior balance is zero) bypasses the `accruePoints` call at L348, leaving `vaultDecimalsCached[vault] == false`. Any subsequent call to `getPendingPoints` or `getDailyRate` for that user before they have triggered a state-mutating `accruePoints` call returns a value that is 10^12 too small for USDC vaults (6 decimals), since the raw 1e6-scaled balance is used instead of the WAD-normalized 1e18-scaled balance.

**Impact**: 
- User-facing display corruption: a user who deposited 1000 USDC and queries `getPendingPoints` after one day will see 0 pending points instead of ~1000. This can cause users to believe the points system is broken and withdraw prematurely.
- Off-chain integrator corruption: any system that reads `getDailyRate` to compute expected accrual, airdrop weight, or leaderboard ranking will produce 1e12x-wrong values for USDC vault depositors until `accruePoints` is first called. If airdrop calculations are based on these view function reads at a snapshot block, the result will be incorrect.
- No on-chain fund loss. The state-mutating `accruePoints` path correctly normalizes and accumulates points. The discrepancy exists only in view functions.

**Evidence**:
```solidity
// PointsProgram.sol:L518-521
function _normalizeBalanceView(address vault, uint256 amount) internal view returns (uint256) {
    if (amount == 0) return 0;
    if (!vaultDecimalsCached[vault]) return amount;  // ← RETURNS RAW AMOUNT IF CACHE EMPTY
    // ...
}
```
```solidity
// L346-353: updateDepositBalance
if (accrualStates[user][vault].depositBalance > 0) {
    accruePoints(vault, user);  // ← SKIPPED when first deposit (prior balance == 0)
}
accrualStates[user][vault].depositBalance = newBalance;  // ← cache still empty after this
```

**Concrete values** (USDC vault, 1000 USDC deposit, 1 day elapsed):
- Before cache: `getPendingPoints` = `(1000e6 * 86400 * 1) / (1e18 * 86400) = 1e-9 → 0`
- After first `accruePoints`: `(1000e18 * 86400 * 1) / (1e18 * 86400) = 1000`

### Postcondition Analysis
**Postconditions Created**: View functions return misleading zero/near-zero values for non-18-decimal vault depositors
**Postcondition Types**: [STATE] (wrong cached read from mapping), [TIMING] (transient — corrected after first accruePoints)
**Who Benefits**: No direct attacker benefit. Issue is a display/integration bug.

---

## Finding [NDA-2]: BuilderProgram.updateStats() Accepts Raw Asset-Unit TVL Without Unit Enforcement, Causing Wrong Tier Assignment for Non-18-Decimal Vaults

**Verdict**: CONFIRMED  
**Step Execution**: ✓1,2,3,4 | ✓5,6,7  
**Rules Applied**: [R10:✓ (worst-state = authorized updater always passes raw 6-dec TVL), R13:✓ (behavior is not "by design" — docstring says 18-dec required, no enforcement exists), R4:✗(evidence clear), R5:✗(single entity), R6:✓ (authorized updater is semi-trusted role — wrong call = builder disadvantage), R8:✗(no stored external state), R11:✗(no external tokens), R14:✓ (SILVER/GOLD thresholds are independently-settable limits vs totalTvl — verified that raw 6-dec never crosses thresholds), R15:✗(no flash-loan-accessible state), R16:✗(no oracle)]  
**Depth Evidence**: [BOUNDARY: rawTvl=1_000_000e6 (1M USDC, 6-dec) via updateStats → _computeTier(1e12) → Bronze, while SILVER_THRESHOLD=1e23; correct normalized would be 1e24 → Gold], [VARIATION: 18-dec asset → same raw tvl passes threshold check correctly; 6-dec asset via updateStats → stuck at Bronze indefinitely], [TRACE: updateStats(tvl=1e12) → totalTvl=1e12 → getFeeSplit returns 7000/3000 instead of 9000/1000 → builder loses 20% of all fees]  
**Mismatch Type**: CROSS_BOUNDARY_ASSUMPTION (caller expected to normalize; no enforcement)  
**Severity**: Low  
**Location**: BuilderProgram.sol:L216-223 (`updateStats`), L455-462 (`_computeTier`), L48-51 (thresholds)

**Description**: `BuilderProgram.updateStats()` documents that its `tvl` parameter must be "expressed in 18-decimal normalised units" but provides no on-chain validation of this requirement. The `updateStatsWithDecimals()` convenience wrapper correctly normalizes raw TVL values, but authorized callers can equally call `updateStats()` directly with a raw USDC (6-decimal) TVL value. When this occurs, `_computeTier()` compares the raw 6-decimal amount against `SILVER_THRESHOLD = 100_000e18 = 1e23` and `GOLD_THRESHOLD = 1_000_000e18 = 1e24`. A builder managing $1M USDC has a raw TVL of `1_000_000 × 10^6 = 1e12`, which is 11 orders of magnitude below the Silver threshold, permanently locking the builder in the Bronze tier regardless of their actual TVL.

**Impact**:
- Wrong tier assignment causes wrong fee split: Bronze tier gives the builder 70% of fees (7000 BPS) and the protocol 30% (3000 BPS). The correct Gold tier gives 90/10. The builder permanently loses 20% of all fees (2000 BPS) from every vault execution.
- `totalTvl` is set to the raw 6-decimal value permanently; since `updateStats` only writes (no read-then-modify), the error persists until an authorized caller explicitly corrects it.
- No revert or warning is emitted when a wrong-scale value is passed.
- Restricted to `onlyAuthorized` (owner + authorizedUpdaters), so this requires an authorized caller mistake rather than a permissionless exploit. However, the authorized updater is typically an off-chain indexer tracking native USDC TVL, making this a likely real-world configuration error.

**Evidence**:
```solidity
// BuilderProgram.sol:L216-223
function updateStats(address builder, uint256 tvl, uint256 fees, uint256 executions)
    external onlyAuthorized {
    _updateStatsNormalized(builder, tvl, fees, executions);  // ← no unit validation
}

// L455-462: _computeTier
function _computeTier(uint256 tvl) internal pure returns (Tier) {
    if (tvl >= GOLD_THRESHOLD) return Tier.Gold;   // GOLD = 1e24 (1M × 1e18)
    if (tvl >= SILVER_THRESHOLD) return Tier.Silver; // SILVER = 1e23 (100K × 1e18)
    return Tier.Bronze;
}
```

**Concrete values** ($1M USDC vault):
- Wrong call: `updateStats(builder, 1_000_000 * 10^6 = 1e12)` → `_computeTier(1e12)` → Bronze
- Correct call: `updateStatsWithDecimals(builder, 1e12, 6, ...)` → normalized = `1e12 × 1e12 = 1e24` → Gold
- Fee impact: 70/30 vs 90/10 split → builder loses 20% of all fees permanently

### Postcondition Analysis
**Postconditions Created**: `builders[builder].tier` set to Bronze when Gold/Silver is correct; `getFeeSplit` returns wrong split  
**Postcondition Types**: [STATE] (stored totalTvl and tier are wrong), [TIMING] (persists until corrected)  
**Who Benefits**: Protocol treasury receives 30% instead of 10% of builder fees (net beneficiary of the bug, though not a direct exploit).

---

## Chain Summary

| Finding ID | Location | Root Cause (1-line) | Verdict | Severity | Precondition Type | Postcondition Type |
|-----------|----------|--------------------|---------|---------|--------------------|-------------------|
| [NDA-1] | PointsProgram.sol:L518-521 | `_normalizeBalanceView` bypasses decimal normalization when vault decimal cache not yet populated | CONFIRMED | Low | TIMING (first deposit before any accruePoints) | STATE (misleading view output) |
| [NDA-2] | BuilderProgram.sol:L216-223 | `updateStats()` accepts raw asset-unit TVL with no unit validation, causing permanent wrong tier for non-18-decimal vaults | CONFIRMED | Low | ACCESS (authorized caller must pass wrong-scale TVL) | STATE (wrong tier → wrong fee split indefinitely) |

---

## Coverage Summary

**Expressions inventoried**: 17 (Phases 1-2 enumeration)  
**Mismatches found**: 2 → [NDA-1], [NDA-2]  
**Safe (no mismatch)**: 14  
**Pending**: 0 (all entities processed)

**Contracts fully cleared of dimensional mismatches**:
- StakingRouter.sol: TON↔WTON 1e9 scale conversion is correct. Event units consistent.
- HyperliquidAdapter.sol + TradingSubAccount.sol: 1e6 (usdClassTransfer) vs 1e8 (spotSend) distinction is correctly documented and enforced with overflow guard. Size scaling (szDecimals→1e8) is correct on both open and close paths.
- MorphoAdapter.sol: ORACLE_PRICE_SCALE=1e36 formula is dimensionally correct for standard Morpho markets (18/18-dec). Non-standard markets covered by existing INV-03 (informational).
- AaveV3Adapter.sol: Delegates health factor to Aave's own `getUserAccountData`, eliminating all decimal normalization concerns.
- KernelOutputParser.sol: Binary codec only; no decimal arithmetic.
- KernelVault.sol ERC20 action: abi.decode passes through agent-computed amount unchanged; no decimal transformation layer.
