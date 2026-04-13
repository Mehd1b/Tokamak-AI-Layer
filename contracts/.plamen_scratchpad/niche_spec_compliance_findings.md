# Spec Compliance Findings — Spec-to-Code Audit

**Agent**: Spec Compliance Niche Agent
**Date**: 2026-04-13
**Finding Prefix**: [NSP-N]
**Sources Audited**: docs/docs/onchain/bond-manager.md, docs/docs/onchain/security-considerations.md, docs/docs/architecture/cryptographic-chain.md, docs/docs/kernel/journal-format.md, CLAUDE.md (root + contracts), ORACLE.md, contracts/src/OPTIMISTIC_EXECUTION.md, docs/docs/getting-started/annotated-walkthrough.md

---

## STEP 1: Extracted Spec Claims

| # | Claim | Source | Claim Type | Testable? |
|---|-------|--------|------------|-----------|
| 1 | KernelJournalV1 = exactly 209 bytes, all integers little-endian | journal-format.md, CLAUDE.md root | PARAMETER | YES |
| 2 | action_type (u32 LE) + target (bytes32) + payload (u32 LE length + data) | CLAUDE.md root | SEQUENCE | YES |
| 3 | AGENT_CODE_HASH = SHA256(src/lib.rs \|\| 0x00 \|\| Cargo.toml) | CLAUDE.md root, design_context.md | PARAMETER | YES |
| 4 | cryptographic-chain.md says hash covers "all .rs files in src/, sorted" | cryptographic-chain.md §Agent Code Hash | PARAMETER | YES |
| 5 | MAX_NONCE_GAP = 100 | CLAUDE.md root | PARAMETER | YES |
| 6 | MAX_NONCE_GAP = 10 | design_context.md INV-4, KernelVault.sol comment | PARAMETER | YES |
| 7 | annotated-walkthrough.md says MAX_NONCE_GAP = 100 | annotated-walkthrough.md L244 | PARAMETER | YES |
| 8 | security-considerations.md validation checklist: "Nonce is exactly lastNonce + 1" | security-considerations.md L156 | INVARIANT | YES |
| 9 | optimistic-execution.md (docs root): MAX_NONCE_GAP = 100 | optimistic-execution.md L517 | PARAMETER | YES |
| 10 | Slash distribution: 10% finder + 80% depositors + 10% treasury | bond-manager.md, CLAUDE.md root | PARAMETER | YES |
| 11 | Bond expiry: 30 days | bond-manager.md L78, L110 | PARAMETER | YES |
| 12 | Bond lifecycle: Empty → Locked → {Released \| Slashed} | bond-manager.md §Bond Lifecycle | SEQUENCE | YES |
| 13 | Oracle bond signing format: "BOND_LOCK_V1" prefix, 6-field packed payload | ORACLE.md L21, OPTIMISTIC_EXECUTION.md L308, CLAUDE.md MEMORY.md | PARAMETER | YES |
| 14 | Cross-chain slashes send 100% to treasury (redistributes off-chain) | bond-manager.md L109 | FLOW | YES |
| 15 | Oracle signature uses EIP-191 with \x19Ethereum Signed Message:\n32 prefix | OPTIMISTIC_EXECUTION.md L308, OracleVerifier.sol | PARAMETER | YES |
| 16 | trustedImageId is pinned at vault creation (immutable) | CLAUDE.md root, design_context.md INV-3 | INVARIANT | YES |

---

## STEP 2: Verification Results

| # | Claim | Code Location | Match? | Details |
|---|-------|-------------- |--------|---------|
| 1 | Journal = 209 bytes, LE integers | KernelExecutionVerifier.sol:L29, KernelOutputParser.sol | MATCH | JOURNAL_LENGTH = 209; LE reads confirmed |
| 2 | Action layout: action_type + target + payload | KernelOutputParser.sol:L118-L176 | MATCH | Exact layout matched |
| 3 | AGENT_CODE_HASH = SHA256(src/lib.rs \|\| 0x00 \|\| Cargo.toml) | build.rs (scaffold, perp-trader, example-yield-agent) | MATCH | All build.rs files confirm this formula |
| 4 | cryptographic-chain.md: "all .rs files in src/, sorted" | docs/docs/architecture/cryptographic-chain.md:L40 | MISMATCH | Doc says "all .rs files in src/"; actual formula in all build.rs is SHA256(src/lib.rs \|\| 0x00 \|\| Cargo.toml) — only lib.rs and Cargo.toml |
| 5 | CLAUDE.md root: MAX_NONCE_GAP = 100 | KernelVault.sol:L52 | MISMATCH | Code: `uint64 public constant MAX_NONCE_GAP = 10;` Code comment says "L-03 fix: reduced from 100 to 10" |
| 6 | design_context.md: MAX_NONCE_GAP = 10 | KernelVault.sol:L52 | MATCH | Code confirms 10 |
| 7 | annotated-walkthrough.md: MAX_NONCE_GAP = 100 | KernelVault.sol:L52 | MISMATCH | Code: 10 |
| 8 | security-considerations.md: "Nonce is exactly lastNonce + 1" | KernelVault.sol:L1013-L1022 | MISMATCH | Code: `providedNonce > lastNonce && gap <= MAX_NONCE_GAP(10)` — gap up to 10 is allowed |
| 9 | optimistic-execution.md root: MAX_NONCE_GAP = 100 | KernelVault.sol:L52 | MISMATCH | Code: 10 |
| 10 | Slash: 10% finder + 80% depositors + 10% treasury | WSTONBondManager.sol:L39-L44 | MATCH | FINDER_FEE_BPS=1000, DEPOSITOR_SHARE_BPS=8000, TREASURY_SHARE_BPS=1000 |
| 11 | Bond expiry: 30 days | WSTONBondManager.sol:L55 | MISMATCH | Code: `BOND_EXPIRY = 90 days;` with comment "M-16: extended from 30 to 90 days" |
| 12 | Bond lifecycle: Empty→Locked→{Released\|Slashed} | WSTONBondManager.sol:L20-L26 | MATCH | BondStatus enum with these four values, unidirectional transitions enforced |
| 13 | Oracle bond signing: "BOND_LOCK_V1" 6-field format | OracleVerifier.sol:L161-L164 | MISMATCH | Code uses "BOND_LOCK_V2" with 7 fields: operator+vault+nonce+amount+chainId+attestationTs |
| 14 | Cross-chain slash: 100% to treasury | WSTONBondManager.sol:L417-L434 | MISMATCH | Code: 10% finder (if non-zero slasher) + 90% treasury (as depositor escrow). Finder IS paid; treasury gets both treasury+depositor shares |
| 15 | EIP-191 oracle signing | OracleVerifier.sol:L166-L167 | MATCH | `keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", bondHash))` |
| 16 | trustedImageId pinned at creation | KernelVault.sol:L129, L544-L551 | MATCH | `bytes32 public immutable trustedImageId;` set in constructor |

---

## STEP 3: Findings

---

## Finding [NSP-1]: Bond Attestation Signing Format Changed from V1 to V2 Without Documentation Update

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4 | ✓5
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗(no external tokens), R12:✗(no dangerous precondition), R13:✓, R14:✗(no aggregate), R15:✗(no flash loan), R16:✗(no oracle dep)]
**Severity**: Medium
**Location**: `docs/docs/onchain/bond-manager.md`, `ORACLE.md:L21`, `contracts/src/OPTIMISTIC_EXECUTION.md:L308`, `contracts/src/libraries/OracleVerifier.sol:L106,L161-L164`

**Spec Claim**: ORACLE.md line 21 and OPTIMISTIC_EXECUTION.md line 308 both specify:
> Role B signs: `keccak256("BOND_LOCK_V1" || operator || vault || nonce || amount || chainId)`

CLAUDE.md (root) MEMORY.md also documents: `bondHash = keccak256(abi.encodePacked("BOND_LOCK_V1", operator, vault, nonce, amount, chainId))` with a note that `nonce` is `uint64` (8 bytes packed, NOT 32).

**Code Reality**: `OracleVerifier.sol` line 106 and 161-164 implement:
```solidity
// @dev Attestation format: oracle signs keccak256("BOND_LOCK_V2" || operator || vault || nonce || amount || chainId || attestationTs)
bytes32 bondHash = keccak256(
    abi.encodePacked(
        "BOND_LOCK_V2", operator, vault, nonce, amount, chainId, attestationTs
    )
);
```

**Divergence Type**: MISMATCH

**Description**: The bond attestation signing format was upgraded from V1 (6-field, no timestamp) to V2 (7-field, with `attestationTs`) as part of the M-10 fix, which added replay protection via a timestamp. However, the external-facing documentation (ORACLE.md, OPTIMISTIC_EXECUTION.md) was not updated to reflect the new V2 format. Any oracle service operator who follows the published specification will sign the V1 payload, and every such attestation will be rejected on-chain by `requireValidBondAttestation()`.

**Impact**: Any oracle service implemented by integrators following the published documentation will generate invalid bond attestations. Every `executeOptimistic()` call using a V1-format attestation will revert with `InvalidBondAttestation`. This breaks the entire optimistic execution flow: operators cannot execute without a valid bond attestation, so the optimistic vault effectively becomes non-functional for any external integrator. The oracle service in `oracle-service/src/api/bond-attestation.ts` may also sign V1 if it was implemented before the M-10 fix.

**Evidence**:
- Spec (ORACLE.md L21): `"BOND_LOCK_V1" || operator || vault || nonce || amount || chainId` — 6 fields, no timestamp
- Spec (OPTIMISTIC_EXECUTION.md L308): same V1 format
- Code (OracleVerifier.sol L106): `"BOND_LOCK_V2" || ... || attestationTs` — 7 fields with timestamp
- Code (OracleVerifier.sol L161-164): `abi.encodePacked("BOND_LOCK_V2", operator, vault, nonce, amount, chainId, attestationTs)`

---

## Finding [NSP-2]: MAX_NONCE_GAP Documented as 100 in Three Locations but Code Enforces 10

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗, R12:✗, R13:✓, R14:✗, R15:✗, R16:✗]
**Severity**: Low
**Location**: `contracts/src/KernelVault.sol:L52`, `CLAUDE.md (root):INV-4`, `docs/docs/getting-started/annotated-walkthrough.md:L244`, `docs/optimistic-execution.md:L517`, `docs/docs/onchain/security-considerations.md:L156`

**Spec Claim**: Four independent documentation sources specify MAX_NONCE_GAP = 100:
- Root CLAUDE.md INV-4: "MAX_NONCE_GAP = 100"
- docs/docs/getting-started/annotated-walkthrough.md L244: "gaps are allowed (up to `MAX_NONCE_GAP = 100`)"
- docs/optimistic-execution.md L517: "The same `MAX_NONCE_GAP` (100) constraint applies."
- security-considerations.md L156: "Nonce is exactly lastNonce + 1" (implies no gap at all)

**Code Reality**: `KernelVault.sol:L49-L52`:
```solidity
/// @dev L-03 fix: reduced from 100 to 10. A gap of 100 was over-permissive
///      and made nonce-squatting DoS cheaper.
uint64 public constant MAX_NONCE_GAP = 10;
```

**Divergence Type**: MISMATCH

**Description**: The MAX_NONCE_GAP constant was reduced from 100 to 10 as part of the L-03 security fix (to reduce nonce-squatting DoS attack surface). The code was updated but four separate documentation locations still specify the old value of 100. An additional inconsistency exists in security-considerations.md which says nonces must be "exactly lastNonce + 1" — this is also wrong because the code allows gaps up to 10. These three distinct values (100, 10, and strict +1) create a confusing specification.

**Impact**: Host implementations or integrators building on the documented spec may submit nonces with gaps up to 100, expecting them to be accepted, and receive unexpected `NonceGapTooLarge` reverts. This does not enable a security attack but breaks liveness expectations for legitimate operators. The stricter-than-documented behavior (10 instead of 100) is the SAFER deviation, so this is a documentation bug rather than a code vulnerability.

**Evidence**:
- Code (KernelVault.sol L52): `MAX_NONCE_GAP = 10`
- Doc (CLAUDE.md root, annotated-walkthrough.md L244, optimistic-execution.md L517): MAX_NONCE_GAP = 100
- Doc (security-considerations.md L156): "Nonce is exactly lastNonce + 1" — incorrect in both value and semantics

---

## Finding [NSP-3]: Bond Expiry Safety Valve Documented as 30 Days but Code Enforces 90 Days

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗, R12:✗, R13:✓, R14:✗, R15:✗, R16:✗]
**Severity**: Low
**Location**: `contracts/src/WSTONBondManager.sol:L55`, `docs/docs/onchain/bond-manager.md:L78,L110`

**Spec Claim**: `docs/docs/onchain/bond-manager.md` states in two separate locations:
- L78: "If a bond remains locked for more than **30 days** (e.g., due to relayer failure or vault revocation), the operator can reclaim it"
- L110: "if down, operators must wait for the **30-day expiry** to reclaim"

**Code Reality**: `WSTONBondManager.sol:L51-L55`:
```solidity
/// @dev Safety valve against stuck bonds (revoked vaults, lost relayer keys, etc.).
///      M-16: extended from 30 to 90 days to give relayers a larger window to
///      resolve pending slashes before the expiry valve opens.
uint256 public constant BOND_EXPIRY = 90 days;
```

**Divergence Type**: MISMATCH

**Description**: The bond expiry was extended from 30 to 90 days as part of the M-16 security fix, which gives the cross-chain relayer more time to resolve pending slashes before operators can reclaim their bonds. The documentation was not updated to reflect this change. Operators relying on the documented 30-day window to plan capital management will encounter a 60-day extended lockup when a relayer failure occurs.

**Impact**: Operators who follow the documentation and plan for a 30-day maximum lockup will face 90-day lockups in relayer-failure scenarios. This does not enable an attack, but could cause significant operational surprise for bond capital planning. If the relayer fails, an operator might allocate capital for alternative strategies after 30 days, only to find their bonds remain locked for another 60 days. Severity is Low because this is a deviation in a safety valve (the longer lockup protects depositors) but has a real capital-efficiency impact.

**Evidence**:
- Doc (bond-manager.md L78): "more than 30 days"
- Doc (bond-manager.md L110): "wait for the 30-day expiry"
- Code (WSTONBondManager.sol L55): `BOND_EXPIRY = 90 days`
- Code comment: "M-16: extended from 30 to 90 days"

---

## Finding [NSP-4]: Cross-Chain Slash Distribution Incorrectly Documented as "100% to Treasury"

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗, R12:✗, R13:✓, R14:✗, R15:✗, R16:✗]
**Severity**: Low
**Location**: `contracts/src/WSTONBondManager.sol:L386-L436`, `docs/docs/onchain/bond-manager.md:L109`

**Spec Claim**: `docs/docs/onchain/bond-manager.md` L109 states:
> "Cross-chain slashes (HyperEVM → Ethereum) send **100% to treasury**, which redistributes off-chain"

**Code Reality**: `WSTONBondManager.sol:L392-L436` (`slashBondByRelayer`):
```solidity
// L-49 fix: cross-chain slash now honours the TREASURY_SHARE_BPS split explicitly.
uint256 treasuryShare = (amount * TREASURY_SHARE_BPS) / BPS_DENOMINATOR;  // 10%
uint256 finderShare;
uint256 depositorShare;

if (slasher == address(0)) {
    // Self-slash: no finder, depositor portion accrues to treasury as escrow
    finderShare = 0;
    depositorShare = amount - treasuryShare;  // 90%
} else {
    finderShare = (amount * FINDER_FEE_BPS) / BPS_DENOMINATOR;  // 10%
    depositorShare = amount - treasuryShare - finderShare;  // 80%
}

if (finderShare > 0) {
    wston.safeTransfer(slasher, finderShare);  // Finder gets 10%
}
// Treasury gets its share PLUS the depositor portion as cross-chain escrow
wston.safeTransfer(treasury, treasuryShare + depositorShare);
```

**Divergence Type**: MISMATCH

**Description**: The documentation claims cross-chain slashes send 100% to treasury. The code, however, when a non-zero `slasher` is present, pays 10% directly to the `slasher` address (finder fee) and sends only the remaining 90% to treasury. The comment says "treasury accumulates both its own share AND the cross-chain depositor share" — so the depositor share accrues to treasury as escrow, but the finder still gets their 10%. This means 100% does NOT go to treasury when a non-self slash occurs.

**Impact**: Any monitoring system or operator tool that calculates expected treasury inflows from cross-chain slashes will be wrong by 10% (the finder fee). More importantly, slashing tools that expect a pure treasury distribution might not correctly attribute the finder fee. The divergence is limited to the cross-chain slash path, not the direct `slashBond` path (which is on-chain and correctly distributes to finder + vault + treasury).

**Evidence**:
- Doc (bond-manager.md L109): "100% to treasury"
- Code (WSTONBondManager.sol L426-L434): finder receives `finderShare` (10%) when `slasher != address(0)`; treasury receives only `treasuryShare + depositorShare` (90%)

---

## Finding [NSP-5]: Agent Code Hash Algorithm Description Contradicts All Build.rs Implementations

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R11:✗, R12:✗, R13:✓, R14:✗, R15:✗, R16:✗]
**Severity**: Informational
**Location**: `docs/docs/architecture/cryptographic-chain.md:L40`, all agent `build.rs` files

**Spec Claim**: `docs/docs/architecture/cryptographic-chain.md` L40:
> "The script collects all `.rs` files in `src/`, sorts them for deterministic ordering, then feeds each filename and its contents into a SHA-256 hasher."

**Code Reality**: All four `build.rs` implementations (perp-trader, example-yield-agent, defi-yield-farmer, scaffold) state:
```
/// The hash is computed as: SHA256(src/lib.rs || 0x00 || Cargo.toml)
```
Only two files are hashed: `src/lib.rs` and `Cargo.toml`, with a null-byte separator. Filenames are NOT included. Only `lib.rs` is hashed from the source directory (not "all .rs files").

**Divergence Type**: MISMATCH

**Description**: The public documentation describes a hash over "all .rs files in src/, sorted", with filenames included. The actual implementation hashes exactly two files: `src/lib.rs` and `Cargo.toml`, with no filename metadata included. This inconsistency is informational — the code is internally consistent across all build.rs implementations — but the documentation would mislead anyone attempting to independently compute or verify the `agent_code_hash` for audit or verification purposes.

**Impact**: An integrator or auditor who attempts to verify an agent's `agent_code_hash` by following the documentation algorithm will compute a different hash than what is embedded in the binary, making off-chain agent verification impossible via the documented method. This undermines the reproducibility guarantee that is core to the protocol's security model.

**Evidence**:
- Doc (cryptographic-chain.md L40): "collects all .rs files in src/, sorts them"
- Code (perp-trader build.rs L14): `SHA256(src/lib.rs || 0x00 || Cargo.toml)` — only 2 files
- Code (example-yield-agent build.rs L14): same formula
- Code (scaffold.rs L422): same formula

---

## STEP 4: Code Without Spec — Undocumented Behaviors

The following significant code behaviors were found in contracts but are NOT covered by any of the audited documentation files:

| # | Function/Behavior | Location | Coverage Gap |
|---|------------------|----------|--------------|
| 1 | `slashBond` self-slash variant (slasher == address(0) → 0% finder, 90% depositors) | WSTONBondManager.sol:L288-L310 | bond-manager.md documents only the external-slash split; self-slash variant not mentioned |
| 2 | `markSlashPending()` — relayer marks bond before cross-chain slash lands | WSTONBondManager.sol:L376-L384 | No documentation; operators need this to block `reclaimExpiredBond` during pending slash |
| 3 | Emergency verification pause with 7-day auto-expiry (MAX_PAUSE_DURATION) | KernelExecutionVerifier.sol:L163,L566 | security-considerations.md mentions circuit breaker but not the 7-day auto-expiry |
| 4 | Verifier rotation requires 3-step governance flow (approve → propose → activate) | KernelExecutionVerifier.sol:L371-L451 | Not documented in public docs; important for operator runbooks |
| 5 | Relayer rotation enforces 1-hour timelock (RELAYER_ROTATION_DELAY) with one-time bypass | WSTONBondManager.sol:L67-L691 | bond-manager.md does not document the rotation procedure |
| 6 | `rescueTokens()` — protects bonded WSTON via totalLockedGlobal accounting | WSTONBondManager.sol:L721-L731 | No documentation; relevant for operators encountering accidentally sent funds |

---

## Coverage Summary

| Step | Entities Enumerated | Entities Processed | Coverage |
|------|--------------------|--------------------|----------|
| STEP 1: Spec Claims Extracted | 16 claims | 16 DONE | 100% |
| STEP 2: Code Verification | 16 claims | 16 DONE | 100% |
| STEP 3: Divergences Classified | 6 divergences | 5 findings written (1 merged) | 100% |
| STEP 4: Undocumented Behaviors | 6 identified | 6 documented | 100% |

**Match/Mismatch Summary**:
- MATCH: 8 claims (journal length, action layout, AGENT_CODE_HASH formula, slash BPS values, bond lifecycle, EIP-191 signing, trustedImageId immutability, design_context nonce value)
- MISMATCH: 7 claims (bond attestation V1 vs V2, MAX_NONCE_GAP 100 in 4 docs vs 10 in code, bond expiry 30 vs 90 days, cross-chain slash 100% vs 90% to treasury, agent_code_hash algorithm description, strict +1 nonce claim)
- STRONGER: 1 (MAX_NONCE_GAP is 10, not 100 — safer than documented)
