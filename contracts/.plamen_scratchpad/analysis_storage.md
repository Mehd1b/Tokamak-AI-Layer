# Storage Layout Safety Analysis

**Agent**: Analysis Agent #9 -- Storage Layout Safety
**Scope**: AgentRegistry.sol, VaultFactory.sol, KernelExecutionVerifier.sol, KernelOutputParser.sol, OracleVerifier.sol, KernelVault.sol, OptimisticKernelVault.sol
**Date**: 2026-04-13

---

## Step Execution Checklist

| Section | Required | Completed? | Notes |
|---------|----------|------------|-------|
| 1. Storage Surface Inventory | YES | YES | All state variables with slots mapped for UUPS contracts |
| 2. Memory vs Storage Confusion | IF structs/complex types | YES | All storage references in AgentRegistry are intentional mapping lookups |
| 3. Proxy Storage Layout | IF proxy/upgradeable | YES | 3 UUPS contracts analyzed |
| 4. Assembly Storage Safety | IF assembly with sstore/sload | YES -- no sstore/sload found | All assembly uses calldataload, mload, create2, ecrecover |
| 4d. Hardcoded Offset into ABI Data | IF calldataload/mload at hardcoded offset | YES | KernelOutputParser and OracleVerifier reviewed |
| 5. Storage Semantic Corruption | IF delete/restructure ops | YES | AgentRegistry.unregister() reviewed |

---

## Findings

## Finding [SL-1]: Stale metadata URI after agent unregistration

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3,4,5
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R14:✗(no aggregate variables)]
**Depth Evidence**: [TRACE:unregister()->deletes _agents, _agentIdIndex, _deprecated, _successors->MISSES _agentMetadataURI[agentId]]
**Severity**: Low
**Location**: AgentRegistry.sol:290-329

**Description**: When an agent is unregistered via unregister(), the function deletes the agent entry from five auxiliary mappings but does NOT delete _agentMetadataURI[agentId]. After unregistration, getMetadataURI(agentId) still returns the old URI string even though agentExists() returns false.

**Impact**:
- Off-chain consumers querying getMetadataURI() without checking agentExists() receive stale metadata
- Re-registration with the same agentId inherits the old metadata URI
- Wasted storage gas from unreclaimed string slots

**Evidence**:

AgentRegistry.sol L310-326:
```
delete _agents[agentId];
delete _agentIdIndex[agentId];
delete _deprecated[agentId];
delete _successors[agentId];
// MISSING: delete _agentMetadataURI[agentId];
```

AgentRegistry.sol L436-438:
```
function getMetadataURI(bytes32 agentId) external view returns (string memory) {
    return _agentMetadataURI[agentId];
}
```

### Postcondition Analysis
**Postconditions Created**: Stale metadata URI persists in storage after unregistration
**Postcondition Types**: STATE
**Who Benefits**: No direct exploit, but off-chain consumers reading stale data may be misled

---

## Finding [SL-2]: KernelExecutionVerifier __gap off-by-one -- pausedSince not accounted for in gap reduction

**Verdict**: CONFIRMED
**Step Execution**: ✓1,2,3
**Rules Applied**: [R4:✗(evidence clear), R5:✗(single entity), R6:✗(no role), R8:✗(single-step), R10:✓, R14:✗(no aggregate variables)]
**Depth Evidence**: [TRACE:slot_count=10 explicit + gap[41] = 51 total, comment says 4 slots consumed from gap[45] to gap[41], actual new slots = 5 (includes pausedSince)], [BOUNDARY:pre-addition footprint = 5+45 = 50, post-addition = 10+41 = 51, delta = +1]
**Severity**: Low
**Location**: KernelExecutionVerifier.sol:177-183

**Description**: The __gap was reduced from 45 to 41 (reduction of 4) but 5 new variables were added. The comment omits pausedSince (line 159). Gap should be 40, not 41. Total footprint grew from 50 to 51 slots.

**Impact**:
- No current collision or data corruption
- Future upgrade hazard from broken gap-tracking discipline
- Inconsistency with AgentRegistry (51 total) and VaultFactory (51 total) which started at 51

**Evidence**:

KernelExecutionVerifier.sol L153-183:
```
bool public verificationPaused;          // slot 7
uint256 public pausedSince;              // slot 8 -- NOT in comment
address public pendingOwner;             // slot 9

/// Reduced from 45 to 41 slots to accommodate:
///   - pendingImplementation (1)
///   - pendingImplementationActivatesAt (1)
///   - verificationPaused (1)
///   - pendingOwner (1)    // lists 4, should be 5
uint256[41] private __gap; // should be uint256[40]
```

### Postcondition Analysis
**Postconditions Created**: Storage footprint shifted by +1 slot; comment misleads future maintainers
**Postcondition Types**: STATE
**Who Benefits**: No immediate exploiter; future developers may miscalculate gap

---

## Finding [SL-3]: OracleVerifier assembly signature parsing -- safe pattern

**Verdict**: REFUTED
**Step Execution**: ✓4,4d
**Rules Applied**: [R4:✗(evidence clear), R8:✗(single-step)]
**Severity**: Informational
**Location**: OracleVerifier.sol:69-72, 146-149, 238-241

**Description**: Assembly blocks extract r, s, v from bytes memory signature using offsets 32, 64, 96. These are into MEMORY with validated 65-byte length. Standard OZ-style pattern; no dual-read divergence risk.

### Precondition Analysis
**Missing Precondition**: None
**Precondition Type**: N/A
**Why This Blocks**: Length validated before assembly access

---

## Finding [SL-4]: KernelOutputParser._readBytes32 calldataload -- safe pattern

**Verdict**: REFUTED
**Step Execution**: ✓4,4d
**Rules Applied**: [R4:✗(evidence clear), R8:✗(single-step)]
**Severity**: Informational
**Location**: KernelOutputParser.sol:272-283

**Description**: calldataload(add(data.offset, offset)) reads from bounded cursor position after multiple length checks. Reads static-type field in fixed binary protocol, not ABI-encoded dynamic types. No non-canonical encoding risk.

### Precondition Analysis
**Missing Precondition**: None
**Precondition Type**: N/A
**Why This Blocks**: Multiple prior length validations

---

## Chain Summary

| Finding | Severity | Postcondition Created | Precondition Needed | Chain Candidate? |
|---------|----------|----------------------|--------------------|----|
| SL-1 | Low | Stale metadata after unregister | None | No |
| SL-2 | Low | Gap off-by-one, future upgrade hazard | None | No |
| SL-3 | Informational (REFUTED) | None | N/A | No |
| SL-4 | Informational (REFUTED) | None | N/A | No |
