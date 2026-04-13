# Per-Contract Agent #4: Infrastructure Contracts

**Scope**: VaultFactory, AgentRegistry, VaultCreationCodeStore, KernelExecutionVerifier, KernelOutputParser, OracleVerifier
**Date**: 2026-04-13

## File Coverage Checkpoint

| File | Lines | Opened? | Functions Analyzed |
|------|-------|---------|-------------------|
| VaultFactory.sol | 635 | YES | initialize, deployVault, deployOptimisticVault, computeVaultAddress, computeOptimisticVaultAddress, setVaultCreationCodeStore, setOptimisticVaultCreationCodeStore, scheduleVaultCreationCodeStore, activateVaultCreationCodeStore, registerExternalVault, _getCreationBytecode, _getOptimisticCreationBytecode, _authorizeUpgrade |
| AgentRegistry.sol | 449 | YES | register, update, unregister, deprecate, setSuccessor, setFactory, _authorizeUpgrade |
| VaultCreationCodeStore.sol | 33 | YES | VaultCreationCodeStore constructor, OptimisticVaultCreationCodeStore constructor |
| KernelExecutionVerifier.sol | 675 | YES | initialize, verifyAndParseWithImageId, verify, _parseJournal, _readU32LE, _readU64LE, approveVerifier, revokeVerifier, proposeVerifier, activateVerifier, _authorizeUpgrade, setVerificationPaused |
| KernelOutputParser.sol | 284 | YES | parseActions, encodeAction, encodeAgentOutput, _readU32LE, _readBytes32 |
| OracleVerifier.sol | 268 | YES | verifyOracleSignature, requireValidBondAttestation, requireValidOracleSignatureBound, requireValidOracleSignature |

---

## Finding [PC4-1]: VaultFactory Protocol Fee State Never Propagated to Deployed Vaults

**Verdict**: CONFIRMED
**Step Execution**: checkmark 1,2,3 | N/A 4,5
**Rules Applied**: [R4:X(evidence clear), R5:X(single entity), R6:X(no role), R8:X(single-step), R10:checkmark, R11:X(no external tokens), R12:X(no dangerous precondition), R13:checkmark, R14:checkmark, R15:X(no flash-loan), R16:X(no oracle)]
**Severity**: Low
**Location**: VaultFactory.sol:L45-L48, L320-L336, L601-L633; KernelVault.sol:L538-L553

**Description**: VaultFactory stores protocolTreasury (address) and defaultProtocolFeeSplitBps (uint256) and exposes owner-only setters. However, these values are NEVER passed to vaults during deployment. The _getCreationBytecode function encodes only five constructor arguments (asset, _verifier, agentId, imageId, vaultOwner) and KernelVault constructor accepts only those five parameters — there is no pathway for the factory to inject protocol fee configuration at vault creation time. Every deployed vault starts with protocolTreasury = address(0) and protocolFeeSplitBps = 0. The vault owner must call KernelVault.setProtocolTreasury() separately post-deployment, but the factory UI creates a false sense that protocol fees are globally configured.

**Impact**: Protocol fee revenue may be permanently zero across all vaults if vault operators are not aware of the required post-deployment step. The factory-level fee configuration state is dead — it costs storage and emits events but has no effect on deployed vaults. No mechanism enforces protocol fee collection on vaults deployed through the factory.

**Evidence**:
- VaultFactory.sol:L601-L609: _getCreationBytecode encodes only (asset, _verifier, agentId, imageId, vaultOwner) — no protocolTreasury or feeSplitBps
- VaultFactory.sol:L326-L335: setProtocolTreasury/setDefaultProtocolFeeSplitBps write to dead state
- KernelVault.sol:L538-L553: constructor has no protocol fee parameters; treasury starts at address(0)

---

## Finding [PC4-2]: VaultFactory.initialize Missing code.length Validation for vaultCodeStore_

**Verdict**: CONFIRMED
**Step Execution**: checkmark 1,2,3 | N/A 4,5
**Rules Applied**: [R4:X(evidence clear), R5:X(single entity), R6:X(no role), R8:X(single-step), R10:checkmark, R11:X, R12:X, R13:X, R14:X, R15:X, R16:X]
**Severity**: Low
**Location**: VaultFactory.sol:L162-L177, L256-L262

**Description**: VaultFactory.initialize validates vaultCodeStore_ != address(0) but does NOT validate vaultCodeStore_.code.length > 0. Every post-initialization setter for the same field (setVaultCreationCodeStore, scheduleVaultCreationCodeStore) includes require(newStore.code.length > 0, "no code at store"). If the factory is initialized with an EOA or self-destructed contract address as vaultCodeStore_, _getCreationBytecode returns construction bytecode consisting ONLY of ABI-encoded constructor args (empty prefix). The create2 opcode would succeed (non-zero address returned) but produce a non-functional vault contract with garbage runtime code. The deployment-succeeded check (vault == address(0)) would pass, silently registering the broken vault.

**Impact**: Misconfiguration at initialization produces broken vaults that are registered as valid in isDeployedVault mapping. Discovery is immediate on first vault function call, but the factory state cannot be rectified without a full proxy upgrade (since _vaultCreationCodeStore cannot be changed back through the normal setter path).

**Evidence**:
- VaultFactory.sol:L171: require(vaultCodeStore_ != address(0)) but no code.length check
- VaultFactory.sol:L258-L261: setVaultCreationCodeStore has require(newStore.code.length > 0) — inconsistent
- VaultFactory.sol:L275-L276: scheduleVaultCreationCodeStore has require(newStore.code.length > 0) — inconsistent

---

## Finding [PC4-3]: VaultFactory.setVaultCreationCodeStore is Permanently Unreachable Dead Code

**Verdict**: CONFIRMED
**Step Execution**: checkmark 1,2,3 | N/A 4,5
**Rules Applied**: [R4:X(evidence clear), R5:X, R6:X, R8:X, R10:X(no severity), R11:X, R12:X, R13:checkmark, R14:X, R15:X, R16:X]
**Severity**: Informational
**Location**: VaultFactory.sol:L256-L262

**Description**: setVaultCreationCodeStore is gated by require(_vaultCreationCodeStore == address(0), "use schedule/activate"). Since initialize unconditionally sets _vaultCreationCodeStore to a non-zero address (enforced by require(vaultCodeStore_ != address(0))), this guard is ALWAYS false after initialization. The function can never execute. This contrasts with setOptimisticVaultCreationCodeStore which IS reachable because _optimisticVaultCreationCodeStore starts at zero (not set in initialize). The dead code misleads readers into thinking there is an initial-setup path for the regular vault code store.

**Impact**: No security impact. Dead code adds confusion about deployment workflow and should be removed. The schedule/activate path is the correct mechanism for all post-initialization code store updates.

**Evidence**:
- VaultFactory.sol:L171: initialize sets _vaultCreationCodeStore to non-zero
- VaultFactory.sol:L257: require(_vaultCreationCodeStore == address(0)) — always false after initialize
- VaultFactory.sol:L264-L270: setOptimisticVaultCreationCodeStore is reachable because _optimisticVaultCreationCodeStore is not set in initialize

---

## Chain Summary

| Finding ID | Severity | Verdict | Chain Input? | Postcondition Types |
|-----------|----------|---------|-------------|-------------------|
| PC4-1 | Low | CONFIRMED | NO | STATE |
| PC4-2 | Low | CONFIRMED | NO | STATE |
| PC4-3 | Informational | CONFIRMED | NO | N/A |

---

## Additional Analysis Notes (No New Findings)

- KernelOutputParser _readBytes32 assembly: calldataload(add(data.offset, offset)) correctly computes absolute calldata position for bytes calldata slices. Verified correct.
- KernelOutputParser gas: byte-by-byte payload copy loop (up to 64 actions x 16384 bytes) is gas-intensive but only affects vault owners submitting their own proofs; not a security concern.
- KernelExecutionVerifier storage gap: INV-39 (already in exclusion list) confirmed — pausedSince omitted from __gap comment, net footprint 51 vs expected 50 slots.
- OracleVerifier public functions: requireValidBondAttestation/requireValidOracleSignature are public on a deployed library; as pure view functions this has no security consequence.
- BOND_LOCK_V1 in CLAUDE.md vs BOND_LOCK_V2 in contract: V2 correctly adds attestationTs (M-10 fix); CLAUDE.md is outdated documentation only, not a contract bug.
- AgentRegistry swap-and-pop removal: correctly implemented; no index corruption path found.
- VaultFactory CREATE2 consistency: computeVaultAddress and deployVault use consistent owner_ / msg.sender parameter for salt and bytecode; callers must pass owner_ = agentInfo.author to get correct precomputed address — documented behavior.
