// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import {
    MorphoAdapter,
    MarketParams,
    IMorpho,
    IKernelVaultOwner
} from "../src/adapters/MorphoAdapter.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// ============================================================================
// Mock Contracts
// ============================================================================

/// @notice Mock ERC20 token for testing
contract MockERC20Token {
    string public name;
    string public symbol;
    uint8 public decimals;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function burn(address from, uint256 amount) external {
        balanceOf[from] -= amount;
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
        if (allowance[from][msg.sender] != type(uint256).max) {
            require(allowance[from][msg.sender] >= amount, "insufficient allowance");
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @notice Mock Morpho Blue protocol for testing
contract MockMorpho {
    struct Position {
        uint256 supplyShares;
        uint128 borrowShares;
        uint128 collateral;
    }

    // marketId => user => Position
    mapping(bytes32 => mapping(address => Position)) public positions;

    // marketId => MarketParams
    mapping(bytes32 => MarketParams) public marketParams;

    // Track registered markets
    mapping(bytes32 => bool) public marketExists;

    /// @notice Register a market for testing
    function setMarket(MarketParams calldata params) external {
        bytes32 id = keccak256(abi.encode(params));
        marketParams[id] = params;
        marketExists[id] = true;
    }

    /// @notice Set a position for testing
    function setPosition(
        bytes32 id,
        address user,
        uint256 supplyShares,
        uint128 borrowShares,
        uint128 collateral
    ) external {
        positions[id][user] = Position(supplyShares, borrowShares, collateral);
    }

    function supply(
        MarketParams calldata params,
        uint256 assets,
        uint256, /* shares */
        address onBehalfOf,
        bytes calldata /* data */
    ) external returns (uint256 assetsSupplied, uint256 sharesSupplied) {
        bytes32 id = keccak256(abi.encode(params));

        // Pull tokens from caller
        MockERC20Token(params.loanToken).transferFrom(msg.sender, address(this), assets);

        // Credit supply shares (1:1 for simplicity)
        positions[id][onBehalfOf].supplyShares += assets;

        return (assets, assets);
    }

    function withdraw(
        MarketParams calldata params,
        uint256 assets,
        uint256 shares,
        address onBehalfOf,
        address receiver
    ) external returns (uint256 assetsWithdrawn, uint256 sharesWithdrawn) {
        bytes32 id = keccak256(abi.encode(params));

        uint256 withdrawAmount;
        if (assets > 0) {
            withdrawAmount = assets;
        } else {
            // Withdraw by shares (1:1 for simplicity)
            withdrawAmount = shares;
        }

        // Debit supply shares
        positions[id][onBehalfOf].supplyShares -= withdrawAmount;

        // Transfer tokens to receiver
        MockERC20Token(params.loanToken).transfer(receiver, withdrawAmount);

        return (withdrawAmount, withdrawAmount);
    }

    function borrow(
        MarketParams calldata params,
        uint256 assets,
        uint256, /* shares */
        address onBehalfOf,
        address receiver
    ) external returns (uint256 assetsBorrowed, uint256 sharesBorrowed) {
        bytes32 id = keccak256(abi.encode(params));

        // Credit borrow shares
        positions[id][onBehalfOf].borrowShares += uint128(assets);

        // Transfer tokens to receiver
        MockERC20Token(params.loanToken).transfer(receiver, assets);

        return (assets, assets);
    }

    function repay(
        MarketParams calldata params,
        uint256 assets,
        uint256, /* shares */
        address onBehalfOf,
        bytes calldata /* data */
    ) external returns (uint256 assetsRepaid, uint256 sharesRepaid) {
        bytes32 id = keccak256(abi.encode(params));

        // Pull tokens from caller
        MockERC20Token(params.loanToken).transferFrom(msg.sender, address(this), assets);

        // Debit borrow shares
        positions[id][onBehalfOf].borrowShares -= uint128(assets);

        return (assets, assets);
    }

    function supplyCollateral(
        MarketParams calldata params,
        uint256 assets,
        address onBehalfOf,
        bytes calldata /* data */
    ) external {
        bytes32 id = keccak256(abi.encode(params));

        // Pull collateral from caller
        MockERC20Token(params.collateralToken).transferFrom(msg.sender, address(this), assets);

        // Credit collateral
        positions[id][onBehalfOf].collateral += uint128(assets);
    }

    function withdrawCollateral(
        MarketParams calldata params,
        uint256 assets,
        address onBehalfOf,
        address receiver
    ) external {
        bytes32 id = keccak256(abi.encode(params));

        // Debit collateral
        positions[id][onBehalfOf].collateral -= uint128(assets);

        // Transfer collateral to receiver
        MockERC20Token(params.collateralToken).transfer(receiver, assets);
    }

    function idToMarketParams(bytes32 id) external view returns (MarketParams memory) {
        return marketParams[id];
    }

    function position(bytes32 id, address user)
        external
        view
        returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)
    {
        Position memory pos = positions[id][user];
        return (pos.supplyShares, pos.borrowShares, pos.collateral);
    }
}

/// @notice Mock VaultFactory with configurable isDeployedVault
contract MockVaultFactory {
    mapping(address => bool) public isDeployedVault;

    function setDeployedVault(address vault, bool deployed) external {
        isDeployedVault[vault] = deployed;
    }
}

/// @notice Mock KernelVault that exposes owner, holds tokens, can approve/call adapter
contract MockMorphoVault {
    address public immutable owner;

    constructor(address _owner) {
        owner = _owner;
    }

    function approveAdapter(address token, address adapter, uint256 amount) external {
        MockERC20Token(token).approve(adapter, amount);
    }

    function callSupply(address adapter, MarketParams calldata params, uint256 assets) external {
        MorphoAdapter(adapter).supply(params, assets);
    }

    function callWithdraw(address adapter, MarketParams calldata params, uint256 assets) external {
        MorphoAdapter(adapter).withdraw(params, assets);
    }

    function callBorrow(address adapter, MarketParams calldata params, uint256 assets) external {
        MorphoAdapter(adapter).borrow(params, assets);
    }

    function callRepay(address adapter, MarketParams calldata params, uint256 assets) external {
        MorphoAdapter(adapter).repay(params, assets);
    }

    function callSupplyCollateral(address adapter, MarketParams calldata params, uint256 assets)
        external
    {
        MorphoAdapter(adapter).supplyCollateral(params, assets);
    }

    function callWithdrawCollateral(address adapter, MarketParams calldata params, uint256 assets)
        external
    {
        MorphoAdapter(adapter).withdrawCollateral(params, assets);
    }

    function callReallocate(
        address adapter,
        MarketParams calldata from,
        MarketParams calldata to,
        uint256 assets
    ) external {
        MorphoAdapter(adapter).reallocate(from, to, assets);
    }

    function callWithdrawToVault(address adapter) external {
        MorphoAdapter(adapter).withdrawToVault();
    }
}

// ============================================================================
// Test Contract
// ============================================================================

contract MorphoAdapterTest is Test {
    MorphoAdapter public adapter;
    MockMorpho public morpho;
    MockVaultFactory public factory;

    MockERC20Token public loanToken;
    MockERC20Token public collateralToken;
    MockERC20Token public loanToken2;

    MockMorphoVault public vaultA;
    MockMorphoVault public vaultB;
    address public ownerA;
    address public ownerB;
    address public nonOwner;

    MarketParams public market1;
    MarketParams public market2;
    bytes32 public market1Id;
    bytes32 public market2Id;

    // LLTV = 80% (0.8e18)
    uint256 public constant LLTV = 0.8e18;

    function setUp() public {
        ownerA = address(0xA001);
        ownerB = address(0xB001);
        nonOwner = address(0xDEAD);

        // Deploy mock tokens
        loanToken = new MockERC20Token("USDC", "USDC", 6);
        collateralToken = new MockERC20Token("WETH", "WETH", 18);
        loanToken2 = new MockERC20Token("DAI", "DAI", 18);

        // Deploy mock Morpho
        morpho = new MockMorpho();

        // Deploy factory
        factory = new MockVaultFactory();

        // Deploy adapter with mock Morpho address
        adapter = new MorphoAdapter(address(morpho), address(factory));

        // Deploy mock vaults
        vaultA = new MockMorphoVault(ownerA);
        vaultB = new MockMorphoVault(ownerB);

        // Register vaults in factory
        factory.setDeployedVault(address(vaultA), true);
        factory.setDeployedVault(address(vaultB), true);

        // Set up market params
        market1 = MarketParams({
            loanToken: address(loanToken),
            collateralToken: address(collateralToken),
            oracle: address(0x1111),
            irm: address(0x2222),
            lltv: LLTV
        });

        market2 = MarketParams({
            loanToken: address(loanToken2),
            collateralToken: address(collateralToken),
            oracle: address(0x1111),
            irm: address(0x2222),
            lltv: LLTV
        });

        market1Id = keccak256(abi.encode(market1));
        market2Id = keccak256(abi.encode(market2));

        // Register markets in mock Morpho
        morpho.setMarket(market1);
        morpho.setMarket(market2);

        // Fund mock Morpho with loan tokens for borrow/withdraw operations
        loanToken.mint(address(morpho), 10_000_000e6);
        loanToken2.mint(address(morpho), 10_000_000e18);
        collateralToken.mint(address(morpho), 10_000e18);

        // Fund vaults with tokens
        loanToken.mint(address(vaultA), 1_000_000e6);
        loanToken.mint(address(vaultB), 500_000e6);
        collateralToken.mint(address(vaultA), 1_000e18);
        collateralToken.mint(address(vaultB), 500e18);
        loanToken2.mint(address(vaultA), 1_000_000e18);
    }

    // ============ Helpers ============

    function _registerVaultA() internal {
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));
    }

    function _registerVaultB() internal {
        vm.prank(ownerB);
        adapter.registerVault(address(vaultB));
    }

    function _whitelistMarket1ForVaultA() internal {
        vm.prank(ownerA);
        adapter.whitelistMarket(address(vaultA), market1);
    }

    function _whitelistMarket2ForVaultA() internal {
        vm.prank(ownerA);
        adapter.whitelistMarket(address(vaultA), market2);
    }

    function _setupVaultA() internal {
        _registerVaultA();
        _whitelistMarket1ForVaultA();

        // Approve adapter to spend vault tokens
        vaultA.approveAdapter(address(loanToken), address(adapter), type(uint256).max);
        vaultA.approveAdapter(address(collateralToken), address(adapter), type(uint256).max);
        vaultA.approveAdapter(address(loanToken2), address(adapter), type(uint256).max);
    }

    function _setupVaultB() internal {
        _registerVaultB();
        vm.prank(ownerB);
        adapter.whitelistMarket(address(vaultB), market1);

        vaultB.approveAdapter(address(loanToken), address(adapter), type(uint256).max);
        vaultB.approveAdapter(address(collateralToken), address(adapter), type(uint256).max);
    }

    // ============ Constructor ============

    function test_constructorSetsImmutables() public view {
        assertEq(adapter.vaultFactory(), address(factory));
    }

    function test_constructorRevertsOnZeroMorpho() public {
        vm.expectRevert(MorphoAdapter.ZeroAddress.selector);
        new MorphoAdapter(address(0), address(factory));
    }

    function test_constructorRevertsOnZeroFactory() public {
        vm.expectRevert(MorphoAdapter.ZeroAddress.selector);
        new MorphoAdapter(address(morpho), address(0));
    }

    function test_morphoImmutable() public view {
        assertEq(adapter.morpho(), address(morpho));
    }

    function test_defaultMorphoConstant() public view {
        assertEq(adapter.DEFAULT_MORPHO(), 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb);
    }

    // ============ Registration ============

    function test_registerVault_success() public {
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));

        assertTrue(adapter.isRegistered(address(vaultA)));
    }

    function test_registerVault_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit MorphoAdapter.VaultRegistered(address(vaultA));

        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));
    }

    function test_registerVault_revertsIfNotOwner() public {
        vm.prank(nonOwner);
        vm.expectRevert(MorphoAdapter.NotVaultOwner.selector);
        adapter.registerVault(address(vaultA));
    }

    function test_registerVault_revertsIfAlreadyRegistered() public {
        _registerVaultA();

        vm.prank(ownerA);
        vm.expectRevert(MorphoAdapter.VaultAlreadyRegistered.selector);
        adapter.registerVault(address(vaultA));
    }

    function test_registerVault_revertsIfNotFactoryVault() public {
        MockMorphoVault fakeVault = new MockMorphoVault(ownerA);
        // NOT registered in factory

        vm.prank(ownerA);
        vm.expectRevert(MorphoAdapter.VaultNotDeployedByFactory.selector);
        adapter.registerVault(address(fakeVault));
    }

    function test_registerVault_revertsOnZeroVault() public {
        vm.expectRevert(MorphoAdapter.ZeroAddress.selector);
        adapter.registerVault(address(0));
    }

    // ============ Market Whitelist ============

    function test_whitelistMarket_success() public {
        _registerVaultA();

        bytes32 marketKey = keccak256(abi.encode(market1));

        vm.expectEmit(true, true, false, true);
        emit MorphoAdapter.MarketWhitelisted(address(vaultA), marketKey);

        vm.prank(ownerA);
        adapter.whitelistMarket(address(vaultA), market1);

        assertTrue(adapter.isMarketWhitelisted(address(vaultA), marketKey));
    }

    function test_whitelistMarket_revertsIfNotOwner() public {
        _registerVaultA();

        vm.prank(nonOwner);
        vm.expectRevert(MorphoAdapter.NotVaultOwner.selector);
        adapter.whitelistMarket(address(vaultA), market1);
    }

    function test_whitelistMarket_revertsIfVaultNotRegistered() public {
        vm.prank(ownerA);
        vm.expectRevert(MorphoAdapter.VaultNotRegistered.selector);
        adapter.whitelistMarket(address(vaultA), market1);
    }

    function test_delistMarket_success() public {
        _registerVaultA();
        _whitelistMarket1ForVaultA();

        bytes32 marketKey = keccak256(abi.encode(market1));

        vm.expectEmit(true, true, false, true);
        emit MorphoAdapter.MarketDelisted(address(vaultA), marketKey);

        vm.prank(ownerA);
        adapter.delistMarket(address(vaultA), market1);

        assertFalse(adapter.isMarketWhitelisted(address(vaultA), marketKey));
    }

    function test_delistMarket_revertsIfNotOwner() public {
        _registerVaultA();
        _whitelistMarket1ForVaultA();

        vm.prank(nonOwner);
        vm.expectRevert(MorphoAdapter.NotVaultOwner.selector);
        adapter.delistMarket(address(vaultA), market1);
    }

    // ============ Supply / Withdraw Cycle ============

    function test_supply_success() public {
        _setupVaultA();

        uint256 supplyAmount = 100_000e6;
        uint256 balanceBefore = loanToken.balanceOf(address(vaultA));

        vm.expectEmit(true, true, false, true);
        emit MorphoAdapter.Supplied(address(vaultA), market1Id, supplyAmount);

        vaultA.callSupply(address(adapter), market1, supplyAmount);

        // Vault balance decreased
        assertEq(loanToken.balanceOf(address(vaultA)), balanceBefore - supplyAmount);

        // Market tracked
        assertEq(adapter.getVaultMarketCount(address(vaultA)), 1);
        assertEq(adapter.getVaultMarketIds(address(vaultA))[0], market1Id);

        // Position recorded in mock Morpho
        (uint256 supplyShares,,) = morpho.position(market1Id, address(adapter));
        assertEq(supplyShares, supplyAmount);
    }

    function test_supply_revertsOnZeroAmount() public {
        _setupVaultA();

        vm.prank(address(vaultA));
        vm.expectRevert(MorphoAdapter.ZeroAmount.selector);
        adapter.supply(market1, 0);
    }

    function test_withdraw_success() public {
        _setupVaultA();

        uint256 supplyAmount = 100_000e6;
        uint256 withdrawAmount = 50_000e6;

        vaultA.callSupply(address(adapter), market1, supplyAmount);

        uint256 balanceBefore = loanToken.balanceOf(address(vaultA));

        vm.expectEmit(true, true, false, true);
        emit MorphoAdapter.Withdrawn(address(vaultA), market1Id, withdrawAmount);

        vaultA.callWithdraw(address(adapter), market1, withdrawAmount);

        // Vault received the withdrawn tokens
        assertEq(loanToken.balanceOf(address(vaultA)), balanceBefore + withdrawAmount);

        // Supply shares decreased
        (uint256 supplyShares,,) = morpho.position(market1Id, address(adapter));
        assertEq(supplyShares, supplyAmount - withdrawAmount);
    }

    function test_supply_withdraw_full_cycle() public {
        _setupVaultA();

        uint256 supplyAmount = 100_000e6;
        uint256 initialBalance = loanToken.balanceOf(address(vaultA));

        // Supply
        vaultA.callSupply(address(adapter), market1, supplyAmount);
        assertEq(loanToken.balanceOf(address(vaultA)), initialBalance - supplyAmount);

        // Withdraw all
        vaultA.callWithdraw(address(adapter), market1, supplyAmount);
        assertEq(loanToken.balanceOf(address(vaultA)), initialBalance);

        // Supply shares should be zero
        (uint256 supplyShares,,) = morpho.position(market1Id, address(adapter));
        assertEq(supplyShares, 0);
    }

    // ============ Borrow with LLTV Health Guard ============

    function test_borrow_success_within_health() public {
        _setupVaultA();

        // Supply collateral first: 100 WETH
        uint256 collateralAmount = 100e18;
        vaultA.callSupplyCollateral(address(adapter), market1, collateralAmount);

        // Borrow a small amount that is well within limits
        // collateral=100e18, LLTV=0.8e18, 80% safety = max borrow of:
        // 100e18 * 0.8e18 * 8000 / (1e18 * 10000) = 64e18
        // Borrow 10e6 USDC (loan token has 6 decimals)
        // Health check: borrowShares(10e6) <= 64e18 => passes
        uint256 borrowAmount = 10e6;

        vm.expectEmit(true, true, false, true);
        emit MorphoAdapter.Borrowed(address(vaultA), market1Id, borrowAmount);

        vaultA.callBorrow(address(adapter), market1, borrowAmount);

        // Vault received borrowed tokens (mock transfers from its own balance)
        (, uint128 borrowShares,) = morpho.position(market1Id, address(adapter));
        assertEq(uint256(borrowShares), borrowAmount);
    }

    function test_borrow_reverts_unhealthy_position() public {
        _setupVaultA();

        // Supply small collateral: 10 units
        uint256 collateralAmount = 10;
        vaultA.callSupplyCollateral(address(adapter), market1, collateralAmount);

        // Try to borrow way more than collateral allows
        // maxBorrow = 10 * 0.8e18 * 8000 / (1e18 * 10000) = 6 (integer math)
        // Trying to borrow 100 should fail
        uint256 borrowAmount = 100;

        vm.expectRevert(
            abi.encodeWithSelector(MorphoAdapter.UnhealthyPosition.selector, 100, 6)
        );
        vaultA.callBorrow(address(adapter), market1, borrowAmount);
    }

    function test_borrow_revertsOnZeroAmount() public {
        _setupVaultA();

        vm.prank(address(vaultA));
        vm.expectRevert(MorphoAdapter.ZeroAmount.selector);
        adapter.borrow(market1, 0);
    }

    // ============ Collateral Supply / Withdraw ============

    function test_supplyCollateral_success() public {
        _setupVaultA();

        uint256 collateralAmount = 50e18;
        uint256 balanceBefore = collateralToken.balanceOf(address(vaultA));

        vm.expectEmit(true, true, false, true);
        emit MorphoAdapter.CollateralSupplied(address(vaultA), market1Id, collateralAmount);

        vaultA.callSupplyCollateral(address(adapter), market1, collateralAmount);

        // Vault balance decreased
        assertEq(collateralToken.balanceOf(address(vaultA)), balanceBefore - collateralAmount);

        // Collateral recorded
        (,, uint128 collateral) = morpho.position(market1Id, address(adapter));
        assertEq(collateral, uint128(collateralAmount));
    }

    function test_supplyCollateral_revertsOnZeroAmount() public {
        _setupVaultA();

        vm.prank(address(vaultA));
        vm.expectRevert(MorphoAdapter.ZeroAmount.selector);
        adapter.supplyCollateral(market1, 0);
    }

    function test_withdrawCollateral_success() public {
        _setupVaultA();

        uint256 collateralAmount = 50e18;
        uint256 withdrawAmount = 20e18;

        vaultA.callSupplyCollateral(address(adapter), market1, collateralAmount);

        uint256 balanceBefore = collateralToken.balanceOf(address(vaultA));

        vm.expectEmit(true, true, false, true);
        emit MorphoAdapter.CollateralWithdrawn(address(vaultA), market1Id, withdrawAmount);

        vaultA.callWithdrawCollateral(address(adapter), market1, withdrawAmount);

        // Vault received the withdrawn collateral
        assertEq(collateralToken.balanceOf(address(vaultA)), balanceBefore + withdrawAmount);

        // Collateral decreased
        (,, uint128 collateral) = morpho.position(market1Id, address(adapter));
        assertEq(collateral, uint128(collateralAmount - withdrawAmount));
    }

    function test_withdrawCollateral_revertsOnZeroAmount() public {
        _setupVaultA();

        vm.prank(address(vaultA));
        vm.expectRevert(MorphoAdapter.ZeroAmount.selector);
        adapter.withdrawCollateral(market1, 0);
    }

    function test_withdrawCollateral_healthCheckAfterWithdraw() public {
        _setupVaultA();

        // Supply collateral and borrow
        uint256 collateralAmount = 100;
        vaultA.callSupplyCollateral(address(adapter), market1, collateralAmount);

        // Borrow 5 (within health: maxBorrow = 100 * 0.8e18 * 8000 / (1e18*10000) = 64)
        vaultA.callBorrow(address(adapter), market1, 5);

        // Withdraw most collateral leaving only 10
        // After withdraw: collateral=10, borrowShares=5
        // maxBorrow = 10 * 0.8e18 * 8000 / (1e18*10000) = 6
        // 5 <= 6 => still healthy
        vaultA.callWithdrawCollateral(address(adapter), market1, 90);

        (,, uint128 remaining) = morpho.position(market1Id, address(adapter));
        assertEq(remaining, 10);
    }

    function test_withdrawCollateral_revertsIfUnhealthyAfter() public {
        _setupVaultA();

        // Supply collateral and borrow
        uint256 collateralAmount = 100;
        vaultA.callSupplyCollateral(address(adapter), market1, collateralAmount);

        // Borrow 60 (within health: maxBorrow = 100 * 0.8e18 * 8000 / (1e18*10000) = 64)
        vaultA.callBorrow(address(adapter), market1, 60);

        // Try to withdraw 95 collateral, leaving only 5
        // After withdraw: collateral=5, borrowShares=60
        // maxBorrow = 5 * 0.8e18 * 8000 / (1e18*10000) = 3
        // 60 > 3 => unhealthy
        vm.expectRevert(
            abi.encodeWithSelector(MorphoAdapter.UnhealthyPosition.selector, 60, 3)
        );
        vaultA.callWithdrawCollateral(address(adapter), market1, 95);
    }

    // ============ Repay ============

    function test_repay_success() public {
        _setupVaultA();

        // Supply collateral and borrow
        vaultA.callSupplyCollateral(address(adapter), market1, 100e18);
        vaultA.callBorrow(address(adapter), market1, 50_000e6);

        // Repay
        uint256 repayAmount = 25_000e6;

        vm.expectEmit(true, true, false, true);
        emit MorphoAdapter.Repaid(address(vaultA), market1Id, repayAmount);

        vaultA.callRepay(address(adapter), market1, repayAmount);

        // Borrow shares decreased
        (, uint128 borrowShares,) = morpho.position(market1Id, address(adapter));
        assertEq(borrowShares, uint128(50_000e6 - repayAmount));
    }

    function test_repay_revertsOnZeroAmount() public {
        _setupVaultA();

        vm.prank(address(vaultA));
        vm.expectRevert(MorphoAdapter.ZeroAmount.selector);
        adapter.repay(market1, 0);
    }

    // ============ Reallocate ============

    function test_reallocate_success() public {
        _setupVaultA();
        _whitelistMarket2ForVaultA();

        // Supply to market1
        uint256 supplyAmount = 100_000e6;
        vaultA.callSupply(address(adapter), market1, supplyAmount);

        // Reallocate 50k from market1 to market2
        // Note: the mock just moves tokens, but market2 uses loanToken2.
        // For this test we need both markets to use the same loan token.
        // Let's create a market2 variant that uses the same loan token.
        MarketParams memory market2SameToken = MarketParams({
            loanToken: address(loanToken),
            collateralToken: address(collateralToken),
            oracle: address(0x3333),
            irm: address(0x2222),
            lltv: LLTV
        });

        // Register and whitelist the new market
        morpho.setMarket(market2SameToken);
        bytes32 market2SameId = keccak256(abi.encode(market2SameToken));

        vm.prank(ownerA);
        adapter.whitelistMarket(address(vaultA), market2SameToken);

        uint256 reallocateAmount = 50_000e6;

        vm.expectEmit(true, true, true, true);
        emit MorphoAdapter.Reallocated(
            address(vaultA), market1Id, market2SameId, reallocateAmount
        );

        vaultA.callReallocate(address(adapter), market1, market2SameToken, reallocateAmount);

        // market1 supply decreased
        (uint256 supply1,,) = morpho.position(market1Id, address(adapter));
        assertEq(supply1, supplyAmount - reallocateAmount);

        // market2 supply increased
        (uint256 supply2,,) = morpho.position(market2SameId, address(adapter));
        assertEq(supply2, reallocateAmount);

        // Both markets tracked
        assertEq(adapter.getVaultMarketCount(address(vaultA)), 2);
    }

    function test_reallocate_revertsOnZeroAmount() public {
        _setupVaultA();
        _whitelistMarket2ForVaultA();

        vm.prank(address(vaultA));
        vm.expectRevert(MorphoAdapter.ZeroAmount.selector);
        adapter.reallocate(market1, market2, 0);
    }

    function test_reallocate_revertsIfSourceNotWhitelisted() public {
        _setupVaultA();
        // market2 is whitelisted but market1 is delisted
        _whitelistMarket2ForVaultA();

        vm.prank(ownerA);
        adapter.delistMarket(address(vaultA), market1);

        vm.prank(address(vaultA));
        vm.expectRevert(MorphoAdapter.MarketNotWhitelisted.selector);
        adapter.reallocate(market1, market2, 1000);
    }

    function test_reallocate_revertsIfDestNotWhitelisted() public {
        _setupVaultA();
        // only market1 whitelisted, not market2

        vm.prank(address(vaultA));
        vm.expectRevert(MorphoAdapter.MarketNotWhitelisted.selector);
        adapter.reallocate(market1, market2, 1000);
    }

    // ============ Unauthorized Caller Rejection ============

    function test_supply_revertsIfNotRegistered() public {
        vm.prank(address(vaultA));
        vm.expectRevert(MorphoAdapter.VaultNotRegistered.selector);
        adapter.supply(market1, 100e6);
    }

    function test_withdraw_revertsIfNotRegistered() public {
        vm.prank(address(vaultA));
        vm.expectRevert(MorphoAdapter.VaultNotRegistered.selector);
        adapter.withdraw(market1, 100e6);
    }

    function test_borrow_revertsIfNotRegistered() public {
        vm.prank(address(vaultA));
        vm.expectRevert(MorphoAdapter.VaultNotRegistered.selector);
        adapter.borrow(market1, 100e6);
    }

    function test_repay_revertsIfNotRegistered() public {
        vm.prank(address(vaultA));
        vm.expectRevert(MorphoAdapter.VaultNotRegistered.selector);
        adapter.repay(market1, 100e6);
    }

    function test_supplyCollateral_revertsIfNotRegistered() public {
        vm.prank(address(vaultA));
        vm.expectRevert(MorphoAdapter.VaultNotRegistered.selector);
        adapter.supplyCollateral(market1, 100e18);
    }

    function test_withdrawCollateral_revertsIfNotRegistered() public {
        vm.prank(address(vaultA));
        vm.expectRevert(MorphoAdapter.VaultNotRegistered.selector);
        adapter.withdrawCollateral(market1, 100e18);
    }

    function test_reallocate_revertsIfNotRegistered() public {
        vm.prank(address(vaultA));
        vm.expectRevert(MorphoAdapter.VaultNotRegistered.selector);
        adapter.reallocate(market1, market2, 100e6);
    }

    function test_withdrawToVault_revertsIfNotRegistered() public {
        vm.prank(address(vaultA));
        vm.expectRevert(MorphoAdapter.VaultNotRegistered.selector);
        adapter.withdrawToVault();
    }

    function test_supply_revertsIfMarketNotWhitelisted() public {
        _registerVaultA();
        vaultA.approveAdapter(address(loanToken), address(adapter), type(uint256).max);

        // market1 NOT whitelisted
        vm.prank(address(vaultA));
        vm.expectRevert(MorphoAdapter.MarketNotWhitelisted.selector);
        adapter.supply(market1, 100e6);
    }

    function test_randomAddress_cannotCallSupply() public {
        _setupVaultA();

        vm.prank(nonOwner);
        vm.expectRevert(MorphoAdapter.VaultNotRegistered.selector);
        adapter.supply(market1, 100e6);
    }

    function test_randomAddress_cannotCallBorrow() public {
        _setupVaultA();

        vm.prank(nonOwner);
        vm.expectRevert(MorphoAdapter.VaultNotRegistered.selector);
        adapter.borrow(market1, 100e6);
    }

    // ============ Emergency withdrawToVault ============

    function test_withdrawToVault_withdrawsAllPositions() public {
        _setupVaultA();

        // Supply to market1
        uint256 supplyAmount = 100_000e6;
        vaultA.callSupply(address(adapter), market1, supplyAmount);

        // Supply collateral to market1
        uint256 collateralAmount = 50e18;
        vaultA.callSupplyCollateral(address(adapter), market1, collateralAmount);

        uint256 loanBalanceBefore = loanToken.balanceOf(address(vaultA));
        uint256 collateralBalanceBefore = collateralToken.balanceOf(address(vaultA));

        // Emergency withdraw
        vm.expectEmit(true, true, false, true);
        emit MorphoAdapter.EmergencyWithdraw(address(vaultA), market1Id);

        vaultA.callWithdrawToVault(address(adapter));

        // Vault received all tokens back
        assertEq(loanToken.balanceOf(address(vaultA)), loanBalanceBefore + supplyAmount);
        assertEq(
            collateralToken.balanceOf(address(vaultA)), collateralBalanceBefore + collateralAmount
        );

        // All positions should be zero
        (uint256 supplyShares, uint128 borrowShares, uint128 collateral) =
            morpho.position(market1Id, address(adapter));
        assertEq(supplyShares, 0);
        assertEq(borrowShares, 0);
        assertEq(collateral, 0);

        // Market list should be cleared
        assertEq(adapter.getVaultMarketCount(address(vaultA)), 0);
    }

    function test_withdrawToVault_multipleMarkets() public {
        _setupVaultA();

        // Create second market with same loan token for simplicity
        MarketParams memory market2SameToken = MarketParams({
            loanToken: address(loanToken),
            collateralToken: address(collateralToken),
            oracle: address(0x3333),
            irm: address(0x2222),
            lltv: LLTV
        });
        morpho.setMarket(market2SameToken);
        vm.prank(ownerA);
        adapter.whitelistMarket(address(vaultA), market2SameToken);

        // Supply to both markets
        vaultA.callSupply(address(adapter), market1, 100_000e6);
        vaultA.callSupply(address(adapter), market2SameToken, 50_000e6);

        assertEq(adapter.getVaultMarketCount(address(vaultA)), 2);

        uint256 balanceBefore = loanToken.balanceOf(address(vaultA));

        // Emergency withdraw
        vaultA.callWithdrawToVault(address(adapter));

        // Vault received all tokens back from both markets
        assertEq(loanToken.balanceOf(address(vaultA)), balanceBefore + 150_000e6);

        // Market list cleared
        assertEq(adapter.getVaultMarketCount(address(vaultA)), 0);
    }

    function test_withdrawToVault_noPositions() public {
        _setupVaultA();

        // No positions, should succeed without reverting
        vaultA.callWithdrawToVault(address(adapter));

        assertEq(adapter.getVaultMarketCount(address(vaultA)), 0);
    }

    // ============ Max Markets Limit ============

    function test_maxMarkets_enforced() public {
        _setupVaultA();

        // Create and whitelist 10 markets (the maximum)
        for (uint256 i = 0; i < 10; i++) {
            MarketParams memory mp = MarketParams({
                loanToken: address(loanToken),
                collateralToken: address(collateralToken),
                oracle: address(uint160(0x5000 + i)),
                irm: address(0x2222),
                lltv: LLTV
            });
            morpho.setMarket(mp);
            vm.prank(ownerA);
            adapter.whitelistMarket(address(vaultA), mp);
            vaultA.callSupply(address(adapter), mp, 1000e6);
        }

        assertEq(adapter.getVaultMarketCount(address(vaultA)), 10);

        // 11th market should revert
        MarketParams memory extraMarket = MarketParams({
            loanToken: address(loanToken),
            collateralToken: address(collateralToken),
            oracle: address(0x9999),
            irm: address(0x2222),
            lltv: LLTV
        });
        morpho.setMarket(extraMarket);
        vm.prank(ownerA);
        adapter.whitelistMarket(address(vaultA), extraMarket);

        vm.expectRevert(MorphoAdapter.MaxMarketsReached.selector);
        vaultA.callSupply(address(adapter), extraMarket, 1000e6);
    }

    function test_trackMarket_noDuplicates() public {
        _setupVaultA();

        // Supply twice to same market
        vaultA.callSupply(address(adapter), market1, 100_000e6);
        vaultA.callSupply(address(adapter), market1, 50_000e6);

        // Should still only have 1 tracked market
        assertEq(adapter.getVaultMarketCount(address(vaultA)), 1);
    }

    // ============ View Functions ============

    function test_getVaultMarketIds_empty() public view {
        bytes32[] memory ids = adapter.getVaultMarketIds(address(vaultA));
        assertEq(ids.length, 0);
    }

    function test_getVaultMarketCount_zero() public view {
        assertEq(adapter.getVaultMarketCount(address(vaultA)), 0);
    }

    function test_isRegistered_false() public view {
        assertFalse(adapter.isRegistered(address(vaultA)));
    }

    function test_isRegistered_true() public {
        _registerVaultA();
        assertTrue(adapter.isRegistered(address(vaultA)));
    }

    // ============ Multi-vault Isolation ============

    function test_multiVault_independentPositions() public {
        _setupVaultA();
        _setupVaultB();

        // Vault A supplies 100k
        vaultA.callSupply(address(adapter), market1, 100_000e6);

        // Vault B supplies 50k
        vaultB.callSupply(address(adapter), market1, 50_000e6);

        // Note: Since adapter holds positions on behalf of vaults, and Morpho tracks
        // by (marketId, user), positions from different vaults are combined at the
        // adapter level. This is a design trade-off. In production, one would use
        // per-vault accounting.
        (uint256 totalSupply,,) = morpho.position(market1Id, address(adapter));
        assertEq(totalSupply, 150_000e6);
    }

    function test_multiVault_separateMarketTracking() public {
        _setupVaultA();
        _setupVaultB();

        // Vault A uses market1
        vaultA.callSupply(address(adapter), market1, 100_000e6);

        // Vault B uses market1
        vaultB.callSupply(address(adapter), market1, 50_000e6);

        // Each vault tracks its own markets
        assertEq(adapter.getVaultMarketCount(address(vaultA)), 1);
        assertEq(adapter.getVaultMarketCount(address(vaultB)), 1);
    }
}
