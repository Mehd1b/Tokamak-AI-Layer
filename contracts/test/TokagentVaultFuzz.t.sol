// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { TokagentVault } from "../src/TokagentVault.sol";
import { IERC20 } from "../src/interfaces/IERC20.sol";

contract _FuzzMockERC20 {
    mapping(address => uint256) public balanceOf;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount);
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    function approve(address, uint256) external pure returns (bool) { return true; }
}

contract TokagentVaultFuzzTest is Test {
    TokagentVault internal vault;
    _FuzzMockERC20 internal token;

    address internal owner = makeAddr("owner");
    address internal operator = makeAddr("operator");

    function setUp() public {
        token = new _FuzzMockERC20();
        TokagentVault.Entry[] memory e = new TokagentVault.Entry[](0);
        TokagentVault.ApprovalSpec[] memory a = new TokagentVault.ApprovalSpec[](0);
        vault = new TokagentVault(owner, operator, e, a);
    }

    /// Fuzz: random (target, selector, data) triples passed through executeBatch must revert
    /// unless the specific (target, selector) pair was allowlisted.
    function testFuzz_executeBatch_unallowlistedAlwaysReverts(
        address target,
        bytes4 selector,
        bytes calldata trailer
    ) public {
        vm.assume(target != address(0) && target != address(vault) && target.code.length == 0);
        bytes memory data = abi.encodePacked(selector, trailer);
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](1);
        calls[0] = TokagentVault.Call({ target: target, data: data, value: 0 });
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(TokagentVault.CallNotAllowlisted.selector, target, selector)
        );
        vault.executeBatch(calls);
    }

    /// Fuzz: ownerWithdrawERC20 must always succeed regardless of allowlist state,
    /// provided the vault balance is sufficient.
    function testFuzz_ownerWithdrawERC20_alwaysWorks(uint96 deposited, uint96 amount, address to) public {
        vm.assume(to != address(0));
        vm.assume(to != address(token));
        amount = uint96(bound(amount, 0, deposited));
        token.mint(address(vault), deposited);
        uint256 toBalanceBefore = token.balanceOf(to);
        vm.prank(owner);
        vault.ownerWithdrawERC20(address(token), amount, to);
        assertEq(token.balanceOf(to), toBalanceBefore + amount);
        assertEq(token.balanceOf(address(vault)), uint256(deposited) - uint256(amount));
    }

    /// Fuzz: ownerSetAllowlist followed by the inverse must leave state unchanged.
    function testFuzz_allowlistToggle_isInvolutive(address target, bytes4 selector) public {
        vm.assume(target != address(0));
        bool before = vault.isAllowlisted(target, selector);
        uint256 countBefore = vault.allowlistedSelectorCount(target);
        vm.startPrank(owner);
        vault.ownerSetAllowlist(target, selector, !before);
        vault.ownerSetAllowlist(target, selector, before);
        vm.stopPrank();
        assertEq(vault.isAllowlisted(target, selector), before);
        assertEq(vault.allowlistedSelectorCount(target), countBefore);
    }

    /// Fuzz: approveToken rejects any spender with zero allowlisted selectors.
    function testFuzz_approveToken_rejectsUnknownSpender(address spender, uint256 amount) public {
        vm.assume(vault.allowlistedSelectorCount(spender) == 0);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(TokagentVault.SpenderNotAllowlisted.selector, spender));
        vault.approveToken(address(token), spender, amount);
    }
}
