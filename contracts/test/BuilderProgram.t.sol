// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console2 } from "forge-std/Test.sol";
import { BuilderProgram } from "../src/BuilderProgram.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";

contract BuilderProgramTest is Test {
    BuilderProgram public program;
    MockERC20 public token;

    address public deployer = address(this);
    address public builder1 = address(0x1111111111111111111111111111111111111111);
    address public builder2 = address(0x2222222222222222222222222222222222222222);
    address public builder3 = address(0x3333333333333333333333333333333333333333);
    address public unauthorized = address(0x4444444444444444444444444444444444444444);
    address public updater = address(0x5555555555555555555555555555555555555555);
    address public vaultFactory = address(0x6666666666666666666666666666666666666666);
    address public agentRegistry = address(0x7777777777777777777777777777777777777777);

    uint256 public constant GRANT_AMOUNT = 10_000e18;

    function setUp() public {
        token = new MockERC20("Grant Token", "GRANT", 18);
        program = new BuilderProgram(vaultFactory, agentRegistry, address(token));

        // Mint tokens to deployer for grant allocation
        token.mint(deployer, 1_000_000e18);
        token.approve(address(program), type(uint256).max);
    }

    // ============ Constructor Tests ============

    function test_constructor() public view {
        assertEq(program.owner(), deployer);
        assertEq(program.vaultFactory(), vaultFactory);
        assertEq(program.agentRegistry(), agentRegistry);
        assertEq(address(program.grantToken()), address(token));
    }

    function test_constructor_revert_zeroVaultFactory() public {
        vm.expectRevert(BuilderProgram.ZeroAddress.selector);
        new BuilderProgram(address(0), agentRegistry, address(token));
    }

    function test_constructor_revert_zeroAgentRegistry() public {
        vm.expectRevert(BuilderProgram.ZeroAddress.selector);
        new BuilderProgram(vaultFactory, address(0), address(token));
    }

    function test_constructor_revert_zeroGrantToken() public {
        vm.expectRevert(BuilderProgram.ZeroAddress.selector);
        new BuilderProgram(vaultFactory, agentRegistry, address(0));
    }

    // ============ Registration Tests ============

    function test_registerBuilder() public {
        vm.prank(builder1);
        program.registerBuilder("Alice Builder", "https://alice.dev");

        BuilderProgram.Builder memory b = program.getBuilderStats(builder1);
        assertEq(b.builderAddress, builder1);
        assertEq(b.name, "Alice Builder");
        assertEq(b.url, "https://alice.dev");
        assertEq(b.totalTvl, 0);
        assertEq(b.totalFeesEarned, 0);
        assertEq(b.totalExecutions, 0);
        assertEq(uint256(b.tier), uint256(BuilderProgram.Tier.Bronze));
        assertEq(b.registeredAt, block.timestamp);
    }

    function test_registerBuilder_emitsEvent() public {
        vm.prank(builder1);
        vm.expectEmit(true, false, false, true);
        emit BuilderProgram.BuilderRegistered(builder1, "Alice", "https://alice.dev");
        program.registerBuilder("Alice", "https://alice.dev");
    }

    function test_registerBuilder_revert_duplicate() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        vm.prank(builder1);
        vm.expectRevert(BuilderProgram.AlreadyRegistered.selector);
        program.registerBuilder("Alice Again", "https://alice2.dev");
    }

    function test_registerBuilder_revert_emptyName() public {
        vm.prank(builder1);
        vm.expectRevert(BuilderProgram.EmptyName.selector);
        program.registerBuilder("", "https://alice.dev");
    }

    function test_registerBuilder_incrementsCount() public {
        assertEq(program.builderCount(), 0);

        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");
        assertEq(program.builderCount(), 1);

        vm.prank(builder2);
        program.registerBuilder("Bob", "https://bob.dev");
        assertEq(program.builderCount(), 2);
    }

    // ============ Tier Calculation Tests ============

    function test_tier_zero_tvl_is_bronze() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        // TVL = 0 -> Bronze
        assertEq(uint256(program.getTier(builder1)), uint256(BuilderProgram.Tier.Bronze));
    }

    function test_tier_99k_tvl_is_bronze() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        program.updateStats(builder1, 99_999e18, 0, 0);
        assertEq(uint256(program.getTier(builder1)), uint256(BuilderProgram.Tier.Bronze));
    }

    function test_tier_100k_tvl_is_silver() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        program.updateStats(builder1, 100_000e18, 0, 0);
        assertEq(uint256(program.getTier(builder1)), uint256(BuilderProgram.Tier.Silver));
    }

    function test_tier_999k_tvl_is_silver() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        program.updateStats(builder1, 999_999e18, 0, 0);
        assertEq(uint256(program.getTier(builder1)), uint256(BuilderProgram.Tier.Silver));
    }

    function test_tier_1m_tvl_is_gold() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        program.updateStats(builder1, 1_000_000e18, 0, 0);
        assertEq(uint256(program.getTier(builder1)), uint256(BuilderProgram.Tier.Gold));
    }

    function test_tier_10m_tvl_is_gold() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        program.updateStats(builder1, 10_000_000e18, 0, 0);
        assertEq(uint256(program.getTier(builder1)), uint256(BuilderProgram.Tier.Gold));
    }

    function test_tier_changes_emit_event() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        vm.expectEmit(true, false, false, true);
        emit BuilderProgram.TierChanged(builder1, BuilderProgram.Tier.Bronze, BuilderProgram.Tier.Silver);
        program.updateStats(builder1, 100_000e18, 0, 0);
    }

    // ============ Fee Split Tests ============

    function test_feeSplit_bronze() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        (uint256 builderBps, uint256 protocolBps) = program.getFeeSplit(builder1);
        assertEq(builderBps, 7000);
        assertEq(protocolBps, 3000);
    }

    function test_feeSplit_silver() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        program.updateStats(builder1, 100_000e18, 0, 0);
        (uint256 builderBps, uint256 protocolBps) = program.getFeeSplit(builder1);
        assertEq(builderBps, 8000);
        assertEq(protocolBps, 2000);
    }

    function test_feeSplit_gold() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        program.updateStats(builder1, 1_000_000e18, 0, 0);
        (uint256 builderBps, uint256 protocolBps) = program.getFeeSplit(builder1);
        assertEq(builderBps, 9000);
        assertEq(protocolBps, 1000);
    }

    function test_feeSplit_sums_to_10000() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        // Bronze
        (uint256 b1, uint256 p1) = program.getFeeSplit(builder1);
        assertEq(b1 + p1, 10_000);

        // Silver
        program.updateStats(builder1, 100_000e18, 0, 0);
        (uint256 b2, uint256 p2) = program.getFeeSplit(builder1);
        assertEq(b2 + p2, 10_000);

        // Gold
        program.updateStats(builder1, 1_000_000e18, 0, 0);
        (uint256 b3, uint256 p3) = program.getFeeSplit(builder1);
        assertEq(b3 + p3, 10_000);
    }

    // ============ Stats Update Tests ============

    function test_updateStats_byOwner() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        program.updateStats(builder1, 500_000e18, 1000e18, 42);

        BuilderProgram.Builder memory b = program.getBuilderStats(builder1);
        assertEq(b.totalTvl, 500_000e18);
        assertEq(b.totalFeesEarned, 1000e18);
        assertEq(b.totalExecutions, 42);
    }

    function test_updateStats_byAuthorizedUpdater() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        program.setAuthorizedUpdater(updater, true);

        vm.prank(updater);
        program.updateStats(builder1, 200_000e18, 500e18, 10);

        BuilderProgram.Builder memory b = program.getBuilderStats(builder1);
        assertEq(b.totalTvl, 200_000e18);
    }

    function test_updateStats_revert_unauthorized() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        vm.prank(unauthorized);
        vm.expectRevert(BuilderProgram.NotAuthorized.selector);
        program.updateStats(builder1, 100e18, 0, 0);
    }

    function test_updateStats_revert_notRegistered() public {
        vm.expectRevert(BuilderProgram.NotRegistered.selector);
        program.updateStats(builder1, 100e18, 0, 0);
    }

    function test_updateStats_emitsEvent() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        vm.expectEmit(true, false, false, true);
        emit BuilderProgram.StatsUpdated(builder1, 500e18, 100e18, 5);
        program.updateStats(builder1, 500e18, 100e18, 5);
    }

    // ============ Grant Allocation Tests ============

    function test_allocateGrant() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        program.allocateGrant(builder1, GRANT_AMOUNT, 365 days);

        (uint256 totalAmount, uint256 claimed, uint256 startTime, uint256 vestingDuration) =
            program.grants(builder1);
        assertEq(totalAmount, GRANT_AMOUNT);
        assertEq(claimed, 0);
        assertEq(startTime, block.timestamp);
        assertEq(vestingDuration, 365 days);

        // Token should be in contract
        assertEq(token.balanceOf(address(program)), GRANT_AMOUNT);
    }

    function test_allocateGrant_revert_notOwner() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        vm.prank(unauthorized);
        vm.expectRevert(BuilderProgram.NotOwner.selector);
        program.allocateGrant(builder1, GRANT_AMOUNT, 365 days);
    }

    function test_allocateGrant_revert_notRegistered() public {
        vm.expectRevert(BuilderProgram.NotRegistered.selector);
        program.allocateGrant(builder1, GRANT_AMOUNT, 365 days);
    }

    function test_allocateGrant_revert_zeroAmount() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        vm.expectRevert(BuilderProgram.InvalidGrant.selector);
        program.allocateGrant(builder1, 0, 365 days);
    }

    function test_allocateGrant_revert_zeroDuration() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        vm.expectRevert(BuilderProgram.InvalidGrant.selector);
        program.allocateGrant(builder1, GRANT_AMOUNT, 0);
    }

    function test_allocateGrant_emitsEvent() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        vm.expectEmit(true, false, false, true);
        emit BuilderProgram.GrantAllocated(builder1, GRANT_AMOUNT, 365 days);
        program.allocateGrant(builder1, GRANT_AMOUNT, 365 days);
    }

    // ============ Grant Vesting Math Tests ============

    function test_claimable_at_0_percent_vested() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        program.allocateGrant(builder1, GRANT_AMOUNT, 365 days);

        // At start time, nothing is claimable
        assertEq(program.getClaimable(builder1), 0);
    }

    function test_claimable_at_50_percent_vested() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        program.allocateGrant(builder1, GRANT_AMOUNT, 365 days);

        // Fast forward to 50% vested
        vm.warp(block.timestamp + 182.5 days);

        uint256 claimable = program.getClaimable(builder1);
        // 50% of 10_000e18 = 5_000e18 (approximately, due to integer division)
        assertApproxEqAbs(claimable, 5_000e18, 1e18);
    }

    function test_claimable_at_100_percent_vested() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        program.allocateGrant(builder1, GRANT_AMOUNT, 365 days);

        // Fast forward past vesting end
        vm.warp(block.timestamp + 365 days);

        assertEq(program.getClaimable(builder1), GRANT_AMOUNT);
    }

    function test_claim_at_50_percent() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        program.allocateGrant(builder1, GRANT_AMOUNT, 100 days);

        // Fast forward 50 days
        vm.warp(block.timestamp + 50 days);

        uint256 expectedClaimable = (GRANT_AMOUNT * 50 days) / 100 days;

        vm.prank(builder1);
        program.claimGrant();

        assertEq(token.balanceOf(builder1), expectedClaimable);
        (, uint256 claimed,,) = program.grants(builder1);
        assertEq(claimed, expectedClaimable);
    }

    function test_claim_at_100_percent() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        program.allocateGrant(builder1, GRANT_AMOUNT, 100 days);

        // Fast forward past vesting
        vm.warp(block.timestamp + 100 days);

        vm.prank(builder1);
        program.claimGrant();

        assertEq(token.balanceOf(builder1), GRANT_AMOUNT);
    }

    function test_claim_incremental() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        program.allocateGrant(builder1, GRANT_AMOUNT, 100 days);

        // Claim at 25%
        vm.warp(block.timestamp + 25 days);
        vm.prank(builder1);
        program.claimGrant();
        uint256 first = token.balanceOf(builder1);
        assertEq(first, (GRANT_AMOUNT * 25) / 100);

        // Claim at 75%
        vm.warp(block.timestamp + 50 days);
        vm.prank(builder1);
        program.claimGrant();
        uint256 second = token.balanceOf(builder1);
        assertEq(second, (GRANT_AMOUNT * 75) / 100);

        // Claim at 100%
        vm.warp(block.timestamp + 25 days);
        vm.prank(builder1);
        program.claimGrant();
        assertEq(token.balanceOf(builder1), GRANT_AMOUNT);
    }

    function test_claim_revert_nothingToClaim() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        program.allocateGrant(builder1, GRANT_AMOUNT, 100 days);

        // Claim immediately (nothing vested)
        vm.prank(builder1);
        vm.expectRevert(BuilderProgram.NothingToClaim.selector);
        program.claimGrant();
    }

    function test_claim_revert_notRegistered() public {
        vm.prank(unauthorized);
        vm.expectRevert(BuilderProgram.NotRegistered.selector);
        program.claimGrant();
    }

    function test_claim_emitsEvent() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        program.allocateGrant(builder1, GRANT_AMOUNT, 100 days);

        vm.warp(block.timestamp + 100 days);

        vm.prank(builder1);
        vm.expectEmit(true, false, false, true);
        emit BuilderProgram.GrantClaimed(builder1, GRANT_AMOUNT);
        program.claimGrant();
    }

    function test_getClaimable_noGrant_returns_zero() public view {
        assertEq(program.getClaimable(builder1), 0);
    }

    // ============ Leaderboard Tests ============

    function test_leaderboard_ordering() public {
        // Register 3 builders
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");
        vm.prank(builder2);
        program.registerBuilder("Bob", "https://bob.dev");
        vm.prank(builder3);
        program.registerBuilder("Charlie", "https://charlie.dev");

        // Set TVLs: Alice=500K, Bob=1M, Charlie=200K
        program.updateStats(builder1, 500_000e18, 0, 0);
        program.updateStats(builder2, 1_000_000e18, 0, 0);
        program.updateStats(builder3, 200_000e18, 0, 0);

        BuilderProgram.Builder[] memory lb = program.getLeaderboard(0, 10);

        assertEq(lb.length, 3);
        // Sorted by TVL desc: Bob (1M), Alice (500K), Charlie (200K)
        assertEq(lb[0].builderAddress, builder2);
        assertEq(lb[1].builderAddress, builder1);
        assertEq(lb[2].builderAddress, builder3);
    }

    function test_leaderboard_pagination() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");
        vm.prank(builder2);
        program.registerBuilder("Bob", "https://bob.dev");
        vm.prank(builder3);
        program.registerBuilder("Charlie", "https://charlie.dev");

        program.updateStats(builder1, 500_000e18, 0, 0);
        program.updateStats(builder2, 1_000_000e18, 0, 0);
        program.updateStats(builder3, 200_000e18, 0, 0);

        // Get page 2 (offset=1, limit=1) -> should be Alice
        BuilderProgram.Builder[] memory lb = program.getLeaderboard(1, 1);
        assertEq(lb.length, 1);
        assertEq(lb[0].builderAddress, builder1);
    }

    function test_leaderboard_offset_beyond_total() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        BuilderProgram.Builder[] memory lb = program.getLeaderboard(10, 5);
        assertEq(lb.length, 0);
    }

    function test_leaderboard_empty() public view {
        BuilderProgram.Builder[] memory lb = program.getLeaderboard(0, 10);
        assertEq(lb.length, 0);
    }

    // ============ Ownership Tests ============

    function test_transferOwnership() public {
        program.transferOwnership(builder1);
        assertEq(program.owner(), builder1);
    }

    function test_transferOwnership_revert_notOwner() public {
        vm.prank(unauthorized);
        vm.expectRevert(BuilderProgram.NotOwner.selector);
        program.transferOwnership(unauthorized);
    }

    function test_transferOwnership_revert_zeroAddress() public {
        vm.expectRevert(BuilderProgram.ZeroAddress.selector);
        program.transferOwnership(address(0));
    }

    // ============ Grant Top-up Test ============

    function test_allocateGrant_topUp() public {
        vm.prank(builder1);
        program.registerBuilder("Alice", "https://alice.dev");

        program.allocateGrant(builder1, GRANT_AMOUNT, 365 days);
        program.allocateGrant(builder1, GRANT_AMOUNT, 365 days);

        (uint256 totalAmount,,,) = program.grants(builder1);
        assertEq(totalAmount, GRANT_AMOUNT * 2);
        assertEq(token.balanceOf(address(program)), GRANT_AMOUNT * 2);
    }
}
