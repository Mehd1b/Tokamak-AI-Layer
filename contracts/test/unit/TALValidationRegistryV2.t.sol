// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {TALValidationRegistry} from "../../src/core/TALValidationRegistry.sol";
import {TALValidationRegistryV2} from "../../src/core/TALValidationRegistryV2.sol";
import {TALIdentityRegistry} from "../../src/core/TALIdentityRegistry.sol";
import {IERC8004ValidationRegistry} from "../../src/interfaces/IERC8004ValidationRegistry.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MockStakingV3} from "../mocks/MockStakingV3.sol";

/**
 * @title TALValidationRegistryV2Test
 * @notice Tests for epoch-based validation stats tracking in V2 upgrade
 */
contract TALValidationRegistryV2Test is Test {
    // ============ Contracts ============
    TALValidationRegistryV2 public registry;
    TALValidationRegistry public v1Implementation;
    TALValidationRegistryV2 public v2Implementation;
    TALIdentityRegistry public identityRegistry;
    MockStakingV3 public stakingBridge;

    // ============ Accounts ============
    address public admin = makeAddr("admin");
    address public treasury = makeAddr("treasury");
    address public agentOwner = makeAddr("agentOwner");
    address public requester = makeAddr("requester");
    address public validator1 = makeAddr("validator1");
    address public validator2 = makeAddr("validator2");

    // ============ Constants ============
    string public constant AGENT_URI = "ipfs://QmAgent";
    uint256 public agentId;

    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant DISPUTE_RESOLVER_ROLE = keccak256("DISPUTE_RESOLVER_ROLE");

    // ============ Setup ============

    function setUp() public {
        stakingBridge = new MockStakingV3();

        // Deploy identity registry
        TALIdentityRegistry identityImpl = new TALIdentityRegistry();
        bytes memory identityInitData = abi.encodeWithSelector(
            TALIdentityRegistry.initialize.selector,
            admin,
            address(stakingBridge),
            address(0)
        );
        ERC1967Proxy identityProxy = new ERC1967Proxy(address(identityImpl), identityInitData);
        identityRegistry = TALIdentityRegistry(address(identityProxy));

        // Deploy V1 validation registry + proxy
        v1Implementation = new TALValidationRegistry();
        bytes memory v1InitData = abi.encodeWithSelector(
            TALValidationRegistry.initialize.selector,
            admin,
            address(identityRegistry),
            address(0), // reputation registry
            treasury
        );
        ERC1967Proxy valProxy = new ERC1967Proxy(address(v1Implementation), v1InitData);

        // Upgrade to V2
        v2Implementation = new TALValidationRegistryV2();
        vm.prank(admin);
        TALValidationRegistry(payable(address(valProxy))).upgradeToAndCall(
            address(v2Implementation),
            abi.encodeWithSelector(TALValidationRegistryV2.initializeV2.selector)
        );

        registry = TALValidationRegistryV2(payable(address(valProxy)));

        // Set staking bridge
        vm.prank(admin);
        registry.setStakingBridge(address(stakingBridge));

        // Set validator stakes
        stakingBridge.setStake(validator1, 5000 ether);
        stakingBridge.setStake(validator2, 3000 ether);

        // Fund accounts
        vm.deal(requester, 100 ether);
        vm.deal(agentOwner, 10 ether);
        vm.deal(address(registry), 10 ether); // for bounty refunds

        // Register agent
        vm.prank(agentOwner);
        agentId = identityRegistry.register(AGENT_URI);
    }

    // ============ Helpers ============

    function _requestValidation(
        uint256 _agentId,
        uint256 bounty
    ) internal returns (bytes32) {
        vm.prank(requester);
        return registry.requestValidation{value: bounty}(
            _agentId,
            keccak256("task"),
            keccak256("output"),
            IERC8004ValidationRegistry.ValidationModel.ReputationOnly,
            block.timestamp + 1 hours
        );
    }

    function _submitValidation(
        bytes32 requestHash,
        uint8 score,
        address validator
    ) internal {
        vm.prank(validator);
        registry.submitValidation(requestHash, score, "", "ipfs://details");
    }

    // =====================================================================
    // EPOCH STATS TRACKING TESTS
    // =====================================================================

    function test_submitValidation_tracks_total_count() public {
        bytes32 hash1 = _requestValidation(agentId, 0);
        bytes32 hash2 = _requestValidation(agentId, 0);

        _submitValidation(hash1, 80, validator1);
        _submitValidation(hash2, 90, validator1);

        (uint256 total, uint256 failed) = registry.getAgentValidationStats(agentId, 30 days);
        assertEq(total, 2);
        assertEq(failed, 0);
    }

    function test_submitValidation_tracks_failed_count() public {
        bytes32 hash1 = _requestValidation(agentId, 0);
        bytes32 hash2 = _requestValidation(agentId, 0);
        bytes32 hash3 = _requestValidation(agentId, 0);

        _submitValidation(hash1, 80, validator1); // pass
        _submitValidation(hash2, 30, validator1); // fail (< 50)
        _submitValidation(hash3, 49, validator1); // fail (< 50)

        (uint256 total, uint256 failed) = registry.getAgentValidationStats(agentId, 30 days);
        assertEq(total, 3);
        assertEq(failed, 2);
    }

    function test_score_exactly_50_is_not_failed() public {
        bytes32 hash = _requestValidation(agentId, 0);
        _submitValidation(hash, 50, validator1);

        (uint256 total, uint256 failed) = registry.getAgentValidationStats(agentId, 30 days);
        assertEq(total, 1);
        assertEq(failed, 0);
    }

    function test_score_49_is_failed() public {
        bytes32 hash = _requestValidation(agentId, 0);
        _submitValidation(hash, 49, validator1);

        (uint256 total, uint256 failed) = registry.getAgentValidationStats(agentId, 30 days);
        assertEq(total, 1);
        assertEq(failed, 1);
    }

    function test_score_0_is_failed() public {
        bytes32 hash = _requestValidation(agentId, 0);
        _submitValidation(hash, 0, validator1);

        (uint256 total, uint256 failed) = registry.getAgentValidationStats(agentId, 30 days);
        assertEq(total, 1);
        assertEq(failed, 1);
    }

    function test_stats_isolated_per_agent() public {
        // Register second agent
        vm.prank(agentOwner);
        uint256 agentId2 = identityRegistry.register("ipfs://QmAgent2");

        bytes32 hash1 = _requestValidation(agentId, 0);
        bytes32 hash2 = _requestValidation(agentId2, 0);

        _submitValidation(hash1, 30, validator1); // agent1: fail
        _submitValidation(hash2, 80, validator1); // agent2: pass

        (uint256 total1, uint256 failed1) = registry.getAgentValidationStats(agentId, 30 days);
        (uint256 total2, uint256 failed2) = registry.getAgentValidationStats(agentId2, 30 days);

        assertEq(total1, 1);
        assertEq(failed1, 1);
        assertEq(total2, 1);
        assertEq(failed2, 0);
    }

    // =====================================================================
    // EPOCH BOUNDARY TESTS
    // =====================================================================

    function test_stats_reset_at_epoch_boundary() public {
        // Submit validation in current epoch
        bytes32 hash1 = _requestValidation(agentId, 0);
        _submitValidation(hash1, 30, validator1); // fail

        (uint256 total, uint256 failed) = registry.getAgentValidationStats(agentId, 30 days);
        assertEq(total, 1);
        assertEq(failed, 1);

        // Warp to next epoch
        vm.warp(block.timestamp + 30 days + 1);

        // Stats for single epoch should be 0
        (total, failed) = registry.getAgentValidationStats(agentId, 30 days);
        assertEq(total, 0);
        assertEq(failed, 0);
    }

    function test_stats_span_two_epochs_with_larger_window() public {
        // Submit in epoch N
        bytes32 hash1 = _requestValidation(agentId, 0);
        _submitValidation(hash1, 30, validator1); // fail

        // Warp to epoch N+1
        vm.warp(block.timestamp + 30 days + 1);

        // Submit in epoch N+1
        bytes32 hash2 = _requestValidation(agentId, 0);
        _submitValidation(hash2, 80, validator1); // pass

        // With window > 30 days, should include both epochs
        (uint256 total, uint256 failed) = registry.getAgentValidationStats(agentId, 60 days);
        assertEq(total, 2);
        assertEq(failed, 1);

        // With window <= 30 days, should only include current epoch
        (total, failed) = registry.getAgentValidationStats(agentId, 30 days);
        assertEq(total, 1);
        assertEq(failed, 0);
    }

    function test_currentEpoch_returns_correct_value() public view {
        uint256 expected = block.timestamp / 30 days;
        assertEq(registry.currentEpoch(), expected);
    }

    function test_getEpochStats_raw() public {
        bytes32 hash = _requestValidation(agentId, 0);
        _submitValidation(hash, 30, validator1);

        uint256 epoch = registry.currentEpoch();
        (uint256 total, uint256 failed) = registry.getEpochStats(agentId, epoch);
        assertEq(total, 1);
        assertEq(failed, 1);
    }

    // =====================================================================
    // DISPUTE FAILURE TRACKING TESTS
    // =====================================================================

    function test_resolveDispute_overturned_increments_failed() public {
        bytes32 hash = _requestValidation(agentId, 0);
        _submitValidation(hash, 80, validator1); // originally "pass"

        // Dispute
        vm.prank(requester);
        registry.disputeValidation(hash, "evidence");

        // Before resolution: 1 total, 0 failed (score was 80)
        (uint256 total, uint256 failed) = registry.getAgentValidationStats(agentId, 30 days);
        assertEq(total, 1);
        assertEq(failed, 0);

        // Resolve: overturn original validation
        vm.prank(admin);
        registry.resolveDispute(hash, false);

        // After resolution: 1 total, 1 failed (dispute added failure)
        (total, failed) = registry.getAgentValidationStats(agentId, 30 days);
        assertEq(total, 1);
        assertEq(failed, 1);
    }

    function test_resolveDispute_upheld_does_not_change_stats() public {
        bytes32 hash = _requestValidation(agentId, 0);
        _submitValidation(hash, 80, validator1);

        vm.prank(requester);
        registry.disputeValidation(hash, "evidence");

        vm.prank(admin);
        registry.resolveDispute(hash, true); // uphold original

        (uint256 total, uint256 failed) = registry.getAgentValidationStats(agentId, 30 days);
        assertEq(total, 1);
        assertEq(failed, 0);
    }

    // =====================================================================
    // UPGRADE TESTS
    // =====================================================================

    function test_upgrade_preserves_v1_data() public {
        // V1 request/submit should still work
        bytes32 hash = _requestValidation(agentId, 0);
        _submitValidation(hash, 75, validator1);

        // V1 getValidation still works
        (TALValidationRegistry.ValidationRequest memory req,
         TALValidationRegistry.ValidationResponse memory resp) = registry.getValidation(hash);

        assertEq(req.agentId, agentId);
        assertEq(resp.score, 75);
        assertEq(resp.validator, validator1);
    }

    function test_initializeV2_cannot_reinit() public {
        vm.expectRevert(); // InvalidInitialization
        registry.initializeV2();
    }

    function test_v1_functions_still_work() public {
        // getAgentValidations
        bytes32 hash = _requestValidation(agentId, 0);
        _submitValidation(hash, 80, validator1);

        bytes32[] memory vals = registry.getAgentValidations(agentId);
        assertEq(vals.length, 1);
        assertEq(vals[0], hash);

        // getPendingValidationCount
        bytes32 hash2 = _requestValidation(agentId, 0);
        assertEq(registry.getPendingValidationCount(agentId), 1);

        _submitValidation(hash2, 90, validator1);
        assertEq(registry.getPendingValidationCount(agentId), 0);
    }

    // =====================================================================
    // EMITS EVENTS TEST
    // =====================================================================

    function test_submitValidation_emits_stats_event() public {
        bytes32 hash = _requestValidation(agentId, 0);
        uint256 epoch = registry.currentEpoch();

        vm.expectEmit(true, false, false, true);
        emit TALValidationRegistryV2.ValidationStatsUpdated(agentId, epoch, 1, 0);

        _submitValidation(hash, 80, validator1);
    }

    function test_submitValidation_emits_stats_event_for_failure() public {
        bytes32 hash = _requestValidation(agentId, 0);
        uint256 epoch = registry.currentEpoch();

        vm.expectEmit(true, false, false, true);
        emit TALValidationRegistryV2.ValidationStatsUpdated(agentId, epoch, 1, 1);

        _submitValidation(hash, 30, validator1);
    }

    // =====================================================================
    // STRESS / MULTIPLE VALIDATIONS TEST
    // =====================================================================

    function test_many_validations_stats_correct() public {
        // Submit 10 validations: 6 pass, 4 fail
        uint8[10] memory scores = [uint8(80), 30, 90, 20, 70, 10, 60, 40, 55, 45];
        // Pass (>=50): 80, 90, 70, 60, 55 = 5 pass
        // Fail (<50):  30, 20, 10, 40, 45 = 5 fail

        for (uint256 i = 0; i < 10; i++) {
            bytes32 hash = _requestValidation(agentId, 0);
            _submitValidation(hash, scores[i], validator1);
        }

        (uint256 total, uint256 failed) = registry.getAgentValidationStats(agentId, 30 days);
        assertEq(total, 10);
        assertEq(failed, 5);
    }

    // =====================================================================
    // INTEGRATION: IdentityRegistryV2 checkAndSlash compatibility
    // =====================================================================

    function test_stats_format_compatible_with_identity_registry() public {
        // Simulate the exact call pattern IdentityRegistryV2 uses:
        // (uint256 total, uint256 failed) = getAgentValidationStats(agentId, 30 days)

        bytes32 hash1 = _requestValidation(agentId, 0);
        bytes32 hash2 = _requestValidation(agentId, 0);
        bytes32 hash3 = _requestValidation(agentId, 0);

        _submitValidation(hash1, 80, validator1); // pass
        _submitValidation(hash2, 20, validator1); // fail
        _submitValidation(hash3, 10, validator1); // fail

        // Simulate the staticcall that IdentityRegistryV2 makes
        (bool success, bytes memory data) = address(registry).staticcall(
            abi.encodeWithSignature(
                "getAgentValidationStats(uint256,uint256)",
                agentId,
                30 days
            )
        );

        assertTrue(success);
        (uint256 total, uint256 failed) = abi.decode(data, (uint256, uint256));
        assertEq(total, 3);
        assertEq(failed, 2);

        // 2/3 = 66% > 30% threshold — would trigger slash
        assertTrue(failed * 100 > total * 30);
    }
}
