// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console2 } from "forge-std/Test.sol";
import { MetaVault, IKernelVaultLike } from "../src/MetaVault.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// ============ Mock Contracts ============

/// @title MockERC20MV
/// @notice Simple ERC20 for MetaVault tests (avoids collision with existing MockERC20)
contract MockERC20MV {
    string public name;
    string public symbol;
    uint8 public decimals;

    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 currentAllowance = _allowances[from][msg.sender];
        if (currentAllowance != type(uint256).max) {
            require(currentAllowance >= amount, "ERC20: insufficient allowance");
            unchecked {
                _allowances[from][msg.sender] = currentAllowance - amount;
            }
        }
        _transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        _allowances[msg.sender][spender] = amount;
        return true;
    }

    function allowance(address _owner, address spender) external view returns (uint256) {
        return _allowances[_owner][spender];
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(_balances[from] >= amount, "ERC20: insufficient balance");
        unchecked {
            _balances[from] -= amount;
            _balances[to] += amount;
        }
    }

    function mint(address to, uint256 amount) external {
        _totalSupply += amount;
        _balances[to] += amount;
    }
}

/// @title MockKernelVault
/// @notice Simplified KernelVault mock for MetaVault tests.
///         Implements deposit/withdraw/shares with the same virtual offset math.
contract MockKernelVault {
    IERC20 public asset;
    uint256 public totalShares;
    mapping(address => uint256) public shares;

    uint256 internal constant _DECIMALS_OFFSET = 1e3;

    constructor(address _asset) {
        asset = IERC20(_asset);
    }

    function depositERC20Tokens(uint256 assets) external returns (uint256 sharesMinted) {
        uint256 ta = totalAssets();

        uint256 balBefore = asset.balanceOf(address(this));
        asset.transferFrom(msg.sender, address(this), assets);
        uint256 actualReceived = asset.balanceOf(address(this)) - balBefore;

        sharesMinted = (actualReceived * (totalShares + _DECIMALS_OFFSET)) / (ta + 1);
        require(sharesMinted > 0, "zero shares");

        shares[msg.sender] += sharesMinted;
        totalShares += sharesMinted;
    }

    function withdraw(uint256 shareAmount) external returns (uint256 assetsOut) {
        require(shares[msg.sender] >= shareAmount, "insufficient shares");

        uint256 ta = totalAssets();
        assetsOut = (shareAmount * (ta + 1)) / (totalShares + _DECIMALS_OFFSET);
        require(assetsOut > 0, "zero assets out");

        shares[msg.sender] -= shareAmount;
        totalShares -= shareAmount;

        asset.transfer(msg.sender, assetsOut);
    }

    function totalAssets() public view returns (uint256) {
        return asset.balanceOf(address(this));
    }

    /// @notice Mirror of KernelVault.effectiveTotalAssets. Mock has no strategy
    ///         mode so effective == live.
    function effectiveTotalAssets() external view returns (uint256) {
        return totalAssets();
    }

    function simulateGain(uint256 amount) external {
        MockERC20MV(address(asset)).mint(address(this), amount);
    }

    function simulateLoss(uint256 amount) external {
        asset.transfer(address(1), amount);
    }
}

/// @title MockVaultFactory
/// @notice Minimal mock of VaultFactory for MetaVault tests
contract MockVaultFactory {
    mapping(address => bool) public isDeployedVault;

    function setDeployedVault(address vault, bool deployed) external {
        isDeployedVault[vault] = deployed;
    }

    function registry() external pure returns (address) { return address(0); }
    function verifier() external pure returns (address) { return address(0); }
    function vaultCreationCodeStore() external pure returns (address) { return address(0); }
    function optimisticVaultCreationCodeStore() external pure returns (address) { return address(0); }
    function getAllVaults() external pure returns (address[] memory) {
        return new address[](0);
    }
    function vaultCount() external pure returns (uint256) { return 0; }
    function vaultAt(uint256) external pure returns (address) { return address(0); }
    function getAgentVaults(bytes32) external pure returns (address[] memory) {
        return new address[](0);
    }
    function computeVaultAddress(address, bytes32, address, bytes32)
        external pure returns (address, bytes32)
    {
        return (address(0), bytes32(0));
    }
    function deployVault(bytes32, address, bytes32, bytes32)
        external pure returns (address)
    {
        return address(0);
    }
    function computeOptimisticVaultAddress(address, bytes32, address, bytes32, uint256)
        external pure returns (address, bytes32)
    {
        return (address(0), bytes32(0));
    }
    function deployOptimisticVault(bytes32, address, bytes32, bytes32, uint256, uint256)
        external pure returns (address)
    {
        return address(0);
    }
    function vaultProtocolType(address) external pure returns (uint8) { return 0; }
    function setVaultProtocolType(address, uint8) external { }
    function registerExternalVault(address, bytes32) external { }
}

// ============ Test Contract ============

/// @title MetaVaultTest
/// @notice Comprehensive test suite for MetaVault (30+ tests)
contract MetaVaultTest is Test {
    MetaVault public metaVault;
    MockERC20MV public token;
    MockVaultFactory public factory;
    MockKernelVault public vaultA;
    MockKernelVault public vaultB;
    MockKernelVault public vaultC;

    address public owner = address(this);
    address public user1 = address(0x1111);
    address public user2 = address(0x2222);
    address public user3 = address(0x3333);

    uint256 public constant INITIAL_BALANCE = 1_000_000e18;
    uint256 public constant DEPOSIT_AMOUNT = 100_000e18;

    uint256 internal constant OFFSET = 1e3;

    function setUp() public {
        token = new MockERC20MV("USD Coin", "USDC", 18);
        factory = new MockVaultFactory();

        vaultA = new MockKernelVault(address(token));
        vaultB = new MockKernelVault(address(token));
        vaultC = new MockKernelVault(address(token));

        factory.setDeployedVault(address(vaultA), true);
        factory.setDeployedVault(address(vaultB), true);
        factory.setDeployedVault(address(vaultC), true);

        metaVault = new MetaVault(address(token), address(factory), owner);

        token.mint(user1, INITIAL_BALANCE);
        token.mint(user2, INITIAL_BALANCE);
        token.mint(user3, INITIAL_BALANCE);

        vm.prank(user1);
        token.approve(address(metaVault), type(uint256).max);
        vm.prank(user2);
        token.approve(address(metaVault), type(uint256).max);
        vm.prank(user3);
        token.approve(address(metaVault), type(uint256).max);
    }

    // ============ Helpers ============

    /// @notice Add three vaults with 4000/3000/3000 split (sums to 10000, all <= 4000)
    function _addThreeVaults() internal {
        metaVault.addVault(address(vaultA), 4000);
        metaVault.addVault(address(vaultB), 3000);
        metaVault.addVault(address(vaultC), 3000);
    }

    /// @notice Build a standard 3-vault weight array
    function _threeVaultArrays()
        internal
        view
        returns (address[] memory vaults, uint256[] memory weights)
    {
        vaults = new address[](3);
        weights = new uint256[](3);
        vaults[0] = address(vaultA);
        vaults[1] = address(vaultB);
        vaults[2] = address(vaultC);
        weights[0] = 4000;
        weights[1] = 3000;
        weights[2] = 3000;
    }

    /// @notice Add vaults, deposit, and rebalance with default 40/30/30 weights
    function _depositAndRebalance(uint256 amount) internal {
        _addThreeVaults();
        vm.prank(user1);
        metaVault.deposit(amount);
        (address[] memory v, uint256[] memory w) = _threeVaultArrays();
        metaVault.rebalance(v, w);
    }

    // ============ Constructor Tests ============

    function test_constructor_setsImmutables() public view {
        assertEq(address(metaVault.baseAsset()), address(token));
        assertEq(address(metaVault.vaultFactory()), address(factory));
        assertEq(metaVault.owner(), owner);
    }

    function test_constructor_revertsOnZeroBaseAsset() public {
        vm.expectRevert(MetaVault.ZeroAddress.selector);
        new MetaVault(address(0), address(factory), owner);
    }

    function test_constructor_revertsOnZeroFactory() public {
        vm.expectRevert(MetaVault.ZeroAddress.selector);
        new MetaVault(address(token), address(0), owner);
    }

    function test_constructor_revertsOnZeroOwner() public {
        vm.expectRevert(MetaVault.ZeroAddress.selector);
        new MetaVault(address(token), address(factory), address(0));
    }

    // ============ Deposit Tests ============

    function test_deposit_firstDeposit_mintsCorrectShares() public {
        vm.prank(user1);
        uint256 sharesOut = metaVault.deposit(DEPOSIT_AMOUNT);

        uint256 expectedShares = DEPOSIT_AMOUNT * OFFSET;
        assertEq(sharesOut, expectedShares);
        assertEq(metaVault.shares(user1), expectedShares);
        assertEq(metaVault.totalShares(), expectedShares);
    }

    function test_deposit_secondDeposit_fairSharesBasedOnNav() public {
        vm.prank(user1);
        metaVault.deposit(DEPOSIT_AMOUNT);

        uint256 totalSharesAfterFirst = metaVault.totalShares();
        uint256 navAfterFirst = metaVault.getNav();

        vm.prank(user2);
        uint256 sharesOut = metaVault.deposit(DEPOSIT_AMOUNT);

        uint256 expectedShares =
            (DEPOSIT_AMOUNT * (totalSharesAfterFirst + OFFSET)) / (navAfterFirst + 1);
        assertEq(sharesOut, expectedShares);
    }

    function test_deposit_revertsOnZeroAmount() public {
        vm.prank(user1);
        vm.expectRevert(MetaVault.ZeroDeposit.selector);
        metaVault.deposit(0);
    }

    function test_deposit_updatesNavCorrectly() public {
        vm.prank(user1);
        metaVault.deposit(DEPOSIT_AMOUNT);

        assertEq(metaVault.getNav(), DEPOSIT_AMOUNT);
    }

    function test_deposit_emitsEvent() public {
        uint256 expectedShares = DEPOSIT_AMOUNT * OFFSET;

        vm.expectEmit(true, false, false, true);
        emit MetaVault.Deposit(user1, DEPOSIT_AMOUNT, expectedShares);

        vm.prank(user1);
        metaVault.deposit(DEPOSIT_AMOUNT);
    }

    function test_deposit_doesNotAutoAllocate() public {
        _addThreeVaults();

        vm.prank(user1);
        metaVault.deposit(DEPOSIT_AMOUNT);

        (, uint256[] memory vals) = metaVault.getUnderlyingAllocations();
        for (uint256 i = 0; i < vals.length; i++) {
            assertEq(vals[i], 0);
        }
        assertEq(token.balanceOf(address(metaVault)), DEPOSIT_AMOUNT);
    }

    // ============ Withdraw Tests ============

    function test_withdraw_fromIdleBalance() public {
        vm.prank(user1);
        metaVault.deposit(DEPOSIT_AMOUNT);

        uint256 totalSharesMinted = metaVault.shares(user1);
        uint256 balBefore = token.balanceOf(user1);

        vm.prank(user1);
        uint256 assetsOut = metaVault.withdraw(totalSharesMinted);

        uint256 balAfter = token.balanceOf(user1);
        assertEq(balAfter - balBefore, assetsOut);
        assertEq(metaVault.shares(user1), 0);
        assertEq(metaVault.totalShares(), 0);
    }

    function test_withdraw_partialShares() public {
        vm.prank(user1);
        metaVault.deposit(DEPOSIT_AMOUNT);

        uint256 totalSharesMinted = metaVault.shares(user1);
        uint256 halfShares = totalSharesMinted / 2;

        vm.prank(user1);
        uint256 assetsOut = metaVault.withdraw(halfShares);

        assertApproxEqAbs(assetsOut, DEPOSIT_AMOUNT / 2, 2);
        assertEq(metaVault.shares(user1), totalSharesMinted - halfShares);
    }

    function test_withdraw_revertsOnZeroShares() public {
        vm.prank(user1);
        vm.expectRevert(MetaVault.ZeroShares.selector);
        metaVault.withdraw(0);
    }

    function test_withdraw_revertsOnInsufficientShares() public {
        vm.prank(user1);
        metaVault.deposit(DEPOSIT_AMOUNT);

        uint256 userShares = metaVault.shares(user1);
        vm.prank(user1);
        vm.expectRevert(
            abi.encodeWithSelector(
                MetaVault.InsufficientShares.selector, userShares + 1, userShares
            )
        );
        metaVault.withdraw(userShares + 1);
    }

    function test_withdraw_fromUnderlyingVaults_whenNoIdleBalance() public {
        _depositAndRebalance(DEPOSIT_AMOUNT);

        uint256 userShares = metaVault.shares(user1);
        uint256 balBefore = token.balanceOf(user1);

        vm.prank(user1);
        uint256 assetsOut = metaVault.withdraw(userShares);

        uint256 balAfter = token.balanceOf(user1);
        assertEq(balAfter - balBefore, assetsOut);
        assertApproxEqAbs(assetsOut, DEPOSIT_AMOUNT, DEPOSIT_AMOUNT / 1000);
    }

    function test_withdraw_emitsEvent() public {
        vm.prank(user1);
        metaVault.deposit(DEPOSIT_AMOUNT);

        uint256 userShares = metaVault.shares(user1);

        vm.expectEmit(true, false, false, false);
        emit MetaVault.Withdraw(user1, 0, 0);

        vm.prank(user1);
        metaVault.withdraw(userShares);
    }

    // ============ Rebalance Tests ============

    function test_rebalance_allocatesFundsCorrectly() public {
        _addThreeVaults();

        vm.prank(user1);
        metaVault.deposit(DEPOSIT_AMOUNT);

        (address[] memory v, uint256[] memory w) = _threeVaultArrays();
        metaVault.rebalance(v, w);

        (, uint256[] memory vals) = metaVault.getUnderlyingAllocations();
        assertEq(vals.length, 3);
        // vaultA = 40%, vaultB = 30%, vaultC = 30%
        assertApproxEqAbs(vals[0], DEPOSIT_AMOUNT * 4000 / 10000, DEPOSIT_AMOUNT / 100);
        assertApproxEqAbs(vals[1], DEPOSIT_AMOUNT * 3000 / 10000, DEPOSIT_AMOUNT / 100);
        assertApproxEqAbs(vals[2], DEPOSIT_AMOUNT * 3000 / 10000, DEPOSIT_AMOUNT / 100);
    }

    function test_rebalance_enforceCooldown() public {
        _addThreeVaults();

        vm.prank(user1);
        metaVault.deposit(DEPOSIT_AMOUNT);

        (address[] memory v, uint256[] memory w) = _threeVaultArrays();
        metaVault.rebalance(v, w);

        vm.expectRevert(
            abi.encodeWithSelector(
                MetaVault.RebalanceCooldown.selector,
                block.timestamp + 1 hours,
                block.timestamp
            )
        );
        metaVault.rebalance(v, w);
    }

    function test_rebalance_succeedsAfterCooldown() public {
        _addThreeVaults();

        vm.prank(user1);
        metaVault.deposit(DEPOSIT_AMOUNT);

        (address[] memory v, uint256[] memory w) = _threeVaultArrays();
        metaVault.rebalance(v, w);

        vm.warp(block.timestamp + 1 hours + 1);

        // Shift weights
        w[0] = 3000;
        w[1] = 4000;
        w[2] = 3000;

        metaVault.rebalance(v, w);

        assertEq(metaVault.targetWeights(address(vaultA)), 3000);
        assertEq(metaVault.targetWeights(address(vaultB)), 4000);
    }

    function test_rebalance_revertsOnArrayLengthMismatch() public {
        _addThreeVaults();

        address[] memory v = new address[](3);
        uint256[] memory w = new uint256[](2);
        v[0] = address(vaultA);
        v[1] = address(vaultB);
        v[2] = address(vaultC);
        w[0] = 4000;
        w[1] = 3000;

        vm.expectRevert(MetaVault.ArrayLengthMismatch.selector);
        metaVault.rebalance(v, w);
    }

    function test_rebalance_revertsOnNonOwner() public {
        _addThreeVaults();
        (address[] memory v, uint256[] memory w) = _threeVaultArrays();

        vm.prank(user1);
        vm.expectRevert(MetaVault.NotOwner.selector);
        metaVault.rebalance(v, w);
    }

    function test_rebalance_revertsOnWeightSumMismatch() public {
        _addThreeVaults();

        (address[] memory v,) = _threeVaultArrays();
        uint256[] memory w = new uint256[](3);
        w[0] = 4000;
        w[1] = 3000;
        w[2] = 2000; // sum = 9000

        vm.expectRevert(
            abi.encodeWithSelector(MetaVault.WeightSumMismatch.selector, 9000, 10000)
        );
        metaVault.rebalance(v, w);
    }

    function test_rebalance_revertsOnVaultNotWhitelisted() public {
        _addThreeVaults();

        address[] memory v = new address[](3);
        uint256[] memory w = new uint256[](3);
        v[0] = address(vaultA);
        v[1] = address(vaultB);
        v[2] = address(0xDEAD); // not whitelisted
        w[0] = 4000;
        w[1] = 3000;
        w[2] = 3000;

        vm.expectRevert(
            abi.encodeWithSelector(MetaVault.VaultNotWhitelisted.selector, address(0xDEAD))
        );
        metaVault.rebalance(v, w);
    }

    function test_rebalance_navSlippageGuard() public {
        _depositAndRebalance(DEPOSIT_AMOUNT);

        // Simulate loss > 2% after the first rebalance
        uint256 navBefore = metaVault.getNav();
        uint256 lossAmount = (navBefore * 300) / 10000; // 3% loss
        vaultA.simulateLoss(lossAmount);

        vm.warp(block.timestamp + 1 hours + 1);

        // The NAV has already dropped before rebalance is called, so navBefore (inside
        // rebalance) will be the lower value. The rebalance itself shouldn't cause
        // additional > 2% drop, so it should succeed.
        (address[] memory v, uint256[] memory w) = _threeVaultArrays();
        metaVault.rebalance(v, w);
    }

    function test_rebalance_emitsEvent() public {
        _addThreeVaults();

        vm.prank(user1);
        metaVault.deposit(DEPOSIT_AMOUNT);

        (address[] memory v, uint256[] memory w) = _threeVaultArrays();

        vm.expectEmit(false, false, false, false);
        emit MetaVault.Rebalanced(0, 0, 0);

        metaVault.rebalance(v, w);
    }

    function test_rebalance_weightsExceedMaxPerVault() public {
        _addThreeVaults();

        (address[] memory v,) = _threeVaultArrays();
        uint256[] memory w = new uint256[](3);
        w[0] = 4001; // exceeds 4000 max
        w[1] = 3000;
        w[2] = 2999;

        vm.expectRevert(
            abi.encodeWithSelector(MetaVault.WeightExceedsMax.selector, 4001)
        );
        metaVault.rebalance(v, w);
    }

    // ============ Add Vault Tests ============

    function test_addVault_success() public {
        metaVault.addVault(address(vaultA), 3000);

        assertTrue(metaVault.isUnderlyingVault(address(vaultA)));
        assertEq(metaVault.targetWeights(address(vaultA)), 3000);
        assertEq(metaVault.getUnderlyingVaultCount(), 1);
    }

    function test_addVault_revertsOnNonOwner() public {
        vm.prank(user1);
        vm.expectRevert(MetaVault.NotOwner.selector);
        metaVault.addVault(address(vaultA), 3000);
    }

    function test_addVault_revertsOnNotFactoryDeployed() public {
        MockKernelVault rogue = new MockKernelVault(address(token));

        vm.expectRevert(
            abi.encodeWithSelector(MetaVault.VaultNotFactoryDeployed.selector, address(rogue))
        );
        metaVault.addVault(address(rogue), 3000);
    }

    function test_addVault_revertsOnAlreadyAdded() public {
        metaVault.addVault(address(vaultA), 3000);

        vm.expectRevert(
            abi.encodeWithSelector(MetaVault.VaultAlreadyAdded.selector, address(vaultA))
        );
        metaVault.addVault(address(vaultA), 3000);
    }

    function test_addVault_revertsOnWeightExceedsMax() public {
        vm.expectRevert(
            abi.encodeWithSelector(MetaVault.WeightExceedsMax.selector, 4001)
        );
        metaVault.addVault(address(vaultA), 4001);
    }

    function test_addVault_revertsOnAssetMismatch() public {
        MockERC20MV otherToken = new MockERC20MV("Other", "OTH", 18);
        MockKernelVault wrongAssetVault = new MockKernelVault(address(otherToken));
        factory.setDeployedVault(address(wrongAssetVault), true);

        vm.expectRevert(
            abi.encodeWithSelector(MetaVault.VaultAssetMismatch.selector, address(wrongAssetVault))
        );
        metaVault.addVault(address(wrongAssetVault), 3000);
    }

    function test_addVault_revertsOnZeroAddress() public {
        vm.expectRevert(MetaVault.ZeroAddress.selector);
        metaVault.addVault(address(0), 3000);
    }

    function test_addVault_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit MetaVault.VaultAdded(address(vaultA), 3000);

        metaVault.addVault(address(vaultA), 3000);
    }

    function test_addVault_atMaxWeight() public {
        // 4000 bps is exactly at the cap -- should succeed
        metaVault.addVault(address(vaultA), 4000);
        assertEq(metaVault.targetWeights(address(vaultA)), 4000);
    }

    // ============ Remove Vault Tests ============

    function test_removeVault_success() public {
        metaVault.addVault(address(vaultA), 3000);
        metaVault.removeVault(address(vaultA));

        assertFalse(metaVault.isUnderlyingVault(address(vaultA)));
        assertEq(metaVault.targetWeights(address(vaultA)), 0);
        assertEq(metaVault.getUnderlyingVaultCount(), 0);
    }

    function test_removeVault_revertsOnNonOwner() public {
        metaVault.addVault(address(vaultA), 3000);

        vm.prank(user1);
        vm.expectRevert(MetaVault.NotOwner.selector);
        metaVault.removeVault(address(vaultA));
    }

    function test_removeVault_revertsOnNotWhitelisted() public {
        vm.expectRevert(
            abi.encodeWithSelector(MetaVault.VaultNotWhitelisted.selector, address(vaultA))
        );
        metaVault.removeVault(address(vaultA));
    }

    function test_removeVault_revertsWhenAllocationExists() public {
        _depositAndRebalance(DEPOSIT_AMOUNT);

        vm.expectRevert(); // VaultHasAllocation
        metaVault.removeVault(address(vaultA));
    }

    function test_removeVault_emitsEvent() public {
        metaVault.addVault(address(vaultA), 3000);

        vm.expectEmit(true, false, false, false);
        emit MetaVault.VaultRemoved(address(vaultA));

        metaVault.removeVault(address(vaultA));
    }

    function test_removeVault_fromMiddleOfArray() public {
        _addThreeVaults();

        metaVault.removeVault(address(vaultB));

        assertEq(metaVault.getUnderlyingVaultCount(), 2);
        assertFalse(metaVault.isUnderlyingVault(address(vaultB)));
        assertTrue(metaVault.isUnderlyingVault(address(vaultA)));
        assertTrue(metaVault.isUnderlyingVault(address(vaultC)));
    }

    // ============ Max Allocation Cap (40%) Tests ============

    function test_maxAllocationCap_rebalanceRejectsOverweight() public {
        _addThreeVaults();

        (address[] memory v,) = _threeVaultArrays();
        uint256[] memory w = new uint256[](3);
        w[0] = 4001; // over 4000 max
        w[1] = 3000;
        w[2] = 2999;

        vm.expectRevert(
            abi.encodeWithSelector(MetaVault.WeightExceedsMax.selector, 4001)
        );
        metaVault.rebalance(v, w);
    }

    // ============ Weight Sum Validation Tests ============

    function test_weightSumValidation_mustEqual10000() public {
        _addThreeVaults();

        (address[] memory v,) = _threeVaultArrays();
        uint256[] memory w = new uint256[](3);
        w[0] = 3000;
        w[1] = 3000;
        w[2] = 3000; // sum = 9000

        vm.expectRevert(
            abi.encodeWithSelector(MetaVault.WeightSumMismatch.selector, 9000, 10000)
        );
        metaVault.rebalance(v, w);
    }

    // ============ Multi-Depositor Fairness Tests ============

    function test_multiDepositor_fairShareDilution() public {
        vm.prank(user1);
        metaVault.deposit(DEPOSIT_AMOUNT);

        uint256 user1Shares = metaVault.shares(user1);

        vm.prank(user2);
        metaVault.deposit(DEPOSIT_AMOUNT);

        uint256 user2Shares = metaVault.shares(user2);

        assertApproxEqAbs(user1Shares, user2Shares, 2);
    }

    function test_multiDepositor_withdrawalsAreFair() public {
        vm.prank(user1);
        metaVault.deposit(DEPOSIT_AMOUNT);

        vm.prank(user2);
        metaVault.deposit(DEPOSIT_AMOUNT);

        uint256 user1Shares = metaVault.shares(user1);
        uint256 user2Shares = metaVault.shares(user2);

        vm.prank(user1);
        uint256 assets1 = metaVault.withdraw(user1Shares);

        vm.prank(user2);
        uint256 assets2 = metaVault.withdraw(user2Shares);

        assertApproxEqAbs(assets1, assets2, 2);
        assertApproxEqAbs(assets1, DEPOSIT_AMOUNT, 2);
    }

    function test_multiDepositor_lateDepositorGetsFewerSharesAfterGain() public {
        _addThreeVaults();

        vm.prank(user1);
        metaVault.deposit(DEPOSIT_AMOUNT);

        (address[] memory v, uint256[] memory w) = _threeVaultArrays();
        metaVault.rebalance(v, w);

        // Simulate gain in vaultA
        vaultA.simulateGain(10_000e18);

        uint256 navAfterGain = metaVault.getNav();
        assertTrue(navAfterGain > DEPOSIT_AMOUNT);

        // User2 deposits the same nominal amount
        vm.prank(user2);
        metaVault.deposit(DEPOSIT_AMOUNT);

        // User2 should get fewer shares because NAV increased
        assertTrue(metaVault.shares(user2) < metaVault.shares(user1));
    }

    // ============ NAV Calculation Tests ============

    function test_nav_emptyVault() public view {
        assertEq(metaVault.getNav(), 0);
    }

    function test_nav_withIdleBalance() public {
        vm.prank(user1);
        metaVault.deposit(DEPOSIT_AMOUNT);

        assertEq(metaVault.getNav(), DEPOSIT_AMOUNT);
    }

    function test_nav_withUnderlyingAllocations() public {
        _depositAndRebalance(DEPOSIT_AMOUNT);

        uint256 nav = metaVault.getNav();
        assertApproxEqAbs(nav, DEPOSIT_AMOUNT, DEPOSIT_AMOUNT / 1000);
    }

    function test_nav_afterUnderlyingGain() public {
        _depositAndRebalance(DEPOSIT_AMOUNT);

        uint256 gain = 5_000e18;
        vaultA.simulateGain(gain);

        uint256 nav = metaVault.getNav();
        assertApproxEqAbs(nav, DEPOSIT_AMOUNT + gain, DEPOSIT_AMOUNT / 100);
    }

    function test_nav_afterUnderlyingLoss() public {
        _depositAndRebalance(DEPOSIT_AMOUNT);

        uint256 loss = 5_000e18;
        vaultA.simulateLoss(loss);

        uint256 nav = metaVault.getNav();
        assertApproxEqAbs(nav, DEPOSIT_AMOUNT - loss, DEPOSIT_AMOUNT / 100);
    }

    // ============ Edge Case Tests ============

    function test_edgeCase_firstDeposit_noExistingShares() public {
        assertEq(metaVault.totalShares(), 0);
        assertEq(metaVault.getNav(), 0);

        vm.prank(user1);
        uint256 sharesOut = metaVault.deposit(1e18);

        assertEq(sharesOut, 1e21);
    }

    function test_edgeCase_withdrawWhenAllFundsInUnderlyings() public {
        _depositAndRebalance(DEPOSIT_AMOUNT);

        uint256 idle = token.balanceOf(address(metaVault));
        assertTrue(idle < DEPOSIT_AMOUNT / 100);

        uint256 userShares = metaVault.shares(user1);
        uint256 balBefore = token.balanceOf(user1);

        vm.prank(user1);
        metaVault.withdraw(userShares);

        uint256 balAfter = token.balanceOf(user1);
        assertApproxEqAbs(balAfter - balBefore, DEPOSIT_AMOUNT, DEPOSIT_AMOUNT / 100);
    }

    function test_edgeCase_smallDeposit() public {
        token.mint(user1, 1);
        vm.prank(user1);
        uint256 sharesOut = metaVault.deposit(1);

        assertEq(sharesOut, 1000);
    }

    function test_edgeCase_withdrawAfterGain_getsMore() public {
        _depositAndRebalance(DEPOSIT_AMOUNT);

        uint256 gain = 10_000e18;
        vaultA.simulateGain(gain);

        uint256 userShares = metaVault.shares(user1);
        uint256 balBefore = token.balanceOf(user1);

        vm.prank(user1);
        metaVault.withdraw(userShares);

        uint256 balAfter = token.balanceOf(user1);
        uint256 received = balAfter - balBefore;

        assertTrue(received > DEPOSIT_AMOUNT);
        assertApproxEqAbs(received, DEPOSIT_AMOUNT + gain, DEPOSIT_AMOUNT / 100);
    }

    function test_edgeCase_withdrawAfterLoss_getsLess() public {
        _depositAndRebalance(DEPOSIT_AMOUNT);

        uint256 loss = 10_000e18;
        vaultA.simulateLoss(loss);

        uint256 userShares = metaVault.shares(user1);
        uint256 balBefore = token.balanceOf(user1);

        vm.prank(user1);
        metaVault.withdraw(userShares);

        uint256 balAfter = token.balanceOf(user1);
        uint256 received = balAfter - balBefore;

        assertTrue(received < DEPOSIT_AMOUNT);
        assertApproxEqAbs(received, DEPOSIT_AMOUNT - loss, DEPOSIT_AMOUNT / 100);
    }

    // ============ GetUnderlyingAllocations Tests ============

    function test_getUnderlyingAllocations_empty() public view {
        (address[] memory addrs, uint256[] memory vals) = metaVault.getUnderlyingAllocations();
        assertEq(addrs.length, 0);
        assertEq(vals.length, 0);
    }

    function test_getUnderlyingAllocations_afterRebalance() public {
        _depositAndRebalance(DEPOSIT_AMOUNT);

        (address[] memory addrs, uint256[] memory vals) = metaVault.getUnderlyingAllocations();
        assertEq(addrs.length, 3);
        assertEq(addrs[0], address(vaultA));
        assertEq(addrs[1], address(vaultB));
        assertEq(addrs[2], address(vaultC));
        assertTrue(vals[0] > 0);
        assertTrue(vals[1] > 0);
        assertTrue(vals[2] > 0);
    }

    // ============ Three-Vault Rebalance Tests ============

    function test_rebalance_threeVaults() public {
        _addThreeVaults();

        vm.prank(user1);
        metaVault.deposit(DEPOSIT_AMOUNT);

        (address[] memory v, uint256[] memory w) = _threeVaultArrays();
        metaVault.rebalance(v, w);

        (, uint256[] memory vals) = metaVault.getUnderlyingAllocations();
        assertEq(vals.length, 3);

        uint256 totalAlloc = vals[0] + vals[1] + vals[2];
        assertApproxEqAbs(totalAlloc, DEPOSIT_AMOUNT, DEPOSIT_AMOUNT / 100);
    }

    function test_rebalance_weightShift() public {
        _addThreeVaults();

        vm.prank(user1);
        metaVault.deposit(DEPOSIT_AMOUNT);

        (address[] memory v, uint256[] memory w) = _threeVaultArrays();
        metaVault.rebalance(v, w);

        (, uint256[] memory valsBefore) = metaVault.getUnderlyingAllocations();
        assertTrue(valsBefore[0] > valsBefore[2]); // vaultA (40%) > vaultC (30%)

        vm.warp(block.timestamp + 1 hours + 1);

        // Shift: vaultA 20% -> vaultC 40%
        w[0] = 2000;
        w[1] = 4000;
        w[2] = 4000;

        metaVault.rebalance(v, w);

        (, uint256[] memory valsAfter) = metaVault.getUnderlyingAllocations();
        assertTrue(valsAfter[2] > valsAfter[0]); // vaultC > vaultA now
    }

    // ============ Multiple Deposits and Withdrawals ============

    function test_multipleDepositorsAndWithdrawals() public {
        _addThreeVaults();

        vm.prank(user1);
        metaVault.deposit(DEPOSIT_AMOUNT);
        vm.prank(user2);
        metaVault.deposit(DEPOSIT_AMOUNT * 2);
        vm.prank(user3);
        metaVault.deposit(DEPOSIT_AMOUNT / 2);

        uint256 totalDeposited = DEPOSIT_AMOUNT + DEPOSIT_AMOUNT * 2 + DEPOSIT_AMOUNT / 2;
        assertEq(metaVault.getNav(), totalDeposited);

        (address[] memory v, uint256[] memory w) = _threeVaultArrays();
        metaVault.rebalance(v, w);

        // User2 (largest depositor) withdraws
        uint256 user2Shares = metaVault.shares(user2);
        uint256 bal2Before = token.balanceOf(user2);

        vm.prank(user2);
        metaVault.withdraw(user2Shares);

        uint256 received2 = token.balanceOf(user2) - bal2Before;
        assertApproxEqAbs(received2, DEPOSIT_AMOUNT * 2, DEPOSIT_AMOUNT / 50);
    }
}
