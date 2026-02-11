// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IERC8004ReputationRegistry.sol";

/**
 * @title ITALReputationRegistry
 * @notice TAL-specific extensions to ERC-8004 Reputation Registry
 * @dev Adds stake-weighted summaries, verified summaries, and payment proof integration
 *
 * @author Tokamak AI Layer
 * @custom:security-contact security@tokamak.ai
 *
 * This interface extends the base ERC-8004 reputation registry with advanced features:
 * - Stake-weighted feedback aggregation to prevent plutocracy
 * - Payment-proof integration for higher-trust feedback
 * - Merkle tree representation for efficient scaling
 * - Reviewer reputation tracking for feedback weighting
 */
interface ITALReputationRegistry is IERC8004ReputationRegistry {
    // ============ Custom Errors ============

    /**
     * @dev Thrown when an agent cannot be found in the registry
     * @param agentId The ID of the agent that was not found
     */
    error AgentNotFound(uint256 agentId);

    /**
     * @dev Thrown when a caller is not the owner of an agent
     * @param agentId The ID of the agent
     * @param caller The address of the caller
     */
    error NotAgentOwner(uint256 agentId, address caller);

    /**
     * @dev Thrown when feedback cannot be found at the specified index
     * @param agentId The ID of the agent
     * @param client The client address
     * @param index The feedback index
     */
    error FeedbackNotFound(uint256 agentId, address client, uint256 index);

    /**
     * @dev Thrown when attempting to revoke feedback that has already been revoked
     * @param agentId The ID of the agent
     * @param index The feedback index
     */
    error FeedbackAlreadyRevoked(uint256 agentId, uint256 index);

    /**
     * @dev Thrown when an agent attempts to provide feedback for themselves
     * @param agentId The ID of the agent attempting self-feedback
     */
    error SelfFeedbackNotAllowed(uint256 agentId);

    /**
     * @dev Thrown when payment proof validation fails
     */
    error InvalidPaymentProof();

    /**
     * @dev Thrown when no feedback is available for aggregation operations
     */
    error NoFeedbackToAggregate();

    /**
     * @dev Thrown when a caller has not used the agent (no completed task via TaskFeeEscrow)
     * @param agentId The ID of the agent
     * @param caller The address of the caller
     */
    error NotAgentUser(uint256 agentId, address caller);

    // ============ Events ============

    /**
     * @notice Emitted when feedback with payment proof is submitted
     * @dev Payment-proven feedback receives enhanced weighting in reputation calculations
     * @param agentId The ID of the agent receiving feedback
     * @param client The address of the client providing feedback
     * @param value The numerical feedback value
     * @param paymentProofHash Hash of the payment proof data
     */
    event FeedbackWithPaymentProofSubmitted(
        uint256 indexed agentId,
        address indexed client,
        int128 value,
        bytes32 paymentProofHash
    );

    /**
     * @notice Emitted when the reputation Merkle root is updated
     * @dev Used to efficiently prove reputation values in layer 2 or batch operations
     * @param newRoot The new Merkle root hash
     * @param timestamp The block timestamp of the update
     */
    event ReputationMerkleRootUpdated(bytes32 indexed newRoot, uint256 timestamp);

    /**
     * @notice Emitted when reviewer reputation changes
     * @dev Reviewers with higher reputation have their feedback weighted more heavily
     * @param reviewer The address of the reviewer
     * @param newReputation The new reputation score for the reviewer
     */
    event ReviewerReputationUpdated(address indexed reviewer, uint256 newReputation);

    // ============ Structs ============

    /**
     * @notice Extended feedback summary with stake-weighted aggregation
     * @dev Provides comprehensive statistics on agent reputation with anti-plutocracy measures
     *
     * @param weightedTotalValue The sum of feedback values, each weighted by sqrt(reviewer's stake)
     * @param totalWeight The sum of all individual weights (sqrt(stake) for each reviewer)
     * @param count The total number of feedback entries included
     * @param min The minimum feedback value in the set
     * @param max The maximum feedback value in the set
     */
    struct StakeWeightedSummary {
        int256 weightedTotalValue;  // Sum weighted by sqrt(stake)
        uint256 totalWeight;        // Sum of all weights
        uint256 count;              // Number of feedbacks
        int128 min;                 // Minimum value
        int128 max;                 // Maximum value
    }

    // ============ Stake-Weighted Functions ============

    /**
     * @notice Get stake-weighted feedback summary for an agent
     * @dev Weights each feedback by sqrt(reviewer's stake) to prevent plutocracy while
     *      maintaining meritocratic feedback. Uses square root to provide more moderate
     *      weighting of high-stake reviewers.
     *
     * @param agentId The agent's unique identifier
     * @param clients Array of client addresses to include in the calculation
     *
     * @return summary The stake-weighted feedback summary containing:
     *         - weightedTotalValue: Stake-weighted sum of all feedback values
     *         - totalWeight: Sum of all sqrt(stake) weights
     *         - count: Number of feedbacks analyzed
     *         - min: Minimum feedback value
     *         - max: Maximum feedback value
     *
     * @custom:note Only reviewers with non-zero stake are included in weighting
     * @custom:note Return value can be divided (weightedTotalValue / totalWeight) for average
     */
    function getStakeWeightedSummary(
        uint256 agentId,
        address[] calldata clients
    ) external view returns (StakeWeightedSummary memory summary);

    /**
     * @notice Get verified feedback summary from only validated task completions
     * @dev This returns feedback that has been linked to completed validator assessments,
     *      providing a higher-confidence reputation score. Only includes feedback that
     *      passed validation verification.
     *
     * @param agentId The agent's unique identifier
     * @param clients Array of client addresses to include
     *
     * @return summary Feedback summary structure containing:
     *         - totalValue: Sum of verified feedback values
     *         - count: Number of verified feedbacks
     *         - All other standard FeedbackSummary fields
     *
     * @custom:note Verified feedback typically carries higher weight in reputation calculations
     * @custom:note Returns FeedbackSummary from base interface for consistency
     */
    function getVerifiedSummary(
        uint256 agentId,
        address[] calldata clients
    ) external view returns (FeedbackSummary memory summary);

    // ============ Payment Proof Functions ============

    /**
     * @notice Submit feedback backed by x402 payment proof
     * @dev Payment-backed feedback is given enhanced trust weighting as it represents
     *      real economic value exchange. The payment proof must be valid and match the
     *      feedback parameters.
     *
     * Requirements:
     * - `agentId` must refer to a registered agent
     * - Caller must not be the agent owner (self-feedback prohibited)
     * - `paymentProof` must be valid according to x402 standards
     * - `value` must be within acceptable reputation bounds
     *
     * @param agentId The agent's unique identifier
     * @param value The numerical feedback value (may be negative)
     * @param valueDecimals Decimal places for the value (e.g., 2 for cents)
     * @param tag1 Primary category tag (e.g., "accuracy", "speed")
     * @param tag2 Secondary category tag (e.g., "documentation", "ui")
     * @param endpoint The service endpoint that was used
     * @param feedbackURI URI pointing to detailed feedback content (IPFS/HTTP)
     * @param feedbackHash Cryptographic hash of feedback content for integrity
     * @param paymentProof The x402 payment proof data (encrypted/signed)
     *
     * @custom:emits FeedbackWithPaymentProofSubmitted
     * @custom:emits FeedbackSubmitted (via base interface)
     *
     * @custom:security Payment proof should be validated against on-chain payment records
     */
    function submitFeedbackWithPaymentProof(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash,
        bytes calldata paymentProof
    ) external;

    /**
     * @notice Check if a feedback entry has been backed by verified payment proof
     * @dev Used to distinguish between paid feedback and unpaid feedback for weighting purposes.
     *      Payment-proven feedback receives higher reputation confidence.
     *
     * @param agentId The agent's unique identifier
     * @param client The client address that provided the feedback
     * @param feedbackIndex The index of the feedback entry to check
     *
     * @return hasPaymentProof True if the feedback has valid payment proof, false otherwise
     *
     * @custom:reverts FeedbackNotFound if the feedback index is out of range
     * @custom:reverts AgentNotFound if the agent does not exist
     */
    function hasPaymentProof(
        uint256 agentId,
        address client,
        uint256 feedbackIndex
    ) external view returns (bool hasPaymentProof);

    // ============ Merkle Tree Functions ============

    /**
     * @notice Get the current Merkle root representing all agent reputation scores
     * @dev The Merkle tree allows efficient proof generation for reputation scores,
     *      enabling trust-minimized cross-chain or layer-2 reputation verification.
     *      Leaf structure is typically: keccak256(agentId, reputationScore)
     *
     * @return The keccak256 Merkle root hash of the reputation tree
     *
     * @custom:note Root is updated periodically or after significant reputation changes
     * @custom:note Can be used to generate Merkle proofs for off-chain verification
     */
    function getReputationMerkleRoot() external view returns (bytes32);

    /**
     * @notice Update the reputation Merkle root with new tree
     * @dev This function should be permissioned to prevent unauthorized root manipulation.
     *      Typically callable only by the registry owner or authorized update service.
     *
     * Requirements:
     * - Caller must have appropriate permissions (owner/role-based)
     * - `newRoot` should represent a valid Merkle tree of agent reputations
     *
     * @param newRoot The new Merkle root hash to set
     *
     * @custom:emits ReputationMerkleRootUpdated
     *
     * @custom:note Updates should be atomic to prevent intermediate inconsistency
     * @custom:security Ensure caller is properly authorized before accepting root updates
     */
    function updateReputationMerkleRoot(bytes32 newRoot) external;

    // ============ Reviewer Reputation ============

    /**
     * @notice Get the emergent reputation score of a reviewer
     * @dev A reviewer's reputation is calculated based on the quality and accuracy of
     *      their feedback. High-reputation reviewers have their feedback weighted more
     *      heavily in agent reputation calculations, creating a positive feedback loop
     *      that rewards consistent, accurate feedback providers.
     *
     * @param reviewer The wallet address of the reviewer
     *
     * @return reputation The reviewer's current reputation score
     *         (typically 0-10000 scale, where 10000 = maximum reputation)
     *
     * @custom:note Reputation is emergent from the quality of their historical feedback
     * @custom:note High reviewer reputation increases the weight of their future feedback
     * @custom:note Returns 0 for reviewers with no history
     */
    function getReviewerReputation(address reviewer) external view returns (uint256 reputation);

    // ============ Query Functions ============

    /**
     * @notice Get all unique client addresses that have provided feedback for an agent
     * @dev This function returns the complete list of clients who have submitted feedback,
     *      useful for iteration and analysis of feedback sources.
     *
     * @param agentId The agent's unique identifier
     *
     * @return Array of client wallet addresses in arbitrary order
     *
     * @custom:reverts AgentNotFound if the agent does not exist
     * @custom:note Array may include clients who have since revoked their feedback
     */
    function getClientList(uint256 agentId) external view returns (address[] memory);

    /**
     * @notice Get the total count of feedback entries for an agent
     * @dev Includes both active and revoked feedback entries. This provides a measure of
     *      how many clients have interacted with the agent and submitted feedback.
     *
     * @param agentId The agent's unique identifier
     *
     * @return The total number of feedback entries ever submitted
     *
     * @custom:reverts AgentNotFound if the agent does not exist
     * @custom:note Count includes revoked feedbacks, use getVerifiedSummary for active count
     */
    function getFeedbackCount(uint256 agentId) external view returns (uint256);

    /**
     * @notice Get all agent responses to a specific feedback entry
     * @dev Agents may respond to feedback to clarify concerns, provide explanations,
     *      or address criticisms. This function retrieves all such responses.
     *
     * @param agentId The agent's unique identifier
     * @param client The client address who provided the original feedback
     * @param feedbackIndex The index of the feedback entry
     *
     * @return Array of response URIs (IPFS, HTTP, or other content-addressed URIs)
     *         in chronological order of submission
     *
     * @custom:reverts FeedbackNotFound if the feedback index is invalid
     * @custom:reverts AgentNotFound if the agent does not exist
     * @custom:note Empty array returned if no responses have been submitted
     */
    function getResponses(
        uint256 agentId,
        address client,
        uint256 feedbackIndex
    ) external view returns (string[] memory);
}
