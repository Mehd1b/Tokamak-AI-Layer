// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import { AaveV3Adapter } from "../src/adapters/AaveV3Adapter.sol";
import { IAaveV3Adapter } from "../src/interfaces/IAaveV3Adapter.sol";
import {
    MorphoAdapter, MarketParams, IKernelVaultOwner
} from "../src/adapters/MorphoAdapter.sol";

/// @dev Minimal ERC20 mock (same-file to avoid cross-suite collisions)
contract MiniERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory n, string memory s, uint8 d) {
        name = n;
        symbol = s;
        decimals = d;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address sp, uint256 a) external returns (bool) {
        allowance[msg.sender][sp] = a;
        return true;
    }

    function transfer(address to, uint256 a) external returns (bool) {
        require(balanceOf[msg.sender] >= a, "bal");
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        require(balanceOf[f] >= a, "bal");
        if (allowance[f][msg.sender] != type(uint256).max) {
            require(allowance[f][msg.sender] >= a, "allow");
            allowance[f][msg.sender] -= a;
        }
        balanceOf[f] -= a;
        balanceOf[t] += a;
        return true;
    }
}

/// @dev Mock Aave Pool with supply/withdraw accounting only
contract MiniAaveOracle {
    mapping(address => uint256) public prices;
    function setPrice(address a, uint256 p) external { prices[a] = p; }
    function getAssetPrice(address a) external view returns (uint256) {
        uint256 p = prices[a];
        require(p > 0, "no price");
        return p;
    }
    function BASE_CURRENCY_UNIT() external pure returns (uint256) { return 1e8; }
}

contract MiniAaveProvider {
    address public priceOracle;
    constructor(address o) { priceOracle = o; }
    function getPriceOracle() external view returns (address) { return priceOracle; }
}

contract MiniAavePool {
    mapping(address => mapping(address => uint256)) public supplied;
    mapping(address => mapping(address => uint256)) public borrowed;
    address public _ap;

    function setAddressesProvider(address p) external { _ap = p; }
    function ADDRESSES_PROVIDER() external view returns (address) { return _ap; }

    function supply(address asset, uint256 amount, address onBehalfOf, uint16) external {
        MiniERC20(asset).transferFrom(msg.sender, address(this), amount);
        supplied[onBehalfOf][asset] += amount;
    }

    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        uint256 avail = supplied[msg.sender][asset];
        uint256 toW = amount > avail ? avail : amount;
        supplied[msg.sender][asset] -= toW;
        MiniERC20(asset).transfer(to, toW);
        return toW;
    }

    function borrow(address asset, uint256 amount, uint256, uint16, address onBehalfOf) external {
        borrowed[onBehalfOf][asset] += amount;
        MiniERC20(asset).transfer(msg.sender, amount);
    }

    function repay(address asset, uint256 amount, uint256, address onBehalfOf)
        external
        returns (uint256)
    {
        MiniERC20(asset).transferFrom(msg.sender, address(this), amount);
        uint256 debt = borrowed[onBehalfOf][asset];
        uint256 rep = amount > debt ? debt : amount;
        borrowed[onBehalfOf][asset] -= rep;
        return rep;
    }

    function getUserAccountData(address)
        external
        pure
        returns (uint256, uint256, uint256, uint256, uint256, uint256)
    {
        // Aggregate health factor: always max (the broken aggregate check is bypassed
        // by the per-vault nominal health check introduced in the fix).
        return (0, 0, 0, 8000, 7500, type(uint256).max);
    }
}

contract MiniRewards {
    function claimAllRewards(address[] calldata, address)
        external
        pure
        returns (address[] memory, uint256[] memory)
    {
        return (new address[](0), new uint256[](0));
    }
}

contract MiniFactory {
    mapping(address => bool) public isDeployedVault;

    function mark(address v) external {
        isDeployedVault[v] = true;
    }
}

contract MiniVault {
    address public owner;

    constructor(address o) {
        owner = o;
    }

    function approveToken(address token, address sp, uint256 a) external {
        MiniERC20(token).approve(sp, a);
    }

    function callAdapter(address adapter, bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory ret) = adapter.call(data);
        require(ok, string(ret));
        return ret;
    }
}

contract MiniMorphoOracle {
    uint256 public price;
    constructor(uint256 p) { price = p; }
    function setPrice(uint256 p) external { price = p; }
}

// ─────────────────────────────────────────────────────────────
// Mock Morpho (minimal: supply/withdraw + supply/withdrawCollateral)
// ─────────────────────────────────────────────────────────────
contract MiniMorpho {
    struct Position {
        uint256 supplyShares;
        uint128 borrowShares;
        uint128 collateral;
    }

    mapping(bytes32 => mapping(address => Position)) public positions;
    mapping(bytes32 => MarketParams) public marketById;

    function setMarket(MarketParams calldata p) external {
        bytes32 id = keccak256(abi.encode(p));
        marketById[id] = p;
    }

    function supply(MarketParams calldata p, uint256 assets, uint256, address onBehalfOf, bytes calldata)
        external
        returns (uint256, uint256)
    {
        bytes32 id = keccak256(abi.encode(p));
        MiniERC20(p.loanToken).transferFrom(msg.sender, address(this), assets);
        positions[id][onBehalfOf].supplyShares += assets;
        return (assets, assets);
    }

    function withdraw(
        MarketParams calldata p,
        uint256 assets,
        uint256 shares,
        address onBehalfOf,
        address receiver
    ) external returns (uint256, uint256) {
        bytes32 id = keccak256(abi.encode(p));
        uint256 amt = assets > 0 ? assets : shares;
        positions[id][onBehalfOf].supplyShares -= amt;
        MiniERC20(p.loanToken).transfer(receiver, amt);
        return (amt, amt);
    }

    function borrow(
        MarketParams calldata p,
        uint256 assets,
        uint256,
        address onBehalfOf,
        address receiver
    ) external returns (uint256, uint256) {
        bytes32 id = keccak256(abi.encode(p));
        positions[id][onBehalfOf].borrowShares += uint128(assets);
        MiniERC20(p.loanToken).transfer(receiver, assets);
        return (assets, assets);
    }

    function repay(MarketParams calldata p, uint256 assets, uint256, address onBehalfOf, bytes calldata)
        external
        returns (uint256, uint256)
    {
        bytes32 id = keccak256(abi.encode(p));
        MiniERC20(p.loanToken).transferFrom(msg.sender, address(this), assets);
        positions[id][onBehalfOf].borrowShares -= uint128(assets);
        return (assets, assets);
    }

    function supplyCollateral(
        MarketParams calldata p,
        uint256 assets,
        address onBehalfOf,
        bytes calldata
    ) external {
        bytes32 id = keccak256(abi.encode(p));
        MiniERC20(p.collateralToken).transferFrom(msg.sender, address(this), assets);
        positions[id][onBehalfOf].collateral += uint128(assets);
    }

    function withdrawCollateral(
        MarketParams calldata p,
        uint256 assets,
        address onBehalfOf,
        address receiver
    ) external {
        bytes32 id = keccak256(abi.encode(p));
        positions[id][onBehalfOf].collateral -= uint128(assets);
        MiniERC20(p.collateralToken).transfer(receiver, assets);
    }

    function idToMarketParams(bytes32 id) external view returns (MarketParams memory) {
        return marketById[id];
    }

    function position(bytes32 id, address user)
        external
        view
        returns (uint256, uint128, uint128)
    {
        Position memory p = positions[id][user];
        return (p.supplyShares, p.borrowShares, p.collateral);
    }
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────
contract AdapterCrossVaultIsolationTest is Test {
    // Aave pieces
    AaveV3Adapter public aave;
    MiniAavePool public aavePool;
    MiniRewards public rewards;
    MiniFactory public factory;
    MiniERC20 public usdc;

    MiniVault public vaultA;
    MiniVault public vaultB;
    address constant OWNER_A = address(0xA001);
    address constant OWNER_B = address(0xB001);

    // Morpho pieces
    MorphoAdapter public morpho;
    MiniMorpho public morphoCore;
    MiniERC20 public loan;
    MiniERC20 public collat;
    MarketParams public mkt;
    bytes32 public mktId;

    function setUp() public {
        // Common
        factory = new MiniFactory();

        // ─── Aave setup ───
        usdc = new MiniERC20("USDC", "USDC", 6);
        aavePool = new MiniAavePool();
        rewards = new MiniRewards();

        // C-03 fix: wire oracle + addresses provider
        MiniAaveOracle oracle = new MiniAaveOracle();
        oracle.setPrice(address(usdc), 1e8); // $1
        MiniAaveProvider provider = new MiniAaveProvider(address(oracle));
        aavePool.setAddressesProvider(address(provider));

        aave = new AaveV3Adapter(address(aavePool), address(rewards), address(factory), 1.5e18);

        vaultA = new MiniVault(OWNER_A);
        vaultB = new MiniVault(OWNER_B);
        factory.mark(address(vaultA));
        factory.mark(address(vaultB));

        // Register vaults
        vm.prank(OWNER_A);
        aave.registerVault(address(vaultA));
        vm.prank(OWNER_B);
        aave.registerVault(address(vaultB));

        // Allow USDC
        vm.prank(OWNER_A);
        aave.setAllowedAsset(address(vaultA), address(usdc), true);
        vm.prank(OWNER_B);
        aave.setAllowedAsset(address(vaultB), address(usdc), true);

        // Fund vaults and pool reserves
        usdc.mint(address(vaultA), 100_000e6);
        usdc.mint(address(vaultB), 50_000e6);
        usdc.mint(address(aavePool), 1_000_000e6);

        vaultA.approveToken(address(usdc), address(aave), type(uint256).max);
        vaultB.approveToken(address(usdc), address(aave), type(uint256).max);

        // ─── Morpho setup ───
        loan = new MiniERC20("LOAN", "LOAN", 18);
        collat = new MiniERC20("COLL", "COLL", 18);
        morphoCore = new MiniMorpho();
        morpho = new MorphoAdapter(address(morphoCore), address(factory));

        vm.prank(OWNER_A);
        morpho.registerVault(address(vaultA));
        vm.prank(OWNER_B);
        morpho.registerVault(address(vaultB));

        // C-04 fix: real oracle that returns 1e36 scale (1:1 loan/collat)
        MiniMorphoOracle morphoOracle = new MiniMorphoOracle(1e36);
        mkt = MarketParams({
            loanToken: address(loan),
            collateralToken: address(collat),
            oracle: address(morphoOracle),
            irm: address(0x2),
            lltv: 0.8e18
        });
        mktId = keccak256(abi.encode(mkt));
        morphoCore.setMarket(mkt);

        vm.prank(OWNER_A);
        morpho.whitelistMarket(address(vaultA), mkt);
        vm.prank(OWNER_B);
        morpho.whitelistMarket(address(vaultB), mkt);

        loan.mint(address(vaultA), 100_000e18);
        loan.mint(address(vaultB), 50_000e18);
        loan.mint(address(morphoCore), 1_000_000e18);

        vaultA.approveToken(address(loan), address(morpho), type(uint256).max);
        vaultB.approveToken(address(loan), address(morpho), type(uint256).max);
    }

    // ==========================================================
    // C-02 regression: Aave cross-vault withdraw drain blocked
    // ==========================================================
    function test_C02_aave_crossVaultWithdrawBlocked() public {
        // Vault A supplies 100k USDC, Vault B supplies 50k USDC
        vaultA.callAdapter(
            address(aave),
            abi.encodeCall(aave.supply, (address(usdc), 100_000e6))
        );
        vaultB.callAdapter(
            address(aave),
            abi.encodeCall(aave.supply, (address(usdc), 50_000e6))
        );

        // B attempts to withdraw 150k USDC (the adapter's entire pool position)
        vm.expectRevert(
            abi.encodeWithSelector(
                IAaveV3Adapter.InsufficientVaultPosition.selector, 150_000e6, 50_000e6
            )
        );
        vaultB.callAdapter(
            address(aave),
            abi.encodeCall(aave.withdraw, (address(usdc), 150_000e6))
        );

        // B can still withdraw its own 50k
        vaultB.callAdapter(
            address(aave),
            abi.encodeCall(aave.withdraw, (address(usdc), 50_000e6))
        );
        assertEq(aave.vaultSupplied(address(vaultB), address(usdc)), 0);
        // A's 100k remains intact in the adapter's pool position
        assertEq(aave.vaultSupplied(address(vaultA), address(usdc)), 100_000e6);
    }

    // ==========================================================
    // C-02 regression: Aave withdrawToVault only drains caller
    // ==========================================================
    function test_C02_aave_withdrawToVaultOnlyDrainsCaller() public {
        vaultA.callAdapter(
            address(aave), abi.encodeCall(aave.supply, (address(usdc), 100_000e6))
        );
        vaultB.callAdapter(
            address(aave), abi.encodeCall(aave.supply, (address(usdc), 50_000e6))
        );

        uint256 preB = usdc.balanceOf(address(vaultB));
        vaultB.callAdapter(address(aave), abi.encodeCall(aave.withdrawToVault, ()));

        // B receives exactly its own tracked supply, not the aggregate
        assertEq(usdc.balanceOf(address(vaultB)) - preB, 50_000e6);
        assertEq(aave.vaultSupplied(address(vaultB), address(usdc)), 0);
        assertEq(aave.vaultSupplied(address(vaultA), address(usdc)), 100_000e6);
    }

    // ==========================================================
    // C-02: per-vault nominal health factor enforced
    // ==========================================================
    function test_C02_aave_crossVaultBorrowBlocked() public {
        // A supplies 100k (will become the adapter's aggregate collateral)
        vaultA.callAdapter(
            address(aave), abi.encodeCall(aave.supply, (address(usdc), 100_000e6))
        );
        // B supplies 10k only
        vaultB.callAdapter(
            address(aave), abi.encodeCall(aave.supply, (address(usdc), 10_000e6))
        );

        // B tries to borrow 50k (5x its supply) — blocked by per-vault nominal HF.
        // Nominal = 10_000 / 50_000 * 1e18 = 0.2e18 < 1.5e18
        vm.expectRevert(
            abi.encodeWithSelector(
                IAaveV3Adapter.HealthFactorTooLow.selector, 0.2e18, 1.5e18
            )
        );
        vaultB.callAdapter(
            address(aave), abi.encodeCall(aave.borrow, (address(usdc), 50_000e6, 2))
        );
    }

    // ==========================================================
    // C-01 regression: Morpho cross-vault withdraw drain blocked
    // ==========================================================
    function test_C01_morpho_crossVaultWithdrawBlocked() public {
        vaultA.callAdapter(
            address(morpho), abi.encodeCall(morpho.supply, (mkt, 100_000e18))
        );
        vaultB.callAdapter(
            address(morpho), abi.encodeCall(morpho.supply, (mkt, 50_000e18))
        );

        // B tries to drain 150k (all supplies pooled on the adapter)
        vm.expectRevert(
            abi.encodeWithSelector(
                MorphoAdapter.InsufficientVaultPosition.selector, 150_000e18, 50_000e18
            )
        );
        vaultB.callAdapter(
            address(morpho), abi.encodeCall(morpho.withdraw, (mkt, 150_000e18))
        );

        // B may still withdraw its own 50k
        vaultB.callAdapter(
            address(morpho), abi.encodeCall(morpho.withdraw, (mkt, 50_000e18))
        );
        assertEq(morpho.vaultSupplied(address(vaultB), mktId), 0);
        assertEq(morpho.vaultSupplied(address(vaultA), mktId), 100_000e18);
    }

    // ==========================================================
    // C-01 regression: Morpho withdrawToVault only drains caller
    // ==========================================================
    function test_C01_morpho_withdrawToVaultOnlyDrainsCaller() public {
        vaultA.callAdapter(
            address(morpho), abi.encodeCall(morpho.supply, (mkt, 100_000e18))
        );
        vaultB.callAdapter(
            address(morpho), abi.encodeCall(morpho.supply, (mkt, 50_000e18))
        );

        uint256 preB = loan.balanceOf(address(vaultB));
        vaultB.callAdapter(address(morpho), abi.encodeCall(morpho.withdrawToVault, ()));

        assertEq(loan.balanceOf(address(vaultB)) - preB, 50_000e18);
        assertEq(morpho.vaultSupplied(address(vaultB), mktId), 0);
        assertEq(morpho.vaultSupplied(address(vaultA), mktId), 100_000e18);
    }

    // ==========================================================
    // C-01: per-vault health enforced on borrow, not aggregate
    // ==========================================================
    function test_C01_morpho_crossVaultBorrowBlocked() public {
        // Mint collateral to both vaults and approve
        collat.mint(address(vaultA), 100e18);
        collat.mint(address(vaultB), 1e18);
        vaultA.approveToken(address(collat), address(morpho), type(uint256).max);
        vaultB.approveToken(address(collat), address(morpho), type(uint256).max);

        // A posts 100 collateral; B posts only 1 collateral
        vaultA.callAdapter(
            address(morpho), abi.encodeCall(morpho.supplyCollateral, (mkt, 100e18))
        );
        vaultB.callAdapter(
            address(morpho), abi.encodeCall(morpho.supplyCollateral, (mkt, 1e18))
        );

        // B attempts to borrow 50 loan token (5x B's collateral, 50% of A's)
        // Per-vault: collat=1, lltv=0.8, 80% safety → maxBorrow = 1 * 0.8 * 0.8 = 0.64
        vm.expectRevert(
            abi.encodeWithSelector(
                MorphoAdapter.UnhealthyPosition.selector,
                50e18,
                (uint256(1e18) * 0.8e18 * 8000) / (1e18 * 10000)
            )
        );
        vaultB.callAdapter(
            address(morpho), abi.encodeCall(morpho.borrow, (mkt, 50e18))
        );
    }
}
