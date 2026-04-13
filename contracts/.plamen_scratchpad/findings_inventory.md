# Phase 4a: Findings Inventory

**Inventory Agent** | Phase 4a Complete
**Total Raw Findings**: 62 | **Duplicates Removed**: 15 | **Unique Findings**: 49 | **Static Promotions**: 3 | **Side Effect Findings**: 2

---

## TASK 1: Master Findings Inventory

| ID | Source ID | Title | Severity | Verdict | Location |
|----|-----------|-------|----------|---------|----------|
| INV-01 | OA-1+TC-2 | Bond attestation and price oracle share single maxOracleAge staleness parameter | Medium | CONFIRMED | OptimisticKernelVault.sol:L206-250, KernelVault.sol:L232 |
| INV-02 | OA-3 | MorphoAdapter health check calls IMorphoOracle.price() with no staleness validation | Low | PARTIAL | MorphoAdapter.sol:L726-728 |
| INV-03 | OA-4 | MorphoAdapter hardcodes ORACLE_PRICE_SCALE=1e36 incorrect for non-standard Morpho oracles | Informational | PARTIAL | MorphoAdapter.sol:L702 |
| INV-04 | OA-5 | AaveV3Adapter _checkVaultHealth uses aggregate adapter HF not per-vault | Medium | CONFIRMED | AaveV3Adapter.sol:L574-592 |
| INV-05 | OA-6 | Morpho oracle price() revert DoS on borrow/withdrawCollateral | Informational | CONFIRMED | MorphoAdapter.sol:L726-740 |
| INV-06 | TF-1 | ERC20 vault totalAssets() uses balanceOf(address(this)) donation inflation of PPS | Medium | CONFIRMED | KernelVault.sol:L482-490 |
| INV-07 | TF-2 | withdrawTo(shares, address(this)) burns shares without moving assets | Low | PARTIAL | KernelVault.sol:L1086-1100 |
| INV-08 | TF-3 | AaveV3Adapter interest above _vaultSupplied cap permanently stranded | Medium | CONFIRMED | AaveV3Adapter.sol:L149, L290-310 |
| INV-09 | TF-4 | MorphoAdapter ignores supply/withdraw/borrow return values tracks input not actual | Low | CONFIRMED | MorphoAdapter.sol:various |
| INV-10 | TF-5 | LidoAdapter syncRebase() updates aggregate totalTrackedStETH not per-vault vaultStETHBalance | Low | CONFIRMED | LidoAdapter.sol:L312-351 |
| INV-11 | TF-6 | MetaVault _depositToVault decrements trackedIdle by full input even for fee-on-transfer tokens | Low | PARTIAL | MetaVault.sol:L604-619 |
| INV-12 | TF-7 | claimAllRewards() sends reward tokens to KernelVault with no adapter exit path | Informational | CONFIRMED | AaveV3Adapter.sol |
| INV-13 | TF-8 | slashBond() sends depositor 80% to vault address on L1 cross-chain vault may not exist on L1 | Low | CONFIRMED | WSTONBondManager.sol:L434 |
| INV-14 | SR-1+ZC-3 | WSTONBondManager.transferOwnership() is single-step no two-step confirmation | Low | CONFIRMED | WSTONBondManager.sol:L707-711 |
| INV-15 | SR-2+ZC-9 | MetaVault has no transferOwnership function owner immutable post-deploy | Low | CONFIRMED | MetaVault.sol:L66 |
| INV-16 | SR-3+ZC-4 | VaultAccessControl.transferOwnership() is single-step | Low | CONFIRMED | VaultAccessControl.sol:L126-130 |
| INV-17 | SR-4+ZC-1 | setAccessControl() emits no event silent policy change | Low | CONFIRMED | KernelVault.sol:L629-632 |
| INV-18 | SR-5+ZC-2 | rescueTokens() emits no event | Informational | CONFIRMED | KernelVault.sol:L565-569 |
| INV-19 | SR-6 | Owner can set accessControl to reverting contract DoS-ing every _processWithdraw call | Medium | PARTIAL | KernelVault.sol:L1197-1202 |
| INV-20 | SR-7 | MetaVault removeVault() calls kv.withdraw(remainingShares) without try/catch | Low | CONFIRMED | MetaVault.sol |
| INV-21 | SR-8 | registerExternalVault() only checks vault.code.length > 0 no interface validation | Low | CONFIRMED | VaultFactory.sol |
| INV-22 | CS-1 | MetaVault has no deposit lock during underlying KernelVault strategy NAV timing arbitrage | Medium | PARTIAL | MetaVault.sol:L172-193, L604-619 |
| INV-23 | CS-2 | HWM preserved through perf fee disable/re-enable depositors charged on zero-fee appreciation | Low | PARTIAL | KernelVault.sol:L684-733 |
| INV-24 | CS-3 | slashBondByRelayer() sends depositor 80% share to treasury no on-chain depositor distribution | Low | CONFIRMED | WSTONBondManager.sol:L392-437 |
| INV-25 | CS-4 | MetaVault emergency withdraw bypasses trackedIdle accounting for underlying recovered proceeds | Medium | CONFIRMED | MetaVault.sol:L281-348 |
| INV-26 | CS-5 | Partial withdrawal share scaling rounds in withdrawer favor | Informational | CONFIRMED | KernelVault.sol:L1149-1155 |
| INV-27 | CS-6 | MetaVault Phase 2 rebalance under-allocates when Phase 1 withdrawals fail | Informational | CONFIRMED | MetaVault.sol:L411-453 |
| INV-28 | CS-7 | EXECUTION_BONUS_POINTS=50 flat Sybil address-splitting amplifies execution bonus | Informational | CONFIRMED | PointsProgram.sol:L41, L362-398 |
| INV-29 | ZC-5 | Vault owner concentrated control no timelock oracle/bond signer rotation is instant | Medium | CONFIRMED | KernelVault.sol (entire) |
| INV-30 | ZC-8 | strategyActive flag persists when all depositors exit via normal withdrawal path | Low | CONFIRMED | KernelVault.sol:L1157-1191 |
| INV-31 | ZC-10 | KernelExecutionVerifier owner can cycle-pause to bypass 7-day MAX_PAUSE_DURATION auto-expiry | Medium | CONFIRMED | KernelExecutionVerifier.sol:L350-355 |
| INV-32 | TC-1 | setChallengeWindow() blocks decreasing window with pending executions but allows increasing | Low | PARTIAL | OptimisticKernelVault.sol:L328-341 |
| INV-33 | TC-3 | setMinBondFloor() takes effect immediately with no grace period | Low | PARTIAL | WSTONBondManager.sol:L580-584 |
| INV-34 | TC-4 | No on-chain time-bound between slashExpired on HyperEVM and slashBondByRelayer on L1 | Medium | CONFIRMED | WSTONBondManager.sol:L346-437 |
| INV-35 | TC-5 | MAX_PAUSE_DURATION=7d auto-expiry can lapse before 48h verifier rotation completes | Medium | CONFIRMED | KernelExecutionVerifier.sol:L566-568, L109, L163 |
| INV-36 | TC-7 | First setFees() call bypasses FEE_CHANGE_COOLDOWN via lastFeeRateChange==0 | Informational | CONFIRMED | KernelVault.sol:L692-699 |
| INV-37 | TC-8 | strategyActivatedAt set once emergencySettle callable 7d after first action even if strategy active | Low | CONFIRMED | KernelVault.sol:L1428-1434, L1452-1458 |
| INV-38 | TC-10 | Cross-chain slash front-running residual tied to INV-34 | Low | PARTIAL | OptimisticKernelVault.sol:L293-307 |
| INV-39 | MG-1 | KernelExecutionVerifier.__gap[41] pausedSince storage slot omitted from gap comment off-by-one | Informational | CONFIRMED | KernelExecutionVerifier.sol |
| INV-40 | MG-2 | UUPS upgrade does not re-seed approvedVerifiers mapping verifier rotation broken post-upgrade | Low | CONFIRMED | KernelExecutionVerifier.sol:initialize() |
| INV-41 | MG-4 | computeVaultAddress() and deployVault() both read current _vaultCreationCodeStore.code swap race | Low | PARTIAL | VaultFactory.sol |
| INV-42 | MG-5 | Agent successor chain links agentId to agentId not vault to vault existing vaults not updated | Informational | CONFIRMED | AgentRegistry.sol |
| INV-43 | MG-6 | 1-wei deposit permanently blocks AgentRegistry.unregister() | Informational | CONFIRMED | AgentRegistry.sol:L301 |
| INV-44 | SL-1 | AgentRegistry.unregister() deletes 5 mappings but leaves _agentMetadataURI stale | Low | CONFIRMED | AgentRegistry.sol |
| INV-45 | SE-1 | UniswapV4Adapter: accumulated LP fee tokens have no collection path back to vault | Low | CONFIRMED | UniswapV4Adapter.sol |
| INV-46 | SE-2 | PendleAdapter: expired YT tokens yield 0 principal tokens need separate redemption | Low | CONFIRMED | PendleAdapter.sol |
| INV-47 | SLITHER-1 | ETH call-value in action dispatch loop nonReentrant present but reentrancy surface exists | Low | PARTIAL | KernelVault.sol:L1405 |
| INV-48 | SLITHER-2 | External calls in loop in AgentRegistry gas grief potential | Informational | CONFIRMED | AgentRegistry.sol:L301 |
| INV-49 | SLITHER-3 | External calls in loop in LidoAdapter gas grief in batch operations | Informational | CONFIRMED | LidoAdapter.sol:L312, L336, L351 |

---

## Severity Counts (Phase 4a only — see Phase 3b/3c Merge section for updated totals)

- Critical: 0
- High: 0
- Medium: 11 (INV-01, INV-04, INV-06, INV-08, INV-19, INV-22, INV-25, INV-29, INV-31, INV-34, INV-35)
- Low: 26 (INV-02, INV-07, INV-09, INV-10, INV-11, INV-13, INV-14, INV-15, INV-16, INV-17, INV-20, INV-21, INV-23, INV-24, INV-30, INV-32, INV-33, INV-37, INV-38, INV-40, INV-41, INV-44, INV-45, INV-46, INV-47, INV-49 — note: INV-49 is Info)
- Informational: 12 (INV-03, INV-05, INV-12, INV-18, INV-26, INV-27, INV-28, INV-36, INV-39, INV-42, INV-43, INV-48)

Corrected count: 0 Critical, 0 High, 11 Medium, 24 Low, 14 Informational = 49 total

---

## TASK 1.5: Assumption Dependency Audit

### [ASSUMPTION-DEP: TRUSTED-ACTOR] (apply -1 severity tier in report)

| Finding ID | Actor | Reason |
|-----------|-------|--------|
| INV-23 | Vault Owner FULLY_TRUSTED | Owner must disable then re-enable perf fee to trigger |
| INV-36 | Vault Owner FULLY_TRUSTED | Owner must call setFees() as first-ever call |
| INV-17 | Vault Owner FULLY_TRUSTED | Owner must call setAccessControl() silently |
| INV-18 | Vault Owner FULLY_TRUSTED | Owner must call rescueTokens() silently |
| INV-24 | WSTONBondManager Owner FULLY_TRUSTED | Treasury redistribution requires owner cooperation |

### [ASSUMPTION-DEP: WITHIN-BOUNDS] (note in report, no severity change)

| Finding ID | Actor | Note |
|-----------|-------|------|
| INV-29 | Vault Owner | Oracle/bond signer rotation IS within permissions; risk is ABSENCE of timelock not violation of trust |
| INV-19 | Vault Owner | setAccessControl is within permissions |
| INV-31 | Verifier Owner | cycle-pause is within verifier owner permissions |
| INV-34 | Trusted Relayer | relayer liveness failure is external actor control |
| INV-35 | Verifier Owner | proposal delay is within verifier owner permissions |

---

## TASK 2: Side Effect Trace Audit

### SE-1: UniswapV4Adapter LP Fee Accumulation Has No Collection Path
- Verdict: CONFIRMED | Severity: Low | Location: UniswapV4Adapter.sol
- Token fate: POTENTIALLY STRANDED
- Accrued LP trading fees in Uniswap v4 positions are never collected back to the vault. No harvest function exists. Fees accumulate indefinitely.

### SE-2: PendleAdapter YT Token Post-Maturity Yield Stranded
- Verdict: CONFIRMED | Severity: Low | Location: PendleAdapter.sol
- Token fate: STRANDED YT yield post-maturity
- After Pendle market maturity, YT tokens have zero value. No automatic maturity handling. PT principal recoverable but requires explicit agent action.

### Token Fate Summary

| External Call | Token Fate | Finding |
|--------------|-----------|---------|
| LidoAdapter stETH staking | CONSUMED but per-vault accounting corrupted | INV-10 |
| AaveV3Adapter aToken interest | STRANDED above _vaultSupplied cap | INV-08 |
| UniswapV4 LP fee accrual | POTENTIALLY STRANDED - no collect() path | INV-45 |
| PendleAdapter YT expiry | STRANDED YT yield post-maturity | INV-46 |
| WSTONBondManager slashBond L1 | EXITS to L1 treasury not HyperEVM depositors | INV-24 |

---

## TASK 3: Elevated Signal Audit

| Signal | Coverage Status | Finding(s) |
|--------|----------------|-----------|
| ELEVATE:STORAGE_LAYOUT | COVERED | INV-39 |
| ELEVATE:FORK_ANCESTRY:ERC4626 | COVERED | INV-06, INV-26 |
| ELEVATE:BRANCH_ASYMMETRY KernelVault | COVERED | INV-30, INV-37 |
| ELEVATE:BRANCH_ASYMMETRY AaveV3 | COVERED | INV-04 |
| ELEVATE:INLINE_ASSEMBLY | PARTIAL - patterns refuted; KernelOutputParser byte-alignment not deep-analyzed | DEPTH CANDIDATE |
| ELEVATE:REINIT_RISK | COVERED | INV-40 |
| STAKING_RECEIPT_TOKENS | COVERED | INV-10 |
| HAS_SIGNATURES | PARTIAL - staleness covered; ECDSA malleability addressed by OracleVerifier | PARTIAL |
| MIXED_DECIMALS | NOT SYSTEMATICALLY COVERED - 1e6 vs 1e27 vs 1e36 | DIMENSIONAL_ANALYSIS niche needed |
| MULTI_STEP_OPS | COVERED | INV-41 |
| MISSING_EVENT | COVERED | INV-17, INV-18 |

---

## TASK 4: Depth Candidates

| Priority | Finding ID | Domain | Reason |
|----------|-----------|--------|--------|
| 1 | INV-04 | depth-state-trace | Aggregate HF cross-vault collateral attack path with concrete LTV values |
| 2 | INV-01 | depth-external | Shared maxOracleAge replay window quantification under maxAge=24h |
| 3 | INV-34 | depth-external | 90-day cross-chain timing window exploit: slashExpired to relayer offline to reclaimExpiredBond |
| 4 | INV-29 | depth-state-trace | Instant signer rotation to unbounded optimistic drain economics |
| 5 | INV-31 | depth-state-trace | Cycle-pause pending proof expiry trace |
| 6 | INV-08 | depth-token-flow | Interest stranding magnitude with real Aave rates |
| 7 | INV-06 | depth-token-flow | ERC20 donation sandwich economics DECIMALS_OFFSET=1e3 bound analysis |
| 8 | INV-22 | depth-edge-case | MetaVault settle() front-running precondition reachability |
| 9 | INV-35 | depth-external | Exact timing model for verifier rotation gap |
| 10 | MIXED_DECIMALS | DIMENSIONAL_ANALYSIS niche | Systematic 1e6/1e27/1e36 scale mismatches across adapters |

**CRITICAL COVERAGE GAP**: analysis_staking_external.md was truncated at 27 lines.
UniswapV4Adapter, PendleAdapter, and StakingRouter have ZERO breadth security analysis.
SE-1 and SE-2 are side-effect traces only, not full security analysis.
Recommended action: spawn dedicated breadth re-scan agent for these contracts before depth.

---

## TASK 4.5: Chain Pre-Scan

| Chain ID | Enabler Finding | Blocked Finding | Match Strength | Escalated Severity |
|---------|----------------|----------------|---------------|-------------------|
| CH-A | INV-17 silent setAccessControl | INV-19 DoS via reverting accessControl | STRONG | HIGH |
| CH-B | INV-40 no verifier post-upgrade + INV-31 cycle-pause | Complete ecosystem execution halt | STRONG | HIGH |
| CH-C | INV-38 slash front-run + INV-34 timing gap + INV-13 wrong chain | Operator reclaims bond depositors receive nothing | MODERATE | HIGH |
| CH-D | INV-10 syncRebase accounting + INV-06 donation inflation | Combined PPS corruption | WEAK | MEDIUM |
| CH-E | INV-29 instant signer rotation + INV-01 staleness window | Unbounded optimistic drain | STRONG | HIGH |

---

## TASK 5: State Dependency Cross-Reference

| State Variable | Writer(s) | Consumer(s) | Finding(s) |
|---------------|----------|-------------|-----------|
| maxOracleAge | setOracleSigner() | _verifyOptimisticOracleAndBond() Role A and B | INV-01 |
| oracleSigner / bondSigner | setOracleSigner() | _verifyOptimisticOracleAndBond() | INV-29 |
| strategyActive | setStrategy() settle() emergencySettle() emergencyWithdraw() | deposit() lock _processWithdraw() totalAssets() | INV-30 |
| strategyActivatedAt | First balance-reducing action | emergencySettle() 7d check | INV-37 |
| snapshotTotalAssets | setStrategy() | effectiveTotalAssets() totalAssets() during strategy | INV-22, INV-06 |
| highWaterMark | setFees() first-time _collectPerformanceFee() | _collectPerformanceFee() | INV-23 |
| trackedIdle | deposit() withdraw() _depositToVault() _withdrawFromVault() | getNav() rebalance Phase 2 | INV-25, INV-11, INV-27 |
| _vaultSupplied[vault][asset] | depositToVault() | withdrawFromVault() cap | INV-08 |
| totalTrackedStETH vaultStETHBalance[vault] | syncRebase() updates aggregate only; deposit/withdraw update both | NAV calculation | INV-10 |
| _vaultCreationCodeStore | scheduleVaultCreationCodeStore() activateVaultCreationCodeStore() | computeVaultAddress() deployVault() | INV-41 |
| accessControl | setAccessControl() no event | _processWithdraw() deposit() | INV-17, INV-19 |
| slashPending[operator][nonce] | markSlashPending() | reclaimExpiredBond() | INV-34, INV-38 |
| approvedVerifiers | approveVerifier() initialize() | verifyAndParseWithImageId() | INV-40 |
| pausedSince | setVerificationPaused() | verifyAndParseWithImageId() auto-expiry | INV-31, INV-35 |

---

## Deduplication Log

| Removed | Reason | Absorbed Into |
|---------|--------|--------------|
| TC-2 | Same root as OA-1: shared maxOracleAge | INV-01 |
| ZC-1 | Duplicate of SR-4 setAccessControl missing event | INV-17 |
| ZC-2 | Duplicate of SR-5 rescueTokens missing event | INV-18 |
| ZC-3 | Duplicate of SR-1 WSTONBondManager single-step ownership | INV-14 |
| ZC-4 | Duplicate of SR-3 VaultAccessControl single-step ownership | INV-16 |
| ZC-6 | Subsumed by INV-29 MetaVault owner unilateral rebalance | INV-29 |
| ZC-7 | Design note only | INV-18 |
| ZC-9 | Duplicate of SR-2 MetaVault immutable owner | INV-15 |
| SL-2 | Exact duplicate of MG-1 __gap off-by-one | INV-39 |
| TC-6 | REFUTED oracle signer rotation mid-flight has no effect | -- |
| TC-9 | REFUTED UUPS scheduling overwrite is safe | -- |
| TC-11 | REFUTED fee front-running mitigated by FEE_CHANGE_COOLDOWN | -- |
| OA-2 | REFUTED abi.encodePacked collision risk fixed-length prefix safe | -- |
| OA-7 | REFUTED maxOracleAge=0 unreachable via invariant chain | -- |
| SR-9 | Design note only future minBondFloor enforcement | -- |

---

## Chain Summary Table (for Chain Analysis Agent)

| Finding ID | Severity | Verdict | Chain Input? | Postcondition Types |
|-----------|----------|---------|-------------|-------------------|
| INV-01 | Medium | CONFIRMED | YES staleness mismatch | TIMING |
| INV-04 | Medium | CONFIRMED | YES cross-vault collateral | STATE, BALANCE |
| INV-06 | Medium | CONFIRMED | YES donation enables sandwich | BALANCE |
| INV-08 | Medium | CONFIRMED | YES permanently locked yield | STATE, BALANCE |
| INV-10 | Low | CONFIRMED | YES first vault over-consumes | STATE, BALANCE |
| INV-13 | Low | CONFIRMED | YES slash to wrong-chain address | EXTERNAL |
| INV-17 | Low | CONFIRMED | YES access policy changed without trace | STATE |
| INV-19 | Medium | PARTIAL | NO consumer of INV-17 postcondition | STATE |
| INV-22 | Medium | PARTIAL | YES timing arbitrage on settlement | TIMING |
| INV-24 | Low | CONFIRMED | NO | STATE, EXTERNAL |
| INV-25 | Medium | CONFIRMED | NO | STATE |
| INV-29 | Medium | CONFIRMED | YES instant signer rotation | ACCESS, STATE |
| INV-31 | Medium | CONFIRMED | YES ecosystem halt | STATE, TIMING |
| INV-34 | Medium | CONFIRMED | YES 90d reclaim window | TIMING, EXTERNAL |
| INV-35 | Medium | CONFIRMED | YES vulnerable verifier live gap | TIMING |
| INV-37 | Low | CONFIRMED | YES emergency settle callable early | TIMING |
| INV-40 | Low | CONFIRMED | YES no verifier post-upgrade | STATE, ACCESS |
| INV-45 | Low | CONFIRMED | YES LP fees stranded | BALANCE |
| INV-46 | Low | CONFIRMED | YES YT yield stranded | BALANCE |

---

## Phase 3b/3c Merge (new findings)

**Merge Agent** | Phase 3b/3c Merge Complete
**New Unique Findings Added**: 26 | **Duplicates Removed**: 5 (SE-1 dup INV-04, SE-2 absorbed by INV-50, SE-11 absorbed by INV-55, analysis_rescan_1.md absent/no findings, analysis_percontract_1.md/3/7 absent)
**Running Total**: 75 unique findings

### Deduplication Log (Phase 3b/3c)

| Removed Source | Reason | Absorbed Into |
|---------------|--------|--------------|
| SE-1 | Exact duplicate of INV-04 (AaveV3Adapter aggregate HF — same root cause, same location) | INV-04 |
| SE-2 | Absorbed by INV-50 (RS2-1 more precise: nominal totalTrackedStETH decrement confirmed; SE-2 was PARTIAL same bug) | INV-50 |
| SE-11 | AaveV3Adapter borrow tracking cleared during withdrawToVault — absorbed by INV-55 (PC5-1 is same bug, elevated to Medium with more concrete trace evidence) | INV-55 |
| analysis_rescan_1.md | File absent from scratchpad — no agent output to merge | — |
| analysis_percontract_1.md, _3.md, _7.md | Files absent from scratchpad — no agent output to merge | — |

### New Findings Table

| ID | Source ID | Title | Severity | Verdict | Location |
|----|-----------|-------|----------|---------|----------|
| INV-50 | RS2-1 | LidoAdapter withdrawToVault() decrements totalTrackedStETH by nominal amount under negative rebase — first vault absorbs full slash loss | Low | CONFIRMED | LidoAdapter.sol:L406-425 |
| INV-51 | RS2-2 | PendleAdapter claimRewards() excludes ptBalance from weight — PT-only vaults receive zero rewards permanently | Low | CONFIRMED | PendleAdapter.sol:L785-803 |
| INV-52 | RS2-3 | UniswapV4Adapter addLiquidity() leaves residual ERC-20 approval on position manager after partial-fill mints | Low | PARTIAL | UniswapV4Adapter.sol:L442-470 |
| INV-53 | RS2-4 | PointsProgram updateDepositBalance() accepts arbitrary newBalance with no on-chain validation — authorized callers can inflate points for any user | Low | CONFIRMED | PointsProgram.sol:L332-356 |
| INV-54 | RS2-5 | BuilderProgram getLeaderboard() O(N²) insertion sort over permissionless registry — permanent view-function DoS | Low | CONFIRMED | BuilderProgram.sol:L323-362 |
| INV-55 | PC2-1 | VaultAccessControl deposit gates (whitelist, cap, KYC) never enforced — KernelVault never calls canDeposit() or recordDeposit() | Medium | CONFIRMED | KernelVault.sol:L815-864, L871-917; VaultAccessControl.sol:L244-267 |
| INV-56 | PC2-2 | recordWithdrawal always passes msg.sender regardless of withdrawTo() recipient — deposit cap counter misattributed | Low | CONFIRMED | KernelVault.sol:L935-943, L1166-1168 |
| INV-57 | PC2-3 | selfSlash emits finder=address(0) causing 10% of bond permanently burned on L1 | Low | CONFIRMED | OptimisticKernelVault.sol:L310-323 |
| INV-58 | PC4-1 | VaultFactory protocol fee state never propagated to deployed vaults — protocolTreasury/defaultProtocolFeeSplitBps are dead state | Low | CONFIRMED | VaultFactory.sol:L45-48, L320-336, L601-633 |
| INV-59 | PC4-2 | VaultFactory.initialize missing code.length validation for vaultCodeStore_ allows EOA address producing broken vaults | Low | CONFIRMED | VaultFactory.sol:L162-177, L256-262 |
| INV-60 | PC4-3 | VaultFactory.setVaultCreationCodeStore permanently unreachable dead code post-initialize | Informational | CONFIRMED | VaultFactory.sol:L256-262 |
| INV-61 | PC5-1 | AaveV3Adapter withdrawToVault() unconditionally zeroes _vaultBorrowed even when pool.withdraw fails — health check permanently bypassed | Medium | CONFIRMED | AaveV3Adapter.sol:L476-523, L490-505 |
| INV-62 | PC5-2 | MorphoAdapter withdrawToVault() repays only principal, accrued interest leaves residual borrow shares — collateral permanently locked | Medium | CONFIRMED | MorphoAdapter.sol:L599-644, L617-633 |
| INV-63 | PC5-3 | AaveV3Adapter unregisterVault() never checks _borrowedAssets — borrow-only positions abandoned silently | Low | CONFIRMED | AaveV3Adapter.sol:L239-255 |
| INV-64 | PC5-4 | LidoAdapter withdrawToVault() positive-rebase path returns nominal not pro-rata — exiting vault forfeits rebase gains | Low | PARTIAL | LidoAdapter.sol:L407-425 |
| INV-65 | PC5-5 | AaveV3Adapter withdrawToVault() leaves _suppliedAssets array populated after full exit — repeated no-op events and gas overhead | Informational | CONFIRMED | AaveV3Adapter.sol:L476-523 |
| INV-66 | PC6-1 | PendleAdapter claimRewards() atomically claims all vaults' epoch rewards — non-first-caller vaults permanently lose their share | Medium | CONFIRMED | PendleAdapter.sol:L749-807 |
| INV-67 | PC6-2 | PendleAdapter claimRewards() passes empty yts array — YT interest yield never claimed for any vault | Medium | CONFIRMED | PendleAdapter.sol:L772-780 |
| INV-68 | PC6-3 | UniswapV4Adapter setSlippage() allows 10000 BPS (100%) eliminating LP mint slippage protection entirely | Low | CONFIRMED | UniswapV4Adapter.sol:L333-340, L680-681 |
| INV-69 | PC6-4 | PendleAdapter addLiquidity() strands unused SY tokens in adapter — no refund path for partial pool consumption | Low | CONFIRMED | PendleAdapter.sol:L646-688 |
| INV-70 | SE-3 | MorphoAdapter emergency withdrawToVault blocked when vault lacks loan tokens for repay — safeTransferFrom pulls FROM vault | Medium | CONFIRMED | MorphoAdapter.sol:L599-644 |
| INV-71 | SE-4 | PendleAdapter claimRewards() uses instantaneous weight snapshot — vault entering before claim captures disproportionate share | Low | PARTIAL | PendleAdapter.sol:L749-807 |
| INV-72 | SE-5 | UniswapV4Adapter emergency withdrawToVault removes liquidity with zero slippage — MEV sandwich on emergency exit | Medium | CONFIRMED | UniswapV4Adapter.sol:L563-606 |
| INV-73 | SE-7 | MorphoAdapter health check uses nominal tracked positions not actual accrued borrow — understates leverage over time | Medium | CONFIRMED | MorphoAdapter.sol:L712-740 |
| INV-74 | SE-9 | StakingRouter computes WTON amount as tonAmount * 1e9 hardcoded rather than measuring balance delta | Informational | CONFIRMED | StakingRouter.sol:L86-92 |
| INV-75 | SE-10 | LidoAdapter has rescueETH but no rescue path for stranded stETH or wstETH donations | Informational | CONFIRMED | LidoAdapter.sol:L473-480 |

### Updated Assumption Dependency Audit (Phase 3b/3c additions)

**[ASSUMPTION-DEP: WITHIN-BOUNDS]** (note in report, no severity change):

| Finding ID | Actor | Note |
|-----------|-------|------|
| INV-53 | PointsProgram Owner / authorizedCaller | updateDepositBalance is within authorized caller permissions; risk is compromise of a semi-trusted caller |
| INV-57 | Vault Owner FULLY_TRUSTED | selfSlash is within vault owner permissions; bond burn is side-effect not abuse |
| INV-68 | Vault Owner FULLY_TRUSTED | setSlippage to 10000 is within permissions; design gap not abuse |

### Updated Chain Pre-Scan (Phase 3b/3c additions)

| Chain ID | Enabler Finding | Blocked Finding | Match Strength | Escalated Severity |
|---------|----------------|----------------|---------------|-------------------|
| CH-F | INV-55 deposit gates never enforced | INV-19 DoS via reverting accessControl | MODERATE | HIGH — unintended depositors amplify accessControl DoS surface |
| CH-G | INV-61 _vaultBorrowed zeroed on withdraw fail | INV-04 aggregate HF understated | STRONG | HIGH — zero borrow tracking + aggregate HF = hidden leverage spiral |
| CH-H | INV-62 MorphoAdapter collateral locked | INV-70 vault lacks loan tokens for repay | STRONG | HIGH — both emergency paths broken simultaneously |
| CH-I | INV-66 first-caller captures all epoch rewards | INV-67 YT interest never claimed | MODERATE | MEDIUM — compound Pendle yield loss: LP rewards race + YT yield black hole |
| CH-J | INV-50 negative rebase nominal decrement | INV-10 syncRebase aggregate accounting error | MODERATE | MEDIUM — compounding stETH accounting corruption under slash event |

### Updated State Dependency Cross-Reference (Phase 3b/3c additions)

| State Variable | Writer(s) | Consumer(s) | Finding(s) |
|---------------|----------|-------------|-----------|
| totalTrackedStETH (negative rebase path) | withdrawToVault() decrements by nominal | All subsequent vaultStETHShare() calls | INV-10, INV-50 |
| _vaultBorrowed (Aave) | borrow() += amount; withdrawToVault() zeroes unconditionally | _checkVaultHealth() reads for leverage guard | INV-08, INV-61 |
| _vaultBorrowed (Morpho) | borrow() += principal; withdrawToVault() zeroes after partial repay | withdrawCollateral() health check | INV-62 |
| canDeposit / recordDeposit | VaultAccessControl (never called by vault) | Deposit paths in KernelVault (never consumed) | INV-55 |
| deposited[user] (VaultAccessControl) | recordWithdrawal(msg.sender) always | Cap check in canDeposit | INV-55, INV-56 |
| pendingExecutions[nonce].status | selfSlash sets STATUS_SLASHED + emits finder=address(0) | WSTONBondManager.slashBondByRelayer on L1 | INV-57 |
| protocolTreasury / defaultProtocolFeeSplitBps (Factory) | Factory setters | Never passed to vault constructor | INV-58 |
| accrualStates[user][vault].depositBalance | updateDepositBalance() no validation | accruePoints() rate computation | INV-53 |
| builderAddresses[] | registerBuilder() permissionless push | getLeaderboard() O(N²) sort | INV-54 |
| positions[vault][market].ytBalance / lpBalance | mintPtYt, addLiquidity | claimRewards() weight computation | INV-51, INV-66, INV-67 |

### Updated Severity Counts (Full — Phase 4a + Phase 3b/3c)

- Critical: 0
- High: 0
- Medium: 19 (INV-01, INV-04, INV-06, INV-08, INV-19, INV-22, INV-25, INV-29, INV-31, INV-34, INV-35, INV-55, INV-61, INV-62, INV-66, INV-67, INV-70, INV-72, INV-73)
- Low: 38 (INV-02, INV-07, INV-09, INV-10, INV-11, INV-13, INV-14, INV-15, INV-16, INV-17, INV-20, INV-21, INV-23, INV-24, INV-30, INV-32, INV-33, INV-37, INV-38, INV-40, INV-41, INV-44, INV-45, INV-46, INV-47, INV-50, INV-51, INV-52, INV-53, INV-54, INV-56, INV-57, INV-58, INV-59, INV-63, INV-64, INV-68, INV-69, INV-71)
- Informational: 18 (INV-03, INV-05, INV-12, INV-18, INV-26, INV-27, INV-28, INV-36, INV-39, INV-42, INV-43, INV-48, INV-49, INV-60, INV-65, INV-74, INV-75)

**Grand total: 0 Critical, 0 High, 19 Medium, 38 Low, 18 Informational = 75 unique findings**

### Updated Chain Summary Table (full — append to existing table)

| Finding ID | Severity | Verdict | Chain Input? | Postcondition Types |
|-----------|----------|---------|-------------|-------------------|
| INV-50 | Low | CONFIRMED | YES — first vault absorbs full slash; subsequent vaults over-drain | BALANCE, STATE |
| INV-51 | Low | CONFIRMED | YES — PT-only vault rewards stranded | BALANCE |
| INV-53 | Low | CONFIRMED | YES — inflated depositBalance enables points overflow | STATE |
| INV-55 | Medium | CONFIRMED | YES — deposit gates bypassed; any address deposits | ACCESS, STATE |
| INV-61 | Medium | CONFIRMED | YES — zero _vaultBorrowed enables health check bypass | STATE |
| INV-62 | Medium | CONFIRMED | YES — collateral locked in Morpho | STATE, BALANCE |
| INV-66 | Medium | CONFIRMED | YES — first-caller captures all epoch rewards | BALANCE, STATE |
| INV-67 | Medium | CONFIRMED | YES — YT interest permanently stranded | BALANCE |
| INV-70 | Medium | CONFIRMED | YES — emergency exit blocked when vault has no loan tokens | STATE, BALANCE |
| INV-72 | Medium | CONFIRMED | YES — emergency LP removal sandwichable | EXTERNAL |
| INV-73 | Medium | CONFIRMED | YES — understated leverage allows over-borrowing | STATE |
