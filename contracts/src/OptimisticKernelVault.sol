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

    uint256 public constant MIN_CHALLENGE_WINDOW = 15 minutes;
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
        uint256 _bondChainId
    ) KernelVault(_asset, _verifier, _agentId, _trustedImageId, _owner) {
        challengeWindow = DEFAULT_CHALLENGE_WINDOW;
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
        bytes calldata bondAttestation
    ) external nonReentrant whenNotPaused {
        if (msg.sender != owner) revert NotOwner();
        if (!optimisticEnabled) revert OptimisticNotEnabled();
        if (_pendingCount >= maxPending) {
            revert TooManyPending(_pendingCount, maxPending);
        }

        // 1. Parse journal (no proof verification — optimistic)
        IKernelExecutionVerifier.ParsedJournal memory parsed = verifier.parseJournal(journal);

        // 2. Validate agentId, nonce, oracle sig, action commitment (shared with KernelVault)
        uint64 providedNonce =
            _validateParsedJournal(parsed, agentOutputBytes, oracleSignature, oracleTimestamp);

        // 3. Verify oracle attestation of L1 bond lock
        if (oracleSigner == address(0)) revert OracleSignerNotSet();
        OracleVerifier.requireValidBondAttestation(
            bondAttestation,
            oracleSigner,
            msg.sender,
            address(this),
            providedNonce,
            bondAmount,
            bondChainId
        );
        if (bondAmount < minBond) {
            revert InsufficientBond(bondAmount, minBond);
        }

        // 4. Store pending execution
        uint256 deadline = block.timestamp + challengeWindow;
        pendingExecutions[providedNonce] = PendingExecution({
            journalHash: sha256(journal),
            actionCommitment: parsed.actionCommitment,
            bondAmount: bondAmount,
            deadline: deadline,
            status: STATUS_PENDING
        });
        _pendingCount++;

        // 5. Execute actions (shared with KernelVault)
        _executeActions(agentOutputBytes, parsed.agentId, providedNonce, parsed.actionCommitment);

        emit OptimisticExecutionSubmitted(
            providedNonce, pendingExecutions[providedNonce].journalHash, bondAmount, deadline
        );
    }

    // ============ Proof Submission ============

    /// @inheritdoc IOptimisticKernelVault
    function submitProof(uint64 executionNonce, bytes calldata seal) external nonReentrant {
        PendingExecution storage pending = pendingExecutions[executionNonce];
        if (pending.status != STATUS_PENDING) {
            revert ExecutionNotPending(executionNonce, pending.status);
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
        challengeWindow = window;
        _emitConfig();
    }

    /// @inheritdoc IOptimisticKernelVault
    function setMinBond(uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        minBond = amount;
        _emitConfig();
    }

    /// @inheritdoc IOptimisticKernelVault
    function setMaxPending(uint256 max) external {
        if (msg.sender != owner) revert NotOwner();
        if (max > MAX_MAX_PENDING) {
            revert InvalidMaxPending(max, MAX_MAX_PENDING);
        }
        maxPending = max;
        _emitConfig();
    }

    /// @inheritdoc IOptimisticKernelVault
    function setOptimisticEnabled(bool enabled) external {
        if (msg.sender != owner) revert NotOwner();
        if (enabled && oracleSigner == address(0)) {
            revert OracleSignerNotSet();
        }
        optimisticEnabled = enabled;
        _emitConfig();
    }

    /// @inheritdoc IOptimisticKernelVault
    function setBondChainId(uint256 _bondChainId) external {
        if (msg.sender != owner) revert NotOwner();
        bondChainId = _bondChainId;
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
