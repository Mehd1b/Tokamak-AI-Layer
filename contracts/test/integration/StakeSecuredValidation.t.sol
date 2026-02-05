// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {TALValidationRegistry} from "../../src/core/TALValidationRegistry.sol";
import {TALIdentityRegistry} from "../../src/core/TALIdentityRegistry.sol";
import {DRBIntegrationModule} from "../../src/modules/DRBIntegrationModule.sol";
import {ITALValidationRegistry} from "../../src/interfaces/ITALValidationRegistry.sol";
import {IERC8004ValidationRegistry} from "../../src/interfaces/IERC8004ValidationRegistry.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MockStakingV3} from "../mocks/MockStakingV3.sol";
import {MockDRB} from "../mocks/MockDRB.sol";
import {MockZKVerifier} from "../mocks/MockZKVerifier.sol";

/**
 * @title StakeSecuredValidationTest
 * @notice Integration tests for StakeSecured validation model
 * @dev Tests the complete flow of stake-secured validation including DRB selection
 */
contract StakeSecuredValidationTest is Test {
    // ============ Contracts ============
    TALValidationRegistry public validationRegistry;
    TALIdentityRegistry public identityRegistry;
    DRBIntegrationModule public drbModule;
    MockStakingV3 public mockStaking;
    MockDRB public mockDRB;
    MockZKVerifier public mockZKVerifier;

    // ============ Test Accounts ============
    address public admin = address(0x1);
    address public treasury = address(0x2);
    address public agentOwner = address(0x10);
    address public validator1 = address(0x20);
    address public validator2 = address(0x30);
    address public requester = address(0x40);

    // ============ Test Data ============
    uint256 public agentId;
    string public constant AGENT_URI = "ipfs://QmTestAgent";

    // ============ Setup ============

    function setUp() public {
        // Deploy mocks
        mockStaking = new MockStakingV3();
        mockDRB = new MockDRB();
        mockZKVerifier = new MockZKVerifier();

        // Deploy Identity Registry
        TALIdentityRegistry identityImpl = new TALIdentityRegistry();
        bytes memory identityData = abi.encodeWithSelector(
            TALIdentityRegistry.initialize.selector,
            admin,
            address(mockStaking),
            address(mockZKVerifier)
        );
        ERC1967Proxy identityProxy = new ERC1967Proxy(address(identityImpl), identityData);
        identityRegistry = TALIdentityRegistry(address(identityProxy));

        // Deploy Validation Registry
        TALValidationRegistry validationImpl = new TALValidationRegistry();
        bytes memory validationData = abi.encodeWithSelector(
            TALValidationRegistry.initialize.selector,
            admin,
            address(identityRegistry),
            address(0), // reputation registry
            treasury
        );
        ERC1967Proxy validationProxy = new ERC1967Proxy(address(validationImpl), validationData);
        validationRegistry = TALValidationRegistry(payable(address(validationProxy)));

        // Set staking bridge on validation registry
        vm.prank(admin);
        validationRegistry.setStakingBridge(address(mockStaking));

        // Setup operators with stake
        mockStaking.setStake(validator1, 5000 ether);
        mockStaking.setStake(validator2, 3000 ether);
        mockStaking.setStake(agentOwner, 1000 ether);

        // Fund accounts
        vm.deal(requester, 100 ether);
        vm.deal(agentOwner, 10 ether);
        vm.deal(treasury, 0);

        // Register agent
        vm.prank(agentOwner);
        agentId = identityRegistry.register(AGENT_URI);
    }

    // ============ Bounty Requirement Tests ============

    function test_StakeSecuredValidation_RequiresMinBounty() public {
        vm.prank(requester);
        vm.expectRevert(
            abi.encodeWithSignature(
                "InsufficientBounty(uint256,uint256)",
                1 ether,
                10 ether
            )
        );
        validationRegistry.requestValidation{value: 1 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.StakeSecured,
            block.timestamp + 24 hours
        );
    }

    function test_StakeSecuredValidation_AcceptsExactMinBounty() public {
        vm.prank(requester);
        bytes32 requestHash = validationRegistry.requestValidation{value: 10 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.StakeSecured,
            block.timestamp + 24 hours
        );

        assertTrue(requestHash != bytes32(0));

        // Verify request was created
        (ITALValidationRegistry.ValidationRequest memory request, ) = validationRegistry.getValidation(requestHash);
        assertEq(request.agentId, agentId);
        assertEq(request.bounty, 10 ether);
        assertEq(uint(request.model), uint(IERC8004ValidationRegistry.ValidationModel.StakeSecured));
        assertEq(uint(request.status), uint(IERC8004ValidationRegistry.ValidationStatus.Pending));
    }

    function test_StakeSecuredValidation_AcceptsHigherBounty() public {
        vm.prank(requester);
        bytes32 requestHash = validationRegistry.requestValidation{value: 50 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.StakeSecured,
            block.timestamp + 24 hours
        );

        assertTrue(requestHash != bytes32(0));

        (ITALValidationRegistry.ValidationRequest memory request, ) = validationRegistry.getValidation(requestHash);
        assertEq(request.bounty, 50 ether);
    }

    // ============ Full Validation Flow Tests ============

    function test_StakeSecuredValidation_CompleteFlow() public {
        // Step 1: Request validation
        vm.prank(requester);
        bytes32 requestHash = validationRegistry.requestValidation{value: 10 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.StakeSecured,
            block.timestamp + 24 hours
        );

        // Step 2: Select validator (admin has DRB_ROLE)
        address[] memory candidates = new address[](2);
        candidates[0] = validator1;
        candidates[1] = validator2;

        vm.prank(admin);
        address selectedValidator = validationRegistry.selectValidator(requestHash, candidates);
        assertTrue(selectedValidator == validator1 || selectedValidator == validator2);

        // Step 3: Submit validation as selected validator
        vm.prank(selectedValidator);
        validationRegistry.submitValidation(
            requestHash,
            85, // score
            abi.encodePacked("stake_proof"),
            "ipfs://validation_details"
        );

        // Step 4: Verify completion
        (ITALValidationRegistry.ValidationRequest memory request, ITALValidationRegistry.ValidationResponse memory response) =
            validationRegistry.getValidation(requestHash);

        assertEq(uint(request.status), uint(IERC8004ValidationRegistry.ValidationStatus.Completed));
        assertEq(response.validator, selectedValidator);
        assertEq(response.score, 85);
    }

    function test_StakeSecuredValidation_RejectNonSelectedValidator() public {
        // Request validation
        vm.prank(requester);
        bytes32 requestHash = validationRegistry.requestValidation{value: 10 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.StakeSecured,
            block.timestamp + 24 hours
        );

        // Select validator1
        address[] memory candidates = new address[](2);
        candidates[0] = validator1;
        candidates[1] = validator2;

        vm.prank(admin);
        address selectedValidator = validationRegistry.selectValidator(requestHash, candidates);

        // Determine non-selected validator
        address nonSelected = selectedValidator == validator1 ? validator2 : validator1;

        // Try to submit as non-selected validator
        vm.prank(nonSelected);
        vm.expectRevert(
            abi.encodeWithSignature(
                "NotSelectedValidator(bytes32,address)",
                requestHash,
                nonSelected
            )
        );
        validationRegistry.submitValidation(
            requestHash,
            85,
            abi.encodePacked("invalid_proof"),
            "ipfs://details"
        );
    }

    // ============ Bounty Distribution Tests ============

    function test_StakeSecuredValidation_BountyDistribution() public {
        uint256 bountyAmount = 10 ether;

        // Track initial balances
        uint256 treasuryBefore = treasury.balance;
        uint256 agentOwnerBefore = agentOwner.balance;

        // Request validation
        vm.prank(requester);
        bytes32 requestHash = validationRegistry.requestValidation{value: bountyAmount}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.StakeSecured,
            block.timestamp + 24 hours
        );

        // Select and submit validation
        address[] memory candidates = new address[](1);
        candidates[0] = validator1;

        vm.prank(admin);
        validationRegistry.selectValidator(requestHash, candidates);

        uint256 validatorBefore = validator1.balance;

        vm.prank(validator1);
        validationRegistry.submitValidation(
            requestHash,
            90,
            abi.encodePacked("proof"),
            "ipfs://details"
        );

        // Verify bounty distribution
        // Protocol fee: 10% = 1 ether
        // Remaining: 9 ether
        // Agent: 10% of remaining = 0.9 ether
        // Validator: 90% of remaining = 8.1 ether

        assertEq(treasury.balance - treasuryBefore, 1 ether, "Treasury should receive 10%");
        assertEq(agentOwner.balance - agentOwnerBefore, 0.9 ether, "Agent owner should receive 9%");
        assertEq(validator1.balance - validatorBefore, 8.1 ether, "Validator should receive 81%");
    }

    // ============ Deadline Tests ============

    function test_StakeSecuredValidation_RejectAfterDeadline() public {
        // Request validation with short deadline
        vm.prank(requester);
        bytes32 requestHash = validationRegistry.requestValidation{value: 10 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.StakeSecured,
            block.timestamp + 1 hours
        );

        // Select validator
        address[] memory candidates = new address[](1);
        candidates[0] = validator1;

        vm.prank(admin);
        validationRegistry.selectValidator(requestHash, candidates);

        // Warp past deadline
        vm.warp(block.timestamp + 2 hours);

        // Try to submit after deadline
        vm.prank(validator1);
        vm.expectRevert(abi.encodeWithSignature("ValidationExpired(bytes32)", requestHash));
        validationRegistry.submitValidation(
            requestHash,
            85,
            abi.encodePacked("proof"),
            "ipfs://details"
        );
    }

    // ============ Parameter Update Tests ============

    function test_UpdateMinStakeSecuredBounty() public {
        // Update minimum bounty
        vm.prank(admin);
        validationRegistry.updateValidationParameters(
            20 ether, // new min stake secured bounty
            1 ether,  // min TEE bounty
            1000      // protocol fee bps
        );

        // Old minimum should now fail
        vm.prank(requester);
        vm.expectRevert(
            abi.encodeWithSignature(
                "InsufficientBounty(uint256,uint256)",
                10 ether,
                20 ether
            )
        );
        validationRegistry.requestValidation{value: 10 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.StakeSecured,
            block.timestamp + 24 hours
        );

        // New minimum should work
        vm.prank(requester);
        bytes32 requestHash = validationRegistry.requestValidation{value: 20 ether}(
            agentId,
            keccak256("task2"),
            keccak256("output2"),
            IERC8004ValidationRegistry.ValidationModel.StakeSecured,
            block.timestamp + 24 hours
        );

        assertTrue(requestHash != bytes32(0));
    }

    // ============ Events Tests ============

    function test_StakeSecuredValidation_EmitsEvents() public {
        // Test ValidationRequested event
        vm.prank(requester);
        vm.expectEmit(false, true, true, false);
        emit IERC8004ValidationRegistry.ValidationRequested(
            bytes32(0), // We don't know hash yet
            agentId,
            IERC8004ValidationRegistry.ValidationModel.StakeSecured
        );
        bytes32 requestHash = validationRegistry.requestValidation{value: 10 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.StakeSecured,
            block.timestamp + 24 hours
        );

        // Select validator
        address[] memory candidates = new address[](1);
        candidates[0] = validator1;

        // Test ValidatorSelected event
        vm.prank(admin);
        vm.expectEmit(true, true, false, false);
        emit ITALValidationRegistry.ValidatorSelected(requestHash, validator1, 0);
        validationRegistry.selectValidator(requestHash, candidates);

        // Test ValidationCompleted event
        vm.prank(validator1);
        vm.expectEmit(true, true, true, false);
        emit IERC8004ValidationRegistry.ValidationCompleted(requestHash, validator1, 90);
        validationRegistry.submitValidation(
            requestHash,
            90,
            abi.encodePacked("proof"),
            "ipfs://details"
        );
    }

    // ============ Query Tests ============

    function test_GetValidationsByRequester() public {
        // Create multiple validations
        vm.startPrank(requester);

        bytes32 hash1 = validationRegistry.requestValidation{value: 10 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.StakeSecured,
            block.timestamp + 24 hours
        );

        bytes32 hash2 = validationRegistry.requestValidation{value: 10 ether}(
            agentId,
            keccak256("task2"),
            keccak256("output2"),
            IERC8004ValidationRegistry.ValidationModel.StakeSecured,
            block.timestamp + 24 hours
        );

        vm.stopPrank();

        bytes32[] memory validations = validationRegistry.getValidationsByRequester(requester);
        assertEq(validations.length, 2);
        assertEq(validations[0], hash1);
        assertEq(validations[1], hash2);
    }

    function test_GetAgentValidations() public {
        vm.prank(requester);
        bytes32 hash1 = validationRegistry.requestValidation{value: 10 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.StakeSecured,
            block.timestamp + 24 hours
        );

        bytes32[] memory validations = validationRegistry.getAgentValidations(agentId);
        assertEq(validations.length, 1);
        assertEq(validations[0], hash1);
    }

    function test_GetPendingValidationCount() public {
        // Initially no pending
        assertEq(validationRegistry.getPendingValidationCount(agentId), 0);

        // Create validation
        vm.prank(requester);
        validationRegistry.requestValidation{value: 10 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.StakeSecured,
            block.timestamp + 24 hours
        );

        // Should have 1 pending
        assertEq(validationRegistry.getPendingValidationCount(agentId), 1);
    }
}
