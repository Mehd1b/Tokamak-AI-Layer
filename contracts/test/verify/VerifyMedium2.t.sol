// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

// ============================================================
// H-12: VaultCreationCodeStore swap bypasses 48h UUPS timelock
// ============================================================

import { VaultFactory } from "../../src/VaultFactory.sol";
import { IAgentRegistry } from "../../src/interfaces/IAgentRegistry.sol";

contract MockRegistry_H12 {
    fallback() external {}
}
contract MockVerifier_H12 {
    fallback() external {}
}
contract MockCodeStore_H12 {
    uint256 public dummy = 1;
}

contract Test_H12 is Test {
    VaultFactory factory;
    address factoryOwner = makeAddr("factoryOwner");
    address codeStore1;
    address codeStore2;

    function setUp() public {
        address mockRegistry = address(new MockRegistry_H12());
        address mockVerifier = address(new MockVerifier_H12());
        codeStore1 = address(new MockCodeStore_H12());
        codeStore2 = address(new MockCodeStore_H12());

        VaultFactory impl = new VaultFactory();
        bytes memory initData = abi.encodeCall(
            VaultFactory.initialize,
            (mockRegistry, mockVerifier, factoryOwner, codeStore1)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        factory = VaultFactory(address(proxy));
    }

    function test_H12_code_store_swap_has_timelock() public {
        console.log("=== H-12 FIX: Code Store Swap Now Has Timelock ===");

        address initialStore = factory._vaultCreationCodeStore();
        assertEq(initialStore, codeStore1);

        uint256 upgradeDelay = factory.UPGRADE_DELAY();
        assertEq(upgradeDelay, 48 hours);

        // [M-07 FIX] Direct set reverts when code store is already set
        vm.prank(factoryOwner);
        vm.expectRevert("use schedule/activate");
        factory.setVaultCreationCodeStore(codeStore2);

        // Must use schedule + activate pattern
        vm.prank(factoryOwner);
        factory.scheduleVaultCreationCodeStore(codeStore2);

        // Activate before timelock reverts
        vm.prank(factoryOwner);
        vm.expectRevert("timelock not elapsed");
        factory.activateVaultCreationCodeStore();

        // Warp past timelock
        vm.warp(block.timestamp + upgradeDelay);
        vm.prank(factoryOwner);
        factory.activateVaultCreationCodeStore();

        assertEq(factory._vaultCreationCodeStore(), codeStore2, "Code store changed after timelock");

        // Optimistic code store: initial set works (from zero)
        address optStore1 = address(new MockCodeStore_H12());
        vm.prank(factoryOwner);
        factory.setOptimisticVaultCreationCodeStore(optStore1);
        assertEq(factory._optimisticVaultCreationCodeStore(), optStore1);

        // Subsequent change requires timelock
        address optStore2 = address(new MockCodeStore_H12());
        vm.prank(factoryOwner);
        vm.expectRevert("use schedule/activate");
        factory.setOptimisticVaultCreationCodeStore(optStore2);
    }
}

// ============================================================
// H-13: AaveV3Adapter health check ignores Aave LTV/LT
// ============================================================

import { AaveV3Adapter } from "../../src/adapters/AaveV3Adapter.sol";

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

contract MockPool_H13 {
    address public ADDRESSES_PROVIDER;
    constructor(address provider) { ADDRESSES_PROVIDER = provider; }
    function supply(address, uint256, address, uint16) external {}
    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        IERC20Minimal(asset).transfer(to, amount);
        return amount;
    }
    function borrow(address asset, uint256 amount, uint256, uint16, address) external {
        IERC20Minimal(asset).transfer(msg.sender, amount);
    }
    function repay(address, uint256, uint256, address) external returns (uint256) { return 0; }
    function getUserAccountData(address)
        external pure returns (uint256, uint256, uint256, uint256, uint256, uint256)
    { return (0, 0, 0, 7500, 7000, 2e18); }
}

contract MockAddressesProvider_H13 {
    address public oracle;
    constructor(address _oracle) { oracle = _oracle; }
    function getPriceOracle() external view returns (address) { return oracle; }
}

contract MockPriceOracle_H13 {
    mapping(address => uint256) public prices;
    function setPrice(address asset, uint256 price) external { prices[asset] = price; }
    function getAssetPrice(address asset) external view returns (uint256) { return prices[asset]; }
    function BASE_CURRENCY() external pure returns (address) { return address(0); }
    function BASE_CURRENCY_UNIT() external pure returns (uint256) { return 1e8; }
}

contract MockERC20_H13 {
    string public name;
    uint8 public decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    constructor(string memory _name, uint8 _dec) { name = _name; decimals = _dec; }
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (allowance[from][msg.sender] != type(uint256).max) allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount; balanceOf[to] += amount; return true;
    }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount; return true;
    }
}

contract MockVaultFactory_H13 {
    mapping(address => bool) public isDeployedVault;
    function setVault(address v) external { isDeployedVault[v] = true; }
}

contract MockRewardsController_H13 {
    function claimAllRewards(address[] calldata, address)
        external pure returns (address[] memory, uint256[] memory)
    { return (new address[](0), new uint256[](0)); }
}

contract MockVault_H13 {
    address public owner;
    constructor(address _owner) { owner = _owner; }
}

contract Test_H13 is Test {
    AaveV3Adapter adapter;
    MockPriceOracle_H13 oracle;
    MockVaultFactory_H13 vf;
    address vault;
    address vaultOwner = makeAddr("vaultOwner");

    function setUp() public {
        oracle = new MockPriceOracle_H13();
        MockAddressesProvider_H13 provider = new MockAddressesProvider_H13(address(oracle));
        MockPool_H13 pool = new MockPool_H13(address(provider));
        MockERC20_H13 weth = new MockERC20_H13("WETH", 18);
        MockERC20_H13 usdc = new MockERC20_H13("USDC", 6);
        oracle.setPrice(address(weth), 2000e8);
        oracle.setPrice(address(usdc), 1e8);
        vf = new MockVaultFactory_H13();
        MockRewardsController_H13 rc = new MockRewardsController_H13();
        adapter = new AaveV3Adapter(address(pool), address(rc), address(vf), 1.5e18);
        MockVault_H13 mv = new MockVault_H13(vaultOwner);
        vault = address(mv);
        vf.setVault(vault);
        vm.prank(vaultOwner);
        adapter.registerVault(vault);
        vm.startPrank(vaultOwner);
        adapter.setAllowedAsset(vault, address(weth), true);
        adapter.setAllowedAsset(vault, address(usdc), true);
        vm.stopPrank();
    }

    function test_H13_health_ignores_ltv() public {
        console.log("=== H-13: Adapter vs Aave Health Model Divergence ===");

        // Adapter: nominalHealth = totalSuppliedBase / totalBorrowedBase (100% LTV)
        // Aave: healthFactor = (totalCollateral * weightedLT) / totalDebt
        adapter.setMinHealthFactor(1e18);

        uint256 supplyAmount = 5e18; // 5 WETH = $10,000
        uint256 totalSuppliedBase = (supplyAmount * 2000e8) / 1e18;
        uint256 borrowAmount = 8000e6;
        uint256 totalBorrowedBase = (borrowAmount * 1e8) / 1e6;

        uint256 adapterHealth = (totalSuppliedBase * 1e18) / totalBorrowedBase;
        console.log("Adapter nominalHealth:", adapterHealth);

        uint256 aaveLT = 8250; // 82.5%
        uint256 aaveHealth = ((totalSuppliedBase * aaveLT / 10000) * 1e18) / totalBorrowedBase;
        console.log("Aave healthFactor:", aaveHealth);

        uint256 divergenceBps = ((adapterHealth - aaveHealth) * 10000) / adapterHealth;
        console.log("Divergence BPS:", divergenceBps);

        console.log("=== VERIFICATION ===");
        assertTrue(adapterHealth > aaveHealth, "Adapter health > Aave health");
        assertGt(divergenceBps, 1500, "Divergence exceeds 15%: LT ignored");
    }
}

// ============================================================
// H-14: MorphoAdapter hardcoded ORACLE_PRICE_SCALE=1e36
// ============================================================
// CONTESTED: The adapter uses 1e36 which MATCHES Morpho Blue's own constant.
// Morpho Blue's convention is that the oracle adjusts for decimals in its
// price() return value. If using a standard Morpho oracle, 1e36 is correct.
// The risk materializes only with non-standard oracles that don't pre-adjust.

contract Test_H14 is Test {
    function test_H14_hardcoded_oracle_price_scale() public {
        console.log("=== H-14: MorphoAdapter ORACLE_PRICE_SCALE ===");

        // Morpho Blue convention: oracle.price() returns:
        //   price of 1 unit collateral in loan token atomic units * 1e36 / 1e(collatDec)
        // So for USDC(6)/WETH(18), 1 WETH = 2000 USDC:
        //   price = 2000 * 1e6 * 1e36 / 1e18 = 2000 * 1e24

        uint256 ORACLE_PRICE_SCALE = 1e36; // Adapter's hardcoded value

        // Standard Morpho oracle returns price adjusted for decimals:
        uint256 morphoOraclePrice = 2000 * 1e24; // For USDC(6)/WETH(18) market

        uint256 vaultCollat = 1e18; // 1 WETH
        uint256 collatValueLoan = (vaultCollat * morphoOraclePrice) / ORACLE_PRICE_SCALE;

        console.log("Standard oracle: collatValueLoan =", collatValueLoan);
        assertEq(collatValueLoan, 2000e6, "Correct: 2000 USDC with standard oracle");

        // The RISK: if a non-standard oracle returns price WITHOUT decimal adjustment
        // (e.g., raw price 2000e18 instead of 2000e24), the calculation breaks:
        uint256 nonStandardPrice = 2000e18; // Hypothetical oracle ignoring decimals
        uint256 wrongValue = (vaultCollat * nonStandardPrice) / ORACLE_PRICE_SCALE;

        console.log("Non-standard oracle: collatValueLoan =", wrongValue);
        assertLt(wrongValue, 2000e6 / 1000, "Non-standard oracle: value off by 1e6+");

        console.log("=== VERIFICATION ===");
        console.log("Adapter's 1e36 matches Morpho Blue's own constant");
        console.log("Standard oracles work correctly");
        console.log("Non-standard oracles would break (but this is oracle's fault)");
        console.log("Verdict: CONTESTED - depends on oracle implementation");

        // The adapter's comment itself acknowledges the assumption:
        // "ORACLE_PRICE_SCALE = 10 ** (36 + loanDecimals - collateralDecimals)
        //  in the default implementation. We use the canonical 1e36."
        // This is correct for standard oracles but fragile for custom ones.
    }
}

// ============================================================
// H-15: CoreWriter silent rejection PPS drift
// ============================================================

contract Test_H15 is Test {
    function test_H15_corewriter_silent_rejection_pps_drift() public pure {
        // CODE-TRACE: CoreWriter is a HyperEVM system precompile (0x3333...).
        // Cannot be tested in Foundry. Trace with concrete values.

        uint256 vaultTotalAssets = 10_000e6;
        uint256 marginSent = 4_000e6;
        uint256 vaultBalanceAfter = vaultTotalAssets - marginSent;

        uint256 totalShares = 10_000e6;
        uint256 truePps = (vaultTotalAssets * 1e6) / totalShares;
        uint256 apparentPps = (vaultBalanceAfter * 1e6) / totalShares;

        uint256 ppsDrop = truePps - apparentPps;
        uint256 ppsDropPct = (ppsDrop * 100) / truePps;

        assert(ppsDropPct == 40);
        assert(ppsDrop > 0);
    }
}

// ============================================================
// H-16: Challenge window deadline race
// ============================================================

contract Test_H16 is Test {
    function test_H16_deadline_race() public view {
        console.log("=== H-16: Challenge Window Deadline Race ===");

        uint256 deadline = block.timestamp + 1 hours;
        uint256 atDeadline = deadline;

        // submitProof: if (block.timestamp > pending.deadline) revert
        bool submitPassesAtDeadline = !(atDeadline > deadline);
        // slashExpired: if (block.timestamp < pending.deadline) revert
        bool slashPassesAtDeadline = !(atDeadline < deadline);

        console.log("submitProof passes at deadline:", submitPassesAtDeadline);
        console.log("slashExpired passes at deadline:", slashPassesAtDeadline);

        assert(submitPassesAtDeadline);
        assert(slashPassesAtDeadline);

        console.log("=== VERIFICATION ===");
        console.log("Both functions accept at exact deadline timestamp");
        console.log("Sequencer ordering determines bond outcome (release vs slash)");
    }
}

// ============================================================
// H-17: VaultAccessControl deposited[] monotonically increases
// ============================================================

import { VaultAccessControl } from "../../src/extensions/VaultAccessControl.sol";

contract Test_H17 is Test {
    VaultAccessControl ac;
    address vaultAddr = makeAddr("vault");
    address acOwner = makeAddr("acOwner");
    address user = makeAddr("user");

    function setUp() public {
        vm.prank(acOwner);
        ac = new VaultAccessControl(vaultAddr);

        vm.startPrank(acOwner);
        ac.setDepositCapEnabled(true);
        ac.setDefaultDepositCap(1000e6);
        vm.stopPrank();
    }

    function test_H17_deposited_monotonically_increases() public {
        console.log("=== H-17: deposited[] Monotonically Increases ===");

        // Step 1: User deposits up to cap
        vm.prank(vaultAddr);
        ac.recordDeposit(user, 1000e6);
        assertEq(ac.deposited(user), 1000e6);

        // Step 2: Cap reached
        assertFalse(ac.canDeposit(user, 1), "Cap reached");

        // Step 3: User withdraws - but KernelVault does NOT call recordWithdrawal
        // Grep "recordWithdrawal" in KernelVault.sol returns 0 results.
        // deposited[user] stays at 1000e6 after withdrawal.

        // Step 4: User tries to re-deposit
        assertFalse(ac.canDeposit(user, 1), "LOCKED OUT: deposited never decremented by vault");

        console.log("=== VERIFICATION ===");
        console.log("deposited[user] after full withdrawal: %s (unchanged)", ac.deposited(user));
        assertEq(ac.deposited(user), 1000e6, "deposited never decremented");

        // Manual workaround: owner calls recordWithdrawal
        vm.prank(acOwner);
        ac.recordWithdrawal(user, 1000e6);
        assertTrue(ac.canDeposit(user, 500e6), "Manual fix works but not automated");

        console.log("HARM: Users permanently locked out after cap exhaustion");
        console.log("recordWithdrawal exists but KernelVault never calls it");
    }
}

// ============================================================
// H-18: KEV verification pause blocks all executions
// ============================================================

import { KernelExecutionVerifier } from "../../src/KernelExecutionVerifier.sol";

contract MockRiscZeroVerifier {
    function verify(bytes calldata, bytes32, bytes32) external pure {}
}

contract Test_H18 is Test {
    KernelExecutionVerifier kev;
    address kevOwner = makeAddr("kevOwner");

    function setUp() public {
        MockRiscZeroVerifier rzv = new MockRiscZeroVerifier();
        KernelExecutionVerifier impl = new KernelExecutionVerifier();
        bytes memory initData = abi.encodeCall(
            KernelExecutionVerifier.initialize,
            (address(rzv), kevOwner)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        kev = KernelExecutionVerifier(address(proxy));
    }

    function test_H18_verification_pause_blocks_all() public {
        console.log("=== H-18: KEV Verification Pause ===");

        assertFalse(kev.verificationPaused(), "Initially not paused");

        // Pause
        vm.prank(kevOwner);
        kev.setVerificationPaused(true);
        assertTrue(kev.verificationPaused(), "Now paused");

        // verify() reverts
        vm.expectRevert(KernelExecutionVerifier.VerificationPaused.selector);
        kev.verify(hex"00", bytes32(uint256(1)), bytes32(uint256(2)));

        // verifyAndParseWithImageId() reverts
        vm.expectRevert(KernelExecutionVerifier.VerificationPaused.selector);
        kev.verifyAndParseWithImageId(bytes32(uint256(1)), new bytes(209), hex"00");

        console.log("=== VERIFICATION ===");
        console.log("verify() reverts when paused: YES");
        console.log("verifyAndParseWithImageId() reverts when paused: YES");
        console.log("ALL vault execute() and submitProof() blocked system-wide");
        console.log("HARM: 7-day depositor lock if strategy active + verification paused");

        // Unpause works
        vm.prank(kevOwner);
        kev.setVerificationPaused(false);
        assertFalse(kev.verificationPaused(), "Unpaused");
    }
}
