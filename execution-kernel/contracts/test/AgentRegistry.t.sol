// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Test, console2 } from "forge-std/Test.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { IAgentRegistry } from "../src/interfaces/IAgentRegistry.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @notice Mock vault for testing unregister checks
contract MockVaultForUnregister {
    bytes32 public agentId;
    uint256 public totalAssets;

    constructor(bytes32 _agentId, uint256 _totalAssets) {
        agentId = _agentId;
        totalAssets = _totalAssets;
    }

    function setTotalAssets(uint256 _totalAssets) external {
        totalAssets = _totalAssets;
    }
}

/// @notice Mock VaultFactory that returns preset agent vaults
contract MockVaultFactory {
    mapping(bytes32 => address[]) internal _agentVaults;

    function setAgentVaults(bytes32 agentId, address[] memory vaults) external {
        _agentVaults[agentId] = vaults;
    }

    function getAgentVaults(bytes32 agentId) external view returns (address[] memory) {
        return _agentVaults[agentId];
    }
}

/// @title AgentRegistry Tests
/// @notice Comprehensive test suite for AgentRegistry
contract AgentRegistryTest is Test {
    AgentRegistry public registry;
    MockVaultFactory public mockFactory;

    address public author1 = address(0x1111111111111111111111111111111111111111);
    address public author2 = address(0x2222222222222222222222222222222222222222);

    bytes32 public constant SALT_1 = bytes32(uint256(0x1));
    bytes32 public constant SALT_2 = bytes32(uint256(0x2));
    bytes32 public constant IMAGE_ID_1 = bytes32(uint256(0x1234));
    bytes32 public constant IMAGE_ID_2 = bytes32(uint256(0x5678));
    bytes32 public constant CODE_HASH_1 = bytes32(uint256(0xC0DE1));
    bytes32 public constant CODE_HASH_2 = bytes32(uint256(0xC0DE2));


    function setUp() public {
        AgentRegistry impl = new AgentRegistry();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(AgentRegistry.initialize, (address(this)))
        );
        registry = AgentRegistry(address(proxy));

        // Deploy and configure mock factory
        mockFactory = new MockVaultFactory();
        registry.setFactory(address(mockFactory));
    }

    // ============ computeAgentId Tests ============

    function test_computeAgentId_deterministic() public view {
        bytes32 id1 = registry.computeAgentId(author1, SALT_1);
        bytes32 id2 = registry.computeAgentId(author1, SALT_1);

        assertEq(id1, id2, "Same inputs should produce same agentId");
    }

    function test_computeAgentId_differentAuthors() public view {
        bytes32 id1 = registry.computeAgentId(author1, SALT_1);
        bytes32 id2 = registry.computeAgentId(author2, SALT_1);

        assertTrue(id1 != id2, "Different authors should produce different agentIds");
    }

    function test_computeAgentId_differentSalts() public view {
        bytes32 id1 = registry.computeAgentId(author1, SALT_1);
        bytes32 id2 = registry.computeAgentId(author1, SALT_2);

        assertTrue(id1 != id2, "Different salts should produce different agentIds");
    }

    function test_computeAgentId_matchesKeccak256() public view {
        bytes32 id = registry.computeAgentId(author1, SALT_1);
        bytes32 expected = keccak256(abi.encodePacked(author1, SALT_1));

        assertEq(id, expected, "Should match keccak256(author, salt)");
    }

    // ============ register Tests ============

    function test_register_success() public {
        vm.prank(author1);
        bytes32 agentId = registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        // Verify agentId matches expected
        bytes32 expectedId = registry.computeAgentId(author1, SALT_1);
        assertEq(agentId, expectedId, "AgentId should match computed value");

        // Verify stored data
        IAgentRegistry.AgentInfo memory info = registry.get(agentId);
        assertEq(info.author, author1, "Author should match");
        assertEq(info.imageId, IMAGE_ID_1, "ImageId should match");
        assertEq(info.agentCodeHash, CODE_HASH_1, "CodeHash should match");
        assertTrue(info.exists, "Agent should exist");
    }

    function test_register_emitsEvent() public {
        bytes32 expectedAgentId = registry.computeAgentId(author1, SALT_1);

        vm.expectEmit(true, true, true, true);
        emit IAgentRegistry.AgentRegistered(
            expectedAgentId, author1, IMAGE_ID_1, CODE_HASH_1
        );

        vm.prank(author1);
        registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);
    }

    function test_register_zeroImageId_reverts() public {
        vm.prank(author1);
        vm.expectRevert(IAgentRegistry.InvalidImageId.selector);
        registry.register(SALT_1, bytes32(0), CODE_HASH_1);
    }

    function test_register_zeroCodeHash_reverts() public {
        vm.prank(author1);
        vm.expectRevert(IAgentRegistry.InvalidAgentCodeHash.selector);
        registry.register(SALT_1, IMAGE_ID_1, bytes32(0));
    }

    function test_register_alreadyExists_reverts() public {
        vm.prank(author1);
        registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        bytes32 agentId = registry.computeAgentId(author1, SALT_1);

        vm.prank(author1);
        vm.expectRevert(abi.encodeWithSelector(IAgentRegistry.AgentAlreadyExists.selector, agentId));
        registry.register(SALT_1, IMAGE_ID_2, CODE_HASH_2);
    }

    function test_register_sameAuthorDifferentSalt_succeeds() public {
        vm.startPrank(author1);
        bytes32 id1 = registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);
        bytes32 id2 = registry.register(SALT_2, IMAGE_ID_2, CODE_HASH_2);
        vm.stopPrank();

        assertTrue(id1 != id2, "Different salts should produce different agentIds");
        assertTrue(registry.agentExists(id1), "First agent should exist");
        assertTrue(registry.agentExists(id2), "Second agent should exist");
    }

    function test_register_differentAuthorsSameSalt_succeeds() public {
        vm.prank(author1);
        bytes32 id1 = registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        vm.prank(author2);
        bytes32 id2 = registry.register(SALT_1, IMAGE_ID_2, CODE_HASH_2);

        assertTrue(id1 != id2, "Different authors should produce different agentIds");
        assertTrue(registry.agentExists(id1), "First agent should exist");
        assertTrue(registry.agentExists(id2), "Second agent should exist");
    }

    // ============ update Tests ============

    function test_update_success() public {
        vm.prank(author1);
        bytes32 agentId = registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        vm.prank(author1);
        registry.update(agentId, IMAGE_ID_2, CODE_HASH_2);

        IAgentRegistry.AgentInfo memory info = registry.get(agentId);
        assertEq(info.imageId, IMAGE_ID_2, "ImageId should be updated");
        assertEq(info.agentCodeHash, CODE_HASH_2, "CodeHash should be updated");
        assertEq(info.author, author1, "Author should remain unchanged");
    }

    function test_update_emitsEvent() public {
        vm.prank(author1);
        bytes32 agentId = registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        vm.expectEmit(true, true, false, true);
        emit IAgentRegistry.AgentUpdated(agentId, IMAGE_ID_2, CODE_HASH_2);

        vm.prank(author1);
        registry.update(agentId, IMAGE_ID_2, CODE_HASH_2);
    }

    function test_update_notAuthor_reverts() public {
        vm.prank(author1);
        bytes32 agentId = registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        vm.prank(author2);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAgentRegistry.NotAgentAuthor.selector, agentId, author2, author1
            )
        );
        registry.update(agentId, IMAGE_ID_2, CODE_HASH_2);
    }

    function test_update_nonExistentAgent_reverts() public {
        bytes32 fakeAgentId = bytes32(uint256(0xDEAD));

        vm.prank(author1);
        vm.expectRevert(abi.encodeWithSelector(IAgentRegistry.AgentNotFound.selector, fakeAgentId));
        registry.update(fakeAgentId, IMAGE_ID_2, CODE_HASH_2);
    }

    function test_update_zeroImageId_reverts() public {
        vm.prank(author1);
        bytes32 agentId = registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        vm.prank(author1);
        vm.expectRevert(IAgentRegistry.InvalidImageId.selector);
        registry.update(agentId, bytes32(0), CODE_HASH_2);
    }

    function test_update_zeroCodeHash_reverts() public {
        vm.prank(author1);
        bytes32 agentId = registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        vm.prank(author1);
        vm.expectRevert(IAgentRegistry.InvalidAgentCodeHash.selector);
        registry.update(agentId, IMAGE_ID_2, bytes32(0));
    }

    // ============ get Tests ============

    function test_get_returnsCorrectInfo() public {
        vm.prank(author1);
        bytes32 agentId = registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        IAgentRegistry.AgentInfo memory info = registry.get(agentId);

        assertEq(info.author, author1);
        assertEq(info.imageId, IMAGE_ID_1);
        assertEq(info.agentCodeHash, CODE_HASH_1);
        assertTrue(info.exists);
    }

    function test_get_nonExistent_returnsDefaultInfo() public view {
        bytes32 fakeAgentId = bytes32(uint256(0xDEAD));

        IAgentRegistry.AgentInfo memory info = registry.get(fakeAgentId);

        assertEq(info.author, address(0));
        assertEq(info.imageId, bytes32(0));
        assertEq(info.agentCodeHash, bytes32(0));
        assertFalse(info.exists);
    }

    // ============ agentExists Tests ============

    function test_agentExists_returnsTrueForExisting() public {
        vm.prank(author1);
        bytes32 agentId = registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        assertTrue(registry.agentExists(agentId));
    }

    function test_agentExists_returnsFalseForNonExisting() public view {
        bytes32 fakeAgentId = bytes32(uint256(0xDEAD));

        assertFalse(registry.agentExists(fakeAgentId));
    }

    // ============ agentCount Tests ============

    function test_agentCount_initiallyZero() public view {
        assertEq(registry.agentCount(), 0, "Initial agent count should be zero");
    }

    function test_agentCount_afterOneRegistration() public {
        vm.prank(author1);
        registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        assertEq(registry.agentCount(), 1, "Agent count should be 1 after one registration");
    }

    function test_agentCount_afterMultipleRegistrations() public {
        vm.prank(author1);
        registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        vm.prank(author2);
        registry.register(SALT_1, IMAGE_ID_2, CODE_HASH_2);

        vm.prank(author1);
        registry.register(SALT_2, IMAGE_ID_2, CODE_HASH_2);

        assertEq(registry.agentCount(), 3, "Agent count should be 3 after three registrations");
    }

    // ============ agentAt Tests ============

    function test_agentAt_returnsCorrectId() public {
        vm.prank(author1);
        bytes32 id1 = registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        vm.prank(author2);
        bytes32 id2 = registry.register(SALT_1, IMAGE_ID_2, CODE_HASH_2);

        assertEq(registry.agentAt(0), id1, "First agent ID should match");
        assertEq(registry.agentAt(1), id2, "Second agent ID should match");
    }

    function test_agentAt_outOfBounds_reverts() public {
        vm.expectRevert();
        registry.agentAt(0);
    }

    // ============ getAllAgentIds Tests ============

    function test_getAllAgentIds_initiallyEmpty() public view {
        bytes32[] memory ids = registry.getAllAgentIds();
        assertEq(ids.length, 0, "Initially should return empty array");
    }

    function test_getAllAgentIds_returnsAllIds() public {
        vm.prank(author1);
        bytes32 id1 = registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        vm.prank(author2);
        bytes32 id2 = registry.register(SALT_1, IMAGE_ID_2, CODE_HASH_2);

        bytes32[] memory ids = registry.getAllAgentIds();
        assertEq(ids.length, 2, "Should return 2 agent IDs");
        assertEq(ids[0], id1, "First ID should match");
        assertEq(ids[1], id2, "Second ID should match");
    }

    function test_getAllAgentIds_preservesInsertionOrder() public {
        vm.prank(author2);
        bytes32 id1 = registry.register(SALT_2, IMAGE_ID_2, CODE_HASH_2);

        vm.prank(author1);
        bytes32 id2 = registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        bytes32[] memory ids = registry.getAllAgentIds();
        assertEq(ids[0], id1, "First registered agent should be at index 0");
        assertEq(ids[1], id2, "Second registered agent should be at index 1");
    }

    // ============ unregister Tests ============

    function test_unregister_noVaults_success() public {
        vm.prank(author1);
        bytes32 agentId = registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        vm.prank(author1);
        registry.unregister(agentId);

        // Agent should no longer exist
        assertFalse(registry.agentExists(agentId), "Agent should not exist after unregister");
        assertEq(registry.agentCount(), 0, "Agent count should be 0");
    }

    function test_unregister_withEmptyVault_success() public {
        vm.prank(author1);
        bytes32 agentId = registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        // Deploy mock vault with 0 assets and register in factory
        MockVaultForUnregister mockVault = new MockVaultForUnregister(agentId, 0);
        address[] memory vaults = new address[](1);
        vaults[0] = address(mockVault);
        mockFactory.setAgentVaults(agentId, vaults);

        vm.prank(author1);
        registry.unregister(agentId);

        assertFalse(registry.agentExists(agentId), "Agent should not exist after unregister");
    }

    function test_unregister_emitsEvent() public {
        vm.prank(author1);
        bytes32 agentId = registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        vm.expectEmit(true, true, false, true);
        emit IAgentRegistry.AgentUnregistered(agentId, author1);

        vm.prank(author1);
        registry.unregister(agentId);
    }

    function test_unregister_cleansUpMapping() public {
        vm.prank(author1);
        bytes32 agentId = registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        vm.prank(author1);
        registry.unregister(agentId);

        // get() should return default values
        IAgentRegistry.AgentInfo memory info = registry.get(agentId);
        assertEq(info.author, address(0));
        assertEq(info.imageId, bytes32(0));
        assertEq(info.agentCodeHash, bytes32(0));
        assertFalse(info.exists);
    }

    function test_unregister_removesFromArray_swapAndPop() public {
        // Register 3 agents
        vm.prank(author1);
        bytes32 id1 = registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        vm.prank(author2);
        bytes32 id2 = registry.register(SALT_1, IMAGE_ID_2, CODE_HASH_2);

        vm.prank(author1);
        bytes32 id3 = registry.register(SALT_2, IMAGE_ID_2, CODE_HASH_2);

        // Unregister the first agent (id1) — last element (id3) should swap into its position
        vm.prank(author1);
        registry.unregister(id1);

        assertEq(registry.agentCount(), 2, "Should have 2 agents");
        assertEq(registry.agentAt(0), id3, "id3 should have swapped into index 0");
        assertEq(registry.agentAt(1), id2, "id2 should remain at index 1");
    }

    function test_unregister_lastElement_popsCleanly() public {
        vm.prank(author1);
        bytes32 id1 = registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        vm.prank(author2);
        bytes32 id2 = registry.register(SALT_1, IMAGE_ID_2, CODE_HASH_2);

        // Unregister the last element
        vm.prank(author2);
        registry.unregister(id2);

        assertEq(registry.agentCount(), 1, "Should have 1 agent");
        assertEq(registry.agentAt(0), id1, "id1 should still be at index 0");
    }

    function test_unregister_notAuthor_reverts() public {
        vm.prank(author1);
        bytes32 agentId = registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        vm.prank(author2);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAgentRegistry.NotAgentAuthor.selector, agentId, author2, author1
            )
        );
        registry.unregister(agentId);
    }

    function test_unregister_nonExistentAgent_reverts() public {
        bytes32 fakeAgentId = bytes32(uint256(0xDEAD));

        vm.prank(author1);
        vm.expectRevert(abi.encodeWithSelector(IAgentRegistry.AgentNotFound.selector, fakeAgentId));
        registry.unregister(fakeAgentId);
    }

    function test_unregister_vaultHasDeposits_reverts() public {
        vm.prank(author1);
        bytes32 agentId = registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        // Deploy mock vault with 1000 assets and register in factory
        MockVaultForUnregister mockVault = new MockVaultForUnregister(agentId, 1000);
        address[] memory vaults = new address[](1);
        vaults[0] = address(mockVault);
        mockFactory.setAgentVaults(agentId, vaults);

        vm.prank(author1);
        vm.expectRevert(
            abi.encodeWithSelector(IAgentRegistry.VaultHasDeposits.selector, address(mockVault), 1000)
        );
        registry.unregister(agentId);
    }

    function test_unregister_multipleVaults_allEmpty_success() public {
        vm.prank(author1);
        bytes32 agentId = registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        MockVaultForUnregister vault1 = new MockVaultForUnregister(agentId, 0);
        MockVaultForUnregister vault2 = new MockVaultForUnregister(agentId, 0);

        address[] memory vaults = new address[](2);
        vaults[0] = address(vault1);
        vaults[1] = address(vault2);
        mockFactory.setAgentVaults(agentId, vaults);

        vm.prank(author1);
        registry.unregister(agentId);

        assertFalse(registry.agentExists(agentId));
    }

    function test_unregister_multipleVaults_oneHasDeposits_reverts() public {
        vm.prank(author1);
        bytes32 agentId = registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        MockVaultForUnregister vault1 = new MockVaultForUnregister(agentId, 0);
        MockVaultForUnregister vault2 = new MockVaultForUnregister(agentId, 500);

        address[] memory vaults = new address[](2);
        vaults[0] = address(vault1);
        vaults[1] = address(vault2);
        mockFactory.setAgentVaults(agentId, vaults);

        vm.prank(author1);
        vm.expectRevert(
            abi.encodeWithSelector(IAgentRegistry.VaultHasDeposits.selector, address(vault2), 500)
        );
        registry.unregister(agentId);
    }

    function test_unregister_canReRegisterAfter() public {
        vm.prank(author1);
        bytes32 agentId = registry.register(SALT_1, IMAGE_ID_1, CODE_HASH_1);

        vm.prank(author1);
        registry.unregister(agentId);

        // Re-register with same salt
        vm.prank(author1);
        bytes32 newAgentId = registry.register(SALT_1, IMAGE_ID_2, CODE_HASH_2);

        assertEq(newAgentId, agentId, "Re-registration should produce same agentId");
        assertTrue(registry.agentExists(newAgentId));
        assertEq(registry.agentCount(), 1);
    }

    // ============ setFactory Tests ============

    function test_setFactory_success() public {
        address newFactory = address(0xFACE);
        registry.setFactory(newFactory);
        assertEq(registry.factory(), newFactory, "Factory should be updated");
    }

    function test_setFactory_notOwner_reverts() public {
        vm.prank(author1);
        vm.expectRevert(
            abi.encodeWithSelector(AgentRegistry.OwnableUnauthorizedAccount.selector, author1)
        );
        registry.setFactory(address(0xFACE));
    }

    function test_factory_returnsAddress() public view {
        assertEq(registry.factory(), address(mockFactory), "Factory should match mock");
    }

    // ============ UUPS Tests ============

    function test_owner_isSetCorrectly() public view {
        assertEq(registry.owner(), address(this), "Owner should be test contract");
    }

    function test_implementation_cannotBeInitialized() public {
        AgentRegistry impl = new AgentRegistry();
        vm.expectRevert();
        impl.initialize(address(this));
    }
}
