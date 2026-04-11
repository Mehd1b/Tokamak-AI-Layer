// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console2 } from "forge-std/Test.sol";
import { PointsProgram } from "../src/PointsProgram.sol";

/// @title MockVaultFactory
/// @notice Minimal mock that tracks which addresses are "deployed vaults"
contract MockVaultFactory {
    mapping(address => bool) public isDeployedVault;

    function setVault(address vault, bool deployed) external {
        isDeployedVault[vault] = deployed;
    }
}

/// @title PointsProgramTest
/// @notice Comprehensive test suite for PointsProgram
contract PointsProgramTest is Test {
    PointsProgram public points;
    MockVaultFactory public factory;

    address public owner = address(this);
    address public user = address(0x1111111111111111111111111111111111111111);
    address public user2 = address(0x2222222222222222222222222222222222222222);
    address public referrer = address(0x3333333333333333333333333333333333333333);
    address public vault = address(0x4444444444444444444444444444444444444444);
    address public vault2 = address(0x5555555555555555555555555555555555555555);
    address public unauthorized = address(0x6666666666666666666666666666666666666666);

    uint256 public constant DEPOSIT_AMOUNT = 100 ether;

    function setUp() public {
        // Deploy mock factory
        factory = new MockVaultFactory();
        factory.setVault(vault, true);
        factory.setVault(vault2, true);

        // Deploy PointsProgram
        points = new PointsProgram(address(factory));
    }

    // ============ Constructor Tests ============

    function test_constructor() public view {
        assertEq(points.owner(), owner);
        assertEq(address(points.vaultFactory()), address(factory));
        assertEq(points.deployedAt(), block.timestamp);
        assertEq(points.seasonEnd(), 0);
    }

    function test_constructor_revert_zeroFactory() public {
        vm.expectRevert(PointsProgram.ZeroAddress.selector);
        new PointsProgram(address(0));
    }

    // ============ Accrual Math Tests ============

    function test_accrual_100tokens_1day_earns_100points() public {
        // Set deposit balance: 100 tokens = 100e18
        points.updateDepositBalance(vault, user, DEPOSIT_AMOUNT);

        // Fast forward 1 day
        vm.warp(block.timestamp + 1 days);

        // Accrue points
        points.accruePoints(vault, user);

        // During early adopter period: 100 * 1 * 3 = 300 points (3x multiplier)
        // But without early adopter: 100 * 1 = 100 points
        // Since we're in the early adopter period (just deployed), expect 300
        uint256 totalPts = points.getPoints(user);
        assertEq(totalPts, 300, "Should earn 300 points (100 tokens * 1 day * 3x multiplier)");
    }

    function test_accrual_basic_math() public {
        // Skip past early adopter period for simpler math
        vm.warp(block.timestamp + 31 days);

        // Set deposit balance: 100 tokens
        points.updateDepositBalance(vault, user, DEPOSIT_AMOUNT);

        // Fast forward 1 day
        vm.warp(block.timestamp + 1 days);

        // Accrue points
        points.accruePoints(vault, user);

        // 100 tokens * 1 day * 1x = 100 points
        assertEq(points.getPoints(user), 100, "Should earn 100 points after early adopter period");
    }

    function test_accrual_partial_day() public {
        // Skip past early adopter period
        vm.warp(block.timestamp + 31 days);

        // Set deposit balance: 100 tokens
        points.updateDepositBalance(vault, user, DEPOSIT_AMOUNT);

        // Fast forward 12 hours (half a day)
        vm.warp(block.timestamp + 12 hours);

        points.accruePoints(vault, user);

        // 100 * 0.5 * 1 = 50 points
        assertEq(points.getPoints(user), 50, "Should earn 50 points for half a day");
    }

    function test_accrual_multiple_days() public {
        // Skip past early adopter period
        vm.warp(block.timestamp + 31 days);

        points.updateDepositBalance(vault, user, DEPOSIT_AMOUNT);

        // Fast forward 7 days
        vm.warp(block.timestamp + 7 days);

        points.accruePoints(vault, user);

        // 100 * 7 * 1 = 700 points
        assertEq(points.getPoints(user), 700, "Should earn 700 points for 7 days");
    }

    function test_accrual_zero_balance_no_points() public {
        // Set zero balance
        points.updateDepositBalance(vault, user, 0);

        vm.warp(block.timestamp + 1 days);

        points.accruePoints(vault, user);

        assertEq(points.getPoints(user), 0, "Should earn 0 points with zero balance");
    }

    // ============ Early Adopter Multiplier Tests ============

    function test_earlyAdopter_3x_multiplier() public {
        // We're within the first 30 days
        assertEq(points.getMultiplier(), 3, "Should be 3x during early adopter period");
    }

    function test_earlyAdopter_3x_at_boundary() public {
        // Warp to exactly 30 days
        vm.warp(points.deployedAt() + 30 days);
        assertEq(points.getMultiplier(), 3, "Should be 3x at exactly 30 days");
    }

    function test_multiplier_drops_to_1x_after_30days() public {
        // Warp past 30 days
        vm.warp(points.deployedAt() + 30 days + 1);
        assertEq(points.getMultiplier(), 1, "Should be 1x after 30 days");
    }

    function test_earlyAdopter_accrual_gives_3x_points() public {
        // Set deposit balance
        points.updateDepositBalance(vault, user, DEPOSIT_AMOUNT);

        // Fast forward 1 day (still in early adopter period)
        vm.warp(block.timestamp + 1 days);

        points.accruePoints(vault, user);

        // 100 tokens * 1 day * 3x = 300 points
        assertEq(points.depositPoints(user), 300, "Deposit points should be 300 with 3x multiplier");
    }

    // ============ Execution Bonus Tests ============

    function test_executionBonus() public {
        address[] memory depositors = new address[](2);
        depositors[0] = user;
        depositors[1] = user2;

        points.recordExecution(vault, depositors);

        assertEq(points.executionPoints(user), 50, "User should have 50 execution points");
        assertEq(points.executionPoints(user2), 50, "User2 should have 50 execution points");
        assertEq(points.getPoints(user), 50, "Total should include execution bonus");
        assertEq(points.getPoints(user2), 50, "Total should include execution bonus");
    }

    function test_executionBonus_multiple() public {
        address[] memory depositors = new address[](1);
        depositors[0] = user;

        points.recordExecution(vault, depositors);
        points.recordExecution(vault, depositors);

        assertEq(points.executionPoints(user), 100, "Should accumulate execution points");
    }

    function test_executionBonus_unauthorized_reverts() public {
        address[] memory depositors = new address[](1);
        depositors[0] = user;

        vm.prank(unauthorized);
        vm.expectRevert(PointsProgram.NotAuthorized.selector);
        points.recordExecution(vault, depositors);
    }

    function test_executionBonus_authorizedCaller() public {
        points.setAuthorizedCaller(unauthorized, true);

        address[] memory depositors = new address[](1);
        depositors[0] = user;

        vm.prank(unauthorized);
        points.recordExecution(vault, depositors);

        assertEq(points.executionPoints(user), 50);
    }

    // ============ Vault Validation Tests ============

    function test_accrue_invalidVault_reverts() public {
        address fakeVault = address(0xdead);

        vm.expectRevert(abi.encodeWithSelector(PointsProgram.InvalidVault.selector, fakeVault));
        points.accruePoints(fakeVault, user);
    }

    function test_updateBalance_invalidVault_reverts() public {
        address fakeVault = address(0xdead);

        vm.expectRevert(abi.encodeWithSelector(PointsProgram.InvalidVault.selector, fakeVault));
        points.updateDepositBalance(fakeVault, user, 100 ether);
    }

    function test_recordExecution_invalidVault_reverts() public {
        address fakeVault = address(0xdead);
        address[] memory depositors = new address[](1);
        depositors[0] = user;

        vm.expectRevert(abi.encodeWithSelector(PointsProgram.InvalidVault.selector, fakeVault));
        points.recordExecution(fakeVault, depositors);
    }

    // ============ Batch Accrual Tests ============

    function test_batchAccrue() public {
        // Skip past early adopter period
        vm.warp(block.timestamp + 31 days);

        points.updateDepositBalance(vault, user, DEPOSIT_AMOUNT);
        points.updateDepositBalance(vault2, user2, 200 ether);

        // Fast forward 1 day
        vm.warp(block.timestamp + 1 days);

        address[] memory vaults = new address[](2);
        vaults[0] = vault;
        vaults[1] = vault2;

        address[] memory users = new address[](2);
        users[0] = user;
        users[1] = user2;

        points.batchAccrue(vaults, users);

        assertEq(points.getPoints(user), 100, "User should have 100 points");
        assertEq(points.getPoints(user2), 200, "User2 should have 200 points");
    }

    function test_batchAccrue_lengthMismatch_reverts() public {
        address[] memory vaults = new address[](2);
        vaults[0] = vault;
        vaults[1] = vault2;

        address[] memory users = new address[](1);
        users[0] = user;

        vm.expectRevert(PointsProgram.ArrayLengthMismatch.selector);
        points.batchAccrue(vaults, users);
    }

    // ============ Referral Tests ============

    function test_referralBonus() public {
        // Skip past early adopter period
        vm.warp(block.timestamp + 31 days);

        // L-14 fix: setReferrer requires msg.sender == user
        vm.prank(user);
        points.setReferrer(user, referrer);

        // Set deposit balance
        points.updateDepositBalance(vault, user, DEPOSIT_AMOUNT);

        // Fast forward 1 day
        vm.warp(block.timestamp + 1 days);

        points.accruePoints(vault, user);

        // User: 100 points
        // Referrer: 10% of 100 = 10 points
        assertEq(points.getPoints(user), 100, "User should have 100 points");
        assertEq(points.referralBonusPoints(referrer), 10, "Referrer should have 10 referral bonus points");
        assertEq(points.getPoints(referrer), 10, "Referrer total should be 10");
    }

    function test_referral_selfReferral_reverts() public {
        vm.prank(user);
        vm.expectRevert(PointsProgram.SelfReferral.selector);
        points.setReferrer(user, user);
    }

    function test_referral_alreadyReferred_reverts() public {
        vm.prank(user);
        points.setReferrer(user, referrer);

        vm.prank(user);
        vm.expectRevert(PointsProgram.AlreadyReferred.selector);
        points.setReferrer(user, user2);
    }

    function test_referral_zeroAddress_reverts() public {
        vm.prank(user);
        vm.expectRevert(PointsProgram.ZeroAddress.selector);
        points.setReferrer(user, address(0));
    }

    // ============ Season End Tests ============

    function test_setSeasonEnd() public {
        uint256 futureTime = block.timestamp + 90 days;
        points.setSeasonEnd(futureTime);
        assertEq(points.seasonEnd(), futureTime);
    }

    function test_setSeasonEnd_zero_clears() public {
        points.setSeasonEnd(block.timestamp + 90 days);
        points.setSeasonEnd(0);
        assertEq(points.seasonEnd(), 0);
    }

    function test_setSeasonEnd_past_reverts() public {
        // Warp forward so block.timestamp - 1 is nonzero (default timestamp is 1)
        vm.warp(1000);
        vm.expectRevert(PointsProgram.InvalidSeasonEnd.selector);
        points.setSeasonEnd(block.timestamp - 1);
    }

    function test_setSeasonEnd_shortNotice_reverts() public {
        vm.warp(1000);
        // L-52 fix: setSeasonEnd now requires MIN_SEASON_NOTICE (24h) of lead time
        vm.expectRevert(bytes("notice too short"));
        points.setSeasonEnd(block.timestamp + 1 hours);
    }

    function test_setSeasonEnd_notOwner_reverts() public {
        vm.prank(unauthorized);
        vm.expectRevert(PointsProgram.NotOwner.selector);
        points.setSeasonEnd(block.timestamp + 90 days);
    }

    function test_accrual_afterSeasonEnd_clampsToSeasonEnd() public {
        // L-30 fix: accruePoints no longer reverts after season end; it clamps
        // the accrual window to seasonEnd so users can still collect their final
        // pro-rata points even if they call later.
        uint256 seasonDuration = 2 days;
        points.setSeasonEnd(block.timestamp + seasonDuration);
        points.updateDepositBalance(vault, user, DEPOSIT_AMOUNT);

        uint256 accrualStart = block.timestamp;
        uint256 sEnd = points.seasonEnd();

        // Warp far past season end
        vm.warp(block.timestamp + 10 days);

        points.accruePoints(vault, user);

        // Expected: accrual window is (sEnd - accrualStart) seconds
        // Multiplier is 3 (early adopter period still active).
        uint256 expectedElapsed = sEnd - accrualStart;
        uint256 multiplier = points.getMultiplier();
        uint256 expectedPoints =
            (DEPOSIT_AMOUNT * expectedElapsed * multiplier) / (1e18 * 86400);
        assertEq(points.getPoints(user), expectedPoints);
    }

    // ============ Points Breakdown Tests ============

    function test_pointsBreakdown() public {
        // Skip past early adopter period
        vm.warp(block.timestamp + 31 days);

        // L-14 fix: setReferrer requires msg.sender == user
        vm.prank(user);
        points.setReferrer(user, referrer);

        // Set deposit balance and accrue
        points.updateDepositBalance(vault, user, DEPOSIT_AMOUNT);
        vm.warp(block.timestamp + 1 days);
        points.accruePoints(vault, user);

        // Record execution
        address[] memory depositors = new address[](1);
        depositors[0] = user;
        points.recordExecution(vault, depositors);

        (uint256 deposit_, uint256 execution_, uint256 referral_, uint256 total_) =
            points.getPointsBreakdown(user);

        assertEq(deposit_, 100, "Deposit points should be 100");
        assertEq(execution_, 50, "Execution points should be 50");
        assertEq(referral_, 0, "User referral bonus should be 0 (referrer gets it)");
        assertEq(total_, 150, "Total should be 150");

        // Check referrer breakdown
        (uint256 rDeposit, uint256 rExec, uint256 rRef, uint256 rTotal) =
            points.getPointsBreakdown(referrer);

        assertEq(rDeposit, 0, "Referrer deposit points should be 0");
        assertEq(rExec, 0, "Referrer execution points should be 0");
        assertEq(rRef, 10, "Referrer referral bonus should be 10");
        assertEq(rTotal, 10, "Referrer total should be 10");
    }

    // ============ Pending Points Tests ============

    function test_pendingPoints() public {
        // Skip past early adopter period
        vm.warp(block.timestamp + 31 days);

        points.updateDepositBalance(vault, user, DEPOSIT_AMOUNT);

        // Fast forward 1 day
        vm.warp(block.timestamp + 1 days);

        uint256 pending = points.getPendingPoints(vault, user);
        assertEq(pending, 100, "Pending should be 100");

        // After accrual, pending should be 0
        points.accruePoints(vault, user);
        pending = points.getPendingPoints(vault, user);
        assertEq(pending, 0, "Pending should be 0 after accrual");
    }

    // ============ Daily Rate Tests ============

    function test_dailyRate() public {
        points.updateDepositBalance(vault, user, DEPOSIT_AMOUNT);

        // During early adopter: 100 * 3 = 300 per day
        uint256 rate = points.getDailyRate(vault, user);
        assertEq(rate, 300, "Daily rate should be 300 during early adopter period");

        // After early adopter: 100 * 1 = 100 per day
        vm.warp(block.timestamp + 31 days);
        rate = points.getDailyRate(vault, user);
        assertEq(rate, 100, "Daily rate should be 100 after early adopter period");
    }

    // ============ Ownership Tests ============

    function test_transferOwnership() public {
        points.transferOwnership(user);
        assertEq(points.owner(), user);
    }

    function test_transferOwnership_notOwner_reverts() public {
        vm.prank(unauthorized);
        vm.expectRevert(PointsProgram.NotOwner.selector);
        points.transferOwnership(user);
    }

    function test_transferOwnership_zeroAddress_reverts() public {
        vm.expectRevert(PointsProgram.ZeroAddress.selector);
        points.transferOwnership(address(0));
    }

    // ============ Multiple Vault Accrual Tests ============

    function test_multiVault_accrual() public {
        // Skip past early adopter period
        vm.warp(block.timestamp + 31 days);

        // User deposits in two vaults
        points.updateDepositBalance(vault, user, DEPOSIT_AMOUNT);
        points.updateDepositBalance(vault2, user, 200 ether);

        vm.warp(block.timestamp + 1 days);

        points.accruePoints(vault, user);
        points.accruePoints(vault2, user);

        // 100 + 200 = 300 points total
        assertEq(points.getPoints(user), 300, "Should accumulate from multiple vaults");
    }

    // ============ Balance Update Tests ============

    function test_updateBalance_accruePending_then_update() public {
        // Skip past early adopter period
        vm.warp(block.timestamp + 31 days);

        points.updateDepositBalance(vault, user, DEPOSIT_AMOUNT);

        // Wait 1 day
        vm.warp(block.timestamp + 1 days);

        // Update balance to 200 — should first accrue 100 points for the prior period
        points.updateDepositBalance(vault, user, 200 ether);

        assertEq(points.depositPoints(user), 100, "Should accrue pending before update");

        // Wait another day
        vm.warp(block.timestamp + 1 days);
        points.accruePoints(vault, user);

        // 100 (first day) + 200 (second day) = 300
        assertEq(points.depositPoints(user), 300, "Should accrue at new rate");
    }

    function test_updateBalance_unauthorized_reverts() public {
        vm.prank(unauthorized);
        vm.expectRevert(PointsProgram.NotAuthorized.selector);
        points.updateDepositBalance(vault, user, DEPOSIT_AMOUNT);
    }
}
