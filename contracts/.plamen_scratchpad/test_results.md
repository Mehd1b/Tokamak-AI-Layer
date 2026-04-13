# Test Results

## Command
`forge test -vvv` in `/Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/contracts`

## Summary
**RESULT: ALL PASS — NO FAILURES**
- **Total tests**: 1,144
- **Passed**: 1,144
- **Failed**: 0
- **Skipped**: 0
- **Test suites**: 92

## TEST HEALTH WARNING
None — all 1144 tests pass.

## Test Suite Breakdown

### Unit Tests
| Test Suite | Tests | Result |
|-----------|-------|--------|
| AgentRegistryTest | 57 | PASS |
| AaveV3AdapterTest | 59 | PASS |
| AdapterCrossVaultIsolationTest | 6 | PASS |
| KernelOutputParserConformanceTest | 9 | PASS |
| MediumHypotheses (multiple contracts) | 8 | PASS |
| VerifyBatchA | 1 | PASS |
| VerifyBatchB | 5 | PASS |
| VerifyHighHypotheses | 3 | PASS |

### Invariant/Fuzz Tests (runs: 256 each, 128,000 calls each)
| Test Suite | Tests | Result |
|-----------|-------|--------|
| InvariantFuzz | 19 | PASS |
| InvariantFuzzGaps | 20 | PASS |
| PPSStatefulInvariantsTest | 4 | PASS |

### Key Verified Hypotheses (from test names)
- CH01 (PASS): Emergency withdraw dilution
- H2_CH1 (PASS): Slash circumvention — bond reclaim after expiry without slash
- H3_CH3 (PASS): Multi-action blast radius — up to 99% drain with 64 actions
- H4/H5 (PASS): Retroactive fee lump-sum + withdraw lockout during strategy
- HIGH07 (PASS): Aave try/catch borrow forfeiture
- HIGH11 (PASS): setSeasonEnd retroactive reprice (fix verified)
- HIGH12 (PASS): Relayer rotation bypass (fix verified)
- H11: Fee minting dilutes withdrawal PPS + snapshot not updated on fee mint
- H12: Rebalance partial weight validation (stale weight)
- H13: Performance fee no timelock
- H14: setMinBond(0) now rejected (M-08 fix verified)
- H17: submitProof after deadline (no deadline check confirmed)
- H24: deployOptimisticVault challengeWindow fix (M-17 verified)
- H28: Management fee charged after strategy loss

### Invariant Coverage (all PASS)
- g1: strategyActive requires shares
- g2: deposits not blocked when no shares
- g3: snapshotTotalAssets non-negative
- g4: snapshotShares never exceeds totalShares
- g5: lastFeeTimestamp not in future
- g6: highWaterMark above baseline
- g7: pointsTotal decomposition
- g8: flushedPoints non-decreasing
- g9: seasonEnd not in past
- g10-g20: balance coverage, bond identity, NAV consistency, fee cap, etc.
- bondPerOperator, bondTokenBalance, totalBonded consistency (WSTONBondManager)
- kvEffectiveTotalAssets, kvFeeBps, kvHighWaterMark, kvNonce, kvPPS, kvSnapshot (KernelVault)
- mvNAV, mvTotalShares (MetaVault)

## Performance
- Total time: 39.83s (most of this is invariant/fuzz tests — 39s+)
- Invariant fuzz: 256 runs × 128,000 calls = ~32,768,000 total calls per invariant
