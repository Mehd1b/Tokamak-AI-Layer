# Phase 4a: Gates

## File Coverage

| Analysis File | Findings | Status |
|--------------|---------|--------|
| analysis_oracle.md | 5 unique (2 refuted) | COMPLETE |
| analysis_temporal_crosschain.md | 8 unique (3 refuted) | COMPLETE |
| analysis_core_state.md | 7 unique | COMPLETE |
| analysis_zerostate_centralization.md | 4 unique (4 deduped into other agents) | COMPLETE |
| analysis_roles.md | 8 unique (2 design notes excluded) | COMPLETE |
| analysis_token_flow.md | 8 unique | COMPLETE |
| analysis_migration.md | 5 unique (1 dup) | COMPLETE |
| analysis_storage.md | 1 unique (1 dup, 2 refuted) | COMPLETE |
| analysis_staking_external.md | 0 findings TRUNCATED AT 27 LINES | CRITICAL GAP |
| static_analysis.md | 3 promoted grep fallback Slither unavailable | PARTIAL |

## CRITICAL COVERAGE GAP

analysis_staking_external.md was truncated at 27 lines containing only the receipt token inventory table.
The following contracts have ZERO breadth security analysis:
- UniswapV4Adapter.sol (full security analysis missing)
- PendleAdapter.sol (full security analysis missing)
- StakingRouter.sol (unanalyzed entirely)

SE-1 (INV-45) and SE-2 (INV-46) are side-effect traces only - not substitutes for breadth analysis.
Missing injectable skills: LENDING_PROTOCOL_SECURITY, DEX_INTEGRATION_SECURITY.

Recommended action: Spawn dedicated breadth re-scan agent for UniswapV4Adapter + PendleAdapter + StakingRouter BEFORE proceeding to depth.

## Inventory Counts

- Total unique findings: 49
- Critical: 0
- High: 0
- Medium: 11
- Low: 24
- Informational: 14
- Static promotions: 3 (SLITHER-1, SLITHER-2, SLITHER-3)
- Side effect findings: 2 (SE-1, SE-2)
- Duplicates removed: 15
- REFUTED: 7

## Depth Candidates Flagged

10 findings flagged for depth (see findings_inventory.md TASK 4)
Priority 1: INV-04 AaveV3 aggregate HF
Priority 2: INV-01 shared maxOracleAge
Priority 3: INV-34 cross-chain timing gap
5 chain pre-scan escalations to HIGH identified (CH-A through CH-E)

## Assumption Dependency Tags Applied

TRUSTED-ACTOR: 5 findings (INV-17, INV-18, INV-23, INV-24, INV-36) - apply -1 tier in report
WITHIN-BOUNDS: 5 findings (INV-19, INV-29, INV-31, INV-34, INV-35) - note in report no severity change

## Elevated Signals Status

Resolved: STORAGE_LAYOUT, FORK_ANCESTRY_ERC4626, BRANCH_ASYMMETRY x2, REINIT_RISK, STAKING_RECEIPT, MULTI_STEP_OPS, MISSING_EVENT
Partial: INLINE_ASSEMBLY (KernelOutputParser), HAS_SIGNATURES
Unresolved: MIXED_DECIMALS (DIMENSIONAL_ANALYSIS niche required)
