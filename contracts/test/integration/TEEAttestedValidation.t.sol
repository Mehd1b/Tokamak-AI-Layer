// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {TALValidationRegistry} from "../../src/core/TALValidationRegistry.sol";
import {TALIdentityRegistry} from "../../src/core/TALIdentityRegistry.sol";
import {ITALValidationRegistry} from "../../src/interfaces/ITALValidationRegistry.sol";
import {IERC8004ValidationRegistry} from "../../src/interfaces/IERC8004ValidationRegistry.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MockStakingV3} from "../mocks/MockStakingV3.sol";
import {MockTEEProvider} from "../mocks/MockTEEProvider.sol";
import {MockZKVerifier} from "../mocks/MockZKVerifier.sol";

/**
 * @title TEEAttestedValidationTest
 * @notice Integration tests for TEEAttested validation model
 * @dev Tests TEE provider management and attestation verification flow
 */
contract TEEAttestedValidationTest is Test {
    // ============ Contracts ============
    TALValidationRegistry public validationRegistry;
    TALIdentityRegistry public identityRegistry;
    MockStakingV3 public mockStaking;
    MockTEEProvider public mockTEE;
    MockZKVerifier public mockZKVerifier;

    // ============ Test Accounts ============
    address public admin = address(0x1);
    address public treasury = address(0x2);
    address public agentOwner = address(0x10);
    address public teeValidator;
    uint256 public teeValidatorKey = 0x20;
    address public teeValidator2;
    uint256 public teeValidator2Key = 0x30;
    address public requester = address(0x40);
    address public untrustedProvider = address(0x50);

    // ============ Test Data ============
    bytes32 public constant ENCLAVE_HASH = keccak256("test_enclave_v1");
    uint256 public agentId;
    string public constant AGENT_URI = "ipfs://QmTestAgent";

    // ============ Setup ============

    function setUp() public {
        // Derive validator addresses from private keys
        teeValidator = vm.addr(teeValidatorKey);
        teeValidator2 = vm.addr(teeValidator2Key);

        // Deploy mocks
        mockStaking = new MockStakingV3();
        mockTEE = new MockTEEProvider();
        mockZKVerifier = new MockZKVerifier();

        // Deploy Identity Registry
        TALIdentityRegistry identityImpl = new TALIdentityRegistry();
        bytes memory identityData = abi.encodeWithSelector(
            TALIdentityRegistry.initialize.selector,
            admin,
            address(mockZKVerifier),
            address(0), // validationRegistry (set later if needed)
            1000 ether, // minOperatorStake
            7 days      // reactivationCooldown
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

        // Add TEE providers
        vm.startPrank(admin);
        validationRegistry.setTrustedTEEProvider(teeValidator);
        validationRegistry.setTrustedTEEProvider(teeValidator2);
        // Register enclave hashes for the providers
        validationRegistry.setTEEEnclaveHash(teeValidator, ENCLAVE_HASH);
        validationRegistry.setTEEEnclaveHash(teeValidator2, ENCLAVE_HASH);
        vm.stopPrank();

        // Setup stake for agent owner
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

    function test_TEEValidation_RequiresMinBounty() public {
        vm.prank(requester);
        vm.expectRevert(
            abi.encodeWithSignature(
                "InsufficientBounty(uint256,uint256)",
                0.5 ether,
                1 ether
            )
        );
        validationRegistry.requestValidation{value: 0.5 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.TEEAttested,
            block.timestamp + 1 hours
        );
    }

    function test_TEEValidation_AcceptsExactMinBounty() public {
        vm.prank(requester);
        bytes32 requestHash = validationRegistry.requestValidation{value: 1 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.TEEAttested,
            block.timestamp + 1 hours
        );

        assertTrue(requestHash != bytes32(0));

        // Verify request was created
        (ITALValidationRegistry.ValidationRequest memory request, ) = validationRegistry.getValidation(requestHash);
        assertEq(request.agentId, agentId);
        assertEq(request.bounty, 1 ether);
        assertEq(uint(request.model), uint(IERC8004ValidationRegistry.ValidationModel.TEEAttested));
        assertEq(uint(request.status), uint(IERC8004ValidationRegistry.ValidationStatus.Pending));
    }

    function test_TEEValidation_AcceptsHigherBounty() public {
        vm.prank(requester);
        bytes32 requestHash = validationRegistry.requestValidation{value: 5 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.TEEAttested,
            block.timestamp + 1 hours
        );

        assertTrue(requestHash != bytes32(0));

        (ITALValidationRegistry.ValidationRequest memory request, ) = validationRegistry.getValidation(requestHash);
        assertEq(request.bounty, 5 ether);
    }

    // ============ TEE Provider Management Tests ============

    function test_TEEProvider_AddProvider() public {
        address newProvider = address(0x999);

        vm.prank(admin);
        validationRegistry.setTrustedTEEProvider(newProvider);

        assertTrue(validationRegistry.trustedTEEProviders(newProvider));
        assertTrue(validationRegistry.isTrustedTEEProvider(newProvider));
    }

    function test_TEEProvider_GetTrustedProviders() public view {
        address[] memory providers = validationRegistry.getTrustedTEEProviders();

        assertEq(providers.length, 2);
        assertTrue(providers[0] == teeValidator || providers[1] == teeValidator);
        assertTrue(providers[0] == teeValidator2 || providers[1] == teeValidator2);
    }

    function test_TEEProvider_RemoveProvider() public {
        assertTrue(validationRegistry.isTrustedTEEProvider(teeValidator));

        vm.prank(admin);
        validationRegistry.removeTrustedTEEProvider(teeValidator);

        assertFalse(validationRegistry.isTrustedTEEProvider(teeValidator));

        // Verify list was updated
        address[] memory providers = validationRegistry.getTrustedTEEProviders();
        assertEq(providers.length, 1);
        assertEq(providers[0], teeValidator2);
    }

    function test_TEEProvider_RevertOnDuplicateAdd() public {
        vm.prank(admin);
        vm.expectRevert("Provider already trusted");
        validationRegistry.setTrustedTEEProvider(teeValidator);
    }

    function test_TEEProvider_RevertOnRemoveNonTrusted() public {
        vm.prank(admin);
        vm.expectRevert("Provider not trusted");
        validationRegistry.removeTrustedTEEProvider(untrustedProvider);
    }

    function test_TEEProvider_RevertOnUnauthorizedAdd() public {
        vm.prank(requester);
        vm.expectRevert();
        validationRegistry.setTrustedTEEProvider(address(0x888));
    }

    function test_TEEProvider_RevertOnUnauthorizedRemove() public {
        vm.prank(requester);
        vm.expectRevert();
        validationRegistry.removeTrustedTEEProvider(teeValidator);
    }

    function test_TEEProvider_RevertOnZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert("Invalid provider address");
        validationRegistry.setTrustedTEEProvider(address(0));
    }

    // ============ TEE Validation Flow Tests ============

    function test_TEEValidation_CompleteFlow() public {
        // Step 1: Request validation
        vm.prank(requester);
        bytes32 requestHash = validationRegistry.requestValidation{value: 1 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.TEEAttested,
            block.timestamp + 1 hours
        );

        // Step 2: Submit validation with TEE proof
        bytes memory teeProof = _createTEEProofWithSignature(teeValidator, teeValidatorKey, ENCLAVE_HASH, requestHash);

        vm.prank(teeValidator);
        validationRegistry.submitValidation(
            requestHash,
            95, // score
            teeProof,
            "ipfs://tee_validation_details"
        );

        // Step 3: Verify completion
        (ITALValidationRegistry.ValidationRequest memory request, ITALValidationRegistry.ValidationResponse memory response) =
            validationRegistry.getValidation(requestHash);

        assertEq(uint(request.status), uint(IERC8004ValidationRegistry.ValidationStatus.Completed));
        assertEq(response.validator, teeValidator);
        assertEq(response.score, 95);
    }

    function test_TEEValidation_RejectEmptyProof() public {
        // Request validation
        vm.prank(requester);
        bytes32 requestHash = validationRegistry.requestValidation{value: 1 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.TEEAttested,
            block.timestamp + 1 hours
        );

        // Try to submit with empty proof
        vm.prank(teeValidator);
        vm.expectRevert(abi.encodeWithSignature("InvalidTEEAttestation()"));
        validationRegistry.submitValidation(
            requestHash,
            95,
            "", // empty proof
            "ipfs://details"
        );
    }

    // ============ Bounty Distribution Tests ============

    function test_TEEValidation_BountyDistribution() public {
        uint256 bountyAmount = 1 ether;

        // Track initial balances
        uint256 treasuryBefore = treasury.balance;
        uint256 agentOwnerBefore = agentOwner.balance;
        uint256 validatorBefore = teeValidator.balance;

        // Request validation
        vm.prank(requester);
        bytes32 requestHash = validationRegistry.requestValidation{value: bountyAmount}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.TEEAttested,
            block.timestamp + 1 hours
        );

        // Submit with TEE proof
        bytes memory teeProof = _createTEEProofWithSignature(teeValidator, teeValidatorKey, ENCLAVE_HASH, requestHash);

        vm.prank(teeValidator);
        validationRegistry.submitValidation(
            requestHash,
            90,
            teeProof,
            "ipfs://details"
        );

        // Verify bounty distribution
        // Protocol fee: 10% = 0.1 ether
        // Remaining: 0.9 ether
        // Agent: 10% of remaining = 0.09 ether
        // Validator: 90% of remaining = 0.81 ether

        assertEq(treasury.balance - treasuryBefore, 0.1 ether, "Treasury should receive 10%");
        assertEq(agentOwner.balance - agentOwnerBefore, 0.09 ether, "Agent owner should receive 9%");
        assertEq(teeValidator.balance - validatorBefore, 0.81 ether, "Validator should receive 81%");
    }

    // ============ Deadline Tests ============

    function test_TEEValidation_RejectAfterDeadline() public {
        // Request validation with short deadline
        vm.prank(requester);
        bytes32 requestHash = validationRegistry.requestValidation{value: 1 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.TEEAttested,
            block.timestamp + 30 minutes
        );

        // Warp past deadline
        vm.warp(block.timestamp + 1 hours);

        // Try to submit after deadline
        bytes memory teeProof = _createTEEProofWithSignature(teeValidator, teeValidatorKey, ENCLAVE_HASH, requestHash);

        vm.prank(teeValidator);
        vm.expectRevert(abi.encodeWithSignature("ValidationExpired(bytes32)", requestHash));
        validationRegistry.submitValidation(
            requestHash,
            85,
            teeProof,
            "ipfs://details"
        );
    }

    // ============ Parameter Update Tests ============

    function test_UpdateMinTEEBounty() public {
        // Update minimum bounty
        vm.prank(admin);
        validationRegistry.updateValidationParameters(
            10 ether, // min stake secured bounty
            2 ether,  // new min TEE bounty
            1000      // protocol fee bps
        );

        // Old minimum should now fail
        vm.prank(requester);
        vm.expectRevert(
            abi.encodeWithSignature(
                "InsufficientBounty(uint256,uint256)",
                1 ether,
                2 ether
            )
        );
        validationRegistry.requestValidation{value: 1 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.TEEAttested,
            block.timestamp + 1 hours
        );

        // New minimum should work
        vm.prank(requester);
        bytes32 requestHash = validationRegistry.requestValidation{value: 2 ether}(
            agentId,
            keccak256("task2"),
            keccak256("output2"),
            IERC8004ValidationRegistry.ValidationModel.TEEAttested,
            block.timestamp + 1 hours
        );

        assertTrue(requestHash != bytes32(0));
    }

    // ============ Events Tests ============

    function test_TEEValidation_EmitsProviderEvents() public {
        address newProvider = address(0x777);

        // Test TEEProviderUpdated event on add
        vm.prank(admin);
        vm.expectEmit(true, true, false, false);
        emit ITALValidationRegistry.TEEProviderUpdated(newProvider, true);
        validationRegistry.setTrustedTEEProvider(newProvider);

        // Test TEEProviderUpdated event on remove
        vm.prank(admin);
        vm.expectEmit(true, true, false, false);
        emit ITALValidationRegistry.TEEProviderUpdated(newProvider, false);
        validationRegistry.removeTrustedTEEProvider(newProvider);
    }

    function test_TEEValidation_EmitsValidationEvents() public {
        // Test ValidationRequested event
        vm.prank(requester);
        vm.expectEmit(false, true, true, false);
        emit IERC8004ValidationRegistry.ValidationRequested(
            bytes32(0),
            agentId,
            IERC8004ValidationRegistry.ValidationModel.TEEAttested
        );
        bytes32 requestHash = validationRegistry.requestValidation{value: 1 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.TEEAttested,
            block.timestamp + 1 hours
        );

        // Test ValidationCompleted event
        bytes memory teeProof = _createTEEProofWithSignature(teeValidator, teeValidatorKey, ENCLAVE_HASH, requestHash);

        vm.prank(teeValidator);
        vm.expectEmit(true, true, true, false);
        emit IERC8004ValidationRegistry.ValidationCompleted(requestHash, teeValidator, 90);
        validationRegistry.submitValidation(
            requestHash,
            90,
            teeProof,
            "ipfs://details"
        );
    }

    // ============ Multiple Provider Tests ============

    function test_TEEValidation_AnyTrustedProviderCanValidate() public {
        // Request validation
        vm.prank(requester);
        bytes32 requestHash = validationRegistry.requestValidation{value: 1 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.TEEAttested,
            block.timestamp + 1 hours
        );

        // Second trusted provider can also validate
        bytes memory teeProof = _createTEEProofWithSignature(teeValidator2, teeValidator2Key, ENCLAVE_HASH, requestHash);

        vm.prank(teeValidator2);
        validationRegistry.submitValidation(
            requestHash,
            88,
            teeProof,
            "ipfs://details"
        );

        // Verify completion
        (, ITALValidationRegistry.ValidationResponse memory response) = validationRegistry.getValidation(requestHash);
        assertEq(response.validator, teeValidator2);
    }

    // ============ Query Tests ============

    function test_GetValidationsByValidator() public {
        // Create and complete validation
        vm.prank(requester);
        bytes32 requestHash = validationRegistry.requestValidation{value: 1 ether}(
            agentId,
            keccak256("task1"),
            keccak256("output1"),
            IERC8004ValidationRegistry.ValidationModel.TEEAttested,
            block.timestamp + 1 hours
        );

        bytes memory teeProof = _createTEEProofWithSignature(teeValidator, teeValidatorKey, ENCLAVE_HASH, requestHash);

        vm.prank(teeValidator);
        validationRegistry.submitValidation(
            requestHash,
            90,
            teeProof,
            "ipfs://details"
        );

        bytes32[] memory validations = validationRegistry.getValidationsByValidator(teeValidator);
        assertEq(validations.length, 1);
        assertEq(validations[0], requestHash);
    }

    // ============ Helper Functions ============

    function _createTEEProof(address provider, bytes32 enclaveHash) internal returns (bytes memory) {
        // This is a helper that needs to be called AFTER requestValidation to get the requestHash
        // For now, we'll create a proof without signature verification
        // The actual tests will call _createTEEProofWithSignature instead
        uint256 timestamp = block.timestamp;
        bytes memory signature = new bytes(65);
        return abi.encode(enclaveHash, provider, timestamp, signature);
    }

    function _createTEEProofWithSignature(
        address provider,
        uint256 providerKey,
        bytes32 enclaveHash,
        bytes32 requestHash
    ) internal view returns (bytes memory) {
        // Create a valid TEE proof that matches _verifyTEEAttestation expectations
        // Format: abi.encode(bytes32 enclaveHash, address teeSigner, uint256 timestamp, bytes signature)

        uint256 timestamp = block.timestamp;

        // Get the validation request to build the message hash
        (ITALValidationRegistry.ValidationRequest memory request, ) = validationRegistry.getValidation(requestHash);

        // Build the message hash that matches the contract's verification
        bytes32 messageHash = keccak256(abi.encodePacked(
            enclaveHash, request.taskHash, request.outputHash, requestHash, timestamp
        ));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));

        // Sign the message using the provider's private key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(providerKey, ethSignedHash);

        // Pack the signature
        bytes memory signature = abi.encodePacked(r, s, v);

        return abi.encode(enclaveHash, provider, timestamp, signature);
    }
}
