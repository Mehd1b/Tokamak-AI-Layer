// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {StakingIntegrationModule} from "../../src/modules/StakingIntegrationModule.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MockStakingV3} from "../mocks/MockStakingV3.sol";

/**
 * @title MockIdentityRegistryForStaking
 * @notice Minimal mock for identity registry in staking tests
 */
contract MockIdentityRegistryForStaking {
    mapping(uint256 => address) public owners;

    function ownerOf(uint256 agentId) external view returns (address) {
        return owners[agentId];
    }

    function setOwner(uint256 agentId, address owner) external {
        owners[agentId] = owner;
    }
}

/**
 * @title StakingIntegrationModuleTest
 * @notice Unit tests for StakingIntegrationModule
 * @dev Tests stake queries, operator verification, and slashing functionality
 */
contract StakingIntegrationModuleTest is Test {
    // ============ Contracts ============
    StakingIntegrationModule public stakingModule;
    StakingIntegrationModule public implementation;
    MockStakingV3 public mockBridge;
    MockIdentityRegistryForStaking public mockIdentity;

    // ============ Test Accounts ============
    address public admin = address(0x1);
    address public slashExecutor = address(0x2);
    address public seigniorageRouter = address(0x3);
    address public operator1 = address(0x10);
    address public operator2 = address(0x20);
    address public unauthorized = address(0x999);

    // ============ Setup ============

    function setUp() public {
        // Deploy mocks
        mockBridge = new MockStakingV3();
        mockIdentity = new MockIdentityRegistryForStaking();

        // Deploy implementation
        implementation = new StakingIntegrationModule();

        // Deploy proxy and initialize
        bytes memory initData = abi.encodeWithSelector(
            StakingIntegrationModule.initialize.selector,
            admin,
            address(mockBridge),
            address(mockIdentity),
            address(0) // reputation registry not needed for these tests
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        stakingModule = StakingIntegrationModule(address(proxy));

        // Grant roles
        vm.startPrank(admin);
        stakingModule.grantRole(stakingModule.SLASH_EXECUTOR_ROLE(), slashExecutor);
        stakingModule.grantRole(stakingModule.SEIGNIORAGE_ROUTER_ROLE(), seigniorageRouter);
        vm.stopPrank();

        // Setup operators with stake
        mockBridge.setStake(operator1, 5000 ether);
        mockBridge.setStake(operator2, 500 ether);

        // Setup agent ownership
        mockIdentity.setOwner(1, operator1);
        mockIdentity.setOwner(2, operator2);
    }

    // ============ Initialization Tests ============

    function test_Initialize() public view {
        assertEq(stakingModule.stakingBridge(), address(mockBridge));
        assertEq(stakingModule.identityRegistry(), address(mockIdentity));
        assertTrue(stakingModule.hasRole(stakingModule.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(stakingModule.hasRole(stakingModule.UPGRADER_ROLE(), admin));
        assertTrue(stakingModule.hasRole(stakingModule.SLASH_EXECUTOR_ROLE(), admin));
        assertTrue(stakingModule.hasRole(stakingModule.SLASH_EXECUTOR_ROLE(), slashExecutor));
    }

    // ============ Stake Query Tests ============

    function test_GetStake() public view {
        uint256 stake = stakingModule.getStake(operator1);
        assertEq(stake, 5000 ether);
    }

    function test_GetStake_ZeroForUnknown() public view {
        uint256 stake = stakingModule.getStake(address(0x123));
        assertEq(stake, 0);
    }

    function test_IsVerifiedOperator_True() public view {
        assertTrue(stakingModule.isVerifiedOperator(operator1));
    }

    function test_IsVerifiedOperator_False() public view {
        assertFalse(stakingModule.isVerifiedOperator(operator2));
    }

    function test_GetOperatorStatus() public view {
        (uint256 stake, bool verified, uint256 slashCount, uint256 lastSlash) =
            stakingModule.getOperatorStatus(operator1);

        assertEq(stake, 5000 ether);
        assertTrue(verified);
        assertEq(slashCount, 0);
        assertEq(lastSlash, 0);
    }

    function test_GetOperatorStatus_Unverified() public view {
        (uint256 stake, bool verified, uint256 slashCount, uint256 lastSlash) =
            stakingModule.getOperatorStatus(operator2);

        assertEq(stake, 500 ether);
        assertFalse(verified);
        assertEq(slashCount, 0);
        assertEq(lastSlash, 0);
    }

    // ============ Slashing Condition Tests ============

    function test_RegisterSlashingCondition() public {
        bytes32 conditionHash = keccak256("FAILED_TEE");

        vm.prank(admin);
        stakingModule.registerSlashingCondition(1, conditionHash, 50);

        // Verify condition was registered
        (bytes32 storedHash, uint256 percentage, bool active) = stakingModule.slashingConditions(1, 0);
        assertEq(storedHash, conditionHash);
        assertEq(percentage, 50);
        assertTrue(active);
    }

    function test_RegisterSlashingCondition_MultipleConditions() public {
        bytes32 condition1 = keccak256("FAILED_TEE");
        bytes32 condition2 = keccak256("PROVEN_FRAUD");

        vm.startPrank(admin);
        stakingModule.registerSlashingCondition(1, condition1, 50);
        stakingModule.registerSlashingCondition(1, condition2, 100);
        vm.stopPrank();

        // Verify both conditions
        (bytes32 storedHash1, uint256 percentage1, ) = stakingModule.slashingConditions(1, 0);
        (bytes32 storedHash2, uint256 percentage2, ) = stakingModule.slashingConditions(1, 1);

        assertEq(storedHash1, condition1);
        assertEq(percentage1, 50);
        assertEq(storedHash2, condition2);
        assertEq(percentage2, 100);
    }

    function test_RevertOnInvalidPercentage_Zero() public {
        bytes32 conditionHash = keccak256("INVALID");

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSignature("InvalidPercentage(uint256)", 0));
        stakingModule.registerSlashingCondition(1, conditionHash, 0);
    }

    function test_RevertOnInvalidPercentage_Over100() public {
        bytes32 conditionHash = keccak256("INVALID");

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSignature("InvalidPercentage(uint256)", 101));
        stakingModule.registerSlashingCondition(1, conditionHash, 101);
    }

    function test_RevertOnUnauthorizedSlashingCondition() public {
        bytes32 conditionHash = keccak256("FAILED_TEE");

        vm.prank(unauthorized);
        vm.expectRevert();
        stakingModule.registerSlashingCondition(1, conditionHash, 50);
    }

    // ============ Execute Slash Tests ============

    function test_ExecuteSlash() public {
        bytes32 reason = keccak256("FRAUD");
        bytes memory evidence = abi.encodePacked("fraud_evidence");

        vm.prank(slashExecutor);
        uint256 slashedAmount = stakingModule.executeSlash(1, 50, evidence, reason);

        // 50% of 5000 ether = 2500 ether
        assertEq(slashedAmount, 2500 ether);
    }

    function test_ExecuteSlash_UpdatesSlashRecord() public {
        bytes32 reason = keccak256("FRAUD");
        bytes memory evidence = abi.encodePacked("fraud_evidence");

        vm.prank(slashExecutor);
        stakingModule.executeSlash(1, 50, evidence, reason);

        // Check slash record was updated
        (, , uint256 slashCount, uint256 lastSlash) = stakingModule.getOperatorStatus(operator1);
        assertEq(slashCount, 1);
        assertGt(lastSlash, 0);
    }

    function test_ExecuteSlash_RevertOnInvalidPercentage() public {
        bytes32 reason = keccak256("FRAUD");
        bytes memory evidence = abi.encodePacked("fraud_evidence");

        vm.prank(slashExecutor);
        vm.expectRevert(abi.encodeWithSignature("InvalidPercentage(uint256)", 101));
        stakingModule.executeSlash(1, 101, evidence, reason);
    }

    function test_ExecuteSlash_RevertOnUnauthorized() public {
        bytes32 reason = keccak256("FRAUD");
        bytes memory evidence = abi.encodePacked("fraud_evidence");

        vm.prank(unauthorized);
        vm.expectRevert();
        stakingModule.executeSlash(1, 50, evidence, reason);
    }

    // ============ Seigniorage Tests ============

    function test_CalculateSeigniorageBonus() public view {
        // Currently returns 0 as placeholder
        uint256 bonus = stakingModule.calculateSeigniorageBonus(1, 100 ether);
        assertEq(bonus, 0);
    }

    function test_RouteSeigniorage() public {
        vm.prank(seigniorageRouter);
        stakingModule.routeSeigniorage(1);
        // Should emit event (currently emits with 0 amount as placeholder)
    }

    function test_RouteSeigniorage_RevertOnUnauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        stakingModule.routeSeigniorage(1);
    }

    // ============ Constants Tests ============

    function test_Constants() public view {
        assertEq(stakingModule.SLASHING_FAILED_TEE(), 50);
        assertEq(stakingModule.SLASHING_PROVEN_FRAUD(), 100);
        assertEq(stakingModule.SLASHING_LOW_REPUTATION(), 25);
        assertEq(stakingModule.MIN_OPERATOR_STAKE(), 1000 ether);
        assertEq(stakingModule.PRECISION(), 1e18);
    }

    // ============ Admin Functions Tests ============

    function test_SetStakingBridge() public {
        address newBridge = address(0x999);

        vm.prank(admin);
        stakingModule.setStakingBridge(newBridge);

        assertEq(stakingModule.stakingBridge(), newBridge);
    }

    function test_SetIdentityRegistry() public {
        address newRegistry = address(0x888);

        vm.prank(admin);
        stakingModule.setIdentityRegistry(newRegistry);

        assertEq(stakingModule.identityRegistry(), newRegistry);
    }

    function test_SetReputationRegistry() public {
        address newRegistry = address(0x777);

        vm.prank(admin);
        stakingModule.setReputationRegistry(newRegistry);

        assertEq(stakingModule.reputationRegistry(), newRegistry);
    }

    function test_RevertOnUnauthorizedSetStakingBridge() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        stakingModule.setStakingBridge(address(0x999));
    }

    // ============ Edge Case Tests ============

    function test_GetStake_WhenBridgeNotSet() public {
        // Deploy new module without bridge
        StakingIntegrationModule newModule = new StakingIntegrationModule();
        bytes memory initData = abi.encodeWithSelector(
            StakingIntegrationModule.initialize.selector,
            admin,
            address(0), // no bridge
            address(0),
            address(0)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(newModule), initData);
        StakingIntegrationModule moduleNoBridge = StakingIntegrationModule(address(proxy));

        vm.expectRevert(abi.encodeWithSignature("StakingBridgeNotSet()"));
        moduleNoBridge.getStake(operator1);
    }

    function test_IsVerifiedOperator_WhenBridgeNotSet() public {
        // Deploy new module without bridge
        StakingIntegrationModule newModule = new StakingIntegrationModule();
        bytes memory initData = abi.encodeWithSelector(
            StakingIntegrationModule.initialize.selector,
            admin,
            address(0), // no bridge
            address(0),
            address(0)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(newModule), initData);
        StakingIntegrationModule moduleNoBridge = StakingIntegrationModule(address(proxy));

        // Should return false when bridge not set
        assertFalse(moduleNoBridge.isVerifiedOperator(operator1));
    }

    // ============ Fuzz Tests ============

    function testFuzz_RegisterSlashingCondition(uint256 percentage) public {
        vm.assume(percentage > 0 && percentage <= 100);

        bytes32 conditionHash = keccak256(abi.encodePacked("CONDITION_", percentage));

        vm.prank(admin);
        stakingModule.registerSlashingCondition(1, conditionHash, percentage);

        (bytes32 storedHash, uint256 storedPercentage, bool active) = stakingModule.slashingConditions(1, 0);
        assertEq(storedHash, conditionHash);
        assertEq(storedPercentage, percentage);
        assertTrue(active);
    }

    function testFuzz_ExecuteSlash(uint256 percentage) public {
        vm.assume(percentage > 0 && percentage <= 100);

        bytes32 reason = keccak256("FUZZ_REASON");
        bytes memory evidence = abi.encodePacked("fuzz_evidence");

        vm.prank(slashExecutor);
        uint256 slashedAmount = stakingModule.executeSlash(1, percentage, evidence, reason);

        uint256 expectedSlash = (5000 ether * percentage) / 100;
        assertEq(slashedAmount, expectedSlash);
    }
}
