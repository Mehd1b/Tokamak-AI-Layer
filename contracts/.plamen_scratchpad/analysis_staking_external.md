# Analysis: Staking Receipt Tokens + External Preconditions

**Agent**: Analysis Agent #5
**Scope**: All adapters in src/adapters/, StakingRouter.sol, plus injectable concerns
**Skills Applied**: STAKING_RECEIPT_TOKENS, EXTERNAL_PRECONDITION_AUDIT, LENDING_PROTOCOL_SECURITY, DEX_INTEGRATION_SECURITY

---

## Receipt Token Inventory

| Receipt Token | Source | Type | Held By | Transferable Externally? | balanceOf(this) Dependency? |
|--------------|--------|------|---------|--------------------------|----------------------------|
| stETH | Lido | Rebasing ERC20 | LidoAdapter | YES | YES |
| wstETH | Lido | Non-rebasing ERC20 | LidoAdapter | YES | YES |
| aTokens | Aave V3 | Rebasing ERC20 | AaveV3Adapter | YES | NO |
| PT/YT/LP | Pendle | ERC20 | PendleAdapter | YES | Indirect |
| Uniswap LP NFT | Uniswap V4 | ERC721 | UniswapV4Adapter | YES | NO |
| WSTON | Tokamak | ERC20 | StakingRouter (transient) | YES | YES |
| USDC (HyperCore) | Hyperliquid | ERC20 on EVM | TradingSubAccount | YES | YES |

---

## Finding [SE-1]: AaveV3Adapter Shared Aave Account Health Factor Represents Aggregate, Not Per-Vault Risk

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3 | ✗4(N/A) | ✗5(see below)
**Rules Applied**: [R4:✓, R5:✓, R6:✗(no role), R8:✓, R10:✓, R14:✗(no aggregate variable)]
**Severity**: Medium
**Location**: src/adapters/AaveV3Adapter.sol:574-592
**Description**: The `_checkVaultHealth` function (M-08 fix) delegates to Aave's `getUserAccountData(address(this))`. Since the adapter is a singleton holding ALL vaults' positions in one Aave account, the health factor is the AGGREGATE of all vaults. The `vault` parameter is unused (`/* vault */`). When Vault A has collateral supplying safety margin, Vault B can borrow aggressively because Aave's aggregate HF is buoyed by Vault A's collateral.
**Impact**: Cross-vault collateral subsidy. If Vault A exits, aggregate HF drops and the entire adapter risks Aave liquidation affecting all vaults.

**Evidence**:
```solidity
function _checkVaultHealth(address /* vault */) internal view {
    (,,,,, uint256 aaveHealthFactor) = pool.getUserAccountData(address(this));
    if (aaveHealthFactor == type(uint256).max) return;
    if (aaveHealthFactor < minHealthFactor) {
        revert HealthFactorTooLow(aaveHealthFactor, minHealthFactor);
    }
}
```

### Postcondition Analysis
**Postconditions Created**: Cross-vault collateral dependency on shared Aave account
**Postcondition Types**: [STATE, BALANCE]
**Who Benefits**: A vault that wants to borrow more than its own collateral supports

---

## Finding [SE-2]: LidoAdapter Non-Emergency Withdrawal Paths Use Nominal Amounts Without Negative Rebase Adjustment

**Verdict**: PARTIAL
**Step Execution**: ✓1,2,2b,3,4,5,8 | ✗6,7(N/A) | ✗9(N/A)
**Rules Applied**: [R4:✓, R5:✗(single entity), R6:✗(no role), R8:✓, R10:✓]
**Severity**: Low
**Location**: src/adapters/LidoAdapter.sol:307-341, L247-276
**Description**: Emergency `withdrawToVault` has M-05 fix for negative rebase. But non-emergency paths deduct full nominal `stethAmount` from `vaultStETHBalance` without rebase check. First-mover advantage in multi-vault negative rebase.
**Impact**: In negative rebase with multiple vaults, first withdrawal gets nominal amount, later vaults fail.

---

## Finding [SE-3]: MorphoAdapter Emergency WithdrawToVault Requires Vault to Hold Loan Tokens

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3 | ✗4(N/A)
**Rules Applied**: [R4:✓, R5:✗(single entity), R8:✓, R10:✓]
**Severity**: Medium
**Location**: src/adapters/MorphoAdapter.sol:599-644
**Description**: `withdrawToVault` calls `safeTransferFrom(msg.sender, address(this), vaultBorrow)` pulling loan token FROM vault. If vault lacks loan tokens (deployed in strategy), reverts. No try/catch fallback unlike AaveV3Adapter.
**Impact**: Vault with outstanding Morpho borrows unable to emergency withdraw. Collateral locked.

---

## Finding [SE-4]: PendleAdapter Reward Distribution Uses Instantaneous Weight Snapshot

**Verdict**: PARTIAL
**Step Execution**: ✓1,2,2b,3,8
**Rules Applied**: [R4:✓, R5:✓, R10:✓]
**Severity**: Low
**Location**: src/adapters/PendleAdapter.sol:749-807
**Description**: `claimRewards` uses current `(vaultWeight / totalWeight)`, not time-weighted average. Vault entering just before claim captures disproportionate share.
**Impact**: Reward dilution for long-term holders.

---

## Finding [SE-5]: UniswapV4Adapter Emergency WithdrawToVault Uses Zero Slippage Protection

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3
**Rules Applied**: [R4:✗(evidence clear), R10:✓]
**Severity**: Medium
**Location**: src/adapters/UniswapV4Adapter.sol:563-606
**Description**: Emergency `withdrawToVault` removes all liquidity with `amount0Min: 0, amount1Min: 0`. MEV sandwich opportunity.
**Impact**: MEV sandwich attack on emergency liquidity removal.

---

## Finding [SE-6]: TradingSubAccount executeWithdraw Drains Entire Balance

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3
**Rules Applied**: [R10:✓, R11:✓]
**Severity**: Low
**Location**: src/adapters/TradingSubAccount.sol:310-317
**Description**: `executeWithdraw` transfers entire USDC `balanceOf(address(this))`. Per-vault isolated with `onlyAdapter`.
**Impact**: Minimal — untracked USDC absorbed by vault.

---

## Finding [SE-7]: MorphoAdapter Health Check Uses Stale Tracked Positions

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3
**Rules Applied**: [R4:✓, R5:✓, R8:✓, R10:✓, R16:✓]
**Severity**: Medium
**Location**: src/adapters/MorphoAdapter.sol:712-740
**Description**: Health check uses per-vault tracked `_vaultBorrowed` and `_vaultCollateral` — nominal amounts at supply/borrow time. Morpho actual borrow accrues interest, tracked stays constant. Health check underestimates leverage.
**Impact**: Permits borrowing closer to liquidation threshold. Drift grows with time.

---

## Finding [SE-8]: PendleAdapter withdrawToVault Transfers Tracked Amounts Without Balance Check

**Verdict**: PARTIAL
**Step Execution**: ✓1,2,2b,3,4,5,8
**Rules Applied**: [R5:✓, R10:✓, R11:✓]
**Severity**: Low
**Location**: src/adapters/PendleAdapter.sol:815-849
**Description**: `withdrawToVault` transfers tracked amounts without checking actual token balances. Last vault to withdraw may get revert. Unsolicited tokens permanently stranded.
**Impact**: Stranded tokens; potential withdrawal failure.

---

## Finding [SE-9]: StakingRouter Computes WTON Amount Deterministically

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3
**Rules Applied**: [R4:✗(evidence clear)]
**Severity**: Informational
**Location**: src/StakingRouter.sol:86-92
**Description**: After `wton.swapFromTON(tonAmount)`, computes WTON as `tonAmount * 1e9` (hardcoded) rather than measuring via balance delta. Inconsistent with WSTON measurement.
**Impact**: None under current WTON implementation.

---

## Finding [SE-10]: LidoAdapter Lacks Rescue Function for Stranded wstETH

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,2b,3,4,5,8
**Rules Applied**: [R11:✓]
**Severity**: Informational
**Location**: src/adapters/LidoAdapter.sol:473-480
**Description**: Has `rescueETH` but no equivalent for stETH or wstETH donations. Permanently stranded.
**Impact**: Fund recovery gap.

---

## Finding [SE-11]: AaveV3Adapter withdrawToVault Clears Borrow Tracking Without Repaying Aave Debt

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3
**Rules Applied**: [R4:✓, R8:✓, R10:✓]
**Severity**: Low
**Location**: src/adapters/AaveV3Adapter.sol:476-523
**Description**: Emergency `withdrawToVault` zeros `_vaultBorrowed` with `BorrowForfeited` event, but actual Aave debt persists. If vault re-registers and borrows, previous debt invisible to tracking but affects aggregate HF.
**Impact**: Ghost debt reduces HF for all vaults.

---

## Chain Summary

| Finding ID | Severity | Verdict | Chain Input? | Chain Output? |
|-----------|----------|---------|-------------|---------------|
| SE-1 | Medium | CONFIRMED | YES — combine with vault collateral withdrawal | Cross-vault liquidation risk |
| SE-2 | Low | PARTIAL | NO — requires external Lido slash | Last-vault-loses postcondition |
| SE-3 | Medium | CONFIRMED | YES — vault strategy deploys borrowed tokens | Stuck-funds postcondition |
| SE-4 | Low | PARTIAL | YES — timing attack on position entry | Reward dilution |
| SE-5 | Medium | CONFIRMED | YES — any emergency withdrawal trigger | MEV extraction |
| SE-6 | Low | CONFIRMED | NO — isolated | Windfall (benign) |
| SE-7 | Medium | CONFIRMED | YES — long holding or high interest | Understated leverage |
| SE-8 | Low | PARTIAL | NO — requires external event | Stranded tokens |
| SE-9 | Informational | CONFIRMED | NO — requires WTON upgrade | N/A |
| SE-10 | Informational | CONFIRMED | NO — isolated stranding | N/A |
| SE-11 | Low | CONFIRMED | YES — vault re-registration | Phantom debt |
