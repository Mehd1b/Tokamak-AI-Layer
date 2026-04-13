# Blind Spot Scanner A: Tokens & Parameters

**Scanner**: Blind Spot Scanner A
**Phase**: 4b Iteration 1
**Date**: 2026-04-13

---

## CHECK 1: External Token Coverage

### Enumeration

| # | External Token | Analyzed by Breadth Agents? | Finding IDs | Notes |
|---|---------------|----------------------------|-------------|-------|
| 1 | ERC20 asset (vault) | YES | INV-06, INV-11 | ERC4626-like donation inflation covered |
| 2 | ETH (vault) | YES | INV-06 (trackedETHBalance) | Donation via trackedETHBalance isolation covered |
| 3 | WSTON | YES | INV-13, INV-24 | Bond collateral; SafeERC20 used throughout |
| 4 | aTokens (rebasing) | YES | INV-08, INV-04 | Interest stranding + aggregate HF covered |
| 5 | stETH / wstETH | YES | INV-10 | syncRebase per-vault accounting corruption covered |
| 6 | PT / YT / LP (Pendle) | PARTIAL (side-effect only) | INV-46 | SE-2 is a side-effect trace; NO breadth security analysis |
| 7 | Uniswap LP NFT | PARTIAL (side-effect only) | INV-45 | SE-1 is side-effect only; NO breadth security analysis |
| 8 | USDC (HyperCore) | PARTIAL | None | HyperEVM CoreWriter async settlement noted; no token security analysis |
| 9 | TON/WTON/WSTON (StakingRouter) | NONE | None | StakingRouter has ZERO security analysis — identified as CRITICAL COVERAGE GAP in findings_inventory.md |

**Coverage Gate**: 6/9 tokens analyzed. 3 tokens (PT/YT/LP, Uniswap LP NFT, TON/WTON — StakingRouter) have either ZERO or side-effect-only coverage.

### R11 Dimension Coverage (tokens with ≥1 finding)

| External Token | D1: Transferability | D2: Accounting | D3: Op Blocking | D4: Loop/Gas | D5: Side Effects | Dimensions Covered |
|----------------|--------------------:|---------------:|----------------:|-------------:|------------------:|-------------------|
| ERC20 asset | ✓ (INV-06) | ✓ (INV-11) | ✗ N/A | ✗ N/A | ✗ N/A | 2/3 applicable |
| WSTON | ✓ (INV-24) | ✓ | ✗ N/A | ✗ N/A | ✗ N/A | 2/3 applicable |
| aTokens | ✓ | ✓ (INV-08) | ✓ (INV-05) | ✗ N/A | ✓ (rebasing) | 4/5 — adequate |
| stETH | ✓ | ✓ (INV-10) | ✗ N/A | ✗ N/A | ✓ | 3/4 applicable |
| **PT/YT/LP** | **✗ UNCOVERED** | **✗ UNCOVERED** | **✗ UNCOVERED** | **✗ N/A** | **✓ (INV-46 partial)** | **1/4 — BLIND SPOT** |
| **Uniswap LP NFT** | **✗ UNCOVERED** | **✗ UNCOVERED** | **✗ UNCOVERED** | **✗ N/A** | **✓ (INV-45 partial)** | **1/4 — BLIND SPOT** |

**BLIND SPOT**: PT/YT/LP and Uniswap LP NFT have ≤1 dimension covered. D1 (transferability/unsolicited transfers), D2 (accounting integrity), D3 (operation blocking) unchecked for both.

---

## CHECK 1b: Unchecked ERC20 Transfer Return Values

**Trigger**: SLITHER not available — manual scan performed.

**Findings**: ALL ERC20 transfers across all 34 source files use `SafeERC20.safeTransfer` / `SafeERC20.safeTransferFrom`. No raw `.transfer(` or `.transferFrom(` calls found on external token addresses.

**Exception note**: `ILido(lido).approve(wstETH, stethAmount)` at LidoAdapter.sol:254 and :320 — raw `.approve()` on the stETH token (which always returns `true`). Return value not checked, but stETH's ERC20 `approve()` is fully compliant (always returns `true`, no failure modes). Not a vulnerability.

**Result**: CLEAN — 0 gaps.

---

## CHECK 2: Governance-Changeable Parameter Coverage

### Enumeration of setters

| # | Parameter | Setter | Direction Analyzed? | Bounds Enforced? | Rule 14 Gap? |
|---|-----------|--------|--------------------:|-------------------|-------------|
| 1 | managementFeeBps | setFees() | YES (INV-23, INV-36) | 0..500 | NO — covered |
| 2 | performanceFeeBps | setFees() | YES | 0..5000 | NO — covered |
| 3 | protocolFeeSplitBps | setProtocolTreasury/setFees | YES | 0..5000 | NO |
| 4 | maxOracleAge | setOracleSigner() | YES (INV-01, INV-29) | 0..86400 | NO |
| 5 | challengeWindow | setChallengeWindow() | PARTIAL (INV-32) | 30m..24h | PARTIAL — increase direction not analyzed |
| 6 | minBond (OKV) | setMinBond() | PARTIAL (INV-33) | >0, **NO UPPER BOUND** | YES — increase to near-uint256 |
| 7 | maxPending | setMaxPending() | YES | 1..10 | NO |
| 8 | minBondFloor | setMinBondFloor() | YES (INV-33) | >0 | NO |
| 9 | accessControl | setAccessControl() | YES (INV-17, INV-19) | UNENFORCED (no validation) | PARTIAL — analyzed but PARTIAL verdict |
| 10 | defaultProtocolFeeSplitBps | setDefaultProtocolFeeSplitBps() | NO | 0..5000 | ANALYZED BELOW |

**Coverage Gate**: 10/10 setters processed.

### Rule 14 + Rule 13 Analysis

**setChallengeWindow() — INCREASE direction (INV-32 only analyzed DECREASE)**

INV-32 (PARTIAL): only covers the shortening path (rejecting decreases with pending executions). The INCREASE direction is not covered. If `challengeWindow` is increased while pending executions exist (which the code explicitly allows at L336: "Lengthening is always safe"), the challenge window for ALREADY-PENDING executions changes retroactively:

- `pending.deadline` is set to `block.timestamp + challengeWindow` AT executeOptimistic time (L238-ish). The deadline is STORED in the struct.
- Since the deadline is frozen at execution time, increasing `challengeWindow` does NOT retroactively affect pending executions.
- **Result**: The "lengthening is always safe" comment is CORRECT — stored deadlines are immutable. No finding.

**setMinBond() — INCREASE direction, NO UPPER BOUND**

`setMinBond(amount)` only checks `amount > 0`. An owner can set `minBond = type(uint256).max`. After this, `executeOptimistic` always reverts with `InsufficientBond(bondAmount, type(uint256).max)` because no operator can lock `2^256 - 1` WSTON.

- This permanently bricks the optimistic vault unless the owner calls `setMinBond()` again with a reasonable value.
- However, the owner can also simply call `setOptimisticEnabled(false)` to achieve the same effect, or deploy a new vault.
- This is a FULLY_TRUSTED owner action — same trust tier as INV-29. Mark as ASSUMPTION-DEP: TRUSTED-ACTOR.
- **Result**: Low/Informational — no new finding (within existing trust model).

**setDefaultProtocolFeeSplitBps() — VaultFactory**

This only affects NEW vaults deployed AFTER the change. Existing vaults' protocolFeeSplitBps is locked at deployment time (set in KernelVault initializer). No retroactive effect.
- INCREASE direction: New vaults will pay higher protocol fee split. No harm to existing depositors.
- DECREASE direction: New vaults pay lower. No harm.
- **Result**: CLEAN.

---

## CHECK 2b: Native Value in Loops

**Scan**: `msg.value` appears in KernelVault and LidoAdapter and HyperliquidAdapter.

| Function | Contains msg.value? | Inside Loop/Batch? |
|----------|--------------------|--------------------|
| KernelVault.depositETH | YES | NO (single call) |
| KernelVault.receive() | YES | NO |
| LidoAdapter.stakeETH | YES | NO (single call) |
| HyperliquidAdapter.depositHYPE | YES | NO (single call) |

**Result**: CLEAN — no `msg.value` inside loops.

---

## CHECK 2c: Unbounded Return Data

**Scan**: Low-level `.call{...}` detected in KernelVault.sol:1405, HyperliquidAdapter.sol:284, LidoAdapter.sol:376, TradingSubAccount.sol:175.

| External Call Site | Return Data Bounded? | Copy Method | Gap? |
|-------------------|---------------------|-------------|------|
| KernelVault.sol:1405 `target.call{value: value}(callData)` | NO — full `bytes memory returnData` | `abi.decode`-style revert with `CallFailed(target, returnData)` | LOW risk |
| HyperliquidAdapter.sol:284 `config.subAccount.call{value: msg.value}("")` | N/A — return data discarded | `(bool success,)` | CLEAN |
| LidoAdapter.sol:376 `msg.sender.call{value: ethReceived}("")` | N/A — return data discarded | `(bool success,)` | CLEAN |
| TradingSubAccount.sol:175 `HYPE_SYSTEM_ADDRESS.call{value: balance}("")` | N/A — return data discarded | `(bool success,)` | CLEAN |

**KernelVault.sol:1405 analysis**: The unbounded `returnData` is from `target.call{value: value}(callData)`, called inside the `_executeActions` loop (L1058). If the call fails, `revert CallFailed(action.target, returnData)` bubbles up the full returnData. A target that returns 100KB of revert data forces the vault to copy and re-emit it, costing significant gas. However:
1. The `target` is determined by the zkVM-proven agent output — the `trustedImageId` binds what agents can generate.
2. The vault `owner` is the only caller of `execute()`.
3. The gas cost is borne by the owner's transaction.
4. No third-party attacker can choose the target.

**Result**: The gas cost is borne by the proof submitter (vault owner), not an external party. Not a security finding in this trust model. **CLEAN.**

---

## CHECK 2d: Relay/Meta-tx Gas Griefing

**Scan**: No `gasleft()`, `forwarder`, or meta-transaction patterns found in scope. `relayer` pattern found only in WSTONBondManager — but it is a cross-chain oracle relayer that calls `onlyRelayer` functions directly (not a gas-forwarding meta-tx pattern).

**Result**: CLEAN.

---

## CHECK 2e: Approval/Delegate Sequence Conflicts

**Scan**: `forceApprove` used throughout (OpenZeppelin's atomic approve — sets to zero then target value). No sequential `approve` + `approve` overwrites on the same (spender, token) pair.

`LidoAdapter` uses raw `approve()` (not `forceApprove`):
- `approve(wstETH, stethAmount)` — called once per `wrapToWstETH` call, immediately followed by `wrap(stethAmount)` in the same tx. No residual allowance risk (single-function, no interleaving).
- `approve(withdrawalQueue, totalAmount)` — same pattern.

**Result**: CLEAN.

---

## CHECK 2f: Infrastructure Address Targeting

**Scan**: No `depositFor`, `stakeFor`, `delegateTo`, `mintFor`, `withdrawFor` patterns found in scoped contracts.

**Result**: N/A — SKIP.

---

## CHECK 2g: Missing Native ETH Receiver

**Enumeration**: Contracts that MAY need ETH based on design:

| # | Contract | Designed to Accept ETH? | Has receive()/fallback()? | Gap? |
|---|----------|------------------------|--------------------------|------|
| 1 | KernelVault (ETH vault mode) | YES — `depositETH()` and CALL action ETH transfers | YES — `receive() external payable` at L1950 | CLEAN |
| 2 | LidoAdapter | YES — `stakeETH()` triggers `ILido.submit{value}` | YES — `receive() external payable {}` at L460 | CLEAN |
| 3 | TradingSubAccount | YES — accepts HYPE via `receive()` | YES — `receive() external payable` at L165 | CLEAN |
| 4 | HyperliquidAdapter | YES — `depositHYPE()` forwards ETH to subAccount | YES — `depositHYPE() external payable` (no receive) | CLEAN |
| 5 | MetaVault | NO — ERC20 only | NO receive() | CLEAN (ERC20 only) |
| 6 | WSTONBondManager | NO — ERC20 bond only | NO receive() | CLEAN |
| 7 | KernelExecutionVerifier | NO | NO receive() | CLEAN |
| 8 | AgentRegistry | NO | NO receive() | CLEAN |
| 9 | VaultFactory | NO | NO receive() | CLEAN |
| 10 | MorphoAdapter | NO | NO receive() | CLEAN |
| 11 | AaveV3Adapter | NO | NO receive() | CLEAN |
| 12 | UniswapV4Adapter | NO — ERC20 LP tokens only | NO receive() | CLEAN |
| 13 | PendleAdapter | NO — ERC20 tokens only | NO receive() | CLEAN |

**Result**: CLEAN — no contracts with design intent to accept ETH are missing `receive()`/`fallback()`.

---

## New Findings

---

## Finding [BLIND-A-1]: PendleAdapter Reward Tokens Permanently Stranded When Total Position Weight is Zero

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3 | ✗4(N/A — no depth agent ran) | ✓5
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single adapter), R6:✗(no role), R8:✗(single-step check), R10:✓, R11:✓, R12:✓, R13:✗(not design-related)]
**Severity**: Low
**Location**: PendleAdapter.sol:L795-L804 (`claimRewards`)
**Description**: In `claimRewards()`, the adapter computes vault reward shares based on `totalWeight = sum(ytBalance + lpBalance)` across all vaults for the requested markets. If ALL registered vaults have fully withdrawn their PT/YT/LP positions before calling `claimRewards` (e.g., after `withdrawToVault()` zeroes all tracked balances), `totalWeight == 0`. The reward distribution loop at L798 then short-circuits:
```solidity
if (delta > 0 && totalWeight > 0 && vaultWeight > 0) {
    // Never executes when totalWeight == 0
}
```
Any reward tokens emitted by Pendle's `redeemDueInterestAndRewards()` at this point accumulate in the PendleAdapter contract. There is NO `rescueTokens()`, `sweepDust()`, or admin recover function in PendleAdapter. The reward tokens are permanently stranded with no on-chain retrieval path.
**Impact**: Pendle reward tokens (e.g., PENDLE, protocol incentives) emitted after all vault positions are closed are permanently locked in the PendleAdapter contract. The magnitude depends on reward emission rates and the timing between final position close and reward claim.

### Postcondition Analysis (CONFIRMED)
**Postconditions Created**: Reward tokens permanently locked in PendleAdapter address
**Postcondition Types**: BALANCE
**Who Benefits**: No one — the tokens are irrecoverable on-chain

**Why breadth agents missed this**: The staking/external analysis file was truncated at 27 lines (per findings_inventory.md TASK 4 critical gap note). PendleAdapter received no breadth analysis — only a side-effect trace (INV-46) for the YT post-maturity case.

---

## Finding [BLIND-A-2]: PendleAdapter Fee-on-Transfer Tokenln Accounting Gap in mintPtYt

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3 | ✗4(N/A) | ✓5
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single flow), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✓, R13:✗(not design-related)]
**Severity**: Low
**Location**: PendleAdapter.sol:L435-L441 (`mintPtYt`)
**Description**: In `mintPtYt()`, the adapter pulls `amount` of `tokenIn` from the vault via `safeTransferFrom(msg.sender, address(this), amount)` (L435), then immediately approves the Pendle router for `amount` (L438) and passes `netTokenIn: amount` in the `TokenInput` struct (L442). If `tokenIn` is a fee-on-transfer (FoT) token, the adapter receives only `amount - fee` but attempts to route the full `amount` through Pendle. The router's pull of `amount` from the adapter will fail (revert) if the adapter doesn't hold enough tokens due to the FoT deduction.

This is a latent revert hazard for FoT `tokenIn` assets. The vault pays the FoT on the inbound transfer but cannot complete the mint — the tokens are consumed by the fee with no position created and no refund mechanism beyond the transaction revert. Since the entire tx reverts, no funds are permanently lost; however, the operational flow is broken for any vault that uses FoT tokenIn assets with Pendle.

Note: Most major Pendle markets use stablecoins or standard ERC20s as tokenIn, mitigating practical risk. Conditional on the vault's specific Pendle market configuration.
**Impact**: For vaults configured with FoT tokenIn assets on Pendle, `mintPtYt` always reverts. The vault cannot open Pendle positions.

**Evidence**: 
```solidity
IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amount); // receives amount - fee
IERC20(tokenIn).forceApprove(pendleRouter, amount);                  // approves full amount
TokenInput memory input = TokenInput({
    tokenIn: tokenIn,
    netTokenIn: amount,    // passes full amount — router pull will fail if fee taken
    ...
});
```

**Why breadth agents missed this**: PendleAdapter received zero breadth security analysis (CRITICAL COVERAGE GAP noted in findings_inventory.md Task 4).

---

## Finding [BLIND-A-3]: Pendle/Uniswap LP Token Dimensions D1-D3 Systematically Uncovered (Partial Blind Spot)

**Verdict**: PARTIAL
**Step Execution**: ✓1,2 | ✗3(depth required) | ✗4(N/A) | ✓5
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single adapter per token), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✓]
**Severity**: Informational (coverage gap signal — no exploitable finding yet confirmed)
**Location**: PendleAdapter.sol (all functions), UniswapV4Adapter.sol (all functions)
**Description**: The breadth analysis was truncated at 27 lines for staking/external adapters. PT/YT/LP tokens (PendleAdapter) and Uniswap V4 LP NFT positions (UniswapV4Adapter) have coverage only at the R11-D5 dimension (side effects, via INV-45 and INV-46). Three dimensions are systematically uncovered:

- **D1 (Transferability)**: Can PT/YT/LP tokens or LP NFTs be transferred directly into the adapter (unsolicited)? Would an unsolicited inbound transfer corrupt the adapter's internal position accounting?
- **D2 (Accounting)**: Are the per-vault position balances (`positions[vault][market].ptBalance`, `totalPositions[market].ptBalance`, `_vaultPositions[vault]`) consistent with actual adapter holdings across all operation paths?
- **D3 (Operation Blocking)**: Can an adversarial market state (post-maturity, low liquidity, paused router) block vault withdrawals or emergency exits?

**Initial D2 observation**: `_vaultPositions[vault]` in UniswapV4Adapter is an array of positionIds. If an LP NFT is transferred directly to the adapter by anyone (D1 path), `positionOwner[positionId]` is never set, and no vault can claim it. `collectFees(positionId)` would revert with `PositionNotOwnedByVault`. This is a partially-blocking D1→D2 dependency.

**Precondition Analysis (PARTIAL)**
**Missing Precondition**: Direct NFT transfer to the adapter (sender is arbitrary, not a registered vault)
**Precondition Type**: EXTERNAL
**Why This Blocks**: `onERC721Received` accepts all NFTs but `positionOwner` is never set for NFTs not originating from `addLiquidity`. The NFT is effectively stranded.

**Why breadth agents missed this**: Staking/external analysis file was truncated. PendleAdapter and UniswapV4Adapter were explicitly noted in the CRITICAL COVERAGE GAP in findings_inventory.md.

---

## Finding [BLIND-A-4]: UniswapV4Adapter: Unsolicited LP NFT Transfer Strands Position Permanently

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,5 | ✗4(N/A)
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single adapter), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✓, R12:✓, R13:✗]
**Severity**: Low
**Location**: UniswapV4Adapter.sol:L694-L701 (`onERC721Received`)
**Description**: `onERC721Received` at L694 returns the correct ERC721 receiver selector unconditionally, meaning the adapter accepts ALL Uniswap V4 LP NFTs transferred to it via `safeTransferFrom`, regardless of sender. When a Uniswap V4 LP position NFT is transferred directly to the adapter by anyone other than the `addLiquidity` flow, `positionOwner[tokenId]` is never set (it defaults to `address(0)`). The `_vaultPositions[vault]` array is also never updated.

Once the NFT is inside the adapter:
- `removeLiquidity(positionId)` reverts: `positionOwner[positionId] != msg.sender` (since owner is `address(0)`)
- `collectFees(positionId)` reverts: same check
- `withdrawToVault()` iterates `_vaultPositions[msg.sender]` — the orphaned positionId is not in any vault's array

The NFT is permanently stranded in the adapter contract with all its accrued liquidity and fees inaccessible. There is no `rescueERC721` or admin recovery path.

**Impact**: Any Uniswap V4 LP NFT transferred directly to the UniswapV4Adapter (whether by mistake, by a user attempting to "donate" a position, or by an attacker using it to consume adapter storage slots) is permanently locked. Liquidity and accrued fees are irrecoverable.

**Evidence**:
```solidity
// L694-701: accepts ALL ERC721 transfers
function onERC721Received(address, address, uint256, bytes calldata)
    external pure returns (bytes4) {
    return this.onERC721Received.selector;  // accepts unconditionally
}

// removeLiquidity / collectFees — positionOwner check always fails for orphaned NFTs
if (positionOwner[positionId] != msg.sender) {
    revert PositionNotOwnedByVault(positionId);
}
```

**Why breadth agents missed this**: UniswapV4Adapter had zero breadth security analysis (CRITICAL COVERAGE GAP in findings_inventory.md).

---

## Finding [BLIND-A-5]: StakingRouter Lacks Zero-Address Check on WTON Return Value in stakeFromTON

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,5 | ✗4(N/A)
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single flow), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✓, R13:✗]
**Severity**: Low
**Location**: StakingRouter.sol:L87-L97 (`stakeFromTON`)
**Description**: In `stakeFromTON()`, after `wton.swapFromTON(tonAmount)` returns `true` (checked at L87), the code computes the expected WTON received via a hardcoded formula: `uint256 wtonAmount = tonAmount * 1e9` (L90). This assumes a fixed 1e9 TON→WTON exchange rate (18→27 decimal conversion). The computed `wtonAmount` is then used for `forceApprove(address(wston), wtonAmount)` and `depositWTONAndGetWSTON(wtonAmount)`.

**Gap 1**: The actual WTON balance received from `swapFromTON` is not verified via `wton.balanceOf(address(this))` before or after. If the WTON contract's internal exchange rate deviates from 1e9 (e.g., due to a rebasing event, a bug in the WTON contract, or a protocol upgrade), the computed `wtonAmount` would be incorrect. The adapter would attempt to approve and deposit more WTON than it actually holds, causing `depositWTONAndGetWSTON` to revert (insufficient balance).

**Gap 2**: If `wstonReceived == 0` (WSTON contract returns nothing, e.g., during a rate transition), `stakeFromTON` silently completes without transferring any WSTON to the user. The user's TON is consumed (converted to WTON stranded in the router), and they receive 0 WSTON. The `_sweepDust` call would rescue the WTON, but the event `Staked(msg.sender, tonAmount, 0)` would silently misrepresent the outcome.

However, `_sweepDust()` at L165-179 rescues residual WTON, partially mitigating Gap 1. For Gap 2, `wstonReceived > 0` gates the safeTransfer, so if 0 WSTON is received, the function silently succeeds with 0 output — but `_sweepDust` rescues the WTON.

**Net risk**: Low — `_sweepDust` provides a partial safety valve. The main residual risk is that `wstonReceived == 0` silently passes rather than reverting, which could confuse off-chain monitoring.

**Impact**: If `wstonReceived == 0`, the `stakeFromTON` call appears to succeed but the user receives no WSTON. WTON is rescued via sweep, but the user must re-attempt. No permanent fund loss.

**Why breadth agents missed this**: StakingRouter received ZERO security analysis (CRITICAL COVERAGE GAP in findings_inventory.md).

---

## Chain Summary

| Finding ID | Location | Root Cause (1-line) | Verdict | Severity | Precondition Type | Postcondition Type |
|------------|----------|---------------------|---------|----------|-------------------|-------------------|
| BLIND-A-1 | PendleAdapter.sol:L795-804 | `totalWeight == 0` guard skips reward forwarding with no rescue path | CONFIRMED | Low | STATE (all positions closed) | BALANCE (tokens stranded) |
| BLIND-A-2 | PendleAdapter.sol:L435-441 | FoT tokenIn amount passed unajusted to Pendle router | CONFIRMED | Low | EXTERNAL (FoT token config) | NONE (tx reverts) |
| BLIND-A-3 | PendleAdapter.sol, UniswapV4Adapter.sol | Systematic D1-D3 coverage gap for PT/YT/LP and LP NFT tokens | PARTIAL | Informational | EXTERNAL | STATE/BALANCE |
| BLIND-A-4 | UniswapV4Adapter.sol:L694-701 | `onERC721Received` accepts all NFTs unconditionally; no positionOwner set | CONFIRMED | Low | EXTERNAL (anyone transfers NFT) | BALANCE (NFT/funds stranded) |
| BLIND-A-5 | StakingRouter.sol:L87-107 | `wstonReceived == 0` silently succeeds; hardcoded 1e9 rate without balance verification | CONFIRMED | Low | EXTERNAL (WSTON rate anomaly) | NONE (sweep rescues) |

---

**Coverage Assertion**: All entities enumerated under each CHECK have been processed.
- CHECK 1: 9 tokens enumerated, 9 processed. 3 BLIND SPOTS identified.
- CHECK 1b: 0 gaps (SLITHER not available — manual scan confirms SafeERC20 usage everywhere).
- CHECK 2: 10 setters enumerated, 10 processed. 1 bounded gap (setMinBond upper bound — within trust model).
- CHECK 2b: 4 msg.value sites enumerated, 4 processed. 0 loop/batch gaps.
- CHECK 2c: 4 low-level call sites enumerated, 4 processed. 0 exploitable unbounded-returnData gaps.
- CHECK 2d: 0 relay/forwarder patterns. SKIP.
- CHECK 2e: forceApprove used throughout. 2 raw approve sites (stETH — compliant token). 0 sequence conflicts.
- CHECK 2f: 0 depositFor/stakeFor patterns. SKIP.
- CHECK 2g: 13 contracts enumerated, 13 processed. 0 missing receive() gaps.

Total findings from Scanner A: 5 (Check1: 3 new token gaps, Check2: 0 parameter gaps, side-effect: 2 new from gap analysis)
