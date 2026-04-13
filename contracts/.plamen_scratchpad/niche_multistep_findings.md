# Multi-Step Operation Safety — Niche Agent Findings

**Agent**: Multi-Step Operation Safety Niche Agent
**Prefix**: [NMS-N]
**Date**: 2026-04-13

---

## CHECK 1: Authorization Sequence Conflicts

### Enumeration of Multi-Step Operations

1. `_executeActions` batch loop — up to N actions, each `_executeAction` dispatches to `_executeTransferERC20` or `_executeCall`
2. `MetaVault.rebalance` — Phase 1 (withdrawals), Phase 2 (deposits with approve+depositERC20Tokens)
3. `WSTONBondManager.lockBondBatch` — batch bond locking with deferred single-transfer
4. Cross-chain optimistic lifecycle — lockBondDirect (L1) → oracle attestation → executeOptimistic (HyperEVM) → submitProof/slashExpired
5. `VaultFactory.scheduleVaultCreationCodeStore` → `activateVaultCreationCodeStore` (48h delay)

### Authorization Conflict Analysis

| Sequence | Step | Call | Authorized Party | Asset/Account | Amount | Method |
|----------|------|------|-----------------|---------------|--------|--------|
| _executeActions batch | 1..N | TRANSFER_ERC20 action | vault.asset → recipient | vault asset | per-action ≤40% current | safeTransfer |
| MetaVault.rebalance Phase 2 | i | forceApprove(vault, toDeposit) | vault (KernelVault) | baseAsset | toDeposit | approve (OVERWRITE) |
| MetaVault.rebalance Phase 2 | i | depositERC20Tokens(assets) | vault consumes | baseAsset | assets | safeTransferFrom |
| lockBondBatch | 1..N | bond.status = Locked (state) | — | WSTON | amounts[i] | state-update |
| lockBondBatch | N+1 | safeTransferFrom(msg.sender, this, total) | WSTONBondManager | WSTON | totalAmount | ERC20 pull |

### Step 3: Conflict Detection

**OVERWRITE pattern in MetaVault.rebalance Phase 2**: Each iteration of the Phase 2 loop calls `forceApprove(vault, toDeposit)`. If vault[i] deposit fails and vault[i+1] also requires an approval to the same vault address, the second `forceApprove` overwrites the first. In this protocol, each iteration uses a DIFFERENT vault address, so overwrite collisions do not apply across iterations. No conflict found here.

**COMPOUND DRAIN in _executeActions — CONFIRMED (see NMS-1)**: The cap on `_executeTransferERC20` uses `balanceBefore` (current balance at time of each action), not `_executionInitialBalance`. Unlike `_executeCall`, which was explicitly fixed to use the initial balance cap, `TRANSFER_ERC20` actions compound: each action sees a smaller denominator, so N sequential TRANSFER_ERC20 actions can drain `1 - (1 - 0.4)^N` of the vault — identical to the compound drain pattern that the C-04/H-03 fix addressed for CALL actions.

---

## CHECK 2: Infrastructure Address Targeting

### Enumeration of Target Functions

| Function | Contract | Address Param | State Written | State Type |
|----------|----------|--------------|---------------|------------|
| `markSlashPending(operator, vault, nonce)` | WSTONBondManager | operator | `slashPending[operator][vault][nonce] = true` | Flag set |
| `lockBondDirect(vault, nonce, amount)` | WSTONBondManager | vault | `bonds[msg.sender][vault][nonce]` | Mapping entry |
| `lockBond(operator, vault, nonce, amount)` | WSTONBondManager | operator, vault | `bonds[operator][vault][nonce]`, `totalBonded[operator]` | Mapping + counter |
| `releaseBond(operator, vault, nonce)` | WSTONBondManager | operator, vault | `bond.status`, `totalBonded[operator]` | Status + counter |
| `slashBond(operator, vault, nonce, slasher)` | WSTONBondManager | operator, vault | `bond.status`, `totalBonded`, slash distributions | Status + ERC20 |
| `forceApprove(vault, assets)` (inside _depositToVault) | MetaVault | vault | ERC20 allowance | ERC20 approval |

### Infrastructure Address Enumeration

| Infrastructure | Role | Critical Operations | State Dependencies |
|---------------|------|--------------------|--------------------|
| WSTONBondManager | Bond escrow on L1 | lockBond, releaseBond, slashBond | `bonds`, `totalBonded`, `totalLockedGlobal`, `slashPending` |
| OptimisticKernelVault | HyperEVM execution vault | executeOptimistic, submitProof, slashExpired | `pendingExecutions`, `_pendingCount` |
| KernelVault (underlying) | Asset custody | depositERC20Tokens, withdraw, execute | `shares`, `totalShares`, `strategyActive` |
| MetaVault | Vault-of-vaults | rebalance, deposit, withdraw | `trackedIdle`, `targetWeights` |
| VaultFactory | Deployment factory | deployVault, computeVaultAddress | `_vaultCreationCodeStore`, `isDeployedVault` |

### Cross-Reference: markSlashPending + operator targeting — CONFIRMED (see NMS-2)

`markSlashPending(operator, vault, nonce)` is callable by EITHER `trustedRelayer` OR `owner`. This function sets `slashPending[operator][vault][nonce] = true` and blocks `reclaimExpiredBond`. The flag can ONLY be cleared inside `slashBondByRelayer` (which requires `onlyRelayer`). If the owner calls `markSlashPending` for a legitimately locked bond (no actual slash event on HyperEVM), and the relayer is subsequently offline, the operator's bond is permanently frozen: it cannot be reclaimed (blocked by `slashPending`), and it cannot be slashed (no relayer). There is no function to unset `slashPending` via the owner or operator.

---

## Findings

---

## Finding [NMS-1]: TRANSFER_ERC20 batch actions use per-action balance cap, enabling compound drain identical to the pre-C-04 vulnerability

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4 | ✗5(N/A — ZK proof gate is upstream trust model) | ✗7(N/A — access restricted to owner via execute())
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity — vault), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗(no external tokens), R12:✗(no dangerous precondition enabled), R13:✗(not design), R14:✗(no settable constraints), R15:✗(no flash loan state), R16:✗(no oracle)]
**Depth Evidence**: [BOUNDARY:N=3 actions, initial=1000 → drain=784 (78.4%)], [VARIATION:N=10 actions → drain=99.4%, vs CALL cumulative cap at 40%], [TRACE:_executeTransferERC20 uses balanceBefore (current) not _executionInitialBalance → no cumulative check → compound]
**Severity**: Medium
**Location**: KernelVault.sol:L1280-1324 (`_executeTransferERC20`), KernelVault.sol:L1049 (`_executionInitialBalance` set in `_executeActions`)

**Description**:
`_executeCall` was fixed (C-04/H-03) to compute its post-call asset delta cap against `_executionInitialBalance` — the vault balance captured once at the start of `_executeActions`. This correctly limits CUMULATIVE drain across all CALL actions in a single batch to 40% of the initial balance.

`_executeTransferERC20` was NOT given the same treatment. Its per-action cap is computed against `balanceBefore` — the CURRENT vault balance at the time of each individual transfer:

```solidity
// KernelVault.sol:L1280-1291
uint256 balanceBefore = totalAssets();
if (balanceBefore > 0) {
    uint256 maxAmount = (balanceBefore * MAX_CALL_VALUE_BPS) / BPS_DENOMINATOR;
    if (amount > maxAmount) {
        revert CallValueExceedsLimit(amount, maxAmount);
    }
}
```

There is NO cumulative delta check against `_executionInitialBalance` after the transfer executes (compare to `_executeCall` L1416-1424 which checks `_executionInitialBalance - balanceAfter`).

The result is the same compound drain formula that existed before C-04/H-03: with N sequential `TRANSFER_ERC20` actions each transferring 40% of the current balance, the total drain is `1 - (1 - 0.4)^N`:

- N=3 actions: drain = 78.4% (vs 40% cap intended)
- N=5 actions: drain = 92.2%
- N=10 actions: drain = 99.4%

The code comment at L1284-1288 explicitly acknowledges this choice ("the ratio is well-defined even when the first action in a batch drains the vault close to 0") but does NOT add a cumulative guard.

**Impact**:
An agent batch with N `TRANSFER_ERC20` actions — each individually below the 40% per-action cap — can drain up to 99.4% of the vault balance in a single `execute()` call. This defeats the design intent expressed in the C-04/H-03 fix comment ("cumulative drain across ALL actions is hard-capped at 40%") and eliminates the monitoring window between calls that the designers explicitly described as the security benefit of the per-execution cap.

The primary gate remains the ZK proof + pinned `trustedImageId` — only an agent whose code hash matches the registered image can produce actions. However, the 40% cumulative cap is described as defense-in-depth for "catastrophic single-block drain scenarios" (KernelVault.sol L1353-1358). The TRANSFER_ERC20 path undermines this defense.

**Evidence**:
```solidity
// _executeCall (correctly uses _executionInitialBalance):
// KernelVault.sol:L1416-1424
uint256 cumulativeDrain = _executionInitialBalance > balanceAfter
    ? _executionInitialBalance - balanceAfter : 0;
uint256 maxDelta = (_executionInitialBalance * MAX_CALL_ASSET_DELTA_BPS) / BPS_DENOMINATOR;
if (cumulativeDrain > maxDelta) {
    revert CallAssetDeltaExceedsLimit(cumulativeDrain, maxDelta);
}

// _executeTransferERC20 (uses current balanceBefore — NO cumulative check):
// KernelVault.sol:L1280-1298
uint256 balanceBefore = totalAssets();
if (balanceBefore > 0) {
    uint256 maxAmount = (balanceBefore * MAX_CALL_VALUE_BPS) / BPS_DENOMINATOR;
    if (amount > maxAmount) {
        revert CallValueExceedsLimit(amount, maxAmount);
    }
}
// ... transfer executes ... NO _executionInitialBalance check follows
```

**Recommendation**:
Apply the same cumulative drain check to `_executeTransferERC20` that already exists in `_executeCall`:

```diff
// After the transfer executes in _executeTransferERC20:
  uint256 balanceAfter = totalAssets();
+ if (balanceAfter < _executionInitialBalance) {
+     uint256 cumulativeDrain = _executionInitialBalance - balanceAfter;
+     uint256 maxDelta = (_executionInitialBalance * MAX_CALL_VALUE_BPS) / BPS_DENOMINATOR;
+     if (cumulativeDrain > maxDelta) {
+         revert CallAssetDeltaExceedsLimit(cumulativeDrain, maxDelta);
+     }
+ }
  if (!strategyActive && balanceAfter < balanceBefore) { ...
```

---

## Finding [NMS-2]: `markSlashPending` owner-bypass enables permanent bond freeze with no recovery path

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4 | ✗5(N/A — no external trigger needed) | ✗6(N/A — owner calling their own function)
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single operator), R6:✓, R8:✓ — multi-step: markSlashPending(owner) followed by relayer going offline creates permanent lock, R10:✓, R11:✗(no external tokens), R12:✓ — dangerous precondition = slashPending=true + no relayer, R13:✓ — owner calling "as backup" is framed as by-design, R14:✗, R15:✗, R16:✗]
**Depth Evidence**: [TRACE:owner calls markSlashPending(op, vault, nonce) → slashPending=true → reclaimExpiredBond reverts UnresolvedSlashPending → only slashBondByRelayer clears flag → requires onlyRelayer → if relayer offline/unset: flag never cleared → bond permanently frozen], [BOUNDARY:BOND_EXPIRY=90d has no effect when slashPending=true]
**Severity**: Low
**Location**: WSTONBondManager.sol:L376-384 (`markSlashPending`), WSTONBondManager.sol:L397-437 (`slashBondByRelayer`), WSTONBondManager.sol:L487-515 (`reclaimExpiredBond`)

**Description**:
`markSlashPending` is callable by EITHER the `trustedRelayer` OR the contract `owner`:

```solidity
// WSTONBondManager.sol:L376-383
function markSlashPending(address operator, address vault, uint64 nonce) external {
    require(msg.sender == trustedRelayer || msg.sender == owner, "not relayer or owner");
    BondInfo storage bond = bonds[operator][vault][nonce];
    if (bond.status != BondStatus.Locked) {
        revert InvalidBondStatus(operator, vault, nonce, bond.status);
    }
    slashPending[operator][vault][nonce] = true;
    emit SlashPendingMarked(operator, vault, nonce);
}
```

Setting `slashPending = true` blocks `reclaimExpiredBond`:

```solidity
// WSTONBondManager.sol:L497-499
if (slashPending[msg.sender][vault][nonce]) {
    revert UnresolvedSlashPending();
}
```

The ONLY place `slashPending` is cleared is inside `slashBondByRelayer`:

```solidity
// WSTONBondManager.sol:L403
slashPending[operator][vault][nonce] = false;
```

`slashBondByRelayer` requires `onlyRelayer`. There is no owner function, operator function, or emergency function to unset `slashPending`.

**Multi-step authorization conflict**: The H-02 fix established a two-step cross-chain sequence:
1. Relayer observes `ExecutionSlashed` on HyperEVM → calls `markSlashPending` on L1
2. Relayer calls `slashBondByRelayer` on L1 to finalize the slash

The owner bypass in step 1 creates an asymmetric state: the owner can set `slashPending = true` without any corresponding `ExecutionSlashed` event on HyperEVM. But clearing the flag requires the relayer to call step 2. If:
- Owner sets `slashPending = true` for any legitimately locked bond (no slash event occurred), AND
- The relayer is offline, unset, or rotated to a non-cooperating address

Then the bond is permanently frozen. Neither the operator (via `reclaimExpiredBond`) nor the owner (no unset function) can recover the locked WSTON.

**Precondition Analysis**:
**Missing Precondition for exploitation**: Owner must act maliciously or erroneously, AND the relayer must be unable to finalize the slash.
**Precondition Type**: ACCESS + EXTERNAL
**Why This Blocks**: Both conditions (owner action + relayer failure) must occur simultaneously. Either condition alone is recoverable.

**Postcondition Analysis**:
**Postconditions Created**: Operator's WSTON permanently frozen in WSTONBondManager with `bond.status = Locked` and `slashPending = true`.
**Postcondition Types**: STATE, ACCESS
**Who Benefits**: No one — this is a mutual-destruction scenario. The operator loses capital; the protocol loses operator participation. (Malicious owner could use this to threaten operators.)

**Impact**:
An operator's WSTON bond (minimum `minBondFloor`, typically 1e27 wei = 1 WSTON per deployment) can be permanently frozen with no recovery path. The 90-day BOND_EXPIRY safety valve is rendered inoperative. The operator cannot participate in optimistic execution until the bond is resolved.

**Recommendation**:
Add an owner function to UNSET `slashPending` when the corresponding `slashBondByRelayer` fails to materialize within a reasonable timeout. This should require the bond to have passed `BOND_EXPIRY` to prevent premature cancellation:

```solidity
function cancelSlashPending(address operator, address vault, uint64 nonce) external onlyOwner {
    BondInfo storage bond = bonds[operator][vault][nonce];
    require(bond.status == BondStatus.Locked, "bond not locked");
    require(slashPending[operator][vault][nonce], "no pending slash");
    // Only allow cancellation if bond has also passed BOND_EXPIRY — prevents
    // the owner from cancelling a legitimate in-flight cross-chain slash.
    require(block.timestamp >= bond.lockedAt + BOND_EXPIRY, "bond not expired");
    slashPending[operator][vault][nonce] = false;
}
```

Alternatively, restrict `markSlashPending` to `onlyRelayer` (removing the owner bypass) since the owner already has `slashBondByRelayer` indirectly via `setTrustedRelayer` rotation.

---

## Finding [NMS-3]: No cancellation function for scheduled VaultCreationCodeStore swap, asymmetric with UUPS upgrade timelock

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3 | ✗4(N/A — no user loss, informational) | ✗5,6(N/A)
**Rules Applied**: [R4:✗, R5:✗, R6:✗, R8:✗, R10:✗, R11:✗, R12:✗, R13:✓ — "by design but asymmetric", R14:✗, R15:✗, R16:✗]
**Depth Evidence**: [TRACE:scheduleVaultCreationCodeStore(newStore) → pendingVaultCodeStore set → no cancel function → only override by calling schedule again with different address → no abort path equivalent to cancelImplementation()]
**Severity**: Informational
**Location**: VaultFactory.sol:L274-289 (`scheduleVaultCreationCodeStore` / `activateVaultCreationCodeStore`), VaultFactory.sol:L227-232 (`cancelImplementation`)

**Description**:
The VaultFactory has a `cancelImplementation()` function that allows the owner to abort a scheduled UUPS upgrade before the 48-hour timelock elapses:

```solidity
// VaultFactory.sol:L226-232
function cancelImplementation() external onlyOwner {
    if (pendingImplementation == address(0)) revert NoPendingImplementation();
    emit ImplementationCancelled(pendingImplementation);
    pendingImplementation = address(0);
    pendingImplementationActivatesAt = 0;
}
```

However, no equivalent cancellation exists for the vault creation code store swap:

```solidity
// VaultFactory.sol:L274-289
function scheduleVaultCreationCodeStore(address newStore) external onlyOwner { ... }
function activateVaultCreationCodeStore() external onlyOwner { ... }
// No: cancelVaultCreationCodeStore() function
```

The only way to "cancel" a scheduled code store swap is to call `scheduleVaultCreationCodeStore` again with a different address (overwriting `pendingVaultCodeStore`). There is no explicit abort mechanism, no emitted cancellation event, and no documentation of this asymmetry.

This matters because the vault creation code store swap affects the bytecode used for all future vault deployments. An accidental or compromised scheduling of a malicious code store address should be cancellable in the same way as a UUPS upgrade. The lack of cancellation means monitoring tooling cannot rely on the same event signature (there is no `VaultCodeStoreCancelled` event).

**Impact**: Low operational risk — can be worked around by scheduling a new legitimate address — but creates an observable asymmetry with `cancelImplementation` and may cause confusion for operators watching for cancellation events.

**Recommendation**:
Add cancellation functions for both code store types, matching the pattern of `cancelImplementation`:

```solidity
function cancelVaultCreationCodeStore() external onlyOwner {
    require(pendingVaultCodeStore != address(0), "no pending code store");
    emit VaultCodeStoreCancelled(pendingVaultCodeStore);
    pendingVaultCodeStore = address(0);
    pendingVaultCodeStoreActivatesAt = 0;
}

function cancelOptimisticVaultCreationCodeStore() external onlyOwner {
    require(pendingOptimisticVaultCodeStore != address(0), "no pending optimistic code store");
    emit OptimisticVaultCodeStoreCancelled(pendingOptimisticVaultCodeStore);
    pendingOptimisticVaultCodeStore = address(0);
    pendingOptimisticVaultCodeStoreActivatesAt = 0;
}
```

---

## Coverage Assertion

### CHECK 1 Coverage: Multi-Step Operations
| # | Target | CHECK | Result |
|---|--------|-------|--------|
| 1 | `_executeActions` batch (TRANSFER_ERC20) | Auth conflict | **FOUND [NMS-1]** |
| 2 | `_executeActions` batch (CALL) | Auth conflict | DONE — cumulative cap correctly applied via `_executionInitialBalance` |
| 3 | `MetaVault.rebalance` Phase 2 forceApprove loop | Auth conflict | DONE — OVERWRITE N/A (different vaults per iteration); try/catch reverts approval atomically |
| 4 | `WSTONBondManager.lockBondBatch` state+transfer | Auth conflict | DONE — nonReentrant + atomic revert if transfer fails; no conflict |
| 5 | Cross-chain bond lifecycle | Auth conflict | DONE — standard approve+transfer; risks already in INV-34 |

### CHECK 2 Coverage: Infrastructure Address Targeting
| # | Function | Infra Target | Result |
|---|----------|-------------|--------|
| 1 | `markSlashPending(operator, vault, nonce)` | Any operator | **FOUND [NMS-2]** — owner bypass enables permanent freeze |
| 2 | `lockBondDirect(vault, nonce, amount)` | Any vault address | DONE — vault is key only, not called; no DoS |
| 3 | `forceApprove(vault, assets)` in MetaVault | KernelVault | DONE — approval + consumption in same external frame (atomic on revert) |
| 4 | Schedule/activate code store (VaultFactory) | Future vault deployments | **FOUND [NMS-3]** — no cancel function (informational) |

Enumerated: 9 entities | Processed: 9 | COVERAGE: COMPLETE

---

## Chain Summary

| Finding ID | Location | Root Cause (1-line) | Verdict | Severity | Precondition Type | Postcondition Type |
|------------|----------|---------------------|---------|----------|-------------------|-------------------|
| NMS-1 | KernelVault.sol:L1280-1324 | `_executeTransferERC20` uses per-action current balance cap instead of `_executionInitialBalance`, enabling compound drain via batch | CONFIRMED | Medium | NONE (agent controls action contents, only trust gate is ZK proof) | BALANCE — vault drained >40% in single execute() |
| NMS-2 | WSTONBondManager.sol:L376-384 | Owner can set `slashPending=true` without relayer, but only relayer can clear it — permanent freeze if relayer offline | CONFIRMED | Low | ACCESS (owner must act) + EXTERNAL (relayer must be offline) | STATE — bond permanently frozen |
| NMS-3 | VaultFactory.sol:L274-289 | Missing cancel function for scheduled VaultCreationCodeStore swap (asymmetric with cancelImplementation) | CONFIRMED | Informational | NONE | STATE — misleading pending state without explicit abort |
