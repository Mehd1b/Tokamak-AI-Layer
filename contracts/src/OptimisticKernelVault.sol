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

    /// @notice Oracle signature and bond attestation verification (M-09, M-10).
    function _verifyOptimisticOracleAndBond(OptimisticVerifyArgs memory a) internal view {
        // M-09: bound oracle signature
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

        // M-10: oracle-signed bond attestation with timestamp binding
        if (oracleSigner == address(0)) revert OracleSignerNotSet();
        OracleVerifier.requireValidBondAttestation(
            a.bondAttestation,
            oracleSigner,
            msg.sender,
            address(this),
            a.providedNonce,
            a.bondAmount,
            bondChainId,
            a.bondAttestationTimestamp,
            maxOracleAge
        );
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
        maxPending = max;
        _emitConfig();
    }

    /// @inheritdoc IOptimisticKernelVault
    function setOptimisticEnabled(bool enabled) external {
        if (msg.sender != owner) revert NotOwner();
        if (enabled) {
            // M-25: enabling optimistic requires BOTH an oracle signer (to verify
            // bond attestations) AND a non-zero bond chain id. Previously only
            // oracleSigner was checked while the BondManagerNotSet error was
            // unreachable dead code.
            if (oracleSigner == address(0)) revert OracleSignerNotSet();
            if (bondChainId == 0) revert BondManagerNotSet();
        }
        optimisticEnabled = enabled;
        _emitConfig();
    }

    /// @inheritdoc IOptimisticKernelVault
    function setBondChainId(uint256 _bondChainId) external {
        if (msg.sender != owner) revert NotOwner();
        // M-10: reject zero chain id. Further validation (known L1) is a policy
        // concern left to the owner.
        if (_bondChainId == 0) revert InvalidBondChainId();
        bondChainId = _bondChainId;
        emit BondChainIdUpdated(_bondChainId);
    }

    function _emitConfig() internal {
        emit OptimisticConfigUpdated(challengeWindow, minBond, maxPending, optimisticEnabled);
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
