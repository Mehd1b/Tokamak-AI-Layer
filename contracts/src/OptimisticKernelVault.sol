// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { KernelVault } from "./KernelVault.sol";
import { IOptimisticKernelVault } from "./interfaces/IOptimisticKernelVault.sol";
import { IBondManager } from "./interfaces/IBondManager.sol";
import { IKernelExecutionVerifier } from "./interfaces/IKernelExecutionVerifier.sol";
import { KernelOutputParser } from "./KernelOutputParser.sol";
import { OracleVerifier } from "./libraries/OracleVerifier.sol";

/// @title OptimisticKernelVault
/// @notice Extends KernelVault with optimistic execution: actions execute immediately with a bond,
///         and proofs can be submitted later within a challenge window.
/// @dev Inherits all KernelVault functionality (deposits, withdrawals, proven execution, strategy
///      management, pause, emergency flows). Adds optimistic execution path where:
///      1. Operator posts bond + journal + actions (no proof required)
///      2. Actions execute immediately
///      3. Operator submits proof within challenge window to reclaim bond
///      4. If proof not submitted in time, anyone can slash the bond
contract OptimisticKernelVault is KernelVault, IOptimisticKernelVault {
    // ============ Constants ============

    /// @notice Minimum allowed challenge window duration
    uint256 public constant MIN_CHALLENGE_WINDOW = 15 minutes;

    /// @notice Maximum allowed challenge window duration
    uint256 public constant MAX_CHALLENGE_WINDOW = 24 hours;

    /// @notice Default challenge window duration
    uint256 public constant DEFAULT_CHALLENGE_WINDOW = 1 hours;

    /// @notice Default maximum concurrent pending executions
    uint256 public constant DEFAULT_MAX_PENDING = 3;

    /// @notice Hard cap on maximum concurrent pending executions
    uint256 public constant MAX_MAX_PENDING = 10;

    /// @notice Pending execution status: empty (never created)
    uint8 internal constant STATUS_EMPTY = 0;

    /// @notice Pending execution status: awaiting proof
    uint8 internal constant STATUS_PENDING = 1;

    /// @notice Pending execution status: proof submitted and verified
    uint8 internal constant STATUS_FINALIZED = 2;

    /// @notice Pending execution status: bond was slashed
    uint8 internal constant STATUS_SLASHED = 3;

    // ============ Optimistic State ============

    /// @notice Whether optimistic execution is enabled
    bool public optimisticEnabled;

    /// @notice Challenge window duration in seconds
    uint256 public challengeWindow;

    /// @notice Minimum bond amount for optimistic execution (vault-level override)
    uint256 public minBond;

    /// @notice Maximum number of concurrent pending executions
    uint256 public maxPending;

    /// @notice Bond manager contract for locking/releasing/slashing bonds
    IBondManager public bondManager;

    /// @notice Pending executions by nonce
    mapping(uint64 => PendingExecution) public pendingExecutions;

    /// @notice Current count of pending (unresolved) executions
    uint256 internal _pendingCount;

    // ============ Constructor ============

    /// @notice Initialize the optimistic vault
    /// @param _asset The ERC20 asset this vault holds
    /// @param _verifier The KernelExecutionVerifier contract address
    /// @param _agentId The agent ID this vault is bound to
    /// @param _trustedImageId The trusted RISC Zero image ID (pinned at deployment)
    /// @param _owner The vault owner (agent author) who can submit executions
    /// @param _bondManager The bond manager contract (can be address(0) if not enabling optimistic yet)
    constructor(
        address _asset,
        address _verifier,
        bytes32 _agentId,
        bytes32 _trustedImageId,
        address _owner,
        address _bondManager
    ) KernelVault(_asset, _verifier, _agentId, _trustedImageId, _owner) {
        challengeWindow = DEFAULT_CHALLENGE_WINDOW;
        maxPending = DEFAULT_MAX_PENDING;
        if (_bondManager != address(0)) {
            bondManager = IBondManager(_bondManager);
        }
    }

    // ============ Optimistic Execution ============

    /// @inheritdoc IOptimisticKernelVault
    /// @dev Operator must approve the BondManager to spend `bondAmount` of WSTON before calling.
    function executeOptimistic(
        bytes calldata journal,
        bytes calldata agentOutputBytes,
        bytes calldata oracleSignature,
        uint64 oracleTimestamp,
        uint256 bondAmount
    ) external nonReentrant whenNotPaused {
        if (msg.sender != owner) revert NotOwner();
        if (!optimisticEnabled) revert OptimisticNotEnabled();
        if (_pendingCount >= maxPending) {
            revert TooManyPending(_pendingCount, maxPending);
        }

        // 1. Parse journal WITHOUT proof verification (pure parsing + validation)
        IKernelExecutionVerifier.ParsedJournal memory parsed =
            verifier.parseJournal(journal);

        // 2. Verify agent ID matches
        if (parsed.agentId != agentId) {
            revert AgentIdMismatch(agentId, parsed.agentId);
        }

        // 3. Verify oracle signature if oracle signer is configured
        if (oracleSigner != address(0)) {
            OracleVerifier.requireValidOracleSignature(
                parsed.inputRoot,
                oracleSignature,
                oracleSigner,
                oracleTimestamp,
                block.chainid,
                address(this),
                maxOracleAge
            );
        }

        // 4. Verify nonce ordering (same logic as _execute in KernelVault)
        uint64 lastNonce = lastExecutionNonce;
        uint64 providedNonce = parsed.executionNonce;

        if (providedNonce <= lastNonce) {
            revert InvalidNonce(lastNonce, providedNonce);
        }

        uint64 gap = providedNonce - lastNonce;
        if (gap > MAX_NONCE_GAP) {
            revert NonceGapTooLarge(lastNonce, providedNonce, MAX_NONCE_GAP);
        }

        if (gap > 1) {
            emit NoncesSkipped(lastNonce + 1, providedNonce - 1, gap - 1);
        }

        // 5. Verify action commitment: sha256(agentOutputBytes) == parsed.actionCommitment
        bytes32 computedCommitment = sha256(agentOutputBytes);
        if (computedCommitment != parsed.actionCommitment) {
            revert ActionCommitmentMismatch(parsed.actionCommitment, computedCommitment);
        }

        // 6. Compute journal hash for later proof verification
        bytes32 journalHash = sha256(journal);

        // 7. Calculate required bond and verify bondAmount
        uint256 requiredBond = bondManager.getMinBond(address(this));
        if (minBond > requiredBond) {
            requiredBond = minBond;
        }
        if (bondAmount < requiredBond) {
            revert InsufficientBond(bondAmount, requiredBond);
        }

        // 8. Lock bond via BondManager (pulls WSTON from operator via transferFrom)
        bondManager.lockBond(msg.sender, address(this), providedNonce, bondAmount);

        // 9. Store pending execution
        uint256 deadline = block.timestamp + challengeWindow;
        pendingExecutions[providedNonce] = PendingExecution({
            journalHash: journalHash,
            actionCommitment: parsed.actionCommitment,
            bondAmount: bondAmount,
            deadline: deadline,
            status: STATUS_PENDING
        });
        _pendingCount++;

        // 10. Advance nonce immediately
        lastExecutionNonce = providedNonce;

        // 11. Parse and execute actions atomically (reuse parent's internal logic)
        KernelOutputParser.Action[] memory actions =
            KernelOutputParser.parseActions(agentOutputBytes);

        for (uint256 i = 0; i < actions.length; i++) {
            _executeAction(i, actions[i]);
        }

        // 12. Emit events
        emit ExecutionApplied(
            parsed.agentId, parsed.executionNonce, parsed.actionCommitment, actions.length
        );
        emit OptimisticExecutionSubmitted(providedNonce, journalHash, bondAmount, deadline);
    }

    // ============ Proof Submission ============

    /// @inheritdoc IOptimisticKernelVault
    /// @dev Intentionally NOT gated by whenNotPaused — proofs must be submittable even while
    ///      the vault is paused to allow operators to reclaim bonds.
    function submitProof(uint64 executionNonce, bytes calldata seal) external nonReentrant {
        PendingExecution storage pending = pendingExecutions[executionNonce];
        if (pending.status != STATUS_PENDING) {
            revert ExecutionNotPending(executionNonce, pending.status);
        }

        // Verify proof using the new verify() function on KernelExecutionVerifier
        // This verifies that seal is a valid RISC Zero proof for the stored journal hash
        try verifier.verify(seal, trustedImageId, pending.journalHash) {
            // Proof verified successfully
        } catch {
            revert ProofVerificationFailed();
        }

        // Mark as finalized
        pending.status = STATUS_FINALIZED;
        _pendingCount--;

        // Release bond back to operator
        bondManager.releaseBond(owner, address(this), executionNonce);

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

        // Slash bond: finder (msg.sender) gets 10%, vault gets 80%, treasury gets 10%
        bondManager.slashBond(owner, address(this), executionNonce, msg.sender);

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

        // Self-slash: address(0) as slasher means no finder fee
        // Bond manager distributes: 90% to vault, 10% to treasury
        bondManager.slashBond(owner, address(this), executionNonce, address(0));

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
        emit OptimisticConfigUpdated(challengeWindow, minBond, maxPending, optimisticEnabled);
    }

    /// @inheritdoc IOptimisticKernelVault
    function setMinBond(uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        minBond = amount;
        emit OptimisticConfigUpdated(challengeWindow, minBond, maxPending, optimisticEnabled);
    }

    /// @inheritdoc IOptimisticKernelVault
    function setMaxPending(uint256 max) external {
        if (msg.sender != owner) revert NotOwner();
        if (max > MAX_MAX_PENDING) {
            revert InvalidMaxPending(max, MAX_MAX_PENDING);
        }
        maxPending = max;
        emit OptimisticConfigUpdated(challengeWindow, minBond, maxPending, optimisticEnabled);
    }

    /// @inheritdoc IOptimisticKernelVault
    function setOptimisticEnabled(bool enabled) external {
        if (msg.sender != owner) revert NotOwner();
        if (enabled && address(bondManager) == address(0)) {
            revert BondManagerNotSet();
        }
        optimisticEnabled = enabled;
        emit OptimisticConfigUpdated(challengeWindow, minBond, maxPending, optimisticEnabled);
    }

    /// @inheritdoc IOptimisticKernelVault
    function setBondManager(IBondManager manager) external {
        if (msg.sender != owner) revert NotOwner();
        bondManager = manager;
    }

    // ============ View Functions ============

    /// @inheritdoc IOptimisticKernelVault
    function getPendingExecution(uint64 nonce)
        external
        view
        returns (PendingExecution memory)
    {
        return pendingExecutions[nonce];
    }

    /// @inheritdoc IOptimisticKernelVault
    function pendingCount() external view returns (uint256) {
        return _pendingCount;
    }
}
