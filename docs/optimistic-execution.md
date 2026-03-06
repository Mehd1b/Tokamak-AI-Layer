# Optimistic Execution

## Overview

Optimistic Execution is a two-phase decoupled architecture that eliminates the 8-12 minute proof generation bottleneck from the agent execution pipeline. Instead of waiting for a RISC Zero Groth16 proof before executing actions, operators post a WSTON bond and execute immediately, then submit the proof asynchronously within a configurable challenge window.

**Before (synchronous):**
```
fetch market data -> build input -> prove in zkVM (8-12 min) -> submit proof + execute actions
```

**After (optimistic):**
```
Phase 1 (<1s):  build input -> predict journal -> executeOptimistic(journal, actions, bond)
Phase 2 (async): prove in zkVM -> submitProof(nonce, seal) -> bond released
```

The synchronous execution path (`execute()` / `executeWithOracle()`) remains fully functional. Optimistic mode is opt-in per vault.

---

## Architecture

### Two-Phase Execution Model

#### Phase 1: Immediate Execution

The operator constructs a **predicted journal** — a 209-byte `KernelJournalV1` built from host-side state without running the zkVM. This is possible because all journal fields are known after input construction and agent output reconstruction:

| Journal Field | Source |
|---|---|
| `protocol_version`, `kernel_version` | Constants (1, 1) |
| `agent_id`, `agent_code_hash`, `constraint_set_hash`, `input_root` | Copied from `KernelInputV1` |
| `execution_nonce` | Copied from `KernelInputV1` |
| `input_commitment` | `SHA-256(canonical_encode(input))` |
| `action_commitment` | `SHA-256(canonical_encode(agent_output))` |
| `execution_status` | `0x01` (Success) |

The predicted journal is byte-identical to what the zkVM kernel produces, because both use the same fields, the same SHA-256 commitment functions, and the same canonical codec.

The operator submits `executeOptimistic(journal, agentOutputBytes, oracleSignature, oracleTimestamp, bondAmount)` to the `OptimisticKernelVault`. The contract:

1. Parses the journal (validates structure, protocol version, kernel version, execution status)
2. Verifies the agent ID matches the vault's bound agent
3. Verifies oracle signature (if configured)
4. Validates nonce ordering (must be > last nonce, within `MAX_NONCE_GAP`)
5. Verifies `SHA-256(agentOutputBytes) == journal.actionCommitment`
6. Locks WSTON bond via the `BondManager`
7. Stores a `PendingExecution` record with `SHA-256(journal)` and a deadline
8. Executes all actions immediately (same code path as synchronous execution)

#### Phase 2: Asynchronous Proof Submission

A background proving worker generates the Groth16 proof in parallel. Once complete, anyone can call `submitProof(executionNonce, seal)` to:

1. Verify the RISC Zero proof against the stored `journalHash` and the vault's `trustedImageId`
2. Mark the execution as `FINALIZED`
3. Release the WSTON bond back to the operator

If the proof is not submitted before the deadline, anyone can call `slashExpired(executionNonce)` to slash the bond.

### State Machine

```
                     executeOptimistic()
          EMPTY ──────────────────────────> PENDING
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    │                         │                         │
              submitProof()            slashExpired()              selfSlash()
              (valid seal)          (deadline passed)            (owner only)
                    │                         │                         │
                    v                         v                         v
               FINALIZED                  SLASHED                   SLASHED
             (bond released)        (bond distributed)        (bond distributed,
                                   10% finder / 80%           no finder fee)
                                   depositors / 10%
                                      treasury
```

**Status codes:** `0` = Empty, `1` = Pending, `2` = Finalized, `3` = Slashed

---

## Smart Contracts

### Contract Hierarchy

```
KernelVault (base)
    │
    ├── execute()              ← synchronous path (proof required upfront)
    ├── executeWithOracle()    ← synchronous path with oracle verification
    ├── deposits / withdrawals
    └── strategy management

OptimisticKernelVault (extends KernelVault)
    │
    ├── executeOptimistic()    ← optimistic path (bond, no proof)
    ├── submitProof()          ← finalize with proof (permissionless)
    ├── slashExpired()         ← slash after deadline (permissionless)
    ├── selfSlash()            ← owner self-slash
    └── configuration setters
```

### OptimisticKernelVault

**File:** `contracts/src/OptimisticKernelVault.sol`

Extends `KernelVault` with optimistic execution capabilities. All existing vault functionality (deposits, withdrawals, proven execution, strategy management, pause, emergency flows) is inherited unchanged.

#### Constructor

```solidity
constructor(
    address _asset,          // ERC20 asset held by the vault
    address _verifier,       // KernelExecutionVerifier contract
    bytes32 _agentId,        // Agent ID bound to this vault
    bytes32 _trustedImageId, // RISC Zero image ID (immutable)
    address _owner,          // Vault owner (operator)
    address _bondManager     // BondManager contract (can be address(0))
)
```

#### Configuration

| Parameter | Default | Min | Max | Description |
|---|---|---|---|---|
| `challengeWindow` | 1 hour | 15 minutes | 24 hours | Time to submit proof after optimistic execution |
| `minBond` | 0 | — | — | Vault-level minimum bond override (in WSTON) |
| `maxPending` | 3 | — | 10 | Maximum concurrent pending executions |
| `optimisticEnabled` | false | — | — | Must be explicitly enabled by owner |

Configuration is set via owner-only functions:
- `setChallengeWindow(uint256 window)` — Must be within `[MIN_CHALLENGE_WINDOW, MAX_CHALLENGE_WINDOW]`
- `setMinBond(uint256 amount)` — Vault-level minimum (compared against `BondManager.getMinBond()`)
- `setMaxPending(uint256 max)` — Cannot exceed `MAX_MAX_PENDING` (10)
- `setOptimisticEnabled(bool enabled)` — Requires `bondManager != address(0)` to enable
- `setBondManager(IBondManager manager)` — Set or update the bond manager contract

All configuration changes emit `OptimisticConfigUpdated(challengeWindow, minBond, maxPending, enabled)`.

#### Core Functions

**`executeOptimistic(journal, agentOutputBytes, oracleSignature, oracleTimestamp, bondAmount)`**

Submit an optimistic execution. The operator must first `approve()` the `BondManager` contract to spend `bondAmount` of WSTON.

- **Access:** Owner only
- **Guards:** `nonReentrant`, `whenNotPaused`, `optimisticEnabled`
- **Bond:** Pulled from operator via `BondManager.lockBond()` (ERC20 `transferFrom`)
- **Effect:** Actions execute immediately, nonce advances, `PendingExecution` stored

**`submitProof(executionNonce, seal)`**

Submit a RISC Zero proof for a pending execution to reclaim the bond.

- **Access:** Permissionless (anyone can submit a valid proof)
- **Guards:** `nonReentrant` (intentionally NOT `whenNotPaused` — operators must be able to reclaim bonds even while the vault is paused by an admin)
- **Verification:** `verifier.verify(seal, trustedImageId, pendingExecution.journalHash)`
- **Effect:** Status set to `FINALIZED`, bond released to operator, `_pendingCount` decremented

**`slashExpired(executionNonce)`**

Slash a pending execution whose challenge window has expired.

- **Access:** Permissionless
- **Requirement:** `block.timestamp >= pendingExecution.deadline`
- **Effect:** Status set to `SLASHED`, bond distributed (10% finder, 80% vault, 10% treasury)

**`selfSlash(executionNonce)`**

Owner voluntarily slashes their own pending execution (e.g., if proving failed).

- **Access:** Owner only
- **Effect:** Status set to `SLASHED`, no finder fee (90% vault, 10% treasury)

#### PendingExecution Struct

```solidity
struct PendingExecution {
    bytes32 journalHash;       // SHA-256(journal) — used to verify proof later
    bytes32 actionCommitment;  // SHA-256(agentOutputBytes)
    bondAmount;                // WSTON escrowed
    uint256 deadline;          // block.timestamp + challengeWindow
    uint8 status;              // 0=empty, 1=pending, 2=finalized, 3=slashed
}
```

#### Events

| Event | Emitted When |
|---|---|
| `OptimisticExecutionSubmitted(nonce, journalHash, bondAmount, deadline)` | Optimistic execution accepted |
| `ProofSubmitted(nonce, submitter)` | Proof verified and execution finalized |
| `ExecutionSlashed(nonce, slasher, bondAmount)` | Bond slashed (slasher=`address(0)` for self-slash) |
| `OptimisticConfigUpdated(window, minBond, maxPending, enabled)` | Configuration changed |

#### Errors

| Error | Condition |
|---|---|
| `OptimisticNotEnabled()` | `optimisticEnabled` is false |
| `TooManyPending(current, max)` | `_pendingCount >= maxPending` |
| `InsufficientBond(provided, required)` | `bondAmount < max(minBond, bondManager.getMinBond())` |
| `ExecutionNotPending(nonce, status)` | Execution is not in PENDING state |
| `DeadlineNotReached(nonce, deadline, current)` | Slash attempted before deadline |
| `InvalidChallengeWindow(provided, min, max)` | Window outside `[15 min, 24 hr]` bounds |
| `InvalidMaxPending(provided, max)` | Exceeds `MAX_MAX_PENDING` (10) |
| `BondManagerNotSet()` | Enabling optimistic without bond manager |
| `ProofVerificationFailed()` | RISC Zero proof verification failed |

---

### WSTONBondManager

**File:** `contracts/src/WSTONBondManager.sol`

Manages WSTON (Wrapped Staked TON) bonds for optimistic execution operators. Chain-agnostic ERC20 bond manager.

#### Bond Lifecycle

```
Operator approves BondManager for WSTON spending
    │
    v
lockBond() ──> LOCKED (WSTON pulled from operator)
    │
    ├── releaseBond() ──> RELEASED (WSTON returned to operator)
    │
    └── slashBond() ──> SLASHED (WSTON distributed)
                            ├── 10% to finder (if external slash)
                            ├── 80% to vault (depositors)
                            └── 10% to treasury
```

#### Slash Distribution

| Scenario | Finder | Vault (Depositors) | Treasury |
|---|---|---|---|
| External slash (`slashExpired`) | 10% | 80% | 10% |
| Self-slash (`selfSlash`) | 0% | 90% | 10% |

#### Authorization

Only vaults authorized via `authorizeVault(address)` can call `lockBond`, `releaseBond`, and `slashBond`. This prevents arbitrary contracts from manipulating bonds.

#### Key Functions

| Function | Access | Description |
|---|---|---|
| `lockBond(operator, vault, nonce, amount)` | Authorized vaults | Pull WSTON from operator and escrow |
| `releaseBond(operator, vault, nonce)` | Authorized vaults | Return WSTON to operator |
| `slashBond(operator, vault, nonce, slasher)` | Authorized vaults | Distribute WSTON per slash ratios |
| `getMinBond(vault)` | Public view | Returns `minBondFloor` |
| `getBondedAmount(operator)` | Public view | Total WSTON currently bonded by operator |
| `bondToken()` | Public view | Returns WSTON token address |
| `authorizeVault(vault)` | Owner | Allow vault to manage bonds |
| `revokeVault(vault)` | Owner | Revoke vault authorization |
| `setMinBondFloor(amount)` | Owner | Update global minimum bond |
| `setTreasury(address)` | Owner | Update treasury address |

---

### IBondManager Interface

**File:** `contracts/src/interfaces/IBondManager.sol`

The `IBondManager` interface allows alternative bond manager implementations. Any ERC20 token can be used for bonds by implementing this interface.

```solidity
interface IBondManager {
    function lockBond(address operator, address vault, uint64 nonce, uint256 amount) external;
    function releaseBond(address operator, address vault, uint64 nonce) external;
    function slashBond(address operator, address vault, uint64 nonce, address slasher) external;
    function getMinBond(address vault) external view returns (uint256);
    function getBondedAmount(address operator) external view returns (uint256);
    function bondToken() external view returns (address);
}
```

---

### KernelExecutionVerifier Update

**File:** `contracts/src/KernelExecutionVerifier.sol`

Added a `verify()` function for optimistic proof submission. Previously, proof verification was only accessible via `verifyAndParseWithImageId()`, which also parsed the journal. Optimistic execution stores the `journalHash` at submission time and only needs raw proof verification later.

```solidity
/// @notice Verify a RISC Zero proof without parsing the journal
/// @dev Used by OptimisticKernelVault for deferred proof verification
function verify(bytes calldata seal, bytes32 imageId, bytes32 journalDigest) external view;
```

---

### VaultFactory Update

**File:** `contracts/src/VaultFactory.sol`

Added support for deploying `OptimisticKernelVault` instances alongside standard `KernelVault` instances.

**New functions:**

| Function | Description |
|---|---|
| `deployOptimisticVault(agentId, asset, userSalt, expectedImageId, bondManager, challengeWindow)` | Deploy an `OptimisticKernelVault` via CREATE2 |
| `computeOptimisticVaultAddress(owner, agentId, asset, userSalt, bondManager)` | Predict the deployment address |
| `setOptimisticVaultCreationCodeStore(newStore)` | Update the bytecode store (owner only) |

Both vault types share the same tracking infrastructure (`isDeployedVault`, `_deployedVaults`, `_agentVaults`).

**New contract:** `OptimisticVaultCreationCodeStore` stores `OptimisticKernelVault` creation bytecode as runtime code, following the same pattern as the existing `VaultCreationCodeStore`.

---

## Rust Host Pipeline

### Predicted Journal Builder

**File:** `crates/reference-integrator/src/predict.rs`

Constructs the 209-byte `KernelJournalV1` without running the zkVM.

```rust
pub fn build_predicted_journal(
    input: &KernelInputV1,
    input_bytes: &[u8],
    agent_output_bytes: &[u8],
) -> Result<Vec<u8>, PredictError>
```

**Determinism guarantee:** The predicted journal is byte-identical to what the zkVM kernel produces. Both use the same identity fields from `KernelInputV1`, the same SHA-256 commitment functions, and the same canonical codec. This is validated by 7 unit tests.

### Optimistic Submitter

**File:** `crates/reference-integrator/src/optimistic.rs`

On-chain submission functions (feature-gated behind `onchain`):

| Function | Description |
|---|---|
| `submit_optimistic(...)` | Call `vault.executeOptimistic()`, returns execution nonce |
| `submit_proof(...)` | Call `vault.submitProof()` to finalize |
| `query_pending_execution(...)` | Read pending execution status from chain |

### Background Proving Worker

**File:** `crates/agents/perp-trader/host/src/prove_worker.rs`

Runs in a dedicated thread, processing proof jobs from a shared queue.

```rust
pub type ProofQueue = Arc<Mutex<VecDeque<PendingProof>>>;

pub fn run_proving_worker(
    queue: ProofQueue,
    shutdown: Arc<AtomicBool>,
    status: Arc<WorkerStatus>,
);
```

**Worker behavior:**
1. Dequeues `PendingProof` jobs from the shared queue
2. Checks deadline proximity (warns if < 2x expected proving time)
3. Generates Groth16 proof via RISC Zero
4. Submits proof on-chain via `vault.submitProof()`
5. Retries failed jobs once (configurable via `MAX_RETRIES`)
6. Catches panics to keep the worker alive

**Monitoring via `WorkerStatus`:**
```rust
pub struct WorkerStatus {
    pub jobs_completed: AtomicU64,
    pub jobs_failed: AtomicU64,
    pub currently_proving: AtomicU64, // 0 = idle
}
```

### Deadline Monitor

**File:** `crates/agents/perp-trader/host/src/monitor.rs`

Polls on-chain state and alerts when pending executions approach their proof deadline.

- **Poll interval:** 60 seconds (default)
- **Warning threshold:** 20 minutes before deadline
- Logs `[ALERT]` messages for at-risk executions
- Runs in a background thread alongside the proving worker

### Host Main Pipeline

**File:** `crates/agents/perp-trader/host/src/main.rs`

When `--optimistic` is passed:

1. Build input (unchanged)
2. Reconstruct agent output (unchanged)
3. Build predicted journal via `predict::build_predicted_journal()`
4. Submit optimistically via on-chain call
5. Queue proof job to background worker
6. Return immediately (main thread can run next cycle)

When `--optimistic` is not passed, the existing synchronous flow (prove first, then submit) runs unchanged.

**New CLI arguments:**
| Flag | Description |
|---|---|
| `--optimistic` | Enable optimistic execution mode |
| `--bond-amount <WSTON>` | Bond amount for optimistic execution |
| `--challenge-window <seconds>` | Challenge window duration |

---

## Operator Guide

### Enabling Optimistic Execution

#### 1. Deploy WSTONBondManager

```solidity
WSTONBondManager bondManager = new WSTONBondManager(
    wstonTokenAddress,    // WSTON ERC20 token
    treasuryAddress,      // Protocol treasury for slash proceeds
    ownerAddress,         // BondManager admin
    minBondFloor          // Minimum bond in WSTON units
);
```

#### 2. Deploy OptimisticKernelVault

Use the `VaultFactory`:

```solidity
address vault = factory.deployOptimisticVault(
    agentId,
    assetAddress,         // ERC20 asset the vault holds
    userSalt,
    expectedImageId,
    address(bondManager),
    3600                  // 1 hour challenge window
);
```

#### 3. Authorize the Vault

```solidity
bondManager.authorizeVault(vault);
```

#### 4. Configure and Enable

```solidity
OptimisticKernelVault(vault).setChallengeWindow(3600);  // 1 hour
OptimisticKernelVault(vault).setMinBond(1e27);          // 1 WSTON (27 decimals)
OptimisticKernelVault(vault).setMaxPending(3);
OptimisticKernelVault(vault).setOptimisticEnabled(true);
```

#### 5. Approve WSTON Spending

Before each optimistic execution, the operator must approve the `BondManager` to spend WSTON:

```solidity
IERC20(wston).approve(address(bondManager), bondAmount);
```

#### 6. Run the Host with Optimistic Flag

```bash
./perp-host \
  --optimistic \
  --bond-amount 1000000000000000000000000000 \
  --challenge-window 3600 \
  --vault-address 0x... \
  --rpc-url https://... \
  --private-key 0x...
```

### Challenge Window Sizing

The challenge window must be long enough for proof generation to complete reliably:

| Proving Time | Recommended Window | Rationale |
|---|---|---|
| ~10 minutes | 30 minutes (1800s) | 3x proving time |
| ~10 minutes | 1 hour (3600s) | 6x proving time (conservative) |

The monitor alerts when remaining time drops below 20 minutes (2x expected proving time).

### Failure Recovery

**Proof generation fails:**
1. The proving worker retries once automatically
2. If the retry fails, the operator can `selfSlash(nonce)` to gracefully exit
3. Self-slash distributes 90% of the bond to vault depositors, 10% to treasury (no finder fee)

**Deadline passes without proof:**
1. Anyone can call `slashExpired(nonce)` to claim 10% of the bond as a finder fee
2. 80% goes to vault depositors, 10% to treasury
3. The operator permanently loses the bond

**Vault is paused:**
- `submitProof()` is intentionally NOT gated by `whenNotPaused`
- Operators can always submit proofs to reclaim bonds, even during an admin pause
- `slashExpired()` also works while paused

---

## Security Model

### Invariants

1. **Bond >= potential loss.** The required bond makes fraud unprofitable. Dynamic bond sizing via `BondManager.getMinBond()` and vault-level `minBond` ensure adequate coverage.

2. **Nonce ordering preserved.** Optimistic execution advances the nonce immediately, preventing replay attacks. The same `MAX_NONCE_GAP` (100) constraint applies.

3. **Oracle binding.** Oracle signatures bind to specific market state via `inputRoot`, preventing stale data submission.

4. **Owner-only execution.** Only the vault owner can call `executeOptimistic()`, preventing external MEV on the optimistic window.

5. **Proof is deferred, not removed.** Every optimistic execution must eventually be proven or the bond is slashed. The ZK proof guarantee is preserved — it is only decoupled from execution timing.

6. **Backward compatible.** `execute()` and `executeWithOracle()` continue to work unchanged. Mixed synchronous and optimistic executions are supported with proper nonce ordering.

7. **Proof submission during pause.** `submitProof()` is exempt from `whenNotPaused` to prevent admin actions from causing operator bond loss.

### Threat Model

| Threat | Mitigation |
|---|---|
| Operator submits fraudulent actions | Bond slashed if proof not submitted; SHA-256 commitment binding prevents action substitution |
| Operator submits wrong journal | Predicted journal must match zkVM output byte-for-byte; proof verification checks `journalHash` |
| MEV extraction during challenge window | Only vault owner can submit optimistic executions |
| Finder front-runs slashExpired | No harm — the slash happens correctly regardless of who triggers it |
| Bond manager reentrancy | `ReentrancyGuard` on both vault and bond manager; `SafeERC20` for token transfers |
| Admin pauses vault to cause slash | `submitProof()` exempt from pause; operators can always reclaim bonds |

---

## Test Coverage

The optimistic execution feature is covered by 82 dedicated tests across 3 test suites:

### WSTONBondManager Tests (31 tests)
**File:** `contracts/test/WSTONBondManager.t.sol`

- Constructor validation (zero token, zero treasury, zero owner)
- Lock/release/slash lifecycle with ERC20 transfers
- Slash distribution verification (finder 10%, depositors 80%, treasury 10%)
- Self-slash distribution (no finder fee: depositors 90%, treasury 10%)
- Allowance-based revert (insufficient WSTON approval)
- Double-slash and double-release prevention
- Authorization enforcement (`onlyAuthorizedVault`)
- Admin functions (`setTreasury`, `setMinBondFloor`, `authorizeVault`, `revokeVault`, `transferOwnership`)

### OptimisticKernelVault Tests (46 tests)
**File:** `contracts/test/OptimisticKernelVault.t.sol`

- Happy path: `executeOptimistic` -> `submitProof` -> finalized
- Action execution: transfers and strategy activation via optimistic path
- Bond enforcement: insufficient bond, exact minimum bond, excess bond
- Nonce ordering: out-of-order nonce, nonce gap too large
- Max pending: exceeding limit reverts
- Pause interaction: `submitProof` and `slashExpired` work while paused; `executeOptimistic` blocked
- Proof verification: valid proof finalizes, invalid proof reverts
- Self-slash: owner-only, no finder fee
- Slash timing: before deadline reverts, after deadline succeeds
- Configuration: challenge window bounds, max pending cap, bond manager requirement
- Backward compatibility: synchronous `execute()` and `executeWithOracle()` still work
- Mixed execution: interleaved synchronous and optimistic executions with correct nonce ordering

### Integration Tests (5 tests)
**File:** `contracts/test/integration/OptimisticIntegration.t.sol`

- Full lifecycle: deposits, optimistic execution with transfers, proof, settlement
- Multiple concurrent pending executions
- Mixed synchronous and optimistic execution flows
- Partial finalization (some proved, some slashed)

### Rust Tests (8 tests)

- `predict.rs`: 7 unit tests — journal length, determinism, SHA-256 commitments, roundtrip encoding, struct/bytes equivalence, input/output differentiation
- `optimistic.rs`: 1 compilation test (on-chain functions require network for integration testing)

**Full test suite:** 411 tests across 15 suites, 0 failures.

---

## File Inventory

### New Contracts

| File | Description |
|---|---|
| `contracts/src/OptimisticKernelVault.sol` | Core optimistic vault extending KernelVault |
| `contracts/src/WSTONBondManager.sol` | WSTON ERC20 bond manager |
| `contracts/src/interfaces/IOptimisticKernelVault.sol` | Optimistic vault interface |
| `contracts/src/interfaces/IBondManager.sol` | Bond manager interface |

### Modified Contracts

| File | Change |
|---|---|
| `contracts/src/KernelExecutionVerifier.sol` | Added `verify(seal, imageId, journalDigest)` function |
| `contracts/src/interfaces/IKernelExecutionVerifier.sol` | Added `verify()` to interface |
| `contracts/src/VaultFactory.sol` | Added `deployOptimisticVault()`, `computeOptimisticVaultAddress()`, `setOptimisticVaultCreationCodeStore()` |
| `contracts/src/interfaces/IVaultFactory.sol` | Added new function signatures and `OptimisticVaultDeployed` event |
| `contracts/src/VaultCreationCodeStore.sol` | Added `OptimisticVaultCreationCodeStore` contract |

### New Rust Modules

| File | Description |
|---|---|
| `crates/reference-integrator/src/predict.rs` | Predicted journal construction (no zkVM) |
| `crates/reference-integrator/src/optimistic.rs` | On-chain submission and query functions |
| `crates/agents/perp-trader/host/src/prove_worker.rs` | Background Groth16 proving thread |
| `crates/agents/perp-trader/host/src/monitor.rs` | Deadline monitoring and alerting |

### Modified Rust Files

| File | Change |
|---|---|
| `crates/reference-integrator/src/lib.rs` | Re-exports `predict` and `optimistic` modules |
| `crates/agents/perp-trader/host/src/main.rs` | Optimistic execution branch with `--optimistic` flag |
| `crates/agents/perp-trader/host/src/config.rs` | New CLI args: `--optimistic`, `--bond-amount`, `--challenge-window` |

### Test Files

| File | Tests |
|---|---|
| `contracts/test/WSTONBondManager.t.sol` | 31 |
| `contracts/test/OptimisticKernelVault.t.sol` | 46 |
| `contracts/test/integration/OptimisticIntegration.t.sol` | 5 |

### Diagrams

| File | Description |
|---|---|
| `docs/optimistic-execution-workflow.svg` | End-to-end workflow diagram |
