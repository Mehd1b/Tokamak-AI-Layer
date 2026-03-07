// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { KernelVault } from "./KernelVault.sol";
import { IOptimisticKernelVault } from "./interfaces/IOptimisticKernelVault.sol";
import { IKernelExecutionVerifier } from "./interfaces/IKernelExecutionVerifier.sol";
import { KernelOutputParser } from "./KernelOutputParser.sol";
import { OracleVerifier } from "./libraries/OracleVerifier.sol";

/// @title OptimisticKernelVault
/// @notice Extends KernelVault with optimistic execution using cross-chain oracle-attested bonds.
/// @dev Bonds are locked on L1 (Ethereum) where WSTON exists. The oracle signer attests the bond
///      lock, and this vault verifies the attestation before executing actions. Proof submission
///      and slashing emit events that the oracle relays back to L1 to release/slash bonds.
///
///      Flow:
///      1. Operator locks WSTON on L1 BondManager → oracle signs attestation
///      2. Operator calls executeOptimistic() with attestation → actions execute on HyperEVM
///      3. Operator submits proof → emits ProofSubmitted → oracle relays to L1 → bond released
///      4. If proof late → anyone calls slashExpired → emits ExecutionSlashed → oracle slashes on L1
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

    /// @notice Whether optimistic execution is enabled
    bool public optimisticEnabled;

    /// @notice Challenge window duration in seconds
    uint256 public challengeWindow;

    /// @notice Minimum bond amount for optimistic execution
    uint256 public minBond;

    /// @notice Maximum number of concurrent pending executions
    uint256 public maxPending;

    /// @notice The L1 chain ID where bonds are locked (e.g., 1 for Ethereum mainnet)
    uint256 public bondChainId;

    /// @notice Pending executions by nonce
    mapping(uint64 => PendingExecution) public pendingExecutions;

    /// @notice Current count of pending (unresolved) executions
    uint256 internal _pendingCount;

    // ============ Constructor ============

    /// @param _asset The ERC20 asset this vault holds
    /// @param _verifier The KernelExecutionVerifier contract address
    /// @param _agentId The agent ID this vault is bound to
    /// @param _trustedImageId The trusted RISC Zero image ID (pinned at deployment)
    /// @param _owner The vault owner (agent author) who can submit executions
    /// @param _bondChainId The L1 chain ID where bonds are locked (e.g., 1 for Ethereum)
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

        // 1. Parse and validate journal, nonce, oracle, action commitment
        (bytes32 journalHash, bytes32 actionCommitment, bytes32 parsedAgentId, uint64 providedNonce)
            = _validateOptimisticInput(journal, agentOutputBytes, oracleSignature, oracleTimestamp);

        // 2. Verify oracle attestation of L1 bond lock
        _verifyBond(bondAttestation, providedNonce, bondAmount);

        // 3. Store pending execution
        uint256 deadline = block.timestamp + challengeWindow;
        pendingExecutions[providedNonce] = PendingExecution({
            journalHash: journalHash,
            actionCommitment: actionCommitment,
            bondAmount: bondAmount,
            deadline: deadline,
            status: STATUS_PENDING
        });
        _pendingCount++;
        lastExecutionNonce = providedNonce;

        // 4. Parse and execute actions atomically
        KernelOutputParser.Action[] memory actions =
            KernelOutputParser.parseActions(agentOutputBytes);

        for (uint256 i = 0; i < actions.length; i++) {
            _executeAction(i, actions[i]);
        }

        // 5. Emit events
        emit ExecutionApplied(parsedAgentId, providedNonce, actionCommitment, actions.length);
        emit OptimisticExecutionSubmitted(providedNonce, journalHash, bondAmount, deadline);
    }

    /// @notice Verify oracle attestation of bond lock and validate minimum bond
    function _verifyBond(bytes calldata bondAttestation, uint64 nonce, uint256 bondAmount) internal view {
        if (oracleSigner == address(0)) revert OracleSignerNotSet();
        OracleVerifier.requireValidBondAttestation(
            bondAttestation, oracleSigner, msg.sender, address(this), nonce, bondAmount, bondChainId
        );
        if (bondAmount < minBond) {
            revert InsufficientBond(bondAmount, minBond);
        }
    }

    /// @notice Validate journal, nonce, oracle signature, and action commitment
    function _validateOptimisticInput(
        bytes calldata journal,
        bytes calldata agentOutputBytes,
        bytes calldata oracleSignature,
        uint64 oracleTimestamp
    ) internal returns (bytes32 journalHash, bytes32 actionCommitment, bytes32 parsedAgentId, uint64 providedNonce) {
        IKernelExecutionVerifier.ParsedJournal memory parsed = verifier.parseJournal(journal);

        if (parsed.agentId != agentId) {
            revert AgentIdMismatch(agentId, parsed.agentId);
        }

        if (oracleSigner != address(0) && oracleSignature.length > 0) {
            OracleVerifier.requireValidOracleSignature(
                parsed.inputRoot, oracleSignature, oracleSigner,
                oracleTimestamp, block.chainid, address(this), maxOracleAge
            );
        }

        uint64 lastNonce = lastExecutionNonce;
        providedNonce = parsed.executionNonce;

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

        bytes32 computedCommitment = sha256(agentOutputBytes);
        if (computedCommitment != parsed.actionCommitment) {
            revert ActionCommitmentMismatch(parsed.actionCommitment, computedCommitment);
        }

        journalHash = sha256(journal);
        actionCommitment = parsed.actionCommitment;
        parsedAgentId = parsed.agentId;
    }

    // ============ Proof Submission ============

    /// @inheritdoc IOptimisticKernelVault
    /// @dev NOT gated by whenNotPaused — proofs must be submittable while paused.
    ///      Bond release happens on L1 via oracle relay of the ProofSubmitted event.
    function submitProof(uint64 executionNonce, bytes calldata seal) external nonReentrant {
        PendingExecution storage pending = pendingExecutions[executionNonce];
        if (pending.status != STATUS_PENDING) {
            revert ExecutionNotPending(executionNonce, pending.status);
        }

        try verifier.verify(seal, trustedImageId, pending.journalHash) {
            // Proof verified
        } catch {
            revert ProofVerificationFailed();
        }

        pending.status = STATUS_FINALIZED;
        _pendingCount--;

        emit ProofSubmitted(executionNonce, msg.sender);
    }

    // ============ Slashing ============

    /// @inheritdoc IOptimisticKernelVault
    /// @dev Bond slashing happens on L1 via oracle relay of the ExecutionSlashed event.
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
        if (enabled && oracleSigner == address(0)) {
            revert OracleSignerNotSet();
        }
        optimisticEnabled = enabled;
        emit OptimisticConfigUpdated(challengeWindow, minBond, maxPending, optimisticEnabled);
    }

    /// @inheritdoc IOptimisticKernelVault
    function setBondChainId(uint256 _bondChainId) external {
        if (msg.sender != owner) revert NotOwner();
        bondChainId = _bondChainId;
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
