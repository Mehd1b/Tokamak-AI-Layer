# DEPTH ANALYSIS: State Trace

**Agent**: depth-state-trace (Opus)
**Scope**: Cross-function state mutation tracing, constraint enforcement verification
**Priority targets**: INV-55, INV-61, INV-62, INV-34, INV-35, SYNC_GAP/CLUSTER_GAP from semantic invariants

---

## Finding [DEPTH-ST-1]: VaultAccessControl deposit gates completely dead — canDeposit() and recordDeposit() never called by KernelVault

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5 | ✗6(N/A — no constraint variable) | ✗7(N/A)
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✓, R8:✗(single-step), R10:✓, R13:✓, R14:✗(no aggregate)]
**Depth Evidence**: [TRACE:depositERC20Tokens→L815-864→no call to canDeposit/recordDeposit→gate bypassed], [TRACE:depositETH→L871-917→no call to canDeposit/recordDeposit→gate bypassed], [BOUNDARY:whitelistEnabled=true, depositor not whitelisted→deposit succeeds anyway because canDeposit never called], [VARIATION:depositCapEnabled=true, cap=100e18, depositor deposits 1000e18→succeeds because cap never checked]
**Severity**: Medium
**Location**: KernelVault.sol:L815-864 (depositERC20Tokens), L871-917 (depositETH); VaultAccessControl.sol:L244-267 (canDeposit)
**Description**:
KernelVault's two deposit entry points (`depositERC20Tokens` and `depositETH`) never call `VaultAccessControl.canDeposit()` or `VaultAccessControl.recordDeposit()`. The access control contract exists as a fully deployed, configured component — an owner can set whitelists, deposit caps, and KYC requirements — but the vault ignores all of them during deposits.

The ONLY integration point is on the withdrawal side: `_processWithdraw` at L1166-1168 calls `recordWithdrawal(msg.sender, assetsOut)`. This creates an asymmetric state: withdrawals decrement a deposit counter that was never incremented by deposits.

**State Graph**:
```
canDeposit (VaultAccessControl)
  ├─ READ BY: NOTHING in KernelVault (dead consumer)
  └─ SHOULD BE READ BY: depositERC20Tokens, depositETH

recordDeposit (VaultAccessControl)
  ├─ CALLED BY: NOTHING in KernelVault (dead caller)
  └─ SHOULD BE CALLED BY: depositERC20Tokens, depositETH

recordWithdrawal (VaultAccessControl)
  ├─ CALLED BY: _processWithdraw L1167 (only integration point)
  └─ EFFECT: decrements deposited[msg.sender] which was never incremented → deposited[user] stays at 0 or goes to 0 via clamp
```

**Impact**:
1. **Whitelist bypass**: Vault owners who deploy VaultAccessControl and configure whitelist + KYC to restrict deposits to approved investors have ZERO enforcement. Any address can deposit.
2. **Deposit cap bypass**: Per-user deposit caps are completely ignored. A whale can deposit unlimited amounts.
3. **KYC circumvention**: If the vault requires KYC verification for regulatory compliance, the requirement is silently unenforced.
4. **Regulatory exposure**: Vault operators who believe they have compliant access controls deployed are in fact running permissionless vaults.

**Evidence**:
```solidity
// KernelVault.sol — depositERC20Tokens (L815-864)
function depositERC20Tokens(uint256 assets) external nonReentrant whenNotPaused returns (uint256 sharesMinted) {
    if (strategyActive) revert DepositsLockedDuringStrategy();
    if (address(asset) == address(0)) revert WrongDepositFunction();
    if (assets == 0) revert ZeroDeposit();
    // ... share calculation and minting ...
    // NO CALL to accessControl.canDeposit(msg.sender, assets)
    // NO CALL to accessControl.recordDeposit(msg.sender, actualReceived)
}

// Compare with _processWithdraw (L1162-1168) — the ONLY integration:
// [M-10 FIX] Decrement the deposit counter in VaultAccessControl
if (accessControl != address(0)) {
    IVaultAccessControl(accessControl).recordWithdrawal(msg.sender, assetsOut);
}
```

**Exploitation trace**: Vault owner deploys VaultAccessControl, enables whitelist with 5 approved addresses. Attacker (not whitelisted) calls `depositERC20Tokens(1_000_000e6)` — deposit succeeds. Attacker holds shares in a vault that was intended to be restricted. If the vault strategy performs well, attacker profits from unauthorized access. If the vault is a regulated vehicle, the operator faces compliance violations.

### Postcondition Analysis
**Postconditions Created**: [Any address can hold shares in a vault that the owner believes is access-controlled]
**Postcondition Types**: [ACCESS, STATE]
**Who Benefits**: [Any unauthorized depositor; potentially regulatory arbitrage]

[CROSS-DOMAIN-DEP: external — if the vault holds regulated securities or has compliance obligations, this becomes a legal liability beyond the on-chain impact]

---

## Finding [DEPTH-ST-2]: AaveV3Adapter withdrawToVault() unconditionally zeroes _vaultBorrowed regardless of pool.withdraw success — health check permanently blinded

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✓, R10:✓, R14:✓]
**Depth Evidence**: [TRACE:withdrawToVault()→L490 pool.withdraw fails (catch)→L494 _vaultSupplied restored→L501-503 _vaultBorrowed zeroed unconditionally→_checkVaultHealth reads _vaultBorrowed=0→returns immediately (no debt)→future borrows unchecked], [BOUNDARY:_vaultBorrowed=1000e6 before withdrawToVault, _vaultBorrowed=0 after failed withdraw→health factor goes from 1.5 to infinity], [VARIATION:pool.withdraw succeeds→borrow zeroed AND supply zeroed (same outcome for borrow tracking)→health check blinded in both paths]
**Severity**: Medium
**Location**: AaveV3Adapter.sol:L476-523 (withdrawToVault), L574-592 (_checkVaultHealth)
**Description**:
The `withdrawToVault()` emergency exit function iterates over supplied assets and attempts to withdraw from the Aave pool. For supply tracking, it correctly handles failure: on `pool.withdraw` catch, it restores `_vaultSupplied[msg.sender][asset] = tracked` (L494). However, for borrow tracking (L498-505), it unconditionally zeroes `_vaultBorrowed[msg.sender][asset]` regardless of whether the supply withdrawal succeeded or failed.

This means after `withdrawToVault()` where the Aave pool withdrawal fails:
- `_vaultSupplied` is correctly restored (vault still has collateral on Aave)
- `_vaultBorrowed` is zeroed (adapter forgets the debt exists)
- `_checkVaultHealth()` reads `_vaultBorrowed = 0`, returns immediately ("no debt"), and future borrows against this vault are never health-checked

**State Graph**:
```
_vaultBorrowed[vault][asset]
  ├─ WRITTEN BY: borrow() L444 (+=), repay() L481-485 (-=), withdrawToVault() L503 (=0 unconditional)
  ├─ READ BY: _checkVaultHealth() L718 — if vaultBorrow == 0, RETURNS IMMEDIATELY
  └─ CONSEQUENCE: after withdrawToVault, vault can borrow unlimited without health check
```

**Impact**:
A vault that calls `withdrawToVault()` on the AaveV3Adapter (even if the underlying pool withdrawal fails due to insufficient liquidity, paused pool, etc.) loses all borrow tracking. The `_checkVaultHealth` function at L574 reads the adapter-level Aave health factor (`pool.getUserAccountData(address(this))`), which is an AGGREGATE across all vaults. But the individual vault's tracked borrow being zeroed means the adapter has lost the ability to attribute debt to specific vaults. A vault could then re-borrow without the per-vault health guard catching it, potentially over-leveraging the shared adapter position and putting other vaults' collateral at risk.

The `BorrowForfeited` event is emitted (L504), but this is purely informational — no on-chain guard prevents the vault from immediately re-borrowing.

**Evidence**:
```solidity
// AaveV3Adapter.sol L490-505
try pool.withdraw(asset, tracked, msg.sender) returns (uint256) {
    // Success
} catch {
    // On failure, restore the tracked balance so the user may retry.
    _vaultSupplied[msg.sender][asset] = tracked; // ← supply restored correctly
}

// L-08: clear any lingering `_vaultBorrowed` tracking
uint256 trackedBorrow = _vaultBorrowed[msg.sender][asset];
if (trackedBorrow > 0) {
    _vaultBorrowed[msg.sender][asset] = 0;  // ← ALWAYS zeroed, even on failure
    emit BorrowForfeited(msg.sender, asset, trackedBorrow);
}
```

**Exploitation trace**: Vault A has 1000 USDC supplied, 500 USDC borrowed on Aave (HF=2.0). Aave pool is temporarily paused. Vault A calls `withdrawToVault()` → pool.withdraw fails → _vaultSupplied restored to 1000 → _vaultBorrowed zeroed from 500 to 0 → BorrowForfeited emitted. Aave pool unpauses. Vault A calls `borrow(500 USDC)` → `_checkVaultHealth` reads Aave aggregate HF (still fine because adapter aggregate is healthy) → borrow succeeds → vault now has 1000 borrowed but adapter thinks it has 500. Repeat: vault can borrow until Aave aggregate HF approaches liquidation, at which point ALL vaults sharing the adapter are at risk.

### Postcondition Analysis
**Postconditions Created**: [_vaultBorrowed zeroed for the vault; health check permanently returns "no debt" for this vault; vault can re-borrow without per-vault health guard]
**Postcondition Types**: [STATE]
**Who Benefits**: [Malicious vault operator can over-leverage; other vaults sharing the adapter are harmed]

---

## Finding [DEPTH-ST-3]: MorphoAdapter withdrawToVault() repays only tracked principal — accrued interest leaves residual borrow shares, locking collateral permanently

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✓, R10:✓, R14:✓]
**Depth Evidence**: [TRACE:borrow(100e6)→_vaultBorrowed=100e6→time passes→Morpho accrues interest→actual debt=105e6→withdrawToVault()→repay(100e6)→residual 5e6 borrow shares remain on Morpho→_vaultBorrowed zeroed→withdrawCollateral()→Morpho reverts "insufficient collateral"→collateral locked], [BOUNDARY:interest_rate=0%→no residual→works correctly; interest_rate>0%→residual grows with time→collateral permanently locked], [VARIATION:time_elapsed=1day→small residual→small collateral locked; time_elapsed=1year→large residual→all collateral locked]
**Severity**: Medium
**Location**: MorphoAdapter.sol:L599-644 (withdrawToVault), L617-633 (repay+collateral section)
**Description**:
The MorphoAdapter's `withdrawToVault()` emergency exit attempts to repay a vault's tracked borrow before withdrawing collateral. The critical flaw: `_vaultBorrowed[vault][marketId]` tracks the PRINCIPAL amount borrowed (incremented by exact `assets` in `borrow()` at L444), but Morpho's actual debt includes accrued interest. When `withdrawToVault()` calls `IMorpho(morpho).repay(params, vaultBorrow, 0, ...)` at L624, it repays only the tracked principal.

The residual borrow shares (representing accrued interest) remain on Morpho. After repay, the code zeroes `_vaultBorrowed` (L625) and attempts `withdrawCollateral` (L631). However, Morpho's own health check prevents collateral withdrawal while any borrow shares remain — the collateral is locked.

**State Graph**:
```
_vaultBorrowed[vault][marketId]
  ├─ WRITTEN BY: borrow() L444 (+=principal), repay() L481-485 (-=principal, capped), withdrawToVault() L625 (=0)
  ├─ Morpho's ACTUAL borrow: principal + accrued interest (grows over time)
  └─ DIVERGENCE: _vaultBorrowed tracks LESS than Morpho's actual debt after any time passes
```

**Impact**:
For any vault that has an active borrow position on MorphoAdapter and calls `withdrawToVault()`:
1. Repay attempts to send `vaultBorrow` (tracked principal) — leaves accrued interest unpaid
2. `_vaultBorrowed` is zeroed — adapter loses debt tracking
3. `_vaultCollateral` is zeroed — adapter loses collateral tracking  
4. `withdrawCollateral` reverts on Morpho because residual borrow shares exist
5. Collateral is PERMANENTLY locked in the Morpho market

The longer the borrow has been active, the more interest accrues, and the more collateral is locked. This affects ALL emergency exit scenarios — there is no alternative exit path for collateral when borrow interest has accrued.

**Evidence**:
```solidity
// MorphoAdapter.sol L617-633 (withdrawToVault emergency path)
if (vaultBorrow > 0) {
    // Pull the loan token from the vault to repay its debt
    IERC20(params.loanToken).safeTransferFrom(
        msg.sender, address(this), vaultBorrow  // ← vaultBorrow = tracked principal only
    );
    IERC20(params.loanToken).forceApprove(morpho, vaultBorrow);
    IMorpho(morpho).repay(params, vaultBorrow, 0, address(this), "");
    // ↑ Repays principal only. If Morpho actual debt = principal + interest,
    //   residual borrow shares remain.
    _vaultBorrowed[msg.sender][marketId] = 0;
}

if (vaultCollat > 0) {
    _vaultCollateral[msg.sender][marketId] = 0;  // ← zeroed before external call
    IMorpho(morpho).withdrawCollateral(
        params, vaultCollat, address(this), msg.sender
    );
    // ↑ REVERTS on Morpho because residual borrow shares prevent collateral withdrawal
    // Since _vaultCollateral was already zeroed, the tracking is now lost.
}
```

Note the additional issue: `_vaultCollateral` is zeroed at L630 BEFORE the `withdrawCollateral` external call at L631-633. If `withdrawCollateral` reverts (which it will when residual borrows exist), the entire `withdrawToVault()` call reverts — but this means the vault CANNOT perform ANY emergency exit. The entire function reverts, not just the collateral portion.

**Exploitation trace**: Vault borrows 1000 USDC at 5% APR on Morpho, deposits 2000 USDC as collateral. After 1 year, actual debt = 1050 USDC. Vault calls `withdrawToVault()` → pulls 1000 USDC from vault → repays 1000 to Morpho → 50 USDC of borrow shares remain → `withdrawCollateral(2000)` reverts on Morpho → ENTIRE `withdrawToVault()` reverts → vault cannot emergency exit. The 2000 USDC collateral AND any supply positions are locked.

### Postcondition Analysis
**Postconditions Created**: [Collateral permanently locked in Morpho; entire withdrawToVault reverts; vault cannot emergency exit from Morpho adapter]
**Postcondition Types**: [STATE, BALANCE]
**Who Benefits**: [No one benefits — this is a locking condition. Depositors lose access to collateral. Combined with INV-70 (vault lacks loan tokens for repay), the locking is compounded.]

[CROSS-DOMAIN-DEP: token-flow — if the vault does not hold sufficient loan tokens to cover the full debt including interest, the safeTransferFrom at L620-622 would also revert, blocking the emergency exit even earlier]

---

## Finding [DEPTH-ST-4]: Cross-chain slash has no time-bound — relayer liveness gap allows bond reclamation after 90 days regardless of slash obligation

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5
**Rules Applied**: [R4:✓, R5:✗(single entity), R6:✗(no role), R8:✓, R10:✓, R12:✓]
**Depth Evidence**: [TRACE:slashExpired on HyperEVM→emits ExecutionSlashed→relayer observes→must call markSlashPending + slashBondByRelayer on L1→if relayer offline for 90 days→operator calls reclaimExpiredBond→bond released→zero penalty], [BOUNDARY:BOND_EXPIRY=90days→relayer must act within 90 days of lockBond→if slash happens at day 89→relayer has 1 day to relay], [VARIATION:relayer offline 1 day→bond still locked (slashPending protects)→relayer offline 91 days→bond can be reclaimed even with slashPending=false (markSlashPending never called)]
**Severity**: Medium
**Location**: WSTONBondManager.sol:L346-437 (slashBondByRelayer), L376-384 (markSlashPending), L487-515 (reclaimExpiredBond); OptimisticKernelVault.sol:L293-307 (slashExpired)
**Description**:
The cross-chain bond lifecycle has a critical timing dependency on the trusted relayer. When `slashExpired()` is called on HyperEVM (emitting `ExecutionSlashed`), the relayer must perform TWO L1 transactions:
1. `markSlashPending(operator, vault, nonce)` — sets `slashPending[op][vault][nonce] = true` to block `reclaimExpiredBond`
2. `slashBondByRelayer(operator, vault, nonce, slasher)` — actually slashes the bond

If the relayer fails to call `markSlashPending` before the bond's 90-day expiry (`bond.lockedAt + BOND_EXPIRY`), the operator can call `reclaimExpiredBond`. The `slashPending` check at L497 passes (it's still `false` because the relayer never called `markSlashPending`), and the operator reclaims their full bond.

There is NO on-chain mechanism that ties the HyperEVM slash event to the L1 bond state. The `slashPending` flag is the ONLY bridge, and it is set exclusively by the relayer or owner.

**State Graph**:
```
slashPending[op][vault][nonce]
  ├─ WRITTEN BY: markSlashPending() L382 (=true, relayer/owner only), slashBondByRelayer() L403 (=false)
  ├─ READ BY: reclaimExpiredBond() L497 (blocks reclaim if true)
  └─ DEFAULT: false — bond can be reclaimed if relayer never sets it
```

**Impact**:
Attack scenario: Operator executes optimistically, drains vault of depositor funds. Challenge window expires, anyone calls `slashExpired()` on HyperEVM. Operator then DoS-attacks or waits for the relayer to fail/go offline. After 90 days from bond lock, operator calls `reclaimExpiredBond()` — reclaims full WSTON bond. Net result: operator stole vault funds AND recovered their bond (zero economic penalty). Depositors lose their vault assets with no bond compensation.

The `owner` can also call `markSlashPending` as backup (L377), but this requires the owner to be actively monitoring HyperEVM events and manually intervening on L1.

**Evidence**:
```solidity
// WSTONBondManager.sol L487-515
function reclaimExpiredBond(address vault, uint64 nonce) external nonReentrant {
    BondInfo storage bond = bonds[msg.sender][vault][nonce];
    if (bond.status != BondStatus.Locked) { revert ... }
    
    // [H-02 FIX] Block reclamation if a cross-chain slash is pending.
    if (slashPending[msg.sender][vault][nonce]) {
        revert UnresolvedSlashPending();  // ← Only blocks if relayer already called markSlashPending
    }
    
    uint256 expiry = bond.lockedAt + BOND_EXPIRY;  // 90 days
    if (block.timestamp < expiry) { revert ... }
    
    // Reclaim full bond — zero penalty
    bond.status = BondStatus.Released;
    totalBonded[msg.sender] -= amount;
    totalLockedGlobal -= amount;
    wston.safeTransfer(msg.sender, amount);
}
```

### Postcondition Analysis
**Postconditions Created**: [Operator reclaims bond after vault drain; depositors receive zero compensation; economic security assumption of optimistic execution is violated]
**Postcondition Types**: [TIMING, EXTERNAL]
**Who Benefits**: [Malicious operator — drains vault + recovers bond if relayer is offline for >90 days from bond lock]

[CROSS-DOMAIN-DEP: external — the relayer is a centralized off-chain service (documented as FULLY_TRUSTED). Its liveness is the sole guarantee that slashes are enforced on L1. No on-chain fallback exists beyond the owner manually calling markSlashPending.]

---

## Finding [DEPTH-ST-5]: KernelExecutionVerifier cycle-pause bypasses MAX_PAUSE_DURATION — verifier owner can halt all executions indefinitely

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✓, R8:✗(single-step), R10:✓, R13:✓]
**Depth Evidence**: [TRACE:setVerificationPaused(true)→pausedSince=T0→7 days pass→auto-expiry at T0+7d→owner calls setVerificationPaused(true) again→pausedSince=T0+7d→new 7-day window opens→repeat indefinitely], [BOUNDARY:MAX_PAUSE_DURATION=7days→auto-expiry check: block.timestamp < pausedSince + MAX_PAUSE_DURATION→when pausedSince is refreshed, the check window resets], [VARIATION:single pause→7d max→cycle pause every 7d→indefinite pause]
**Severity**: Medium (downgraded from potential High — verifier owner is FULLY_TRUSTED per trust table)
**Location**: KernelExecutionVerifier.sol:L350-355 (setVerificationPaused), L564-568 (auto-expiry check)
**Description**:
`setVerificationPaused(true)` sets `pausedSince = block.timestamp`. The auto-expiry check at L566 (`block.timestamp < pausedSince + MAX_PAUSE_DURATION`) uses the LATEST `pausedSince` value. If the owner calls `setVerificationPaused(true)` again just before the 7-day window expires, `pausedSince` is refreshed to `block.timestamp`, and the 7-day counter restarts.

The auto-expiry was intended as a safety valve to prevent indefinite pausing, but the cycle-pause pattern completely nullifies it. The owner can keep the system paused indefinitely by calling `setVerificationPaused(true)` once every 7 days.

**State Graph**:
```
pausedSince
  ├─ WRITTEN BY: setVerificationPaused(true) → pausedSince = block.timestamp (refreshes)
  ├─ WRITTEN BY: setVerificationPaused(false) → pausedSince = 0
  ├─ READ BY: verifyAndParseWithImageId L566, verifyAndParseOptimistic L592
  └─ AUTO-EXPIRY: block.timestamp >= pausedSince + MAX_PAUSE_DURATION → pause ignored
  └─ BYPASS: re-pause before expiry refreshes pausedSince → new 7-day window
```

**Impact**:
A malicious or compromised verifier owner can permanently halt all vault executions across the entire protocol. No ZK proofs can be verified, no optimistic executions can be submitted, no agent actions can be executed. All depositor funds are frozen in vaults (deposits locked during strategy if strategy is active, and withdrawals still work via emergency path after 14 days, but no new value-generating actions can occur).

Combined with INV-35 (48h verifier rotation delay vs 7d max pause), even a legitimate emergency scenario creates a gap: if the verifier is discovered to be compromised, the owner pauses (7 days), proposes a new verifier (starts 48h timelock), but must re-pause at day 7 to keep the system safe until the new verifier is activated. The cycle-pause is necessary for this legitimate use case but also enables indefinite DoS.

**Evidence**:
```solidity
// KernelExecutionVerifier.sol L350-354
function setVerificationPaused(bool paused) external onlyOwner {
    verificationPaused = paused;
    pausedSince = paused ? block.timestamp : 0;  // ← refreshes on every call
    emit VerificationPauseSet(paused);
}

// L564-568 (auto-expiry check)
if (verificationPaused && block.timestamp < pausedSince + MAX_PAUSE_DURATION) {
    revert VerificationPaused();
}
// ↑ If pausedSince was refreshed 1 second ago, this blocks for another 7 days
```

### Postcondition Analysis
**Postconditions Created**: [All vault executions halted; no ZK proofs verified; depositor funds frozen in active strategies]
**Postcondition Types**: [STATE, TIMING]
**Who Benefits**: [Attacker who compromises verifier owner key; or verifier owner conducting a "soft rug" — freeze protocol while extracting value through other means]

---

## Finding [DEPTH-ST-6]: snapshotTotalAssets and snapshotTotalShares can desynchronize via independent clamping in _processEmergencyWithdraw — PPS distortion in edge case

**Verdict**: PARTIAL
**Step Execution**: ✓1,2,3,4 | ✗5(N/A, no constraint variable)
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R14:✓]
**Depth Evidence**: [TRACE:_processEmergencyWithdraw→L1636: if assetsOut > snapshotTotalAssets then snapshotTotalAssets=0→L1641: if shareAmount > snapshotTotalShares then snapshotTotalShares=0→these fire INDEPENDENTLY→one can be 0 while other is positive], [BOUNDARY:snapshotTotalAssets=1 (dust), snapshotTotalShares=1000→emergency withdraw with assetsOut=2→snapshotTotalAssets clamped to 0→snapshotTotalShares=1000-shareAmount→PPS=0/denomShares=0→all remaining shares worth 0], [VARIATION:with equal rounding→both go to 0 simultaneously (safe); with asymmetric rounding→one hits 0 first (potential PPS distortion)]
**Severity**: Low
**Location**: KernelVault.sol:L1628-1646 (_processEmergencyWithdraw, else-if branch)
**Description**:
In `_processEmergencyWithdraw`, when `strategyActive` is true and the vault is not fully drained, the function independently clamps `snapshotTotalAssets` and `snapshotTotalShares` to prevent underflow (L1636-1645). These two clamps can fire at different times:

```solidity
if (assetsOut > snapshotTotalAssets) {
    snapshotTotalAssets = 0;    // Clamp A fires
} else {
    snapshotTotalAssets -= assetsOut;
}
if (shareAmount > snapshotTotalShares) {
    snapshotTotalShares = 0;    // Clamp B fires
} else {
    snapshotTotalShares -= shareAmount;
}
```

If Clamp A fires but Clamp B does not, `snapshotTotalAssets = 0` while `snapshotTotalShares > 0`. The PPS formula `effectiveTotalAssets * 1e18 / snapshotTotalShares` returns 0, meaning all remaining share holders' claims are valued at 0.

However, this requires a specific sequence: the partial withdrawal fallback (L1603-1611) scaling `shareAmount = (shareAmount * available) / origAssets` can create exactly this asymmetry if `available` is close to but not exactly aligned with the snapshot ratio.

**Impact**:
In the edge case where the snapshot desynchronizes:
- Remaining depositors see PPS = 0 during the strategy period
- Their emergency withdrawals would receive 0 assets per share (reverts via `ZeroAssetsOut` check)
- The situation self-resolves when `totalShares` eventually reaches 0 (triggering the `if (totalShares == 0 && strategyActive)` full-reset branch at L1628)

The practical impact is bounded because: (1) this only occurs in emergency withdrawal during active strategy, (2) the desynchronization requires specific dust-level rounding, and (3) the full-drain branch eventually resets both. But during the window, remaining depositors may be temporarily unable to emergency-withdraw.

**Evidence**: See code block above. The independent clamping at L1636 and L1641 operates on different quantities (`assetsOut` vs `shareAmount`) which are not guaranteed to be proportional when the partial withdrawal fallback modifies `shareAmount`.

### Precondition Analysis
**Missing Precondition**: [Requires very specific rounding scenario where snapshotTotalAssets is nearly exhausted but snapshotTotalShares is not]
**Precondition Type**: STATE
**Why This Blocks**: [Under normal conditions, assets and shares are proportionally aligned. The asymmetry requires the partial-withdrawal scaling at L1608 to create a disproportionate share burn.]

---

## Finding [DEPTH-ST-7]: _pendingCount cannot self-correct if slash external call chain reverts — pending execution stuck permanently

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5
**Rules Applied**: [R4:✓, R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R14:✗(no aggregate)]
**Depth Evidence**: [TRACE:slashExpired()→L302: bondAmount = pending.bondAmount→L303: pending.status = STATUS_SLASHED→L304: _pendingCount--→L306: emit ExecutionSlashed→if any line between L302-306 reverts→_pendingCount not decremented→but slashExpired CANNOT partially revert (no external calls)→SAFE in slashExpired], [TRACE:submitProof()→L280: try verifier.verify...→on catch: revert ProofVerificationFailed→_pendingCount not decremented→pending stays open→SAFE because catch explicitly reverts], [TRACE:_settle()→L493: if _pendingCount > 0 revert→settle blocked while any pending→settlement impossible if _pendingCount stuck above 0], [BOUNDARY:_pendingCount=maxPending=3→all 3 stuck→no new optimistic executions possible→settle blocked→vault permanently frozen]
**Severity**: Low
**Location**: OptimisticKernelVault.sol:L37-38 (_pendingCount), L285 (submitProof decrement), L304 (slashExpired decrement), L320 (selfSlash decrement), L493 (_settle guard)
**Description**:
The `_pendingCount` variable tracks in-flight optimistic executions. It is incremented in `executeOptimistic` and decremented in exactly three places: `submitProof`, `slashExpired`, and `selfSlash`. The semantic invariant analysis flagged a CLUSTER_GAP: if a decrement path reverts, `_pendingCount` cannot be corrected.

Upon deep analysis, the three decrement paths are all internally consistent — none make external calls that could cause partial execution:
- `slashExpired`: pure state updates + emit (no external calls)
- `selfSlash`: pure state updates + emit (no external calls)
- `submitProof`: calls `verifier.verify()` in a try-catch, but on failure explicitly reverts (L281), and on success proceeds to decrement

However, there IS a liveness concern: if `submitProof` calls `verifier.verify()` and the verifier is a compromised/bricked contract that always reverts, the proof path is permanently blocked. The only remaining resolution paths are `slashExpired` (requires deadline to pass) and `selfSlash` (requires owner). If the owner is also unresponsive, `slashExpired` is the sole path, and it works — but only after the challenge window expires.

The real risk is: if `maxPending` is reached AND the verifier is bricked, AND the owner is unresponsive, then after all challenge windows expire, third parties must call `slashExpired` for each pending execution individually. Until all are resolved, `_settle()` is blocked and the vault cannot exit strategy mode.

**Impact**:
Temporary vault freezing (settlement blocked) while pending executions are resolved. Self-resolves through `slashExpired` after challenge windows expire. Not a permanent lock — but could delay settlement by up to `maxPending * MAX_CHALLENGE_WINDOW` (10 * 24h = 240h = 10 days in worst case).

**Evidence**:
```solidity
// OptimisticKernelVault.sol L492-496
function _settle() internal override {
    if (_pendingCount > 0) {
        revert TooManyPending(_pendingCount, 0);  // ← blocks ALL settlement
    }
    super._settle();
}
```

### Postcondition Analysis
**Postconditions Created**: [Settlement blocked while pending count > 0; vault frozen in strategy mode]
**Postcondition Types**: [STATE, TIMING]
**Who Benefits**: [No one directly benefits — this is a liveness/DoS condition]

---

## Finding [DEPTH-ST-8]: MorphoAdapter health check uses tracked _vaultBorrowed (principal only) — actual Morpho debt including interest is understated, enabling over-borrowing

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✓, R10:✓, R14:✓]
**Depth Evidence**: [TRACE:borrow(100e6)→_vaultBorrowed+=100e6→1 year passes at 10% APR→Morpho actual debt=110e6→_vaultBorrowed still=100e6→_checkVaultHealth uses 100e6→allows more borrowing than safe], [BOUNDARY:_vaultBorrowed=100e6, actual Morpho debt=200e6 (after extreme interest accrual)→health check uses 100e6→position appears 2x healthier than it is], [VARIATION:APR=0%→tracked=actual→health check accurate; APR=10%→1 year→tracked=100e6, actual=110e6→10% understated; APR=50%→1 year→tracked=100e6, actual=150e6→33% understated]
**Severity**: Medium
**Location**: MorphoAdapter.sol:L712-740 (_checkVaultHealth), L444 (borrow tracking)
**Description**:
`_checkVaultHealth` at L718 reads `uint256 vaultBorrow = _vaultBorrowed[vault][marketId]`. This value is the cumulative sum of principal amounts borrowed (incremented by exact `assets` in `borrow()` L444) minus principal amounts repaid (decremented in `repay()` L481-485). It does NOT include Morpho's accrued interest.

Morpho Blue calculates actual debt as `borrowShares * totalBorrowAssets / totalBorrowShares`, which includes compounded interest. Over time, the actual debt grows above the tracked principal. The health check compares tracked (stale, low) borrow against collateral value — the position appears healthier than it actually is.

This allows a vault to borrow beyond the safety threshold because the adapter's health check sees a lower borrow amount than Morpho's actual position. The adapter's own `HEALTH_FACTOR_BPS` haircut is designed to provide a safety buffer, but this buffer is consumed by the untracked interest growth.

**Impact**:
A vault can progressively over-borrow as interest accrues on existing positions. The adapter's health check understates leverage, allowing the vault to take on more debt than the configured safety threshold permits. Over time, the position can approach Morpho's liquidation threshold without the adapter detecting it. If liquidation occurs, the collateral loss affects the adapter's aggregate position — harming ALL vaults sharing the adapter.

**Evidence**:
```solidity
// MorphoAdapter.sol L718
uint256 vaultBorrow = _vaultBorrowed[vault][marketId];  // ← tracked principal only
// ...
if (vaultBorrow > maxBorrow) {
    revert UnhealthyPosition(vaultBorrow, maxBorrow);
}
// ↑ vaultBorrow is stale (no interest), maxBorrow is correct → allows over-borrowing
```

### Postcondition Analysis
**Postconditions Created**: [Health check gives false sense of safety; actual leverage higher than tracked; approaching liquidation threshold silently]
**Postcondition Types**: [STATE]
**Who Benefits**: [Vault operator who wants to maximize leverage beyond safety limits; other vaults sharing adapter are harmed if liquidation occurs]

---

## COMBINATION DISCOVERY

### Combination 1: DEPTH-ST-2 (Aave borrow tracking zeroed) → INV-04 (aggregate HF cross-vault)
After `withdrawToVault()` fails and zeroes `_vaultBorrowed`, the vault can re-borrow without per-vault health check. Combined with INV-04 (the adapter uses Aave's aggregate HF, not per-vault), this means a single vault can accumulate unlimited debt under the aggregate umbrella until it pushes ALL vaults toward liquidation.

### Combination 2: DEPTH-ST-3 (Morpho collateral locked) + INV-70 (vault lacks loan tokens for repay)
If the vault does not hold sufficient loan tokens to cover the accrued interest, `safeTransferFrom` at L620-622 reverts BEFORE the repay attempt. This means `withdrawToVault()` reverts entirely — the vault cannot exit from Morpho at all. Combined: any Morpho position with active borrows becomes permanently locked if the vault does not proactively hold loan token reserves.

### Combination 3: DEPTH-ST-1 (deposit gates dead) + INV-19 (DoS via reverting accessControl)
Vault owner configures VaultAccessControl (thinking it enforces deposits). Later sets a reverting contract as accessControl. Deposits still work (canDeposit never called), but withdrawals revert at L1167 `recordWithdrawal`. Result: funds can enter but cannot exit — one-way valve.

---

## REFUTED STATUS UPDATES (Brief)

- **INV-30 (strategyActive persists after exit)**: Reviewed — the `_processEmergencyWithdraw` at L1628 correctly clears `strategyActive` when `totalShares == 0`. For normal withdrawals, the flag persisting is by design (strategy is still active until settled). REFUTED status confirmed — no upgrade needed.

- **INV-32 (setChallengeWindow blocks decrease with pending)**: The guard at L336 (`if (window < challengeWindow && _pendingCount > 0) revert`) correctly prevents shortening the window while executions are pending. Allowing increases is safe because it only extends deadlines. REFUTED status confirmed.

---

## FINDING INDEX

| ID | Severity | Location | Title | Source |
|----|----------|----------|-------|--------|
| DEPTH-ST-1 | Medium | KernelVault.sol:L815-917, VaultAccessControl.sol:L244-267 | VaultAccessControl deposit gates completely dead — canDeposit()/recordDeposit() never called | INV-55, PC2-1, RS1-1 |
| DEPTH-ST-2 | Medium | AaveV3Adapter.sol:L476-523, L574-592 | withdrawToVault() unconditionally zeroes _vaultBorrowed regardless of pool.withdraw success | INV-61, PC5-1 |
| DEPTH-ST-3 | Medium | MorphoAdapter.sol:L599-644 | withdrawToVault() repays only tracked principal — interest residual locks collateral | INV-62, PC5-2 |
| DEPTH-ST-4 | Medium | WSTONBondManager.sol:L376-515 | Cross-chain slash has no time-bound — relayer liveness gap allows bond reclamation | INV-34, TC-4 |
| DEPTH-ST-5 | Medium | KernelExecutionVerifier.sol:L350-355, L564-568 | Cycle-pause bypasses MAX_PAUSE_DURATION — indefinite execution halt | INV-31, INV-35 |
| DEPTH-ST-6 | Low | KernelVault.sol:L1628-1646 | snapshotTotalAssets/snapshotTotalShares independent clamping desync | SYNC_GAP (semantic invariants) |
| DEPTH-ST-7 | Low | OptimisticKernelVault.sol:L37-38, L493 | _pendingCount self-correction impossible if resolution paths blocked | CLUSTER_GAP (semantic invariants) |
| DEPTH-ST-8 | Medium | MorphoAdapter.sol:L712-740 | Health check uses tracked principal, not actual Morpho debt including interest | INV-73, SE-7 |

---

## Chain Summary (MANDATORY)

| Finding ID | Location | Root Cause (1-line) | Verdict | Severity | Precondition Type | Postcondition Type |
|------------|----------|--------------------:|---------|----------|-------------------|-------------------|
| DEPTH-ST-1 | KernelVault.sol:L815-917 | canDeposit/recordDeposit never integrated into deposit flow | CONFIRMED | Medium | — | ACCESS, STATE |
| DEPTH-ST-2 | AaveV3Adapter.sol:L476-523 | _vaultBorrowed zeroed unconditionally in withdrawToVault regardless of withdraw success | CONFIRMED | Medium | — | STATE |
| DEPTH-ST-3 | MorphoAdapter.sol:L599-644 | withdrawToVault repays tracked principal only, Morpho interest creates residual blocking collateral withdrawal | CONFIRMED | Medium | — | STATE, BALANCE |
| DEPTH-ST-4 | WSTONBondManager.sol:L376-515 | No on-chain mechanism ties HyperEVM slash event to L1 bond state; relayer is sole bridge | CONFIRMED | Medium | EXTERNAL | TIMING, EXTERNAL |
| DEPTH-ST-5 | KernelExecutionVerifier.sol:L350-355 | setVerificationPaused refreshes pausedSince on every call, resetting 7-day auto-expiry | CONFIRMED | Medium | — | STATE, TIMING |
| DEPTH-ST-6 | KernelVault.sol:L1628-1646 | Independent clamp logic for snapshot assets vs shares in emergency withdraw | PARTIAL | Low | STATE | STATE |
| DEPTH-ST-7 | OptimisticKernelVault.sol:L37-38 | _pendingCount decremented only in 3 specific paths; no admin correction mechanism | CONFIRMED | Low | — | STATE, TIMING |
| DEPTH-ST-8 | MorphoAdapter.sol:L712-740 | _vaultBorrowed tracks principal only; interest accrual makes health check progressively stale | CONFIRMED | Medium | — | STATE |

Coverage: 8/8 priority finding cards addressed.
