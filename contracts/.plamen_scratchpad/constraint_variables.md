# Constraint Variables

## KernelVault

| Variable | Value | Setter | Enforced? | Notes |
|----------|-------|--------|-----------|-------|
| MAX_NONCE_GAP | 10 | constant | YES (InvalidNonce, NonceGapTooLarge) | L-03 fix: reduced from 100 |
| MAX_ORACLE_AGE_LIMIT | 24 hours | constant | YES (OracleAgeTooHigh) | Max for maxOracleAge setter |
| EMERGENCY_SETTLE_DELAY | 7 days | constant | YES (EmergencySettleTooEarly) | |
| EMERGENCY_WITHDRAW_DELAY | 14 days | constant | YES (EmergencyWithdrawTooEarly) | |
| MAX_CALL_VALUE_BPS | 4000 (40%) | constant | YES (CallValueExceedsLimit) | C-04 fix |
| MAX_CALL_ASSET_DELTA_BPS | 4000 (40%) | constant | YES (CallAssetDeltaExceedsLimit) | C-04 fix |
| DECIMALS_OFFSET | 1e3 | constant | YES (embedded in formula) | ERC4626 inflation protection |
| BPS_DENOMINATOR | 10_000 | constant | YES | |
| MAX_MANAGEMENT_FEE_BPS | 500 (5%) | constant | YES (ManagementFeeTooHigh) | |
| MAX_PERFORMANCE_FEE_BPS | 5000 (50%) | constant | YES (PerformanceFeeTooHigh) | |
| MAX_PROTOCOL_FEE_SPLIT_BPS | 5000 (50%) | constant | YES (ProtocolFeeSplitTooHigh) | |
| MAX_COMBINED_FEE_BPS | 5000 (50%) | constant | YES (CombinedFeeTooHigh) | M-23 fix |
| FEE_CHANGE_COOLDOWN | 7 days | constant | YES (FeeChangeCooldown) | M-07 fix |
| MAX_PPS_CHECKPOINTS | 30 | constant | YES (modulo in index) | |
| managementFeeBps | 0..500 | setFees() | YES | Capped by MAX_MANAGEMENT_FEE_BPS |
| performanceFeeBps | 0..5000 | setFees() | YES | Capped by MAX_PERFORMANCE_FEE_BPS |
| protocolFeeSplitBps | 0..5000 | setProtocolTreasury() | YES | Capped by MAX_PROTOCOL_FEE_SPLIT_BPS |
| maxOracleAge | 0..86400 | setOracleSigner() | YES | Must be non-zero when signer set (L-16) |

## OptimisticKernelVault

| Variable | Value | Setter | Enforced? | Notes |
|----------|-------|--------|-----------|-------|
| MIN_CHALLENGE_WINDOW | 30 min | constant | YES (InvalidChallengeWindow) | M-24 fix: raised from 15m |
| MAX_CHALLENGE_WINDOW | 24 hours | constant | YES (InvalidChallengeWindow) | |
| DEFAULT_CHALLENGE_WINDOW | 1 hour | constant | YES (constructor) | |
| DEFAULT_MAX_PENDING | 3 | constant | YES (constructor) | |
| MAX_MAX_PENDING | 10 | constant | YES (InvalidMaxPending) | |
| challengeWindow | 30m..24h | setChallengeWindow() | YES | L-05: cannot shorten with pending |
| minBond | >0 | setMinBond() | YES (InvalidMinBond for 0) | M-08 fix |
| maxPending | 1..10 | setMaxPending() | YES | L-06: rejects 0; L-43: rejects below _pendingCount |

## MetaVault

| Variable | Value | Setter | Enforced? | Notes |
|----------|-------|--------|-----------|-------|
| DECIMALS_OFFSET | 1e3 | constant | YES | |
| MAX_ALLOCATION_BPS | 4000 (40%) | constant | YES (WeightExceedsMax) | |
| REBALANCE_COOLDOWN | 1 hour | constant | YES (RebalanceCooldown) | |
| MAX_REBALANCE_SLIPPAGE_BPS | 200 (2%) | constant | YES (RebalanceSlippageExceeded) | |
| targetWeights[vault] | 0..4000 | rebalance() | YES | Global sum must equal 10000 |

## WSTONBondManager

| Variable | Value | Setter | Enforced? | Notes |
|----------|-------|--------|-----------|-------|
| FINDER_FEE_BPS | 1000 (10%) | constant | YES | |
| DEPOSITOR_SHARE_BPS | 8000 (80%) | constant | YES | |
| TREASURY_SHARE_BPS | 1000 (10%) | constant | YES | |
| BOND_EXPIRY | 90 days | constant | YES (BondNotExpired) | M-16: extended from 30d |
| MAX_BATCH_SIZE | 20 | constant | YES (BatchTooLarge) | |
| MAX_BOND_QUERY_RANGE | 10_000 | constant | YES (require) | L-27 fix |
| RELAYER_ROTATION_DELAY | 1 hour | constant | YES (require) | L-11 fix |
| minBondFloor | >0 | setMinBondFloor() | YES (require > 0) | L-43 fix |

## KernelExecutionVerifier

| Variable | Value | Setter | Enforced? | Notes |
|----------|-------|--------|-----------|-------|
| EXPECTED_PROTOCOL_VERSION | 1 | constant | YES | |
| EXPECTED_KERNEL_VERSION | 1 | constant | YES | |
| EXECUTION_STATUS_SUCCESS | 0x01 | constant | YES | |
| JOURNAL_LENGTH | 209 | constant | YES | |
| VERIFIER_ROTATION_DELAY | 48 hours | constant | YES | C-03 fix |
| UPGRADE_DELAY | 48 hours | constant | YES | |

## AgentRegistry

| Variable | Value | Setter | Enforced? | Notes |
|----------|-------|--------|-----------|-------|
| MAX_VAULTS_PER_UNREGISTER | 50 | constant | YES (TooManyVaultsToUnregister) | |
| UPGRADE_DELAY | 48 hours | constant | YES | |

## VaultFactory

| Variable | Value | Setter | Enforced? | Notes |
|----------|-------|--------|-----------|-------|
| UPGRADE_DELAY | 48 hours | constant | YES | |
| defaultProtocolFeeSplitBps | 0..5000 | setDefaultProtocolFeeSplitBps() | YES (require <= 5000) | |

## PointsProgram

| Variable | Value | Setter | Enforced? | Notes |
|----------|-------|--------|-----------|-------|
| EARLY_ADOPTER_PERIOD | 30 days | constant | YES | |
| EARLY_ADOPTER_MULTIPLIER | 3 | constant | YES | |
| EXECUTION_BONUS_POINTS | 50 | constant | YES | |
| MAX_RECORD_EXECUTION_BATCH | 100 | constant | YES | L-29 fix |
| MIN_SEASON_NOTICE | 24 hours | constant | YES | L-52 fix |
| REFERRAL_BONUS_BPS | 1000 (10%) | constant | YES | |

## BuilderProgram

| Variable | Value | Setter | Enforced? | Notes |
|----------|-------|--------|-----------|-------|
| SILVER_THRESHOLD | 100_000e18 | constant | YES | |
| GOLD_THRESHOLD | 1_000_000e18 | constant | YES | |

## UNENFORCED Variables

| Variable | Contract | Setter | Issue |
|----------|----------|--------|-------|
| accessControl | KernelVault | setAccessControl() | No validation that address is a valid VaultAccessControl — arbitrary address accepted. **UNENFORCED** |
| treasury (WSTONBondManager) | WSTONBondManager | setTreasury() | Accepts any non-zero address — no validation it's a proper treasury. Functionally enforced (zero check exists). |
| feeRecipient (KernelVault) | KernelVault | setFeeRecipient() | Zero address rejected, but no validation of recipient capability. Functionally enforced. |
