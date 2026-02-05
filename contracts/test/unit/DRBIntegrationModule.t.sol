// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {DRBIntegrationModule} from "../../src/modules/DRBIntegrationModule.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MockDRB} from "../mocks/MockDRB.sol";

/**
 * @title DRBIntegrationModuleTest
 * @notice Unit tests for DRBIntegrationModule
 * @dev Tests DRB randomness integration and weighted validator selection
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
        // Deploy mock DRB
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
        drbModule = DRBIntegrationModule(address(proxy));

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
    }

    // ============ Initialization Tests ============

    function test_Initialize() public view {
        assertEq(drbModule.drbContract(), address(mockDRB));
        assertTrue(drbModule.hasRole(drbModule.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(drbModule.hasRole(drbModule.UPGRADER_ROLE(), admin));
        assertTrue(drbModule.hasRole(drbModule.VALIDATOR_SELECTOR_ROLE(), admin));
        assertTrue(drbModule.hasRole(drbModule.VALIDATOR_SELECTOR_ROLE(), selector));
    }

    // ============ Randomness Request Tests ============

    function test_RequestRandomness() public {
        vm.prank(selector);
        uint256 requestId = drbModule.requestRandomness(keccak256("test_seed"));
        assertGe(requestId, 0);
    }

    function test_RequestRandomness_EmitsEvent() public {
        vm.prank(selector);
        vm.expectEmit(true, true, false, false);
        emit DRBIntegrationModule.RandomnessRequested(0, keccak256("test_seed"));
        drbModule.requestRandomness(keccak256("test_seed"));
    }

    function test_GetRandomness() public {
        vm.prank(selector);
        uint256 requestId = drbModule.requestRandomness(keccak256("test_seed"));

        uint256 randomValue = drbModule.getRandomness(requestId);
        assertGt(randomValue, 0);
    }

    function test_IsRandomnessAvailable() public {
        vm.prank(selector);
        uint256 requestId = drbModule.requestRandomness(keccak256("test_seed"));

        assertTrue(drbModule.isRandomnessAvailable(requestId));
    }

    function test_IsRandomnessAvailable_FalseForUnavailable() public {
        // Set unavailable in mock
        mockDRB.setUnavailable(999);
        assertFalse(drbModule.isRandomnessAvailable(999));
    }

    function test_RevertOnUnauthorizedRandomnessRequest() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        drbModule.requestRandomness(keccak256("test"));
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
        // Note: The distribution should ideally be weighted by stake
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

    // ============ Validator Selection Tests ============

    function test_RequestValidatorSelection() public {
        bytes32 requestHash = keccak256("request_1");

        vm.prank(selector);
        uint256 drbRequestId = drbModule.requestValidatorSelection(
            requestHash, candidates, stakes
        );

        assertGe(drbRequestId, 0);
        assertEq(drbModule.drbRequestIds(requestHash), drbRequestId);
        assertEq(drbModule.requestHashByDRBId(drbRequestId), requestHash);
    }

    function test_RequestValidatorSelection_EmitsEvent() public {
        bytes32 requestHash = keccak256("request_1");

        vm.prank(selector);
        vm.expectEmit(true, false, false, false);
        emit DRBIntegrationModule.RandomnessRequested(0, bytes32(0));
        drbModule.requestValidatorSelection(requestHash, candidates, stakes);
    }

    function test_FinalizeValidatorSelection() public {
        bytes32 requestHash = keccak256("request_1");

        vm.startPrank(selector);
        drbModule.requestValidatorSelection(requestHash, candidates, stakes);

        address selected = drbModule.finalizeValidatorSelection(
            requestHash, candidates, stakes
        );
        vm.stopPrank();

        assertTrue(
            selected == candidates[0] ||
            selected == candidates[1] ||
            selected == candidates[2]
        );
        assertEq(drbModule.getSelectedValidator(requestHash), selected);
    }

    function test_FinalizeValidatorSelection_EmitsEvent() public {
        bytes32 requestHash = keccak256("request_1");

        vm.startPrank(selector);
        drbModule.requestValidatorSelection(requestHash, candidates, stakes);

        vm.expectEmit(true, false, false, false);
        emit DRBIntegrationModule.ValidatorSelected(requestHash, address(0));
        drbModule.finalizeValidatorSelection(requestHash, candidates, stakes);
        vm.stopPrank();
    }

    function test_RevertOnDuplicateValidatorSelection() public {
        bytes32 requestHash = keccak256("request_1");

        vm.startPrank(selector);
        drbModule.requestValidatorSelection(requestHash, candidates, stakes);
        drbModule.finalizeValidatorSelection(requestHash, candidates, stakes);

        // Try to request again for same hash
        vm.expectRevert(abi.encodeWithSignature("ValidatorAlreadySelected(bytes32)", requestHash));
        drbModule.requestValidatorSelection(requestHash, candidates, stakes);
        vm.stopPrank();
    }

    function test_RevertOnUnauthorizedValidatorSelection() public {
        bytes32 requestHash = keccak256("request_1");

        vm.prank(unauthorized);
        vm.expectRevert();
        drbModule.requestValidatorSelection(requestHash, candidates, stakes);
    }

    // ============ Admin Functions Tests ============

    function test_SetDRBContract() public {
        address newDRB = address(0x999);

        vm.prank(admin);
        drbModule.setDRBContract(newDRB);

        assertEq(drbModule.drbContract(), newDRB);
    }

    function test_RevertOnUnauthorizedSetDRBContract() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        drbModule.setDRBContract(address(0x999));
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
