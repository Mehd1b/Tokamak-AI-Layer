// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { TokagentVault } from "../src/TokagentVault.sol";
import { IERC20 } from "../src/interfaces/IERC20.sol";

// Minimal ERC20 for vault tests
contract MockERC20 {
    string public name = "Mock";
    string public symbol = "MCK";
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

// Minimal target contract for allowlist tests
contract MockTarget {
    uint256 public value;
    uint256 public lastValueSent;

    function setValue(uint256 v) external payable {
        value = v;
        lastValueSent = msg.value;
    }

    function willRevert() external pure {
        revert("boom");
    }

    function payable_noop() external payable {}
}

contract TokagentVaultTest is Test {
    TokagentVault internal vault;
    MockERC20 internal token;
    MockTarget internal target;

    address internal owner = makeAddr("owner");
    address internal operator = makeAddr("operator");
    address internal bob = makeAddr("bob");

    bytes4 internal constant SET_VALUE = bytes4(keccak256("setValue(uint256)"));
    bytes4 internal constant WILL_REVERT = bytes4(keccak256("willRevert()"));
    bytes4 internal constant PAYABLE_NOOP = bytes4(keccak256("payable_noop()"));

    function setUp() public {
        token = new MockERC20();
        target = new MockTarget();
    }

    function _deployEmptyVault() internal returns (TokagentVault) {
        TokagentVault.Entry[] memory entries = new TokagentVault.Entry[](0);
        TokagentVault.ApprovalSpec[] memory approvals = new TokagentVault.ApprovalSpec[](0);
        return new TokagentVault(owner, operator, entries, approvals);
    }

    function _deployWithTargetAllowlisted() internal returns (TokagentVault) {
        TokagentVault.Entry[] memory entries = new TokagentVault.Entry[](2);
        entries[0] = TokagentVault.Entry({ target: address(target), selector: SET_VALUE });
        entries[1] = TokagentVault.Entry({ target: address(target), selector: PAYABLE_NOOP });
        TokagentVault.ApprovalSpec[] memory approvals = new TokagentVault.ApprovalSpec[](0);
        return new TokagentVault(owner, operator, entries, approvals);
    }

    // ============ Constructor tests ============

    function test_constructor_setsOwnerAndOperator() public {
        vault = _deployEmptyVault();
        assertEq(vault.owner(), owner);
        assertEq(vault.operator(), operator);
        assertEq(vault.vaultKind(), keccak256("TokagentVault:v1"));
    }

    function test_constructor_rejectsZeroOwner() public {
        TokagentVault.Entry[] memory entries = new TokagentVault.Entry[](0);
        TokagentVault.ApprovalSpec[] memory approvals = new TokagentVault.ApprovalSpec[](0);
        vm.expectRevert(TokagentVault.ZeroAddress.selector);
        new TokagentVault(address(0), operator, entries, approvals);
    }

    function test_constructor_rejectsZeroOperator() public {
        TokagentVault.Entry[] memory entries = new TokagentVault.Entry[](0);
        TokagentVault.ApprovalSpec[] memory approvals = new TokagentVault.ApprovalSpec[](0);
        vm.expectRevert(TokagentVault.ZeroAddress.selector);
        new TokagentVault(owner, address(0), entries, approvals);
    }

    function test_constructor_seedsAllowlist() public {
        vault = _deployWithTargetAllowlisted();
        assertTrue(vault.isAllowlisted(address(target), SET_VALUE));
        assertTrue(vault.isAllowlisted(address(target), PAYABLE_NOOP));
        assertFalse(vault.isAllowlisted(address(target), WILL_REVERT));
        assertEq(vault.allowlistedSelectorCount(address(target)), 2);
    }

    function test_constructor_seedsApprovals() public {
        TokagentVault.Entry[] memory entries = new TokagentVault.Entry[](1);
        entries[0] = TokagentVault.Entry({ target: address(target), selector: SET_VALUE });
        TokagentVault.ApprovalSpec[] memory approvals = new TokagentVault.ApprovalSpec[](1);
        approvals[0] = TokagentVault.ApprovalSpec({ token: address(token), spender: address(target), amount: 1e18 });
        vault = new TokagentVault(owner, operator, entries, approvals);
        assertEq(token.allowance(address(vault), address(target)), 1e18);
    }

    function test_constructor_rejectsApprovalForNonAllowlistedSpender() public {
        TokagentVault.Entry[] memory entries = new TokagentVault.Entry[](0);
        TokagentVault.ApprovalSpec[] memory approvals = new TokagentVault.ApprovalSpec[](1);
        approvals[0] = TokagentVault.ApprovalSpec({ token: address(token), spender: address(target), amount: 1e18 });
        vm.expectRevert(abi.encodeWithSelector(TokagentVault.SpenderNotAllowlisted.selector, address(target)));
        new TokagentVault(owner, operator, entries, approvals);
    }

    function test_constructor_dedupesAllowlistEntries() public {
        // Two identical entries should only count once.
        TokagentVault.Entry[] memory entries = new TokagentVault.Entry[](2);
        entries[0] = TokagentVault.Entry({ target: address(target), selector: SET_VALUE });
        entries[1] = TokagentVault.Entry({ target: address(target), selector: SET_VALUE });
        TokagentVault.ApprovalSpec[] memory approvals = new TokagentVault.ApprovalSpec[](0);
        vault = new TokagentVault(owner, operator, entries, approvals);
        assertEq(vault.allowlistedSelectorCount(address(target)), 1);
    }
}
