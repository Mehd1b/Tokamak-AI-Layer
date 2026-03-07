# Optimistic Execution — Frontend Integration Guide

## What Changed

The perp-trader host now supports **optimistic execution**: agent actions execute immediately on-chain without waiting for ZK proof generation (~10 min). The proof is generated in the background and submitted later. A WSTON bond is escrowed as collateral — if the proof isn't submitted before the challenge window expires, the bond is slashed.

This affects:
- A **new vault type**: `OptimisticKernelVault` (extends `KernelVault`)
- **New on-chain state** to display: pending executions, bonds, deadlines
- **New events** to index and surface in the UI
- **New JSON output** from the host CLI that the frontend may consume

---

## New Contract: `OptimisticKernelVault`

Deployed via `VaultFactory.deployOptimisticVault()`. Inherits all `KernelVault` functionality (deposits, withdrawals, proven execution). Adds the optimistic path.

### How to Detect Vault Type

```typescript
// Option 1: Check if optimisticEnabled exists (view call)
const isOptimistic = await vault.read.optimisticEnabled();

// Option 2: Check via factory
const isDeployedVault = await factory.read.isDeployedVault([vaultAddress]);
// Then try calling optimisticEnabled — if it reverts, it's a standard KernelVault
```

### New Read Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `optimisticEnabled()` | `bool` | Whether optimistic mode is active |
| `challengeWindow()` | `uint256` | Seconds operators have to submit proof |
| `minBond()` | `uint256` | Minimum WSTON bond required per execution |
| `maxPending()` | `uint256` | Max concurrent pending executions (default: 3, cap: 10) |
| `bondManager()` | `address` | The `WSTONBondManager` contract address |
| `pendingExecutions(uint64 nonce)` | `PendingExecution` | Status of a specific execution |
| `pendingCount()` | `uint256` | Number of currently unresolved executions |

### `PendingExecution` Struct

```typescript
type PendingExecution = {
  journalHash: `0x${string}`;     // SHA-256 of the submitted journal
  actionCommitment: `0x${string}`; // SHA-256 of the agent output
  bondAmount: bigint;              // WSTON escrowed (in token decimals)
  deadline: bigint;                // Unix timestamp — proof must arrive before this
  status: number;                  // 0=empty, 1=pending, 2=finalized, 3=slashed
};
```

**Status flow:**
```
EMPTY (0) → executeOptimistic → PENDING (1) → submitProof  → FINALIZED (2)
                                            → slashExpired → SLASHED (3)
                                            → selfSlash    → SLASHED (3)
```

---

## New Events to Index

### `OptimisticExecutionSubmitted`
```solidity
event OptimisticExecutionSubmitted(
    uint64 indexed executionNonce,
    bytes32 journalHash,
    uint256 bondAmount,
    uint256 deadline
);
```
Emitted when the operator submits an optimistic execution. Actions have already executed at this point. Display this as "Executed (pending proof)".

### `ProofSubmitted`
```solidity
event ProofSubmitted(uint64 indexed executionNonce, address indexed submitter);
```
Emitted when a valid proof is submitted for a pending execution. The bond is released back to the operator. Display this as "Finalized".

### `ExecutionSlashed`
```solidity
event ExecutionSlashed(
    uint64 indexed executionNonce,
    address indexed slasher,
    uint256 bondAmount
);
```
Emitted when a pending execution's bond is slashed (deadline passed or operator self-slashed). If `slasher == address(0)`, it was a self-slash (no finder fee). Display this as "Slashed".

### `OptimisticConfigUpdated`
```solidity
event OptimisticConfigUpdated(
    uint256 challengeWindow,
    uint256 minBond,
    uint256 maxPending,
    bool enabled
);
```
Emitted when the vault owner changes optimistic configuration.

### Pre-existing `ExecutionApplied`
This event is emitted by BOTH synchronous and optimistic executions. It means "actions ran on-chain". For optimistic executions, it fires inside `executeOptimistic()` — the actions are already live even though the proof hasn't been submitted yet.

---

## UI Components to Add/Update

### 1. Vault Detail Page — Optimistic Status Section

For `OptimisticKernelVault` instances, add a section showing:

| Field | Source | Display |
|-------|--------|---------|
| Mode | `optimisticEnabled()` | Badge: "Optimistic Enabled" (green) or "Optimistic Disabled" (gray) |
| Challenge Window | `challengeWindow()` | Human-readable duration, e.g. "30 min", "1 hour" |
| Min Bond | `minBond()` + `bondManager().bondToken()` | e.g. "100 WSTON" |
| Pending Count | `pendingCount()` | e.g. "2 / 3" (current / maxPending) |
| Bond Manager | `bondManager()` | Linked address |

### 2. Pending Executions Table

Show all executions with `status == 1` (PENDING). Query by iterating nonces or indexing `OptimisticExecutionSubmitted` events.

| Column | Source | Notes |
|--------|--------|-------|
| Nonce | event `executionNonce` | Unique ID |
| Bond | `pendingExecutions(nonce).bondAmount` | In WSTON token decimals |
| Deadline | `pendingExecutions(nonce).deadline` | Show countdown timer |
| Time Remaining | `deadline - now` | Red if < 20 min, yellow if < 1 hour |
| Status | `pendingExecutions(nonce).status` | Badge: Pending / Finalized / Slashed |
| Action | — | "Submit Proof" button (permissionless) |

**Countdown behavior:**
- Green: > 1 hour remaining
- Yellow: 20 min – 1 hour remaining
- Red: < 20 min remaining
- Expired: "SLASHABLE" badge (anyone can call `slashExpired`)

### 3. Execution History — New Execution Types

The existing `ExecutionHistoryTable` shows proven executions. Extend it to show optimistic executions:

| Type | How to Identify | Display |
|------|----------------|---------|
| Proven (sync) | `ExecutionApplied` WITHOUT a corresponding `OptimisticExecutionSubmitted` | "Proven" badge |
| Optimistic (pending) | `OptimisticExecutionSubmitted` without `ProofSubmitted` or `ExecutionSlashed` | "Pending Proof" badge + countdown |
| Optimistic (finalized) | `OptimisticExecutionSubmitted` + `ProofSubmitted` for same nonce | "Finalized" badge |
| Optimistic (slashed) | `OptimisticExecutionSubmitted` + `ExecutionSlashed` for same nonce | "Slashed" badge (red) |

### 4. Vault Header — Vault Type Badge

Next to the vault address, show the vault type:
- `KernelVault` → "Standard Vault"
- `OptimisticKernelVault` → "Optimistic Vault"

### 5. Bond Manager Info (Optional Detail Panel)

If the user clicks into bond details:

| Field | Source | Description |
|-------|--------|-------------|
| Bond Token | `bondManager.bondToken()` | WSTON token address |
| Operator Bonded Total | `bondManager.getBondedAmount(operator)` | Total WSTON locked by operator |
| Slash Distribution | Hardcoded | External: 10% finder / 80% depositors / 10% treasury |
| Self-Slash Distribution | Hardcoded | 0% finder / 90% depositors / 10% treasury |

---

## Host CLI JSON Output Changes

When the host runs with `--json`, it now emits new status types. If the frontend polls the host or reads its output:

### New: `optimistic_submitted` (single-proof)
```json
{
  "status": "optimistic_submitted",
  "execution_nonce": 42,
  "actions": 2,
  "challenge_window_secs": 3600,
  "proof_queued": true
}
```

### New: `optimistic_submitted` (two-phase open)
```json
{
  "status": "optimistic_submitted",
  "two_phase": true,
  "phase1_nonce": 42,
  "phase2_nonce": 43,
  "actions": 1,
  "challenge_window_secs": 3600,
  "proofs_queued": 2
}
```

### New: `optimistic_partial` (phase 2 declined)
```json
{
  "status": "optimistic_partial",
  "reason": "two_proof_phase2_no_signal",
  "phase1_nonce": 42,
  "phase1_proof_queued": true
}
```

### Existing statuses unchanged
`no_op`, `dry_run`, `submitted`, `recovered` — all unchanged.

---

## Two-Phase Optimistic Opens

When an agent opens a new position, it requires **two** optimistic executions:

```
Phase 1: depositMargin     → executeOptimistic (bond #1) → proof queued
         ↓ wait 10s for HyperCore settlement
Phase 2: openPosition      → executeOptimistic (bond #2) → proof queued
```

**Frontend implications:**
- Two consecutive `OptimisticExecutionSubmitted` events with sequential nonces
- Two separate bonds escrowed (both need proofs submitted)
- Two entries in the pending executions table
- If Phase 2 fails, Phase 1 is still valid (deposit already on HyperCore)
- Consider grouping Phase 1 + Phase 2 visually (consecutive nonces, same block range)

For **closes** (single-proof), only one optimistic execution + one bond.

---

## Subgraph / Indexer Updates

If using a subgraph to index vault events, add handlers for:

```yaml
eventHandlers:
  # Existing
  - event: ExecutionApplied(indexed bytes32, uint64, bytes32, uint256)
    handler: handleExecutionApplied

  # New — optimistic execution
  - event: OptimisticExecutionSubmitted(indexed uint64, bytes32, uint256, uint256)
    handler: handleOptimisticSubmitted
  - event: ProofSubmitted(indexed uint64, indexed address)
    handler: handleProofSubmitted
  - event: ExecutionSlashed(indexed uint64, indexed address, uint256)
    handler: handleExecutionSlashed
  - event: OptimisticConfigUpdated(uint256, uint256, uint256, bool)
    handler: handleOptimisticConfigUpdated
```

### Suggested Entity: `OptimisticExecution`

```graphql
type OptimisticExecution @entity {
  id: ID!                         # vault-nonce
  vault: Vault!
  executionNonce: BigInt!
  journalHash: Bytes!
  bondAmount: BigInt!
  deadline: BigInt!
  status: String!                 # "pending" | "finalized" | "slashed"
  submittedAt: BigInt!            # block.timestamp of OptimisticExecutionSubmitted
  submittedTx: Bytes!
  proofSubmittedAt: BigInt        # block.timestamp of ProofSubmitted (nullable)
  proofSubmittedBy: Bytes         # address that submitted the proof
  proofTx: Bytes
  slashedAt: BigInt               # block.timestamp of ExecutionSlashed (nullable)
  slashedBy: Bytes                # address(0) for self-slash
  slashTx: Bytes
}
```

---

## ABI Additions

Add the `IOptimisticKernelVault` ABI to the frontend. Key functions the UI needs:

```json
[
  "function optimisticEnabled() view returns (bool)",
  "function challengeWindow() view returns (uint256)",
  "function minBond() view returns (uint256)",
  "function maxPending() view returns (uint256)",
  "function bondManager() view returns (address)",
  "function pendingCount() view returns (uint256)",
  "function pendingExecutions(uint64 nonce) view returns (bytes32 journalHash, bytes32 actionCommitment, uint256 bondAmount, uint256 deadline, uint8 status)",
  "function getPendingExecution(uint64 nonce) view returns (tuple(bytes32 journalHash, bytes32 actionCommitment, uint256 bondAmount, uint256 deadline, uint8 status))",
  "function submitProof(uint64 executionNonce, bytes seal) external",
  "function slashExpired(uint64 executionNonce) external",
  "event OptimisticExecutionSubmitted(uint64 indexed executionNonce, bytes32 journalHash, uint256 bondAmount, uint256 deadline)",
  "event ProofSubmitted(uint64 indexed executionNonce, address indexed submitter)",
  "event ExecutionSlashed(uint64 indexed executionNonce, address indexed slasher, uint256 bondAmount)",
  "event OptimisticConfigUpdated(uint256 challengeWindow, uint256 minBond, uint256 maxPending, bool enabled)"
]
```

For the bond manager:
```json
[
  "function bondToken() view returns (address)",
  "function getBondedAmount(address operator) view returns (uint256)",
  "function getMinBond(address vault) view returns (uint256)"
]
```

---

## Summary of User-Facing Changes

| Before | After |
|--------|-------|
| All executions wait 8-12 min for ZK proof | Optimistic executions are instant (proof follows async) |
| One vault type (`KernelVault`) | Two vault types: `KernelVault` + `OptimisticKernelVault` |
| Execution history: proven only | Execution history: proven + optimistic (pending/finalized/slashed) |
| No bond system | WSTON bond per optimistic execution, visible in UI |
| No deadline tracking | Countdown timers for proof deadlines |
| No slashing | Slashing visible: bond forfeiture when proof is late |
