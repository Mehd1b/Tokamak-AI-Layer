// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import { LidoAdapter } from "../src/adapters/LidoAdapter.sol";

// ============================================================================
// Mock Contracts
// ============================================================================

/// @notice Mock Lido (stETH) contract
contract MockLido {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function submit(address /* _referral */ ) external payable returns (uint256) {
        // 1:1 ETH → stETH for simplicity
        uint256 stETHAmount = msg.value;
        balanceOf[msg.sender] += stETHAmount;
        return stETHAmount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient stETH balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient stETH balance");
        require(allowance[from][msg.sender] >= amount, "insufficient stETH allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    /// @dev Test helper: mint stETH directly
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    /// @dev Test helper: burn stETH (simulate withdrawal queue consuming)
    function burn(address from, uint256 amount) external {
        balanceOf[from] -= amount;
    }
}

/// @notice Mock wstETH contract
contract MockWstETH {
    MockLido public stETH;
    mapping(address => uint256) public balanceOf;

    /// @dev Exchange rate: 1 wstETH = 1.1 stETH (simulates accrued rewards)
    uint256 public constant RATE_NUM = 10;
    uint256 public constant RATE_DEN = 11;

    constructor(address _stETH) {
        stETH = MockLido(_stETH);
    }

    function wrap(uint256 _stETHAmount) external returns (uint256) {
        // Pull stETH from caller
        stETH.transferFrom(msg.sender, address(this), _stETHAmount);
        // Mint wstETH at exchange rate
        uint256 wstETHAmount = (_stETHAmount * RATE_NUM) / RATE_DEN;
        balanceOf[msg.sender] += wstETHAmount;
        return wstETHAmount;
    }

    function unwrap(uint256 _wstETHAmount) external returns (uint256) {
        require(balanceOf[msg.sender] >= _wstETHAmount, "insufficient wstETH");
        balanceOf[msg.sender] -= _wstETHAmount;
        // Return stETH at exchange rate
        uint256 stETHAmount = (_wstETHAmount * RATE_DEN) / RATE_NUM;
        stETH.transfer(msg.sender, stETHAmount);
        return stETHAmount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient wstETH");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    /// @dev Test helper: mint wstETH directly
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }
}

/// @notice Mock WithdrawalQueue contract
contract MockWithdrawalQueue {
    MockLido public stETH;
    uint256 public nextRequestId = 1;

    struct WithdrawalRequest {
        uint256 amount;
        address owner;
        bool claimed;
    }

    mapping(uint256 => WithdrawalRequest) public requests;

    constructor(address _stETH) {
        stETH = MockLido(_stETH);
    }

    function requestWithdrawals(uint256[] calldata _amounts, address _owner)
        external
        returns (uint256[] memory requestIds)
    {
        requestIds = new uint256[](_amounts.length);
        for (uint256 i = 0; i < _amounts.length; i++) {
            uint256 id = nextRequestId++;
            // Pull stETH from caller
            stETH.transferFrom(msg.sender, address(this), _amounts[i]);
            requests[id] = WithdrawalRequest({ amount: _amounts[i], owner: _owner, claimed: false });
            requestIds[i] = id;
        }
        return requestIds;
    }

    function claimWithdrawal(uint256 _requestId) external {
        WithdrawalRequest storage req = requests[_requestId];
        require(!req.claimed, "already claimed");
        require(req.owner == msg.sender, "not owner");
        req.claimed = true;
        // Burn stETH and send ETH
        stETH.burn(address(this), req.amount);
        (bool success,) = msg.sender.call{ value: req.amount }("");
        require(success, "ETH transfer failed");
    }

    /// @dev Test helper: fund the queue with ETH for claim payouts
    receive() external payable { }
}

/// @notice Mock VaultFactory with configurable isDeployedVault
contract MockVaultFactory {
    mapping(address => bool) public isDeployedVault;

    function setDeployedVault(address vault, bool deployed) external {
        isDeployedVault[vault] = deployed;
    }
}

/// @notice Mock KernelVault that exposes owner and can call adapter functions
contract MockKernelVault {
    address public immutable owner;

    constructor(address _owner) {
        owner = _owner;
    }

    function callStakeETH(address adapter) external payable {
        LidoAdapter(payable(adapter)).stakeETH{ value: msg.value }();
    }

    function callWrapToWstETH(address adapter, uint256 amount) external {
        LidoAdapter(payable(adapter)).wrapToWstETH(amount);
    }

    function callUnwrapFromWstETH(address adapter, uint256 amount) external {
        LidoAdapter(payable(adapter)).unwrapFromWstETH(amount);
    }

    function callRequestWithdrawal(address adapter, uint256[] calldata amounts) external {
        LidoAdapter(payable(adapter)).requestWithdrawal(amounts);
    }

    function callClaimWithdrawal(address adapter, uint256 requestId) external {
        LidoAdapter(payable(adapter)).claimWithdrawal(requestId);
    }

    function callWithdrawToVault(address adapter) external {
        LidoAdapter(payable(adapter)).withdrawToVault();
    }

    receive() external payable { }
}

// ============================================================================
// Test Contract
// ============================================================================

contract LidoAdapterTest is Test {
    LidoAdapter public adapter;
    MockLido public lidoMock;
    MockWstETH public wstETHMock;
    MockWithdrawalQueue public withdrawalQueueMock;
    MockVaultFactory public factory;

    MockKernelVault public vaultA;
    MockKernelVault public vaultB;
    address public ownerA;
    address public ownerB;
    address public nonOwner;

    function setUp() public {
        ownerA = address(0xA001);
        ownerB = address(0xB001);
        nonOwner = address(0xDEAD);

        // Deploy mocks
        lidoMock = new MockLido();
        wstETHMock = new MockWstETH(address(lidoMock));
        withdrawalQueueMock = new MockWithdrawalQueue(address(lidoMock));
        factory = new MockVaultFactory();

        // Deploy mock vaults
        vaultA = new MockKernelVault(ownerA);
        vaultB = new MockKernelVault(ownerB);

        // Register vaults in factory
        factory.setDeployedVault(address(vaultA), true);
        factory.setDeployedVault(address(vaultB), true);

        // Deploy adapter
        adapter = new LidoAdapter(
            address(lidoMock), address(wstETHMock), address(withdrawalQueueMock), address(factory)
        );

        // Fund vaults with ETH
        vm.deal(address(vaultA), 100 ether);
        vm.deal(address(vaultB), 50 ether);

        // Fund the withdrawal queue with ETH for claim payouts
        vm.deal(address(withdrawalQueueMock), 1000 ether);

        // Mint stETH to wstETH contract for unwrap operations
        lidoMock.mint(address(wstETHMock), 1000 ether);
    }

    // ============ Helper Functions ============

    function _registerVaultA() internal {
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));
    }

    function _registerVaultB() internal {
        vm.prank(ownerB);
        adapter.registerVault(address(vaultB));
    }

    // ============ Constructor ============

    function test_constructorSetsImmutables() public view {
        assertEq(adapter.lido(), address(lidoMock));
        assertEq(adapter.wstETH(), address(wstETHMock));
        assertEq(adapter.withdrawalQueue(), address(withdrawalQueueMock));
        assertEq(adapter.vaultFactory(), address(factory));
    }

    function test_constructorRevertsOnZeroLido() public {
        vm.expectRevert(LidoAdapter.ZeroAddress.selector);
        new LidoAdapter(address(0), address(wstETHMock), address(withdrawalQueueMock), address(factory));
    }

    function test_constructorRevertsOnZeroWstETH() public {
        vm.expectRevert(LidoAdapter.ZeroAddress.selector);
        new LidoAdapter(address(lidoMock), address(0), address(withdrawalQueueMock), address(factory));
    }

    function test_constructorRevertsOnZeroWithdrawalQueue() public {
        vm.expectRevert(LidoAdapter.ZeroAddress.selector);
        new LidoAdapter(address(lidoMock), address(wstETHMock), address(0), address(factory));
    }

    function test_constructorRevertsOnZeroFactory() public {
        vm.expectRevert(LidoAdapter.ZeroAddress.selector);
        new LidoAdapter(address(lidoMock), address(wstETHMock), address(withdrawalQueueMock), address(0));
    }

    // ============ Registration ============

    function test_registerVault_succeeds() public {
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));

        assertTrue(adapter.isRegistered(address(vaultA)));
    }

    function test_registerVault_emitsEvent() public {
        vm.expectEmit(true, false, false, false);
        emit LidoAdapter.VaultRegistered(address(vaultA));
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));
    }

    function test_registerVault_revertsIfNotOwner() public {
        vm.prank(nonOwner);
        vm.expectRevert(LidoAdapter.NotVaultOwner.selector);
        adapter.registerVault(address(vaultA));
    }

    function test_registerVault_revertsIfAlreadyRegistered() public {
        _registerVaultA();

        vm.prank(ownerA);
        vm.expectRevert(LidoAdapter.VaultAlreadyRegistered.selector);
        adapter.registerVault(address(vaultA));
    }

    function test_registerVault_revertsIfNotFactoryVault() public {
        MockKernelVault fakeVault = new MockKernelVault(ownerA);
        // NOT registered in factory

        vm.prank(ownerA);
        vm.expectRevert(LidoAdapter.VaultNotDeployedByFactory.selector);
        adapter.registerVault(address(fakeVault));
    }

    function test_registerVault_revertsOnZeroVault() public {
        vm.expectRevert(LidoAdapter.ZeroAddress.selector);
        adapter.registerVault(address(0));
    }

    // ============ stakeETH ============

    function test_stakeETH_succeeds() public {
        _registerVaultA();

        uint256 stakeAmount = 1 ether;
        vaultA.callStakeETH{ value: stakeAmount }(address(adapter));

        assertEq(adapter.vaultStETHBalance(address(vaultA)), stakeAmount);
        assertEq(lidoMock.balanceOf(address(adapter)), stakeAmount);
    }

    function test_stakeETH_emitsEvent() public {
        _registerVaultA();

        vm.expectEmit(true, false, false, true);
        emit LidoAdapter.ETHStaked(address(vaultA), 1 ether, 1 ether);
        vaultA.callStakeETH{ value: 1 ether }(address(adapter));
    }

    function test_stakeETH_revertsIfNotRegistered() public {
        vm.prank(address(vaultA));
        vm.expectRevert(LidoAdapter.VaultNotRegistered.selector);
        adapter.stakeETH{ value: 1 ether }();
    }

    function test_stakeETH_revertsIfBelowMinimum() public {
        _registerVaultA();

        uint256 tooSmall = 0.001 ether;
        vm.expectRevert(
            abi.encodeWithSelector(
                LidoAdapter.StakeAmountTooLow.selector, tooSmall, adapter.MIN_STAKE_AMOUNT()
            )
        );
        vaultA.callStakeETH{ value: tooSmall }(address(adapter));
    }

    function test_stakeETH_multipleDeposits() public {
        _registerVaultA();

        vaultA.callStakeETH{ value: 1 ether }(address(adapter));
        vaultA.callStakeETH{ value: 2 ether }(address(adapter));

        assertEq(adapter.vaultStETHBalance(address(vaultA)), 3 ether);
    }

    // ============ wrapToWstETH ============

    function test_wrapToWstETH_succeeds() public {
        _registerVaultA();

        // First stake to get stETH
        vaultA.callStakeETH{ value: 10 ether }(address(adapter));

        // Wrap 5 stETH → wstETH
        vaultA.callWrapToWstETH(address(adapter), 5 ether);

        // stETH balance should decrease
        assertEq(adapter.vaultStETHBalance(address(vaultA)), 5 ether);

        // wstETH balance should increase (at mock rate: 10/11)
        uint256 stethIn = 5 ether;
        uint256 expectedWstETH = (stethIn * 10) / 11;
        assertEq(adapter.vaultWstETHBalance(address(vaultA)), expectedWstETH);
    }

    function test_wrapToWstETH_emitsEvent() public {
        _registerVaultA();
        vaultA.callStakeETH{ value: 10 ether }(address(adapter));

        uint256 stethIn = 5 ether;
        uint256 expectedWstETH = (stethIn * 10) / 11;
        vm.expectEmit(true, false, false, true);
        emit LidoAdapter.StETHWrapped(address(vaultA), 5 ether, expectedWstETH);
        vaultA.callWrapToWstETH(address(adapter), 5 ether);
    }

    function test_wrapToWstETH_revertsIfInsufficientBalance() public {
        _registerVaultA();
        vaultA.callStakeETH{ value: 1 ether }(address(adapter));

        vm.prank(address(vaultA));
        vm.expectRevert(
            abi.encodeWithSelector(LidoAdapter.InsufficientStETHBalance.selector, 2 ether, 1 ether)
        );
        adapter.wrapToWstETH(2 ether);
    }

    function test_wrapToWstETH_revertsIfZeroAmount() public {
        _registerVaultA();

        vm.prank(address(vaultA));
        vm.expectRevert(
            abi.encodeWithSelector(LidoAdapter.InsufficientStETHBalance.selector, 0, 0)
        );
        adapter.wrapToWstETH(0);
    }

    function test_wrapToWstETH_revertsIfNotRegistered() public {
        vm.prank(address(vaultA));
        vm.expectRevert(LidoAdapter.VaultNotRegistered.selector);
        adapter.wrapToWstETH(1 ether);
    }

    // ============ unwrapFromWstETH ============

    function test_unwrapFromWstETH_succeeds() public {
        _registerVaultA();

        // Stake → wrap
        vaultA.callStakeETH{ value: 10 ether }(address(adapter));
        vaultA.callWrapToWstETH(address(adapter), 10 ether);

        uint256 wstETHBalance = adapter.vaultWstETHBalance(address(vaultA));
        assertTrue(wstETHBalance > 0, "Should have wstETH");

        // Unwrap all wstETH
        vaultA.callUnwrapFromWstETH(address(adapter), wstETHBalance);

        assertEq(adapter.vaultWstETHBalance(address(vaultA)), 0);
        assertTrue(adapter.vaultStETHBalance(address(vaultA)) > 0, "Should have stETH back");
    }

    function test_unwrapFromWstETH_emitsEvent() public {
        _registerVaultA();
        vaultA.callStakeETH{ value: 10 ether }(address(adapter));
        vaultA.callWrapToWstETH(address(adapter), 10 ether);

        uint256 wstETHBalance = adapter.vaultWstETHBalance(address(vaultA));
        uint256 expectedStETH = (wstETHBalance * 11) / 10;

        vm.expectEmit(true, false, false, true);
        emit LidoAdapter.WstETHUnwrapped(address(vaultA), wstETHBalance, expectedStETH);
        vaultA.callUnwrapFromWstETH(address(adapter), wstETHBalance);
    }

    function test_unwrapFromWstETH_revertsIfInsufficientBalance() public {
        _registerVaultA();

        vm.prank(address(vaultA));
        vm.expectRevert(
            abi.encodeWithSelector(LidoAdapter.InsufficientWstETHBalance.selector, 1 ether, 0)
        );
        adapter.unwrapFromWstETH(1 ether);
    }

    function test_unwrapFromWstETH_revertsIfZeroAmount() public {
        _registerVaultA();

        vm.prank(address(vaultA));
        vm.expectRevert(
            abi.encodeWithSelector(LidoAdapter.InsufficientWstETHBalance.selector, 0, 0)
        );
        adapter.unwrapFromWstETH(0);
    }

    function test_unwrapFromWstETH_revertsIfNotRegistered() public {
        vm.prank(address(vaultA));
        vm.expectRevert(LidoAdapter.VaultNotRegistered.selector);
        adapter.unwrapFromWstETH(1 ether);
    }

    // ============ Wrap/Unwrap Cycle ============

    function test_wrapUnwrapCycle_roundTrip() public {
        _registerVaultA();

        // Stake 10 ETH
        vaultA.callStakeETH{ value: 10 ether }(address(adapter));
        uint256 initialStETH = adapter.vaultStETHBalance(address(vaultA));
        assertEq(initialStETH, 10 ether);

        // Wrap all stETH → wstETH
        vaultA.callWrapToWstETH(address(adapter), 10 ether);
        assertEq(adapter.vaultStETHBalance(address(vaultA)), 0);
        uint256 wstETHAmount = adapter.vaultWstETHBalance(address(vaultA));
        assertTrue(wstETHAmount > 0);

        // Unwrap all wstETH → stETH
        vaultA.callUnwrapFromWstETH(address(adapter), wstETHAmount);
        assertEq(adapter.vaultWstETHBalance(address(vaultA)), 0);

        // stETH should be back (may differ slightly due to rounding)
        uint256 finalStETH = adapter.vaultStETHBalance(address(vaultA));
        assertTrue(finalStETH > 0, "Should have stETH after round trip");
        // Allow 1 wei rounding tolerance
        assertApproxEqAbs(finalStETH, initialStETH, 1, "Round-trip should preserve value");
    }

    // ============ requestWithdrawal ============

    function test_requestWithdrawal_singleAmount() public {
        _registerVaultA();
        vaultA.callStakeETH{ value: 10 ether }(address(adapter));

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 5 ether;

        vaultA.callRequestWithdrawal(address(adapter), amounts);

        // stETH balance should decrease
        assertEq(adapter.vaultStETHBalance(address(vaultA)), 5 ether);

        // Should have 1 pending request
        assertEq(adapter.getWithdrawalRequestCount(address(vaultA)), 1);
        uint256[] memory requestIds = adapter.getWithdrawalRequestIds(address(vaultA));
        assertEq(requestIds.length, 1);
        assertEq(requestIds[0], 1); // First request ID
    }

    function test_requestWithdrawal_multipleAmounts() public {
        _registerVaultA();
        vaultA.callStakeETH{ value: 10 ether }(address(adapter));

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 2 ether;
        amounts[1] = 3 ether;
        amounts[2] = 1 ether;

        vaultA.callRequestWithdrawal(address(adapter), amounts);

        assertEq(adapter.vaultStETHBalance(address(vaultA)), 4 ether); // 10 - 6
        assertEq(adapter.getWithdrawalRequestCount(address(vaultA)), 3);
    }

    function test_requestWithdrawal_emitsEvent() public {
        _registerVaultA();
        vaultA.callStakeETH{ value: 10 ether }(address(adapter));

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 5 ether;

        // We check that the event is emitted (exact requestIds depend on mock)
        vm.expectEmit(true, false, false, false);
        uint256[] memory expectedIds = new uint256[](1);
        expectedIds[0] = 1;
        emit LidoAdapter.WithdrawalRequested(address(vaultA), expectedIds, amounts);
        vaultA.callRequestWithdrawal(address(adapter), amounts);
    }

    function test_requestWithdrawal_revertsIfInsufficientBalance() public {
        _registerVaultA();
        vaultA.callStakeETH{ value: 1 ether }(address(adapter));

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 5 ether;

        vm.prank(address(vaultA));
        vm.expectRevert(
            abi.encodeWithSelector(LidoAdapter.InsufficientStETHBalance.selector, 5 ether, 1 ether)
        );
        adapter.requestWithdrawal(amounts);
    }

    function test_requestWithdrawal_revertsIfEmptyArray() public {
        _registerVaultA();

        uint256[] memory amounts = new uint256[](0);
        vm.prank(address(vaultA));
        vm.expectRevert(LidoAdapter.EmptyAmountsArray.selector);
        adapter.requestWithdrawal(amounts);
    }

    function test_requestWithdrawal_revertsIfNotRegistered() public {
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1 ether;

        vm.prank(address(vaultA));
        vm.expectRevert(LidoAdapter.VaultNotRegistered.selector);
        adapter.requestWithdrawal(amounts);
    }

    // ============ claimWithdrawal ============

    function test_claimWithdrawal_succeeds() public {
        _registerVaultA();
        vaultA.callStakeETH{ value: 10 ether }(address(adapter));

        // Request withdrawal
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 5 ether;
        vaultA.callRequestWithdrawal(address(adapter), amounts);

        uint256[] memory requestIds = adapter.getWithdrawalRequestIds(address(vaultA));
        uint256 requestId = requestIds[0];

        // Claim withdrawal
        uint256 vaultETHBefore = address(vaultA).balance;
        vaultA.callClaimWithdrawal(address(adapter), requestId);

        // Vault should receive ETH
        assertEq(address(vaultA).balance, vaultETHBefore + 5 ether);

        // Request should be removed from tracking
        assertEq(adapter.getWithdrawalRequestCount(address(vaultA)), 0);
    }

    function test_claimWithdrawal_emitsEvent() public {
        _registerVaultA();
        vaultA.callStakeETH{ value: 10 ether }(address(adapter));

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 5 ether;
        vaultA.callRequestWithdrawal(address(adapter), amounts);

        uint256[] memory requestIds = adapter.getWithdrawalRequestIds(address(vaultA));
        uint256 requestId = requestIds[0];

        vm.expectEmit(true, false, false, true);
        emit LidoAdapter.WithdrawalClaimed(address(vaultA), requestId, 5 ether);
        vaultA.callClaimWithdrawal(address(adapter), requestId);
    }

    function test_claimWithdrawal_revertsIfRequestNotFound() public {
        _registerVaultA();

        vm.prank(address(vaultA));
        vm.expectRevert("Request ID not found for vault");
        adapter.claimWithdrawal(999);
    }

    function test_claimWithdrawal_revertsIfNotRegistered() public {
        vm.prank(address(vaultA));
        vm.expectRevert(LidoAdapter.VaultNotRegistered.selector);
        adapter.claimWithdrawal(1);
    }

    function test_claimWithdrawal_multipleRequestsClaimOne() public {
        _registerVaultA();
        vaultA.callStakeETH{ value: 10 ether }(address(adapter));

        // Request two withdrawals
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 3 ether;
        amounts[1] = 4 ether;
        vaultA.callRequestWithdrawal(address(adapter), amounts);

        assertEq(adapter.getWithdrawalRequestCount(address(vaultA)), 2);

        // Claim the first one
        uint256[] memory requestIds = adapter.getWithdrawalRequestIds(address(vaultA));
        vaultA.callClaimWithdrawal(address(adapter), requestIds[0]);

        // Should have 1 remaining
        assertEq(adapter.getWithdrawalRequestCount(address(vaultA)), 1);
    }

    // ============ withdrawToVault (Emergency) ============

    function test_withdrawToVault_returnsStETH() public {
        _registerVaultA();
        vaultA.callStakeETH{ value: 5 ether }(address(adapter));

        // Emergency withdraw
        vaultA.callWithdrawToVault(address(adapter));

        // Adapter balances should be zero
        assertEq(adapter.vaultStETHBalance(address(vaultA)), 0);
        assertEq(adapter.vaultWstETHBalance(address(vaultA)), 0);

        // Vault should hold the stETH
        assertEq(lidoMock.balanceOf(address(vaultA)), 5 ether);
    }

    function test_withdrawToVault_returnsWstETH() public {
        _registerVaultA();
        vaultA.callStakeETH{ value: 10 ether }(address(adapter));
        vaultA.callWrapToWstETH(address(adapter), 10 ether);

        uint256 wstETHBalance = adapter.vaultWstETHBalance(address(vaultA));
        assertTrue(wstETHBalance > 0);

        vaultA.callWithdrawToVault(address(adapter));

        assertEq(adapter.vaultStETHBalance(address(vaultA)), 0);
        assertEq(adapter.vaultWstETHBalance(address(vaultA)), 0);
        assertEq(wstETHMock.balanceOf(address(vaultA)), wstETHBalance);
    }

    function test_withdrawToVault_returnsBothStETHAndWstETH() public {
        _registerVaultA();
        vaultA.callStakeETH{ value: 10 ether }(address(adapter));

        // Wrap half
        vaultA.callWrapToWstETH(address(adapter), 5 ether);

        uint256 stETHBal = adapter.vaultStETHBalance(address(vaultA));
        uint256 wstETHBal = adapter.vaultWstETHBalance(address(vaultA));
        assertTrue(stETHBal > 0 && wstETHBal > 0);

        vaultA.callWithdrawToVault(address(adapter));

        assertEq(adapter.vaultStETHBalance(address(vaultA)), 0);
        assertEq(adapter.vaultWstETHBalance(address(vaultA)), 0);
        assertEq(lidoMock.balanceOf(address(vaultA)), stETHBal);
        assertEq(wstETHMock.balanceOf(address(vaultA)), wstETHBal);
    }

    function test_withdrawToVault_emitsEvent() public {
        _registerVaultA();
        vaultA.callStakeETH{ value: 5 ether }(address(adapter));

        vm.expectEmit(true, false, false, true);
        emit LidoAdapter.EmergencyWithdraw(address(vaultA), 5 ether, 0, 0);
        vaultA.callWithdrawToVault(address(adapter));
    }

    function test_withdrawToVault_revertsIfNoBalance() public {
        _registerVaultA();

        vm.prank(address(vaultA));
        vm.expectRevert(LidoAdapter.NoBalanceToWithdraw.selector);
        adapter.withdrawToVault();
    }

    function test_withdrawToVault_revertsIfNotRegistered() public {
        vm.prank(address(vaultA));
        vm.expectRevert(LidoAdapter.VaultNotRegistered.selector);
        adapter.withdrawToVault();
    }

    // ============ Unauthorized Caller Rejection ============

    function test_unauthorized_stakeETH() public {
        vm.deal(nonOwner, 1 ether);
        vm.prank(nonOwner);
        vm.expectRevert(LidoAdapter.VaultNotRegistered.selector);
        adapter.stakeETH{ value: 1 ether }();
    }

    function test_unauthorized_wrapToWstETH() public {
        vm.prank(nonOwner);
        vm.expectRevert(LidoAdapter.VaultNotRegistered.selector);
        adapter.wrapToWstETH(1 ether);
    }

    function test_unauthorized_unwrapFromWstETH() public {
        vm.prank(nonOwner);
        vm.expectRevert(LidoAdapter.VaultNotRegistered.selector);
        adapter.unwrapFromWstETH(1 ether);
    }

    function test_unauthorized_requestWithdrawal() public {
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1 ether;
        vm.prank(nonOwner);
        vm.expectRevert(LidoAdapter.VaultNotRegistered.selector);
        adapter.requestWithdrawal(amounts);
    }

    function test_unauthorized_claimWithdrawal() public {
        vm.prank(nonOwner);
        vm.expectRevert(LidoAdapter.VaultNotRegistered.selector);
        adapter.claimWithdrawal(1);
    }

    function test_unauthorized_withdrawToVault() public {
        vm.prank(nonOwner);
        vm.expectRevert(LidoAdapter.VaultNotRegistered.selector);
        adapter.withdrawToVault();
    }

    // ============ Per-vault Balance Isolation ============

    function test_isolation_stakeETH_separateBalances() public {
        _registerVaultA();
        _registerVaultB();

        vaultA.callStakeETH{ value: 5 ether }(address(adapter));
        vaultB.callStakeETH{ value: 3 ether }(address(adapter));

        assertEq(adapter.vaultStETHBalance(address(vaultA)), 5 ether);
        assertEq(adapter.vaultStETHBalance(address(vaultB)), 3 ether);
    }

    function test_isolation_wrapToWstETH_separateBalances() public {
        _registerVaultA();
        _registerVaultB();

        vaultA.callStakeETH{ value: 10 ether }(address(adapter));
        vaultB.callStakeETH{ value: 6 ether }(address(adapter));

        vaultA.callWrapToWstETH(address(adapter), 5 ether);
        vaultB.callWrapToWstETH(address(adapter), 2 ether);

        // stETH balances
        assertEq(adapter.vaultStETHBalance(address(vaultA)), 5 ether);
        assertEq(adapter.vaultStETHBalance(address(vaultB)), 4 ether);

        // wstETH balances
        uint256 wrapAmountA = 5 ether;
        uint256 wrapAmountB = 2 ether;
        uint256 expectedWstA = (wrapAmountA * 10) / 11;
        uint256 expectedWstB = (wrapAmountB * 10) / 11;
        assertEq(adapter.vaultWstETHBalance(address(vaultA)), expectedWstA);
        assertEq(adapter.vaultWstETHBalance(address(vaultB)), expectedWstB);
    }

    function test_isolation_withdrawToVault_doesNotAffectOther() public {
        _registerVaultA();
        _registerVaultB();

        vaultA.callStakeETH{ value: 5 ether }(address(adapter));
        vaultB.callStakeETH{ value: 3 ether }(address(adapter));

        // Vault A withdraws everything
        vaultA.callWithdrawToVault(address(adapter));

        // Vault A should be empty
        assertEq(adapter.vaultStETHBalance(address(vaultA)), 0);

        // Vault B should be untouched
        assertEq(adapter.vaultStETHBalance(address(vaultB)), 3 ether);
    }

    function test_isolation_withdrawalRequests_perVault() public {
        _registerVaultA();
        _registerVaultB();

        vaultA.callStakeETH{ value: 10 ether }(address(adapter));
        vaultB.callStakeETH{ value: 10 ether }(address(adapter));

        // Vault A requests withdrawal
        uint256[] memory amountsA = new uint256[](1);
        amountsA[0] = 3 ether;
        vaultA.callRequestWithdrawal(address(adapter), amountsA);

        // Vault B requests withdrawal
        uint256[] memory amountsB = new uint256[](2);
        amountsB[0] = 1 ether;
        amountsB[1] = 2 ether;
        vaultB.callRequestWithdrawal(address(adapter), amountsB);

        // Each vault should have its own request IDs
        assertEq(adapter.getWithdrawalRequestCount(address(vaultA)), 1);
        assertEq(adapter.getWithdrawalRequestCount(address(vaultB)), 2);

        // Vault A's request IDs should not appear in vault B's
        uint256[] memory idsA = adapter.getWithdrawalRequestIds(address(vaultA));
        uint256[] memory idsB = adapter.getWithdrawalRequestIds(address(vaultB));
        for (uint256 i = 0; i < idsA.length; i++) {
            for (uint256 j = 0; j < idsB.length; j++) {
                assertTrue(idsA[i] != idsB[j], "Request IDs should not overlap");
            }
        }
    }

    function test_isolation_vaultACantClaimVaultBRequest() public {
        _registerVaultA();
        _registerVaultB();

        vaultB.callStakeETH{ value: 10 ether }(address(adapter));

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 5 ether;
        vaultB.callRequestWithdrawal(address(adapter), amounts);

        uint256[] memory idsB = adapter.getWithdrawalRequestIds(address(vaultB));

        // Vault A tries to claim vault B's request
        vm.prank(address(vaultA));
        vm.expectRevert("Request ID not found for vault");
        adapter.claimWithdrawal(idsB[0]);
    }

    // ============ View Functions ============

    function test_getWithdrawalRequestIds_returnsEmptyForUnregistered() public view {
        uint256[] memory ids = adapter.getWithdrawalRequestIds(address(0xBEEF));
        assertEq(ids.length, 0);
    }

    function test_getWithdrawalRequestCount_returnsZeroForUnregistered() public view {
        assertEq(adapter.getWithdrawalRequestCount(address(0xBEEF)), 0);
    }

    function test_isRegistered_returnsFalseForUnregistered() public view {
        assertFalse(adapter.isRegistered(address(vaultA)));
    }

    function test_vaultStETHBalance_returnsZeroForUnregistered() public view {
        assertEq(adapter.vaultStETHBalance(address(0xBEEF)), 0);
    }

    function test_vaultWstETHBalance_returnsZeroForUnregistered() public view {
        assertEq(adapter.vaultWstETHBalance(address(0xBEEF)), 0);
    }

    // ============ Full E2E Flow ============

    function test_e2e_stakeWrapUnwrapRequestClaim() public {
        _registerVaultA();

        // 1. Stake 10 ETH
        vaultA.callStakeETH{ value: 10 ether }(address(adapter));
        assertEq(adapter.vaultStETHBalance(address(vaultA)), 10 ether);

        // 2. Wrap 5 stETH → wstETH
        vaultA.callWrapToWstETH(address(adapter), 5 ether);
        assertEq(adapter.vaultStETHBalance(address(vaultA)), 5 ether);
        uint256 wstETHBal = adapter.vaultWstETHBalance(address(vaultA));
        assertTrue(wstETHBal > 0);

        // 3. Unwrap all wstETH → stETH
        vaultA.callUnwrapFromWstETH(address(adapter), wstETHBal);
        assertEq(adapter.vaultWstETHBalance(address(vaultA)), 0);
        uint256 totalStETH = adapter.vaultStETHBalance(address(vaultA));
        assertTrue(totalStETH > 0);

        // 4. Request withdrawal for half
        uint256 withdrawAmount = totalStETH / 2;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = withdrawAmount;
        vaultA.callRequestWithdrawal(address(adapter), amounts);
        assertEq(adapter.vaultStETHBalance(address(vaultA)), totalStETH - withdrawAmount);
        assertEq(adapter.getWithdrawalRequestCount(address(vaultA)), 1);

        // 5. Claim withdrawal
        uint256[] memory requestIds = adapter.getWithdrawalRequestIds(address(vaultA));
        uint256 ethBefore = address(vaultA).balance;
        vaultA.callClaimWithdrawal(address(adapter), requestIds[0]);
        assertEq(address(vaultA).balance, ethBefore + withdrawAmount);
        assertEq(adapter.getWithdrawalRequestCount(address(vaultA)), 0);
    }
}
