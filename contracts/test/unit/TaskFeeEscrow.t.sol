// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {TaskFeeEscrow} from "../../src/core/TaskFeeEscrow.sol";
import {ITaskFeeEscrow} from "../../src/interfaces/ITaskFeeEscrow.sol";

/**
 * @title TaskFeeEscrowTest
 * @notice Unit tests for TaskFeeEscrow (native TON on Thanos L2)
 * @dev Uses a mock identity registry to simulate ERC-721 ownerOf checks
 */

/// @dev Minimal mock of TALIdentityRegistry for testing ownership
contract MockIdentityRegistry {
    mapping(uint256 => address) private _owners;

    function setOwner(uint256 agentId, address owner) external {
        _owners[agentId] = owner;
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address owner = _owners[tokenId];
        require(owner != address(0), "ERC721: invalid token ID");
        return owner;
    }
}

/// @dev Contract that rejects native TON transfers (for testing claimFees failure)
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
    address public agentOwner = address(0x1);
    address public user = address(0x2);
    address public unauthorized = address(0x999);

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

        // Deploy escrow
        escrow = new TaskFeeEscrow(address(registry));

        // Fund test accounts with native TON
        vm.deal(agentOwner, 100 ether);
        vm.deal(user, 100 ether);
        vm.deal(unauthorized, 100 ether);
    }

    // ============ Helper ============

    function _taskRef(uint256 agentId, address payer, uint256 nonce) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(agentId, payer, nonce));
    }

    // ============ Constructor Tests ============

    function test_Constructor() public view {
        assertEq(address(escrow.identityRegistry()), address(registry));
    }

    function test_Constructor_RevertZeroRegistry() public {
        vm.expectRevert("Zero registry address");
        new TaskFeeEscrow(address(0));
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

    function test_PayForTask() public {
        // Setup fee
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _taskRef(AGENT_ID, user, 1);

        vm.prank(user);
        escrow.payForTask{value: FEE}(AGENT_ID, taskRef);

        assertTrue(escrow.isTaskPaid(taskRef));
        assertEq(escrow.getAgentBalance(AGENT_ID), FEE);
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
        assertEq(escrow.getAgentBalance(AGENT_ID), FEE * 2);
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

    // ============ isTaskPaid Tests ============

    function test_IsTaskPaid_False() public view {
        bytes32 taskRef = _taskRef(AGENT_ID, user, 1);
        assertFalse(escrow.isTaskPaid(taskRef));
    }

    function test_IsTaskPaid_True() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _taskRef(AGENT_ID, user, 1);
        vm.prank(user);
        escrow.payForTask{value: FEE}(AGENT_ID, taskRef);

        assertTrue(escrow.isTaskPaid(taskRef));
    }

    // ============ claimFees Tests ============

    function test_ClaimFees() public {
        // Setup: set fee and pay for a task
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _taskRef(AGENT_ID, user, 1);
        vm.prank(user);
        escrow.payForTask{value: FEE}(AGENT_ID, taskRef);

        uint256 balanceBefore = agentOwner.balance;

        vm.prank(agentOwner);
        escrow.claimFees(AGENT_ID);

        assertEq(agentOwner.balance, balanceBefore + FEE);
        assertEq(escrow.getAgentBalance(AGENT_ID), 0);
    }

    function test_ClaimFees_EmitsEvent() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _taskRef(AGENT_ID, user, 1);
        vm.prank(user);
        escrow.payForTask{value: FEE}(AGENT_ID, taskRef);

        vm.expectEmit(true, true, false, true);
        emit ITaskFeeEscrow.FeesClaimed(AGENT_ID, agentOwner, FEE);

        vm.prank(agentOwner);
        escrow.claimFees(AGENT_ID);
    }

    function test_ClaimFees_MultiplePayments() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        // Pay for 3 tasks
        for (uint256 i = 1; i <= 3; i++) {
            bytes32 taskRef = _taskRef(AGENT_ID, user, i);
            vm.prank(user);
            escrow.payForTask{value: FEE}(AGENT_ID, taskRef);
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

        bytes32 taskRef = _taskRef(AGENT_ID, user, 1);
        vm.prank(user);
        escrow.payForTask{value: FEE}(AGENT_ID, taskRef);

        vm.expectRevert(ITaskFeeEscrow.NotAgentOwner.selector);
        vm.prank(unauthorized);
        escrow.claimFees(AGENT_ID);
    }

    function test_ClaimFees_RevertNoFees() public {
        vm.expectRevert(ITaskFeeEscrow.NoFeesAccumulated.selector);
        vm.prank(agentOwner);
        escrow.claimFees(AGENT_ID);
    }

    function test_ClaimFees_RevertTransferFailed() public {
        // Create a contract that rejects TON
        RejectingReceiver rejector = new RejectingReceiver();
        registry.setOwner(AGENT_ID, address(rejector));

        vm.prank(address(rejector));
        escrow.setAgentFee(AGENT_ID, FEE);

        bytes32 taskRef = _taskRef(AGENT_ID, user, 1);
        vm.prank(user);
        escrow.payForTask{value: FEE}(AGENT_ID, taskRef);

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

    // ============ Integration Flow Tests ============

    function test_FullFlow() public {
        // 1. Agent owner sets fee
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);
        assertEq(escrow.getAgentFee(AGENT_ID), FEE);

        // 2. User pays for task
        bytes32 taskRef = _taskRef(AGENT_ID, user, 42);
        vm.prank(user);
        escrow.payForTask{value: FEE}(AGENT_ID, taskRef);

        // 3. Verify payment
        assertTrue(escrow.isTaskPaid(taskRef));
        assertEq(escrow.getAgentBalance(AGENT_ID), FEE);
        assertEq(address(escrow).balance, FEE);

        // 4. Owner claims
        uint256 ownerBalBefore = agentOwner.balance;
        vm.prank(agentOwner);
        escrow.claimFees(AGENT_ID);

        assertEq(agentOwner.balance, ownerBalBefore + FEE);
        assertEq(escrow.getAgentBalance(AGENT_ID), 0);
        assertEq(address(escrow).balance, 0);
    }

    function test_MultipleAgents() public {
        // Set fees for two agents
        vm.startPrank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);
        escrow.setAgentFee(AGENT_ID_2, FEE_2);
        vm.stopPrank();

        // Pay for tasks on both agents
        bytes32 ref1 = _taskRef(AGENT_ID, user, 1);
        bytes32 ref2 = _taskRef(AGENT_ID_2, user, 1);

        vm.startPrank(user);
        escrow.payForTask{value: FEE}(AGENT_ID, ref1);
        escrow.payForTask{value: FEE_2}(AGENT_ID_2, ref2);
        vm.stopPrank();

        assertEq(escrow.getAgentBalance(AGENT_ID), FEE);
        assertEq(escrow.getAgentBalance(AGENT_ID_2), FEE_2);
        assertEq(address(escrow).balance, FEE + FEE_2);

        // Claim fees separately
        uint256 ownerBalBefore = agentOwner.balance;
        vm.startPrank(agentOwner);
        escrow.claimFees(AGENT_ID);
        escrow.claimFees(AGENT_ID_2);
        vm.stopPrank();

        assertEq(agentOwner.balance, ownerBalBefore + FEE + FEE_2);
    }

    function test_FeeUpdateDoesNotAffectExistingBalance() public {
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE);

        // Pay at old fee
        bytes32 ref1 = _taskRef(AGENT_ID, user, 1);
        vm.prank(user);
        escrow.payForTask{value: FEE}(AGENT_ID, ref1);

        // Update fee
        vm.prank(agentOwner);
        escrow.setAgentFee(AGENT_ID, FEE_2);

        // Pay at new fee
        bytes32 ref2 = _taskRef(AGENT_ID, user, 2);
        vm.prank(user);
        escrow.payForTask{value: FEE_2}(AGENT_ID, ref2);

        // Total balance = old fee + new fee
        assertEq(escrow.getAgentBalance(AGENT_ID), FEE + FEE_2);
    }
}
