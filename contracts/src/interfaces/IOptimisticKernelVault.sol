// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title IOptimisticKernelVault
/// @notice Interface for the OptimisticKernelVault — extends KernelVault with optimistic execution
/// @dev Operators execute agent actions immediately by providing an oracle attestation that a bond
///      was locked on L1 (where WSTON exists). Proofs are submitted later within a challenge window.
///      Bond release/slash is handled on L1 via oracle relay of HyperEVM events.
interface IOptimisticKernelVault {
    // ============ Structs ============

    /// @notice Pending execution awaiting proof submission
    struct PendingExecution {
        bytes32 journalHash;
        bytes32 actionCommitment;
        uint256 bondAmount;
        uint256 deadline;
        uint8 status; // 0=empty, 1=pending, 2=finalized, 3=slashed
    }

    // ============ Functions ============

    /// @notice Submit an optimistic execution with an oracle-attested bond (owner only)
    /// @dev Operator must first lock WSTON on L1 BondManager, then obtain an oracle attestation.
    /// @param journal The raw journal bytes (209 bytes)
    /// @param agentOutputBytes The agent output bytes containing actions
    /// @param oracleSignature Oracle ECDSA signature for price feed (empty if oracle not configured)
    /// @param oracleTimestamp Oracle data timestamp
    /// @param bondAmount Amount of WSTON locked as bond on L1
    /// @param bondAttestation Oracle attestation of L1 bond lock (65-byte ECDSA signature)
    function executeOptimistic(
        bytes calldata journal,
        bytes calldata agentOutputBytes,
        bytes calldata oracleSignature,
        uint64 oracleTimestamp,
        uint256 bondAmount,
        bytes calldata bondAttestation
    ) external;

    /// @notice Submit a proof for a pending optimistic execution (permissionless)
    /// @dev Emits ProofSubmitted — oracle relays this to L1 BondManager to release the bond.
    /// @param executionNonce The nonce of the pending execution
    /// @param seal The RISC Zero proof seal
    function submitProof(uint64 executionNonce, bytes calldata seal) external;

    /// @notice Slash a pending execution whose challenge window has expired (permissionless)
    /// @dev Emits ExecutionSlashed — oracle relays this to L1 BondManager to slash the bond.
    /// @param executionNonce The nonce of the expired execution
    function slashExpired(uint64 executionNonce) external;

    /// @notice Owner voluntarily slashes their own pending execution
    /// @param executionNonce The nonce of the execution to self-slash
    function selfSlash(uint64 executionNonce) external;

    /// @notice Set the challenge window duration (owner only)
    /// @param window Duration in seconds
    function setChallengeWindow(uint256 window) external;

    /// @notice Set the minimum bond amount (owner only)
    /// @param amount Minimum bond in WSTON units
    function setMinBond(uint256 amount) external;

    /// @notice Set the maximum number of concurrent pending executions (owner only)
    /// @param max Maximum pending count
    function setMaxPending(uint256 max) external;

    /// @notice Enable or disable optimistic execution (owner only)
    /// @dev Requires oracleSigner to be set (needed for bond attestation verification)
    /// @param enabled Whether optimistic execution is enabled
    function setOptimisticEnabled(bool enabled) external;

    /// @notice Set the L1 chain ID where bonds are locked (owner only)
    /// @param bondChainId The chain ID (e.g., 1 for Ethereum mainnet)
    function setBondChainId(uint256 bondChainId) external;

    /// @notice Get a pending execution by nonce
    /// @param nonce The execution nonce
    /// @return The PendingExecution struct
    function getPendingExecution(uint64 nonce)
        external
        view
        returns (PendingExecution memory);

    /// @notice Get the number of currently pending executions
    /// @return The count of pending executions
    function pendingCount() external view returns (uint256);

    // ============ Events ============

    /// @notice Emitted when an optimistic execution is submitted
    event OptimisticExecutionSubmitted(
        uint64 indexed executionNonce,
        bytes32 journalHash,
        uint256 bondAmount,
        uint256 deadline
    );

    /// @notice Emitted when a proof is submitted for a pending execution
    /// @dev Oracle watches this event and calls releaseBondByRelayer on L1 BondManager
    event ProofSubmitted(uint64 indexed executionNonce, address indexed submitter);

    /// @notice Emitted when a pending execution is slashed
    /// @dev Oracle watches this event and calls slashBondByRelayer on L1 BondManager
    event ExecutionSlashed(
        uint64 indexed executionNonce,
        address indexed slasher,
        uint256 bondAmount
    );

    /// @notice Emitted when optimistic configuration is updated
    event OptimisticConfigUpdated(
        uint256 challengeWindow, uint256 minBond, uint256 maxPending, bool enabled
    );

    // ============ Errors ============

    /// @notice Optimistic execution is not enabled on this vault
    error OptimisticNotEnabled();

    /// @notice Too many pending executions
    error TooManyPending(uint256 current, uint256 max);

    /// @notice Bond provided is less than the minimum required
    error InsufficientBond(uint256 provided, uint256 required);

    /// @notice Execution nonce is not in the pending state
    error ExecutionNotPending(uint64 nonce, uint8 currentStatus);

    /// @notice Challenge deadline has not been reached yet
    error DeadlineNotReached(uint64 nonce, uint256 deadline, uint256 current);

    /// @notice Challenge window is outside allowed bounds
    error InvalidChallengeWindow(uint256 provided, uint256 min, uint256 max);

    /// @notice Max pending value exceeds the hard cap
    error InvalidMaxPending(uint256 provided, uint256 max);

    /// @notice Oracle signer not set (required for bond attestation verification)
    error OracleSignerNotSet();

    /// @notice Proof verification failed
    error ProofVerificationFailed();
}
