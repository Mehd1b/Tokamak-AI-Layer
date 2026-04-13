# Skeptic-Judge Report: HIGH and CRITICAL Findings

**Agent**: Skeptic-Judge (Inversion Mandate)
**Date**: 2026-04-13
**Scope**: All findings with CONFIRMED [POC-PASS] at HIGH or CRITICAL severity

---

## Methodology

For each finding, I read the PoC test, re-read the relevant source code, and attempted to identify:
1. Access control gates the PoC bypassed via test setup (e.g., pranking owner, mocking modifiers)
2. Timing constraints the PoC ignored
3. Economic costs that make the attack unprofitable in practice
4. Protocol trust model assumptions that already account for the behavior

Where a defense is found, I DISAGREE with the verifier and recommend DOWNGRADE or CONTESTED. Where no defense survives scrutiny, I AGREE with CONFIRMED.

---

### CH-7: AGREE
**Defense found**: No  
**Defense**: The verifier correctly framed the compound drain as defense-in-depth, contingent on ZK proof forgery. The one candidate defense is that `_executeTransferERC20` requires `token == address(asset)` (L1276-1278), limiting the attack to the vault's own asset. But this is irrelevant: the attacker's goal IS to drain that asset, so the single-asset restriction provides no protection against compound drain. The access control gate (msg.sender must be the vault's owner/execute() pathway) is genuine, but since the PoC correctly simulates the execute() call path — the same path any valid proof would follow — the gate is not bypassed by test setup; it is the actual attack path. No economic barrier exists: with a forged proof the attacker pays only gas. The cumulative cap in `_executeCall` (L1418-1424) uses `_executionInitialBalance`, but the identical pattern is absent from `_executeTransferERC20` (L1281-1299), which re-reads `totalAssets()` per action. The code asymmetry is confirmed in the source.  
**Ruling**: CONFIRMED  
**Reasoning**: The asymmetric application of the H-03 cumulative cap is unambiguous in the source — `_executeCall` uses `_executionInitialBalance` at L1418-1424, `_executeTransferERC20` uses live `totalAssets()` at L1281. No test-setup bypass is present; the attack traverses the real execute() codepath. The only remaining question (H-2 / CVE status) is correctly CONTESTED, consistent with the verifier's own split verdict.

---

### CH-3: AGREE
**Defense found**: No  
**Defense**: The only defense the protocol offers is `slashPending[operator][vault][nonce]` at L497 of WSTONBondManager.sol. This flag blocks reclaim, but it is set exclusively by `markSlashPending()`, which is callable only by `trustedRelayer`. This creates a single point of failure: there is no on-chain fallback, no multi-relayer redundancy, no merkle-proof path, and no timelock-gated emergency slash mechanism. The PoC correctly simulates relayer silence over 90 days (BOND_EXPIRY), after which `reclaimExpiredBond()` succeeds because `slashPending` is false. I checked whether BOND_EXPIRY constitutes a meaningful economic deterrent: at the documented 90-day window with $5 bond on a $10K vault, the cost-to-TVL ratio makes even a 1-in-1000 relayer failure economically rational for an attacker. There is no proportionality constraint anywhere in the bond lock flow (confirmed at L520: `getMinBond` returns flat `minBondFloor`). The trust model acknowledges a relayer exists but does not treat relayer liveness as a precondition; it treats it as an assumed operational guarantee — which is the gap.  
**Ruling**: CONFIRMED  
**Reasoning**: The `slashPending` defense is real but fully dependent on the trusted relayer being online. The PoC demonstrates exactly the scenario where the defense is vacuous. No additional on-chain gate, economic cost, or timing constraint blocks the attack when the relayer is offline.

---

### CH-4: AGREE
**Defense found**: No  
**Defense**: I tested one candidate defense: the comment at L498-500 ("L-08: clear any lingering `_vaultBorrowed` tracking...") frames the unconditional zeroing as an intentional design choice to prevent a vault DoS via ghost debt. However, this is the verifier's own observation, not a defense. The code at L501-505 zeroes `_vaultBorrowed` regardless of whether the `pool.withdraw` attempt succeeded or failed (the zeroing is outside the try-catch at L490-495). Reading the code flow: `_vaultSupplied` is correctly restored inside the catch at L494 when withdraw fails, but `_vaultBorrowed` is then zeroed unconditionally at L502-504. The "design intent" defense does not hold because the actual Aave debt persists — zeroing the tracker does not zero the debt. The health check at L584 uses `pool.getUserAccountData(address(this))`, which returns the adapter-level aggregate HF, not per-vault. With a healthy sibling vault supplying collateral, the aggregate HF passes even when Vault A has active debt with zeroed local tracking. I found no access control gate bypassed in the PoC; `withdrawToVault()` is callable by the vault (the intended caller).  
**Ruling**: CONFIRMED  
**Reasoning**: The unconditional borrow zeroing outside the try-catch is confirmed in the source at L501-505. The aggregate HF at L584 is also confirmed. The "ghost debt prevention" rationale explains the design intent but does not eliminate the vulnerability: it trades a DoS risk for a silent health-check bypass risk, and the PoC proves the latter is mechanically exploitable.

---

### CH-5: AGREE
**Defense found**: No  
**Defense**: I looked for three candidate defenses: (1) whether the vault would have enough loan tokens to cover the interest delta naturally, (2) whether Morpho's actual revert message provides the vault operator a recoverable warning, and (3) whether `_vaultBorrowed` could be zeroed before the collateral withdrawal fails. Examining the MorphoAdapter source at L618-634: the repay uses `vaultBorrow` (tracked nominal, L608) as the repay amount, not borrow shares. The code calls `IMorpho(morpho).repay(params, vaultBorrow, 0, address(this), "")` — the zero for shares means asset-based repay. If accrued interest causes actual debt > `vaultBorrow`, residual borrow shares remain after repayment, and Morpho will revert `withdrawCollateral` because any non-zero borrow shares block collateral withdrawal. This is Morpho's documented invariant. There is no catch block around the collateral withdrawal at L631-634, so the revert propagates and the entire `withdrawToVault` call fails — collateral is permanently locked. The `_vaultBorrowed` zeroing at L625 happens BEFORE the collateral withdrawal failure, so the tracker is zeroed but the position is not exited. The health check uses `_vaultBorrowed` as a stale proxy (L607-608), not live Morpho position data. No access control bypass in the PoC — `withdrawToVault` is the intended emergency exit path for the vault.  
**Ruling**: CONFIRMED  
**Reasoning**: The asset-based repay at L624 cannot cover accrued interest, causing residual borrow shares that block collateral withdrawal. The stale health check reads the local tracker, not Morpho's live position. Both paths are unambiguously confirmed in source.

---

### H-1: AGREE
**Defense found**: No  
**Defense**: H-1 is the same root cause as CH-7 (TRANSFER_ERC20 compound drain) analyzed in isolation without the CVE prerequisite. The asymmetric fix is definitive in the source: L1418-1424 applies `_executionInitialBalance` to CALL actions; L1281-1299 applies live `totalAssets()` to TRANSFER_ERC20. No additional access control, timing constraint, or economic barrier applies here beyond what was evaluated for CH-7. The test correctly calls execute() via the normal pathway. The per-action 40% cap is real but does not prevent compounding — three sequential 40%-of-current-balance actions on TRANSFER_ERC20 drain 78.4% as the PoC proves.  
**Ruling**: CONFIRMED  
**Reasoning**: Identical code-level analysis as CH-7. The finding is a strict subset of CH-7; if CH-7 is CONFIRMED, H-1 is CONFIRMED. Both share the same root cause and the same fix.

---

### H-4: AGREE
**Defense found**: No  
**Defense**: I checked whether `setMinBond()` on OptimisticKernelVault provides a TVL-proportional mechanism. Reading L344-352: `setMinBond(amount)` enforces a non-zero absolute floor but has no TVL reference. The `getMinBond()` in WSTONBondManager at L520 returns `minBondFloor` flat. The `_verifyOptimisticOracleAndBond` function would need to check `bondAmount >= totalAssets() * ratio` to close the gap, but no such check exists anywhere in the call path. Depositors cannot enforce a minimum bond ratio at deposit time — the minBond is an owner-settable parameter, not a protocol invariant. The economic argument (2000x ROI makes it a dominant strategy to attack) is correctly derived: even at 1% attack probability, the expected value calculation favors attack. The PoC doesn't bypass any access control — it correctly models that `lockBondDirect()` is permissionless (L321-342 in WSTONBondManager) and `executeOptimistic()` is callable by the vault owner (L83 in OptimisticKernelVault).  
**Ruling**: CONFIRMED  
**Reasoning**: No TVL-proportional enforcement exists in any contract in the call path. The trust model treats the vault owner as fully trusted, but the bond is a depositor protection mechanism — a fully trusted owner who is also the operator has no incentive to maintain a proportional bond, making the protection illusory.

---

### CH-1: DISAGREE
**Defense found**: Yes (partial — severity contested, not refuted)  
**Defense**: The CH-1 chain requires TWO conditions to produce the "one-way valve" harm: (1) unauthorized deposits succeed (H-5, deposit gate bypass), and (2) the owner sets a reverting accessControl (H-11, withdrawal DoS). Condition 2 is a FULLY TRUSTED ACTOR action — the owner explicitly sets `accessControl` to a reverting contract. The withdrawal DoS in isolation requires the owner to act maliciously or negligently. Per the report-template severity matrix: "Attack path requires fully-trusted actor to act maliciously → -1 tier (floor: Informational)." The vault owner is the protocol's FULLY_TRUSTED actor (they can pause, set fees, set access control, set verifier). The H-5 component (deposit gate bypass) is independently valid — unauthorized depositors DO enter — but the one-way valve HARM requires the owner to set a reverting accessControl. Without the owner's malicious action, unauthorized depositors can still withdraw. The PoC simulates `owner.setAccessControl(revertingContract)` which is the trusted actor's choice. The chain severity should be assessed as HIGH minus 1 tier = MEDIUM, per the trust assumption downgrade rule.  
**Ruling**: DOWNGRADE (HIGH → MEDIUM)  
**Reasoning**: The withdrawal DoS component requires the vault owner (fully trusted actor) to set a reverting accessControl. The deposit bypass (H-5) is valid independently, but the one-way valve harm only materializes with the owner's active malicious cooperation. Under the severity matrix's trusted-actor downgrade rule, the chain severity should be MEDIUM. Note: this does not REFUTE the finding — the deposit bypass component remains valid at its standalone severity (Medium for missing access control check on deposits).

---

### CH-2: AGREE
**Defense found**: No (for H-12 component)  
**Defense**: The H-12 component (cycle-pause indefinite) is the only [POC-PASS] element. The H-26 component (upgrade drops verifiers) is already marked CONTESTED with [CODE-TRACE] by the verifier. For H-12: `setVerificationPaused(bool paused)` at L350-355 unconditionally assigns `pausedSince = paused ? block.timestamp : 0` on every call. Calling it with `paused=true` every 6.9 days resets `pausedSince` each time, sliding the 7-day auto-expiry window indefinitely. The `onlyOwner` modifier is the only gate (confirmed). The owner IS the fully trusted actor here, but unlike CH-1, the pause mechanism was explicitly designed as an emergency response tool — there is an expectation it will be used. The question is whether the resetability is the INTENDED behavior or a bug. The code comment at L342-349 explains the purpose is to "shut down verification immediately upon discovering a vulnerability... the exploit window is closed by the pause." This implies INDEFINITE pause capability could be intended for multi-week CVE response cycles. However, the MAX_PAUSE_DURATION constant (7 days) explicitly contradicts this: if indefinite pause were intended, why define a max duration at all? The resetability undermines the explicit duration cap, making this a design inconsistency. The trust model DOES treat the owner as fully trusted (same argument as CH-1), but here the harm is to the owner's own protocol ecosystem rather than to depositors — the pause blocks ALL vault executions including the owner's own agent. This argues it is more likely an accidental bug than an intentional backdoor. I find no additional defense beyond onlyOwner.  
**Ruling**: CONFIRMED (H-12 component only, [POC-PASS])  
**Reasoning**: The `pausedSince` reset on repeated `setVerificationPaused(true)` calls directly contradicts the purpose of `MAX_PAUSE_DURATION`. The PoC proves the indefinite pause is mechanically achievable. The owner-only gate does not constitute a defense because the finding is about the pause mechanism itself being circumventable by the owner who intends to pause indefinitely during a CVE response — a scenario the code explicitly anticipates but fails to time-bound correctly.

---

### H-3: AGREE
**Defense found**: No  
**Defense**: H-3 is the H-3 component of CH-3 analyzed in isolation. The analysis is identical: the `slashPending` check at L497 is the only defense, and it requires the relayer to be operational. I separately checked whether there is an on-chain slash path that bypasses the relayer: there is none. `markSlashPending()` at L376-384 is the only function that sets `slashPending`, and it is restricted to `trustedRelayer`. The protocol documentation (ORACLE.md) acknowledges the relayer is a centralized service. No fallback mechanism (multi-relayer, merkle proof, governance override) exists in the contract.  
**Ruling**: CONFIRMED  
**Reasoning**: Identical analysis to CH-3's H-3 component. The relayer single-point-of-failure is unambiguous in the WSTONBondManager source. No on-chain alternative exists to set `slashPending` without the relayer.

---

## Summary

| Finding | AGREE/DISAGREE | Defense Found | Ruling | Note |
|---------|---------------|---------------|--------|------|
| CH-7 (CRITICAL conditional) | AGREE | No | CONFIRMED | Code asymmetry definitive at L1418 vs L1281 |
| CH-3 (HIGH) | AGREE | No | CONFIRMED | Relayer SPOF, no on-chain fallback |
| CH-4 (HIGH) | AGREE | No | CONFIRMED | Unconditional borrow zeroing at L501-505 outside try-catch |
| CH-5 (HIGH) | AGREE | No | CONFIRMED | Asset-based repay misses interest; collateral permanently locked |
| H-1 (HIGH) | AGREE | No | CONFIRMED | Same root cause as CH-7; strict subset |
| H-4 (HIGH) | AGREE | No | CONFIRMED | No TVL-proportional enforcement in any contract |
| CH-1 (HIGH) | DISAGREE | Yes (partial) | DOWNGRADE to MEDIUM | Withdrawal DoS requires fully-trusted owner to act maliciously; -1 tier per trust matrix |
| CH-2 (HIGH) | AGREE | No | CONFIRMED (H-12 only) | Cycle-pause defeats MAX_PAUSE_DURATION; H-26 remains CONTESTED |
| H-3 (HIGH) | AGREE | No | CONFIRMED | Identical to CH-3's H-3 component |

**AGREED**: 8 findings  
**DISAGREED**: 1 finding (CH-1: HIGH → MEDIUM)
