// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/ITaskFeeEscrow.sol";

/// @dev Minimal interface for checking ERC-721 agent ownership and operator
interface IIdentityRegistryMinimal {
    function ownerOf(uint256 tokenId) external view returns (address);
    function getOperator(uint256 agentId) external view returns (address);
}

/**
 * @title TaskFeeEscrow
 * @notice Per-task fee escrow for AI agents on Thanos L2 (native TON)
 * @dev Non-upgradeable. Uses native TON (the gas token on Thanos L2) for payments.
 *      Agent ownership and operator status verified via TALIdentityRegistry.
 *
 * Flow:
 * 1. Agent owner sets fee via setAgentFee()
 * 2. User sends native TON via payForTask{value: fee}() — funds held in escrow
 * 3. Runtime verifies payment via isTaskPaid()
 * 4. On success: confirmTask() moves funds to agentBalances
 *    On failure: refundTask() returns funds to payer
 * 5. Agent owner withdraws confirmed fees via claimFees()
 */
contract TaskFeeEscrow is ITaskFeeEscrow, ReentrancyGuard {
    // ============ Immutable State ============

    /// @notice The TALIdentityRegistry for agent ownership and operator verification
    IIdentityRegistryMinimal public immutable identityRegistry;

    // ============ Constants ============

    /// @inheritdoc ITaskFeeEscrow
    uint256 public constant REFUND_DEADLINE = 1 hours;

    // ============ Mutable State ============

    /// @notice Per-task fee configured by agent owner (agentId => fee in native TON)
    mapping(uint256 agentId => uint256 fee) public agentFees;

    /// @notice Per-task escrow records (taskRef => TaskEscrow)
    mapping(bytes32 taskRef => TaskEscrow) public taskEscrows;

    /// @notice Accumulated confirmed fees per agent (agentId => balance)
    mapping(uint256 agentId => uint256) public agentBalances;

    /// @notice Tracks whether a user has completed a task for an agent (agentId => user => used)
    mapping(uint256 agentId => mapping(address user => bool)) private _hasUsedAgent;

    // ============ Constructor ============

    /**
     * @param _identityRegistry Address of the TALIdentityRegistry (ERC-721)
     */
    constructor(address _identityRegistry) {
        require(_identityRegistry != address(0), "Zero registry address");
        identityRegistry = IIdentityRegistryMinimal(_identityRegistry);
    }

    // ============ Modifiers ============

    modifier onlyAgentOwner(uint256 agentId) {
        if (identityRegistry.ownerOf(agentId) != msg.sender) {
            revert NotAgentOwner();
        }
        _;
    }

    // ============ Internal Helpers ============

    /**
     * @dev Check if msg.sender is the agent owner or the agent's operator
     */
    function _isOwnerOrOperator(uint256 agentId) internal view returns (bool) {
        if (identityRegistry.ownerOf(agentId) == msg.sender) return true;
        address operator = identityRegistry.getOperator(agentId);
        return operator != address(0) && operator == msg.sender;
    }

    // ============ Agent Owner Functions ============

    /// @inheritdoc ITaskFeeEscrow
    function setAgentFee(uint256 agentId, uint256 feePerTask) external onlyAgentOwner(agentId) {
        if (feePerTask == 0) revert ZeroFee();
        agentFees[agentId] = feePerTask;
        emit AgentFeeSet(agentId, feePerTask);
    }

    /// @inheritdoc ITaskFeeEscrow
    function claimFees(uint256 agentId) external nonReentrant onlyAgentOwner(agentId) {
        uint256 balance = agentBalances[agentId];
        if (balance == 0) revert NoFeesAccumulated();

        agentBalances[agentId] = 0;

        (bool success, ) = msg.sender.call{value: balance}("");
        if (!success) revert TransferFailed();

        emit FeesClaimed(agentId, msg.sender, balance);
    }

    // ============ User Functions ============

    /// @inheritdoc ITaskFeeEscrow
    function payForTask(uint256 agentId, bytes32 taskRef) external payable nonReentrant {
        uint256 fee = agentFees[agentId];
        if (fee == 0) revert FeeNotSet();
        if (msg.value != fee) revert IncorrectFeeAmount();
        if (taskEscrows[taskRef].status != TaskStatus.None) revert TaskAlreadyPaid();

        taskEscrows[taskRef] = TaskEscrow({
            payer: msg.sender,
            agentId: agentId,
            amount: fee,
            paidAt: block.timestamp,
            status: TaskStatus.Escrowed
        });

        emit TaskPaid(agentId, msg.sender, taskRef, fee);
    }

    // ============ Escrow Management ============

    /// @inheritdoc ITaskFeeEscrow
    function confirmTask(bytes32 taskRef) external nonReentrant {
        TaskEscrow storage escrow = taskEscrows[taskRef];
        if (escrow.status != TaskStatus.Escrowed) revert TaskNotEscrowed();
        if (!_isOwnerOrOperator(escrow.agentId)) revert NotAuthorized();

        escrow.status = TaskStatus.Completed;
        agentBalances[escrow.agentId] += escrow.amount;
        _hasUsedAgent[escrow.agentId][escrow.payer] = true;

        emit TaskConfirmed(taskRef, escrow.agentId, escrow.amount);
    }

    /// @inheritdoc ITaskFeeEscrow
    function refundTask(bytes32 taskRef) external nonReentrant {
        TaskEscrow storage escrow = taskEscrows[taskRef];
        if (escrow.status != TaskStatus.Escrowed) revert TaskNotEscrowed();

        bool isOwnerOrOp = _isOwnerOrOperator(escrow.agentId);
        bool isPayer = msg.sender == escrow.payer;

        if (!isOwnerOrOp && !isPayer) revert NotAuthorized();
        if (isPayer && !isOwnerOrOp) {
            if (block.timestamp < escrow.paidAt + REFUND_DEADLINE) revert RefundTooEarly();
        }

        escrow.status = TaskStatus.Refunded;
        address payer = escrow.payer;
        uint256 amount = escrow.amount;

        (bool success, ) = payer.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit TaskRefunded(taskRef, payer, amount);
    }

    // ============ View Functions ============

    /// @inheritdoc ITaskFeeEscrow
    function isTaskPaid(bytes32 taskRef) external view returns (bool) {
        TaskStatus status = taskEscrows[taskRef].status;
        return status == TaskStatus.Escrowed || status == TaskStatus.Completed;
    }

    /// @inheritdoc ITaskFeeEscrow
    function getAgentFee(uint256 agentId) external view returns (uint256) {
        return agentFees[agentId];
    }

    /// @inheritdoc ITaskFeeEscrow
    function getAgentBalance(uint256 agentId) external view returns (uint256) {
        return agentBalances[agentId];
    }

    /// @inheritdoc ITaskFeeEscrow
    function getTaskEscrow(bytes32 taskRef) external view returns (TaskEscrow memory) {
        return taskEscrows[taskRef];
    }

    /// @inheritdoc ITaskFeeEscrow
    function hasUsedAgent(uint256 agentId, address user) external view returns (bool) {
        return _hasUsedAgent[agentId][user];
    }
}
