// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import { HyperliquidAdapter } from "../src/adapters/HyperliquidAdapter.sol";
import { TradingSubAccount } from "../src/adapters/TradingSubAccount.sol";
import { IHyperliquidAdapter } from "../src/interfaces/IHyperliquidAdapter.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// ============================================================================
// Mock Contracts
// ============================================================================

/// @notice Mock ERC20 token (USDC) for testing
contract MockUSDC {
    string public name = "USD Coin";
    uint8 public decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
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

/// @notice Mock CoreWriter that records calls for assertion
contract MockCoreWriter {
    struct ActionCall {
        bytes data;
    }

    ActionCall[] public calls;

    function sendRawAction(bytes calldata data) external {
        calls.push(ActionCall(data));
    }

    function callCount() external view returns (uint256) {
        return calls.length;
    }

    function getCall(uint256 index) external view returns (bytes memory) {
        return calls[index].data;
    }

    function lastCallData() external view returns (bytes memory) {
        return calls[calls.length - 1].data;
    }
}

/// @notice Mock CoreDepositWallet that records deposits
contract MockCoreDepositWallet {
    struct DepositCall {
        uint256 amount;
        uint32 destinationDex;
    }

    DepositCall[] public deposits;
    IERC20 public usdc;

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    function deposit(uint256 amount, uint32 destinationDex) external {
        // Simulate pulling USDC (sub-account approved us)
        usdc.transferFrom(msg.sender, address(this), amount);
        deposits.push(DepositCall(amount, destinationDex));
    }

    function depositCount() external view returns (uint256) {
        return deposits.length;
    }
}

/// @notice Mock precompile that returns a configurable position
/// @dev In production, 0x800 is a precompile. In tests, we deploy a contract there.
contract MockPerpPositionPrecompile {
    int64 public szi;
    uint32 public leverage;
    uint64 public entryNtl;

    function setPosition(int64 _szi, uint32 _leverage, uint64 _entryNtl) external {
        szi = _szi;
        leverage = _leverage;
        entryNtl = _entryNtl;
    }

    // When called via staticcall with abi.encode(address, uint16), return position
    fallback(bytes calldata) external returns (bytes memory) {
        return abi.encode(szi, leverage, entryNtl);
    }
}

/// @notice Mock VaultFactory with configurable isDeployedVault
contract MockVaultFactory {
    mapping(address => bool) public isDeployedVault;

    function setDeployedVault(address vault, bool deployed) external {
        isDeployedVault[vault] = deployed;
    }
}

/// @notice Mock KernelVault that exposes owner, holds USDC, can approve/call adapter
contract MockKernelVault {
    address public immutable owner;
    MockUSDC public immutable usdc;

    constructor(address _owner, address _usdc) {
        owner = _owner;
        usdc = MockUSDC(_usdc);
    }

    function approveAdapter(address adapter, uint256 amount) external {
        usdc.approve(adapter, amount);
    }

    function callOpenPosition(address adapter, bool isBuy, uint256 size, uint256 limitPrice)
        external
    {
        HyperliquidAdapter(adapter).openPosition(isBuy, size, limitPrice);
    }

    function callClosePosition(address adapter) external {
        HyperliquidAdapter(adapter).closePosition();
    }

    function callWithdrawToVault(address adapter) external {
        HyperliquidAdapter(adapter).withdrawToVault();
    }
}

// ============================================================================
// Test Contract
// ============================================================================

contract HyperliquidAdapterTest is Test {
    HyperliquidAdapter public adapter;
    MockUSDC public usdc;
    MockCoreWriter public coreWriter;
    MockCoreDepositWallet public coreDeposit;
    MockPerpPositionPrecompile public perpPrecompile;
    MockVaultFactory public factory;

    MockKernelVault public vaultA;
    MockKernelVault public vaultB;
    address public ownerA;
    address public ownerB;
    address public nonOwner;

    uint32 public constant PERP_ASSET_BTC = 0;
    uint32 public constant PERP_ASSET_ETH = 1;

    function setUp() public {
        ownerA = address(0xA001);
        ownerB = address(0xB001);
        nonOwner = address(0xDEAD);

        // Deploy mocks
        usdc = new MockUSDC();
        coreWriter = new MockCoreWriter();
        coreDeposit = new MockCoreDepositWallet(address(usdc));
        factory = new MockVaultFactory();

        // Deploy mock precompile at the system address
        perpPrecompile = new MockPerpPositionPrecompile();
        vm.etch(
            0x0000000000000000000000000000000000000800,
            address(perpPrecompile).code
        );

        // Deploy mock CoreWriter at the system address
        vm.etch(
            0x3333333333333333333333333333333333333333,
            address(coreWriter).code
        );

        // Deploy mock vaults
        vaultA = new MockKernelVault(ownerA, address(usdc));
        vaultB = new MockKernelVault(ownerB, address(usdc));

        // Register vaults in factory
        factory.setDeployedVault(address(vaultA), true);
        factory.setDeployedVault(address(vaultB), true);

        // Deploy canonical adapter
        adapter = new HyperliquidAdapter(
            address(usdc),
            address(coreDeposit),
            address(factory)
        );

        // Fund vaults with USDC
        usdc.mint(address(vaultA), 1_000_000e6);
        usdc.mint(address(vaultB), 500_000e6);

        // Approve adapter to spend vault USDC
        vaultA.approveAdapter(address(adapter), type(uint256).max);
        vaultB.approveAdapter(address(adapter), type(uint256).max);
    }

    // ============ Selector Verification ============

    /// @notice Verify the function selectors match what the zkVM agent emits
    function test_selectorOpenPosition() public pure {
        bytes4 selector = IHyperliquidAdapter.openPosition.selector;
        assertEq(selector, bytes4(0xe3255731), "openPosition selector mismatch");
    }

    function test_selectorClosePosition() public pure {
        bytes4 selector = IHyperliquidAdapter.closePosition.selector;
        assertEq(selector, bytes4(0xc393d0e3), "closePosition selector mismatch");
    }

    function test_selectorWithdrawToVault() public pure {
        bytes4 selector = IHyperliquidAdapter.withdrawToVault.selector;
        assertEq(selector, bytes4(0x84f22721), "withdrawToVault selector mismatch");
    }

    // ============ Constructor ============

    function test_constructorSetsImmutables() public view {
        assertEq(adapter.usdc(), address(usdc));
        assertEq(adapter.coreDepositWallet(), address(coreDeposit));
        assertEq(adapter.vaultFactory(), address(factory));
    }

    function test_constructorRevertsOnZeroUsdc() public {
        vm.expectRevert(IHyperliquidAdapter.ZeroAddress.selector);
        new HyperliquidAdapter(address(0), address(coreDeposit), address(factory));
    }

    function test_constructorRevertsOnZeroCoreDeposit() public {
        vm.expectRevert(IHyperliquidAdapter.ZeroAddress.selector);
        new HyperliquidAdapter(address(usdc), address(0), address(factory));
    }

    function test_constructorRevertsOnZeroFactory() public {
        vm.expectRevert(IHyperliquidAdapter.ZeroAddress.selector);
        new HyperliquidAdapter(address(usdc), address(coreDeposit), address(0));
    }

    // ============ Registration ============

    function test_registerVault_deploysSubAccount() public {
        vm.prank(ownerA);
        address subAccount = adapter.registerVault(address(vaultA), PERP_ASSET_BTC);

        assertTrue(subAccount != address(0), "Sub-account should be deployed");
        assertTrue(adapter.isRegistered(address(vaultA)), "Vault should be registered");
        assertEq(adapter.getSubAccount(address(vaultA)), subAccount);
    }

    function test_registerVault_storesConfig() public {
        vm.prank(ownerA);
        address subAccount = adapter.registerVault(address(vaultA), PERP_ASSET_BTC);

        IHyperliquidAdapter.VaultConfig memory config = adapter.getVaultConfig(address(vaultA));
        assertEq(config.subAccount, subAccount);
        assertEq(config.perpAsset, PERP_ASSET_BTC);
    }

    function test_registerVault_emitsEvent() public {
        vm.prank(ownerA);
        vm.expectEmit(true, false, false, true);
        // We don't know the subAccount address beforehand, so we check vault + perpAsset
        emit IHyperliquidAdapter.VaultRegistered(address(vaultA), address(0), PERP_ASSET_BTC);
        // Note: The second indexed param (subAccount) won't match, but expectEmit(true, false, ...)
        // only checks the first indexed topic
        adapter.registerVault(address(vaultA), PERP_ASSET_BTC);
    }

    function test_registerVault_subAccountImmutables() public {
        vm.prank(ownerA);
        address subAccountAddr = adapter.registerVault(address(vaultA), PERP_ASSET_BTC);

        TradingSubAccount subAccount = TradingSubAccount(subAccountAddr);
        assertEq(subAccount.adapter(), address(adapter));
        assertEq(subAccount.vault(), address(vaultA));
        assertEq(subAccount.usdc(), address(usdc));
        assertEq(subAccount.coreDepositWallet(), address(coreDeposit));
        assertEq(subAccount.perpAsset(), PERP_ASSET_BTC);
    }

    function test_registerVault_revertsIfNotOwner() public {
        vm.prank(nonOwner);
        vm.expectRevert(IHyperliquidAdapter.NotVaultOwner.selector);
        adapter.registerVault(address(vaultA), PERP_ASSET_BTC);
    }

    function test_registerVault_revertsIfAlreadyRegistered() public {
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA), PERP_ASSET_BTC);

        vm.prank(ownerA);
        vm.expectRevert(IHyperliquidAdapter.VaultAlreadyRegistered.selector);
        adapter.registerVault(address(vaultA), PERP_ASSET_ETH);
    }

    function test_registerVault_revertsIfNotFactoryVault() public {
        MockKernelVault fakeVault = new MockKernelVault(ownerA, address(usdc));
        // NOT registered in factory

        vm.prank(ownerA);
        vm.expectRevert(IHyperliquidAdapter.VaultNotDeployedByFactory.selector);
        adapter.registerVault(address(fakeVault), PERP_ASSET_BTC);
    }

    function test_registerVault_revertsOnZeroVault() public {
        vm.expectRevert(IHyperliquidAdapter.ZeroAddress.selector);
        adapter.registerVault(address(0), PERP_ASSET_BTC);
    }

    // ============ Access Control ============

    function test_openPosition_revertsIfNotRegistered() public {
        // vaultA not registered yet
        vm.prank(address(vaultA));
        vm.expectRevert(IHyperliquidAdapter.VaultNotRegistered.selector);
        adapter.openPosition(true, 10_000e6, 50_000e8);
    }

    function test_closePosition_revertsIfNotRegistered() public {
        vm.prank(address(vaultA));
        vm.expectRevert(IHyperliquidAdapter.VaultNotRegistered.selector);
        adapter.closePosition();
    }

    function test_withdrawToVault_revertsIfNotRegistered() public {
        vm.prank(address(vaultA));
        vm.expectRevert(IHyperliquidAdapter.VaultNotRegistered.selector);
        adapter.withdrawToVault();
    }

    function test_subAccount_revertsDirectAccess_executeOpen() public {
        vm.prank(ownerA);
        address subAccountAddr = adapter.registerVault(address(vaultA), PERP_ASSET_BTC);

        vm.prank(nonOwner);
        vm.expectRevert(TradingSubAccount.OnlyAdapter.selector);
        TradingSubAccount(subAccountAddr).executeOpen(true, 10_000e6, 50_000e8);
    }

    function test_subAccount_revertsDirectAccess_executeClose() public {
        vm.prank(ownerA);
        address subAccountAddr = adapter.registerVault(address(vaultA), PERP_ASSET_BTC);

        vm.prank(nonOwner);
        vm.expectRevert(TradingSubAccount.OnlyAdapter.selector);
        TradingSubAccount(subAccountAddr).executeClose();
    }

    function test_subAccount_revertsDirectAccess_executeWithdraw() public {
        vm.prank(ownerA);
        address subAccountAddr = adapter.registerVault(address(vaultA), PERP_ASSET_BTC);

        vm.prank(nonOwner);
        vm.expectRevert(TradingSubAccount.OnlyAdapter.selector);
        TradingSubAccount(subAccountAddr).executeWithdraw(nonOwner);
    }

    // ============ openPosition ============

    function _registerVaultA() internal returns (address) {
        vm.prank(ownerA);
        return adapter.registerVault(address(vaultA), PERP_ASSET_BTC);
    }

    function _registerVaultB() internal returns (address) {
        vm.prank(ownerB);
        return adapter.registerVault(address(vaultB), PERP_ASSET_ETH);
    }

    function test_openPosition_long() public {
        _registerVaultA();

        uint256 size = 10_000e6;
        uint256 limitPrice = 50_000e8;

        vaultA.callOpenPosition(address(adapter), true, size, limitPrice);

        // Verify USDC was pulled from vault and sent to sub-account (then to CoreDeposit)
        assertEq(usdc.balanceOf(address(vaultA)), 1_000_000e6 - size);

        // Verify deposit to CoreDepositWallet
        assertEq(coreDeposit.depositCount(), 1);
        (uint256 depositAmount, uint32 destDex) = coreDeposit.deposits(0);
        assertEq(depositAmount, size);
        assertEq(destDex, 0); // DEST_DEX_PERP
    }

    function test_openPosition_short() public {
        _registerVaultA();

        uint256 size = 5_000e6;
        uint256 limitPrice = 48_000e8;

        vaultA.callOpenPosition(address(adapter), false, size, limitPrice);

        assertEq(usdc.balanceOf(address(vaultA)), 1_000_000e6 - size);
        assertEq(coreDeposit.depositCount(), 1);
    }

    function test_openPosition_emitsSubAccountEvents() public {
        _registerVaultA();

        uint256 size = 10_000e6;
        uint256 limitPrice = 50_000e8;

        vm.expectEmit(false, false, false, true);
        emit TradingSubAccount.MarginDeposited(size);
        vaultA.callOpenPosition(address(adapter), true, size, limitPrice);
    }

    function test_openPosition_revertsOnSizeOverflow() public {
        _registerVaultA();

        vm.prank(address(vaultA));
        vm.expectRevert(
            abi.encodeWithSelector(
                IHyperliquidAdapter.SizeOverflow.selector,
                uint256(type(uint64).max) + 1
            )
        );
        adapter.openPosition(true, uint256(type(uint64).max) + 1, 50_000e8);
    }

    function test_openPosition_revertsOnPriceOverflow() public {
        _registerVaultA();

        vm.prank(address(vaultA));
        vm.expectRevert(
            abi.encodeWithSelector(
                IHyperliquidAdapter.PriceOverflow.selector,
                uint256(type(uint64).max) + 1
            )
        );
        adapter.openPosition(true, 10_000e6, uint256(type(uint64).max) + 1);
    }

    // ============ closePosition ============

    function test_closePosition_longPosition() public {
        _registerVaultA();

        // Set up a long position at the precompile address
        // The precompile is etched, so we use vm.store to set position
        MockPerpPositionPrecompile precompile = MockPerpPositionPrecompile(
            0x0000000000000000000000000000000000000800
        );
        vm.store(
            address(precompile),
            bytes32(uint256(0)),
            bytes32(uint256(uint64(1000e8))) // szi = 1000e8 (long)
        );

        vaultA.callClosePosition(address(adapter));
    }

    function test_closePosition_shortPosition() public {
        _registerVaultA();

        // Set up a short position (negative szi)
        MockPerpPositionPrecompile precompile = MockPerpPositionPrecompile(
            0x0000000000000000000000000000000000000800
        );
        // Store negative szi: -500e8 as int64 in storage slot 0
        // int64(-500e8) = -50000000000 = 0xFFFFFFFF4190AB00 in two's complement
        int64 shortSzi = -500e8;
        vm.store(
            address(precompile),
            bytes32(uint256(0)),
            bytes32(uint256(uint64(int64(shortSzi))))
        );

        vaultA.callClosePosition(address(adapter));
    }

    function test_closePosition_revertsWithNoPosition() public {
        _registerVaultA();

        // Default position is zero
        vm.expectRevert(TradingSubAccount.NoPositionToClose.selector);
        vaultA.callClosePosition(address(adapter));
    }

    // ============ withdrawToVault ============

    function test_withdrawToVault_sendsFullBalance() public {
        address subAccount = _registerVaultA();

        // Put some USDC in the sub-account
        uint256 amount = 50_000e6;
        usdc.mint(subAccount, amount);

        vaultA.callWithdrawToVault(address(adapter));

        assertEq(usdc.balanceOf(subAccount), 0);
        assertEq(usdc.balanceOf(address(vaultA)), 1_000_000e6 + amount);
    }

    function test_withdrawToVault_revertsIfNoBalance() public {
        _registerVaultA();

        vm.expectRevert(TradingSubAccount.NoBalanceToWithdraw.selector);
        vaultA.callWithdrawToVault(address(adapter));
    }

    function test_withdrawToVault_emitsEvent() public {
        address subAccount = _registerVaultA();

        uint256 amount = 25_000e6;
        usdc.mint(subAccount, amount);

        vm.expectEmit(false, false, false, true);
        emit TradingSubAccount.WithdrawnToVault(amount);
        vaultA.callWithdrawToVault(address(adapter));
    }

    // ============ Multi-vault Isolation ============

    function test_multiVault_differentSubAccounts() public {
        address subA = _registerVaultA();
        address subB = _registerVaultB();

        assertTrue(subA != subB, "Sub-accounts should be different");
        assertTrue(subA != address(0), "Sub-account A should exist");
        assertTrue(subB != address(0), "Sub-account B should exist");
    }

    function test_multiVault_independentTrading() public {
        _registerVaultA();
        _registerVaultB();

        // Vault A opens BTC long
        vaultA.callOpenPosition(address(adapter), true, 10_000e6, 50_000e8);

        // Vault B opens ETH short
        vaultB.callOpenPosition(address(adapter), false, 5_000e6, 3_000e8);

        // Verify each vault's balance decreased independently
        assertEq(usdc.balanceOf(address(vaultA)), 1_000_000e6 - 10_000e6);
        assertEq(usdc.balanceOf(address(vaultB)), 500_000e6 - 5_000e6);

        // Verify 2 separate deposits
        assertEq(coreDeposit.depositCount(), 2);
    }

    function test_multiVault_correctVaultReceivesFunds() public {
        address subA = _registerVaultA();
        address subB = _registerVaultB();

        // Put USDC in each sub-account (simulating HyperCore return)
        usdc.mint(subA, 15_000e6);
        usdc.mint(subB, 8_000e6);

        uint256 vaultABefore = usdc.balanceOf(address(vaultA));
        uint256 vaultBBefore = usdc.balanceOf(address(vaultB));

        // Withdraw from vault A
        vaultA.callWithdrawToVault(address(adapter));

        // Only vault A should receive funds
        assertEq(usdc.balanceOf(address(vaultA)), vaultABefore + 15_000e6);
        assertEq(usdc.balanceOf(address(vaultB)), vaultBBefore);

        // Now withdraw from vault B
        vaultB.callWithdrawToVault(address(adapter));

        assertEq(usdc.balanceOf(address(vaultB)), vaultBBefore + 8_000e6);
    }

    function test_multiVault_vaultACantAccessVaultB() public {
        _registerVaultA();
        address subB = _registerVaultB();

        // Vault A cannot call sub-account B directly
        vm.prank(address(vaultA));
        vm.expectRevert(TradingSubAccount.OnlyAdapter.selector);
        TradingSubAccount(subB).executeOpen(true, 10_000e6, 50_000e8);
    }

    function test_multiVault_differentAssets() public {
        address subA = _registerVaultA(); // BTC
        address subB = _registerVaultB(); // ETH

        assertEq(TradingSubAccount(subA).perpAsset(), PERP_ASSET_BTC);
        assertEq(TradingSubAccount(subB).perpAsset(), PERP_ASSET_ETH);
    }

    // ============ View Functions ============

    function test_getSubAccount_returnsZeroForUnregistered() public view {
        assertEq(adapter.getSubAccount(address(0xBEEF)), address(0));
    }

    function test_computeSubAccountAddress_matchesActual() public {
        // Compute before registration
        address predicted =
            adapter.computeSubAccountAddress(address(vaultA), PERP_ASSET_BTC);

        // Register and get actual address
        vm.prank(ownerA);
        address actual = adapter.registerVault(address(vaultA), PERP_ASSET_BTC);

        assertEq(predicted, actual, "Computed address should match actual deployment");
    }

    function test_isRegistered_returnsFalseForUnregistered() public view {
        assertFalse(adapter.isRegistered(address(vaultA)));
    }

    // ============ Sub-account View Functions ============

    function test_subAccount_getPosition() public {
        address subAccount = _registerVaultA();

        // Default position should be zero
        (int64 szi, uint32 leverage, uint64 entryNtl) =
            TradingSubAccount(subAccount).getPosition();
        assertEq(szi, 0);
        assertEq(leverage, 0);
        assertEq(entryNtl, 0);
    }

    function test_subAccount_getBalance() public {
        address subAccount = _registerVaultA();

        assertEq(TradingSubAccount(subAccount).getBalance(), 0);

        usdc.mint(subAccount, 100_000e6);
        assertEq(TradingSubAccount(subAccount).getBalance(), 100_000e6);
    }
}
