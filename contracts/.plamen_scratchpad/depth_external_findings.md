# Depth External Analysis: External Dependencies

**Agent**: depth-external
**Domain**: External call side effects, cross-chain timing, MEV, oracle trust
**Phase 4b Iteration 1**

---

## Finding [DEPTH-EX-1]: MorphoAdapter Health Check Uses Nominal Tracked Borrow — Understates True Leverage as Interest Accrues

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5 | ✓6,7
**Rules Applied**: [R4:✓, R5:✗(single-adapter shared position), R6:✗(no semi-trusted role), R8:✓, R10:✓, R11:✗(no external tokens), R14:✗(no independently-settable limits), R15:✗(no flash-loan-accessible state), R16:✓]
**Depth Evidence**: [BOUNDARY:vaultBorrow=nominal+accrued_interest → health check misses accrued debt], [TRACE:borrow() snapshots _vaultBorrowed at t0 → IMorphoOracle.price() called at t1 → uses stale nominal not IMorpho.position() actual shares → health passes when actual LTV > LLTV], [VARIATION:time 0→90days → accrued interest creates silent undercollateralized position]
**Severity**: Medium
**Location**: MorphoAdapter.sol:L712-740, L444 (borrow), L708 (_vaultBorrowed)
**Description**: `_checkVaultHealth()` at L712-740 computes the health metric as:
```solidity
uint256 vaultBorrow = _vaultBorrowed[vault][marketId];
// ...
if (vaultBorrow > maxBorrow) { revert UnhealthyPosition(...); }
```
`_vaultBorrowed` is credited at borrow time (L444: `_vaultBorrowed[msg.sender][marketId] += assets`) with the nominal principal and is only decremented during repay/withdrawToVault. It is never updated to reflect the accrued interest that Morpho Blue continuously accumulates on the outstanding borrow shares. Morpho Blue tracks interest in borrow *shares*, not nominal assets — the actual debt in asset terms grows continuously with the market's interest rate. After T days at rate R, the true debt is `vaultBorrow × (1 + R)^T`, but the health check compares only `vaultBorrow` (the original principal snapshot).

**[BOUNDARY: vaultCollat=10e18 USDC, vaultBorrow=7.5e18 USDC, lltv=0.86, HEALTH_FACTOR_BPS=8000]**: At borrow time, `maxBorrow = 10e18 × 0.86 × 0.80 = 6.88e18`. Since vaultBorrow(7.5e18) > maxBorrow(6.88e18), the health check would actually revert. This confirms the check runs at borrow time. But after the borrow passes, the check is only re-run on subsequent borrow calls. If the position is at the exact health boundary and interest accrues, no further borrow call is made, and the health check never fires again — the position silently drifts past the liquidation threshold.

**[TRACE: vault borrows 6.8e18 against 10e18 collateral → passes health at t0 → 6 months later at 8% APR → actual debt = 6.8e18 × 1.04 = 7.07e18 → maxBorrow still computed as 6.88e18 → actual debt > maxBorrow → health check NEVER fires → Morpho protocol can liquidate the position → collateral gone, withdrawToVault L629 calls withdrawCollateral after clearing _vaultCollateral → Morpho returns 0 because position was liquidated → vault permanently loses collateral]**

**[VARIATION: interest rate 0→20% APR over 1 year → nominal tracked borrow unchanged → actual Morpho debt 20% higher → health check false-passes → protocol-level liquidation risk exists]**

**Impact**: 
1. Morpho protocol can liquidate the vault's collateral position after interest accrual causes actual LTV to exceed LLTV. The adapter's health check will not detect this — it always reads the stale nominal borrow, never the actual share-valued debt.
2. `withdrawToVault()` (L629) calls `withdrawCollateral()` AFTER zeroing `_vaultCollateral` (L630: `_vaultCollateral[msg.sender][marketId] = 0`). If Morpho liquidated the position, `withdrawCollateral` will revert or return 0 but the adapter has already zeroed the tracked collateral — the vault loses collateral permanently with no accounting recovery path.

**Evidence**: MorphoAdapter.sol L718: `uint256 vaultBorrow = _vaultBorrowed[vault][marketId]` — reading nominal, not actual. L444: `_vaultBorrowed[msg.sender][marketId] += assets` — snapshot at borrow time, never updated. Morpho Blue specification: borrow shares grow via interest rate model per block.

**[CROSS-DOMAIN-DEP: token-flow — assumes _vaultBorrowed accurately reflects actual Morpho debt; if interest accrues the token-flow domain's debt accounting is incorrect]**

### Precondition Analysis
**Missing Precondition**: Position must be near health boundary and have had time for interest accrual
**Precondition Type**: TIMING + EXTERNAL
**Why This Blocks**: A freshly borrowed position far from the health boundary is safe; the finding only manifests after sustained interest accrual

### Postcondition Analysis
**Postconditions Created**: Silent undercollateralized Morpho position, potential liquidation by external actors
**Postcondition Types**: EXTERNAL, STATE, BALANCE
**Who Benefits**: External Morpho liquidators can seize vault collateral at a discount

---

## Finding [DEPTH-EX-2]: MorphoAdapter Emergency Exit Blocked When Vault Lacks Loan Tokens — safeTransferFrom Pulls FROM Vault

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5,6,7
**Rules Applied**: [R4:✓, R5:✗(per-vault), R6:✗(no semi-trusted role), R8:✓, R10:✓, R11:✗(no unsolicited tokens), R14:✗, R15:✗, R16:✗]
**Depth Evidence**: [TRACE:withdrawToVault() → vaultBorrow>0 branch → IERC20.safeTransferFrom(vault,adapter,vaultBorrow) → reverts if vault.balanceOf(loanToken)<vaultBorrow → full loop halts, no collateral withdrawn, _vaultMarketIds not cleared], [BOUNDARY:vaultBorrow=1e18, vault.balanceOf(loanToken)=0 → transferFrom reverts → emergency exit completely blocked], [VARIATION:vault asset != loanToken → vault holds only strategy output, not loanToken → safeTransferFrom fails unconditionally]
**Severity**: Medium
**Location**: MorphoAdapter.sol:L599-644, L619-624
**Description**: `withdrawToVault()` is the emergency exit path that is supposed to unwind all of a vault's Morpho positions. The relevant code at L617-624:
```solidity
if (vaultBorrow > 0) {
    // Pull the loan token from the vault to repay its debt
    IERC20(params.loanToken).safeTransferFrom(
        msg.sender, address(this), vaultBorrow
    );
    // ...
    IMorpho(morpho).repay(params, vaultBorrow, 0, address(this), "");
    _vaultBorrowed[msg.sender][marketId] = 0;
}
```
The function requires the calling vault to hold sufficient loan tokens to repay outstanding debt. In a typical lending strategy, the agent borrows loan tokens and deploys them elsewhere (e.g., buys PT on Pendle, supplies to another Aave market). At the time of emergency exit, the vault may not hold the borrowed loan tokens — it holds whatever the deployed strategy produced.

**[TRACE: vault executes borrow strategy → borrows 100 USDC from Morpho, deploys in Pendle → emergency triggered → agent calls withdrawToVault → vaultBorrow=100e6 → safeTransferFrom(vault, adapter, 100e6) → vault has 0 USDC (all in Pendle) → revert → emergency exit completely blocked → vault cannot recover its Morpho collateral → collateral permanently inaccessible until vault manually obtains 100 USDC]**

**[BOUNDARY: vaultBorrow=1 wei, vault.balanceOf(loanToken)=0 → even 1 wei of borrow blocks the entire emergency exit → NO collateral is recovered]**

**[VARIATION: loanToken=USDC(1e6), collateralToken=WBTC(1e8) → vault asset=USDC but all USDC borrowed and deployed externally → same block → total DOS on emergency exit]**

The loop iterates through ALL markets. If the repayment fails for the FIRST market, the ENTIRE function reverts — no subsequent markets are processed, and `_vaultMarketIds` is NOT cleared (it's only cleared at the end via `delete _vaultMarketIds[msg.sender]` at L643). The vault is stuck.

**Impact**: When a vault has an active Morpho borrow position and lacks the loan token balance, the emergency exit is completely blocked. The vault's collateral (which may be a different, higher-value asset) is inaccessible. In market stress scenarios where emergency exit is most needed, the vault is least likely to hold the borrowed token — creating a dangerous anti-correlation between emergency need and exit availability.

**Evidence**: MorphoAdapter.sol L619-624: `safeTransferFrom(msg.sender, address(this), vaultBorrow)` — requires vault to hold loan tokens. L643: `delete _vaultMarketIds[msg.sender]` — only reached if no repayment reverts.

**[CROSS-DOMAIN-DEP: token-flow — this finding is contingent on the vault not holding loan tokens; the token-flow domain covers whether agent strategies always maintain a reserve]**

### Postcondition Analysis
**Postconditions Created**: Blocked emergency exit, inaccessible collateral
**Postcondition Types**: STATE, BALANCE, EXTERNAL
**Who Benefits**: No one — this is a pure loss condition. Vault depositors lose access to collateral.

---

## Finding [DEPTH-EX-3]: UniswapV4Adapter Emergency withdrawToVault Uses Zero-Slippage — Full MEV Sandwich on Emergency Exit

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5,6,7
**Rules Applied**: [R4:✓, R5:✗(per-vault positions), R6:✗, R8:✗(single step), R10:✓, R11:✗, R14:✗, R15:✗, R16:✗]
**Depth Evidence**: [TRACE:withdrawToVault → decreaseLiquidity(amount0Min=0,amount1Min=0) → collect → entire liquidity removable for 0 output → sandwich: frontrun removes price impact, emergencyExit gets 0 tokens, backrun profits], [BOUNDARY:amount0Min=0,amount1Min=0 → accept any amount including 0 → 100% slippage permitted], [VARIATION:position size 1e6→1e18 → sandwich profit scales linearly with position size]
**Severity**: Medium
**Location**: UniswapV4Adapter.sol:L563-606, L579-587
**Description**: The emergency `withdrawToVault()` function removes all liquidity with explicit zero slippage protection:
```solidity
INonfungiblePositionManager(positionManager).decreaseLiquidity(
    INonfungiblePositionManager.DecreaseLiquidityParams({
        tokenId: positionId,
        liquidity: liquidity,
        amount0Min: 0, // Emergency — accept any amount
        amount1Min: 0,
        deadline: block.timestamp
    })
);
```
The comment "Emergency — accept any amount" acknowledges this intentional choice. However, in pool conditions where liquidity removal is significant relative to pool depth, this opens a sandwich attack vector.

**[TRACE: vault has 1M USDC / 500 ETH liquidity in Uniswap V4 → emergency triggered → agent calls withdrawToVault → block inclusion: (1) attacker frontrun: swaps large USDC→ETH, moves price far from current tick, (2) vault's decreaseLiquidity at bottom tick: receives mostly USDC (out of range), attacker's large swap already removed most ETH from the range, (3) attacker backrun: swaps ETH→USDC at favorable price → vault receives significantly fewer ETH tokens than fair value, attacker extracts the difference]**

**[BOUNDARY: liquidity=type(uint128).max, pool depth=low → price moves to extreme tick during emergency removal → vault receives 0 of one token → 100% loss on one token side]**

**[VARIATION: sqrtPriceLimitX96=0 in any Uniswap V4 exactInputSingle (L396) → combined with zero slippage on remove → full sandwich: manipulate price → remove at bad price → recover price → complete one-sided extraction]**

While a `deadline: block.timestamp` check prevents stale transactions, it does NOT prevent same-block sandwiching. The attacker's frontrun, the vault's emergency exit, and the attacker's backrun can all execute in the same block.

**Quantification**: For a $1M position in a shallow pool, a sandwich attack extracting 5-10% of value = $50,000-$100,000 attacker profit at vault expense.

**Impact**: Emergency exit in market stress scenarios (when emergency exits are most common) results in significant capital loss to MEV extraction. The emergency exit is supposed to be a loss-minimizing safety valve — the zero-slippage design turns it into a guaranteed MEV opportunity.

**Evidence**: UniswapV4Adapter.sol L580-586: `amount0Min: 0, amount1Min: 0` — explicit zero slippage. L585: `deadline: block.timestamp` — same-block acceptable.

**[CROSS-DOMAIN-DEP: state-trace — assumes pool has sufficient depth to absorb emergency removals; depth analysis is outside external domain]**

### Postcondition Analysis
**Postconditions Created**: Degraded recovery value on emergency exit, predictable MEV opportunity for sophisticated actors
**Postcondition Types**: BALANCE, EXTERNAL
**Who Benefits**: MEV bots and sophisticated arbitrageurs who observe emergency exit transactions in the mempool

---

## Finding [DEPTH-EX-4]: PendleAdapter claimRewards() Reward Capture Strands Other Vaults — First Caller Takes All Epochs' Accrued Rewards

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5,6,7
**Rules Applied**: [R4:✓, R5:✓, R6:✗(no role), R8:✓, R10:✓, R11:✗, R14:✗, R15:✗, R16:✗]
**Depth Evidence**: [TRACE:Pendle.redeemDueInterestAndRewards(adapter) → claims ALL pending rewards for ALL vaults' positions atomically → balanceDelta computed → first-calling vault captures entire delta → other vaults get 0 delta in subsequent calls], [BOUNDARY:N vaults all with equal weight → vault 1 calls claimRewards first → delta=X total rewards → vault1Share=X×(vaultWeight/totalWeight) → remaining X×(1-vaultWeight/totalWeight) stranded → vault 2 calls → balanceBefore=balanceAfter (already claimed) → delta=0 → vault2 gets 0], [VARIATION:vaultWeight vault1=1 vs totalWeight=2 → vault1 gets delta/2 → remaining delta/2 stranded permanently]
**Severity**: Medium
**Location**: PendleAdapter.sol:L749-807, L778-779
**Description**: Pendle's `redeemDueInterestAndRewards()` is a stateful call that sweeps ALL accrued rewards for a user (the adapter in this case) and resets the internal accrual counter. The adapter calls this once with ALL `markets` but then computes per-vault shares using the *snapshot balance delta* from that single call. However, the weight-based share allocation is computed ONLY for the calling vault against total positions. This creates a fundamental atomicity mismatch:

1. Vault A calls `claimRewards([market1, market2], [PENDLE])` 
2. Pendle atomically resets reward accumulation for the adapter across all markets
3. Balance delta = all rewards accrued across all vaults since last claim
4. Vault A's share = `(vaultA_ytBalance + vaultA_lpBalance) / totalWeight` × delta
5. Remaining `(1 - vaultA_weight/totalWeight)` × delta stays in the adapter

**[TRACE: Vault B calls claimRewards after vault A → balanceBefore = balanceAfter (rewards already swept by vault A's call) → delta=0 → vaultBShare=0 → Vault B permanently receives 0 PENDLE rewards → loss is proportional to totalWeight - vaultAWeight]**

**[BOUNDARY: totalWeight=100, vault A weight=1 → vault A claims → captures 1% of rewards as vaultShare → remaining 99% of rewards stranded in adapter → no function to recover stranded rewards]**

The stranded rewards remain in the adapter with no mechanism to redistribute or sweep them. The next time ANY vault claims from the SAME markets, a fresh Pendle reward accumulation cycle begins. The stranded rewards from the previous cycle are effectively burnt (they were credited to the adapter's PENDLE balance but never forwarded to any vault).

**Impact**: Vaults that do not call `claimRewards` first in any reward epoch permanently lose their reward share. The first vault to call captures a full delta (which includes other vaults' accrued rewards), and subsequent callers within the same epoch receive nothing. Accumulated PENDLE/reward tokens are permanently stranded in the adapter. For a protocol with millions in LP, this could represent thousands of dollars of rewards per epoch.

**Evidence**: PendleAdapter.sol L778: `IPendleRouter(pendleRouter).redeemDueInterestAndRewards(address(this), emptySys, emptyYts, markets)` — sweeps all. L796: `uint256 delta = balanceAfter - balancesBefore[i]` — delta only meaningful for first caller of each epoch.

**[CROSS-DOMAIN-DEP: token-flow — reward tokens that accumulate in the adapter post-stranding have no exit path (token-flow domain issue), compounding this finding's impact]**

### Postcondition Analysis
**Postconditions Created**: Stranded reward tokens in adapter, unfair reward distribution favoring first-caller
**Postcondition Types**: BALANCE, STATE
**Who Benefits**: The first vault to call claimRewards in any epoch captures disproportionate rewards relative to their pro-rata share

---

## Finding [DEPTH-EX-5]: PendleAdapter Never Claims YT Interest Yield — Empty YTs Array Hardcoded

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5,6,7
**Rules Applied**: [R4:✓, R5:✗(all vaults affected equally), R6:✗, R8:✗(single call), R10:✓, R11:✗, R14:✗, R15:✗, R16:✗]
**Depth Evidence**: [TRACE:claimRewards → emptyYts=new address[](0) → redeemDueInterestAndRewards(adapter,emptySys,emptyYts,markets) → YT interest never redeemed → YT holders receive 0 interest yield perpetually], [BOUNDARY:ytBalance=1e18, yieldAccrued=5% APY → after 1 year, 5% yield stranded on YT → YT interest yield unrecoverable without direct call to Pendle with YT addresses], [VARIATION:market with 20% YT yield rate → ytBalance=100e18 → 20 yield tokens per year permanently stranded]
**Severity**: Medium
**Location**: PendleAdapter.sol:L772-780
**Description**: The `claimRewards` function hardcodes empty arrays for both `sys` (Standardized Yield tokens) and `yts` (Yield Tokens):

```solidity
// Build empty arrays for SYs and YTs (claim only from markets)
address[] memory emptySys = new address[](0);
address[] memory emptyYts = new address[](0);

// Claim rewards. Pendle requires the `user` argument to match
// the holder of the YT/LP positions, which is this adapter.
IPendleRouter(pendleRouter).redeemDueInterestAndRewards(
    address(this), emptySys, emptyYts, markets
);
```

Pendle's `redeemDueInterestAndRewards` function handles THREE types of interest/rewards:
1. **SY accrual**: Interest accrued on SY tokens held
2. **YT interest**: The "yield" component that YT tokens represent — the protocol's core value proposition
3. **LP rewards**: PENDLE token rewards from liquidity provision (the ONLY type currently claimed)

YT tokens represent the RIGHT to receive yield from the underlying asset (e.g., stETH yield, aUSDC yield) between purchase and maturity. This yield is claimed via the `yts` array in `redeemDueInterestAndRewards`. By passing an empty `yts` array, the adapter **never claims YT interest yield for any vault**.

**[TRACE: vault holds 100e18 YT-stETH → Lido generates staking yield → Pendle protocol accrues this yield to YT holders → PendleAdapter calls claimRewards with emptyYts → YT interest not redeemed → yield accumulates in Pendle's internal accounting → after market expiry, YT tokens worth 0 (yield not collected pre-maturity) → vault loses entire YT yield component]**

**[BOUNDARY: YT purchase price reflects expected yield discounted to maturity → if yield is never claimed → vault paid full price for the YT but never received any of the yield it represented → entire YT investment return = 0]**

**[VARIATION: YT yield rate 0→30% → adapter captures 0% regardless → vault expected return on YT component is always 0]**

The YT interest is NOT recoverable post-maturity — Pendle's design requires YT interest to be claimed before or at expiry. After expiry, unclaimed YT interest is irrecoverable.

**Impact**: Vaults using YT positions in PendleAdapter permanently forfeit all YT interest yield. This is the PRIMARY economic purpose of holding YT tokens — the protocol pays a premium for YTs specifically to capture yield. The adapter's design effectively wastes 100% of the YT yield component of any YT-inclusive strategy.

**Evidence**: PendleAdapter.sol L772-779: `emptyYts = new address[](0)` hardcoded. Pendle protocol documentation: `redeemDueInterestAndRewards(user, sys, yts, markets)` — each parameter serves a distinct redemption purpose. YT interest is separate from LP rewards.

### Postcondition Analysis
**Postconditions Created**: All YT interest yield permanently unclaimable via adapter, accumulated as stale state in Pendle protocol
**Postcondition Types**: BALANCE, EXTERNAL
**Who Benefits**: No one (yield dissipates into Pendle's unclaimed pool)

---

## Finding [DEPTH-EX-6]: Cross-Chain Bond Timing Gap — slashExpired Without markSlashPending Allows Bond Reclaim Before Relayer Acts

**Verdict**: CONFIRMED  
**Step Execution**: ✓1,2,3,4,5,6,7
**Rules Applied**: [R4:✓, R5:✗(single operator), R6:✓, R8:✓, R10:✓, R11:✗, R14:✗, R15:✗, R16:✗]
**Depth Evidence**: [TRACE:slashExpired() emits ExecutionSlashed → relayer offline for 90d → reclaimExpiredBond() checks slashPending[op][vault][nonce]=false → passes → operator reclaims full bond], [BOUNDARY:BOND_EXPIRY=90 days, RELAYER_ROTATION_DELAY=1 hour → if relayer goes offline permanently after slashExpired, operator can reclaim after 90 days with no slash penalty], [VARIATION:relayer offline 0→90days → if relayer comes back within 90d, can still markSlashPending → if absent >90d, operator wins]
**Severity**: Medium
**Location**: WSTONBondManager.sol:L487-514, OptimisticKernelVault.sol:L293-307
**Description**: The H-02 fix introduced `slashPending[operator][vault][nonce]` to prevent operators from racing the relayer by calling `reclaimExpiredBond()` before the slash lands on L1. However, the protection only works if `markSlashPending()` is called BEFORE the 90-day BOND_EXPIRY window closes. The execution flow is:

1. On HyperEVM: `slashExpired()` emits `ExecutionSlashed` event (L306: `emit ExecutionSlashed(executionNonce, msg.sender, bondAmount)`)
2. Relayer must observe this event and call `markSlashPending()` on L1 **within 90 days**
3. After 90 days, `reclaimExpiredBond()` checks `slashPending[msg.sender][vault][nonce]` — if false, reclaim proceeds

**[TRACE: operator submits executeOptimistic → does NOT submit proof within challengeWindow → anyone calls slashExpired on HyperEVM → ExecutionSlashed emitted → relayer goes offline (no `markSlashPending` called on L1) → bond.lockedAt + 90 days passes → operator calls reclaimExpiredBond → `slashPending[op][vault][nonce]=false` (never set) → bond status==Locked (not slashed) → reclaim succeeds → operator gets full bond back despite being slashed on HyperEVM → depositors get nothing → cross-chain slash completely ineffective against offline relayer]**

**[BOUNDARY: BOND_EXPIRY=90 days. If relayer offline for 90d + 1 second, operator can reclaim. This is a significant operational window.]**

**[VARIATION: relayer key compromised → attacker controls when `markSlashPending` is called → can selectively avoid marking legitimate slashes to allow bond recovery]**

The `slashBondByRelayer()` function (L392) properly slashes ONLY Locked bonds. But if `markSlashPending` was never called and BOND_EXPIRY passes, `reclaimExpiredBond` transitions the bond from Locked→Released, making the subsequent relayer call to `slashBondByRelayer` fail with `InvalidBondStatus` (bond is now Released, not Locked).

**Impact**: An operator who successfully drains a vault (via malicious optimistic execution) can recover their full bond after 90 days if the relayer is offline or compromised. The economic penalty (slashing) that is supposed to deter malicious operators becomes fully recoverable if the relayer fails. This undermines the entire security model of optimistic execution.

**Evidence**: WSTONBondManager.sol L497: `if (slashPending[msg.sender][vault][nonce]) { revert UnresolvedSlashPending(); }` — check bypassed if markSlashPending never called. L55: `BOND_EXPIRY = 90 days` — the window. L376: `markSlashPending()` — only called by relayer or owner, both single points of failure.

**[CROSS-DOMAIN-DEP: state-trace — assumes relayer liveness is guaranteed; the state-trace domain should verify the relayer rotation mechanism provides sufficient availability guarantees]**

### Precondition Analysis
**Missing Precondition**: Relayer must be offline or fail to call `markSlashPending` within 90 days
**Precondition Type**: EXTERNAL (relayer liveness)
**Why This Blocks**: Active relayer would call `markSlashPending` promptly upon observing ExecutionSlashed

### Postcondition Analysis
**Postconditions Created**: Bond recovered by malicious operator, depositors receive 0 slash distribution
**Postcondition Types**: BALANCE, EXTERNAL, TIMING
**Who Benefits**: Malicious operator who exploited vault and then outlasted the relayer

---

## Finding [DEPTH-EX-7]: IRiscZeroVerifier Trust Root Is Unverified On-Chain — CVE-2025-52484 Applicability Cannot Be Assessed

**Verdict**: CONTESTED
**Step Execution**: ✓1,2,3 | ?4,5 (production verification impossible without deployed address)
**Rules Applied**: [R4:✓, R5:✗(global verifier), R6:✗, R8:✗, R10:✓, R11:✗, R14:✗, R15:✗, R16:✗]
**Depth Evidence**: [TRACE:KernelExecutionVerifier.verifyAndParseWithImageId → verifier.verify(seal,imageId,journalDigest) → IRiscZeroVerifier (address unknown) → if CVE-2025-52484 unpatched → proof forgery possible], [BOUNDARY:verifier=unpatched_v2.0.0 → any arbitrary seal passes verify() → entire protocol trust model broken → execute() with forged proof → drain vault], [VARIATION:verifier=patched_v2.1.0+ → CVE not applicable → safe]
**Severity**: High (if unpatched) / Informational (if patched)
**Location**: KernelExecutionVerifier.sol:L554-581, external_production_behavior.md
**Description**: The RISC Zero verifier is the cryptographic trust root of the entire Tokagent protocol. All vault execution (`execute()` and `executeOptimistic()`) depends on `verifier.verify(seal, imageId, journalDigest)` returning without reverting. If the deployed verifier address corresponds to a version vulnerable to CVE-2025-52484, an attacker can forge any proof and execute arbitrary actions from any vault.

**CVE-2025-52484**: Underconstrained `remu` (remainder) and `divu` (division) operations in risc0-zkvm versions 2.0.0–2.0.2. Attackers can construct a seal (proof) that passes Groth16 verification for any `(imageId, journalDigest)` pair, effectively forging proofs. The vulnerability was patched in risc0-zkvm 2.1.0.

**[TRACE: attacker constructs forged seal → calls vault.execute(forged_journal, forged_seal, malicious_agentOutput) → KernelExecutionVerifier.verifyAndParseWithImageId → verifier.verify(forged_seal, trustedImageId, sha256(forged_journal)) → CVE-2025-52484 allows this to pass → malicious actions dispatched → drain vault to attacker address]**

The codebase has the C-03 rotation mechanism (48-hour timelock for verifier rotation) and acknowledges the CVE in `external_production_behavior.md`:
> "Known CVEs: CVE-2025-52484 (underconstrained remu/divu in risc0-zkvm 2.0.0-2.0.2). Codebase has C-03 fix: verifier rotation with allowlist + 48h timelock."

However, `external_production_behavior.md` also states: **"UNVERIFIED — no specific deployed verifier address found in MEMORY.md or CLAUDE.md. Must verify on-chain which verifier contract the KernelExecutionVerifier proxy points to."**

**[BOUNDARY: deployed verifier = unpatched (hypothetical) → single proof forgery → full vault drain → severity=Critical. Deployed verifier = patched → CVE not applicable → severity=Informational]**

This finding is CONTESTED because the actual deployed verifier address is unknown. The C-03 mechanism exists to rotate to a patched verifier — whether it has been used is unverifiable from source code alone. The risk is HIGH if unpatched and irrelevant if patched.

**Devil's Advocate**: The development team is aware of the CVE (referenced in code). MEMORY.md documents ongoing mainnet deployments with the current vault system. It is plausible they deployed a patched verifier. However, without on-chain verification, the adversarial assumption (Rule 4) applies.

**Impact**: If the deployed RISC Zero verifier is vulnerable to CVE-2025-52484, any attacker can forge proofs for any imageId and drain any vault without constraints. This would be a Critical vulnerability affecting all vaults across the entire protocol.

**Evidence**: KernelExecutionVerifier.sol L578: `verifier.verify(seal, expectedImageId, journalDigest)` — trust boundary. `external_production_behavior.md` L79: "UNVERIFIED — no specific deployed verifier address found." C-03 mechanism provides rotation path but does not guarantee patched verifier was deployed.

**Recommendation**: Verify on-chain that the deployed IRiscZeroVerifier at the address currently stored in `KernelExecutionVerifier.verifier` is risc0-zkvm 2.1.0+ (post-CVE-2025-52484 patch).

---

## Finding [DEPTH-EX-8]: HyperliquidAdapter CoreWriter Non-Atomicity Creates Accounting Desync — EVM Marks Order Submitted But HyperCore Silently Drops

**Verdict**: CONFIRMED (design limitation with inadequate operational safeguards)
**Step Execution**: ✓1,2,3,4,5 | ✗6,7(no on-chain mechanism to verify)
**Rules Applied**: [R4:✓, R5:✗(per-vault), R6:✗, R8:✓, R10:✓, R11:✗, R14:✗, R15:✗, R16:✗]
**Depth Evidence**: [TRACE:executeOpen → ICoreWriter.sendRawAction(data) → emits OrderSubmitted+OrderIntentSubmitted → HyperCore silently drops (price band, insufficient gas, 0 margin) → EVM state believes position open → strategyActive=true → vault locks deposits → position never exists], [BOUNDARY:HYPE_balance=0 on HyperCore → all CoreWriter actions silently rejected → vault stuck in strategyActive=true → deposits locked indefinitely], [VARIATION:order at mark_price±10% → accepted. order at mark_price±15% → silently dropped → no EVM indication of rejection]
**Severity**: Medium
**Location**: TradingSubAccount.sol:L229, HyperliquidAdapter.sol:L218-221, KernelVault.sol:L1427-1433
**Description**: The CoreWriter system contract (`0x3333...3333`) does NOT revert on HyperCore-level rejection. When `executeOpen()` submits an order via `ICoreWriter(CORE_WRITER).sendRawAction(data)`, the Solidity call succeeds (no revert) regardless of whether HyperCore accepted or dropped the order. The vault then proceeds to activate the strategy (KernelVault.sol L1427-1433):

```solidity
// Snapshot PPS if balance decreased and no strategy is active yet
if (!strategyActive && balanceAfter < balanceBefore) {
    snapshotTotalAssets = balanceBefore;
    snapshotTotalShares = totalShares;
    strategyActive = true;
    strategyActivatedAt = block.timestamp;
    emit StrategyActivated(balanceBefore, totalShares);
}
```

After the USDC is transferred to the sub-account (strategy is "active"), if HyperCore drops the order for any of the documented reasons (price outside band, insufficient HYPE gas, margin not yet settled due to async CoreDepositWallet), the vault's `strategyActive=true` flag is set but no actual HyperCore position exists.

**[TRACE: vault has 10K USDC → agent submits openPosition(isBuy=true, 10000e6, 100, mark_price) → USDC transferred to sub-account → depositMargin(10000e6) → balanceAfter < balanceBefore → strategyActive=true → HYPE balance on HyperCore=0 → CoreWriter.sendRawAction for the order call silently rejected → position never opened → vault stuck: strategyActive=true blocks deposits, but agent sees no position, next proof tries to close what doesn't exist → emergencySettle callable at strategyActivatedAt+7d but agent loop breaks]**

**[BOUNDARY: USDC transferred to sub-account (EVM state updated) + HyperCore position = 0 → withdrawToVault() recovers the USDC from sub-account (L311: IERC20(usdc).balanceOf) → but strategyActive flag remains → vault needs manual settle() call]**

The `OrderIntentSubmitted` event (L218) was introduced specifically as an off-chain reconciliation hook ("consumers should pair this with the HyperCore fill stream to detect silent rejections"). This off-chain mechanism is the ONLY way to detect the desync — there is no on-chain detection or self-healing path. The vault relies entirely on the operator monitoring this event.

**[VARIATION: HYPE gas exhausted after 10 orders → order 11+ all silently dropped → EVM believes strategy active → HyperCore position unchanged → accounting desync grows with each failed order]**

**Impact**: 
1. **Deposit lockout**: Vault deposits are blocked while `strategyActive=true`, even if no actual HyperCore position exists. Depositors cannot enter even when the agent is effectively idle.
2. **Accounting desync**: The vault's `snapshotTotalAssets` captures the state before USDC transfer to sub-account. If the position was never opened, the "strategy" is a phantom — assets are in the sub-account but the vault snapshot doesn't reflect this correctly for the emergency settlement path.
3. **Agent disruption**: The agent's next execution cycle sees a vault that believes it has an active strategy but HyperCore shows no position — the agent's decision logic may error.

**Evidence**: TradingSubAccount.sol L229: `ICoreWriter(CORE_WRITER).sendRawAction(data)` — no revert on HyperCore failure. HyperliquidAdapter.sol L217-221: `emit OrderIntentSubmitted(...)` — acknowledges async reconciliation needed. MEMORY.md: multiple documented silent rejection scenarios (HYPE gas, price band, async margin settlement).

**[CROSS-DOMAIN-DEP: state-trace — strategyActive flag lifecycle is a state-trace domain concern; the interaction between CoreWriter non-atomicity and strategyActive creates a cross-domain issue]**

### Postcondition Analysis
**Postconditions Created**: strategyActive=true with no corresponding HyperCore position, deposit lockout, off-chain reconciliation dependency
**Postcondition Types**: STATE, EXTERNAL, TIMING
**Who Benefits**: No one directly — this is an operational liveness issue. Indirectly, MEV bots could exploit the deposit lockout by delaying settlement.

---

## Finding [DEPTH-EX-9]: Shared maxOracleAge Parameter Conflates Bond Attestation and Price Oracle Freshness Requirements

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5,6,7
**Rules Applied**: [R4:✓, R5:✗(per-vault), R6:✓, R8:✓, R10:✓, R11:✗, R14:✓, R15:✗, R16:✓]
**Depth Evidence**: [TRACE:maxOracleAge applies to BOTH OracleVerifier.requireValidOracleSignatureBound (Role A price) AND OracleVerifier.requireValidBondAttestation (Role B bond) → single parameter controls two independent security requirements], [BOUNDARY:maxOracleAge=24h → price oracle signature can be 23h59m old (acceptable for bond risk but stale for price decisions) → OR maxOracleAge=5min → bond attestation must be re-signed every 5min (operational burden) → no way to set appropriate values for both simultaneously], [VARIATION:maxOracleAge=0 → OA-7 refuted this, but maxOracleAge=86400 → 24h stale price oracle signature creates wide MEV window for optimistic execution with stale price data]
**Severity**: Medium
**Location**: OptimisticKernelVault.sol:L206-251, KernelVault.sol:L232
**Description**: `maxOracleAge` (KernelVault.sol L232) is a single parameter consumed by BOTH verification paths in `_verifyOptimisticOracleAndBond()`:

1. **Role A (price oracle)**: `OracleVerifier.requireValidOracleSignatureBound(..., maxOracleAge)` at L207-217 — controls how stale the price attestation can be
2. **Role B (bond attestation)**: `OracleVerifier.requireValidBondAttestation(..., maxOracleAge)` at L241-251 — controls how stale the bond lock proof can be

These two requirements have fundamentally different optimal values:
- **Price oracle freshness**: Should be minutes (5-60 minutes). Stale prices enable the agent to act on outdated market data, potentially front-running large moves.
- **Bond attestation freshness**: Can be hours or days. Bond locks are on-chain transactions with cryptographic finality — once the bond is locked on L1, the attestation timestamp is valid until the bond is released/slashed. Re-signing frequently (due to tight `maxOracleAge`) creates unnecessary operational burden.

**[BOUNDARY: operator sets maxOracleAge=24h to reduce bond re-signing overhead → price oracle signatures can be 24 hours stale → agent executes based on yesterday's BTC price → if price moved 10-20%, positions are sized incorrectly → agent acts on stale data with vault funds]**

**[BOUNDARY: operator sets maxOracleAge=5min to ensure fresh prices → bond attestation must be refreshed every 5 minutes → if oracle service has 6-minute downtime → executeOptimistic() reverts → liveness impaired]**

**[VARIATION: maxOracleAge=3600 (1h) → price oracle can be 59m stale → during volatile markets, 59m of price drift enables MEV extraction based on price divergence between oracle timestamp and current state → this is specifically the timing window for stale-oracle MEV described in the breadth findings]**

**[TRACE: operator sets maxOracleAge=14400 (4h) for operational convenience → adversarial oracle signer (Role A, SEMI_TRUSTED) holds back signature for 4h during known volatility → submits with maxOracleAge-1 second old signature → execution based on pre-volatility price → price has moved 5-10% → agent opens wrong-sized position → PPS impact to depositors]**

The C-02 fix correctly separated the signing KEYS (Role A vs Role B), but the staleness PARAMETER remains unified. The role separation is architectural — even with separate keys, a compromised Role A with stale maxOracleAge can still execute against stale price data.

**Impact**: Vault operators cannot set appropriate staleness bounds for both functions simultaneously. Setting maxOracleAge tightly (for price safety) creates operational fragility. Setting it loosely (for bond attestation convenience) allows stale price-oracle exploitation. Either extreme compromises security or operations.

**Evidence**: KernelVault.sol L232: `uint64 public maxOracleAge` — single state variable. OptimisticKernelVault.sol L207-217 (Role A check): `maxOracleAge` consumed. L241-251 (Role B check): same `maxOracleAge` consumed. Both checks at lines 206-260.

---

## Finding [DEPTH-EX-10]: PendleAdapter addLiquidity Strands Residual SY Tokens — No Refund Path for Partial Pool Consumption

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5
**Rules Applied**: [R4:✓, R5:✗(per-vault), R6:✗, R8:✗(single call), R10:✓, R11:✗, R14:✗, R15:✗, R16:✗]
**Depth Evidence**: [TRACE:addLiquidity(syAmount=1000, ptAmount=500) → safeTransferFrom(vault,adapter,1000 SY) → addLiquidityDualSyAndPt → partial fill (700 SY used, 300 SY stranded at adapter) → no refund of residual SY], [BOUNDARY:ptAmount=0, syAmount=X → all SY transferred to adapter → if pool requires PT:SY ratio → all SY potentially stranded], [VARIATION:market near maturity → SY:PT ratio heavily skewed → large SY residual after partial fill → significant value stranded]
**Severity**: Low (elevating from INV-69 for completeness)
**Location**: PendleAdapter.sol:L646-688
**Description**: `addLiquidity()` transfers `syAmount` of SY tokens from the vault to the adapter before calling the Pendle router. The router consumes only the amounts needed to meet the current pool's internal ratio between PT and SY. Any unused SY remains in the adapter with no refund mechanism:

```solidity
if (syAmount > 0) {
    IERC20(SY).safeTransferFrom(msg.sender, address(this), syAmount);
    IERC20(SY).forceApprove(pendleRouter, syAmount);
}
// ...
uint256 netLpOut = IPendleRouter(pendleRouter).addLiquidityDualSyAndPt(
    address(this), market, syAmount, ptAmount, minLpOut
);

// Update balances
if (ptAmount > 0) {
    pos.ptBalance -= ptAmount;
    totalPositions[market].ptBalance -= ptAmount;
}
pos.lpBalance += netLpOut;
totalPositions[market].lpBalance += netLpOut;
// ← NO SY refund, NO SY balance tracking
```

**[TRACE: addLiquidity(market, syAmount=100e18, ptAmount=50e18, minLpOut) → IERC20(SY).safeTransferFrom(vault, adapter, 100e18) → Pendle uses 70e18 SY + 50e18 PT → 30e18 SY remains at adapter → no tracking update → no safeTransfer(vault, SY, 30e18) → 30e18 SY permanently stranded at adapter]**

**[BOUNDARY: pool skewed entirely toward SY → ptAmount=0 in call → syAmount fully transferred → Pendle uses near-zero SY → almost entire syAmount stranded]**

Unlike `UniswapV4Adapter.addLiquidity()` which explicitly refunds unused tokens (L465-469: `if (actualAmount0 < amount0) { IERC20(token0).safeTransfer(msg.sender, ...) }`), PendleAdapter has no equivalent refund logic.

**Impact**: SY tokens passed to `addLiquidity()` that are not consumed by the Pendle pool remain permanently stranded at the adapter with no recovery path. Over time, significant SY balances can accumulate. The vault agent has no way to account for or retrieve these tokens.

**Evidence**: PendleAdapter.sol L662-663: SY transferred and approved. L675-686: LP balance updated but no SY residual handling. Compare with UniswapV4Adapter.sol L465-469 which correctly refunds unused tokens.

---

## DEPTH ANALYSIS: Chain Summary

| Finding ID | Location | Root Cause (1-line) | Verdict | Severity | Precondition Type | Postcondition Type |
|------------|----------|---------------------|---------|----------|-------------------|-------------------|
| DEPTH-EX-1 | MorphoAdapter.sol:L712-740 | _checkVaultHealth reads nominal borrow not accrued Morpho shares | CONFIRMED | Medium | TIMING+EXTERNAL | EXTERNAL,STATE,BALANCE |
| DEPTH-EX-2 | MorphoAdapter.sol:L619-624 | withdrawToVault pulls loan tokens FROM vault which may not hold them | CONFIRMED | Medium | STATE+BALANCE | STATE,BALANCE |
| DEPTH-EX-3 | UniswapV4Adapter.sol:L579-587 | emergency withdrawToVault uses amount0Min=0,amount1Min=0 | CONFIRMED | Medium | EXTERNAL (MEV) | BALANCE,EXTERNAL |
| DEPTH-EX-4 | PendleAdapter.sol:L778-779 | redeemDueInterestAndRewards sweeps all epochs; first-caller captures all | CONFIRMED | Medium | STATE (multi-vault) | BALANCE,STATE |
| DEPTH-EX-5 | PendleAdapter.sol:L772-779 | emptyYts hardcoded, YT interest yield never claimed | CONFIRMED | Medium | STATE (always) | BALANCE,EXTERNAL |
| DEPTH-EX-6 | WSTONBondManager.sol:L487-514 | 90-day BOND_EXPIRY allows bond reclaim if markSlashPending never called | CONFIRMED | Medium | TIMING+EXTERNAL | BALANCE,EXTERNAL |
| DEPTH-EX-7 | KernelExecutionVerifier.sol:L578 | CVE-2025-52484 applicability unknown (unverified verifier address) | CONTESTED | High (if unpatched) | EXTERNAL | BALANCE,STATE |
| DEPTH-EX-8 | TradingSubAccount.sol:L229 | CoreWriter non-atomicity creates strategyActive desync without HyperCore position | CONFIRMED | Medium | EXTERNAL+STATE | STATE,TIMING |
| DEPTH-EX-9 | OptimisticKernelVault.sol:L206-251 | shared maxOracleAge conflates price oracle and bond attestation staleness | CONFIRMED | Medium | STATE (configuration) | TIMING,EXTERNAL |
| DEPTH-EX-10 | PendleAdapter.sol:L646-688 | SY residual from partial Pendle fill not refunded to vault | CONFIRMED | Low | STATE | BALANCE |

## FINDING INDEX

| ID | Severity | Location | Title | Source |
|----|----------|----------|-------|--------|
| DEPTH-EX-1 | Medium | MorphoAdapter.sol:L712-740 | Stale nominal borrow in health check allows silent undercollateralization | INV-73, SE-7 |
| DEPTH-EX-2 | Medium | MorphoAdapter.sol:L619-624 | Emergency exit blocked when vault lacks loan tokens for repay | INV-70, SE-3 |
| DEPTH-EX-3 | Medium | UniswapV4Adapter.sol:L579-587 | Zero-slippage emergency withdraw enables full MEV sandwich | INV-72, SE-5 |
| DEPTH-EX-4 | Medium | PendleAdapter.sol:L778-807 | First-caller reward capture strands other vaults' epoch rewards | INV-66, PC6-1 |
| DEPTH-EX-5 | Medium | PendleAdapter.sol:L772-779 | Hardcoded empty YTs array means YT interest yield never claimed | INV-67, PC6-2 |
| DEPTH-EX-6 | Medium | WSTONBondManager.sol:L487-514 | Bond reclaim possible without slash if relayer misses 90-day window | INV-34, TC-4 |
| DEPTH-EX-7 | High/Info | KernelExecutionVerifier.sol:L578 | IRiscZeroVerifier CVE-2025-52484 patching unverifiable from source | attack_surface.md |
| DEPTH-EX-8 | Medium | TradingSubAccount.sol:L229 | CoreWriter non-atomicity creates strategyActive=true without HyperCore position | attack_surface.md (CoreWriter) |
| DEPTH-EX-9 | Medium | OptimisticKernelVault.sol:L206-251 | Shared maxOracleAge conflates bond and price oracle freshness | INV-01, OA-1 |
| DEPTH-EX-10 | Low | PendleAdapter.sol:L646-688 | SY residual from partial pool fill not refunded to vault | INV-69, PC6-4 |

**Coverage**: 10/10 priority targets addressed (SE-7/INV-73, SE-3/INV-70, SE-5/INV-72, PC6-1/INV-66, PC6-2/INV-67, cross-chain relay timing/INV-34, CoreWriter non-atomicity, IRiscZeroVerifier CVE, shared maxOracleAge/INV-01, and additional chain combination findings). Coverage: 10/10 finding cards addressed.
