# Hypotheses

**Agent**: Chain Agent 1 (Enabler Enumeration + Grouping) + Chain Agent 2 (Chain Matching + Composition Coverage)
**Date**: 2026-04-13
**Total Hypotheses**: 81 standalone + 7 chain hypotheses = 88
**Severity Distribution (post-chain)**: Critical: 2 (conditional), High: 12, Medium: 16, Low: 33, Informational: 22

---

## Hypothesis Table

| H-ID | Title | Severity | Findings | Verdict | Location |
|------|-------|----------|----------|---------|----------|
| H-1 | TRANSFER_ERC20 compound drain bypasses H-03 cumulative 40% cap | High->CRITICAL (CH-7) | DEPTH-TF-1, DEPTH-EC-1 | CONFIRMED | KernelVault.sol:L1264-1324 |
| H-2 | RISC Zero verifier CVE-2025-52484 patching status unverifiable | High->CRITICAL (CH-7) | DEPTH-EX-7 | CONTESTED | KernelExecutionVerifier.sol:L554-581 |
| H-3 | Cross-chain bond slash timing gap enables zero-penalty bond reclaim if relayer offline | High | DEPTH-ST-4, DEPTH-EX-6, DST-5, INV-34, INV-38 | CONFIRMED | WSTONBondManager.sol:L346-515, OptimisticKernelVault.sol:L293-307 |
| H-4 | Bond-to-TVL ratio has no protocol-level minimum -- trivial bond deters nothing | High | DST-10, DST-4 | CONFIRMED | OptimisticKernelVault.sol:L344-352, WSTONBondManager.sol:L577-584 |
| H-5 | VaultAccessControl deposit gates completely dead -- canDeposit/recordDeposit never called | Medium->HIGH (CH-1) | DEPTH-ST-1, INV-55, INV-56 | CONFIRMED | KernelVault.sol:L815-917, VaultAccessControl.sol:L244-267 |
| H-6 | AaveV3Adapter withdrawToVault unconditionally zeroes _vaultBorrowed -- health check blinded | Medium->HIGH (CH-4) | DEPTH-ST-2, INV-61 | CONFIRMED | AaveV3Adapter.sol:L476-523 |
| H-7 | AaveV3Adapter aggregate health factor enables cross-vault collateral subsidy | Medium->HIGH (CH-4) | DEPTH-TF-4, INV-04 | CONFIRMED | AaveV3Adapter.sol:L574-592 |
| H-8 | MorphoAdapter emergency exit fails when interest accrues -- collateral permanently locked | Medium->HIGH (CH-5) | DEPTH-ST-3, DEPTH-TF-8, DEPTH-EX-2, INV-62, INV-70 | CONFIRMED | MorphoAdapter.sol:L599-644 |
| H-9 | MorphoAdapter health check uses stale nominal borrow -- silent undercollateralization | Medium->HIGH (CH-5) | DEPTH-ST-8, DEPTH-EX-1, INV-73 | CONFIRMED | MorphoAdapter.sol:L712-740 |
| H-10 | PendleAdapter first-caller reward capture strands other vaults' LP rewards permanently | Medium | DEPTH-TF-6, DEPTH-EX-4, INV-66, INV-51 | CONFIRMED | PendleAdapter.sol:L749-807 |
| H-11 | PendleAdapter hardcoded empty YTs array means YT interest yield never claimed | Medium | DEPTH-EX-5, INV-67 | CONFIRMED | PendleAdapter.sol:L772-780 |
| H-12 | KernelExecutionVerifier cycle-pause bypasses MAX_PAUSE_DURATION auto-expiry | Medium->HIGH (CH-2) | DEPTH-ST-5, INV-31, INV-35 | CONFIRMED | KernelExecutionVerifier.sol:L350-355, L564-568 |
| H-13 | Shared maxOracleAge conflates bond attestation and price oracle freshness | Medium | DEPTH-EX-9, INV-01 | CONFIRMED | OptimisticKernelVault.sol:L206-251 |
| H-14 | UniswapV4Adapter emergency withdrawToVault uses zero slippage -- full MEV sandwich | Medium | DEPTH-EX-3, INV-72 | CONFIRMED | UniswapV4Adapter.sol:L563-606 |
| H-15 | setAccessControl to reverting contract creates withdrawal DoS | Medium->HIGH (CH-1) | INV-19, INV-17 | PARTIAL | KernelVault.sol:L629-632, L1197-1202 |
| H-16 | CoreWriter non-atomicity creates strategyActive desync without HyperCore position | Medium | DEPTH-EX-8 | CONFIRMED | TradingSubAccount.sol:L229, HyperliquidAdapter.sol:L218-221 |
| H-17 | MetaVault NAV timing arbitrage -- deposit front-running around execution window | Medium | INV-22, DST-9, DEPTH-EC-7 | PARTIAL | MetaVault.sol:L172-193 |
| H-18 | MetaVault emergency withdraw shares burned before underlying recovery can fail | Medium | INV-25, DEPTH-TF-5, DEPTH-EC-3 | PARTIAL | MetaVault.sol:L281-348 |
| H-19 | AaveV3Adapter interest above _vaultSupplied cap permanently stranded | Medium | DEPTH-TF-3, INV-08 | CONFIRMED | AaveV3Adapter.sol:L149-150, L304, L476-506 |
| H-20 | Vault owner concentrated control -- no timelock on oracle/bond signer rotation | Medium | INV-29 | CONFIRMED | KernelVault.sol (entire) |
| H-21 | ERC20 KernelVault totalAssets uses balanceOf -- donation inflates PPS | Low | INV-06, DEPTH-TF-2 | PARTIAL | KernelVault.sol:L1725-1729 |
| H-22 | uint64 executionNonce overflow permanently bricks vault | Medium | DEPTH-EC-6 | CONFIRMED | KernelVault.sol:L1013-1023 |
| H-23 | MAX_ACTIONS_PER_OUTPUT full load exceeds HyperEVM 3M block gas limit | Medium | DST-1 | CONFIRMED | KernelOutputParser.sol:L81-182 |
| H-24 | Maximum fee configuration effective annual cost exceeds 50% of depositor capital | Medium | DST-3 | CONFIRMED | KernelVault.sol:L284-303 |
| H-25 | Emergency settle only clears flag -- does not pull assets from adapters | Medium | DST-6 | CONFIRMED | KernelVault.sol:L1452-1458 |
| H-26 | UUPS upgrade drops approvedVerifiers mapping -- verifier rotation broken post-upgrade | Low->HIGH (CH-2) | INV-40 | CONFIRMED | KernelExecutionVerifier.sol:initialize() |
| H-27 | LidoAdapter totalTrackedStETH vs vaultStETHBalance desync under negative rebase | Low | DEPTH-TF-7, INV-10, INV-50 | PARTIAL | LidoAdapter.sol:L219-232, L418-425 |
| H-28 | PendleAdapter addLiquidity strands residual SY tokens in adapter | Low | DEPTH-EX-10, INV-69 | CONFIRMED | PendleAdapter.sol:L646-688 |
| H-29 | snapshotTotalAssets/snapshotTotalShares independent clamping desync in emergency withdraw | Low | DEPTH-ST-6 | PARTIAL | KernelVault.sol:L1628-1646 |
| H-30 | _pendingCount has no admin correction mechanism -- settlement can be delayed | Low | DEPTH-ST-7 | CONFIRMED | OptimisticKernelVault.sol:L37-38, L493 |
| H-31 | MorphoAdapter health check calls IMorphoOracle.price() with no staleness validation | Low | INV-02 | PARTIAL | MorphoAdapter.sol:L726-728 |
| H-32 | VaultFactory computeVaultAddress and deployVault code store swap race | Low | INV-41 | PARTIAL | VaultFactory.sol |
| H-33 | MorphoAdapter ignores supply/withdraw/borrow return values -- tracks input not actual | Low | INV-09 | CONFIRMED | MorphoAdapter.sol:various |
| H-34 | MetaVault _depositToVault fee-on-transfer trackedIdle mismatch | Low | INV-11 | PARTIAL | MetaVault.sol:L604-619 |
| H-35 | slashBond depositor 80% sent to vault address on L1 -- cross-chain vault may not exist | Low | INV-13 | CONFIRMED | WSTONBondManager.sol:L434 |
| H-36 | Single-step ownership transfer pattern in WSTONBondManager and VaultAccessControl | Low | INV-14, INV-16 | CONFIRMED | WSTONBondManager.sol:L707-711, VaultAccessControl.sol:L126-130 |
| H-37 | MetaVault has no transferOwnership -- owner immutable post-deploy | Low | INV-15 | CONFIRMED | MetaVault.sol:L66 |
| H-38 | setAccessControl and rescueTokens emit no events -- silent policy changes | Low | INV-17, INV-18 | CONFIRMED | KernelVault.sol:L629-632, L565-569 |
| H-39 | MetaVault removeVault calls kv.withdraw without try/catch | Low | INV-20 | CONFIRMED | MetaVault.sol |
| H-40 | registerExternalVault only checks code.length > 0 -- no interface validation | Low | INV-21 | CONFIRMED | VaultFactory.sol |
| H-41 | HWM preserved through performance fee disable/re-enable -- depositors charged on zero-fee gains | Low | INV-23 | PARTIAL | KernelVault.sol:L684-733 |
| H-42 | slashBondByRelayer sends depositor 80% to treasury -- no on-chain depositor distribution | Low | INV-24 | CONFIRMED | WSTONBondManager.sol:L392-437 |
| H-43 | Partial withdrawal share scaling rounds in withdrawer favor | Informational | INV-26 | CONFIRMED | KernelVault.sol:L1149-1155 |
| H-44 | MetaVault Phase 2 rebalance under-allocates when Phase 1 withdrawals fail | Informational | INV-27 | CONFIRMED | MetaVault.sol:L411-453 |
| H-45 | EXECUTION_BONUS_POINTS=50 flat -- Sybil address-splitting amplifies bonus | Informational | INV-28 | CONFIRMED | PointsProgram.sol:L41, L362-398 |
| H-46 | strategyActive flag persists when all depositors exit via normal withdrawal | Low | INV-30 | CONFIRMED | KernelVault.sol:L1157-1191 |
| H-47 | setChallengeWindow blocks decrease with pending but allows increase | Low | INV-32 | PARTIAL | OptimisticKernelVault.sol:L328-341 |
| H-48 | setMinBondFloor takes effect immediately with no grace period | Low | INV-33 | PARTIAL | WSTONBondManager.sol:L580-584 |
| H-49 | First setFees call bypasses FEE_CHANGE_COOLDOWN via lastFeeRateChange==0 | Informational | INV-36 | CONFIRMED | KernelVault.sol:L692-699 |
| H-50 | strategyActivatedAt set once -- emergencySettle callable 7d after first action | Low | INV-37 | CONFIRMED | KernelVault.sol:L1428-1434 |
| H-51 | KernelExecutionVerifier __gap[41] pausedSince storage slot comment off-by-one | Informational | INV-39 | CONFIRMED | KernelExecutionVerifier.sol |
| H-52 | Agent successor chain links agentId to agentId -- existing vaults not updated | Informational | INV-42 | CONFIRMED | AgentRegistry.sol |
| H-53 | 1-wei deposit permanently blocks AgentRegistry.unregister() | Informational | INV-43 | CONFIRMED | AgentRegistry.sol:L301 |
| H-54 | AgentRegistry.unregister deletes 5 mappings but leaves _agentMetadataURI stale | Low | INV-44 | CONFIRMED | AgentRegistry.sol |
| H-55 | UniswapV4Adapter accumulated LP fee tokens have no collection path to vault | Low | INV-45 | CONFIRMED | UniswapV4Adapter.sol |
| H-56 | PendleAdapter expired YT tokens need separate redemption path | Low | INV-46 | CONFIRMED | PendleAdapter.sol |
| H-57 | ETH call-value in action dispatch loop -- reentrancy surface with nonReentrant present | Low | INV-47 | PARTIAL | KernelVault.sol:L1405 |
| H-58 | External calls in loop in AgentRegistry and LidoAdapter -- gas grief potential | Informational | INV-48, INV-49 | CONFIRMED | AgentRegistry.sol:L301, LidoAdapter.sol |
| H-59 | UniswapV4Adapter addLiquidity leaves residual ERC-20 approval after partial fill | Low | INV-52 | PARTIAL | UniswapV4Adapter.sol:L442-470 |
| H-60 | PointsProgram updateDepositBalance accepts arbitrary newBalance -- no validation | Low | INV-53 | CONFIRMED | PointsProgram.sol:L332-356 |
| H-61 | BuilderProgram getLeaderboard O(N^2) insertion sort -- permanent view DoS | Low | INV-54 | CONFIRMED | BuilderProgram.sol:L323-362 |
| H-62 | selfSlash emits finder=address(0) -- 10% of bond permanently burned on L1 | Low | INV-57 | CONFIRMED | OptimisticKernelVault.sol:L310-323 |
| H-63 | VaultFactory protocol fee state never propagated to deployed vaults -- dead state | Low | INV-58 | CONFIRMED | VaultFactory.sol:L45-48, L320-336 |
| H-64 | VaultFactory.initialize missing code.length validation for vaultCodeStore_ | Low | INV-59 | CONFIRMED | VaultFactory.sol:L162-177 |
| H-65 | VaultFactory.setVaultCreationCodeStore permanently unreachable dead code | Informational | INV-60 | CONFIRMED | VaultFactory.sol:L256-262 |
| H-66 | AaveV3Adapter unregisterVault never checks borrowed assets -- borrows abandoned | Low | INV-63 | CONFIRMED | AaveV3Adapter.sol:L239-255 |
| H-67 | LidoAdapter withdrawToVault positive-rebase path returns nominal not pro-rata | Low | INV-64 | PARTIAL | LidoAdapter.sol:L407-425 |
| H-68 | AaveV3Adapter withdrawToVault leaves _suppliedAssets populated after exit | Informational | INV-65 | CONFIRMED | AaveV3Adapter.sol:L476-523 |
| H-69 | UniswapV4Adapter setSlippage allows 10000 BPS (100%) | Low | INV-68 | CONFIRMED | UniswapV4Adapter.sol:L333-340 |
| H-70 | PendleAdapter claimRewards uses instantaneous weight snapshot | Low | INV-71 | PARTIAL | PendleAdapter.sol:L749-807 |
| H-71 | StakingRouter computes WTON as tonAmount * 1e9 hardcoded -- no balance delta | Informational | INV-74 | CONFIRMED | StakingRouter.sol:L86-92 |
| H-72 | LidoAdapter has rescueETH but no rescue path for stranded stETH/wstETH | Informational | INV-75 | CONFIRMED | LidoAdapter.sol:L473-480 |
| H-73 | MorphoAdapter hardcodes ORACLE_PRICE_SCALE=1e36 for non-standard Morpho oracles | Informational | INV-03 | PARTIAL | MorphoAdapter.sol:L702 |
| H-74 | MorphoAdapter oracle price() revert DoS on borrow/withdrawCollateral | Informational | INV-05 | CONFIRMED | MorphoAdapter.sol:L726-740 |
| H-75 | claimAllRewards sends reward tokens to KernelVault with no adapter exit path | Informational | INV-12 | CONFIRMED | AaveV3Adapter.sol |
| H-76 | Performance metrics (initialPps/peakPps/maxDrawdownBps) not reset on full-drain re-deposit | Low | DEPTH-EC-2 | CONFIRMED | KernelVault.sol:L1225-1230 |
| H-77 | Same-block deposit + fee collection charges zero fee -- MEV epoch reset window | Informational | DEPTH-EC-4 | CONFIRMED | KernelVault.sol:L1849-1859 |
| H-78 | Bond expiry boundary check -- reclaim allowed at exact boundary second (correct) | Informational | DEPTH-EC-8 | CONFIRMED | WSTONBondManager.sol:L501-503 |
| H-79 | MAX_NONCE_GAP=10 exhaustion halts vault until recovery | Low | DST-2 | CONFIRMED | KernelVault.sol:L1016-1027 |
| H-80 | HyperliquidAdapter has no enumeration cap -- gas exhaustion at scale | Low | DST-7 | PARTIAL | HyperliquidAdapter.sol |
| H-81 | AgentRegistry.unregister capped at 50 vaults -- permanent pollution at scale | Informational | DST-8 | CONFIRMED | AgentRegistry.sol:L39, L301 |

---

## Chain Hypotheses (from Chain Agent 2)

| CH-ID | Finding A (Blocked) | Finding B (Enabler) | Chain Severity | Match Strength |
|-------|--------------------|--------------------|---------------|---------------|
| CH-1 | H-15 (withdrawal DoS) | H-5 (deposit gates dead) | HIGH | STRONG |
| CH-2 | H-26 (no verifier post-upgrade) | H-12 (cycle-pause bypass) | HIGH | STRONG |
| CH-3 | H-3 (bond reclaim timing) | H-4 (trivial bond-to-TVL) | HIGH (confirmed) | STRONG |
| CH-4 | H-7 (aggregate HF) | H-6 (Aave borrow zeroed) | HIGH | STRONG |
| CH-5 | H-9 (Morpho stale health) | H-8 (Morpho exit fails) | HIGH | STRONG |
| CH-6 | H-10 (Pendle first-caller) | H-11 (YT never claimed) | MEDIUM | MODERATE |
| CH-7 | H-1 (TRANSFER_ERC20 drain) | H-2 (RISC Zero CVE) | CRITICAL (conditional) | MODERATE |

Full chain details in `chain_hypotheses.md`.

---

## Hypothesis Details

### H-1: TRANSFER_ERC20 Compound Drain Bypasses H-03 Cumulative 40% Cap [HIGH -> CRITICAL via CH-7]

**Sources**: DEPTH-TF-1 (CONFIRMED), DEPTH-EC-1 (CONFIRMED)
**Confidence**: HIGH (2 depth agents independently confirmed with concrete calculations)
**Chain**: CH-7 -- combined with H-2, if CVE-2025-52484 is unpatched, enables permissionless single-block total vault drain
**Statement**: IF a malicious proof (via CVE or future exploit) encodes 3+ TRANSFER_ERC20 actions each at 40% of current balance, THEN 78.4%-100% of vault assets are drained in a single execute() call, BECAUSE _executeTransferERC20 uses per-action balanceBefore (current) not _executionInitialBalance (cumulative cap), while _executeCall was correctly fixed.
**Root Cause**: Selective application of H-03 cumulative drain fix -- applied to CALL but not TRANSFER_ERC20.
**Fix**: Apply cumulative cap using _executionInitialBalance in _executeTransferERC20, same as _executeCall.

### H-2: RISC Zero Verifier CVE-2025-52484 Patching Status Unverifiable [HIGH -> CRITICAL via CH-7]

**Sources**: DEPTH-EX-7 (CONTESTED)
**Confidence**: LOW (cannot verify deployed verifier version from source code)
**Chain**: CH-7 -- if unpatched, enables H-1 blast radius (100% vault drain) via proof forgery
**Statement**: IF the deployed IRiscZeroVerifier contract corresponds to risc0-zkvm 2.0.0-2.0.2 (pre-CVE patch), THEN any attacker can forge proofs for any imageId and drain any vault, BECAUSE underconstrained remu/divu operations allow arbitrary seal construction that passes Groth16 verification.
**Root Cause**: External dependency version unknown on-chain.
**Fix**: Verify on-chain that the deployed verifier is risc0-zkvm 2.1.0+. Add on-chain version tag to verifier.

### H-3: Cross-Chain Bond Slash Timing Gap Enables Zero-Penalty Reclaim [HIGH]

**Sources**: DEPTH-ST-4, DEPTH-EX-6, DST-5 (all CONFIRMED), INV-34, INV-38
**Confidence**: HIGH (3 agents confirmed; 5 findings corroborate same root cause)
**Chain**: CH-3 -- combined with H-4, confirms full zero-cost drain economics
**Statement**: IF a malicious operator drains a vault via optimistic execution AND the relayer fails to call markSlashPending within 90 days, THEN the operator reclaims their full bond on L1 with zero economic penalty, BECAUSE slashPending is the ONLY bridge between HyperEVM slash events and L1 bond state, and it defaults to false.
**Root Cause**: No on-chain cross-chain state binding; relayer is sole bridge.
**Fix**: Add on-chain mechanism to tie slash events to L1 (e.g., merkle proof of HyperEVM event, or mandatory markSlashPending before bond can transition).

### H-4: Bond-to-TVL Ratio Has No Protocol-Level Minimum [HIGH]

**Sources**: DST-10 (CONFIRMED), DST-4 (CONFIRMED)
**Confidence**: HIGH (concrete economic calculations)
**Chain**: CH-3 -- combined with H-3, creates 2000x+ return exploit path
**Statement**: IF a vault owner (who is also the operator) sets minBond at the floor (~1 WSTON/$5) while the vault has significant TVL ($10K+), THEN the operator can profitably drain the vault at a 2000x return, BECAUSE there is no protocol enforcement that minBond must be proportional to TVL.
**Root Cause**: Missing proportional collateralization requirement.
**Fix**: Enforce minBond >= TVL * MIN_BOND_TVL_RATIO_BPS / BPS_DENOMINATOR at executeOptimistic time.

### H-5: VaultAccessControl Deposit Gates Completely Dead [MEDIUM -> HIGH via CH-1]

**Sources**: DEPTH-ST-1 (CONFIRMED), INV-55 (CONFIRMED), INV-56 (CONFIRMED)
**Confidence**: HIGH (3 agents; code-traced; deposit functions definitively lack calls)
**Chain**: CH-1 -- combined with H-15, creates one-way valve (funds enter unrestricted, cannot exit)
**Statement**: IF a vault owner deploys VaultAccessControl with whitelist/cap/KYC enabled, THEN any address can deposit unlimited amounts bypassing all controls, BECAUSE KernelVault.depositERC20Tokens and depositETH never call canDeposit() or recordDeposit().
**Root Cause**: Missing integration of VaultAccessControl into deposit paths.
**Fix**: Add canDeposit(msg.sender, assets) check and recordDeposit(msg.sender, actualReceived) call in both deposit functions.

### H-6: AaveV3Adapter _vaultBorrowed Zeroed Unconditionally on Failed Withdrawal [MEDIUM -> HIGH via CH-4]

**Sources**: DEPTH-ST-2 (CONFIRMED), INV-61 (CONFIRMED)
**Confidence**: HIGH (2 agents; concrete state trace)
**Chain**: CH-4 -- combined with H-7, enables hidden leverage spiral across all adapter vaults
**Statement**: IF a vault calls withdrawToVault() on AaveV3Adapter and pool.withdraw fails (e.g., Aave paused), THEN _vaultBorrowed is zeroed while supply is correctly restored, BECAUSE the borrow zeroing at L501-503 is unconditional (outside the try-catch), enabling the vault to re-borrow without health checks.
**Root Cause**: Borrow tracking zeroed unconditionally regardless of withdrawal success.
**Fix**: Move _vaultBorrowed zeroing inside the success path of pool.withdraw try-catch.

### H-7: AaveV3Adapter Aggregate Health Factor Enables Cross-Vault Collateral Subsidy [MEDIUM -> HIGH via CH-4]

**Sources**: DEPTH-TF-4 (CONFIRMED), INV-04 (CONFIRMED)
**Confidence**: HIGH (2 agents; concrete boundary calculations)
**Chain**: CH-4 -- combined with H-6, zeroed tracking disables per-vault safeguard while aggregate HF masks risk
**Statement**: IF multiple vaults share one AaveV3Adapter and one vault has excessive leverage, THEN the over-leveraged vault's risk is masked by healthy vaults' collateral, BECAUSE _checkVaultHealth uses pool.getUserAccountData(address(this)) which returns aggregate HF, not per-vault.
**Root Cause**: Health check operates at adapter aggregate level, not per-vault.
**Fix**: Track per-vault supply/borrow and compute per-vault health factor independently.

### H-8: MorphoAdapter Emergency Exit Fails With Accrued Interest [MEDIUM -> HIGH via CH-5]

**Sources**: DEPTH-ST-3, DEPTH-TF-8, DEPTH-EX-2, INV-62, INV-70 (all CONFIRMED)
**Confidence**: HIGH (5 findings across 3 depth agents)
**Chain**: CH-5 -- combined with H-9, stale health check prevents detection while emergency exit locks collateral
**Statement**: IF a vault has any active Morpho borrow position with accrued interest AND calls withdrawToVault(), THEN the entire emergency exit reverts (collateral permanently locked), BECAUSE withdrawToVault repays only tracked principal (not interest), leaving residual borrow shares that block collateral withdrawal, and additionally the vault may lack loan tokens for the safeTransferFrom.
**Root Cause**: _vaultBorrowed tracks principal only; Morpho tracks shares including interest.
**Fix**: Use Morpho's share-based repay (repay with 0 assets, type(uint256).max shares) to fully close position.

### H-9: MorphoAdapter Health Check Understates Leverage [MEDIUM -> HIGH via CH-5]

**Sources**: DEPTH-ST-8, DEPTH-EX-1, INV-73 (all CONFIRMED)
**Confidence**: HIGH (3 agents; concrete calculations)
**Chain**: CH-5 -- combined with H-8, creates invisible undercollateralization + locked collateral
**Statement**: IF a vault has an active Morpho borrow position and time passes, THEN the adapter's health check progressively understates actual leverage, BECAUSE _checkVaultHealth reads _vaultBorrowed (nominal principal) while Morpho's actual debt grows with interest.
**Root Cause**: Same as H-8 -- tracked principal diverges from actual debt.
**Fix**: Read actual Morpho borrow position using IMorpho.position() for current borrow shares.

### H-10: PendleAdapter First-Caller Captures All LP Rewards [MEDIUM]

**Sources**: DEPTH-TF-6, DEPTH-EX-4, INV-66, INV-51 (all CONFIRMED)
**Confidence**: HIGH (4 findings across 3 agents)
**Chain**: CH-6 -- compound with H-11 (YT black hole) for near-total Pendle yield loss
**Statement**: IF vault A calls claimRewards before vault B in any epoch, THEN vault A captures 100% of all vaults' accrued LP rewards (paying only its pro-rata share to itself and stranding the rest), BECAUSE Pendle's redeemDueInterestAndRewards is stateful and resets accumulation for the entire adapter atomically.
**Root Cause**: Atomic claim + per-vault weight split + stranded remainder.
**Fix**: Pre-claim accumulator that tracks per-vault unclaimed amounts, or claim per-vault via separate Pendle accounts.

### H-11: PendleAdapter YT Interest Yield Never Claimed [MEDIUM]

**Sources**: DEPTH-EX-5 (CONFIRMED), INV-67 (CONFIRMED)
**Confidence**: HIGH (2 agents; hardcoded empty array is definitive)
**Chain**: CH-6 -- compound with H-10 for near-total Pendle yield loss
**Statement**: IF any vault holds YT positions through PendleAdapter, THEN all YT interest yield is permanently uncollectable, BECAUSE claimRewards hardcodes emptyYts=new address[](0), so Pendle never processes YT interest redemption.
**Root Cause**: Hardcoded empty array for YT addresses in claimRewards.
**Fix**: Pass actual YT addresses to redeemDueInterestAndRewards.

### H-12: Cycle-Pause Bypasses MAX_PAUSE_DURATION [MEDIUM -> HIGH via CH-2]

**Sources**: DEPTH-ST-5, INV-31, INV-35 (all CONFIRMED)
**Confidence**: HIGH (3 findings; definitive state trace)
**Chain**: CH-2 -- combined with H-26, pause covers upgrade gap leading to permanent protocol halt
**Statement**: IF the verifier owner calls setVerificationPaused(true) every 6.9 days, THEN verification is paused indefinitely, BECAUSE each call refreshes pausedSince to block.timestamp, resetting the 7-day auto-expiry window.
**Root Cause**: pausedSince is overwritten on each pause call, not accumulated.
**Fix**: Record initial pausedSince only; subsequent calls do not refresh it. Or add a cumulative pause cap.

### H-13: Shared maxOracleAge Conflates Two Freshness Requirements [MEDIUM]

**Sources**: DEPTH-EX-9, INV-01 (both CONFIRMED)
**Confidence**: HIGH (2 agents)
**Statement**: IF maxOracleAge is set to accommodate bond attestation convenience (e.g., 24h), THEN price oracle signatures can be up to 24h stale, BECAUSE the same parameter controls both Role A (price) and Role B (bond) freshness checks.
**Root Cause**: Single parameter for two independent security requirements.
**Fix**: Split into maxPriceOracleAge and maxBondAttestationAge.

### H-14: UniswapV4Adapter Zero-Slippage Emergency LP Removal [MEDIUM]

**Sources**: DEPTH-EX-3, INV-72 (both CONFIRMED)
**Confidence**: HIGH (2 agents; code definitively shows amount0Min=0, amount1Min=0)
**Statement**: IF a vault triggers emergency withdrawal from UniswapV4Adapter, THEN MEV bots can sandwich the decreaseLiquidity call extracting 5-10%+ of position value, BECAUSE amount0Min and amount1Min are hardcoded to 0.
**Root Cause**: Explicit zero slippage in emergency path.
**Fix**: Compute oracle-based minimum amounts or use TWAP-based slippage protection.

### H-15: setAccessControl to Reverting Contract Creates Withdrawal DoS [MEDIUM -> HIGH via CH-1]

**Sources**: INV-19 (PARTIAL), INV-17 (CONFIRMED)
**Confidence**: MEDIUM (1 breadth finding; owner action required; boosted by chain analysis)
**Chain**: CH-1 -- combined with H-5, unauthorized depositors amplify DoS surface
**Statement**: IF the vault owner sets accessControl to a contract that reverts on recordWithdrawal, THEN all withdrawals revert at L1167, BECAUSE _processWithdraw unconditionally calls accessControl.recordWithdrawal.
**Root Cause**: No try-catch on recordWithdrawal call; no validation that accessControl implements interface correctly.
**Fix**: Wrap recordWithdrawal in try-catch, or validate interface at setAccessControl time.

### H-16: CoreWriter Non-Atomicity Creates strategyActive Desync [MEDIUM]

**Sources**: DEPTH-EX-8 (CONFIRMED)
**Confidence**: HIGH (well-documented HyperEVM behavior)
**Statement**: IF CoreWriter silently drops an order (price band, no HYPE gas, async margin), THEN the vault has strategyActive=true with no corresponding HyperCore position, BECAUSE CoreWriter never reverts on HyperCore failures and the EVM state (strategyActive flag) was already committed.
**Root Cause**: Fire-and-forget architecture of CoreWriter precompile.
**Fix**: Off-chain reconciliation (already documented via OrderIntentSubmitted event). On-chain: add admin function to reset strategyActive if no actual position exists.

### H-17: MetaVault NAV Timing Arbitrage [MEDIUM]

**Sources**: INV-22 (PARTIAL), DST-9 (PARTIAL), DEPTH-EC-7 (CONTESTED)
**Confidence**: MEDIUM (partially confirmed; MEV feasibility uncertain on HyperEVM)
**Statement**: IF a depositor front-runs a profitable execute() call with a deposit, THEN they capture execution profits at zero risk, BECAUSE deposits are blocked only DURING strategy (not before execution). Additionally, if NAV reaches 0 with totalShares>0, inflated shares can be minted.
**Root Cause**: ERC4626-adjacent front-running window; NAV=0 edge case.
**Fix**: Add deposit queue/delay or commitment scheme; add NAV=0 guard in deposit.

### H-18: MetaVault Emergency Withdraw Shares Burned Before Recovery [MEDIUM]

**Sources**: INV-25 (CONFIRMED), DEPTH-TF-5 (CONFIRMED, Low), DEPTH-EC-3 (PARTIAL)
**Confidence**: MEDIUM (confirmed accounting; impact bounded by design trade-off)
**Statement**: IF an underlying KernelVault's emergency withdraw reverts during MetaVault.emergencyWithdraw, THEN the caller's MetaVault shares are fully burned but they receive only partial recovery, BECAUSE shares are burned at L304-305 before the per-vault withdrawal loop.
**Root Cause**: Unconditional share burning before conditional asset recovery.
**Fix**: Burn shares proportionally based on actual recovery, or separate the share burn from asset recovery.

### H-19: AaveV3Adapter Interest Permanently Stranded [MEDIUM]

**Sources**: DEPTH-TF-3 (CONFIRMED), INV-08 (CONFIRMED)
**Confidence**: HIGH (2 agents; definitive code trace)
**Statement**: IF a vault supplies assets through AaveV3Adapter for any duration, THEN accrued Aave interest is permanently stranded in the adapter's Aave position, BECAUSE _vaultSupplied tracks only principal and withdraw() caps at tracked amount.
**Root Cause**: Supply tracking ignores Aave aToken interest accrual.
**Fix**: Track actual aToken balance (via aToken.balanceOf) or add harvestInterest function.

### H-20: Vault Owner Concentrated Control -- No Timelock [MEDIUM]

**Sources**: INV-29 (CONFIRMED)
**Confidence**: HIGH (1 agent; within-bounds per trust table)
**Statement**: IF a vault owner's key is compromised, THEN instant oracle/bond signer rotation enables immediate exploitation, BECAUSE setter functions have no timelock or delay.
**Root Cause**: No timelock on critical owner operations.
**Fix**: Add timelock for oracle/bond signer changes (similar to 48h verifier rotation).

### H-22: uint64 Nonce Overflow Bricks Vault [MEDIUM]

**Sources**: DEPTH-EC-6 (CONFIRMED)
**Confidence**: MEDIUM (theoretical; practically unreachable through normal operations but reachable via malicious guest)
**Statement**: IF lastExecutionNonce reaches type(uint64).max (via buggy guest emitting near-max nonce), THEN the vault is permanently unexecutable, BECAUSE no valid uint64 satisfies providedNonce > lastNonce.
**Root Cause**: No overflow guard on nonce value; nonce set by zkVM guest.
**Fix**: Add guard: require(lastExecutionNonce < type(uint64).max - MAX_NONCE_GAP).

### H-23: MAX_ACTIONS Gas Explosion on HyperEVM [MEDIUM]

**Sources**: DST-1 (CONFIRMED)
**Confidence**: HIGH (concrete gas calculations)
**Statement**: IF an agent produces 10+ actions with large payloads, THEN the execute() transaction exceeds HyperEVM's 3M block gas limit, BECAUSE KernelOutputParser uses a byte-by-byte copy loop consuming ~40 gas per byte.
**Root Cause**: O(n) byte copy in parseActions; MAX_ACTIONS_PER_OUTPUT=64 exceeds practical limit.
**Fix**: Use assembly mstore for bulk copy; reduce MAX_ACTIONS_PER_OUTPUT or MAX_ACTION_PAYLOAD_BYTES for HyperEVM.

### H-24: Fee Configuration Allows Net-Negative Depositor Returns [MEDIUM]

**Sources**: DST-3 (CONFIRMED)
**Confidence**: HIGH (concrete economic calculation)
**Statement**: IF management=500bps + performance=4500bps + protocolSplit=5000bps, THEN depositors receive negative returns at <5% gross annual yield, BECAUSE MAX_COMBINED_FEE_BPS caps mgmt+perf at 50% but does not account for the protocol split's compounding effect.
**Root Cause**: Combined fee cap does not include protocol split in the effective extraction calculation.
**Fix**: Either include protocol split in combined cap, or lower MAX_COMBINED_FEE_BPS.

### H-25: Emergency Settle Does Not Pull Assets From Adapters [MEDIUM]

**Sources**: DST-6 (CONFIRMED)
**Confidence**: HIGH (code trace is definitive)
**Statement**: IF the vault owner disappears during active strategy, THEN after 7-day emergencySettle, depositors still cannot withdraw because assets remain in adapters, BECAUSE emergencySettle only clears strategyActive -- it does not invoke adapter withdrawal.
**Root Cause**: emergencySettle is flag-only; no asset recovery mechanism.
**Fix**: Add optional adapter force-withdrawal in emergencySettle, or document that adapter withdrawal requires separate owner action.

### H-26: UUPS Upgrade Drops approvedVerifiers Mapping [Low -> HIGH via CH-2]

**Sources**: INV-40 (CONFIRMED)
**Confidence**: HIGH (chain analysis confirmed; code trace definitive)
**Chain**: CH-2 -- combined with H-12, pause covers upgrade gap leading to permanent protocol halt
**Statement**: IF the KernelExecutionVerifier is UUPS-upgraded, THEN the approvedVerifiers mapping is not re-seeded in the new implementation's initializer, BECAUSE initialize() only sets the owner and UPGRADE_DELAY, leaving approvedVerifiers empty.
**Root Cause**: Missing re-initialization of approvedVerifiers in UUPS upgrade path.
**Fix**: Add approvedVerifiers seeding in the upgrade path, or use a separate initializer for post-upgrade state migration.

---

## Remaining Hypotheses H-27 through H-81

Hypotheses H-27 through H-81 are low-severity and informational findings that follow a 1:1 mapping from single inventory findings. Each is documented in the finding_mapping.md with its source finding, location, and verdict. They represent:

- **H-27 to H-42**: Low-severity design gaps, missing events, single-step ownership, stale state
- **H-43 to H-58**: Informational findings -- rounding, gas, dead code, registry pollution
- **H-59 to H-81**: Low/Informational adapter-specific findings, boundary behaviors, gas concerns

These do NOT require chain analysis and proceed directly to verification.

---

## Severity Summary (Post-Chain Analysis)

| Severity | Count | Hypothesis IDs |
|----------|-------|---------------|
| Critical (conditional) | 2 | H-1 (via CH-7), H-2 (via CH-7) |
| High | 10 | H-3, H-4, H-5 (via CH-1), H-6 (via CH-4), H-7 (via CH-4), H-8 (via CH-5), H-9 (via CH-5), H-12 (via CH-2), H-15 (via CH-1), H-26 (via CH-2) |
| Medium | 16 | H-10, H-11, H-13, H-14, H-16, H-17, H-18, H-19, H-20, H-22, H-23, H-24, H-25, + standalone Mediums not upgraded |
| Low | 33 | H-21, H-27 through H-42, H-46 through H-50, H-54 through H-57, H-59 through H-70, H-76, H-79, H-80 |
| Informational | 22 | H-43 through H-45, H-51 through H-53, H-58, H-65, H-68, H-71 through H-75, H-77 through H-78, H-81 |
| **Total** | **81 standalone + 7 chains** | |
