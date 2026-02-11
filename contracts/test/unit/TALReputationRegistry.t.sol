// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/core/TALReputationRegistry.sol";
import "../../src/interfaces/ITALReputationRegistry.sol";
import "../../src/interfaces/IERC8004ReputationRegistry.sol";
import "../../src/libraries/ReputationMath.sol";
import "../mocks/MockStakingV3.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title MockIdentityRegistry
 * @notice Mock contract for testing identity registry integration
 */
contract MockIdentityRegistry {
    mapping(uint256 => address) public owners;
    mapping(uint256 => bool) public agentExistsMap;

    function setAgent(uint256 agentId, address owner) external {
        owners[agentId] = owner;
        agentExistsMap[agentId] = true;
    }

    function removeAgent(uint256 agentId) external {
        delete owners[agentId];
        agentExistsMap[agentId] = false;
    }

    function agentExists(uint256 agentId) external view returns (bool) {
        return agentExistsMap[agentId];
    }

    function ownerOf(uint256 agentId) external view returns (address) {
        require(agentExistsMap[agentId], "Agent does not exist");
        return owners[agentId];
    }
}

/**
 * @title MockTaskFeeEscrow
 * @notice Mock contract for testing TaskFeeEscrow usage validation
 */
contract MockTaskFeeEscrow {
    mapping(uint256 => mapping(address => bool)) private _hasUsedAgent;

    function setHasUsedAgent(uint256 agentId, address user, bool used) external {
        _hasUsedAgent[agentId][user] = used;
    }

    function hasUsedAgent(uint256 agentId, address user) external view returns (bool) {
        return _hasUsedAgent[agentId][user];
    }
}

/**
 * @title TALReputationRegistryTest
 * @notice Comprehensive unit tests for TALReputationRegistry
 */
contract TALReputationRegistryTest is Test {
    TALReputationRegistry public registry;
    TALReputationRegistry public registryImpl;
    MockIdentityRegistry public identityRegistry;
    MockStakingV3 public stakingBridge;

    address public admin = address(0x1);
    address public agentOwner = address(0x2);
    address public client1 = address(0x3);
    address public client2 = address(0x4);
    address public client3 = address(0x5);
    address public nonAdmin = address(0x6);

    uint256 public constant AGENT_ID = 1;
    uint256 public constant AGENT_ID_2 = 2;

    // Default feedback parameters
    int128 constant DEFAULT_VALUE = 80;
    uint8 constant DEFAULT_DECIMALS = 2;
    bytes32 constant DEFAULT_FEEDBACK_HASH = keccak256("test feedback content");

    // Use storage strings to reduce stack pressure
    string internal _tag1 = "quality";
    string internal _tag2 = "speed";
    string internal _endpoint = "https://agent.example.com/api";
    string internal _feedbackURI = "ipfs://QmFeedback123";

    // Events from interfaces
    event FeedbackSubmitted(
        uint256 indexed agentId,
        address indexed client,
        int128 value,
        string tag1,
        string tag2
    );

    event FeedbackRevoked(
        uint256 indexed agentId,
        address indexed client,
        uint256 feedbackIndex
    );

    event ResponseSubmitted(
        uint256 indexed agentId,
        address indexed client,
        uint256 feedbackIndex
    );

    event FeedbackWithPaymentProofSubmitted(
        uint256 indexed agentId,
        address indexed client,
        int128 value,
        bytes32 paymentProofHash
    );

    event ReputationMerkleRootUpdated(bytes32 indexed newRoot, uint256 timestamp);

    event ReviewerReputationUpdated(address indexed reviewer, uint256 newReputation);

    function setUp() public {
        // Deploy mocks
        identityRegistry = new MockIdentityRegistry();
        stakingBridge = new MockStakingV3();

        // Deploy implementation
        registryImpl = new TALReputationRegistry();

        // Deploy proxy
        bytes memory initData = abi.encodeWithSelector(
            TALReputationRegistry.initialize.selector,
            admin,
            address(identityRegistry),
            address(stakingBridge)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(registryImpl), initData);
        registry = TALReputationRegistry(address(proxy));

        // Setup agent in identity registry
        identityRegistry.setAgent(AGENT_ID, agentOwner);
        identityRegistry.setAgent(AGENT_ID_2, agentOwner);

        // Setup stakes for clients
        stakingBridge.setStake(client1, 100 ether);
        stakingBridge.setStake(client2, 400 ether);
        stakingBridge.setStake(client3, 900 ether);
    }

    // ============ Helper Functions ============

    function _submitDefaultFeedback(address client, uint256 agentId) internal {
        vm.prank(client);
        registry.submitFeedback(
            agentId,
            DEFAULT_VALUE,
            DEFAULT_DECIMALS,
            _tag1,
            _tag2,
            _endpoint,
            _feedbackURI,
            DEFAULT_FEEDBACK_HASH
        );
    }

    function _submitFeedbackWithValue(address client, uint256 agentId, int128 value) internal {
        vm.prank(client);
        registry.submitFeedback(
            agentId,
            value,
            DEFAULT_DECIMALS,
            _tag1,
            _tag2,
            _endpoint,
            _feedbackURI,
            DEFAULT_FEEDBACK_HASH
        );
    }

    function _submitFeedbackWithPaymentProof(address client, uint256 agentId, int128 value) internal {
        bytes memory paymentProof = abi.encodePacked("valid_payment_proof");
        vm.prank(client);
        registry.submitFeedbackWithPaymentProof(
            agentId,
            value,
            DEFAULT_DECIMALS,
            _tag1,
            _tag2,
            _endpoint,
            _feedbackURI,
            DEFAULT_FEEDBACK_HASH,
            paymentProof
        );
    }

    // ============ 1. Feedback Submission Tests ============

    function test_submitFeedback_success() public {
        _submitDefaultFeedback(client1, AGENT_ID);

        IERC8004ReputationRegistry.Feedback[] memory feedbacks = registry.getFeedback(AGENT_ID, client1);
        assertEq(feedbacks.length, 1);
        assertEq(feedbacks[0].value, DEFAULT_VALUE);
        assertEq(feedbacks[0].valueDecimals, DEFAULT_DECIMALS);
        assertEq(feedbacks[0].tag1, _tag1);
        assertEq(feedbacks[0].tag2, _tag2);
        assertEq(feedbacks[0].endpoint, _endpoint);
        assertEq(feedbacks[0].feedbackURI, _feedbackURI);
        assertEq(feedbacks[0].feedbackHash, DEFAULT_FEEDBACK_HASH);
        assertFalse(feedbacks[0].isRevoked);
        assertEq(feedbacks[0].timestamp, block.timestamp);
    }

    function test_submitFeedback_emitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit FeedbackSubmitted(AGENT_ID, client1, DEFAULT_VALUE, _tag1, _tag2);

        _submitDefaultFeedback(client1, AGENT_ID);
    }

    function test_submitFeedback_normalizesScore() public {
        // Test that scores above 100 are normalized to 100
        _submitFeedbackWithValue(client1, AGENT_ID, 150);

        IERC8004ReputationRegistry.Feedback[] memory feedbacks = registry.getFeedback(AGENT_ID, client1);
        assertEq(feedbacks[0].value, 100); // MAX_SCORE

        // Test that scores below -100 are normalized to -100
        _submitFeedbackWithValue(client2, AGENT_ID, -150);

        feedbacks = registry.getFeedback(AGENT_ID, client2);
        assertEq(feedbacks[0].value, -100); // MIN_SCORE
    }

    function test_submitFeedback_addsClientToList() public {
        // Initially no clients
        address[] memory clients = registry.getClientList(AGENT_ID);
        assertEq(clients.length, 0);

        // Submit feedback from client1
        _submitDefaultFeedback(client1, AGENT_ID);

        clients = registry.getClientList(AGENT_ID);
        assertEq(clients.length, 1);
        assertEq(clients[0], client1);

        // Submit another feedback from same client - should not add again
        _submitDefaultFeedback(client1, AGENT_ID);

        clients = registry.getClientList(AGENT_ID);
        assertEq(clients.length, 1);

        // Submit feedback from different client - should add
        _submitDefaultFeedback(client2, AGENT_ID);

        clients = registry.getClientList(AGENT_ID);
        assertEq(clients.length, 2);
        assertEq(clients[1], client2);
    }

    function test_submitFeedback_revertIfSelfFeedback() public {
        vm.prank(agentOwner);
        vm.expectRevert(abi.encodeWithSelector(ITALReputationRegistry.SelfFeedbackNotAllowed.selector, AGENT_ID));
        registry.submitFeedback(
            AGENT_ID,
            DEFAULT_VALUE,
            DEFAULT_DECIMALS,
            _tag1,
            _tag2,
            _endpoint,
            _feedbackURI,
            DEFAULT_FEEDBACK_HASH
        );
    }

    // ============ 2. Feedback Revocation Tests ============

    function test_revokeFeedback_success() public {
        _submitDefaultFeedback(client1, AGENT_ID);

        IERC8004ReputationRegistry.Feedback[] memory feedbacks = registry.getFeedback(AGENT_ID, client1);
        assertFalse(feedbacks[0].isRevoked);

        vm.prank(client1);
        registry.revokeFeedback(AGENT_ID, 0);

        feedbacks = registry.getFeedback(AGENT_ID, client1);
        assertTrue(feedbacks[0].isRevoked);
    }

    function test_revokeFeedback_emitsEvent() public {
        _submitDefaultFeedback(client1, AGENT_ID);

        vm.expectEmit(true, true, false, true);
        emit FeedbackRevoked(AGENT_ID, client1, 0);

        vm.prank(client1);
        registry.revokeFeedback(AGENT_ID, 0);
    }

    function test_revokeFeedback_revertIfNotSubmitter() public {
        _submitDefaultFeedback(client1, AGENT_ID);

        // client2 tries to revoke client1's feedback
        vm.prank(client2);
        vm.expectRevert(abi.encodeWithSelector(ITALReputationRegistry.FeedbackNotFound.selector, AGENT_ID, client2, 0));
        registry.revokeFeedback(AGENT_ID, 0);
    }

    function test_revokeFeedback_revertIfAlreadyRevoked() public {
        _submitDefaultFeedback(client1, AGENT_ID);

        vm.prank(client1);
        registry.revokeFeedback(AGENT_ID, 0);

        vm.prank(client1);
        vm.expectRevert(abi.encodeWithSelector(ITALReputationRegistry.FeedbackAlreadyRevoked.selector, AGENT_ID, 0));
        registry.revokeFeedback(AGENT_ID, 0);
    }

    function test_revokeFeedback_revertIfIndexOutOfBounds() public {
        _submitDefaultFeedback(client1, AGENT_ID);

        vm.prank(client1);
        vm.expectRevert(abi.encodeWithSelector(ITALReputationRegistry.FeedbackNotFound.selector, AGENT_ID, client1, 5));
        registry.revokeFeedback(AGENT_ID, 5);
    }

    // ============ 3. Response Tests ============

    function test_respondToFeedback_success() public {
        _submitDefaultFeedback(client1, AGENT_ID);

        string memory responseURI = "ipfs://QmResponse123";

        vm.prank(agentOwner);
        registry.respondToFeedback(AGENT_ID, client1, 0, responseURI);

        string[] memory responses = registry.getResponses(AGENT_ID, client1, 0);
        assertEq(responses.length, 1);
        assertEq(responses[0], responseURI);
    }

    function test_respondToFeedback_emitsEvent() public {
        _submitDefaultFeedback(client1, AGENT_ID);

        vm.expectEmit(true, true, false, true);
        emit ResponseSubmitted(AGENT_ID, client1, 0);

        vm.prank(agentOwner);
        registry.respondToFeedback(AGENT_ID, client1, 0, "ipfs://QmResponse123");
    }

    function test_respondToFeedback_revertIfNotOwner() public {
        _submitDefaultFeedback(client1, AGENT_ID);

        vm.prank(client2);
        vm.expectRevert(abi.encodeWithSelector(ITALReputationRegistry.NotAgentOwner.selector, AGENT_ID, client2));
        registry.respondToFeedback(AGENT_ID, client1, 0, "ipfs://QmResponse123");
    }

    function test_getResponses_returnsAll() public {
        _submitDefaultFeedback(client1, AGENT_ID);

        vm.startPrank(agentOwner);
        registry.respondToFeedback(AGENT_ID, client1, 0, "ipfs://QmResponse1");
        registry.respondToFeedback(AGENT_ID, client1, 0, "ipfs://QmResponse2");
        registry.respondToFeedback(AGENT_ID, client1, 0, "ipfs://QmResponse3");
        vm.stopPrank();

        string[] memory responses = registry.getResponses(AGENT_ID, client1, 0);
        assertEq(responses.length, 3);
        assertEq(responses[0], "ipfs://QmResponse1");
        assertEq(responses[1], "ipfs://QmResponse2");
        assertEq(responses[2], "ipfs://QmResponse3");
    }

    // ============ 4. Summary Tests ============

    function test_getSummary_singleClient() public {
        _submitFeedbackWithValue(client1, AGENT_ID, 80);

        address[] memory clients = new address[](1);
        clients[0] = client1;

        IERC8004ReputationRegistry.FeedbackSummary memory summary = registry.getSummary(AGENT_ID, clients);

        assertEq(summary.totalValue, 80);
        assertEq(summary.count, 1);
        assertEq(summary.min, 80);
        assertEq(summary.max, 80);
    }

    function test_getSummary_multipleClients() public {
        _submitFeedbackWithValue(client1, AGENT_ID, 80);
        _submitFeedbackWithValue(client2, AGENT_ID, 60);
        _submitFeedbackWithValue(client3, AGENT_ID, -20);

        address[] memory clients = new address[](3);
        clients[0] = client1;
        clients[1] = client2;
        clients[2] = client3;

        IERC8004ReputationRegistry.FeedbackSummary memory summary = registry.getSummary(AGENT_ID, clients);

        assertEq(summary.totalValue, 120); // 80 + 60 - 20
        assertEq(summary.count, 3);
        assertEq(summary.min, -20);
        assertEq(summary.max, 80);
    }

    function test_getSummary_excludesRevoked() public {
        _submitFeedbackWithValue(client1, AGENT_ID, 80);
        _submitFeedbackWithValue(client2, AGENT_ID, -50);

        // Revoke client2's feedback
        vm.prank(client2);
        registry.revokeFeedback(AGENT_ID, 0);

        address[] memory clients = new address[](2);
        clients[0] = client1;
        clients[1] = client2;

        IERC8004ReputationRegistry.FeedbackSummary memory summary = registry.getSummary(AGENT_ID, clients);

        assertEq(summary.totalValue, 80);
        assertEq(summary.count, 1);
        assertEq(summary.min, 80);
        assertEq(summary.max, 80);
    }

    function test_getSummary_revertIfNoClients() public {
        address[] memory clients = new address[](0);

        vm.expectRevert(ITALReputationRegistry.NoFeedbackToAggregate.selector);
        registry.getSummary(AGENT_ID, clients);
    }

    // ============ 5. Stake-Weighted Summary Tests ============

    function test_getStakeWeightedSummary_equalStakes() public {
        // Set equal stakes for all clients
        stakingBridge.setStake(client1, 100 ether);
        stakingBridge.setStake(client2, 100 ether);

        _submitFeedbackWithValue(client1, AGENT_ID, 60);
        _submitFeedbackWithValue(client2, AGENT_ID, 100);

        address[] memory clients = new address[](2);
        clients[0] = client1;
        clients[1] = client2;

        ITALReputationRegistry.StakeWeightedSummary memory summary = registry.getStakeWeightedSummary(AGENT_ID, clients);

        // With equal stakes (sqrt weights equal), weighted average = simple average = (60 + 100) / 2 = 80
        // weightedTotal = 80 * PRECISION
        assertEq(summary.count, 2);
        assertEq(summary.min, 60);
        assertEq(summary.max, 100);
        // Both clients have sqrt(100e18) weight
        assertTrue(summary.totalWeight > 0);
    }

    function test_getStakeWeightedSummary_differentStakes() public {
        // client1: 100 ether stake -> sqrt weight = 10e9
        // client2: 400 ether stake -> sqrt weight = 20e9
        stakingBridge.setStake(client1, 100 ether);
        stakingBridge.setStake(client2, 400 ether);

        _submitFeedbackWithValue(client1, AGENT_ID, 100);
        _submitFeedbackWithValue(client2, AGENT_ID, 0);

        address[] memory clients = new address[](2);
        clients[0] = client1;
        clients[1] = client2;

        ITALReputationRegistry.StakeWeightedSummary memory summary = registry.getStakeWeightedSummary(AGENT_ID, clients);

        // Weighted avg = (100 * 10e9 + 0 * 20e9) / (10e9 + 20e9) = 1000e9 / 30e9 = 33.33
        assertEq(summary.count, 2);
        assertEq(summary.min, 0);
        assertEq(summary.max, 100);

        // weightedTotalValue should reflect the sqrt weighting
        // The higher staker (client2) has more influence but not proportionally (sqrt damping)
        assertTrue(summary.weightedTotalValue > 0);
    }

    function test_getStakeWeightedSummary_sqrtWeighting() public {
        // Verify sqrt weighting: 4x stake should only give 2x weight
        stakingBridge.setStake(client1, 100 ether);  // weight = sqrt(100e18) = 10e9
        stakingBridge.setStake(client2, 400 ether);  // weight = sqrt(400e18) = 20e9

        _submitFeedbackWithValue(client1, AGENT_ID, 100);
        _submitFeedbackWithValue(client2, AGENT_ID, 100);

        address[] memory clients = new address[](2);
        clients[0] = client1;
        clients[1] = client2;

        ITALReputationRegistry.StakeWeightedSummary memory summary = registry.getStakeWeightedSummary(AGENT_ID, clients);

        // Total weight = 10e9 + 20e9 = 30e9
        uint256 expectedWeight = ReputationMath.sqrt(100 ether) + ReputationMath.sqrt(400 ether);
        assertEq(summary.totalWeight, expectedWeight);
    }

    // ============ 6. Payment Proof Tests ============

    function test_submitFeedbackWithPaymentProof_success() public {
        _submitFeedbackWithPaymentProof(client1, AGENT_ID, 90);

        IERC8004ReputationRegistry.Feedback[] memory feedbacks = registry.getFeedback(AGENT_ID, client1);
        assertEq(feedbacks.length, 1);
        assertEq(feedbacks[0].value, 90);
    }

    function test_hasPaymentProof_returnsTrue() public {
        _submitFeedbackWithPaymentProof(client1, AGENT_ID, 90);

        bool hasProof = registry.hasPaymentProof(AGENT_ID, client1, 0);
        assertTrue(hasProof);
    }

    function test_hasPaymentProof_returnsFalseForRegular() public {
        _submitDefaultFeedback(client1, AGENT_ID);

        bool hasProof = registry.hasPaymentProof(AGENT_ID, client1, 0);
        assertFalse(hasProof);
    }

    function test_submitFeedbackWithPaymentProof_emitsEvents() public {
        bytes memory paymentProof = abi.encodePacked("valid_payment_proof");
        bytes32 paymentProofHash = keccak256(paymentProof);

        vm.expectEmit(true, true, false, true);
        emit FeedbackWithPaymentProofSubmitted(AGENT_ID, client1, DEFAULT_VALUE, paymentProofHash);

        vm.expectEmit(true, true, false, true);
        emit FeedbackSubmitted(AGENT_ID, client1, DEFAULT_VALUE, _tag1, _tag2);

        vm.prank(client1);
        registry.submitFeedbackWithPaymentProof(
            AGENT_ID,
            DEFAULT_VALUE,
            DEFAULT_DECIMALS,
            _tag1,
            _tag2,
            _endpoint,
            _feedbackURI,
            DEFAULT_FEEDBACK_HASH,
            paymentProof
        );
    }

    function test_submitFeedbackWithPaymentProof_revertIfEmptyProof() public {
        bytes memory emptyProof = "";

        vm.prank(client1);
        vm.expectRevert(ITALReputationRegistry.InvalidPaymentProof.selector);
        registry.submitFeedbackWithPaymentProof(
            AGENT_ID,
            DEFAULT_VALUE,
            DEFAULT_DECIMALS,
            _tag1,
            _tag2,
            _endpoint,
            _feedbackURI,
            DEFAULT_FEEDBACK_HASH,
            emptyProof
        );
    }

    // ============ 7. Merkle Root Tests ============

    function test_updateReputationMerkleRoot_success() public {
        bytes32 newRoot = keccak256("new merkle root");

        vm.prank(admin);
        registry.updateReputationMerkleRoot(newRoot);

        assertEq(registry.getReputationMerkleRoot(), newRoot);
    }

    function test_updateReputationMerkleRoot_emitsEvent() public {
        bytes32 newRoot = keccak256("new merkle root");

        vm.expectEmit(true, false, false, true);
        emit ReputationMerkleRootUpdated(newRoot, block.timestamp);

        vm.prank(admin);
        registry.updateReputationMerkleRoot(newRoot);
    }

    function test_updateReputationMerkleRoot_revertIfNotUpdater() public {
        bytes32 newRoot = keccak256("new merkle root");

        vm.prank(nonAdmin);
        vm.expectRevert();
        registry.updateReputationMerkleRoot(newRoot);
    }

    function test_getReputationMerkleRoot_returnsCorrect() public {
        // Initially zero
        assertEq(registry.getReputationMerkleRoot(), bytes32(0));

        bytes32 root1 = keccak256("root 1");
        vm.prank(admin);
        registry.updateReputationMerkleRoot(root1);
        assertEq(registry.getReputationMerkleRoot(), root1);

        bytes32 root2 = keccak256("root 2");
        vm.prank(admin);
        registry.updateReputationMerkleRoot(root2);
        assertEq(registry.getReputationMerkleRoot(), root2);
    }

    // ============ 8. Query Tests ============

    function test_getClientList_returnsAll() public {
        _submitDefaultFeedback(client1, AGENT_ID);
        _submitDefaultFeedback(client2, AGENT_ID);
        _submitDefaultFeedback(client3, AGENT_ID);

        address[] memory clients = registry.getClientList(AGENT_ID);

        assertEq(clients.length, 3);
        assertEq(clients[0], client1);
        assertEq(clients[1], client2);
        assertEq(clients[2], client3);
    }

    function test_getFeedbackCount_returnsCorrect() public {
        assertEq(registry.getFeedbackCount(AGENT_ID), 0);

        _submitDefaultFeedback(client1, AGENT_ID);
        assertEq(registry.getFeedbackCount(AGENT_ID), 1);

        _submitDefaultFeedback(client1, AGENT_ID);
        assertEq(registry.getFeedbackCount(AGENT_ID), 2);

        _submitDefaultFeedback(client2, AGENT_ID);
        assertEq(registry.getFeedbackCount(AGENT_ID), 3);

        // Feedback count includes revoked feedbacks
        vm.prank(client1);
        registry.revokeFeedback(AGENT_ID, 0);
        assertEq(registry.getFeedbackCount(AGENT_ID), 3);
    }

    function test_getFeedback_returnsAll() public {
        _submitFeedbackWithValue(client1, AGENT_ID, 50);
        _submitFeedbackWithValue(client1, AGENT_ID, 70);
        _submitFeedbackWithValue(client1, AGENT_ID, 90);

        IERC8004ReputationRegistry.Feedback[] memory feedbacks = registry.getFeedback(AGENT_ID, client1);

        assertEq(feedbacks.length, 3);
        assertEq(feedbacks[0].value, 50);
        assertEq(feedbacks[1].value, 70);
        assertEq(feedbacks[2].value, 90);
    }

    // ============ 9. Access Control Tests ============

    function test_pause_onlyPauser() public {
        // Admin has PAUSER_ROLE
        vm.prank(admin);
        registry.pause();
        assertTrue(registry.paused());

        vm.prank(admin);
        registry.unpause();
        assertFalse(registry.paused());

        // Non-admin cannot pause
        vm.prank(nonAdmin);
        vm.expectRevert();
        registry.pause();
    }

    function test_submitFeedback_revertWhenPaused() public {
        vm.prank(admin);
        registry.pause();

        vm.prank(client1);
        vm.expectRevert();
        registry.submitFeedback(
            AGENT_ID,
            DEFAULT_VALUE,
            DEFAULT_DECIMALS,
            _tag1,
            _tag2,
            _endpoint,
            _feedbackURI,
            DEFAULT_FEEDBACK_HASH
        );
    }

    function test_submitFeedbackWithPaymentProof_revertWhenPaused() public {
        vm.prank(admin);
        registry.pause();

        bytes memory paymentProof = abi.encodePacked("valid_payment_proof");

        vm.prank(client1);
        vm.expectRevert();
        registry.submitFeedbackWithPaymentProof(
            AGENT_ID,
            DEFAULT_VALUE,
            DEFAULT_DECIMALS,
            _tag1,
            _tag2,
            _endpoint,
            _feedbackURI,
            DEFAULT_FEEDBACK_HASH,
            paymentProof
        );
    }

    // ============ 10. Edge Cases ============

    function test_submitFeedback_maxScore() public {
        _submitFeedbackWithValue(client1, AGENT_ID, 100);

        IERC8004ReputationRegistry.Feedback[] memory feedbacks = registry.getFeedback(AGENT_ID, client1);
        assertEq(feedbacks[0].value, 100);
    }

    function test_submitFeedback_minScore() public {
        _submitFeedbackWithValue(client1, AGENT_ID, -100);

        IERC8004ReputationRegistry.Feedback[] memory feedbacks = registry.getFeedback(AGENT_ID, client1);
        assertEq(feedbacks[0].value, -100);
    }

    function test_getSummary_manyFeedbacks() public {
        // Submit many feedbacks from multiple clients
        for (uint256 i = 0; i < 20; i++) {
            address client = address(uint160(1000 + i));

            vm.prank(client);
            registry.submitFeedback(
                AGENT_ID,
                int128(int256(i * 10)) - 100, // Values from -100 to 90
                DEFAULT_DECIMALS,
                _tag1,
                _tag2,
                _endpoint,
                _feedbackURI,
                DEFAULT_FEEDBACK_HASH
            );
        }

        address[] memory clients = new address[](20);
        for (uint256 i = 0; i < 20; i++) {
            clients[i] = address(uint160(1000 + i));
        }

        IERC8004ReputationRegistry.FeedbackSummary memory summary = registry.getSummary(AGENT_ID, clients);

        assertEq(summary.count, 20);
        assertEq(summary.min, -100);
        assertEq(summary.max, 90);
    }

    function test_submitFeedback_zeroScore() public {
        _submitFeedbackWithValue(client1, AGENT_ID, 0);

        IERC8004ReputationRegistry.Feedback[] memory feedbacks = registry.getFeedback(AGENT_ID, client1);
        assertEq(feedbacks[0].value, 0);
    }

    function test_getSummary_allRevokedReturnsZeroCounts() public {
        _submitFeedbackWithValue(client1, AGENT_ID, 80);

        vm.prank(client1);
        registry.revokeFeedback(AGENT_ID, 0);

        address[] memory clients = new address[](1);
        clients[0] = client1;

        IERC8004ReputationRegistry.FeedbackSummary memory summary = registry.getSummary(AGENT_ID, clients);

        // All feedbacks revoked, so count should be 0
        assertEq(summary.count, 0);
        assertEq(summary.totalValue, 0);
    }

    function test_getStakeWeightedSummary_zeroStakes() public {
        // Set zero stakes
        stakingBridge.setStake(client1, 0);
        stakingBridge.setStake(client2, 0);

        _submitFeedbackWithValue(client1, AGENT_ID, 80);
        _submitFeedbackWithValue(client2, AGENT_ID, 60);

        address[] memory clients = new address[](2);
        clients[0] = client1;
        clients[1] = client2;

        ITALReputationRegistry.StakeWeightedSummary memory summary = registry.getStakeWeightedSummary(AGENT_ID, clients);

        // With zero stakes, weights are 0
        assertEq(summary.totalWeight, 0);
    }

    function test_respondToFeedback_revertIfFeedbackNotFound() public {
        vm.prank(agentOwner);
        vm.expectRevert(abi.encodeWithSelector(ITALReputationRegistry.FeedbackNotFound.selector, AGENT_ID, client1, 0));
        registry.respondToFeedback(AGENT_ID, client1, 0, "ipfs://QmResponse123");
    }

    // ============ Reviewer Reputation Tests ============

    function test_getReviewerReputation_initial() public view {
        assertEq(registry.getReviewerReputation(client1), 0);
    }

    function test_updateReviewerReputation_success() public {
        vm.prank(admin);
        registry.updateReviewerReputation(client1, 5000);

        assertEq(registry.getReviewerReputation(client1), 5000);
    }

    function test_updateReviewerReputation_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit ReviewerReputationUpdated(client1, 7500);

        vm.prank(admin);
        registry.updateReviewerReputation(client1, 7500);
    }

    function test_updateReviewerReputation_revertIfNotManager() public {
        vm.prank(nonAdmin);
        vm.expectRevert();
        registry.updateReviewerReputation(client1, 5000);
    }

    // ============ Verified Summary Tests ============

    function test_getVerifiedSummary_onlyPaymentProof() public {
        // Submit regular feedback
        _submitFeedbackWithValue(client1, AGENT_ID, 50);
        // Submit payment-proof feedback
        _submitFeedbackWithPaymentProof(client2, AGENT_ID, 90);

        address[] memory clients = new address[](2);
        clients[0] = client1;
        clients[1] = client2;

        IERC8004ReputationRegistry.FeedbackSummary memory summary = registry.getVerifiedSummary(AGENT_ID, clients);

        // Only payment-proof feedback should be included
        assertEq(summary.count, 1);
        assertEq(summary.totalValue, 90);
        assertEq(summary.min, 90);
        assertEq(summary.max, 90);
    }

    function test_getVerifiedSummary_excludesRevoked() public {
        _submitFeedbackWithPaymentProof(client1, AGENT_ID, 80);
        _submitFeedbackWithPaymentProof(client2, AGENT_ID, 60);

        // Revoke client1's feedback
        vm.prank(client1);
        registry.revokeFeedback(AGENT_ID, 0);

        address[] memory clients = new address[](2);
        clients[0] = client1;
        clients[1] = client2;

        IERC8004ReputationRegistry.FeedbackSummary memory summary = registry.getVerifiedSummary(AGENT_ID, clients);

        assertEq(summary.count, 1);
        assertEq(summary.totalValue, 60);
    }

    // ============ Admin Functions Tests ============

    function test_setIdentityRegistry() public {
        address newRegistry = address(0x999);

        vm.prank(admin);
        registry.setIdentityRegistry(newRegistry);

        assertEq(registry.identityRegistry(), newRegistry);
    }

    function test_setStakingBridge() public {
        address newStaking = address(0x888);

        vm.prank(admin);
        registry.setStakingBridge(newStaking);

        assertEq(registry.stakingBridge(), newStaking);
    }

    function test_setValidationRegistry() public {
        address newValidation = address(0x777);

        vm.prank(admin);
        registry.setValidationRegistry(newValidation);

        assertEq(registry.validationRegistry(), newValidation);
    }

    function test_setIdentityRegistry_revertIfNotAdmin() public {
        vm.prank(nonAdmin);
        vm.expectRevert();
        registry.setIdentityRegistry(address(0x999));
    }

    // ============ No Identity Registry Tests ============

    function test_submitFeedback_worksWithoutIdentityRegistry() public {
        // Deploy a new registry without identity registry
        bytes memory initData = abi.encodeWithSelector(
            TALReputationRegistry.initialize.selector,
            admin,
            address(0), // No identity registry
            address(stakingBridge)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(registryImpl), initData);
        TALReputationRegistry noIdRegistry = TALReputationRegistry(address(proxy));

        vm.prank(client1);
        noIdRegistry.submitFeedback(
            AGENT_ID,
            DEFAULT_VALUE,
            DEFAULT_DECIMALS,
            _tag1,
            _tag2,
            _endpoint,
            _feedbackURI,
            DEFAULT_FEEDBACK_HASH
        );

        IERC8004ReputationRegistry.Feedback[] memory feedbacks = noIdRegistry.getFeedback(AGENT_ID, client1);
        assertEq(feedbacks.length, 1);
    }

    function test_getStakeWeightedSummary_defaultWeightWithoutStakingBridge() public {
        // Deploy a new registry without staking bridge
        bytes memory initData = abi.encodeWithSelector(
            TALReputationRegistry.initialize.selector,
            admin,
            address(0),
            address(0) // No staking bridge
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(registryImpl), initData);
        TALReputationRegistry noStakeRegistry = TALReputationRegistry(address(proxy));

        vm.prank(client1);
        noStakeRegistry.submitFeedback(
            AGENT_ID,
            80,
            DEFAULT_DECIMALS,
            _tag1,
            _tag2,
            _endpoint,
            _feedbackURI,
            DEFAULT_FEEDBACK_HASH
        );

        address[] memory clients = new address[](1);
        clients[0] = client1;

        ITALReputationRegistry.StakeWeightedSummary memory summary = noStakeRegistry.getStakeWeightedSummary(AGENT_ID, clients);

        // Should use default weight of 1 ether
        assertEq(summary.count, 1);
        uint256 expectedWeight = ReputationMath.sqrt(1 ether);
        assertEq(summary.totalWeight, expectedWeight);
    }

    // ============ Multiple Feedbacks Per Client Tests ============

    function test_multipleFeedbacksPerClient_inSummary() public {
        // Submit multiple feedbacks from same client
        _submitFeedbackWithValue(client1, AGENT_ID, 80);
        _submitFeedbackWithValue(client1, AGENT_ID, 60);
        _submitFeedbackWithValue(client1, AGENT_ID, 40);

        address[] memory clients = new address[](1);
        clients[0] = client1;

        IERC8004ReputationRegistry.FeedbackSummary memory summary = registry.getSummary(AGENT_ID, clients);

        assertEq(summary.count, 3);
        assertEq(summary.totalValue, 180); // 80 + 60 + 40
        assertEq(summary.min, 40);
        assertEq(summary.max, 80);
    }

    function test_revokeSpecificFeedback() public {
        _submitFeedbackWithValue(client1, AGENT_ID, 100);
        _submitFeedbackWithValue(client1, AGENT_ID, 50);
        _submitFeedbackWithValue(client1, AGENT_ID, -25);

        // Revoke middle feedback
        vm.prank(client1);
        registry.revokeFeedback(AGENT_ID, 1);

        address[] memory clients = new address[](1);
        clients[0] = client1;

        IERC8004ReputationRegistry.FeedbackSummary memory summary = registry.getSummary(AGENT_ID, clients);

        assertEq(summary.count, 2); // Only 2 non-revoked
        assertEq(summary.totalValue, 75); // 100 + (-25)
        assertEq(summary.min, -25);
        assertEq(summary.max, 100);
    }

    // ============ Fuzz Tests ============

    // ============ TaskFeeEscrow Usage Validation Tests ============

    function test_SubmitFeedback_SucceedsWhenTaskFeeEscrowNotSet() public {
        // By default taskFeeEscrow is not set (address(0))
        // Feedback should work normally (backward compatible)
        _submitDefaultFeedback(client1, AGENT_ID);

        IERC8004ReputationRegistry.Feedback[] memory feedbacks = registry.getFeedback(AGENT_ID, client1);
        assertEq(feedbacks.length, 1);
    }

    function test_SubmitFeedback_SucceedsWhenUserHasUsedAgent() public {
        MockTaskFeeEscrow mockEscrow = new MockTaskFeeEscrow();
        mockEscrow.setHasUsedAgent(AGENT_ID, client1, true);

        vm.prank(admin);
        registry.setTaskFeeEscrow(address(mockEscrow));

        _submitDefaultFeedback(client1, AGENT_ID);

        IERC8004ReputationRegistry.Feedback[] memory feedbacks = registry.getFeedback(AGENT_ID, client1);
        assertEq(feedbacks.length, 1);
    }

    function test_SubmitFeedback_RevertsWhenUserHasNotUsedAgent() public {
        MockTaskFeeEscrow mockEscrow = new MockTaskFeeEscrow();
        // client1 has NOT used the agent (default false)

        vm.prank(admin);
        registry.setTaskFeeEscrow(address(mockEscrow));

        vm.prank(client1);
        vm.expectRevert(abi.encodeWithSelector(ITALReputationRegistry.NotAgentUser.selector, AGENT_ID, client1));
        registry.submitFeedback(
            AGENT_ID,
            DEFAULT_VALUE,
            DEFAULT_DECIMALS,
            _tag1,
            _tag2,
            _endpoint,
            _feedbackURI,
            DEFAULT_FEEDBACK_HASH
        );
    }

    function test_SetTaskFeeEscrow_OnlyAdmin() public {
        address mockAddr = address(0xBEEF);

        vm.prank(admin);
        registry.setTaskFeeEscrow(mockAddr);

        assertEq(registry.taskFeeEscrow(), mockAddr);
    }

    function test_SetTaskFeeEscrow_RevertsNonAdmin() public {
        vm.prank(nonAdmin);
        vm.expectRevert();
        registry.setTaskFeeEscrow(address(0xBEEF));
    }

    // ============ Fuzz Tests ============

    function testFuzz_submitFeedback_normalizes(int128 value) public {
        vm.prank(client1);
        registry.submitFeedback(
            AGENT_ID,
            value,
            DEFAULT_DECIMALS,
            _tag1,
            _tag2,
            _endpoint,
            _feedbackURI,
            DEFAULT_FEEDBACK_HASH
        );

        IERC8004ReputationRegistry.Feedback[] memory feedbacks = registry.getFeedback(AGENT_ID, client1);

        assertTrue(feedbacks[0].value >= -100);
        assertTrue(feedbacks[0].value <= 100);
    }

    function testFuzz_getStakeWeightedSummary_validOutput(uint256 stake1, uint256 stake2) public {
        // Bound stakes to reasonable values
        stake1 = bound(stake1, 1, 1e30);
        stake2 = bound(stake2, 1, 1e30);

        stakingBridge.setStake(client1, stake1);
        stakingBridge.setStake(client2, stake2);

        _submitFeedbackWithValue(client1, AGENT_ID, 50);
        _submitFeedbackWithValue(client2, AGENT_ID, 75);

        address[] memory clients = new address[](2);
        clients[0] = client1;
        clients[1] = client2;

        ITALReputationRegistry.StakeWeightedSummary memory summary = registry.getStakeWeightedSummary(AGENT_ID, clients);

        assertEq(summary.count, 2);
        assertEq(summary.min, 50);
        assertEq(summary.max, 75);
        assertTrue(summary.totalWeight > 0);
    }
}
