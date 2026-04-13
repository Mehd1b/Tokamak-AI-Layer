# Token Flow Tracing Analysis

**Agent**: Analysis Agent #2 — TOKEN FLOW TRACING
**Scope**: All .sol files in contracts/src/
**Date**: 2026-04-13

---

## Step Execution Checklist

| Section | Required | Completed? | Notes |
|---------|----------|------------|-------|
| 1. Token Entry Points | YES | ✓ | All entry paths enumerated |
| 2. Token State Tracking | YES | ✓ | Tracked vs live balance mapping complete |
| 3. Token Exit Points | YES | ✓ | All exit paths enumerated |
| 4. Token Type Separation | YES (multi-token) | ✓ | ETH/ERC20/WSTON/stETH/wstETH/aToken/Uniswap NFT |
| 5. Unsolicited Transfer Analysis | YES | ✓ | Donation vectors analyzed |
| 5b. Unsolicited Transfer Matrix (All Types) | YES | ✓ | Full matrix produced |
| 6. Token Flow Checklist | YES | ✓ | Per-token checklist complete |
| 7. Cross-Token Interactions | YES (multi-token) | ✓ | Cross-token exchange rate dependencies mapped |
| 8. External Call Return Type | YES | ✓ | Adapter return types verified |
| 9. Transfer Side Effects | YES | ✓ | stETH rebase, aToken accrual, Pendle expiry |
| 9d. Side Effect Token Type | YES | ✓ | Reward claim token types checked |

---

## Finding [TF-1]: ERC20 KernelVault Uses Direct balanceOf for totalAssets — Donation Inflates PPS

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5,5b,6,7,8,9,9d
**Rules Applied**: [R4:✗(evidence clear), R5:✓, R6:✗(no role), R8:✗(single-step), R10:✓, R11:✓, R14:✗(no settable constraint), R15:✓]
**Depth Evidence**: [TRACE:totalAssets()→L1729→asset.balanceOf(address(this))→includes donations], [VARIATION:ETH vault uses trackedETHBalance but ERC20 does not→asymmetric protection], [BOUNDARY:donation=1 wei before first deposit→DECIMALS_OFFSET limits but does not eliminate inflation]
**Severity**: Medium
**Location**: KernelVault.sol:L1725-1730

**Description**: For ERC20 vaults, `totalAssets()` returns `asset.balanceOf(address(this))` which includes any unsolicited direct ERC20 transfers (donations). Unlike ETH vaults which use `trackedETHBalance` to immunize against selfdestruct/donation inflation, ERC20 vaults have no tracked balance — donations directly inflate `totalAssets()`, which flows into `effectiveTotalAssets()` (when not in strategy), `currentPps()`, share calculation in `depositERC20Tokens()`, and asset calculation in `_processWithdraw()`.

The `DECIMALS_OFFSET = 1e3` virtual offset provides standard ERC4626 inflation attack protection (making the classic first-depositor attack uneconomical for amounts < offset * asset_price). However, it does NOT prevent general PPS manipulation via donation for subsequent depositors — an attacker with existing shares can donate to inflate PPS and then withdraw at the inflated rate, extracting value from future depositors.

```solidity
// KernelVault.sol L1725-1730
function totalAssets() public view returns (uint256) {
    if (address(asset) == address(0)) {
        return trackedETHBalance;  // ETH: protected
    }
    return asset.balanceOf(address(this));  // ERC20: includes donations
}
```

The asymmetry between ETH (tracked) and ERC20 (untracked) is architecturally inconsistent. MetaVault solved this same problem with `trackedIdle`.

**Impact**:
- An attacker who is an existing depositor can donate ERC20 to inflate PPS, then withdraw at higher PPS before new depositors enter. Net effect: value extraction from the vault proportional to donation size, bounded by the offset.
- Front-running deposits: attacker donates before a large deposit, increasing the PPS the depositor buys in at, then withdraws their own shares at the now-higher PPS after the deposit's dilution effect.
- The attack is bounded by the DECIMALS_OFFSET for very small vaults, but for vaults with significant TVL, the donation:TVL ratio determines the magnitude of manipulation.

**Evidence**:
```solidity
// Compare: MetaVault uses trackedIdle (protected)
function getNav() public view returns (uint256) {
    uint256 idle = trackedIdle;  // NOT balanceOf(this)
    ...
}

// But KernelVault (ERC20) uses balanceOf directly
function totalAssets() public view returns (uint256) {
    ...
    return asset.balanceOf(address(this));  // INCLUDES donations
}
```

### Postcondition Analysis
**Postconditions Created**: [Inflated PPS, asymmetric deposit pricing]
**Postcondition Types**: [STATE, BALANCE]
**Who Benefits**: [Attacker with existing shares; front-runners]

### Chain Summary
| Enabler | How | Blocks |
|---------|-----|--------|
| Direct ERC20 transfer to vault | Any address can send ERC20 to vault | No access control possible on ERC20.transfer |

---

## Finding [TF-2]: KernelVault withdrawTo Allows Self-Transfer — Share Burn Without Asset Loss

**Verdict**: PARTIAL
**Step Execution**: ✓1,2,3,3b,4,5 | ✗6(covered above) | ✗7(single vault)
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗(no external tokens)]
**Depth Evidence**: [TRACE:withdrawTo(shares, address(this))→L941→_processWithdraw→safeTransfer(address(this))→balanceOf(this) unchanged→but shares burned→PPS inflates]
**Severity**: Low
**Location**: KernelVault.sol:L935-943

**Description**: The `withdrawTo()` function allows specifying any non-zero `to` address, including `address(this)` (the vault itself). When a user calls `withdrawTo(shareAmount, address(vault))`:

1. Shares are burned from `msg.sender`
2. `totalShares` decreases
3. `totalWithdrawn` increases
4. For ERC20 vaults: `asset.safeTransfer(address(this), assetsOut)` sends tokens to the vault itself — no net change in `balanceOf(this)`, meaning `totalAssets()` is unchanged
5. For ETH vaults: `trackedETHBalance -= assetsOut` then the call sends ETH to receive() which does `trackedETHBalance += msg.value` — net effect is unchanged

The result: shares are burned but no assets actually leave the vault, inflating PPS for remaining shareholders. While this benefits remaining shareholders (including the caller if they retain shares), it is a mechanism for irreversible share destruction without economic justification.

```solidity
function withdrawTo(uint256 shareAmount, address to)
    external nonReentrant whenNotPaused returns (uint256 assetsOut)
{
    require(to != address(0), "zero recipient");
    // No check: to != address(this)
    return _processWithdraw(shareAmount, to);
}
```

**Impact**: A user can permanently destroy their own shares to inflate PPS for remaining holders. This is only self-harmful in isolation, but in a multi-party vault it could be used as a griefing or manipulation vector (e.g., burning shares right before a fee collection to inflate the HWM).

**Evidence**: No explicit check for `to == address(this)` in `withdrawTo` or `_processWithdraw`.

### Precondition Analysis
**Missing Precondition**: [Exploiter would need to benefit from PPS inflation more than the share burn costs them]
**Precondition Type**: BALANCE
**Why This Blocks**: [The attacker loses the burned shares, so profitable exploitation requires a secondary position that benefits from PPS increase — e.g., a separate fee-recipient account or a short-term manipulation before a large withdrawal by another party]

---

## Finding [TF-3]: AaveV3Adapter Interest Accrual Not Distributed to Individual Vaults

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,7,8,9,9d | ✗4(N/A — single adapter type) | ✗5(adapter, not vault)
**Rules Applied**: [R4:✗(evidence clear), R5:✓, R6:✗(no role), R8:✓, R10:✓, R11:✗(no external tokens), R13:✗(not design-related)]
**Depth Evidence**: [TRACE:supply(asset,amount)→_vaultSupplied[vault][asset]+=amount→interest accrues to adapter aggregate→withdraw capped at _vaultSupplied], [VARIATION:vault A supplies 100, interest accrues 10, vault A can only withdraw 100 — 10 stranded]
**Severity**: Medium
**Location**: AaveV3Adapter.sol:L284-307, L310-343

**Description**: The AaveV3Adapter uses per-vault `_vaultSupplied` tracking to enforce isolation on a shared Aave account. When a vault supplies 100 tokens, `_vaultSupplied[vault][asset] = 100`. Over time, Aave accrues interest, increasing the aToken balance held by the adapter. However, the per-vault tracked supply remains at 100.

The `withdraw` function enforces:
```solidity
uint256 tracked = _vaultSupplied[msg.sender][asset];
if (toWithdraw > tracked) {
    revert InsufficientVaultPosition(toWithdraw, tracked);
}
```

This means interest earned by the vault's supplied funds is stranded in the adapter — the vault cannot withdraw more than its original supply. The adapter's code comments acknowledge this: "Interest accrual is retained in the adapter until a protocol-level rebase distribution is implemented" (L149).

**Impact**:
- Interest earned by each vault's deposits is trapped in the adapter indefinitely.
- If multiple vaults are registered, the aggregate interest benefits no one — it sits in the adapter's Aave position.
- The `withdrawToVault()` emergency function also only withdraws `tracked` amounts, so even emergency exit leaves interest behind.
- Over time, this represents a growing loss of yield for depositors that is architecturally permanent until a distribution mechanism is added.

**Evidence**:
```solidity
// L149 - code comment acknowledges the issue
// "Interest accrual is retained in the adapter until a protocol-level rebase
//  distribution is implemented."

// L322 - withdraw capped at tracked
uint256 tracked = _vaultSupplied[msg.sender][asset];
uint256 toWithdraw = amount == type(uint256).max ? tracked : amount;
```

### Postcondition Analysis
**Postconditions Created**: [Interest permanently trapped in adapter Aave position]
**Postcondition Types**: [STATE, BALANCE]
**Who Benefits**: [No one currently benefits; interest is dead capital]

---

## Finding [TF-4]: MorphoAdapter Does Not Verify Actual Amounts Returned by Morpho Operations

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,8,9 | ✗4(N/A) | ✗5(adapter)
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✓, R10:✓, R11:✗(no external tokens)]
**Depth Evidence**: [TRACE:supply(params,assets)→IMorpho.supply(params,assets,0,this,"")→returns (assetsSupplied,sharesSupplied)→return values IGNORED→_vaultSupplied+=assets (input, not actual)], [VARIATION:if Morpho supplies less than requested (rounding, max cap), tracking diverges from reality]
**Severity**: Low
**Location**: MorphoAdapter.sol:L374-398, L404-425, L431-455

**Description**: The MorphoAdapter's `supply()`, `withdraw()`, `borrow()`, and other functions do not check the actual amounts returned by Morpho Blue's operations. They credit per-vault tracking based on the **input** amount rather than the **actual** amount processed.

```solidity
// supply() - L392
IMorpho(morpho).supply(params, assets, 0, address(this), "");
// Return value (assetsSupplied, sharesSupplied) IGNORED
_vaultSupplied[msg.sender][marketId] += assets;  // Uses input, not actual
```

If Morpho Blue processes a different amount than requested (e.g., due to rounding in share-based accounting, interest accrual between operations, or market-specific limits), the per-vault tracking diverges from the actual Morpho position.

**Impact**:
- Tracking divergence accumulates over many operations.
- A vault might be tracked as having supplied X but Morpho's actual position is X-delta, meaning `withdrawToVault()` could try to withdraw more than available and revert.
- For borrow tracking, if Morpho lends less than requested, the vault is tracked as owing more than it actually borrowed.

**Evidence**: All Morpho calls discard their return values. Compare with AaveV3Adapter's `withdraw()` which at least checks `if (withdrawn == 0) revert WithdrawFailed()`.

### Postcondition Analysis
**Postconditions Created**: [Per-vault position tracking may diverge from actual Morpho position]
**Postcondition Types**: [STATE]
**Who Benefits**: [No direct beneficiary; creates operational risk for emergency withdrawals]

---

## Finding [TF-5]: LidoAdapter syncRebase Only Updates Aggregate — Per-Vault Operations Use Stale Nominal Balances

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,5,5b,7,8,9,9d
**Rules Applied**: [R4:✗(evidence clear), R5:✓, R6:✗(no role), R8:✓, R10:✓, R11:✗(no external tokens)]
**Depth Evidence**: [TRACE:syncRebase()→totalTrackedStETH=actual→but individual vaultStETHBalance[v] UNCHANGED], [VARIATION:negative rebase→vaultStETHBalance[A]=100 but actual claim=95→wrapToWstETH(100) attempts to wrap more than fair share]
**Severity**: Low
**Location**: LidoAdapter.sol:L219-232, L247-276

**Description**: The `syncRebase()` function updates only the aggregate `totalTrackedStETH` to match the actual stETH balance. Individual `vaultStETHBalance[vault]` values remain at their nominal amounts. The `vaultStETHShare()` view computes the pro-rata share dynamically, but core operations like `wrapToWstETH()` and `requestWithdrawal()` check against nominal `vaultStETHBalance`.

After a negative stETH rebase, a vault could attempt to `wrapToWstETH()` for its full nominal balance, consuming more than its pro-rata share. The `withdrawToVault()` emergency function handles this correctly with its pro-rata mechanism, but `wrapToWstETH()` and `requestWithdrawal()` do not.

**Impact**: After a negative rebase, the first vault to call `wrapToWstETH()` with its full nominal amount consumes a disproportionate share of the actual stETH, leaving less for other vaults. This is a fairness issue.

**Evidence**:
```solidity
function wrapToWstETH(uint256 stethAmount) external nonReentrant onlyRegisteredVault {
    if (vaultStETHBalance[msg.sender] < stethAmount) {  // Nominal check
        revert InsufficientStETHBalance(stethAmount, vaultStETHBalance[msg.sender]);
    }
    // No pro-rata adjustment for negative rebase
    vaultStETHBalance[msg.sender] -= stethAmount;  // Nominal decrement
}
```

---

## Finding [TF-6]: MetaVault _depositToVault Decrements trackedIdle by Input Amount — Fee-on-Transfer Token Mismatch

**Verdict**: PARTIAL
**Step Execution**: ✓1,2,3,5,6,7
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✓, R10:✓, R11:✗(no external tokens)]
**Depth Evidence**: [TRACE:_depositToVault(vault,assets)→forceApprove(vault,assets)→kv.depositERC20Tokens(assets)→trackedIdle-=assets→but deposit uses balance-before/after for fee-on-transfer], [VARIATION:if baseAsset is fee-on-transfer, actual deposited < assets, but trackedIdle decremented by full assets]
**Severity**: Low
**Location**: MetaVault.sol:L688-698

**Description**: When MetaVault deposits into an underlying KernelVault via `_depositToVault()`, it decrements `trackedIdle` by the full `assets` amount. However, the underlying KernelVault uses a balance-before/after pattern for fee-on-transfer support. If the baseAsset has transfer fees, the actual amount received by the KernelVault is less than `assets`, but MetaVault reduces `trackedIdle` by the full amount.

```solidity
function _depositToVault(address vault, uint256 assets) internal {
    baseAsset.forceApprove(vault, assets);
    IKernelVaultLike(vault).depositERC20Tokens(assets);
    if (assets > trackedIdle) {
        trackedIdle = 0;
    } else {
        trackedIdle -= assets;  // Full amount, not actual received by underlying
    }
}
```

Over multiple rebalances with a fee-on-transfer token, `trackedIdle` gradually underestimates the true idle balance, understating NAV and undervaluing depositor shares.

**Impact**: If the baseAsset is a fee-on-transfer token, repeated rebalance cycles would cause `trackedIdle` to diverge from reality, gradually understating NAV. Benefits new depositors at the expense of existing ones.

### Precondition Analysis
**Missing Precondition**: [baseAsset must be a fee-on-transfer token]
**Precondition Type**: EXTERNAL
**Why This Blocks**: [Most standard ERC20 tokens do not have transfer fees, but the codebase explicitly supports fee-on-transfer in KernelVault's deposit path, suggesting this token type is in scope.]

---

## Finding [TF-7]: AaveV3Adapter Reward Claims May Send Unknown Token Types to KernelVault

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,8,9,9d
**Rules Applied**: [R4:✓, R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✓]
**Depth Evidence**: [TRACE:claimRewards(assets)→rewardsController.claimAllRewards(assets, msg.sender)→rewards sent directly to vault→vault cannot handle non-asset tokens]
**Severity**: Informational
**Location**: AaveV3Adapter.sol:L448-466

**Description**: The `claimRewards()` function calls Aave's `claimAllRewards()` with the recipient set to `msg.sender` (the vault). Aave can distribute multiple reward token types simultaneously. These reward tokens are sent directly to the KernelVault, but the vault can only handle its single asset token. The `rescueTokens()` exit path requires `totalShares == 0`, making rewards effectively locked in active vaults.

**Impact**: Claimed reward tokens are stranded in the KernelVault until all depositors exit. This is a value leak, not a security vulnerability.

---

## Finding [TF-8]: WSTONBondManager slashBond Sends Depositor Share to Vault Address — Cross-Chain Mismatch Risk

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,5,7 | ✗4(N/A)
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✓, R10:✓, R11:✗(no external tokens)]
**Depth Evidence**: [TRACE:slashBond→depositorShare→wston.safeTransfer(vault,depositorShare)→cross-chain vault address may not exist on L1]
**Severity**: Low
**Location**: WSTONBondManager.sol:L267-309

**Description**: The `slashBond()` function (called by authorized vaults) sends the depositor share of slashed WSTON directly to the `vault` address. For cross-chain vaults (the primary use case), the vault address is on HyperEVM, not L1 where the WSTON exists. If an authorized vault on L1 calls `slashBond()` with a cross-chain vault address, the WSTON is sent to that address on L1 — which may be EOA, different contract, or empty.

The `slashBondByRelayer()` correctly routes the depositor share to the treasury as escrow for cross-chain cases. But `slashBond()` has no such guard.

**Impact**: If an authorized vault on L1 calls `slashBond()` with a cross-chain vault address, the depositor share of WSTON could be sent to a non-existent contract on L1. This requires operational misconfiguration.
