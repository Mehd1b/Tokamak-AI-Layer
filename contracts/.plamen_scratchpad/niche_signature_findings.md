# Signature Verification Audit — Niche Agent Findings

**Agent**: Signature Verification Audit (Niche)
**Finding prefix**: [NS-N]
**Date**: 2026-04-13
**Scope**: OracleVerifier.sol, KernelVault.sol (oracle execute path), OptimisticKernelVault.sol (bond attestation)

---

## Enumeration Audit (Processing Protocol)

### CHECK 1: Signature Validation Completeness — Targets

1. `OracleVerifier.requireValidOracleSignature` — primary revert-style oracle sig verifier (L209-267)
2. `OracleVerifier.verifyOracleSignature` — internal bool-return variant (L45-92)
3. `OracleVerifier.requireValidOracleSignatureBound` — action-commitment-bound oracle sig (L179-199)
4. `OracleVerifier.requireValidBondAttestation` — bond attestation verifier (L116-173)
5. `KernelVault._validateParsedJournal` — call site: oracle sig in execute path (L977-1033)
6. `OptimisticKernelVault._verifyOptimisticOracleAndBond` — call site: both sigs in optimistic path (L201-260)

| Call Site | Invalid Sig Handled? | Signer Recovery Validated? | Nonce Verified? | Deadline Checked? | Scope Bound? | Gap? |
|-----------|---------------------|--------------------------|-----------------|-------------------|-------------|------|
| requireValidOracleSignature | YES — reverts | YES — ecrecover + != address(0) | N/A (timestamp) | YES — maxOracleAge | YES — chainId + vaultAddress | None |
| verifyOracleSignature (internal) | YES — returns false | YES | N/A | YES | YES | None |
| requireValidOracleSignatureBound | YES — delegates | YES | N/A | YES | YES — adds actionCommitment binding | None |
| requireValidBondAttestation | YES — reverts | YES | YES (nonce in payload) | YES — maxAge | YES — bondChainId, vault, operator | **SEE NS-1** |
| KernelVault._validateParsedJournal | YES — delegates to above | YES | YES — lastNonce check | YES | YES | None |
| OKV._verifyOptimisticOracleAndBond | YES — delegates | YES | YES | YES | YES | **SEE NS-1** |

DONE: 6/6 enumerated and processed.

### CHECK 2: Replay Protection — Targets

1. Bond attestation replay: nonce + vault + operator + chainId in payload
2. Oracle price signature replay: timestamp + chainId + vaultAddress in payload
3. Action-commitment binding: inputRoot || actionCommitment in bound variant

| Replay Guard | Type | Incremented/Set Before Use? | Can Be Reused? | Shared Across Functions? | Gap? |
|-------------|------|---------------------------|----------------|------------------------|------|
| Bond nonce in bondHash | payload field | N/A (nonce IS the execution nonce, already validated) | No — payload is unique per nonce | No | None |
| Oracle timestamp | payload field | N/A (timestamp is checked against maxOracleAge) | Yes — same sig valid for entire maxOracleAge window | Yes — shared between Role A and bond check via shared maxOracleAge | **SEE INV-01 (existing finding)** |
| Action commitment binding | keccak256(inputRoot||actionCommitment) | N/A (commitment is journal-derived) | No — unique per execution | No | None |

DONE: 3/3 enumerated and processed.

### CHECK 3: Signature Scope Binding — Targets

1. Oracle price sig: feedHash bound via keccak256(feedHash, oracleTimestamp, chainId, vaultAddress)
2. Bond attestation: "BOND_LOCK_V2" prefix + operator + vault + nonce + amount + chainId + attestationTs
3. Oracle-service off-chain signer: oracle-service/src/signing/bond-signer.ts

| Signature | Chain-Bound? | Contract-Bound? | Function-Bound? | Gap? |
|-----------|-------------|-----------------|-----------------|------|
| Oracle price sig | YES — block.chainid | YES — address(this) | YES — inputRoot||actionCommitment | None |
| Bond attestation (on-chain format) | YES — bondChainId | YES — vault address in payload | YES — "BOND_LOCK_V2" prefix + nonce | None |
| Bond attestation (oracle-service) | **PARTIAL — chainId included** | YES — vault address | **NO — uses "BOND_LOCK_V1" without attestationTs** | **SEE NS-1** |

DONE: 3/3 enumerated and processed.

### CHECK 4: Off-Chain Approval Patterns — Targets

1. `executeWithOracle` — caller submits oracle sig alongside journal proof
2. `executeOptimistic` — caller submits bond attestation (from oracle service) + oracle sig

| Approval Type | Front-Run Resistant? | Fallback on Failure? | Deadline Enforced? | Revocable? | Gap? |
|-------------|---------------------|---------------------|-------------------|-----------|----|
| Oracle price sig (executeWithOracle) | YES — restricted to owner | N/A (not a standalone approval) | YES — maxOracleAge | N/A | None |
| Bond attestation (executeOptimistic) | YES — restricted to owner via `if (msg.sender != owner)` | No fallback — bond attestation is mandatory for optimistic | YES — maxAge | N/A | None |

DONE: 2/2 enumerated and processed.

### CHECK 5: Signature Malleability — Targets

1. `requireValidOracleSignature` — ecrecover with EIP-2 s-value check
2. `requireValidBondAttestation` — ecrecover with EIP-2 s-value check
3. `verifyOracleSignature` (internal) — same checks

| Verification | Malleable? | Signatures Used as Keys/IDs? | Framework-Wrapped? | Gap? |
|-------------|-----------|------------------------------|-------------------|------|
| requireValidOracleSignature | NO — s <= n/2 enforced at L249 | No — used for signer recovery only | Custom ecrecover with EIP-2 | None |
| requireValidBondAttestation | NO — s <= n/2 enforced at L157 | No — used for signer recovery only | Custom ecrecover with EIP-2 | None |
| verifyOracleSignature (internal) | NO — s <= n/2 enforced at L78 | No | Same | None |

DONE: 3/3 enumerated and processed.

### CHECK 6: Cross-Chain and Cross-Protocol Replay — Targets

1. Bond attestation across chains (oracle-service vs on-chain)
2. Oracle price sig cross-chain
3. Version migration: BOND_LOCK_V1 → BOND_LOCK_V2

| Signature | Chain-Bound? | Protocol-Bound? | Version-Bound? | Gap? |
|-----------|-------------|-----------------|-----------------|------|
| Oracle price sig | YES — block.chainid | YES — vaultAddress | YES — no version needed (single format) | None |
| Bond attestation (on-chain) | YES — bondChainId | YES — vault address | YES — "BOND_LOCK_V2" prefix | None |
| Bond attestation (oracle-service) | YES — chainId param | YES | **NO — still "BOND_LOCK_V1", missing attestationTs** | **SEE NS-1** |

DONE: 3/3 enumerated and processed.

### CHECK 7: Deadline and Expiry — Targets

1. Oracle sig maxOracleAge: settable by owner, 0 disables check
2. Bond attestation maxAge: uses same `maxOracleAge` storage slot
3. Bond attestation future-timestamp guard

| Signature Type | Has Deadline? | Deadline Enforced On-Chain? | Can Be 0 or MAX? | Gap? |
|---------------|--------------|----------------------------|-----------------|------|
| Oracle price sig | YES — maxOracleAge | YES — L228-230 `>=` | 0 disables; MAX_ORACLE_AGE_LIMIT cap | **SEE NS-2** |
| Bond attestation | YES — same maxOracleAge | YES — L133-140 `>=` | 0 disables, same cap | **SEE NS-2** |
| Oracle future-timestamp | YES — guard at L61-62, L136 | YES — oracleTimestamp > block.timestamp returns false/reverts | N/A | None |

DONE: 2/2 enumerated and processed.

### CHECK 8: Signature Consumption Ordering — Targets

1. Oracle sig verification in `_validateParsedJournal` — before or after state changes?
2. Bond attestation verification — before or after `_executeActions`?

| Operation | Signature Checked Before State Change? | External Callbacks Safe? | Gap? |
|-----------|---------------------------------------|-------------------------|------|
| KernelVault execute: oracle sig in _validateParsedJournal | YES — validateParsedJournal is called BEFORE _executeActions | No external callback for sig verification | None |
| OKV executeOptimistic: bond attestation in _verifyOptimisticOracleAndBond | YES — called BEFORE _executeActions at L92, L97, L122 | No external callback for sig verification | None |

DONE: 2/2 enumerated and processed.

---

## Findings

---

## Finding [NS-1]: Oracle Service Produces BOND_LOCK_V1 Signatures — On-Chain Verifier Requires BOND_LOCK_V2

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5,6,8
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity — bond attestation path), R6:✗(no role — this is the bond signer itself), R8:✓, R10:✓, R11:✗(no external tokens), R12:✗(no dangerous precondition created by the gap), R13:✗(not design-related), R14:✗(no aggregate variables), R15:✗(no flash-loan-accessible state), R16:✗(no oracle dependency)]
**Severity**: High
**Location**: `oracle-service/src/signing/bond-signer.ts:29,52` vs `src/libraries/OracleVerifier.sol:106,163`

**Description**:
The oracle service (off-chain component) still constructs bond attestation signatures using the `BOND_LOCK_V1` payload format, while the on-chain `OracleVerifier.requireValidBondAttestation` was upgraded to require the `BOND_LOCK_V2` format. The two formats differ in two ways:

- **V1**: `keccak256("BOND_LOCK_V1" || operator || vault || nonce || amount || chainId)` — 124 bytes total, no timestamp
- **V2**: `keccak256("BOND_LOCK_V2" || operator || vault || nonce || amount || chainId || attestationTs)` — 132 bytes total, includes `attestationTs` (8-byte uint64)

The oracle service `BondSigner.signBondAttestation()` encodes:
```typescript
// oracle-service/src/signing/bond-signer.ts:52
encodePacked(
  ['string', 'address', 'address', 'uint64', 'uint256', 'uint256'],
  ['BOND_LOCK_V1', params.operator, params.vault, params.nonce, params.amount, params.chainId]
)
```

The on-chain verifier computes:
```solidity
// OracleVerifier.sol:161-165
bytes32 bondHash = keccak256(
    abi.encodePacked(
        "BOND_LOCK_V2", operator, vault, nonce, amount, chainId, attestationTs
    )
);
```

The `ecrecover` step will recover a different signer address from the V1-format signature over the V2-expected hash, causing `recovered != expectedSigner` and a revert with `InvalidBondAttestation`.

Additionally, the oracle service's unit tests (`oracle-service/src/__tests__/signing.test.ts:44`) also verify against the V1 format — this means the tests pass without detecting the mismatch with the on-chain format.

The Foundry unit tests for `OptimisticKernelVault.t.sol` DO use the correct V2 format via `_signBondAttestationTs()` (L114-131), so those tests pass. However, the test at L470-471 constructs a `"BOND_LOCK_V1"` signature as the "invalid attestation" test case — confirming V1 is rejected.

**Impact**:
All `executeOptimistic()` calls in production are blocked. The oracle service is the production component that supplies bond attestations to the optimistic vault. Since it signs V1 but the chain expects V2, every optimistic execution will revert with `InvalidBondAttestation`. This is a complete denial-of-service for the optimistic execution mode — no optimistic executions are possible until the oracle service is updated.

If a bond has been locked on L1 (WSTON locked in WSTONBondManager), the operator cannot use it for optimistic execution. The bond remains locked until reclaimed after BOND_EXPIRY (90 days).

**Evidence**:
```
oracle-service/src/signing/bond-signer.ts:29 — comment says "BOND_LOCK_V1"
oracle-service/src/signing/bond-signer.ts:52 — encodes 'BOND_LOCK_V1' with 6 fields (no attestationTs)
oracle-service/src/__tests__/signing.test.ts:44 — test validates against V1 hash (passes, masking the bug)
OracleVerifier.sol:106 — NatSpec: "oracle signs keccak256("BOND_LOCK_V2" || ... || attestationTs)"
OracleVerifier.sol:163 — encodes "BOND_LOCK_V2" with 7 fields (includes attestationTs)
contracts/test/OptimisticKernelVault.t.sol:470-471 — uses "BOND_LOCK_V1" as the wrong-key test (expected to fail)
```

**Depth Evidence**: [TRACE:oracle-service.signBondAttestation()→V1 hash→ecrecover on-chain with V2 expected hash→recovered≠bondSigner→InvalidBondAttestation revert]

---

## Finding [NS-2]: `requireValidBondAttestation` Visibility is `public view` — Callable Externally on Deployed Library

**Verdict**: PARTIAL
**Step Execution**: ✓1,2,3,4,5 | ✗6(N/A — no timelock) | ✗7(N/A — no deadline concern at library level)
**Rules Applied**: [R4:✓, R5:✗(single entity), R6:✗(no semi-trusted role), R8:✗(single-step), R10:✓, R11:✗(no external tokens), R12:✗(no dangerous precondition), R13:✓, R14:✗(no aggregate variables), R15:✗(not flash-loan-accessible), R16:✗(no oracle dependency)]
**Severity**: Low
**Location**: `src/libraries/OracleVerifier.sol:116,126`

**Description**:
`requireValidBondAttestation` and `requireValidOracleSignatureBound` are declared with `public view` visibility in `OracleVerifier`. While Solidity libraries deployed as linked libraries have external entry points for `public` functions (in contrast to `internal` which is inlined at the call site), the security concern here is informational in isolation but creates a cross-context signature reuse path.

When called externally, the functions check signature validity in isolation without the context-binding that the vault applies (e.g., vault checks that `msg.sender == owner` before calling `executeOptimistic`). An external caller can use these functions as a "signature probe" — submitting a signature and a candidate `expectedSigner` address to test whether a given oracle signature is valid for a given payload, without any gas cost beyond the ecrecover computation.

More concretely: the comment at OracleVerifier.sol:L32-36 explains that `verifyOracleSignature` was changed from `public` to `internal` specifically to prevent cross-path signature replay "relative to the revert-style path." The same concern applies to `requireValidBondAttestation(public view)` — a valid bond attestation (V2 format, valid `bondSigner` signature) can be submitted to the public library entry point to verify the signer, and then submitted to any vault sharing that `bondSigner`. However, since bond attestations already include the specific vault address in their payload (field 3: `vault`), cross-vault replay is already blocked at the payload level.

The residual risk: external probing for oracle signer confirmation — an attacker who has obtained one valid bond attestation can use the public view function to confirm the `bondSigner` address before constructing a targeted attack. This is low impact since the bondSigner is already stored as a public storage variable in `OptimisticKernelVault`.

**Impact**:
Low. The external accessibility of `requireValidBondAttestation` and `requireValidOracleSignatureBound` does not create a direct exploit path due to vault-address binding in the bond payload and vault-address binding in the oracle signature. The primary risk is revealing oracle signer identity when probed — but `bondSigner` and `oracleSigner` are already public storage slots. No funds at risk.

**Evidence**:
```solidity
// OracleVerifier.sol:116,126
function requireValidBondAttestation(
    ...
) public view {   // ← should be internal for library inlining
```
```solidity
// OracleVerifier.sol:32-36 (comment documents precedent)
/// @dev L-23 / I-05 fix: this public variant is dead code in the current
///      codebase — consumers use `requireValidOracleSignature` or the
///      bound variant. Changed to `internal` so it cannot be called
///      externally (which would create a cross-path signature replay
///      vector relative to the revert-style path).
```

### Precondition Analysis
**Missing Precondition**: Exploitable cross-context replay requires a valid bond attestation to already exist.
**Precondition Type**: EXTERNAL
**Why This Blocks**: Bond attestations already include `vault` in payload — cross-vault replay is impossible regardless of public visibility.

---

## Finding [NS-3]: Bond Attestation Staleness Uses Shared `maxOracleAge` — Bond Valid for Same Window as Price Feed

**Verdict**: CONFIRMED (partial — covered by INV-01 but signature-domain analysis adds depth)
**Step Execution**: ✓1,2,3,4,5,6,7,8
**Rules Applied**: [R4:✓, R5:✗(single entity), R6:✗(no semi-trusted role), R8:✓, R10:✓, R11:✗(no external tokens), R12:✗(no dangerous precondition), R13:✗(not design-related), R14:✗(no aggregate variables), R15:✗(not flash-loan-accessible), R16:✓]
**Depth Evidence**: [BOUNDARY:maxOracleAge=86400→bond_attestation_valid_for_24h_after_signing], [VARIATION:maxOracleAge 900→86400→bond replayable for 23h+], [TRACE:lock_bond_L1→oracle_signs_at_T0→operator_can_replay_attestation_until_T0+maxOracleAge_even_after_bond_reclaimed]
**Severity**: Medium
**Location**: `src/OptimisticKernelVault.sol:250`, `src/KernelVault.sol:232`

**Description**:
`OracleVerifier.requireValidBondAttestation` receives `maxOracleAge` as its maximum allowed staleness parameter. In `OptimisticKernelVault._verifyOptimisticOracleAndBond`, the value passed is the vault's shared `maxOracleAge` storage slot (line 250), which is also used for the price oracle freshness check. This creates a cross-purpose reuse: bond attestations remain valid for the same window as price feeds.

The bond attestation timestamp `attestationTs` is a field in the V2 payload that the oracle includes at signing time. A valid attestation is accepted up to `block.timestamp - attestationTs < maxOracleAge`. If `maxOracleAge = 86400` (24 hours, the current `MAX_ORACLE_AGE_LIMIT`), a bond attestation signed at T=0 remains valid until T=86400.

The concern: if an operator:
1. Locks a bond on L1 at T=0
2. Obtains attestation at T=0
3. Has the bond released at T=30 (proof submitted successfully, bond unlocked)
4. Tries to re-use the same attestation for a NEW optimistic execution at T=7200

The nonce field in the bond payload prevents the exact replay (different execution = different nonce). However, if the operator locks a NEW bond with the SAME nonce slot (i.e., same `operator`, `vault`, `nonce` but different amount — not possible since nonces are monotonic), or if the operator exploits nonce ordering gaps, a stale attestation could be paired with a future execution using an old signed timestamp.

More concretely: nonce is monotonic (new executions always use a new nonce), so the primary vector is an attestation signed at T=0 for nonce=5 being used at T=maxOracleAge-1 for nonce=5 execution — as long as the bond is still locked at that time. This is within-design: the operator can legitimately delay submission. However, the INV-01 finding noted that the two roles (price oracle and bond attestation) use the SAME `maxOracleAge`, so they cannot be independently tuned: a vault that needs long-lived price oracle windows for its agent strategy also gives bond attestations the same long validity window.

**Impact**:
Medium. Bond attestation validity window cannot be independently configured from the price feed validity window. An operator wanting a 24-hour bond attestation window for operational flexibility implicitly also grants 24-hour price feed windows (lower price freshness). The appropriate configuration for bond attestations is typically minutes (for cross-chain bridge latency), not hours. This cross-purpose shared parameter limits the vault's ability to independently manage these two security parameters.

**Evidence**:
```solidity
// OptimisticKernelVault.sol:241-251
OracleVerifier.requireValidBondAttestation(
    a.bondAttestation,
    bondSigner,
    msg.sender,
    address(this),
    a.providedNonce,
    a.bondAmount,
    bondChainId,
    a.bondAttestationTimestamp,
    maxOracleAge   // ← same variable as price oracle freshness
);
```
```solidity
// KernelVault.sol:232
uint64 public maxOracleAge;  // single slot serves BOTH Role A and Role B
```

### Postcondition Analysis
**Postconditions Created**: Bond attestations remain valid for up to `maxOracleAge` seconds after the oracle signs them. During this window, the same attestation can be submitted to `executeOptimistic` if the nonce is valid.
**Postcondition Types**: TIMING, STATE
**Who Benefits**: Operator can delay submission of a signed attestation; adversary who intercepts an attestation can attempt submission within the validity window (nonce binding prevents most scenarios).

---

## Finding [NS-4]: `verifyOracleSignature` Internal Variant Silently Returns False on Future Timestamps — Caller May Not Handle

**Verdict**: PARTIAL
**Step Execution**: ✓1,2,3,4,5
**Rules Applied**: [R4:✓, R5:✗(single entity), R6:✗(no semi-trusted role), R8:✗(single-step), R10:✓, R11:✗, R12:✗, R13:✓, R14:✗, R15:✗, R16:✓]
**Severity**: Informational
**Location**: `src/libraries/OracleVerifier.sol:58-64`

**Description**:
`verifyOracleSignature` (the internal bool-return variant at L45-92) handles a future timestamp scenario by silently returning `false`:

```solidity
if (
    maxOracleAge > 0
        && (
            oracleTimestamp > block.timestamp
                || block.timestamp - oracleTimestamp >= maxOracleAge
        )
) return false;
```

While the revert-style `requireValidOracleSignature` reverts with `OracleDataStale`, the bool-return variant silently returns false. This is correct behavior for a bool variant — but the function is currently marked `internal` and has no known callers in the codebase (per the L-23/I-05 fix comment at L32-36). If future code calls this variant and treats `false` as "signature not required" rather than "signature invalid", it could silently bypass oracle verification.

Since the function is internal and currently dead code (confirmed by the comment), this is informational only. The risk is relevant if the function is reactivated without reviewing all call sites.

**Impact**:
Informational. No current callers. If reactivated, callers must explicitly handle `return false` as an invalid signature, not as "no signature required."

**Evidence**:
```solidity
// OracleVerifier.sol:32-36
/// @dev L-23 / I-05 fix: this public variant is dead code in the current
///      codebase — consumers use `requireValidOracleSignature` or the
///      bound variant. Changed to `internal` so it cannot be called
///      externally
// OracleVerifier.sol:58-64
if (
    maxOracleAge > 0
        && (oracleTimestamp > block.timestamp || block.timestamp - oracleTimestamp >= maxOracleAge)
) return false;   // silent false for future timestamps
```

### Precondition Analysis
**Missing Precondition**: Requires a caller to be added that mishandles the false return value.
**Precondition Type**: STATE
**Why This Blocks**: Currently no callers exist in the production codebase.

---

## Chain Summary

| Finding | Chains To | Chains From | Notes |
|---------|----------|------------|-------|
| NS-1 | Blocks all optimistic execution | INV-29 (instant signer rotation) | Complete DoS of optimistic mode; may interact with CH-E if signer is rotated while oracle service is broken |
| NS-2 | None (informational cross-vault probe) | — | Low residual risk |
| NS-3 | INV-01 (extends depth) | INV-29 (instant rotation lets owner tighten/widen maxOracleAge instantly) | Bond attestation window attack requires both INV-29 and this finding |
| NS-4 | None | — | Dead code risk |

---

## Coverage Assertion

| CHECK | Targets Enumerated | Targets Processed | Missing |
|-------|-------------------|-------------------|---------|
| 1: Validation Completeness | 6 | 6 | 0 |
| 2: Replay Protection | 3 | 3 | 0 |
| 3: Scope Binding | 3 | 3 | 0 |
| 4: Off-Chain Approvals | 2 | 2 | 0 |
| 5: Malleability | 3 | 3 | 0 |
| 6: Cross-Chain Replay | 3 | 3 | 0 |
| 7: Deadline/Expiry | 2 | 2 | 0 |
| 8: Consumption Ordering | 2 | 2 | 0 |

Total: 24 enumerated, 24 processed.
