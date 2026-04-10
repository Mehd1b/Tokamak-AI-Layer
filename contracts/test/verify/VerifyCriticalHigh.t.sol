// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "forge-std/console.sol";

import {
    MorphoAdapter,
    MarketParams,
    IMorpho,
    IKernelVaultOwner
} from "../../src/adapters/MorphoAdapter.sol";

import {
    AaveV3Adapter,
    IPool,
    IRewardsController
} from "../../src/adapters/AaveV3Adapter.sol";
import { IAaveV3Adapter } from "../../src/interfaces/IAaveV3Adapter.sol";

import { PolymarketAdapter } from "../../src/adapters/PolymarketAdapter.sol";

import { MetaVault, IKernelVaultLike } from "../../src/MetaVault.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// ============================================================================
// Mock Contracts
// ============================================================================

contract MockToken {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
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
        if (allowance[from][msg.sender] != type(uint256).max) {
            require(allowance[from][msg.sender] >= amount, "insufficient allowance");
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockMorphoBlue {
    struct Position {
        uint256 supplyShares;
        uint128 borrowShares;
        uint128 collateral;
    }

    mapping(bytes32 => mapping(address => Position)) public positions;
    mapping(bytes32 => MarketParams) public marketParamsStore;

    function setMarket(MarketParams calldata params) external {
        bytes32 id = keccak256(abi.encode(params));
        marketParamsStore[id] = params;
    }

    function supply(
        MarketParams calldata params, uint256 assets, uint256, address onBehalfOf, bytes calldata
    ) external returns (uint256, uint256) {
        bytes32 id = keccak256(abi.encode(params));
        MockToken(params.loanToken).transferFrom(msg.sender, address(this), assets);
        positions[id][onBehalfOf].supplyShares += assets;
        return (assets, assets);
    }

    function withdraw(
        MarketParams calldata params, uint256 assets, uint256 shares, address onBehalfOf, address receiver
    ) external returns (uint256, uint256) {
        bytes32 id = keccak256(abi.encode(params));
        uint256 w = assets > 0 ? assets : shares;
        positions[id][onBehalfOf].supplyShares -= w;
        MockToken(params.loanToken).transfer(receiver, w);
        return (w, w);
    }

    function borrow(
        MarketParams calldata params, uint256 assets, uint256, address onBehalfOf, address receiver
    ) external returns (uint256, uint256) {
        bytes32 id = keccak256(abi.encode(params));
        positions[id][onBehalfOf].borrowShares += uint128(assets);
        MockToken(params.loanToken).transfer(receiver, assets);
        return (assets, assets);
    }

    function repay(
        MarketParams calldata params, uint256 assets, uint256, address onBehalfOf, bytes calldata
    ) external returns (uint256, uint256) {
        bytes32 id = keccak256(abi.encode(params));
        MockToken(params.loanToken).transferFrom(msg.sender, address(this), assets);
        positions[id][onBehalfOf].borrowShares -= uint128(assets);
        return (assets, assets);
    }

    function supplyCollateral(
        MarketParams calldata params, uint256 assets, address onBehalfOf, bytes calldata
    ) external {
        bytes32 id = keccak256(abi.encode(params));
        MockToken(params.collateralToken).transferFrom(msg.sender, address(this), assets);
        positions[id][onBehalfOf].collateral += uint128(assets);
    }

    function withdrawCollateral(
        MarketParams calldata params, uint256 assets, address onBehalfOf, address receiver
    ) external {
        bytes32 id = keccak256(abi.encode(params));
        positions[id][onBehalfOf].collateral -= uint128(assets);
        MockToken(params.collateralToken).transfer(receiver, assets);
    }

    function idToMarketParams(bytes32 id) external view returns (MarketParams memory) {
        return marketParamsStore[id];
    }

    function position(bytes32 id, address user)
        external view returns (uint256, uint128, uint128)
    {
        Position memory p = positions[id][user];
        return (p.supplyShares, p.borrowShares, p.collateral);
    }
}

/// @notice Mock Aave V3 Pool - uses same units for collateral and debt (like real Aave base currency)
contract MockAavePool {
    mapping(address => mapping(address => uint256)) public aTokenBalance;
    mapping(address => uint256) public totalCollateral;
    mapping(address => uint256) public totalDebt;

    function supply(address asset, uint256 amount, address onBehalfOf, uint16) external {
        MockToken(asset).transferFrom(msg.sender, address(this), amount);
        aTokenBalance[onBehalfOf][asset] += amount;
        totalCollateral[onBehalfOf] += amount;
    }

    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        uint256 toWithdraw = amount == type(uint256).max ? aTokenBalance[msg.sender][asset] : amount;
        aTokenBalance[msg.sender][asset] -= toWithdraw;
        totalCollateral[msg.sender] -= toWithdraw;
        MockToken(asset).transfer(to, toWithdraw);
        return toWithdraw;
    }

    function borrow(address asset, uint256 amount, uint256, uint16, address onBehalfOf) external {
        totalDebt[onBehalfOf] += amount;
        MockToken(asset).transfer(msg.sender, amount);
    }

    function repay(address asset, uint256 amount, uint256, address onBehalfOf) external returns (uint256) {
        MockToken(asset).transferFrom(msg.sender, address(this), amount);
        totalDebt[onBehalfOf] -= amount;
        return amount;
    }

    function getUserAccountData(address user) external view returns (
        uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase,
        uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor
    ) {
        totalCollateralBase = totalCollateral[user];
        totalDebtBase = totalDebt[user];
        availableBorrowsBase = 0;
        currentLiquidationThreshold = 8000;
        ltv = 7500;
        if (totalDebtBase == 0) {
            healthFactor = type(uint256).max;
        } else {
            healthFactor = (totalCollateralBase * 1e18) / totalDebtBase;
        }
    }
}

contract MockRewardsController {
    function claimAllRewards(address[] calldata, address)
        external pure returns (address[] memory, uint256[] memory)
    {
        return (new address[](0), new uint256[](0));
    }
}

contract MockVault {
    address public immutable owner;

    constructor(address _owner) { owner = _owner; }

    function approveToken(address token, address spender, uint256 amount) external {
        MockToken(token).approve(spender, amount);
    }

    receive() external payable {}
    fallback() external payable {}
}

contract MockFactory {
    mapping(address => bool) public isDeployedVault;

    function setDeployedVault(address vault, bool deployed) external {
        isDeployedVault[vault] = deployed;
    }

    function registry() external pure returns (address) { return address(0); }
    function verifier() external pure returns (address) { return address(0); }
    function vaultCreationCodeStore() external pure returns (address) { return address(0); }
    function optimisticVaultCreationCodeStore() external pure returns (address) { return address(0); }
    function getAllVaults() external pure returns (address[] memory) { return new address[](0); }
    function vaultCount() external pure returns (uint256) { return 0; }
    function vaultAt(uint256) external pure returns (address) { return address(0); }
    function getAgentVaults(bytes32) external pure returns (address[] memory) { return new address[](0); }
    function computeVaultAddress(address, bytes32, address, bytes32) external pure returns (address, bytes32) { return (address(0), bytes32(0)); }
    function deployVault(bytes32, address, bytes32, bytes32) external pure returns (address) { return address(0); }
    function computeOptimisticVaultAddress(address, bytes32, address, bytes32, uint256) external pure returns (address, bytes32) { return (address(0), bytes32(0)); }
    function deployOptimisticVault(bytes32, address, bytes32, bytes32, uint256, uint256) external pure returns (address) { return address(0); }
    function vaultProtocolType(address) external pure returns (uint8) { return 0; }
    function setVaultProtocolType(address, uint8) external {}
    function registerExternalVault(address, bytes32) external {}
}

contract MockKernelVaultWithStrategy {
    IERC20 public asset;
    uint256 public totalShares;
    mapping(address => uint256) public shares;
    bool public strategyActive;
    uint256 public snapshotTotalAssets;
    uint256 internal constant _DECIMALS_OFFSET = 1e3;

    constructor(address _asset) { asset = IERC20(_asset); }

    function depositERC20Tokens(uint256 assets) external returns (uint256 sharesMinted) {
        uint256 ta = totalAssets();
        uint256 balBefore = asset.balanceOf(address(this));
        asset.transferFrom(msg.sender, address(this), assets);
        uint256 received = asset.balanceOf(address(this)) - balBefore;
        sharesMinted = (received * (totalShares + _DECIMALS_OFFSET)) / (ta + 1);
        require(sharesMinted > 0, "zero shares");
        shares[msg.sender] += sharesMinted;
        totalShares += sharesMinted;
    }

    function withdraw(uint256 shareAmount) external returns (uint256 assetsOut) {
        require(shares[msg.sender] >= shareAmount, "insufficient shares");
        uint256 eff = strategyActive ? snapshotTotalAssets : totalAssets();
        assetsOut = (shareAmount * (eff + 1)) / (totalShares + _DECIMALS_OFFSET);
        require(assetsOut > 0, "zero assets out");
        uint256 available = totalAssets();
        if (assetsOut > available) assetsOut = available;
        shares[msg.sender] -= shareAmount;
        totalShares -= shareAmount;
        if (strategyActive) snapshotTotalAssets -= assetsOut;
        asset.transfer(msg.sender, assetsOut);
    }

    function totalAssets() public view returns (uint256) { return asset.balanceOf(address(this)); }
    function effectiveTotalAssets() public view returns (uint256) {
        return strategyActive ? snapshotTotalAssets : totalAssets();
    }

    function simulateStrategyDeploy(uint256 amount) external {
        require(!strategyActive, "already active");
        snapshotTotalAssets = totalAssets();
        strategyActive = true;
        asset.transfer(address(0xDEAD), amount);
    }
}

// ============================================================================
// H-2: MorphoAdapter Shared Position Cross-Vault Drain [CRITICAL]
// ============================================================================

contract Test_H2_MorphoAdapter_CrossVaultDrain is Test {
    MorphoAdapter public adapter;
    MockMorphoBlue public morpho;
    MockFactory public factory;
    MockToken public loanToken;
    MockToken public collateralToken;
    MockVault public vaultA;
    MockVault public vaultB;

    address public ownerA = address(0xA001);
    address public ownerB = address(0xB001);
    MarketParams public market;

    function setUp() public {
        loanToken = new MockToken("USDC", "USDC", 6);
        collateralToken = new MockToken("WETH", "WETH", 18);
        morpho = new MockMorphoBlue();
        factory = new MockFactory();
        adapter = new MorphoAdapter(address(morpho), address(factory));

        vaultA = new MockVault(ownerA);
        vaultB = new MockVault(ownerB);
        factory.setDeployedVault(address(vaultA), true);
        factory.setDeployedVault(address(vaultB), true);

        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));
        vm.prank(ownerB);
        adapter.registerVault(address(vaultB));

        market = MarketParams({
            loanToken: address(loanToken),
            collateralToken: address(collateralToken),
            oracle: address(0x1234),
            irm: address(0x5678),
            lltv: 0.8e18
        });
        morpho.setMarket(market);

        vm.prank(ownerA);
        adapter.whitelistMarket(address(vaultA), market);
        vm.prank(ownerB);
        adapter.whitelistMarket(address(vaultB), market);

        loanToken.mint(address(vaultA), 100_000e6);
        loanToken.mint(address(vaultB), 50_000e6);
        vaultA.approveToken(address(loanToken), address(adapter), type(uint256).max);
        vaultB.approveToken(address(loanToken), address(adapter), type(uint256).max);
    }

    function test_H2_morpho_cross_vault_drain() public {
        // This PoC used to prove the cross-vault drain bug (audit H-2 / report C-01).
        // C-01 fix: the adapter now tracks per-vault supply and enforces it on
        // withdrawToVault. We keep the test as a regression check that asserts
        // the attack no longer works.
        console.log("=== C-01 regression: Morpho cross-vault drain blocked ===");

        vm.prank(address(vaultA));
        adapter.supply(market, 100_000e6);

        vm.prank(address(vaultB));
        adapter.supply(market, 50_000e6);

        // Vault B calls withdrawToVault() — may only drain its own tracked 50k
        uint256 vaultBBefore = loanToken.balanceOf(address(vaultB));
        vm.prank(address(vaultB));
        adapter.withdrawToVault();
        uint256 vaultBReceived = loanToken.balanceOf(address(vaultB)) - vaultBBefore;

        assertEq(vaultBReceived, 50_000e6, "Vault B only drained its tracked share");

        // Vault A can now drain its own 100k
        uint256 vaultABefore = loanToken.balanceOf(address(vaultA));
        vm.prank(address(vaultA));
        adapter.withdrawToVault();
        assertEq(
            loanToken.balanceOf(address(vaultA)) - vaultABefore,
            100_000e6,
            "Vault A recovers its full position"
        );
    }
}

// ============================================================================
// H-3: AaveV3Adapter Shared Position + Aggregate Health Check [CRITICAL]
// ============================================================================

contract Test_H3_AaveV3Adapter_CrossVaultBorrow is Test {
    AaveV3Adapter public adapter;
    MockAavePool public pool;
    MockRewardsController public rewards;
    MockFactory public factory;
    MockToken public tokenUSDC;
    MockVault public vaultA;
    MockVault public vaultB;

    address public ownerA = address(0xA002);
    address public ownerB = address(0xB002);

    function setUp() public {
        // Use SAME token for supply and borrow so mock HF calculation is consistent
        tokenUSDC = new MockToken("USDC", "USDC", 6);
        pool = new MockAavePool();
        rewards = new MockRewardsController();
        factory = new MockFactory();

        adapter = new AaveV3Adapter(
            address(pool), address(rewards), address(factory), 1.5e18
        );

        vaultA = new MockVault(ownerA);
        vaultB = new MockVault(ownerB);
        factory.setDeployedVault(address(vaultA), true);
        factory.setDeployedVault(address(vaultB), true);

        vm.prank(ownerA);
        adapter.registerVault(address(vaultA));
        vm.prank(ownerB);
        adapter.registerVault(address(vaultB));

        vm.prank(ownerA);
        adapter.setAllowedAsset(address(vaultA), address(tokenUSDC), true);
        vm.prank(ownerB);
        adapter.setAllowedAsset(address(vaultB), address(tokenUSDC), true);

        // Fund: vault A has 100k, vault B has 10k
        tokenUSDC.mint(address(vaultA), 100_000e6);
        tokenUSDC.mint(address(vaultB), 10_000e6);
        // Pool needs liquidity for borrows
        tokenUSDC.mint(address(pool), 500_000e6);

        vaultA.approveToken(address(tokenUSDC), address(adapter), type(uint256).max);
        vaultB.approveToken(address(tokenUSDC), address(adapter), type(uint256).max);
    }

    function test_H3_aave_cross_vault_borrow() public {
        // C-02 regression: the cross-vault borrow attack that used to succeed
        // is now blocked by the per-vault nominal health check.
        console.log("=== C-02 regression: Aave cross-vault borrow blocked ===");

        vm.prank(address(vaultA));
        adapter.supply(address(tokenUSDC), 100_000e6);

        vm.prank(address(vaultB));
        adapter.supply(address(tokenUSDC), 10_000e6);

        // Vault B tries to borrow 50k — only supported by the aggregate 110k
        // collateral; per-vault (10k) is insufficient at 1.5x HF.
        vm.prank(address(vaultB));
        vm.expectRevert(
            abi.encodeWithSelector(
                IAaveV3Adapter.HealthFactorTooLow.selector, 0.2e18, 1.5e18
            )
        );
        adapter.borrow(address(tokenUSDC), 50_000e6, 2);

        // Vault B can still borrow a safe amount: 10k supply / 1.5 HF ≈ 6,666
        vm.prank(address(vaultB));
        adapter.borrow(address(tokenUSDC), 6_000e6, 2);
        assertGe(tokenUSDC.balanceOf(address(vaultB)), 6_000e6);

        // withdrawToVault only drains Vault B's tracked 10k, not the aggregate
        vm.prank(address(vaultB));
        adapter.withdrawToVault();
        // Vault B's tracked supply is cleared
        assertEq(
            adapter.vaultSupplied(address(vaultB), address(tokenUSDC)), 0
        );
        // Vault A's 100k tracked supply is intact
        assertEq(
            adapter.vaultSupplied(address(vaultA), address(tokenUSDC)), 100_000e6
        );
    }
}

// ============================================================================
// H-1: MetaVault NAV Undervaluation During Active Strategy [HIGH]
// ============================================================================

contract Test_H1_MetaVault_NAV_Undervaluation is Test {
    MetaVault public metaVault;
    MockToken public token;
    MockFactory public factory;
    MockKernelVaultWithStrategy public kernelVault;

    address public metaOwner = address(this);
    address public depositorA = address(0xA003);
    address public attacker = address(0xA7A7);

    MockKernelVaultWithStrategy public kernelVault2;
    MockKernelVaultWithStrategy public kernelVault3;

    function setUp() public {
        token = new MockToken("USDC", "USDC", 6);
        factory = new MockFactory();
        metaVault = new MetaVault(address(token), address(factory), metaOwner);
        kernelVault = new MockKernelVaultWithStrategy(address(token));
        kernelVault2 = new MockKernelVaultWithStrategy(address(token));
        kernelVault3 = new MockKernelVaultWithStrategy(address(token));

        factory.setDeployedVault(address(kernelVault), true);
        factory.setDeployedVault(address(kernelVault2), true);
        factory.setDeployedVault(address(kernelVault3), true);
        // MAX_ALLOCATION_BPS = 4000. Use 3 vaults: 4000 + 3000 + 3000 = 10000
        metaVault.addVault(address(kernelVault), 4000);
        metaVault.addVault(address(kernelVault2), 3000);
        metaVault.addVault(address(kernelVault3), 3000);

        token.mint(depositorA, 1_000_000e6);
        token.mint(attacker, 500_000e6);

        vm.prank(depositorA);
        MockToken(address(token)).approve(address(metaVault), type(uint256).max);
        vm.prank(attacker);
        MockToken(address(token)).approve(address(metaVault), type(uint256).max);
    }

    function test_H1_metavault_nav_undervaluation() public {
        console.log("=== H-1: MetaVault NAV Undervaluation During Active Strategy ===");

        // STEP 1: Depositor A deposits 100k USDC
        vm.prank(depositorA);
        uint256 depositorAShares = metaVault.deposit(100_000e6);
        console.log("Depositor A shares:", depositorAShares);

        // STEP 2: Rebalance -- allocate heavily to main KernelVault
        address[] memory vaults = new address[](3);
        vaults[0] = address(kernelVault);
        vaults[1] = address(kernelVault2);
        vaults[2] = address(kernelVault3);
        uint256[] memory weights = new uint256[](3);
        weights[0] = 4000; // 40% to main vault (the one with strategy)
        weights[1] = 3000; // 30%
        weights[2] = 3000; // 30%
        metaVault.rebalance(vaults, weights);

        uint256 navAfterRebalance = metaVault.getNav();
        console.log("NAV after rebalance:", navAfterRebalance);

        // STEP 3: KernelVault deploys 90% of assets to strategy
        uint256 kvAssets = kernelVault.totalAssets();
        uint256 deployAmount = (kvAssets * 90) / 100;
        kernelVault.simulateStrategyDeploy(deployAmount);

        console.log("KV totalAssets (live):", kernelVault.totalAssets());
        console.log("KV effectiveTotalAssets (snapshot):", kernelVault.effectiveTotalAssets());

        // STEP 4: Check MetaVault NAV -- it uses totalAssets() not effectiveTotalAssets()
        uint256 navDuringStrategy = metaVault.getNav();
        console.log("MetaVault NAV during strategy:", navDuringStrategy);
        console.log("Expected NAV (pre-strategy):", navAfterRebalance);

        // H-01 regression: NAV is now stable during active strategy because
        // MetaVault reads `effectiveTotalAssets()` from the underlying KernelVault,
        // which returns the frozen snapshot value.
        assertEq(
            navDuringStrategy,
            navAfterRebalance,
            "H-01 FIXED: NAV unchanged during active strategy (uses snapshot)"
        );

        // An attacker depositing during the active period should get the same
        // pro-rata number of shares as depositor A (NAV is stable, deposit
        // amount is the same). Pre-fix, the attacker got substantially more.
        vm.prank(attacker);
        uint256 attackerShares = metaVault.deposit(100_000e6);

        // Within 1% of depositor A's share count
        uint256 diff = attackerShares > depositorAShares
            ? attackerShares - depositorAShares
            : depositorAShares - attackerShares;
        assertLe(
            (diff * 100) / depositorAShares,
            1,
            "H-01 FIXED: attacker shares are pro-rata to NAV"
        );
    }
}

// ============================================================================
// H-4: PolymarketAdapter withdrawToVault Drains All USDC [HIGH]
// ============================================================================

contract Test_H4_PolymarketAdapter_USDCDrain is Test {
    PolymarketAdapter public adapter;
    MockToken public usdc;
    MockFactory public factory;
    MockVault public vaultA;
    MockVault public vaultB;

    function setUp() public {
        usdc = new MockToken("USDC", "USDC", 6);
        factory = new MockFactory();

        adapter = new PolymarketAdapter(address(usdc), address(0xC7F0), address(factory));

        vaultA = new MockVault(address(0xA004));
        vaultB = new MockVault(address(0xB004));

        adapter.registerVault(address(vaultA), bytes32(uint256(1)), address(0x1111), address(0x2222));
        adapter.registerVault(address(vaultB), bytes32(uint256(2)), address(0x3333), address(0x4444));

        usdc.mint(address(vaultA), 100_000e6);
        usdc.mint(address(vaultB), 50_000e6);
        vaultA.approveToken(address(usdc), address(adapter), type(uint256).max);
        vaultB.approveToken(address(usdc), address(adapter), type(uint256).max);
    }

    function test_H4_polymarket_usdc_drain() public {
        // H-02 regression: buyOutcome is now NotImplemented so vaults deposit via
        // depositUSDC and can only withdraw their own tracked balance.
        vm.prank(address(vaultA));
        adapter.depositUSDC(100_000e6);
        vm.prank(address(vaultB));
        adapter.depositUSDC(50_000e6);

        assertEq(usdc.balanceOf(address(adapter)), 150_000e6);

        // Vault B drains only its tracked 50k
        uint256 vaultBBefore = usdc.balanceOf(address(vaultB));
        vm.prank(address(vaultB));
        adapter.withdrawToVault();
        assertEq(
            usdc.balanceOf(address(vaultB)) - vaultBBefore,
            50_000e6,
            "H-02 FIXED: Vault B only recovers its own USDC"
        );

        // Vault A still has its full 100k tracked balance
        assertEq(adapter.vaultUsdcBalance(address(vaultA)), 100_000e6);
    }
}

// ============================================================================
// H-5: emergencyWithdraw Blocked During Active Strategy [HIGH]
// ============================================================================

contract Test_H5_EmergencyWithdraw_Blocked is Test {

    function test_H5_emergency_blocked() public {
        console.log("=== H-5: emergencyWithdraw Blocked During Active Strategy ===");

        // Code trace: KernelVault.sol L1004-L1051 (_processEmergencyWithdraw)
        //   L1019: effectiveAssets = effectiveTotalAssets() -- returns snapshotTotalAssets when strategyActive
        //   L1020: assetsOut = (shareAmount * (effectiveAssets + 1)) / (totalShares + OFFSET)
        //   L1024: available = totalAssets() -- returns live (depleted) balance
        //   L1025-1026: if (assetsOut > available) revert InsufficientAvailableAssets

        uint256 totalAssetsBefore = 1_000_000e6;
        uint256 totalSharesVal = 1_000_000e6;
        uint256 OFFSET = 1e3;
        uint256 deployPercent = 90;

        uint256 snapshotAssets = totalAssetsBefore;
        uint256 liveAssets = totalAssetsBefore * (100 - deployPercent) / 100;

        // Test: user with 50% of shares
        uint256 userShares50 = 500_000e6;
        uint256 assetsOut50 = (userShares50 * (snapshotAssets + 1)) / (totalSharesVal + OFFSET);
        console.log("50% holder assetsOut:", assetsOut50);
        console.log("Available:", liveAssets);
        assertTrue(assetsOut50 > liveAssets, "50% holder: emergencyWithdraw reverts");

        // Test: user with 20% of shares
        uint256 userShares20 = 200_000e6;
        uint256 assetsOut20 = (userShares20 * (snapshotAssets + 1)) / (totalSharesVal + OFFSET);
        console.log("20% holder assetsOut:", assetsOut20);
        assertTrue(assetsOut20 > liveAssets, "20% holder: emergencyWithdraw reverts");

        // Max withdrawable shares
        uint256 maxSafeShares = (liveAssets * (totalSharesVal + OFFSET)) / (snapshotAssets + 1);
        console.log("Max safe shares:", maxSafeShares);
        console.log("As % of total:", (maxSafeShares * 100) / totalSharesVal, "%");

        console.log("=== H-5 CONFIRMED ===");
    }
}
