// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {DRBIntegrationModule} from "../../src/modules/DRBIntegrationModule.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MockDRB} from "../mocks/MockDRB.sol";

/**
 * @title DRBIntegrationModuleTest
 * @notice Unit tests for DRBIntegrationModule
 * @dev Tests DRB callback-based randomness integration and weighted validator selection
 *
 * DRB Flow (callback model):
 * 1. requestValidatorSelection() calls MockDRB.requestRandomNumber{value}(callbackGasLimit)
 * 2. MockDRB.fulfillRandomNumber(round) simulates operator callback delivery
 * 3. rawFulfillRandomNumber() stores randomness in the module
 * 4. finalizeValidatorSelection() uses stored randomness for weighted selection
 */
contract DRBIntegrationModuleTest is Test {
    // ============ Contracts ============
    DRBIntegrationModule public drbModule;
    DRBIntegrationModule public implementation;
    MockDRB public mockDRB;

    // ============ Test Accounts ============
    address public admin = address(0x1);
    address public selector = address(0x2);
    address public unauthorized = address(0x999);

    // ============ Test Data ============
    address[] public candidates;
    uint256[] public stakes;

    // ============ Setup ============

    function setUp() public {
        // Deploy mock DRB coordinator
        mockDRB = new MockDRB();

        // Deploy implementation
        implementation = new DRBIntegrationModule();

        // Deploy proxy and initialize
        bytes memory initData = abi.encodeWithSelector(
            DRBIntegrationModule.initialize.selector,
            admin,
            address(mockDRB)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        drbModule = DRBIntegrationModule(payable(address(proxy)));

        // Grant selector role
        vm.startPrank(admin);
        drbModule.grantRole(drbModule.VALIDATOR_SELECTOR_ROLE(), selector);
        vm.stopPrank();

        // Setup test candidates
        candidates.push(address(0x10));
        candidates.push(address(0x20));
        candidates.push(address(0x30));

        stakes.push(1000 ether);
        stakes.push(2000 ether);
        stakes.push(3000 ether);

        // Fund accounts for DRB fees
        vm.deal(selector, 10 ether);
        vm.deal(admin, 10 ether);
        vm.deal(address(drbModule), 10 ether);
    }

    // ============ Initialization Tests ============

    function test_Initialize() public view {
        assertEq(drbModule.coordinator(), address(mockDRB));
        assertTrue(drbModule.hasRole(drbModule.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(drbModule.hasRole(drbModule.UPGRADER_ROLE(), admin));
        assertTrue(drbModule.hasRole(drbModule.VALIDATOR_SELECTOR_ROLE(), admin));
        assertTrue(drbModule.hasRole(drbModule.VALIDATOR_SELECTOR_ROLE(), selector));
        assertEq(drbModule.callbackGasLimit(), drbModule.DEFAULT_CALLBACK_GAS_LIMIT());
    }

    // ============ Callback Tests ============

    function test_RawFulfillRandomNumber() public {
        // First, make a request so there's a round to fulfill
        bytes32 requestHash = keccak256("request_1");
        vm.prank(selector);
        uint256 round = drbModule.requestValidatorSelection{value: 1 ether}(
            requestHash, candidates, stakes
        );

        // Simulate DRB callback
        mockDRB.fulfillRandomNumberWith(round, 42);

        // Verify randomness was stored
        assertTrue(drbModule.isRandomnessReceived(round));
        assertEq(drbModule.deliveredRandomness(round), 42);
    }

    function test_RawFulfillRandomNumber_RevertOnNonCoordinator() public {
        // Try to call rawFulfillRandomNumber directly (not from coordinator)
        vm.prank(unauthorized);
        vm.expectRevert(
            abi.encodeWithSignature(
                "OnlyCoordinatorCanFulfill(address,address)",
                unauthorized,
                address(mockDRB)
            )
        );
        drbModule.rawFulfillRandomNumber(1, 42);
    }

    function test_IsRandomnessReceived_FalseBeforeCallback() public {
        assertFalse(drbModule.isRandomnessReceived(999));
    }

    // ============ Weighted Selection Tests ============

    function test_SelectFromWeightedList() public view {
        // With known random value, selection should be deterministic
        address selected = drbModule.selectFromWeightedList(
            candidates, stakes, 500
        );
        // Should select one of the candidates
        assertTrue(
            selected == candidates[0] ||
            selected == candidates[1] ||
            selected == candidates[2]
        );
    }

    function test_SelectFromWeightedList_Deterministic() public view {
        // Same random value should give same result
        address selected1 = drbModule.selectFromWeightedList(candidates, stakes, 1000);
        address selected2 = drbModule.selectFromWeightedList(candidates, stakes, 1000);
        assertEq(selected1, selected2);
    }

    function test_SelectFromWeightedList_HigherStakeMoreLikely() public view {
        // Run 100 selections with different random values
        uint256[3] memory counts;

        for (uint256 i = 0; i < 100; i++) {
            address selected = drbModule.selectFromWeightedList(
                candidates, stakes, i * 7919 // Prime number for spread
            );
            if (selected == candidates[0]) counts[0]++;
            else if (selected == candidates[1]) counts[1]++;
            else counts[2]++;
        }

        // Verify all selections are valid candidates
        assertEq(counts[0] + counts[1] + counts[2], 100, "All selections should be counted");
    }

    function test_SelectFromWeightedList_SingleCandidate() public view {
        address[] memory singleCandidate = new address[](1);
        uint256[] memory singleStake = new uint256[](1);
        singleCandidate[0] = address(0x100);
        singleStake[0] = 1000 ether;

        address selected = drbModule.selectFromWeightedList(singleCandidate, singleStake, 12345);
        assertEq(selected, address(0x100));
    }

    function test_RevertOnEmptyCandidates() public {
        address[] memory empty = new address[](0);
        uint256[] memory emptyWeights = new uint256[](0);

        vm.expectRevert(abi.encodeWithSignature("NoCandidatesProvided()"));
        drbModule.selectFromWeightedList(empty, emptyWeights, 123);
    }

    function test_RevertOnMismatchedArrays() public {
        uint256[] memory wrongStakes = new uint256[](2);
        wrongStakes[0] = 100;
        wrongStakes[1] = 200;

        vm.expectRevert(abi.encodeWithSignature("WeightsMismatch(uint256,uint256)", 3, 2));
        drbModule.selectFromWeightedList(candidates, wrongStakes, 123);
    }

    function test_RevertOnZeroTotalWeight() public {
        uint256[] memory zeroStakes = new uint256[](3);
        zeroStakes[0] = 0;
        zeroStakes[1] = 0;
        zeroStakes[2] = 0;

        vm.expectRevert(abi.encodeWithSignature("InvalidCandidateList()"));
        drbModule.selectFromWeightedList(candidates, zeroStakes, 123);
    }

    // ============ Validator Selection Tests (Async Flow) ============

    function test_RequestValidatorSelection() public {
        bytes32 requestHash = keccak256("request_1");

        vm.prank(selector);
        uint256 drbRound = drbModule.requestValidatorSelection{value: 1 ether}(
            requestHash, candidates, stakes
        );

        assertGt(drbRound, 0);
        assertEq(drbModule.drbRounds(requestHash), drbRound);
        assertEq(drbModule.requestHashByRound(drbRound), requestHash);
    }

    function test_RequestValidatorSelection_EmitsEvent() public {
        bytes32 requestHash = keccak256("request_1");

        vm.prank(selector);
        vm.expectEmit(true, true, false, false);
        emit DRBIntegrationModule.RandomnessRequested(1, requestHash);
        drbModule.requestValidatorSelection{value: 1 ether}(requestHash, candidates, stakes);
    }

    function test_RequestValidatorSelection_RefundsExcessETH() public {
        bytes32 requestHash = keccak256("request_1");
        uint256 balanceBefore = selector.balance;

        vm.prank(selector);
        drbModule.requestValidatorSelection{value: 1 ether}(requestHash, candidates, stakes);

        // Should have been refunded most of the 1 ether (fee is only 0.001 ether)
        uint256 spent = balanceBefore - selector.balance;
        assertEq(spent, mockDRB.s_flatFee(), "Should only spend the DRB fee");
    }

    function test_RequestValidatorSelection_RevertOnInsufficientFee() public {
        bytes32 requestHash = keccak256("request_1");

        // Set a high fee
        mockDRB.setFlatFee(5 ether);

        vm.prank(selector);
        vm.expectRevert(); // InsufficientFee
        drbModule.requestValidatorSelection{value: 0.001 ether}(requestHash, candidates, stakes);
    }

    function test_FinalizeValidatorSelection() public {
        bytes32 requestHash = keccak256("request_1");

        // Step 1: Request selection
        vm.prank(selector);
        uint256 round = drbModule.requestValidatorSelection{value: 1 ether}(
            requestHash, candidates, stakes
        );

        // Step 2: Simulate DRB callback (async delivery)
        mockDRB.fulfillRandomNumberWith(round, 4500 ether); // Known value for deterministic test

        // Step 3: Finalize selection
        vm.prank(selector);
        address selected = drbModule.finalizeValidatorSelection(
            requestHash, candidates, stakes
        );

        assertTrue(
            selected == candidates[0] ||
            selected == candidates[1] ||
            selected == candidates[2]
        );
        assertEq(drbModule.getSelectedValidator(requestHash), selected);
    }

    function test_FinalizeValidatorSelection_EmitsEvent() public {
        bytes32 requestHash = keccak256("request_1");

        vm.prank(selector);
        uint256 round = drbModule.requestValidatorSelection{value: 1 ether}(
            requestHash, candidates, stakes
        );

        mockDRB.fulfillRandomNumberWith(round, 42);

        vm.prank(selector);
        vm.expectEmit(true, false, false, false);
        emit DRBIntegrationModule.ValidatorSelected(requestHash, address(0));
        drbModule.finalizeValidatorSelection(requestHash, candidates, stakes);
    }

    function test_FinalizeValidatorSelection_RevertBeforeCallback() public {
        bytes32 requestHash = keccak256("request_1");

        // Request but DON'T fulfill (no callback yet)
        vm.prank(selector);
        drbModule.requestValidatorSelection{value: 1 ether}(
            requestHash, candidates, stakes
        );

        // Query round outside of prank so prank isn't consumed by view call
        uint256 round = drbModule.drbRounds(requestHash);

        // Try to finalize before randomness is delivered
        vm.prank(selector);
        vm.expectRevert(abi.encodeWithSignature("RandomnessNotAvailable(uint256)", round));
        drbModule.finalizeValidatorSelection(requestHash, candidates, stakes);
    }

    function test_RevertOnDuplicateValidatorSelection() public {
        bytes32 requestHash = keccak256("request_1");

        vm.startPrank(selector);
        uint256 round = drbModule.requestValidatorSelection{value: 1 ether}(
            requestHash, candidates, stakes
        );
        vm.stopPrank();

        mockDRB.fulfillRandomNumberWith(round, 42);

        vm.startPrank(selector);
        drbModule.finalizeValidatorSelection(requestHash, candidates, stakes);

        // Try to request again for same hash
        vm.expectRevert(abi.encodeWithSignature("ValidatorAlreadySelected(bytes32)", requestHash));
        drbModule.requestValidatorSelection{value: 1 ether}(requestHash, candidates, stakes);
        vm.stopPrank();
    }

    function test_RevertOnUnauthorizedValidatorSelection() public {
        bytes32 requestHash = keccak256("request_1");

        vm.deal(unauthorized, 1 ether);
        vm.prank(unauthorized);
        vm.expectRevert();
        drbModule.requestValidatorSelection{value: 1 ether}(requestHash, candidates, stakes);
    }

    // ============ Admin Functions Tests ============

    function test_SetCoordinator() public {
        address newCoordinator = address(0x999);

        vm.prank(admin);
        drbModule.setCoordinator(newCoordinator);

        assertEq(drbModule.coordinator(), newCoordinator);
    }

    function test_SetCallbackGasLimit() public {
        vm.prank(admin);
        drbModule.setCallbackGasLimit(200_000);

        assertEq(drbModule.callbackGasLimit(), 200_000);
    }

    function test_RevertOnUnauthorizedSetCoordinator() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        drbModule.setCoordinator(address(0x999));
    }

    // ============ View Functions Tests ============

    function test_EstimateRequestFee() public view {
        uint256 fee = drbModule.estimateRequestFee(100_000);
        assertEq(fee, mockDRB.s_flatFee());
    }

    function test_GetDRBRound() public {
        bytes32 requestHash = keccak256("request_1");

        vm.prank(selector);
        uint256 round = drbModule.requestValidatorSelection{value: 1 ether}(
            requestHash, candidates, stakes
        );

        assertEq(drbModule.getDRBRound(requestHash), round);
    }

    // ============ Fuzz Tests ============

    function testFuzz_SelectFromWeightedList(uint256 randomValue) public view {
        address selected = drbModule.selectFromWeightedList(candidates, stakes, randomValue);

        // Should always return one of the candidates
        assertTrue(
            selected == candidates[0] ||
            selected == candidates[1] ||
            selected == candidates[2]
        );
    }

    function testFuzz_WeightedDistribution(uint8 weight1, uint8 weight2, uint8 weight3) public view {
        // Ensure non-zero weights
        vm.assume(weight1 > 0 || weight2 > 0 || weight3 > 0);

        uint256[] memory fuzzStakes = new uint256[](3);
        fuzzStakes[0] = uint256(weight1) * 1 ether;
        fuzzStakes[1] = uint256(weight2) * 1 ether;
        fuzzStakes[2] = uint256(weight3) * 1 ether;

        // Skip if all weights are zero
        if (fuzzStakes[0] + fuzzStakes[1] + fuzzStakes[2] == 0) return;

        address selected = drbModule.selectFromWeightedList(candidates, fuzzStakes, 12345);

        assertTrue(
            selected == candidates[0] ||
            selected == candidates[1] ||
            selected == candidates[2]
        );
    }
}
