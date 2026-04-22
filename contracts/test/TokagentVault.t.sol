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

    // ============ executeBatch allowlist tests ============

    function test_executeBatch_allowlistedCallSucceeds() public {
        vault = _deployWithTargetAllowlisted();
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](1);
        calls[0] = TokagentVault.Call({
            target: address(target),
            data: abi.encodeWithSelector(SET_VALUE, 42),
            value: 0
        });
        vm.prank(operator);
        vault.executeBatch(calls);
        assertEq(target.value(), 42);
    }

    function test_executeBatch_unallowlistedCallReverts() public {
        vault = _deployWithTargetAllowlisted();
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](1);
        calls[0] = TokagentVault.Call({
            target: address(target),
            data: abi.encodeWithSelector(WILL_REVERT),
            value: 0
        });
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(TokagentVault.CallNotAllowlisted.selector, address(target), WILL_REVERT)
        );
        vault.executeBatch(calls);
    }

    function test_executeBatch_notOperatorReverts() public {
        vault = _deployWithTargetAllowlisted();
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](1);
        calls[0] = TokagentVault.Call({
            target: address(target),
            data: abi.encodeWithSelector(SET_VALUE, 42),
            value: 0
        });
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TokagentVault.NotOperator.selector, bob));
        vault.executeBatch(calls);
    }

    function test_executeBatch_ownerCannotCallAsOperator() public {
        vault = _deployWithTargetAllowlisted();
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](1);
        calls[0] = TokagentVault.Call({
            target: address(target),
            data: abi.encodeWithSelector(SET_VALUE, 42),
            value: 0
        });
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(TokagentVault.NotOperator.selector, owner));
        vault.executeBatch(calls);
    }

    function test_executeBatch_oneCallRevertsWholeBatch() public {
        vault = _deployWithTargetAllowlisted();
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](2);
        calls[0] = TokagentVault.Call({
            target: address(target),
            data: abi.encodeWithSelector(SET_VALUE, 1),
            value: 0
        });
        calls[1] = TokagentVault.Call({
            target: address(target),
            data: abi.encodeWithSelector(WILL_REVERT),
            value: 0
        });
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(TokagentVault.CallNotAllowlisted.selector, address(target), WILL_REVERT)
        );
        vault.executeBatch(calls);
        assertEq(target.value(), 0);
    }

    function test_executeBatch_passesValueToCall() public {
        vault = _deployWithTargetAllowlisted();
        vm.deal(address(vault), 1 ether);
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](1);
        calls[0] = TokagentVault.Call({
            target: address(target),
            data: abi.encodeWithSelector(PAYABLE_NOOP),
            value: 0.5 ether
        });
        vm.prank(operator);
        vault.executeBatch(calls);
        assertEq(address(target).balance, 0.5 ether);
    }

    function test_executeBatch_rejectsShortData() public {
        vault = _deployWithTargetAllowlisted();
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](1);
        calls[0] = TokagentVault.Call({ target: address(target), data: hex"010203", value: 0 });
        vm.prank(operator);
        vm.expectRevert(TokagentVault.DataTooShort.selector);
        vault.executeBatch(calls);
    }

    function test_executeBatch_targetRevertBubbles() public {
        TokagentVault.Entry[] memory entries = new TokagentVault.Entry[](1);
        entries[0] = TokagentVault.Entry({ target: address(target), selector: WILL_REVERT });
        TokagentVault.ApprovalSpec[] memory approvals = new TokagentVault.ApprovalSpec[](0);
        vault = new TokagentVault(owner, operator, entries, approvals);
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](1);
        calls[0] = TokagentVault.Call({
            target: address(target),
            data: abi.encodeWithSelector(WILL_REVERT),
            value: 0
        });
        vm.prank(operator);
        vm.expectPartialRevert(TokagentVault.CallFailed.selector);
        vault.executeBatch(calls);
    }

    // ============ approveToken tests ============

    function test_approveToken_succeedsWhenSpenderAllowlisted() public {
        vault = _deployWithTargetAllowlisted();
        vm.prank(operator);
        vault.approveToken(address(token), address(target), 1e18);
        assertEq(token.allowance(address(vault), address(target)), 1e18);
    }

    function test_approveToken_revertsWhenSpenderNotAllowlisted() public {
        vault = _deployEmptyVault();
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(TokagentVault.SpenderNotAllowlisted.selector, address(target))
        );
        vault.approveToken(address(token), address(target), 1e18);
    }

    function test_approveToken_notOperatorReverts() public {
        vault = _deployWithTargetAllowlisted();
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TokagentVault.NotOperator.selector, bob));
        vault.approveToken(address(token), address(target), 1e18);
    }

    function test_approveToken_revertsAfterAllowlistRevoked() public {
        vault = _deployWithTargetAllowlisted();
        vm.prank(operator);
        vault.approveToken(address(token), address(target), 1e18);

        vm.startPrank(owner);
        vault.ownerSetAllowlist(address(target), SET_VALUE, false);
        vault.ownerSetAllowlist(address(target), PAYABLE_NOOP, false);
        vm.stopPrank();

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(TokagentVault.SpenderNotAllowlisted.selector, address(target))
        );
        vault.approveToken(address(token), address(target), 2e18);
    }

    // ============ Owner function tests ============

    function test_ownerSetOperator_rotates() public {
        vault = _deployEmptyVault();
        address newOp = makeAddr("newOp");
        vm.prank(owner);
        vault.ownerSetOperator(newOp);
        assertEq(vault.operator(), newOp);
        TokagentVault.Call[] memory calls = new TokagentVault.Call[](0);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(TokagentVault.NotOperator.selector, operator));
        vault.executeBatch(calls);
    }

    function test_ownerSetOperator_rejectsZero() public {
        vault = _deployEmptyVault();
        vm.prank(owner);
        vm.expectRevert(TokagentVault.ZeroAddress.selector);
        vault.ownerSetOperator(address(0));
    }

    function test_ownerSetOperator_notOwnerReverts() public {
        vault = _deployEmptyVault();
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TokagentVault.NotOwner.selector, bob));
        vault.ownerSetOperator(bob);
    }

    function test_ownerSetAllowlist_addsEntry() public {
        vault = _deployEmptyVault();
        vm.prank(owner);
        vault.ownerSetAllowlist(address(target), SET_VALUE, true);
        assertTrue(vault.isAllowlisted(address(target), SET_VALUE));
        assertEq(vault.allowlistedSelectorCount(address(target)), 1);
    }

    function test_ownerSetAllowlist_removesEntry() public {
        vault = _deployWithTargetAllowlisted();
        vm.prank(owner);
        vault.ownerSetAllowlist(address(target), SET_VALUE, false);
        assertFalse(vault.isAllowlisted(address(target), SET_VALUE));
        assertEq(vault.allowlistedSelectorCount(address(target)), 1);
    }

    function test_ownerSetAllowlist_idempotent() public {
        vault = _deployEmptyVault();
        vm.startPrank(owner);
        vault.ownerSetAllowlist(address(target), SET_VALUE, true);
        vault.ownerSetAllowlist(address(target), SET_VALUE, true);
        vault.ownerSetAllowlist(address(target), SET_VALUE, true);
        vm.stopPrank();
        assertEq(vault.allowlistedSelectorCount(address(target)), 1);
    }

    function test_ownerSetAllowlistBatch_multipleEntries() public {
        vault = _deployEmptyVault();
        TokagentVault.Entry[] memory entries = new TokagentVault.Entry[](3);
        entries[0] = TokagentVault.Entry({ target: address(target), selector: SET_VALUE });
        entries[1] = TokagentVault.Entry({ target: address(target), selector: PAYABLE_NOOP });
        entries[2] = TokagentVault.Entry({ target: address(token), selector: IERC20.transfer.selector });
        bool[] memory allowed = new bool[](3);
        allowed[0] = true;
        allowed[1] = true;
        allowed[2] = true;
        vm.prank(owner);
        vault.ownerSetAllowlistBatch(entries, allowed);
        assertTrue(vault.isAllowlisted(address(target), SET_VALUE));
        assertTrue(vault.isAllowlisted(address(target), PAYABLE_NOOP));
        assertTrue(vault.isAllowlisted(address(token), IERC20.transfer.selector));
        assertEq(vault.allowlistedSelectorCount(address(target)), 2);
        assertEq(vault.allowlistedSelectorCount(address(token)), 1);
    }

    function test_ownerSetAllowlistBatch_lengthMismatchReverts() public {
        vault = _deployEmptyVault();
        TokagentVault.Entry[] memory entries = new TokagentVault.Entry[](2);
        entries[0] = TokagentVault.Entry({ target: address(target), selector: SET_VALUE });
        entries[1] = TokagentVault.Entry({ target: address(target), selector: PAYABLE_NOOP });
        bool[] memory allowed = new bool[](1);
        allowed[0] = true;
        vm.prank(owner);
        vm.expectRevert("length mismatch");
        vault.ownerSetAllowlistBatch(entries, allowed);
    }

    // ============ Ownership two-step tests ============

    function test_transferOwnership_proposesButDoesNotChange() public {
        vault = _deployEmptyVault();
        vm.prank(owner);
        vault.transferOwnership(bob);
        assertEq(vault.owner(), owner);
        assertEq(vault.pendingOwner(), bob);
    }

    function test_acceptOwnership_completesTransfer() public {
        vault = _deployEmptyVault();
        vm.prank(owner);
        vault.transferOwnership(bob);
        vm.prank(bob);
        vault.acceptOwnership();
        assertEq(vault.owner(), bob);
        assertEq(vault.pendingOwner(), address(0));
    }

    function test_acceptOwnership_notPendingOwnerReverts() public {
        vault = _deployEmptyVault();
        vm.prank(owner);
        vault.transferOwnership(bob);
        address carol = makeAddr("carol");
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(TokagentVault.NotPendingOwner.selector, carol, bob));
        vault.acceptOwnership();
    }

    function test_acceptOwnership_noProposalReverts() public {
        vault = _deployEmptyVault();
        vm.prank(bob);
        vm.expectRevert(TokagentVault.NoPendingOwner.selector);
        vault.acceptOwnership();
    }
}
