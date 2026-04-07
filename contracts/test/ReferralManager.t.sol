// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ReferralManager.sol";

contract ReferralManagerTest is Test {
    ReferralManager rm;
    address referrer = makeAddr("referrer");
    address depositor = makeAddr("depositor");

    function setUp() public {
        rm = new ReferralManager();
    }

    function test_recordReferral_USDC() public {
        // Register a code
        vm.prank(referrer);
        rm.registerCode("alice");
        bytes32 codeHash = rm.hashCode("alice");

        // 2000 USDC (6 decimals) → 2000 points
        uint256 amount = 2000e6;
        uint8 decimals = 6;

        rm.recordReferral(depositor, codeHash, amount, decimals);

        assertEq(rm.referralPoints(referrer), 2000);
        assertEq(rm.referralCount(referrer), 1);
        assertEq(rm.referredBy(depositor), referrer);
    }

    function test_recordReferral_WETH() public {
        vm.prank(referrer);
        rm.registerCode("bob");
        bytes32 codeHash = rm.hashCode("bob");

        // 3 WETH (18 decimals) → 3 points
        uint256 amount = 3 ether;
        uint8 decimals = 18;

        rm.recordReferral(depositor, codeHash, amount, decimals);

        assertEq(rm.referralPoints(referrer), 3);
    }

    function test_recordReferral_WBTC() public {
        vm.prank(referrer);
        rm.registerCode("charlie");
        bytes32 codeHash = rm.hashCode("charlie");

        // 1.5 WBTC (8 decimals) → 1 point (truncated)
        uint256 amount = 1.5e8;
        uint8 decimals = 8;

        rm.recordReferral(depositor, codeHash, amount, decimals);

        assertEq(rm.referralPoints(referrer), 1);
    }

    function test_recordReferral_subUnit_zeroPoints() public {
        vm.prank(referrer);
        rm.registerCode("dave");
        bytes32 codeHash = rm.hashCode("dave");

        // 0.5 USDC (6 decimals) → 0 points
        uint256 amount = 0.5e6;
        uint8 decimals = 6;

        rm.recordReferral(depositor, codeHash, amount, decimals);

        assertEq(rm.referralPoints(referrer), 0);
    }

    function test_recordReferral_emitsCorrectPoints() public {
        vm.prank(referrer);
        rm.registerCode("eve");
        bytes32 codeHash = rm.hashCode("eve");

        uint256 amount = 5000e6;
        uint8 decimals = 6;

        vm.expectEmit(true, true, true, true);
        emit ReferralManager.ReferralRecorded(depositor, referrer, codeHash, 5000);

        rm.recordReferral(depositor, codeHash, amount, decimals);
    }

    function test_revert_alreadyReferred() public {
        vm.prank(referrer);
        rm.registerCode("frank");
        bytes32 codeHash = rm.hashCode("frank");

        rm.recordReferral(depositor, codeHash, 1000e6, 6);

        vm.expectRevert(ReferralManager.AlreadyReferred.selector);
        rm.recordReferral(depositor, codeHash, 2000e6, 6);
    }

    function test_revert_selfReferral() public {
        vm.prank(referrer);
        rm.registerCode("grace");
        bytes32 codeHash = rm.hashCode("grace");

        vm.expectRevert(ReferralManager.SelfReferral.selector);
        rm.recordReferral(referrer, codeHash, 1000e6, 6);
    }
}
