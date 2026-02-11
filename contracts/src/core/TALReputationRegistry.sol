// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/ITALReputationRegistry.sol";
import "../libraries/ReputationMath.sol";

/**
 * @title TALReputationRegistry
 * @notice Tokamak Agent Layer reputation registry for AI agents
 * @dev Implements ERC-8004 + TAL extensions with stake-weighted reputation
 *
 * @author Tokamak AI Layer
 * @custom:security-contact security@tokamak.ai
 *
 * This contract serves as the central reputation management system for AI agents:
 * - ERC-8004 compliant feedback submission and retrieval
 * - Stake-weighted reputation aggregation to prevent plutocracy
 * - Payment-proof integration for higher-trust feedback
 * - Merkle tree representation for efficient cross-chain verification
 * - Reviewer reputation tracking for feedback quality weighting
 *
 * Architecture:
 * - Uses UUPS proxy pattern for upgradeability
 * - Role-based access control for administrative functions
 * - Pausable for emergency situations
 * - ReentrancyGuard for protection against reentrancy attacks
 */

/// @dev Internal struct to reduce stack depth in feedback submission
struct FeedbackInput {
    uint256 agentId;
    int128 value;
    uint8 valueDecimals;
    string tag1;
    string tag2;
    string endpoint;
    string feedbackURI;
    bytes32 feedbackHash;
}

contract TALReputationRegistry is
    AccessControlUpgradeable,
    UUPSUpgradeable,
    PausableUpgradeable,
    ReentrancyGuard,
    ITALReputationRegistry
{
    using ReputationMath for *;

    // ============ Constants ============

    /// @notice Role for upgrading the contract implementation
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    /// @notice Role for pausing/unpausing the contract
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice Role for updating the reputation Merkle root
    bytes32 public constant MERKLE_UPDATER_ROLE = keccak256("MERKLE_UPDATER_ROLE");

    /// @notice Role for updating reviewer reputations
    bytes32 public constant REPUTATION_MANAGER_ROLE = keccak256("REPUTATION_MANAGER_ROLE");

    // ============ State Variables ============

    /// @notice Identity registry address for agent validation
    address public identityRegistry;

    /// @notice Staking bridge contract address for stake-weighted calculations (L2 cache of L1 Staking V3)
    address public stakingBridge;

    /// @notice Validation registry address for verified summaries
    address public validationRegistry;

    /// @notice Feedbacks by agent and client (agentId => client => Feedback[])
    mapping(uint256 => mapping(address => Feedback[])) private _feedbacks;

    /// @notice Client list per agent (agentId => client addresses)
    mapping(uint256 => address[]) private _clientLists;

    /// @notice Client exists check (agentId => client => exists)
    mapping(uint256 => mapping(address => bool)) private _clientExists;

    /// @notice Responses to feedback (agentId => client => feedbackIndex => responseURIs)
    mapping(uint256 => mapping(address => mapping(uint256 => string[]))) private _responses;

    /// @notice Payment proof tracking (agentId => client => feedbackIndex => hasProof)
    mapping(uint256 => mapping(address => mapping(uint256 => bool))) private _hasPaymentProof;

    /// @notice Reviewer reputation scores (reviewer address => reputation score)
    mapping(address => uint256) public reviewerReputation;

    /// @notice Reputation Merkle root for efficient verification
    bytes32 public reputationMerkleRoot;

    /// @notice Total feedback count per agent (includes revoked)
    mapping(uint256 => uint256) private _feedbackCounts;

    /// @notice TaskFeeEscrow address for usage validation
    address public taskFeeEscrow;

    // ============ Storage Gap ============

    /// @dev Reserved storage space for future upgrades
    uint256[39] private __gap;

    // ============ Initializer ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract
     * @dev Sets up roles and external contract references
     * @param admin The admin address that receives all initial roles
     * @param _identityRegistry The identity registry address for agent validation
     * @param _stakingBridge The staking bridge contract address (L2 cache of L1 Staking V3)
     */
    function initialize(
        address admin,
        address _identityRegistry,
        address _stakingBridge
    ) public initializer {
        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(MERKLE_UPDATER_ROLE, admin);
        _grantRole(REPUTATION_MANAGER_ROLE, admin);

        identityRegistry = _identityRegistry;
        stakingBridge = _stakingBridge;
    }

    // ============ ERC-8004 Reputation Functions ============

    /// @inheritdoc IERC8004ReputationRegistry
    function submitFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external whenNotPaused nonReentrant {
        _submitFeedbackInternal(
            FeedbackInput({
                agentId: agentId,
                value: value,
                valueDecimals: valueDecimals,
                tag1: tag1,
                tag2: tag2,
                endpoint: endpoint,
                feedbackURI: feedbackURI,
                feedbackHash: feedbackHash
            }),
            false,
            bytes32(0)
        );
    }

    /// @inheritdoc IERC8004ReputationRegistry
    function revokeFeedback(uint256 agentId, uint256 feedbackIndex) external {
        Feedback[] storage clientFeedbacks = _feedbacks[agentId][msg.sender];
        if (feedbackIndex >= clientFeedbacks.length) {
            revert FeedbackNotFound(agentId, msg.sender, feedbackIndex);
        }
        if (clientFeedbacks[feedbackIndex].isRevoked) {
            revert FeedbackAlreadyRevoked(agentId, feedbackIndex);
        }

        clientFeedbacks[feedbackIndex].isRevoked = true;
        emit FeedbackRevoked(agentId, msg.sender, feedbackIndex);
    }

    /// @inheritdoc IERC8004ReputationRegistry
    function respondToFeedback(
        uint256 agentId,
        address client,
        uint256 feedbackIndex,
        string calldata responseURI
    ) external {
        _validateAgent(agentId);
        _validateAgentOwner(agentId, msg.sender);

        if (feedbackIndex >= _feedbacks[agentId][client].length) {
            revert FeedbackNotFound(agentId, client, feedbackIndex);
        }

        _responses[agentId][client][feedbackIndex].push(responseURI);
        emit ResponseSubmitted(agentId, client, feedbackIndex);
    }

    /// @inheritdoc IERC8004ReputationRegistry
    function getFeedback(uint256 agentId, address client) external view returns (Feedback[] memory) {
        return _feedbacks[agentId][client];
    }

    /// @inheritdoc IERC8004ReputationRegistry
    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses
    ) external view returns (FeedbackSummary memory summary) {
        if (clientAddresses.length == 0) revert NoFeedbackToAggregate();

        int128[] memory values = _collectNonRevokedValues(agentId, clientAddresses);

        if (values.length == 0) {
            return FeedbackSummary(0, 0, 0, 0);
        }

        (int256 totalValue, uint256 count, int128 min, int128 max) =
            ReputationMath.aggregateFeedback(values);

        return FeedbackSummary(totalValue, count, min, max);
    }

    // ============ TAL Stake-Weighted Functions ============

    /// @inheritdoc ITALReputationRegistry
    function getStakeWeightedSummary(
        uint256 agentId,
        address[] calldata clients
    ) external view returns (StakeWeightedSummary memory summary) {
        if (clients.length == 0) revert NoFeedbackToAggregate();

        (int128[] memory values, uint256[] memory stakes) =
            _collectValuesWithStakes(agentId, clients);

        if (values.length == 0) {
            return StakeWeightedSummary(0, 0, 0, 0, 0);
        }

        int256 weightedTotal = ReputationMath.calculateWeightedAverage(values, stakes);

        uint256 totalWeight = 0;
        int128 min = values[0];
        int128 max = values[0];

        for (uint256 i = 0; i < values.length; i++) {
            totalWeight += ReputationMath.calculateStakeWeight(stakes[i]);
            if (values[i] < min) min = values[i];
            if (values[i] > max) max = values[i];
        }

        return StakeWeightedSummary(weightedTotal, totalWeight, values.length, min, max);
    }

    /// @inheritdoc ITALReputationRegistry
    function getVerifiedSummary(
        uint256 agentId,
        address[] calldata clients
    ) external view returns (FeedbackSummary memory summary) {
        if (clients.length == 0) revert NoFeedbackToAggregate();

        // Collect only verified feedback (payment-proof backed)
        int128[] memory values = _collectVerifiedValues(agentId, clients);

        if (values.length == 0) {
            return FeedbackSummary(0, 0, 0, 0);
        }

        (int256 totalValue, uint256 count, int128 min, int128 max) =
            ReputationMath.aggregateFeedback(values);

        return FeedbackSummary(totalValue, count, min, max);
    }

    // ============ Payment Proof Functions ============

    /// @inheritdoc ITALReputationRegistry
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
    ) external whenNotPaused nonReentrant {
        // Validate payment proof - requires non-empty proof
        if (paymentProof.length == 0) {
            revert InvalidPaymentProof();
        }

        _submitFeedbackInternal(
            FeedbackInput({
                agentId: agentId,
                value: value,
                valueDecimals: valueDecimals,
                tag1: tag1,
                tag2: tag2,
                endpoint: endpoint,
                feedbackURI: feedbackURI,
                feedbackHash: feedbackHash
            }),
            true,
            keccak256(paymentProof)
        );
    }

    /// @inheritdoc ITALReputationRegistry
    function hasPaymentProof(
        uint256 agentId,
        address client,
        uint256 feedbackIndex
    ) external view returns (bool) {
        return _hasPaymentProof[agentId][client][feedbackIndex];
    }

    // ============ Merkle Tree Functions ============

    /// @inheritdoc ITALReputationRegistry
    function getReputationMerkleRoot() external view returns (bytes32) {
        return reputationMerkleRoot;
    }

    /// @inheritdoc ITALReputationRegistry
    function updateReputationMerkleRoot(bytes32 newRoot) external onlyRole(MERKLE_UPDATER_ROLE) {
        reputationMerkleRoot = newRoot;
        emit ReputationMerkleRootUpdated(newRoot, block.timestamp);
    }

    // ============ Reviewer Reputation ============

    /// @inheritdoc ITALReputationRegistry
    function getReviewerReputation(address reviewer) external view returns (uint256) {
        return reviewerReputation[reviewer];
    }

    /**
     * @notice Update a reviewer's reputation score
     * @dev Only callable by REPUTATION_MANAGER_ROLE
     * @param reviewer The reviewer address to update
     * @param newReputation The new reputation score (0-10000 scale)
     */
    function updateReviewerReputation(
        address reviewer,
        uint256 newReputation
    ) external onlyRole(REPUTATION_MANAGER_ROLE) {
        reviewerReputation[reviewer] = newReputation;
        emit ReviewerReputationUpdated(reviewer, newReputation);
    }

    // ============ Query Functions ============

    /// @inheritdoc ITALReputationRegistry
    function getClientList(uint256 agentId) external view returns (address[] memory) {
        return _clientLists[agentId];
    }

    /// @inheritdoc ITALReputationRegistry
    function getFeedbackCount(uint256 agentId) external view returns (uint256) {
        return _feedbackCounts[agentId];
    }

    /// @inheritdoc ITALReputationRegistry
    function getResponses(
        uint256 agentId,
        address client,
        uint256 feedbackIndex
    ) external view returns (string[] memory) {
        return _responses[agentId][client][feedbackIndex];
    }

    // ============ Admin Functions ============

    /**
     * @notice Pause the contract
     * @dev Only callable by PAUSER_ROLE
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause the contract
     * @dev Only callable by PAUSER_ROLE
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice Set the identity registry address
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     * @param _identityRegistry The new identity registry address
     */
    function setIdentityRegistry(address _identityRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        identityRegistry = _identityRegistry;
    }

    /**
     * @notice Set the staking bridge contract address
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     * @param _stakingBridge The new staking bridge address (L2 cache of L1 Staking V3)
     */
    function setStakingBridge(address _stakingBridge) external onlyRole(DEFAULT_ADMIN_ROLE) {
        stakingBridge = _stakingBridge;
    }

    /**
     * @notice Set the validation registry address
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     * @param _validationRegistry The new validation registry address
     */
    function setValidationRegistry(address _validationRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        validationRegistry = _validationRegistry;
    }

    /**
     * @notice Set the TaskFeeEscrow address for usage validation
     * @dev Only callable by DEFAULT_ADMIN_ROLE. When set, only users who have
     *      completed a task via the escrow can submit feedback.
     * @param _taskFeeEscrow The TaskFeeEscrow contract address (or address(0) to disable)
     */
    function setTaskFeeEscrow(address _taskFeeEscrow) external onlyRole(DEFAULT_ADMIN_ROLE) {
        taskFeeEscrow = _taskFeeEscrow;
    }

    // ============ Internal Functions ============

    /**
     * @notice Internal function to handle feedback submission
     * @dev Uses struct to reduce stack depth
     * @param input The feedback input data
     * @param withPaymentProof Whether this feedback has a payment proof
     * @param paymentProofHash Hash of the payment proof (if applicable)
     */
    function _submitFeedbackInternal(
        FeedbackInput memory input,
        bool withPaymentProof,
        bytes32 paymentProofHash
    ) internal {
        _validateAgent(input.agentId);
        _validateNotSelfFeedback(input.agentId, msg.sender);
        _validateAgentUser(input.agentId, msg.sender);

        // Store feedback and get normalized value
        int128 nv = _storeFeedback(input);

        // Track payment proof if provided
        if (withPaymentProof) {
            uint256 idx = _feedbacks[input.agentId][msg.sender].length - 1;
            _hasPaymentProof[input.agentId][msg.sender][idx] = true;
            emit FeedbackWithPaymentProofSubmitted(input.agentId, msg.sender, nv, paymentProofHash);
        }

        // Emit in separate scope to reduce stack
        _emitFeedback(input.agentId, nv, input.tag1, input.tag2);
    }

    /**
     * @notice Store feedback data to storage
     * @dev Separated to reduce stack depth
     * @param input The feedback input data
     * @return normalizedValue The normalized feedback value
     */
    function _storeFeedback(FeedbackInput memory input) internal returns (int128 normalizedValue) {
        uint256 id = input.agentId;
        address sender = msg.sender;

        // Push and get storage reference
        _feedbacks[id][sender].push();
        uint256 idx = _feedbacks[id][sender].length - 1;
        Feedback storage fb = _feedbacks[id][sender][idx];

        // Normalize and store
        normalizedValue = ReputationMath.normalizeScore(input.value);
        fb.value = normalizedValue;
        fb.valueDecimals = input.valueDecimals;
        fb.timestamp = block.timestamp;
        fb.feedbackHash = input.feedbackHash;

        // Store strings separately
        _storeStrings(fb, input);

        _feedbackCounts[id]++;

        // Track client
        if (!_clientExists[id][sender]) {
            _clientLists[id].push(sender);
            _clientExists[id][sender] = true;
        }
    }

    /**
     * @notice Store string fields to feedback storage
     * @dev Separated to reduce stack depth during string operations
     */
    function _storeStrings(Feedback storage fb, FeedbackInput memory input) internal {
        fb.tag1 = input.tag1;
        fb.tag2 = input.tag2;
        fb.endpoint = input.endpoint;
        fb.feedbackURI = input.feedbackURI;
    }

    /**
     * @notice Emit feedback event
     * @dev Separated to reduce stack depth
     */
    function _emitFeedback(uint256 agentId, int128 value, string memory t1, string memory t2) internal {
        emit FeedbackSubmitted(agentId, msg.sender, value, t1, t2);
    }

    /**
     * @notice Validate that the caller has used the agent (completed a task via TaskFeeEscrow)
     * @dev Skips validation if taskFeeEscrow is not set (backward compatible)
     * @param agentId The agent ID to check usage for
     * @param caller The address to validate
     */
    function _validateAgentUser(uint256 agentId, address caller) internal view {
        if (taskFeeEscrow == address(0)) return; // Skip if not set

        (bool success, bytes memory result) = taskFeeEscrow.staticcall(
            abi.encodeWithSignature("hasUsedAgent(uint256,address)", agentId, caller)
        );
        if (success && result.length >= 32) {
            bool used = abi.decode(result, (bool));
            if (!used) revert NotAgentUser(agentId, caller);
        }
    }

    /**
     * @notice Validate that an agent exists in the identity registry
     * @dev Skips validation if identity registry is not set
     * @param agentId The agent ID to validate
     */
    function _validateAgent(uint256 agentId) internal view {
        if (identityRegistry == address(0)) return; // Skip if not set

        (bool success, bytes memory result) = identityRegistry.staticcall(
            abi.encodeWithSignature("agentExists(uint256)", agentId)
        );
        if (!success || (result.length > 0 && !abi.decode(result, (bool)))) {
            revert AgentNotFound(agentId);
        }
    }

    /**
     * @notice Validate that the caller is the owner of the agent
     * @dev Skips validation if identity registry is not set
     * @param agentId The agent ID to check ownership for
     * @param caller The address to validate as owner
     */
    function _validateAgentOwner(uint256 agentId, address caller) internal view {
        if (identityRegistry == address(0)) return;

        (bool success, bytes memory result) = identityRegistry.staticcall(
            abi.encodeWithSignature("ownerOf(uint256)", agentId)
        );
        if (!success) revert AgentNotFound(agentId);

        address owner = abi.decode(result, (address));
        if (owner != caller) revert NotAgentOwner(agentId, caller);
    }

    /**
     * @notice Validate that the caller is not providing self-feedback
     * @dev Prevents agents from artificially inflating their own reputation
     * @param agentId The agent ID being reviewed
     * @param caller The address submitting feedback
     */
    function _validateNotSelfFeedback(uint256 agentId, address caller) internal view {
        if (identityRegistry == address(0)) return;

        (bool success, bytes memory result) = identityRegistry.staticcall(
            abi.encodeWithSignature("ownerOf(uint256)", agentId)
        );
        if (success && result.length > 0) {
            address owner = abi.decode(result, (address));
            if (owner == caller) revert SelfFeedbackNotAllowed(agentId);
        }
    }

    /**
     * @notice Collect all non-revoked feedback values for specified clients
     * @param agentId The agent ID to collect feedback for
     * @param clients Array of client addresses to include
     * @return values Array of feedback values
     */
    function _collectNonRevokedValues(
        uint256 agentId,
        address[] calldata clients
    ) internal view returns (int128[] memory) {
        // First pass: count non-revoked feedbacks
        uint256 count = 0;
        for (uint256 i = 0; i < clients.length; i++) {
            Feedback[] storage clientFeedbacks = _feedbacks[agentId][clients[i]];
            for (uint256 j = 0; j < clientFeedbacks.length; j++) {
                if (!clientFeedbacks[j].isRevoked) {
                    count++;
                }
            }
        }

        // Second pass: collect values
        int128[] memory values = new int128[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < clients.length; i++) {
            Feedback[] storage clientFeedbacks = _feedbacks[agentId][clients[i]];
            for (uint256 j = 0; j < clientFeedbacks.length; j++) {
                if (!clientFeedbacks[j].isRevoked) {
                    values[idx++] = clientFeedbacks[j].value;
                }
            }
        }

        return values;
    }

    /**
     * @notice Collect verified (payment-proof backed) feedback values
     * @param agentId The agent ID to collect feedback for
     * @param clients Array of client addresses to include
     * @return values Array of verified feedback values
     */
    function _collectVerifiedValues(
        uint256 agentId,
        address[] calldata clients
    ) internal view returns (int128[] memory) {
        // First pass: count verified non-revoked feedbacks
        uint256 count = 0;
        for (uint256 i = 0; i < clients.length; i++) {
            Feedback[] storage clientFeedbacks = _feedbacks[agentId][clients[i]];
            for (uint256 j = 0; j < clientFeedbacks.length; j++) {
                if (!clientFeedbacks[j].isRevoked && _hasPaymentProof[agentId][clients[i]][j]) {
                    count++;
                }
            }
        }

        // Second pass: collect values
        int128[] memory values = new int128[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < clients.length; i++) {
            Feedback[] storage clientFeedbacks = _feedbacks[agentId][clients[i]];
            for (uint256 j = 0; j < clientFeedbacks.length; j++) {
                if (!clientFeedbacks[j].isRevoked && _hasPaymentProof[agentId][clients[i]][j]) {
                    values[idx++] = clientFeedbacks[j].value;
                }
            }
        }

        return values;
    }

    /**
     * @notice Collect feedback values along with their stake weights
     * @param agentId The agent ID to collect feedback for
     * @param clients Array of client addresses to include
     * @return values Array of feedback values
     * @return stakes Array of corresponding stake amounts
     */
    function _collectValuesWithStakes(
        uint256 agentId,
        address[] calldata clients
    ) internal view returns (int128[] memory values, uint256[] memory stakes) {
        // First pass: count non-revoked feedbacks
        uint256 count = 0;
        for (uint256 i = 0; i < clients.length; i++) {
            Feedback[] storage clientFeedbacks = _feedbacks[agentId][clients[i]];
            for (uint256 j = 0; j < clientFeedbacks.length; j++) {
                if (!clientFeedbacks[j].isRevoked) count++;
            }
        }

        values = new int128[](count);
        stakes = new uint256[](count);
        uint256 idx = 0;

        for (uint256 i = 0; i < clients.length; i++) {
            uint256 clientStake = _getStake(clients[i]);
            Feedback[] storage clientFeedbacks = _feedbacks[agentId][clients[i]];
            for (uint256 j = 0; j < clientFeedbacks.length; j++) {
                if (!clientFeedbacks[j].isRevoked) {
                    values[idx] = clientFeedbacks[j].value;
                    stakes[idx] = clientStake;
                    idx++;
                }
            }
        }
    }

    /**
     * @notice Get the stake amount for an account from the staking bridge
     * @dev Returns a default weight if staking bridge is not set
     * @param account The account to query stake for
     * @return The stake amount (or default 1 ether if not available)
     */
    function _getStake(address account) internal view returns (uint256) {
        if (stakingBridge == address(0)) return 1 ether; // Default weight if no staking bridge

        (bool success, bytes memory result) = stakingBridge.staticcall(
            abi.encodeWithSignature("getStake(address)", account)
        );
        if (!success || result.length < 32) return 1 ether;
        return abi.decode(result, (uint256));
    }

    /**
     * @notice Authorize contract upgrades
     * @dev Only callable by UPGRADER_ROLE
     * @param newImplementation Address of the new implementation
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}
