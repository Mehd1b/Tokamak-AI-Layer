## Medium Findings

---

### [M-01] PendleAdapter First-Caller Permanently Strands Other Vaults' LP Rewards [VERIFIED]

**Severity**: Medium
**Location**: `src/adapters/PendleAdapter.sol:L749-807`
**Confidence**: HIGH (4 findings across 3 depth agents; POC-PASS)

**Description**:
`PendleAdapter.claimRewards()` calls Pendle's `redeemDueInterestAndRewards` which atomically resets the reward accumulator for the entire adapter contract — covering all registered vaults simultaneously. The implementation then computes the calling vault's pro-rata weight and forwards only that share, leaving the remainder in the adapter. This remainder does not carry over: when a second vault calls `claimRewards` in the same epoch, it triggers a fresh accumulator reset that captures new rewards but does NOT include the stranded delta from the prior call. The stranded amount accumulates as permanently unrecoverable dust.

```solidity
// PendleAdapter.sol:L773-807
address[] memory emptyYts = new address[](0);

IPendleRouter(pendleRouter).redeemDueInterestAndRewards(
    address(this), emptySys, emptyYts, markets  // atomic reset for all vaults
);

uint256 vaultWeight;
uint256 totalWeight;
for (uint256 i = 0; i < markets.length; i++) {
    vaultWeight += vaultPos.ytBalance + vaultPos.lpBalance;
    totalWeight += totPos.ytBalance + totPos.lpBalance;
}
// Remainder (totalWeight - vaultWeight) share is permanently stranded
```

**Impact**:
In a multi-vault deployment, the first vault to call `claimRewards` in any epoch receives its pro-rata share while the remainder is permanently stranded. In a two-vault 50/50 deployment, 50% of every epoch's LP rewards are unrecoverable. This finding compounds with M-02 (YT interest never claimed), resulting in near-total Pendle yield loss.

**PoC Result**:
Test `test_H10_remainderStrandedAfterFirstClaim` confirmed the stranding mechanism. POC-PASS (stranding mechanism confirmed; reward distribution works for the first caller but per-epoch remainder is permanently lost).

**Recommendation**:
Implement per-vault pre-accumulators that track unclaimed rewards across epochs before forwarding, or route each vault through a separate Pendle sub-account so `redeemDueInterestAndRewards` only resets that vault's accumulator. The current M-04 pro-rata fix addresses first-caller monopoly but does not prevent epoch-boundary stranding.

---

### [M-02] PendleAdapter Hardcoded Empty YT Array Permanently Blocks All YT Interest Yield [VERIFIED]

**Severity**: Medium
**Location**: `src/adapters/PendleAdapter.sol:L772-780`
**Confidence**: HIGH (2 agents; hardcoded empty array is definitive; POC-PASS)

**Description**:
`PendleAdapter.claimRewards()` hardcodes an empty array for YT (Yield Token) addresses when calling Pendle's `redeemDueInterestAndRewards`. Pendle tracks YT interest yield separately from LP rewards and requires the YT addresses to be explicitly provided. Because `emptyYts = new address[](0)` is always passed, all YT interest yield permanently accumulates in the Pendle protocol and is never transferred to any vault.

```solidity
// PendleAdapter.sol:L772-780
address[] memory emptySys = new address[](0);
address[] memory emptyYts = new address[](0);  // hardcoded empty; YT interest never claimed

IPendleRouter(pendleRouter).redeemDueInterestAndRewards(
    address(this), emptySys, emptyYts, markets  // YT addresses never passed
);
```

The YT address for any market is retrievable via `IPendleMarket(market).readTokens()` which returns `(SY, PT, YT)`.

**Impact**:
All YT interest yield earned by vaults holding YT positions through PendleAdapter is permanently uncollectable. Every block where interest accrues to YT positions is value permanently left in the Pendle protocol. For a vault holding YT positions on a market yielding 10% APY, the effective YT return is 0%.

**PoC Result**:
Test `test_H11_emptyYTsArrayPreventsYTInterestClaim` confirmed `redeemDueInterestAndRewards` was called with emptyYts.length=0 and no YT interest was transferred. POC-PASS.

```
YTs passed to redeemDueInterestAndRewards: 0
HARM: All YT interest yield accumulates in Pendle protocol, never reaching vault
Location: PendleAdapter.sol:L774 - emptyYts = new address[](0)
```

**Recommendation**:
```diff
- address[] memory emptyYts = new address[](0);
+ address[] memory ytAddresses = new address[](markets.length);
+ for (uint256 i = 0; i < markets.length; i++) {
+     (, , address ytAddr) = IPendleMarket(markets[i]).readTokens();
+     ytAddresses[i] = ytAddr;
+ }
  IPendleRouter(pendleRouter).redeemDueInterestAndRewards(
-     address(this), emptySys, emptyYts, markets
+     address(this), emptySys, ytAddresses, markets
  );
```

---

### [M-03] Compound Pendle Yield Loss — LP Reward First-Caller Race Combined With YT Interest Black Hole [VERIFIED]

**Severity**: Medium
**Location**: `src/adapters/PendleAdapter.sol:L749-807`
**Confidence**: HIGH (compound of two confirmed findings)

**Description**:
M-01 and M-02 operate simultaneously through `PendleAdapter`, creating two independent yield loss channels that compound into near-total Pendle yield loss. A vault using PendleAdapter for both LP and YT strategies faces:

1. **YT interest black hole** (see M-02): 100% of YT interest yield is permanently unrecoverable. Active from deployment, affects every position at all times.
2. **LP reward race** (see M-01): In any epoch where only one vault claims, remaining vaults' pro-rata share of LP rewards is permanently stranded.

These are not competing failure modes — both affect every multi-vault Pendle deployment simultaneously.

**Impact**:
A vault deploying capital to Pendle LP and YT strategies through this adapter receives zero YT interest returns and reduced LP rewards depending on claiming cadence relative to other registered vaults. The compound effect means expected economic returns from Pendle strategies are materially misrepresented to depositors. In a two-vault deployment: 50% LP reward stranding + 100% YT interest loss = the majority of Pendle yield is unrecoverable.

**PoC Result**:
Both component findings verified independently. No additional PoC required for the compound finding.

**Recommendation**:
Fix both root causes independently per the recommendations in M-01 and M-02. After fixes, verify multi-vault deployments correctly distribute both LP rewards and YT interest across multiple claim epochs.

---

### [M-04] Shared maxOracleAge Controls Both Price Oracle and Bond Attestation Freshness [VERIFIED]

**Severity**: Medium
**Location**: `src/OptimisticKernelVault.sol:L207-251`
**Confidence**: HIGH (2 agents; CODE-TRACE)

**Description**:
`OptimisticKernelVault._verifyOptimisticOracleAndBond()` uses the single `maxOracleAge` parameter for two orthogonal freshness requirements: price oracle freshness (Role A) and bond attestation validity (Role B).

```solidity
// OptimisticKernelVault.sol:L207-251
OracleVerifier.requireValidOracleSignatureBound(
    ...
    maxOracleAge   // L215: Role A — price oracle (should be minutes-fresh)
);

OracleVerifier.requireValidBondAttestation(
    ...
    maxOracleAge   // L250: Role B — bond attestation (inherently hours-to-days old due to L1 finality)
);
```

Price oracle signatures should be minutes-fresh to prevent stale-price execution. Bond attestations are tied to L1 finality and relay scheduling, inherently hours-to-days old. Setting `maxOracleAge` to accommodate bond relay latency (e.g., 24 hours) accepts price oracle signatures that are 24 hours stale — a period during which ETH price regularly moves 10%+.

**Impact**:
Vault operators face an irreconcilable tension: `maxOracleAge` set for bond relay (24h) accepts price oracle signatures that may misvalue vault assets by 10%+, enabling execution against significantly stale prices. Setting it for price freshness (15 min) breaks bond attestation workflows. There is no configuration that correctly satisfies both requirements simultaneously.

**PoC Result**:
Code trace confirmed both L215 and L250 reference the same `maxOracleAge` storage slot. Test quantified 1000 BPS (10%) price divergence over a 24-hour window. CODE-TRACE.

**Recommendation**:
```diff
+ uint64 public maxBondAttestationAge;

+ function setMaxBondAttestationAge(uint64 _maxAge) external onlyOwner {
+     maxBondAttestationAge = _maxAge;
+ }

  OracleVerifier.requireValidBondAttestation(
      ...
-     maxOracleAge
+     maxBondAttestationAge
  );
```
Set `maxOracleAge` to match price feed freshness requirements (minutes) and `maxBondAttestationAge` to match bond relay timing (hours).

---

### [M-05] UniswapV4Adapter Emergency Withdrawal Has Zero Slippage Protection [VERIFIED]

**Severity**: Medium
**Location**: `src/adapters/UniswapV4Adapter.sol:L563-606`
**Confidence**: HIGH (2 agents; POC-PASS)

**Description**:
`UniswapV4Adapter.withdrawToVault()` calls `decreaseLiquidity` with explicitly hardcoded `amount0Min: 0, amount1Min: 0`. The code comment acknowledges this: "Emergency — accept any amount." MEV bots can observe the pending transaction and sandwich it: sell one token before the call (moving the price), allow the adapter to remove liquidity at the unfavorable price, then buy back afterward, extracting 5–10%+ of the LP position value.

```solidity
// UniswapV4Adapter.sol:L579-588
INonfungiblePositionManager(positionManager).decreaseLiquidity(
    INonfungiblePositionManager.DecreaseLiquidityParams({
        tokenId: positionId,
        liquidity: liquidity,
        amount0Min: 0,          // explicit zero slippage
        amount1Min: 0,          // explicit zero slippage
        deadline: block.timestamp
    })
);
```

The adapter already stores per-vault `slippageBps` (set via `setSlippage`) used for normal liquidity operations. The emergency path ignores it.

**Impact**:
On a $2M LP position, a sandwich attack can extract $100,000–$200,000 in a single transaction. The emergency path is the most vulnerable because it removes all liquidity at once, maximizing sandwich profitability. This loss is borne by depositors — precisely the population already in distress during an emergency withdrawal.

**PoC Result**:
Test `test_H14_zeroSlippageInEmergencyWithdrawal` confirmed amount0Min=0 and amount1Min=0 are passed. Estimated $100,000 MEV extraction on $2M position. POC-PASS.

**Recommendation**:
Use the vault's stored `slippageBps` configuration to compute minimum amounts:
```diff
- amount0Min: 0, // Emergency — accept any amount
- amount1Min: 0,
+ amount0Min: _computeMinAmount(token0, amount0Expected, vaultConfigs[msg.sender].slippageBps),
+ amount1Min: _computeMinAmount(token1, amount1Expected, vaultConfigs[msg.sender].slippageBps),
```
Compute `amount0Expected` and `amount1Expected` from TWAP price and current liquidity. A reasonable emergency slippage floor (e.g., 100 bps) protects against sandwiching while still allowing emergency withdrawals to execute.

---

### [M-06] CoreWriter Non-Atomicity Creates strategyActive Desync With No On-Chain Recovery Path [VERIFIED]

**Severity**: Medium
**Location**: `src/KernelVault.sol:L1313-1319`, `src/adapters/TradingSubAccount.sol:L228-229`
**Confidence**: HIGH (well-documented HyperEVM behavior; CODE-TRACE)

**Description**:
When a vault executes an `openPosition` action, `KernelVault._executeTransferERC20` commits EVM state (`strategyActive = true`, `snapshotTotalAssets`, `snapshotTotalShares`) atomically. However, `TradingSubAccount.sendRawAction` is a fire-and-forget call to the CoreWriter precompile — HyperCore processes the order asynchronously after EVM block finalization without providing any on-chain success/failure signal.

```solidity
// KernelVault.sol:L1313-1319 — strategyActive committed before HyperCore result
uint256 balanceAfter = totalAssets();
if (!strategyActive && balanceAfter < balanceBefore) {
    snapshotTotalAssets = balanceBefore;
    snapshotTotalShares = totalShares;
    strategyActive = true;          // committed unconditionally
    strategyActivatedAt = block.timestamp;
}

// TradingSubAccount.sol:L228-229 — fire-and-forget; never reverts on failure
bytes memory data = _packCoreWriterAction(ACTION_LIMIT_ORDER, encodedAction);
ICoreWriter(CORE_WRITER).sendRawAction(data);
```

If HyperCore silently rejects the order (price band violation, insufficient HYPE gas, async margin not yet settled), the vault has `strategyActive = true` but zero HyperCore position. This is a documented production failure mode.

**Impact**:
The vault enters a desynchronized state: deposits blocked, PPS locked at pre-execution snapshot, and USDC stranded in the `TradingSubAccount` — while the actual HyperCore position is zero. There is no on-chain mechanism to detect this desync. The vault owner must manually reconcile via off-chain HyperCore API inspection and call `settle()`. If the owner is unresponsive, depositors must wait 7 days for `emergencySettle()`. During this time, no new deposits are accepted and the vault operates against stale PPS snapshots.

**PoC Result**:
CoreWriter is a HyperEVM precompile and cannot be mocked in standard Foundry. CODE-TRACE: the EVM state transition at L1314-1319 is unconditional regardless of `sendRawAction` outcome.

**Recommendation**:
Add an owner-callable function to reset `strategyActive` when the owner has verified off-chain that no actual HyperCore position exists:
```diff
+ function resetStrategyIfDesync() external {
+     if (msg.sender != owner) revert NotOwner();
+     if (!strategyActive) revert StrategyNotActive();
+     _settle();
+     emit StrategyDesyncReset();
+ }
```
Consider adding a HyperCore position precompile read to make the detection automatable. The existing `OrderIntentSubmitted` event provides the off-chain paper trail for auditing.

---

### [M-07] MetaVault Deposit Front-Running Around Profitable Execution Window [PARTIAL]

**Severity**: Medium
**Location**: `src/MetaVault.sol:L172-193`
**Confidence**: MEDIUM (economic argument confirmed; HyperEVM reduces practical feasibility)

**Description**:
`MetaVault.deposit()` prices shares against `getNav()` — the current sum of idle balance and underlying vault allocations — with no deposit holding period or commitment queue. When an underlying `KernelVault` is about to execute a profitable agent action, a depositor who enters immediately before execution captures a pro-rata share of the profit at zero execution risk.

```solidity
// MetaVault.sol:L175-183
uint256 nav = getNav();    // NAV at deposit time, before execution

uint256 actualReceived = ...;  // actual assets transferred

// shares priced at pre-execution NAV; immediately redeemable at post-execution NAV
sharesOut = (actualReceived * (totalShares + DECIMALS_OFFSET)) / (nav + 1);
```

On HyperEVM (no public mempool, block proposer controls ordering), classic front-running by external users via gas-price manipulation is not feasible. The risk is primarily from the vault operator or any party with knowledge of upcoming execution timing. Additionally, if NAV collapses to 0 while `totalShares > 0`, the share mint calculation at `(nav + 1)` produces inflated shares.

**Impact**:
Informed parties can extract value from existing depositors by timing deposits around profitable executions. On a $1M NAV vault where execution adds 10% ($100k profit), a $100k front-run deposit captures approximately $9,090 of existing depositors' profit. The NAV=0 edge case enables extreme share inflation when all underlying vault values collapse simultaneously.

**PoC Result**:
Mathematical proof of economic dilution confirmed via code trace. HyperEVM front-running not mechanically testable. CODE-TRACE.

**Recommendation**:
Implement a minimum holding period before withdrawal is permitted (e.g., 1 epoch boundary), making timing-based arbitrage unprofitable. Guard the deposit function against the NAV=0 edge case:
```diff
+ if (nav == 0 && totalShares > 0) revert ZeroNAVWithExistingShares();
```
Alternatively, implement a deposit queue where deposits entered during the current epoch are priced at the NEXT epoch's NAV.

---

### [M-08] MetaVault Emergency Withdraw Burns All Shares Before Attempting Asset Recovery [VERIFIED]

**Severity**: Medium
**Location**: `src/MetaVault.sol:L304-344`
**Confidence**: MEDIUM (confirmed accounting; CODE-TRACE)

**Description**:
`MetaVault.emergencyWithdraw()` burns the caller's MetaVault shares unconditionally at L304-305 before iterating over underlying vaults to recover assets. If any underlying `KernelVault` reverts on its `emergencyWithdraw` call (paused, strategy active, or frozen), the caller's shares are permanently burned while they receive only partial asset recovery.

```solidity
// MetaVault.sol:L304-344
// Burn the caller's MetaVault shares up front.
shares[msg.sender] -= metaShares;          // L304 — shares burned unconditionally
totalShares = totalSharesBefore - metaShares;  // L305

// Step 2 — attempt per-vault recovery with try/catch
for (uint256 i = 0; i < len; i++) {
    ...
    try this._emergencyWithdrawExternal(vault, kvSharesToBurn) {
        ...
    } catch {
        emit UnderlyingWithdrawFailed(vault, kvSharesToBurn);
        // Shares already burned; no recourse for failed underlying
    }
}
```

**Impact**:
A MetaVault depositor with $10,000 worth of shares calls `emergencyWithdraw` during a crisis. One of three underlying KernelVaults (holding 33% of MetaVault's allocation) is paused and reverts. The caller receives $6,667 in assets while their full $10,000 worth of shares is burned — the remaining $3,333 claim is permanently lost. This occurs during emergencies, precisely when underlying vaults are most likely to be frozen or in distress.

**PoC Result**:
Code trace with concrete values: $5,000 lost when one underlying vault reverts, with all shares burned prior. CODE-TRACE.

**Recommendation**:
Separate share burning from asset recovery by tracking partial burns based on successful recoveries:
```diff
+ uint256 sharesRemaining = metaShares;

  for (uint256 i = 0; i < len; i++) {
      try this._emergencyWithdrawExternal(vault, kvSharesToBurn) {
+         uint256 sharesConsumed = (kvSharesToBurn * metaShares) / ...;
+         shares[msg.sender] -= sharesConsumed;
+         totalShares -= sharesConsumed;
+         sharesRemaining -= sharesConsumed;
      } catch {
          emit UnderlyingWithdrawFailed(vault, kvSharesToBurn);
          // Shares NOT burned for failed vault — caller retains claim
      }
  }
```
Alternatively, add a `recoverPartialWithdraw()` function that re-mints shares for failed underlying withdrawals, allowing retry when the underlying vault recovers.

---

### [M-09] AaveV3Adapter Accrued Interest Permanently Stranded — No Harvest Function Exists [VERIFIED]

**Severity**: Medium
**Location**: `src/adapters/AaveV3Adapter.sol:L147-150, L476-506`
**Confidence**: HIGH (2 agents; definitive code trace; CODE-TRACE)

**Description**:
`AaveV3Adapter` tracks vault supply positions using `_vaultSupplied[vault][asset]`, recording only the principal deposited. Aave aTokens accrue interest continuously, increasing the underlying balance beyond tracked principal. `withdrawToVault()` pulls only the tracked principal — never accrued interest.

```solidity
// AaveV3Adapter.sol:L147-150 — explicitly documented limitation
/// @dev Enforces isolation on the shared Aave account: a vault may only withdraw
///      up to the amount it supplied. Interest accrual is retained in the adapter
///      until a protocol-level rebase distribution is implemented.
mapping(address vault => mapping(address asset => uint256)) internal _vaultSupplied;

// AaveV3Adapter.sol:L486-492 — caps withdrawal at tracked principal
uint256 tracked = _vaultSupplied[msg.sender][asset];
if (tracked > 0) {
    _vaultSupplied[msg.sender][asset] = 0;
    try pool.withdraw(asset, tracked, msg.sender) returns (uint256) {
        // Withdraws exactly `tracked` (principal) — interest stays in adapter
    }
}
```

No `harvestInterest()`, `sweepAccruedInterest()`, or equivalent function exists anywhere in the codebase. The protocol-level rebase distribution referenced in the comment is not implemented.

**Impact**:
All accrued Aave interest on vault supply positions is permanently stranded in the adapter. At 5% APY on $100,000 principal: $5,000/year stranded, compounding. This is an ongoing loss affecting every vault that supplies assets through AaveV3Adapter. Stranded interest accumulates in the shared Aave account with no collection path attributable to any specific vault.

**PoC Result**:
Code trace: source code comment at L148-149 explicitly documents the limitation. No `harvestInterest` function exists. CODE-TRACE confirmed.

**Recommendation**:
Implement an interest harvest function:
```solidity
function harvestInterest(address asset) external {
    uint256 actualBalance = IERC20(aTokenFor(asset)).balanceOf(address(this));
    uint256 totalTracked = _totalTrackedSupply[asset]; // sum of all _vaultSupplied
    uint256 interest = actualBalance > totalTracked ? actualBalance - totalTracked : 0;
    if (interest > 0) {
        pool.withdraw(asset, interest, protocolTreasury);
        emit InterestHarvested(asset, interest);
    }
}
```
Alternatively, rebase `_vaultSupplied` periodically to include accrued interest, allowing vaults to withdraw their full earned yield including interest.

---

### [M-10] No Timelock on Oracle and Bond Signer Rotation — Instant Key Compromise Exploitation [VERIFIED]

**Severity**: Medium
**Location**: `src/KernelVault.sol:L581-614`
**Confidence**: HIGH (POC-PASS)

**Description**:
`KernelVault.setOracleSigner()` and `setBondSigner()` take effect instantly with no delay, pending period, or timelock. A compromised vault owner key can rotate both signers to attacker-controlled addresses in the same transaction, immediately enabling forged price oracle signatures or bond attestations.

```solidity
// KernelVault.sol:L581-594
function setOracleSigner(address _signer, uint64 _maxAge) external {
    if (msg.sender != owner) revert NotOwner();
    ...
    oracleSigner = _signer;   // takes effect immediately — zero delay
    maxOracleAge = _maxAge;
    emit OracleSignerUpdated(_signer, _maxAge);
}

function setBondSigner(address _signer) external {
    if (msg.sender != owner) revert NotOwner();
    ...
    bondSigner = _signer;     // takes effect immediately — zero delay
    emit BondSignerUpdated(_signer);
}
```

`KernelExecutionVerifier` enforces a 48-hour `UPGRADE_DELAY` for verifier rotation, acknowledging that trust root changes require advance notice. Oracle and bond signers are equally critical trust roots but lack equivalent protection.

**Impact**:
A single compromised vault owner key enables immediate exploitation with no time window for depositors or monitoring systems to detect and respond. The existing event emission (`OracleSignerUpdated`) provides on-chain notification but no actionable delay. The window between key compromise and exploit is reduced to a single block.

**PoC Result**:
Test `test_H20_instant_signer_rotation_no_timelock()` confirmed both signers were rotated to attacker addresses in the same block with zero delay. POC-PASS.

**Recommendation**:
Implement a two-step timelock for signer rotation, consistent with `KernelExecutionVerifier`'s existing `UPGRADE_DELAY` pattern:
```diff
+ address public pendingOracleSigner;
+ uint256 public oracleSignerActiveAt;
+ uint256 public constant SIGNER_ROTATION_DELAY = 48 hours;

+ function proposeOracleSigner(address _signer, uint64 _maxAge) external {
+     if (msg.sender != owner) revert NotOwner();
+     pendingOracleSigner = _signer;
+     oracleSignerActiveAt = block.timestamp + SIGNER_ROTATION_DELAY;
+     emit OracleSignerProposed(_signer, oracleSignerActiveAt);
+ }

+ function activateOracleSigner() external {
+     if (block.timestamp < oracleSignerActiveAt) revert TimelockActive();
+     oracleSigner = pendingOracleSigner;
+     emit OracleSignerUpdated(oracleSigner, maxOracleAge);
+ }
```
Apply the same pattern to `setBondSigner`. This gives depositors a 48-hour exit window on any suspicious signer change.

---

### [M-11] uint64 Execution Nonce Overflow Permanently Bricks Vault [VERIFIED]

**Severity**: Medium
**Location**: `src/KernelVault.sol:L1013-1023`
**Confidence**: MEDIUM (theoretical; reachable via buggy or malicious zkVM guest; POC-PASS)

**Description**:
`KernelVault` stores `lastExecutionNonce` as `uint64`. The nonce validation requires `providedNonce > lastNonce`. If `lastExecutionNonce` reaches `type(uint64).max`, no valid `uint64` value can satisfy the strict greater-than condition, permanently preventing future `execute()` calls.

```solidity
// KernelVault.sol:L1013-1023
uint64 lastNonce = lastExecutionNonce;
providedNonce = parsed.executionNonce;

if (providedNonce <= lastNonce) {
    revert InvalidNonce(lastNonce, providedNonce);  // always reverts if lastNonce = MAX
}

uint64 gap = providedNonce - lastNonce;
if (gap > MAX_NONCE_GAP) {
    revert NonceGapTooLarge(lastNonce, providedNonce, MAX_NONCE_GAP);
}
```

While normal operation at one execution per minute would take 35,000 years to reach overflow, the zkVM guest controls the nonce value in `KernelJournalV1`. A buggy agent could produce near-maximum nonces or advance through large-gap increments (up to `MAX_NONCE_GAP = 10` per execution). The lack of an overflow guard leaves the vault permanently bricked with no recovery path if this threshold is reached.

**Impact**:
Vault permanently unexecutable. All assets remain accessible via withdrawal (if not in strategy), but the vault can never execute agent actions again. Recovery requires deploying a new vault and migrating assets — a process requiring the agent to be re-registered with the new vault's address.

**PoC Result**:
Test `test_H22_nonce_overflow_bricks_vault()` used `vm.store` to set `lastExecutionNonce = type(uint64).max - 1`. Confirmed: final execute at `type(uint64).max` succeeds, then vault permanently reverts `InvalidNonce(MAX, MAX)`. POC-PASS.

**Recommendation**:
```diff
  uint64 gap = providedNonce - lastNonce;
  if (gap > MAX_NONCE_GAP) {
      revert NonceGapTooLarge(lastNonce, providedNonce, MAX_NONCE_GAP);
  }
+ if (providedNonce > type(uint64).max - MAX_NONCE_GAP) {
+     revert NonceGapTooLarge(lastNonce, providedNonce, MAX_NONCE_GAP);
+ }
```
This prevents accepting nonces within `MAX_NONCE_GAP` of overflow, giving operators time to detect and address the situation before the vault is permanently bricked.

---

### [M-12] MAX_ACTIONS_PER_OUTPUT Full Load Exceeds HyperEVM 3M Block Gas Limit [VERIFIED]

**Severity**: Medium
**Location**: `src/KernelOutputParser.sol:L18-22, L164-167`
**Confidence**: HIGH (measured gas on live contract; POC-PASS)

**Description**:
`KernelOutputParser.parseActions()` copies action payloads using a byte-by-byte loop consuming approximately 40 gas per byte. The constants allow up to 64 actions (`MAX_ACTIONS_PER_OUTPUT`) each with up to 16,384 bytes (`MAX_ACTION_PAYLOAD_BYTES`). HyperEVM enforces a hard 3,000,000 block gas limit.

```solidity
// KernelOutputParser.sol:L18-22
uint256 public constant MAX_ACTIONS_PER_OUTPUT = 64;
uint256 public constant MAX_ACTION_PAYLOAD_BYTES = 16_384;

// KernelOutputParser.sol:L164-167 — byte-by-byte copy loop
bytes memory payload = new bytes(payloadLen);
for (uint256 j = 0; j < payloadLen; j++) {
    payload[j] = data[offset + j];   // ~40 gas per byte
}
```

At 10 actions x 1KB payloads: **2,731,819 gas** — 91% of the block limit before any `execute()` action processing. At maximum configuration (64 actions x 16KB), extrapolated gas exceeds 262M — 87x the block limit.

**Impact**:
Any `execute()` call with more than approximately 10 actions or large payloads is permanently unexecutable on HyperEVM. A malicious or buggy agent producing a maximally-packed output can render the vault permanently inoperable (the proof is valid, the vault cannot process it, and depositors are locked during strategy until `emergencySettle` after 7 days). Legitimate agents approaching the limit may encounter silent execution failures.

**PoC Result**:
Test `test_H23_byte_copy_gas_measured()` measured 2,731,819 gas for 10x1KB on the live `KernelOutputParser`. POC-PASS.

```
10 actions x 1KB payload = parseActions() gas: 2,731,819
Extrapolated to 64 actions x 16KB: 262,254,624 gas (87x over HyperEVM limit)
```

**Recommendation**:
1. Reduce constants to HyperEVM-compatible limits (establish through gas profiling, e.g., `MAX_ACTIONS_PER_OUTPUT = 10`, `MAX_ACTION_PAYLOAD_BYTES = 1,024`).
2. Replace the byte-by-byte loop with assembly bulk copy:
```diff
- bytes memory payload = new bytes(payloadLen);
- for (uint256 j = 0; j < payloadLen; j++) {
-     payload[j] = data[offset + j];
- }
+ bytes memory payload = new bytes(payloadLen);
+ assembly { calldatacopy(add(payload, 32), add(data.offset, offset), payloadLen) }
```
Both changes should be applied together. The constant reduction provides a hard safety bound; assembly copy reduces gas approximately 10x for large payloads.

---

### [M-13] Fee Cap Excludes Protocol Split — Effective Depositor Fee Can Exceed 70% of Gross Yield [VERIFIED]

**Severity**: Medium
**Location**: `src/KernelVault.sol:L284-303, L684-690`
**Confidence**: HIGH (concrete economic calculation; POC-PASS)

**Description**:
`KernelVault` enforces `MAX_COMBINED_FEE_BPS = 5000` (50%) on the sum of `managementFeeBps` and `performanceFeeBps`. However, `protocolFeeSplitBps` (up to 5000 bps, 50% of all fees) is applied on top of the combined fees after the cap — and is NOT included in the `MAX_COMBINED_FEE_BPS` check.

```solidity
// KernelVault.sol:L299-303
/// Hard cap on combined (management + performance) fee extraction.
/// 5000 bps = 50%. Does NOT include protocolFeeSplitBps.
uint256 public constant MAX_COMBINED_FEE_BPS = 5000;

// KernelVault.sol:L686-690
function setFees(uint256 mgmtBps, uint256 perfBps) external {
    if (mgmtBps + perfBps > MAX_COMBINED_FEE_BPS) {
        revert CombinedFeeTooHigh(...);   // protocolFeeSplitBps not in this check
    }
```

At maximum settings (500 bps management + 4500 bps performance + 5000 bps protocol split) with 10% gross yield on $100,000:
- Management fee: $5,000
- Performance fee on remaining yield: 45% x $5,000 = $2,250
- Protocol split: 50% x ($5,000 + $2,250) = $3,625
- **Effective extraction: $7,250 / $10,000 = 72.5% of gross yield**
- **Depositor net: 2.75% annual return despite 10% gross yield**

**Impact**:
Depositors evaluating the stated 50% combined fee cap as the upper bound will be materially misled. At 5% gross yield, the management fee alone ($5,000 on $100,000) fully consumes all yield, leaving the depositor with 0% net return. The protocol split compounds this to negative effective returns. The gap between stated cap (50%) and actual maximum extraction (72.5%+) is a material disclosure gap.

**PoC Result**:
Test `test_H24_negative_depositor_return_quantified()` proved: at 10% gross yield with maximum fees, 72.5% of yield is extracted (exceeding the stated 50% cap). POC-PASS.

**Recommendation**:
Include the effective protocol split in the combined fee cap enforcement:
```diff
  function setFees(uint256 mgmtBps, uint256 perfBps) external {
+     uint256 effectiveCombined = (mgmtBps + perfBps) +
+         ((mgmtBps + perfBps) * protocolFeeSplitBps / BPS_DENOMINATOR);
+     if (effectiveCombined > MAX_COMBINED_FEE_BPS) {
+         revert CombinedFeeTooHigh(effectiveCombined, MAX_COMBINED_FEE_BPS);
+     }
-     if (mgmtBps + perfBps > MAX_COMBINED_FEE_BPS) {
-         revert CombinedFeeTooHigh(mgmtBps + perfBps, MAX_COMBINED_FEE_BPS);
-     }
```
Alternatively, lower `MAX_COMBINED_FEE_BPS` to account for the maximum protocol split, or require `setFees` and `setProtocolFeeSplit` to jointly enforce an effective extraction cap.

---

### [M-14] Emergency Settle Clears Strategy Flag Without Recovering Assets From Adapters [VERIFIED]

**Severity**: Medium
**Location**: `src/KernelVault.sol:L1452-1458, L1690-1708`
**Confidence**: HIGH (definitive code trace; POC-PASS)

**Description**:
`KernelVault.emergencySettle()` calls `_settle()` after the 7-day `EMERGENCY_SETTLE_DELAY`. `_settle()` clears `strategyActive`, `snapshotTotalAssets`, `snapshotTotalShares`, and `strategyActivatedAt` — but performs no asset recovery from external adapters.

```solidity
// KernelVault.sol:L1452-1458
function emergencySettle() external {
    if (!strategyActive) revert StrategyNotActive();
    ...
    _settle();   // only clears EVM state flags
}

// KernelVault.sol:L1690-1697 — _settle() does not touch adapters
function _settle() internal virtual {
    strategyActive = false;
    snapshotTotalAssets = 0;
    snapshotTotalShares = 0;
    strategyActivatedAt = 0;
    ...
    // No adapter.withdrawToVault() calls — assets remain stranded
}
```

After `emergencySettle()`, `strategyActive = false` re-enables withdrawals. However, `totalAssets()` reads only vault-held tokens. USDC stranded in an `AaveV3Adapter`, `MorphoAdapter`, `PendleAdapter`, or `TradingSubAccount` is not included and is inaccessible to depositors.

**Impact**:
If a vault sent 40% of assets to an external adapter and the owner then disappeared: after 7 days, `emergencySettle()` succeeds, depositors can withdraw, but they can only recover the 60% still in the vault contract. The remaining 40% requires adapter-specific exit functions that only the owner can call — the same owner who has abandoned the vault. These assets are effectively permanently stranded without an additional recovery mechanism.

**PoC Result**:
Test `test_H25_emergency_settle_does_not_pull_assets()` confirmed: after `emergencySettle`, 4,000 USDC remained in the adapter while the vault held 6,000 USDC. Users owning 10,000-USDC-worth of shares could only recover 6,000. POC-PASS.

```
vault.totalAssets() = 6,000 USDC (adapter funds excluded)
adapter balance = 4,000 USDC (permanently stranded, not recoverable via emergencySettle)
```

**Recommendation**:
```diff
  function _settle() internal virtual {
+     // Best-effort: attempt to pull from registered adapters before clearing flags
+     address[] memory _adapters = registeredAdapters;
+     for (uint256 i = 0; i < _adapters.length; i++) {
+         try IAdapter(_adapters[i]).withdrawToVault() {} catch {}
+     }
      strategyActive = false;
      snapshotTotalAssets = 0;
      ...
  }
```
At minimum, add a separate public `emergencyRecoverAdapter(address adapter)` function callable by anyone after `EMERGENCY_SETTLE_DELAY`, allowing community members to recover stranded adapter assets on behalf of depositors when the owner is absent.
