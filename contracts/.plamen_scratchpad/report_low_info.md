## Low Findings

### [L-01] ERC20 Vault `totalAssets` Uses Raw `balanceOf` — Donation Inflates PPS [VERIFIED]

**Severity**: Low
**Location**: `KernelVault.sol:L1725–1729`
**Confidence**: MEDIUM (1 depth agent confirmed; [CODE-TRACE])

**Description**:
For ERC20 vaults, `totalAssets()` returns `asset.balanceOf(address(this))` directly. Any ERC20 tokens sent to the vault address outside of the normal `depositERC20Tokens` flow — whether by mistake or intentionally — are counted in the denominator of the price-per-share calculation, inflating PPS for all existing shareholders. An ETH vault correctly guards against this using an internally tracked balance (`trackedETHBalance`), but the same protection is absent for ERC20 assets.

```solidity
function totalAssets() public view returns (uint256) {
    if (address(asset) == address(0)) {
        return trackedETHBalance; // ETH: safe, uses tracked balance
    }
    return asset.balanceOf(address(this)); // ERC20: uses raw balanceOf — donation-vulnerable
}
```

**Impact**:
A malicious actor can donate a small amount of the vault's underlying asset to the vault address, causing `totalAssets` to increase without any corresponding share issuance. This inflates PPS for all existing depositors but permanently forfeits the donated tokens to the vault (no profit path for the attacker). New depositors who join after a donation receive fewer shares for their deposit. This is griefing, not fund extraction.

**PoC Result**: Not executed. Code trace confirms mechanism. Attack has no profitable extraction path.

**Recommendation**:
Mirror the ETH approach: track ERC20 token inflows via an internal `trackedAssetBalance` variable, increment it in `depositERC20Tokens`, and use it in `totalAssets()` instead of `balanceOf`. This makes PPS manipulation impossible regardless of direct transfers.

---

### [L-02] PendleAdapter `addLiquidity` Leaves Residual SY Tokens in Adapter on Partial Fill [VERIFIED]

**Severity**: Low
**Location**: `PendleAdapter.sol:L646–688`
**Confidence**: MEDIUM (1 depth agent; [CODE-TRACE])

**Description**:
`addLiquidity` pulls `syAmount` of SY tokens from the calling vault and approves them to `pendleRouter`. After `addLiquidityDualSyAndPt` returns, only `netLpOut` and `ptAmount` consumed are tracked. If the Pendle router uses less than the full `syAmount` (a partial fill), the residual SY tokens remain in the adapter with no code path to return them to the vault during normal operation.

In contrast, `UniswapV4Adapter.addLiquidity` explicitly refunds unused tokens via post-call balance-delta checks. `PendleAdapter.addLiquidity` lacks this step, creating a silent accumulation of SY tokens after every partial fill.

```solidity
IERC20(SY).safeTransferFrom(msg.sender, address(this), syAmount);
IERC20(SY).forceApprove(pendleRouter, syAmount);
uint256 netLpOut = IPendleRouter(pendleRouter).addLiquidityDualSyAndPt(
    address(this), market, syAmount, ptAmount, minLpOut
);
// No post-call balance check; residual SY stays in adapter
```

**Impact**:
SY tokens that remain in the adapter are recoverable via the emergency `withdrawToVault()` path, but inaccessible through normal vault operations until then. Residuals accumulate silently across multiple `addLiquidity` calls, reducing the vault's effective deployed capital.

**PoC Result**: Not executed. Mechanism confirmed by code trace.

**Recommendation**:
After `addLiquidityDualSyAndPt` returns, compute a balance delta for SY and transfer any residual back to `msg.sender`. This matches the UniswapV4Adapter refund pattern at L465–469.

---

### [L-03] Emergency Withdraw Snapshot Clamping Desync Causes Temporary PPS Mis-Report [VERIFIED]

**Severity**: Low
**Location**: `KernelVault.sol:L1628–1646`
**Confidence**: MEDIUM (1 depth agent; [CODE-TRACE])

**Description**:
In `_processEmergencyWithdraw`, while `strategyActive`, `snapshotTotalAssets` and `snapshotTotalShares` are each independently clamped to zero when they would underflow. If two concurrent emergency withdrawals occur, one can zero `snapshotTotalShares` while `snapshotTotalAssets` remains positive (or vice versa), creating an inconsistent state:

```solidity
if (assetsOut > snapshotTotalAssets) {
    snapshotTotalAssets = 0;
} else {
    snapshotTotalAssets -= assetsOut;
}
if (shareAmount > snapshotTotalShares) {
    snapshotTotalShares = 0;
} else {
    snapshotTotalShares -= shareAmount;
}
```

During the window of inconsistency, `currentPps()` may report inflated or deflated PPS values that do not reflect the vault's true state.

**Impact**:
`currentPps()` guards against division-by-zero when `snapshotTotalShares == 0` (returning `1e18`), so there is no revert. However, the PPS reported during the desync window is inaccurate. No fund loss occurs; the inconsistency self-corrects once both snapshot values reach zero.

**PoC Result**: Not executed. Code trace confirms independent clamping paths and downstream guard.

**Recommendation**:
Clamp both variables atomically: zero out `snapshotTotalAssets` whenever `snapshotTotalShares` reaches zero (and vice versa), ensuring they always transition together.

---

### [L-04] `OptimisticKernelVault` `_pendingCount` Has No Admin Reset — Stuck Counter Permanently Halts Execution [VERIFIED]

**Severity**: Low
**Location**: `OptimisticKernelVault.sol:L37–38, L304, L493`
**Confidence**: MEDIUM (1 depth agent; [CODE-TRACE])

**Description**:
`_pendingCount` is a load-bearing counter checked before every `executeOptimistic()` call. It is incremented in `executeOptimistic` and decremented only in `submitProof()`, `slashExpired()`, and `selfSlash()`. There is no admin function to reset or correct it.

If a state divergence bug causes `_pendingCount` to become permanently elevated (e.g., incremented without a matching decrement due to an edge-case bug), the vault reaches its `maxPending` cap and blocks all future executions indefinitely. There is no owner-callable recovery path.

**Impact**:
While normal operation keeps the counter accurate, the absence of any corrective mechanism means any latent bug in counter management has no recovery path. Affected depositors can still withdraw, but vault execution halts until redeployment.

**PoC Result**: Not executed. Code trace confirms no admin correction function exists.

**Recommendation**:
Add an `owner`-only `emergencyResetPendingCount(uint256 newCount)` function with event emission for auditability. This provides a recovery path without requiring contract redeployment.

---

### [L-05] MorphoAdapter Health Check Uses Unvalidated Oracle Price — No Staleness Check [VERIFIED]

**Severity**: Low
**Location**: `MorphoAdapter.sol:L726–728`
**Confidence**: MEDIUM (1 agent; [CODE-TRACE])

**Description**:
`_checkVaultHealth()` calls `IMorphoOracle(oracle).price()` and validates only that the result is non-zero. No timestamp or freshness check is applied:

```solidity
uint256 price = IMorphoOracle(oracle).price();
require(price > 0, "zero oracle price");
// No staleness check
```

If the oracle's underlying price feed goes stale (for example, a Chainlink aggregator that has not been updated because price deviation has not crossed the heartbeat threshold), the adapter continues operating as if the price is current.

**Impact**:
Morpho Blue's own liquidation infrastructure uses the same oracle, so this adapter-level oversight is a secondary safeguard issue. A stale price that overstates collateral value may allow a vault to pass the adapter's health check while Morpho's own liquidation engine would not yet have triggered. The window of exposure is bounded by the oracle's heartbeat interval.

**PoC Result**: Not executed. Code trace confirms absence of staleness check.

**Recommendation**:
For Chainlink-compatible oracles, add a staleness check using `latestRoundData()` and compare against a configurable `maxOracleAge` parameter. For Morpho oracle contracts that do not expose a timestamp, document this limitation explicitly.

---

### [L-06] MorphoAdapter Tracks Requested Amounts, Not Actual Amounts — Accounting Drift Over Time [VERIFIED]

**Severity**: Low
**Location**: `MorphoAdapter.sol` (supply, withdraw, borrow functions)
**Confidence**: MEDIUM (1 agent; [CODE-TRACE])

**Description**:
`_vaultSupplied` and `_vaultBorrowed` are updated using input amounts rather than the values returned by Morpho's `supply()`, `withdraw()`, and `borrow()` functions. Morpho Blue uses share-based accounting and may return actual amounts that differ from requested amounts due to rounding. These return values are ignored, causing the adapter's internal tracked state to diverge from Morpho's actual state over time.

**Impact**:
The tracking divergence compounds with each operation. The health check, which reads `_vaultBorrowed` for leverage calculations, progressively understates actual debt. During emergency withdrawal, a divergence-induced shortfall in the repayment amount can prevent full position closure, compounding with the separately-documented emergency exit failure (related High finding).

**PoC Result**: Not executed. Code trace confirms return values are not captured.

**Recommendation**:
Capture and use Morpho return values: `(uint256 assetsSupplied,) = pool.supply(...)`. Update `_vaultSupplied` with `assetsSupplied` instead of the input `amount`.

---

### [L-07] Single-Step Ownership Transfer in `WSTONBondManager` and `VaultAccessControl` [VERIFIED]

**Severity**: Low
**Location**: `WSTONBondManager.sol:L707–711`, `VaultAccessControl.sol:L126–130`
**Confidence**: HIGH (2 agents; [CODE-TRACE])

**Description**:
Both contracts implement single-step ownership transfer: the current owner calls `transferOwnership(newOwner)` and ownership takes effect immediately with no confirmation from the new owner:

```solidity
// WSTONBondManager.sol
function transferOwnership(address newOwner) external onlyOwner {
    if (newOwner == address(0)) revert ZeroOwner();
    emit OwnershipTransferred(owner, newOwner);
    owner = newOwner; // immediate, no acceptance
}
```

A typographical error or clipboard mistake permanently and irrecoverably transfers ownership to the wrong address. `VaultFactory.sol` correctly uses the two-step `pendingOwner` / `acceptOwnership` pattern, making this inconsistency notable.

**Impact**:
Irreversible governance loss. For `WSTONBondManager`, this affects bond floors, slash economics, treasury address, and relayer configuration. For `VaultAccessControl`, this affects whitelist and deposit cap management. Neither can be recovered without social coordination.

**PoC Result**: Not executed. Mechanism is by code inspection.

**Recommendation**:
Adopt the two-step pattern used by `VaultFactory`: `transferOwnership` sets `pendingOwner`; `acceptOwnership` must be called by the new owner to confirm. This prevents accidental permanent transfers.

---

### [L-08] MetaVault Has No `transferOwnership` — Owner Address Is Immutable Post-Deploy [VERIFIED]

**Severity**: Low
**Location**: `MetaVault.sol:L66`
**Confidence**: HIGH (confirmed; [CODE-TRACE])

**Description**:
`MetaVault.owner` is set in the constructor and cannot be changed — no `transferOwnership` function exists. If the deployer's private key is lost, compromised, or the organization restructures, MetaVault governance is permanently frozen without contract redeployment.

**Impact**:
All owner-gated functions (`addVault`, `removeVault`, `setTargetWeights`, `rebalance`) become permanently inaccessible if the key is lost. MetaVault's underlying funds remain independently recoverable from each KernelVault, but the aggregation layer cannot adapt to changing conditions.

**PoC Result**: Not executed. Absence of `transferOwnership` confirmed by code search.

**Recommendation**:
Add a two-step `transferOwnership` / `acceptOwnership` pattern. Consider a timelock delay given MetaVault's role as an aggregation layer.

---

### [L-09] `setAccessControl` and `rescueTokens` Emit No Vault-Level Events — Silent Policy Changes [VERIFIED]

**Severity**: Low
**Location**: `KernelVault.sol:L629–632`, `KernelVault.sol:L565–569`
**Confidence**: HIGH (confirmed; [CODE-TRACE])

**Description**:
Two owner-privileged `KernelVault` functions make no vault-level event emissions:

```solidity
function setAccessControl(address _accessControl) external {
    if (msg.sender != owner) revert NotOwner();
    accessControl = _accessControl; // No emit
}

function rescueTokens(address token, address to, uint256 amount) external {
    if (msg.sender != owner) revert NotOwner();
    if (totalShares != 0) revert SharesStillOutstanding();
    IERC20(token).safeTransfer(to, amount); // No vault-level emit
}
```

`setAccessControl` changes deposit and withdrawal gating logic for all users. `rescueTokens` moves tokens out of the vault. Neither action produces an observable vault-level event for monitoring systems.

**Impact**:
Depositors using indexers or event-driven dashboards cannot detect access control policy changes or token rescue operations without manually inspecting state diffs. A compromised owner key can change access control to a reverting contract (see related High finding) or rescue tokens without leaving an on-chain audit trail beyond block-level state inspection.

**PoC Result**: Not executed. Code trace confirms no emit statements.

**Recommendation**:
Add `emit AccessControlUpdated(accessControl, _accessControl)` in `setAccessControl` and `emit TokensRescued(token, to, amount)` in `rescueTokens`.

---

### [L-10] MetaVault `removeVault` Calls Underlying Vault Without try/catch — Stuck If Withdrawal Reverts [VERIFIED]

**Severity**: Low
**Location**: `MetaVault.sol:L509–530`
**Confidence**: HIGH (confirmed; [CODE-TRACE])

**Description**:
`removeVault()` calls `kv.withdraw(remainingShares)` on the underlying `KernelVault` without a try/catch. If the underlying vault's withdrawal reverts (strategy active, paused verifier, or any other revert condition), `removeVault` itself reverts, making it impossible to delist a misbehaving vault:

```solidity
IKernelVaultLike kv = IKernelVaultLike(vault);
uint256 remainingShares = kv.shares(address(this));
if (remainingShares > 0) {
    kv.withdraw(remainingShares); // No try/catch
    ...
}
```

MetaVault remains permanently entangled with a vault it cannot remove.

**Impact**:
MetaVault's `rebalance` continues to include the misbehaving vault in weight calculations, potentially allocating new depositor capital to it. The vault owner cannot protect MetaVault depositors by delisting the problematic vault without first resolving the underlying revert condition — which may be outside their control.

**PoC Result**: Not executed. Code trace confirms bare call without error handling.

**Recommendation**:
Wrap `kv.withdraw` in a try/catch. On failure, allow the owner to (a) force-delist the vault without withdrawing (with a "stranded position" flag) or (b) defer removal via a pending-removal queue.

---

### [L-11] `registerExternalVault` Validates Only `code.length > 0` — No Interface Check [VERIFIED]

**Severity**: Low
**Location**: `VaultFactory.sol:L547–557`
**Confidence**: MEDIUM (1 agent; [CODE-TRACE])

**Description**:
`registerExternalVault()` verifies the target address is non-zero and has deployed code, but performs no interface validation. Any contract with bytecode — including contracts that do not implement `IKernelVaultView` — can be registered as an official vault.

**Impact**:
A compromised owner (or an owner error) could register a non-vault contract, causing any code path that calls `totalAssets()` or `shares()` on registered vaults to revert with a confusing low-level failure. While limited to owner-only actions, the missing validation reduces defensive depth.

**PoC Result**: Not executed. Code inspection confirms missing interface check.

**Recommendation**:
Add a static call to `IKernelVaultView(vault).totalAssets()` before registration. Alternatively, require the vault to implement ERC-165 and check the vault interface ID.

---

### [L-12] High-Water Mark Persists Through Performance Fee Disable/Re-Enable — Depositors Charged on Zero-Fee Gains [VERIFIED]

**Severity**: Low
**Location**: `KernelVault.sol:L684–733`
**Confidence**: LOW (design intent per prior fix; [CODE-TRACE])

**Description**:
When performance fees are disabled (`performanceFeeBps = 0`), the high-water mark (HWM) is not reset. When fees are later re-enabled, the existing HWM is preserved:

```solidity
// [C-05] Fires only when `highWaterMark == 0` (has never been set).
// Subsequent setFees calls preserve the existing HWM.
if (perfBps > 0 && totalShares > 0 && highWaterMark == 0) {
    highWaterMark = currentPps();
}
```

Depositors who entered during a zero-fee period may have their appreciation taxed retroactively if fees are re-enabled and PPS has grown beyond the pre-disable HWM. This is a retroactive economic change depositors could not anticipate.

**Impact**:
Not a fund loss but an unexpected charge on gains earned during an explicitly zero-fee period. Depositors who held through the zero-fee interval cannot distinguish fee-on-prior-gains from fee-on-zero-fee-period-gains.

**PoC Result**: Not executed. Code trace confirms HWM persistence via the `highWaterMark == 0` gate.

**Recommendation**:
When `performanceFeeBps` is set to zero, also reset `highWaterMark = 0`. On re-enablement, the HWM anchors at the current PPS, ensuring depositors' zero-fee gains are not retroactively taxed.

---

### [L-13] Slash Distribution Routes Depositor 80% to Treasury Off-Chain — No On-Chain Depositor Recourse [VERIFIED]

**Severity**: Low
**Location**: `WSTONBondManager.sol:L392–437`
**Confidence**: HIGH (confirmed; [CODE-TRACE])

**Description**:
When a bond is slashed, 80% is designated as the depositor share. However, this 80% is sent to the treasury address along with the treasury's own 10%, because enumeration and direct distribution to cross-chain depositors is not feasible on-chain:

```solidity
// Treasury accumulates both its own share AND the cross-chain depositor share
wston.safeTransfer(treasury, treasuryShare + depositorShare);
```

Redistribution to actual depositors is entirely off-chain and trust-dependent on the treasury operator.

**Impact**:
Depositors have no on-chain mechanism to claim their share of a slash payout. If the treasury operator is compromised, goes offline, or disputes the redistribution, depositors have no on-chain recourse. The contract treats the 80% as fully transferred; depositors cannot independently verify that redistribution occurred correctly.

**PoC Result**: Not executed. Code trace confirms both shares transfer to treasury.

**Recommendation**:
Implement on-chain depositor distribution using a Merkle drop pattern (vault owner submits a Merkle root, depositors claim against it), or add a dedicated `depositorEscrow` mapping so depositor funds can be audited separately from treasury funds on-chain.

---

### [L-14] `strategyActive` Flag Not Cleared When All Depositors Exit via Normal Withdrawal — Vault Requires Owner Intervention to Reopen [VERIFIED]

**Severity**: Low
**Location**: `KernelVault.sol:L1157–1191`
**Confidence**: HIGH (confirmed; [CODE-TRACE])

**Description**:
When the last depositor exits via the normal withdrawal path and `totalShares` drops to zero, `_resetFeeEpochIfEmpty()` resets fee tracking but does NOT reset `strategyActive`. The vault is left in:
- `strategyActive = true`
- `snapshotTotalAssets > 0`
- `totalShares = 0`

The deposit path then reverts with `DepositsLockedDuringStrategy`, blocking all new depositors. Recovery requires the owner to call `settle()` or waiting 7 days for `emergencySettle()`.

**Impact**:
A vault that naturally drains to zero between strategy cycles requires owner intervention to re-open. If the owner is unavailable, new depositors are locked out for up to 7 days even though the vault holds no assets. This disrupts automated vault pipelines and depositor UX.

**PoC Result**: Not executed. Code trace confirms `strategyActive` is not reset in the normal withdrawal zero-shares path.

**Recommendation**:
In `_resetFeeEpochIfEmpty()`, also reset `strategyActive = false`, `snapshotTotalAssets = 0`, and `snapshotTotalShares = 0` when `totalShares == 0`. This mirrors the behavior of the emergency withdrawal path.

---

### [L-15] `setChallengeWindow` Permits Retroactive Extension With Pending Executions — Operators Cannot Trust Window Commitment [VERIFIED]

**Severity**: Low
**Location**: `OptimisticKernelVault.sol:L328–341`
**Confidence**: MEDIUM (1 agent; [CODE-TRACE])

**Description**:
`setChallengeWindow` prevents the owner from shortening the challenge window when pending executions exist, protecting operators' bonds. However, lengthening is always permitted regardless of pending state:

```solidity
// Shortening blocked with pending executions; lengthening always allowed
if (window < challengeWindow && _pendingCount > 0) {
    revert TooManyPending(_pendingCount, 0);
}
challengeWindow = window;
```

An operator who submitted an optimistic execution expecting a 1-hour challenge window may have planned their capital allocation accordingly. The vault owner could retroactively extend the window to `MAX_CHALLENGE_WINDOW`, tying up the operator's WSTON bond for far longer than anticipated.

**Impact**:
Primarily a malicious-owner scenario. Operators managing liquidity across multiple vaults may find their bonds unexpectedly locked, impacting capital efficiency. Bounded by `MAX_CHALLENGE_WINDOW`.

**PoC Result**: Not executed. Code trace confirms one-directional protection.

**Recommendation**:
Apply symmetric protection: block both shortening and lengthening when pending executions exist. Window changes should only take effect once the current pending set clears.

---

### [L-16] `setMinBondFloor` Takes Immediate Effect — No Grace Period for Operators to Adjust Bond Strategy [VERIFIED]

**Severity**: Low
**Location**: `WSTONBondManager.sol:L577–584`
**Confidence**: MEDIUM (1 agent; [CODE-TRACE])

**Description**:
`setMinBondFloor` applies the new minimum bond requirement immediately upon execution:

```solidity
function setMinBondFloor(uint256 _minBondFloor) external onlyOwner {
    require(_minBondFloor > 0, "zero bond floor");
    minBondFloor = _minBondFloor;
    emit MinBondFloorUpdated(_minBondFloor);
}
```

Operators who are mid-process of preparing a bond transaction may find the floor has increased between their balance check and their transaction landing. Already-locked bonds are unaffected, but new bonds must immediately meet the new floor.

**Impact**:
Operators experience unexpected rejections from `lockBond` during floor transitions. In periods of rapid floor changes or high L1 congestion, operators face repeated delays on new optimistic execution submissions.

**PoC Result**: Not executed. Code trace confirms immediate effect.

**Recommendation**:
Add a minimum 24-hour notice period for floor increases: the new floor is announced via event and takes effect only after the grace period. Decreases may remain immediate since they only benefit operators.

---

### [L-17] `strategyActivatedAt` Is Set Once — `emergencySettle` Callable 7 Days After First Action Regardless of Current Strategy State [VERIFIED]

**Severity**: Low
**Location**: `KernelVault.sol:L1428–1434, L1452–1458`
**Confidence**: MEDIUM (1 agent; [CODE-TRACE])

**Description**:
`strategyActivatedAt` is set when `strategyActive` first becomes true and is reset only by `_settle()` or emergency-withdraw-to-zero. `emergencySettle` computes the earliest call time as `strategyActivatedAt + EMERGENCY_SETTLE_DELAY`.

If an operator runs continuous strategy cycles without calling `settle()` between them (keeping `strategyActive = true` indefinitely), `emergencySettle` becomes callable 7 days after the first activation — even if a new strategy was just initiated moments ago. Any third party can then disrupt the in-progress strategy.

**Impact**:
Legitimate continuous-strategy operators who avoid `settle()` are exposed to third-party `emergencySettle` calls after the 7-day window. The disruption clears the strategy flag, but does not move assets out of adapters, leaving the vault in a partially-settled state.

**PoC Result**: Not executed. Code trace confirms `strategyActivatedAt` is not refreshed during continuous operation.

**Recommendation**:
Refresh `strategyActivatedAt = block.timestamp` when `execute()` is called while `strategyActive` is already true. This ensures each active execution cycle gets a fresh 7-day window.

---

### [L-18] `AgentRegistry.unregister` Leaves `_agentMetadataURI` Stale After Deletion [VERIFIED]

**Severity**: Low
**Location**: `AgentRegistry.sol:L290–329`
**Confidence**: HIGH (confirmed; [CODE-TRACE])

**Description**:
`unregister()` deletes five mappings (`_agents`, `_agentIdIndex`, `_deprecated`, `_successors`, plus array management) but does not delete `_agentMetadataURI[agentId]`. After unregistration, `getMetadataURI(agentId)` still returns the old URI string.

If an agent ID is later reused, the stale URI from the previous registration is returned until explicitly overwritten. Off-chain consumers querying metadata for unregistered agents receive misleading data.

**Impact**:
Off-chain tooling (dashboards, explorers) displays stale metadata for agents that no longer exist. In the worst case, a stale IPFS pointer could be repurposed to serve misleading content under the agent's identity.

**PoC Result**: Not executed. Code trace confirms omission.

**Recommendation**:
Add `delete _agentMetadataURI[agentId]` to `unregister()`, alongside the other deletions.

---

### [L-19] UniswapV4Adapter LP Fee Tokens Require Explicit Collection — No Automatic Harvesting [VERIFIED]

**Severity**: Low
**Location**: `UniswapV4Adapter.sol`
**Confidence**: HIGH (confirmed; [CODE-TRACE])

**Description**:
Uniswap V4 LP positions continuously accrue trading fees. These fees are collectible only via an explicit `collectFees()` CALL action in a vault execution or via the emergency `withdrawToVault()` path. There is no automatic or periodic fee sweep:

- Normal operation: fees accumulate indefinitely if the agent does not include `collectFees()` in execution sequences.
- Emergency: `withdrawToVault()` calls `collect()` with `amount0Max: type(uint128).max`, recovering all fees.

**Impact**:
Vault depositors lose access to LP fee yield if the vault's agent does not include periodic fee collection. The loss is operationally avoidable but not enforced at the protocol level. Agents without fee collection logic silently leak yield over time.

**PoC Result**: Not executed. Code trace confirms no automatic fee collection.

**Recommendation**:
Automate fee collection within `addLiquidity` and `removeLiquidity` flows so fees are always swept when any position operation occurs. Alternatively, document the requirement prominently in the agent development guide and emit a staleness event if fees have not been collected for a configurable period.

---

### [L-20] PendleAdapter Expired YT Tokens Require Manual Redemption — No Protocol-Level Automation [VERIFIED]

**Severity**: Low
**Location**: `PendleAdapter.sol`
**Confidence**: HIGH (confirmed; [CODE-TRACE])

**Description**:
After a Pendle market reaches maturity, YT tokens expire and their principal is recoverable only by calling Pendle's maturity redemption function (`redeemPyToToken` or equivalent). PendleAdapter tracks `ytBalance` per vault but has no dedicated post-expiry redemption function. The emergency `withdrawToVault()` transfers tracked YT tokens back to the vault, but expired YT tokens require redemption, not just transfer, to recover underlying principal.

**Impact**:
Vault depositors holding YT-backed positions will not have their YT principal automatically redeemed at expiry. The redemption path exists only via explicit CALL actions. An agent that does not handle market expiry will leave principal stranded until an operator manually intervenes.

**PoC Result**: Not executed. Code trace confirms no automated maturity handling.

**Recommendation**:
Add a `redeemExpiredYT(address market)` function to PendleAdapter that calls Pendle's redemption function for expired positions. This can be triggered via a CALL action or called directly by the vault owner.

---

### [L-21] `PointsProgram.updateDepositBalance` Accepts Arbitrary Balance — Points Inflation via Authorized Caller Compromise [VERIFIED]

**Severity**: Low
**Location**: `PointsProgram.sol:L332–356`
**Confidence**: MEDIUM (1 agent; [CODE-TRACE])

**Description**:
`updateDepositBalance()` allows any authorized vault to set a user's tracked deposit balance to any `uint256` value, including values far exceeding actual deposits. No upper-bound validation exists:

```solidity
function updateDepositBalance(address vault, address user, uint256 newBalance)
    external
    onlyDeployedVault(vault)
{
    accruePoints(vault, user);
    depositBalances[vault][user] = newBalance; // No cap or validation
}
```

A compromised vault contract (or a misconfigured agent) can over-report balances, awarding excess points at an accelerated rate.

**Impact**:
Points system integrity is compromised if the PointsProgram governs economically valuable distributions (token airdrops, governance weight, reward multipliers). There is no direct financial asset at risk from the points contract itself.

**PoC Result**: Not executed. Code trace confirms missing validation.

**Recommendation**:
Add a maximum balance cap (`require(newBalance <= IKernelVaultView(vault).totalAssets(), "balance exceeds vault assets")`), or implement a delta-based update pattern rather than absolute overwrite.

---

### [L-22] `BuilderProgram.getLeaderboard` Uses O(N²) Insertion Sort — View DoS at Scale [VERIFIED]

**Severity**: Low
**Location**: `BuilderProgram.sol:L323–362`
**Confidence**: HIGH (confirmed; [CODE-TRACE])

**Description**:
`getLeaderboard()` runs insertion sort over all registered builders to return a sorted leaderboard:

```solidity
// Simple insertion sort by TVL descending
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

Insertion sort is O(N²) in the worst case. At N=500 builders, this requires up to 250,000 in-memory operations over 96-byte structs, approaching or exceeding the gas limits that Ethereum nodes apply to `eth_call` requests. The function becomes progressively unusable as the builder count grows.

**Impact**:
Front-end applications relying on `getLeaderboard` experience timeouts at scale. There is no fund risk, but the protocol's leaderboard functionality degrades permanently and irreversibly as the builder set grows, with no on-chain mechanism to fix it without upgrading the contract.

**PoC Result**: Not executed. Gas estimate: 500 builders × 250,000 ops over 96-byte structs likely exceeds 30M gas in worst-case order.

**Recommendation**:
Return unsorted data and sort off-chain, or maintain a pre-sorted structure updated incrementally (`O(N)` per TVL change). The simplest fix is to return `builderAddresses[offset..offset+limit]` unsorted and let clients handle ordering.

---

### [L-23] Multiple Protocol-Level Design Gaps: VaultFactory Dead State, Initialize Validation Inconsistency, AaveV3 Unregister Blind Spot, LidoAdapter Positive-Rebase Accounting, UniswapV4 100% Slippage Allowed [VERIFIED]

**Severity**: Low
**Location**: Multiple (see per-item locations below)
**Confidence**: HIGH (all confirmed; [CODE-TRACE])

**Description**:
Five standalone low-severity design issues share the root cause of missing guards or incomplete state management. They are grouped here per the root-cause consolidation rule:

**Item A — VaultFactory dead protocol fee state** (`VaultFactory.sol:L45–48`): `protocolTreasury` and `defaultProtocolFeeSplitBps` are stored in VaultFactory but never passed to deployed vaults. Each vault manages its own fee config independently. The factory-level state is inaccessible dead state that misleads operators who treat it as an authoritative default.

**Item B — VaultFactory.initialize missing `code.length` check** (`VaultFactory.sol:L162–177`): `initialize()` checks `vaultCodeStore_ != address(0)` but does not check `vaultCodeStore_.code.length > 0`. An EOA address passes the zero-check but causes cryptic failures in `deployVault()`. The `setVaultCreationCodeStore()` function (the update path) correctly checks `code.length > 0`, creating an inconsistent validation surface.

**Item C — AaveV3Adapter `unregisterVault` does not check borrow-only positions** (`AaveV3Adapter.sol:L239–255`): `unregisterVault()` iterates `_suppliedAssets[vault]` and checks for non-zero supply or borrow against each supplied asset. However, `_borrowedAssets[vault]` (borrow-only assets — borrowed without a corresponding supply) is not checked. A vault can be unregistered with an outstanding borrow-only position, abandoning the tracked debt silently.

**Item D — LidoAdapter positive-rebase gains not distributed at withdrawal** (`LidoAdapter.sol:L407–425`): On positive rebase, `withdrawToVault()` returns the nominal tracked amount (`stETHAmount`) rather than the pro-rata share that includes rebase gains. Positive rebase gains accumulate in the adapter and are captured by whoever calls next or remain stranded. Calling `syncRebase()` before withdrawal partially mitigates this.

**Item E — UniswapV4Adapter `setSlippage` allows 10000 BPS (100%)** (`UniswapV4Adapter.sol:L333–340`): The slippage validation uses `slippageBps > BPS_DENOMINATOR` (strictly greater than), so `slippageBps = 10000` passes as valid. Setting slippage to 100% means no slippage protection — any price is acceptable for LP operations, fully exposing the vault to MEV sandwich attacks.

| Item | Location | Issue |
|------|----------|-------|
| A | VaultFactory.sol:L45–48 | Dead protocol fee state |
| B | VaultFactory.sol:L162–177 | Missing code.length in initialize |
| C | AaveV3Adapter.sol:L239–255 | Borrow-only positions bypass unregister check |
| D | LidoAdapter.sol:L407–425 | Positive rebase gains not distributed at withdrawal |
| E | UniswapV4Adapter.sol:L333–340 | 100% slippage accepted |

**Impact**:
Each item individually is low severity: (A) dead storage/operator confusion; (B) initialization failure catchable early; (C) abandoned debt tracking with no direct fund loss; (D) yield stranding recoverable via syncRebase; (E) admin misconfiguration enabling MEV on LP ops.

**PoC Result**: Not executed. All items confirmed by code trace.

**Recommendation**:
- A: Remove dead state or propagate it to vault constructors.
- B: Add `require(vaultCodeStore_.code.length > 0, "no code at store")` in `initialize()`.
- C: Add `require(_vaultBorrowed[vault][_borrowedAssets[vault][i]] == 0)` check for borrow-only assets in `unregisterVault()`.
- D: In the positive-rebase path, compute `stETHReturned = (stETHAmount * actualStETH) / totalTrackedStETH` (same formula as the negative-rebase path) so rebase gains are distributed proportionally.
- E: Change validation to `slippageBps >= BPS_DENOMINATOR` or add an explicit maximum cap (e.g., 3000 BPS / 30%).

---

## Informational Findings

### [I-01] Partial Withdrawal Share Scaling Rounds in Withdrawer's Favor [VERIFIED]

**Severity**: Informational
**Location**: `KernelVault.sol:L1149–1155`

**Description**:
When a withdrawal is scaled due to insufficient liquid assets, the formula `shareAmount = (shareAmount * available) / origAssets` uses integer division which truncates (rounds down). The scaled `shareAmount` is rounded down, meaning the withdrawer burns fewer shares than strict pro-rata would dictate while still receiving the full `available` asset amount. Remaining shareholders are marginally diluted by the rounding delta (at most 1 wei per withdrawal).

This is standard ERC4626-adjacent behavior and is not exploitable at normal vault scales. The effect is negligible.

**Recommendation**: Document this rounding behavior in NatSpec. If strict proportionality is required, round the scaled share amount up instead.

---

### [I-02] MetaVault Phase 2 Rebalance Under-Allocates When Phase 1 Withdrawals Fail [VERIFIED]

**Severity**: Informational
**Location**: `MetaVault.sol:L411–453`

**Description**:
MetaVault's `rebalance()` operates in two phases: Phase 1 withdraws from over-weight vaults to build idle capital; Phase 2 deposits into under-weight vaults. If a Phase 1 withdrawal from a KernelVault reverts (e.g., strategy active, insufficient liquidity), `trackedIdle` is lower than expected. Phase 2 then under-allocates to target-weight vaults, leaving the portfolio persistently off-target until the next successful rebalance.

No funds are lost. The rebalance can be retried once the blocking condition resolves.

**Recommendation**: Emit an event when Phase 1 withdrawals fail so off-chain monitoring can detect under-allocation and trigger a retry automatically.

---

### [I-03] `EXECUTION_BONUS_POINTS` Flat Reward Is Sybil-Amplifiable [VERIFIED]

**Severity**: Informational
**Location**: `PointsProgram.sol:L41, L362–398`

**Description**:
`EXECUTION_BONUS_POINTS = 50` is awarded per depositor address for each successful vault execution. A single actor distributing capital across N addresses receives N×50 bonus points per execution instead of 50. Because the bonus is per-address rather than per-capital-at-risk, Sybil splitting provides linear bonus amplification at negligible cost (address creation only).

**Recommendation**: Weight execution bonus proportionally to each depositor's capital: `bonus = EXECUTION_BASE_POINTS * depositBalance[user] / totalAssets`. This makes points proportional to economic participation.

---

### [I-04] First `setFees` Call Bypasses `FEE_CHANGE_COOLDOWN` — No Warning Window for Initial Fee Activation [VERIFIED]

**Severity**: Informational
**Location**: `KernelVault.sol:L692–699`

**Description**:
The fee change cooldown check is skipped when `lastFeeRateChange == 0` (initial state). An owner can deploy a vault with zero fees, attract deposits, then immediately enable fees without any cooldown:

```solidity
if (lastFeeRateChange != 0
    && block.timestamp < lastFeeRateChange + FEE_CHANGE_COOLDOWN)
{
    revert FeeChangeCooldown(...);
}
// First call: lastFeeRateChange == 0, check skipped entirely
```

All subsequent fee changes are subject to cooldown, but the first call is unconstrained.

**Recommendation**: Initialize `lastFeeRateChange = block.timestamp` during vault deployment so that the first `setFees` call is also subject to the cooldown, giving depositors advance notice of any fee activation.

---

### [I-05] `KernelExecutionVerifier` `__gap[41]` Comment Is Off-By-One — Documentation Inaccuracy [VERIFIED]

**Severity**: Informational
**Location**: `KernelExecutionVerifier.sol:L90, L183`

**Description**:
The `__gap[41]` storage gap comment is off-by-one relative to the actual gap accounting after `pausedSince` was inserted into the storage layout. The gap was reduced by 1 to accommodate the new variable, but the comment still references the pre-insertion gap count. This is a documentation error with no runtime effect — storage allocation is handled correctly by the compiler.

**Recommendation**: Correct the gap comment to accurately reflect the current gap size. Add an inline storage accounting table listing each named slot and the gap remainder to make future UUPS upgrades less error-prone.

---

### [I-06] Agent Successor Chain Links Agent IDs — Existing Vaults Not Automatically Updated [VERIFIED]

**Severity**: Informational
**Location**: `AgentRegistry.sol`

**Description**:
`_successors[agentId]` maps a deprecated agent to its successor agent ID. Existing vaults are unaffected: each vault has `trustedImageId` pinned immutably at deployment. Off-chain consumers following the successor chain see the new agent, but on-chain vault proofs still require the old `imageId`. This is intentional per the vault immutability guarantee, but may confuse users who expect "successor" to imply automatic migration.

**Recommendation**: Document clearly in the AgentRegistry NatSpec and user-facing documentation that successor registration does NOT migrate existing vaults. Vault owners who wish to use updated agent logic must deploy new vaults.

---

### [I-07] 1-Wei Deposit Permanently Blocks `AgentRegistry.unregister()` — Griefing Vector [VERIFIED]

**Severity**: Informational
**Location**: `AgentRegistry.sol:L301–303`

**Description**:
`unregister()` reverts if any vault reports `totalAssets() > 0`. A 1-wei deposit into any of the agent's vaults permanently prevents the agent author from calling `unregister()`:

```solidity
uint256 assets = IKernelVaultView(vaults[i]).totalAssets();
if (assets > 0) revert VaultHasDeposits(vaults[i], assets);
```

An adversary can prevent an agent from being officially retired by maintaining a dust deposit at negligible cost. The agent can still be `deprecated()`, but the registry entry cannot be cleaned up.

**Recommendation**: Allow unregistration of deprecated agents with deposits below a configurable `DUST_THRESHOLD`. Alternatively, allow agent authors to mark individual vaults as "abandoned" (with a time delay) to bypass the check for those vaults.

---

### [I-08] External Calls in Loop in `AgentRegistry.unregister` and `LidoAdapter` — Bounded Gas Grief [VERIFIED]

**Severity**: Informational
**Location**: `AgentRegistry.sol:L301`, `LidoAdapter.sol:L312, L336, L351`

**Description**:
`AgentRegistry.unregister()` makes up to `MAX_VAULTS_PER_UNREGISTER = 50` external `staticcall`s in a loop. `LidoAdapter` processes withdrawal requests in a loop. While both loops have bounded iteration counts, a caller who populates the maximum number of entries forces the transaction initiator to pay full gas for all iterations.

**Recommendation**: For `AgentRegistry`, consider a paginated unregister cursor allowing callers to process vaults in smaller batches. For `LidoAdapter`, ensure withdrawal processing has a per-call cap with a cursor for continuation.

---

### [I-09] `VaultFactory.setVaultCreationCodeStore` Is Permanently Dead Code After Initialization [VERIFIED]

**Severity**: Informational
**Location**: `VaultFactory.sol:L256–262`

**Description**:
`setVaultCreationCodeStore()` requires `_vaultCreationCodeStore == address(0)` to proceed:

```solidity
function setVaultCreationCodeStore(address newStore) external onlyOwner {
    require(_vaultCreationCodeStore == address(0), "use schedule/activate");
    ...
}
```

Since `initialize()` always sets `_vaultCreationCodeStore` to a non-zero address, this function can never succeed after initialization. It is permanently dead code that misleads readers into thinking a direct code store update path exists.

**Recommendation**: Remove this function or replace it with a comment directing users to the schedule/activate timelock pattern. Dead code increases audit surface and creates false impressions of protocol capabilities.

---

### [I-10] `AaveV3Adapter.withdrawToVault` Leaves `_suppliedAssets` Array Populated After Full Exit — Gas Waste on Re-Calls [VERIFIED]

**Severity**: Informational
**Location**: `AaveV3Adapter.sol:L476–523`

**Description**:
`withdrawToVault()` zeros individual `_vaultSupplied` and `_vaultBorrowed` entries but does not call `delete _suppliedAssets[msg.sender]` to clear the asset list array. Subsequent calls to `withdrawToVault()` re-iterate the same asset list, find all values at zero, and do nothing — but still pay gas for the iteration. The `_borrowedAssets` array is correctly deleted at L517.

**Recommendation**: Add `delete _suppliedAssets[msg.sender]` at the end of `withdrawToVault()` after processing all assets, mirroring the `_borrowedAssets` cleanup pattern.

---

### [I-11] `StakingRouter` Computes WTON Amount With Hardcoded Ratio — No Balance Delta Verification [VERIFIED]

**Severity**: Informational
**Location**: `StakingRouter.sol:L86–92`

**Description**:
`StakingRouter` converts TON to WTON using `wtonAmount = tonAmount * 1e9` without verifying the actual WTON received via a balance delta:

```solidity
if (!wton.swapFromTON(tonAmount)) revert TransferFailed();
uint256 wtonAmount = tonAmount * 1e9; // Assumes exact ratio
```

The WTON→WSTON path correctly measures actual received amounts via balance delta. If `swapFromTON` has any fee, slippage, or rounding, the actual WTON received differs from the assumed amount, and the subsequent WSTON conversion uses the wrong value.

**Recommendation**: Apply the same balance-delta pattern: record `wtonBefore = wton.balanceOf(address(this))` before the swap, then compute `wtonAmount = wton.balanceOf(address(this)) - wtonBefore` after the swap.

---

### [I-12] `LidoAdapter` Has `rescueETH` But No Rescue Path for Accidentally Transferred stETH/wstETH [VERIFIED]

**Severity**: Informational
**Location**: `LidoAdapter.sol:L473–480`

**Description**:
`LidoAdapter` exposes `rescueETH()` for recovering accidentally sent ETH. No equivalent function exists for stETH or wstETH sent to the adapter outside the tracked vault flow. The adapter's emergency withdrawal only transfers tracked vault balances, leaving untracked stETH/wstETH permanently stranded.

**Recommendation**: Add a `rescueToken(address token, address to, uint256 amount)` function callable by the adapter owner, with a guard that prevents rescuing tokens currently tracked in vault positions. This ensures accidentally sent tokens can be recovered without risk to vault accounting.

---

### [I-13] `claimAllRewards` Sends Non-Asset Reward Tokens to KernelVault With No Adapter Exit Path [VERIFIED]

**Severity**: Informational
**Location**: `AaveV3Adapter.sol`

**Description**:
Aave V3's `claimAllRewards` can send reward tokens (e.g., AAVE, stkAAVE) directly to the vault or adapter address. If reward tokens differ from the vault's underlying asset, they cannot be withdrawn via the adapter's standard functions. They increase `totalAssets()` via `balanceOf` only if they happen to be the vault asset, but heterogeneous reward tokens become stranded and are recoverable only via an explicit CALL action to swap them.

**Recommendation**: Add a `claimAndSwap` function that claims rewards and immediately swaps them to the vault's underlying asset via a configured DEX adapter, or document clearly that vault agents must include a reward swap step in their execution logic.

---

### [I-14] Same-Block Deposit and Fee Collection Results in Zero Management Fee for That Epoch [VERIFIED]

**Severity**: Informational
**Location**: `KernelVault.sol:L1849–1859`

**Description**:
Management fee collection computes `timeElapsed = block.timestamp - lastFeeTimestamp`. If deposit and vault execution happen in the same block, `timeElapsed = 0` and no management fee is collected, while `lastFeeTimestamp` is reset. An MEV-aware depositor could systematically front-run vault executions to deposit in the same block, then withdraw in the next block after capturing a zero-fee epoch. The economic impact per occurrence is negligible (one block's management fee accrual is dust at standard fee rates).

**Recommendation**: Document this behavior explicitly. For high-AUM vaults where even one block's fee avoidance is material, consider computing and collecting fee accrual at deposit time as well.
