# Temporal Parameter Staleness & Cross-Chain Timing Analysis

**Agent**: Analysis Agent #7 (Temporal/Cross-Chain)
**Scope**: OptimisticKernelVault.sol, WSTONBondManager.sol, KernelVault.sol, VaultFactory.sol, AgentRegistry.sol, KernelExecutionVerifier.sol
**Skills Applied**: TEMPORAL_PARAMETER_STALENESS, CROSS_CHAIN_TIMING

---

## Step Execution Checklist (TEMPORAL_PARAMETER_STALENESS)

| Step | Required | Completed? | Notes |
|------|----------|------------|-------|
| 1. Enumerate Multi-Step Operations | YES | YES | 7 multi-step ops identified |
| 2. Identify Cached Parameters | YES | YES | Parameters mapped per operation |
| 3. Model Staleness Impact (both directions) | YES | YES | Both directions modeled for each |
| 3b. Update Source Audit | YES | YES | External source params audited |
| 4. Retroactive Application Analysis | YES | YES | Fee parameters analyzed |
| 5. Assess Severity | YES | YES | Per-finding |

---

## Multi-Step Operations Enumerated

| # | Operation | Step 1 (Initiate) | Wait Condition | Step N (Complete) |
|---|-----------|-------------------|----------------|-------------------|
| 1 | Optimistic Execution | executeOptimistic() | challengeWindow | submitProof() or slashExpired() |
| 2 | Bond Lifecycle | lockBondDirect() on L1 | Oracle attestation relay | releaseBondByRelayer() or slashBondByRelayer() on L1 |
| 3 | Bond Reclamation | lockBondDirect() | BOND_EXPIRY (90 days) | reclaimExpiredBond() |
| 4 | Relayer Rotation | setTrustedRelayer() | RELAYER_ROTATION_DELAY (1h) | activateTrustedRelayer() |
| 5 | UUPS Upgrade | scheduleImplementation() | UPGRADE_DELAY (48h) | upgradeTo() / activateVerifier() |
| 6 | Code Store Swap | scheduleVaultCreationCodeStore() | UPGRADE_DELAY (48h) | activateVaultCreationCodeStore() |
| 7 | Fee Change | setFees() | FEE_CHANGE_COOLDOWN (7d) | Next setFees() call |

---

## Finding [TC-1]: Challenge window increase allowed with pending executions

**Verdict**: PARTIAL
**Step Execution**: ✓1,2,3,5 | ✗4(N/A) | ✗6(no role)
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✓, R10:✓, R14:✗(no aggregate)]
**Depth Evidence**: [TRACE:setChallengeWindow L328-341 revert only when window < challengeWindow AND _pendingCount > 0], [BOUNDARY:window=MAX_CHALLENGE_WINDOW=24h with _pendingCount=3]
**Severity**: Low
**Location**: OptimisticKernelVault.sol:L328-341

**Description**: setChallengeWindow blocks DECREASING the window when pending executions exist but allows INCREASING. Stored deadlines are immutable per execution so no fund loss, but creates observational inconsistency for monitoring.

**Impact**: Operational confusion only. No fund loss.

**Evidence**: L112 deadline cached at submission; L336 only blocks shortening.

### Precondition Analysis
**Missing Precondition**: Stored deadline makes increase unexploitable.
**Precondition Type**: STATE
**Why This Blocks**: deadline in PendingExecution is set once.

---

## Finding [TC-2]: Bond attestation and oracle signature share the same maxOracleAge freshness parameter

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,3b,5 | ✗4(N/A)
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✓, R8:✓, R10:✓, R14:✗(no aggregate), R16:✓]
**Depth Evidence**: [TRACE:_verifyOptimisticOracleAndBond L206-258 both Role A and Role B use maxOracleAge], [VARIATION:maxOracleAge 900->86400 bond attestation freshness degrades equally]
**Severity**: Medium
**Location**: KernelVault.sol:L232-233, OptimisticKernelVault.sol:L206-217,L240-250

**Description**: maxOracleAge (set via setOracleSigner) is used for BOTH price oracle (Role A, SEMI_TRUSTED) AND bond attestation (Role B, FULLY_TRUSTED) freshness checks. Role A needs high tolerance (proof generation ~10min), Role B needs tight freshness (stale attestation could reference reclaimed bond). Operator setting maxOracleAge=24h for operational reasons inadvertently allows 24h-old bond attestations.

**Impact**: Bond attestation replay window equals maxOracleAge. Bounded by nonce monotonicity and bond status checks on L1.

**Evidence**: Both L216 (Role A) and L250 (Role B) in OptimisticKernelVault use the same maxOracleAge storage slot.

### Postcondition Analysis
**Postconditions Created**: Both roles share staleness tolerance
**Postcondition Types**: [TIMING]
**Who Benefits**: Attacker with compromised bond signer key

---

## Finding [TC-3]: minBondFloor reduction takes effect immediately for new bonds

**Verdict**: PARTIAL
**Step Execution**: ✓1,2,3,5 | ✗4(N/A)
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✓, R10:✓, R14:✓]
**Depth Evidence**: [TRACE:setMinBondFloor L580-584 immediate effect], [VARIATION:minBondFloor 1e27->1e18 new bonds much smaller]
**Severity**: Low
**Location**: WSTONBondManager.sol:L580-584

**Description**: setMinBondFloor takes effect immediately. Dual-layer guard (manager + vault minBond) provides protection. No retroactive concern for existing bonds.

**Impact**: Economic security reduction for future bonds if floor lowered. Bounded by vault-level minBond.

---

## Finding [TC-4]: No on-chain time-bound for relayer action in cross-chain bond slash lifecycle

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,3b,5
**Rules Applied**: [R4:✓, R5:✗(single entity), R6:✗(no role), R8:✓, R10:✓, R14:✗(no aggregate)]
**Depth Evidence**: [TRACE:slashExpired L293-307 emits ExecutionSlashed -> relayer -> slashBondByRelayer on L1 -> NO on-chain timing enforcement], [BOUNDARY:relayer offline 89 days -> operator reclaims at day 90]
**Severity**: Medium
**Location**: WSTONBondManager.sol:L346-437, OptimisticKernelVault.sol:L293-307

**Description**: Between slashExpired on HyperEVM and slashBondByRelayer on L1, no on-chain mechanism enforces timing. If relayer AND WSTONBondManager owner are both unresponsive for 90 days, operator can reclaim full bond via reclaimExpiredBond despite having been slashed on HyperEVM. markSlashPending (H-02 fix) is procedural, not automatic.

**Impact**: Slashed operator recovers full bond if both relayer and owner are offline for 90 days.

**Evidence**: markSlashPending requires manual invocation; reclaimExpiredBond only checks slashPending flag and 90d expiry.

### Postcondition Analysis
**Postconditions Created**: Slashed bonds reclaimable after 90d if slash not relayed
**Postcondition Types**: [TIMING, EXTERNAL]
**Who Benefits**: Malicious operator with drained vault

---

## Finding [TC-5]: Verification pause auto-expiry can leave vulnerable verifier live before rotation completes

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,5 | ✗4(N/A)
**Rules Applied**: [R4:✓, R5:✗(single entity), R6:✗(no role), R8:✓, R10:✓, R14:✗(no aggregate)]
**Depth Evidence**: [TRACE:verifyAndParseWithImageId L566 paused check auto-expires], [BOUNDARY:pausedSince=T, MAX_PAUSE_DURATION=7d, VERIFIER_ROTATION_DELAY=48h -> if owner proposes at T+6d, rotation at T+8d but pause expires T+7d -> 24h gap]
**Severity**: Medium
**Location**: KernelExecutionVerifier.sol:L566-568, L109, L163

**Description**: MAX_PAUSE_DURATION=7d auto-expiry can create a window where vulnerable verifier resumes before 48h rotation completes, if owner is slow to propose. Owner can re-pause but this requires active monitoring, contradicting the absent-owner scenario the auto-expiry was designed for.

**Impact**: Vulnerable verifier live for up to 24h+ if owner delays proposal. Requires RISC Zero CVE exploitation.

**Evidence**: L163 MAX_PAUSE_DURATION=7d; L109 VERIFIER_ROTATION_DELAY=48h; L566-568 auto-expiry check.

### Postcondition Analysis
**Postconditions Created**: Vulnerable verifier accepting proofs
**Postcondition Types**: [TIMING]
**Who Benefits**: Attacker with CVE exploit tooling

---

## Finding [TC-6]: Oracle signer rotation with pending executions

**Verdict**: REFUTED
**Step Execution**: ✓1,2,3,5
**Rules Applied**: [R4:✗(evidence clear), R6:✓, R8:✓]
**Severity**: N/A (REFUTED)

**Description**: Oracle/bond signatures verified at submission time only. submitProof only checks ZK proof against stored journalHash, not oracle signature. Rotation mid-flight has no effect on pending executions.

---

## Finding [TC-7]: Fee change cooldown bypass on first call

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✓, R10:✓]
**Severity**: Informational
**Location**: KernelVault.sol:L692-699

**Description**: lastFeeRateChange==0 bypasses cooldown on first setFees call. By design for initial configuration. Owner is FULLY_TRUSTED. Depositors should verify fees before depositing.

**Impact**: Informational. First-call bypass is intentional.

---

## Finding [TC-8]: emergencySettle 7-day delay anchored to first balance-reducing action

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,5 | ✗4(N/A)
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✓, R10:✓]
**Severity**: Low
**Location**: KernelVault.sol:L1428-1434, L1452-1458

**Description**: strategyActivatedAt set ONCE on first balance-reducing action, not reset on subsequent actions. emergencySettle becomes available 7 days from first action even if strategy is actively running. Third party can force settlement. Owner can re-activate.

**Impact**: Forced settlement mid-strategy after 7d. Intentional depositor protection trade-off.

### Postcondition Analysis
**Postconditions Created**: Emergency settle callable after 7d
**Postcondition Types**: [TIMING]
**Who Benefits**: Depositors wanting exit; also attackers forcing settlement

---

## Finding [TC-9]: UUPS upgrade scheduling overwrite

**Verdict**: REFUTED
**Step Execution**: ✓1,2,3,5
**Severity**: N/A (REFUTED)

**Description**: scheduleImplementation overwrites previous pending. _authorizeUpgrade checks exact match. Only last scheduled implementation valid. Safe behavior.

---

## Finding [TC-10]: Cross-chain slash front-running

**Verdict**: PARTIAL
**Step Execution**: ✓1,2,3,5 | ✗4(N/A)
**Rules Applied**: [R4:✓, R5:✗(single entity), R8:✓, R10:✓, R15:✗(no flash loan)]
**Severity**: Low
**Location**: OptimisticKernelVault.sol:L293-307, WSTONBondManager.sol:L346-437

**Description**: Operator can observe ExecutionSlashed event before relayer processes it on L1. H-02 slashPending flag mitigates primary vector. Residual risk requires relayer failure (see TC-4).

**Impact**: Low with H-02 fix in place.

---

## Finding [TC-11]: Management fee front-running

**Verdict**: REFUTED
**Step Execution**: ✓1,2,3,4,5
**Severity**: N/A (REFUTED)

**Description**: M-07 7-day FEE_CHANGE_COOLDOWN prevents fee manipulation before execution. Working as intended.

---

## Retroactive Application Analysis

| Parameter | Retroactive? | Impact |
|-----------|-------------|--------|
| managementFeeBps | NO (collected before change) | None |
| performanceFeeBps | NO (collected before change) | None |
| challengeWindow | NO (deadline cached at submission) | None |
| minBond | NO for existing, YES for new | Bounded |
| minBondFloor | NO for existing, YES for new | See TC-3 |
| maxOracleAge | YES (checked at execution time) | See TC-2 |

---

## Cross-Chain Timing Summary

Communication is EVENT-BASED (not message-based). Relayer observes HyperEVM events and calls L1 functions. Latency: minutes to hours normally; worst case unbounded (90d BOND_EXPIRY). No classical cross-chain arbitrage. Timing attacks center on bond attestation freshness (TC-2) and relayer liveness (TC-4).
