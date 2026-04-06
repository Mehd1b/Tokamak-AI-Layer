// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import { AaveV3Adapter, IPool, IRewardsController } from "../src/adapters/AaveV3Adapter.sol";
import { IAaveV3Adapter } from "../src/interfaces/IAaveV3Adapter.sol";
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

/// @notice Mock Aave V3 Pool that simulates supply/withdraw/borrow/repay
contract MockPool {
    // Track supplied amounts per (user, asset)
    mapping(address => mapping(address => uint256)) public supplied;

    // Track borrowed amounts per (user, asset)
    mapping(address => mapping(address => uint256)) public borrowed;

    // Configurable health factor for testing
    uint256 public mockHealthFactor = type(uint256).max;

    // Total collateral and debt for getUserAccountData
    uint256 public mockTotalCollateral = 0;
    uint256 public mockTotalDebt = 0;

    function setMockHealthFactor(uint256 hf) external {
        mockHealthFactor = hf;
    }

    function setMockAccountData(uint256 collateral, uint256 debt) external {
        mockTotalCollateral = collateral;
        mockTotalDebt = debt;
    }

    function supply(address asset, uint256 amount, address onBehalfOf, uint16 /* referralCode */ )
        external
    {
        // Pull tokens from caller (the adapter)
        MockERC20Token(asset).transferFrom(msg.sender, address(this), amount);
        supplied[onBehalfOf][asset] += amount;
    }

    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        address user = msg.sender;
        uint256 available = supplied[user][asset];
        if (available == 0) return 0;

        uint256 toWithdraw = amount == type(uint256).max ? available : amount;
        if (toWithdraw > available) toWithdraw = available;

        supplied[user][asset] -= toWithdraw;
        MockERC20Token(asset).transfer(to, toWithdraw);
        return toWithdraw;
    }

    function borrow(
        address asset,
        uint256 amount,
        uint256, /* interestRateMode */
        uint16, /* referralCode */
        address onBehalfOf
    ) external {
        borrowed[onBehalfOf][asset] += amount;
        // Transfer borrowed tokens to caller (the adapter)
        MockERC20Token(asset).transfer(msg.sender, amount);
    }

    function repay(address asset, uint256 amount, uint256, /* interestRateMode */ address onBehalfOf)
        external
        returns (uint256)
    {
        // Pull tokens from caller (the adapter)
        MockERC20Token(asset).transferFrom(msg.sender, address(this), amount);
        uint256 debt = borrowed[onBehalfOf][asset];
        uint256 repaid = amount > debt ? debt : amount;
        borrowed[onBehalfOf][asset] -= repaid;
        return repaid;
    }

    function getUserAccountData(address /* user */ )
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        )
    {
        return (mockTotalCollateral, mockTotalDebt, 0, 8000, 7500, mockHealthFactor);
    }
}

/// @notice Mock Aave V3 Rewards Controller
contract MockRewardsController {
    // Configurable reward amount
    uint256 public mockRewardAmount = 0;
    address public mockRewardToken;

    function setMockReward(address token, uint256 amount) external {
        mockRewardToken = token;
        mockRewardAmount = amount;
    }

    function claimAllRewards(address[] calldata, /* assets */ address to)
        external
        returns (address[] memory rewardsList, uint256[] memory claimedAmounts)
    {
        rewardsList = new address[](1);
        claimedAmounts = new uint256[](1);

        if (mockRewardAmount > 0 && mockRewardToken != address(0)) {
            rewardsList[0] = mockRewardToken;
            claimedAmounts[0] = mockRewardAmount;
            // Transfer reward tokens to the recipient
            MockERC20Token(mockRewardToken).transfer(to, mockRewardAmount);
        }

        return (rewardsList, claimedAmounts);
    }
}

/// @notice Mock VaultFactory that tracks deployed vaults
contract MockVaultFactory {
    mapping(address => bool) public isDeployedVault;

    function setVaultDeployed(address vault, bool deployed) external {
        isDeployedVault[vault] = deployed;
    }
}

/// @notice Mock KernelVault with an owner for testing
contract MockKernelVault {
    address public owner;

    constructor(address _owner) {
        owner = _owner;
    }

    // Allow the vault to approve tokens to the adapter
    function approveToken(address token, address spender, uint256 amount) external {
        MockERC20Token(token).approve(spender, amount);
    }

    // Allow external calls from the vault (simulates CALL action)
    function callAdapter(address adapter, bytes calldata data) external returns (bytes memory) {
        (bool success, bytes memory returnData) = adapter.call(data);
        require(success, string(returnData));
        return returnData;
    }
}

// ============================================================================
// Test Contract
// ============================================================================

contract AaveV3AdapterTest is Test {
    // ============ State ============

    AaveV3Adapter public adapter;
    MockPool public mockPool;
    MockRewardsController public mockRewards;
    MockVaultFactory public mockFactory;
    MockKernelVault public vault;
    MockERC20Token public usdc;
    MockERC20Token public weth;
    MockERC20Token public rewardToken;

    address public vaultOwner = address(0xBEEF);
    address public attacker = address(0xDEAD);

    uint256 public constant DEFAULT_MIN_HF = 1.5e18;
    uint256 public constant SUPPLY_AMOUNT = 1000e6; // 1000 USDC
    uint256 public constant BORROW_AMOUNT = 500e6; // 500 USDC

    // ============ Setup ============

    function setUp() public {
        // Deploy mocks
        usdc = new MockERC20Token("USD Coin", "USDC", 6);
        weth = new MockERC20Token("Wrapped ETH", "WETH", 18);
        rewardToken = new MockERC20Token("Aave Token", "AAVE", 18);
        mockPool = new MockPool();
        mockRewards = new MockRewardsController();
        mockFactory = new MockVaultFactory();

        // Deploy adapter
        adapter = new AaveV3Adapter(
            address(mockPool), address(mockRewards), address(mockFactory), DEFAULT_MIN_HF
        );

        // Deploy mock vault
        vault = new MockKernelVault(vaultOwner);

        // Register vault in factory
        mockFactory.setVaultDeployed(address(vault), true);

        // Register vault in adapter (as vault owner)
        vm.prank(vaultOwner);
        adapter.registerVault(address(vault));

        // Set allowed assets (as vault owner)
        vm.startPrank(vaultOwner);
        adapter.setAllowedAsset(address(vault), address(usdc), true);
        adapter.setAllowedAsset(address(vault), address(weth), true);
        vm.stopPrank();

        // Fund the vault with tokens
        usdc.mint(address(vault), 10_000e6);
        weth.mint(address(vault), 100e18);

        // Fund the pool with tokens for borrows and withdrawals
        usdc.mint(address(mockPool), 100_000e6);
        weth.mint(address(mockPool), 1000e18);

        // Fund rewards controller with reward tokens
        rewardToken.mint(address(mockRewards), 1000e18);

        // Approve adapter from vault
        vault.approveToken(address(usdc), address(adapter), type(uint256).max);
        vault.approveToken(address(weth), address(adapter), type(uint256).max);
    }

    // ============ Constructor Tests ============

    function test_constructor_setsImmutables() public view {
        assertEq(address(adapter.pool()), address(mockPool));
        assertEq(address(adapter.rewardsController()), address(mockRewards));
        assertEq(adapter.vaultFactory(), address(mockFactory));
        assertEq(adapter.minHealthFactor(), DEFAULT_MIN_HF);
    }

    function test_constructor_revertsOnZeroPool() public {
        vm.expectRevert(IAaveV3Adapter.ZeroAddress.selector);
        new AaveV3Adapter(address(0), address(mockRewards), address(mockFactory), DEFAULT_MIN_HF);
    }

    function test_constructor_revertsOnZeroRewards() public {
        vm.expectRevert(IAaveV3Adapter.ZeroAddress.selector);
        new AaveV3Adapter(address(mockPool), address(0), address(mockFactory), DEFAULT_MIN_HF);
    }

    function test_constructor_revertsOnZeroFactory() public {
        vm.expectRevert(IAaveV3Adapter.ZeroAddress.selector);
        new AaveV3Adapter(address(mockPool), address(mockRewards), address(0), DEFAULT_MIN_HF);
    }

    function test_constructor_revertsOnLowHealthFactor() public {
        vm.expectRevert("min HF must be >= 1.0");
        new AaveV3Adapter(address(mockPool), address(mockRewards), address(mockFactory), 0.5e18);
    }

    // ============ Registration Tests ============

    function test_registerVault_success() public {
        MockKernelVault newVault = new MockKernelVault(vaultOwner);
        mockFactory.setVaultDeployed(address(newVault), true);

        vm.prank(vaultOwner);
        adapter.registerVault(address(newVault));

        assertTrue(adapter.isRegistered(address(newVault)));
    }

    function test_registerVault_emitsEvent() public {
        MockKernelVault newVault = new MockKernelVault(vaultOwner);
        mockFactory.setVaultDeployed(address(newVault), true);

        vm.expectEmit(true, true, false, true);
        emit IAaveV3Adapter.VaultRegistered(address(newVault), vaultOwner);

        vm.prank(vaultOwner);
        adapter.registerVault(address(newVault));
    }

    function test_registerVault_revertsZeroAddress() public {
        vm.expectRevert(IAaveV3Adapter.ZeroAddress.selector);
        vm.prank(vaultOwner);
        adapter.registerVault(address(0));
    }

    function test_registerVault_revertsNotDeployedByFactory() public {
        MockKernelVault newVault = new MockKernelVault(vaultOwner);
        // NOT registered in factory

        vm.expectRevert(IAaveV3Adapter.VaultNotDeployedByFactory.selector);
        vm.prank(vaultOwner);
        adapter.registerVault(address(newVault));
    }

    function test_registerVault_revertsNotVaultOwner() public {
        MockKernelVault newVault = new MockKernelVault(vaultOwner);
        mockFactory.setVaultDeployed(address(newVault), true);

        vm.expectRevert(IAaveV3Adapter.NotVaultOwner.selector);
        vm.prank(attacker); // Not the vault owner
        adapter.registerVault(address(newVault));
    }

    function test_registerVault_revertsDoubleRegistration() public {
        // vault is already registered in setUp()
        vm.expectRevert(IAaveV3Adapter.VaultAlreadyRegistered.selector);
        vm.prank(vaultOwner);
        adapter.registerVault(address(vault));
    }

    // ============ Asset Allowance Tests ============

    function test_setAllowedAsset_success() public {
        address newAsset = address(0x1234);

        vm.prank(vaultOwner);
        adapter.setAllowedAsset(address(vault), newAsset, true);

        assertTrue(adapter.isAssetAllowed(address(vault), newAsset));
    }

    function test_setAllowedAsset_canDisallow() public {
        assertTrue(adapter.isAssetAllowed(address(vault), address(usdc)));

        vm.prank(vaultOwner);
        adapter.setAllowedAsset(address(vault), address(usdc), false);

        assertFalse(adapter.isAssetAllowed(address(vault), address(usdc)));
    }

    function test_setAllowedAsset_revertsNotVaultOwner() public {
        vm.expectRevert(IAaveV3Adapter.NotVaultOwner.selector);
        vm.prank(attacker);
        adapter.setAllowedAsset(address(vault), address(usdc), true);
    }

    function test_setAllowedAsset_revertsZeroAsset() public {
        vm.expectRevert(IAaveV3Adapter.ZeroAddress.selector);
        vm.prank(vaultOwner);
        adapter.setAllowedAsset(address(vault), address(0), true);
    }

    // ============ Supply Tests ============

    function test_supply_success() public {
        vm.prank(address(vault));
        adapter.supply(address(usdc), SUPPLY_AMOUNT);

        // Verify tokens moved from vault to pool
        assertEq(usdc.balanceOf(address(vault)), 10_000e6 - SUPPLY_AMOUNT);
        assertEq(mockPool.supplied(address(adapter), address(usdc)), SUPPLY_AMOUNT);
    }

    function test_supply_emitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit IAaveV3Adapter.Supplied(address(vault), address(usdc), SUPPLY_AMOUNT);

        vm.prank(address(vault));
        adapter.supply(address(usdc), SUPPLY_AMOUNT);
    }

    function test_supply_tracksAsset() public {
        vm.prank(address(vault));
        adapter.supply(address(usdc), SUPPLY_AMOUNT);

        address[] memory assets = adapter.getSuppliedAssets(address(vault));
        assertEq(assets.length, 1);
        assertEq(assets[0], address(usdc));
    }

    function test_supply_noDuplicateTracking() public {
        vm.startPrank(address(vault));
        adapter.supply(address(usdc), SUPPLY_AMOUNT);
        adapter.supply(address(usdc), SUPPLY_AMOUNT);
        vm.stopPrank();

        address[] memory assets = adapter.getSuppliedAssets(address(vault));
        assertEq(assets.length, 1); // Should not duplicate
    }

    function test_supply_revertsZeroAmount() public {
        vm.expectRevert(IAaveV3Adapter.ZeroAmount.selector);
        vm.prank(address(vault));
        adapter.supply(address(usdc), 0);
    }

    function test_supply_revertsAssetNotAllowed() public {
        address randomAsset = address(0x9999);

        vm.expectRevert(abi.encodeWithSelector(IAaveV3Adapter.AssetNotAllowed.selector, randomAsset));
        vm.prank(address(vault));
        adapter.supply(randomAsset, SUPPLY_AMOUNT);
    }

    function test_supply_revertsUnregisteredVault() public {
        vm.expectRevert(IAaveV3Adapter.VaultNotRegistered.selector);
        vm.prank(attacker); // Not a registered vault
        adapter.supply(address(usdc), SUPPLY_AMOUNT);
    }

    // ============ Withdraw Tests ============

    function test_withdraw_success() public {
        // First supply
        vm.prank(address(vault));
        adapter.supply(address(usdc), SUPPLY_AMOUNT);

        uint256 vaultBalBefore = usdc.balanceOf(address(vault));

        // Then withdraw
        vm.prank(address(vault));
        adapter.withdraw(address(usdc), SUPPLY_AMOUNT);

        // Vault should have received the tokens back
        assertEq(usdc.balanceOf(address(vault)), vaultBalBefore + SUPPLY_AMOUNT);
        assertEq(mockPool.supplied(address(adapter), address(usdc)), 0);
    }

    function test_withdraw_emitsEvent() public {
        vm.prank(address(vault));
        adapter.supply(address(usdc), SUPPLY_AMOUNT);

        vm.expectEmit(true, true, false, true);
        emit IAaveV3Adapter.Withdrawn(address(vault), address(usdc), SUPPLY_AMOUNT);

        vm.prank(address(vault));
        adapter.withdraw(address(usdc), SUPPLY_AMOUNT);
    }

    function test_withdraw_revertsZeroAmount() public {
        vm.expectRevert(IAaveV3Adapter.ZeroAmount.selector);
        vm.prank(address(vault));
        adapter.withdraw(address(usdc), 0);
    }

    function test_withdraw_revertsUnregisteredVault() public {
        vm.expectRevert(IAaveV3Adapter.VaultNotRegistered.selector);
        vm.prank(attacker);
        adapter.withdraw(address(usdc), SUPPLY_AMOUNT);
    }

    function test_withdraw_revertsAssetNotAllowed() public {
        address randomAsset = address(0x9999);

        vm.expectRevert(abi.encodeWithSelector(IAaveV3Adapter.AssetNotAllowed.selector, randomAsset));
        vm.prank(address(vault));
        adapter.withdraw(randomAsset, SUPPLY_AMOUNT);
    }

    function test_withdraw_revertsWhenNothingSupplied() public {
        // No supply, direct withdraw should revert with WithdrawFailed (zero returned)
        vm.expectRevert(IAaveV3Adapter.WithdrawFailed.selector);
        vm.prank(address(vault));
        adapter.withdraw(address(usdc), SUPPLY_AMOUNT);
    }

    // ============ Borrow Tests ============

    function test_borrow_success() public {
        // First supply collateral
        vm.prank(address(vault));
        adapter.supply(address(usdc), SUPPLY_AMOUNT);

        // Health factor is still max (no debt yet in mock)
        uint256 vaultBalBefore = usdc.balanceOf(address(vault));

        vm.prank(address(vault));
        adapter.borrow(address(usdc), BORROW_AMOUNT, 2); // variable rate

        // Vault should have received the borrowed tokens
        assertEq(usdc.balanceOf(address(vault)), vaultBalBefore + BORROW_AMOUNT);
        assertEq(mockPool.borrowed(address(adapter), address(usdc)), BORROW_AMOUNT);
    }

    function test_borrow_emitsEvent() public {
        vm.prank(address(vault));
        adapter.supply(address(usdc), SUPPLY_AMOUNT);

        vm.expectEmit(true, true, false, true);
        emit IAaveV3Adapter.Borrowed(address(vault), address(usdc), BORROW_AMOUNT, 2);

        vm.prank(address(vault));
        adapter.borrow(address(usdc), BORROW_AMOUNT, 2);
    }

    function test_borrow_revertsHealthFactorTooLow() public {
        // Set health factor below minimum BEFORE borrow
        mockPool.setMockHealthFactor(1.2e18); // Below 1.5e18 minimum

        vm.prank(address(vault));
        adapter.supply(address(usdc), SUPPLY_AMOUNT);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAaveV3Adapter.HealthFactorTooLow.selector, 1.2e18, DEFAULT_MIN_HF
            )
        );
        vm.prank(address(vault));
        adapter.borrow(address(usdc), BORROW_AMOUNT, 2);
    }

    function test_borrow_succeedsAtExactMinHealthFactor() public {
        // Set health factor exactly at minimum
        mockPool.setMockHealthFactor(DEFAULT_MIN_HF);

        vm.prank(address(vault));
        adapter.supply(address(usdc), SUPPLY_AMOUNT);

        // Should not revert — exactly at threshold
        vm.prank(address(vault));
        adapter.borrow(address(usdc), BORROW_AMOUNT, 2);

        assertEq(mockPool.borrowed(address(adapter), address(usdc)), BORROW_AMOUNT);
    }

    function test_borrow_revertsZeroAmount() public {
        vm.expectRevert(IAaveV3Adapter.ZeroAmount.selector);
        vm.prank(address(vault));
        adapter.borrow(address(usdc), 0, 2);
    }

    function test_borrow_revertsUnregisteredVault() public {
        vm.expectRevert(IAaveV3Adapter.VaultNotRegistered.selector);
        vm.prank(attacker);
        adapter.borrow(address(usdc), BORROW_AMOUNT, 2);
    }

    // ============ Repay Tests ============

    function test_repay_success() public {
        // Supply, then borrow
        vm.startPrank(address(vault));
        adapter.supply(address(usdc), SUPPLY_AMOUNT);
        adapter.borrow(address(usdc), BORROW_AMOUNT, 2);

        // Now repay
        adapter.repay(address(usdc), BORROW_AMOUNT, 2);
        vm.stopPrank();

        assertEq(mockPool.borrowed(address(adapter), address(usdc)), 0);
    }

    function test_repay_emitsEvent() public {
        vm.startPrank(address(vault));
        adapter.supply(address(usdc), SUPPLY_AMOUNT);
        adapter.borrow(address(usdc), BORROW_AMOUNT, 2);

        vm.expectEmit(true, true, false, true);
        emit IAaveV3Adapter.Repaid(address(vault), address(usdc), BORROW_AMOUNT, 2);

        adapter.repay(address(usdc), BORROW_AMOUNT, 2);
        vm.stopPrank();
    }

    function test_repay_revertsZeroAmount() public {
        vm.expectRevert(IAaveV3Adapter.ZeroAmount.selector);
        vm.prank(address(vault));
        adapter.repay(address(usdc), 0, 2);
    }

    // ============ Claim Rewards Tests ============

    function test_claimRewards_success() public {
        uint256 rewardAmount = 10e18;
        mockRewards.setMockReward(address(rewardToken), rewardAmount);

        address[] memory assets = new address[](1);
        assets[0] = address(usdc);

        vm.prank(address(vault));
        adapter.claimRewards(assets);

        // Vault should have received reward tokens
        assertEq(rewardToken.balanceOf(address(vault)), rewardAmount);
    }

    function test_claimRewards_emitsEvent() public {
        uint256 rewardAmount = 10e18;
        mockRewards.setMockReward(address(rewardToken), rewardAmount);

        address[] memory assets = new address[](1);
        assets[0] = address(usdc);

        vm.expectEmit(true, false, false, false);
        emit IAaveV3Adapter.RewardsClaimed(address(vault), assets, rewardAmount);

        vm.prank(address(vault));
        adapter.claimRewards(assets);
    }

    function test_claimRewards_revertsUnregisteredVault() public {
        address[] memory assets = new address[](1);
        assets[0] = address(usdc);

        vm.expectRevert(IAaveV3Adapter.VaultNotRegistered.selector);
        vm.prank(attacker);
        adapter.claimRewards(assets);
    }

    // ============ WithdrawToVault (Emergency) Tests ============

    function test_withdrawToVault_withdrawsAllSupplied() public {
        // Supply two different assets
        vm.startPrank(address(vault));
        adapter.supply(address(usdc), SUPPLY_AMOUNT);
        adapter.supply(address(weth), 10e18);
        vm.stopPrank();

        uint256 usdcBefore = usdc.balanceOf(address(vault));
        uint256 wethBefore = weth.balanceOf(address(vault));

        vm.prank(address(vault));
        adapter.withdrawToVault();

        // All supplied assets should be returned to vault
        assertEq(usdc.balanceOf(address(vault)), usdcBefore + SUPPLY_AMOUNT);
        assertEq(weth.balanceOf(address(vault)), wethBefore + 10e18);
    }

    function test_withdrawToVault_emitsEvent() public {
        vm.prank(address(vault));
        adapter.supply(address(usdc), SUPPLY_AMOUNT);

        vm.expectEmit(true, false, false, true);
        emit IAaveV3Adapter.EmergencyWithdrawn(address(vault));

        vm.prank(address(vault));
        adapter.withdrawToVault();
    }

    function test_withdrawToVault_revertsUnregisteredVault() public {
        vm.expectRevert(IAaveV3Adapter.VaultNotRegistered.selector);
        vm.prank(attacker);
        adapter.withdrawToVault();
    }

    function test_withdrawToVault_handlesNoSuppliedAssets() public {
        // Call without having supplied anything — should not revert
        vm.prank(address(vault));
        adapter.withdrawToVault();
    }

    // ============ Health Factor Configuration Tests ============

    function test_setMinHealthFactor_success() public {
        uint256 newHF = 2e18;

        adapter.setMinHealthFactor(newHF);
        assertEq(adapter.minHealthFactor(), newHF);
    }

    function test_setMinHealthFactor_emitsEvent() public {
        uint256 newHF = 2e18;

        vm.expectEmit(false, false, false, true);
        emit IAaveV3Adapter.MinHealthFactorUpdated(DEFAULT_MIN_HF, newHF);

        adapter.setMinHealthFactor(newHF);
    }

    function test_setMinHealthFactor_revertsNotOwner() public {
        vm.expectRevert("not adapter owner");
        vm.prank(attacker);
        adapter.setMinHealthFactor(2e18);
    }

    function test_setMinHealthFactor_revertsBelowOne() public {
        vm.expectRevert("min HF must be >= 1.0");
        adapter.setMinHealthFactor(0.5e18);
    }

    // ============ View Function Tests ============

    function test_getHealthFactor_returnsPoolValue() public view {
        uint256 hf = adapter.getHealthFactor();
        assertEq(hf, type(uint256).max); // Default mock value
    }

    function test_getHealthFactor_reflectsChanges() public {
        mockPool.setMockHealthFactor(1.8e18);
        assertEq(adapter.getHealthFactor(), 1.8e18);
    }

    function test_isRegistered_true() public view {
        assertTrue(adapter.isRegistered(address(vault)));
    }

    function test_isRegistered_false() public view {
        assertFalse(adapter.isRegistered(attacker));
    }

    function test_isAssetAllowed_true() public view {
        assertTrue(adapter.isAssetAllowed(address(vault), address(usdc)));
    }

    function test_isAssetAllowed_false() public view {
        assertFalse(adapter.isAssetAllowed(address(vault), address(0x1234)));
    }

    // ============ Integration / Multi-Step Tests ============

    function test_fullLendingCycle() public {
        // 1. Supply collateral
        vm.startPrank(address(vault));
        adapter.supply(address(usdc), SUPPLY_AMOUNT);

        // 2. Borrow against collateral
        adapter.borrow(address(usdc), BORROW_AMOUNT, 2);

        // 3. Repay debt
        adapter.repay(address(usdc), BORROW_AMOUNT, 2);

        // 4. Withdraw collateral
        adapter.withdraw(address(usdc), SUPPLY_AMOUNT);
        vm.stopPrank();

        // All debt should be cleared
        assertEq(mockPool.borrowed(address(adapter), address(usdc)), 0);
        assertEq(mockPool.supplied(address(adapter), address(usdc)), 0);
    }

    function test_multiAssetSupplyAndEmergencyWithdraw() public {
        uint256 usdcInitial = usdc.balanceOf(address(vault));
        uint256 wethInitial = weth.balanceOf(address(vault));

        // Supply multiple assets
        vm.startPrank(address(vault));
        adapter.supply(address(usdc), SUPPLY_AMOUNT);
        adapter.supply(address(weth), 5e18);

        // Verify balances decreased
        assertEq(usdc.balanceOf(address(vault)), usdcInitial - SUPPLY_AMOUNT);
        assertEq(weth.balanceOf(address(vault)), wethInitial - 5e18);

        // Emergency withdraw all
        adapter.withdrawToVault();
        vm.stopPrank();

        // Verify balances restored
        assertEq(usdc.balanceOf(address(vault)), usdcInitial);
        assertEq(weth.balanceOf(address(vault)), wethInitial);
    }

    /// @notice Verify that a second vault cannot call functions reserved for registered vaults
    function test_unauthorizedVault_cannotSupply() public {
        MockKernelVault maliciousVault = new MockKernelVault(attacker);

        // Not registered — should fail
        vm.expectRevert(IAaveV3Adapter.VaultNotRegistered.selector);
        vm.prank(address(maliciousVault));
        adapter.supply(address(usdc), SUPPLY_AMOUNT);
    }

    /// @notice Verify health factor enforcement with a realistic scenario
    function test_borrow_healthFactorEnforcement_justAboveThreshold() public {
        // Set HF to just above threshold
        mockPool.setMockHealthFactor(1.5e18 + 1);

        vm.startPrank(address(vault));
        adapter.supply(address(usdc), SUPPLY_AMOUNT);
        adapter.borrow(address(usdc), BORROW_AMOUNT, 2); // Should succeed
        vm.stopPrank();
    }

    function test_borrow_healthFactorEnforcement_justBelowThreshold() public {
        // Set HF to just below threshold
        mockPool.setMockHealthFactor(1.5e18 - 1);

        vm.prank(address(vault));
        adapter.supply(address(usdc), SUPPLY_AMOUNT);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAaveV3Adapter.HealthFactorTooLow.selector, 1.5e18 - 1, DEFAULT_MIN_HF
            )
        );
        vm.prank(address(vault));
        adapter.borrow(address(usdc), BORROW_AMOUNT, 2);
    }
}
