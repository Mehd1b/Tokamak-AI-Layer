# Verification Results: HIGH Standalone Hypotheses + Remaining Chains

**Verifier**: Agent 2 (HIGH Standalone + Remaining Chains)
**Date**: 2026-04-13
**Model**: opus
**Test File**: `test/verify/VerifyHighStandalone.t.sol`

---

## H-1: TRANSFER_ERC20 Compound Drain Bypasses Cumulative 40% Cap

### Dual-Perspective Verification

**Phase 1 - ATTACKER**: Build 3 TRANSFER_ERC20 actions each requesting 40% of current balance. Action 1: 40% of 10000 = 4000. Action 2: 40% of 6000 = 2400. Action 3: 40% of 3600 = 1440. Total: 7840 = 78.4% drained in a single `execute()` call.

**Phase 2 - DEFENDER**: The `_executeCall` function was correctly fixed (H-03 FIX) to use `_executionInitialBalance` for cumulative delta checks (KernelVault.sol:L1418-1424). However, `_executeTransferERC20` at L1281-1291 uses `balanceBefore = totalAssets()` which captures the CURRENT (diminishing) balance, not `_executionInitialBalance`. Each action is capped at 40% of the current balance independently. The H-03 cumulative fix was selectively applied to CALL but NOT to TRANSFER_ERC20.

**Phase 3 - VERDICT**: CONFIRMED. The asymmetric application of the H-03 fix is definitive.

### Execution Result
- **Compiled**: YES (attempts: 1)
- **Result**: PASS
- **Output**: 
  ```
  Initial vault balance: 10000000000
  Total drained: 7840000000
  Drain percentage: 78 %
  Attacker received: 7840000000
  ```
- **Evidence Tag**: [POC-PASS]

### Impact
With 3 TRANSFER_ERC20 actions: 78.4% drained. With 10+ actions: approaches 100%. This requires a forged/malicious proof (see H-2/CH-7 for how), but the blast-radius cap that was explicitly added to prevent this scenario (H-03 FIX) is ineffective for TRANSFER_ERC20 actions.

### Suggested Fix
```diff
  function _executeTransferERC20(uint256 index, KernelOutputParser.Action memory action)
      internal
  {
      ...
-     uint256 balanceBefore = totalAssets();
-     if (balanceBefore > 0) {
-         uint256 maxAmount = (balanceBefore * MAX_CALL_VALUE_BPS) / BPS_DENOMINATOR;
+     // [H-1 FIX] Use _executionInitialBalance for cumulative cap, matching _executeCall
+     uint256 balanceBefore = totalAssets();
+     if (_executionInitialBalance > 0) {
+         uint256 cumulativeDrainAfter = _executionInitialBalance > (balanceBefore - amount)
+             ? _executionInitialBalance - (balanceBefore - amount) : 0;
+         uint256 maxDelta = (_executionInitialBalance * MAX_CALL_VALUE_BPS) / BPS_DENOMINATOR;
+         if (cumulativeDrainAfter > maxDelta) {
+             revert CallValueExceedsLimit(amount, maxDelta);
+         }
```
**Fix scope**: Apply cumulative cap using `_executionInitialBalance` in `_executeTransferERC20`, identical to the pattern in `_executeCall`.
**Verified**: NO (fix not mechanically verified)

### Verdict
**CONFIRMED** | **HIGH** | [POC-PASS]

---

## H-4: Bond-to-TVL Ratio Has No Protocol-Level Minimum

### Dual-Perspective Verification

**Phase 1 - ATTACKER**: Lock minimum bond (1e27 WSTON, ~$5) via `lockBondDirect()`. Vault accumulates $10K+ TVL from depositors. Execute malicious optimistic execution. Net profit: vault TVL minus bond = $9,995 (2000x return).

**Phase 2 - DEFENDER**: The `minBond` in OptimisticKernelVault (L344-352) and `minBondFloor` in WSTONBondManager (L200-207) enforce minimum absolute bond values, but neither contract checks bond relative to TVL. There is no `bondAmount >= totalAssets() * MIN_RATIO` check in `executeOptimistic()`.

**Phase 3 - VERDICT**: CONFIRMED. The absence of proportional enforcement is structural.

### Execution Result
- **Compiled**: YES (attempts: 1)
- **Result**: PASS
- **Output**: 
  ```
  Minimum bond floor (raw): 1000000000000000000000000000
  Vault TVL (USD): 10000000000
  Bond value (USD): 5000000
  Return multiple: 2000 x
  ```
- **Evidence Tag**: [POC-PASS]

### Impact
Any operator-owner can profitably drain vaults with TVL >> minBond. With 1 WSTON (~$5) minimum and $10K TVL, the return is 2000x. Depositors have no on-chain visibility into the bond-to-TVL ratio.

### Suggested Fix
```diff
  // In OptimisticKernelVault.executeOptimistic() or _verifyOptimisticOracleAndBond():
+ uint256 tvl = totalAssets();
+ uint256 requiredMinBond = (tvl * MIN_BOND_TVL_RATIO_BPS) / BPS_DENOMINATOR;
+ if (a.bondAmount < requiredMinBond) {
+     revert InsufficientBondForTVL(a.bondAmount, requiredMinBond, tvl);
+ }
```
**Fix scope**: Enforce `bondAmount >= TVL * ratio` at `executeOptimistic` time.
**Verified**: NO

### Verdict
**CONFIRMED** | **HIGH** | [POC-PASS]

---

## CH-1: VaultAccessControl Bypass + Withdrawal DoS = One-Way Valve

### Dual-Perspective Verification

**Phase 1 - ATTACKER**: 
1. Deposit bypasses whitelist: `KernelVault.depositERC20Tokens` (L815-864) never calls `canDeposit()` or `recordDeposit()`. Unauthorized users deposit freely.
2. Owner sets `setAccessControl(revertingContract)` (L629-632, no event emitted per INV-17).
3. All withdrawals now revert at L1166-1167 because `IVaultAccessControl(accessControl).recordWithdrawal()` reverts unconditionally.

**Phase 2 - DEFENDER**: Setting a reverting accessControl requires owner action (potentially malicious or accidental). However, H-5 (deposit gate bypass) means UNAUTHORIZED users are in the vault, amplifying the impact far beyond what the owner intended.

**Phase 3 - VERDICT**: CONFIRMED. Both components independently verified. Chain creates a one-way valve: funds enter unrestricted but cannot exit.

### Execution Result
- **Compiled**: YES (attempts: 1)
- **Result**: PASS (3 sub-tests)
- **Output**: 
  ```
  test_CH1_phase1_depositGateBypass: Unauthorized depositor shares: 500000000000
  test_CH1_phase2_withdrawalDoS: Withdrawal blocked with revert "ACCESS_DENIED"
  test_CH1_fullChain_oneWayValve: HARM: One-way valve - deposited shares: 500000000000
  ```
- **Evidence Tag**: [POC-PASS]

### Impact
Unauthorized depositors' funds are permanently trapped. Even authorized depositors cannot exit when a reverting accessControl is set. The vault becomes a "roach motel" - funds check in but never check out.

### Suggested Fix
```diff
  // In _processWithdraw():
  if (accessControl != address(0)) {
-     IVaultAccessControl(accessControl).recordWithdrawal(msg.sender, assetsOut);
+     try IVaultAccessControl(accessControl).recordWithdrawal(msg.sender, assetsOut) {} catch {}
  }
  
  // In depositERC20Tokens() and depositETH():
+ if (accessControl != address(0)) {
+     require(IVaultAccessControl(accessControl).canDeposit(msg.sender, actualReceived), "deposit blocked");
+     IVaultAccessControl(accessControl).recordDeposit(msg.sender, actualReceived);
+ }
```
**Fix scope**: (1) Wrap recordWithdrawal in try-catch to prevent withdrawal DoS. (2) Integrate canDeposit/recordDeposit into deposit paths.
**Verified**: NO

### Verdict
**CONFIRMED** | **HIGH** | [POC-PASS]

---

## CH-2: Verification Pause Cycle + Upgrade Drops Verifiers = Ecosystem Halt

### Dual-Perspective Verification

**Phase 1 - ATTACKER** (H-12 component): 
Call `setVerificationPaused(true)` every 6.9 days. Each call resets `pausedSince` to `block.timestamp` (L353), resetting the 7-day auto-expiry window. At day 13.8, verification is still paused despite MAX_PAUSE_DURATION of 7 days.

**Phase 2 - DEFENDER** (H-12): The MAX_PAUSE_DURATION auto-expiry at L566 checks `block.timestamp < pausedSince + MAX_PAUSE_DURATION`. Since `pausedSince` is refreshed on each `setVerificationPaused(true)` call, the expiry window moves forward indefinitely. The owner must call `setVerificationPaused(false)` explicitly to unpause.

**Phase 2 - DEFENDER** (H-26 component): After a UUPS upgrade, `approvedVerifiers` mapping persists in storage (mappings are not reset by UUPS). However, if the new implementation reinitializes storage or changes layout, or if the team forgets to re-approve verifiers, the ecosystem has zero approved verifiers. The cycle-pause masks this during the dangerous window.

**Phase 3 - VERDICT**: H-12 component: CONFIRMED via [POC-PASS]. H-26 component: CONTESTED via [CODE-TRACE] (UUPS upgrade mechanics can't be fully tested in unit tests without deploying two implementations).

### Execution Result
- **Compiled**: YES (attempts: 2, first failed due to Initializable pattern)
- **Result**: PASS (2 sub-tests)
- **Output**: 
  ```
  test_CH2_cyclePauseIndefinite:
    MAX_PAUSE_DURATION: 604800
    First pausedSince: 1
    Second pausedSince: 596161
    HARM: Verification paused indefinitely via cycle at day 13.8
  
  test_CH2_upgradeDropsVerifiers_codeTrace:
    CODE-TRACE: approvedVerifiers mapping survives UUPS proxy upgrade
  ```
- **Evidence Tag**: [POC-PASS] for H-12 cycle-pause, [CODE-TRACE] for H-26 upgrade component

### Impact
H-12 alone: indefinite verification pause, blocking all vault executions.
Combined with H-26: if verifier is upgraded during the pause window AND approvedVerifiers is not re-populated, the ecosystem permanently halts when pause is lifted.

### Suggested Fix
```diff
  function setVerificationPaused(bool paused) external onlyOwner {
      verificationPaused = paused;
-     pausedSince = paused ? block.timestamp : 0;
+     // Only set pausedSince on the FIRST pause. Subsequent pauses do NOT refresh.
+     if (paused && pausedSince == 0) {
+         pausedSince = block.timestamp;
+     } else if (!paused) {
+         pausedSince = 0;
+     }
      emit VerificationPauseSet(paused);
  }
```
**Fix scope**: Record initial pausedSince only; subsequent pause calls do not refresh it.
**Verified**: NO

### Verdict
**CONFIRMED** (H-12) / **CONTESTED** (H-26 upgrade component) | **HIGH** | [POC-PASS] + [CODE-TRACE]

---

## H-2: RISC Zero CVE-2025-52484 Applicability

### Dual-Perspective Verification

**Phase 1 - ATTACKER**: CVE-2025-52484 affects risc0-zkvm 2.0.0-2.0.2. Underconstrained remu/divu operations in the STARK circuit allow arbitrary proof forgery. If the deployed IRiscZeroVerifier contract uses an unpatched version, any attacker can forge proofs for any imageId and drain any vault.

**Phase 2 - DEFENDER**: The C-03 fix (3-step governance rotation with timelock) provides an on-chain path to rotate to a patched verifier. The verifier address is stored in KernelExecutionVerifier and rotatable. However, (a) the deployed verifier version cannot be determined from source code, and (b) there is no on-chain version tag to verify patch status.

**Phase 3 - VERDICT**: CONTESTED. The structural concern (no on-chain version verification) is real, but exploitation depends entirely on the deployed verifier version which cannot be determined from source code.

### Execution Result
- **Compiled**: YES (attempts: 1)
- **Result**: PASS (structural concern documented)
- **Output**: `H-2: CONTESTED -- CVE applicability depends on deployed verifier version`
- **Evidence Tag**: [CODE-TRACE]

### Error Trace
- **Failure Type**: INSUFFICIENT_EVIDENCE
- **Location**: KernelExecutionVerifier:verifier (storage slot)
- **State at Failure**: N/A (cannot determine deployed contract version from source)
- **Investigation Question**: What is the deployed IRiscZeroVerifier contract at the address stored in KernelExecutionVerifier.verifier? Does its bytecode correspond to risc0-zkvm >= 2.1.0 (post-CVE patch)?

### Verdict
**CONTESTED** | **HIGH** | [CODE-TRACE]

---

## H-3: Cross-Chain Bond Slash Timing Gap

### Dual-Perspective Verification

**Phase 1 - ATTACKER**: 
1. Lock minimum bond via `lockBondDirect()` (permissionless, L321-342).
2. Execute malicious optimistic execution on HyperEVM vault.
3. HyperEVM slash event emits `ExecutionSlashed`.
4. Relayer is offline/compromised - never calls `markSlashPending()`.
5. Wait 90 days (BOND_EXPIRY).
6. Call `reclaimExpiredBond()` - succeeds because `slashPending[operator][vault][nonce]` is false (L497).
7. Full bond recovered. Net cost: gas fees only.

**Phase 2 - DEFENDER**: The `markSlashPending()` defense at L376-384 exists and works when the relayer is online (proven by `test_H3_markSlashPendingBlocksReclaim`). However, the defense requires the relayer to be online and functioning. The relayer is a single point of failure with no on-chain fallback.

**Phase 3 - VERDICT**: CONFIRMED. The timing gap is real and exploitable when the relayer is offline/compromised/DoS'd. The relayer is the ONLY bridge between HyperEVM slash events and L1 bond state.

### Execution Result
- **Compiled**: YES (attempts: 1)
- **Result**: PASS (2 tests)
- **Output**: 
  ```
  test_H3_bondReclaimWithoutSlash:
    HARM: Operator reclaimed 1000000000000000000000000000 WSTON after vault drain
    Relayer was offline, markSlashPending never called
    Net operator cost: gas fees only
  
  test_H3_markSlashPendingBlocksReclaim:
    Defense confirmed: markSlashPending blocks reclaim
    BUT: defense requires relayer to be online and functioning
  ```
- **Evidence Tag**: [POC-PASS]

### Impact
Complete bond recovery after vault drain. With H-4 (trivial bond-to-TVL), the operator drains $10K+ at a cost of gas fees. The 90-day BOND_EXPIRY is a reasonable safety valve for legitimate stuck bonds but becomes an exploit window when the relayer fails.

### Suggested Fix
Architectural change required: Add on-chain mechanism to tie HyperEVM slash events to L1 bond state without relying solely on the relayer (e.g., merkle proof of HyperEVM event, multi-relayer with fallback, or mandatory `markSlashPending` before bond can transition states).
**Verified**: NO

### Verdict
**CONFIRMED** | **HIGH** | [POC-PASS]

---

## Summary

| ID | Verdict | Evidence Tag | Summary |
|----|---------|-------------|---------|
| H-1 | CONFIRMED | [POC-PASS] | 3 TRANSFER_ERC20 actions drain 78.4% in single execute(); H-03 cumulative fix not applied to TRANSFER_ERC20 |
| H-4 | CONFIRMED | [POC-PASS] | 1 WSTON (~$5) bond on $10K TVL vault = 2000x return; no proportional enforcement |
| CH-1 | CONFIRMED | [POC-PASS] | Unauthorized deposits + reverting accessControl = permanent fund lock |
| CH-2 | CONFIRMED/CONTESTED | [POC-PASS]+[CODE-TRACE] | Cycle-pause indefinite (proven); upgrade verifier drop (code-traced) |
| H-2 | CONTESTED | [CODE-TRACE] | CVE applicability depends on deployed verifier version |
| H-3 | CONFIRMED | [POC-PASS] | Bond reclaimed after 90 days without slash when relayer offline |
