# State Dependency Map

## Variable to Finding Cross-Reference

| State Variable | Contract | Writer(s) | Consumer(s) | Finding(s) |
|---------------|---------|----------|-------------|-----------|
| maxOracleAge | KernelVault | setOracleSigner() | _verifyOptimisticOracleAndBond() Role A + B | INV-01 |
| oracleSigner | KernelVault | setOracleSigner() | _verifyOptimisticOracleAndBond() | INV-29 |
| bondSigner | OptimisticKernelVault | setOracleSigner() or separate setter | _verifyOptimisticOracleAndBond() | INV-01, INV-29 |
| strategyActive | KernelVault | setStrategy() settle() emergencySettle() emergencyWithdraw() | deposit() lock _processWithdraw() totalAssets() | INV-30 |
| strategyActivatedAt | KernelVault | First balance-reducing action (set once) | emergencySettle() 7d check | INV-37 |
| snapshotTotalAssets | KernelVault | setStrategy() | effectiveTotalAssets() totalAssets() during strategy | INV-22, INV-06 |
| highWaterMark | KernelVault | setFees() first-time only _collectPerformanceFee() | _collectPerformanceFee() | INV-23 |
| trackedIdle | MetaVault | deposit() withdraw() _depositToVault() _withdrawFromVault() | getNav() rebalance Phase 2 | INV-25, INV-11, INV-27 |
| _vaultSupplied[vault][asset] | AaveV3Adapter | depositToVault() | withdrawFromVault() cap check | INV-08 |
| totalTrackedStETH | LidoAdapter | syncRebase() depositToVault() withdrawFromVault() | NAV calculation | INV-10 |
| vaultStETHBalance[vault] | LidoAdapter | depositToVault() withdrawFromVault() - NOT syncRebase | Per-vault accounting | INV-10 |
| _vaultCreationCodeStore | VaultFactory | scheduleVaultCreationCodeStore() activateVaultCreationCodeStore() | computeVaultAddress() deployVault() | INV-41 |
| accessControl | KernelVault | setAccessControl() no event emitted | _processWithdraw() deposit() | INV-17, INV-19 |
| slashPending[operator][nonce] | WSTONBondManager | markSlashPending() | reclaimExpiredBond() guard | INV-34, INV-38 |
| approvedVerifiers | KernelExecutionVerifier | approveVerifier() initialize() | verifyAndParseWithImageId() | INV-40 |
| pausedSince | KernelExecutionVerifier | setVerificationPaused() | verifyAndParseWithImageId() auto-expiry | INV-31, INV-35 |

## Key Write-Consume Asymmetries (High Risk)

1. totalTrackedStETH vs vaultStETHBalance: syncRebase() writes aggregate only; deposit/withdraw write both.
   Consumer (per-vault withdrawal) reads vaultStETHBalance which diverges after negative rebase.
   Finding: INV-10

2. _vaultSupplied[vault][asset]: Written only at deposit (input amount). Never updated on aToken rebase.
   Consumer: withdrawFromVault() uses this as cap. Interest above cap is uncollectable.
   Finding: INV-08

3. strategyActive: Written at setStrategy() and emergency paths. NOT written at normal withdrawal drain.
   Consumer: deposit() blocks on strategyActive=true even when totalShares=0.
   Finding: INV-30

4. accessControl: Written by setAccessControl() with no event. Read on every _processWithdraw().
   Silent write enables DoS on all future withdrawals.
   Findings: INV-17, INV-19
