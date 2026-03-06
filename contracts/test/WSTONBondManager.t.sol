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
        (,, WSTONBondManager.BondStatus status) =
            bondManager.bonds(operator, mockVault, NONCE_1);
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
}
