// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { KernelVault } from "./KernelVault.sol";
import { IOptimisticKernelVault } from "./interfaces/IOptimisticKernelVault.sol";
import { IKernelExecutionVerifier } from "./interfaces/IKernelExecutionVerifier.sol";
import { OracleVerifier } from "./libraries/OracleVerifier.sol";

/// @title OptimisticKernelVault
/// @notice Extends KernelVault with optimistic execution using cross-chain oracle-attested bonds.
/// @dev Bonds are locked on L1 (Ethereum) where WSTON exists. The oracle signer attests the bond
///      lock, and this vault verifies the attestation before executing actions. Proof submission
///      and slashing emit events that the oracle relays back to L1 to release/slash bonds.
contract OptimisticKernelVault is KernelVault, IOptimisticKernelVault {
    // ============ Constants ============

    // M-24 fix: raise minimum from 15 minutes to 30 minutes to give legitimate
    // operators enough margin after RISC Zero proof generation (~10-12 min).
    uint256 public constant MIN_CHALLENGE_WINDOW = 30 minutes;
    uint256 public constant MAX_CHALLENGE_WINDOW = 24 hours;
    uint256 public constant DEFAULT_CHALLENGE_WINDOW = 1 hours;
    uint256 public constant DEFAULT_MAX_PENDING = 3;
    uint256 public constant MAX_MAX_PENDING = 10;

    uint8 internal constant STATUS_EMPTY = 0;
    uint8 internal constant STATUS_PENDING = 1;
    uint8 internal constant STATUS_FINALIZED = 2;
    uint8 internal constant STATUS_SLASHED = 3;

    // ============ Optimistic State ============

    bool public optimisticEnabled;
    uint256 public challengeWindow;
    uint256 public minBond;
    uint256 public maxPending;
    uint256 public bondChainId;
    mapping(uint64 => PendingExecution) public pendingExecutions;
    uint256 internal _pendingCount;

    // ============ Constructor ============

    constructor(
        address _asset,
        address _verifier,
        bytes32 _agentId,
        bytes32 _trustedImageId,
        address _owner,
        uint256 _bondChainId,
        uint256 _challengeWindow
    ) KernelVault(_asset, _verifier, _agentId, _trustedImageId, _owner) {
        // M-17: honour the caller-specified challenge window. Fall back to the
        // default only if zero is passed so the factory can still deploy with
        // "use default" semantics.
        if (_challengeWindow == 0) {
            challengeWindow = DEFAULT_CHALLENGE_WINDOW;
        } else {
            if (
                _challengeWindow < MIN_CHALLENGE_WINDOW
                    || _challengeWindow > MAX_CHALLENGE_WINDOW
            ) {
                revert InvalidChallengeWindow(
                    _challengeWindow, MIN_CHALLENGE_WINDOW, MAX_CHALLENGE_WINDOW
                );
            }
            challengeWindow = _challengeWindow;
        }
        maxPending = DEFAULT_MAX_PENDING;
        bondChainId = _bondChainId;
    }

    // ============ Optimistic Execution ============

    /// @inheritdoc IOptimisticKernelVault
    function executeOptimistic(
        bytes calldata journal,
        bytes calldata agentOutputBytes,
        bytes calldata oracleSignature,
        uint64 oracleTimestamp,
        uint256 bondAmount,
        bytes calldata bondAttestation,
        uint64 bondAttestationTimestamp
    ) external nonReentrant whenNotPaused {
        if (msg.sender != owner) revert NotOwner();
        if (!optimisticEnabled) revert OptimisticNotEnabled();
        if (_pendingCount >= maxPending) {
            revert TooManyPending(_pendingCount, maxPending);
        }

        // 1. Parse + validate journal
        IKernelExecutionVerifier.ParsedJournal memory parsed = verifier.parseJournal(journal);
        uint64 providedNonce =
            _validateParsedJournal(parsed, agentOutputBytes, oracleSignature, oracleTimestamp);

        // 2. Verify oracle signature bound to action commitment (M-09) and the
        //    L1 bond attestation with timestamp binding (M-10). Extracted to a
        //    helper to keep this function under the stack-depth limit.
        _verifyOptimisticOracleAndBond(
            OptimisticVerifyArgs({
                inputRoot: parsed.inputRoot,
                actionCommitment: parsed.actionCommitment,
                providedNonce: providedNonce,
                oracleSignature: oracleSignature,
                oracleTimestamp: oracleTimestamp,
                bondAmount: bondAmount,
                bondAttestation: bondAttestation,
                bondAttestationTimestamp: bondAttestationTimestamp
            })
        );

        // 3. Store pending execution (stack-depth: hash computed outside the literal)
        bytes32 journalHash = sha256(journal);
        uint256 deadline = block.timestamp + challengeWindow;
        PendingExecution storage pe = pendingExecutions[providedNonce];
        pe.journalHash = journalHash;
        pe.actionCommitment = parsed.actionCommitment;
        pe.bondAmount = bondAmount;
        pe.deadline = deadline;
        pe.status = STATUS_PENDING;
        _pendingCount++;

        // 4. Execute actions
        _executeActions(agentOutputBytes, parsed.agentId, providedNonce, parsed.actionCommitment);

        emit OptimisticExecutionSubmitted(providedNonce, journalHash, bondAmount, deadline);
    }

    /// @dev Struct used by `_verifyOptimisticOracleAndBond` to keep argument count
    ///      under the Solc stack-depth limit.
    struct OptimisticVerifyArgs {
        bytes32 inputRoot;
        bytes32 actionCommitment;
        uint64 providedNonce;
        bytes oracleSignature;
        uint64 oracleTimestamp;
        uint256 bondAmount;
        bytes bondAttestation;
        uint64 bondAttestationTimestamp;
    }

    // ─────────────────────────────────────────────────────────────────────
    // [C-01 FIX] Zero-bond optimistic execution blocked at verification time
    // [C-02 FIX] Bond attestation verified against dedicated `bondSigner`
    // ─────────────────────────────────────────────────────────────────────
    // C-01 VULNERABILITY:
    //   Before this fix, `minBond` defaulted to zero and was not checked
    //   when enabling optimistic mode. The downstream guard
    //       if (a.bondAmount < minBond) revert InsufficientBond(...)
    //   evaluated `0 < 0 = false` — so a forged/empty bond attestation
    //   passed unconditionally. Any attacker able to forge a bond
    //   attestation (see C-02) could submit `bondAmount = 0` and drain
    //   the full TVL with no slash target on L1.
    //
    //   This was the DEFAULT state of every newly deployed optimistic
    //   vault that enabled optimistic mode before calling setMinBond.
    //
    // C-02 VULNERABILITY:
    //   Before this fix, the same `oracleSigner` key was used for BOTH
    //   the price oracle attestation (Role A, SEMI_TRUSTED) AND the
    //   bond attestation (Role B, FULLY_TRUSTED). A single key
    //   compromise escalated from price manipulation to protocol-wide
    //   unbonded-drain authority across every OptimisticKernelVault
    //   sharing that key.
    //
    // FIX SURFACE:
    //   This function is the PRIMARY verification site for both
    //   vulnerabilities. It enforces, in order:
    //
    //     1. Role A signature verification (price oracle, optional).
    //
    //     2. [C-02] `bondSigner != address(0)` — no fallback to
    //        oracleSigner. Legacy deployments must explicitly call
    //        `setBondSigner` before re-enabling optimistic mode,
    //        forcing operators to make the role separation explicit.
    //
    //     3. [C-02] `bondSigner != oracleSigner` — belt-and-braces
    //        re-check of the setter-time invariant. Protects against
    //        storage-layout bugs or migration mistakes.
    //
    //     4. [C-01] `minBond > 0` — explicit rejection of the
    //        zero-bond configuration. The setter already prevents new
    //        vaults from entering this state, but this guard is the
    //        fail-safe for any legacy deployment that was enabled
    //        before the fix.
    //
    //     5. Bond attestation signature verification — using
    //        `bondSigner` (Role B), not `oracleSigner`.
    //
    //     6. Bond amount floor check — `a.bondAmount < minBond` now
    //        has semantic meaning because minBond > 0 is enforced above.
    //
    // Nothing about this ordering is accidental: Role A is verified
    // first because it's optional; Role B is verified second because
    // it's mandatory for optimistic mode. The minBond == 0 check must
    // come BEFORE the bond attestation verification so that a forged
    // zero-bond attestation on a legacy vault is rejected even if the
    // signature happens to be valid.
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Oracle signature and bond attestation verification (M-09, M-10).
    /// @dev See block comment above for C-01 and C-02 fix rationale.
    function _verifyOptimisticOracleAndBond(OptimisticVerifyArgs memory a) internal view {
        // ──── M-09: bound oracle signature (Role A — price attestation) ────
        // Optional: only checked when an oracle signer is configured AND
        // a non-empty signature was supplied. See C-02 for the distinction
        // between Role A (this check) and Role B (bond attestation below).
        if (oracleSigner != address(0) && a.oracleSignature.length > 0) {
            OracleVerifier.requireValidOracleSignatureBound(
                a.inputRoot,
                a.actionCommitment,
                a.oracleSignature,
                oracleSigner,
                a.oracleTimestamp,
                block.chainid,
                address(this),
                maxOracleAge
            );
        }

        // ──── [C-02] Bond signer must be set AND distinct from oracle ────
        // These two guards are the runtime enforcement of the role
        // separation invariant. They are REDUNDANT with the setter-time
        // checks (setOptimisticEnabled / setBondSigner / setOracleSigner)
        // but are kept here as defense-in-depth against any storage
        // corruption, upgrade-path mistake, or newly-introduced setter
        // that might bypass the invariant.
        if (bondSigner == address(0)) revert BondSignerNotSet();
        if (bondSigner == oracleSigner) revert BondSignerMustDiffer();

        // ──── [C-01] Zero-minimum-bond fail-safe ────
        // Even if setOptimisticEnabled was called on a legacy deployment
        // with minBond == 0, reject the execution here. Without this
        // check, the later `bondAmount < minBond` comparison evaluates
        // `0 < 0 = false` and a forged zero-bond attestation would pass.
        if (minBond == 0) revert InvalidMinBond();

        // ──── M-10 / [C-02]: bond attestation verified with bondSigner ────
        // The second parameter is `bondSigner`, NOT `oracleSigner`. This
        // is the core of the C-02 fix — a compromise of the price oracle
        // key cannot forge a bond attestation because this site reads
        // from a different storage slot.
        OracleVerifier.requireValidBondAttestation(
            a.bondAttestation,
            bondSigner,
            msg.sender,
            address(this),
            a.providedNonce,
            a.bondAmount,
            bondChainId,
            a.bondAttestationTimestamp,
            maxOracleAge
        );

        // ──── Bond amount floor ────
        // Now that minBond > 0 is guaranteed above, this strict-less-than
        // comparison has semantic meaning and cannot be bypassed by a
        // zero-bond attestation.
        if (a.bondAmount < minBond) {
            revert InsufficientBond(a.bondAmount, minBond);
        }
    }

    // ============ Proof Submission ============

    /// @inheritdoc IOptimisticKernelVault
    function submitProof(uint64 executionNonce, bytes calldata seal) external nonReentrant {
        PendingExecution storage pending = pendingExecutions[executionNonce];
        if (pending.status != STATUS_PENDING) {
            revert ExecutionNotPending(executionNonce, pending.status);
        }
        // M-11 fix: proof must be submitted within the challenge window. Otherwise
        // operators could race slashExpired by submitting late and escape the
        // bond's economic guarantee.
        if (block.timestamp > pending.deadline) {
            revert ProofTooLate(executionNonce, pending.deadline, block.timestamp);
        }

        try verifier.verify(seal, trustedImageId, pending.journalHash) { }
        catch {
            revert ProofVerificationFailed();
        }

        pending.status = STATUS_FINALIZED;
        _pendingCount--;

        emit ProofSubmitted(executionNonce, msg.sender);
    }

    // ============ Slashing ============

    /// @inheritdoc IOptimisticKernelVault
    function slashExpired(uint64 executionNonce) external nonReentrant {
        PendingExecution storage pending = pendingExecutions[executionNonce];
        if (pending.status != STATUS_PENDING) {
            revert ExecutionNotPending(executionNonce, pending.status);
        }
        if (block.timestamp < pending.deadline) {
            revert DeadlineNotReached(executionNonce, pending.deadline, block.timestamp);
        }

        uint256 bondAmount = pending.bondAmount;
        pending.status = STATUS_SLASHED;
        _pendingCount--;

        emit ExecutionSlashed(executionNonce, msg.sender, bondAmount);
    }

    /// @inheritdoc IOptimisticKernelVault
    function selfSlash(uint64 executionNonce) external nonReentrant {
        if (msg.sender != owner) revert NotOwner();

        PendingExecution storage pending = pendingExecutions[executionNonce];
        if (pending.status != STATUS_PENDING) {
            revert ExecutionNotPending(executionNonce, pending.status);
        }

        uint256 bondAmount = pending.bondAmount;
        pending.status = STATUS_SLASHED;
        _pendingCount--;

        emit ExecutionSlashed(executionNonce, address(0), bondAmount);
    }

    // ============ Configuration ============

    /// @inheritdoc IOptimisticKernelVault
    function setChallengeWindow(uint256 window) external {
        if (msg.sender != owner) revert NotOwner();
        if (window < MIN_CHALLENGE_WINDOW || window > MAX_CHALLENGE_WINDOW) {
            revert InvalidChallengeWindow(window, MIN_CHALLENGE_WINDOW, MAX_CHALLENGE_WINDOW);
        }
        // L-05: do not shorten the challenge window for ALREADY-PENDING executions.
        // We can't cheaply iterate all pendings, but we can require that no
        // pending executions exist when shortening. Lengthening is always safe.
        if (window < challengeWindow && _pendingCount > 0) {
            revert TooManyPending(_pendingCount, 0);
        }
        challengeWindow = window;
        _emitConfig();
    }

    /// @inheritdoc IOptimisticKernelVault
    function setMinBond(uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        // M-08: setMinBond(0) neutralizes optimistic security; require a non-zero
        // vault-level floor. The WSTONBondManager also enforces its own global
        // floor, so the effective minimum is max(vault.minBond, manager.minBondFloor).
        if (amount == 0) revert InvalidMinBond();
        minBond = amount;
        _emitConfig();
    }

    /// @inheritdoc IOptimisticKernelVault
    function setMaxPending(uint256 max) external {
        if (msg.sender != owner) revert NotOwner();
        // L-06: explicitly reject zero to prevent silent disabling.
        if (max == 0) revert InvalidMaxPendingZero();
        if (max > MAX_MAX_PENDING) {
            revert InvalidMaxPending(max, MAX_MAX_PENDING);
        }
        // L-43 fix: reject reductions below the current pending count,
        // otherwise executeOptimistic becomes permanently locked until all
        // pending slots drain (potentially never if any are contested).
        if (max < _pendingCount) {
            revert InvalidMaxPending(max, _pendingCount);
        }
        maxPending = max;
        _emitConfig();
    }

    // ─────────────────────────────────────────────────────────────────────
    // [C-01 FIX] Preconditions for enabling optimistic execution
    // [C-02 FIX] Bond signer role separation enforced at enable time
    // ─────────────────────────────────────────────────────────────────────
    // This setter is the PRIMARY GATE — it prevents new deployments from
    // ever entering a vulnerable state. The runtime fail-safes in
    // `_verifyOptimisticOracleAndBond` cover legacy deployments that may
    // have been enabled before these fixes.
    //
    // Six preconditions are enforced when enabling (in order):
    //   1. Only the vault owner may enable.
    //   2. [M-25] `oracleSigner` must be set — Role A price verification.
    //   3. [M-25] `bondChainId` must be set — bond attestation binding.
    //   4. [C-01] `minBond > 0` — prevents the zero-bond drain path.
    //   5. [C-02] `bondSigner` must be set — Role B bond verification.
    //   6. [C-02] `bondSigner` must differ from `oracleSigner` — role
    //      separation invariant.
    //
    // DISABLING (enabled == false) has NO preconditions — the owner can
    // always stop new optimistic executions. Pending executions continue
    // through their normal challenge window.
    // ─────────────────────────────────────────────────────────────────────

    /// @inheritdoc IOptimisticKernelVault
    function setOptimisticEnabled(bool enabled) external {
        if (msg.sender != owner) revert NotOwner();
        if (enabled) {
            // [M-25] Both oracleSigner (used by Role A / price verification)
            // AND bondChainId (binding for the L1 bond attestation) must
            // be configured before optimistic mode can be enabled.
            if (oracleSigner == address(0)) revert OracleSignerNotSet();
            if (bondChainId == 0) revert BondManagerNotSet();

            // [C-01] Reject enablement with `minBond == 0`. The downstream
            // `bondAmount < minBond` comparison evaluates `0 < 0 = false`,
            // so a forged zero-bond attestation would bypass the floor and
            // allow a zero-stake execution with no slash target. This is
            // the deployment-order vulnerability closed by the C-01 fix.
            if (minBond == 0) revert InvalidMinBond();

            // [C-02] The bond attestation signer MUST be set AND MUST be
            // distinct from the oracle (price) signer. Without this
            // separation, a single-key compromise escalates from
            // semi-trusted (price manipulation) to fully-trusted
            // (protocol-wide unbonded drain) authority. The enforcement
            // is ALSO re-checked at every verification in
            // `_verifyOptimisticOracleAndBond` as defense in depth.
            if (bondSigner == address(0)) revert BondSignerNotSet();
            if (bondSigner == oracleSigner) revert BondSignerMustDiffer();
        }
        optimisticEnabled = enabled;
        _emitConfig();
    }

    /// @inheritdoc IOptimisticKernelVault
    /// @dev L-11 fix: forbid rotating bondChainId while pending optimistic
    ///      executions exist. Pending oracle attestations are already bound
    ///      to the previous `bondChainId`; rotating it would invalidate the
    ///      attestation and break slash finalization for in-flight executions.
    function setBondChainId(uint256 _bondChainId) external {
        if (msg.sender != owner) revert NotOwner();
        // M-10: reject zero chain id. Further validation (known L1) is a policy
        // concern left to the owner.
        if (_bondChainId == 0) revert InvalidBondChainId();
        if (_pendingCount > 0) revert TooManyPending(_pendingCount, 0);
        bondChainId = _bondChainId;
        emit BondChainIdUpdated(_bondChainId);
    }

    function _emitConfig() internal {
        emit OptimisticConfigUpdated(challengeWindow, minBond, maxPending, optimisticEnabled);
    }

    // ─────────────────────────────────────────────────────────────────────
    // [H-01 FIX] Block settlement while optimistic executions are pending
    // ─────────────────────────────────────────────────────────────────────
    // VULNERABILITY:
    //   Before this fix, the vault owner could exploit a settle-race:
    //     1. Call executeOptimistic() — mints management/performance fee
    //        shares from the post-action PPS, BEFORE any challenge window.
    //     2. Call settle() — unconditionally clears
    //        snapshotTotalAssets/snapshotTotalShares/strategyActive/
    //        strategyActivatedAt, destroying the slash calculation basis
    //        for any still-pending execution.
    //     3. After challenge window passes, challengers who call
    //        submitProof() find the slash basis is 0 → no actual slash
    //        occurs, and the owner retains the fee shares minted in (1).
    //   The audit PoC (Test_CH02_SettleRaceWithFees) minted 1,417,800,000,000
    //   fee shares post-settle while snapshotTotalAssets was confirmed 0.
    //
    // FIX:
    //   Override `_settle` to reject the call while `_pendingCount > 0`.
    //   This blocks BOTH entry points — `settle()` (owner) and
    //   `emergencySettle()` (permissionless after 7 days) — because both
    //   route through `_settle` in the parent contract.
    //
    // LIVENESS:
    //   - Pending executions have a bounded challenge window (max 24 hours).
    //   - After the per-execution deadline, ANYONE may call `slashExpired`
    //     or `submitProof` to resolve the pending execution. Each resolution
    //     decrements `_pendingCount`.
    //   - Only once every pending execution has been resolved can
    //     `settle()` or `emergencySettle()` proceed.
    //   - The `EMERGENCY_SETTLE_DELAY` (7 days) is much longer than the
    //     maximum challenge window (24 hours), so legitimate stuck
    //     scenarios always have time to drain the pending queue before
    //     emergencySettle becomes callable.
    //
    // INTERACTION WITH OTHER FIXES:
    //   - The `selfSlash` function (owner-triggered voluntary slash)
    //     decrements `_pendingCount` and is available as a release valve
    //     if the owner wants to walk away from a pending execution
    //     without waiting for the challenge window.
    // ─────────────────────────────────────────────────────────────────────

    /// @notice [H-01] Guarded settlement — rejects settlement while
    ///         optimistic executions are still pending challenge.
    /// @dev Overrides the KernelVault implementation to add the pending-
    ///      count guard. Both `settle()` and `emergencySettle()` in
    ///      KernelVault route through `_settle`, so the guard covers both.
    function _settle() internal override {
        if (_pendingCount > 0) {
            revert TooManyPending(_pendingCount, 0);
        }
        super._settle();
    }

    // ============ View Functions ============

    /// @inheritdoc IOptimisticKernelVault
    function getPendingExecution(uint64 nonce) external view returns (PendingExecution memory) {
        return pendingExecutions[nonce];
    }

    /// @inheritdoc IOptimisticKernelVault
    function pendingCount() external view returns (uint256) {
        return _pendingCount;
    }
}
