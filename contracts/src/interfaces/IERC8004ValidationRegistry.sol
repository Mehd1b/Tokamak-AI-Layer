// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IERC8004ValidationRegistry
 * @notice ERC-8004 standard interface for agent task validation
 * @dev Supports two validation models: ReputationOnly and TEEAttested (with staking requirement)
 */
interface IERC8004ValidationRegistry {
    /**
     * @notice Validation request status
     */
    enum ValidationStatus {
        Pending,    // Awaiting validation
        Completed,  // Validation completed
        Expired,    // Deadline passed without validation
        Disputed    // Under dispute
    }

    /**
     * @notice Validation model types
     */
    enum ValidationModel {
        ReputationOnly, // No bounty, instant reputation check
        TEEAttested     // TEE hardware attestation with staking requirement
    }

    /**
     * @notice Validation request data
     */
    struct ValidationRequest {
        uint256 agentId;         // Agent being validated
        address requester;       // Who requested validation
        bytes32 taskHash;        // Hash of task input
        bytes32 outputHash;      // Hash of task output
        ValidationModel model;   // Which validation model to use
        uint256 bounty;          // Bounty amount in TON
        uint256 deadline;        // Validation deadline timestamp
        ValidationStatus status; // Current status
    }

    /**
     * @notice Validation response data
     */
    struct ValidationResponse {
        address validator;       // Who validated
        uint8 score;            // Score 0-100
        bytes proof;            // ZK proof, TEE attestation, or empty
        string detailsURI;      // URI to detailed validation report
        uint256 timestamp;      // When validated
    }

    /// @notice Emitted when validation is requested
    event ValidationRequested(
        bytes32 indexed requestHash,
        uint256 indexed agentId,
        ValidationModel model
    );

    /// @notice Emitted when validation is completed
    event ValidationCompleted(
        bytes32 indexed requestHash,
        address indexed validator,
        uint8 score
    );

    /// @notice Emitted when validation is disputed
    event ValidationDisputed(
        bytes32 indexed requestHash,
        address indexed disputer
    );

    /**
     * @notice Request validation for an agent's task execution
     * @param agentId The agent's unique identifier
     * @param taskHash Hash of the task input
     * @param outputHash Hash of the task output
     * @param model Which validation model to use
     * @param deadline Timestamp by which validation must complete
     * @return requestHash Unique identifier for this validation request
     */
    function requestValidation(
        uint256 agentId,
        bytes32 taskHash,
        bytes32 outputHash,
        ValidationModel model,
        uint256 deadline
    ) external payable returns (bytes32 requestHash);

    /**
     * @notice Submit validation result
     * @param requestHash The validation request identifier
     * @param score Validation score (0-100)
     * @param proof Proof data (ZK proof, TEE attestation, or empty)
     * @param detailsURI URI to detailed validation report
     */
    function submitValidation(
        bytes32 requestHash,
        uint8 score,
        bytes calldata proof,
        string calldata detailsURI
    ) external;

    /**
     * @notice Get validation request and response
     * @param requestHash The validation request identifier
     * @return request The validation request data
     * @return response The validation response data
     */
    function getValidation(bytes32 requestHash)
        external
        view
        returns (ValidationRequest memory request, ValidationResponse memory response);

    /**
     * @notice Get all validation request hashes for an agent
     * @param agentId The agent's unique identifier
     * @return Array of validation request hashes
     */
    function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory);
}
