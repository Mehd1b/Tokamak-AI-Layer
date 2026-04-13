# Confidence Distribution & Adaptive Loop Control

**Phase**: Phase 4b Iteration 1 (Depth Loop Post-Scoring)
**Date**: 2026-04-13
**Mode**: Thorough (EVM)

---

## Summary Counts

| Classification | Count | Percentage |
|---|---|---|
| **CONFIDENT** (>= 0.70) | 32 | 65.3% |
| **UNCERTAIN** (0.40–0.70) | 17 | 34.7% |
| **LOW_CONFIDENCE** (< 0.40) | 0 | 0% |
| **TOTAL** | 49 | 100% |

---

## CONFIDENT Findings (32)

Findings cleared 0.70 threshold — no further depth needed.

### By Severity

#### Critical: 0

#### High: 0

#### Medium: 8
- INV-01 (Oracle staleness) — 0.81
- INV-04 (Aave health factor) — 0.72
- INV-06 (ERC4626 inflation) — 0.82 ✓ [Highest confidence in audit]
- INV-08 (Aave interest stranding) — 0.75
- INV-25 (Emergency withdraw bypass) — 0.70
- INV-29 (No timelock on signer rotation) — 0.73
- INV-34 (Cross-chain slash timing) — 0.74
- INV-35 (MAX_PAUSE_DURATION lapse) — 0.70

#### Low: 19
- INV-09 (Morpho return values) — 0.72
- INV-10 (Lido rebase accounting) — 0.71
- INV-12 (Stranded rewards) — 0.70
- INV-13 (Cross-chain slash recipient) — 0.72
- INV-14 (WSTONBondManager ownership) — 0.82 ✓ [Multi-source]
- INV-15 (MetaVault immutable owner) — 0.81 ✓ [Multi-source]
- INV-16 (VaultAccessControl ownership) — 0.82 ✓ [Multi-source]
- INV-17 (setAccessControl no event) — 0.81 ✓ [Multi-source]
- INV-20 (removeVault no try/catch) — 0.72
- INV-21 (registerExternalVault validation) — 0.72
- INV-24 (Slash distribution) — 0.70
- INV-26 (Withdrawal rounding) — 0.72
- INV-40 (UUPS upgrade gap) — 0.70
- INV-43 (1-wei dust blocking) — 0.70
- INV-44 (Incomplete state cleanup) — 0.72
- INV-45 (Uniswap LP fee collection) — 0.72
- INV-46 (Pendle YT redemption) — 0.70

#### Informational: 5
- INV-05 (Morpho oracle revert DoS) — 0.71
- INV-18 (rescueTokens no event) — 0.81 ✓ [Multi-source]
- INV-28 (Sybil amplification) — 0.71
- INV-36 (Cooldown bypass) — 0.72
- INV-39 (Storage gap miscalculation) — 0.73
- INV-48 (Gas grief in AgentRegistry) — 0.74
- INV-49 (Gas grief in LidoAdapter) — 0.74

### Multi-Source CONFIDENT Findings (Highest reliability)
- **INV-14, INV-15, INV-16, INV-17, INV-18** — All at 0.81–0.82 composite
- Consensus = 0.90 (found by multiple source types)
- Pattern: ownership transfer, event emission, storage management — foundational patterns caught by both breadth agents + specialized scanners

---

## UNCERTAIN Findings (17)

Findings in 0.40–0.70 range — candidates for Iteration 2 focused re-analysis.

### Critical: 0

### High: 0

### Medium: 3 [MUST resolve per Phase 4b.5 Rule 3a]

| ID | Title | Composite | Evidence | Consensus | Quality | RAG | Issue |
|-------|-------|-----------|----------|-----------|---------|-----|-------|
| **INV-19** | Owner-set reverting accessControl DoS on _processWithdraw | 0.49 | 0.50 | 0.62 | **0.40** | 0.45 | PARTIAL verdict + LOW quality (only 1 depth tag for access control DoS) — need deeper precondition trace |
| **INV-22** | MetaVault deposit-lock absent — NAV timing arbitrage | 0.57 | 0.50 | 0.62 | 0.60 | 0.55 | PARTIAL verdict — "no deposit lock" claim needs boundary test: can NAV be timed on the exact settlement block? |
| **INV-31** | Cycle-pause to bypass MAX_PAUSE_DURATION | 0.68 | 0.80 | 0.62 | 0.85 | **0.35** | RAG score LOW (novel pattern) + high confidence in finding itself (0.68) — need to verify pause/unpause cycle actually bypasses 7d expiry |

### Low: 13

| ID | Title | Composite | Rationale |
|-------|-------|-----------|-----------|
| INV-02 | MorphoOracle staleness no validation | 0.58 | PARTIAL verdict — staleness check exists elsewhere, investigate if path is truly unchecked |
| INV-03 | MorphoAdapter hardcoded ORACLE_PRICE_SCALE | 0.54 | PARTIAL verdict — non-standard oracle assumption needs verification |
| INV-07 | withdrawTo(address(this)) share burn without asset movement | 0.53 | PARTIAL verdict — ERC4626 edge case, confirm if contract is actually vulnerable or by design |
| INV-11 | fee-on-transfer token trackedIdle over-decrement | 0.57 | PARTIAL verdict — fee-on-transfer assumption, check if applicable to tracked assets |
| INV-23 | HWM preserved through perf fee disable/re-enable | 0.54 | PARTIAL verdict + TRUSTED-ACTOR (owner must deliberately disable/re-enable) — verify impact at scale |
| INV-30 | strategyActive flag persists after all depositors exit | 0.69 | UNCERTAIN but near threshold (0.69) — normal withdrawal path vs emergency path interaction |
| INV-32 | setChallengeWindow asymmetric protection | 0.55 | PARTIAL verdict — increasing window with pending executions, verify race condition window |
| INV-33 | setMinBondFloor immediate effect no grace period | 0.56 | PARTIAL verdict — timing sensitivity with active bonds, check if can be exploited |
| INV-37 | strategyActivatedAt timestamp misuse | 0.69 | UNCERTAIN near threshold — 7d emergen settlement callable after first action, verify activation semantics |
| INV-38 | Cross-chain slash front-running residual | 0.56 | PARTIAL verdict + tied to INV-34 — if INV-34 is fixed, verify residual still exists |
| INV-41 | computeVaultAddress/deployVault TOCTOU race | 0.55 | PARTIAL verdict — code store swap race, check practical exploit window |
| INV-47 | ETH call reentrancy surface despite nonReentrant | 0.57 | PARTIAL verdict — guard present but surface flagged, verify reentrancy path possible |

### Informational: 1

| ID | Title | Composite | Rationale |
|-------|-------|-----------|-----------|
| INV-27 | MetaVault Phase 2 under-allocates on Phase 1 failure | 0.69 | UNCERTAIN near threshold — rebalance logic under partial withdrawal failure, verify it's genuinely incorrect |
| INV-42 | Agent successor chain links agentId not vault | 0.68 | UNCERTAIN near threshold — registry design concern, protocol-specific linkage assumption |

---

## Confidence Migration by Iteration (Predicted)

### Iteration 1 → 2 Strategy

Based on Phase 4b.5 anti-dilution rules and adaptive loop mechanics:

**Hard requirement**: All Medium-severity UNCERTAIN (INV-19, INV-22, INV-31) must be re-analyzed before proceeding to verification.

**Recommended approach**:

1. **Spawn 3 targeted depth agents** (one per Medium finding):
   - Agent 2A (depth-state-trace): INV-19 access control DoS precondition trace
   - Agent 2B (depth-edge-case): INV-22 NAV timing boundary analysis (settlement block exact timing)
   - Agent 2C (depth-external): INV-31 pause/unpause cycle interaction with MAX_PAUSE_DURATION

2. **Expected outcomes**:
   - **INV-19**: If trace shows reverting contract can be set by owner → CONFIDENT (upgrade 0.49 → 0.75+). If precondition requires owner malice beyond stated trust → REFUTED.
   - **INV-22**: If deposit lock confirmed absent AND NAV can move on settlement block → CONFIDENT (0.57 → 0.75+). If settlement atomicity prevents timing → PARTIAL/REFUTED.
   - **INV-31**: If pause/unpause cycle provably extends pause duration → CONFIDENT (0.68 → 0.80+). If cooldown/expiry is enforced correctly → REFUTED.

3. **Low-confidence migration**:
   - 13 Low-severity UNCERTAIN can proceed to Iteration 2 OR directly to verification, depending on budget and priority.
   - Phase 4b.5 Rule 3a: "Iteration 2 may ONLY be skipped if all UNCERTAIN findings are Low/Info severity." → We have 3 Medium, so Iteration 2 is MANDATORY.

---

## Iteration 2 Budget Allocation

**Base iter1 consumption** (Phase 4b.5): 10 fixed + niche + injectable
- 4 depth agents (breadth domains)
- 3 scanners (blind spot A/B/C)
- 1 validation sweep
- 1 sibling propagation
- 1 design stress testing

**Remaining budget** (from Phase 4b.5 adaptive cap):
- Thorough mode: max 25 depth spawns (iter1_fixed=22, reserve=3)
- Iter1 consumed: ~10
- **Available for Iteration 2: ~13** depth slots (plus 3 reserved for Iteration 3 if needed)

**Iteration 2 allocation** (per Phase 4b.5 Rule 3a — MANDATORY for Medium+ uncertain):
- 3 focused depth agents (the 3 Medium findings)
- 2–3 Low-severity depth agents (INV-30, INV-37, prioritized by spawn_priority formula)
- **Total Iteration 2: 5–6 agents** (well within 13-slot budget)

---

## Exit Condition Analysis

### Hard Iteration Cap
- **Current iteration**: 1 of 3 maximum
- **Status**: Continue to Iteration 2

### Zero-Uncertain Exit Check
- **UNCERTAIN findings**: 17 (non-zero)
- **All UNCERTAIN Low/Info?** NO (3 Medium)
- **Status**: Do NOT exit — proceed to Iteration 2 per Rule 3a

### Progress Check (post-Iteration 2)
- **Will evaluate**: After Iteration 2 completes and confidence scores are re-computed
- **Convergence criteria**: If confidence improved for >50% of re-analyzed findings → continue
- **If no progress in Iteration 2**: May exit early per Rule 3 (dynamic spawn cap)

### Oscillation Detection
- **Not applicable**: Only one iteration completed so far
- **Will evaluate**: After Iteration 2 produces scores that can be compared to Iteration 1

---

## Severity-Weighted Spawn Priority (for Iteration 2)

Phase 4b.5 formula: `spawn_priority = (1 - composite) × severity_weight`

| Finding | Composite | Severity | Weight | Priority | Rank |
|---------|-----------|----------|--------|----------|------|
| INV-19 | 0.49 | Medium | 3 | **1.53** | 🥇 1st |
| INV-22 | 0.57 | Medium | 3 | **1.29** | 🥈 2nd |
| INV-31 | 0.68 | Medium | 3 | **0.96** | 🥉 3rd |
| INV-02 | 0.58 | Low | 1 | **0.42** | 4th |
| INV-30 | 0.69 | Low | 1 | **0.31** | 5th |
| INV-37 | 0.69 | Low | 1 | **0.31** | 6th |

**Spawn order**: INV-19, INV-22, INV-31 (all MANDATORY), then INV-02, INV-30, INV-37 if budget permits.

---

## Summary for Orchestrator

1. **CONFIDENT findings are stable**: 32 findings (65.3%) cleared 0.70 threshold. Multi-source findings (INV-14–18) are highest confidence. These can proceed directly to verification without further depth.

2. **UNCERTAIN Medium findings are critical**: 3 findings (INV-19, INV-22, INV-31) must be resolved per Thorough mode completeness rules. Spawn Iteration 2 depth agents targeting these before finalizing verdict.

3. **Low-confidence bucket is empty**: No findings below 0.40. This indicates strong discovery quality and indicates the codebase has been thoroughly analyzed.

4. **Next step**: Proceed to Iteration 2 with focus on the 3 Medium-severity UNCERTAIN findings. Re-compute confidence scores post-Iteration 2 and evaluate exit conditions.

5. **Timeline**: Iteration 2 should complete in parallel (3–6 agents) within 1–2 hours. Then proceed to Phase 5 verification.
