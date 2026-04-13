# Spawn Manifest

## Phase 2: Agent Design (9 breadth agents)

### Merge Cap Verification (300-line max per agent)

| Agent | Templates | Lines | Cap Check |
|-------|-----------|-------|-----------|
| B1: Oracle Analysis | ORACLE_ANALYSIS (237) | 237 | PASS |
| B2: Token Flow | TOKEN_FLOW_TRACING (251) | 251 | PASS |
| B3: Semi-Trusted Roles | SEMI_TRUSTED_ROLES (245) | 245 | PASS |
| B4: Core State | SHARE_ALLOCATION_FAIRNESS (116) + ECONOMIC_DESIGN_AUDIT (97) | 213 | PASS |
| B5: Staking + External | STAKING_RECEIPT_TOKENS (220) + EXTERNAL_PRECONDITION_AUDIT (48) | 268 | PASS |
| B6: Zero State + Centralization | ZERO_STATE_RETURN (158) + CENTRALIZATION_RISK (116) | 274 | PASS |
| B7: Temporal + Cross-Chain | TEMPORAL_PARAMETER_STALENESS (143) + CROSS_CHAIN_TIMING (89) | 232 | PASS |
| B8: Migration | MIGRATION_ANALYSIS (277) | 277 | PASS |
| B9: Storage Layout | STORAGE_LAYOUT_SAFETY (190) | 190 | PASS |

**Gate Check**: All REQUIRED templates have agents? **YES**

### Injectable Skills (key questions only for breadth)
- VAULT_ACCOUNTING → B4 (Core State)
- LENDING_PROTOCOL_SECURITY → B5 (Staking + External)
- DEX_INTEGRATION_SECURITY → B5 (Staking + External)

### Niche Agents (Phase 4b, 1 budget slot each)
| Niche Agent | Trigger | Required? | Status |
|-------------|---------|-----------|--------|
| EVENT_COMPLETENESS | MISSING_EVENT | YES | Pending (Phase 4b) |
| SIGNATURE_VERIFICATION_AUDIT | HAS_SIGNATURES | YES | Pending (Phase 4b) |
| SEMANTIC_CONSISTENCY_AUDIT | HAS_MULTI_CONTRACT | YES | Pending (Phase 4b) |
| MULTI_STEP_OPERATION_SAFETY | MULTI_STEP_OPS | YES | Pending (Phase 4b) |
| SPEC_COMPLIANCE_AUDIT | HAS_DOCS | YES | Pending (Phase 4b) |
| DIMENSIONAL_ANALYSIS | MIXED_DECIMALS | YES | Pending (Phase 4b) |

### Depth Budget Calculation
- actual_breadth_count = 9
- depth_floor = 12 + max(0, 5 - 9) = 12
- niche_injectable_count = 6 niche + 3 injectable = 9
- niche_overflow = max(0, 9 - 3) = 6
- thorough_bonus = 5
- hard_cap = 20 + 6 + 5 = 31
- iter1_fixed = 10 + 9 + 1 = 20 (10 base + 9 niche/injectable + 1 DST)
- iter23_reserve = 3
- effective_floor = max(12, 20 + 3) = 23
- max_depth_spawns = min(max(23, ceil(findings/5) + 7), 31)
  (exact value computed after inventory — findings count TBD)
