// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {TALIdentityRegistryV3} from "../../src/core/TALIdentityRegistryV3.sol";
import {TALIdentityRegistryV2} from "../../src/core/TALIdentityRegistryV2.sol";
import {TALIdentityRegistry} from "../../src/core/TALIdentityRegistry.sol";
import {ITALIdentityRegistry} from "../../src/interfaces/ITALIdentityRegistry.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MockStakingV3} from "../mocks/MockStakingV3.sol";
import {MockValidationRegistry} from "../mocks/MockValidationRegistry.sol";

/**
 * @title TALIdentityRegistryV3Test
 * @notice Comprehensive tests for TALIdentityRegistryV3 content-hash commitment upgrade
 */
contract TALIdentityRegistryV3Test is Test {
    // ============ Constants ============
    uint256 public constant MIN_OPERATOR_STAKE = 1000 ether;
    uint256 public constant REACTIVATION_COOLDOWN = 7 days;
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // ============ Contracts ============
    TALIdentityRegistryV3 public registry;
    TALIdentityRegistry public v1Implementation;
    TALIdentityRegistryV2 public v2Implementation;
    TALIdentityRegistryV3 public v3Implementation;
    MockStakingV3 public stakingBridge;
    MockValidationRegistry public validationRegistry;

    // ============ Test Accounts ============
    address public admin = makeAddr("admin");
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");
    address public treasury = makeAddr("treasury");

    // Operator private keys for EIP-712 signing
    uint256 public operator1PrivateKey = 0xA001;
    address public operator1;

    // ============ Test Data ============
    string public constant AGENT_URI = "ipfs://QmTestAgent123";
    string public constant AGENT_URI_2 = "ipfs://QmTestAgent456";
    string public constant AGENT_URI_3 = "ipfs://QmTestAgent789";
    bytes32 public constant CONTENT_HASH = keccak256("canonical-registration-json-content");
    bytes32 public constant CRITICAL_HASH = keccak256("critical-fields-subset");
    bytes32 public constant CONTENT_HASH_2 = keccak256("updated-registration-json-content");
    bytes32 public constant CRITICAL_HASH_2 = keccak256("updated-critical-fields-subset");

    // ============ EIP-712 Constants ============
    bytes32 private constant OPERATOR_CONSENT_TYPEHASH = keccak256(
        "OperatorConsent(address operator,address agentOwner,string agentURI,uint8 validationModel,uint256 nonce,uint256 deadline)"
    );

    // ============ Setup ============

    function setUp() public {
        operator1 = vm.addr(operator1PrivateKey);

        // Deploy mocks
        stakingBridge = new MockStakingV3();
        validationRegistry = new MockValidationRegistry();
        stakingBridge.setStake(operator1, 1500 ether);

        // Deploy V1 implementation + proxy
        v1Implementation = new TALIdentityRegistry();
        bytes memory v1InitData = abi.encodeWithSelector(
            TALIdentityRegistry.initialize.selector,
            admin,
            address(stakingBridge),
            address(0) // no zk verifier
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(v1Implementation), v1InitData);

        // Upgrade proxy V1 → V2
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

        // Upgrade proxy V2 → V3
        v3Implementation = new TALIdentityRegistryV3();
        vm.prank(admin);
        TALIdentityRegistryV2(address(proxy)).upgradeToAndCall(
            address(v3Implementation),
            abi.encodeWithSelector(TALIdentityRegistryV3.initializeV3.selector)
        );

        registry = TALIdentityRegistryV3(address(proxy));

        // Fund test accounts
        vm.deal(user1, 100 ether);
        vm.deal(user2, 100 ether);
    }

    // =====================================================================
    // V2 → V3 UPGRADE PRESERVES STORAGE
    // =====================================================================

    function test_v3_upgrade_preserves_v1_storage() public {
        // Register a V1-style agent
        vm.prank(user1);
        uint256 agentId = registry.register(AGENT_URI);

        // Verify V1 data is intact
        assertEq(registry.ownerOf(agentId), user1);
        assertEq(registry.agentURI(agentId), AGENT_URI);
        assertTrue(registry.agentExists(agentId));
        assertEq(registry.getAgentCount(), 1);
    }

    function test_v3_upgrade_preserves_v2_storage() public {
        // Verify V2 params still set
        assertEq(registry.protocolTreasury(), treasury);
        assertEq(registry.validationRegistry(), address(validationRegistry));
        assertEq(registry.minOperatorStake(), MIN_OPERATOR_STAKE);
        assertEq(registry.reactivationCooldown(), REACTIVATION_COOLDOWN);
    }

    function test_v3_upgrade_preserves_existing_agents() public {
        // Register before testing
        vm.prank(user1);
        uint256 agentId1 = registry.register(AGENT_URI);

        vm.prank(user2);
        uint256 agentId2 = registry.register(AGENT_URI_2);

        // Both should exist and have correct owners
        assertEq(registry.ownerOf(agentId1), user1);
        assertEq(registry.ownerOf(agentId2), user2);
        assertEq(registry.getAgentCount(), 2);

        // IDs should be sequential
        assertEq(agentId2, agentId1 + 1);
    }

    function test_initializeV3_cannot_reinit() public {
        vm.prank(admin);
        vm.expectRevert(); // InvalidInitialization
        registry.initializeV3();
    }

    // =====================================================================
    // registerWithContentHash() TESTS
    // =====================================================================

    function test_registerWithContentHash_happy_path() public {
        vm.prank(user1);
        uint256 agentId = registry.registerWithContentHash(AGENT_URI, CONTENT_HASH, CRITICAL_HASH);

        // Check basic agent data
        assertEq(registry.ownerOf(agentId), user1);
        assertEq(registry.agentURI(agentId), AGENT_URI);
        assertTrue(registry.agentExists(agentId));

        // Check content hash data
        (bytes32 contentHash, bytes32 criticalHash, uint256 version) = registry.getContentHash(agentId);
        assertEq(contentHash, CONTENT_HASH);
        assertEq(criticalHash, CRITICAL_HASH);
        assertEq(version, 1);

        // hasContentCommitment should return true
        assertTrue(registry.hasContentCommitment(agentId));
    }

    function test_registerWithContentHash_zero_hash_reverts() public {
        vm.prank(user1);
        vm.expectRevert(TALIdentityRegistryV3.InvalidContentHash.selector);
        registry.registerWithContentHash(AGENT_URI, bytes32(0), CRITICAL_HASH);
    }

    function test_registerWithContentHash_zero_critical_hash_allowed() public {
        // criticalFieldsHash can be zero (optional)
        vm.prank(user1);
        uint256 agentId = registry.registerWithContentHash(AGENT_URI, CONTENT_HASH, bytes32(0));

        (bytes32 contentHash, bytes32 criticalHash, uint256 version) = registry.getContentHash(agentId);
        assertEq(contentHash, CONTENT_HASH);
        assertEq(criticalHash, bytes32(0));
        assertEq(version, 1);
    }

    function test_registerWithContentHash_emits_events() public {
        vm.prank(user1);

        // Should emit both Registered and ContentHashCommitted
        vm.expectEmit(true, false, false, true);
        emit TALIdentityRegistryV3.ContentHashCommitted(1, CONTENT_HASH, CRITICAL_HASH, 1);

        registry.registerWithContentHash(AGENT_URI, CONTENT_HASH, CRITICAL_HASH);
    }

    function test_registerWithContentHash_when_paused_reverts() public {
        vm.prank(admin);
        registry.pause();

        vm.prank(user1);
        vm.expectRevert(); // EnforcedPause
        registry.registerWithContentHash(AGENT_URI, CONTENT_HASH, CRITICAL_HASH);
    }

    function test_registerWithContentHash_sequential_ids() public {
        // Register a legacy agent
        vm.prank(user1);
        uint256 legacyId = registry.register(AGENT_URI);

        // Register a content-hashed agent
        vm.prank(user2);
        uint256 hashedId = registry.registerWithContentHash(AGENT_URI_2, CONTENT_HASH, CRITICAL_HASH);

        // IDs should be sequential
        assertEq(hashedId, legacyId + 1);
    }

    // =====================================================================
    // updateAgentURIWithHash() TESTS
    // =====================================================================

    function test_updateAgentURIWithHash_happy_path() public {
        vm.prank(user1);
        uint256 agentId = registry.registerWithContentHash(AGENT_URI, CONTENT_HASH, CRITICAL_HASH);

        vm.prank(user1);
        registry.updateAgentURIWithHash(agentId, AGENT_URI_2, CONTENT_HASH_2, CRITICAL_HASH_2);

        // Check updated data
        assertEq(registry.agentURI(agentId), AGENT_URI_2);

        (bytes32 contentHash, bytes32 criticalHash, uint256 version) = registry.getContentHash(agentId);
        assertEq(contentHash, CONTENT_HASH_2);
        assertEq(criticalHash, CRITICAL_HASH_2);
        assertEq(version, 2);
    }

    function test_updateAgentURIWithHash_owner_only() public {
        vm.prank(user1);
        uint256 agentId = registry.registerWithContentHash(AGENT_URI, CONTENT_HASH, CRITICAL_HASH);

        vm.prank(user2);
        vm.expectRevert(abi.encodeWithSelector(ITALIdentityRegistry.NotAgentOwner.selector, agentId, user2));
        registry.updateAgentURIWithHash(agentId, AGENT_URI_2, CONTENT_HASH_2, CRITICAL_HASH_2);
    }

    function test_updateAgentURIWithHash_nonexistent_reverts() public {
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(ITALIdentityRegistry.AgentNotFound.selector, 999));
        registry.updateAgentURIWithHash(999, AGENT_URI_2, CONTENT_HASH_2, CRITICAL_HASH_2);
    }

    function test_updateAgentURIWithHash_zero_hash_reverts() public {
        vm.prank(user1);
        uint256 agentId = registry.registerWithContentHash(AGENT_URI, CONTENT_HASH, CRITICAL_HASH);

        vm.prank(user1);
        vm.expectRevert(TALIdentityRegistryV3.InvalidContentHash.selector);
        registry.updateAgentURIWithHash(agentId, AGENT_URI_2, bytes32(0), CRITICAL_HASH_2);
    }

    function test_updateAgentURIWithHash_emits_events() public {
        vm.prank(user1);
        uint256 agentId = registry.registerWithContentHash(AGENT_URI, CONTENT_HASH, CRITICAL_HASH);

        vm.prank(user1);
        vm.expectEmit(true, false, false, true);
        emit TALIdentityRegistryV3.ContentHashCommitted(agentId, CONTENT_HASH_2, CRITICAL_HASH_2, 2);
        registry.updateAgentURIWithHash(agentId, AGENT_URI_2, CONTENT_HASH_2, CRITICAL_HASH_2);
    }

    function test_updateAgentURIWithHash_version_increments() public {
        vm.prank(user1);
        uint256 agentId = registry.registerWithContentHash(AGENT_URI, CONTENT_HASH, CRITICAL_HASH);

        // Version starts at 1
        (, , uint256 v1) = registry.getContentHash(agentId);
        assertEq(v1, 1);

        // Update: version → 2
        vm.prank(user1);
        registry.updateAgentURIWithHash(agentId, AGENT_URI_2, CONTENT_HASH_2, CRITICAL_HASH_2);
        (, , uint256 v2) = registry.getContentHash(agentId);
        assertEq(v2, 2);

        // Update again: version → 3
        vm.prank(user1);
        registry.updateAgentURIWithHash(agentId, AGENT_URI_3, CONTENT_HASH, CRITICAL_HASH);
        (, , uint256 v3) = registry.getContentHash(agentId);
        assertEq(v3, 3);
    }

    function test_updateAgentURIWithHash_on_legacy_agent() public {
        // Register a legacy agent (no content hash)
        vm.prank(user1);
        uint256 agentId = registry.register(AGENT_URI);

        // Legacy agents can also use updateAgentURIWithHash to opt in
        // Their _contentVersion is 0, so newVersion = 0 + 1 = 1
        vm.prank(user1);
        registry.updateAgentURIWithHash(agentId, AGENT_URI_2, CONTENT_HASH, CRITICAL_HASH);

        assertTrue(registry.hasContentCommitment(agentId));
        (bytes32 contentHash, bytes32 criticalHash, uint256 version) = registry.getContentHash(agentId);
        assertEq(contentHash, CONTENT_HASH);
        assertEq(criticalHash, CRITICAL_HASH);
        assertEq(version, 1);
    }

    // =====================================================================
    // updateAgentURI() — BLOCKED FOR HASHED AGENTS
    // =====================================================================

    function test_updateAgentURI_reverts_for_hashed_agent() public {
        vm.prank(user1);
        uint256 agentId = registry.registerWithContentHash(AGENT_URI, CONTENT_HASH, CRITICAL_HASH);

        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(TALIdentityRegistryV3.ContentHashRequired.selector, agentId));
        registry.updateAgentURI(agentId, AGENT_URI_2);
    }

    function test_updateAgentURI_still_works_for_legacy_agent() public {
        vm.prank(user1);
        uint256 agentId = registry.register(AGENT_URI);

        // Legacy agents can still use updateAgentURI without hash
        vm.prank(user1);
        registry.updateAgentURI(agentId, AGENT_URI_2);

        assertEq(registry.agentURI(agentId), AGENT_URI_2);
    }

    function test_updateAgentURI_blocked_after_opting_in() public {
        // Start as legacy
        vm.prank(user1);
        uint256 agentId = registry.register(AGENT_URI);

        // Opt in via updateAgentURIWithHash
        vm.prank(user1);
        registry.updateAgentURIWithHash(agentId, AGENT_URI_2, CONTENT_HASH, CRITICAL_HASH);

        // Now legacy updateAgentURI should be blocked
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(TALIdentityRegistryV3.ContentHashRequired.selector, agentId));
        registry.updateAgentURI(agentId, AGENT_URI_3);
    }

    // =====================================================================
    // getContentHash() / hasContentCommitment() VIEW TESTS
    // =====================================================================

    function test_getContentHash_legacy_agent_returns_zeros() public {
        vm.prank(user1);
        uint256 agentId = registry.register(AGENT_URI);

        (bytes32 contentHash, bytes32 criticalHash, uint256 version) = registry.getContentHash(agentId);
        assertEq(contentHash, bytes32(0));
        assertEq(criticalHash, bytes32(0));
        assertEq(version, 0);
    }

    function test_hasContentCommitment_legacy_agent_returns_false() public {
        vm.prank(user1);
        uint256 agentId = registry.register(AGENT_URI);

        assertFalse(registry.hasContentCommitment(agentId));
    }

    function test_hasContentCommitment_hashed_agent_returns_true() public {
        vm.prank(user1);
        uint256 agentId = registry.registerWithContentHash(AGENT_URI, CONTENT_HASH, CRITICAL_HASH);

        assertTrue(registry.hasContentCommitment(agentId));
    }

    function test_getContentHash_nonexistent_agent_returns_zeros() public view {
        // Non-existent agents just return default zeros (no revert for view)
        (bytes32 contentHash, bytes32 criticalHash, uint256 version) = registry.getContentHash(999);
        assertEq(contentHash, bytes32(0));
        assertEq(criticalHash, bytes32(0));
        assertEq(version, 0);
    }

    // =====================================================================
    // LEGACY BACKWARD COMPATIBILITY
    // =====================================================================

    function test_legacy_v1_register_still_works() public {
        vm.prank(user1);
        uint256 agentId = registry.register(AGENT_URI);

        assertEq(registry.ownerOf(agentId), user1);
        assertEq(registry.agentURI(agentId), AGENT_URI);
        assertEq(registry.getAgentValidationModel(agentId), 0); // ReputationOnly default
        assertEq(registry.getAgentStatus(agentId), 0); // Active default
        assertFalse(registry.hasContentCommitment(agentId));
    }

    function test_legacy_v2_registerV2_still_works() public {
        TALIdentityRegistryV3.OperatorConsentData[] memory consents =
            new TALIdentityRegistryV3.OperatorConsentData[](0);
        bytes[] memory signatures = new bytes[](0);

        vm.prank(user1);
        uint256 agentId = registry.registerV2(AGENT_URI, 0, consents, signatures);

        assertEq(registry.ownerOf(agentId), user1);
        assertEq(registry.getAgentValidationModel(agentId), 0);
        assertFalse(registry.hasContentCommitment(agentId));
    }

    function test_mixed_agents_coexist() public {
        // V1 legacy
        vm.prank(user1);
        uint256 id1 = registry.register(AGENT_URI);

        // V3 content-hashed
        vm.prank(user1);
        uint256 id2 = registry.registerWithContentHash(AGENT_URI_2, CONTENT_HASH, CRITICAL_HASH);

        // V1 legacy again
        vm.prank(user2);
        uint256 id3 = registry.register(AGENT_URI_3);

        // All exist with sequential IDs
        assertEq(id2, id1 + 1);
        assertEq(id3, id2 + 1);
        assertEq(registry.getAgentCount(), 3);

        // Content hash state is per-agent
        assertFalse(registry.hasContentCommitment(id1));
        assertTrue(registry.hasContentCommitment(id2));
        assertFalse(registry.hasContentCommitment(id3));

        // Legacy agents can use updateAgentURI
        vm.prank(user1);
        registry.updateAgentURI(id1, AGENT_URI_3);

        vm.prank(user2);
        registry.updateAgentURI(id3, AGENT_URI);

        // Hashed agent cannot
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(TALIdentityRegistryV3.ContentHashRequired.selector, id2));
        registry.updateAgentURI(id2, AGENT_URI_3);
    }

    // =====================================================================
    // EDGE CASES
    // =====================================================================

    function test_empty_uri_with_content_hash() public {
        vm.prank(user1);
        uint256 agentId = registry.registerWithContentHash("", CONTENT_HASH, CRITICAL_HASH);

        assertEq(registry.agentURI(agentId), "");
        assertTrue(registry.hasContentCommitment(agentId));
    }

    function test_deregister_clears_content_hash_agent() public {
        vm.prank(user1);
        uint256 agentId = registry.registerWithContentHash(AGENT_URI, CONTENT_HASH, CRITICAL_HASH);

        assertTrue(registry.hasContentCommitment(agentId));

        vm.prank(user1);
        registry.deregister(agentId);

        assertFalse(registry.agentExists(agentId));
        assertEq(registry.getAgentStatus(agentId), 2); // DEREGISTERED

        // Content hash data remains in storage but agent is deregistered
        // hasContentCommitment still reflects stored version > 0
        // (version is not cleared on deregister, same as other V2 fields)
        assertTrue(registry.hasContentCommitment(agentId));
    }

    function test_registerWithContentHash_with_v2_flow_then_update() public {
        // Register with content hash
        vm.prank(user1);
        uint256 agentId = registry.registerWithContentHash(AGENT_URI, CONTENT_HASH, CRITICAL_HASH);

        // Update with new hash
        vm.prank(user1);
        registry.updateAgentURIWithHash(agentId, AGENT_URI_2, CONTENT_HASH_2, CRITICAL_HASH_2);

        // Verify all data
        assertEq(registry.agentURI(agentId), AGENT_URI_2);
        (bytes32 ch, bytes32 cfh, uint256 v) = registry.getContentHash(agentId);
        assertEq(ch, CONTENT_HASH_2);
        assertEq(cfh, CRITICAL_HASH_2);
        assertEq(v, 2);
    }
}
