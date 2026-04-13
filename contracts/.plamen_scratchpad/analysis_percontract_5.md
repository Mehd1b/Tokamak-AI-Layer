# Per-Contract Agent #5: DeFi Lending/Staking Adapters
**Contracts**: AaveV3Adapter.sol, LidoAdapter.sol, MorphoAdapter.sol

---

## File Coverage Checkpoint

| File | Lines | Opened? | Functions Analyzed |
|------|-------|---------|-------------------|
| AaveV3Adapter.sol | 605 | YES | registerVault, unregisterVault, setAllowedAsset, supply, withdraw, borrow, repay, claimRewards, withdrawToVault, setMinHealthFactor, _checkVaultHealth, _removeSuppliedAsset, _removeBorrowedAsset |
| LidoAdapter.sol | 481 | YES | registerVault, stakeETH, syncRebase, vaultStETHShare, wrapToWstETH, unwrapFromWstETH, requestWithdrawal, claimWithdrawal, withdrawToVault, rescueETH |
| MorphoAdapter.sol | 758 | YES | registerVault, unregisterVault, whitelistMarket, delistMarket, supply, withdraw, borrow, repay, supplyCollateral, withdrawCollateral, reallocate, withdrawToVault, _checkVaultHealth, _trackMarket, _marketId |

---

## Exclusion List Applied

The following INV IDs from findings_inventory.md cover the same root causes and are excluded:
- INV-02: MorphoAdapter IMorphoOracle.price() no staleness validation
- INV-03: MorphoAdapter ORACLE_PRICE_SCALE=1e36 hardcoded
- INV-04: AaveV3Adapter _checkVaultHealth uses aggregate adapter HF not per-vault
- INV-05: Morpho oracle price() revert DoS
- INV-08: AaveV3Adapter interest above _vaultSupplied cap stranded
- INV-09: MorphoAdapter ignores return values

---

## Finding [PC5-1]: AaveV3Adapter withdrawToVault() Unconditionally Clears Borrow Tracking Even When Supply Withdrawal Fails

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity per call), R6:✗(no role), R8:✓, R10:✓, R11:✗(no external tokens), R12:✓, R13:✗]
**Depth Evidence**: [TRACE:withdrawToVault→pool.withdraw reverts→catch restores _vaultSupplied but _vaultBorrowed zeroed unconditionally at L501-505] [BOUNDARY:tested supply-fail path with outstanding borrow]
**Severity**: Medium
**Location**: AaveV3Adapter.sol:L476-523, specifically L490-505

**Description**: In withdrawToVault(), the per-asset loop handles supply withdrawal with a try/catch (L490-495). On failure, it restores _vaultSupplied[msg.sender][asset] = tracked. However, the borrow-tracking clear at L501-505 is OUTSIDE the try/catch block and executes unconditionally — regardless of whether pool.withdraw succeeded or reverted.

If pool.withdraw reverts: (1) _vaultSupplied[msg.sender][asset] is restored (retry-safe), but (2) _vaultBorrowed[msg.sender][asset] is zeroed to 0 permanently (state corruption). The adapter subsequently believes the vault has no debt for that asset, while the actual Aave debt still exists. _checkVaultHealth() — invoked on every future borrow() call — will see zero tracked borrow and pass, allowing the vault's agent to borrow further despite its real leverage being at or beyond the safety threshold.

**Impact**: A pool.withdraw failure during emergency exit (realistic during Aave liquidity crunch or withdrawal limits) permanently corrupts the adapter's borrow shadow record. The vault can then borrow additional amounts past the minHealthFactor threshold, increasing Aave liquidation risk. The actual Aave HF may already be below minHealthFactor while the adapter reports it as safe.

**Evidence**:
```
// AaveV3Adapter.sol:L485-505
uint256 tracked = _vaultSupplied[msg.sender][asset];
if (tracked > 0) {
    _vaultSupplied[msg.sender][asset] = 0;
    try pool.withdraw(asset, tracked, msg.sender) returns (uint256) {
        // Success
    } catch {
        _vaultSupplied[msg.sender][asset] = tracked;  // restored on catch
    }
}
// OUTSIDE the try/catch — executes unconditionally even after catch:
uint256 trackedBorrow = _vaultBorrowed[msg.sender][asset];
if (trackedBorrow > 0) {
    _vaultBorrowed[msg.sender][asset] = 0;         // zeroed despite failed withdrawal
    emit BorrowForfeited(msg.sender, asset, trackedBorrow);
}
```

### Postcondition Analysis
**Postconditions Created**: Zero _vaultBorrowed record for an asset that still has real on-chain Aave debt; adapter health check bypassed.
**Postcondition Types**: STATE
**Who Benefits**: Vault agent can borrow additional assets without triggering the health factor check.

---

## Finding [PC5-2]: MorphoAdapter withdrawToVault() Emergency Exit Blocked by Accrued Interest on Outstanding Borrows

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity per market), R6:✗(no role), R8:✓, R10:✓, R11:✗, R12:✗, R13:✗]
**Depth Evidence**: [TRACE:withdrawToVault→repay(vaultBorrow=principal only)→residual borrow shares remain on Morpho→withdrawCollateral→Morpho health check fails→revert] [VARIATION:principal repaid vs principal+interest] [BOUNDARY:0 time elapsed=safe, 1 block elapsed=residual interest exists]
**Severity**: Medium
**Location**: MorphoAdapter.sol:L618-633

**Description**: withdrawToVault() repays exactly _vaultBorrowed[msg.sender][marketId] — the tracked principal at borrow time. However, Morpho Blue continuously accrues interest via borrow shares. The on-chain debt = principal + accrued_interest. Calling repay(params, vaultBorrow, 0, ...) burns only the principal-equivalent borrow shares; residual interest shares remain.

After repay: (1) _vaultBorrowed[msg.sender][marketId] = 0 is set — adapter believes debt is clear. (2) withdrawCollateral is called with full tracked collateral. (3) Morpho checks position health: residual borrow shares still exist, removing all collateral leaves position undercollateralized, Morpho reverts.

The collateral becomes inaccessible: _vaultCollateral is already zeroed (L630), so the adapter cannot retry withdrawCollateral. The vault cannot call repay() again through the normal path since _vaultBorrowed is already zero. The EmergencyWithdraw event fires as if the exit succeeded.

**Impact**: Any vault with Morpho borrow positions that have accrued even 1 wei of interest (from block 1 post-borrow) will have its collateral permanently locked during emergency exit. At 5% APR, a $1M position accrues ~$1.37/day — the gap is operational within hours of borrowing. Vault owner must manually call Morpho directly (bypassing the adapter) to clear residual shares.

**Evidence**:
```
// MorphoAdapter.sol:L617-633
uint256 vaultBorrow = _vaultBorrowed[msg.sender][marketId]; // principal only, no interest

if (vaultBorrow > 0) {
    IERC20(params.loanToken).safeTransferFrom(msg.sender, address(this), vaultBorrow);
    IERC20(params.loanToken).forceApprove(morpho, vaultBorrow);
    IMorpho(morpho).repay(params, vaultBorrow, 0, address(this), ""); // partial: principal shares only
    _vaultBorrowed[msg.sender][marketId] = 0;  // adapter thinks debt cleared
}

if (vaultCollat > 0) {
    _vaultCollateral[msg.sender][marketId] = 0;
    IMorpho(morpho).withdrawCollateral(    // REVERTS: residual borrow shares still exist
        params, vaultCollat, address(this), msg.sender
    );
}
```

Fix: use type(uint256).max for assets in repay (Morpho interprets this as repay-all-shares), ensuring all accrued interest is cleared before collateral withdrawal.

### Postcondition Analysis
**Postconditions Created**: Collateral locked in Morpho; _vaultCollateral zeroed in adapter (state disagrees with on-chain position).
**Postcondition Types**: STATE, BALANCE
**Who Benefits**: N/A — funds are locked, not stolen.

---

## Finding [PC5-3]: AaveV3Adapter unregisterVault() Does Not Check Borrow-Only Assets in _borrowedAssets

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3 | ✗4(edge case: borrow-only assets uncommon)
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗, R12:✗, R13:✗]
**Severity**: Low
**Location**: AaveV3Adapter.sol:L239-255

**Description**: unregisterVault() iterates _suppliedAssets[vault] and checks both _vaultSupplied and _vaultBorrowed for each asset. The borrow() function explicitly adds borrowed assets to _borrowedAssets but NOT to _suppliedAssets (comment at L390-393: "L-28: do NOT add the borrowed asset to _suppliedAssets"). Therefore a vault that borrows asset X without supplying X has X in _borrowedAssets but not _suppliedAssets. unregisterVault() will not check X, allowing unregistration with non-zero _vaultBorrowed[vault][X] representing real outstanding Aave debt.

After unregistration: _borrowedAssets[vault] and _borrowedAssetTracked[vault][X] remain set with stale data. The underlying Aave debt continues accruing interest with no adapter path to repay or monitor it.

**Impact**: Vault owner can unregister while leaving real Aave borrow-only positions abandoned. Off-chain monitors receive no BorrowForfeited event. The debt accrues indefinitely as there is no adapter path to repay it post-unregistration.

**Evidence**:
```
// AaveV3Adapter.sol:L374-378 (borrow adds to _borrowedAssets, NOT _suppliedAssets)
if (!_borrowedAssetTracked[msg.sender][asset]) {
    _borrowedAssets[msg.sender].push(asset);  // separate list
    _borrowedAssetTracked[msg.sender][asset] = true;
}

// AaveV3Adapter.sol:L239-255 (unregister only checks _suppliedAssets)
address[] memory assets = _suppliedAssets[vault]; // <-- borrow-only assets NOT here
for (uint256 i = 0; i < assets.length; i++) {
    if (_vaultSupplied[vault][assets[i]] != 0 || _vaultBorrowed[vault][assets[i]] != 0) {
        revert ...;
    }
}
// _borrowedAssets[vault] never checked or cleared
```

---

## Finding [PC5-4]: LidoAdapter withdrawToVault() Positive-Rebase Path Returns Nominal Amount, Not Pro-Rata Share

**Verdict**: PARTIAL
**Step Execution**: ✓1,2,3 | ?4(precondition requires positive rebase between deposit and exit)
**Rules Applied**: [R4:✓, R5:✓, R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗, R12:✗, R13:✓]
**Severity**: Low
**Location**: LidoAdapter.sol:L407-425

**Description**: The negative-rebase branch at L410 correctly applies pro-rata computation: (stETHAmount * actualStETH) / totalTrackedStETH. The positive-rebase branch at L413 uses the nominal stETHAmount instead of the proportional share. Since wrapToWstETH(), requestWithdrawal(), and stakeETH() all correctly update totalTrackedStETH symmetrically, the denominator is accurate. But withdrawToVault() does not apply proportional math in the positive-rebase case.

Two-vault trace: Vault A = 100 stETH, Vault B = 100 stETH, totalTracked = 200, actualStETH = 220 (10% rebase). Vault A calls withdrawToVault(): returns 100 (nominal), totalTrackedStETH decremented by 100 → 100. Now actualStETH = 120 in adapter. Vault B calls vaultStETHShare(): returns (100 * 120) / 100 = 120. Vault B gets 120, Vault A got 100. Total paid = 220 = correct, but distribution is asymmetric: exiting vault forfeits rebase gains to remaining vaults.

The vaultStETHShare() view function returns the proportional value (correct), creating an expectation gap: users see 110 as their balance via the view function but receive only 100 on emergency exit.

**Impact**: Exiting vault forfeits its pro-rata share of positive rebase to remaining vaults. At 4% APY stETH rebase over 1 year on a 1000 ETH position: ~40 stETH (~$120k at $3k) forfeited on emergency exit.

**Precondition Analysis**:
**Missing Precondition**: Positive rebase (stETH appreciation) between deposit and withdrawToVault call.
**Precondition Type**: TIMING, EXTERNAL
**Why This Blocks**: Without positive rebase, nominal == actual and no discrepancy occurs. Since stETH rebases daily upward under normal conditions, this precondition is met in virtually all non-emergency withdrawals.

### Postcondition Analysis
**Postconditions Created**: Remaining vaults receive more than their proportional share of the pool; exiting vault receives less than vaultStETHShare() indicates.
**Postcondition Types**: BALANCE, STATE
**Who Benefits**: Remaining vault holders at the expense of the exiting vault.

---

## Finding [PC5-5]: AaveV3Adapter withdrawToVault() Leaves _suppliedAssets Array and _assetTracked Flags Populated After Full Exit

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗, R10:✗, R11:✗, R12:✗, R13:✗]
**Severity**: Informational
**Location**: AaveV3Adapter.sol:L476-523

**Description**: On a successful full withdrawal, withdrawToVault() zeroes all _vaultSupplied and _vaultBorrowed entries but never clears _suppliedAssets[msg.sender] or resets _assetTracked[msg.sender][asset]. Compare unregisterVault() at L253 which calls delete _suppliedAssets[vault] and resets flags.

Consequences: (1) Future withdrawToVault() calls iterate the same non-empty asset list, finding all balances zero, and emit EmergencyWithdrawn for a no-op exit. (2) BorrowForfeited events may be emitted repeatedly for already-zeroed borrows. (3) _suppliedAssets grows monotonically across the adapter lifetime with no cap (unlike MorphoAdapter's MAX_MARKETS_PER_VAULT=10), increasing loop gas cost over time.

**Impact**: Gas overhead on repeated emergency exits; misleading duplicate EmergencyWithdrawn events to off-chain monitors. Severity is Informational given the limited financial impact.

---

## Chain Summary

| Finding ID | Severity | Verdict | Chain Input? | Postcondition Types |
|-----------|----------|---------|-------------|-------------------|
| PC5-1 | Medium | CONFIRMED | YES — zero borrow tracking enables bypassing health check | STATE |
| PC5-2 | Medium | CONFIRMED | YES — collateral locked, borrow shares persist | STATE, BALANCE |
| PC5-3 | Low | CONFIRMED | NO — bounded by vault owner control | STATE |
| PC5-4 | Low | PARTIAL | NO — timing-dependent, exiting vault forfeits rebase | BALANCE, TIMING |
| PC5-5 | Informational | CONFIRMED | NO — gas/event impact only | STATE |
