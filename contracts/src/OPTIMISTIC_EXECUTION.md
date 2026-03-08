# Optimistic Execution Architecture

## Problem

The synchronous execution pipeline blocks on Groth16 proof generation (8-12 minutes per cycle):

```
build input -> prove in zkVM (8-12 min) -> submit proof + journal -> execute actions
```

This latency prevents real-time agent response to market conditions.

## Solution

Decouple proof generation from action execution into two phases:

```
Phase 1 (immediate):  build input -> predict journal -> executeOptimistic(journal, actions, bond)
Phase 2 (async):      prove in zkVM (background) -> submitProof(nonce, seal) -> bond released
```

Actions execute in Phase 1. The ZK proof follows asynchronously. If the proof is never submitted, the operator's bond is slashed.

## Contract Dependency Graph

```
                    IBondManager
                        |
                        v
KernelVault        WSTONBondManager
    |                   ^
    v                   |
OptimisticKernelVault --+
    |
    v
KernelExecutionVerifier
    |
    v
IRiscZeroVerifier (external)
```

**Deployment via VaultFactory:**

```
AgentRegistry -----> VaultFactory
                         |
                    +---------+------------------+
                    |                             |
               deployVault()          deployOptimisticVault()
                    |                             |
                    v                             v
              KernelVault              OptimisticKernelVault
         (VaultCreationCodeStore)  (OptimisticVaultCreationCodeStore)
```

## Contract Responsibilities

### OptimisticKernelVault.sol

Extends `KernelVault` with the optimistic execution path. Inherits all base functionality: deposits, withdrawals, synchronous proven execution, strategy management, pause, and emergency flows.

**Added state:**
- `optimisticEnabled` -- opt-in flag (default: false)
- `challengeWindow` -- seconds to submit proof (default: 1 hour, range: 15 min - 24 hr)
- `minBond` -- vault-level bond floor in WSTON
- `maxPending` -- concurrent pending execution cap (default: 3, max: 10)
- `bondManager` -- IBondManager implementation
- `pendingExecutions[nonce]` -- PendingExecution records
- `_pendingCount` -- active pending count

**Key functions:**
- `executeOptimistic()` -- parse journal, verify agent/oracle/nonce/commitment, lock bond, execute actions, store pending record
- `submitProof()` -- verify RISC Zero proof, release bond, mark finalized. NOT gated by whenNotPaused.
- `slashExpired()` -- permissionless slash after deadline
- `selfSlash()` -- owner-only graceful slash (no finder fee)

### WSTONBondManager.sol

ERC20-based bond escrow using WSTON (Wrapped Staked TON). Manages the bond lifecycle:

```
EMPTY -> lockBond() -> LOCKED -> releaseBond() -> RELEASED
                          |
                          +----> slashBond() -> SLASHED
```

**Slash distribution:**
- External slash: 10% finder, 80% vault depositors, 10% treasury
- Self-slash: 0% finder, 90% vault depositors, 10% treasury

**Authorization model:** Only vaults registered via `authorizeVault()` can call lock/release/slash. Prevents unauthorized contracts from manipulating bonds.

**Storage:** `bonds[operator][vault][nonce] -> BondInfo{amount, lockedAt, status}`

### IBondManager.sol

Modular interface allowing alternative bond token implementations:

```solidity
function lockBond(address operator, address vault, uint64 nonce, uint256 amount) external;
function releaseBond(address operator, address vault, uint64 nonce) external;
function slashBond(address operator, address vault, uint64 nonce, address slasher) external;
function getMinBond(address vault) external view returns (uint256);
function getBondedAmount(address operator) external view returns (uint256);
function bondToken() external view returns (address);
```

### KernelExecutionVerifier.sol (modified)

Added `verify(seal, imageId, journalDigest)` -- raw proof verification without journal parsing. The optimistic vault stores `journalHash = sha256(journal)` at submission time and uses this function for deferred verification in `submitProof()`.

Previously, proof verification was only accessible through `verifyAndParseWithImageId()`, which parses the journal as well. The optimistic path does not need to re-parse the journal at proof time.

### VaultFactory.sol (modified)

Added `deployOptimisticVault()` and `computeOptimisticVaultAddress()`. Uses a separate `OptimisticVaultCreationCodeStore` for the bytecode, following the same CREATE2 pattern as standard vault deployment. Both vault types share tracking state (`isDeployedVault`, `_deployedVaults`, `_agentVaults`).

## Execution Flow (executeOptimistic)

```
Operator                     OptimisticKernelVault          WSTONBondManager
   |                                |                            |
   | -- approve(bondManager, N) --> |                            |
   |                                |                            |
   | -- executeOptimistic() ------> |                            |
   |                                |                            |
   |                          1. parseJournal(journal)           |
   |                             (no proof verification)         |
   |                          2. verify agentId                  |
   |                          3. verify oracle signature         |
   |                          4. verify nonce ordering           |
   |                          5. verify sha256(agentOutput)      |
   |                             == journal.actionCommitment     |
   |                          6. journalHash = sha256(journal)   |
   |                          7. compute required bond           |
   |                                |                            |
   |                                | -- lockBond(operator, N) ->|
   |                                |    (transferFrom WSTON)    |
   |                                |                            |
   |                          8. store PendingExecution           |
   |                          9. advance lastExecutionNonce       |
   |                         10. execute actions atomically       |
   |                         11. emit events                      |
   |                                |                            |
   | <-- tx confirmed ------------ |                            |
```

## Proof Submission Flow (submitProof)

```
Anyone                       OptimisticKernelVault     KernelExecutionVerifier    WSTONBondManager
  |                                |                          |                        |
  | -- submitProof(nonce, seal) -> |                          |                        |
  |                                |                          |                        |
  |                          1. load pending[nonce]           |                        |
  |                          2. check status == PENDING       |                        |
  |                                |                          |                        |
  |                                | -- verify(seal,          |                        |
  |                                |    imageId,              |                        |
  |                                |    journalHash) -------> |                        |
  |                                |                    verify via                     |
  |                                |                    IRiscZeroVerifier               |
  |                                | <-- ok ------------------|                        |
  |                                |                                                   |
  |                          3. status = FINALIZED                                     |
  |                          4. _pendingCount--                                        |
  |                                |                                                   |
  |                                | -- releaseBond(operator, nonce) -----------------> |
  |                                |                                (transfer WSTON     |
  |                                |                                 back to operator)  |
  |                                |                                                   |
  | <-- tx confirmed ------------ |                                                   |
```

## Slash Flow (slashExpired)

```
Anyone                       OptimisticKernelVault          WSTONBondManager
  |                                |                            |
  | -- slashExpired(nonce) ------> |                            |
  |                                |                            |
  |                          1. load pending[nonce]             |
  |                          2. check status == PENDING         |
  |                          3. check block.timestamp           |
  |                             >= deadline                     |
  |                          4. status = SLASHED                |
  |                          5. _pendingCount--                 |
  |                                |                            |
  |                                | -- slashBond(operator,     |
  |                                |    nonce, msg.sender) ---> |
  |                                |                            |
  |                                |              10% -> finder (msg.sender)
  |                                |              80% -> vault (depositors)
  |                                |              10% -> treasury
  |                                |                            |
  | <-- tx confirmed ------------ |                            |
```

## Predicted Journal

The 209-byte KernelJournalV1 can be constructed without running the zkVM because every field is deterministic given the input and output:

```
Offset  Size  Field                Source
------  ----  -------------------  -----------------------------------
  0       4   protocol_version     Constant (1)
  4       4   kernel_version       Constant (1)
  8      32   agent_id             KernelInputV1.agent_id
 40      32   agent_code_hash      KernelInputV1.agent_code_hash
 72      32   constraint_set_hash  KernelInputV1.constraint_set_hash
104      32   input_root           KernelInputV1.input_root
136       8   execution_nonce      KernelInputV1.execution_nonce
144      32   input_commitment     SHA-256(canonical_encode(input))
176      32   action_commitment    SHA-256(canonical_encode(agent_output))
208       1   execution_status     0x01 (Success)
------  ----
        209 bytes total
```

The predicted journal is byte-identical to what the zkVM produces. This is what makes optimistic execution safe: if the predicted journal does not match the proof, `submitProof()` will fail (the seal won't verify against the wrong `journalHash`), and the bond gets slashed.

## Security Properties

1. **Bond makes fraud unprofitable.** The operator loses their bond if they cannot prove the execution was correct.

2. **Action commitment binding.** The contract verifies `sha256(agentOutputBytes) == journal.actionCommitment` before executing. Actions cannot be substituted after submission.

3. **Journal hash binding.** `submitProof()` verifies the proof against `sha256(journal)` stored at submission time. The operator cannot swap the journal after execution.

4. **Nonce ordering.** Optimistic execution advances `lastExecutionNonce` immediately. Replay and reordering are prevented by the same monotonic nonce check as synchronous execution.

5. **Owner-only execution.** Only the vault owner can call `executeOptimistic()`, preventing external MEV attacks during the challenge window.

6. **Proof submission during pause.** `submitProof()` is intentionally NOT gated by `whenNotPaused` to prevent admin pause from causing undeserved bond loss.

7. **Permissionless finalization.** Anyone can call `submitProof()` (with a valid seal) or `slashExpired()`. This prevents operator censorship and incentivizes third-party monitoring.

## Backward Compatibility

- `execute()` and `executeWithOracle()` remain functional (synchronous path)
- Mixed synchronous and optimistic executions are supported (shared nonce counter)
- Optimistic mode is opt-in (`optimisticEnabled` defaults to false)
- Existing `KernelVault` deployments are unaffected
- `VaultFactory.deployVault()` still deploys standard `KernelVault` instances

## Configuration Recommendations

| Parameter | Recommended | Notes |
|---|---|---|
| `challengeWindow` | 1800-3600s | 3-6x expected proving time (~10 min) |
| `minBond` | Application-specific | Should exceed maximum single-execution loss |
| `maxPending` | 3 | Balance throughput vs. capital lockup |

## Oracle & Relayer Architecture

### Overview

The optimistic execution system relies on two oracle roles and one relayer service:

```
                    Ethereum L1                          HyperEVM (Chain 999)
                    ----------                           -------------------

Operator -----> WSTONBondManager                    OptimisticKernelVault
                lockBondDirect()                    executeOptimistic()
                     |                                   |
                     v                                   v
              Bond locked on L1                 OracleVerifier checks:
                     |                            1. Bond attestation (Role B)
                     |                            2. Price feed sig  (Role A, optional)
                     |                                   |
                     |                                   v
                     |                            Actions execute immediately
                     |                                   |
                     |                            +------+------+
                     |                            |             |
                     |                       submitProof()  slashExpired()
                     |                            |             |
                     |                            v             v
                     |                     ProofSubmitted  ExecutionSlashed
                     |                       (event)         (event)
                     |                            |             |
                     +<--- Trusted Relayer -------+-------------+
                     |      monitors events
                     v
              releaseBondByRelayer()    OR    slashBondByRelayer()
              (bond returned)                (bond -> treasury)
```

### Oracle Roles

**Role A — Price Feed Oracle** (medium-trust, high-frequency)

Signs: `keccak256(feedHash || timestamp || chainId || vaultAddress)` via EIP-191.
Purpose: Attest that the agent's input data (market prices) was fresh at execution time.
Bypass: Optional — operator can pass empty `oracleSignature` to skip. This is by design: synchronous proven executions don't need oracle attestation since the proof itself validates input correctness.

| Property | Value |
|---|---|
| Call frequency | Every execution cycle (~10 min) |
| Trust level | Medium — can only attest stale data, not fabricate actions |
| Blast radius (compromised) | Agent executes with stale prices, bounded by bond |
| Liveness requirement | Non-blocking (execution proceeds without it) |
| Recommended key | Hot wallet with rate limiting |

**Role B — Bond Attestation Oracle** (high-trust, low-frequency)

Signs: `keccak256("BOND_LOCK_V1" || operator || vault || nonce || amount || chainId)` via EIP-191.
Purpose: Attest that the operator locked a WSTON bond on Ethereum L1 before executing optimistically on HyperEVM.

| Property | Value |
|---|---|
| Call frequency | Per optimistic execution (~1-10 per hour) |
| Trust level | **High** — a false attestation enables unbonded execution |
| Blast radius (compromised) | Operator can drain vault without bond collateral |
| Liveness requirement | Blocking (no optimistic execution without attestation) |
| Recommended key | HSM or AWS KMS with audit logging |

**Recommendation:** Use separate keys for Role A and Role B. A compromised price feed key has bounded damage (stale prices, operator still bonded). A compromised bond attestation key enables unbonded fraud (catastrophic).

### Key Management

| Component | Key Type | Rotation | Storage |
|---|---|---|---|
| Price Feed Oracle (Role A) | ECDSA secp256k1 | Monthly or on suspicion | Hot wallet with firewall |
| Bond Attestation Oracle (Role B) | ECDSA secp256k1 | Quarterly or on suspicion | HSM / AWS KMS |
| Trusted Relayer | ECDSA secp256k1 | Quarterly | Dedicated server, not shared |

**Key Rotation Procedure:**
1. Generate new key pair
2. Call `vault.setOracleSigner(newSigner, maxOracleAge)` on all vaults
3. Wait for all in-flight executions to complete (check `pendingCount() == 0`)
4. Decommission old key
5. For relayer: call `bondManager.setTrustedRelayer(newRelayer)` on L1

### Trusted Relayer

The relayer bridges events from HyperEVM to Ethereum L1:

- **Monitors:** `ProofSubmitted(nonce, prover)` and `ExecutionSlashed(nonce, slasher, amount)` events on OptimisticKernelVault
- **Actions:** Calls `releaseBondByRelayer()` or `slashBondByRelayer()` on WSTONBondManager (L1)

**Operational Requirements:**
- Idempotent relay: track processed events to prevent duplicate calls
- Historical replay: on restart, replay all unprocessed events from last checkpoint
- Confirmation depth: wait 10+ blocks on HyperEVM before relaying (reorg safety)
- Health monitoring: alert if event-to-relay latency exceeds 1 hour
- Fallback: if relayer is down for >24 hours, operators can wait for BOND_EXPIRY (30 days) and call `reclaimExpiredBond()` on L1

**Should Relayer and Oracle be the same service?**
No. The oracle signs attestations (stateless, can be load-balanced). The relayer monitors events and executes transactions (stateful, needs nonce management). Separate services with separate keys reduces blast radius.

### Failure Mode Analysis

| Failure | Impact | Recovery |
|---|---|---|
| Price oracle down | Executions proceed without oracle check (optional) | No action needed |
| Bond oracle down | Optimistic executions blocked | Fall back to synchronous `execute()` |
| Relayer down (<30 days) | Bonds stuck on L1, no impact on HyperEVM vault | Fix relayer, replay missed events |
| Relayer down (>30 days) | Operators reclaim via `reclaimExpiredBond()` | No action needed |
| Relayer key compromised | Can release/slash bonds incorrectly | Rotate key via `setTrustedRelayer()` |
| Bond oracle key compromised | Unbonded optimistic execution possible | Disable optimistic mode, rotate key |
| WSTON token paused | Bond lock/release/slash all blocked | Wait for WSTON unpause, or reclaim after expiry |

### Configuration Matrix

| Parameter | Recommended | Notes |
|---|---|---|
| `maxOracleAge` | 900s (15 min) | 1.5x proving time; increase for high-latency networks |
| `challengeWindow` | 3600s (1 hour) | 6x proving time; must exceed `maxOracleAge` |
| `BOND_EXPIRY` | 30 days (constant) | Safety valve; long enough for relayer recovery |
| `minBond` | Application-specific | Must exceed max single-execution loss |
| Relayer confirmation depth | 10 blocks | HyperEVM finality |
| Relayer health alert | >1 hour latency | Event-to-relay lag |

### Bond Safety Mechanisms

The WSTONBondManager includes the following safety valves to prevent permanent fund lockup:

1. **`reclaimExpiredBond()`** — Operator reclaims their own bond after 30 days if not released/slashed. Protects against: revoked vaults, lost relayer keys, relay failures.
2. **`rescueTokens()`** — Owner rescues accidentally sent tokens. For WSTON, only excess above `totalLockedGlobal` can be rescued.
3. **Zero-address guards** — `setTrustedRelayer()` requires non-zero address. `lockBondDirect()` requires relayer to be set.
4. **`totalLockedGlobal`** — Tracks total bonded WSTON globally, preventing rescue of bonded funds.

## File Index

| File | Role |
|---|---|
| `OptimisticKernelVault.sol` | Core vault with optimistic execution |
| `WSTONBondManager.sol` | WSTON ERC20 bond lifecycle management |
| `interfaces/IBondManager.sol` | Modular bond manager interface |
| `interfaces/IOptimisticKernelVault.sol` | Vault interface (structs, events, errors) |
| `KernelExecutionVerifier.sol` | Added `verify()` for deferred proof check |
| `VaultFactory.sol` | Added `deployOptimisticVault()` |
| `VaultCreationCodeStore.sol` | Added `OptimisticVaultCreationCodeStore` |
| `libraries/OracleVerifier.sol` | ECDSA signature verification for oracle + bond attestation |
