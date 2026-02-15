// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {TALValidationRegistry} from "../../src/core/TALValidationRegistry.sol";
import {TALValidationRegistryV2} from "../../src/core/TALValidationRegistryV2.sol";
import {TALValidationRegistryV3} from "../../src/core/TALValidationRegistryV3.sol";
import {TALIdentityRegistry} from "../../src/core/TALIdentityRegistry.sol";
import {ITALValidationRegistry} from "../../src/interfaces/ITALValidationRegistry.sol";
import {IERC8004ValidationRegistry} from "../../src/interfaces/IERC8004ValidationRegistry.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MockStakingV3} from "../mocks/MockStakingV3.sol";
import {MockDRB} from "../mocks/MockDRB.sol";
import {MockZKVerifier} from "../mocks/MockZKVerifier.sol";

/**
 * @title TALValidationRegistryV3Test
 * @notice Unit and integration tests for TALValidationRegistryV3
 * @dev Tests V3 features: ReputationOnly disabled, dual-staking enforcement,
 *      missed deadline slashing, incorrect computation slashing, and upgrades.
 *      Setup deploys via proxy with V1 -> V2 -> V3 upgrade chain.
 */
contract TALValidationRegistryV3Test is Test {
    // ============ Contracts ============
    TALValidationRegistryV3 public registry;
    TALIdentityRegistry public identityRegistry;
    MockStakingV3 public mockStaking;
    MockDRB public mockDRB;
    MockZKVerifier public mockZKVerifier;

    // Keep proxy reference for upgrade tests
    ERC1967Proxy public validationProxy;

    // ============ Test Accounts ============
    address public admin = address(0x1);
    address public treasury = address(0x2);
    address public agentOwner = address(0x10);
    address public validator1 = address(0x20);
    address public validator2 = address(0x30);
    address public requester = address(0x40);
    address public slasher = address(0x50); // permissionless caller

    // ============ Test Data ============
    uint256 public agentId;
    string public constant AGENT_URI = "ipfs://QmTestAgentV3";

    // ============ Setup ============

    function setUp() public {
        // Deploy mocks
        mockStaking = new MockStakingV3();
        mockDRB = new MockDRB();
        mockZKVerifier = new MockZKVerifier();

        // Deploy Identity Registry via proxy
        TALIdentityRegistry identityImpl = new TALIdentityRegistry();
        bytes memory identityData = abi.encodeWithSelector(
            TALIdentityRegistry.initialize.selector,
            admin,
            address(mockStaking),
            address(mockZKVerifier)
        );
        ERC1967Proxy identityProxy = new ERC1967Proxy(address(identityImpl), identityData);
        identityRegistry = TALIdentityRegistry(address(identityProxy));

        // Deploy Validation Registry V1 via proxy
        TALValidationRegistry v1Impl = new TALValidationRegistry();
        bytes memory validationData = abi.encodeWithSelector(
            TALValidationRegistry.initialize.selector,
            admin,
            address(identityRegistry),
            address(0), // reputation registry
            treasury
        );
        validationProxy = new ERC1967Proxy(address(v1Impl), validationData);

        // Upgrade to V2
        TALValidationRegistryV2 v2Impl = new TALValidationRegistryV2();
        vm.prank(admin);
        TALValidationRegistry(payable(address(validationProxy))).upgradeToAndCall(
            address(v2Impl),
            abi.encodeCall(TALValidationRegistryV2.initializeV2, ())
        );

        // Upgrade to V3
        TALValidationRegistryV3 v3Impl = new TALValidationRegistryV3();
        vm.prank(admin);
        TALValidationRegistryV2(payable(address(validationProxy))).upgradeToAndCall(
            address(v3Impl),
            abi.encodeCall(TALValidationRegistryV3.initializeV3, ())
        );

        // Cast proxy to V3
        registry = TALValidationRegistryV3(payable(address(validationProxy)));

        // Set staking bridge on validation registry
        vm.prank(admin);
        registry.setStakingBridge(address(mockStaking));

        // Setup operator stakes
        mockStaking.setStake(validator1, 5000 ether);
        mockStaking.setStake(validator2, 3000 ether);
        mockStaking.setStake(agentOwner, 2000 ether);

        // Fund accounts
        vm.deal(requester, 200 ether);
        vm.deal(agentOwner, 10 ether);
        vm.deal(slasher, 1 ether);
        vm.deal(treasury, 0);

        // Register agent
        vm.prank(agentOwner);
        agentId = identityRegistry.register(AGENT_URI);
    }

    // ============ Helper Functions ============

    function _requestStakeSecured() internal returns (bytes32) {
        vm.prank(requester);
        return registry.requestValidation{value: 10 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.StakeSecured,
            block.timestamp + 24 hours
        );
    }

    function _requestStakeSecuredWithDeadline(uint256 deadline) internal returns (bytes32) {
        vm.prank(requester);
        return registry.requestValidation{value: 10 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.StakeSecured,
            deadline
        );
    }

    function _selectValidator(bytes32 requestHash, address validator) internal {
        address[] memory candidates = new address[](1);
        candidates[0] = validator;
        vm.prank(admin);
        registry.selectValidator(requestHash, candidates);
    }

    function _submitValidation(bytes32 requestHash, address validator, uint8 score) internal {
        vm.prank(validator);
        registry.submitValidation(
            requestHash,
            score,
            abi.encodePacked("proof"),
            "ipfs://details"
        );
    }

    // ================================================================
    //                  REPUTATION-ONLY DISABLED TESTS (5)
    // ================================================================

    function test_V3_ReputationOnly_Reverts() public {
        vm.prank(requester);
        vm.expectRevert(
            abi.encodeWithSelector(ITALValidationRegistry.ReputationOnlyNoValidationNeeded.selector)
        );
        registry.requestValidation{value: 0}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.ReputationOnly,
            block.timestamp + 24 hours
        );
    }

    function test_V3_StakeSecured_StillWorks() public {
        bytes32 requestHash = _requestStakeSecured();
        assertTrue(requestHash != bytes32(0));

        (ITALValidationRegistry.ValidationRequest memory request,) = registry.getValidation(requestHash);
        assertEq(uint(request.model), uint(IERC8004ValidationRegistry.ValidationModel.StakeSecured));
        assertEq(uint(request.status), uint(IERC8004ValidationRegistry.ValidationStatus.Pending));
    }

    function test_V3_TEEAttested_StillWorks() public {
        vm.prank(requester);
        bytes32 requestHash = registry.requestValidation{value: 1 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.TEEAttested,
            block.timestamp + 24 hours
        );

        assertTrue(requestHash != bytes32(0));
        (ITALValidationRegistry.ValidationRequest memory request,) = registry.getValidation(requestHash);
        assertEq(uint(request.model), uint(IERC8004ValidationRegistry.ValidationModel.TEEAttested));
    }

    function test_V3_Hybrid_StillWorks() public {
        vm.prank(requester);
        bytes32 requestHash = registry.requestValidation{value: 10 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.Hybrid,
            block.timestamp + 24 hours
        );

        assertTrue(requestHash != bytes32(0));
        (ITALValidationRegistry.ValidationRequest memory request,) = registry.getValidation(requestHash);
        assertEq(uint(request.model), uint(IERC8004ValidationRegistry.ValidationModel.Hybrid));
    }

    function test_V3_ReputationOnly_WithBounty_StillReverts() public {
        vm.prank(requester);
        vm.expectRevert(
            abi.encodeWithSelector(ITALValidationRegistry.ReputationOnlyNoValidationNeeded.selector)
        );
        registry.requestValidation{value: 10 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.ReputationOnly,
            block.timestamp + 24 hours
        );
    }

    // ================================================================
    //                  DUAL STAKING ENFORCEMENT TESTS (4)
    // ================================================================

    function test_V3_DualStaking_InsufficientAgentOwnerStake_Reverts() public {
        // Set agent owner stake below 1000 TON
        mockStaking.setStake(agentOwner, 999 ether);

        vm.prank(requester);
        vm.expectRevert(
            abi.encodeWithSelector(
                ITALValidationRegistry.InsufficientAgentOwnerStake.selector,
                agentOwner,
                999 ether,
                1000 ether
            )
        );
        registry.requestValidation{value: 10 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.StakeSecured,
            block.timestamp + 24 hours
        );
    }

    function test_V3_DualStaking_SufficientStake_Succeeds() public {
        // Agent owner has 2000 ether (set in setUp)
        bytes32 requestHash = _requestStakeSecured();
        assertTrue(requestHash != bytes32(0));

        // Full flow: select validator + submit
        _selectValidator(requestHash, validator1);
        _submitValidation(requestHash, validator1, 85);

        (ITALValidationRegistry.ValidationRequest memory request,) = registry.getValidation(requestHash);
        assertEq(uint(request.status), uint(IERC8004ValidationRegistry.ValidationStatus.Completed));
    }

    function test_V3_DualStaking_ExactMinimum_Passes() public {
        // Set agent owner stake to exactly 1000 TON (boundary)
        mockStaking.setStake(agentOwner, 1000 ether);

        bytes32 requestHash = _requestStakeSecured();
        assertTrue(requestHash != bytes32(0));

        (ITALValidationRegistry.ValidationRequest memory request,) = registry.getValidation(requestHash);
        assertEq(uint(request.status), uint(IERC8004ValidationRegistry.ValidationStatus.Pending));
    }

    function test_V3_DualStaking_ValidatorInsufficientStake_Reverts() public {
        // Set validator stake below minimum
        mockStaking.setStake(validator1, 500 ether);

        bytes32 requestHash = _requestStakeSecured();
        _selectValidator(requestHash, validator1);

        vm.prank(validator1);
        vm.expectRevert("Validator not verified: insufficient L1 stake");
        registry.submitValidation(
            requestHash,
            85,
            abi.encodePacked("proof"),
            "ipfs://details"
        );
    }

    // ================================================================
    //                MISSED DEADLINE SLASHING TESTS (7)
    // ================================================================

    function test_V3_MissedDeadline_FullFlow() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 requestHash = _requestStakeSecuredWithDeadline(deadline);

        _selectValidator(requestHash, validator1);

        uint256 validatorStakeBefore = mockStaking.stakes(validator1);
        uint256 requesterBalanceBefore = requester.balance;

        // Warp past deadline
        vm.warp(deadline + 1);

        // Anyone can call slashForMissedDeadline
        vm.prank(slasher);
        registry.slashForMissedDeadline(requestHash);

        // Verify 10% slash of validator stake
        uint256 expectedSlash = (validatorStakeBefore * 10) / 100; // 10% of 5000 = 500
        uint256 validatorStakeAfter = mockStaking.stakes(validator1);
        assertEq(validatorStakeBefore - validatorStakeAfter, expectedSlash, "Should slash 10% of validator stake");

        // Verify bounty refunded to requester
        assertEq(requester.balance - requesterBalanceBefore, 10 ether, "Bounty should be refunded");

        // Verify request status is Expired
        (ITALValidationRegistry.ValidationRequest memory request,) = registry.getValidation(requestHash);
        assertEq(uint(request.status), uint(IERC8004ValidationRegistry.ValidationStatus.Expired));
    }

    function test_V3_MissedDeadline_BeforeDeadline_Reverts() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 requestHash = _requestStakeSecuredWithDeadline(deadline);

        _selectValidator(requestHash, validator1);

        // Try to slash before deadline
        vm.prank(slasher);
        vm.expectRevert(
            abi.encodeWithSelector(ITALValidationRegistry.DeadlineNotPassed.selector, requestHash)
        );
        registry.slashForMissedDeadline(requestHash);
    }

    function test_V3_MissedDeadline_AlreadyCompleted_Reverts() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 requestHash = _requestStakeSecuredWithDeadline(deadline);

        _selectValidator(requestHash, validator1);
        _submitValidation(requestHash, validator1, 85);

        // Warp past deadline
        vm.warp(deadline + 1);

        // Request is Completed, not Pending
        vm.prank(slasher);
        vm.expectRevert(
            abi.encodeWithSelector(ITALValidationRegistry.ValidationAlreadyCompleted.selector, requestHash)
        );
        registry.slashForMissedDeadline(requestHash);
    }

    function test_V3_MissedDeadline_NoValidatorSelected_Reverts() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 requestHash = _requestStakeSecuredWithDeadline(deadline);

        // Do NOT select a validator
        vm.warp(deadline + 1);

        vm.prank(slasher);
        vm.expectRevert(
            abi.encodeWithSelector(ITALValidationRegistry.NoValidatorSelected.selector, requestHash)
        );
        registry.slashForMissedDeadline(requestHash);
    }

    function test_V3_MissedDeadline_DoubleSlash_Reverts() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 requestHash = _requestStakeSecuredWithDeadline(deadline);

        _selectValidator(requestHash, validator1);
        vm.warp(deadline + 1);

        // First slash succeeds (sets status to Expired and _deadlineSlashExecuted to true)
        vm.prank(slasher);
        registry.slashForMissedDeadline(requestHash);

        // Second slash reverts -- status is now Expired (not Pending), so
        // the status check triggers ValidationAlreadyCompleted before
        // reaching the AlreadySlashedForDeadline guard.
        vm.prank(slasher);
        vm.expectRevert(
            abi.encodeWithSelector(ITALValidationRegistry.ValidationAlreadyCompleted.selector, requestHash)
        );
        registry.slashForMissedDeadline(requestHash);
    }

    function test_V3_MissedDeadline_TEEAttested_Reverts() public {
        // Create TEEAttested request (not StakeSecured or Hybrid)
        vm.prank(requester);
        bytes32 requestHash = registry.requestValidation{value: 1 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.TEEAttested,
            block.timestamp + 1 hours
        );

        vm.warp(block.timestamp + 2 hours);

        vm.prank(slasher);
        vm.expectRevert(
            abi.encodeWithSelector(ITALValidationRegistry.NotSlashableModel.selector, requestHash)
        );
        registry.slashForMissedDeadline(requestHash);
    }

    function test_V3_MissedDeadline_AnyoneCanCall() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 requestHash = _requestStakeSecuredWithDeadline(deadline);

        _selectValidator(requestHash, validator1);
        vm.warp(deadline + 1);

        // Random address can call
        address randomCaller = address(0xBEEF);
        vm.prank(randomCaller);
        registry.slashForMissedDeadline(requestHash);

        // Verify it worked
        (ITALValidationRegistry.ValidationRequest memory request,) = registry.getValidation(requestHash);
        assertEq(uint(request.status), uint(IERC8004ValidationRegistry.ValidationStatus.Expired));
    }

    // ================================================================
    //            INCORRECT COMPUTATION SLASHING TESTS (5)
    // ================================================================

    function test_V3_IncorrectComputation_ScoreBelow50_SlashesAgentOwner() public {
        bytes32 requestHash = _requestStakeSecured();
        _selectValidator(requestHash, validator1);

        uint256 ownerStakeBefore = mockStaking.stakes(agentOwner);

        // Submit with score < 50 (incorrect computation)
        vm.expectEmit(true, true, false, true);
        emit ITALValidationRegistry.AgentSlashed(
            agentId,
            requestHash,
            (ownerStakeBefore * 50) / 100, // 50% of owner stake
            50
        );
        _submitValidation(requestHash, validator1, 30);

        // Verify 50% of agent owner's stake was slashed
        uint256 ownerStakeAfter = mockStaking.stakes(agentOwner);
        uint256 expectedSlash = (ownerStakeBefore * 50) / 100; // 50% of 2000 = 1000
        assertEq(ownerStakeBefore - ownerStakeAfter, expectedSlash, "Should slash 50% of agent owner stake");
    }

    function test_V3_IncorrectComputation_ScoreAbove50_NoSlash() public {
        bytes32 requestHash = _requestStakeSecured();
        _selectValidator(requestHash, validator1);

        uint256 ownerStakeBefore = mockStaking.stakes(agentOwner);

        // Submit with score >= 50 (correct computation)
        _submitValidation(requestHash, validator1, 75);

        // No slash
        uint256 ownerStakeAfter = mockStaking.stakes(agentOwner);
        assertEq(ownerStakeBefore, ownerStakeAfter, "Should NOT slash for score >= 50");
    }

    function test_V3_IncorrectComputation_ScoreExactly50_NoSlash() public {
        bytes32 requestHash = _requestStakeSecured();
        _selectValidator(requestHash, validator1);

        uint256 ownerStakeBefore = mockStaking.stakes(agentOwner);

        // Submit with score == 50 (boundary: NOT slashed, threshold is strict <)
        _submitValidation(requestHash, validator1, 50);

        uint256 ownerStakeAfter = mockStaking.stakes(agentOwner);
        assertEq(ownerStakeBefore, ownerStakeAfter, "Score == 50 should NOT be slashed (strict < threshold)");
    }

    function test_V3_IncorrectComputation_ExactSlashAmount() public {
        // Set a specific stake to verify exact calculation
        mockStaking.setStake(agentOwner, 4000 ether);

        bytes32 requestHash = _requestStakeSecured();
        _selectValidator(requestHash, validator1);

        _submitValidation(requestHash, validator1, 10); // score < 50

        // 50% of 4000 = 2000
        uint256 ownerStakeAfter = mockStaking.stakes(agentOwner);
        assertEq(ownerStakeAfter, 2000 ether, "Exact slash: 50% of 4000 = 2000 remaining");
    }

    function test_V3_IncorrectComputation_BountyStillDistributed() public {
        bytes32 requestHash = _requestStakeSecured();
        _selectValidator(requestHash, validator1);

        uint256 validatorBalanceBefore = validator1.balance;
        uint256 treasuryBalanceBefore = treasury.balance;
        uint256 agentOwnerBalanceBefore = agentOwner.balance;

        // Submit with low score -- triggers slash but bounty should still be distributed
        _submitValidation(requestHash, validator1, 10);

        // Bounty distribution: 10 ether total
        // Treasury: 10% = 1 ether
        // Agent owner: 10% of remaining 9 = 0.9 ether
        // Validator: rest = 8.1 ether
        assertEq(treasury.balance - treasuryBalanceBefore, 1 ether, "Treasury should receive fee");
        assertEq(agentOwner.balance - agentOwnerBalanceBefore, 0.9 ether, "Agent owner should receive reward");
        assertEq(validator1.balance - validatorBalanceBefore, 8.1 ether, "Validator should receive reward");
    }

    // ================================================================
    //                      UPGRADE TESTS (3)
    // ================================================================

    function test_V3_Upgrade_V2ToV3_Succeeds() public {
        // Deploy fresh V1 proxy
        TALValidationRegistry freshV1 = new TALValidationRegistry();
        bytes memory initData = abi.encodeWithSelector(
            TALValidationRegistry.initialize.selector,
            admin,
            address(identityRegistry),
            address(0),
            treasury
        );
        ERC1967Proxy freshProxy = new ERC1967Proxy(address(freshV1), initData);

        // Upgrade to V2
        TALValidationRegistryV2 freshV2Impl = new TALValidationRegistryV2();
        vm.prank(admin);
        TALValidationRegistry(payable(address(freshProxy))).upgradeToAndCall(
            address(freshV2Impl),
            abi.encodeCall(TALValidationRegistryV2.initializeV2, ())
        );

        // Verify V2 works
        TALValidationRegistryV2 freshV2 = TALValidationRegistryV2(payable(address(freshProxy)));
        assertEq(freshV2.EPOCH_DURATION(), 30 days);

        // Upgrade to V3
        TALValidationRegistryV3 freshV3Impl = new TALValidationRegistryV3();
        vm.prank(admin);
        freshV2.upgradeToAndCall(
            address(freshV3Impl),
            abi.encodeCall(TALValidationRegistryV3.initializeV3, ())
        );

        // Verify V3 constants are accessible
        TALValidationRegistryV3 freshV3 = TALValidationRegistryV3(payable(address(freshProxy)));
        assertEq(freshV3.MIN_AGENT_OWNER_STAKE(), 1000 ether);
        assertEq(freshV3.SLASH_MISSED_DEADLINE_PCT(), 10);
        assertEq(freshV3.SLASH_INCORRECT_COMPUTATION_PCT(), 50);
        assertEq(freshV3.INCORRECT_COMPUTATION_THRESHOLD(), 50);
    }

    function test_V3_Upgrade_V1V2StoragePreserved() public {
        // Use the main proxy from setUp which went through V1 -> V2 -> V3

        // V1 storage: identity registry, treasury, admin roles should persist
        assertEq(registry.identityRegistry(), address(identityRegistry));
        assertEq(registry.getTreasury(), treasury);
        assertTrue(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(registry.hasRole(registry.UPGRADER_ROLE(), admin));
        assertTrue(registry.hasRole(registry.DRB_ROLE(), admin));

        // V1 storage: Create a request and verify it works
        bytes32 requestHash = _requestStakeSecured();
        (ITALValidationRegistry.ValidationRequest memory request,) = registry.getValidation(requestHash);
        assertEq(request.agentId, agentId);
        assertEq(request.bounty, 10 ether);
    }

    function test_V3_Upgrade_V2EpochStatsContinueWorking() public {
        // Create and complete a validation to generate V2 epoch stats
        bytes32 requestHash = _requestStakeSecured();
        _selectValidator(requestHash, validator1);
        _submitValidation(requestHash, validator1, 85);

        // V2 epoch functions should still work
        uint256 currentEpoch = registry.currentEpoch();
        (uint256 total, uint256 failed) = registry.getEpochStats(agentId, currentEpoch);
        assertEq(total, 1, "Should have 1 total validation in epoch");
        assertEq(failed, 0, "Score 85 should not be a failure");

        // Submit another with low score (triggers V3 slash + V2 stats update)
        vm.prank(requester);
        bytes32 requestHash2 = registry.requestValidation{value: 10 ether}(
            agentId,
            keccak256("task2"),
            keccak256("output2"),
            IERC8004ValidationRegistry.ValidationModel.StakeSecured,
            block.timestamp + 24 hours
        );
        _selectValidator(requestHash2, validator1);
        _submitValidation(requestHash2, validator1, 30);

        (uint256 total2, uint256 failed2) = registry.getEpochStats(agentId, currentEpoch);
        assertEq(total2, 2, "Should have 2 total validations in epoch");
        assertEq(failed2, 1, "Score 30 should count as failure");

        // getAgentValidationStats within 30 days should match
        (uint256 windowTotal, uint256 windowFailed) = registry.getAgentValidationStats(agentId, 30 days);
        assertEq(windowTotal, 2);
        assertEq(windowFailed, 1);
    }

    // ================================================================
    //                      EVENT EMISSION TESTS
    // ================================================================

    function test_V3_MissedDeadline_EmitsOperatorSlashedForDeadline() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 requestHash = _requestStakeSecuredWithDeadline(deadline);
        _selectValidator(requestHash, validator1);

        vm.warp(deadline + 1);

        vm.expectEmit(true, true, false, false);
        emit ITALValidationRegistry.OperatorSlashedForDeadline(requestHash, validator1);

        vm.prank(slasher);
        registry.slashForMissedDeadline(requestHash);
    }

    function test_V3_InitializeV3_EmitsEvent() public {
        // Deploy fresh chain to check event
        TALValidationRegistry freshV1 = new TALValidationRegistry();
        bytes memory initData = abi.encodeWithSelector(
            TALValidationRegistry.initialize.selector,
            admin,
            address(0),
            address(0),
            treasury
        );
        ERC1967Proxy freshProxy = new ERC1967Proxy(address(freshV1), initData);

        TALValidationRegistryV2 freshV2Impl = new TALValidationRegistryV2();
        vm.prank(admin);
        TALValidationRegistry(payable(address(freshProxy))).upgradeToAndCall(
            address(freshV2Impl),
            abi.encodeCall(TALValidationRegistryV2.initializeV2, ())
        );

        TALValidationRegistryV3 freshV3Impl = new TALValidationRegistryV3();

        vm.expectEmit(false, false, false, false);
        emit TALValidationRegistryV3.V3Initialized();

        vm.prank(admin);
        TALValidationRegistryV2(payable(address(freshProxy))).upgradeToAndCall(
            address(freshV3Impl),
            abi.encodeCall(TALValidationRegistryV3.initializeV3, ())
        );
    }
}
