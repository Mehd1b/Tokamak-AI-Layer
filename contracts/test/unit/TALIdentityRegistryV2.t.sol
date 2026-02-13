// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {TALIdentityRegistryV2} from "../../src/core/TALIdentityRegistryV2.sol";
import {TALIdentityRegistry} from "../../src/core/TALIdentityRegistry.sol";
import {ITALIdentityRegistry} from "../../src/interfaces/ITALIdentityRegistry.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MockStakingV3} from "../mocks/MockStakingV3.sol";
import {MockValidationRegistry} from "../mocks/MockValidationRegistry.sol";

/**
 * @title TALIdentityRegistryV2Test
 * @notice Comprehensive tests for TALIdentityRegistryV2 upgrade
 */
contract TALIdentityRegistryV2Test is Test {
    // ============ Constants ============
    uint256 public constant MIN_OPERATOR_STAKE = 1000 ether;
    uint256 public constant REACTIVATION_COOLDOWN = 7 days;
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant SLASHER_ROLE = keccak256("SLASHER_ROLE");

    // ============ Contracts ============
    TALIdentityRegistryV2 public registry;
    TALIdentityRegistry public v1Implementation;
    TALIdentityRegistryV2 public v2Implementation;
    MockStakingV3 public stakingBridge;
    MockValidationRegistry public validationRegistry;

    // ============ Test Accounts ============
    address public admin = makeAddr("admin");
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");
    address public treasury = makeAddr("treasury");

    // Operator private keys for EIP-712 signing
    uint256 public operator1PrivateKey = 0xA001;
    uint256 public operator2PrivateKey = 0xA002;
    uint256 public operator3PrivateKey = 0xA003;
    address public operator1;
    address public operator2;
    address public operator3;

    // ============ Test Data ============
    string public constant AGENT_URI = "ipfs://QmTestAgent123";
    string public constant AGENT_URI_2 = "ipfs://QmTestAgent456";

    // ============ EIP-712 Constants ============
    bytes32 private constant OPERATOR_CONSENT_TYPEHASH = keccak256(
        "OperatorConsent(address operator,address agentOwner,string agentURI,uint8 validationModel,uint256 nonce,uint256 deadline)"
    );

    // ============ Setup ============

    function setUp() public {
        // Derive operator addresses from private keys
        operator1 = vm.addr(operator1PrivateKey);
        operator2 = vm.addr(operator2PrivateKey);
        operator3 = vm.addr(operator3PrivateKey);

        // Deploy mocks
        stakingBridge = new MockStakingV3();
        validationRegistry = new MockValidationRegistry();

        // Set operator stakes (1500 TON each — above 1000 TON minimum)
        stakingBridge.setStake(operator1, 1500 ether);
        stakingBridge.setStake(operator2, 2000 ether);
        stakingBridge.setStake(operator3, 1500 ether);

        // Deploy V1 implementation + proxy (simulates existing deployment)
        v1Implementation = new TALIdentityRegistry();
        bytes memory v1InitData = abi.encodeWithSelector(
            TALIdentityRegistry.initialize.selector,
            admin,
            address(stakingBridge),
            address(0) // no zk verifier
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(v1Implementation), v1InitData);

        // Upgrade proxy to V2
        v2Implementation = new TALIdentityRegistryV2();
        vm.prank(admin);
        TALIdentityRegistry(address(proxy)).upgradeToAndCall(
            address(v2Implementation),
            abi.encodeWithSelector(
                TALIdentityRegistryV2.initializeV2.selector,
                treasury,
                address(stakingBridge),
                address(validationRegistry),
                address(0), // reputation registry
                MIN_OPERATOR_STAKE,
                REACTIVATION_COOLDOWN
            )
        );

        registry = TALIdentityRegistryV2(address(proxy));

        // Fund test accounts
        vm.deal(user1, 100 ether);
        vm.deal(user2, 100 ether);
    }

    // ============ Helpers ============

    function _signOperatorConsent(
        uint256 privateKey,
        TALIdentityRegistryV2.OperatorConsentData memory consent
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(
            OPERATOR_CONSENT_TYPEHASH,
            consent.operator,
            consent.agentOwner,
            keccak256(bytes(consent.agentURI)),
            consent.validationModel,
            consent.nonce,
            consent.deadline
        ));

        // Build EIP-712 domain separator matching EIP712Upgradeable init
        bytes32 domainSeparator = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("TAL Identity Registry")),
            keccak256(bytes("2")),
            block.chainid,
            address(registry)
        ));

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _buildConsent(
        address operator,
        address owner,
        string memory uri,
        uint8 model,
        uint256 nonce,
        uint256 deadline
    ) internal pure returns (TALIdentityRegistryV2.OperatorConsentData memory) {
        return TALIdentityRegistryV2.OperatorConsentData({
            operator: operator,
            agentOwner: owner,
            agentURI: uri,
            validationModel: model,
            nonce: nonce,
            deadline: deadline
        });
    }

    function _registerV2WithSingleOperator(
        address owner,
        string memory uri,
        uint8 model,
        uint256 operatorPK
    ) internal returns (uint256) {
        address op = vm.addr(operatorPK);
        uint256 nonce = registry.operatorNonces(op);

        TALIdentityRegistryV2.OperatorConsentData[] memory consents =
            new TALIdentityRegistryV2.OperatorConsentData[](1);
        consents[0] = _buildConsent(op, owner, uri, model, nonce, block.timestamp + 1 hours);

        bytes[] memory signatures = new bytes[](1);
        signatures[0] = _signOperatorConsent(operatorPK, consents[0]);

        vm.prank(owner);
        return registry.registerV2(uri, model, consents, signatures);
    }

    function _registerV2WithTwoOperators(
        address owner,
        string memory uri,
        uint8 model
    ) internal returns (uint256) {
        uint256 nonce1 = registry.operatorNonces(operator1);
        uint256 nonce2 = registry.operatorNonces(operator2);

        TALIdentityRegistryV2.OperatorConsentData[] memory consents =
            new TALIdentityRegistryV2.OperatorConsentData[](2);
        consents[0] = _buildConsent(operator1, owner, uri, model, nonce1, block.timestamp + 1 hours);
        consents[1] = _buildConsent(operator2, owner, uri, model, nonce2, block.timestamp + 1 hours);

        bytes[] memory signatures = new bytes[](2);
        signatures[0] = _signOperatorConsent(operator1PrivateKey, consents[0]);
        signatures[1] = _signOperatorConsent(operator2PrivateKey, consents[1]);

        vm.prank(owner);
        return registry.registerV2(uri, model, consents, signatures);
    }

    // =====================================================================
    // REGISTRATION TESTS
    // =====================================================================

    function test_registerV2_stakesecured_with_valid_operators() public {
        uint256 agentId = _registerV2WithSingleOperator(user1, AGENT_URI, 1, operator1PrivateKey);

        assertEq(registry.ownerOf(agentId), user1);
        assertEq(registry.getAgentValidationModel(agentId), 1);
        assertEq(registry.getAgentStatus(agentId), 0); // ACTIVE

        address[] memory ops = registry.getAgentOperators(agentId);
        assertEq(ops.length, 1);
        assertEq(ops[0], operator1);
        assertTrue(registry.isOperatorOf(agentId, operator1));
    }

    function test_registerV2_hybrid_with_valid_operators() public {
        uint256 agentId = _registerV2WithTwoOperators(user1, AGENT_URI, 2);

        assertEq(registry.getAgentValidationModel(agentId), 2);
        address[] memory ops = registry.getAgentOperators(agentId);
        assertEq(ops.length, 2);
        assertEq(ops[0], operator1);
        assertEq(ops[1], operator2);
    }

    function test_registerV2_reputationonly_no_operators() public {
        TALIdentityRegistryV2.OperatorConsentData[] memory consents =
            new TALIdentityRegistryV2.OperatorConsentData[](0);
        bytes[] memory signatures = new bytes[](0);

        vm.prank(user1);
        uint256 agentId = registry.registerV2(AGENT_URI, 0, consents, signatures);

        assertEq(registry.ownerOf(agentId), user1);
        assertEq(registry.getAgentValidationModel(agentId), 0);
        address[] memory ops = registry.getAgentOperators(agentId);
        assertEq(ops.length, 0);
    }

    function test_registerV2_reputationonly_with_operators() public {
        // ReputationOnly can optionally have operators (no stake check)
        stakingBridge.setStake(operator1, 0); // no stake required for ReputationOnly

        uint256 nonce = registry.operatorNonces(operator1);
        TALIdentityRegistryV2.OperatorConsentData[] memory consents =
            new TALIdentityRegistryV2.OperatorConsentData[](1);
        consents[0] = _buildConsent(operator1, user1, AGENT_URI, 0, nonce, block.timestamp + 1 hours);

        bytes[] memory signatures = new bytes[](1);
        signatures[0] = _signOperatorConsent(operator1PrivateKey, consents[0]);

        vm.prank(user1);
        uint256 agentId = registry.registerV2(AGENT_URI, 0, consents, signatures);

        address[] memory ops = registry.getAgentOperators(agentId);
        assertEq(ops.length, 1);
        assertEq(ops[0], operator1);
    }

    function test_registerV2_reverts_stakesecured_no_operators() public {
        TALIdentityRegistryV2.OperatorConsentData[] memory consents =
            new TALIdentityRegistryV2.OperatorConsentData[](0);
        bytes[] memory signatures = new bytes[](0);

        vm.prank(user1);
        vm.expectRevert(TALIdentityRegistryV2.StakeSecuredRequiresOperators.selector);
        registry.registerV2(AGENT_URI, 1, consents, signatures);
    }

    function test_registerV2_reverts_invalid_signature() public {
        uint256 nonce = registry.operatorNonces(operator1);
        TALIdentityRegistryV2.OperatorConsentData[] memory consents =
            new TALIdentityRegistryV2.OperatorConsentData[](1);
        consents[0] = _buildConsent(operator1, user1, AGENT_URI, 1, nonce, block.timestamp + 1 hours);

        // Sign with wrong key (operator2's key for operator1's consent)
        bytes[] memory signatures = new bytes[](1);
        signatures[0] = _signOperatorConsent(operator2PrivateKey, consents[0]);

        vm.prank(user1);
        vm.expectRevert(TALIdentityRegistryV2.InvalidOperatorSignature.selector);
        registry.registerV2(AGENT_URI, 1, consents, signatures);
    }

    function test_registerV2_reverts_expired_signature() public {
        uint256 nonce = registry.operatorNonces(operator1);
        TALIdentityRegistryV2.OperatorConsentData[] memory consents =
            new TALIdentityRegistryV2.OperatorConsentData[](1);
        // deadline already passed
        consents[0] = _buildConsent(operator1, user1, AGENT_URI, 1, nonce, block.timestamp - 1);

        bytes[] memory signatures = new bytes[](1);
        signatures[0] = _signOperatorConsent(operator1PrivateKey, consents[0]);

        vm.prank(user1);
        vm.expectRevert(TALIdentityRegistryV2.SignatureExpired.selector);
        registry.registerV2(AGENT_URI, 1, consents, signatures);
    }

    function test_registerV2_reverts_replay_signature() public {
        // First registration succeeds
        _registerV2WithSingleOperator(user1, AGENT_URI, 1, operator1PrivateKey);

        // Replay with same nonce (nonce was incremented, so old nonce is invalid)
        uint256 oldNonce = 0; // was used in first registration
        TALIdentityRegistryV2.OperatorConsentData[] memory consents =
            new TALIdentityRegistryV2.OperatorConsentData[](1);
        consents[0] = _buildConsent(operator1, user1, AGENT_URI_2, 1, oldNonce, block.timestamp + 1 hours);

        bytes[] memory signatures = new bytes[](1);
        signatures[0] = _signOperatorConsent(operator1PrivateKey, consents[0]);

        vm.prank(user1);
        vm.expectRevert(TALIdentityRegistryV2.InvalidOperatorNonce.selector);
        registry.registerV2(AGENT_URI_2, 1, consents, signatures);
    }

    function test_registerV2_reverts_insufficient_stake() public {
        stakingBridge.setStake(operator1, 500 ether); // Below 1000 TON minimum

        uint256 nonce = registry.operatorNonces(operator1);
        TALIdentityRegistryV2.OperatorConsentData[] memory consents =
            new TALIdentityRegistryV2.OperatorConsentData[](1);
        consents[0] = _buildConsent(operator1, user1, AGENT_URI, 1, nonce, block.timestamp + 1 hours);

        bytes[] memory signatures = new bytes[](1);
        signatures[0] = _signOperatorConsent(operator1PrivateKey, consents[0]);

        vm.prank(user1);
        vm.expectRevert(
            abi.encodeWithSelector(
                TALIdentityRegistryV2.OperatorStakeInsufficient.selector,
                operator1, 500 ether, MIN_OPERATOR_STAKE
            )
        );
        registry.registerV2(AGENT_URI, 1, consents, signatures);
    }

    function test_registerV2_reverts_duplicate_operator() public {
        uint256 nonce = registry.operatorNonces(operator1);
        TALIdentityRegistryV2.OperatorConsentData[] memory consents =
            new TALIdentityRegistryV2.OperatorConsentData[](2);
        consents[0] = _buildConsent(operator1, user1, AGENT_URI, 1, nonce, block.timestamp + 1 hours);
        // Second consent with same operator but nonce+1 (nonce gets incremented)
        consents[1] = _buildConsent(operator1, user1, AGENT_URI, 1, nonce + 1, block.timestamp + 1 hours);

        bytes[] memory signatures = new bytes[](2);
        signatures[0] = _signOperatorConsent(operator1PrivateKey, consents[0]);
        signatures[1] = _signOperatorConsent(operator1PrivateKey, consents[1]);

        vm.prank(user1);
        // The first consent verifies and increments nonce. The duplicate check happens
        // before the second consent verification, catching the duplicate operator.
        vm.expectRevert(abi.encodeWithSelector(TALIdentityRegistryV2.DuplicateOperator.selector, operator1));
        registry.registerV2(AGENT_URI, 1, consents, signatures);
    }

    function test_registerV2_backward_compat_old_register() public {
        // Old register() should still work
        vm.prank(user1);
        uint256 agentId = registry.register(AGENT_URI);

        assertEq(registry.ownerOf(agentId), user1);
        assertEq(registry.getAgentValidationModel(agentId), 0); // defaults to ReputationOnly
        assertEq(registry.getAgentStatus(agentId), 0); // defaults to ACTIVE
    }

    function test_registerV2_reverts_invalid_validation_model() public {
        TALIdentityRegistryV2.OperatorConsentData[] memory consents =
            new TALIdentityRegistryV2.OperatorConsentData[](0);
        bytes[] memory signatures = new bytes[](0);

        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(TALIdentityRegistryV2.InvalidValidationModel.selector, uint8(3)));
        registry.registerV2(AGENT_URI, 3, consents, signatures);
    }

    function test_registerV2_nonce_increments_correctly() public {
        assertEq(registry.operatorNonces(operator1), 0);

        _registerV2WithSingleOperator(user1, AGENT_URI, 1, operator1PrivateKey);

        assertEq(registry.operatorNonces(operator1), 1);

        // Second registration with same operator (different agent) uses nonce=1
        _registerV2WithSingleOperator(user2, AGENT_URI_2, 1, operator1PrivateKey);

        assertEq(registry.operatorNonces(operator1), 2);
    }

    // =====================================================================
    // SLASHING TESTS
    // =====================================================================

    function test_slash_above_threshold() public {
        uint256 agentId = _registerV2WithSingleOperator(user1, AGENT_URI, 1, operator1PrivateKey);

        // Set validation stats: 10 total, 4 failed = 40% > 30%
        validationRegistry.setAgentStats(agentId, 10, 4);

        uint256 stakeBefore = stakingBridge.getOperatorStake(operator1);
        registry.checkAndSlash(agentId);
        uint256 stakeAfter = stakingBridge.getOperatorStake(operator1);

        // Agent should be paused
        assertEq(registry.getAgentStatus(agentId), 1); // PAUSED

        // Operator should have been slashed
        // slashAmount = (1000 ether * 25) / 100 = 250 ether
        assertEq(stakeBefore - stakeAfter, 250 ether);
    }

    function test_slash_below_threshold_reverts() public {
        uint256 agentId = _registerV2WithSingleOperator(user1, AGENT_URI, 1, operator1PrivateKey);

        // Set validation stats: 10 total, 3 failed = 30% (not >30%)
        validationRegistry.setAgentStats(agentId, 10, 3);

        vm.expectRevert(abi.encodeWithSelector(TALIdentityRegistryV2.BelowSlashThreshold.selector, 3, 10));
        registry.checkAndSlash(agentId);
    }

    function test_slash_pauses_agent() public {
        uint256 agentId = _registerV2WithSingleOperator(user1, AGENT_URI, 1, operator1PrivateKey);
        validationRegistry.setAgentStats(agentId, 10, 5); // 50%

        registry.checkAndSlash(agentId);

        assertEq(registry.getAgentStatus(agentId), 1); // PAUSED
        assertTrue(registry.getAgentPausedAt(agentId) > 0);
    }

    function test_slash_transfers_to_bridge() public {
        uint256 agentId = _registerV2WithSingleOperator(user1, AGENT_URI, 1, operator1PrivateKey);
        validationRegistry.setAgentStats(agentId, 10, 4);

        uint256 stakeBefore = stakingBridge.getOperatorStake(operator1);
        registry.checkAndSlash(agentId);
        uint256 stakeAfter = stakingBridge.getOperatorStake(operator1);

        // 25% of 1000 TON = 250 TON slashed
        assertEq(stakeBefore - stakeAfter, 250 ether);
    }

    function test_slash_splits_across_operators() public {
        uint256 agentId = _registerV2WithTwoOperators(user1, AGENT_URI, 1);
        validationRegistry.setAgentStats(agentId, 10, 4);

        uint256 stake1Before = stakingBridge.getOperatorStake(operator1);
        uint256 stake2Before = stakingBridge.getOperatorStake(operator2);

        registry.checkAndSlash(agentId);

        uint256 stake1After = stakingBridge.getOperatorStake(operator1);
        uint256 stake2After = stakingBridge.getOperatorStake(operator2);

        // 250 TON / 2 operators = 125 TON each
        assertEq(stake1Before - stake1After, 125 ether);
        assertEq(stake2Before - stake2After, 125 ether);
    }

    function test_slash_reputationonly_reverts() public {
        vm.prank(user1);
        uint256 agentId = registry.register(AGENT_URI);

        validationRegistry.setAgentStats(agentId, 10, 5);

        vm.expectRevert(abi.encodeWithSelector(TALIdentityRegistryV2.NotSlashableModel.selector, agentId));
        registry.checkAndSlash(agentId);
    }

    function test_slash_already_paused_reverts() public {
        uint256 agentId = _registerV2WithSingleOperator(user1, AGENT_URI, 1, operator1PrivateKey);
        validationRegistry.setAgentStats(agentId, 10, 5);

        registry.checkAndSlash(agentId);

        // Try slashing again while paused
        vm.expectRevert(abi.encodeWithSelector(TALIdentityRegistryV2.AgentNotActive.selector, agentId));
        registry.checkAndSlash(agentId);
    }

    function test_slash_no_validations_reverts() public {
        uint256 agentId = _registerV2WithSingleOperator(user1, AGENT_URI, 1, operator1PrivateKey);
        // totalValidations = 0

        vm.expectRevert(abi.encodeWithSelector(TALIdentityRegistryV2.NoValidationsInWindow.selector, agentId));
        registry.checkAndSlash(agentId);
    }

    function test_slash_emits_event() public {
        uint256 agentId = _registerV2WithSingleOperator(user1, AGENT_URI, 1, operator1PrivateKey);
        validationRegistry.setAgentStats(agentId, 10, 4);

        address[] memory expectedOps = new address[](1);
        expectedOps[0] = operator1;

        vm.expectEmit(true, false, false, true);
        emit TALIdentityRegistryV2.AgentSlashed(agentId, expectedOps, 250 ether, 4, 10);
        registry.checkAndSlash(agentId);
    }

    // =====================================================================
    // REACTIVATION TESTS
    // =====================================================================

    function test_reactivate_after_cooldown() public {
        uint256 agentId = _registerV2WithSingleOperator(user1, AGENT_URI, 1, operator1PrivateKey);
        validationRegistry.setAgentStats(agentId, 10, 5);
        registry.checkAndSlash(agentId);

        // Operator tops up stake
        stakingBridge.setStake(operator1, 1500 ether);

        // Warp past cooldown
        vm.warp(block.timestamp + REACTIVATION_COOLDOWN + 1);

        vm.prank(user1);
        registry.reactivate(agentId);

        assertEq(registry.getAgentStatus(agentId), 0); // ACTIVE
        assertEq(registry.getAgentPausedAt(agentId), 0);
    }

    function test_reactivate_before_cooldown_reverts() public {
        uint256 agentId = _registerV2WithSingleOperator(user1, AGENT_URI, 1, operator1PrivateKey);
        validationRegistry.setAgentStats(agentId, 10, 5);
        registry.checkAndSlash(agentId);

        // Try reactivating too early
        vm.warp(block.timestamp + REACTIVATION_COOLDOWN - 1);

        vm.prank(user1);
        vm.expectRevert(); // CooldownNotElapsed
        registry.reactivate(agentId);
    }

    function test_reactivate_not_owner_reverts() public {
        uint256 agentId = _registerV2WithSingleOperator(user1, AGENT_URI, 1, operator1PrivateKey);
        validationRegistry.setAgentStats(agentId, 10, 5);
        registry.checkAndSlash(agentId);

        vm.warp(block.timestamp + REACTIVATION_COOLDOWN + 1);

        vm.prank(user2); // Not the owner
        vm.expectRevert(abi.encodeWithSelector(ITALIdentityRegistry.NotAgentOwner.selector, agentId, user2));
        registry.reactivate(agentId);
    }

    function test_reactivate_insufficient_stake_reverts() public {
        uint256 agentId = _registerV2WithSingleOperator(user1, AGENT_URI, 1, operator1PrivateKey);
        validationRegistry.setAgentStats(agentId, 10, 5);
        registry.checkAndSlash(agentId);

        // Do NOT top up operator stake — it's now below minimum after slash
        stakingBridge.setStake(operator1, 500 ether);

        vm.warp(block.timestamp + REACTIVATION_COOLDOWN + 1);

        vm.prank(user1);
        vm.expectRevert(
            abi.encodeWithSelector(
                TALIdentityRegistryV2.OperatorStakeInsufficient.selector,
                operator1, 500 ether, MIN_OPERATOR_STAKE
            )
        );
        registry.reactivate(agentId);
    }

    function test_reactivate_not_paused_reverts() public {
        uint256 agentId = _registerV2WithSingleOperator(user1, AGENT_URI, 1, operator1PrivateKey);

        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(TALIdentityRegistryV2.AgentNotPaused.selector, agentId));
        registry.reactivate(agentId);
    }

    function test_canReactivate_returns_correct_values() public {
        uint256 agentId = _registerV2WithSingleOperator(user1, AGENT_URI, 1, operator1PrivateKey);

        // Active agent: can't reactivate
        assertFalse(registry.canReactivate(agentId));

        // Slash and pause
        validationRegistry.setAgentStats(agentId, 10, 5);
        registry.checkAndSlash(agentId);

        // Paused but cooldown not elapsed
        assertFalse(registry.canReactivate(agentId));

        // Cooldown elapsed but stake insufficient
        stakingBridge.setStake(operator1, 500 ether);
        vm.warp(block.timestamp + REACTIVATION_COOLDOWN + 1);
        assertFalse(registry.canReactivate(agentId));

        // Top up stake
        stakingBridge.setStake(operator1, 1500 ether);
        assertTrue(registry.canReactivate(agentId));
    }

    // =====================================================================
    // OPERATOR MANAGEMENT TESTS
    // =====================================================================

    function test_addOperator() public {
        uint256 agentId = _registerV2WithSingleOperator(user1, AGENT_URI, 1, operator1PrivateKey);

        // Add operator2
        uint256 nonce2 = registry.operatorNonces(operator2);
        TALIdentityRegistryV2.OperatorConsentData memory consent =
            _buildConsent(operator2, user1, AGENT_URI, 1, nonce2, block.timestamp + 1 hours);
        bytes memory sig = _signOperatorConsent(operator2PrivateKey, consent);

        vm.prank(user1);
        registry.addOperator(agentId, consent, sig);

        address[] memory ops = registry.getAgentOperators(agentId);
        assertEq(ops.length, 2);
        assertTrue(registry.isOperatorOf(agentId, operator2));
    }

    function test_addOperator_duplicate_reverts() public {
        uint256 agentId = _registerV2WithSingleOperator(user1, AGENT_URI, 1, operator1PrivateKey);

        uint256 nonce = registry.operatorNonces(operator1);
        TALIdentityRegistryV2.OperatorConsentData memory consent =
            _buildConsent(operator1, user1, AGENT_URI, 1, nonce, block.timestamp + 1 hours);
        bytes memory sig = _signOperatorConsent(operator1PrivateKey, consent);

        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(TALIdentityRegistryV2.OperatorAlreadyBacking.selector, agentId, operator1));
        registry.addOperator(agentId, consent, sig);
    }

    function test_removeOperator() public {
        uint256 agentId = _registerV2WithTwoOperators(user1, AGENT_URI, 1);

        vm.prank(user1);
        registry.removeOperator(agentId, operator1);

        address[] memory ops = registry.getAgentOperators(agentId);
        assertEq(ops.length, 1);
        assertEq(ops[0], operator2);
        assertFalse(registry.isOperatorOf(agentId, operator1));
    }

    function test_removeOperator_last_one_reverts() public {
        uint256 agentId = _registerV2WithSingleOperator(user1, AGENT_URI, 1, operator1PrivateKey);

        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(TALIdentityRegistryV2.MustKeepOneOperator.selector, agentId));
        registry.removeOperator(agentId, operator1);
    }

    function test_removeOperator_last_one_allowed_for_reputationonly() public {
        // ReputationOnly agents can have 0 operators
        uint256 nonce = registry.operatorNonces(operator1);
        TALIdentityRegistryV2.OperatorConsentData[] memory consents =
            new TALIdentityRegistryV2.OperatorConsentData[](1);
        consents[0] = _buildConsent(operator1, user1, AGENT_URI, 0, nonce, block.timestamp + 1 hours);

        bytes[] memory signatures = new bytes[](1);
        signatures[0] = _signOperatorConsent(operator1PrivateKey, consents[0]);

        vm.prank(user1);
        uint256 agentId = registry.registerV2(AGENT_URI, 0, consents, signatures);

        // Should succeed since model is ReputationOnly
        vm.prank(user1);
        registry.removeOperator(agentId, operator1);

        address[] memory ops = registry.getAgentOperators(agentId);
        assertEq(ops.length, 0);
    }

    function test_operatorExit() public {
        uint256 agentId = _registerV2WithTwoOperators(user1, AGENT_URI, 1);

        vm.prank(operator1);
        registry.operatorExit(agentId);

        address[] memory ops = registry.getAgentOperators(agentId);
        assertEq(ops.length, 1);
        assertEq(ops[0], operator2);
        assertFalse(registry.isOperatorOf(agentId, operator1));
    }

    function test_operatorExit_last_pauses_agent() public {
        uint256 agentId = _registerV2WithSingleOperator(user1, AGENT_URI, 1, operator1PrivateKey);

        vm.prank(operator1);
        registry.operatorExit(agentId);

        assertEq(registry.getAgentStatus(agentId), 1); // PAUSED
        assertTrue(registry.getAgentPausedAt(agentId) > 0);
    }

    function test_operatorExit_not_operator_reverts() public {
        uint256 agentId = _registerV2WithSingleOperator(user1, AGENT_URI, 1, operator1PrivateKey);

        vm.prank(operator2); // Not backing this agent
        vm.expectRevert(abi.encodeWithSelector(TALIdentityRegistryV2.OperatorNotBacking.selector, agentId, operator2));
        registry.operatorExit(agentId);
    }

    function test_operatorAgents_reverse_lookup() public {
        uint256 agentId1 = _registerV2WithSingleOperator(user1, AGENT_URI, 1, operator1PrivateKey);
        uint256 agentId2 = _registerV2WithSingleOperator(user2, AGENT_URI_2, 1, operator1PrivateKey);

        uint256[] memory agents = registry.getOperatorAgents(operator1);
        assertEq(agents.length, 2);
        assertEq(agents[0], agentId1);
        assertEq(agents[1], agentId2);
    }

    // =====================================================================
    // UPGRADE TESTS
    // =====================================================================

    function test_upgrade_preserves_storage() public {
        // Register a V1-style agent before upgrade check
        vm.prank(user1);
        uint256 agentId = registry.register(AGENT_URI);

        // Verify V1 data is intact after upgrade
        assertEq(registry.ownerOf(agentId), user1);
        assertEq(registry.agentURI(agentId), AGENT_URI);
        assertTrue(registry.agentExists(agentId));
        assertEq(registry.getAgentCount(), 1);

        // V1 agents should default to ReputationOnly / ACTIVE
        assertEq(registry.getAgentValidationModel(agentId), 0);
        assertEq(registry.getAgentStatus(agentId), 0);
    }

    function test_initializeV2_sets_params() public {
        assertEq(registry.protocolTreasury(), treasury);
        assertEq(registry.validationRegistry(), address(validationRegistry));
        assertEq(registry.minOperatorStake(), MIN_OPERATOR_STAKE);
        assertEq(registry.reactivationCooldown(), REACTIVATION_COOLDOWN);
    }

    function test_initializeV2_cannot_reinit() public {
        vm.prank(admin);
        vm.expectRevert(); // InvalidInitialization
        registry.initializeV2(
            treasury,
            address(stakingBridge),
            address(validationRegistry),
            address(0),
            MIN_OPERATOR_STAKE,
            REACTIVATION_COOLDOWN
        );
    }

    function test_upgrade_v1_register_then_v2_register() public {
        // V1-style register
        vm.prank(user1);
        uint256 v1AgentId = registry.register(AGENT_URI);

        // V2-style register
        uint256 v2AgentId = _registerV2WithSingleOperator(user2, AGENT_URI_2, 1, operator1PrivateKey);

        // IDs should be sequential
        assertEq(v2AgentId, v1AgentId + 1);

        // Both should coexist
        assertEq(registry.ownerOf(v1AgentId), user1);
        assertEq(registry.ownerOf(v2AgentId), user2);
        assertEq(registry.getAgentValidationModel(v1AgentId), 0);
        assertEq(registry.getAgentValidationModel(v2AgentId), 1);
    }

    // =====================================================================
    // ADMIN FUNCTION TESTS
    // =====================================================================

    function test_setMinOperatorStake() public {
        vm.prank(admin);
        registry.setMinOperatorStake(2000 ether);
        assertEq(registry.minOperatorStake(), 2000 ether);
    }

    function test_setReactivationCooldown() public {
        vm.prank(admin);
        registry.setReactivationCooldown(14 days);
        assertEq(registry.reactivationCooldown(), 14 days);
    }

    function test_setProtocolTreasury() public {
        address newTreasury = makeAddr("newTreasury");
        vm.prank(admin);
        registry.setProtocolTreasury(newTreasury);
        assertEq(registry.protocolTreasury(), newTreasury);
    }

    function test_admin_functions_revert_for_non_admin() public {
        vm.prank(user1);
        vm.expectRevert(); // AccessControlUnauthorizedAccount
        registry.setMinOperatorStake(2000 ether);
    }

    // =====================================================================
    // EDGE CASE TESTS
    // =====================================================================

    function test_checkAndSlash_nonexistent_agent_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(ITALIdentityRegistry.AgentNotFound.selector, 999));
        registry.checkAndSlash(999);
    }

    function test_registerV2_length_mismatch_reverts() public {
        TALIdentityRegistryV2.OperatorConsentData[] memory consents =
            new TALIdentityRegistryV2.OperatorConsentData[](1);
        bytes[] memory signatures = new bytes[](0); // mismatch

        consents[0] = _buildConsent(operator1, user1, AGENT_URI, 1, 0, block.timestamp + 1 hours);

        vm.prank(user1);
        vm.expectRevert(TALIdentityRegistryV2.LengthMismatch.selector);
        registry.registerV2(AGENT_URI, 1, consents, signatures);
    }

    function test_consent_owner_mismatch_reverts() public {
        uint256 nonce = registry.operatorNonces(operator1);
        TALIdentityRegistryV2.OperatorConsentData[] memory consents =
            new TALIdentityRegistryV2.OperatorConsentData[](1);
        // consent.agentOwner = user2, but msg.sender = user1
        consents[0] = _buildConsent(operator1, user2, AGENT_URI, 1, nonce, block.timestamp + 1 hours);

        bytes[] memory signatures = new bytes[](1);
        signatures[0] = _signOperatorConsent(operator1PrivateKey, consents[0]);

        vm.prank(user1);
        vm.expectRevert(TALIdentityRegistryV2.ConsentOwnerMismatch.selector);
        registry.registerV2(AGENT_URI, 1, consents, signatures);
    }

    function test_consent_uri_mismatch_reverts() public {
        uint256 nonce = registry.operatorNonces(operator1);
        TALIdentityRegistryV2.OperatorConsentData[] memory consents =
            new TALIdentityRegistryV2.OperatorConsentData[](1);
        // consent has different URI than registerV2 call
        consents[0] = _buildConsent(operator1, user1, AGENT_URI_2, 1, nonce, block.timestamp + 1 hours);

        bytes[] memory signatures = new bytes[](1);
        signatures[0] = _signOperatorConsent(operator1PrivateKey, consents[0]);

        vm.prank(user1);
        vm.expectRevert(TALIdentityRegistryV2.ConsentURIMismatch.selector);
        registry.registerV2(AGENT_URI, 1, consents, signatures);
    }

    function test_addOperator_when_paused_reverts() public {
        uint256 agentId = _registerV2WithSingleOperator(user1, AGENT_URI, 1, operator1PrivateKey);

        // Slash to pause
        validationRegistry.setAgentStats(agentId, 10, 5);
        registry.checkAndSlash(agentId);

        uint256 nonce = registry.operatorNonces(operator2);
        TALIdentityRegistryV2.OperatorConsentData memory consent =
            _buildConsent(operator2, user1, AGENT_URI, 1, nonce, block.timestamp + 1 hours);
        bytes memory sig = _signOperatorConsent(operator2PrivateKey, consent);

        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(TALIdentityRegistryV2.AgentNotActive.selector, agentId));
        registry.addOperator(agentId, consent, sig);
    }

    // =====================================================================
    // DEREGISTRATION TESTS
    // =====================================================================

    function test_deregister_v1_agent() public {
        vm.prank(user1);
        uint256 agentId = registry.register(AGENT_URI);

        vm.prank(user1);
        registry.deregister(agentId);

        // Agent should no longer exist (NFT burned)
        assertFalse(registry.agentExists(agentId));
        assertEq(registry.getAgentStatus(agentId), 2); // STATUS_DEREGISTERED
    }

    function test_deregister_v2_agent_with_operators() public {
        uint256 agentId = _registerV2WithTwoOperators(user1, AGENT_URI, 1);

        // Verify operators exist before
        address[] memory opsBefore = registry.getAgentOperators(agentId);
        assertEq(opsBefore.length, 2);

        vm.prank(user1);
        registry.deregister(agentId);

        // Agent should no longer exist
        assertFalse(registry.agentExists(agentId));
        assertEq(registry.getAgentStatus(agentId), 2);

        // Operators should be cleared
        address[] memory opsAfter = registry.getAgentOperators(agentId);
        assertEq(opsAfter.length, 0);
    }

    function test_deregister_emits_event() public {
        vm.prank(user1);
        uint256 agentId = registry.register(AGENT_URI);

        vm.prank(user1);
        vm.expectEmit(true, true, false, false);
        emit TALIdentityRegistryV2.AgentDeregistered(agentId, user1);
        registry.deregister(agentId);
    }

    function test_deregister_not_owner_reverts() public {
        vm.prank(user1);
        uint256 agentId = registry.register(AGENT_URI);

        vm.prank(user2);
        vm.expectRevert(abi.encodeWithSelector(ITALIdentityRegistry.NotAgentOwner.selector, agentId, user2));
        registry.deregister(agentId);
    }

    function test_deregister_nonexistent_reverts() public {
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(ITALIdentityRegistry.AgentNotFound.selector, 999));
        registry.deregister(999);
    }

    function test_deregister_already_deregistered_reverts() public {
        vm.prank(user1);
        uint256 agentId = registry.register(AGENT_URI);

        vm.prank(user1);
        registry.deregister(agentId);

        // Trying again should fail (NFT burned → AgentNotFound)
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(ITALIdentityRegistry.AgentNotFound.selector, agentId));
        registry.deregister(agentId);
    }

    function test_deregister_removes_from_owner_list() public {
        vm.prank(user1);
        uint256 agent1 = registry.register(AGENT_URI);
        vm.prank(user1);
        uint256 agent2 = registry.register(AGENT_URI_2);

        uint256[] memory beforeIds = registry.getAgentsByOwner(user1);
        assertEq(beforeIds.length, 2);

        vm.prank(user1);
        registry.deregister(agent1);

        uint256[] memory afterIds = registry.getAgentsByOwner(user1);
        assertEq(afterIds.length, 1);
        assertEq(afterIds[0], agent2);
    }

    function test_deregister_paused_agent() public {
        uint256 agentId = _registerV2WithSingleOperator(user1, AGENT_URI, 1, operator1PrivateKey);

        // Slash to pause
        validationRegistry.setAgentStats(agentId, 10, 5);
        registry.checkAndSlash(agentId);
        assertEq(registry.getAgentStatus(agentId), 1); // PAUSED

        // Owner can still deregister a paused agent
        vm.prank(user1);
        registry.deregister(agentId);

        assertFalse(registry.agentExists(agentId));
        assertEq(registry.getAgentStatus(agentId), 2);
    }
}
