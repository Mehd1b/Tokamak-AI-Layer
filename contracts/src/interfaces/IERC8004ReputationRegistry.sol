// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IERC8004ReputationRegistry
 * @notice ERC-8004 standard interface for agent reputation management
 * @dev Handles feedback submission, revocation, and summary queries
 */
interface IERC8004ReputationRegistry {
    /**
     * @notice Feedback data structure
     */
    struct Feedback {
        int128 value;           // Feedback value (can be negative)
        uint8 valueDecimals;    // Decimal places for value
        string tag1;            // Primary category tag
        string tag2;            // Secondary category tag
        string endpoint;        // Service endpoint that was used
        string feedbackURI;     // URI to detailed feedback (IPFS)
        bytes32 feedbackHash;   // Hash of feedback content for verification
        bool isRevoked;         // Whether feedback has been revoked
        uint256 timestamp;      // When feedback was submitted
    }

    /**
     * @notice Aggregated feedback summary
     */
    struct FeedbackSummary {
        int256 totalValue;      // Sum of all feedback values
        uint256 count;          // Number of feedbacks
        int128 min;             // Minimum feedback value
        int128 max;             // Maximum feedback value
    }

    /// @notice Emitted when feedback is submitted
    event FeedbackSubmitted(
        uint256 indexed agentId,
        address indexed client,
        int128 value,
        string tag1,
        string tag2
    );

    /// @notice Emitted when feedback is revoked
    event FeedbackRevoked(
        uint256 indexed agentId,
        address indexed client,
        uint256 feedbackIndex
    );

    /// @notice Emitted when agent responds to feedback
    event ResponseSubmitted(
        uint256 indexed agentId,
        address indexed client,
        uint256 feedbackIndex
    );

    /**
     * @notice Submit feedback for an agent
     * @param agentId The agent's unique identifier
     * @param value The feedback value (can be negative)
     * @param valueDecimals Decimal places for the value
     * @param tag1 Primary category tag
     * @param tag2 Secondary category tag
     * @param endpoint The service endpoint used
     * @param feedbackURI URI to detailed feedback
     * @param feedbackHash Hash of feedback content
     */
    function submitFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external;

    /**
     * @notice Revoke previously submitted feedback
     * @param agentId The agent's unique identifier
     * @param feedbackIndex Index of the feedback to revoke
     */
    function revokeFeedback(uint256 agentId, uint256 feedbackIndex) external;

    /**
     * @notice Respond to feedback as the agent
     * @param agentId The agent's unique identifier
     * @param client The client who submitted the feedback
     * @param feedbackIndex Index of the feedback
     * @param responseURI URI to the response content
     */
    function respondToFeedback(
        uint256 agentId,
        address client,
        uint256 feedbackIndex,
        string calldata responseURI
    ) external;

    /**
     * @notice Get all feedback from a specific client for an agent
     * @param agentId The agent's unique identifier
     * @param client The client address
     * @return Array of Feedback structs
     */
    function getFeedback(uint256 agentId, address client) external view returns (Feedback[] memory);

    /**
     * @notice Get aggregated feedback summary for specified clients
     * @param agentId The agent's unique identifier
     * @param clientAddresses Array of client addresses to include
     * @return summary Aggregated feedback summary
     */
    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses
    ) external view returns (FeedbackSummary memory summary);
}
