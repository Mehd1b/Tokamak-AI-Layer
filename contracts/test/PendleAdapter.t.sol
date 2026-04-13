// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import { PendleAdapter } from "../src/adapters/PendleAdapter.sol";
import {
    IPendleRouter,
    IPendleMarket,
    TokenInput,
    TokenOutput,
    SwapData,
    SwapType,
    ApproxParams
} from "../src/adapters/PendleAdapter.sol";

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
        require(balanceOf[from] >= amount, "insufficient balance");
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
        require(allowance[from][msg.sender] >= amount, "insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @notice Mock Pendle Market that returns configurable tokens and expiry
contract MockPendleMarket {
    address public sy;
    address public pt;
    address public yt;
    uint256 public expiryTimestamp;

    constructor(address _sy, address _pt, address _yt, uint256 _expiry) {
        sy = _sy;
        pt = _pt;
        yt = _yt;
        expiryTimestamp = _expiry;
    }

    function expiry() external view returns (uint256) {
        return expiryTimestamp;
    }

    function readTokens() external view returns (address _SY, address _PT, address _YT) {
        return (sy, pt, yt);
    }

    function setExpiry(uint256 _expiry) external {
        expiryTimestamp = _expiry;
    }

    // --- ERC20-like stubs so the adapter can approve LP tokens ---
    mapping(address => mapping(address => uint256)) public allowance;

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function balanceOf(address) external pure returns (uint256) {
        return 0;
    }

    function transferFrom(address, address, uint256) external pure returns (bool) {
        return true;
    }
}

/// @notice Mock Pendle Router that simulates minting, redeeming, swapping, LP, and rewards
contract MockPendleRouter {
    // Configurable return values
    uint256 public mintReturn;
    uint256 public redeemReturn;
    uint256 public swapPtForTokenReturn;
    uint256 public swapTokenForPtReturn;
    uint256 public addLiqReturn;
    uint256 public removeLiqSyReturn;
    uint256 public removeLiqPtReturn;

    // Call tracking
    uint256 public mintCallCount;
    uint256 public redeemCallCount;
    uint256 public swapPtForTokenCallCount;
    uint256 public swapTokenForPtCallCount;
    uint256 public addLiqCallCount;
    uint256 public removeLiqCallCount;
    uint256 public claimRewardsCallCount;

    // Last call parameters (for assertions)
    address public lastReceiver;
    address public lastYT;
    address public lastMarket;
    uint256 public lastAmount;

    function setMintReturn(uint256 val) external { mintReturn = val; }
    function setRedeemReturn(uint256 val) external { redeemReturn = val; }
    function setSwapPtForTokenReturn(uint256 val) external { swapPtForTokenReturn = val; }
    function setSwapTokenForPtReturn(uint256 val) external { swapTokenForPtReturn = val; }
    function setAddLiqReturn(uint256 val) external { addLiqReturn = val; }
    function setRemoveLiqReturns(uint256 sy, uint256 pt) external {
        removeLiqSyReturn = sy;
        removeLiqPtReturn = pt;
    }

    function mintPyFromToken(
        address receiver,
        address YT,
        uint256, /* minPyOut */
        TokenInput calldata input
    ) external returns (uint256 netPyOut) {
        mintCallCount++;
        lastReceiver = receiver;
        lastYT = YT;
        lastAmount = input.netTokenIn;

        // Pull tokenIn from caller (adapter)
        MockERC20Token(input.tokenIn).transferFrom(msg.sender, address(this), input.netTokenIn);

        // Mint PT + YT to receiver
        // In real Pendle, PT and YT are minted. We simulate by reading market tokens
        // and minting to receiver. For simplicity, just return the configured value.
        netPyOut = mintReturn;
    }

    function redeemPyToToken(
        address receiver,
        address YT,
        uint256 netPyIn,
        TokenOutput calldata output
    ) external returns (uint256 netTokenOut) {
        redeemCallCount++;
        lastReceiver = receiver;
        lastYT = YT;
        lastAmount = netPyIn;

        netTokenOut = redeemReturn;

        // Simulate sending redeemed tokens to receiver
        // In tests, we mint tokens to the receiver to simulate the output
    }

    function swapExactPtForToken(
        address receiver,
        address market,
        uint256 exactPtIn,
        TokenOutput calldata output
    ) external returns (uint256 netTokenOut) {
        swapPtForTokenCallCount++;
        lastReceiver = receiver;
        lastMarket = market;
        lastAmount = exactPtIn;

        netTokenOut = swapPtForTokenReturn;

        // Check slippage
        require(netTokenOut >= output.minTokenOut, "slippage exceeded");
    }

    function swapExactTokenForPt(
        address receiver,
        address market,
        uint256 minPtOut,
        ApproxParams calldata, /* guessPtOut */
        TokenInput calldata input
    ) external returns (uint256 netPtOut, uint256 netSyFee) {
        swapTokenForPtCallCount++;
        lastReceiver = receiver;
        lastMarket = market;
        lastAmount = input.netTokenIn;

        // Pull tokenIn from caller (adapter)
        MockERC20Token(input.tokenIn).transferFrom(msg.sender, address(this), input.netTokenIn);

        netPtOut = swapTokenForPtReturn;
        netSyFee = 0;

        require(netPtOut >= minPtOut, "slippage exceeded");
    }

    function addLiquidityDualSyAndPt(
        address receiver,
        address market,
        uint256 netSyDesired,
        uint256 netPtDesired,
        uint256 minLpOut
    ) external returns (uint256 netLpOut) {
        addLiqCallCount++;
        lastReceiver = receiver;
        lastMarket = market;

        netLpOut = addLiqReturn;
        require(netLpOut >= minLpOut, "slippage exceeded");
    }

    function removeLiquidityDualSyAndPt(
        address receiver,
        address market,
        uint256 netLpToRemove,
        uint256 minSyOut,
        uint256 minPtOut
    ) external returns (uint256 netSyOut, uint256 netPtOut) {
        removeLiqCallCount++;
        lastReceiver = receiver;
        lastMarket = market;
        lastAmount = netLpToRemove;

        netSyOut = removeLiqSyReturn;
        netPtOut = removeLiqPtReturn;

        require(netSyOut >= minSyOut, "slippage exceeded");
        require(netPtOut >= minPtOut, "slippage exceeded");

        // Mint both outputs to the receiver so the adapter can forward SY.
        (address syAddr, , ) = MockPendleMarket(market).readTokens();
        if (netSyOut > 0) MockERC20Token(syAddr).mint(receiver, netSyOut);
    }

    function redeemDueInterestAndRewards(
        address, /* user */
        address[] calldata, /* sys */
        address[] calldata, /* yts */
        address[] calldata /* markets */
    ) external {
        claimRewardsCallCount++;
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
        MockERC20Token(token).approve(spender, amount);
    }

    // ---- Adapter call wrappers (msg.sender = this vault) ----

    function callMintPtYt(address adapter, address market, address tokenIn, uint256 amount)
        external
    {
        // Tests use zero minPyOut (no slippage); production callers MUST set a real bound.
        PendleAdapter(adapter).mintPtYt(market, tokenIn, amount, 0);
    }

    function callRedeemPtYt(address adapter, address market, uint256 amount) external {
        PendleAdapter(adapter).redeemPtYt(market, amount, 0);
    }

    function callSwapExactPtForToken(
        address adapter,
        address market,
        uint256 ptAmount,
        uint256 minTokenOut
    ) external {
        PendleAdapter(adapter).swapExactPtForToken(market, ptAmount, minTokenOut);
    }

    function callSwapExactTokenForPt(
        address adapter,
        address market,
        uint256 tokenAmount,
        uint256 minPtOut
    ) external {
        PendleAdapter(adapter).swapExactTokenForPt(market, tokenAmount, minPtOut);
    }

    function callAddLiquidity(
        address adapter,
        address market,
        uint256 syAmount,
        uint256 ptAmount,
        uint256 minLpOut
    ) external {
        PendleAdapter(adapter).addLiquidity(market, syAmount, ptAmount, minLpOut);
    }

    function callRemoveLiquidity(
        address adapter,
        address market,
        uint256 lpAmount,
        uint256 minSyOut,
        uint256 minPtOut
    ) external {
        PendleAdapter(adapter).removeLiquidity(market, lpAmount, minSyOut, minPtOut);
    }

    function callClaimRewards(address adapter, address[] calldata markets) external {
        // Empty reward token list — test helper just exercises the
        // adapter's router call; reward forwarding is tested separately.
        address[] memory emptyRewards = new address[](0);
        PendleAdapter(adapter).claimRewards(markets, emptyRewards);
    }

    function callClaimRewardsWithTokens(
        address adapter,
        address[] calldata markets,
        address[] calldata rewardTokens
    ) external {
        PendleAdapter(adapter).claimRewards(markets, rewardTokens);
    }

    function callWithdrawToVault(address adapter, address market) external {
        PendleAdapter(adapter).withdrawToVault(market);
    }
}

// ============================================================================
// Test Contract
// ============================================================================

contract PendleAdapterTest is Test {
    PendleAdapter public adapter;
    MockPendleRouter public router;
    MockVaultFactory public factory;

    // Tokens
    MockERC20Token public sy;
    MockERC20Token public pt;
    MockERC20Token public yt;
    MockERC20Token public tokenIn;

    // Market
    MockPendleMarket public market;

    // Vaults
    MockKernelVault public vaultA;
    MockKernelVault public vaultB;
    address public ownerA;
    address public ownerB;
    address public nonOwner;

    // Constants
    uint256 public constant MINT_AMOUNT = 1000e18;
    uint256 public constant FAR_EXPIRY = 365 days; // relative to block.timestamp

    function setUp() public {
        ownerA = address(0xA001);
        ownerB = address(0xB001);
        nonOwner = address(0xDEAD);

        // Deploy mocks
        router = new MockPendleRouter();
        factory = new MockVaultFactory();

        // Deploy tokens
        sy = new MockERC20Token("Standardized Yield", "SY", 18);
        pt = new MockERC20Token("Principal Token", "PT", 18);
        yt = new MockERC20Token("Yield Token", "YT", 18);
        tokenIn = new MockERC20Token("USDC", "USDC", 6);

        // Deploy market (expiry = now + 365 days)
        market = new MockPendleMarket(
            address(sy), address(pt), address(yt), block.timestamp + FAR_EXPIRY
        );

        // Deploy adapter
        adapter = new PendleAdapter(address(router), address(factory));

        // Deploy mock vaults
        vaultA = new MockKernelVault(ownerA);
        vaultB = new MockKernelVault(ownerB);

        // Register vaults with factory
        factory.setDeployedVault(address(vaultA), true);
        factory.setDeployedVault(address(vaultB), true);

        // Set default router returns
        router.setMintReturn(MINT_AMOUNT);
        router.setRedeemReturn(MINT_AMOUNT);
        router.setSwapPtForTokenReturn(950e18);
        router.setSwapTokenForPtReturn(1050e18);
        router.setAddLiqReturn(500e18);
        router.setRemoveLiqReturns(400e18, 100e18);
    }

    // ============ Helpers ============

    /// @dev Register vaultA and whitelist the market
    function _registerAndWhitelist() internal {
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));

        vm.prank(ownerA);
        adapter.setMarketWhitelist(address(vaultA), address(market), true);
    }

    /// @dev Fund vaultA with tokenIn and approve adapter
    function _fundVault(uint256 amount) internal {
        tokenIn.mint(address(vaultA), amount);
        vaultA.approveToken(address(tokenIn), address(adapter), amount);
    }

    /// @dev Fund vaultA with SY and approve adapter
    function _fundVaultSy(uint256 amount) internal {
        sy.mint(address(vaultA), amount);
        vaultA.approveToken(address(sy), address(adapter), amount);
    }

    // ============================================================================
    // Constructor Tests
    // ============================================================================

    function test_constructor_setsImmutables() public view {
        assertEq(adapter.pendleRouter(), address(router));
        assertEq(adapter.vaultFactory(), address(factory));
    }

    function test_constructor_revertsZeroRouter() public {
        vm.expectRevert(PendleAdapter.ZeroAddress.selector);
        new PendleAdapter(address(0), address(factory));
    }

    function test_constructor_revertsZeroFactory() public {
        vm.expectRevert(PendleAdapter.ZeroAddress.selector);
        new PendleAdapter(address(router), address(0));
    }

    // ============================================================================
    // Registration Tests
    // ============================================================================

    function test_registerVault_success() public {
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));

        assertTrue(adapter.isRegistered(address(vaultA)));
        assertEq(adapter.getExpiryBuffer(address(vaultA)), 7 days);
    }

    function test_registerVault_revertsZeroAddress() public {
        vm.prank(ownerA);
        vm.expectRevert(PendleAdapter.ZeroAddress.selector);
        adapter.registerVault(address(0));
    }

    function test_registerVault_revertsNotDeployedByFactory() public {
        factory.setDeployedVault(address(vaultA), false);

        vm.prank(ownerA);
        vm.expectRevert(PendleAdapter.VaultNotDeployedByFactory.selector);
        adapter.registerVault(address(vaultA));
    }

    function test_registerVault_revertsNotVaultOwner() public {
        vm.prank(nonOwner);
        vm.expectRevert(PendleAdapter.NotVaultOwner.selector);
        adapter.registerVault(address(vaultA));
    }

    function test_registerVault_revertsAlreadyRegistered() public {
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));

        vm.prank(ownerA);
        vm.expectRevert(PendleAdapter.VaultAlreadyRegistered.selector);
        adapter.registerVault(address(vaultA));
    }

    function test_registerVault_emitsEvent() public {
        vm.expectEmit(true, false, false, false);
        emit PendleAdapter.VaultRegistered(address(vaultA));

        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));
    }

    // ============================================================================
    // Market Whitelist Tests
    // ============================================================================

    function test_setMarketWhitelist_success() public {
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));

        vm.prank(ownerA);
        adapter.setMarketWhitelist(address(vaultA), address(market), true);

        assertTrue(adapter.isMarketWhitelisted(address(vaultA), address(market)));
    }

    function test_setMarketWhitelist_removeMarket() public {
        _registerAndWhitelist();

        vm.prank(ownerA);
        adapter.setMarketWhitelist(address(vaultA), address(market), false);

        assertFalse(adapter.isMarketWhitelisted(address(vaultA), address(market)));
    }

    function test_setMarketWhitelist_revertsNotRegistered() public {
        vm.prank(ownerA);
        vm.expectRevert(PendleAdapter.VaultNotRegistered.selector);
        adapter.setMarketWhitelist(address(vaultA), address(market), true);
    }

    function test_setMarketWhitelist_revertsNotOwner() public {
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));

        vm.prank(nonOwner);
        vm.expectRevert(PendleAdapter.NotVaultOwner.selector);
        adapter.setMarketWhitelist(address(vaultA), address(market), true);
    }

    function test_setMarketWhitelist_revertsZeroMarket() public {
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));

        vm.prank(ownerA);
        vm.expectRevert(PendleAdapter.ZeroAddress.selector);
        adapter.setMarketWhitelist(address(vaultA), address(0), true);
    }

    function test_setMarketWhitelist_emitsEvent() public {
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));

        vm.expectEmit(true, true, false, true);
        emit PendleAdapter.MarketWhitelistUpdated(address(vaultA), address(market), true);

        vm.prank(ownerA);
        adapter.setMarketWhitelist(address(vaultA), address(market), true);
    }

    // ============================================================================
    // Expiry Buffer Tests
    // ============================================================================

    function test_setExpiryBuffer_success() public {
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));

        vm.prank(ownerA);
        adapter.setExpiryBuffer(address(vaultA), 14 days);

        assertEq(adapter.getExpiryBuffer(address(vaultA)), 14 days);
    }

    function test_setExpiryBuffer_revertsNotRegistered() public {
        vm.prank(ownerA);
        vm.expectRevert(PendleAdapter.VaultNotRegistered.selector);
        adapter.setExpiryBuffer(address(vaultA), 14 days);
    }

    function test_setExpiryBuffer_revertsNotOwner() public {
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));

        vm.prank(nonOwner);
        vm.expectRevert(PendleAdapter.NotVaultOwner.selector);
        adapter.setExpiryBuffer(address(vaultA), 14 days);
    }

    // ============================================================================
    // Mint PT+YT Tests
    // ============================================================================

    function test_mintPtYt_success() public {
        _registerAndWhitelist();
        _fundVault(MINT_AMOUNT);

        vaultA.callMintPtYt(address(adapter), address(market), address(tokenIn), MINT_AMOUNT);

        // Verify router was called
        assertEq(router.mintCallCount(), 1);

        // Verify position tracking
        (uint256 ptBal, uint256 ytBal, uint256 lpBal) =
            adapter.getPosition(address(vaultA), address(market));
        assertEq(ptBal, MINT_AMOUNT);
        assertEq(ytBal, MINT_AMOUNT);
        assertEq(lpBal, 0);
    }

    function test_mintPtYt_revertsUnregisteredVault() public {
        vm.expectRevert(PendleAdapter.VaultNotRegistered.selector);
        vaultA.callMintPtYt(address(adapter), address(market), address(tokenIn), MINT_AMOUNT);
    }

    function test_mintPtYt_revertsNotWhitelisted() public {
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));

        // Do NOT whitelist the market
        vm.expectRevert(PendleAdapter.MarketNotWhitelisted.selector);
        vaultA.callMintPtYt(address(adapter), address(market), address(tokenIn), MINT_AMOUNT);
    }

    function test_mintPtYt_revertsZeroAmount() public {
        _registerAndWhitelist();

        vm.expectRevert(PendleAdapter.ZeroAmount.selector);
        vaultA.callMintPtYt(address(adapter), address(market), address(tokenIn), 0);
    }

    function test_mintPtYt_revertsExpiringSoon() public {
        _registerAndWhitelist();
        _fundVault(MINT_AMOUNT);

        // Set market to expire in 3 days (< 7 day buffer)
        market.setExpiry(block.timestamp + 3 days);

        vm.expectRevert(
            abi.encodeWithSelector(
                PendleAdapter.MarketExpiringSoon.selector,
                block.timestamp + 3 days,
                block.timestamp + 7 days
            )
        );
        vaultA.callMintPtYt(address(adapter), address(market), address(tokenIn), MINT_AMOUNT);
    }

    function test_mintPtYt_emitsEvent() public {
        _registerAndWhitelist();
        _fundVault(MINT_AMOUNT);

        vm.expectEmit(true, true, false, true);
        emit PendleAdapter.PtYtMinted(address(vaultA), address(market), MINT_AMOUNT, MINT_AMOUNT);

        vaultA.callMintPtYt(address(adapter), address(market), address(tokenIn), MINT_AMOUNT);
    }

    // ============================================================================
    // Redeem PT+YT Tests
    // ============================================================================

    function test_redeemPtYt_success() public {
        _registerAndWhitelist();
        _fundVault(MINT_AMOUNT);

        // Mint first to have PT+YT balances
        vaultA.callMintPtYt(address(adapter), address(market), address(tokenIn), MINT_AMOUNT);

        // Approve PT and YT for router (adapter holds these)
        pt.mint(address(adapter), MINT_AMOUNT);
        yt.mint(address(adapter), MINT_AMOUNT);

        // Redeem
        vaultA.callRedeemPtYt(address(adapter), address(market), MINT_AMOUNT);

        // Verify router was called
        assertEq(router.redeemCallCount(), 1);

        // Verify balances zeroed out
        (uint256 ptBal, uint256 ytBal, ) =
            adapter.getPosition(address(vaultA), address(market));
        assertEq(ptBal, 0);
        assertEq(ytBal, 0);
    }

    function test_redeemPtYt_revertsInsufficientPt() public {
        _registerAndWhitelist();

        // No mint, so PT balance is 0
        vm.expectRevert(
            abi.encodeWithSelector(PendleAdapter.InsufficientPtBalance.selector, 0, MINT_AMOUNT)
        );
        vaultA.callRedeemPtYt(address(adapter), address(market), MINT_AMOUNT);
    }

    function test_redeemPtYt_revertsZeroAmount() public {
        _registerAndWhitelist();

        vm.expectRevert(PendleAdapter.ZeroAmount.selector);
        vaultA.callRedeemPtYt(address(adapter), address(market), 0);
    }

    function test_redeemPtYt_emitsEvent() public {
        _registerAndWhitelist();
        _fundVault(MINT_AMOUNT);
        vaultA.callMintPtYt(address(adapter), address(market), address(tokenIn), MINT_AMOUNT);

        // Mint PT/YT tokens for the adapter to approve to router
        pt.mint(address(adapter), MINT_AMOUNT);
        yt.mint(address(adapter), MINT_AMOUNT);

        vm.expectEmit(true, true, false, true);
        emit PendleAdapter.PtYtRedeemed(
            address(vaultA), address(market), MINT_AMOUNT, MINT_AMOUNT
        );

        vaultA.callRedeemPtYt(address(adapter), address(market), MINT_AMOUNT);
    }

    // ============================================================================
    // Mint/Redeem Cycle Test
    // ============================================================================

    function test_mintRedeemCycle() public {
        _registerAndWhitelist();
        _fundVault(MINT_AMOUNT);

        // Step 1: Mint
        vaultA.callMintPtYt(address(adapter), address(market), address(tokenIn), MINT_AMOUNT);

        (uint256 ptBal, uint256 ytBal, ) =
            adapter.getPosition(address(vaultA), address(market));
        assertEq(ptBal, MINT_AMOUNT);
        assertEq(ytBal, MINT_AMOUNT);

        // Step 2: Redeem half
        uint256 halfAmount = MINT_AMOUNT / 2;
        pt.mint(address(adapter), halfAmount);
        yt.mint(address(adapter), halfAmount);

        vaultA.callRedeemPtYt(address(adapter), address(market), halfAmount);

        (ptBal, ytBal, ) = adapter.getPosition(address(vaultA), address(market));
        assertEq(ptBal, halfAmount);
        assertEq(ytBal, halfAmount);

        // Step 3: Redeem remaining
        pt.mint(address(adapter), halfAmount);
        yt.mint(address(adapter), halfAmount);

        vaultA.callRedeemPtYt(address(adapter), address(market), halfAmount);

        (ptBal, ytBal, ) = adapter.getPosition(address(vaultA), address(market));
        assertEq(ptBal, 0);
        assertEq(ytBal, 0);
    }

    // ============================================================================
    // Swap PT for Token Tests
    // ============================================================================

    function test_swapExactPtForToken_success() public {
        _registerAndWhitelist();
        _fundVault(MINT_AMOUNT);

        // Mint to get PT balance
        vaultA.callMintPtYt(address(adapter), address(market), address(tokenIn), MINT_AMOUNT);

        // Give adapter PT tokens (mocked)
        pt.mint(address(adapter), MINT_AMOUNT);

        uint256 ptToSwap = 500e18;
        uint256 minOut = 400e18;

        vaultA.callSwapExactPtForToken(address(adapter), address(market), ptToSwap, minOut);

        // Verify router called
        assertEq(router.swapPtForTokenCallCount(), 1);

        // Verify PT balance decreased
        (uint256 ptBal, , ) = adapter.getPosition(address(vaultA), address(market));
        assertEq(ptBal, MINT_AMOUNT - ptToSwap);
    }

    function test_swapExactPtForToken_revertsInsufficientPt() public {
        _registerAndWhitelist();

        vm.expectRevert(
            abi.encodeWithSelector(PendleAdapter.InsufficientPtBalance.selector, 0, 500e18)
        );
        vaultA.callSwapExactPtForToken(address(adapter), address(market), 500e18, 400e18);
    }

    function test_swapExactPtForToken_revertsZeroAmount() public {
        _registerAndWhitelist();

        vm.expectRevert(PendleAdapter.ZeroAmount.selector);
        vaultA.callSwapExactPtForToken(address(adapter), address(market), 0, 0);
    }

    // ============================================================================
    // Swap Token for PT Tests
    // ============================================================================

    function test_swapExactTokenForPt_success() public {
        _registerAndWhitelist();
        _fundVaultSy(MINT_AMOUNT);

        uint256 tokenAmount = 500e18;
        uint256 minPtOut = 400e18;

        vaultA.callSwapExactTokenForPt(address(adapter), address(market), tokenAmount, minPtOut);

        // Verify router called
        assertEq(router.swapTokenForPtCallCount(), 1);

        // Verify PT balance increased
        (uint256 ptBal, , ) = adapter.getPosition(address(vaultA), address(market));
        assertEq(ptBal, 1050e18); // swapTokenForPtReturn
    }

    function test_swapExactTokenForPt_revertsExpiringSoon() public {
        _registerAndWhitelist();
        _fundVaultSy(MINT_AMOUNT);

        market.setExpiry(block.timestamp + 3 days);

        vm.expectRevert(
            abi.encodeWithSelector(
                PendleAdapter.MarketExpiringSoon.selector,
                block.timestamp + 3 days,
                block.timestamp + 7 days
            )
        );
        vaultA.callSwapExactTokenForPt(address(adapter), address(market), 500e18, 400e18);
    }

    function test_swapExactTokenForPt_revertsZeroAmount() public {
        _registerAndWhitelist();

        vm.expectRevert(PendleAdapter.ZeroAmount.selector);
        vaultA.callSwapExactTokenForPt(address(adapter), address(market), 0, 0);
    }

    // ============================================================================
    // Add Liquidity Tests
    // ============================================================================

    function test_addLiquidity_success() public {
        _registerAndWhitelist();
        _fundVault(MINT_AMOUNT);
        _fundVaultSy(MINT_AMOUNT);

        // Mint to get PT balance first
        vaultA.callMintPtYt(address(adapter), address(market), address(tokenIn), MINT_AMOUNT);

        // Give adapter PT tokens for the router approval
        pt.mint(address(adapter), MINT_AMOUNT);

        uint256 syAmount = 300e18;
        uint256 ptAmount = 200e18;
        uint256 minLpOut = 100e18;

        vaultA.callAddLiquidity(address(adapter), address(market), syAmount, ptAmount, minLpOut);

        // Verify router called
        assertEq(router.addLiqCallCount(), 1);

        // Verify balances updated
        (uint256 ptBal, , uint256 lpBal) =
            adapter.getPosition(address(vaultA), address(market));
        assertEq(ptBal, MINT_AMOUNT - ptAmount);
        assertEq(lpBal, 500e18); // addLiqReturn
    }

    function test_addLiquidity_revertsInsufficientPt() public {
        _registerAndWhitelist();
        _fundVaultSy(MINT_AMOUNT);

        // No PT balance
        vm.expectRevert(
            abi.encodeWithSelector(PendleAdapter.InsufficientPtBalance.selector, 0, 200e18)
        );
        vaultA.callAddLiquidity(address(adapter), address(market), 300e18, 200e18, 100e18);
    }

    function test_addLiquidity_revertsZeroAmounts() public {
        _registerAndWhitelist();

        vm.expectRevert(PendleAdapter.ZeroAmount.selector);
        vaultA.callAddLiquidity(address(adapter), address(market), 0, 0, 0);
    }

    function test_addLiquidity_revertsExpiringSoon() public {
        _registerAndWhitelist();

        market.setExpiry(block.timestamp + 3 days);

        vm.expectRevert(
            abi.encodeWithSelector(
                PendleAdapter.MarketExpiringSoon.selector,
                block.timestamp + 3 days,
                block.timestamp + 7 days
            )
        );
        vaultA.callAddLiquidity(address(adapter), address(market), 300e18, 0, 0);
    }

    // ============================================================================
    // Remove Liquidity Tests
    // ============================================================================

    function test_removeLiquidity_success() public {
        _registerAndWhitelist();
        _fundVault(MINT_AMOUNT);
        _fundVaultSy(MINT_AMOUNT);

        // Mint + add liquidity first
        vaultA.callMintPtYt(address(adapter), address(market), address(tokenIn), MINT_AMOUNT);
        pt.mint(address(adapter), MINT_AMOUNT);
        vaultA.callAddLiquidity(address(adapter), address(market), 300e18, 200e18, 100e18);

        uint256 lpToRemove = 200e18;
        uint256 minSyOut = 100e18;
        uint256 minPtOut = 50e18;

        vaultA.callRemoveLiquidity(
            address(adapter), address(market), lpToRemove, minSyOut, minPtOut
        );

        // Verify router called
        assertEq(router.removeLiqCallCount(), 1);

        // Verify balances updated
        (uint256 ptBal, , uint256 lpBal) =
            adapter.getPosition(address(vaultA), address(market));
        // PT: MINT_AMOUNT - 200 (addLiq) + 100 (removeLiq PT return)
        assertEq(ptBal, MINT_AMOUNT - 200e18 + 100e18);
        // LP: 500 (addLiq) - 200 (removeLiq)
        assertEq(lpBal, 300e18);
    }

    function test_removeLiquidity_revertsInsufficientLp() public {
        _registerAndWhitelist();

        vm.expectRevert(
            abi.encodeWithSelector(PendleAdapter.InsufficientLpBalance.selector, 0, 100e18)
        );
        vaultA.callRemoveLiquidity(address(adapter), address(market), 100e18, 50e18, 25e18);
    }

    function test_removeLiquidity_revertsZeroAmount() public {
        _registerAndWhitelist();

        vm.expectRevert(PendleAdapter.ZeroAmount.selector);
        vaultA.callRemoveLiquidity(address(adapter), address(market), 0, 0, 0);
    }

    // ============================================================================
    // LP Add/Remove Cycle Test
    // ============================================================================

    function test_lpAddRemoveCycle() public {
        _registerAndWhitelist();
        _fundVault(MINT_AMOUNT);
        _fundVaultSy(MINT_AMOUNT);

        // Mint PT+YT
        vaultA.callMintPtYt(address(adapter), address(market), address(tokenIn), MINT_AMOUNT);
        pt.mint(address(adapter), MINT_AMOUNT);

        // Add liquidity
        vaultA.callAddLiquidity(address(adapter), address(market), 300e18, 200e18, 100e18);

        (uint256 ptBal, uint256 ytBal, uint256 lpBal) =
            adapter.getPosition(address(vaultA), address(market));
        assertEq(lpBal, 500e18);
        assertEq(ptBal, MINT_AMOUNT - 200e18);

        // Remove all liquidity
        vaultA.callRemoveLiquidity(address(adapter), address(market), 500e18, 0, 0);

        (, , lpBal) = adapter.getPosition(address(vaultA), address(market));
        assertEq(lpBal, 0);
    }

    // ============================================================================
    // Claim Rewards Tests
    // ============================================================================

    function test_claimRewards_success() public {
        _registerAndWhitelist();

        address[] memory markets = new address[](1);
        markets[0] = address(market);

        vaultA.callClaimRewards(address(adapter), markets);

        assertEq(router.claimRewardsCallCount(), 1);
    }

    function test_claimRewards_multipleMarkets() public {
        _registerAndWhitelist();

        // Create second market
        MockPendleMarket market2 = new MockPendleMarket(
            address(sy), address(pt), address(yt), block.timestamp + FAR_EXPIRY
        );
        vm.prank(ownerA);
        adapter.setMarketWhitelist(address(vaultA), address(market2), true);

        address[] memory markets = new address[](2);
        markets[0] = address(market);
        markets[1] = address(market2);

        vaultA.callClaimRewards(address(adapter), markets);

        assertEq(router.claimRewardsCallCount(), 1);
    }

    function test_claimRewards_revertsNotWhitelisted() public {
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));

        // Market NOT whitelisted
        address[] memory markets = new address[](1);
        markets[0] = address(market);

        vm.expectRevert(PendleAdapter.MarketNotWhitelisted.selector);
        vaultA.callClaimRewards(address(adapter), markets);
    }

    function test_claimRewards_revertsUnregisteredVault() public {
        address[] memory markets = new address[](1);
        markets[0] = address(market);

        vm.expectRevert(PendleAdapter.VaultNotRegistered.selector);
        vaultA.callClaimRewards(address(adapter), markets);
    }

    // ============================================================================
    // Withdraw To Vault Tests
    // ============================================================================

    function test_withdrawToVault_success() public {
        _registerAndWhitelist();

        vaultA.callWithdrawToVault(address(adapter), address(market));
        // Should not revert (no tracked position → no-op)
    }

    function test_withdrawToVault_revertsUnregistered() public {
        vm.expectRevert(PendleAdapter.VaultNotRegistered.selector);
        vaultA.callWithdrawToVault(address(adapter), address(market));
    }

    // ============================================================================
    // Expiry Guard Tests
    // ============================================================================

    function test_expiryGuard_exactlyAtBuffer() public {
        _registerAndWhitelist();
        _fundVault(MINT_AMOUNT);

        // Set expiry to exactly 7 days from now — should still revert
        // because expiry < block.timestamp + buffer means < not <=
        // Actually block.timestamp + 7 days == block.timestamp + 7 days, so NOT < minExpiry
        // This should pass
        market.setExpiry(block.timestamp + 7 days);

        // Should NOT revert (expiry == minExpiry, condition is expiry < minExpiry)
        vaultA.callMintPtYt(address(adapter), address(market), address(tokenIn), MINT_AMOUNT);
    }

    function test_expiryGuard_oneDayBeforeBuffer() public {
        _registerAndWhitelist();
        _fundVault(MINT_AMOUNT);

        // Set expiry to 6 days from now (< 7 day buffer)
        market.setExpiry(block.timestamp + 6 days);

        vm.expectRevert(
            abi.encodeWithSelector(
                PendleAdapter.MarketExpiringSoon.selector,
                block.timestamp + 6 days,
                block.timestamp + 7 days
            )
        );
        vaultA.callMintPtYt(address(adapter), address(market), address(tokenIn), MINT_AMOUNT);
    }

    function test_expiryGuard_customBuffer() public {
        _registerAndWhitelist();
        _fundVault(MINT_AMOUNT);

        // Set custom buffer to 14 days
        vm.prank(ownerA);
        adapter.setExpiryBuffer(address(vaultA), 14 days);

        // Set expiry to 10 days from now (< 14 day buffer)
        market.setExpiry(block.timestamp + 10 days);

        vm.expectRevert(
            abi.encodeWithSelector(
                PendleAdapter.MarketExpiringSoon.selector,
                block.timestamp + 10 days,
                block.timestamp + 14 days
            )
        );
        vaultA.callMintPtYt(address(adapter), address(market), address(tokenIn), MINT_AMOUNT);
    }

    function test_expiryGuard_zeroBuffer_rejected() public {
        _registerAndWhitelist();
        _fundVault(MINT_AMOUNT);

        // L-37 fix: setExpiryBuffer(0) is now rejected because zero buffer
        // would disable the pre-expiry guard entirely and allow positions to
        // be opened seconds before market expiry (where PT/YT math breaks).
        vm.prank(ownerA);
        vm.expectRevert(bytes("buffer below min"));
        adapter.setExpiryBuffer(address(vaultA), 0);
    }

    function test_expiryGuard_pastExpiry() public {
        _registerAndWhitelist();
        _fundVault(MINT_AMOUNT);

        // Set expiry to past
        market.setExpiry(block.timestamp - 1);

        vm.expectRevert(); // MarketExpiringSoon
        vaultA.callMintPtYt(address(adapter), address(market), address(tokenIn), MINT_AMOUNT);
    }

    function test_expiryGuard_redeemAllowedNearExpiry() public {
        _registerAndWhitelist();
        _fundVault(MINT_AMOUNT);

        // Mint first (market far from expiry)
        vaultA.callMintPtYt(address(adapter), address(market), address(tokenIn), MINT_AMOUNT);

        // Now move expiry close — redeem should still work (no expiry check)
        market.setExpiry(block.timestamp + 3 days);
        pt.mint(address(adapter), MINT_AMOUNT);
        yt.mint(address(adapter), MINT_AMOUNT);

        // Redeem does NOT have notExpiringSoon modifier, so this should succeed
        vaultA.callRedeemPtYt(address(adapter), address(market), MINT_AMOUNT);
    }

    function test_expiryGuard_removeLiquidityAllowedNearExpiry() public {
        _registerAndWhitelist();
        _fundVault(MINT_AMOUNT);
        _fundVaultSy(MINT_AMOUNT);

        // Mint + add liquidity
        vaultA.callMintPtYt(address(adapter), address(market), address(tokenIn), MINT_AMOUNT);
        pt.mint(address(adapter), MINT_AMOUNT);
        vaultA.callAddLiquidity(address(adapter), address(market), 300e18, 200e18, 100e18);

        // Move market close to expiry
        market.setExpiry(block.timestamp + 3 days);

        // removeLiquidity does NOT have notExpiringSoon modifier
        vaultA.callRemoveLiquidity(address(adapter), address(market), 200e18, 0, 0);
    }

    // ============================================================================
    // Unauthorized Caller Rejection Tests
    // ============================================================================

    function test_unauthorizedCaller_mintPtYt() public {
        // VaultB is NOT registered
        vm.expectRevert(PendleAdapter.VaultNotRegistered.selector);
        vaultB.callMintPtYt(address(adapter), address(market), address(tokenIn), MINT_AMOUNT);
    }

    function test_unauthorizedCaller_redeemPtYt() public {
        vm.expectRevert(PendleAdapter.VaultNotRegistered.selector);
        vaultB.callRedeemPtYt(address(adapter), address(market), MINT_AMOUNT);
    }

    function test_unauthorizedCaller_swapExactPtForToken() public {
        vm.expectRevert(PendleAdapter.VaultNotRegistered.selector);
        vaultB.callSwapExactPtForToken(address(adapter), address(market), 100e18, 50e18);
    }

    function test_unauthorizedCaller_swapExactTokenForPt() public {
        vm.expectRevert(PendleAdapter.VaultNotRegistered.selector);
        vaultB.callSwapExactTokenForPt(address(adapter), address(market), 100e18, 50e18);
    }

    function test_unauthorizedCaller_addLiquidity() public {
        vm.expectRevert(PendleAdapter.VaultNotRegistered.selector);
        vaultB.callAddLiquidity(address(adapter), address(market), 300e18, 200e18, 100e18);
    }

    function test_unauthorizedCaller_removeLiquidity() public {
        vm.expectRevert(PendleAdapter.VaultNotRegistered.selector);
        vaultB.callRemoveLiquidity(address(adapter), address(market), 100e18, 50e18, 25e18);
    }

    function test_unauthorizedCaller_claimRewards() public {
        address[] memory markets = new address[](1);
        markets[0] = address(market);

        vm.expectRevert(PendleAdapter.VaultNotRegistered.selector);
        vaultB.callClaimRewards(address(adapter), markets);
    }

    function test_unauthorizedCaller_withdrawToVault() public {
        vm.expectRevert(PendleAdapter.VaultNotRegistered.selector);
        vaultB.callWithdrawToVault(address(adapter), address(market));
    }

    // ============================================================================
    // Market Whitelist Enforcement Tests
    // ============================================================================

    function test_whitelistEnforcement_registeredButNotWhitelisted() public {
        // Register vaultA but do NOT whitelist any market
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));

        _fundVault(MINT_AMOUNT);

        vm.expectRevert(PendleAdapter.MarketNotWhitelisted.selector);
        vaultA.callMintPtYt(address(adapter), address(market), address(tokenIn), MINT_AMOUNT);
    }

    function test_whitelistEnforcement_afterDewhitelist() public {
        _registerAndWhitelist();
        _fundVault(MINT_AMOUNT);

        // Mint succeeds — creates tracked positions
        vaultA.callMintPtYt(address(adapter), address(market), address(tokenIn), MINT_AMOUNT);

        // [M-06 FIX] Attempting to de-whitelist with active positions should revert
        vm.prank(ownerA);
        vm.expectRevert("active positions exist");
        adapter.setMarketWhitelist(address(vaultA), address(market), false);

        // De-whitelisting without active positions works (separate test case)
    }

    function test_whitelistEnforcement_afterDewhitelist_noPositions() public {
        _registerAndWhitelist();

        // No positions minted — de-whitelist should succeed
        vm.prank(ownerA);
        adapter.setMarketWhitelist(address(vaultA), address(market), false);

        // Now mint should fail
        _fundVault(MINT_AMOUNT);
        vm.expectRevert(PendleAdapter.MarketNotWhitelisted.selector);
        vaultA.callMintPtYt(address(adapter), address(market), address(tokenIn), MINT_AMOUNT);
    }

    function test_whitelistEnforcement_perVaultIsolation() public {
        // Register both vaults
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));
        vm.prank(ownerB);
        adapter.registerVault(address(vaultB));

        // Whitelist market only for vaultA
        vm.prank(ownerA);
        adapter.setMarketWhitelist(address(vaultA), address(market), true);

        // VaultB should fail (market not whitelisted for vaultB)
        vm.expectRevert(PendleAdapter.MarketNotWhitelisted.selector);
        vaultB.callMintPtYt(address(adapter), address(market), address(tokenIn), MINT_AMOUNT);
    }

    // ============================================================================
    // Position Isolation Tests
    // ============================================================================

    function test_positionIsolation_betweenVaults() public {
        // Register both vaults
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));
        vm.prank(ownerB);
        adapter.registerVault(address(vaultB));

        // Whitelist market for both
        vm.prank(ownerA);
        adapter.setMarketWhitelist(address(vaultA), address(market), true);
        vm.prank(ownerB);
        adapter.setMarketWhitelist(address(vaultB), address(market), true);

        // Fund and mint for vaultA
        tokenIn.mint(address(vaultA), MINT_AMOUNT);
        vaultA.approveToken(address(tokenIn), address(adapter), MINT_AMOUNT);
        vaultA.callMintPtYt(address(adapter), address(market), address(tokenIn), MINT_AMOUNT);

        // VaultA should have positions
        (uint256 ptBalA, uint256 ytBalA, ) =
            adapter.getPosition(address(vaultA), address(market));
        assertEq(ptBalA, MINT_AMOUNT);
        assertEq(ytBalA, MINT_AMOUNT);

        // VaultB should have zero
        (uint256 ptBalB, uint256 ytBalB, ) =
            adapter.getPosition(address(vaultB), address(market));
        assertEq(ptBalB, 0);
        assertEq(ytBalB, 0);
    }

    // ============================================================================
    // View Function Tests
    // ============================================================================

    function test_isRegistered_false() public view {
        assertFalse(adapter.isRegistered(address(vaultA)));
    }

    function test_isMarketWhitelisted_false() public view {
        assertFalse(adapter.isMarketWhitelisted(address(vaultA), address(market)));
    }

    function test_getPosition_defaultZero() public view {
        (uint256 ptBal, uint256 ytBal, uint256 lpBal) =
            adapter.getPosition(address(vaultA), address(market));
        assertEq(ptBal, 0);
        assertEq(ytBal, 0);
        assertEq(lpBal, 0);
    }

    function test_getExpiryBuffer_defaultForRegistered() public {
        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));

        assertEq(adapter.getExpiryBuffer(address(vaultA)), 7 days);
    }

    function test_defaultExpiryBuffer_constant() public view {
        assertEq(adapter.DEFAULT_EXPIRY_BUFFER(), 7 days);
    }
}
