# Chain Hypotheses

**Agent**: Chain Agent 2 (Chain Matching + Composition Coverage)
**Date**: 2026-04-13
**Chains Identified**: 7
**Severity Upgrades**: 5

---

## Chain Summary Table

| Chain ID | Finding A (Blocked) | Missing Precondition | Finding B (Enabler) | Postcondition Match | Chain Severity |
|----------|--------------------|--------------------|--------------------|--------------------|---------------|
| CH-1 | H-15 (setAccessControl withdrawal DoS) | Owner sets reverting accessControl (STATE) | H-5 (deposit gates dead) | Unauthorized depositors enter vault | HIGH |
| CH-2 | H-26 (no verifier post-upgrade) | Upgrade drops approvedVerifiers (STATE) | H-12 (cycle-pause bypass) | Indefinite pause covers no-verifier window | HIGH |
| CH-3 | H-3 (bond reclaim timing gap) | Relayer fails to markSlashPending (TIMING/EXTERNAL) | H-4 (trivial bond-to-TVL) | Low bond means operator profit far exceeds bond | HIGH (already) |
| CH-4 | H-7 (aggregate HF cross-vault subsidy) | _vaultBorrowed artificially zeroed (STATE) | H-6 (Aave borrow tracking zeroed on withdraw fail) | Zero borrow + aggregate HF = hidden leverage spiral | HIGH |
| CH-5 | H-9 (Morpho health check stale) | Interest accrues beyond tracked principal (STATE) | H-8 (Morpho emergency exit fails with interest) | Stale health check prevents detection; emergency exit locks collateral | HIGH |
| CH-6 | H-10 (Pendle first-caller captures rewards) | LP rewards claimed atomically for all vaults (STATE) | H-11 (YT interest never claimed) | Compound Pendle yield loss: LP race + YT black hole | MEDIUM |
| CH-7 | H-1 (TRANSFER_ERC20 compound drain) | Forged proof needed (EXTERNAL) | H-2 (RISC Zero CVE unverifiable) | If CVE unpatched, compound drain becomes exploitation mechanism | CRITICAL |

---

## Detailed Chain Hypotheses

### CH-1: Deposit Gate Bypass + AccessControl Withdrawal DoS = One-Way Valve

#### Blocked Finding (A)
- **ID**: H-15 (INV-19, INV-17)
- **Title**: setAccessControl to reverting contract creates withdrawal DoS
- **Original Verdict**: PARTIAL
- **Missing Precondition**: Owner must intentionally (or accidentally) set a reverting accessControl contract. Impact limited if only authorized depositors are in the vault (TYPE: STATE + ACCESS)

#### Enabler Finding (B)
- **ID**: H-5 (DEPTH-ST-1, INV-55, INV-56)
- **Title**: VaultAccessControl deposit gates completely dead -- canDeposit/recordDeposit never called
- **Original Verdict**: CONFIRMED
- **Postcondition Created**: ANY address can deposit unlimited amounts bypassing whitelist/cap/KYC controls (TYPE: ACCESS, STATE)

#### Chain Match
- **Match Strength**: STRONG
- **Match Reasoning**: H-5 creates the precondition that UNAUTHORIZED depositors are in the vault. When H-15 is then triggered (owner sets reverting accessControl), the damage is amplified: not just authorized depositors are locked, but arbitrary external users who deposited through the bypassed gates. The combination creates a one-way valve: funds enter unrestricted (H-5) but cannot exit (H-15). The variable_finding_map confirms `accessControl` is the bridge: written by setAccessControl (INV-17, no event), consumed by _processWithdraw at L1166-1168.

#### Combined Attack Sequence
1. **Deposit gate bypass (H-5)**: Unauthorized users deposit funds into the vault because KernelVault.depositERC20Tokens/depositETH never call canDeposit() or recordDeposit().
2. **Silent policy change (H-38)**: Owner calls setAccessControl(reverting_contract) with no event emitted (INV-17), so depositors have no on-chain notification.
3. **Withdrawal DoS (H-15)**: All subsequent withdrawals revert at L1167 because IVaultAccessControl(accessControl).recordWithdrawal() reverts unconditionally.
4. **Combined impact**: Unauthorized depositors' funds are permanently trapped. Even authorized depositors cannot exit. The vault becomes a roach motel: funds check in but never check out.

#### Severity Reassessment
| Original A (H-15) | Original B (H-5) | Chain Severity |
|--------------------|-------------------|---------------|
| MEDIUM (PARTIAL) | MEDIUM (CONFIRMED) | **HIGH** |

Upgrade rationale: H-5 alone is Medium (access controls bypassed but no direct fund loss). H-15 alone is Medium (DoS but requires owner action). Together: unauthorized fund entry + permanent withdrawal lock = direct fund loss for depositors who entered through bypassed gates. Impact exceeds either finding alone.

---

### CH-2: Verification Pause Cycle + Upgrade Drops Verifiers = Permanent Protocol Halt

#### Blocked Finding (A)
- **ID**: H-26 (INV-40)
- **Title**: UUPS upgrade drops approvedVerifiers mapping -- verifier rotation broken post-upgrade
- **Original Verdict**: CONFIRMED (Low)
- **Missing Precondition**: Someone must actually perform the UUPS upgrade AND the window where no verifier is available must be covered (TYPE: STATE)

#### Enabler Finding (B)
- **ID**: H-12 (DEPTH-ST-5, INV-31, INV-35)
- **Title**: KernelExecutionVerifier cycle-pause bypasses MAX_PAUSE_DURATION auto-expiry
- **Original Verdict**: CONFIRMED (Medium)
- **Postcondition Created**: Indefinite verification pause masking any underlying verifier state issues (TYPE: STATE, TIMING)

#### Chain Match
- **Match Strength**: STRONG
- **Match Reasoning**: The variable_finding_map shows both `approvedVerifiers` (INV-40) and `pausedSince` (INV-31, INV-35) are in KernelExecutionVerifier. H-12 allows the verifier owner to maintain indefinite pause. During this pause, a UUPS upgrade (which re-initializes state) drops the approvedVerifiers mapping (H-26). When the pause is eventually lifted, the verifier has zero approved verifiers, making all proof verification permanently impossible. No vault in the ecosystem can execute.

#### Combined Attack Sequence
1. **Cycle-pause activation (H-12)**: Verifier owner calls setVerificationPaused(true) every 6.9 days, refreshing pausedSince and preventing auto-expiry.
2. **UUPS upgrade during pause (H-26)**: Owner upgrades verifier contract. The new implementation's initialize() does not re-seed approvedVerifiers -- mapping is empty.
3. **Pause lifted**: The MAX_PAUSE_DURATION eventually expires (or owner unpauses). Verification logic at L554-568 passes the pause check.
4. **Permanent halt**: verifyAndParseWithImageId calls the verifier at the approvedVerifiers address. But approvedVerifiers is empty -- no verifier can be found. ALL vault execute() calls revert permanently.
5. **No recovery without another upgrade**: The only fix is another UUPS upgrade with correct initialization, requiring the full UPGRADE_DELAY (48h) during which all vaults are frozen.

#### Severity Reassessment
| Original A (H-26) | Original B (H-12) | Chain Severity |
|--------------------|---------------------|---------------|
| LOW | MEDIUM | **HIGH** |

Upgrade rationale: H-26 alone is Low (empty verifier post-upgrade, fixable by re-upgrade). H-12 alone is Medium (indefinite pause, but eventually expires). Together: the pause COVERS the dangerous upgrade gap, and when it lifts, the ecosystem discovers zero verifiers exist. Combined impact: permanent execution halt for ALL vaults until another emergency upgrade. This is a protocol-wide DoS.

---

### CH-3: Trivial Bond + Relayer Offline = Zero-Cost Vault Drain

#### Blocked Finding (A)
- **ID**: H-3 (DEPTH-ST-4, DEPTH-EX-6, DST-5, INV-34, INV-38)
- **Title**: Cross-chain bond slash timing gap enables zero-penalty bond reclaim
- **Original Verdict**: CONFIRMED (High)
- **Missing Precondition**: The bond must be small enough that draining the vault is profitable after bond loss (TYPE: BALANCE)

#### Enabler Finding (B)
- **ID**: H-4 (DST-10, DST-4)
- **Title**: Bond-to-TVL ratio has no protocol-level minimum
- **Original Verdict**: CONFIRMED (High)
- **Postcondition Created**: Vault can have $5 bond protecting $10K+ TVL (TYPE: BALANCE, STATE)

#### Chain Match
- **Match Strength**: STRONG
- **Match Reasoning**: H-4 establishes the precondition (trivially low bond) and H-3 provides the mechanism (relayer offline + 90-day reclaim). Cross-state interaction S4 in enabler_results.md confirms: "operator drains vault at trivial bond cost, then recovers even that trivial bond after 90 days. Net loss to operator: gas costs only." The slashPending variable is the critical bridge: if markSlashPending is never called (relayer offline), reclaimExpiredBond at L487-515 succeeds because the guard at L497 passes.

#### Combined Attack Sequence
1. **Bond setup (H-4)**: Operator (who is also vault owner) sets minBond near the global floor (~1 WSTON/$5). No protocol mechanism enforces proportionality to TVL.
2. **Vault attracts deposits**: Depositors have no on-chain visibility into bond-to-TVL ratio. Vault accumulates $10K+ TVL.
3. **Malicious optimistic execution**: Operator submits a malicious executeOptimistic() that drains the vault.
4. **Slash event on HyperEVM**: slashExpired() is called (or deadline passes). ExecutionSlashed event emitted.
5. **Relayer failure (H-3)**: The trusted relayer is offline, DoS'ed, or compromised. markSlashPending() is NEVER called on L1.
6. **Bond reclaim after 90 days**: slashPending[operator][vault][nonce] remains false. After BOND_EXPIRY, operator calls reclaimExpiredBond() and recovers the full $5 bond.
7. **Net result**: Operator gains $10K+ from vault drain, loses $0 in bond (recovered). Net cost: gas fees only. 2000x+ return on "investment."

#### Severity Reassessment
| Original A (H-3) | Original B (H-4) | Chain Severity |
|-------------------|-------------------|---------------|
| HIGH | HIGH | **HIGH** (already highest -- but chain confirms maximum economic damage) |

No upgrade needed (both already High), but the chain CONFIRMS the full exploit path with concrete economics. This is the highest-impact finding in the audit.

---

### CH-4: Aave Borrow Tracking Zeroed + Aggregate Health Factor = Hidden Leverage Spiral

#### Blocked Finding (A)
- **ID**: H-7 (DEPTH-TF-4, INV-04)
- **Title**: AaveV3Adapter aggregate health factor enables cross-vault collateral subsidy
- **Original Verdict**: CONFIRMED (Medium)
- **Missing Precondition**: The aggregate HF must mask a per-vault health issue. With accurate per-vault tracking, the aggregate HF may still catch problems (TYPE: STATE)

#### Enabler Finding (B)
- **ID**: H-6 (DEPTH-ST-2, INV-61)
- **Title**: AaveV3Adapter withdrawToVault unconditionally zeroes _vaultBorrowed
- **Original Verdict**: CONFIRMED (Medium)
- **Postcondition Created**: _vaultBorrowed[vault][asset] = 0 even when pool.withdraw fails, meaning the vault's debt is invisible to any tracking (TYPE: STATE)

#### Chain Match
- **Match Strength**: STRONG
- **Match Reasoning**: The variable_finding_map shows `_vaultBorrowed` (Aave) is written by withdrawToVault (INV-61: zeroed unconditionally) and read by _checkVaultHealth (INV-04: aggregate HF). Cross-state interaction S4+S4-aggregate in enabler_results.md confirms: "With _vaultBorrowed=0 for one vault, the aggregate HF is no longer constrained by that vault's debt. The vault can then re-borrow unlimited amounts under the aggregate umbrella." The code at L498-503 zeroes _vaultBorrowed OUTSIDE the try-catch for pool.withdraw, meaning even if pool.withdraw fails (Aave paused), the tracking is erased.

#### Combined Attack Sequence
1. **Failed emergency withdrawal (H-6)**: Vault A triggers withdrawToVault() while Aave pool is paused. pool.withdraw reverts (L490 catch block restores _vaultSupplied). BUT _vaultBorrowed is zeroed at L501-503 unconditionally.
2. **Phantom health (H-6 postcondition)**: Vault A now shows _vaultBorrowed=0 despite having active Aave debt. The adapter believes this vault has no debt.
3. **Aggregate HF masking (H-7)**: _checkVaultHealth uses pool.getUserAccountData(address(this)) at L584. This returns the AGGREGATE health factor across ALL vaults sharing this adapter. Vault A's real debt still exists on Aave, but the adapter's per-vault tracking is blind to it.
4. **Re-borrow under aggregate umbrella**: Vault A calls borrow() again. _checkVaultHealth passes because the aggregate HF includes healthy vaults B and C's collateral covering Vault A's invisible debt.
5. **Leverage spiral**: Vault A can repeatedly borrow, fail-withdraw (zeroing tracked debt), and re-borrow. Each cycle adds real Aave debt but the adapter tracking shows zero. The aggregate HF degrades but is masked by other vaults' collateral.
6. **Cascading liquidation**: When Aave's actual aggregate HF drops below liquidation threshold, ALL vaults sharing the adapter are liquidated -- including healthy vaults B and C that are subsidizing Vault A's hidden leverage.

#### Severity Reassessment
| Original A (H-7) | Original B (H-6) | Chain Severity |
|-------------------|-------------------|---------------|
| MEDIUM | MEDIUM | **HIGH** |

Upgrade rationale: H-6 alone is Medium (borrow tracking zeroed, but natural re-borrow has health check). H-7 alone is Medium (aggregate HF masks per-vault risk). Together: zeroed tracking DISABLES the only per-vault safeguard, and aggregate HF ensures the protocol-level safeguard is structurally blind. The result is a leverage spiral threatening ALL vaults sharing the adapter -- cross-vault contagion elevates to High.

---

### CH-5: Morpho Stale Health Check + Emergency Exit Failure = Invisible Undercollateralization + Locked Collateral

#### Blocked Finding (A)
- **ID**: H-9 (DEPTH-ST-8, DEPTH-EX-1, INV-73)
- **Title**: MorphoAdapter health check uses stale nominal borrow -- silent undercollateralization
- **Original Verdict**: CONFIRMED (Medium)
- **Missing Precondition**: The stale health check must co-exist with an inability to exit the position (TYPE: STATE)

#### Enabler Finding (B)
- **ID**: H-8 (DEPTH-ST-3, DEPTH-TF-8, DEPTH-EX-2, INV-62, INV-70)
- **Title**: MorphoAdapter emergency exit fails when interest accrues -- collateral permanently locked
- **Original Verdict**: CONFIRMED (Medium)
- **Postcondition Created**: Collateral is permanently locked in Morpho; vault cannot exit the position (TYPE: STATE, BALANCE)

#### Chain Match
- **Match Strength**: STRONG
- **Match Reasoning**: Both findings share the same root variable: `_vaultBorrowed[vault][marketId]` in MorphoAdapter. H-9 says the health check READS stale nominal principal. H-8 says emergency exit FAILS because repay uses tracked principal (not actual shares with interest). The chain: health check is blind (H-9) so the position grows more dangerous over time undetected, AND when someone finally tries emergency exit, it fails (H-8), locking collateral permanently. EN-1 from enabler_results.md amplifies: higher Morpho interest rates accelerate both the health check staleness AND the emergency exit gap.

#### Combined Attack Sequence
1. **Position opened**: Vault borrows via MorphoAdapter. _vaultBorrowed tracks principal.
2. **Interest accrues (time passes)**: Morpho's actual debt grows (borrow shares appreciate). _vaultBorrowed remains at nominal principal. Health check divergence grows.
3. **Silent undercollateralization (H-9)**: _checkVaultHealth reads _vaultBorrowed (stale). Reports healthy. Actual Morpho position is approaching or past liquidation threshold.
4. **Further borrowing enabled**: Because health check passes, the vault can borrow more, deepening the undercollateralization.
5. **Emergency exit attempted (H-8)**: Owner tries withdrawToVault(). MorphoAdapter repays only tracked principal. Residual borrow shares remain. Morpho blocks collateral withdrawal because debt is not fully repaid.
6. **Collateral permanently locked**: The collateral cannot be withdrawn. The vault cannot service its debt (may lack loan tokens). Position is frozen.
7. **Combined impact**: The stale health check PREVENTS early detection, while the broken emergency exit PREVENTS recovery. The vault's Morpho collateral is effectively lost.

#### Severity Reassessment
| Original A (H-9) | Original B (H-8) | Chain Severity |
|-------------------|-------------------|---------------|
| MEDIUM | MEDIUM | **HIGH** |

Upgrade rationale: H-9 alone allows continued borrowing under stale health. H-8 alone locks collateral on emergency exit. Together: the vault silently becomes undercollateralized (H-9 prevents detection) AND cannot recover (H-8 locks collateral). This is a permanent fund loss scenario for the vault's Morpho positions.

---

### CH-6: Pendle First-Caller Race + YT Interest Black Hole = Compound Yield Loss

#### Blocked Finding (A)
- **ID**: H-10 (DEPTH-TF-6, DEPTH-EX-4, INV-66, INV-51)
- **Title**: PendleAdapter first-caller reward capture strands other vaults' LP rewards permanently
- **Original Verdict**: CONFIRMED (Medium)
- **Missing Precondition**: N/A -- already confirmed. But impact is compounded by additional yield loss vectors.

#### Enabler Finding (B)
- **ID**: H-11 (DEPTH-EX-5, INV-67)
- **Title**: PendleAdapter hardcoded empty YTs array means YT interest yield never claimed
- **Original Verdict**: CONFIRMED (Medium)
- **Postcondition Created**: All YT interest permanently uncollectable (TYPE: BALANCE)

#### Chain Match
- **Match Strength**: MODERATE
- **Match Reasoning**: These are not a classical postcondition-to-precondition chain. They are ADDITIVE yield losses through the same adapter (PendleAdapter). The variable_finding_map shows both interact through `positions[vault][market]` tracking. A vault using PendleAdapter loses yield from TWO independent channels: (1) LP rewards captured by the first caller with remainder stranded (H-10), and (2) YT interest never claimed at all (H-11). The compound effect means a multi-vault Pendle deployment loses nearly ALL non-PT yield.

#### Combined Attack Sequence
1. **YT interest black hole (H-11)**: From deployment, ALL vaults' YT interest yield is permanently uncollectable because claimRewards passes empty yts array. This is always active.
2. **LP reward race (H-10)**: When any vault calls claimRewards, the first caller captures all LP rewards. Non-first-callers permanently lose their share.
3. **Compound impact**: A vault using both LP and YT strategies through PendleAdapter loses:
   - 100% of YT interest yield (H-11, permanent, no mitigation)
   - Up to 100% of LP rewards if not the first caller (H-10, race-dependent)
   - The total yield loss can approach 100% of expected Pendle returns.

#### Severity Reassessment
| Original A (H-10) | Original B (H-11) | Chain Severity |
|--------------------|---------------------|---------------|
| MEDIUM | MEDIUM | **MEDIUM** (no upgrade -- both are already Medium and the compound is additive, not multiplicative) |

No severity upgrade: both findings are already Medium. The chain documents compound yield loss but does not create a new exploit path. The combined impact (near-total Pendle yield loss) is still within the Medium band because it affects yield, not principal.

---

### CH-7: RISC Zero CVE + TRANSFER_ERC20 Compound Drain = Single-Block Total Vault Drain

#### Blocked Finding (A)
- **ID**: H-1 (DEPTH-TF-1, DEPTH-EC-1)
- **Title**: TRANSFER_ERC20 compound drain bypasses cumulative 40% cap
- **Original Verdict**: CONFIRMED (High)
- **Missing Precondition**: Requires a forged proof or malicious agent. The ZK proof is the primary trust gate (TYPE: EXTERNAL)

#### Enabler Finding (B)
- **ID**: H-2 (DEPTH-EX-7)
- **Title**: RISC Zero verifier CVE-2025-52484 patching status unverifiable
- **Original Verdict**: CONTESTED (High)
- **Postcondition Created**: IF the CVE is unpatched, arbitrary proof forgery is possible (TYPE: EXTERNAL)

#### Chain Match
- **Match Strength**: MODERATE (contingent on CVE being unpatched -- cannot verify from source code)
- **Match Reasoning**: Cross-State 5 in enabler_results.md: "If the ZK verifier is vulnerable, the TRANSFER_ERC20 compound drain becomes the exploitation mechanism." H-2 provides the trust-root break (forge any proof). H-1 provides the blast-radius amplifier (drain 78.4%-100% in a single execute() via compound TRANSFER_ERC20). Without H-1, a forged proof would still be capped at 40% per action for CALL types (which use _executionInitialBalance cumulative cap). The TRANSFER_ERC20 path lacks this cumulative cap.

#### Combined Attack Sequence
1. **Proof forgery (H-2, contingent)**: Attacker exploits CVE-2025-52484 to forge a RISC Zero proof for any imageId.
2. **Malicious agent output**: The forged proof contains 3+ TRANSFER_ERC20 actions, each at 40% of current balance.
3. **Compound drain (H-1)**: _executeTransferERC20 uses per-action balanceBefore (L1281) not _executionInitialBalance. Action 1 drains 40%, Action 2 drains 40% of remaining 60% (24%), Action 3 drains 40% of remaining 36% (14.4%). Total: 78.4%.
4. **Full drain with more actions**: With 10+ actions, drain approaches 100%.
5. **Combined impact**: Single-block total vault drain. No monitoring window. No multi-proof requirement.

#### Severity Reassessment
| Original A (H-1) | Original B (H-2) | Chain Severity |
|-------------------|-------------------|---------------|
| HIGH | HIGH (CONTESTED) | **CRITICAL** (conditional on CVE) |

Upgrade rationale: H-1 alone is High (compound drain, but requires forged proof -- primary trust gate). H-2 alone is High (CVE may enable forgery, but unknown). Together: the trust gate break (H-2) directly enables the blast radius amplifier (H-1). If the CVE is unpatched, this is a permissionless single-block total drain of ANY vault. The conditional nature (CVE status unknown) makes this CRITICAL with a caveat: severity is contingent on on-chain verification of the deployed verifier version.

---

## Findings Status Update

| Hypothesis | Original Severity | Chain(s) | New Severity | Status |
|-----------|-------------------|----------|-------------|--------|
| H-1 | High | CH-7 | CRITICAL (conditional) | UPGRADED |
| H-2 | High | CH-7 | CRITICAL (conditional) | UPGRADED |
| H-3 | High | CH-3 | High (confirmed full path) | CONFIRMED |
| H-4 | High | CH-3 | High (confirmed full path) | CONFIRMED |
| H-5 | Medium | CH-1 | HIGH | UPGRADED |
| H-6 | Medium | CH-4 | HIGH | UPGRADED |
| H-7 | Medium | CH-4 | HIGH | UPGRADED |
| H-8 | Medium | CH-5 | HIGH | UPGRADED |
| H-9 | Medium | CH-5 | HIGH | UPGRADED |
| H-10 | Medium | CH-6 | Medium (compound, no upgrade) | CONFIRMED |
| H-11 | Medium | CH-6 | Medium (compound, no upgrade) | CONFIRMED |
| H-12 | Medium | CH-2 | HIGH | UPGRADED |
| H-15 | Medium | CH-1 | HIGH | UPGRADED |
| H-26 | Low | CH-2 | HIGH | UPGRADED |

---

## Verification Priority Order

1. **CH-7** (CRITICAL, conditional) -- Verify deployed RISC Zero verifier version. If CVE-2025-52484 is unpatched, this is the highest priority finding.
2. **CH-3** (HIGH, high confidence) -- Bond-to-TVL ratio + relayer timing. Both already confirmed; chain confirms full economic exploit.
3. **CH-4** (HIGH, high confidence) -- Aave borrow tracking + aggregate HF. Both confirmed; chain creates leverage spiral.
4. **CH-5** (HIGH, high confidence) -- Morpho health + emergency exit. Both confirmed; chain creates unrecoverable fund lock.
5. **CH-1** (HIGH, strong match) -- Deposit bypass + withdrawal DoS. Both confirmed; chain creates one-way valve.
6. **CH-2** (HIGH, strong match) -- Pause cycle + upgrade verifier drop. Both confirmed; chain creates protocol halt.
7. **CH-6** (MEDIUM, moderate match) -- Pendle compound yield loss. Both confirmed; additive impact.
