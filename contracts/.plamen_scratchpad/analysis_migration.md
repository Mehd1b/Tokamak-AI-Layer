# Migration Analysis Findings

**Agent**: Migration Analysis (MG)
**Scope**: AgentRegistry.sol, VaultFactory.sol, KernelExecutionVerifier.sol, KernelVault.sol, OptimisticKernelVault.sol, VaultCreationCodeStore.sol
**Date**: 2026-04-13

---

## Step Execution Checklist

- [x] Step 1: All token transitions identified — N/A (no token type migrations; the protocol handles a generic `asset` ERC20 or ETH per vault, not a specific migrated token)
- [x] Step 2: Interface compatibility checked — Applied to UUPS upgrade interface compatibility across proxy contracts
- [x] Step 3: Token flow traced through all paths — N/A (no token type change during upgrade)
- [x] Step 3b: External side effect token compatibility checked — N/A (no token migration changes side effects)
- [x] Step 3c: Pre-upgrade balance inventory completed — Applied to UUPS proxy contracts (they hold no direct user funds; vaults are non-upgradeable)
- [x] Step 4: Stranded asset scenarios enumerated (4a-4e) — Applied to vault migration path (agent deprecation → successor → new vault)
- [x] Step 4f: User-blocks-admin scenarios checked — Applied to AgentRegistry.unregister and code store swaps
- [x] Step 5: External contracts verified against production — Checked RISC Zero verifier rotation flow
- [x] Step 6: Downstream integration compatibility assessed — Applied to factory code store swap impact on new vault deployments

---

## Finding [MG-1]: KernelExecutionVerifier Storage Gap Accounting Mismatch — Comment Says 45→41 But pausedSince Not Counted

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5 | ✗6(no downstream consumer migration)
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R14:✗(no settable constraints)]
**Severity**: Informational
**Location**: KernelExecutionVerifier.sol:L177-L183

**Description**: The inline comment on line 177 states "Reduced from 45 → 41 slots" to accommodate new state variables. The comment enumerates exactly 4 new variables: pendingImplementation (1), pendingImplementationActivatesAt (1), verificationPaused (1), pendingOwner (1). However, `pausedSince` (line 159, added by the M-11 fix) is a FIFTH new state variable that is NOT listed in the comment's enumeration.

The gap was supposed to be 45 (baseline after C-03 verifier rotation slots) minus all new variables. With 5 new variables (not 4), the correct gap should be 45 - 5 = 40, not 41.

**Impact**: The `__gap` is 1 slot too large (41 instead of the correct 40). This means the total storage footprint of KernelExecutionVerifier is 1 slot wider than the original pre-C-03 baseline. No collision occurs today — the gap is too large, not too small — but this introduces an accounting error that could propagate into a real storage collision in a future upgrade if a developer trusts the gap comment and naively adds 41 slots worth of variables before the gap.

**Evidence**:
```solidity
// KernelExecutionVerifier.sol:L155-L183
    /// @notice [M-11 FIX] Timestamp when verification was paused.
    uint256 public pausedSince;         // <-- 5th new variable, not in comment

    /// @notice Storage gap for future upgrades. Reduced from 45 → 41 slots
    ///         to accommodate the new state above:
    ///           - pendingImplementation (1)
    ///           - pendingImplementationActivatesAt (1)
    ///           - verificationPaused (1)
    ///           - pendingOwner (1)       // <-- comment lists 4 items, omits pausedSince
    uint256[41] private __gap;            // <-- should be [40]
```

**Recommendation**: Update the gap to `uint256[40]` and add `pausedSince (1)` to the comment enumeration.

---

## Finding [MG-2]: UUPS Upgrade of KernelExecutionVerifier Leaves Active Verifier Off the Rotation Allowlist

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4 | ✗5(no external token) | ✗6(N/A)
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✓, R8:✓, R10:✓, R14:✗(no settable constraints)]
**Severity**: Low
**Location**: KernelExecutionVerifier.sol:L300-L311

**Description**: The `initialize()` function seeds the `approvedVerifiers` mapping with the initial verifier address (line 308: `approvedVerifiers[_verifier] = true`). However, `initialize()` uses the `initializer` modifier and can only run once per proxy lifetime.

When the KernelExecutionVerifier proxy is upgraded to a new implementation via UUPS `upgradeTo()`, the `initialize()` function does NOT re-execute. There is no `reinitializer(2)` function. This means the `approvedVerifiers` mapping on the upgraded proxy remains in whatever state it was before the upgrade.

For the FIRST upgrade of a proxy that was deployed before the C-03 fix (i.e., the allowlist was never seeded), the `approvedVerifiers` mapping will be entirely empty. The currently active `verifier` address will NOT be on the allowlist. Consequences:

1. `proposeVerifier(address(currentVerifier))` will revert with `VerifierNotApproved` — cannot re-propose the active verifier
2. `activateVerifier()` re-checks the allowlist — even if somehow proposed, activation would revert
3. The owner must manually call `approveVerifier(address(verifier))` after the upgrade before the rotation mechanism functions correctly

Current proof verification (`verifyAndParseWithImageId` and `verify`) is NOT affected — these functions read `verifier` storage directly and do not consult the allowlist.

**Impact**: Post-upgrade verifier rotation mechanism is broken until the owner manually approves the active verifier. No impact on current operations (proof verification continues working). The severity is Low because the mitigation (manual `approveVerifier` call) is straightforward but could be missed by an operator unfamiliar with the C-03 implementation details.

**Evidence**:
```solidity
// KernelExecutionVerifier.sol:L300-L311 — initialize() seeds allowlist ONCE
function initialize(address _verifier, address initialOwner) external initializer {
    // ...
    approvedVerifiers[_verifier] = true;  // Only runs on initial deploy, NOT on upgrade
    // ...
}
// No reinitializer(2) function exists to re-seed after upgrade
```

### Postcondition Analysis
**Postconditions Created**: After upgrade, verifier rotation to the currently-active verifier is blocked until manual approval
**Postcondition Types**: [STATE]
**Who Benefits**: Not exploitable — operational issue only

---

## Finding [MG-3]: Vault Migration Path Requires Full User Re-Deposit With No Assisted Migration

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,3c,4a,4b,4c,4d,4e | ✗3b(no token type change) | ✗5(no external migration contract)
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✓, R8:✗(no cached state), R10:✓, R13:✓]
**Severity**: Informational
**Location**: KernelVault.sol:constructor, VaultFactory.sol:L391-L435

**Description**: KernelVault and OptimisticKernelVault are non-upgradeable contracts with immutable `trustedImageId`. When an agent upgrade requires a new imageId, the migration path is: deploy new vault → depositors individually withdraw from old vault → re-deposit into new vault. There is no atomic migration helper.

**Step 4d — Worst-Case Scenarios**:

Scenario 1 (V1 deposit, V2 deployed): User calls V1.withdraw() — SUCCESS. Old vault is independent.
Scenario 2 (Strategy active): User waits for settle/emergencySettle (up to 7 days) → withdraw → re-deposit to V2.
Scenario 3 (Vault paused): User waits for emergencyWithdraw (14 days) → withdraws → re-deposits.

No stranded assets in any scenario. All paths lead to eventual fund recovery.

**Impact**: This is by design (INV-3). The user-facing consequence is: vault migration requires 2 transactions (withdraw + deposit) with potential temporary yield loss during the transition. A peripheral migration helper contract could reduce this to 1 transaction without modifying core contracts. R13 assessment: "by design" describes the mechanism; the impact (2-tx overhead, yield gap) is bounded and acceptable for the trust model.

---

## Finding [MG-4]: VaultFactory Code Store Swap Can Cause Address Prediction Mismatch

**Verdict**: PARTIAL
**Step Execution**: ✓1,2,3,4f | ✗4(no asset stranding) | ✗5(N/A)
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✓, R8:✓, R10:✓, R12:✗(no dangerous precondition)]
**Severity**: Low
**Location**: VaultFactory.sol:L274-L309, L361-L388, L391-L435

**Description**: The `computeVaultAddress()` view function and the `deployVault()` function both read `_vaultCreationCodeStore.code` to construct the creation bytecode. If the code store is swapped (via the 48h timelocked mechanism) between a `computeVaultAddress()` call and the corresponding `deployVault()` call, the vault will deploy at a different address than predicted.

The `expectedImageId` parameter in `deployVault()` guards against registry imageId changes, but there is no equivalent guard for code store changes.

**Impact**: The vault deploys at an unexpected address. If the author pre-announced the predicted address (e.g., in frontends, off-chain monitoring, or other contract configurations), those references point to a non-existent contract. No funds are at risk — the vault just has a different address than expected. The 48h timelock on code store swaps provides an observable window that significantly mitigates the likelihood.

### Precondition Analysis
**Missing Precondition**: Code store must remain unchanged between computeVaultAddress() and deployVault()
**Precondition Type**: TIMING
**Why This Blocks**: The 48h timelock makes the window observable, but there is no on-chain enforcement that the code store version matches between the two calls.

**Evidence**:
```solidity
// VaultFactory.sol — both functions read the CURRENT code store
function _getCreationBytecode(...) internal view returns (bytes memory) {
    return abi.encodePacked(
        _vaultCreationCodeStore.code,  // reads whatever store is active NOW
        abi.encode(...)
    );
}
// deployVault checks expectedImageId but NOT expectedCodeStore
```

---

## Finding [MG-5]: Agent Deprecation Successor Chain Has No Vault-Level Resolution

**Verdict**: PARTIAL
**Step Execution**: ✓1,2,3,4a,4b,6 | ✗4c(no assets in registry) | ✗5(N/A)
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R13:✓]
**Severity**: Informational
**Location**: AgentRegistry.sol:L357-L408

**Description**: The `deprecate()` + `setSuccessor()` mechanism links deprecated agentIds to successor agentIds, but not to specific vault addresses. Off-chain consumers following the successor chain must separately query `VaultFactory.getAgentVaults(successorAgentId)` and disambiguate among potentially multiple vaults (different assets, salts).

Vault-address-based integrations (e.g., a protocol that hardcoded a vault address) have no on-chain vault→vault successor link.

**Impact**: Informational UX concern. No fund-loss risk. Downstream integrations must implement the agentId→vault resolution logic themselves.

---

## Finding [MG-6]: Dust Deposits Block Agent Unregistration

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4f | ✗4(no asset stranding) | ✗5,6(N/A)
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R13:✓]
**Severity**: Informational
**Location**: AgentRegistry.sol:L290-L329

**Description**: The `unregister()` function reverts if ANY vault for the agent has `totalAssets > 0`. A single depositor holding even 1 wei blocks unregistration permanently until withdrawal.

**Step 4f analysis**: A malicious user could deposit dust (1 wei of an ERC20, or minimal ETH) into a vault to grief the agent author's unregistration. The author cannot force-withdraw on behalf of users.

**Impact**: The blocking is temporary (users can always eventually withdraw, and the author can use `deprecate()` as an alternative). The dust-deposit griefing is a minor operational nuisance. The `MAX_VAULTS_PER_UNREGISTER = 50` cap also blocks unregistration if too many vaults exist, requiring some vaults to be emptied first. R13 assessment: this is by-design behavior protecting depositors, and the author has `deprecate()` + `setSuccessor()` as a functional alternative.

**Evidence**:
```solidity
// AgentRegistry.sol:L300-L304
for (uint256 i = 0; i < vaults.length; i++) {
    uint256 assets = IKernelVaultView(vaults[i]).totalAssets();
    if (assets > 0) revert VaultHasDeposits(vaults[i], assets);
}
```

---

## Chain Summary

| Finding | Severity | Postcondition Created | Precondition Needed | Enables |
|---------|----------|----------------------|--------------------|---------| 
| MG-1 | Info | Incorrect storage gap accounting in KernelExecutionVerifier | — | Future upgrade storage collision if gap is relied upon |
| MG-2 | Low | Post-upgrade verifier rotation blocked for active verifier | Manual approveVerifier() call | — |
| MG-3 | Info | Users must manually migrate between vaults | User action (withdraw + re-deposit) | — |
| MG-4 | Low | Vault deploys at unexpected address after code store swap | Code store swap between compute and deploy | — |
| MG-5 | Info | No vault-level successor link for deprecation | Off-chain resolution logic | — |
| MG-6 | Info | Dust deposit blocks agent unregistration | Any depositor in any vault | — |
