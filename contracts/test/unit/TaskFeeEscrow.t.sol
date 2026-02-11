// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {TaskFeeEscrow} from "../../src/core/TaskFeeEscrow.sol";
import {ITaskFeeEscrow} from "../../src/interfaces/ITaskFeeEscrow.sol";

/**
 * @title TaskFeeEscrowTest
 * @notice Unit tests for TaskFeeEscrow with escrow-based refund mechanism
 * @dev Uses a mock identity registry to simulate ERC-721 ownerOf and operator checks
 */

/// @dev Minimal mock of TALIdentityRegistry for testing ownership + operators
contract MockIdentityRegistry {
    mapping(uint256 => address) private _owners;
    mapping(uint256 => address) private _operators;

    function setOwner(uint256 agentId, address owner) external {
        _owners[agentId] = owner;
    }

    function setOperator(uint256 agentId, address operator) external {
        _operators[agentId] = operator;
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address owner = _owners[tokenId];
        require(owner != address(0), "ERC721: invalid token ID");
        return owner;
    }

    function getOperator(uint256 agentId) external view returns (address) {
        return _operators[agentId];
    }
}

/// @dev Contract that rejects native TON transfers (for testing failure paths)
contract RejectingReceiver {
    receive() external payable {
        revert("rejected");
    }
}

contract TaskFeeEscrowTest is Test {
    // ============ Contracts ============
    TaskFeeEscrow public escrow;
    MockIdentityRegistry public registry;

    // ============ Test Accounts ============
    address public agentOwner = makeAddr("agentOwner");
    address public user = makeAddr("user");
    address public operator = makeAddr("operator");
    address public unauthorized = makeAddr("unauthorized");

    // ============ Test Data ============
    uint256 public constant AGENT_ID = 1;
    uint256 public constant AGENT_ID_2 = 2;
    uint256 public constant FEE = 0.5 ether;
    uint256 public constant FEE_2 = 1 ether;

    // ============ Setup ============

    function setUp() public {
        // Deploy mock registry
        registry = new MockIdentityRegistry();
        registry.setOwner(AGENT_ID, agentOwner);
        registry.setOwner(AGENT_ID_2, agentOwner);
        registry.setOperator(AGENT_ID, operator);

        // Deploy escrow
        escrow = new TaskFeeEscrow(address(registry));

        // Fund test accounts with native TON
        vm.deal(agentOwner, 100 ether);
        vm.deal(user, 100 ether);
        vm.deal(operator, 100 ether);
        vm.deal(unauthorized, 100 ether);
    }

    // ============ Helper ============

    function _taskRef(uint256 agentId, address payer, uint256 nonce) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(agentId, payer, nonce));
    }

    /// @dev Helper: pay for task as payer, return taskRef
    function _payForTask(uint256 agentId, address payer, uint256 nonce) internal returns (bytes32) {
        bytes32 taskRef = _taskRef(agentId, payer, nonce);
        uint256 fee = escrow.getAgentFee(agentId);
        vm.prank(payer);
        escrow.payForTask{value: fee}(agentId, taskRef);
        return taskRef;
    }

    // ============ Constructor Tests ============

    function test_Constructor() public view {
        assertEq(address(escrow.identityRegistry()), address(registry));
    }

    function test_Constructor_RevertZeroRegistry() public {
        vm.expectRevert("Zero registry address");
        new TaskFeeEscrow(address(0));
    }

    function test_REFUND_DEADLINE() public view {
        assertEq(escrow.REFUND_DEADLINE(), 1 hours);
    }

    // ============ setAgentFee Tests ============

    function test_SetAgentFee() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        assertEq(escrow.getAgentFee(AGENT_ID), FEE);
    }

    function test_SetAgentFee_EmitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit ITaskFeeEscrow.AgentFeeSet(AGENT_ID, FEE);

        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);
    }

    function test_SetAgentFee_Update() public {
        vm.startPrank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);
        escrow.setAgentFee(AGENT_ID, FEE_2);
        vm.stopPrank();

        assertEq(escrow.getAgentFee(AGENT_ID), FEE_2);
    }

    function test_SetAgentFee_RevertNotOwner() public {
        vm.expectRevert(ITaskFeeEscrow.NotAgentOwner.selector);
        vm.prank(unauthorized);
        escrow.setAgentFee(AGENT_ID, FEE);
    }

    function test_SetAgentFee_RevertZeroFee() public {
        vm.expectRevert(ITaskFeeEscrow.ZeroFee.selector);
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, 0);
    }

    // ============ payForTask Tests ============

    function test_PayForTask_Escrowed() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _taskRef(AGENT_ID, user, 1);

        vm.prank(user);
        escrow.payForTask{value: FEE}(AGENT_ID, taskRef);

        // Funds should be escrowed, NOT in agentBalances
        assertTrue(escrow.isTaskPaid(taskRef));
        assertEq(escrow.getAgentBalance(AGENT_ID), 0);
        assertEq(address(escrow).balance, FEE);

        // Check escrow record
        ITaskFeeEscrow.TaskEscrow memory te = escrow.getTaskEscrow(taskRef);
        assertEq(te.payer, user);
        assertEq(te.agentId, AGENT_ID);
        assertEq(te.amount, FEE);
        assertEq(uint8(te.status), uint8(ITaskFeeEscrow.TaskStatus.Escrowed));
    }

    function test_PayForTask_EmitsEvent() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _taskRef(AGENT_ID, user, 1);

        vm.expectEmit(true, true, true, true);
        emit ITaskFeeEscrow.TaskPaid(AGENT_ID, user, taskRef, FEE);

        vm.prank(user);
        escrow.payForTask{value: FEE}(AGENT_ID, taskRef);
    }

    function test_PayForTask_MultipleTasks() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef1 = _taskRef(AGENT_ID, user, 1);
        bytes32 taskRef2 = _taskRef(AGENT_ID, user, 2);

        vm.startPrank(user);
        escrow.payForTask{value: FEE}(AGENT_ID, taskRef1);
        escrow.payForTask{value: FEE}(AGENT_ID, taskRef2);
        vm.stopPrank();

        assertTrue(escrow.isTaskPaid(taskRef1));
        assertTrue(escrow.isTaskPaid(taskRef2));
        // Neither should be in agentBalances yet (escrowed only)
        assertEq(escrow.getAgentBalance(AGENT_ID), 0);
        assertEq(address(escrow).balance, FEE * 2);
    }

    function test_PayForTask_RevertFeeNotSet() public {
        bytes32 taskRef = _taskRef(AGENT_ID, user, 1);

        vm.expectRevert(ITaskFeeEscrow.FeeNotSet.selector);
        vm.prank(user);
        escrow.payForTask{value: FEE}(AGENT_ID, taskRef);
    }

    function test_PayForTask_RevertIncorrectAmount() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _taskRef(AGENT_ID, user, 1);

        vm.expectRevert(ITaskFeeEscrow.IncorrectFeeAmount.selector);
        vm.prank(user);
        escrow.payForTask{value: FEE + 1}(AGENT_ID, taskRef);
    }

    function test_PayForTask_RevertIncorrectAmountZero() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _taskRef(AGENT_ID, user, 1);

        vm.expectRevert(ITaskFeeEscrow.IncorrectFeeAmount.selector);
        vm.prank(user);
        escrow.payForTask{value: 0}(AGENT_ID, taskRef);
    }

    function test_PayForTask_RevertTaskAlreadyPaid() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _taskRef(AGENT_ID, user, 1);

        vm.prank(user);
        escrow.payForTask{value: FEE}(AGENT_ID, taskRef);

        vm.expectRevert(ITaskFeeEscrow.TaskAlreadyPaid.selector);
        vm.prank(user);
        escrow.payForTask{value: FEE}(AGENT_ID, taskRef);
    }

    // ============ confirmTask Tests ============

    function test_ConfirmTask_ByOwner() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);

        vm.prank(agentOwner);
        escrow.confirmTask(taskRef);

        // Funds should now be in agentBalances
        assertEq(escrow.getAgentBalance(AGENT_ID), FEE);
        assertTrue(escrow.isTaskPaid(taskRef));

        ITaskFeeEscrow.TaskEscrow memory te = escrow.getTaskEscrow(taskRef);
        assertEq(uint8(te.status), uint8(ITaskFeeEscrow.TaskStatus.Completed));
    }

    function test_ConfirmTask_ByOperator() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);

        vm.prank(operator);
        escrow.confirmTask(taskRef);

        assertEq(escrow.getAgentBalance(AGENT_ID), FEE);

        ITaskFeeEscrow.TaskEscrow memory te = escrow.getTaskEscrow(taskRef);
        assertEq(uint8(te.status), uint8(ITaskFeeEscrow.TaskStatus.Completed));
    }

    function test_ConfirmTask_EmitsEvent() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);

        vm.expectEmit(true, true, false, true);
        emit ITaskFeeEscrow.TaskConfirmed(taskRef, AGENT_ID, FEE);

        vm.prank(agentOwner);
        escrow.confirmTask(taskRef);
    }

    function test_ConfirmTask_RevertNotAuthorized() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);

        vm.expectRevert(ITaskFeeEscrow.NotAuthorized.selector);
        vm.prank(unauthorized);
        escrow.confirmTask(taskRef);
    }

    function test_ConfirmTask_RevertPayerCannotConfirm() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);

        vm.expectRevert(ITaskFeeEscrow.NotAuthorized.selector);
        vm.prank(user);
        escrow.confirmTask(taskRef);
    }

    function test_ConfirmTask_RevertTaskNotEscrowed_None() public {
        bytes32 taskRef = _taskRef(AGENT_ID, user, 99);

        vm.expectRevert(ITaskFeeEscrow.TaskNotEscrowed.selector);
        vm.prank(agentOwner);
        escrow.confirmTask(taskRef);
    }

    function test_ConfirmTask_RevertTaskNotEscrowed_AlreadyConfirmed() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);

        vm.prank(agentOwner);
        escrow.confirmTask(taskRef);

        vm.expectRevert(ITaskFeeEscrow.TaskNotEscrowed.selector);
        vm.prank(agentOwner);
        escrow.confirmTask(taskRef);
    }

    function test_ConfirmTask_RevertTaskNotEscrowed_AlreadyRefunded() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);

        vm.prank(agentOwner);
        escrow.refundTask(taskRef);

        vm.expectRevert(ITaskFeeEscrow.TaskNotEscrowed.selector);
        vm.prank(agentOwner);
        escrow.confirmTask(taskRef);
    }

    // ============ refundTask Tests ============

    function test_RefundTask_ByOwner() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);
        uint256 userBalBefore = user.balance;

        vm.prank(agentOwner);
        escrow.refundTask(taskRef);

        assertEq(user.balance, userBalBefore + FEE);
        assertEq(escrow.getAgentBalance(AGENT_ID), 0);
        assertFalse(escrow.isTaskPaid(taskRef));

        ITaskFeeEscrow.TaskEscrow memory te = escrow.getTaskEscrow(taskRef);
        assertEq(uint8(te.status), uint8(ITaskFeeEscrow.TaskStatus.Refunded));
    }

    function test_RefundTask_ByOperator() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);
        uint256 userBalBefore = user.balance;

        vm.prank(operator);
        escrow.refundTask(taskRef);

        assertEq(user.balance, userBalBefore + FEE);

        ITaskFeeEscrow.TaskEscrow memory te = escrow.getTaskEscrow(taskRef);
        assertEq(uint8(te.status), uint8(ITaskFeeEscrow.TaskStatus.Refunded));
    }

    function test_RefundTask_ByPayerAfterDeadline() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);
        uint256 userBalBefore = user.balance;

        // Fast-forward past the refund deadline
        vm.warp(block.timestamp + escrow.REFUND_DEADLINE() + 1);

        vm.prank(user);
        escrow.refundTask(taskRef);

        assertEq(user.balance, userBalBefore + FEE);

        ITaskFeeEscrow.TaskEscrow memory te = escrow.getTaskEscrow(taskRef);
        assertEq(uint8(te.status), uint8(ITaskFeeEscrow.TaskStatus.Refunded));
    }

    function test_RefundTask_EmitsEvent() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);

        vm.expectEmit(true, true, false, true);
        emit ITaskFeeEscrow.TaskRefunded(taskRef, user, FEE);

        vm.prank(agentOwner);
        escrow.refundTask(taskRef);
    }

    function test_RefundTask_RevertPayerTooEarly() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);

        vm.expectRevert(ITaskFeeEscrow.RefundTooEarly.selector);
        vm.prank(user);
        escrow.refundTask(taskRef);
    }

    function test_RefundTask_PayerSucceedsAtExactDeadline() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);
        uint256 userBalBefore = user.balance;

        // Warp to exactly the deadline (paidAt + REFUND_DEADLINE) — refund should succeed
        ITaskFeeEscrow.TaskEscrow memory te = escrow.getTaskEscrow(taskRef);
        vm.warp(te.paidAt + escrow.REFUND_DEADLINE());

        vm.prank(user);
        escrow.refundTask(taskRef);

        assertEq(user.balance, userBalBefore + FEE);
    }

    function test_RefundTask_RevertNotAuthorized() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);

        vm.expectRevert(ITaskFeeEscrow.NotAuthorized.selector);
        vm.prank(unauthorized);
        escrow.refundTask(taskRef);
    }

    function test_RefundTask_RevertTaskNotEscrowed_None() public {
        bytes32 taskRef = _taskRef(AGENT_ID, user, 99);

        vm.expectRevert(ITaskFeeEscrow.TaskNotEscrowed.selector);
        vm.prank(agentOwner);
        escrow.refundTask(taskRef);
    }

    function test_RefundTask_RevertTaskNotEscrowed_AlreadyRefunded() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);

        vm.prank(agentOwner);
        escrow.refundTask(taskRef);

        vm.expectRevert(ITaskFeeEscrow.TaskNotEscrowed.selector);
        vm.prank(agentOwner);
        escrow.refundTask(taskRef);
    }

    function test_RefundTask_RevertTaskNotEscrowed_AlreadyConfirmed() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);

        vm.prank(agentOwner);
        escrow.confirmTask(taskRef);

        vm.expectRevert(ITaskFeeEscrow.TaskNotEscrowed.selector);
        vm.prank(agentOwner);
        escrow.refundTask(taskRef);
    }

    function test_RefundTask_TransferFailed() public {
        RejectingReceiver rejector = new RejectingReceiver();
        vm.deal(address(rejector), 100 ether);

        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        // Rejector pays for task
        bytes32 taskRef = _taskRef(AGENT_ID, address(rejector), 1);
        vm.prank(address(rejector));
        escrow.payForTask{value: FEE}(AGENT_ID, taskRef);

        // Refund should fail because rejector can't receive
        vm.expectRevert(ITaskFeeEscrow.TransferFailed.selector);
        vm.prank(agentOwner);
        escrow.refundTask(taskRef);
    }

    // ============ isTaskPaid Tests ============

    function test_IsTaskPaid_False() public view {
        bytes32 taskRef = _taskRef(AGENT_ID, user, 1);
        assertFalse(escrow.isTaskPaid(taskRef));
    }

    function test_IsTaskPaid_TrueWhenEscrowed() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);
        assertTrue(escrow.isTaskPaid(taskRef));
    }

    function test_IsTaskPaid_TrueWhenCompleted() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);

        vm.prank(agentOwner);
        escrow.confirmTask(taskRef);

        assertTrue(escrow.isTaskPaid(taskRef));
    }

    function test_IsTaskPaid_FalseWhenRefunded() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);

        vm.prank(agentOwner);
        escrow.refundTask(taskRef);

        assertFalse(escrow.isTaskPaid(taskRef));
    }

    // ============ claimFees Tests ============

    function test_ClaimFees() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);

        // Confirm the task first
        vm.prank(agentOwner);
        escrow.confirmTask(taskRef);

        uint256 balanceBefore = agentOwner.balance;

        vm.prank(agentOwner);
        escrow.claimFees(AGENT_ID);

        assertEq(agentOwner.balance, balanceBefore + FEE);
        assertEq(escrow.getAgentBalance(AGENT_ID), 0);
    }

    function test_ClaimFees_EmitsEvent() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);

        vm.prank(agentOwner);
        escrow.confirmTask(taskRef);

        vm.expectEmit(true, true, false, true);
        emit ITaskFeeEscrow.FeesClaimed(AGENT_ID, agentOwner, FEE);

        vm.prank(agentOwner);
        escrow.claimFees(AGENT_ID);
    }

    function test_ClaimFees_MultipleConfirmedPayments() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        // Pay and confirm 3 tasks
        for (uint256 i = 1; i <= 3; i++) {
            bytes32 taskRef = _payForTask(AGENT_ID, user, i);
            vm.prank(agentOwner);
            escrow.confirmTask(taskRef);
        }

        uint256 expectedClaim = FEE * 3;
        assertEq(escrow.getAgentBalance(AGENT_ID), expectedClaim);

        uint256 balanceBefore = agentOwner.balance;
        vm.prank(agentOwner);
        escrow.claimFees(AGENT_ID);

        assertEq(agentOwner.balance, balanceBefore + expectedClaim);
        assertEq(escrow.getAgentBalance(AGENT_ID), 0);
    }

    function test_ClaimFees_RevertNotOwner() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);

        vm.prank(agentOwner);
        escrow.confirmTask(taskRef);

        vm.expectRevert(ITaskFeeEscrow.NotAgentOwner.selector);
        vm.prank(unauthorized);
        escrow.claimFees(AGENT_ID);
    }

    function test_ClaimFees_RevertNoFees() public {
        vm.expectRevert(ITaskFeeEscrow.NoFeesAccumulated.selector);
        vm.prank(agentOwner);
        escrow.claimFees(AGENT_ID);
    }

    function test_ClaimFees_RevertNoFeesWhenOnlyEscrowed() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        // Pay but do NOT confirm
        _payForTask(AGENT_ID, user, 1);

        // agentBalances should be 0 since not confirmed
        vm.expectRevert(ITaskFeeEscrow.NoFeesAccumulated.selector);
        vm.prank(agentOwner);
        escrow.claimFees(AGENT_ID);
    }

    function test_ClaimFees_RevertTransferFailed() public {
        RejectingReceiver rejector = new RejectingReceiver();
        registry.setOwner(AGENT_ID, address(rejector));
        registry.setOperator(AGENT_ID, operator);

        vm.prank(address(rejector));
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _taskRef(AGENT_ID, user, 1);
        vm.prank(user);
        escrow.payForTask{value: FEE}(AGENT_ID, taskRef);

        // Confirm via operator
        vm.prank(operator);
        escrow.confirmTask(taskRef);

        vm.expectRevert(ITaskFeeEscrow.TransferFailed.selector);
        vm.prank(address(rejector));
        escrow.claimFees(AGENT_ID);
    }

    // ============ View Function Tests ============

    function test_GetAgentFee_Default() public view {
        assertEq(escrow.getAgentFee(999), 0);
    }

    function test_GetAgentBalance_Default() public view {
        assertEq(escrow.getAgentBalance(999), 0);
    }

    function test_GetTaskEscrow_Default() public view {
        bytes32 taskRef = _taskRef(AGENT_ID, user, 99);
        ITaskFeeEscrow.TaskEscrow memory te = escrow.getTaskEscrow(taskRef);
        assertEq(te.payer, address(0));
        assertEq(te.agentId, 0);
        assertEq(te.amount, 0);
        assertEq(uint8(te.status), uint8(ITaskFeeEscrow.TaskStatus.None));
    }

    // ============ Integration Flow Tests ============

    function test_FullFlow_SuccessfulTask() public {
        // 1. Agent owner sets fee
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);
        assertEq(escrow.getAgentFee(AGENT_ID), FEE);

        // 2. User pays for task — funds escrowed
        bytes32 taskRef = _taskRef(AGENT_ID, user, 42);
        vm.prank(user);
        escrow.payForTask{value: FEE}(AGENT_ID, taskRef);

        assertTrue(escrow.isTaskPaid(taskRef));
        assertEq(escrow.getAgentBalance(AGENT_ID), 0); // NOT yet in agentBalances
        assertEq(address(escrow).balance, FEE);

        // 3. Runtime confirms task
        vm.prank(operator);
        escrow.confirmTask(taskRef);

        assertEq(escrow.getAgentBalance(AGENT_ID), FEE);
        assertTrue(escrow.isTaskPaid(taskRef));

        // 4. Owner claims
        uint256 ownerBalBefore = agentOwner.balance;
        vm.prank(agentOwner);
        escrow.claimFees(AGENT_ID);

        assertEq(agentOwner.balance, ownerBalBefore + FEE);
        assertEq(escrow.getAgentBalance(AGENT_ID), 0);
        assertEq(address(escrow).balance, 0);
    }

    function test_FullFlow_FailedTask_OperatorRefund() public {
        // 1. Set fee and pay
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 42);
        uint256 userBalBefore = user.balance;

        // 2. Task fails — operator refunds immediately
        vm.prank(operator);
        escrow.refundTask(taskRef);

        // 3. User gets money back
        assertEq(user.balance, userBalBefore + FEE);
        assertFalse(escrow.isTaskPaid(taskRef));
        assertEq(address(escrow).balance, 0);
    }

    function test_FullFlow_FailedTask_UserSelfRefund() public {
        // 1. Set fee and pay
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 42);
        uint256 userBalBefore = user.balance;

        // 2. Task fails but nobody refunds. User waits past deadline.
        vm.warp(block.timestamp + escrow.REFUND_DEADLINE() + 1);

        // 3. User self-refunds
        vm.prank(user);
        escrow.refundTask(taskRef);

        assertEq(user.balance, userBalBefore + FEE);
        assertFalse(escrow.isTaskPaid(taskRef));
        assertEq(address(escrow).balance, 0);
    }

    function test_MultipleAgents() public {
        // Set fees for two agents
        vm.startPrank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);
        escrow.setAgentFee(AGENT_ID_2, FEE_2);
        vm.stopPrank();

        // Pay for tasks on both agents
        bytes32 ref1 = _payForTask(AGENT_ID, user, 1);
        bytes32 ref2 = _payForTask(AGENT_ID_2, user, 1);

        assertEq(address(escrow).balance, FEE + FEE_2);

        // Confirm both
        vm.startPrank(agentOwner);
        escrow.confirmTask(ref1);
        escrow.confirmTask(ref2);
        vm.stopPrank();

        assertEq(escrow.getAgentBalance(AGENT_ID), FEE);
        assertEq(escrow.getAgentBalance(AGENT_ID_2), FEE_2);

        // Claim fees separately
        uint256 ownerBalBefore = agentOwner.balance;
        vm.startPrank(agentOwner);
        escrow.claimFees(AGENT_ID);
        escrow.claimFees(AGENT_ID_2);
        vm.stopPrank();

        assertEq(agentOwner.balance, ownerBalBefore + FEE + FEE_2);
    }

    function test_FeeUpdateDoesNotAffectExistingEscrow() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        // Pay at old fee
        bytes32 ref1 = _payForTask(AGENT_ID, user, 1);

        // Update fee
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE_2);

        // Pay at new fee
        bytes32 ref2 = _payForTask(AGENT_ID, user, 2);

        // Confirm both
        vm.startPrank(agentOwner);
        escrow.confirmTask(ref1);
        escrow.confirmTask(ref2);
        vm.stopPrank();

        // Total balance = old fee + new fee
        assertEq(escrow.getAgentBalance(AGENT_ID), FEE + FEE_2);
    }

    // ============ hasUsedAgent Tests ============

    function test_HasUsedAgent_FalseByDefault() public view {
        assertFalse(escrow.hasUsedAgent(AGENT_ID, user));
    }

    function test_HasUsedAgent_TrueAfterConfirm() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);

        vm.prank(agentOwner);
        escrow.confirmTask(taskRef);

        assertTrue(escrow.hasUsedAgent(AGENT_ID, user));
    }

    function test_HasUsedAgent_FalseAfterRefund() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);

        vm.prank(agentOwner);
        escrow.refundTask(taskRef);

        assertFalse(escrow.hasUsedAgent(AGENT_ID, user));
    }

    function test_HasUsedAgent_FalseWhileEscrowed() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        _payForTask(AGENT_ID, user, 1);

        assertFalse(escrow.hasUsedAgent(AGENT_ID, user));
    }

    function test_HasUsedAgent_DifferentAgents() public {
        vm.startPrank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);
        escrow.setAgentFee(AGENT_ID_2, FEE_2);
        vm.stopPrank();

        // Complete task for agent 1 only
        bytes32 taskRef = _payForTask(AGENT_ID, user, 1);
        vm.prank(agentOwner);
        escrow.confirmTask(taskRef);

        assertTrue(escrow.hasUsedAgent(AGENT_ID, user));
        assertFalse(escrow.hasUsedAgent(AGENT_ID_2, user));
    }

    // ============ Mixed Flow Tests ============

    function test_MixedConfirmAndRefund() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 ref1 = _payForTask(AGENT_ID, user, 1);
        bytes32 ref2 = _payForTask(AGENT_ID, user, 2);
        bytes32 ref3 = _payForTask(AGENT_ID, user, 3);

        uint256 userBalBefore = user.balance;

        // Confirm task 1, refund task 2, confirm task 3
        vm.startPrank(agentOwner);
        escrow.confirmTask(ref1);
        escrow.refundTask(ref2);
        escrow.confirmTask(ref3);
        vm.stopPrank();

        // User got refund for task 2
        assertEq(user.balance, userBalBefore + FEE);
        // Agent balance has tasks 1 and 3
        assertEq(escrow.getAgentBalance(AGENT_ID), FEE * 2);
    }
}
