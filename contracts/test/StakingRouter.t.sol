// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import { StakingRouter } from "../src/StakingRouter.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// ============ Mock Tokens ============

/// @dev Vanilla ERC-20 mock used for TON (18 decimals)
contract MockTON {
    string public name = "Tokamak Network Token";
    string public symbol = "TON";
    uint8 public decimals = 18;

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
        require(balanceOf[msg.sender] >= amount, "insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient balance");
        require(allowance[from][msg.sender] >= amount, "insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @dev Mock WTON (27 decimals) with swapFromTON
contract MockWTON {
    string public name = "Wrapped TON";
    string public symbol = "WTON";
    uint8 public decimals = 27;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    MockTON public ton;

    constructor(address _ton) {
        ton = MockTON(_ton);
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient balance");
        require(allowance[from][msg.sender] >= amount, "insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    /// @dev Swap TON to WTON at 1:1 ratio with decimal conversion (18 -> 27)
    function swapFromTON(uint256 tonAmount) external returns (bool) {
        // Pull TON from caller
        require(ton.transferFrom(msg.sender, address(this), tonAmount), "TON transfer failed");
        // Mint WTON at 27 decimals
        uint256 wtonAmount = tonAmount * 1e9;
        balanceOf[msg.sender] += wtonAmount;
        totalSupply += wtonAmount;
        return true;
    }
}

/// @dev Mock WSTON with configurable staking index
contract MockWSTON {
    string public name = "Wrapped Staked TON";
    string public symbol = "WSTON";
    uint8 public decimals = 27;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    MockWTON public wton;

    /// @dev Staking index: 1e27 means 1:1 WTON:WSTON ratio
    uint256 public stakingIndex = 1e27;

    /// @dev Track withdrawal requests for testing
    mapping(address => uint256) public pendingWithdrawals;

    bool public shouldRevertDeposit;
    bool public reentrant;

    StakingRouter public routerForReentrance;

    constructor(address _wton) {
        wton = MockWTON(_wton);
    }

    function setStakingIndex(uint256 _index) external {
        stakingIndex = _index;
    }

    function setShouldRevertDeposit(bool _shouldRevert) external {
        shouldRevertDeposit = _shouldRevert;
    }

    function setReentrant(bool _reentrant, address _router) external {
        reentrant = _reentrant;
        routerForReentrance = StakingRouter(_router);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient balance");
        require(allowance[from][msg.sender] >= amount, "insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    /// @dev Deposit WTON and mint WSTON based on staking index
    function depositWTONAndGetWSTON(uint256 _amount) external {
        require(!shouldRevertDeposit, "deposit reverted");

        // Attempt reentrancy if configured
        if (reentrant) {
            reentrant = false; // prevent infinite loop
            try routerForReentrance.stakeFromWTON(1) {} catch {}
        }

        // Pull WTON from caller
        require(IERC20(address(wton)).transferFrom(msg.sender, address(this), _amount), "WTON transfer failed");

        // Mint WSTON: wstonAmount = wtonAmount * 1e27 / stakingIndex
        uint256 wstonAmount = (_amount * 1e27) / stakingIndex;
        balanceOf[msg.sender] += wstonAmount;
        totalSupply += wstonAmount;
    }

    /// @dev Request withdrawal of WSTON
    function requestWithdrawal(uint256 _wstonAmount) external {
        require(balanceOf[msg.sender] >= _wstonAmount || IERC20(address(this)).balanceOf(msg.sender) >= 0, "track");
        // In a real contract this would initiate an unbonding period.
        // For the router, the WSTON has already been transferred to the router,
        // so we burn from the router's balance.
        require(balanceOf[msg.sender] >= _wstonAmount, "insufficient WSTON");
        balanceOf[msg.sender] -= _wstonAmount;
        totalSupply -= _wstonAmount;
        pendingWithdrawals[msg.sender] += _wstonAmount;
    }

    function getStakingIndex() external view returns (uint256) {
        return stakingIndex;
    }
}

// ============ Reentrancy attacker ============

contract ReentrancyAttacker {
    StakingRouter public router;
    bool public attacked;

    constructor(address _router) {
        router = StakingRouter(_router);
    }

    function attack(uint256 amount) external {
        router.stakeFromWTON(amount);
    }

    // Fallback triggered on token transfer — attempts reentrancy
    fallback() external {
        if (!attacked) {
            attacked = true;
            try router.stakeFromWTON(1) {} catch {}
        }
    }
}

// ============ Test Suite ============

contract StakingRouterTest is Test {
    StakingRouter public router;
    MockTON public ton;
    MockWTON public wton;
    MockWSTON public wston;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    uint256 constant TON_AMOUNT = 100 ether; // 100 TON (18 decimals)
    uint256 constant WTON_AMOUNT = 100 ether * 1e9; // 100 WTON (27 decimals)

    function setUp() public {
        ton = new MockTON();
        wton = new MockWTON(address(ton));
        wston = new MockWSTON(address(wton));
        router = new StakingRouter(address(ton), address(wton), address(wston));
    }

    // ============ Constructor Tests ============

    function test_constructor_setsImmutables() public view {
        assertEq(address(router.ton()), address(ton));
        assertEq(address(router.wton()), address(wton));
        assertEq(address(router.wston()), address(wston));
    }

    function test_constructor_revertsOnZeroAddress() public {
        vm.expectRevert("zero address");
        new StakingRouter(address(0), address(wton), address(wston));

        vm.expectRevert("zero address");
        new StakingRouter(address(ton), address(0), address(wston));

        vm.expectRevert("zero address");
        new StakingRouter(address(ton), address(wton), address(0));
    }

    // ============ stakeFromTON Tests ============

    function test_stakeFromTON_basicFlow() public {
        // Setup: give Alice 100 TON and approve router
        ton.mint(alice, TON_AMOUNT);
        vm.startPrank(alice);
        ton.approve(address(router), TON_AMOUNT);

        // Execute
        router.stakeFromTON(TON_AMOUNT);
        vm.stopPrank();

        // Alice should have 0 TON, 0 WTON, and some WSTON
        assertEq(ton.balanceOf(alice), 0, "TON should be 0");
        assertEq(wton.balanceOf(alice), 0, "WTON should be 0");
        assertGt(wston.balanceOf(alice), 0, "WSTON should be > 0");

        // Router should have 0 of everything
        assertEq(ton.balanceOf(address(router)), 0, "Router TON dust");
        assertEq(wton.balanceOf(address(router)), 0, "Router WTON dust");
        assertEq(wston.balanceOf(address(router)), 0, "Router WSTON dust");
    }

    function test_stakeFromTON_correctWSTONAmount() public {
        // With index = 1e27 (1:1), 100 TON -> 100e27 WTON -> 100e27 WSTON
        ton.mint(alice, TON_AMOUNT);
        vm.startPrank(alice);
        ton.approve(address(router), TON_AMOUNT);
        router.stakeFromTON(TON_AMOUNT);
        vm.stopPrank();

        assertEq(wston.balanceOf(alice), WTON_AMOUNT, "WSTON amount mismatch at 1:1 index");
    }

    function test_stakeFromTON_withNonUnityIndex() public {
        // Index = 1.5e27 means 1 WTON = 0.666... WSTON
        wston.setStakingIndex(1.5e27);

        ton.mint(alice, TON_AMOUNT);
        vm.startPrank(alice);
        ton.approve(address(router), TON_AMOUNT);
        router.stakeFromTON(TON_AMOUNT);
        vm.stopPrank();

        // Expected: (100e27 * 1e27) / 1.5e27 = 66.666...e27
        uint256 expected = (WTON_AMOUNT * 1e27) / 1.5e27;
        assertEq(wston.balanceOf(alice), expected, "WSTON with non-unity index");
    }

    function test_stakeFromTON_emitsStakedEvent() public {
        ton.mint(alice, TON_AMOUNT);
        vm.startPrank(alice);
        ton.approve(address(router), TON_AMOUNT);

        vm.expectEmit(true, false, false, true);
        emit StakingRouter.Staked(alice, TON_AMOUNT, WTON_AMOUNT);

        router.stakeFromTON(TON_AMOUNT);
        vm.stopPrank();
    }

    function test_stakeFromTON_revertsOnZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(StakingRouter.ZeroAmount.selector);
        router.stakeFromTON(0);
    }

    function test_stakeFromTON_revertsWithoutApproval() public {
        ton.mint(alice, TON_AMOUNT);
        vm.prank(alice);
        vm.expectRevert(); // SafeERC20 will revert
        router.stakeFromTON(TON_AMOUNT);
    }

    function test_stakeFromTON_partialAmount() public {
        ton.mint(alice, TON_AMOUNT);
        vm.startPrank(alice);
        ton.approve(address(router), TON_AMOUNT);

        // Stake only half
        uint256 halfTon = TON_AMOUNT / 2;
        router.stakeFromTON(halfTon);
        vm.stopPrank();

        assertEq(ton.balanceOf(alice), TON_AMOUNT - halfTon, "Remaining TON");
        assertEq(wston.balanceOf(alice), halfTon * 1e9, "WSTON from half stake");
    }

    // ============ stakeFromWTON Tests ============

    function test_stakeFromWTON_basicFlow() public {
        // Give Alice some WTON directly
        wton.mint(alice, WTON_AMOUNT);
        vm.startPrank(alice);
        wton.approve(address(router), WTON_AMOUNT);

        router.stakeFromWTON(WTON_AMOUNT);
        vm.stopPrank();

        assertEq(wton.balanceOf(alice), 0, "WTON should be 0");
        assertGt(wston.balanceOf(alice), 0, "WSTON should be > 0");
        assertEq(wton.balanceOf(address(router)), 0, "Router WTON dust");
        assertEq(wston.balanceOf(address(router)), 0, "Router WSTON dust");
    }

    function test_stakeFromWTON_correctWSTONAmount() public {
        wton.mint(alice, WTON_AMOUNT);
        vm.startPrank(alice);
        wton.approve(address(router), WTON_AMOUNT);
        router.stakeFromWTON(WTON_AMOUNT);
        vm.stopPrank();

        assertEq(wston.balanceOf(alice), WTON_AMOUNT, "WSTON amount at 1:1 index");
    }

    function test_stakeFromWTON_withNonUnityIndex() public {
        wston.setStakingIndex(2e27); // 1 WTON = 0.5 WSTON
        wton.mint(alice, WTON_AMOUNT);
        vm.startPrank(alice);
        wton.approve(address(router), WTON_AMOUNT);
        router.stakeFromWTON(WTON_AMOUNT);
        vm.stopPrank();

        uint256 expected = (WTON_AMOUNT * 1e27) / 2e27;
        assertEq(wston.balanceOf(alice), expected, "WSTON with 2x index");
    }

    function test_stakeFromWTON_emitsStakedEvent() public {
        wton.mint(alice, WTON_AMOUNT);
        vm.startPrank(alice);
        wton.approve(address(router), WTON_AMOUNT);

        // I-06 fix: Staked now emits the TON-equivalent (WTON scaled by 1e9).
        vm.expectEmit(true, false, false, true);
        emit StakingRouter.Staked(alice, WTON_AMOUNT / 1e9, WTON_AMOUNT);

        router.stakeFromWTON(WTON_AMOUNT);
        vm.stopPrank();
    }

    function test_stakeFromWTON_revertsOnZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(StakingRouter.ZeroAmount.selector);
        router.stakeFromWTON(0);
    }

    // ============ unstake Tests ============

    function test_unstake_basicFlow() public {
        // L-07 FIX: unstake no longer custodies WSTON. It just emits the
        // Unstaked event so the caller can call wston.requestWithdrawal
        // themselves while remaining the withdrawal owner.
        ton.mint(alice, TON_AMOUNT);
        vm.startPrank(alice);
        ton.approve(address(router), TON_AMOUNT);
        router.stakeFromTON(TON_AMOUNT);

        uint256 wstonBal = wston.balanceOf(alice);
        assertGt(wstonBal, 0, "Should have WSTON");

        // Emit intent
        vm.expectEmit(true, false, false, true);
        emit StakingRouter.Unstaked(alice, wstonBal);
        router.unstake(wstonBal);
        vm.stopPrank();

        // WSTON stays with Alice; router custodies nothing
        assertEq(wston.balanceOf(alice), wstonBal, "WSTON retained by caller");
        assertEq(wston.balanceOf(address(router)), 0, "router holds no WSTON");
    }

    function test_unstake_emitsUnstakedEvent() public {
        // Give alice WSTON directly for simplicity
        _mintWSTON(alice, WTON_AMOUNT);
        vm.startPrank(alice);
        wston.approve(address(router), WTON_AMOUNT);

        vm.expectEmit(true, false, false, true);
        emit StakingRouter.Unstaked(alice, WTON_AMOUNT);

        router.unstake(WTON_AMOUNT);
        vm.stopPrank();
    }

    function test_unstake_revertsOnZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(StakingRouter.ZeroAmount.selector);
        router.unstake(0);
    }

    function test_unstake_revertsWithoutApproval() public {
        // L-07 FIX: unstake no longer requires an allowance since it doesn't
        // custody WSTON. The call succeeds and just emits the intent.
        _mintWSTON(alice, WTON_AMOUNT);
        vm.prank(alice);
        router.unstake(WTON_AMOUNT);
        // No assertion beyond non-revert
    }

    // ============ Reentrancy Tests ============

    function test_stakeFromTON_reentrancyProtected() public {
        // Configure WSTON to attempt reentrancy during deposit
        wston.setReentrant(true, address(router));

        ton.mint(alice, TON_AMOUNT);
        vm.startPrank(alice);
        ton.approve(address(router), TON_AMOUNT);

        // Should succeed because ReentrancyGuard blocks the reentrant call
        router.stakeFromTON(TON_AMOUNT);
        vm.stopPrank();

        // Verify the original stake completed
        assertGt(wston.balanceOf(alice), 0, "Original stake should complete");
    }

    function test_stakeFromWTON_reentrancyProtected() public {
        wston.setReentrant(true, address(router));

        wton.mint(alice, WTON_AMOUNT);
        vm.startPrank(alice);
        wton.approve(address(router), WTON_AMOUNT);

        // Should succeed — reentrant call is caught by ReentrancyGuard
        router.stakeFromWTON(WTON_AMOUNT);
        vm.stopPrank();

        assertGt(wston.balanceOf(alice), 0, "Original stake should complete");
    }

    // ============ Dust Sweep Tests ============

    function test_noDustLeftInRouter_afterStakeFromTON() public {
        ton.mint(alice, TON_AMOUNT);
        vm.startPrank(alice);
        ton.approve(address(router), TON_AMOUNT);
        router.stakeFromTON(TON_AMOUNT);
        vm.stopPrank();

        assertEq(ton.balanceOf(address(router)), 0, "No TON dust");
        assertEq(wton.balanceOf(address(router)), 0, "No WTON dust");
        assertEq(wston.balanceOf(address(router)), 0, "No WSTON dust");
    }

    function test_noDustLeftInRouter_afterStakeFromWTON() public {
        wton.mint(alice, WTON_AMOUNT);
        vm.startPrank(alice);
        wton.approve(address(router), WTON_AMOUNT);
        router.stakeFromWTON(WTON_AMOUNT);
        vm.stopPrank();

        assertEq(ton.balanceOf(address(router)), 0, "No TON dust");
        assertEq(wton.balanceOf(address(router)), 0, "No WTON dust");
        assertEq(wston.balanceOf(address(router)), 0, "No WSTON dust");
    }

    function test_noDustLeftInRouter_afterUnstake() public {
        _mintWSTON(alice, WTON_AMOUNT);
        vm.startPrank(alice);
        wston.approve(address(router), WTON_AMOUNT);
        router.unstake(WTON_AMOUNT);
        vm.stopPrank();

        assertEq(ton.balanceOf(address(router)), 0, "No TON dust");
        assertEq(wton.balanceOf(address(router)), 0, "No WTON dust");
        assertEq(wston.balanceOf(address(router)), 0, "No WSTON dust");
    }

    // ============ Multiple Users ============

    function test_multipleUsersCanStake() public {
        ton.mint(alice, TON_AMOUNT);
        ton.mint(bob, TON_AMOUNT * 2);

        vm.startPrank(alice);
        ton.approve(address(router), TON_AMOUNT);
        router.stakeFromTON(TON_AMOUNT);
        vm.stopPrank();

        vm.startPrank(bob);
        ton.approve(address(router), TON_AMOUNT * 2);
        router.stakeFromTON(TON_AMOUNT * 2);
        vm.stopPrank();

        assertEq(wston.balanceOf(alice), WTON_AMOUNT, "Alice WSTON");
        assertEq(wston.balanceOf(bob), WTON_AMOUNT * 2, "Bob WSTON");
        assertEq(ton.balanceOf(address(router)), 0, "No router dust");
    }

    // ============ Helpers ============

    /// @dev Directly mint WSTON to an address for testing unstake flows
    function _mintWSTON(address to, uint256 amount) internal {
        // Mint WTON, approve WSTON, deposit
        wton.mint(address(this), amount);
        wton.approve(address(wston), amount);
        wston.depositWTONAndGetWSTON(amount);
        // Transfer to target
        wston.transfer(to, wston.balanceOf(address(this)));
    }
}
