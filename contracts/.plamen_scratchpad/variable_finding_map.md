# Variable Finding Map

> **Purpose**: Maps state variables to finding IDs for chain analysis (Phase 4c Agent 2 — variable-level postcondition matching).
> **Written by**: Inventory Merge Agent (Phase 3b/3c merge)
> **Usage**: Chain Agent 2 uses this to match postconditions (variable writes) with preconditions (variable reads) across findings.

---

## KernelVault.sol

| Variable | Writer Finding(s) | Reader Finding(s) | Notes |
|----------|------------------|------------------|-------|
| `accessControl` | INV-17 (set silently, no event) | INV-19 (reverting accessControl DoS) | CHAIN CH-A (STRONG) |
| `snapshotTotalAssets` | INV-22 (set at strategy start) | INV-22, INV-06 (donation inflation affects snapshot) | — |
| `strategyActive` | INV-30 (persists after exit) | INV-22 (deposit lock), INV-37 (emergencySettle timing) | — |
| `strategyActivatedAt` | INV-37 (set once) | INV-37 (emergencySettle 7d check) | — |
| `highWaterMark` | INV-23 (perf fee disable/re-enable) | INV-23 (fee charge on zero-fee appreciation) | — |
| `totalShares` | INV-06 (donation inflation) | INV-07 (withdrawTo self burns shares) | — |
| `shares[msg.sender]` | INV-55 (deposits bypass gate) | INV-56 (recordWithdrawal misattributed) | — |
| `totalDeposited` | INV-55 (untracked deposits) | INV-55 | — |

## OptimisticKernelVault.sol

| Variable | Writer Finding(s) | Reader Finding(s) | Notes |
|----------|------------------|------------------|-------|
| `pendingExecutions[nonce].status` | INV-57 (selfSlash sets STATUS_SLASHED + finder=0) | WSTONBondManager.slashBondByRelayer on L1 | 10% burn via finder=0 |
| `_pendingCount` | INV-32 (setChallengeWindow allows increase) | INV-32 | — |
| `maxOracleAge` | INV-01 (shared staleness param) | INV-01 (bond attestation + price oracle both read) | CHAIN CH-E |

## VaultAccessControl.sol

| Variable | Writer Finding(s) | Reader Finding(s) | Notes |
|----------|------------------|------------------|-------|
| `deposited[user]` | INV-56 (recordWithdrawal uses msg.sender always) | INV-55 (canDeposit cap check — but canDeposit never called) | Dead consumer path |
| `whitelistEnabled`, `whitelisted[user]` | (admin) | INV-55 (canDeposit — never called by vault) | Gate exists but never consulted |
| `depositCapEnabled`, `depositCaps[user]` | (admin) | INV-55, INV-56 (deposited counter stale) | — |

## WSTONBondManager.sol

| Variable | Writer Finding(s) | Reader Finding(s) | Notes |
|----------|------------------|------------------|-------|
| `slashPending[operator][nonce]` | INV-34 (markSlashPending) | INV-38 (front-run), INV-34 (90d window) | CHAIN CH-C |
| `minBondFloor` | INV-33 (setMinBondFloor immediate) | All bond locking | — |
| `bonds[operator][nonce]` | INV-24 (slashBondByRelayer 80% to L1 vault) | INV-13 (wrong-chain depositor address) | CHAIN CH-C |

## KernelExecutionVerifier.sol

| Variable | Writer Finding(s) | Reader Finding(s) | Notes |
|----------|------------------|------------------|-------|
| `approvedVerifiers` | INV-40 (not re-seeded post-upgrade) | INV-40 (verifyAndParseWithImageId) | CHAIN CH-B |
| `pausedSince` | INV-31 (cycle-pause bypasses 7d) | INV-31 (auto-expiry), INV-35 (rotation gap) | CHAIN CH-B |

## VaultFactory.sol

| Variable | Writer Finding(s) | Reader Finding(s) | Notes |
|----------|------------------|------------------|-------|
| `_vaultCreationCodeStore` | INV-41 (swap race) | INV-41 (computeVaultAddress + deployVault) | — |
| `protocolTreasury` | INV-58 (dead state — set but never passed to vault) | Never passed to vault constructor | Dead write |
| `defaultProtocolFeeSplitBps` | INV-58 (dead state) | Never consumed by deployed vaults | Dead write |
| `_vaultCreationCodeStore` (initialize) | INV-59 (no code.length check at init) | setVaultCreationCodeStore guard (INV-60 dead code) | — |

## AgentRegistry.sol

| Variable | Writer Finding(s) | Reader Finding(s) | Notes |
|----------|------------------|------------------|-------|
| `_agentMetadataURI` | (not cleaned on unregister) | INV-44 (stale URI post-unregister) | — |
| `successorOf[agentId]` | INV-42 (links agentId to agentId) | Vault trustedImageId (pinned at creation) | — |

## AaveV3Adapter.sol

| Variable | Writer Finding(s) | Reader Finding(s) | Notes |
|----------|------------------|------------------|-------|
| `_vaultSupplied[vault][asset]` | INV-08 (interest above cap stranded) | INV-08 (cap check), INV-61 (withdraw path) | — |
| `_vaultBorrowed[vault][asset]` | INV-61 (zeroed unconditionally on withdraw fail) | _checkVaultHealth, INV-04 (aggregate HF) | CHAIN CH-G |
| `_suppliedAssets[vault]` | INV-63 (unregister skips borrow-only assets) | unregisterVault check loop | — |
| `_borrowedAssets[vault]` | borrow() adds | INV-63 (never checked in unregisterVault) | — |

## LidoAdapter.sol

| Variable | Writer Finding(s) | Reader Finding(s) | Notes |
|----------|------------------|------------------|-------|
| `totalTrackedStETH` | INV-10 (syncRebase updates aggregate only), INV-50 (withdrawToVault decrements nominal) | vaultStETHShare(), withdrawToVault() pro-rata calc | CHAIN CH-J |
| `vaultStETHBalance[vault]` | INV-10 (only deposit/withdraw update per-vault) | vaultStETHShare() | — |

## MorphoAdapter.sol

| Variable | Writer Finding(s) | Reader Finding(s) | Notes |
|----------|------------------|------------------|-------|
| `_vaultBorrowed[vault][marketId]` | INV-62 (zeroed after partial repay) | _checkVaultHealth (tracked vs actual drift) | CHAIN CH-H |
| `_vaultCollateral[vault][marketId]` | INV-62 (zeroed before withdrawCollateral reverts) | withdrawCollateral retry path (blocked) | CHAIN CH-H |
| `_borrowedMarkets[vault]` | (borrow adds) | INV-73 (stale tracked positions in health check) | — |

## PendleAdapter.sol

| Variable | Writer Finding(s) | Reader Finding(s) | Notes |
|----------|------------------|------------------|-------|
| `positions[vault][market].ytBalance` | mintPtYt, redeemPtYt | INV-51 (excluded from claimRewards weight), INV-67 (YT interest never claimed) | CHAIN CH-I |
| `positions[vault][market].ptBalance` | swapExactTokenForPt | INV-51 (ptBalance missing from weight → zero rewards) | — |
| `positions[vault][market].lpBalance` | addLiquidity | INV-66 (first-caller captures all epoch rewards) | — |
| `totalPositions[market].ytBalance` | (aggregate of vault positions) | INV-51 (totalWeight excludes ptBalance) | — |

## UniswapV4Adapter.sol

| Variable | Writer Finding(s) | Reader Finding(s) | Notes |
|----------|------------------|------------------|-------|
| `slippageBps` | INV-68 (setSlippage allows 10000 BPS) | _mintPosition computes amount0Min/amount1Min | — |
| ERC-20 allowance on positionManager | INV-52 (residual approval not cleared) | Future position manager pull path | EXTERNAL |

## PointsProgram.sol

| Variable | Writer Finding(s) | Reader Finding(s) | Notes |
|----------|------------------|------------------|-------|
| `accrualStates[user][vault].depositBalance` | INV-53 (updateDepositBalance no validation) | accruePoints() rate = balance * elapsed / 86400 | — |
| `totalPoints[user]` | INV-28 (EXECUTION_BONUS_POINTS Sybil amplification) | Off-chain airdrop distribution | — |

## BuilderProgram.sol

| Variable | Writer Finding(s) | Reader Finding(s) | Notes |
|----------|------------------|------------------|-------|
| `builderAddresses[]` | INV-54 (permissionless push, no cap) | getLeaderboard() O(N²) sort | — |

---

## Cross-Contract Chain Pairs (for Chain Agent 2 priority matching)

| Priority | Variable/State | Writer Contract | Reader Contract | Finding Pair | Chain ID |
|----------|---------------|----------------|----------------|-------------|---------|
| 1 | `accessControl` | KernelVault (setAccessControl) | KernelVault (_processWithdraw) | INV-17 → INV-19 | CH-A |
| 2 | `approvedVerifiers` + `pausedSince` | KernelExecutionVerifier | KernelExecutionVerifier | INV-40 + INV-31 → ecosystem halt | CH-B |
| 3 | `slashPending` + `bonds` | WSTONBondManager | WSTONBondManager + L1 | INV-34 + INV-38 + INV-13 | CH-C |
| 4 | `maxOracleAge` + `oracleSigner` | OptimisticKernelVault | OptimisticKernelVault | INV-29 + INV-01 | CH-E |
| 5 | `_vaultBorrowed` (Aave) | AaveV3Adapter.withdrawToVault | AaveV3Adapter._checkVaultHealth | INV-61 → INV-04 | CH-G |
| 6 | `_vaultBorrowed` (Morpho) + `_vaultCollateral` | MorphoAdapter.withdrawToVault | MorphoAdapter.withdrawCollateral | INV-62 → locked collateral | CH-H |
| 7 | `deposited[user]` + `canDeposit` | VaultAccessControl (dead write via vault) | VaultAccessControl.canDeposit (never called) | INV-55 + INV-56 | CH-F |
| 8 | `positions[*].ytBalance` + `emptyYts` | PendleAdapter | PendleAdapter.claimRewards | INV-66 + INV-67 | CH-I |
| 9 | `totalTrackedStETH` | LidoAdapter (withdrawToVault nominal decrement) | LidoAdapter (subsequent vaultStETHShare) | INV-50 + INV-10 | CH-J |
| 10 | `pendingExecutions.status` + finder=address(0) | OptimisticKernelVault.selfSlash | WSTONBondManager.slashBondByRelayer (L1) | INV-57 + INV-13 | NEW CANDIDATE |
