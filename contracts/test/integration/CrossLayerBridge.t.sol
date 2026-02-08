// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {TALStakingBridgeL2} from "../../src/bridge/TALStakingBridgeL2.sol";
import {TALStakingBridgeL1} from "../../src/bridge/TALStakingBridgeL1.sol";
import {TALSlashingConditionsL1} from "../../src/bridge/TALSlashingConditionsL1.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MockCrossDomainMessenger} from "../mocks/MockCrossDomainMessenger.sol";
import {MockDepositManagerV2} from "../mocks/MockDepositManagerV2.sol";

/**
 * @title CrossLayerBridgeTest
 * @notice Integration tests for cross-layer staking bridge contracts
 * @dev Tests TALStakingBridgeL2, TALStakingBridgeL1, and TALSlashingConditionsL1
 */
contract CrossLayerBridgeTest is Test {
    // ============ Contracts ============
    TALStakingBridgeL2 public bridgeL2;
    TALStakingBridgeL1 public bridgeL1;
    TALSlashingConditionsL1 public slashingConditions;
    MockCrossDomainMessenger public mockMessenger;
    MockDepositManagerV2 public mockDeposit;

    // ============ Test Accounts ============
    address public admin = address(0x1);
    address public keeper = address(0x2);
    address public validationRegistry = address(0x3);
    address public operator1 = address(0x10);
    address public operator2 = address(0x20);
    address public operator3 = address(0x30);
    address public talLayer2 = address(0x100);
    address public unauthorized = address(0x999);

    // ============ Setup ============

    function setUp() public {
        // Deploy mocks
        mockMessenger = new MockCrossDomainMessenger();
        mockDeposit = new MockDepositManagerV2();

        // Deploy L2 Bridge
        TALStakingBridgeL2 bridgeL2Impl = new TALStakingBridgeL2();
        bytes memory bridgeL2Data = abi.encodeWithSelector(
            TALStakingBridgeL2.initialize.selector,
            admin,
            address(mockMessenger),
            address(0) // L1 bridge (set after L1 deploy)
        );
        ERC1967Proxy bridgeL2Proxy = new ERC1967Proxy(address(bridgeL2Impl), bridgeL2Data);
        bridgeL2 = TALStakingBridgeL2(address(bridgeL2Proxy));

        // Grant validation registry role
        vm.startPrank(admin);
        bridgeL2.grantRole(bridgeL2.VALIDATION_REGISTRY_ROLE(), validationRegistry);

        // Deploy Slashing Conditions L1
        TALSlashingConditionsL1 slashingImpl = new TALSlashingConditionsL1();
        bytes memory slashingData = abi.encodeWithSelector(
            TALSlashingConditionsL1.initialize.selector,
            admin,
            address(mockDeposit),   // seigManager (for stakeOf queries)
            talLayer2,
            address(0),             // Bridge L1 (set after deploy)
            address(mockDeposit),   // depositManager (for slash execution)
            admin                   // slashRecipient (treasury - use admin for tests)
        );
        ERC1967Proxy slashingProxy = new ERC1967Proxy(address(slashingImpl), slashingData);
        slashingConditions = TALSlashingConditionsL1(address(slashingProxy));

        // Deploy L1 Bridge
        TALStakingBridgeL1 bridgeL1Impl = new TALStakingBridgeL1();
        bytes memory bridgeL1Data = abi.encodeWithSelector(
            TALStakingBridgeL1.initialize.selector,
            admin,
            address(mockMessenger),
            address(bridgeL2),
            address(mockDeposit),
            address(slashingConditions),
            talLayer2
        );
        ERC1967Proxy bridgeL1Proxy = new ERC1967Proxy(address(bridgeL1Impl), bridgeL1Data);
        bridgeL1 = TALStakingBridgeL1(address(bridgeL1Proxy));

        // Grant keeper role to keeper
        bridgeL1.grantRole(bridgeL1.KEEPER_ROLE(), keeper);

        // Grant slasher role to bridge L1
        slashingConditions.grantRole(slashingConditions.SLASHER_ROLE(), address(bridgeL1));
        vm.stopPrank();

        // Setup mock messenger to simulate cross-domain messages
        mockMessenger.setXDomainMessageSender(address(bridgeL1));

        // Setup operator stakes on L1
        mockDeposit.setStake(talLayer2, operator1, 5000 ether);
        mockDeposit.setStake(talLayer2, operator2, 500 ether);
        mockDeposit.setStake(talLayer2, operator3, 15000 ether);
    }

    // ============ TALStakingBridgeL2 Tests ============

    function test_L2_ReceiveStakeUpdate() public {
        // Simulate L1→L2 message
        vm.prank(address(mockMessenger));
        bridgeL2.receiveStakeUpdate(operator1, 5000 ether, 100);

        assertEq(bridgeL2.getOperatorStake(operator1), 5000 ether);
        assertTrue(bridgeL2.isVerifiedOperator(operator1));
        assertEq(uint(bridgeL2.getOperatorTier(operator1)), uint(TALStakingBridgeL2.OperatorTier.VERIFIED));
    }

    function test_L2_ReceiveStakeUpdate_PremiumTier() public {
        vm.prank(address(mockMessenger));
        bridgeL2.receiveStakeUpdate(operator3, 15000 ether, 100);

        assertEq(uint(bridgeL2.getOperatorTier(operator3)), uint(TALStakingBridgeL2.OperatorTier.PREMIUM));
        assertTrue(bridgeL2.isVerifiedOperator(operator3));
    }

    function test_L2_ReceiveStakeUpdate_UnverifiedTier() public {
        vm.prank(address(mockMessenger));
        bridgeL2.receiveStakeUpdate(operator2, 500 ether, 100);

        assertFalse(bridgeL2.isVerifiedOperator(operator2));
        assertEq(uint(bridgeL2.getOperatorTier(operator2)), uint(TALStakingBridgeL2.OperatorTier.UNVERIFIED));
    }

    function test_L2_ReceiveStakeUpdate_TierTransition() public {
        // Start unverified
        vm.prank(address(mockMessenger));
        bridgeL2.receiveStakeUpdate(operator2, 500 ether, 100);
        assertEq(uint(bridgeL2.getOperatorTier(operator2)), uint(TALStakingBridgeL2.OperatorTier.UNVERIFIED));

        // Upgrade to verified
        vm.prank(address(mockMessenger));
        bridgeL2.receiveStakeUpdate(operator2, 2000 ether, 101);
        assertEq(uint(bridgeL2.getOperatorTier(operator2)), uint(TALStakingBridgeL2.OperatorTier.VERIFIED));

        // Upgrade to premium
        vm.prank(address(mockMessenger));
        bridgeL2.receiveStakeUpdate(operator2, 12000 ether, 102);
        assertEq(uint(bridgeL2.getOperatorTier(operator2)), uint(TALStakingBridgeL2.OperatorTier.PREMIUM));
    }

    function test_L2_IsCacheFresh() public {
        vm.prank(address(mockMessenger));
        bridgeL2.receiveStakeUpdate(operator1, 5000 ether, 100);

        assertTrue(bridgeL2.isCacheFresh(operator1, 4 hours));

        // Warp time forward
        vm.warp(block.timestamp + 5 hours);
        assertFalse(bridgeL2.isCacheFresh(operator1, 4 hours));
    }

    function test_L2_IsCacheFresh_NeverUpdated() public view {
        // Operator never updated should return false
        assertFalse(bridgeL2.isCacheFresh(operator1, 4 hours));
    }

    function test_L2_GetStakeSnapshot() public {
        uint256 currentBlock = 12345;
        vm.prank(address(mockMessenger));
        bridgeL2.receiveStakeUpdate(operator1, 5000 ether, currentBlock);

        TALStakingBridgeL2.StakeSnapshot memory snapshot = bridgeL2.getStakeSnapshot(operator1);
        assertEq(snapshot.amount, 5000 ether);
        assertEq(snapshot.lastUpdatedL1Block, currentBlock);
        assertGt(snapshot.timestamp, 0);
    }

    function test_L2_RequestSlashing_OnlyValidationRegistry() public {
        // First update stake
        vm.prank(address(mockMessenger));
        bridgeL2.receiveStakeUpdate(operator1, 5000 ether, 100);

        bytes memory evidence = abi.encodePacked("fraud_evidence");

        // Expect SlashRequested event
        vm.prank(validationRegistry);
        vm.expectEmit(true, true, false, false);
        emit TALStakingBridgeL2.SlashRequested(operator1, 2500 ether, keccak256(evidence));
        bridgeL2.requestSlashing(operator1, 2500 ether, evidence);
    }

    function test_L2_RequestSlashing_RevertUnauthorized() public {
        bytes memory evidence = abi.encodePacked("fraud_evidence");

        vm.prank(unauthorized);
        vm.expectRevert();
        bridgeL2.requestSlashing(operator1, 2500 ether, evidence);
    }

    function test_L2_ReceiveSeigniorage() public {
        vm.prank(address(mockMessenger));
        bridgeL2.receiveSeigniorage(operator1, 100 ether);

        assertEq(bridgeL2.getClaimableSeigniorage(operator1), 100 ether);
    }

    function test_L2_ReceiveSeigniorage_Accumulates() public {
        vm.prank(address(mockMessenger));
        bridgeL2.receiveSeigniorage(operator1, 100 ether);

        vm.prank(address(mockMessenger));
        bridgeL2.receiveSeigniorage(operator1, 50 ether);

        assertEq(bridgeL2.getClaimableSeigniorage(operator1), 150 ether);
    }

    function test_L2_ClaimSeigniorage_RevertNoBalance() public {
        vm.prank(operator1);
        vm.expectRevert(abi.encodeWithSignature("NoSeigniorageToClaim(address)", operator1));
        bridgeL2.claimSeigniorage();
    }

    function test_L2_RevertOnUnauthorizedBridgeCaller() public {
        vm.prank(unauthorized);
        vm.expectRevert(abi.encodeWithSignature("UnauthorizedBridgeCaller()"));
        bridgeL2.receiveStakeUpdate(operator1, 5000 ether, 100);
    }

    function test_L2_Constants() public view {
        assertEq(bridgeL2.VERIFIED_THRESHOLD(), 1000 ether);
        assertEq(bridgeL2.PREMIUM_THRESHOLD(), 10000 ether);
        assertEq(bridgeL2.DEFAULT_MAX_CACHE_AGE(), 4 hours);
    }

    // ============ TALStakingBridgeL1 Tests ============

    function test_L1_QueryAndRelayStake() public {
        bridgeL1.queryAndRelayStake(operator1);
        // Verify the relay happened - in production this would send via messenger
    }

    function test_L1_RegisterOperator() public {
        vm.prank(admin);
        bridgeL1.registerOperator(operator1);

        assertTrue(bridgeL1.isOperatorRegistered(operator1));
        assertEq(bridgeL1.getRegisteredOperatorCount(), 1);
    }

    function test_L1_RegisterOperator_Multiple() public {
        vm.startPrank(admin);
        bridgeL1.registerOperator(operator1);
        bridgeL1.registerOperator(operator2);
        bridgeL1.registerOperator(operator3);
        vm.stopPrank();

        assertEq(bridgeL1.getRegisteredOperatorCount(), 3);

        address[] memory operators = bridgeL1.getRegisteredOperators();
        assertEq(operators.length, 3);
    }

    function test_L1_RegisterOperator_RevertDuplicate() public {
        vm.startPrank(admin);
        bridgeL1.registerOperator(operator1);

        vm.expectRevert(abi.encodeWithSignature("OperatorAlreadyRegistered(address)", operator1));
        bridgeL1.registerOperator(operator1);
        vm.stopPrank();
    }

    function test_L1_RegisterOperator_RevertUnauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        bridgeL1.registerOperator(operator1);
    }

    function test_L1_RemoveOperator() public {
        vm.startPrank(admin);
        bridgeL1.registerOperator(operator1);
        bridgeL1.registerOperator(operator2);

        bridgeL1.removeOperator(operator1);
        vm.stopPrank();

        assertFalse(bridgeL1.isOperatorRegistered(operator1));
        assertTrue(bridgeL1.isOperatorRegistered(operator2));
        assertEq(bridgeL1.getRegisteredOperatorCount(), 1);
    }

    function test_L1_RemoveOperator_RevertNotRegistered() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSignature("OperatorNotRegistered(address)", operator1));
        bridgeL1.removeOperator(operator1);
    }

    function test_L1_RefreshAllOperators() public {
        vm.startPrank(admin);
        bridgeL1.registerOperator(operator1);
        bridgeL1.registerOperator(operator2);
        vm.stopPrank();

        vm.prank(keeper);
        bridgeL1.refreshAllOperators();
    }

    function test_L1_RefreshAllOperators_RevertUnauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        bridgeL1.refreshAllOperators();
    }

    function test_L1_BatchQueryStakes() public {
        address[] memory operators = new address[](2);
        operators[0] = operator1;
        operators[1] = operator2;

        bridgeL1.batchQueryStakes(operators);
    }

    function test_L1_BatchQueryStakes_RevertTooLarge() public {
        address[] memory tooMany = new address[](101);
        for (uint256 i = 0; i < 101; i++) {
            tooMany[i] = address(uint160(i + 1000));
        }

        vm.expectRevert(abi.encodeWithSignature("BatchTooLarge(uint256,uint256)", 101, 100));
        bridgeL1.batchQueryStakes(tooMany);
    }

    function test_L1_SetL2MessageGasLimit() public {
        vm.prank(admin);
        bridgeL1.setL2MessageGasLimit(300_000);

        assertEq(bridgeL1.l2MessageGasLimit(), 300_000);
    }

    function test_L1_Constants() public view {
        assertEq(bridgeL1.MAX_BATCH_SIZE(), 100);
    }

    // ============ TALSlashingConditionsL1 Tests ============

    function test_Slash_OnlyAuthorized() public {
        vm.prank(address(bridgeL1));
        uint256 slashed = slashingConditions.slash(operator1, 1000 ether);
        assertEq(slashed, 1000 ether);
    }

    function test_Slash_TracksStats() public {
        vm.prank(address(bridgeL1));
        slashingConditions.slash(operator1, 1000 ether);

        (uint256 total, uint256 count, uint256 lastTime) = slashingConditions.getSlashStats(operator1);
        assertEq(total, 1000 ether);
        assertEq(count, 1);
        assertGt(lastTime, 0);
    }

    function test_Slash_MultipleSlashes() public {
        vm.startPrank(address(bridgeL1));
        slashingConditions.slash(operator1, 1000 ether);
        slashingConditions.slash(operator1, 500 ether);
        slashingConditions.slash(operator1, 250 ether);
        vm.stopPrank();

        (uint256 total, uint256 count, ) = slashingConditions.getSlashStats(operator1);
        assertEq(total, 1750 ether);
        assertEq(count, 3);
    }

    function test_Slash_RevertUnauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        slashingConditions.slash(operator1, 1000 ether);
    }

    function test_DisableSlashing() public {
        vm.prank(admin);
        slashingConditions.disableSlashing();

        assertFalse(slashingConditions.slashingEnabled());

        vm.prank(address(bridgeL1));
        vm.expectRevert(abi.encodeWithSignature("SlashingIsDisabled()"));
        slashingConditions.slash(operator1, 1000 ether);
    }

    function test_EnableSlashing() public {
        vm.startPrank(admin);
        slashingConditions.disableSlashing();
        assertFalse(slashingConditions.slashingEnabled());

        slashingConditions.enableSlashing();
        assertTrue(slashingConditions.slashingEnabled());
        vm.stopPrank();

        // Should work again after re-enabling
        vm.prank(address(bridgeL1));
        slashingConditions.slash(operator1, 1000 ether);
    }

    function test_IsAuthorizedSlasher() public view {
        assertTrue(slashingConditions.isAuthorizedSlasher(address(bridgeL1)));
        assertFalse(slashingConditions.isAuthorizedSlasher(unauthorized));
    }

    function test_GetTotalSlashed() public {
        vm.prank(address(bridgeL1));
        slashingConditions.slash(operator1, 1000 ether);

        assertEq(slashingConditions.getTotalSlashed(operator1), 1000 ether);
    }

    // ============ Pause Tests ============

    function test_L2_Pause() public {
        vm.prank(admin);
        bridgeL2.pause();

        vm.prank(address(mockMessenger));
        vm.expectRevert();
        bridgeL2.receiveStakeUpdate(operator1, 5000 ether, 100);
    }

    function test_L2_Unpause() public {
        vm.startPrank(admin);
        bridgeL2.pause();
        bridgeL2.unpause();
        vm.stopPrank();

        // Should work after unpause
        vm.prank(address(mockMessenger));
        bridgeL2.receiveStakeUpdate(operator1, 5000 ether, 100);
    }

    function test_L1_Pause() public {
        vm.prank(admin);
        bridgeL1.pause();

        vm.expectRevert();
        bridgeL1.queryAndRelayStake(operator1);
    }

    function test_SlashingConditions_Pause() public {
        vm.prank(admin);
        slashingConditions.pause();

        vm.prank(address(bridgeL1));
        vm.expectRevert();
        slashingConditions.slash(operator1, 1000 ether);
    }

    // ============ Events Tests ============

    function test_L2_EmitsStakeUpdatedEvent() public {
        vm.prank(address(mockMessenger));
        vm.expectEmit(true, true, true, false);
        emit TALStakingBridgeL2.StakeUpdated(operator1, 5000 ether, 100);
        bridgeL2.receiveStakeUpdate(operator1, 5000 ether, 100);
    }

    function test_L2_EmitsOperatorTierChangedEvent() public {
        vm.prank(address(mockMessenger));
        vm.expectEmit(true, true, false, false);
        emit TALStakingBridgeL2.OperatorTierChanged(operator1, TALStakingBridgeL2.OperatorTier.VERIFIED);
        bridgeL2.receiveStakeUpdate(operator1, 5000 ether, 100);
    }

    function test_L2_EmitsSeigniorageReceivedEvent() public {
        vm.prank(address(mockMessenger));
        vm.expectEmit(true, true, false, false);
        emit TALStakingBridgeL2.SeigniorageReceived(operator1, 100 ether);
        bridgeL2.receiveSeigniorage(operator1, 100 ether);
    }

    function test_L1_EmitsOperatorRegisteredEvent() public {
        vm.prank(admin);
        vm.expectEmit(true, false, false, false);
        emit TALStakingBridgeL1.OperatorRegistered(operator1);
        bridgeL1.registerOperator(operator1);
    }

    function test_L1_EmitsOperatorRemovedEvent() public {
        vm.prank(admin);
        bridgeL1.registerOperator(operator1);

        vm.prank(admin);
        vm.expectEmit(true, false, false, false);
        emit TALStakingBridgeL1.OperatorRemoved(operator1);
        bridgeL1.removeOperator(operator1);
    }

    function test_SlashingConditions_EmitsSlashExecutedEvent() public {
        vm.prank(address(bridgeL1));
        vm.expectEmit(true, true, false, false);
        emit TALSlashingConditionsL1.SlashExecuted(operator1, 1000 ether, bytes32(0));
        slashingConditions.slash(operator1, 1000 ether);
    }

    function test_SlashingConditions_EmitsSlashingEnabledEvent() public {
        vm.prank(admin);
        slashingConditions.disableSlashing();

        vm.prank(admin);
        vm.expectEmit(false, false, false, false);
        emit TALSlashingConditionsL1.SlashingEnabled();
        slashingConditions.enableSlashing();
    }

    function test_SlashingConditions_EmitsSlashingDisabledEvent() public {
        vm.prank(admin);
        vm.expectEmit(false, false, false, false);
        emit TALSlashingConditionsL1.SlashingDisabled();
        slashingConditions.disableSlashing();
    }

    // ============ Integration Flow Tests ============

    function test_FullBridgeFlow_StakeUpdateAndSlash() public {
        // Step 1: Register operator on L1
        vm.prank(admin);
        bridgeL1.registerOperator(operator1);

        // Step 2: Query and relay stake
        bridgeL1.queryAndRelayStake(operator1);

        // Step 3: Simulate L1→L2 message arrival (stake update)
        vm.prank(address(mockMessenger));
        bridgeL2.receiveStakeUpdate(operator1, 5000 ether, block.number);

        // Verify L2 state
        assertEq(bridgeL2.getOperatorStake(operator1), 5000 ether);
        assertTrue(bridgeL2.isVerifiedOperator(operator1));

        // Step 4: Request slashing from validation registry
        bytes memory evidence = abi.encodePacked("fraud_proof");
        vm.prank(validationRegistry);
        bridgeL2.requestSlashing(operator1, 1000 ether, evidence);

        // Step 5: Execute slash on L1 (simulating L2→L1 message arrival)
        vm.prank(address(bridgeL1));
        slashingConditions.slash(operator1, 1000 ether);

        // Verify slash stats
        (uint256 totalSlashed, uint256 slashCount, ) = slashingConditions.getSlashStats(operator1);
        assertEq(totalSlashed, 1000 ether);
        assertEq(slashCount, 1);
    }
}
