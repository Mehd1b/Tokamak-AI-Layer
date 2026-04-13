# Core State Analysis: Share Allocation Fairness + Economic Design

**Agent**: Analysis Agent #4 (CORE STATE)
**Scope**: KernelVault.sol, MetaVault.sol, OptimisticKernelVault.sol, WSTONBondManager.sol, PointsProgram.sol
**Skills Applied**: SHARE_ALLOCATION_FAIRNESS, ECONOMIC_DESIGN_AUDIT, VAULT_ACCOUNTING injectable

---

## Step Execution Checklist - SHARE_ALLOCATION_FAIRNESS

| Step | Required | Completed? | Notes |
|------|----------|------------|-------|
| 1. Classify Allocation Mechanism | YES | Y | Pro-rata snapshot (KernelVault ERC4626-like), NAV-based (MetaVault) |
| 2. Late Entry Attack Model | YES | Y | Deposits locked during strategy (KernelVault), no lock on MetaVault deposits |
| 2c. Cross-Address Deposit Model | YES | Y | KernelVault withdrawTo/emergencyWithdrawTo use to for destination only; MetaVault no beneficiary pattern |
| 2d. Pre-Setter Timing Model | YES | Y | Fee parameter setters analyzed for retroactive impact |
| 2e. Pre-Configuration State Analysis | YES | Y | Vault operational before fee recipient set, before access control set |
| 3. Queue Position and Batch Processing | N/A | N/A | No queue/batch deposit mechanism |
| 4. Share Redemption Symmetry | YES | Y | Mint/burn use consistent virtual offset formula |
| 4b. Aggregate Constraint Coherence | YES | Y | MetaVault weight sum, combined fee cap |

## Step Execution Checklist - ECONOMIC_DESIGN_AUDIT

| Section | Required | Completed? |
|---------|----------|------------|
| 1. Parameter Boundary Analysis | YES | Y |
| 2. Economic Invariant Identification | YES | Y |
| 3. Rate/Supply Interaction Matrix | YES | Y |
| 4. Fee Formula Verification at Normal Values | YES | Y |
| 5. Emission/Inflation Sustainability | N/A (no emission) | N/A |

---

## Finding [CS-1]: MetaVault Deposits Not Locked During Underlying Vault Strategy - Timing Arbitrage

**Verdict**: PARTIAL
**Step Execution**: Y1,2,4 | N/A3(no queue)
**Rules Applied**: [R4:N/A(evidence clear), R5:Y, R6:N/A(no role), R8:Y, R10:Y, R11:N/A(no external tokens), R14:N/A(no aggregate variables), R15:N/A(no flash-loan-accessible state)]
**Severity**: Medium
**Location**: MetaVault.sol:172-193, MetaVault.sol:604-619

**Description**: KernelVault locks deposits during an active strategy via DepositsLockedDuringStrategy to prevent timing arbitrage where a depositor enters after value accrual but before settlement. However, MetaVault has NO equivalent lock. When an underlying KernelVault has an active strategy, MetaVault _vaultAllocation() calls effectiveTotalAssets() on the underlying vault, which returns the frozen snapshot value. This means MetaVault correctly prices its underlying positions during strategy. However, if the underlying strategy is about to settle at a PROFIT (assets returned > snapshot), a sophisticated depositor can: (1) Observe the strategy is about to settle. (2) Deposit into MetaVault at the SNAPSHOT-based NAV (lower than post-settlement NAV). (3) Wait for settlement - NAV instantly jumps because effectiveTotalAssets() switches from snapshot to live totalAssets(). (4) Withdraw at the higher post-settlement NAV.

**Impact**: Depositors who time entries around underlying vault settlements can dilute existing MetaVault holders returns. The magnitude depends on the strategy profit and the MetaVault idle buffer ratio. With 0% idle and a 10% strategy profit, the attacker captures approximately 10% of the NAV increase proportional to their deposit size.

**Evidence**:
MetaVault.sol deposit function has no strategy lock; KernelVault.sol line 821 has if (strategyActive) revert DepositsLockedDuringStrategy() but MetaVault.sol line 172 deposit function lacks this check entirely.

### Precondition Analysis
**Missing Precondition**: MetaVault deposits need to be locked or priced differently when underlying vaults have active strategies about to settle.
**Precondition Type**: TIMING
**Why This Blocks**: An attacker must know when the underlying strategy will settle profitably. On-chain, the settle() call is observable in the mempool. The attack requires front-running the settlement.

### Postcondition Analysis
**Postconditions Created**: Attacker holds MetaVault shares priced at pre-settlement NAV.
**Postcondition Types**: [STATE]
**Who Benefits**: The attacker who deposited just before settlement.

---

## Finding [CS-2]: Performance Fee Window Gap on Disable/Re-Enable - Depositors Charged for Zero-Fee Appreciation

**Verdict**: PARTIAL
**Step Execution**: Y1,2,2d,4 | N/A3
**Rules Applied**: [R4:N/A(evidence clear), R5:N/A(single entity), R6:Y, R8:Y, R10:Y, R13:Y, R14:N/A(no aggregate variables)]
**Severity**: Low
**Location**: KernelVault.sol:684-733, KernelVault.sol:724-730

**Description**: The C-05 fix anchors the highWaterMark once and prevents re-anchoring via repeated setFees calls. However, the code comment at line 671-678 explicitly acknowledges a remaining trade-off: if the owner disables performance fee (perfBps = 0) and PPS appreciates during the zero-fee window, re-enabling performance fees will charge depositors on that appreciation since HWM is below the current PPS. Concrete scenario: (1) HWM anchored at 1.0e18, performance fee = 20%. (2) Owner calls setFees(mgmt, 0) to disable performance fee. (3) Vault PPS appreciates from 1.0e18 to 1.5e18 during zero-fee period. (4) Owner calls setFees(mgmt, 2000) to re-enable performance fee. (5) Next _collectPerformanceFee() computes profitBps based on pps=1.5e18 vs HWM=1.0e18 resulting in 50% profit and 10% fee extraction. (6) Depositors are charged for appreciation that occurred while performance fees were advertised as zero. The 7-day FEE_CHANGE_COOLDOWN gives depositors time to observe re-enablement and exit.

**Impact**: Owner can extract up to performanceFeeBps/10000 of the PPS appreciation that occurred during a zero-fee window. At max 50% performance fee, this could be up to 50% of the zero-fee-window profit. The owner must wait 7 days between fee changes, and depositors can observe the re-enablement event via FeesUpdated event.

**Evidence**:
KernelVault.sol lines 724-730: if (perfBps > 0 && totalShares > 0 && highWaterMark == 0) { highWaterMark = currentPps(); } - the condition highWaterMark == 0 only fires once; subsequent setFees calls with perfBps>0 do NOT update HWM, so a stale HWM persists through disable/re-enable cycles.

### Precondition Analysis
**Missing Precondition**: Owner must disable and re-enable performance fees with PPS appreciation in between.
**Precondition Type**: ACCESS + TIMING
**Why This Blocks**: Requires owner cooperation. The cooldown provides a 7-day window for depositors to exit.

### Postcondition Analysis
**Postconditions Created**: Fee shares minted to feeRecipient based on zero-fee-window appreciation.
**Postcondition Types**: [STATE]
**Who Benefits**: Fee recipient (owner-controlled).

---

## Finding [CS-3]: WSTONBondManager Cross-Chain Slash Sends Depositor Share to Treasury Instead of Vault Depositors

**Verdict**: CONFIRMED
**Step Execution**: Y1,2,4 | N/A3
**Rules Applied**: [R4:N/A(evidence clear), R5:N/A(single entity), R6:N/A(no role), R8:N/A(single-step), R10:Y, R13:Y]
**Severity**: Low
**Location**: WSTONBondManager.sol:392-437

**Description**: In the cross-chain slashBondByRelayer() function, the 80% depositor share is sent to the protocol treasury instead of the vault depositors. The code comment (L-49 fix at line 410) explains this is by design: cross-chain depositor transfer is out of scope for this contract. The treasuryShare + depositorShare is sent to treasury at line 434. This means the actual slash distribution for cross-chain bonds is: 10% finder + 90% treasury (when slasher != address(0)), or 0% finder + 100% treasury (self-slash). The promised 80% depositor share documented in the contract NatSpec does NOT reach depositors on-chain. There is no on-chain enforcement or mechanism ensuring the treasury actually redistributes the 80% depositor share.

**Impact**: Vault depositors who suffered from a slashed optimistic execution receive ZERO direct compensation from the slash. The entire depositor compensation depends on off-chain treasury management. For a 10 WSTON slash: treasury receives 9 WSTON (10% treasury + 80% depositor), finder receives 1 WSTON (10%), depositors receive 0 WSTON on-chain.

**Evidence**:
WSTONBondManager.sol line 434: wston.safeTransfer(treasury, treasuryShare + depositorShare); - both the treasury 10% share and the depositor 80% share go to the treasury address.

### Postcondition Analysis
**Postconditions Created**: Treasury holds depositor compensation with no on-chain redistribution mechanism.
**Postcondition Types**: [STATE, EXTERNAL]
**Who Benefits**: Treasury (protocol governance). Depositors must trust off-chain redistribution.

---

## Finding [CS-4]: MetaVault Emergency Withdraw Bypasses trackedIdle Accounting for Underlying Proceeds

**Verdict**: CONFIRMED
**Step Execution**: Y1,2,4 | N/A3
**Rules Applied**: [R4:N/A(evidence clear), R5:Y, R6:N/A(no role), R8:N/A(single-step), R10:Y, R14:N/A(no aggregate)]
**Severity**: Medium
**Location**: MetaVault.sol:281-348

**Description**: In MetaVault emergencyWithdraw(), the function correctly deducts trackedIdle for the idle share payout (line 312: trackedIdle -= idleShare). However, for the underlying vault emergency withdrawals in the Step 2 loop (lines 325-345), the recovered base asset is sent directly to the user via baseAsset.safeTransfer(msg.sender, delta). These recovered amounts are NOT added to trackedIdle and then subtracted - they bypass the tracked idle accounting entirely. This is by design for the direct-transfer pattern, but the accounting concern is: if the underlying vault emergencyWithdraw returns MORE tokens than expected (e.g., appreciation not yet reflected in MetaVault NAV), those extra tokens go to the withdrawer but are not tracked in trackedIdle, creating a silent NAV decrease for remaining holders without an accounting trail. The getNav() function will still show the underlying vault correct allocation via _vaultAllocation(), so the NAV self-corrects for the underlying portion.

**Impact**: After a partial emergency withdrawal from MetaVault, the NAV for remaining holders may be slightly incorrect if underlying vault emergency withdrawals returned more or fewer tokens than the NAV model predicted. Practical impact is limited to dust-level discrepancies from rounding in most scenarios, but could be larger if underlying vaults have appreciated significantly since last MetaVault NAV update.

**Evidence**:
MetaVault.sol lines 335-340: uint256 delta = baseAsset.balanceOf(address(this)) - balBefore; if (delta > 0) { baseAsset.safeTransfer(msg.sender, delta); assetsOut += delta; } - recovered assets transferred directly without trackedIdle update.

### Postcondition Analysis
**Postconditions Created**: MetaVault trackedIdle and baseAsset.balanceOf(this) remain consistent because recovered tokens are immediately forwarded. But trackedIdle does not reflect the temporary inflow/outflow.
**Postcondition Types**: [STATE]
**Who Benefits**: N/A - accounting is approximately correct but lacks precision for edge cases.

---

## Finding [CS-5]: KernelVault Partial Withdrawal Share Scaling Rounds in Withdrawer Favor

**Verdict**: CONFIRMED
**Step Execution**: Y1,4 | N/A3
**Rules Applied**: [R4:N/A(evidence clear), R5:N/A(single entity), R6:N/A(no role), R8:N/A(single-step), R10:N/A(single fixed state)]
**Severity**: Informational
**Location**: KernelVault.sol:1149-1155

**Description**: When assetsOut > available (during an active strategy where assets are deployed externally), the code performs a partial withdrawal: shareAmount = (shareAmount * available) / origAssets. The integer division rounds DOWN. This means the user burns FEWER shares than their proportional claim on available, leaving them with slightly more shares than they should have. The rounding direction (fewer shares burned) slightly FAVORS the withdrawer at the expense of remaining holders, which is the opposite of the ERC4626 convention where withdraw should round UP on shares to favor the vault.

**Impact**: Negligible. Integer division rounding creates at most 1 wei of shares per partial withdrawal. The direction (fewer shares burned) slightly favors the withdrawer at the expense of remaining holders.

**Evidence**:
KernelVault.sol line 1152: shareAmount = (shareAmount * available) / origAssets; rounds DOWN meaning the withdrawer burns fewer shares and retains slightly more claim than fair pro-rata.

---

## Finding [CS-6]: MetaVault Rebalance Phase 2 Under-Allocates When Phase 1 Withdrawals Fail

**Verdict**: CONFIRMED
**Step Execution**: Y1,2,4 | N/A3
**Rules Applied**: [R4:N/A(evidence clear), R5:N/A(single entity), R6:Y, R8:Y, R10:N/A(single fixed state), R14:N/A(no settable constraints)]
**Severity**: Informational
**Location**: MetaVault.sol:411-453

**Description**: During rebalance, Phase 1 withdraws from overweight vaults and Phase 2 deposits to underweight vaults. The _withdrawFromVault function increments trackedIdle with the actual withdrawn amount. If a Phase 1 withdrawal fails (emits RebalanceWithdrawFailed), the expected idle increase does NOT happen so trackedIdle remains lower than expected. Phase 2 then has less idle to deposit than it needs, causing under-allocation to underweight vaults. This is correct defensive behavior and the slippage guard at the end catches material NAV drops.

**Impact**: When Phase 1 withdrawals fail, Phase 2 deposits are limited by the actual available idle. The rebalance achieves a partial target weight adjustment rather than a complete one. The 2% slippage guard ensures NAV is protected. This is a design trade-off for robustness, not a vulnerability.

**Evidence**:
MetaVault.sol line 419: try/catch around withdrawFromVaultExternal means failed withdrawals do not increase trackedIdle. MetaVault.sol line 443: uint256 available = trackedIdle; in Phase 2 uses the potentially reduced idle balance.

---

## Finding [CS-7]: PointsProgram Execution Bonus Flat Amount Not Proportional to Deposit - Sybil Advantage

**Verdict**: CONFIRMED
**Step Execution**: Y1,2 | N/A3
**Rules Applied**: [R4:N/A(evidence clear), R5:Y, R6:N/A(no role), R8:N/A(single-step), R10:N/A(single fixed state), R13:Y]
**Severity**: Informational
**Location**: PointsProgram.sol:41, PointsProgram.sol:362-398

**Description**: The recordExecution() function awards a flat EXECUTION_BONUS_POINTS = 50 to every depositor regardless of their deposit size. A user with 1 token deposited receives the same execution bonus as a user with 1,000,000 tokens deposited. This creates an incentive for Sybil attacks: a user can split deposits across many addresses to maximize execution bonuses per unit of capital. For example, 1000 tokens split across 100 addresses yields 5000 execution bonus points per execution, vs 50 points for a single address with 1000 tokens. The deposit-based points accrual (accruePoints) is proportional to balance, so the overall points system is not fully gameable.

**Impact**: Sybil depositors can amplify execution bonus points by approximately N times where N is the number of addresses used. The practical impact depends on whether points have monetary value and the ratio of execution bonus to deposit-based accrual. At 50 points per execution vs the deposit accrual rate, the bonus is relatively small for large depositors.

**Evidence**:
PointsProgram.sol line 392: executionPoints[depositor] += EXECUTION_BONUS_POINTS; awards a flat 50 regardless of deposit size.

---

## Chain Summary

| Finding | Severity | Location | Root Cause | Postcondition Created |
|---------|----------|----------|-----------|----------------------|
| CS-1 | Medium | MetaVault.sol:172 | No deposit lock during underlying strategy | Timing arbitrage on settlement |
| CS-2 | Low | KernelVault.sol:724 | HWM preserved during perf fee disable window | Owner extracts fee on zero-fee-window appreciation |
| CS-3 | Low | WSTONBondManager.sol:434 | Cross-chain depositor share to treasury | Depositors depend on off-chain redistribution |
| CS-4 | Medium | MetaVault.sol:335 | Emergency withdraw bypasses trackedIdle accounting | Minor NAV discrepancy possible |
| CS-5 | Informational | KernelVault.sol:1152 | Integer division rounding on partial withdrawal | Dust-level share accumulation |
| CS-6 | Informational | MetaVault.sol:419 | Phase 1 withdrawal failure reduces Phase 2 budget | Under-allocation (defensive design) |
| CS-7 | Informational | PointsProgram.sol:392 | Flat execution bonus not proportional to deposit | Sybil bonus amplification |
