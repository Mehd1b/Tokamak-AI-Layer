# Semi-Trusted Roles Analysis

**Agent**: Analysis Agent #3 — SEMI-TRUSTED ROLES
**Scope**: All privileged/owner functions across KernelVault, OptimisticKernelVault, WSTONBondManager, MetaVault, VaultFactory, KernelExecutionVerifier, VaultAccessControl, AgentRegistry, periphery contracts.

---

## Step Execution Checklist

| Step | Required | Completed? | Notes |
|------|----------|------------|-------|
| 1. Inventory Role Permissions | YES | YES | All owner/admin functions catalogued across all contracts |
| 2. Analyze Within-Scope Abuse | YES | YES | Timing, parameter, sequence, omission abuse assessed per role |
| 3. Model Attack Scenarios (A,B,C) | YES | YES | Key compromise, parameter abuse, timing attack modelled |
| 4. Assess Mitigations | YES | YES | Timelocks, cooldowns, caps, two-step ownership evaluated |
| 5. Model User-Side Exploitation (D,E,F) | YES | YES | Predictability, griefing, precondition manipulation assessed |
| 6. Precondition Griefability Check | YES | YES | All role preconditions checked for user manipulability |
| 6b. Admin Function Griefability | YES | YES | All admin functions checked for user-state dependency |

---

## Role Inventory Summary

| Role | Contract(s) | Trust Level | Key Capabilities |
|------|-------------|-------------|-----------------|
| Vault Owner | KernelVault, OptimisticKernelVault | FULLY_TRUSTED (vault ops) | execute, fees, pause, oracle/bond config, settle, adapter config |
| WSTONBondManager Owner | WSTONBondManager | FULLY_TRUSTED | treasury, relayer, vault auth, bond floor, rescue tokens |
| MetaVault Owner | MetaVault | FULLY_TRUSTED | rebalance, add/remove vaults, sweep donations |
| Factory Owner | VaultFactory | FULLY_TRUSTED (factory ops) | code stores (timelocked), treasury, fee split, external vault reg |
| Verifier Owner | KernelExecutionVerifier | FULLY_TRUSTED (verifier ops) | verifier rotation (timelocked), pause, implementation upgrade |
| Trusted Relayer | WSTONBondManager | FULLY_TRUSTED (bond ops) | release/slash bonds, mark slash pending |
| VaultAccessControl Owner | VaultAccessControl | FULLY_TRUSTED | whitelist, caps, KYC config |
| Oracle Signer (Role A) | KernelVault | SEMI_TRUSTED | Price attestation only; bounded by maxOracleAge |
| Bond Signer (Role B) | OptimisticKernelVault | FULLY_TRUSTED | Bond attestation for optimistic execution |

---

## Findings

---

## Finding [SR-1]: WSTONBondManager Uses Single-Step Ownership Transfer

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5,6,6b
**Rules Applied**: [R6:✓, R8:✗(single-step setter), R10:✓, R14:✗(no aggregate variables)]
**Severity**: Medium
**Location**: WSTONBondManager.sol:707-711

**Description**:
WSTONBondManager.transferOwnership() uses a single-step, immediate ownership transfer pattern. A typo in the newOwner parameter or sending to an address the caller does not control permanently and irrevocably loses ownership of the WSTONBondManager contract. This contrasts with all other core infrastructure contracts (VaultFactory, KernelExecutionVerifier, AgentRegistry) which use a two-step propose-then-accept pattern.

```solidity
// WSTONBondManager.sol L707-711
function transferOwnership(address newOwner) external onlyOwner {
    if (newOwner == address(0)) revert ZeroOwner();
    emit OwnershipTransferred(owner, newOwner);
    owner = newOwner;
}
```

The WSTONBondManager owner controls critical bond infrastructure: treasury address, minimum bond floor, vault authorization/revocation, trusted relayer configuration, and token rescue. Loss of ownership would leave the bond system unmanageable. Authorized vaults could not be revoked, the relayer could not be rotated (except via the pending mechanism if one is already queued), and the treasury could not be updated.

**Impact**:
- Permanent loss of administrative control over the cross-chain bond system
- Inability to revoke compromised or malicious vault authorizations
- Inability to update the treasury address (all future slash treasury shares go to the stale address)
- Inability to adjust minBondFloor
- No recovery path without contract migration (WSTONBondManager is not upgradeable)

**Evidence**:
- VaultFactory.sol L190-206: uses two-step transferOwnership + acceptOwnership
- KernelExecutionVerifier.sol L325-340: uses two-step transferOwnership + acceptOwnership
- AgentRegistry uses the same two-step pattern
- WSTONBondManager.sol L707: single-step, no pending owner, no acceptance step

### Postcondition Analysis
**Postconditions Created**: Immediate, irrevocable ownership transfer to the supplied address
**Postcondition Types**: ACCESS
**Who Benefits**: Attacker (if address is wrong) or no one (if address is a dead address)

---

## Finding [SR-2]: MetaVault Has No Ownership Transfer Function

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5,6,6b
**Rules Applied**: [R6:✓, R10:✓]
**Severity**: Low
**Location**: MetaVault.sol (owner set in constructor, no transferOwnership)

**Description**:
MetaVault does not implement any transferOwnership function. The owner state variable is set in the constructor and is non-immutable (it is a regular address public owner), but there is no function to change it. This means the MetaVault owner is permanent for the lifetime of the contract unless a new MetaVault is deployed.

While this prevents the accidental-transfer risk, it introduces a different concern: if the owner key is lost or compromised, there is no recovery mechanism. The MetaVault is not upgradeable (no UUPS pattern), so the owner is permanently fixed.

Given that MetaVault owner can rebalance (moving funds between underlying vaults), add/remove vaults, and sweep donations, a permanently compromised owner is a serious concern with no mitigation path beyond deploying a new MetaVault and migrating.

**Impact**:
- Owner key compromise: attacker permanently controls rebalance (bounded by 2% slippage cap), sweep donations, add/remove vaults
- Owner key loss: vault becomes unmanageable (rebalancing stops, vaults cannot be added/removed)
- No recovery without full migration

**Evidence**:
MetaVault.sol constructor (L156-164) sets owner = _owner; no transferOwnership function exists anywhere in the contract.

### Postcondition Analysis
**Postconditions Created**: Permanent owner binding
**Postcondition Types**: ACCESS
**Who Benefits**: Protocol depends entirely on owner key security with no rotation capability

---

## Finding [SR-3]: VaultAccessControl Uses Single-Step Ownership Transfer

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5,6,6b
**Rules Applied**: [R6:✓, R10:✓]
**Severity**: Low
**Location**: VaultAccessControl.sol:126-130

**Description**:
VaultAccessControl.transferOwnership() uses a single-step immediate transfer, consistent with the WSTONBondManager pattern and inconsistent with the two-step pattern used by VaultFactory, KernelExecutionVerifier, and AgentRegistry.

```solidity
// VaultAccessControl.sol L126-130
function transferOwnership(address newOwner) external onlyOwner {
    if (newOwner == address(0)) revert ZeroAddress();
    emit OwnershipTransferred(owner, newOwner);
    owner = newOwner;
}
```

**Impact**:
- If ownership is transferred to an incorrect address, control over whitelist, deposit caps, and KYC configuration is permanently lost
- Impact is scoped to a single vault's access control (not protocol-wide), limiting severity
- The vault itself continues to function; only the access control gates become unmanageable

**Evidence**:
Code at VaultAccessControl.sol L126-130 shows immediate transfer with no acceptance step.

---

## Finding [SR-4]: KernelVault setAccessControl Has No Event Emission

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5,6,6b
**Rules Applied**: [R6:✓, R10:✗(single fixed state)]
**Severity**: Low
**Location**: KernelVault.sol:629-632

**Description**:
The setAccessControl function modifies the VaultAccessControl contract address used for deposit/withdrawal cap tracking without emitting an event. This is one of only two silent setters identified in the setter list (the other being rescueTokens). The lack of event makes it invisible to off-chain monitoring, indexers, and depositors.

```solidity
// KernelVault.sol L629-632
function setAccessControl(address _accessControl) external {
    if (msg.sender != owner) revert NotOwner();
    accessControl = _accessControl;
}
```

The owner can silently swap the access control contract to one with no restrictions (or to address(0) to disable it entirely) or to a malicious contract that manipulates deposit counters. Since recordWithdrawal is called on every withdrawal (L1166-1168), pointing to a malicious contract could cause withdrawals to revert.

**Impact**:
- Silent disabling of access control allows unrestricted deposits (bypassing whitelist, caps, KYC)
- Silent swap to a malicious contract could DoS all withdrawals via reverting recordWithdrawal
- Off-chain monitoring cannot detect the change without polling the accessControl state variable

**Evidence**:
- setter_list.md explicitly flags this as MISSING_EVENT
- All other KernelVault setters emit events (OracleSignerUpdated, BondSignerUpdated, FeesUpdated, etc.)

### Postcondition Analysis
**Postconditions Created**: accessControl points to an arbitrary contract or address(0)
**Postcondition Types**: STATE
**Who Benefits**: Vault owner (can silently modify access rules); potentially attackers if owner is compromised

---

## Finding [SR-5]: KernelVault rescueTokens Has No Event Emission

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5,6,6b
**Rules Applied**: [R6:✓, R10:✗(single fixed state)]
**Severity**: Informational
**Location**: KernelVault.sol:565-569

**Description**:
The rescueTokens function transfers arbitrary ERC20 tokens from the vault when totalShares == 0, but does not emit an event. While the totalShares == 0 precondition limits the attack surface (no depositors are present), the lack of event makes the token movement invisible to off-chain monitoring.

```solidity
// KernelVault.sol L565-569
function rescueTokens(address token, address to, uint256 amount) external {
    if (msg.sender != owner) revert NotOwner();
    if (totalShares != 0) revert SharesStillOutstanding();
    IERC20(token).safeTransfer(to, amount);
}
```

**Impact**:
- Token movements are invisible to off-chain indexers and monitors
- Severity is bounded by the totalShares == 0 precondition (no depositor funds at risk)

**Evidence**:
setter_list.md flags this as MISSING_EVENT. Compare with WSTONBondManager.rescueTokens (L721-731) which emits TokensRescued.

---

## Finding [SR-6]: Vault Owner Can Set accessControl to a Reverting Contract to DoS Normal Withdrawals

**Verdict**: PARTIAL
**Step Execution**: ✓1,2,3,4,5,6,6b
**Rules Applied**: [R6:✓, R8:✓, R10:✓, R13:✗(not design-related)]
**Severity**: Medium
**Location**: KernelVault.sol:629-632, KernelVault.sol:1166-1168

**Description**:
The vault owner can set accessControl to any arbitrary address. The _processWithdraw function (L1166-1168) calls IVaultAccessControl(accessControl).recordWithdrawal(msg.sender, assetsOut) on every normal withdrawal. If the owner sets accessControl to a contract that reverts on recordWithdrawal, all normal withdrawals are permanently DoSed.

```solidity
// KernelVault.sol L1166-1168
if (accessControl != address(0)) {
    IVaultAccessControl(accessControl).recordWithdrawal(msg.sender, assetsOut);
}
```

The emergency withdrawal path (_processEmergencyWithdraw at L1574-1659) does NOT call recordWithdrawal, so it is unaffected. However, emergency withdrawal requires the vault to be paused AND 14 days to have elapsed since the first pause. This means:

1. Owner sets accessControl to a reverting contract
2. All normal withdrawals revert
3. Users must wait for the owner to pause (which the same malicious owner controls) or hope for an external governance action
4. If the vault has never been paused, users are completely stuck until the owner pauses

The key mitigation is that the vault owner is classified as FULLY_TRUSTED for vault operations, and depositors accepted this trust when depositing.

**Impact**:
- All normal withdrawals DoSed for all depositors
- Emergency withdrawal requires pause + 14-day delay (controlled by the same malicious owner)
- [ASSUMPTION-DEP: TRUSTED-ACTOR] — requires vault owner to act maliciously

**Evidence**:
- _processWithdraw at L1166-1168 calls recordWithdrawal with no try/catch
- _processEmergencyWithdraw (L1574-1659) does NOT call recordWithdrawal
- setAccessControl at L629-632 has no validation of the target address

### Precondition Analysis
**Missing Precondition**: Vault owner must act maliciously
**Precondition Type**: ACCESS
**Why This Blocks**: Only the vault owner can call setAccessControl; depositors accept the owner as FULLY_TRUSTED

### Postcondition Analysis
**Postconditions Created**: Normal withdrawals permanently DoSed; emergency path remains open but requires pause
**Postcondition Types**: STATE
**Who Benefits**: Malicious vault owner (can trap depositor funds)

---

## Finding [SR-7]: MetaVault removeVault Reverts if Underlying Vault Is Paused or Strategy-Locked

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5,6,6b
**Rules Applied**: [R6:✓, R5:✓, R10:✓]
**Severity**: Low
**Location**: MetaVault.sol:509-539

**Description**:
The removeVault function attempts to withdraw all remaining shares from the underlying vault before removing it from the list. The withdrawal call at L521 (kv.withdraw(remainingShares)) is NOT wrapped in try/catch. If the underlying KernelVault is paused, in an active strategy, or otherwise unable to process withdrawals, the entire removeVault call reverts.

```solidity
// MetaVault.sol L518-523
uint256 remainingShares = kv.shares(address(this));
if (remainingShares > 0) {
    uint256 balBefore = baseAsset.balanceOf(address(this));
    kv.withdraw(remainingShares);    // reverts if underlying is paused/strategy-locked
    uint256 recovered = baseAsset.balanceOf(address(this)) - balBefore;
    trackedIdle += recovered;
}
```

This means that if an underlying vault enters a paused or strategy-locked state, the MetaVault owner cannot remove it from the underlying vault list. The vault remains in the underlyingVaults array with its weight, affecting NAV calculations and rebalancing. The MetaVault owner must wait for the underlying vault to unpause/settle before removal is possible.

This is a user-griefable precondition if the underlying vault owner (who may be a different entity from the MetaVault owner) pauses their vault or keeps a strategy active.

**Impact**:
- MetaVault owner cannot remove a problematic underlying vault
- Stale vault entry affects NAV calculations and weight management
- Mitigated by: the underlying vault emergency settle (7d) and emergency withdraw (14d after pause) paths eventually unlock the state

**Evidence**:
- MetaVault.sol L521: kv.withdraw(remainingShares) without try/catch
- Compare with _withdrawFromUnderlyings (L634-646) which DOES use try/catch via the external wrapper

### Precondition Analysis
**Missing Precondition**: Underlying vault must be in a withdrawable state
**Precondition Type**: STATE
**Why This Blocks**: Underlying vault pause/strategy state is not under MetaVault owner's control

---

## Finding [SR-8]: Factory Owner Can Register Arbitrary Contracts as Vaults via registerExternalVault

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5,6,6b
**Rules Applied**: [R6:✓, R10:✓, R5:✗(single entity)]
**Severity**: Low
**Location**: VaultFactory.sol:547-557, MetaVault.sol:477

**Description**:
The factory owner can call registerExternalVault(vault, agentId) to mark any contract (with code) as a factory-deployed vault. MetaVault addVault (L477) checks vaultFactory.isDeployedVault(vault) as a validation gate. The factory owner can therefore register an arbitrary contract as a vault and the MetaVault owner could then add it as an underlying vault.

```solidity
// VaultFactory.sol L547-557
function registerExternalVault(address vault, bytes32 agentId) external onlyOwner {
    require(vault != address(0), "zero vault");
    require(vault.code.length > 0, "no code at vault");
    require(!isDeployedVault[vault], "already registered");
    isDeployedVault[vault] = true;
    _deployedVaults.push(vault);
    _agentVaults[agentId].push(vault);
    emit ExternalVaultRegistered(vault, agentId);
}
```

The function only validates that vault has code and is not already registered. It does not validate the interface (IKernelVaultLike) or that the asset matches. The MetaVault addVault additionally validates asset matching, which partially mitigates this, but a contract designed to pass the asset check while having malicious withdraw/effectiveTotalAssets/shares behavior would pass both gates.

**Impact**:
- Factory owner (FULLY_TRUSTED) can register arbitrary contracts as vaults
- Combined with a cooperating MetaVault owner, this could allow adding a malicious vault to the MetaVault that manipulates NAV
- Severity is Low because both the factory owner and MetaVault owner must cooperate (both FULLY_TRUSTED)
- [ASSUMPTION-DEP: TRUSTED-ACTOR]

**Evidence**:
- VaultFactory.sol L547-557: registerExternalVault has minimal validation
- MetaVault.sol L477: vaultFactory.isDeployedVault(vault) is the only factory-side check

---

## Finding [SR-9]: WSTONBondManager minBondFloor Changes Apply Only to Future Bonds

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5,6,6b
**Rules Applied**: [R6:✓, R14:✓, R10:✓]
**Severity**: Informational
**Location**: WSTONBondManager.sol:580-584

**Description**:
The setMinBondFloor function sets a new minimum bond floor that applies to all FUTURE bond locks. It does not retroactively affect existing locked bonds whose amounts may be above or below the new floor. This is expected behavior (changing existing bonds would be disruptive), but it means the owner can raise the floor to make future bonds more expensive or lower the floor (but not to zero, per the L-43 fix).

```solidity
// WSTONBondManager.sol L580-584
function setMinBondFloor(uint256 _minBondFloor) external onlyOwner {
    require(_minBondFloor > 0, "zero bond floor");
    minBondFloor = _minBondFloor;
    emit MinBondFloorUpdated(_minBondFloor);
}
```

**Impact**:
- Informational: new bonds must meet the new floor; existing bonds are unaffected
- No mechanism to extract value or harm users through this setter alone

---

## Finding [SR-10]: KernelVault Owner Is Immutable — No Key Rotation

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5,6,6b
**Rules Applied**: [R6:✓, R10:✓, R13:✓]
**Severity**: Informational
**Location**: KernelVault.sol:133

**Description**:
The owner of a KernelVault is set as immutable in the constructor (L133: address public immutable owner). This means the vault owner cannot be changed after deployment. If the owner key is compromised, the only mitigation is to pause the vault (if not already compromised) and migrate depositors to a new vault.

This is a deliberate design choice documented in INV-3 (vault immutability). The immutability prevents the rug via upgrade vector where an owner could hand off ownership to a malicious party. However, it also means there is no key rotation capability for operational security.

```solidity
// KernelVault.sol L133
address public immutable owner;
```

**Impact**:
- Owner key compromise: attacker permanently controls execute, fees, pause, oracle config, settle
- Owner key loss: vault becomes unmanageable (no executions, no settle, no fee changes)
- Depositors retain emergency withdraw (pause + 14d) and emergency settle (7d) as exit paths
- By design: the immutability is intentional to prevent owner-transfer rug vectors

**Evidence**:
KernelVault.sol L133: address public immutable owner;

---

## Precondition Griefability Tables

### Step 6: Keeper/Role Precondition Griefability

| Function | Role | Preconditions | User Can Manipulate? | Grief Impact |
|----------|------|--------------|---------------------|--------------|
| execute/executeWithOracle | Owner | !paused, valid proof, valid nonce | NO (nonce is owner-chosen) | N/A |
| executeOptimistic | Owner | !paused, optimisticEnabled, pendingCount < maxPending | PARTIAL - users cannot control pendingCount | N/A |
| settle | Owner | strategyActive, pendingCount == 0 (OKV) | NO (pendingCount is owner-controlled) | N/A |
| emergencySettle | Anyone | strategyActive, 7 days elapsed | NO - time-based | N/A |
| emergencyWithdraw | Depositor | paused, 14 days elapsed | NO - owner controls pause | N/A |
| collectManagementFee | Anyone | managementFeeBps > 0, totalShares > 0 | YES - depositors control totalShares via withdraw-all | Fee collection returns 0 (no harm) |
| collectPerformanceFee | Anyone | performanceFeeBps > 0, PPS > HWM | YES - users affect PPS via deposits/withdrawals | Fee collection may be 0 or non-zero |
| releaseBondByRelayer | Relayer | bond.status == Locked | NO - user cannot change bond status | N/A |
| slashBondByRelayer | Relayer | bond.status == Locked | NO - user cannot change bond status | N/A |
| reclaimExpiredBond | Operator | bond.status == Locked, !slashPending, 90d elapsed | PARTIAL - relayer/owner can set slashPending | Legitimate block |
| removeVault (MetaVault) | Owner | underlying vault allows withdrawal | YES - underlying vault owner controls pause/strategy | MetaVault owner cannot remove vault |

### Step 6b: Admin Function Griefability (Exhaustive)

| Admin Function | Preconditions | External State Dependency? | User Can Manipulate? | Grief Impact |
|----------------|--------------|---------------------------|---------------------|--------------|
| KV.setFees | FEE_CHANGE_COOLDOWN elapsed | NO | NO | N/A |
| KV.setFeeRecipient | FEE_CHANGE_COOLDOWN elapsed | NO | NO | N/A |
| KV.pause | None | NO | NO | N/A |
| KV.unpause | paused() == true | NO | NO | N/A |
| KV.settle | strategyActive | NO | NO | N/A |
| KV.setOracleSigner | None (validation only) | NO | NO | N/A |
| KV.setBondSigner | None (validation only) | NO | NO | N/A |
| KV.setAccessControl | None | NO | NO | N/A |
| KV.rescueTokens | totalShares == 0 | NO | YES - users can deposit to make totalShares > 0 | Owner cannot rescue tokens while users have shares |
| OKV.setChallengeWindow | pendingCount == 0 (if shortening) | NO | NO (owner controls pending) | N/A |
| OKV.setMaxPending | max >= pendingCount | NO | NO | N/A |
| OKV.setBondChainId | pendingCount == 0 | NO | NO | N/A |
| OKV.setOptimisticEnabled | multiple config requirements | NO | NO | N/A |
| MV.rebalance | REBALANCE_COOLDOWN elapsed | NO | NO | N/A |
| MV.addVault | vault is factory-deployed, weight sum valid | NO | NO | N/A |
| MV.removeVault | vault allows withdrawal | YES - underlying vault state | YES - underlying vault owner | Cannot remove paused/locked vault |
| MV.sweepDonations | actual > trackedIdle | YES - actual balance | YES - users can donate to make actual > trackedIdle (intended) | Donations swept to owner (intended) |
| WBM.setTrustedRelayer | None (non-zero queued) | NO | NO | N/A |
| WBM.authorizeVault | None | NO | NO | N/A |
| WBM.revokeVault | None | NO | NO | N/A |
| WBM.rescueTokens(WSTON) | balance > totalLockedGlobal | YES - WSTON balance | YES - users can send WSTON directly | Excess is rescuable (intended) |
| VF.scheduleVaultCreationCodeStore | None | NO | NO | N/A |
| VF.activateVaultCreationCodeStore | timelock elapsed | NO | NO (time-based) | N/A |
| VF.registerExternalVault | vault has code, not registered | NO | NO | N/A |
| KEV.approveVerifier | None | NO | NO | N/A |
| KEV.proposeVerifier | candidate in allowlist | NO | NO | N/A |
| KEV.activateVerifier | timelock elapsed, still in allowlist | NO | NO | N/A |
| KEV.setVerificationPaused | None | NO | NO | N/A |

---

## Chain Summary

| Finding | Severity | Postcondition | Enabler For |
|---------|----------|---------------|-------------|
| SR-1 (WSTONBondManager single-step ownership) | Medium | Ownership irrevocably transferred | Loss of bond system admin |
| SR-2 (MetaVault no ownership transfer) | Low | Permanent owner binding | No key rotation |
| SR-3 (VaultAccessControl single-step ownership) | Low | Ownership irrevocably transferred | Loss of access control admin |
| SR-4 (setAccessControl missing event) | Low | Silent config change | Invisible to monitors |
| SR-5 (rescueTokens missing event) | Info | Silent token movement | Invisible to monitors |
| SR-6 (setAccessControl withdrawal DoS) | Medium | Normal withdrawals DoSed | User fund lock |
| SR-7 (removeVault revert on paused underlying) | Low | Cannot remove vault | Stale vault in array |
| SR-8 (registerExternalVault bypass) | Low | Arbitrary contract as vault | NAV manipulation |
| SR-9 (minBondFloor no retroactive effect) | Info | Future-only enforcement | N/A |
| SR-10 (Immutable vault owner) | Info | No key rotation | N/A |
