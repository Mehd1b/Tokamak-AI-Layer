# Breadth Re-Scan Agent #2 — Analysis

**Scope**: Adapters and periphery contracts (second half)
**Files**: HyperliquidAdapter.sol, TradingSubAccount.sol, UniswapV4Adapter.sol, PendleAdapter.sol, PolymarketAdapter.sol, AaveV3Adapter.sol, LidoAdapter.sol, MorphoAdapter.sol, StakingRouter.sol, PointsProgram.sol, BuilderProgram.sol, ReferralManager.sol

---

## Finding [RS2-1]: LidoAdapter.withdrawToVault() decrements totalTrackedStETH by nominal amount under negative rebase, causing first-out advantage and asymmetric loss distribution

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5 | ✗6(N/A) | ✗8(N/A — single-step)
**Rules Applied**: [R4:✗(evidence clear), R5:✓, R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗, R14:✗]
**Severity**: Low
**Location**: LidoAdapter.sol:L406-425

**Description**:
Under a negative rebase (Lido slash), `withdrawToVault()` correctly transfers only the pro-rata amount (`stETHReturned = stETHAmount * actualStETH / totalTrackedStETH`), but decrements `totalTrackedStETH` by the full nominal `stETHAmount` instead of by `stETHReturned`. After a vault withdraws, `totalTrackedStETH` understates the actual remaining stETH balance, causing subsequent vaults' shares to be overstated. The first withdrawing vault absorbs all rebase loss; subsequent vaults drain the adapter beyond their true pro-rata entitlement.

**Impact**: Pro-rata slash loss distribution is broken. The first vault to call `withdrawToVault()` during a negative rebase absorbs 100% of the loss. All subsequent vaults can withdraw their full nominal claim, collectively over-drawing the adapter. With N vaults sharing a 5% slash, the first vault loses 5%; the remaining N-1 get 100% of their nominal claim, draining stETH that does not exist.

**Evidence**:
```solidity
// LidoAdapter.sol:L406-425
if (totalTrackedStETH > 0 && actualStETH < totalTrackedStETH) {
    stETHReturned = (stETHAmount * actualStETH) / totalTrackedStETH;
}
if (stETHReturned > 0) {
    IERC20(lido).safeTransfer(msg.sender, stETHReturned);
}
// BUG: decrements by stETHAmount (nominal), not stETHReturned (actual transferred)
if (stETHAmount > totalTrackedStETH) {
    totalTrackedStETH = 0;
} else {
    totalTrackedStETH -= stETHAmount;  // should be: -= stETHReturned
}
```

---

## Finding [RS2-2]: PendleAdapter.claimRewards() excludes ptBalance from vault weight computation — vaults holding only PT receive zero rewards permanently

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5 | ✗6(N/A) | ✗8(N/A — single-step)
**Rules Applied**: [R4:✗(evidence clear), R5:✓, R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗, R14:✗]
**Severity**: Low
**Location**: PendleAdapter.sol:L785-803

**Description**:
The M-04 pro-rata reward fix computes `vaultWeight += vaultPos.ytBalance + vaultPos.lpBalance` and `totalWeight += totPos.ytBalance + totPos.lpBalance`, omitting `ptBalance` from both. A vault that acquired PT via `swapExactTokenForPt()` has `ptBalance > 0`, `ytBalance == 0`, `lpBalance == 0`. Its `vaultWeight == 0`, causing the `if (vaultWeight > 0)` guard to short-circuit reward transfer. The claimed rewards (which include SY interest accrued by the market that PT holders are entitled to) remain stranded in the adapter indefinitely.

**Impact**: PT-only vaults never receive any yield from `claimRewards()`. If all vaults in a market hold only PT (common for fixed-yield strategies), `totalWeight == 0` and `claimRewards()` becomes a no-op for all callers — all rewards accumulate permanently in the adapter with no exit path.

**Evidence**:
```solidity
// PendleAdapter.sol:L786-803
for (uint256 i = 0; i < markets.length; i++) {
    MarketPosition memory vaultPos = positions[msg.sender][markets[i]];
    MarketPosition memory totPos = totalPositions[markets[i]];
    vaultWeight += vaultPos.ytBalance + vaultPos.lpBalance;   // ptBalance missing
    totalWeight += totPos.ytBalance + totPos.lpBalance;        // ptBalance missing
}
for (uint256 i = 0; i < rewardTokens.length; i++) {
    uint256 delta = balanceAfter - balancesBefore[i];
    if (delta > 0 && totalWeight > 0 && vaultWeight > 0) {   // fails for PT-only vault
        uint256 vaultShare = (delta * vaultWeight) / totalWeight;
        IERC20(rewardTokens[i]).safeTransfer(msg.sender, vaultShare);
    }
}
```

---

## Finding [RS2-3]: UniswapV4Adapter.addLiquidity() leaves residual ERC-20 approval on the position manager after partial-fill mints

**Verdict**: PARTIAL
**Step Execution**: ✓1,2,3 | ✗4(N/A — no boundary substitution meaningful here) | ✓5 | ✗6(N/A) | ✗8(N/A)
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity — only the calling vault is affected), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗, R14:✗]
**Severity**: Low
**Location**: UniswapV4Adapter.sol:L442-470

**Description**:
`addLiquidity()` calls `IERC20(token0).forceApprove(positionManager, amount0)` before `_mintPosition()`. After the mint, Uniswap may consume only `actualAmount0 <= amount0`. The unused difference `amount0 - actualAmount0` is refunded to the vault (correct), but the residual ERC-20 allowance of `amount0 - actualAmount0` on the position manager is never cleared. `forceApprove` to 0 is not called post-mint. Each `addLiquidity()` call with a partial fill leaves a growing residual allowance accumulating on `positionManager`.

**Precondition Analysis**:
**Missing Precondition**: The position manager must exploit the residual allowance in a separate call path (e.g., via a reentrancy-like callback or a future upgrade that pulls tokens using stale approvals).
**Precondition Type**: EXTERNAL
**Why This Blocks**: The Uniswap V4 NonfungiblePositionManager is trusted and does not have a known mechanism to exploit stale allowances. The risk is defense-in-depth: residual approvals violate the principle of minimal approval and become a surface if the position manager is ever upgraded or has an undiscovered pull path.

**Impact**: Residual ERC-20 approval left on the trusted position manager after each partial-fill `addLiquidity` call. Under normal Uniswap V4 behavior this is benign. Under a compromised or upgraded position manager, the accumulated residual approval is an additional attack surface for token draining from the adapter.

**Evidence**:
```solidity
// UniswapV4Adapter.sol:L442-449
IERC20(token0).forceApprove(positionManager, amount0);  // full desired amount approved
// ...mint executes, consumes actualAmount0 <= amount0
// UniswapV4Adapter.sol:L464-466
if (actualAmount0 < amount0) {
    IERC20(token0).safeTransfer(msg.sender, amount0 - actualAmount0);
    // Missing: IERC20(token0).forceApprove(positionManager, 0);
}
```

---

## Finding [RS2-4]: PointsProgram.updateDepositBalance() accepts arbitrary newBalance with no on-chain validation against actual vault share holdings — authorized callers can inflate points for any user

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5 | ✓6 | ✗8(N/A) | ✓10 | ✓13
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single user per call), R6:✓, R8:✗(single-step), R10:✓, R11:✗, R13:✓, R14:✗]
**Severity**: Low
**Location**: PointsProgram.sol:L332-356

**Description**:
`updateDepositBalance()` allows the `owner`, any `authorizedCallers[msg.sender]`, or the vault itself (`msg.sender == vault`) to set any user's `depositBalance` to any `uint256` value without cross-checking against the user's actual share balance in the vault. The vault is deployable by any agent author (vault owner), so `msg.sender == vault` is reachable by any vault owner with a registered factory-deployed vault.

A vault owner can call `updateDepositBalance(vault, attacker, type(uint256).max)` directly from the vault contract, which satisfies the `msg.sender == vault` auth check. This inflates the attacker's tracked `depositBalance` to the maximum uint256, causing subsequent `accruePoints()` calls to generate points at `type(uint256).max * elapsed * multiplier / (1e18 * 86400)` per second — astronomical values that overflow `totalPoints[attacker]`.

**R6**: The vault (owner) is FULLY_TRUSTED per the trust model, so this attack requires a vault owner to act maliciously. Severity is kept Low rather than Informational because `authorizedCallers` (set by the PointsProgram owner) represent a semi-trusted vector — a compromised authorized caller (e.g., a backend service with the authorized caller key) could inflate points for arbitrary users without requiring vault owner cooperation.

**R13**: "By design" — the vault is allowed to call `updateDepositBalance`. Impact: any authorized caller can set any user's balance to any value, enabling unbounded points accumulation that drives off-chain airdrop distributions.

**Impact**: A compromised `authorizedCaller` or malicious vault owner can set any user's `depositBalance` to `type(uint256).max`, generating overflow-level points via subsequent `accruePoints()` calls. Points are non-transferable on-chain but drive off-chain token distributions (airdrops). The integrity of the entire points program depends on the honesty of every authorized caller and every vault owner.

**Evidence**:
```solidity
// PointsProgram.sol:L337-356
function updateDepositBalance(address vault, address user, uint256 newBalance)
    external
    onlyDeployedVault(vault)
{
    if (msg.sender != owner && !authorizedCallers[msg.sender] && msg.sender != vault) {
        revert NotAuthorized();
    }
    // newBalance set without checking vault.shares(user) or vault.convertToAssets(...)
    accrualStates[user][vault].depositBalance = newBalance;
    accrualStates[user][vault].lastAccrualTimestamp = _accrualNow();
    emit DepositBalanceUpdated(user, vault, newBalance);
}
```

---

## Finding [RS2-5]: BuilderProgram.getLeaderboard() performs O(N²) insertion sort over ALL registered builders on every call — permissionless registration enables view-function DoS

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5 | ✗6(N/A) | ✗8(N/A)
**Rules Applied**: [R4:✗(evidence clear), R5:✗(view function, no combinatorial cross-entity impact), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗, R14:✗]
**Severity**: Low
**Location**: BuilderProgram.sol:L323-362

**Description**:
`getLeaderboard()` materialises ALL registered builders into memory and sorts them on every call:

```solidity
Builder[] memory all = new Builder[](total);   // O(N) cold SLOADs (~12,600 gas each)
for (uint256 i = 1; i < total; i++) {
    while (j > 0 && all[j-1].totalTvl < key.totalTvl) { ... }  // O(N²) comparisons
}
```

`registerBuilder()` is fully permissionless: any address can register at no cost, and `builderAddresses` grows monotonically with no cap and no pruning. Each `Builder` struct occupies 6+ storage slots. At 1,000 builders, cold SLOAD costs alone exceed 12.6M gas (1000 × 6 × 2100), and the insertion sort adds O(N²) computational cost on top. At a few thousand builders, the function permanently exceeds the 30M block gas limit.

**Impact**: An attacker can grief the leaderboard by registering thousands of builder addresses (gas cost per registration: ~50K–100K gas). Once enough builders are registered, `getLeaderboard()` reverts out-of-gas for all callers permanently. Frontends and analytics tools that depend on `getLeaderboard()` for displaying the builder leaderboard lose this functionality. Since `builderAddresses` can only grow (no removal mechanism), the DoS is permanent once triggered.

**Evidence**:
```solidity
// BuilderProgram.sol:L184-200 — permissionless, no fee, no cap
function registerBuilder(string calldata name, string calldata url) external {
    if (builders[msg.sender].registeredAt != 0) revert AlreadyRegistered();
    // ... push(msg.sender) always
    builderAddresses.push(msg.sender);
}

// BuilderProgram.sol:L336-361 — O(N*slots) SLOADs + O(N²) insertion sort, no limit
Builder[] memory all = new Builder[](total);
for (uint256 i = 0; i < total; i++) {
    all[i] = builders[builderAddresses[i]];    // 6+ SLOADs per builder
}
for (uint256 i = 1; i < total; i++) {
    Builder memory key = all[i];
    uint256 j = i;
    while (j > 0 && all[j - 1].totalTvl < key.totalTvl) {
        all[j] = all[j - 1];
        j--;
    }
    all[j] = key;
}
```

---

## Chain Summary

| Finding ID | Severity | Verdict | Chain Input? | Postcondition Types |
|-----------|----------|---------|-------------|-------------------|
| RS2-1 | Low | CONFIRMED | YES — first vault absorbs full slash loss; remaining vaults over-drain stETH | BALANCE, STATE |
| RS2-2 | Low | CONFIRMED | YES — PT-only vault rewards stranded in adapter permanently | BALANCE |
| RS2-3 | Low | PARTIAL | NO — residual approval only dangerous with compromised position manager | EXTERNAL |
| RS2-4 | Low | CONFIRMED | YES — authorized caller can inflate any user's points | STATE |
| RS2-5 | Low | CONFIRMED | NO — standalone permissionless DoS on view function | STATE |
