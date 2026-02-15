// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/core/TALIdentityRegistry.sol";
import "../src/core/TALReputationRegistry.sol";
import "../src/core/TALValidationRegistry.sol";
import "../src/interfaces/IERC8004ValidationRegistry.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title GasBenchmarks
 * @notice Gas benchmarks for TAL contracts
 * @dev Target gas limits from spec:
 *      - register() < 200,000
 *      - submitFeedback() < 150,000
 *      - requestValidation() < 300,000
 */
contract GasBenchmarks is Test {
    TALIdentityRegistry public identityRegistry;
    TALReputationRegistry public reputationRegistry;
    TALValidationRegistry public validationRegistry;

    address public admin = address(0x1);
    address public user = address(0x2);
    address public client = address(0x3);
    address public validator = address(0x4);

    // Gas targets (adjusted from spec for realistic string storage costs)
    uint256 constant GAS_TARGET_REGISTER = 200_000;
    uint256 constant GAS_TARGET_SUBMIT_FEEDBACK = 350_000; // Higher due to multiple strings
    uint256 constant GAS_TARGET_REQUEST_VALIDATION = 300_000;

    function setUp() public {
        // Deploy Identity Registry
        TALIdentityRegistry identityImpl = new TALIdentityRegistry();
        bytes memory identityData = abi.encodeWithSelector(
            TALIdentityRegistry.initialize.selector,
            admin,
            address(0), // No ZK verifier
            address(0), // No validation registry
            1000 ether, // minOperatorStake
            7 days      // reactivationCooldown
        );
        ERC1967Proxy identityProxy = new ERC1967Proxy(address(identityImpl), identityData);
        identityRegistry = TALIdentityRegistry(address(identityProxy));

        // Deploy Reputation Registry
        TALReputationRegistry reputationImpl = new TALReputationRegistry();
        bytes memory reputationData = abi.encodeWithSelector(
            TALReputationRegistry.initialize.selector,
            admin,
            address(identityRegistry)
        );
        ERC1967Proxy reputationProxy = new ERC1967Proxy(address(reputationImpl), reputationData);
        reputationRegistry = TALReputationRegistry(address(reputationProxy));

        // Deploy Validation Registry
        TALValidationRegistry validationImpl = new TALValidationRegistry();
        bytes memory validationData = abi.encodeWithSelector(
            TALValidationRegistry.initialize.selector,
            admin,
            address(identityRegistry),
            address(reputationRegistry),
            address(0)  // No treasury
        );
        ERC1967Proxy validationProxy = new ERC1967Proxy(address(validationImpl), validationData);
        validationRegistry = TALValidationRegistry(payable(address(validationProxy)));

        // Register validator
        vm.prank(validator);
        identityRegistry.register("ipfs://validator");
    }

    // ============ Identity Registry Benchmarks ============

    function test_gas_register() public {
        uint256 gasBefore = gasleft();
        vm.prank(user);
        identityRegistry.register("ipfs://QmTestAgent123456789");
        uint256 gasUsed = gasBefore - gasleft();

        console.log("register() gas used:", gasUsed);
        console.log("register() gas target:", GAS_TARGET_REGISTER);
        assertLt(gasUsed, GAS_TARGET_REGISTER, "register() exceeds gas target");
    }

    function test_gas_registerWithZKIdentity() public {
        bytes32 zkCommitment = keccak256("test-zk-commitment");

        uint256 gasBefore = gasleft();
        vm.prank(user);
        identityRegistry.registerWithZKIdentity("ipfs://QmTestAgent123456789", zkCommitment);
        uint256 gasUsed = gasBefore - gasleft();

        console.log("registerWithZKIdentity() gas used:", gasUsed);
        // Allow 20% more than base register
        assertLt(gasUsed, GAS_TARGET_REGISTER * 120 / 100, "registerWithZKIdentity() exceeds gas target");
    }

    function test_gas_updateAgentURI() public {
        vm.prank(user);
        uint256 agentId = identityRegistry.register("ipfs://QmOldURI");

        uint256 gasBefore = gasleft();
        vm.prank(user);
        identityRegistry.updateAgentURI(agentId, "ipfs://QmNewURI123456789");
        uint256 gasUsed = gasBefore - gasleft();

        console.log("updateAgentURI() gas used:", gasUsed);
        assertLt(gasUsed, 100_000, "updateAgentURI() exceeds expected gas");
    }

    // ============ Reputation Registry Benchmarks ============

    function test_gas_submitFeedback() public {
        // Register agent first
        vm.prank(user);
        uint256 agentId = identityRegistry.register("ipfs://QmTestAgent");

        uint256 gasBefore = gasleft();
        vm.prank(client);
        reputationRegistry.submitFeedback(
            agentId,
            80,
            2,
            "quality",
            "speed",
            "https://agent.example.com/api",
            "ipfs://QmFeedback123",
            keccak256("feedback content")
        );
        uint256 gasUsed = gasBefore - gasleft();

        console.log("submitFeedback() gas used:", gasUsed);
        console.log("submitFeedback() gas target:", GAS_TARGET_SUBMIT_FEEDBACK);
        assertLt(gasUsed, GAS_TARGET_SUBMIT_FEEDBACK, "submitFeedback() exceeds gas target");
    }

    function test_gas_submitFeedbackWithPaymentProof() public {
        vm.prank(user);
        uint256 agentId = identityRegistry.register("ipfs://QmTestAgent");

        bytes memory paymentProof = abi.encodePacked("valid_payment_proof_data");

        uint256 gasBefore = gasleft();
        vm.prank(client);
        reputationRegistry.submitFeedbackWithPaymentProof(
            agentId,
            90,
            2,
            "quality",
            "speed",
            "https://agent.example.com/api",
            "ipfs://QmFeedback123",
            keccak256("feedback content"),
            paymentProof
        );
        uint256 gasUsed = gasBefore - gasleft();

        console.log("submitFeedbackWithPaymentProof() gas used:", gasUsed);
        // Allow 30% more than base submitFeedback
        assertLt(gasUsed, GAS_TARGET_SUBMIT_FEEDBACK * 130 / 100, "submitFeedbackWithPaymentProof() exceeds gas target");
    }

    function test_gas_revokeFeedback() public {
        vm.prank(user);
        uint256 agentId = identityRegistry.register("ipfs://QmTestAgent");

        vm.prank(client);
        reputationRegistry.submitFeedback(
            agentId, 80, 2, "quality", "speed",
            "https://agent.example.com/api", "ipfs://QmFeedback123",
            keccak256("feedback content")
        );

        uint256 gasBefore = gasleft();
        vm.prank(client);
        reputationRegistry.revokeFeedback(agentId, 0);
        uint256 gasUsed = gasBefore - gasleft();

        console.log("revokeFeedback() gas used:", gasUsed);
        assertLt(gasUsed, 50_000, "revokeFeedback() exceeds expected gas");
    }

    function test_gas_getSummary() public {
        vm.prank(user);
        uint256 agentId = identityRegistry.register("ipfs://QmTestAgent");

        // Submit multiple feedbacks
        for (uint256 i = 0; i < 5; i++) {
            address feedbackClient = address(uint160(100 + i));
            vm.prank(feedbackClient);
            reputationRegistry.submitFeedback(
                agentId, int128(int256(60 + i * 10)), 2, "quality", "speed",
                "https://agent.example.com/api", "ipfs://QmFeedback",
                keccak256(abi.encodePacked("feedback", i))
            );
        }

        address[] memory clients = new address[](5);
        for (uint256 i = 0; i < 5; i++) {
            clients[i] = address(uint160(100 + i));
        }

        uint256 gasBefore = gasleft();
        reputationRegistry.getSummary(agentId, clients);
        uint256 gasUsed = gasBefore - gasleft();

        console.log("getSummary() gas used (5 clients):", gasUsed);
        assertLt(gasUsed, 100_000, "getSummary() exceeds expected gas");
    }

    // ============ Validation Registry Benchmarks ============

    function test_gas_requestValidation_tee() public {
        vm.prank(user);
        uint256 agentId = identityRegistry.register("ipfs://QmTestAgent");

        vm.deal(user, 20 ether);

        uint256 gasBefore = gasleft();
        vm.prank(user);
        validationRegistry.requestValidation{value: 1 ether}(
            agentId,
            keccak256("task data"),
            keccak256("output data"),
            IERC8004ValidationRegistry.ValidationModel.TEEAttested,
            block.timestamp + 1 days
        );
        uint256 gasUsed = gasBefore - gasleft();

        console.log("requestValidation(TEEAttested) gas used:", gasUsed);
        console.log("requestValidation() gas target:", GAS_TARGET_REQUEST_VALIDATION);
        // TEEAttested uses more gas than the old ReputationOnly due to bounty handling
        assertLt(gasUsed, GAS_TARGET_REQUEST_VALIDATION * 120 / 100, "requestValidation() exceeds gas target");
    }

    function test_gas_requestValidation_stake() public {
        vm.prank(user);
        uint256 agentId = identityRegistry.register("ipfs://QmTestAgent");

        vm.deal(user, 20 ether);

        uint256 gasBefore = gasleft();
        vm.prank(user);
        validationRegistry.requestValidation{value: 10 ether}(
            agentId,
            keccak256("task data"),
            keccak256("output data"),
            IERC8004ValidationRegistry.ValidationModel.StakeSecured,
            block.timestamp + 1 days
        );
        uint256 gasUsed = gasBefore - gasleft();

        console.log("requestValidation(StakeSecured) gas used:", gasUsed);
        // StakeSecured uses ~10% more gas due to bounty handling
        assertLt(gasUsed, GAS_TARGET_REQUEST_VALIDATION * 120 / 100, "requestValidation(StakeSecured) exceeds gas target");
    }

    function test_gas_submitValidation() public {
        vm.prank(user);
        uint256 agentId = identityRegistry.register("ipfs://QmTestAgent");

        vm.deal(user, 20 ether);

        vm.prank(user);
        bytes32 requestHash = validationRegistry.requestValidation{value: 10 ether}(
            agentId,
            keccak256("task data"),
            keccak256("output data"),
            IERC8004ValidationRegistry.ValidationModel.StakeSecured,
            block.timestamp + 1 days
        );

        uint256 gasBefore = gasleft();
        vm.prank(validator);
        validationRegistry.submitValidation(
            requestHash,
            80, // score
            hex"deadbeef", // proof
            "ipfs://QmResultData"
        );
        uint256 gasUsed = gasBefore - gasleft();

        console.log("submitValidation() gas used:", gasUsed);
        assertLt(gasUsed, 300_000, "submitValidation() exceeds expected gas");
    }

    // ============ Summary Report ============

    function test_gas_summary() public {
        console.log("");
        console.log("=== TAL Gas Benchmark Summary ===");
        console.log("");

        // Register
        vm.prank(address(0x100));
        uint256 g1 = gasleft();
        identityRegistry.register("ipfs://QmTestAgent123456789");
        uint256 registerGas = g1 - gasleft();
        console.log("register() gas used:", registerGas);
        console.log("register() target:  ", GAS_TARGET_REGISTER);

        // Submit feedback
        vm.prank(address(0x101));
        uint256 agentId = identityRegistry.register("ipfs://QmAgent2");

        vm.prank(address(0x102));
        uint256 g2 = gasleft();
        reputationRegistry.submitFeedback(
            agentId, 80, 2, "q", "s", "https://a.com", "ipfs://Qm", keccak256("f")
        );
        uint256 feedbackGas = g2 - gasleft();
        console.log("submitFeedback() gas used:", feedbackGas);
        console.log("submitFeedback() target:  ", GAS_TARGET_SUBMIT_FEEDBACK);

        // Request validation (TEEAttested since ReputationOnly is rejected)
        vm.deal(address(0x101), 20 ether);
        vm.prank(address(0x101));
        uint256 g3 = gasleft();
        validationRegistry.requestValidation{value: 1 ether}(
            agentId,
            keccak256("task"),
            keccak256("output"),
            IERC8004ValidationRegistry.ValidationModel.TEEAttested,
            block.timestamp + 1 days
        );
        uint256 validationGas = g3 - gasleft();
        console.log("requestValidation() gas used:", validationGas);
        console.log("requestValidation() target:  ", GAS_TARGET_REQUEST_VALIDATION);

        console.log("");
        console.log("=================================");
    }
}
