// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import { UniswapV4Adapter, ISwapRouter, INonfungiblePositionManager } from
    "../src/adapters/UniswapV4Adapter.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// ============================================================================
// Mock Contracts
// ============================================================================

/// @notice Mock ERC20 token for testing
contract MockERC20 {
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

/// @notice Mock Swap Router that simulates Uniswap V4 exact input single swaps
contract MockSwapRouter {
    /// @notice Exchange rate multiplier (numerator / denominator) for output calculation
    uint256 public rateNumerator = 1;
    uint256 public rateDenominator = 1;

    /// @notice Whether to revert on swap (simulates slippage failure)
    bool public shouldRevert;

    function setRate(uint256 numerator, uint256 denominator) external {
        rateNumerator = numerator;
        rateDenominator = denominator;
    }

    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    function exactInputSingle(ISwapRouter.ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut)
    {
        require(!shouldRevert, "MockSwapRouter: forced revert");

        // Pull tokenIn from caller
        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);

        // Calculate output based on rate
        amountOut = (params.amountIn * rateNumerator) / rateDenominator;

        // Check minimum output (replicate router behavior)
        require(amountOut >= params.amountOutMinimum, "Too little received");

        // Mint/transfer tokenOut to recipient
        MockERC20(params.tokenOut).mint(params.recipient, amountOut);
    }
}

/// @notice Mock Nonfungible Position Manager for testing liquidity operations
contract MockPositionManager {
    uint256 public nextTokenId = 1;

    struct Position {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        address owner;
    }

    mapping(uint256 => Position) internal _positions;

    /// @notice Accumulated fees per position (for testing collectFees)
    mapping(uint256 => uint256) public accruedFees0;
    mapping(uint256 => uint256) public accruedFees1;

    function setAccruedFees(uint256 tokenId, uint256 fees0, uint256 fees1) external {
        accruedFees0[tokenId] = fees0;
        accruedFees1[tokenId] = fees1;
    }

    function mint(INonfungiblePositionManager.MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        tokenId = nextTokenId++;

        // Pull tokens from caller
        if (params.amount0Desired > 0) {
            IERC20(params.token0).transferFrom(msg.sender, address(this), params.amount0Desired);
        }
        if (params.amount1Desired > 0) {
            IERC20(params.token1).transferFrom(msg.sender, address(this), params.amount1Desired);
        }

        // Calculate liquidity (simplified: liquidity = min(amount0, amount1) or sum)
        liquidity = uint128(params.amount0Desired + params.amount1Desired);
        amount0 = params.amount0Desired;
        amount1 = params.amount1Desired;

        // Store position
        _positions[tokenId] = Position({
            token0: params.token0,
            token1: params.token1,
            fee: params.fee,
            tickLower: params.tickLower,
            tickUpper: params.tickUpper,
            liquidity: liquidity,
            owner: params.recipient
        });
    }

    function decreaseLiquidity(INonfungiblePositionManager.DecreaseLiquidityParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1)
    {
        Position storage pos = _positions[params.tokenId];
        require(pos.liquidity >= params.liquidity, "Insufficient liquidity");

        // Calculate proportional amounts
        amount0 = (uint256(params.liquidity) * 1e18) / 2e18; // Simplified: half goes to each token
        amount1 = (uint256(params.liquidity) * 1e18) / 2e18;

        // Ensure minimums are met
        require(amount0 >= params.amount0Min, "amount0 below min");
        require(amount1 >= params.amount1Min, "amount1 below min");

        pos.liquidity -= params.liquidity;
    }

    function collect(INonfungiblePositionManager.CollectParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1)
    {
        Position storage pos = _positions[params.tokenId];

        // Return accrued fees + any amounts from decreaseLiquidity
        amount0 = accruedFees0[params.tokenId];
        amount1 = accruedFees1[params.tokenId];

        // Reset accrued fees
        accruedFees0[params.tokenId] = 0;
        accruedFees1[params.tokenId] = 0;

        // Mint tokens to recipient (simulates transfer)
        if (amount0 > 0) {
            MockERC20(pos.token0).mint(params.recipient, amount0);
        }
        if (amount1 > 0) {
            MockERC20(pos.token1).mint(params.recipient, amount1);
        }
    }

    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        )
    {
        Position memory pos = _positions[tokenId];
        nonce = 0;
        operator = address(0);
        token0 = pos.token0;
        token1 = pos.token1;
        fee = pos.fee;
        tickLower = pos.tickLower;
        tickUpper = pos.tickUpper;
        liquidity = pos.liquidity;
        feeGrowthInside0LastX128 = 0;
        feeGrowthInside1LastX128 = 0;
        tokensOwed0 = uint128(accruedFees0[tokenId]);
        tokensOwed1 = uint128(accruedFees1[tokenId]);
    }

    function transferFrom(address, address, uint256) external pure {
        // No-op for testing
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
contract MockKernelVault {
    address public immutable owner;

    constructor(address _owner) {
        owner = _owner;
    }

    function approveToken(address token, address spender, uint256 amount) external {
        MockERC20(token).approve(spender, amount);
    }

    function callSwap(
        address adapter,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) external returns (uint256) {
        return UniswapV4Adapter(adapter).swap(tokenIn, tokenOut, amountIn, minAmountOut);
    }

    function callAddLiquidity(
        address adapter,
        address token0,
        address token1,
        uint24 fee,
        int24 tickLower,
        int24 tickUpper,
        uint256 amount0,
        uint256 amount1,
        uint256 minLiquidity
    ) external returns (uint256, uint128) {
        return UniswapV4Adapter(adapter).addLiquidity(
            token0, token1, fee, tickLower, tickUpper, amount0, amount1, minLiquidity
        );
    }

    function callRemoveLiquidity(
        address adapter,
        uint256 positionId,
        uint128 liquidity,
        uint256 minAmount0,
        uint256 minAmount1
    ) external returns (uint256, uint256) {
        return
            UniswapV4Adapter(adapter).removeLiquidity(positionId, liquidity, minAmount0, minAmount1);
    }

    function callCollectFees(address adapter, uint256 positionId)
        external
        returns (uint256, uint256)
    {
        return UniswapV4Adapter(adapter).collectFees(positionId);
    }

    function callWithdrawToVault(address adapter) external {
        UniswapV4Adapter(adapter).withdrawToVault();
    }
}

// ============================================================================
// Test Contract
// ============================================================================

contract UniswapV4AdapterTest is Test {
    UniswapV4Adapter public adapter;
    MockSwapRouter public router;
    MockPositionManager public posManager;
    MockVaultFactory public factory;

    MockERC20 public tokenA;
    MockERC20 public tokenB;

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
        router = new MockSwapRouter();
        posManager = new MockPositionManager();
        factory = new MockVaultFactory();

        tokenA = new MockERC20("Token A", "TKNA", 18);
        tokenB = new MockERC20("Token B", "TKNB", 18);

        // Deploy mock vaults
        vaultA = new MockKernelVault(ownerA);
        vaultB = new MockKernelVault(ownerB);

        // Register vaults in factory
        factory.setDeployedVault(address(vaultA), true);
        factory.setDeployedVault(address(vaultB), true);

        // Deploy canonical adapter
        adapter =
            new UniswapV4Adapter(address(router), address(posManager), address(factory));

        // Fund vaults with tokens
        tokenA.mint(address(vaultA), 1_000_000e18);
        tokenB.mint(address(vaultA), 1_000_000e18);
        tokenA.mint(address(vaultB), 500_000e18);
        tokenB.mint(address(vaultB), 500_000e18);

        // Approve adapter to spend vault tokens
        vaultA.approveToken(address(tokenA), address(adapter), type(uint256).max);
        vaultA.approveToken(address(tokenB), address(adapter), type(uint256).max);
        vaultB.approveToken(address(tokenA), address(adapter), type(uint256).max);
        vaultB.approveToken(address(tokenB), address(adapter), type(uint256).max);
    }

    // ============ Constructor ============

    function test_constructorSetsImmutables() public view {
        assertEq(adapter.swapRouter(), address(router));
        assertEq(adapter.positionManager(), address(posManager));
        assertEq(adapter.vaultFactory(), address(factory));
    }

    function test_constructorRevertsOnZeroRouter() public {
        vm.expectRevert(UniswapV4Adapter.ZeroAddress.selector);
        new UniswapV4Adapter(address(0), address(posManager), address(factory));
    }

    function test_constructorRevertsOnZeroPositionManager() public {
        vm.expectRevert(UniswapV4Adapter.ZeroAddress.selector);
        new UniswapV4Adapter(address(router), address(0), address(factory));
    }

    function test_constructorRevertsOnZeroFactory() public {
        vm.expectRevert(UniswapV4Adapter.ZeroAddress.selector);
        new UniswapV4Adapter(address(router), address(posManager), address(0));
    }

    // ============ Registration ============

    function test_registerVault_registers() public {
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));

        assertTrue(adapter.isRegistered(address(vaultA)), "Vault should be registered");
    }

    function test_registerVault_setsDefaults() public {
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));

        (bool registered, uint256 slippageBps, uint24 defaultFee) =
            adapter.vaultConfigs(address(vaultA));
        assertTrue(registered);
        assertEq(slippageBps, 100, "Default slippage should be 100 bps");
        assertEq(defaultFee, 3000, "Default fee should be 3000");
    }

    function test_registerVault_emitsEvent() public {
        vm.prank(ownerA);
        vm.expectEmit(true, false, false, true);
        emit UniswapV4Adapter.VaultRegistered(address(vaultA));
        adapter.registerVault(address(vaultA));
    }

    function test_registerVault_revertsIfNotOwner() public {
        vm.prank(nonOwner);
        vm.expectRevert(UniswapV4Adapter.NotVaultOwner.selector);
        adapter.registerVault(address(vaultA));
    }

    function test_registerVault_revertsIfAlreadyRegistered() public {
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));

        vm.prank(ownerA);
        vm.expectRevert(UniswapV4Adapter.VaultAlreadyRegistered.selector);
        adapter.registerVault(address(vaultA));
    }

    function test_registerVault_revertsIfNotFactoryVault() public {
        MockKernelVault fakeVault = new MockKernelVault(ownerA);
        // NOT registered in factory

        vm.prank(ownerA);
        vm.expectRevert(UniswapV4Adapter.VaultNotDeployedByFactory.selector);
        adapter.registerVault(address(fakeVault));
    }

    function test_registerVault_revertsOnZeroVault() public {
        vm.expectRevert(UniswapV4Adapter.ZeroAddress.selector);
        adapter.registerVault(address(0));
    }

    // ============ Swap ============

    function _registerVaultA() internal {
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));
    }

    function _registerVaultB() internal {
        vm.prank(ownerB);
        adapter.registerVault(address(vaultB));
    }

    function test_swap_executesSuccessfully() public {
        _registerVaultA();

        uint256 amountIn = 1000e18;
        uint256 minAmountOut = 990e18; // 1% slippage tolerance

        // Router returns 1:1 by default
        uint256 vaultABalanceBefore = tokenA.balanceOf(address(vaultA));

        uint256 amountOut = vaultA.callSwap(
            address(adapter), address(tokenA), address(tokenB), amountIn, minAmountOut
        );

        assertEq(amountOut, amountIn, "Should receive 1:1 output");
        assertEq(
            tokenA.balanceOf(address(vaultA)),
            vaultABalanceBefore - amountIn,
            "TokenA should be deducted"
        );
        assertEq(
            tokenB.balanceOf(address(vaultA)),
            1_000_000e18 + amountOut,
            "TokenB should be credited"
        );
    }

    function test_swap_emitsEvent() public {
        _registerVaultA();

        uint256 amountIn = 500e18;
        uint256 minAmountOut = 490e18;

        vm.expectEmit(true, true, true, true);
        emit UniswapV4Adapter.SwapExecuted(
            address(vaultA), address(tokenA), address(tokenB), amountIn, amountIn
        );

        vaultA.callSwap(
            address(adapter), address(tokenA), address(tokenB), amountIn, minAmountOut
        );
    }

    function test_swap_withSlippageGuard_reverts() public {
        _registerVaultA();

        // Set router to return 50% (2:1 rate means output = amountIn / 2)
        router.setRate(1, 2);

        uint256 amountIn = 1000e18;
        uint256 minAmountOut = 900e18; // Expecting at least 900, but will get 500

        vm.expectRevert("Too little received");
        vaultA.callSwap(
            address(adapter), address(tokenA), address(tokenB), amountIn, minAmountOut
        );
    }

    function test_swap_revertsIfNotRegistered() public {
        vm.prank(address(vaultA));
        vm.expectRevert(UniswapV4Adapter.VaultNotRegistered.selector);
        adapter.swap(address(tokenA), address(tokenB), 100e18, 90e18);
    }

    function test_swap_revertsOnZeroAmount() public {
        _registerVaultA();

        vm.prank(address(vaultA));
        vm.expectRevert(UniswapV4Adapter.ZeroAmount.selector);
        adapter.swap(address(tokenA), address(tokenB), 0, 0);
    }

    function test_swap_withCustomRate() public {
        _registerVaultA();

        // Set 2:1 rate (2 tokenB per tokenA)
        router.setRate(2, 1);

        uint256 amountIn = 100e18;
        uint256 minAmountOut = 190e18;

        uint256 amountOut = vaultA.callSwap(
            address(adapter), address(tokenA), address(tokenB), amountIn, minAmountOut
        );

        assertEq(amountOut, 200e18, "Should receive 2x output");
    }

    // ============ Add Liquidity ============

    function test_addLiquidity_mintsPosition() public {
        _registerVaultA();

        uint256 amount0 = 1000e18;
        uint256 amount1 = 1000e18;

        (uint256 positionId, uint128 liquidity) = vaultA.callAddLiquidity(
            address(adapter),
            address(tokenA),
            address(tokenB),
            3000, // 0.3% fee
            -887220, // tickLower
            887220, // tickUpper
            amount0,
            amount1,
            0 // minLiquidity
        );

        assertEq(positionId, 1, "First position should be ID 1");
        assertEq(liquidity, uint128(amount0 + amount1), "Liquidity should match");
        assertEq(adapter.positionOwner(positionId), address(vaultA), "Position owner should match");
        assertEq(adapter.getPositionCount(address(vaultA)), 1, "Should have 1 position");
    }

    function test_addLiquidity_emitsEvent() public {
        _registerVaultA();

        uint256 amount0 = 500e18;
        uint256 amount1 = 500e18;

        vm.expectEmit(true, true, false, true);
        emit UniswapV4Adapter.LiquidityAdded(
            address(vaultA), 1, uint128(amount0 + amount1), amount0, amount1
        );

        vaultA.callAddLiquidity(
            address(adapter),
            address(tokenA),
            address(tokenB),
            3000,
            -887220,
            887220,
            amount0,
            amount1,
            0
        );
    }

    function test_addLiquidity_tracksMultiplePositions() public {
        _registerVaultA();

        // Add 3 positions
        for (uint256 i = 0; i < 3; i++) {
            vaultA.callAddLiquidity(
                address(adapter),
                address(tokenA),
                address(tokenB),
                3000,
                -887220,
                887220,
                100e18,
                100e18,
                0
            );
        }

        assertEq(adapter.getPositionCount(address(vaultA)), 3, "Should have 3 positions");

        uint256[] memory positions = adapter.getVaultPositions(address(vaultA));
        assertEq(positions.length, 3);
        assertEq(positions[0], 1);
        assertEq(positions[1], 2);
        assertEq(positions[2], 3);
    }

    function test_addLiquidity_revertsOnMaxPositions() public {
        _registerVaultA();

        // Add MAX_POSITIONS_PER_VAULT positions
        for (uint256 i = 0; i < 10; i++) {
            vaultA.callAddLiquidity(
                address(adapter),
                address(tokenA),
                address(tokenB),
                3000,
                -887220,
                887220,
                10e18,
                10e18,
                0
            );
        }

        assertEq(adapter.getPositionCount(address(vaultA)), 10);

        // 11th position should revert
        vm.expectRevert(UniswapV4Adapter.MaxPositionsReached.selector);
        vaultA.callAddLiquidity(
            address(adapter),
            address(tokenA),
            address(tokenB),
            3000,
            -887220,
            887220,
            10e18,
            10e18,
            0
        );
    }

    function test_addLiquidity_revertsOnMinLiquidity() public {
        _registerVaultA();

        // Request liquidity of 100, but supply only yields 200 total (amount0+amount1)
        // Set minLiquidity higher than what will be minted
        vm.expectRevert("Insufficient liquidity minted");
        vaultA.callAddLiquidity(
            address(adapter),
            address(tokenA),
            address(tokenB),
            3000,
            -887220,
            887220,
            50e18,
            50e18,
            500e18 // minLiquidity > 100e18 (what mock will return)
        );
    }

    function test_addLiquidity_revertsIfNotRegistered() public {
        vm.prank(address(vaultA));
        vm.expectRevert(UniswapV4Adapter.VaultNotRegistered.selector);
        adapter.addLiquidity(address(tokenA), address(tokenB), 3000, -887220, 887220, 100e18, 100e18, 0);
    }

    // ============ Remove Liquidity ============

    function test_removeLiquidity_removesAndCollects() public {
        _registerVaultA();

        // Add position first
        (uint256 positionId, uint128 liquidity) = vaultA.callAddLiquidity(
            address(adapter),
            address(tokenA),
            address(tokenB),
            3000,
            -887220,
            887220,
            1000e18,
            1000e18,
            0
        );

        // Set some accrued fees
        posManager.setAccruedFees(positionId, 50e18, 30e18);

        // Remove all liquidity
        vaultA.callRemoveLiquidity(address(adapter), positionId, liquidity, 0, 0);

        // Position should be removed from tracking (fully closed)
        assertEq(adapter.getPositionCount(address(vaultA)), 0, "Position should be removed");
        assertEq(adapter.positionOwner(positionId), address(0), "Owner should be cleared");
    }

    function test_removeLiquidity_emitsEvent() public {
        _registerVaultA();

        (uint256 positionId, uint128 liquidity) = vaultA.callAddLiquidity(
            address(adapter),
            address(tokenA),
            address(tokenB),
            3000,
            -887220,
            887220,
            1000e18,
            1000e18,
            0
        );

        vm.expectEmit(true, true, false, false); // Check indexed params
        emit UniswapV4Adapter.LiquidityRemoved(address(vaultA), positionId, liquidity, 0, 0);

        vaultA.callRemoveLiquidity(address(adapter), positionId, liquidity, 0, 0);
    }

    function test_removeLiquidity_partialRemoval() public {
        _registerVaultA();

        (uint256 positionId, uint128 liquidity) = vaultA.callAddLiquidity(
            address(adapter),
            address(tokenA),
            address(tokenB),
            3000,
            -887220,
            887220,
            1000e18,
            1000e18,
            0
        );

        // Remove half the liquidity
        uint128 halfLiquidity = liquidity / 2;
        vaultA.callRemoveLiquidity(address(adapter), positionId, halfLiquidity, 0, 0);

        // Position should still be tracked (partial removal)
        assertEq(adapter.getPositionCount(address(vaultA)), 1, "Position should still exist");
        assertEq(adapter.positionOwner(positionId), address(vaultA), "Owner should be unchanged");
    }

    function test_removeLiquidity_revertsIfNotOwner() public {
        _registerVaultA();
        _registerVaultB();

        // Vault A adds a position
        (uint256 positionId,) = vaultA.callAddLiquidity(
            address(adapter),
            address(tokenA),
            address(tokenB),
            3000,
            -887220,
            887220,
            100e18,
            100e18,
            0
        );

        // Vault B tries to remove vault A's position
        vm.expectRevert(
            abi.encodeWithSelector(
                UniswapV4Adapter.PositionNotOwnedByVault.selector, positionId
            )
        );
        vaultB.callRemoveLiquidity(address(adapter), positionId, 100, 0, 0);
    }

    function test_removeLiquidity_revertsIfNotRegistered() public {
        vm.prank(address(vaultA));
        vm.expectRevert(UniswapV4Adapter.VaultNotRegistered.selector);
        adapter.removeLiquidity(1, 100, 0, 0);
    }

    // ============ Collect Fees ============

    function test_collectFees_collectsAccruedFees() public {
        _registerVaultA();

        // Add position
        (uint256 positionId,) = vaultA.callAddLiquidity(
            address(adapter),
            address(tokenA),
            address(tokenB),
            3000,
            -887220,
            887220,
            1000e18,
            1000e18,
            0
        );

        // Simulate accrued fees
        posManager.setAccruedFees(positionId, 100e18, 75e18);

        uint256 vaultBalanceA_before = tokenA.balanceOf(address(vaultA));
        uint256 vaultBalanceB_before = tokenB.balanceOf(address(vaultA));

        (uint256 amount0, uint256 amount1) = vaultA.callCollectFees(address(adapter), positionId);

        assertEq(amount0, 100e18, "Should collect 100 tokenA fees");
        assertEq(amount1, 75e18, "Should collect 75 tokenB fees");
        assertEq(
            tokenA.balanceOf(address(vaultA)),
            vaultBalanceA_before + 100e18,
            "Vault should receive tokenA fees"
        );
        assertEq(
            tokenB.balanceOf(address(vaultA)),
            vaultBalanceB_before + 75e18,
            "Vault should receive tokenB fees"
        );
    }

    function test_collectFees_emitsEvent() public {
        _registerVaultA();

        (uint256 positionId,) = vaultA.callAddLiquidity(
            address(adapter),
            address(tokenA),
            address(tokenB),
            3000,
            -887220,
            887220,
            1000e18,
            1000e18,
            0
        );

        posManager.setAccruedFees(positionId, 50e18, 25e18);

        vm.expectEmit(true, true, false, true);
        emit UniswapV4Adapter.FeesCollected(address(vaultA), positionId, 50e18, 25e18);

        vaultA.callCollectFees(address(adapter), positionId);
    }

    function test_collectFees_revertsIfNotPositionOwner() public {
        _registerVaultA();
        _registerVaultB();

        (uint256 positionId,) = vaultA.callAddLiquidity(
            address(adapter),
            address(tokenA),
            address(tokenB),
            3000,
            -887220,
            887220,
            100e18,
            100e18,
            0
        );

        vm.expectRevert(
            abi.encodeWithSelector(
                UniswapV4Adapter.PositionNotOwnedByVault.selector, positionId
            )
        );
        vaultB.callCollectFees(address(adapter), positionId);
    }

    function test_collectFees_revertsIfNotRegistered() public {
        vm.prank(address(vaultA));
        vm.expectRevert(UniswapV4Adapter.VaultNotRegistered.selector);
        adapter.collectFees(1);
    }

    // ============ withdrawToVault ============

    function test_withdrawToVault_removesAllPositions() public {
        _registerVaultA();

        // Add 3 positions
        for (uint256 i = 0; i < 3; i++) {
            vaultA.callAddLiquidity(
                address(adapter),
                address(tokenA),
                address(tokenB),
                3000,
                -887220,
                887220,
                100e18,
                100e18,
                0
            );
        }

        // Set some fees on position 2
        posManager.setAccruedFees(2, 10e18, 5e18);

        assertEq(adapter.getPositionCount(address(vaultA)), 3);

        vaultA.callWithdrawToVault(address(adapter));

        // All positions should be removed
        assertEq(adapter.getPositionCount(address(vaultA)), 0, "All positions should be removed");
        assertEq(adapter.positionOwner(1), address(0), "Position 1 owner should be cleared");
        assertEq(adapter.positionOwner(2), address(0), "Position 2 owner should be cleared");
        assertEq(adapter.positionOwner(3), address(0), "Position 3 owner should be cleared");
    }

    function test_withdrawToVault_emitsEvent() public {
        _registerVaultA();

        vaultA.callAddLiquidity(
            address(adapter),
            address(tokenA),
            address(tokenB),
            3000,
            -887220,
            887220,
            100e18,
            100e18,
            0
        );

        vm.expectEmit(true, false, false, true);
        emit UniswapV4Adapter.WithdrawnToVault(address(vaultA));

        vaultA.callWithdrawToVault(address(adapter));
    }

    function test_withdrawToVault_revertsIfNoPositions() public {
        _registerVaultA();

        vm.expectRevert(UniswapV4Adapter.NoPositionsToWithdraw.selector);
        vaultA.callWithdrawToVault(address(adapter));
    }

    function test_withdrawToVault_revertsIfNotRegistered() public {
        vm.prank(address(vaultA));
        vm.expectRevert(UniswapV4Adapter.VaultNotRegistered.selector);
        adapter.withdrawToVault();
    }

    // ============ Access Control — Unauthorized Caller ============

    function test_unauthorized_swap() public {
        _registerVaultA();

        // Random address (not a vault) tries to swap
        vm.prank(nonOwner);
        vm.expectRevert(UniswapV4Adapter.VaultNotRegistered.selector);
        adapter.swap(address(tokenA), address(tokenB), 100e18, 90e18);
    }

    function test_unauthorized_addLiquidity() public {
        vm.prank(nonOwner);
        vm.expectRevert(UniswapV4Adapter.VaultNotRegistered.selector);
        adapter.addLiquidity(address(tokenA), address(tokenB), 3000, -887220, 887220, 100e18, 100e18, 0);
    }

    function test_unauthorized_removeLiquidity() public {
        vm.prank(nonOwner);
        vm.expectRevert(UniswapV4Adapter.VaultNotRegistered.selector);
        adapter.removeLiquidity(1, 100, 0, 0);
    }

    function test_unauthorized_collectFees() public {
        vm.prank(nonOwner);
        vm.expectRevert(UniswapV4Adapter.VaultNotRegistered.selector);
        adapter.collectFees(1);
    }

    function test_unauthorized_withdrawToVault() public {
        vm.prank(nonOwner);
        vm.expectRevert(UniswapV4Adapter.VaultNotRegistered.selector);
        adapter.withdrawToVault();
    }

    // ============ Slippage Configuration ============

    function test_setSlippage_updatesConfig() public {
        _registerVaultA();

        vm.prank(ownerA);
        adapter.setSlippage(address(vaultA), 50); // 0.5%

        assertEq(adapter.getSlippage(address(vaultA)), 50);
    }

    function test_setSlippage_emitsEvent() public {
        _registerVaultA();

        vm.expectEmit(true, false, false, true);
        emit UniswapV4Adapter.SlippageUpdated(address(vaultA), 200);

        vm.prank(ownerA);
        adapter.setSlippage(address(vaultA), 200);
    }

    function test_setSlippage_revertsIfNotOwner() public {
        _registerVaultA();

        vm.prank(nonOwner);
        vm.expectRevert(UniswapV4Adapter.NotVaultOwner.selector);
        adapter.setSlippage(address(vaultA), 50);
    }

    function test_setSlippage_revertsOnInvalidBps() public {
        _registerVaultA();

        vm.prank(ownerA);
        vm.expectRevert(
            abi.encodeWithSelector(UniswapV4Adapter.InvalidSlippageBps.selector, 10001)
        );
        adapter.setSlippage(address(vaultA), 10001);
    }

    function test_setSlippage_revertsIfNotRegistered() public {
        vm.prank(ownerA);
        vm.expectRevert(UniswapV4Adapter.VaultNotRegistered.selector);
        adapter.setSlippage(address(vaultA), 50);
    }

    // ============ Multi-vault Isolation ============

    function test_multiVault_isolatedPositions() public {
        _registerVaultA();
        _registerVaultB();

        // Vault A adds a position
        (uint256 posA,) = vaultA.callAddLiquidity(
            address(adapter),
            address(tokenA),
            address(tokenB),
            3000,
            -887220,
            887220,
            100e18,
            100e18,
            0
        );

        // Vault B adds a position
        (uint256 posB,) = vaultB.callAddLiquidity(
            address(adapter),
            address(tokenA),
            address(tokenB),
            3000,
            -887220,
            887220,
            100e18,
            100e18,
            0
        );

        assertEq(adapter.positionOwner(posA), address(vaultA));
        assertEq(adapter.positionOwner(posB), address(vaultB));
        assertEq(adapter.getPositionCount(address(vaultA)), 1);
        assertEq(adapter.getPositionCount(address(vaultB)), 1);

        // Vault B cannot touch vault A's position
        vm.expectRevert(
            abi.encodeWithSelector(UniswapV4Adapter.PositionNotOwnedByVault.selector, posA)
        );
        vaultB.callCollectFees(address(adapter), posA);
    }

    function test_multiVault_independentWithdraw() public {
        _registerVaultA();
        _registerVaultB();

        // Both vaults add positions
        vaultA.callAddLiquidity(
            address(adapter),
            address(tokenA),
            address(tokenB),
            3000,
            -887220,
            887220,
            100e18,
            100e18,
            0
        );

        vaultB.callAddLiquidity(
            address(adapter),
            address(tokenA),
            address(tokenB),
            3000,
            -887220,
            887220,
            100e18,
            100e18,
            0
        );

        // Vault A withdraws — should not affect vault B
        vaultA.callWithdrawToVault(address(adapter));

        assertEq(adapter.getPositionCount(address(vaultA)), 0, "Vault A should have no positions");
        assertEq(adapter.getPositionCount(address(vaultB)), 1, "Vault B should still have 1");
    }

    // ============ View Functions ============

    function test_isRegistered_returnsFalseForUnregistered() public view {
        assertFalse(adapter.isRegistered(address(vaultA)));
    }

    function test_getVaultPositions_returnsEmptyForUnregistered() public view {
        uint256[] memory positions = adapter.getVaultPositions(address(vaultA));
        assertEq(positions.length, 0);
    }

    function test_getPositionCount_returnsZeroForUnregistered() public view {
        assertEq(adapter.getPositionCount(address(vaultA)), 0);
    }

    function test_getSlippage_returnsDefaultAfterRegistration() public {
        _registerVaultA();
        assertEq(adapter.getSlippage(address(vaultA)), 100);
    }
}
