# Meta-Buffer: Tokamak Execution Kernel (vault + optimistic cross-chain)

**Generated**: 2026-04-13
**RAG Source**: CODE ANALYSIS FALLBACK (unified-vuln-db MCP not available in this environment)
**Coverage**: Full source code review of all 33 Solidity contracts

---

## Protocol Classification

- **Type**: vault (primary) with optimistic cross-chain execution, staking, and multi-protocol DeFi adapter integrations
- **Key Indicators**: ERC4626-like shares, RISC Zero zkVM proof verification, optimistic execution with WSTON bonds, cross-chain bond attestation (L1↔HyperEVM), MetaVault (vault-of-vaults), DeFi adapters (Aave, Lido, Morpho, Pendle, Uniswap V4, Polymarket, Hyperliquid)
- **Trust Model**: owner (FULLY_TRUSTED), oracleSigner/Role A (SEMI_TRUSTED price), bondSigner/Role B (FULLY_TRUSTED bond), trustedRelayer (FULLY_TRUSTED cross-chain)
- **Execution Modes**: synchronous (proof required), optimistic (immediate with bond + bond attestation, proof deferred)

---

## Prior Fix History (Annotated from Source Comments)

The source contains extensive fix-commentary indicating this codebase has been through at least one audit cycle. Known-fixed issues provide strong signals for adjacent unresolved risks:

### Critical-tier fixes (already applied)
- **C-01**: Zero-bond optimistic execution — `minBond == 0` bypass in `_verifyOptimisticOracleAndBond`
- **C-02**: Dual-role oracle signer separation — `oracleSigner` (Role A) vs `bondSigner` (Role B) now separate
- **C-03**: RISC Zero CVE-2025-52484 — verifier rotation allowlist (48-hour timelock)
- **C-04**: Per-CALL action ETH value cap (MAX_CALL_VALUE_BPS=40%) + post-call asset delta cap

### High-tier fixes (already applied)
- **H-01**: Settle-race with fees in OptimisticKernelVault — `_settle()` blocks while `_pendingCount > 0`
- **H-02**: Cross-chain slash-pending race in WSTONBondManager — `slashPending` flag prevents `reclaimExpiredBond` bypass
- **H-03**: Clear-then-set relayer rotation bypass in WSTONBondManager — `relayerInitialized` one-way flag

### Medium-tier fixes (already applied)
- M-07, M-08, M-09, M-10, M-11, M-14, M-16, M-17, M-23, M-24, M-25 (referenced in comments)

### Low-tier fixes (already applied)
- L-03, L-04, L-05, L-06, L-10, L-11, L-12, L-26, L-27, L-29, L-31, L-43, L-49, L-51, L-52

---

## Common Vulnerabilities for ERC4626-Like Vault

### ERC4626 Share Inflation / First Depositor
- Virtual offset `DECIMALS_OFFSET = 1e3` is applied in BOTH deposit and withdraw formulas in KernelVault and MetaVault
- MetaVault uses `trackedIdle` (not raw `balanceOf`) to prevent donation inflation
- **Residual risk**: Initial PPS (`initialPps`) set once on first deposit — if PPS is stale at re-activation, performance fee baseline may be miscalibrated

### Vault Share Price Manipulation
- Strategy snapshots (`snapshotTotalAssets`, `snapshotTotalShares`) freeze PPS during active strategy
- MetaVault uses `effectiveTotalAssets()` (frozen during strategy) for NAV pricing
- **Residual risk**: If strategy is active but `snapshotTotalAssets == 0` (edge case at initialization), NAV collapses

### Fee Extraction Attacks
- FEE_CHANGE_COOLDOWN = 7 days prevents atomic fee-raise + execute
- MAX_COMBINED_FEE_BPS = 5000 (50%) caps combined mgmt+perf fee
- **Residual risk**: `setFeeRecipient` has a SEPARATE cooldown (`lastFeeRecipientChange`) — race between fee rate change and recipient change possible if not synchronized

### Reentrancy
- ReentrancyGuard on all state-modifying externals
- `_executeCall` checks asset delta POST-call — reentrancy during ETH call could bypass single-action cap but NOT the cumulative `_executionInitialBalance` cap

---

## Attack Vectors for Key Components

### OptimisticKernelVault (High-risk area)
1. **Bond attestation forgery**: Requires `bondSigner` key compromise (FULLY_TRUSTED). Already mitigated by role separation.
2. **Challenge window race**: `submitProof` vs `slashExpired` at deadline — fixed by strict `>=` in `submitProof`.
3. **Self-slash bypass**: Owner can call `selfSlash` to avoid economic penalty but does decrement `_pendingCount`, so settle is re-enabled. Impact: owner avoids slash distribution but bond is still marked slashed.
4. **Pending count manipulation**: `executeOptimistic` increments `_pendingCount`; if overflow (unlikely — capped at MAX_MAX_PENDING=10) or `slashExpired` fails, settle is permanently blocked.
5. **Nonce squatting via gap**: MAX_NONCE_GAP=10 means operator can skip up to 10 nonces legitimately.

### WSTONBondManager (Cross-chain trust)
1. **Relayer compromise**: `trustedRelayer` can release OR slash any bond. Single point of failure for cross-chain integrity.
2. **`markSlashPending` permissioning**: Uses `require(msg.sender == trustedRelayer || msg.sender == owner, "not relayer or owner")` — NOT a custom error, inconsistent with rest of contract's error style.
3. **Treasury re-routing**: `slashBondByRelayer` sends depositor 80% share to treasury as escrow. If treasury is compromised/zero, funds stuck.
4. **BOND_EXPIRY (90 days) + `slashPending` flag**: If relayer never calls `slashBondByRelayer` after marking pending, bond is permanently frozen (no expiry path).
5. **`lockBondBatch` overflow**: Accumulates `totalAmount` without per-item overflow check (Solidity 0.8.24 auto-checks).

### KernelVault (Core execution)
1. **`_executeCall` asset delta cap bypass**: Multiple CALL actions in one journal — cap is based on `_executionInitialBalance` (set once at start of `_executeActions`), so cumulative drain IS bounded at 40%. But if vault holds mixed ERC20+ETH, the ERC20 delta cap and ETH value cap are checked independently — a CALL could drain 40% ERC20 AND 40% ETH simultaneously.
2. **Oracle age bypass**: `maxOracleAge == 0` disables age check (documented). `requireOracle == false` + no oracleSigner → entirely unverified execution path (owner can call execute with any journal if oracle is not required).
3. **emergencyWithdraw timing**: Requires `block.timestamp >= pausedAt + EMERGENCY_WITHDRAW_DELAY`. If `pausedAt` is reset on unpause/repause, timer resets.
4. **Verifier rotation**: 48-hour timelock for verifier updates (C-03 fix). But what if CURRENT verifier is compromised? 48 hours of exposure window.

### MetaVault (Vault-of-vaults)
1. **NAV pricing during rebalance**: Uses `effectiveTotalAssets()` which returns frozen snapshot during active strategy. Attacker can deposit between strategy activation and rebalance to get favorable pricing.
2. **Rebalance slippage cap (MAX_REBALANCE_SLIPPAGE_BPS=200 bps = 2%)**: If underlying vault suffers >2% NAV drop during rebalance, rebalance reverts. Could be a griefing vector if an attacker can cause a specific vault to lose exactly 2%.
3. **`_withdrawFromUnderlyings` silently skips failed vaults** (L-26 fix): If an underlying vault's `withdraw` reverts, the event `UnderlyingWithdrawFailed` is emitted but processing continues. If ALL underlying vaults fail, `assetsOut` may be unfulfillable but shares are already deducted.
4. **Weight validation**: Weights must sum to 10000 BPS. If vault removal leaves orphan weights, `setWeights` must be called explicitly.

### Adapters (DeFi integration)
1. **MorphoAdapter**: Registered vaults can supply/borrow/collateral. Health check in `UnhealthyPosition` error suggests LTV enforcement. Cross-vault collateral abuse mentioned in comments (line 451).
2. **HyperliquidAdapter**: Routes to `TradingSubAccount` via CoreWriter precompile. CoreWriter is non-atomic (async settlement) — all noted in MEMORY.md.
3. **VaultAccessControl**: `recordWithdrawal` decrements deposit counter allowing re-deposit up to cap. If called directly (not through vault), could manipulate caps.

---

## Root Cause Analysis (Vulnerability Classes)

### RC-1: Cross-Chain Trust Asymmetry
- **Root cause**: Bond locked on L1 (Ethereum), execution on HyperEVM (chain 999), relayer is a single trusted address
- **Attack class**: Relayer compromise → all pending bonds released/slashed at attacker's will
- **Grep pattern**: `trustedRelayer`, `onlyRelayer`, `releaseBondByRelayer`, `slashBondByRelayer`

### RC-2: State Snapshot Inconsistency  
- **Root cause**: `snapshotTotalAssets` / `snapshotTotalShares` set at strategy activation but stale if deposits/withdrawals happen before settlement
- **Attack class**: Share price dilution during active strategy; fee extraction based on incorrect baseline
- **Grep pattern**: `snapshotTotalAssets`, `snapshotTotalShares`, `strategyActive`, `_settle`

### RC-3: Admin Parameter Race
- **Root cause**: Most admin setters (fees, challenge window, max pending) have cooldowns or pending-count guards, but some transitions may allow race conditions
- **Attack class**: Fee front-running, challenge window shrinkage affecting pending executions
- **Grep pattern**: `setFees`, `setChallengeWindow`, `setMinBond`, `FEE_CHANGE_COOLDOWN`

### RC-4: Optimistic Execution Ordering
- **Root cause**: Multiple pending executions (up to maxPending=10) can be in flight simultaneously
- **Attack class**: Out-of-order settlement, nonce gap exploitation, pending count desync
- **Grep pattern**: `_pendingCount`, `pendingExecutions`, `executeOptimistic`, `MAX_NONCE_GAP`

### RC-5: Oracle Signature Replay / Staleness
- **Root cause**: Oracle timestamps are verified against `block.timestamp - maxOracleAge`. Cross-chain timestamp skew between L1 and HyperEVM.
- **Attack class**: Replay of valid oracle signatures across different vaults or chains
- **Grep pattern**: `oracleTimestamp`, `maxOracleAge`, `requireValidOracleSignatureBound`, `chainid`

### RC-6: Fee Accounting During Strategy  
- **Root cause**: Management fee accrues continuously (time-based), performance fee uses `highWaterMark`. During active strategy, `totalAssets()` does NOT include deployed assets (tracked via snapshot). Fee calculation may use stale NAV.
- **Grep pattern**: `_collectFees`, `highWaterMark`, `managementFeeBps`, `performanceFeeBps`, `strategyActive`

### RC-7: MetaVault Proportional Withdrawal Failure
- **Root cause**: `_withdrawFromUnderlyings` uses pro-rata pull from each vault. If an underlying vault is paused/settled/empty, the silent skip path (L-26) means withdrawer gets LESS than entitled.
- **Grep pattern**: `_withdrawFromUnderlyings`, `UnderlyingWithdrawFailed`, `WithdrawalShortfall`

---

## Questions for Analysis Agents

1. **Fee baseline during strategy**: When `strategyActive == true`, does `_collectFees` use `totalAssets()` (live, excludes deployed) or `effectiveTotalAssets()` (frozen snapshot)? Could fee extraction be inflated or deflated?

2. **Nonce gap exploitation**: With MAX_NONCE_GAP=10, can an operator submit nonce N+10, skip nonces N+1 through N+9, and execute profitable operations while making the skipped nonces permanently unexecutable?

3. **`selfSlash` economic bypass**: Owner calls `selfSlash` instead of letting `slashExpired` be called — does the on-chain event `ExecutionSlashed(nonce, address(0), bondAmount)` trigger the relayer to slash the L1 bond? If the relayer is offline, can owner self-slash + then claim back via 90-day expiry?

4. **MetaVault `emergencyWithdraw` and paused underlyings**: If all underlying KernelVaults are paused simultaneously, can a MetaVault depositor call `emergencyWithdraw` and get pro-rata assets from each? What if EMERGENCY_WITHDRAW_DELAY has not elapsed on any underlying?

5. **VaultAccessControl `recordWithdrawal` caller trust**: Only the vault should call `recordWithdrawal`. Is there an access check preventing an arbitrary EOA from calling it to inflate their remaining deposit cap?

6. **`lockBondBatch` without `totalBonded` pre-check**: Does the batch lock update `totalBonded` atomically? Can an operator with insufficient WSTON approval for the full batch cause a partial lock (some nonces locked, transfer reverts)?

7. **Oracle signature cross-vault replay**: `requireValidOracleSignatureBound` binds to `address(this)` — verified. But what about signature reuse across the SAME vault on different nonces within `maxOracleAge`?

8. **`markSlashPending` liveness**: If the relayer goes offline AFTER marking a bond as slash-pending but BEFORE calling `slashBondByRelayer`, the bond is permanently frozen (can't reclaim via expiry). Is there a recovery path?

9. **MorphoAdapter cross-vault collateral**: Comment at L451 mentions preventing cross-vault collateral abuse. Is the isolation enforced per-vault-per-market? Can vault A's collateral be used to borrow into vault B?

10. **BuilderProgram vesting cliff**: Is there a cliff on grant vesting? Can a builder claim immediately from `startTime` with a zero-cliff grant?

---

## Code Patterns to Grep

```
# Optimistic execution flow
executeOptimistic|submitProof|slashExpired|selfSlash|_pendingCount
bondAttestation|bondSigner|minBond|challengeWindow

# Cross-chain relay
trustedRelayer|releaseBondByRelayer|slashBondByRelayer|markSlashPending|slashPending
reclaimExpiredBond|BOND_EXPIRY|relayerInitialized

# Fee accounting
_collectFees|highWaterMark|managementFeeBps|performanceFeeBps
snapshotTotalAssets|strategyActive|effectiveTotalAssets

# MetaVault NAV
getNav|trackedIdle|_withdrawFromUnderlyings|rebalance
MAX_REBALANCE_SLIPPAGE_BPS|WithdrawalShortfall

# Oracle / proof verification
requireValidOracleSignatureBound|requireValidBondAttestation|oracleTimestamp
maxOracleAge|requireOracle|trustedImageId

# Access control
recordDeposit|recordWithdrawal|canDeposit|VaultAccessControl
authorizedRecorders|authorizedVaults

# Builder / Points / Referral
recordExecution|accruedPoints|referralPoints|vestingDuration|claimed

# Adapter trust
registerVault|unregisterVault|onlyRegisteredVault
```

---

## Key Invariants to Verify

1. **Shares invariant**: `totalShares == sum(shares[all accounts])` — must hold after every deposit/withdraw/fee collection
2. **Bond status invariant**: `sum(bonds[op][v][n].amount for all Locked bonds) == totalLockedGlobal`
3. **Pending count invariant**: `_pendingCount == count(pendingExecutions[n].status == STATUS_PENDING)`  
4. **Role separation invariant**: `bondSigner != address(0) && bondSigner != oracleSigner` when optimistic is enabled
5. **Nonce monotonicity**: `newNonce > lastExecutionNonce` AND `newNonce - lastExecutionNonce <= MAX_NONCE_GAP`
6. **Fee cooldown**: `block.timestamp >= lastFeeRateChange + FEE_CHANGE_COOLDOWN` before fee change
7. **MetaVault weight invariant**: `sum(targetWeights[v] for all v in underlyingVaults) == 10000` when vaults > 0
8. **Access control consistency**: `accessControl.recordWithdrawal` can only be called by the vault it was initialized for

---

## Codebase Statistics

| Component | Lines (est.) | Risk Level |
|-----------|-------------|-----------|
| KernelVault.sol | ~700 | CRITICAL |
| OptimisticKernelVault.sol | ~511 | CRITICAL |
| WSTONBondManager.sol | ~733 | HIGH |
| MetaVault.sol | ~600+ | HIGH |
| VaultFactory.sol | ~unknown | MEDIUM |
| AgentRegistry.sol | ~unknown | MEDIUM |
| KernelExecutionVerifier.sol | ~unknown | HIGH |
| KernelOutputParser.sol | ~unknown | HIGH |
| OracleVerifier.sol | ~unknown | HIGH |
| VaultAccessControl.sol | ~300 | MEDIUM |
| MorphoAdapter.sol | ~760+ | MEDIUM |
| HyperliquidAdapter.sol | ~unknown | MEDIUM |
| StakingRouter.sol | ~120+ | LOW |
| PointsProgram.sol | ~unknown | LOW |
| BuilderProgram.sol | ~unknown | LOW |
| ReferralManager.sol | ~unknown | LOW |

Total: ~33 Solidity files

---

## Fork Ancestry Analysis

### Detected Parents

| Parent | Confidence | Patterns Found |
|--------|-----------|---------------|
| OpenZeppelin | HIGH | `Ownable`, `AccessControl` (via UUPS), `Pausable`, `ReentrancyGuard`, `SafeERC20`, `IERC20`, `Initializable`, `UUPSUpgradeable`, ERC4626-style PPS math with `DECIMALS_OFFSET = 1e3` (virtual offset pattern) |
| ERC4626 (concept) | HIGH | KernelVault implements ERC4626-like shares/assets PPS accounting with virtual offset (`DECIMALS_OFFSET = 1e3`), deposit/withdraw share math, `totalAssets/totalShares` ratio pricing. NOT a direct ERC4626 inheritance — custom implementation. |
| RISC Zero | HIGH | `IRiscZeroVerifier`, `verifier.verify(seal, imageId, journalDigest)`, 209-byte `KernelJournalV1`, Groth16 proof verification. Direct dependency on RISC Zero verifier contracts. |
| Aave V3 | MEDIUM | `AaveV3Adapter` — adapter interface to external Aave V3 Pool (supply, borrow, repay, withdraw). NOT a fork of Aave; integrates with it as an external dependency. |
| Lido | MEDIUM | `LidoAdapter` — adapter interface to Lido stETH/wstETH (submit, wrap, unwrap, withdrawal queue). NOT a fork; external integration. |
| Morpho Blue | MEDIUM | `MorphoAdapter` — adapter interface to Morpho Blue (supply, withdraw, borrow, repay, supplyCollateral). NOT a fork; external integration. |
| Uniswap V4 | LOW | `UniswapV4Adapter` — adapter interface to Uniswap V4 Router/PositionManager. NOT a fork; external integration. |
| Pendle | LOW | `PendleAdapter` — adapter to Pendle Router (PT/YT minting, LP). NOT a fork; external integration. |
| Polymarket | LOW | `PolymarketAdapter` — adapter for CTF Exchange. Scaffolding/not production. |

**Git-based detection**: Origin is `tokamak-network/Tokamak-AI-Layer` — not a fork of any known parent organization. No `.gitmodules` present. This is an original codebase.

### Inherited Vulnerabilities to Verify

| # | Parent Issue | Severity | Location in Fork | Status |
|---|-------------|----------|------------------|--------|
| 1 | ERC4626 first-depositor inflation/donation attack | Critical | `KernelVault.sol` share/asset math (L835, L887) | VERIFIED_SAFE — Uses OpenZeppelin-style virtual offset (`DECIMALS_OFFSET = 1e3`) which prevents the classic first-depositor attack. Additionally, `trackedETHBalance` prevents donation attacks on ETH vaults. |
| 2 | CVE-2025-52484: RISC Zero underconstrained remu/divu opcodes | Critical | `KernelExecutionVerifier.sol` -> `IRiscZeroVerifier` | CHECK — Codebase explicitly references CVE-2025-52484 in C-03 fix comments. The fix adds verifier rotation with allowlist + 48h timelock. The vulnerability exists IF using risc0-zkvm 2.0.0-2.0.2. The codebase has a REMEDIATION PATH (C-03 rotation mechanism) but relies on operator diligence to rotate. Verify deployed verifier version. |
| 3 | CVE-2025-61588: RISC Zero sys_read RCE in guest | High | Rust `kernel-guest` crate (not Solidity) | CHECK — Affects zkVM guest execution. Fixed in risc0-zkvm 2.3.2 / 3.0.3. Verify Rust dependency version. |
| 4 | OpenZeppelin UUPS uninitialized implementation (2021) | Critical | `AgentRegistry.sol`, `VaultFactory.sol`, `KernelExecutionVerifier.sol` | VERIFIED_SAFE — All three contracts call `_disableInitializers()` in their constructors. |
| 5 | OpenZeppelin UUPS bricked proxy (missing ERC1822 compliance) | Medium | `AgentRegistry.sol`, `VaultFactory.sol`, `KernelExecutionVerifier.sol` | CHECK — Using OZ 4.x via `lib/risc0-ethereum/lib/openzeppelin-contracts/`. Verify OZ version >= 4.5 for ERC1822 check. |
| 6 | ERC4626 share price manipulation via donation | Medium | `MetaVault.sol` (L91: `trackedIdle`) | VERIFIED_SAFE — MetaVault uses internally-tracked idle balance (`trackedIdle`) rather than `balanceOf(this)`, preventing direct donation inflation. |

### Fork Divergences (Security-Critical)

| # | Component | Change | New Risk? |
|---|-----------|--------|-----------|
| 1 | ERC4626 vault (custom implementation) | KernelVault does NOT inherit OZ ERC4626. Implements own share/asset math with `DECIMALS_OFFSET = 1e3`. No standard ERC4626 compliance (no `convertToShares`, `convertToAssets`, `maxDeposit`, etc.). Separate ETH and ERC20 deposit paths. | LOW — Custom math is simpler and purpose-built. Lacks standard ERC4626 safety rails but has virtual offset. Fee-on-transfer support via balance-before/after is good. |
| 2 | UUPS upgrade (custom timelock added) | All three UUPS contracts add a 48h `scheduleImplementation` -> `activateUpgrade` timelock pattern ON TOP of OZ UUPS. This is NOT in the parent OZ implementation. | BENEFICIAL — Adds defense-in-depth. Creates new state consuming __gap slots. Verify gap arithmetic. |
| 3 | Ownership (custom two-step transfer) | All upgradeable contracts implement `transferOwnership` -> `acceptOwnership` pattern instead of OZ Ownable single-step transfer. | BENEFICIAL — Standard best practice. No new risk. |
| 4 | RISC Zero verifier (rotation mechanism) | Parent RISC Zero contracts have no on-chain verifier rotation. This codebase adds allowlist + propose + timelock + activate pattern (C-03 fix). | BENEFICIAL — Addresses CVE-2025-52484 remediation gap. New risk: allowlist management complexity. |
| 5 | Bond manager (fully custom) | WSTONBondManager is fully custom (no known parent). Cross-chain bond escrow with 10/80/10 slash distribution. | N/A — Original code, no divergence to analyze. |
| 6 | Hyperliquid adapter (non-atomic CoreWriter) | TradingSubAccount uses HyperCore CoreWriter precompile which is inherently non-atomic (orders settle asynchronously, silent rejections). | HIGH — Silent order rejection is a fundamental architectural risk. Adapter has deprecation notices for functions using extreme prices (C-05 fix), but core async settlement issue remains. |

### Questions for Breadth Agents
1. Verify that `DECIMALS_OFFSET = 1e3` provides sufficient protection against first-depositor attacks for all supported asset decimals (especially low-decimal tokens like USDC with 6 decimals).
2. Check whether the `__gap` arithmetic is correct across all three UUPS-upgradeable contracts after the timelock state additions (Registry: 40, Factory: 33, Verifier: 41).
3. Verify the RISC Zero verifier version deployed on-chain — is it patched for CVE-2025-52484?
4. Analyze the C-04 fix `MAX_CALL_VALUE_BPS = 4000` (40%) cap: is compound drain still possible across multiple executions (separate blocks)?
5. Verify that the fee epoch reset (`_resetFeeEpochIfEmpty`) cannot be exploited by a last-withdrawer to manipulate the HWM for the next cohort.
6. Check the cross-chain timing assumptions: is 90-day `BOND_EXPIRY` vs 24h max `challengeWindow` ratio sufficient to prevent reclaim-before-slash races in all relayer failure scenarios?

### Step Execution Checklist

| Section | Required | Completed? | Notes |
|---------|----------|------------|-------|
| 1. Detect Fork Indicators | YES | Y | Code patterns + git remotes checked |
| 2. Query Known Parent Issues | IF parent detected | Y | WebSearch for ERC4626, RISC Zero CVEs, OZ UUPS |
| 3. Divergence Analysis | IF parent detected | Y | 6 divergences documented |
| 4. Output to meta_buffer.md | YES | Y | This section |
