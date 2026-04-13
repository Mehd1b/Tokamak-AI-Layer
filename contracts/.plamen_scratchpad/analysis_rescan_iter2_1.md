# Breadth Re-Scan Agent (Iteration 2) #1 — New Findings

> Two prior passes found 75 findings. This is the THIRD set of eyes.
> Scope: All src/ contracts, focused on cross-contract interactions, subtle state coupling, and asymmetric fixes.
> Output: At most 3 new findings not in the 75-finding exclusion list.

---

## Finding [RS3-1]: TRANSFER_ERC20 Batch Drain Bypasses C-04 Cumulative Cap

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5 | ✗6(N/A)
**Rules Applied**: [R4:✓, R5:✗(single vault), R6:✗(requires operator+valid proof, not semi-trusted role scenario), R8:✓, R10:✓, R11:✗(no unsolicited token), R14:✗(no independently-settable constraint), R15:✗(no flash-loan-accessible state)]
**Severity**: Medium
**Location**: `src/KernelVault.sol:L1283-1299` (_executeTransferERC20) vs `src/KernelVault.sol:L1410-1424` (_executeCall)

**Description**:

The H-03/C-04 fix added a cumulative drain cap for CALL actions in _executeCall (L1410-1424). It captures _executionInitialBalance once at the start of _executeActions (L1049) and checks that total vault depletion across all CALL actions does not exceed MAX_CALL_ASSET_DELTA_BPS (40%) of that initial balance.

However, _executeTransferERC20 (L1283-1299) was given only a per-action cap: each TRANSFER_ERC20 action is individually checked against balanceBefore (the live current balance at the time that action executes). There is no cumulative tracking across TRANSFER_ERC20 actions.

Because balanceBefore is re-read from totalAssets() at the start of each _executeTransferERC20 call, the denominator shrinks after every transfer. An agent producing N TRANSFER_ERC20 actions each requesting exactly MAX_CALL_VALUE_BPS / BPS_DENOMINATOR = 40% of the current balance will compound:

    Remaining after k actions = Initial × (1 - 0.40)^k = Initial × 0.60^k

With MAX_ACTIONS_PER_OUTPUT = 64 TRANSFER_ERC20 actions:

    Drained = 1 - 0.60^64 ≈ 1 - 1.15×10^{-14} ≈ 100%

A single execute() call with a valid proof can drain the vault to effectively zero through TRANSFER_ERC20 actions, defeating the "monitoring window" that the C-04/H-03 fix was designed to create.

The asymmetry is documented in the inline fix comment at L1413-1415:
"This prevents compound drain: with the old code, 3 actions each draining 40% of current balance would remove 78.4%. With this fix, cumulative drain across ALL actions is capped at 40% of the initial balance."
This description applies to CALL actions only. _executeTransferERC20 still has the old code pattern the comment warns about.

**Impact**:

A vault operator who submits a valid zkVM proof encoding 64 TRANSFER_ERC20 actions, each for 40% of the current balance, can drain close to 100% of vault assets in a single execute() transaction. This bypasses the defense-in-depth layer that the H-03 fix intended to provide for vault depositors, concentrating the risk of a rogue/compromised agent. The CALL-action cumulative cap (MAX_CALL_ASSET_DELTA_BPS = 4000) correctly limits CALL-based drain to 40%. The TRANSFER_ERC20 path has no equivalent cumulative limit.

**Evidence**:

Per-action cap in _executeTransferERC20 (L1281-1299) — balanceBefore is current, not initial:
```
uint256 balanceBefore = totalAssets();           // re-read every call
if (balanceBefore > 0) {
    uint256 maxAmount = (balanceBefore * MAX_CALL_VALUE_BPS) / BPS_DENOMINATOR;
    if (amount > maxAmount) {
        revert CallValueExceedsLimit(amount, maxAmount);
    }
}
```

Cumulative cap in _executeCall (L1416-1424) — uses _executionInitialBalance set once:
```
uint256 cumulativeDrain = _executionInitialBalance > balanceAfter
    ? _executionInitialBalance - balanceAfter
    : 0;
uint256 maxDelta = (_executionInitialBalance * MAX_CALL_ASSET_DELTA_BPS) / BPS_DENOMINATOR;
if (cumulativeDrain > maxDelta) {
    revert CallAssetDeltaExceedsLimit(cumulativeDrain, maxDelta);
}
```

_executionInitialBalance set once at L1049:
```
_executionInitialBalance = totalAssets();
```

---

## Finding [RS3-2]: PointsProgram Referral Graph Allows Multi-Hop Cycles (3+ Node Rings)

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5 | ✗6(N/A)
**Rules Applied**: [R4:✗(no external deps), R5:✗(single referral tree per call), R6:✗(no semi-trusted role), R8:✗(single-step setter), R10:✓, R11:✗(no external tokens), R13:✓, R14:✗(no aggregate constraint), R15:✗(no flash-loan-accessible state)]
**Severity**: Low
**Location**: `src/PointsProgram.sol:L408-417` (setReferrer)

**Description**:

setReferrer contains a single-hop cycle check: it reverts if referrers[referrer] == user (i.e., if A tries to set B as referrer when B already has A as referrer). This prevents the trivial 2-node cycle A->B->A.

However, cycles of length 3 or more are not checked. A three-node ring A->B->C->A can be constructed:
1. A calls setReferrer(B) — referrers[B] is not A, check passes.
2. B calls setReferrer(C) — referrers[C] is not B, check passes.
3. C calls setReferrer(A) — referrers[A] is B (not C), check at L413 passes. A 3-cycle now exists.

With accruePoints awarding a referral bonus to referrers[user] (one level only), each ring member's deposit triggers a bonus for the next member in the ring. A group of 3+ colluding accounts can collectively self-award referral bonuses without introducing any genuine new users.

**Impact**:

Colluding groups of 3+ accounts can form mutual referral rings. Each deposit by any ring member triggers a bonus accrual for the next member. Since PointsProgram points are non-transferable and the bonus rate is fixed (referralBonusBps), the exploit does not compound infinitely per deposit. However, the referral system loses its intended tree structure and ring members self-award referral bonuses without any genuine new-user introduction. Severity is bounded by point non-transferability and the absence of an immediate financial claim, but a future point-to-reward conversion would amplify the economic impact.

**Evidence**:

Single-hop check in setReferrer (L408-417):
```
function setReferrer(address user, address referrer) external onlyAuthorizedRecorder {
    if (referrer == address(0) || referrer == user) revert InvalidReferrer();
    if (referrers[user] != address(0)) revert ReferrerAlreadySet();
    if (referrers[referrer] == user) revert SelfReferral();  // only 1-hop check
    referrers[user] = referrer;
    emit ReferrerSet(user, referrer);
}
```

Referral bonus in accruePoints — one level only:
```
address ref = referrers[user];
if (ref != address(0)) {
    uint256 bonus = (points * referralBonusBps) / BPS_DENOMINATOR;
    _mintPoints(ref, bonus);
}
```

A 3-node ring would have referrers[A]=B, referrers[B]=C, referrers[C]=A. When A deposits, B gets a bonus. When B deposits, C gets a bonus. When C deposits, A gets a bonus. All three calls to setReferrer pass because the single-hop referrers[referrer] == user check only catches the direct reverse edge.

---

## Chain Summary

| ID | Title | Severity | Postcondition Created | Precondition Satisfied |
|----|-------|----------|-----------------------|------------------------|
| RS3-1 | TRANSFER_ERC20 batch drain bypasses cumulative cap | Medium | Vault drained to ~0 via TRANSFER_ERC20 batch | Requires valid proof + TRANSFER_ERC20 actions |
| RS3-2 | Multi-hop referral cycles | Low | Ring of mutual referral bonuses | 3+ coordinated accounts, onlyAuthorizedRecorder |

---

## Summary

2 new confirmed findings above Info severity identified in iteration 2 re-scan.

- [RS3-1] is a Medium: the H-03/C-04 fix that protects CALL actions against compound drain was not applied to TRANSFER_ERC20 actions, leaving the per-action compound drain vector open for the ERC20 transfer path.
- [RS3-2] is a Low: the single-hop cycle check in setReferrer does not prevent 3+ node referral rings, allowing mutual bonus accrual rings.

