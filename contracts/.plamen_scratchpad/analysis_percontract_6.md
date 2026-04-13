# Per-Contract Analysis: Market/Trading Adapters (Agent #6)

**Scope**: PendleAdapter.sol (889 lines), UniswapV4Adapter.sol (702 lines), PolymarketAdapter.sol (206 lines)
**Date**: 2026-04-13

## File Coverage Checkpoint

| File | Lines | Opened? | Functions Analyzed |
|------|-------|---------|-------------------|
| PendleAdapter.sol | 889 | YES | registerVault, setMarketWhitelist, setExpiryBuffer, mintPtYt, redeemPtYt, swapExactPtForToken, swapExactTokenForPt, addLiquidity, removeLiquidity, claimRewards, withdrawToVault, view functions |
| UniswapV4Adapter.sol | 702 | YES | registerVault, setSlippage, setDefaultFee, swap, addLiquidity, removeLiquidity, collectFees, withdrawToVault, _mintPosition, _removePositionFromVault, onERC721Received, view functions |
| PolymarketAdapter.sol | 206 | YES | registerVault, depositUSDC, buyOutcome, sellOutcome, redeemResolved, withdrawToVault, isRegistered |

---

## Exclusion List Check

Known findings covering these contracts (excluded from below): INV-45, INV-46.

---

## Finding [PC6-1]: PendleAdapter claimRewards() permanently strands other vaults accrued LP rewards

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5 | ✗6(no role) | ✗8(N/A)
**Rules Applied**: [R4:✗(evidence clear), R5:✓, R6:✗(no role), R8:✗, R10:✓, R11:✗, R12:✓, R13:✗, R14:✗, R15:✗, R16:✗]
**Severity**: Medium
**Location**: PendleAdapter.sol:L749-L807

**Description**: claimRewards() calls IPendleRouter.redeemDueInterestAndRewards(address(this), [], [], markets) which atomically claims ALL accumulated LP fee rewards for the adapter as the single Pendle LP holder across ALL vaults. The delta (balanceAfter - balancesBefore) captures the full multi-vault epoch reward. Only the calling vault's pro-rata share is forwarded; the remainder stays in the adapter.

When any subsequent vault later calls claimRewards for the same markets, balancesBefore captures the stranded balance, redeemDueInterestAndRewards produces 0 new tokens (Pendle's pending reward counter was already reset by the first claim), so delta = 0 and the subsequent vault receives nothing.

**Impact**: Any vault that is not the first to call claimRewards loses 100% of its LP reward share for that accumulation epoch. In a 50/50 two-vault scenario, the second vault permanently loses its entire share. At typical Pendle LP reward APYs (5-20%), this is a material, irrecoverable loss for depositors compounding over each reward epoch.

**Evidence**:
```
// L778-779: One call claims all vaults' accumulated rewards
IPendleRouter(pendleRouter).redeemDueInterestAndRewards(address(this), emptySys, emptyYts, markets);

// L797-801: Only caller's share distributed; rest stranded
uint256 delta = balanceAfter - balancesBefore[i];   // full epoch reward for all vaults
uint256 vaultShare = (delta * vaultWeight) / totalWeight;  // only caller's fraction
IERC20(rewardTokens[i]).safeTransfer(msg.sender, vaultShare);
// (1 - vaultWeight/totalWeight) * delta is permanently stuck
```

Trace: [TRACE: Vault-B claimRewards after Vault-A → balancesBefore=50, redeemDueInterest=0 new, delta=0, vault-B gets 0, 50 PENDLE stranded]

### Postcondition Analysis
**Postconditions Created**: Accrued PENDLE rewards stranded at adapter; no extraction path for non-first-caller vaults
**Postcondition Types**: BALANCE, STATE
**Who Benefits**: Vault that calls claimRewards first each epoch

---

## Finding [PC6-2]: PendleAdapter claimRewards() never claims YT interest yield — primary YT value proposition broken

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5 | ✗6(no role) | ✗8(N/A)
**Rules Applied**: [R4:✗(evidence clear), R5:✗(adapter is single YT holder), R6:✗(no role), R8:✗, R10:✓, R11:✗, R12:✓, R13:✓, R14:✗, R15:✗, R16:✗]
**Severity**: Medium
**Location**: PendleAdapter.sol:L772-L780

**Description**: In Pendle, YT holders receive two distinct yield streams: (1) YT interest yield — the underlying SY asset yield accrued to YT holders, claimed via redeemDueInterestAndRewards(user, [], [YT_addr], []) passing YT addresses in the yts array; and (2) LP incentive rewards, claimed by passing market addresses in the markets array.

claimRewards() passes emptyYts = new address[](0) and only populates markets. This means only LP incentive rewards (e.g., PENDLE token emissions from providing LP) are ever claimed. The YT interest yield — which is the primary economic rationale for holding YT tokens (e.g., stETH yield if the SY is stETH-SY) — is permanently skipped. There is no alternative code path in the adapter that calls redeemDueInterestAndRewards with populated yts.

The adapter explicitly tracks ytBalance per vault per market (L461, L519, L635 etc.) and holds YT tokens for vaults. Those YTs accrue SY yield internally in the Pendle protocol but that yield is never collected.

**Impact**: All YT interest yield accrued across all vaults' YT positions is permanently stranded in Pendle's internal accounting. Loss = ytBalance × SY_yield_rate × time_held, irrecoverable for the entire lifetime of the position. For stETH-backed markets at ~4% SY yield, this represents the entire yield stream from holding YT.

**Evidence**:
```
// L772-779:
address[] memory emptyYts = new address[](0);  // YT interest permanently skipped
IPendleRouter(pendleRouter).redeemDueInterestAndRewards(
    address(this),
    emptySys,   // Also no SY interest
    emptyYts,   // BUG: should be populated with YT addresses for each market
    markets
);
```

Fix requires: read YT address from IPendleMarket(market).readTokens() for each market and pass in yts array.

### Postcondition Analysis
**Postconditions Created**: YT interest yield permanently stranded in Pendle; loss magnitude proportional to ytBalance x yield_rate x time
**Postcondition Types**: BALANCE
**Who Benefits**: None; yield is locked in Pendle's internal accounting

---

## Finding [PC6-3]: UniswapV4Adapter setSlippage allows BPS_DENOMINATOR (10000) disabling LP mint slippage entirely

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4 | ✗5(no external exploiter path without owner action) | ✗6(owner FULLY_TRUSTED)
**Rules Applied**: [R4:✗(evidence clear), R5:✗(per-vault), R6:✓, R8:✗, R10:✓, R11:✗, R12:✗, R13:✓, R14:✗, R15:✗, R16:✗]
**Severity**: Low
**Location**: UniswapV4Adapter.sol:L333-L340, L680-L681

**Description**: setSlippage enforces (slippageBps > BPS_DENOMINATOR) which allows slippageBps == BPS_DENOMINATOR == 10000 (100% tolerance). _mintPosition computes amount0Min = amount0 - (amount0 * slipBps) / BPS_DENOMINATOR. At slipBps = 10000, both amount0Min and amount1Min resolve to 0, eliminating slippage protection for addLiquidity calls entirely. An MEV bot can then sandwich the addLiquidity transaction, manipulating pool price to cause the vault to provide liquidity at an extreme off-market price.

The swap() function is NOT affected — it has an independent non-zero minAmountOut check at L377.

**Impact**: If vault owner sets slippageBps to 10000 (even accidentally), all subsequent addLiquidity calls have zero minimum token requirements, exposing the vault to full sandwich attacks during LP provisioning. At worst, the entire LP provision can be extracted by an MEV bot in the same block.

**Evidence**:
```
// L336: allows == 10000
if (slippageBps > BPS_DENOMINATOR) revert InvalidSlippageBps(slippageBps);

// L680-681: when slipBps = 10000, both minimums = 0
amount0Min: amount0 - (amount0 * slipBps) / BPS_DENOMINATOR,  // = 0
amount1Min: amount1 - (amount1 * slipBps) / BPS_DENOMINATOR,  // = 0
```

Fix: change to (slippageBps >= BPS_DENOMINATOR) or cap at a maximum like 2000 bps.

---

## Finding [PC6-4]: PendleAdapter addLiquidity does not refund unused SY tokens to vault

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5 | ✗6(no role) | ✗8(N/A)
**Rules Applied**: [R4:✗(evidence clear), R5:✗(per-vault), R6:✗(no role), R8:✗, R10:✓, R11:✗, R12:✗, R13:✗, R14:✗, R15:✗, R16:✗]
**Severity**: Low
**Location**: PendleAdapter.sol:L646-L688

**Description**: addLiquidity pulls the full syAmount of SY tokens from the vault and approves the Pendle Router for that amount. addLiquidityDualSyAndPt may not consume the full syAmount (it uses actual pool ratios). Unused SY tokens remain in the adapter with no refund path.

removeLiquidity DOES forward SY to the vault (L720-724). withdrawToVault only transfers PT, YT, and LP tokens by their tracked balances — not free SY sitting untracked in the adapter. There is no mapping tracking per-vault free SY balances at the adapter, so any stranded SY from partial LP provision is unrecoverable.

Compare: UniswapV4Adapter.addLiquidity (L465-470) explicitly refunds unused token0 and token1 after mint().

**Impact**: Vault permanently loses the unused SY portion from each addLiquidity call when pool ratios cause partial SY consumption. In pool compositions skewed far from the vault's SY:PT ratio, up to 40%+ of provided SY can be stranded per call.

**Evidence**:
```
// L661-686: no refund of unused SY
if (syAmount > 0) {
    IERC20(SY).safeTransferFrom(msg.sender, address(this), syAmount);
    IERC20(SY).forceApprove(pendleRouter, syAmount);
}
uint256 netLpOut = IPendleRouter(pendleRouter).addLiquidityDualSyAndPt(
    address(this), market, syAmount, ptAmount, minLpOut
);
// syAmount not fully consumed if pool ratio differs — unused SY stays in adapter, not tracked
```

---

## Chain Summary

| Finding ID | Severity | Verdict | Chain Input? | Postcondition Types |
|-----------|----------|---------|-------------|-------------------|
| PC6-1 | Medium | CONFIRMED | YES — first-caller reward race; other vaults permanently lose epoch rewards | BALANCE, STATE |
| PC6-2 | Medium | CONFIRMED | NO — direct YT yield loss | BALANCE |
| PC6-3 | Low | CONFIRMED | YES — if combined with vault owner misconfiguration, enables LP sandwich | STATE |
| PC6-4 | Low | CONFIRMED | NO — stranded SY direct loss | BALANCE |
