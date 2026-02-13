// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {WSTONVault} from "../../src/core/WSTONVault.sol";

/**
 * @title MockERC20
 * @notice Minimal ERC20 mock for vault tests
 */
contract MockERC20 {
    string public name = "Mock WSTON";
    string public symbol = "mWSTON";
    uint8 public decimals = 27;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/**
 * @title WSTONVaultTest
 * @notice Unit tests for the WSTONVault contract
 */
contract WSTONVaultTest is Test {
    // ============ Contracts ============
    WSTONVault public vault;
    MockERC20 public wstonToken;

    // ============ Test Accounts ============
    address public admin = makeAddr("admin");
    address public treasury = makeAddr("treasury");
    address public slasher = makeAddr("slasher");
    address public operator1 = makeAddr("operator1");
    address public operator2 = makeAddr("operator2");
    address public unauthorized = makeAddr("unauthorized");

    // ============ Constants ============
    uint256 public constant WITHDRAWAL_DELAY = 100; // 100 blocks
    uint256 public constant MIN_LOCK = 100 ether;

    // ============ Setup ============

    function setUp() public {
        wstonToken = new MockERC20();

        vault = new WSTONVault(
            address(wstonToken),
            treasury,
            WITHDRAWAL_DELAY,
            MIN_LOCK,
            admin
        );

        // Grant SLASH_ROLE to slasher (must be called by admin)
        vm.startPrank(admin);
        vault.grantRole(vault.SLASH_ROLE(), slasher);
        vm.stopPrank();

        // Mint tokens to operators
        wstonToken.mint(operator1, 50_000 ether);
        wstonToken.mint(operator2, 5_000 ether);

        // Approve vault spending
        vm.prank(operator1);
        wstonToken.approve(address(vault), type(uint256).max);
        vm.prank(operator2);
        wstonToken.approve(address(vault), type(uint256).max);
    }

    // ============ Constructor Tests ============

    function test_Constructor() public view {
        assertEq(address(vault.wstonToken()), address(wstonToken));
        assertEq(vault.treasury(), treasury);
        assertEq(vault.withdrawalDelay(), WITHDRAWAL_DELAY);
        assertEq(vault.minLockAmount(), MIN_LOCK);
        assertTrue(vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(vault.hasRole(vault.SLASH_ROLE(), admin));
        assertTrue(vault.hasRole(vault.SLASH_ROLE(), slasher));
    }

    function test_Constructor_RevertOnZeroToken() public {
        vm.expectRevert(abi.encodeWithSignature("ZeroAddress()"));
        new WSTONVault(address(0), treasury, WITHDRAWAL_DELAY, MIN_LOCK, admin);
    }

    function test_Constructor_RevertOnZeroTreasury() public {
        vm.expectRevert(abi.encodeWithSignature("ZeroAddress()"));
        new WSTONVault(address(wstonToken), address(0), WITHDRAWAL_DELAY, MIN_LOCK, admin);
    }

    function test_Constructor_RevertOnZeroAdmin() public {
        vm.expectRevert(abi.encodeWithSignature("ZeroAddress()"));
        new WSTONVault(address(wstonToken), treasury, WITHDRAWAL_DELAY, MIN_LOCK, address(0));
    }

    // ============ Lock Tests ============

    function test_Lock() public {
        vm.prank(operator1);
        vault.lock(1000 ether);

        assertEq(vault.lockedBalance(operator1), 1000 ether);
        assertEq(wstonToken.balanceOf(address(vault)), 1000 ether);
    }

    function test_Lock_MultipleLocks() public {
        vm.startPrank(operator1);
        vault.lock(1000 ether);
        vault.lock(500 ether);
        vm.stopPrank();

        assertEq(vault.lockedBalance(operator1), 1500 ether);
    }

    function test_Lock_EmitEvent() public {
        vm.expectEmit(true, false, false, true);
        emit WSTONVault.Locked(operator1, 1000 ether);

        vm.prank(operator1);
        vault.lock(1000 ether);
    }

    function test_Lock_RevertOnZeroAmount() public {
        vm.prank(operator1);
        vm.expectRevert(abi.encodeWithSignature("ZeroAmount()"));
        vault.lock(0);
    }

    function test_Lock_RevertOnBelowMinimum() public {
        vm.prank(operator1);
        vm.expectRevert(abi.encodeWithSignature("BelowMinLock(uint256,uint256)", 50 ether, MIN_LOCK));
        vault.lock(50 ether);
    }

    // ============ Unlock Request Tests ============

    function test_RequestUnlock() public {
        vm.prank(operator1);
        vault.lock(5000 ether);

        vm.prank(operator1);
        vault.requestUnlock(2000 ether);

        assertEq(vault.lockedBalance(operator1), 3000 ether);
        assertEq(vault.getWithdrawalRequestCount(operator1), 1);

        (uint256 amount, uint256 unlockBlock) = vault.getWithdrawalRequest(operator1, 0);
        assertEq(amount, 2000 ether);
        assertEq(unlockBlock, block.number + WITHDRAWAL_DELAY);
    }

    function test_RequestUnlock_Multiple() public {
        vm.prank(operator1);
        vault.lock(10_000 ether);

        vm.startPrank(operator1);
        vault.requestUnlock(2000 ether);
        vault.requestUnlock(3000 ether);
        vm.stopPrank();

        assertEq(vault.lockedBalance(operator1), 5000 ether);
        assertEq(vault.getWithdrawalRequestCount(operator1), 2);
    }

    function test_RequestUnlock_EmitEvent() public {
        vm.prank(operator1);
        vault.lock(5000 ether);

        uint256 expectedUnlockBlock = block.number + WITHDRAWAL_DELAY;
        vm.expectEmit(true, false, false, true);
        emit WSTONVault.UnlockRequested(operator1, 2000 ether, expectedUnlockBlock);

        vm.prank(operator1);
        vault.requestUnlock(2000 ether);
    }

    function test_RequestUnlock_RevertOnZero() public {
        vm.prank(operator1);
        vault.lock(5000 ether);

        vm.prank(operator1);
        vm.expectRevert(abi.encodeWithSignature("ZeroAmount()"));
        vault.requestUnlock(0);
    }

    function test_RequestUnlock_RevertOnInsufficientBalance() public {
        vm.prank(operator1);
        vault.lock(1000 ether);

        vm.prank(operator1);
        vm.expectRevert(
            abi.encodeWithSignature("InsufficientLockedBalance(uint256,uint256)", 2000 ether, 1000 ether)
        );
        vault.requestUnlock(2000 ether);
    }

    // ============ Process Unlock Tests ============

    function test_ProcessUnlock() public {
        vm.prank(operator1);
        vault.lock(5000 ether);

        vm.prank(operator1);
        vault.requestUnlock(2000 ether);

        // Advance blocks past delay
        vm.roll(block.number + WITHDRAWAL_DELAY + 1);

        uint256 balBefore = wstonToken.balanceOf(operator1);

        vm.prank(operator1);
        vault.processUnlock();

        assertEq(wstonToken.balanceOf(operator1) - balBefore, 2000 ether);
        assertEq(vault.getWithdrawalRequestCount(operator1), 0);
    }

    function test_ProcessUnlock_PartialReady() public {
        vm.prank(operator1);
        vault.lock(10_000 ether);

        vm.prank(operator1);
        vault.requestUnlock(2000 ether);

        vm.roll(block.number + 50);

        vm.prank(operator1);
        vault.requestUnlock(3000 ether);

        // Advance so only the first request is ready
        vm.roll(block.number + WITHDRAWAL_DELAY - 49);

        uint256 balBefore = wstonToken.balanceOf(operator1);

        vm.prank(operator1);
        vault.processUnlock();

        // Only first request (2000) should be processed
        assertEq(wstonToken.balanceOf(operator1) - balBefore, 2000 ether);
        // Second request still pending
        assertEq(vault.getWithdrawalRequestCount(operator1), 1);
    }

    function test_ProcessUnlock_RevertWhenNoReady() public {
        vm.prank(operator1);
        vault.lock(5000 ether);

        vm.prank(operator1);
        vault.requestUnlock(2000 ether);

        // Don't advance blocks
        vm.prank(operator1);
        vm.expectRevert(abi.encodeWithSignature("NoReadyWithdrawals()"));
        vault.processUnlock();
    }

    function test_ProcessUnlock_RevertWhenNoPendingRequests() public {
        vm.prank(operator1);
        vm.expectRevert(abi.encodeWithSignature("NoReadyWithdrawals()"));
        vault.processUnlock();
    }

    // ============ Slash Tests ============

    function test_Slash() public {
        vm.prank(operator1);
        vault.lock(5000 ether);

        vm.prank(slasher);
        vault.slash(operator1, 1000 ether);

        assertEq(vault.lockedBalance(operator1), 4000 ether);
        assertEq(wstonToken.balanceOf(treasury), 1000 ether);
    }

    function test_Slash_EmitEvent() public {
        vm.prank(operator1);
        vault.lock(5000 ether);

        vm.expectEmit(true, true, false, true);
        emit WSTONVault.Slashed(operator1, 1000 ether, treasury);

        vm.prank(slasher);
        vault.slash(operator1, 1000 ether);
    }

    function test_Slash_FullBalance() public {
        vm.prank(operator1);
        vault.lock(5000 ether);

        vm.prank(slasher);
        vault.slash(operator1, 5000 ether);

        assertEq(vault.lockedBalance(operator1), 0);
        assertEq(wstonToken.balanceOf(treasury), 5000 ether);
    }

    function test_Slash_RevertOnZero() public {
        vm.prank(operator1);
        vault.lock(5000 ether);

        vm.prank(slasher);
        vm.expectRevert(abi.encodeWithSignature("ZeroAmount()"));
        vault.slash(operator1, 0);
    }

    function test_Slash_RevertOnExceedsBalance() public {
        vm.prank(operator1);
        vault.lock(1000 ether);

        vm.prank(slasher);
        vm.expectRevert(
            abi.encodeWithSignature("SlashExceedsBalance(uint256,uint256)", 2000 ether, 1000 ether)
        );
        vault.slash(operator1, 2000 ether);
    }

    function test_Slash_RevertOnUnauthorized() public {
        vm.prank(operator1);
        vault.lock(5000 ether);

        vm.prank(unauthorized);
        vm.expectRevert();
        vault.slash(operator1, 1000 ether);
    }

    function test_Slash_AdminCanSlash() public {
        vm.prank(operator1);
        vault.lock(5000 ether);

        vm.prank(admin);
        vault.slash(operator1, 500 ether);

        assertEq(vault.lockedBalance(operator1), 4500 ether);
    }

    // ============ Tier Tests ============

    function test_GetOperatorTier_Unverified() public {
        vm.prank(operator2);
        vault.lock(500 ether);

        assertEq(uint256(vault.getOperatorTier(operator2)), uint256(WSTONVault.OperatorTier.UNVERIFIED));
        assertFalse(vault.isVerifiedOperator(operator2));
    }

    function test_GetOperatorTier_Verified() public {
        vm.prank(operator2);
        vault.lock(1000 ether);

        assertEq(uint256(vault.getOperatorTier(operator2)), uint256(WSTONVault.OperatorTier.VERIFIED));
        assertTrue(vault.isVerifiedOperator(operator2));
    }

    function test_GetOperatorTier_Premium() public {
        vm.prank(operator1);
        vault.lock(10_000 ether);

        assertEq(uint256(vault.getOperatorTier(operator1)), uint256(WSTONVault.OperatorTier.PREMIUM));
        assertTrue(vault.isVerifiedOperator(operator1));
    }

    function test_GetOperatorTier_DowngradeAfterSlash() public {
        vm.prank(operator1);
        vault.lock(1500 ether);

        assertTrue(vault.isVerifiedOperator(operator1));

        vm.prank(slasher);
        vault.slash(operator1, 600 ether);

        assertFalse(vault.isVerifiedOperator(operator1));
        assertEq(uint256(vault.getOperatorTier(operator1)), uint256(WSTONVault.OperatorTier.UNVERIFIED));
    }

    function test_GetOperatorTier_NoLock() public view {
        assertEq(uint256(vault.getOperatorTier(unauthorized)), uint256(WSTONVault.OperatorTier.UNVERIFIED));
        assertFalse(vault.isVerifiedOperator(unauthorized));
    }

    // ============ View Function Tests ============

    function test_GetLockedBalance() public {
        vm.prank(operator1);
        vault.lock(3000 ether);

        assertEq(vault.getLockedBalance(operator1), 3000 ether);
    }

    function test_GetReadyAmount() public {
        vm.prank(operator1);
        vault.lock(5000 ether);

        vm.prank(operator1);
        vault.requestUnlock(1000 ether);

        assertEq(vault.getReadyAmount(operator1), 0);

        vm.roll(block.number + WITHDRAWAL_DELAY + 1);

        assertEq(vault.getReadyAmount(operator1), 1000 ether);
    }

    function test_GetWithdrawalRequestCount() public {
        vm.prank(operator1);
        vault.lock(5000 ether);

        assertEq(vault.getWithdrawalRequestCount(operator1), 0);

        vm.startPrank(operator1);
        vault.requestUnlock(500 ether);
        vault.requestUnlock(500 ether);
        vm.stopPrank();

        assertEq(vault.getWithdrawalRequestCount(operator1), 2);
    }

    // ============ Admin Tests ============

    function test_SetTreasury() public {
        address newTreasury = makeAddr("newTreasury");

        vm.prank(admin);
        vault.setTreasury(newTreasury);

        assertEq(vault.treasury(), newTreasury);
    }

    function test_SetTreasury_RevertOnZero() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSignature("ZeroAddress()"));
        vault.setTreasury(address(0));
    }

    function test_SetTreasury_RevertOnUnauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        vault.setTreasury(makeAddr("new"));
    }

    function test_SetWithdrawalDelay() public {
        vm.prank(admin);
        vault.setWithdrawalDelay(200);

        assertEq(vault.withdrawalDelay(), 200);
    }

    function test_SetMinLockAmount() public {
        vm.prank(admin);
        vault.setMinLockAmount(200 ether);

        assertEq(vault.minLockAmount(), 200 ether);
    }

    function test_SetMinLockAmount_RevertOnUnauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        vault.setMinLockAmount(200 ether);
    }

    // ============ Fuzz Tests ============

    function testFuzz_Lock(uint256 amount) public {
        vm.assume(amount >= MIN_LOCK && amount <= 50_000 ether);

        vm.prank(operator1);
        vault.lock(amount);

        assertEq(vault.lockedBalance(operator1), amount);
    }

    function testFuzz_SlashPercentage(uint256 lockAmt, uint256 slashAmt) public {
        vm.assume(lockAmt >= MIN_LOCK && lockAmt <= 50_000 ether);
        vm.assume(slashAmt > 0 && slashAmt <= lockAmt);

        vm.prank(operator1);
        vault.lock(lockAmt);

        vm.prank(slasher);
        vault.slash(operator1, slashAmt);

        assertEq(vault.lockedBalance(operator1), lockAmt - slashAmt);
        assertEq(wstonToken.balanceOf(treasury), slashAmt);
    }

    function testFuzz_RequestUnlock(uint256 lockAmt, uint256 unlockAmt) public {
        vm.assume(lockAmt >= MIN_LOCK && lockAmt <= 50_000 ether);
        vm.assume(unlockAmt > 0 && unlockAmt <= lockAmt);

        vm.prank(operator1);
        vault.lock(lockAmt);

        vm.prank(operator1);
        vault.requestUnlock(unlockAmt);

        assertEq(vault.lockedBalance(operator1), lockAmt - unlockAmt);
        assertEq(vault.getWithdrawalRequestCount(operator1), 1);
    }

    // ============ Integration-style Tests ============

    function test_FullLifecycle() public {
        // 1. Operator locks
        vm.prank(operator1);
        vault.lock(5000 ether);
        assertTrue(vault.isVerifiedOperator(operator1));

        // 2. Operator gets slashed
        vm.prank(slasher);
        vault.slash(operator1, 500 ether);
        assertEq(vault.lockedBalance(operator1), 4500 ether);

        // 3. Operator requests unlock
        vm.prank(operator1);
        vault.requestUnlock(2000 ether);
        assertEq(vault.lockedBalance(operator1), 2500 ether);

        // 4. Wait and process
        vm.roll(block.number + WITHDRAWAL_DELAY + 1);

        uint256 balBefore = wstonToken.balanceOf(operator1);
        vm.prank(operator1);
        vault.processUnlock();

        assertEq(wstonToken.balanceOf(operator1) - balBefore, 2000 ether);
        assertEq(vault.lockedBalance(operator1), 2500 ether);
        assertTrue(vault.isVerifiedOperator(operator1));
    }

    function test_SlashAfterUnlockRequest_DoesNotAffectPending() public {
        vm.prank(operator1);
        vault.lock(5000 ether);

        // Request unlock for 2000
        vm.prank(operator1);
        vault.requestUnlock(2000 ether);
        // Locked = 3000, pending withdrawal = 2000

        // Slash remaining locked balance
        vm.prank(slasher);
        vault.slash(operator1, 1000 ether);
        // Locked = 2000 (3000 - 1000)

        assertEq(vault.lockedBalance(operator1), 2000 ether);

        // Pending withdrawal should still be claimable
        vm.roll(block.number + WITHDRAWAL_DELAY + 1);

        uint256 balBefore = wstonToken.balanceOf(operator1);
        vm.prank(operator1);
        vault.processUnlock();

        assertEq(wstonToken.balanceOf(operator1) - balBefore, 2000 ether);
    }
}
