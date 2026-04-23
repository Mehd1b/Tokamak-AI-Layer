// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { TokagentVault } from "../src/TokagentVault.sol";
import { IERC20 } from "../src/interfaces/IERC20.sol";

interface IAavePoolMinimal {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

contract TokagentVaultForkTest is Test {
    address internal constant POLYGON_AAVE_V3_POOL = 0x794a61358D6845594F94dc1DB02A252b5b4814aD;
    address internal constant POLYGON_USDC = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174;
    address internal constant USDC_WHALE = 0x0D0707963952f2fBA59dD06f2b425ace40b492Fe;

    TokagentVault internal vault;
    address internal owner = makeAddr("owner");
    address internal operator = makeAddr("operator");

    bytes4 internal constant AAVE_SUPPLY_SELECTOR =
        bytes4(keccak256("supply(address,uint256,address,uint16)"));
    bytes4 internal constant AAVE_WITHDRAW_SELECTOR =
        bytes4(keccak256("withdraw(address,uint256,address)"));

    function setUp() public {
        vm.createSelectFork(vm.envString("POLYGON_RPC_URL"));

        TokagentVault.Entry[] memory entries = new TokagentVault.Entry[](2);
        entries[0] = TokagentVault.Entry({
            target: POLYGON_AAVE_V3_POOL,
            selector: AAVE_SUPPLY_SELECTOR
        });
        entries[1] = TokagentVault.Entry({
            target: POLYGON_AAVE_V3_POOL,
            selector: AAVE_WITHDRAW_SELECTOR
        });
        TokagentVault.ApprovalSpec[] memory approvals = new TokagentVault.ApprovalSpec[](1);
        approvals[0] = TokagentVault.ApprovalSpec({
            token: POLYGON_USDC,
            spender: POLYGON_AAVE_V3_POOL,
            amount: type(uint256).max
        });
        vault = new TokagentVault(owner, operator, entries, approvals);

        vm.prank(USDC_WHALE);
        (bool ok,) = POLYGON_USDC.call(
            abi.encodeWithSelector(IERC20.transfer.selector, address(vault), 1_000 * 1e6)
        );
        require(ok, "whale transfer failed");
    }

    function test_fork_aaveSupplyAndWithdraw() public {
        uint256 usdcBefore = IERC20(POLYGON_USDC).balanceOf(address(vault));
        assertEq(usdcBefore, 1_000 * 1e6);

        TokagentVault.Call[] memory calls = new TokagentVault.Call[](1);
        calls[0] = TokagentVault.Call({
            target: POLYGON_AAVE_V3_POOL,
            data: abi.encodeWithSelector(
                AAVE_SUPPLY_SELECTOR,
                POLYGON_USDC,
                500 * 1e6,
                address(vault),
                uint16(0)
            ),
            value: 0
        });
        vm.prank(operator);
        vault.executeBatch(calls);

        assertEq(IERC20(POLYGON_USDC).balanceOf(address(vault)), 500 * 1e6);

        calls[0] = TokagentVault.Call({
            target: POLYGON_AAVE_V3_POOL,
            data: abi.encodeWithSelector(
                AAVE_WITHDRAW_SELECTOR,
                POLYGON_USDC,
                300 * 1e6,
                address(vault)
            ),
            value: 0
        });
        vm.prank(operator);
        vault.executeBatch(calls);

        uint256 usdcAfter = IERC20(POLYGON_USDC).balanceOf(address(vault));
        assertGe(usdcAfter, 800 * 1e6);
        assertLe(usdcAfter, 800 * 1e6 + 100);
    }

    function test_fork_unallowlistedAaveFunctionReverts() public {
        bytes4 flashLoanSelector = bytes4(keccak256("flashLoanSimple(address,address,uint256,bytes,uint16)"));
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](1);
        calls[0] = TokagentVault.Call({
            target: POLYGON_AAVE_V3_POOL,
            data: abi.encodeWithSelector(flashLoanSelector, address(vault), POLYGON_USDC, 100 * 1e6, "", uint16(0)),
            value: 0
        });
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                TokagentVault.CallNotAllowlisted.selector,
                POLYGON_AAVE_V3_POOL,
                flashLoanSelector
            )
        );
        vault.executeBatch(calls);
    }

    function test_fork_operatorCannotApproveUnknownSpender() public {
        address arbitrary = makeAddr("attacker-contract");
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(TokagentVault.SpenderNotAllowlisted.selector, arbitrary));
        vault.approveToken(POLYGON_USDC, arbitrary, type(uint256).max);
    }

    function test_fork_ownerCanRecoverAfterCompromise() public {
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](1);
        calls[0] = TokagentVault.Call({
            target: POLYGON_AAVE_V3_POOL,
            data: abi.encodeWithSelector(
                AAVE_SUPPLY_SELECTOR,
                POLYGON_USDC,
                500 * 1e6,
                address(vault),
                uint16(0)
            ),
            value: 0
        });
        vm.prank(operator);
        vault.executeBatch(calls);

        uint256 ownerBefore = IERC20(POLYGON_USDC).balanceOf(owner);
        vm.prank(owner);
        vault.ownerWithdrawERC20(POLYGON_USDC, 500 * 1e6, owner);
        assertEq(IERC20(POLYGON_USDC).balanceOf(owner), ownerBefore + 500 * 1e6);
    }
}
