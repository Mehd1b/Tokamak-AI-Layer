# RFC-001: Optimistic Execution Architecture

## Status: APPROVED | Date: 2026-03-06

---

## 1. Problem

The current execution pipeline is synchronous and proof-gated:

```
fetch -> build -> prove (8-12 min) -> submit -> execute actions
```

Every cycle blocks on Groth16 proof generation. For a perp-trading agent on volatile markets, this latency makes the system unable to react in real-time.

## 2. Key Insight

The host already reconstructs agent output before proving (`output_reconstruct.rs`). This means:

- `agent_output_bytes` are known immediately after input construction
- `action_commitment = SHA256(agent_output_bytes)` is computable locally
- The journal (209 bytes) can be predicted from host-side state
- The only missing piece is the `seal` (Groth16 proof)

## 3. Architecture

Decouple execution into two phases:

```
Phase 1 (immediate, <1s):
  fetch -> build -> reconstruct -> submitOptimistic(journal, agentOutputBytes, bond)
  Actions execute immediately, bond escrowed

Phase 2 (async, 8-12 min):
  prove(input_bytes) -> submitProof(executionNonce, seal)
  Execution finalized, bond released

Failure path:
  timeout (no proof within challenge window) -> slash bond, compensate depositors
```

## 4. Implementation Plan

### Phase 1: Core Contracts (Solidity)

#### 1.1 IBondManager Interface
- **File:** `contracts/src/interfaces/IBondManager.sol`
- **Purpose:** Modular bond/staking backend
- **Functions:**
  - `lockBond(operator, vault, nonce, amount)` — escrow bond
  - `releaseBond(operator, vault, nonce)` — return bond after valid proof
  - `slashBond(operator, vault, nonce, slasher)` — slash on timeout/fraud
  - `getMinBond(vault)` — compute required bond
  - `getBondedAmount(operator)` — query total bonded

#### 1.2 NativeBondManager Implementation
- **File:** `contracts/src/NativeBondManager.sol`
- **Purpose:** Simple native token (HYPE) bond manager
- **State:**
  - `bonds[operator][vault][nonce] -> BondInfo{amount, status}`
  - `configuredMinBond[vault] -> uint256`
  - `FINDER_FEE_BPS = 1000` (10%)
  - `DEPOSITOR_SHARE_BPS = 8000` (80%)
  - `TREASURY_SHARE_BPS = 1000` (10%)
- **Bond sizing:** `max(minBondFloor, effectiveTotalAssets * bondBps / 10000)`

#### 1.3 OptimisticKernelVault
- **File:** `contracts/src/OptimisticKernelVault.sol`
- **Inherits:** `KernelVault`
- **New state:**
  - `optimisticEnabled: bool`
  - `challengeWindow: uint256` (default 1 hour, min 15 min, max 24 hr)
  - `minBond: uint256`
  - `maxPending: uint256` (default 3, max 10)
  - `bondManager: IBondManager`
  - `pendingExecutions: mapping(uint64 => PendingExecution)`
  - `_pendingCount: uint256`
- **PendingExecution struct:**
  ```
  journalHash: bytes32      — sha256(journal) for proof matching
  actionCommitment: bytes32  — sha256(agentOutputBytes)
  bondAmount: uint256        — escrowed bond
  deadline: uint256          — block.timestamp + challengeWindow
  status: uint8              — 0=empty, 1=pending, 2=finalized, 3=slashed
  ```
- **New functions:**
  - `executeOptimistic(journal, agentOutputBytes, oracleSig, oracleTs)` payable
    - Parse journal WITHOUT proof (use `verifier.parseJournal()`)
    - Verify agent ID, oracle, nonce ordering, action commitment
    - Escrow bond via BondManager
    - Store PendingExecution
    - Execute actions atomically (same as synchronous path)
  - `submitProof(executionNonce, seal)`
    - Verify RISC Zero proof matches `pendingExecutions[nonce].journalHash`
    - Set status = FINALIZED
    - Release bond
    - Permissionless (anyone can submit valid proof)
  - `slashExpired(executionNonce)`
    - Require `block.timestamp >= deadline`
    - Slash bond via BondManager
    - Set status = SLASHED
    - Permissionless
  - `selfSlash(executionNonce)`
    - Owner-only graceful slash (proving failure)
  - `setChallengeWindow(window)`
  - `setMinBond(amount)`
  - `setMaxPending(max)`
  - `setOptimisticEnabled(bool)`
- **Backward compatibility:**
  - `execute()` and `executeWithOracle()` still work (synchronous path)
  - `submitProof()` allowed even while paused
  - Optimistic mode is opt-in per vault

#### 1.4 IOptimisticKernelVault Interface
- **File:** `contracts/src/interfaces/IOptimisticKernelVault.sol`
- Extract interface from implementation

#### 1.5 VaultFactory Update
- **File:** `contracts/src/VaultFactory.sol` (modify)
- Add `deployOptimisticVault(agentId, asset, userSalt, expectedImageId, bondManager, challengeWindow)`
- Update VaultCreationCodeStore with OptimisticKernelVault bytecode

#### 1.6 KernelExecutionVerifier Update
- **File:** `contracts/src/KernelExecutionVerifier.sol` (modify)
- Add public `verify(seal, imageId, journalDigest)` that directly wraps `verifier.verify()`
- Currently only exposed via `verifyAndParseWithImageId()` which parses journal too

### Phase 2: Tests (Solidity)

#### 2.1 Unit Tests
- **File:** `contracts/test/OptimisticKernelVault.t.sol`
- Happy path: executeOptimistic -> submitProof -> finalized
- Timeout path: executeOptimistic -> wait -> slashExpired
- Self-slash path: executeOptimistic -> selfSlash
- Bond enforcement: insufficient bond reverts
- Nonce ordering: out-of-order reverts
- Max pending: exceeding limit reverts
- Pause interaction: submitProof works while paused
- Strategy interaction: optimistic triggers strategyActive snapshot
- Oracle verification: invalid oracle reverts
- Backward compat: synchronous execute() still works

#### 2.2 BondManager Tests
- **File:** `contracts/test/NativeBondManager.t.sol`
- Lock/release cycle
- Slash distribution (finder 10%, depositors 80%, treasury 10%)
- Min bond computation
- Double-slash prevention
- Double-release prevention

#### 2.3 Integration Tests
- **File:** `contracts/test/integration/OptimisticIntegration.t.sol`
- Full flow with real KernelExecutionVerifier
- Multiple concurrent pending executions
- Mixed synchronous + optimistic executions

### Phase 3: Host Pipeline (Rust)

#### 3.1 Predicted Journal Builder
- **File:** `crates/reference-integrator/src/predict.rs`
- `build_predicted_journal(input: &KernelInputV1, input_bytes: &[u8], agent_output_bytes: &[u8]) -> Vec<u8>`
- Constructs journal without zkVM by copying identity fields + computing commitments
- Determinism guarantee: identical to what zkVM would produce

#### 3.2 Optimistic Submitter
- **File:** `crates/reference-integrator/src/optimistic.rs`
- `submit_optimistic(rpc, vault, journal, agent_output_bytes, oracle_sig, oracle_ts, bond) -> Result<u64>`
- Calls `vault.executeOptimistic{value: bond}(...)` on-chain
- Returns execution nonce

#### 3.3 Proof Submitter
- **File:** `crates/reference-integrator/src/optimistic.rs`
- `submit_proof(rpc, vault, nonce, seal) -> Result<()>`
- Calls `vault.submitProof(nonce, seal)` on-chain

#### 3.4 Async Proving Worker
- **File:** `crates/agents/perp-trader/host/src/prove_worker.rs`
- Background thread/process that:
  - Dequeues pending proof jobs
  - Generates Groth16 proofs
  - Submits proofs on-chain
  - Monitors deadlines and alerts on proximity
  - Handles retries and failures
- Communication with main thread via `Arc<Mutex<VecDeque<PendingProof>>>`

#### 3.5 Host Main Pipeline Update
- **File:** `crates/agents/perp-trader/host/src/main.rs` (modify)
- Add `--optimistic` CLI flag
- When optimistic:
  1. Build input (unchanged)
  2. Reconstruct output (unchanged)
  3. Build predicted journal (new)
  4. Submit optimistically (new, replaces prove+submit)
  5. Queue proof job to background worker (new)
  6. Main thread returns immediately (can run next cycle)
- When not optimistic: existing synchronous flow unchanged

#### 3.6 Monitoring & Alerts
- **File:** `crates/agents/perp-trader/host/src/monitor.rs`
- Poll pending executions on-chain
- Alert when deadline is within 2x proving time
- Alert on proving failures
- Log finalization/slash events

### Phase 4: Frontend Updates

#### 4.1 Vault Detail Page
- Show pending execution count and deadlines
- Visual indicator: "1 execution awaiting proof (47 min remaining)"
- Show execution history with status (finalized/slashed/pending)

#### 4.2 Depositor Information
- Show whether vault is in optimistic mode
- Show challenge window configuration
- Show operator bond status

### Phase 5: Documentation

#### 5.1 Architecture Documentation
- Update CLAUDE.md with optimistic execution flow
- Document new CLI flags
- Document bond sizing recommendations

#### 5.2 Operator Guide
- How to enable optimistic mode
- How to configure challenge window and bond
- How to monitor pending executions
- Failure recovery procedures

## 5. State Machine

```
EMPTY --executeOptimistic()--> PENDING
  requires: owner, optimisticEnabled, nonce valid, bond sufficient
  effects: actions execute, bond escrowed, timer started

PENDING --submitProof()--> FINALIZED
  requires: valid RISC Zero seal matching journalHash
  effects: bond released, permanent
  callable by: anyone (permissionless)

PENDING --slashExpired()--> SLASHED
  requires: block.timestamp >= deadline
  effects: bond slashed (10% finder, 80% depositors, 10% treasury)
  callable by: anyone (permissionless)

PENDING --selfSlash()--> SLASHED
  requires: msg.sender == owner
  effects: same as slashExpired but no finder fee (90% depositors, 10% treasury)
```

## 6. Economic Model

### Bond Sizing
- `requiredBond = max(minBondFloor, effectiveTotalAssets * bondBps / 10000)`
- Recommended: `bondBps = 2000` (20% of TVL)
- Minimum floor: 10 HYPE

### Slash Distribution
| Recipient | Share | Rationale |
|-----------|-------|-----------|
| Slasher (finder) | 10% | Incentivize monitoring |
| Vault depositors | 80% | Compensate for risk |
| Protocol treasury | 10% | Fund security infrastructure |

### Challenge Window
- Default: 1 hour
- Minimum: 15 minutes
- Maximum: 24 hours
- Recommendation: 2-3x expected proving time

## 7. Security Invariants

1. **Bond >= max loss** — Dynamic bond sizing at 110%+ of action exposure makes fraud unprofitable
2. **Nonce ordering preserved** — Optimistic advances nonce immediately, preventing replay
3. **Oracle binding** — Oracle signature binds to specific market state
4. **Owner-only execution** — No external MEV on optimistic window
5. **Proof is still required** — Just deferred, not removed. Missing proof = slash.
6. **Backward compatible** — Synchronous execute() always available
7. **submitProof while paused** — Don't penalize operator for admin pause

## 8. Migration Path

```
Phase 0 (Current):  KernelVault — synchronous only
Phase 1 (Deploy):   OptimisticKernelVault deployed, optimistic disabled
Phase 2 (Test):     Enable on testnet with small TVL
Phase 3 (Mainnet):  Enable on mainnet vaults, operator opt-in
Phase 4 (Default):  New vaults default to optimistic
```

## 9. Open Questions

| # | Question | Recommendation |
|---|----------|----------------|
| Q1 | Bond denomination: HYPE or USDC? | HYPE (simpler, native gas token) |
| Q2 | submitProof permissionless? | Yes — allows third-party provers |
| Q3 | Revert actions on slash? | No — impossible for cross-domain (Hyperliquid) |
| Q4 | Fraud proof path in V1? | No — timeout-only, add in V2 |
| Q5 | Self-slash allowed? | Yes — graceful degradation |
| Q6 | Disable sync when optimistic? | No — keep both paths |
| Q7 | Per-execution challenge window? | No — fixed per vault |
| Q8 | submitProof while paused? | Yes — don't penalize operator |

## 10. File Inventory

### New Files
| File | Type | Priority |
|------|------|----------|
| `contracts/src/interfaces/IBondManager.sol` | Solidity | P0 |
| `contracts/src/interfaces/IOptimisticKernelVault.sol` | Solidity | P0 |
| `contracts/src/NativeBondManager.sol` | Solidity | P0 |
| `contracts/src/OptimisticKernelVault.sol` | Solidity | P0 |
| `contracts/test/OptimisticKernelVault.t.sol` | Test | P0 |
| `contracts/test/NativeBondManager.t.sol` | Test | P0 |
| `contracts/test/integration/OptimisticIntegration.t.sol` | Test | P1 |
| `crates/reference-integrator/src/predict.rs` | Rust | P1 |
| `crates/reference-integrator/src/optimistic.rs` | Rust | P1 |
| `crates/agents/perp-trader/host/src/prove_worker.rs` | Rust | P1 |
| `crates/agents/perp-trader/host/src/monitor.rs` | Rust | P2 |

### Modified Files
| File | Change | Priority |
|------|--------|----------|
| `contracts/src/KernelExecutionVerifier.sol` | Add public `verify()` wrapper | P0 |
| `contracts/src/VaultFactory.sol` | Add `deployOptimisticVault()` | P1 |
| `contracts/src/VaultCreationCodeStore.sol` | Update bytecode | P1 |
| `crates/agents/perp-trader/host/src/main.rs` | Add `--optimistic` flag + async pipeline | P1 |
| `crates/reference-integrator/src/lib.rs` | Export new modules | P1 |
