# Verification Results: Critical and High Chain Hypotheses

**Verifier**: Agent 1 (Critical + HIGH Chain Hypotheses)
**Date**: 2026-04-13
**PoC File**: `test/verify/VerifyChainCriticalHigh.t.sol`

---

## CH-7: RISC Zero CVE + TRANSFER_ERC20 Compound Drain (CRITICAL conditional)

### Dual-Perspective Verification

**Phase 1 - ATTACKER**:
Attack sequence: Forge a RISC Zero proof (via CVE-2025-52484 if unpatched) containing 3+ TRANSFER_ERC20 actions, each at exactly 40% of the vault's CURRENT balance. Execute via a single `execute()` call.

- Action 1: Drains 40% of 1M = 400k. Remaining: 600k.
- Action 2: Drains 40% of 600k = 240k. Remaining: 360k.
- Action 3: Drains 40% of 360k = 144k. Remaining: 216k.
- Total drained: 784k (78.4% of initial 1M).
- With 10 actions: drains 993,953 of 1M (99.4%).

Profit with real numbers: On a $1M vault, attacker extracts $784k-$994k in a SINGLE block.

**Phase 2 - DEFENDER**:
The H-03 cumulative drain fix was applied to `_executeCall` at L1411-1424, which uses `_executionInitialBalance` (set once at L1049) to compute a CUMULATIVE cap. However, `_executeTransferERC20` at L1281-1299 uses `balanceBefore = totalAssets()` which is the CURRENT balance -- this recalculates for each action, enabling compound drain. This is a selective omission: the cumulative fix was applied to CALL but not TRANSFER_ERC20.

The only defense is the ZK proof system itself (trustedImageId). If the proof system is intact, a malicious agent cannot produce a valid proof. But the 40% cap was explicitly designed as defense-in-depth for when the proof system is compromised (see C-04 FIX block comment at L64-100).

**Phase 3 - VERDICT**: ATTACKER WINS. The compound drain vulnerability in TRANSFER_ERC20 is mechanically confirmed. The cumulative cap that protects CALL actions was selectively not applied to TRANSFER_ERC20.

### Execution Result
- **Compiled**: YES (attempts: 1)
- **Result**: PASS
- **Tests**:
  - `test_CH7_compound_drain_bypasses_cumulative_cap`: PASS - 78.4% drain with 3 actions
  - `test_CH7_ten_actions_near_total_drain`: PASS - 99.4% drain with 10 actions
- **Output**: Vault balance drops from 1,000,000e6 to 216,000e6 (3 actions) or 6,046e6 (10 actions). Attacker receives 784,000e6 or 993,953e6 respectively.
- **Evidence Tag**: [POC-PASS]

### Verdict: CONFIRMED (H-1 compound drain) / CONTESTED (H-2 CVE status)
- **H-1 (TRANSFER_ERC20 compound drain)**: CONFIRMED with [POC-PASS]. The blast radius amplifier is mechanically proven.
- **H-2 (CVE-2025-52484 status)**: CONTESTED. Cannot verify deployed verifier version from source code. The chain's CRITICAL severity is contingent on the CVE being unpatched.
- **Combined CH-7**: CONFIRMED as HIGH (H-1 standalone), CRITICAL conditional on CVE status.

### Suggested Fix
```diff
 function _executeTransferERC20(uint256 index, KernelOutputParser.Action memory action)
     internal
 {
     // ... payload decode ...

-    // Capture balance before transfer for strategy snapshot detection
-    uint256 balanceBefore = totalAssets();
+    // [CH-7 FIX] Use _executionInitialBalance for cumulative cap,
+    // matching the H-03 fix applied to _executeCall.
+    uint256 balanceBefore = totalAssets();
+    uint256 balanceForCap = _executionInitialBalance;

     // Per-action cap: reject any TRANSFER_ERC20 whose amount exceeds
     // MAX_CALL_VALUE_BPS of the current balance.
-    if (balanceBefore > 0) {
-        uint256 maxAmount = (balanceBefore * MAX_CALL_VALUE_BPS) / BPS_DENOMINATOR;
+    if (balanceForCap > 0) {
+        // Cumulative cap: check total drain against initial balance
+        uint256 currentBalance = totalAssets();
+        uint256 cumulativeDrain = balanceForCap > (currentBalance - amount)
+            ? balanceForCap - (currentBalance - amount)
+            : amount;
+        uint256 maxDrain = (balanceForCap * MAX_CALL_VALUE_BPS) / BPS_DENOMINATOR;
+        if (cumulativeDrain > maxDrain) {
+            revert CallValueExceedsLimit(cumulativeDrain, maxDrain);
+        }
+        // Also keep per-action cap
+        uint256 maxAmount = (balanceBefore * MAX_CALL_VALUE_BPS) / BPS_DENOMINATOR;
         if (amount > maxAmount) {
             revert CallValueExceedsLimit(amount, maxAmount);
         }
```
**Fix scope**: Apply cumulative drain cap using `_executionInitialBalance` to TRANSFER_ERC20, same pattern as _executeCall L1411-1424.
**Verified**: NO - fix not mechanically verified (architectural change needed for clean implementation).

---

## CH-3: Trivial Bond + Relayer Offline = Zero-Cost Vault Drain (HIGH)

### Dual-Perspective Verification

**Phase 1 - ATTACKER**:
1. Lock minimal bond (1 WSTON = ~$5 at minBondFloor).
2. Execute malicious optimistic execution draining $10k+ vault.
3. Wait for relayer to be offline/DoS'd -- markSlashPending never called.
4. After 90 days (BOND_EXPIRY), call reclaimExpiredBond().
5. Recover full $5 bond. Net cost: gas only. ROI: 2000x.

**Phase 2 - DEFENDER**:
The H-02 FIX added `slashPending` flag (L497) which blocks reclaim when markSlashPending has been called. However, this defense REQUIRES the relayer to call markSlashPending. If the relayer is offline for 90 days, slashPending remains false and reclaimExpiredBond succeeds at L497.

The protocol DOES have a defense: the `trustedRelayer` must be set and operational. But this is a single point of failure with no fallback mechanism. There is no on-chain mechanism (merkle proof, light client, etc.) to relay slash events without the relayer.

Additionally, `getMinBond()` returns `minBondFloor` regardless of vault TVL -- there is no proportionality enforcement.

**Phase 3 - VERDICT**: ATTACKER WINS. The timing gap and lack of bond-to-TVL enforcement are mechanically confirmed.

### Execution Result
- **Compiled**: YES (attempts: 1)
- **Result**: PASS
- **Tests**:
  - `test_CH3_zero_cost_bond_reclaim`: PASS - operator recovers 100% of bond after 90 days with no markSlashPending
  - `test_CH3_trivial_bond_economics`: PASS - 2000x ROI confirmed, getMinBond returns flat floor
- **Output**: Bond status transitions from Locked (1) to Released (2), NOT Slashed (3). Operator balance increases by full bond amount.
- **Evidence Tag**: [POC-PASS]

### Verdict: CONFIRMED
Both H-3 (timing gap) and H-4 (trivial bond ratio) are confirmed. The chain proves the full economic exploit: trivial bond + relayer offline = zero-cost vault drain.

### Suggested Fix
```diff
 // In OptimisticKernelVault._verifyOptimisticOracleAndBond:
+// Enforce minimum bond proportional to vault TVL
+uint256 vaultTVL = totalAssets();
+uint256 minProportionalBond = (vaultTVL * MIN_BOND_TVL_RATIO_BPS) / BPS_DENOMINATOR;
+uint256 effectiveMinBond = minBond > minProportionalBond ? minBond : minProportionalBond;
+require(bondAmount >= effectiveMinBond, "Bond below TVL-proportional minimum");
```
```diff
 // In WSTONBondManager: add on-chain slash relay mechanism
 // Option 1: Accept merkle proofs of HyperEVM slash events
 // Option 2: Allow multiple relayers (redundancy)
 // Option 3: Reduce BOND_EXPIRY and add mandatory re-lock cycle
```
**Fix scope**: (1) Add TVL-proportional bond minimum. (2) Add redundant slash relay mechanism.
**Verified**: NO - architectural changes required.

---

## CH-4: Aave Borrow Tracking Zeroed + Aggregate HF = Leverage Spiral (HIGH)

### Dual-Perspective Verification

**Phase 1 - ATTACKER**:
1. Vault A supplies 100k USDC, borrows 50k USDC via AaveV3Adapter.
2. Aave pool is paused (or reverts on withdraw for any reason).
3. Vault A calls withdrawToVault(). pool.withdraw fails (caught by try-catch at L490-495).
4. _vaultSupplied is correctly restored inside the catch block (L494).
5. BUT _vaultBorrowed is zeroed UNCONDITIONALLY at L501-503 (OUTSIDE the try-catch).
6. Vault A now shows _vaultBorrowed=0 despite having active Aave debt.
7. _checkVaultHealth (L574-592) uses pool.getUserAccountData(address(this)) -- AGGREGATE for all vaults sharing this adapter. Healthy vaults mask the risk.

**Phase 2 - DEFENDER**:
The L-08 fix comment at L498-500 explains the rationale: "clear any lingering _vaultBorrowed tracking for this vault so subsequent _checkVaultHealth calls do not revert with a stale debt against a zeroed supply (which would brick the vault forever)." The intent was to prevent a DoS where ghost debt bricks the vault.

However, the fix is too aggressive: it zeroes borrow tracking even when the withdrawal FAILED (supply was restored). The correct behavior is to zero borrow tracking only when the withdrawal succeeds.

The aggregate HF issue (M-08 FIX at L575-591) is structural: using pool.getUserAccountData(address(this)) returns the adapter-level aggregate, not per-vault.

**Phase 3 - VERDICT**: ATTACKER WINS. Both the unconditional borrow zeroing and aggregate HF are confirmed.

### Execution Result
- **Compiled**: YES (attempts: 1)
- **Result**: PASS
- **Tests**:
  - `test_CH4_borrow_tracking_zeroed_on_failed_withdraw`: PASS - _vaultBorrowed=0 after failed pool.withdraw, while _vaultSupplied correctly restored to 100k
  - `test_CH4_aggregate_hf_masks_per_vault_risk`: PASS - aggregate HF = type(uint256).max despite Vault A having 50k debt against 100k supply (2.0x leverage)
- **Output**: vaultBorrowed drops from 50,000e6 to 0 on failed withdrawal. Aggregate HF returns max_uint256 (no-debt indicator) when individual vaults have significant leverage.
- **Evidence Tag**: [POC-PASS]

### Verdict: CONFIRMED
Both H-6 (borrow zeroing) and H-7 (aggregate HF) are confirmed. The chain proves the leverage spiral: zeroed tracking disables per-vault safeguard, aggregate HF masks cross-vault risk.

### Suggested Fix
```diff
 // In AaveV3Adapter.withdrawToVault():
 // Move borrow zeroing INSIDE the success path
     if (tracked > 0) {
         _vaultSupplied[msg.sender][asset] = 0;
         try pool.withdraw(asset, tracked, msg.sender) returns (uint256) {
             // Success -- asset withdrawn
+            // Only zero borrow tracking on successful withdrawal
+            uint256 trackedBorrow = _vaultBorrowed[msg.sender][asset];
+            if (trackedBorrow > 0) {
+                _vaultBorrowed[msg.sender][asset] = 0;
+                emit BorrowForfeited(msg.sender, asset, trackedBorrow);
+            }
         } catch {
             _vaultSupplied[msg.sender][asset] = tracked;
         }
     }
-    // Remove the unconditional zeroing block at L498-505
```
**Fix scope**: Move _vaultBorrowed zeroing inside pool.withdraw success path. For aggregate HF, implement per-vault health tracking using _vaultSupplied/_vaultBorrowed.
**Verified**: NO - requires restructuring the try-catch block.

---

## CH-5: Morpho Interest Drift + Emergency Exit Block = Locked Collateral (HIGH)

### Dual-Perspective Verification

**Phase 1 - ATTACKER**:
No external attacker needed -- this is a natural operation failure:
1. Vault borrows 30k USDC via MorphoAdapter, supplying 50 WETH as collateral.
2. Time passes. Morpho accrues 5% interest (1,500 USDC).
3. Actual debt: 31,500 USDC. Tracked _vaultBorrowed: 30,000 USDC.
4. Health check (L718) reads stale _vaultBorrowed=30,000. Reports healthy when actual debt is 31,500.
5. Owner attempts emergency exit: withdrawToVault().
6. Adapter repays tracked principal 30,000 USDC (L620-624).
7. Morpho's actual debt is 31,500 USDC. After repaying 30k, 1,500 in borrow shares remain.
8. Morpho blocks withdrawCollateral when ANY borrow shares exist.
9. Collateral (50 WETH) is PERMANENTLY locked.

**Phase 2 - DEFENDER**:
The adapter could use Morpho's share-based repay (repay with 0 assets, type(uint256).max shares) to fully close the position. But the current implementation at L620-624 uses asset-based repay with the tracked nominal amount, which does not cover accrued interest.

Additionally, the vault may not have enough loan tokens to cover the interest difference -- the safeTransferFrom at L620 pulls exactly `vaultBorrow` (tracked amount), and the vault may not hold extra loan tokens for the interest delta.

**Phase 3 - VERDICT**: ATTACKER WINS (natural failure path). Both stale health check and emergency exit failure are confirmed.

### Execution Result
- **Compiled**: YES (attempts: 1)
- **Result**: PASS
- **Tests**:
  - `test_CH5_emergency_exit_reverts_with_interest`: PASS - withdrawToVault reverts with "insufficient collateral" because Morpho blocks withdrawal when residual borrow shares exist after partial repayment
  - `test_CH5_stale_health_check`: PASS - vaultBorrowed returns stale 35,000e6 when actual debt with interest is 42,000e6 (20% underestimate)
- **Output**: Emergency exit reverts. Health check underestimates debt by the full interest amount.
- **Evidence Tag**: [POC-PASS]

### Verdict: CONFIRMED
Both H-8 (emergency exit failure) and H-9 (stale health check) are confirmed. The chain proves permanent collateral lock: stale health prevents detection, broken exit prevents recovery.

### Suggested Fix
```diff
 // In MorphoAdapter.withdrawToVault():
 if (vaultBorrow > 0) {
-    IERC20(params.loanToken).safeTransferFrom(
-        msg.sender, address(this), vaultBorrow
-    );
-    IERC20(params.loanToken).forceApprove(morpho, vaultBorrow);
-    IMorpho(morpho).repay(params, vaultBorrow, 0, address(this), "");
+    // Use share-based repay to cover principal + interest
+    (, uint128 borrowShares,) = IMorpho(morpho).position(marketId, address(this));
+    if (borrowShares > 0) {
+        // Calculate actual assets needed for full share repayment
+        // Pull enough from vault to cover interest delta
+        uint256 actualDebt = /* compute from shares */;
+        IERC20(params.loanToken).safeTransferFrom(
+            msg.sender, address(this), actualDebt
+        );
+        IERC20(params.loanToken).forceApprove(morpho, actualDebt);
+        IMorpho(morpho).repay(params, 0, borrowShares, address(this), "");
+    }
     _vaultBorrowed[msg.sender][marketId] = 0;
 }
```
**Fix scope**: Use Morpho's share-based repay to fully close positions including accrued interest. Also update _checkVaultHealth to read actual Morpho position via IMorpho.position().
**Verified**: NO - requires computing actual debt from Morpho shares.

---

## Summary

| Chain | Verdict | Evidence Tag | Severity | Key Finding |
|-------|---------|-------------|----------|-------------|
| CH-7 | CONFIRMED (H-1) / CONTESTED (H-2) | [POC-PASS] | CRITICAL conditional | TRANSFER_ERC20 compound drain bypasses 40% cumulative cap: 78.4% with 3 actions, 99.4% with 10 |
| CH-3 | CONFIRMED | [POC-PASS] | HIGH | Operator reclaims full bond after vault drain when relayer offline; 2000x ROI with trivial bond |
| CH-4 | CONFIRMED | [POC-PASS] | HIGH | _vaultBorrowed zeroed unconditionally on failed withdrawal; aggregate HF masks per-vault leverage |
| CH-5 | CONFIRMED | [POC-PASS] | HIGH | Emergency exit reverts when interest accrues; health check reads stale nominal borrow |

All 8 PoC tests compiled and executed successfully. All pass.

### New Observations
None -- all findings are well-characterized by the chain hypotheses.
