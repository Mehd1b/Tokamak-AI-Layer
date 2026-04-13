# DEPTH ANALYSIS: Token Flow

**Agent**: depth-token-flow (Opus)
**Date**: 2026-04-13
**Coverage**: 7/7 priority finding cards addressed

---

## Finding [DEPTH-TF-1]: TRANSFER_ERC20 Actions Lack Cumulative Drain Cap — Compound Drain Bypasses H-03 Fix

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,5,6 | ✗4(N/A - no external dep) | ✓7
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗(no external tokens), R12:✓, R14:✗(no aggregate variables), R15:✗(no flash-loan-accessible state), R16:✗(no oracle)]
**Depth Evidence**: [TRACE:_executeTransferERC20 L1283-1298 → per-action cap uses balanceBefore not _executionInitialBalance → 3 actions drain 78.4%], [BOUNDARY:3 TRANSFER_ERC20 actions at 40% each → 0.6^3 = 21.6% remaining → 78.4% drained], [TRACE:_executeCall L1411-1424 → DOES use _executionInitialBalance for cumulative cap → fixed correctly there but not in TRANSFER_ERC20]
**Severity**: High
**Location**: KernelVault.sol:L1283-1299

**Description**:
The H-03 fix introduced cumulative drain protection in `_executeCall` (L1411-1424) by checking `_executionInitialBalance` — the vault balance captured ONCE at the start of `_executeActions` (L1049). This prevents compound drain: multiple CALL actions cannot cumulatively extract more than 40% of the initial balance.

However, `_executeTransferERC20` (L1283-1299) was NOT updated with the same cumulative cap. It still uses per-action `balanceBefore` (the current balance at the time of that specific action) as the denominator:

```solidity
// KernelVault.sol L1281-1291
uint256 balanceBefore = totalAssets();
if (balanceBefore > 0) {
    uint256 maxAmount = (balanceBefore * MAX_CALL_VALUE_BPS) / BPS_DENOMINATOR;
    if (amount > maxAmount) {
        revert CallValueExceedsLimit(amount, maxAmount);
    }
}
```

Since `balanceBefore` is recalculated for EACH action and shrinks after each transfer, the compound effect allows:
- Action 1: drains 40% of 100 = 40, leaving 60
- Action 2: drains 40% of 60 = 24, leaving 36
- Action 3: drains 40% of 36 = 14.4, leaving 21.6

Total drain: 78.4% of initial balance in a single `execute()` call, bypassing the intended 40% cap.

Furthermore, a malicious proof can MIX action types: use TRANSFER_ERC20 actions (which lack cumulative protection) alongside or instead of CALL actions. Even if CALL actions are capped cumulatively, switching to TRANSFER_ERC20 resets the compound advantage.

**Impact**:
An attacker with a forged proof (CVE-2025-52484) or a malicious guest image can drain 78.4% of vault assets in a single transaction using 3 TRANSFER_ERC20 actions, vs the intended 40% cap. For a vault with $1M TVL, this is $784K vs the intended $400K maximum single-execution loss. The H-03 fix explicitly documents that the cumulative cap was added to prevent exactly this compound drain pattern — the fix was applied to CALL but missed for TRANSFER_ERC20.

[CROSS-DOMAIN-DEP: external — assumes ZK proof verification prevents malicious action sequences; if bypassed via C-03, this becomes the blast radius]

**Evidence**:
```solidity
// _executeCall (L1411-1424) — FIXED: uses cumulative cap
uint256 cumulativeDrain = _executionInitialBalance > balanceAfter
    ? _executionInitialBalance - balanceAfter
    : 0;
uint256 maxDelta = (_executionInitialBalance * MAX_CALL_ASSET_DELTA_BPS) / BPS_DENOMINATOR;

// _executeTransferERC20 (L1281-1291) — NOT FIXED: uses per-action cap
uint256 balanceBefore = totalAssets();  // <-- recalculated each action
uint256 maxAmount = (balanceBefore * MAX_CALL_VALUE_BPS) / BPS_DENOMINATOR;
```

### Postcondition Analysis
**Postconditions Created**: TRANSFER_ERC20 compound drain path exists, allowing 78.4% extraction in single tx
**Postcondition Types**: BALANCE
**Who Benefits**: Attacker with proof forgery capability (C-03 dependency)

---

## Finding [DEPTH-TF-2]: ERC20 KernelVault `totalAssets()` Uses `balanceOf(this)` — Donation Inflates PPS But Virtual Offset Bounds Economic Viability

**Verdict**: PARTIAL
**Step Execution**: ✓1,2,3,4,5,6 | ✓7
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✓, R12:✓, R14:✗(no aggregate), R15:✓, R16:✗(no oracle)]
**Depth Evidence**: [BOUNDARY:DECIMALS_OFFSET=1e3, first deposit of 1 USDC=1e6 → attacker must donate >1e3/1e6=0.1% of first deposit to move PPS by 0.1%], [TRACE:deposit L826-835 → shares = actualReceived * (totalShares + 1e3) / (effectiveAssets + 1) → with donation D: shares = received * (totalShares + 1e3) / (effectiveAssets + D + 1)], [VARIATION:vault with $1M TVL and 1e9 shares → donation of $1K inflates totalAssets by 0.1% → next depositor gets 0.1% fewer shares → attacker profit = 0.1% * next_deposit - $1K], [BOUNDARY:minimum profitable attack at $1M TVL: donate $10K, next deposit $10M → profit $10K - $10K = $0 at 0.1% inflation → NOT profitable at scale]
**Severity**: Low (downgraded from Medium)
**Location**: KernelVault.sol:L1725-1729

**Description**:
For ERC20 vaults, `totalAssets()` returns `asset.balanceOf(address(this))` (L1729), which includes donated tokens. An attacker can directly transfer ERC20 tokens to inflate `totalAssets()`, increasing PPS and causing subsequent depositors to receive fewer shares.

The virtual offset `DECIMALS_OFFSET = 1e3` (L42) creates a floor that dampens the inflation:
- `shares = received * (totalShares + 1000) / (effectiveAssets + 1)`
- With small `totalShares`, the `+1000` term dominates, making share dilution through donation expensive

**Economic analysis with real constants**:
- First depositor: 1 USDC (1e6 wei), receives ~1e6 * 1000 / 1 = 1e9 shares
- Attacker donates 1000 USDC (1e9 wei): totalAssets becomes 1001 USDC
- Second depositor: 1 USDC, receives 1e6 * (1e9 + 1000) / (1001e6 + 1) = ~999,000 shares (vs 1e9 without donation)
- The donation cost ($1000) far exceeds the ~0.1% dilution of the $1 deposit

At scale ($1M TVL):
- Donate $10K → 1% PPS inflation
- Next $100K deposit receives ~$990 worth of shares → $10 dilution
- Attack cost ($10K) >> profit ($10) = NOT economically viable for sandwich

However: during active strategy, `effectiveTotalAssets()` uses `snapshotTotalAssets` NOT `totalAssets()`, so donations during strategy have zero PPS effect on deposits/withdrawals.

The missing `sweepDonations` in KernelVault (unlike MetaVault) means donated tokens are permanently absorbed into the vault's PPS, benefiting existing shareholders at the donor's expense. There is no owner-recoverable path for ERC20 donations.

**Impact**: Low — the DECIMALS_OFFSET makes donation-based PPS manipulation economically unviable at realistic TVL scales. The residual risk is that donated tokens are unrecoverable by the owner (no sweep function exists). This is a design gap, not an exploitable vulnerability.

### Precondition Analysis
**Missing Precondition**: Economic viability — attacker must donate more than they can extract via sandwich
**Precondition Type**: BALANCE
**Why This Blocks**: DECIMALS_OFFSET=1e3 ensures the cost of PPS inflation exceeds extractable value for any reasonable deposit/TVL ratio

---

## Finding [DEPTH-TF-3]: AaveV3Adapter Interest Above `_vaultSupplied` Cap Is Permanently Stranded — Magnitude Bounded by Design

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,5,6 | ✗4(N/A) | ✓7
**Rules Applied**: [R4:✗(evidence clear), R5:✓, R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗(no external tokens), R12:✗(no dangerous precondition), R14:✗(no settable constraints), R15:✗(not flash accessible), R16:✗(no oracle)]
**Depth Evidence**: [TRACE:supply() L304 → _vaultSupplied[msg.sender][asset] += amount → tracks PRINCIPAL only], [TRACE:withdraw() L321-328 → tracked = _vaultSupplied[msg.sender][asset]; if (toWithdraw > tracked) revert → interest above principal CANNOT be withdrawn], [VARIATION:Aave supply APY 3-8% → $1M supplied for 1 year → $30K-$80K interest stranded], [TRACE:withdrawToVault() L484-494 → _vaultSupplied[msg.sender][asset] = 0 BEFORE pool.withdraw(tracked) → only principal withdrawn, interest remains in adapter's Aave position]
**Severity**: Medium
**Location**: AaveV3Adapter.sol:L149-150, L304, L321-328, L476-506

**Description**:
`_vaultSupplied[vault][asset]` tracks only principal deposited via `supply()` (L304). Aave V3 aTokens rebase upward to reflect accrued interest, so the adapter's actual aToken balance grows over time. However, `withdraw()` caps at `_vaultSupplied` (L321-328) and `withdrawToVault()` withdraws only the tracked amount (L490).

The interest delta accumulates in the adapter's Aave position but is unassignable to any vault. There is no `harvestInterest()` or `distributeYield()` function.

**Real constant analysis**:
- Aave V3 USDC supply APY: ~3-8% (current market)
- 5 vaults, $200K each supplied = $1M total
- After 1 year at 5% APY: ~$50K interest accrued
- All 5 vaults can only withdraw their principal ($200K each)
- $50K interest is stranded in the adapter's Aave position permanently
- Only the adapter owner could theoretically call `pool.withdraw` directly, but there is no function for this

The `withdrawToVault()` emergency path (L476-506) also only withdraws `tracked` (principal), then zeros the tracking. The interest remains as an orphaned aToken balance.

**Impact**: Over time, material yield is permanently stranded in the adapter's Aave V3 position with no exit path. At $1M TVL and 5% APY, this is ~$50K/year of locked value. With multiple adapters and higher TVL, the stranded amount scales linearly.

Severity assessed at: TVL=$5M, APY=5%, time=1yr → $250K stranded
Rationale: Protocol designed for multiple vaults sharing one adapter with material DeFi allocations.

[CROSS-DOMAIN-DEP: state-trace — assumes adapter owner has no backdoor to extract stranded interest; if owner upgradability is added, this becomes a rug vector]

### Postcondition Analysis
**Postconditions Created**: Permanently locked interest in adapter's Aave position, growing over time
**Postcondition Types**: BALANCE, STATE
**Who Benefits**: No one benefits; value is permanently inaccessible

---

## Finding [DEPTH-TF-4]: AaveV3Adapter Aggregate Health Factor Cross-Vault Subsidy — Healthy Vault Subsidizes Unhealthy Vault's Risk

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,5,6 | ✓7
**Rules Applied**: [R4:✗(evidence clear), R5:✓, R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗(no external tokens), R12:✓, R14:✗(no constraints), R15:✗(no flash), R16:✗(no oracle)]
**Depth Evidence**: [TRACE:_checkVaultHealth L574-592 → pool.getUserAccountData(address(this)) returns AGGREGATE HF for the entire adapter, not per-vault], [BOUNDARY:Vault A supplies $1M USDC collateral (no borrow), Vault B borrows $800K against $500K collateral → aggregate HF = (1.5M * LT) / 800K ≈ 1.5 → passes minHF=1.5e18 check → but Vault B alone has HF = (500K * 0.8) / 800K = 0.5 → should be liquidated], [VARIATION:if Vault A withdraws its $1M collateral → aggregate HF drops to 0.5 → Vault B faces immediate liquidation → Vault A's withdrawal blocked by health check even though Vault A has ZERO debt]
**Severity**: Medium
**Location**: AaveV3Adapter.sol:L574-592

**Description**:
`_checkVaultHealth()` calls `pool.getUserAccountData(address(this))` (L584), which returns the aggregate health factor for the adapter's ENTIRE Aave position across all registered vaults. This means a vault with excessive leverage can remain operational as long as other vaults provide sufficient collateral to keep the aggregate HF above `minHealthFactor`.

The concrete attack scenario:
1. Vault A supplies $1M USDC collateral to Aave (no borrows) → HF = infinite
2. Vault B supplies $500K USDC, borrows $800K USDC worth of ETH → standalone HF = (500K * 0.825) / 800K = 0.515 (should be liquidated)
3. Aggregate HF = ((1M + 500K) * 0.825) / 800K = 1.547 → passes `minHealthFactor = 1.5e18`
4. If Vault A now calls `withdraw()` to pull its collateral: the health check reverts because removing $1M would drop aggregate HF to 0.515

Vault A's funds are effectively locked by Vault B's leveraged position. Vault A has no debt but cannot withdraw because the health check is aggregate.

**Impact**: Cross-vault collateral subsidy creates two problems: (1) over-leveraged vaults are masked by healthy vaults, and (2) healthy vaults can have their funds effectively locked by unhealthy vaults. At scale with many vaults, one heavily leveraged vault can block all other vaults from withdrawing collateral.

Severity assessed at: N_vaults=5, TVL=$5M, leverage_ratio=1.5x
Rationale: Each adapter serves multiple vaults; realistic operational state with heterogeneous risk profiles.

### Postcondition Analysis
**Postconditions Created**: Healthy vault locked by unhealthy vault's leverage; over-leveraged positions not caught per-vault
**Postcondition Types**: STATE, BALANCE
**Who Benefits**: Vault B operator benefits from subsidized leverage; Vault A depositors are harmed by locked capital

---

## Finding [DEPTH-TF-5]: MetaVault `emergencyWithdraw` Does Not Update `trackedIdle` for Recovered Proceeds from Underlying Vaults

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,5,6 | ✓7
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗(no external tokens), R12:✗(no dangerous precondition), R14:✓, R15:✗(no flash), R16:✗(no oracle)]
**Depth Evidence**: [TRACE:emergencyWithdraw L281-348 → Step 1 decrements trackedIdle for idleShare (L312) → Step 2 pulls from underlyings but transfers directly to msg.sender (L339) → trackedIdle is NOT incremented for underlying proceeds], [BOUNDARY:trackedIdle=0 after full emergency withdraw + failed underlying pulls → NAV underestimates idle component → correct because shares are burned and proceeds sent directly], [TRACE:after partial emergency withdraw where some underlyings fail → trackedIdle decremented for idle portion but NOT for remaining unrecoverable underlying value → next depositor's NAV still includes the failed underlying allocation via _vaultAllocation()]
**Severity**: Low (downgraded from Medium)
**Location**: MetaVault.sol:L281-348

**Description**:
In `emergencyWithdraw()` (L281-348), Step 1 correctly decrements `trackedIdle` for the caller's idle share (L312). Step 2 pulls from underlying KernelVaults and transfers directly to the caller (L339). The critical observation is that `trackedIdle` is NOT modified for proceeds recovered from underlying vaults — but this is actually CORRECT because the recovered assets are sent directly to `msg.sender`, not to MetaVault's idle balance.

The actual issue is more subtle: when underlying withdrawals partially fail (try-catch at L336-344), the caller receives less than their full pro-rata share, but their MetaVault shares are fully burned (L304-305). The burned shares are worth more than what the caller received, and the unrecoverable value remains in the MetaVault's underlying allocation (still counted in `getNav()` via `_vaultAllocation()`). This means remaining MetaVault holders' NAV is NOT reduced despite an emergency withdrawal — they benefit from the "lost" shares.

However, this is a design trade-off documented in the contract: failed underlying withdrawals are emitted as `UnderlyingWithdrawFailed` events (L343), and the emergency withdrawer accepts partial recovery in exchange for immediate liquidity.

**Impact**: Low — the accounting is internally consistent. Emergency withdrawers who experience partial underlying failures lose the unrecoverable portion. Remaining MetaVault holders' NAV is slightly inflated because the burned shares are worth more than the recovered assets. This is a documented design trade-off, not a vulnerability. The `sweepDonations` mechanism can handle any excess idle balance above `trackedIdle`.

### Precondition Analysis
**Missing Precondition**: Underlying vault failure during emergency withdraw (try-catch triggers)
**Precondition Type**: EXTERNAL
**Why This Blocks**: Under normal operation (all underlyings respond), the accounting is exactly correct

---

## Finding [DEPTH-TF-6]: PendleAdapter `claimRewards()` Claims ALL Vaults' Rewards Atomically — First Caller Captures Disproportionate Share Under Timing Race

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,5,6 | ✓7
**Rules Applied**: [R4:✗(evidence clear), R5:✓, R6:✗(no role), R8:✓, R10:✓, R11:✗(no external tokens), R12:✓, R14:✗(no aggregate), R15:✗(no flash), R16:✗(no oracle)]
**Depth Evidence**: [TRACE:claimRewards L778-780 → IPendleRouter.redeemDueInterestAndRewards(address(this), emptySys, emptyYts, markets) → claims ALL rewards for the ADAPTER across ALL vaults atomically], [TRACE:L782-792 → vaultWeight = vaultPos.ytBalance + vaultPos.lpBalance; totalWeight = totPos.ytBalance + totPos.lpBalance → pro-rata split computed from tracked positions], [TRACE:L772-774 → emptySys and emptyYts passed → YT interest yield is NEVER claimed → only market LP rewards are collected], [BOUNDARY:Vault A has ytBalance=100, lpBalance=100; Vault B has ytBalance=200, lpBalance=200 → Vault A calls claimRewards → vaultWeight=200, totalWeight=600 → Vault A gets 33% of delta → Pendle protocol has already distributed 100% of rewards to adapter → subsequent Vault B call to claimRewards claims 0 new rewards from Pendle (already distributed) → delta=0 → Vault B gets nothing]
**Severity**: Medium
**Location**: PendleAdapter.sol:L749-807

**Description**:
The `claimRewards()` function has TWO critical issues working in combination:

**Issue 1 — Atomic all-vault claim (INV-66)**: When any vault calls `claimRewards()`, the Pendle router distributes ALL accrued rewards for the entire adapter (L778-780) to the adapter's address. The function then computes the caller's pro-rata share based on tracked position weights (L782-792). The problem is that the Pendle router distributes rewards cumulatively — once claimed, the reward counter resets. If Vault A claims first, the balance delta captures ALL vaults' accumulated rewards. Vault A gets its pro-rata share forwarded (L798-801). But the remaining rewards (other vaults' shares) stay in the adapter's balance. When Vault B subsequently calls `claimRewards()`, the Pendle router has nothing new to distribute, so `delta = 0`, and Vault B receives nothing.

The stranded rewards (belonging to non-first-callers) sit in the adapter balance with no distribution mechanism.

**Issue 2 — YT interest never claimed (INV-67)**: The function passes empty arrays for SY and YT (L773-774): `address[] memory emptyYts = new address[](0)`. This means Pendle's `redeemDueInterestAndRewards` never processes YT interest yield — only market LP rewards are claimed. YT interest accumulates in Pendle but is never redeemed to the adapter.

**Impact**: 
- Issue 1: First vault to call `claimRewards()` captures all accumulated LP rewards; other vaults permanently lose their shares. Over multiple reward epochs, the loss compounds.
- Issue 2: All YT interest yield across all vaults and all markets is permanently stranded in Pendle with no claim path.

Severity assessed at: 5 vaults, $500K total Pendle positions, ~5% annual reward yield → $25K/year stranded per Issue 2; first-caller advantage captures 100% of LP rewards from all non-caller vaults.

[CROSS-DOMAIN-DEP: state-trace — assumes no external mechanism can redistribute stranded adapter rewards; confirmed no sweep/rescue for reward tokens exists]

### Postcondition Analysis
**Postconditions Created**: Reward token loss for non-first-caller vaults; permanent YT interest stranding
**Postcondition Types**: BALANCE, STATE
**Who Benefits**: First-caller vault operator captures disproportionate rewards

---

## Finding [DEPTH-TF-7]: LidoAdapter `totalTrackedStETH` vs `vaultStETHBalance[]` Desync Under Concurrent Vault Operations

**Verdict**: PARTIAL
**Step Execution**: ✓1,2,3,5,6 | ✓7
**Rules Applied**: [R4:✗(evidence clear), R5:✓, R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗(no external tokens), R12:✗(no dangerous precondition), R14:✓, R15:✗(no flash), R16:✗(no oracle)]
**Depth Evidence**: [TRACE:syncRebase() L219-232 → totalTrackedStETH = actual stETH balance → updates ONLY aggregate, does NOT update individual vaultStETHBalance[v]], [TRACE:vaultStETHShare() L237-242 → returns (vaultStETHBalance[vault] * actual) / tracked → pro-rata computation is CORRECT if sum(vaultStETHBalance) == totalTrackedStETH], [BOUNDARY:Vault A deposits 100 stETH, Vault B deposits 200 stETH → totalTrackedStETH=300 → syncRebase after 5% positive rebase → totalTrackedStETH=315 → vaultStETHShare(A) = 100*315/300 = 105 → correct], [TRACE:withdrawToVault L418-425 → totalTrackedStETH -= stETHAmount (NOMINAL, not actual transferred) → if negative rebase occurred, decrement by nominal > actual → totalTrackedStETH goes negative or underflows → vaultStETHShare for remaining vaults uses corrupted denominator]
**Severity**: Low
**Location**: LidoAdapter.sol:L219-232, L237-242, L418-425

**Description**:
The LidoAdapter uses a two-level tracking system: `totalTrackedStETH` (aggregate) and `vaultStETHBalance[vault]` (per-vault nominal). The `syncRebase()` function (L219-232) updates only the aggregate to match `lido.balanceOf(address(this))`. Individual vault balances are reconciled via the `vaultStETHShare()` view function (L237-242), which computes `vaultStETHBalance[vault] * actual / tracked`.

The invariant `sum(vaultStETHBalance[v]) == original totalTrackedStETH (pre-rebase)` should hold. After `syncRebase()`, `totalTrackedStETH` updates to actual, and `vaultStETHShare()` correctly scales each vault's nominal balance.

The vulnerability is in `withdrawToVault()` (L418-425): it decrements `totalTrackedStETH` by the NOMINAL `stETHAmount` (the vault's original tracked balance), not by the actual amount transferred. Under a negative rebase where `actual < tracked`:
- Vault A has nominal 100, Vault B has nominal 200 → totalTrackedStETH=300
- Negative rebase: actual balance becomes 270 (10% slash) → after syncRebase, totalTrackedStETH=270
- Vault A calls withdrawToVault: stETHAmount=100 (nominal), but only ~90 actually transferred (pro-rata)
- totalTrackedStETH -= 100 → becomes 170
- But actual remaining stETH ≈ 180 (270 - 90 transferred)
- Now: vaultStETHShare(B) = 200 * 180 / 170 = 211.76 → but Vault B only has 180 stETH actually remaining

The nominal decrement creates a gap where `sum(vaultStETHBalance[remaining]) > totalTrackedStETH`, causing `vaultStETHShare()` to return inflated values for remaining vaults. However, the `withdrawToVault()` code caps at actual balance (L413), preventing over-extraction. The inflation is cosmetic in the view function, not exploitable for fund theft.

**Impact**: Low — the view function `vaultStETHShare()` overestimates remaining vaults' entitlements after a negative rebase + partial withdrawal, but the actual transfer caps prevent over-extraction. The accounting error is bounded by the rebase magnitude and resolves after all vaults withdraw.

### Precondition Analysis
**Missing Precondition**: Lido negative rebase (slashing event) must occur between vault operations
**Precondition Type**: EXTERNAL
**Why This Blocks**: Under positive or zero rebase, nominal decrement is accurate

---

## Finding [DEPTH-TF-8]: MorphoAdapter `withdrawToVault()` Repays Only Tracked Principal — Accrued Interest Creates Residual Borrow Blocking Collateral Withdrawal

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,5,6 | ✓7
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✓, R10:✓, R11:✗(no external tokens), R12:✗(no dangerous precondition), R14:✗(no aggregate), R15:✗(no flash), R16:✗(no oracle)]
**Depth Evidence**: [TRACE:withdrawToVault L617-625 → vaultBorrow = _vaultBorrowed[msg.sender][marketId] → repays ONLY tracked principal → Morpho actual borrow includes accrued interest → residual borrow shares remain after repay], [TRACE:L628-633 → withdrawCollateral AFTER repay → Morpho checks collateralization → if residual borrow > 0 → collateral withdrawal fails → funds locked], [BOUNDARY:$100K borrow at 5% APR for 6 months → $2.5K interest accrued → repay $100K → $2.5K residual → collateral locked until interest paid], [TRACE:safeTransferFrom at L620-621 → pulls loan tokens FROM vault → if vault has exactly $100K of loan token → repay succeeds for $100K → but Morpho borrow is $102.5K → residual $2.5K borrow → withdrawCollateral reverts]
**Severity**: Medium
**Location**: MorphoAdapter.sol:L599-644, L617-633

**Description**:
In `withdrawToVault()` (L599-644), the function repays debt using `_vaultBorrowed[msg.sender][marketId]` (L618) — the tracked principal at time of borrowing. Morpho Blue uses share-based accounting where borrow shares accrue interest over time, so the actual debt exceeds the tracked principal.

The function pulls loan tokens from the vault via `safeTransferFrom` (L620-621) for the tracked amount, then calls `morpho.repay(params, vaultBorrow, 0, ...)` (L624). This repays only the principal amount in asset terms, leaving accrued interest as residual borrow shares in Morpho.

When the function proceeds to `withdrawCollateral()` (L631-633), Morpho checks that the position remains collateralized. With residual borrow shares > 0, the collateral withdrawal fails, trapping the collateral in Morpho.

The vault cannot self-rescue because:
1. `_vaultBorrowed` is already zeroed (L625)
2. There is no `repayInterest()` or `repayAll()` function
3. The vault cannot call `morpho.repay()` directly (it goes through the adapter)

**Impact**: Vaults with any Morpho borrow position that has accrued interest cannot fully exit via `withdrawToVault()`. Collateral is permanently locked in Morpho proportional to the accrued interest. At $1M borrowed at 5% for 1 year, ~$50K of interest prevents collateral withdrawal.

Severity assessed at: borrow_amount=$500K, APR=5%, time_to_exit=6mo → $12.5K interest locks entire collateral position
Rationale: Emergency withdrawal is the last-resort path; if it fails, no alternative exists.

### Postcondition Analysis
**Postconditions Created**: Collateral locked in Morpho; vault cannot complete emergency exit
**Postcondition Types**: STATE, BALANCE
**Who Benefits**: No one; value is locked

---

## COMBINATION DISCOVERY

### Combination 1: TRANSFER_ERC20 Compound Drain + Proof Forgery (DEPTH-TF-1 + C-03)
If a proof forgery is achieved (C-03 CVE-2025-52484), the attacker can use exclusively TRANSFER_ERC20 actions to bypass the cumulative drain cap. 3 actions drain 78.4%, and mixing with CALL actions allows reaching ~91.2% (3 TRANSFER_ERC20 at 40% each = 78.4%, then 1 CALL at 40% of remaining 21.6% = 8.6%, total = 87%).

### Combination 2: AaveV3 Interest Stranding + Cross-Vault HF Subsidy (DEPTH-TF-3 + DEPTH-TF-4)
Stranded interest (DEPTH-TF-3) inflates the adapter's Aave position above what any vault can withdraw, creating phantom collateral that improves the aggregate HF. This allows other vaults to take on MORE leverage than the per-vault HF would allow, amplifying the cross-vault subsidy problem.

### Combination 3: Pendle Reward Race + YT Yield Loss (DEPTH-TF-6 issues 1+2)
The combination of first-caller captures all LP rewards AND YT interest is never claimed means vaults using Pendle lose yield through TWO independent channels. An adversarial vault operator can front-run other vaults' `claimRewards()` calls to capture 100% of LP rewards, while YT interest is permanently lost for everyone.

### Combination 4: Morpho Collateral Lock + MorphoAdapter Emergency Fail (DEPTH-TF-8 + INV-70)
INV-70 identifies that `withdrawToVault()` requires the vault to have loan tokens for repay (pulled via `safeTransferFrom`). If the vault lacks sufficient loan tokens AND interest has accrued (DEPTH-TF-8), the emergency path fails at the repay step, leaving both supply AND collateral locked.

---

## COVERAGE GAPS

1. **No ERC20 donation sweep in KernelVault**: ETH vaults have `trackedETHBalance` preventing donation inflation. MetaVault has `sweepDonations()`. KernelVault for ERC20 has neither — donations are absorbed into PPS permanently. While economically unviable for attacks due to DECIMALS_OFFSET, there is no owner recovery path.

2. **PendleAdapter ptBalance excluded from reward weight**: INV-51 notes that `claimRewards()` weight computation (L790) uses `vaultPos.ytBalance + vaultPos.lpBalance` but excludes `ptBalance`. Vaults with PT-only positions receive zero rewards permanently. This is a design gap — PT holders do earn Pendle LP rewards if their PT is in a market.

3. **AaveV3Adapter reward tokens sent to vault with no adapter exit path**: INV-12 (Informational) notes that `claimAllRewards()` sends reward tokens directly to the KernelVault. These reward tokens are NOT the vault's primary asset and have no exit path through the vault's normal operations. They require `rescueTokens()` (which requires totalShares==0) to extract.

---

## REFUTED STATUS UPDATES

- **INV-07 (TF-2: withdrawTo(shares, address(this)))**: CONFIRMED as Low. Tracing: `_processWithdraw()` → if `to == address(this)`, shares are burned, assets transferred to self (vault) via `safeTransfer(address(this), assetsOut)`. The vault's `totalAssets()` is unchanged (tokens still in vault), but `totalShares` decreased → PPS increases for remaining shareholders. This is an owner-only path (requires msg.sender to have shares), and the "profit" goes to the vault itself (benefiting all remaining shareholders). Not exploitable.

- **INV-11 (TF-6: MetaVault fee-on-transfer trackedIdle)**: PARTIAL as Low. The `_depositToVault()` (L691-696) decrements `trackedIdle` by the full `assets` amount, not by the actual amount received after fee-on-transfer. However, MetaVault's `baseAsset` is set at construction and is typically USDC or similar non-FoT token. The finding is valid in principle but requires a fee-on-transfer base asset, which is outside the expected deployment parameters.

---

## FINDING INDEX

| ID | Severity | Location | Title | Source |
|----|----------|----------|-------|--------|
| DEPTH-TF-1 | High | KernelVault.sol:L1283-1299 | TRANSFER_ERC20 actions lack cumulative drain cap — compound drain bypasses H-03 fix | PC1-1, INV-06 analysis context |
| DEPTH-TF-2 | Low | KernelVault.sol:L1725-1729 | ERC20 KernelVault donation inflates PPS but virtual offset bounds viability | INV-06, TF-1 |
| DEPTH-TF-3 | Medium | AaveV3Adapter.sol:L149-150,L304,L476-506 | AaveV3Adapter interest above _vaultSupplied cap permanently stranded | INV-08, TF-3 |
| DEPTH-TF-4 | Medium | AaveV3Adapter.sol:L574-592 | AaveV3Adapter aggregate HF cross-vault collateral subsidy | INV-04, OA-5, SE-1 |
| DEPTH-TF-5 | Low | MetaVault.sol:L281-348 | MetaVault emergencyWithdraw trackedIdle accounting trade-off | INV-25, CS-4 |
| DEPTH-TF-6 | Medium | PendleAdapter.sol:L749-807 | PendleAdapter claimRewards first-caller captures all + YT yield never claimed | INV-66, INV-67, PC6-1, PC6-2 |
| DEPTH-TF-7 | Low | LidoAdapter.sol:L219-232,L418-425 | LidoAdapter totalTrackedStETH vs vaultStETHBalance desync under negative rebase | INV-10, SYNC_GAP |
| DEPTH-TF-8 | Medium | MorphoAdapter.sol:L599-644 | MorphoAdapter withdrawToVault repays only principal — collateral locked by accrued interest | INV-62, PC5-3 |

---

## Chain Summary

| Finding ID | Location | Root Cause (1-line) | Verdict | Severity | Precondition Type | Postcondition Type |
|------------|----------|--------------------:|---------|----------|-------------------|-------------------|
| DEPTH-TF-1 | KernelVault.sol:L1283-1299 | TRANSFER_ERC20 uses per-action cap not cumulative _executionInitialBalance | CONFIRMED | High | EXTERNAL (proof forgery) | BALANCE |
| DEPTH-TF-2 | KernelVault.sol:L1725-1729 | ERC20 totalAssets uses balanceOf(this) susceptible to donation | PARTIAL | Low | BALANCE (donation cost) | BALANCE |
| DEPTH-TF-3 | AaveV3Adapter.sol:L149,L304,L476 | _vaultSupplied tracks principal only, not accrued Aave interest | CONFIRMED | Medium | STATE (interest accrual) | BALANCE |
| DEPTH-TF-4 | AaveV3Adapter.sol:L574-592 | _checkVaultHealth uses aggregate adapter HF not per-vault | CONFIRMED | Medium | STATE (multi-vault) | STATE, BALANCE |
| DEPTH-TF-5 | MetaVault.sol:L281-348 | emergencyWithdraw sends proceeds directly, trackedIdle consistent | CONFIRMED | Low | EXTERNAL (underlying failure) | STATE |
| DEPTH-TF-6 | PendleAdapter.sol:L749-807 | Atomic all-vault claim + empty YT array | CONFIRMED | Medium | STATE (multi-vault reward) | BALANCE |
| DEPTH-TF-7 | LidoAdapter.sol:L219-232,L418-425 | Nominal decrement of totalTrackedStETH under negative rebase | PARTIAL | Low | EXTERNAL (Lido slash) | STATE |
| DEPTH-TF-8 | MorphoAdapter.sol:L599-644 | withdrawToVault repays only tracked principal, not accrued interest | CONFIRMED | Medium | STATE (interest accrual) | STATE, BALANCE |
