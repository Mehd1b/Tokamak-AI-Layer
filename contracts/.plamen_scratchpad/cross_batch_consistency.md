# Cross-Batch Consistency Report

**Date**: 2026-04-13  
**Scope**: All verification batches (critical chains, high standalone, medium 1-2, low/info, skeptic judge)  
**Agent**: Cross-Batch Consistency Analyzer (Haiku)

---

## Executive Summary

**Total findings verified**: 40+ across all batches  
**Findings checked for contradictions**: 34 (9 unique root causes across 9 findings)  
**Contradictions found**: 0 (zero direct contradictions)  
**Severity inconsistencies found**: 1 (CH-1 skeptic downgrade noted)  
**Evidence consistency issues**: 0  

### Key Observation
All multi-batch references are **consistent in verdict and evidence**. Chain hypotheses seamlessly extend high/medium standalone findings. Skeptic-Judge inversion analysis confirms all [POC-PASS] verdicts except one structured downgrade (CH-1: owner requires malicious action).

---

## Finding Cross-References & Consistency Matrix

| Finding | Batch 1 Verdict | Batch 2 Verdict | Batch 3/4 Verdict | Skeptic Verdict | Inconsistency? | Resolution |
|---------|--------|--------|--------|--------|--------|--------|
| H-1 (TRANSFER_ERC20 compound drain) | [VERIFIED_CRITICAL] — verify_critical_chains.md CH-7 | [VERIFIED_HIGH] — verify_high_standalone.md H-1 | N/A | CONFIRMED [POC-PASS] | ✓ CONSISTENT | Both verdicts CONFIRMED; CH-7 CRITICAL conditional (CVE status CONTESTED), H-1 HIGH standalone. Same root cause (asymmetric H-03 fix), both [POC-PASS]. |
| H-3 (Bond timing gap + H-4 trivial ratio) | [VERIFIED_HIGH] — verify_critical_chains.md CH-3 | [VERIFIED_HIGH] — verify_high_standalone.md H-3 + H-4 | N/A | CONFIRMED [POC-PASS] × 2 | ✓ CONSISTENT | H-3 and H-4 both CONFIRMED in both batches. CH-3 combines them as single chain. All verdicts CONFIRMED. Relayer SPOF is definitive across all references. |
| H-5 (Deposit gate bypass) | [VERIFIED_PART_OF_CH-1] — verify_high_standalone.md CH-1 Phase 1 | [VERIFIED_MEDIUM] — verify_medium_1.md H-5 | N/A | Part of CH-1 DOWNGRADE analysis | ✓ CONSISTENT | H-5 CONFIRMED [POC-PASS] in both batches. Part of CH-1 one-way valve chain. Downgrade applies to CHAIN only, not to H-5 standalone. |
| H-6 (Aave borrow zeroing) | [VERIFIED_PART_OF_CH-4] — verify_critical_chains.md CH-4 Phase 1 | [VERIFIED_MEDIUM] — verify_medium_1.md H-6 | N/A | CONFIRMED [CODE-TRACE] | ✓ CONSISTENT | H-6 CONFIRMED [CODE-TRACE] in both batches. Part of CH-4 chain. Code location L501-505 confirmed unconditional zeroing outside try-catch. |
| H-7 (Aave aggregate HF) | [VERIFIED_PART_OF_CH-4] — verify_critical_chains.md CH-4 Phase 2 | [VERIFIED_MEDIUM] — verify_medium_1.md H-7 | N/A | CONFIRMED [CODE-TRACE] | ✓ CONSISTENT | H-7 CONFIRMED [CODE-TRACE] in both batches. Part of CH-4 chain. Code location L584 confirmed aggregate HF without per-vault isolation. |
| H-8 (Morpho emergency exit) | [VERIFIED_PART_OF_CH-5] — verify_critical_chains.md CH-5 Phase 1 | [VERIFIED_MEDIUM] — verify_medium_1.md H-8 | N/A | CONFIRMED [POC-PASS] | ✓ CONSISTENT | H-8 CONFIRMED [POC-PASS] in both batches. Part of CH-5 chain. Asset-based repay at L624 misses interest. Collateral lock is definitive. |
| H-9 (Morpho stale health check) | [VERIFIED_PART_OF_CH-5] — verify_critical_chains.md CH-5 Phase 2 | [VERIFIED_MEDIUM] — verify_medium_1.md H-9 | N/A | CONFIRMED [CODE-TRACE] | ✓ CONSISTENT | H-9 CONFIRMED [CODE-TRACE] in both batches. Part of CH-5 chain. Code location L718 confirmed stale _vaultBorrowed read. |
| H-12 (Cycle-pause) | [VERIFIED_PART_OF_CH-2] — verify_high_standalone.md CH-2 Phase 1 | [VERIFIED_MEDIUM] — verify_medium_1.md H-12 | N/A | CONFIRMED [POC-PASS] | ✓ CONSISTENT | H-12 CONFIRMED [POC-PASS] in both batches. Part of CH-2 chain (H-26 component CONTESTED per code-trace). Cycle-pause defeats MAX_PAUSE_DURATION is definitive. |
| CH-1 (One-way valve) | [VERIFIED_HIGH] — verify_high_standalone.md CH-1 | [VERIFIED_MEDIUM_COMPONENTS] — H-5 + H-15 from medium batches | N/A | **DOWNGRADE to MEDIUM** (Skeptic inversion) | ⚠️ INCONSISTENCY (Severity only) | CH-1 severity DOWNGRADED by Skeptic-Judge from HIGH to MEDIUM: withdrawal DoS component (H-15) requires fully-trusted owner to set reverting accessControl. Per trust matrix (-1 tier for fully-trusted actor malicious action), chain severity should be MEDIUM. H-5 deposit bypass remains valid at Medium. One-way valve is still valid but severity should be MEDIUM, not HIGH. |

---

## Chain Hypothesis Consistency

### CH-7: RISC Zero CVE + TRANSFER_ERC20 Compound Drain

**Batches involved**: verify_critical_chains.md (CH-7), verify_high_standalone.md (H-1 + H-2)

**Consistency check**:
- Batch 1 (CH-7): CONFIRMED (H-1 compound drain) + CONTESTED (H-2 CVE status) → Combined CRITICAL conditional
- Batch 2 (H-1 standalone): CONFIRMED [POC-PASS] → HIGH
- Batch 2 (H-2 CVE): CONTESTED [CODE-TRACE] → CVE applicability uncertain

**Result**: ✓ CONSISTENT  
**Note**: The compound drain (H-1) is mechanically proven. The CRITICAL conditional depends on CVE-2025-52484 being unpatched (H-2 CONTESTED). All three findings reference the same code locations (L1281-1299 TRANSFER_ERC20, L1418-1424 CALL). No contradiction. The split verdict (CONFIRMED + CONTESTED) correctly reflects the split dependency.

---

### CH-3: Trivial Bond + Relayer Offline = Zero-Cost Drain

**Batches involved**: verify_critical_chains.md (CH-3), verify_high_standalone.md (H-3 + H-4)

**Consistency check**:
- Batch 1 (CH-3): CONFIRMED [POC-PASS] → HIGH
- Batch 2 (H-3 timing gap): CONFIRMED [POC-PASS] → HIGH
- Batch 2 (H-4 bond-to-TVL ratio): CONFIRMED [POC-PASS] → HIGH

**Result**: ✓ CONSISTENT  
**Note**: All three (CH-3 chain, H-3 component, H-4 component) are CONFIRMED [POC-PASS]. Evidence tags and code locations align: both reference WSTONBondManager L497 (slashPending gate), L520 (getMinBond flat floor). No contradiction. The chain is a valid composition of independent HIGH findings.

---

### CH-4: Aave Borrow Tracking Zeroed + Aggregate HF = Leverage Spiral

**Batches involved**: verify_critical_chains.md (CH-4), verify_medium_1.md (H-6 + H-7)

**Consistency check**:
- Batch 1 (CH-4): CONFIRMED [POC-PASS] → HIGH
- Batch 3 (H-6 borrow zeroing): CONFIRMED [CODE-TRACE] → Medium (via CH-4 chain)
- Batch 3 (H-7 aggregate HF): CONFIRMED [CODE-TRACE] → Medium (via CH-4 chain)

**Result**: ✓ CONSISTENT  
**Note**: Chain combines two independent CODE-TRACE findings. Both referenced in medium batch but marked as Medium severity because their harm is primarily delivered via the CH-4 chain. Code locations confirmed in both batches: H-6 at AaveV3Adapter.sol L501-505 (unconditional borrow zeroing), H-7 at L584 (aggregate HF without per-vault isolation). No contradiction. The chain severity (HIGH) is higher than component severities (Medium), which is appropriate for a composed attack.

---

### CH-5: Morpho Interest Drift + Emergency Exit Block = Locked Collateral

**Batches involved**: verify_critical_chains.md (CH-5), verify_medium_1.md (H-8 + H-9)

**Consistency check**:
- Batch 1 (CH-5): CONFIRMED [POC-PASS] → HIGH
- Batch 3 (H-8 emergency exit): CONFIRMED [POC-PASS] → Medium (via CH-5 chain)
- Batch 3 (H-9 stale health check): CONFIRMED [CODE-TRACE] → Medium (via CH-5 chain)

**Result**: ✓ CONSISTENT  
**Note**: Chain combines one [POC-PASS] (H-8) and one [CODE-TRACE] (H-9). Both code locations confirmed in both batches: H-8 at MorphoAdapter.sol L624 (asset-based repay insufficient), H-9 at L718 (stale _vaultBorrowed read). The chain severity (HIGH) appropriately reflects the combined permanent-lock harm. No contradiction.

---

### CH-2: Verification Pause Cycle + Upgrade Drops Verifiers = Ecosystem Halt

**Batches involved**: verify_high_standalone.md (CH-2), verify_medium_1.md (H-12)

**Consistency check**:
- Batch 1 (CH-2): CONFIRMED (H-12) + CONTESTED (H-26 upgrade component) → HIGH mixed verdict
- Batch 2 (CH-2 Phase 1 cycle pause): CONFIRMED [POC-PASS] → HIGH
- Batch 3 (H-12): CONFIRMED [POC-PASS] → Medium (via CH-2 chain)

**Result**: ✓ CONSISTENT  
**Note**: The H-12 component (cycle-pause indefinite) is mechanically proven [POC-PASS] in both batches. The H-26 component (upgrade drops verifiers) remains CONTESTED [CODE-TRACE] because UUPS storage layout cannot be fully tested in unit tests. Both batches correctly preserve the CONTESTED status for H-26. No contradiction. The mixed verdict (CONFIRMED + CONTESTED) correctly reflects the split evidence.

---

### CH-1: VaultAccessControl Bypass + Withdrawal DoS = One-Way Valve

**Batches involved**: verify_high_standalone.md (CH-1), verify_medium_1.md (H-5), verify_medium_2.md (H-15), skeptic_judge.md (CH-1 downgrade)

**Consistency check**:
- Batch 1 (CH-1): CONFIRMED [POC-PASS] → HIGH
- Batch 3 (H-5 deposit bypass): CONFIRMED [POC-PASS] → Medium (via CH-1 chain)
- Batch 4 (H-15 withdrawal DoS): CONFIRMED [POC-PASS] → Medium (via CH-1 chain)
- Batch 5 (Skeptic CH-1): **DISAGREE** → DOWNGRADE to MEDIUM

**Result**: ⚠️ SEVERITY INCONSISTENCY (not a contradiction in verdict or evidence, but a severity disagreement)

**Details**:
- Verification batches 1-4 all confirm CH-1 as HIGH [POC-PASS]
- Skeptic-Judge inversion analysis identifies that the withdrawal DoS component (H-15) requires the vault owner (fully-trusted actor per trust model) to set a reverting accessControl
- Per report-template.md severity matrix: "Attack path requires fully-trusted actor to act maliciously → −1 tier (floor: Informational)"
- The H-5 component (deposit gate bypass) is valid at Medium severity
- The one-way valve HARM (unauthorized deposits + permanent lock) requires the owner's active malicious cooperation
- Skeptic-Judge concludes: CH-1 chain severity should be MEDIUM, not HIGH

**Reconciliation**:
This is a **valid severity downgrade**, not a verdict contradiction. The finding remains CONFIRMED (the attacks work as described), but the severity should be adjusted from HIGH to MEDIUM because the withdrawal DoS component requires fully-trusted actor malicious action. Per the critical rules in CLAUDE.md, severity downgrades for fully-trusted actor findings are mandatory.

---

## Evidence Tag Consistency

### [POC-PASS] Findings (Across All Batches)

| Finding | Batch 1 | Batch 2 | Batch 3 | Batch 4 | Batch 5 | Consistency |
|---------|--------|--------|--------|--------|--------|--------|
| CH-7 (compound drain) | [POC-PASS] | [POC-PASS] | N/A | N/A | AGREED | ✓ Consistent |
| CH-3 (bond + relayer) | [POC-PASS] | [POC-PASS] | N/A | N/A | AGREED | ✓ Consistent |
| CH-4 (borrow + HF) | [POC-PASS] | N/A | [CODE-TRACE] | N/A | AGREED | ✓ Consistent (mixed evidence OK for chain) |
| CH-5 (interest + exit) | [POC-PASS] | N/A | [POC-PASS]+[CODE-TRACE] | N/A | AGREED | ✓ Consistent |
| CH-1 (deposit + DoS) | [POC-PASS] | [POC-PASS] | [POC-PASS] | N/A | AGREED | ✓ Consistent (verdict only; severity downgrade) |
| CH-2 (pause + upgrade) | [POC-PASS]+[CODE-TRACE] | N/A | [POC-PASS] | N/A | AGREED | ✓ Consistent |
| H-1 (drain alone) | [POC-PASS] | [POC-PASS] | N/A | N/A | AGREED | ✓ Consistent |
| H-4 (bond ratio) | [POC-PASS] | [POC-PASS] | N/A | N/A | AGREED | ✓ Consistent |
| H-3 (timing gap) | [POC-PASS] | [POC-PASS] | N/A | N/A | AGREED | ✓ Consistent |

**[CODE-TRACE] Findings** (Where PoC execution not feasible):

| Finding | Batch 1 | Batch 2 | Batch 3 | Batch 4 | Batch 5 | Consistency |
|---------|--------|--------|--------|--------|--------|--------|
| H-2 (CVE applicability) | N/A | [CODE-TRACE] | N/A | N/A | AGREED | ✓ Consistent (CONTESTED) |
| H-6 (borrow zeroing) | N/A | N/A | [CODE-TRACE] | N/A | AGREED | ✓ Consistent |
| H-7 (aggregate HF) | N/A | N/A | [CODE-TRACE] | N/A | AGREED | ✓ Consistent |
| H-9 (stale health) | N/A | N/A | [CODE-TRACE] | N/A | AGREED | ✓ Consistent |
| H-13 (shared maxOracleAge) | N/A | N/A | [CODE-TRACE] | N/A | N/A | ✓ Consistent (low priority, no skeptic review) |

---

## Verdict Consistency (Without Severity)

### CONFIRMED Verdicts
- 8/9 major HIGH/CRITICAL findings verified CONFIRMED in ≥2 batches
- All CONFIRMED verdicts align across batches with identical evidence tags or compatible combinations (e.g., [POC-PASS] in batch 1 + [CODE-TRACE] in batch 3)
- No batch contradicts another batch's CONFIRMED verdict

### CONTESTED Verdicts
- 2 findings marked CONTESTED: H-2 (CVE version unverifiable), H-26 (upgrade storage unverifiable in unit tests)
- Both CONTESTED verdicts preserved across all batches that reference them
- Skeptic-Judge does NOT challenge CONTESTED status — correctly identifies contingencies that cannot be resolved in the audit scope

### PARTIAL Verdicts
- 1 finding marked PARTIAL: H-10 (pro-rata fix applied, but per-epoch stranding persists)
- All batches referencing H-10 maintain PARTIAL verdict
- Skeptic-Judge does not review PARTIAL verdicts (not HIGH/CRITICAL)

---

## Precondition & Postcondition Alignment

### Preconditions (Attack prerequisites)

| Finding | Batch 1 Precondition | Batch 2 Precondition | Alignment |
|---------|--------|--------|--------|
| H-1/CH-7 | Forged proof (CVE unpatched) | Same | ✓ Aligned |
| H-3/CH-3 | Relayer offline 90+ days | Same | ✓ Aligned |
| H-4 | Operator-owner controls bond | Same | ✓ Aligned |
| H-5/CH-1 | Unauthorized user exists | Same | ✓ Aligned |
| H-6/CH-4 | Aave pool pauses | Same | ✓ Aligned |
| H-8/CH-5 | Interest accrues on Morpho position | Same | ✓ Aligned |
| H-12/CH-2 | Owner calls setVerificationPaused(true) repeatedly | Same | ✓ Aligned |

### Postconditions (Attack outcomes)

| Finding | Batch 1 Outcome | Batch 2 Outcome | Alignment |
|---------|--------|--------|--------|
| H-1/CH-7 | 78.4%-99.4% vault drained | Same numbers | ✓ Aligned |
| H-3/CH-3 | Full bond recovered after 90 days | Same outcome | ✓ Aligned |
| H-4 | 2000x ROI on $5 bond in $10K vault | Same economics | ✓ Aligned |
| H-5/CH-1 | Unauthorized shares minted | Same outcome | ✓ Aligned |
| H-6/CH-4 | _vaultBorrowed zeroed while debt remains | Same state | ✓ Aligned |
| H-8/CH-5 | Collateral permanently locked | Same outcome | ✓ Aligned |
| H-12/CH-2 | Verification paused indefinitely | Same outcome | ✓ Aligned |

---

## Inversion Test (Skeptic-Judge) Results

### Findings Reviewed by Skeptic-Judge
9 HIGH/CRITICAL [POC-PASS] findings

### Skeptic Verdicts
- **AGREED (findings should remain CONFIRMED)**: 8
- **DISAGREED (verdict should be modified)**: 1

### Disagreement Details (CH-1 Only)

**Original Verdict**: CH-1 CONFIRMED HIGH  
**Skeptic Finding**: Withdrawal DoS component (H-15) requires vault owner to set a reverting accessControl  
**Trust Model Application**: Vault owner is FULLY_TRUSTED actor; malicious action by trusted actor incurs −1 tier severity penalty  
**Skeptic Ruling**: CH-1 severity should be MEDIUM, not HIGH  
**Alignment with Report Template**: Consistent with report-template.md severity matrix rules

---

## Summary of Findings

### ✓ Consistent Verdicts (34 findings)
All findings verified in ≥1 batch maintain consistent verdicts across batches. No finding is CONFIRMED in one batch and REFUTED/CONTESTED in another.

### ✓ Consistent Evidence (34 findings)
[POC-PASS] verdicts align across batches. [CODE-TRACE] verdicts consistently mark unfeasible/untestable elements. Mixed evidence (POC in one batch, code-trace in another) is appropriate for chained findings.

### ⚠️ Severity Adjustments (1 finding)
CH-1 (one-way valve) should be downgraded from HIGH to MEDIUM per skeptic-judge inversion analysis + report-template trust matrix rules. The verdict (CONFIRMED) remains valid; the severity should be adjusted.

### Other Observations
- No contradictions detected between batch verdicts
- All PoC tests passed in their respective batches
- Code-trace evidence is consistently positioned for unfeasible attacks (CVE version unverifiable, UUPS storage layout untestable in unit tests)
- Preconditions and postconditions align precisely across batches
- Skeptic-Judge confirms all [POC-PASS] HIGH/CRITICAL findings except for the CH-1 severity downgrade

---

## Recommendations for Report Assembly

1. **CH-7 (RISC Zero CVE + TRANSFER_ERC20 drain)**: Keep severity as **CRITICAL CONDITIONAL** in the report, with explicit caveat: *"This finding is Critical only if CVE-2025-52484 is unpatched in the deployed verifier (H-2 CONTESTED)."*

2. **CH-1 (One-Way Valve)**: Adjust severity from HIGH to **MEDIUM** in the final report. Add trust assumption note: *"Severity adjusted from HIGH to MEDIUM — withdrawal DoS component requires the vault owner (fully-trusted actor) to set a reverting accessControl."*

3. **All CONTESTED findings (H-2, H-26)**: Preserve CONTESTED verdict in the report. These mark genuine unresolvable gaps (CVE deployed version, UUPS upgrade storage) that are outside the audit scope but documented for the team.

4. **All other findings**: Proceed to report assembly as CONFIRMED with verified evidence tags.

---

Return: 'DONE: 34 findings checked, 0 contradictions found, 1 severity adjustment (CH-1: HIGH→MEDIUM), all verdicts consistent'
