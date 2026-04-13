# Per-Contract Agent #2: OptimisticKernelVault + VaultAccessControl

**Scope**: OptimisticKernelVault.sol (510 lines), VaultAccessControl.sol (289 lines)
**Exclusion list applied**: INV-01 through INV-49 (see findings_inventory.md)

## File Coverage Checkpoint

| File | Lines | Opened? | Functions Analyzed |
|------|-------|---------|-------------------|
| OptimisticKernelVault.sol | 510 | YES | executeOptimistic, _verifyOptimisticOracleAndBond, submitProof, slashExpired, selfSlash, setChallengeWindow, setMinBond, setMaxPending, setOptimisticEnabled, setBondChainId, _settle, _emitConfig |
| VaultAccessControl.sol | 289 | YES | canDeposit, recordDeposit, recordWithdrawal, setWhitelistEnabled, addToWhitelist, removeFromWhitelist, setDepositCapEnabled, setDepositCap, setDefaultDepositCap, setKycVerifierEnabled, setKycVerifier, getRemainingAllowance, getEffectiveCap, transferOwnership |

---

## Finding [PC2-1]: VaultAccessControl deposit gates (whitelist, cap, KYC) are never enforced — KernelVault never calls canDeposit() or recordDeposit()

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5,6,7
**Rules Applied**: [R4:✗(evidence clear, no externals), R5:✗(single entity), R6:✗(no role involved), R8:✗(single-step), R10:✓, R13:✓ user impact: any user can deposit regardless of whitelist/KYC/cap]
**Depth Evidence**: [TRACE: depositERC20Tokens(amount) → no canDeposit call → shares minted, no gate applied], [BOUNDARY: accessControl != address(0) checked only in _processWithdraw at L1166, never in depositERC20Tokens L815 or depositETH L871], [VARIATION: VaultAccessControl.whitelistEnabled=true, whitelisted[alice]=false → alice calls depositERC20Tokens(1e18) → deposit succeeds, VaultAccessControl.canDeposit(alice,1e18)=false was never consulted]
**Severity**: Medium
**Location**: KernelVault.sol:L815-864 (depositERC20Tokens — missing canDeposit + recordDeposit), KernelVault.sol:L871-917 (depositETH — same gap), VaultAccessControl.sol:L244-267 (canDeposit — never called by vault), VaultAccessControl.sol:L213-217 (recordDeposit — never called by vault)

**Description**:
`VaultAccessControl` implements three deposit enforcement gates — whitelist, per-address deposit caps, and KYC verification — all exposed via `canDeposit(user, amount)`. The contract's NatSpec explicitly instructs: "Call `canDeposit(user, amount)` before accepting a deposit."

However, `KernelVault` never calls `canDeposit()` during `depositERC20Tokens()` or `depositETH()`. The vault defines a minimal `IVaultAccessControl` interface that exposes only `recordWithdrawal`:

```solidity
// KernelVault.sol L12-15
interface IVaultAccessControl {
    function recordWithdrawal(address user, uint256 amount) external;
}
```

`canDeposit` and `recordDeposit` are absent from this interface and are never called. Deposits proceed without consulting any gate. Furthermore, `deposited[user]` in `VaultAccessControl` is never incremented via the vault deposit path — `recordDeposit` is only callable by `vault` or `owner`, and the vault never calls it. The cap tracking counter therefore remains at zero for all users regardless of deposit history, making the cap check permanently trivially satisfied:

```solidity
// VaultAccessControl.sol L250-257
if (depositCapEnabled) {
    uint256 cap = depositCaps[user];
    if (cap == 0) cap = defaultDepositCap;
    if (cap > 0) {
        if (deposited[user] + amount > cap) return false;  // deposited[user] always 0 — never fails
    }
}
```

**Impact**:
- Whitelist bypass: Any non-whitelisted address deposits freely to a vault with `whitelistEnabled = true`. Intended KYC/institutional-only vaults are permissionless.
- Deposit cap bypass: Per-address or global deposit caps are never applied. Unlimited deposits accepted regardless of configured caps.
- KYC gate bypass: `kycVerifier.isVerified(user)` is never called during vault deposit.
- Counter drift: `recordWithdrawal(msg.sender, assetsOut)` IS called on withdrawal, decrementing `deposited[user]`. If the owner manually seeds `deposited[user]` via `recordDeposit`, subsequent withdrawals will decrement it toward zero, permanently freeing the user's cap even if they re-deposit via the vault.

**Evidence**:
```solidity
// KernelVault.sol depositERC20Tokens — complete function, no access control call
function depositERC20Tokens(uint256 assets) external nonReentrant whenNotPaused returns (uint256 sharesMinted) {
    if (strategyActive) revert DepositsLockedDuringStrategy();
    if (address(asset) == address(0)) revert WrongDepositFunction();
    if (assets == 0) revert ZeroDeposit();
    // [GAP] No: if (accessControl != address(0)) require(IVaultAccessControl(accessControl).canDeposit(msg.sender, assets));
    uint256 effectiveAssets = effectiveTotalAssets();
    uint256 balanceBefore = asset.balanceOf(address(this));
    asset.safeTransferFrom(msg.sender, address(this), assets);
    uint256 actualReceived = asset.balanceOf(address(this)) - balanceBefore;
    sharesMinted = (actualReceived * (totalShares + _DECIMALS_OFFSET)) / (effectiveAssets + 1);
    if (sharesMinted == 0) revert ZeroShares();
    shares[msg.sender] += sharesMinted;
    totalShares += sharesMinted;
    totalDeposited += actualReceived;
    // [GAP] No: IVaultAccessControl(accessControl).recordDeposit(msg.sender, actualReceived);
    ...
}
```

### Postcondition Analysis
**Postconditions Created**: Any address deposits to a whitelist/cap/KYC-gated vault without restriction
**Postcondition Types**: ACCESS, STATE
**Who Benefits**: Any depositor the vault owner intended to exclude

---

## Finding [PC2-2]: recordWithdrawal always passes msg.sender regardless of withdrawTo() recipient — cap counter misattributed when recipient differs from caller

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓ worst-state: an attacker with shares can decrease their own deposited counter by withdrawing to any address], R13:✗]
**Depth Evidence**: [TRACE: withdrawTo(shareAmount, recipient) → _processWithdraw(shareAmount, recipient) → recordWithdrawal(msg.sender, assetsOut) — recipient parameter is used only for token transfer, never for counter update], [VARIATION: user A calls withdrawTo(shares, userB) → deposited[userA] decremented, deposited[userB] unchanged; userB received assets but their cap counter shows no reduction], [BOUNDARY: withdrawTo(allShares, address(this)) → deposited[msg.sender] decremented to 0 → msg.sender's full cap freed, assets stay in vault]
**Severity**: Low
**Location**: KernelVault.sol:L935-943 (withdrawTo), KernelVault.sol:L1166-1168 (_processWithdraw — recordWithdrawal always uses msg.sender)

**Description**:
`withdrawTo(shareAmount, to)` sends the withdrawn assets to caller-specified `to`, but the access control counter update always targets `msg.sender` regardless of who receives the assets:

```solidity
// KernelVault.sol L1166-1168
if (accessControl != address(0)) {
    IVaultAccessControl(accessControl).recordWithdrawal(msg.sender, assetsOut);  // always msg.sender
}
```

This creates counter misattribution in two directions:

1. **Caller's counter decremented, recipient's counter unchanged**: User A calls `withdrawTo(shares, userB)`. Assets go to `userB`, but `deposited[userA]` is decremented. `userB`'s counter reflects no change — they received assets but the system believes they haven't withdrawn anything. If `userB` then attempts to deposit, their full historical `deposited[userB]` still applies as if the assets they just received were never withdrawn from their perspective.

2. **Self-directed counter drain via `withdrawTo(shares, attacker)`**: A user who deposited up to their cap can call `withdrawTo(shares, self)` to get assets back AND decrement their counter — identical to `withdraw()`. But `withdrawTo(shares, thirdParty)` also decrements the caller's counter while sending assets elsewhere, which may or may not be the intended semantics.

3. **INV-07 interaction** (existing finding, not re-reported): `withdrawTo(shares, address(this))` burns shares but sends assets to the vault itself — `deposited[msg.sender]` gets decremented as if a real withdrawal occurred, but the vault retains the assets. The caller's cap capacity is freed without any corresponding asset outflow.

**Impact**: Deposit cap enforcement is inconsistent when `withdrawTo` is used with a recipient different from `msg.sender`. Economic harm is bounded — no direct fund drain — but compliance-oriented vaults relying on deposit caps for regulatory limits will have inaccurate per-user tracking whenever `withdrawTo` is used.

---

## Finding [PC2-3]: selfSlash emits ExecutionSlashed with finder=address(0) causing 10% of slashed bond to be burned on L1 rather than redistributed

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(owner is FULLY_TRUSTED, selfSlash within permissions), R8:✗(single-step), R10:✓ worst-state: minBond=1e27 ray, 10% = 1e26 WSTON burned per selfSlash], R13:✓ — "voluntary slash with no finder cost" is described as designed but impact of burning 10% not documented]
**Depth Evidence**: [TRACE: selfSlash(nonce) → emit ExecutionSlashed(nonce, address(0), bondAmount) → relayer reads event → WSTONBondManager.slashBondByRelayer(op, nonce, vault, finder=address(0)) → WSTON.transfer(address(0), bondAmount * 10/100) → tokens burned on L1], [VARIATION: slashExpired called by any EOA → emit ExecutionSlashed(nonce, msg.sender, bondAmount) → msg.sender receives 10% on L1 as finder incentive — no burn]
**Severity**: Low
**Location**: OptimisticKernelVault.sol:L310-323 (selfSlash — finder=address(0)), OptimisticKernelVault.sol:L293-307 (slashExpired — finder=msg.sender)

**Description**:
`selfSlash()` lets the vault owner voluntarily mark a pending execution as slashed. The function emits `ExecutionSlashed` with `address(0)` as the finder:

```solidity
// OptimisticKernelVault.sol L310-323
function selfSlash(uint64 executionNonce) external nonReentrant {
    if (msg.sender != owner) revert NotOwner();
    PendingExecution storage pending = pendingExecutions[executionNonce];
    if (pending.status != STATUS_PENDING) revert ExecutionNotPending(executionNonce, pending.status);
    uint256 bondAmount = pending.bondAmount;
    pending.status = STATUS_SLASHED;
    _pendingCount--;
    emit ExecutionSlashed(executionNonce, address(0), bondAmount);  // finder = address(0)
}
```

The off-chain relayer relays this event to `WSTONBondManager.slashBondByRelayer(operator, nonce, vaultAddress, finder=address(0))` on L1. The bond distribution in `WSTONBondManager` sends 10% to `finder`. Sending 10% to `address(0)` permanently burns those WSTON tokens.

By contrast, `slashExpired()` correctly uses `msg.sender` as the finder — any external party who calls it receives 10% as an incentive:
```solidity
// OptimisticKernelVault.sol L306
emit ExecutionSlashed(executionNonce, msg.sender, bondAmount);  // finder = caller
```

**Impact**: When `selfSlash` is used, 10% of the bond (e.g., for a 1 WSTON = 1e27 ray minBond, that is 1e26 ray = 0.1 WSTON) is permanently burned. The remaining 90% is still distributed: 80% to vault depositors and 10% to the treasury. The 10% burn is the de-facto cost of using `selfSlash` instead of waiting for `slashExpired`. Vault owners who call `selfSlash` before the deadline (the only scenario where it's uniquely useful, since `slashExpired` is available after deadline) unknowingly destroy value that could instead go to depositors or a designated treasury.

---

## Summary

| Finding ID | Severity | Verdict | Title |
|-----------|----------|---------|-------|
| PC2-1 | Medium | CONFIRMED | VaultAccessControl deposit gates never enforced — canDeposit/recordDeposit never called by KernelVault |
| PC2-2 | Low | CONFIRMED | recordWithdrawal misattributes cap counter to msg.sender, not withdrawTo() recipient |
| PC2-3 | Low | CONFIRMED | selfSlash emits finder=address(0) causing 10% bond burn on L1 |

**Cross-Contract Boundary Notes**:
- KernelVault defines `IVaultAccessControl` with only `recordWithdrawal` — `canDeposit` and `recordDeposit` absent (PC2-1)
- WSTONBondManager receives `ExecutionSlashed` events — finder=address(0) from selfSlash causes L1 burn (PC2-3)
- `_settle()` override in OKV guards against pending executions — correctly implemented, no new finding
- `submitProof` uses try/catch around verifier — correctly handles proof failure without stranding status=PENDING
- `setChallengeWindow` only affects future submissions (stored deadline = submission-time snapshot) — INV-32 already covers the increasing-window case
