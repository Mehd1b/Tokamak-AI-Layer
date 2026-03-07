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
