// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Test, console2 } from "forge-std/Test.sol";
import { WSTONBondManager } from "../src/WSTONBondManager.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";

/// @title WSTONBondManagerTest
/// @notice Comprehensive test suite for WSTONBondManager
contract WSTONBondManagerTest is Test {
    WSTONBondManager public bondManager;
    MockERC20 public mockWston;

    address public deployer = address(this);
    address public treasury = address(0xAAaA000000000000000000000000000000000001);
    address public mockVault = address(0xBbbb000000000000000000000000000000000002);
    address public operator = address(0xccCc000000000000000000000000000000000003);
    address public finder = address(0xddDD000000000000000000000000000000000004);
    address public unauthorized = address(0xEeEE000000000000000000000000000000000005);

    uint64 public constant NONCE_1 = 1;
    uint64 public constant NONCE_2 = 2;
    uint256 public constant MIN_BOND_FLOOR = 10 ether;

    function setUp() public {
        // Deploy MockWSTON (using MockERC20 with 18 decimals)
        mockWston = new MockERC20("Wrapped Staked TON", "WSTON", 18);

        // Deploy WSTONBondManager with WSTON token, treasury, owner, and min bond floor
        bondManager = new WSTONBondManager(address(mockWston), treasury, deployer, MIN_BOND_FLOOR);

        // Authorize the mock vault
        bondManager.authorizeVault(mockVault);

        // Mint WSTON to operator
        mockWston.mint(operator, 1000 ether);

        // Operator approves BondManager to spend WSTON
        vm.prank(operator);
        mockWston.approve(address(bondManager), type(uint256).max);
    }

    // ============ Constructor Tests ============

    function test_constructor_setsState() public view {
        assertEq(bondManager.owner(), deployer);
        assertEq(bondManager.treasury(), treasury);
        assertEq(bondManager.minBondFloor(), MIN_BOND_FLOOR);
        assertEq(bondManager.bondToken(), address(mockWston));
    }

    function test_constructor_zeroToken_reverts() public {
        vm.expectRevert(WSTONBondManager.ZeroToken.selector);
        new WSTONBondManager(address(0), treasury, deployer, MIN_BOND_FLOOR);
    }

    function test_constructor_zeroTreasury_reverts() public {
        vm.expectRevert(WSTONBondManager.ZeroTreasury.selector);
        new WSTONBondManager(address(mockWston), address(0), deployer, MIN_BOND_FLOOR);
    }

    function test_constructor_zeroOwner_reverts() public {
        vm.expectRevert(WSTONBondManager.ZeroOwner.selector);
        new WSTONBondManager(address(mockWston), treasury, address(0), MIN_BOND_FLOOR);
    }

    // ============ Lock Bond Tests ============

    function test_lockBond_basic() public {
        uint256 bondAmount = 10 ether;

        vm.prank(mockVault);
        bondManager.lockBond(operator, mockVault, NONCE_1, bondAmount);

        // Verify storage
        (uint256 amount, uint256 lockedAt, WSTONBondManager.BondStatus status) =
            bondManager.bonds(operator, mockVault, NONCE_1);
        assertEq(amount, bondAmount);
        assertEq(lockedAt, block.timestamp);
        assertEq(uint8(status), uint8(WSTONBondManager.BondStatus.Locked));
        assertEq(bondManager.totalBonded(operator), bondAmount);
    }

    function test_lockBond_emitsEvent() public {
        uint256 bondAmount = 10 ether;

        vm.expectEmit(true, true, true, true);
        emit WSTONBondManager.BondLocked(operator, mockVault, NONCE_1, bondAmount);

        vm.prank(mockVault);
        bondManager.lockBond(operator, mockVault, NONCE_1, bondAmount);
    }

    function test_lockBond_unauthorizedVault_reverts() public {
        vm.prank(unauthorized);
        vm.expectRevert(
            abi.encodeWithSelector(WSTONBondManager.NotAuthorizedVault.selector, unauthorized)
        );
        bondManager.lockBond(operator, unauthorized, NONCE_1, 10 ether);
    }

    function test_lockBond_insufficientAllowance_reverts() public {
        // Revoke operator's approval
        vm.prank(operator);
        mockWston.approve(address(bondManager), 0);

        vm.prank(mockVault);
        vm.expectRevert(); // SafeERC20 will revert on insufficient allowance
        bondManager.lockBond(operator, mockVault, NONCE_1, 10 ether);
    }

    function test_lockBond_duplicateNonce_reverts() public {
        uint256 bondAmount = 10 ether;

        // First lock succeeds
        vm.prank(mockVault);
        bondManager.lockBond(operator, mockVault, NONCE_1, bondAmount);

        // Second lock with same nonce reverts
        vm.prank(mockVault);
        vm.expectRevert(
            abi.encodeWithSelector(
                WSTONBondManager.BondAlreadyExists.selector, operator, mockVault, NONCE_1
            )
        );
        bondManager.lockBond(operator, mockVault, NONCE_1, bondAmount);
    }

    function test_lockBond_zeroAmount_reverts() public {
        vm.prank(mockVault);
        vm.expectRevert(WSTONBondManager.ZeroBondAmount.selector);
        bondManager.lockBond(operator, mockVault, NONCE_1, 0);
    }

    // ============ Release Bond Tests ============

    function test_releaseBond_basic() public {
        uint256 bondAmount = 10 ether;

        // Lock bond first
        vm.prank(mockVault);
        bondManager.lockBond(operator, mockVault, NONCE_1, bondAmount);

        uint256 operatorBalanceBefore = mockWston.balanceOf(operator);

        // Release bond
        vm.prank(mockVault);
        bondManager.releaseBond(operator, mockVault, NONCE_1);

        // Verify WSTON returned to operator
        assertEq(mockWston.balanceOf(operator), operatorBalanceBefore + bondAmount);

        // Verify storage updated
        (uint256 amount,, WSTONBondManager.BondStatus status) =
            bondManager.bonds(operator, mockVault, NONCE_1);
        assertEq(amount, bondAmount);
        assertEq(uint8(status), uint8(WSTONBondManager.BondStatus.Released));
        assertEq(bondManager.totalBonded(operator), 0);
    }

    function test_releaseBond_notLocked_reverts() public {
        // No bond has been locked -- status is Empty
        vm.prank(mockVault);
        vm.expectRevert(
            abi.encodeWithSelector(
                WSTONBondManager.InvalidBondStatus.selector,
                operator,
                mockVault,
                NONCE_1,
                WSTONBondManager.BondStatus.Empty
            )
        );
        bondManager.releaseBond(operator, mockVault, NONCE_1);
    }

    function test_releaseBond_unauthorizedVault_reverts() public {
        // Lock bond
        vm.prank(mockVault);
        bondManager.lockBond(operator, mockVault, NONCE_1, 10 ether);

        // Unauthorized caller tries to release
        vm.prank(unauthorized);
        vm.expectRevert(
            abi.encodeWithSelector(WSTONBondManager.NotAuthorizedVault.selector, unauthorized)
        );
        bondManager.releaseBond(operator, mockVault, NONCE_1);
    }

    function test_releaseBond_doubleRelease_reverts() public {
        uint256 bondAmount = 10 ether;

        // Lock and release
        vm.prank(mockVault);
        bondManager.lockBond(operator, mockVault, NONCE_1, bondAmount);
        vm.prank(mockVault);
        bondManager.releaseBond(operator, mockVault, NONCE_1);

        // Second release fails -- status is Released, not Locked
        vm.prank(mockVault);
        vm.expectRevert(
            abi.encodeWithSelector(
                WSTONBondManager.InvalidBondStatus.selector,
                operator,
                mockVault,
                NONCE_1,
                WSTONBondManager.BondStatus.Released
            )
        );
        bondManager.releaseBond(operator, mockVault, NONCE_1);
    }

    function test_releaseBond_emitsEvent() public {
        uint256 bondAmount = 10 ether;

        vm.prank(mockVault);
        bondManager.lockBond(operator, mockVault, NONCE_1, bondAmount);

        vm.expectEmit(true, true, true, true);
        emit WSTONBondManager.BondReleased(operator, mockVault, NONCE_1, bondAmount);

        vm.prank(mockVault);
        bondManager.releaseBond(operator, mockVault, NONCE_1);
    }

    // ============ Slash Bond Tests ============

    function test_slashBond_distribution() public {
        uint256 bondAmount = 10 ether;

        // Lock bond
        vm.prank(mockVault);
        bondManager.lockBond(operator, mockVault, NONCE_1, bondAmount);

        uint256 finderBalanceBefore = mockWston.balanceOf(finder);
        uint256 vaultBalanceBefore = mockWston.balanceOf(mockVault);
        uint256 treasuryBalanceBefore = mockWston.balanceOf(treasury);

        // Slash with external finder
        vm.prank(mockVault);
        bondManager.slashBond(operator, mockVault, NONCE_1, finder);

        // Verify distribution: 10% finder, 80% vault, 10% treasury
        assertEq(mockWston.balanceOf(finder), finderBalanceBefore + 1 ether);
        assertEq(mockWston.balanceOf(mockVault), vaultBalanceBefore + 8 ether);
        assertEq(mockWston.balanceOf(treasury), treasuryBalanceBefore + 1 ether);

        // Verify storage updated
        (,, WSTONBondManager.BondStatus status) = bondManager.bonds(operator, mockVault, NONCE_1);
        assertEq(uint8(status), uint8(WSTONBondManager.BondStatus.Slashed));
        assertEq(bondManager.totalBonded(operator), 0);
    }

    function test_slashBond_selfSlash_noFinderFee() public {
        uint256 bondAmount = 10 ether;

        // Lock bond
        vm.prank(mockVault);
        bondManager.lockBond(operator, mockVault, NONCE_1, bondAmount);

        uint256 vaultBalanceBefore = mockWston.balanceOf(mockVault);
        uint256 treasuryBalanceBefore = mockWston.balanceOf(treasury);

        // Self-slash: slasher = address(0)
        vm.prank(mockVault);
        bondManager.slashBond(operator, mockVault, NONCE_1, address(0));

        // Verify distribution: 90% vault, 10% treasury
        assertEq(mockWston.balanceOf(mockVault), vaultBalanceBefore + 9 ether);
        assertEq(mockWston.balanceOf(treasury), treasuryBalanceBefore + 1 ether);
    }

    function test_slashBond_notLocked_reverts() public {
        // No bond locked
        vm.prank(mockVault);
        vm.expectRevert(
            abi.encodeWithSelector(
                WSTONBondManager.InvalidBondStatus.selector,
                operator,
                mockVault,
                NONCE_1,
                WSTONBondManager.BondStatus.Empty
            )
        );
        bondManager.slashBond(operator, mockVault, NONCE_1, finder);
    }

    function test_slashBond_doubleSlash_reverts() public {
        uint256 bondAmount = 10 ether;

        // Lock and slash
        vm.prank(mockVault);
        bondManager.lockBond(operator, mockVault, NONCE_1, bondAmount);
        vm.prank(mockVault);
        bondManager.slashBond(operator, mockVault, NONCE_1, finder);

        // Second slash fails -- status is Slashed, not Locked
        vm.prank(mockVault);
        vm.expectRevert(
            abi.encodeWithSelector(
                WSTONBondManager.InvalidBondStatus.selector,
                operator,
                mockVault,
                NONCE_1,
                WSTONBondManager.BondStatus.Slashed
            )
        );
        bondManager.slashBond(operator, mockVault, NONCE_1, finder);
    }

    function test_slashBond_unauthorizedVault_reverts() public {
        // Lock bond
        vm.prank(mockVault);
        bondManager.lockBond(operator, mockVault, NONCE_1, 10 ether);

        // Unauthorized caller
        vm.prank(unauthorized);
        vm.expectRevert(
            abi.encodeWithSelector(WSTONBondManager.NotAuthorizedVault.selector, unauthorized)
        );
        bondManager.slashBond(operator, mockVault, NONCE_1, finder);
    }

    function test_slashBond_emitsEvent() public {
        uint256 bondAmount = 10 ether;

        vm.prank(mockVault);
        bondManager.lockBond(operator, mockVault, NONCE_1, bondAmount);

        vm.expectEmit(true, true, true, true);
        emit WSTONBondManager.BondSlashed(operator, mockVault, NONCE_1, bondAmount, finder);

        vm.prank(mockVault);
        bondManager.slashBond(operator, mockVault, NONCE_1, finder);
    }

    // ============ View Function Tests ============

    function test_getMinBond_returnsFloor() public view {
        assertEq(bondManager.getMinBond(mockVault), MIN_BOND_FLOOR);
    }

    function test_getBondedAmount_tracksTotal() public {
        // Lock two bonds for the same operator
        vm.prank(mockVault);
        bondManager.lockBond(operator, mockVault, NONCE_1, 10 ether);
        vm.prank(mockVault);
        bondManager.lockBond(operator, mockVault, NONCE_2, 20 ether);

        assertEq(bondManager.getBondedAmount(operator), 30 ether);

        // Release one bond
        vm.prank(mockVault);
        bondManager.releaseBond(operator, mockVault, NONCE_1);

        assertEq(bondManager.getBondedAmount(operator), 20 ether);
    }

    function test_bondToken_returnsWSTON() public view {
        assertEq(bondManager.bondToken(), address(mockWston));
    }

    // ============ Owner Function Tests ============

    function test_setMinBondFloor_onlyOwner() public {
        // Owner can set
        bondManager.setMinBondFloor(20 ether);
        assertEq(bondManager.minBondFloor(), 20 ether);

        // Non-owner reverts
        vm.prank(unauthorized);
        vm.expectRevert(WSTONBondManager.NotOwner.selector);
        bondManager.setMinBondFloor(5 ether);
    }

    function test_setTreasury_onlyOwner() public {
        address newTreasury = address(0x9999000000000000000000000000000000000009);

        // Owner can set
        bondManager.setTreasury(newTreasury);
        assertEq(bondManager.treasury(), newTreasury);

        // Non-owner reverts
        vm.prank(unauthorized);
        vm.expectRevert(WSTONBondManager.NotOwner.selector);
        bondManager.setTreasury(newTreasury);
    }

    function test_setTreasury_zeroAddress_reverts() public {
        vm.expectRevert(WSTONBondManager.ZeroTreasury.selector);
        bondManager.setTreasury(address(0));
    }

    function test_authorizeVault_onlyOwner() public {
        address newVault = address(0x7777000000000000000000000000000000000007);

        // Owner can authorize
        bondManager.authorizeVault(newVault);
        assertTrue(bondManager.authorizedVaults(newVault));

        // Non-owner reverts
        vm.prank(unauthorized);
        vm.expectRevert(WSTONBondManager.NotOwner.selector);
        bondManager.authorizeVault(newVault);
    }

    function test_revokeVault_onlyOwner() public {
        // Revoke mockVault authorization
        bondManager.revokeVault(mockVault);
        assertFalse(bondManager.authorizedVaults(mockVault));

        // Non-owner reverts
        vm.prank(unauthorized);
        vm.expectRevert(WSTONBondManager.NotOwner.selector);
        bondManager.revokeVault(mockVault);
    }

    function test_transferOwnership() public {
        address newOwner = address(0x8888000000000000000000000000000000000008);

        bondManager.transferOwnership(newOwner);
        assertEq(bondManager.owner(), newOwner);

        // Old owner can no longer call
        vm.expectRevert(WSTONBondManager.NotOwner.selector);
        bondManager.setMinBondFloor(1 ether);
    }

    function test_transferOwnership_zeroAddress_reverts() public {
        vm.expectRevert(WSTONBondManager.ZeroOwner.selector);
        bondManager.transferOwnership(address(0));
    }

    // ============ Cross-Chain Bond Tests ============

    function test_lockBondDirect_basic() public {
        // Set relayer first (required)
        address relayer = address(0x6666000000000000000000000000000000000006);
        bondManager.setTrustedRelayer(relayer);

        uint256 bondAmount = 10 ether;
        vm.prank(operator);
        bondManager.lockBondDirect(mockVault, NONCE_1, bondAmount);

        (uint256 amount, uint256 lockedAt, WSTONBondManager.BondStatus status) =
            bondManager.bonds(operator, mockVault, NONCE_1);
        assertEq(amount, bondAmount);
        assertEq(lockedAt, block.timestamp);
        assertEq(uint8(status), uint8(WSTONBondManager.BondStatus.Locked));
        assertEq(bondManager.totalBonded(operator), bondAmount);
        assertEq(bondManager.totalLockedGlobal(), bondAmount);
    }

    function test_lockBondDirect_noRelayer_reverts() public {
        // trustedRelayer is address(0) by default
        vm.prank(operator);
        vm.expectRevert(WSTONBondManager.RelayerNotSet.selector);
        bondManager.lockBondDirect(mockVault, NONCE_1, 10 ether);
    }

    function test_releaseBondByRelayer() public {
        address relayer = address(0x6666000000000000000000000000000000000006);
        bondManager.setTrustedRelayer(relayer);

        uint256 bondAmount = 10 ether;
        vm.prank(operator);
        bondManager.lockBondDirect(mockVault, NONCE_1, bondAmount);

        uint256 operatorBefore = mockWston.balanceOf(operator);

        vm.prank(relayer);
        bondManager.releaseBondByRelayer(operator, mockVault, NONCE_1);

        assertEq(mockWston.balanceOf(operator), operatorBefore + bondAmount);
        assertEq(bondManager.totalLockedGlobal(), 0);
    }

    function test_slashBondByRelayer_allToTreasury() public {
        address relayer = address(0x6666000000000000000000000000000000000006);
        bondManager.setTrustedRelayer(relayer);

        uint256 bondAmount = 10 ether;
        vm.prank(operator);
        bondManager.lockBondDirect(mockVault, NONCE_1, bondAmount);

        uint256 treasuryBefore = mockWston.balanceOf(treasury);
        uint256 finderBefore = mockWston.balanceOf(finder);

        vm.prank(relayer);
        bondManager.slashBondByRelayer(operator, mockVault, NONCE_1, finder);

        // L-25 FIX: cross-chain slash now mirrors on-chain distribution —
        // 10% finder + 90% treasury (which internally holds the depositor share).
        uint256 expectedFinderShare =
            (bondAmount * bondManager.FINDER_FEE_BPS()) / bondManager.BPS_DENOMINATOR();
        assertEq(mockWston.balanceOf(finder) - finderBefore, expectedFinderShare);
        assertEq(
            mockWston.balanceOf(treasury) - treasuryBefore, bondAmount - expectedFinderShare
        );
        assertEq(bondManager.totalLockedGlobal(), 0);
    }

    function test_releaseBondByRelayer_notRelayer_reverts() public {
        address relayer = address(0x6666000000000000000000000000000000000006);
        bondManager.setTrustedRelayer(relayer);

        uint256 bondAmount = 10 ether;
        vm.prank(operator);
        bondManager.lockBondDirect(mockVault, NONCE_1, bondAmount);

        vm.prank(unauthorized);
        vm.expectRevert(
            abi.encodeWithSelector(WSTONBondManager.NotTrustedRelayer.selector, unauthorized)
        );
        bondManager.releaseBondByRelayer(operator, mockVault, NONCE_1);
    }

    // ============ Reclaim Expired Bond Tests ============

    function test_reclaimExpiredBond_afterExpiry() public {
        address relayer = address(0x6666000000000000000000000000000000000006);
        bondManager.setTrustedRelayer(relayer);

        uint256 bondAmount = 10 ether;
        vm.prank(operator);
        bondManager.lockBondDirect(mockVault, NONCE_1, bondAmount);

        uint256 operatorBefore = mockWston.balanceOf(operator);

        // Warp past BOND_EXPIRY (M-16: extended from 30 days to 90 days)
        vm.warp(block.timestamp + 90 days + 1);

        vm.prank(operator);
        bondManager.reclaimExpiredBond(mockVault, NONCE_1);

        assertEq(mockWston.balanceOf(operator), operatorBefore + bondAmount);
        assertEq(bondManager.totalLockedGlobal(), 0);
        assertEq(bondManager.totalBonded(operator), 0);

        (,, WSTONBondManager.BondStatus status) = bondManager.bonds(operator, mockVault, NONCE_1);
        assertEq(uint8(status), uint8(WSTONBondManager.BondStatus.Released));
    }

    function test_reclaimExpiredBond_beforeExpiry_reverts() public {
        address relayer = address(0x6666000000000000000000000000000000000006);
        bondManager.setTrustedRelayer(relayer);

        uint256 bondAmount = 10 ether;
        vm.prank(operator);
        bondManager.lockBondDirect(mockVault, NONCE_1, bondAmount);

        // Try before expiry
        vm.warp(block.timestamp + 15 days);

        vm.prank(operator);
        vm.expectRevert(); // BondNotExpired
        bondManager.reclaimExpiredBond(mockVault, NONCE_1);
    }

    function test_reclaimExpiredBond_afterVaultRevoked() public {
        // Lock bond via authorized vault
        uint256 bondAmount = 10 ether;
        vm.prank(mockVault);
        bondManager.lockBond(operator, mockVault, NONCE_1, bondAmount);

        // Revoke vault — bond is now stuck via normal paths
        bondManager.revokeVault(mockVault);

        // Verify normal release is blocked
        vm.prank(mockVault);
        vm.expectRevert(
            abi.encodeWithSelector(WSTONBondManager.NotAuthorizedVault.selector, mockVault)
        );
        bondManager.releaseBond(operator, mockVault, NONCE_1);

        // Warp past expiry and reclaim (M-16: extended to 90 days)
        vm.warp(block.timestamp + 90 days + 1);

        uint256 operatorBefore = mockWston.balanceOf(operator);
        vm.prank(operator);
        bondManager.reclaimExpiredBond(mockVault, NONCE_1);

        assertEq(mockWston.balanceOf(operator), operatorBefore + bondAmount);
    }

    // ============ Rescue Token Tests ============

    function test_rescueTokens_nonWSTON() public {
        MockERC20 otherToken = new MockERC20("Other", "OTH", 18);
        otherToken.mint(address(bondManager), 50 ether);

        address recipient = address(0x7777000000000000000000000000000000000007);
        bondManager.rescueTokens(address(otherToken), recipient, 50 ether);

        assertEq(otherToken.balanceOf(recipient), 50 ether);
    }

    function test_rescueTokens_excessWSTON() public {
        // Lock a bond (10 WSTON locked)
        vm.prank(mockVault);
        bondManager.lockBond(operator, mockVault, NONCE_1, 10 ether);

        // Accidentally send extra WSTON
        mockWston.mint(address(bondManager), 5 ether);

        // Can rescue the 5 excess
        address recipient = address(0x7777000000000000000000000000000000000007);
        bondManager.rescueTokens(address(mockWston), recipient, 5 ether);
        assertEq(mockWston.balanceOf(recipient), 5 ether);

        // Cannot rescue bonded WSTON
        vm.expectRevert(
            abi.encodeWithSelector(WSTONBondManager.InsufficientRescuableBalance.selector, 1, 0)
        );
        bondManager.rescueTokens(address(mockWston), recipient, 1);
    }

    // ============ Zero-Address Guard Tests ============

    function test_setTrustedRelayer_zeroAddress_clearsRelayer() public {
        // L-31 FIX: clearing to zero is now allowed so the owner can revoke
        // cross-chain lock permissions without deploying a dummy relayer.
        address realRelayer = address(0xBEEF);
        bondManager.setTrustedRelayer(realRelayer);
        assertEq(bondManager.trustedRelayer(), realRelayer);

        bondManager.setTrustedRelayer(address(0));
        assertEq(bondManager.trustedRelayer(), address(0));
    }

    // ============ Global Tracking Tests ============

    // ============ Batch Bond Tests ============

    function test_lockBondBatch_success() public {
        address relayer = address(0x6666000000000000000000000000000000000006);
        bondManager.setTrustedRelayer(relayer);

        address[] memory vaults = new address[](3);
        vaults[0] = mockVault;
        vaults[1] = mockVault;
        vaults[2] = mockVault;

        uint64[] memory nonces = new uint64[](3);
        nonces[0] = 10;
        nonces[1] = 11;
        nonces[2] = 12;

        // M-08: every batch amount must be >= minBondFloor (10 ether in tests)
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 10 ether;
        amounts[1] = 15 ether;
        amounts[2] = 20 ether;

        uint256 operatorBefore = mockWston.balanceOf(operator);

        vm.prank(operator);
        bondManager.lockBondBatch(vaults, nonces, amounts);

        // Verify all three bonds stored correctly
        (uint256 amount0, uint256 lockedAt0, WSTONBondManager.BondStatus status0) =
            bondManager.bonds(operator, mockVault, 10);
        assertEq(amount0, 10 ether);
        assertEq(lockedAt0, block.timestamp);
        assertEq(uint8(status0), uint8(WSTONBondManager.BondStatus.Locked));

        (uint256 amount1,, WSTONBondManager.BondStatus status1) =
            bondManager.bonds(operator, mockVault, 11);
        assertEq(amount1, 15 ether);
        assertEq(uint8(status1), uint8(WSTONBondManager.BondStatus.Locked));

        (uint256 amount2,, WSTONBondManager.BondStatus status2) =
            bondManager.bonds(operator, mockVault, 12);
        assertEq(amount2, 20 ether);
        assertEq(uint8(status2), uint8(WSTONBondManager.BondStatus.Locked));

        // Verify totals
        assertEq(bondManager.totalBonded(operator), 45 ether);
        assertEq(bondManager.totalLockedGlobal(), 45 ether);
        assertEq(mockWston.balanceOf(operator), operatorBefore - 45 ether);
    }

    function test_lockBondBatch_length_mismatch_reverts() public {
        address relayer = address(0x6666000000000000000000000000000000000006);
        bondManager.setTrustedRelayer(relayer);

        address[] memory vaults = new address[](2);
        vaults[0] = mockVault;
        vaults[1] = mockVault;

        uint64[] memory nonces = new uint64[](3);
        nonces[0] = 10;
        nonces[1] = 11;
        nonces[2] = 12;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 5 ether;
        amounts[1] = 10 ether;

        vm.prank(operator);
        vm.expectRevert("length mismatch");
        bondManager.lockBondBatch(vaults, nonces, amounts);
    }

    function test_lockBondBatch_empty_reverts() public {
        address relayer = address(0x6666000000000000000000000000000000000006);
        bondManager.setTrustedRelayer(relayer);

        address[] memory vaults = new address[](0);
        uint64[] memory nonces = new uint64[](0);
        uint256[] memory amounts = new uint256[](0);

        vm.prank(operator);
        vm.expectRevert("empty batch");
        bondManager.lockBondBatch(vaults, nonces, amounts);
    }

    function test_lockBondBatch_duplicate_nonce_reverts() public {
        address relayer = address(0x6666000000000000000000000000000000000006);
        bondManager.setTrustedRelayer(relayer);

        address[] memory vaults = new address[](2);
        vaults[0] = mockVault;
        vaults[1] = mockVault;

        uint64[] memory nonces = new uint64[](2);
        nonces[0] = 10;
        nonces[1] = 10; // duplicate

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 10 ether; // at minBondFloor
        amounts[1] = 10 ether;

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                WSTONBondManager.BondAlreadyExists.selector, operator, mockVault, uint64(10)
            )
        );
        bondManager.lockBondBatch(vaults, nonces, amounts);
    }

    // ============ getBondInfo / getOperatorBondCount Tests ============

    function test_getBondInfo_returns_correct_data() public {
        uint256 bondAmount = 10 ether;

        vm.prank(mockVault);
        bondManager.lockBond(operator, mockVault, NONCE_1, bondAmount);

        (uint256 amount, uint256 lockedAt, uint8 status) =
            bondManager.getBondInfo(operator, mockVault, NONCE_1);
        assertEq(amount, bondAmount);
        assertEq(lockedAt, block.timestamp);
        assertEq(status, uint8(WSTONBondManager.BondStatus.Locked));

        // Check empty bond returns zeros
        (uint256 emptyAmount, uint256 emptyLockedAt, uint8 emptyStatus) =
            bondManager.getBondInfo(operator, mockVault, NONCE_2);
        assertEq(emptyAmount, 0);
        assertEq(emptyLockedAt, 0);
        assertEq(emptyStatus, uint8(WSTONBondManager.BondStatus.Empty));
    }

    function test_getOperatorBondCount_returns_correct_count() public {
        // Lock two bonds at nonce 1 and 2
        vm.prank(mockVault);
        bondManager.lockBond(operator, mockVault, NONCE_1, 10 ether);
        vm.prank(mockVault);
        bondManager.lockBond(operator, mockVault, NONCE_2, 20 ether);

        // Query range 1..2
        (uint256 activeCount, uint256 totalLocked) =
            bondManager.getOperatorBondCount(operator, mockVault, NONCE_1, NONCE_2);
        assertEq(activeCount, 2);
        assertEq(totalLocked, 30 ether);

        // Release nonce 1
        vm.prank(mockVault);
        bondManager.releaseBond(operator, mockVault, NONCE_1);

        (uint256 activeCount2, uint256 totalLocked2) =
            bondManager.getOperatorBondCount(operator, mockVault, NONCE_1, NONCE_2);
        assertEq(activeCount2, 1);
        assertEq(totalLocked2, 20 ether);
    }

    // ============ Global Tracking Tests ============

    function test_totalLockedGlobal_tracksCorrectly() public {
        // Lock two bonds
        vm.prank(mockVault);
        bondManager.lockBond(operator, mockVault, NONCE_1, 10 ether);
        vm.prank(mockVault);
        bondManager.lockBond(operator, mockVault, NONCE_2, 20 ether);

        assertEq(bondManager.totalLockedGlobal(), 30 ether);

        // Release one
        vm.prank(mockVault);
        bondManager.releaseBond(operator, mockVault, NONCE_1);
        assertEq(bondManager.totalLockedGlobal(), 20 ether);

        // Slash the other
        vm.prank(mockVault);
        bondManager.slashBond(operator, mockVault, NONCE_2, finder);
        assertEq(bondManager.totalLockedGlobal(), 0);
    }
}
