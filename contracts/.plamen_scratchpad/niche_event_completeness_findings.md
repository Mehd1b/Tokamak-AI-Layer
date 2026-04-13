# Event Completeness Findings

## Event Coverage Matrix

### STEP 1: State-Changing Function Enumeration

Enumerated targets: 62 state-changing functions across all in-scope contracts. Below is the full matrix for all functions with confirmed state changes.

| Function | Contract | Modifies State? | Has Event? | Event Params Match State Changes? | Gap? |
|----------|----------|-----------------|------------|----------------------------------|------|
| setAccessControl(address) | KernelVault | YES (`accessControl`) | NO | N/A | **MISSING** |
| rescueTokens(address,address,uint256) | KernelVault | YES (ERC20 transfer out) | NO | N/A | **MISSING** |
| setOracleSigner(address,uint64) | KernelVault | YES | YES (OracleSignerUpdated) | YES | OK |
| setBondSigner(address) | KernelVault | YES | YES (BondSignerUpdated) | YES | OK |
| setRequireOracle(bool) | KernelVault | YES | YES (RequireOracleUpdated) | YES | OK |
| setFees(uint256,uint256) | KernelVault | YES | YES (FeesUpdated) | YES | OK |
| setFeeRecipient(address) | KernelVault | YES | YES (FeeRecipientUpdated) | YES | OK |
| setProtocolTreasury(address,uint256) | KernelVault | YES | YES (ProtocolTreasuryUpdated) | YES | OK |
| pause() | KernelVault | YES | YES (Paused - OZ) | YES | OK |
| unpause() | KernelVault | YES | YES (Unpaused - OZ) | YES | OK |
| settle() | KernelVault | YES | YES (StrategySettled) | YES | OK |
| emergencySettle() | KernelVault | YES | YES (StrategySettled) | YES | OK |
| depositERC20Tokens(uint256) | KernelVault | YES | YES (Deposit) | YES | OK |
| depositETH() | KernelVault | YES | YES (Deposit) | YES | OK |
| withdraw(uint256) | KernelVault | YES | YES (Withdraw) | YES | OK |
| withdrawTo(uint256,address) | KernelVault | YES | YES (Withdraw) | YES | OK |
| emergencyWithdraw(uint256) | KernelVault | YES — burns shares, transfers assets; does NOT call accessControl.recordWithdrawal | YES (Withdraw) | PARTIAL — `accessControl.recordWithdrawal` never called | **MISSING_INTEGRATION** |
| emergencyWithdrawTo(uint256,address) | KernelVault | YES — same as above | YES (Withdraw) | PARTIAL — same gap | **MISSING_INTEGRATION** |
| execute() | KernelVault | YES | YES (ExecutionApplied) | YES | OK |
| executeWithOracle() | KernelVault | YES | YES (ExecutionApplied) | YES | OK |
| collectManagementFee() | KernelVault | YES | YES (ManagementFeeCollected) | YES | OK |
| collectPerformanceFee() | KernelVault | YES | YES (PerformanceFeeCollected) | YES | OK |
| setChallengeWindow(uint256) | OptimisticKernelVault | YES | YES (OptimisticConfigUpdated) | YES | OK |
| setMinBond(uint256) | OptimisticKernelVault | YES | YES (OptimisticConfigUpdated) | YES | OK |
| setMaxPending(uint256) | OptimisticKernelVault | YES | YES (OptimisticConfigUpdated) | YES | OK |
| setOptimisticEnabled(bool) | OptimisticKernelVault | YES | YES (OptimisticConfigUpdated) | YES | OK |
| setBondChainId(uint256) | OptimisticKernelVault | YES | YES (BondChainIdUpdated) | YES | OK |
| executeOptimistic(...) | OptimisticKernelVault | YES | YES (OptimisticExecutionSubmitted) | YES | OK |
| submitProof(uint64,bytes) | OptimisticKernelVault | YES | YES (ProofSubmitted) | YES | OK |
| slashExpired(uint64) | OptimisticKernelVault | YES | YES (ExecutionSlashed) | YES | OK |
| selfSlash(uint64) | OptimisticKernelVault | YES | YES (ExecutionSlashed) | YES | OK |
| addVault(address,uint256) | MetaVault | YES | YES (VaultAdded) | YES | OK |
| removeVault(address) | MetaVault | YES | YES (VaultRemoved) | YES | OK |
| sweepDonations() | MetaVault | YES | YES (DonationSwept) | YES | OK |
| rebalance(address[],uint256[]) | MetaVault | YES | YES (Rebalanced) | YES | OK |
| setTreasury(address) | WSTONBondManager | YES | YES (TreasuryUpdated) | YES | OK |
| setMinBondFloor(uint256) | WSTONBondManager | YES | YES (MinBondFloorUpdated) | YES | OK |
| authorizeVault(address) | WSTONBondManager | YES | YES (VaultAuthorized) | YES | OK |
| revokeVault(address) | WSTONBondManager | YES | YES (VaultRevoked) | YES | OK |
| setTrustedRelayer(address) | WSTONBondManager | YES | YES (TrustedRelayerProposed) | YES | OK |
| rescueTokens(address,address,uint256) | WSTONBondManager | YES | YES (TokensRescued) | YES | OK |
| markSlashPending(address,address,uint64) | WSTONBondManager | YES | YES (SlashPendingMarked) | YES | OK |
| All setters | AgentRegistry | YES | YES (per table) | YES | OK |
| All setters | VaultFactory | YES | YES (per table) | YES | OK |
| All setters | KernelExecutionVerifier | YES | YES (per table) | YES | OK |
| All setters | PointsProgram | YES | YES (per table) | YES | OK |
| All setters | BuilderProgram | YES | YES (per table) | YES | OK |
| All setters | ReferralManager | YES | YES (per table) | YES | OK |
| All setters | VaultAccessControl | YES | YES (per table) | YES | OK |
| All setters | Adapters | YES | YES (per table) | YES | OK |
| rescueETH(address,uint256) | LidoAdapter | YES (ETH transfer out) | NO | N/A | **MISSING** |

---

## STEP 2: Parameter Accuracy Audit

For functions that do emit events, the parameter accuracy was checked:

- **Withdraw / Deposit events**: emit `msg.sender, assetsOut, shareAmount` after state change. All correct. Indexed field (`sender`) is the filterable entity. DONE.
- **ExecutionApplied**: emits `agentId, nonce, actionCommitment, actionCount` after execution. All correct. DONE.
- **OptimisticConfigUpdated**: emits all four config values together — efficient grouping, no parameter gap. DONE.
- **ManagementFeeCollected / PerformanceFeeCollected**: emits shares and recipient after minting. Correct. DONE.
- **FeesUpdated**: emits `managementFeeBps, performanceFeeBps` after assignment. Correct. DONE.
- **DepositRecorded** (VaultAccessControl): `recordWithdrawal` emits `DepositRecorded(user, 0, deposited[user])` — the `0` amount parameter during withdrawal is potentially misleading. An indexer would see `DepositRecorded` with `amount=0` and might interpret it as a zero-value deposit rather than a withdrawal balance update. However, the third parameter `deposited[user]` encodes the final balance so the data is recoverable. This is informational, not a bug. DONE.

---

## STEP 3: Missing Event Findings

### Gap 1: `setAccessControl` — silent admin setter (KernelVault:L629)
No event emitted when the access-control contract is rotated or disabled.

### Gap 2: `rescueTokens` — silent fund movement (KernelVault:L565)
No event emitted when tokens are rescued from the vault.

### Gap 3: `emergencyWithdraw` / `emergencyWithdrawTo` — missing accessControl integration (KernelVault:L1552, L1564)
The emergency withdrawal path (`_processEmergencyWithdraw`) does not call `accessControl.recordWithdrawal(msg.sender, assetsOut)` — unlike the normal withdrawal path (`_processWithdraw`). Users who exit via emergency withdrawal retain their full `deposited[user]` counter in `VaultAccessControl`, preventing re-deposit up to their cap after the pause ends.
This is a functional state desync, not a missing event per se, but it stems from the `setAccessControl` gap: the integration point is invisible off-chain.

### Gap 4: `rescueETH` — silent fund movement (LidoAdapter:L473)
No event emitted when ETH is rescued from the LidoAdapter.

---

## STEP 4: Cross-Contract Event Gaps

- **KernelVault → VaultAccessControl**: The `_processWithdraw` function calls `accessControl.recordWithdrawal`, which emits `DepositRecorded`. But `_processEmergencyWithdraw` does NOT call `accessControl.recordWithdrawal`. This means off-chain monitoring of the `DepositRecorded` event will have incomplete withdrawal tracking — emergency withdrawals appear as if the user is still "deposited" per the access control contract.
- **KernelVault `setAccessControl`**: When a new `VaultAccessControl` is set, the off-chain deposit counters in the new contract are zeroed. There is no event announcing the change, so an indexer cannot know to treat prior `DepositRecorded` events as invalid for access control enforcement.

---

## Finding [NE-1]: `KernelVault.setAccessControl` Missing Event

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗(no external tokens), R12:✗(no dangerous precondition), R13:✗(not design-related), R14:✗(no aggregate variable or settable constraint)]
**Severity**: Low
**Location**: `src/KernelVault.sol:L629-L632`
**Description**: `setAccessControl(address _accessControl)` modifies the `accessControl` storage variable — a security-critical address that gates deposit caps, whitelist enforcement, and KYC checks — without emitting any event. All other configuration setters in `KernelVault` emit events (`OracleSignerUpdated`, `BondSignerUpdated`, `FeesUpdated`, etc.), establishing a clear pattern that configuration changes are observable off-chain. This setter silently breaks that pattern.

```solidity
// KernelVault.sol:L629
function setAccessControl(address _accessControl) external {
    if (msg.sender != owner) revert NotOwner();
    accessControl = _accessControl;  // No emit
}
```

**Impact**: Off-chain monitoring tools, dashboards, and compliance systems cannot observe when access control enforcement is enabled, disabled, or rotated. Specifically:
1. A vault owner silently setting `accessControl = address(0)` disables whitelist/cap/KYC enforcement — depositors relying on these protections receive no observable signal.
2. A vault owner silently rotating to a different `VaultAccessControl` instance zeros all deposit counters — depositors who were at their cap can suddenly re-deposit without detection.
3. Indexers building a deposit-cap compliance view have no event to re-sync state when this setter fires.

**Evidence**: `KernelVault.sol:L629-L632` — no `emit` statement present. All 6 other configuration setters in the same contract include `emit` statements (e.g., `L593: emit OracleSignerUpdated(...)`, `L624: emit RequireOracleUpdated(...)`).

---

## Finding [NE-2]: `KernelVault.rescueTokens` Missing Event

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✓(external tokens involved), R12:✗(no dangerous precondition created), R13:✗(not design-related), R14:✗(no aggregate variable), R15:✗(no flash-loan-accessible state), R16:✗(no oracle dependency)]
**Severity**: Low
**Location**: `src/KernelVault.sol:L565-L569`
**Description**: `rescueTokens(address token, address to, uint256 amount)` transfers ERC20 tokens out of the vault — an irreversible asset movement — without emitting any event. The function is restricted to the owner AND requires `totalShares == 0` (no depositors), but an equivalent function in `WSTONBondManager` correctly emits `TokensRescued` for the same operation. This inconsistency means KernelVault rescue operations are invisible on-chain.

```solidity
// KernelVault.sol:L565
function rescueTokens(address token, address to, uint256 amount) external {
    if (msg.sender != owner) revert NotOwner();
    if (totalShares != 0) revert SharesStillOutstanding();
    IERC20(token).safeTransfer(to, amount);
    // No emit
}

// WSTONBondManager.sol:L730 (correct pattern, for comparison)
IERC20(token).safeTransfer(to, amount);
emit TokensRescued(token, to, amount);  // emits
```

**Impact**: Asset movements from the vault are unobservable on-chain beyond the raw ERC20 `Transfer` event. Users and protocol monitors cannot distinguish between a normal execution-driven transfer and an owner rescue. This hinders:
1. Post-incident forensics — no vault-level event marks which amounts were rescued.
2. Off-chain treasury reconciliation tools that rely on vault-emitted events rather than token-level event subscriptions.

**Evidence**: `KernelVault.sol:L565-L569` — no `emit` statement. `WSTONBondManager.sol:L149, L730` — identical operation emits `TokensRescued(token, to, amount)`.

---

## Finding [NE-3]: `emergencyWithdraw` / `emergencyWithdrawTo` Does Not Call `accessControl.recordWithdrawal` — Deposit Counter Desync

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✓(stored external state — `deposited[user]` in VaultAccessControl persists across calls), R10:✓, R11:✗(no external tokens), R12:✗(no dangerous precondition created), R13:✓(M-10 fix was "by design" for normal withdraw path — but impact must still be assessed), R14:✗(no aggregate variable with settable constraints)]
**Severity**: Low
**Location**: `src/KernelVault.sol:L1573-L1659` (`_processEmergencyWithdraw`)
**Description**: The M-10 fix correctly added `accessControl.recordWithdrawal(msg.sender, assetsOut)` to `_processWithdraw` (L1166-L1168) so users who withdraw can re-deposit up to their deposit cap. However, `_processEmergencyWithdraw` — the code path taken by `emergencyWithdraw` and `emergencyWithdrawTo` — does NOT include the same call. Users who exit via emergency withdrawal retain their full `deposited[user]` tally in `VaultAccessControl`, exhausting their deposit capacity even though they have no tokens in the vault.

```solidity
// _processWithdraw (normal path) — CORRECT
if (accessControl != address(0)) {
    IVaultAccessControl(accessControl).recordWithdrawal(msg.sender, assetsOut);  // L1166-1168
}

// _processEmergencyWithdraw (emergency path) — MISSING
// No call to accessControl.recordWithdrawal
// Shares burned at L1614-1615, assetsOut transferred at L1648-1656,
// but deposited[user] counter is NEVER decremented.
```

**Impact**: Users who use emergency withdrawal (only reachable when vault is paused for 14+ days) find their `deposited[user]` counter in `VaultAccessControl` is not decremented. When the vault unpauses and they wish to re-deposit, they will be refused by the deposit cap gate even though they hold zero vault assets. The `DepositRecorded` event emitted by `recordWithdrawal` is also not fired, so off-chain deposit-cap monitors show these users as still "deposited" — providing a false compliance picture during exactly the crisis period (pause + emergency exit) where accurate monitoring matters most.

**Evidence**:
- `KernelVault.sol:L1166-1168` — `_processWithdraw` calls `accessControl.recordWithdrawal`.
- `KernelVault.sol:L1573-L1659` — `_processEmergencyWithdraw` has no such call. No `IVaultAccessControl` interface reference appears in this function.
- `extensions/VaultAccessControl.sol:L227-L235` — `recordWithdrawal` decrements `deposited[user]` and emits `DepositRecorded(user, 0, deposited[user])`.

---

## Finding [NE-4]: `LidoAdapter.rescueETH` Missing Event

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✓(ETH movement), R12:✗(no dangerous precondition), R13:✗(not design-related), R14:✗(no aggregate variable)]
**Severity**: Informational
**Location**: `src/adapters/LidoAdapter.sol:L473-L480`
**Description**: `rescueETH(address payable to, uint256 amount)` transfers ETH out of the LidoAdapter without emitting any event. The native ETH transfer produces a low-level EVM `CALL` but no ERC20 `Transfer` event or adapter-level rescue event. The other adapters' ETH-moving functions all emit events (e.g., `ETHStaked`, `EmergencyWithdraw`), making this outlier harder to audit retrospectively.

```solidity
// LidoAdapter.sol:L473
function rescueETH(address payable to, uint256 amount) external nonReentrant {
    address factoryOwner = IKernelVaultOwner(vaultFactory).owner();
    if (msg.sender != factoryOwner) revert NotVaultOwner();
    if (to == address(0)) revert ZeroAddress();
    require(amount <= address(this).balance, "amount exceeds balance");
    (bool ok,) = to.call{ value: amount }("");
    if (!ok) revert ETHTransferFailed();
    // No emit
}
```

**Impact**: Adapter ETH rescue operations are not observable through the adapter's event stream. Off-chain integrations relying on adapter-level events (rather than raw ETH balance polling) miss these movements. Severity is Informational because the operation is restricted to the factory owner and represents a recovery tool rather than a normal flow.

**Evidence**: `LidoAdapter.sol:L473-L480` — no `emit` statement. Equivalent ETH movements within the same contract (`ETHStaked` at L210, `EmergencyWithdraw` at L438) all emit events.

---

## Chain Summary

| Finding ID | Location | Root Cause (1-line) | Verdict | Severity | Precondition Type | Postcondition Type |
|------------|----------|---------------------|---------|----------|-------------------|-------------------|
| NE-1 | KernelVault.sol:L629 | Admin setter `setAccessControl` modifies security-critical address with no emit | CONFIRMED | Low | N/A | STATE |
| NE-2 | KernelVault.sol:L565 | `rescueTokens` transfers ERC20 assets with no emit (WSTONBondManager does emit) | CONFIRMED | Low | N/A | EXTERNAL |
| NE-3 | KernelVault.sol:L1573 | Emergency withdraw skips `accessControl.recordWithdrawal` → deposit-cap desync | CONFIRMED | Low | STATE (accessControl set) | STATE |
| NE-4 | LidoAdapter.sol:L473 | `rescueETH` transfers native ETH with no adapter-level event | CONFIRMED | Informational | N/A | EXTERNAL |
