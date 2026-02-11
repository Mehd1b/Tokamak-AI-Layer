// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ITaskFeeEscrow
 * @notice Interface for the per-task fee escrow system using native TON
 * @dev On Thanos L2, TON is the native gas token. Fees are paid via msg.value
 *      and held in escrow until task completion is confirmed.
 *
 * Flow:
 * 1. Agent owner calls setAgentFee(agentId, feePerTask)
 * 2. User calls payForTask{value: fee}(agentId, taskRef) — funds held in escrow
 * 3. Runtime verifies payment via isTaskPaid(taskRef)
 * 4. On success: agent owner/operator calls confirmTask(taskRef) — funds move to agentBalances
 *    On failure: owner/operator calls refundTask(taskRef) immediately,
 *                or payer calls refundTask(taskRef) after REFUND_DEADLINE
 * 5. Agent owner claims confirmed fees via claimFees(agentId)
 */
interface ITaskFeeEscrow {
    // ============ Enums ============

    /// @notice Status of a task's escrowed payment
    enum TaskStatus {
        None,       // 0 - No escrow exists for this taskRef
        Escrowed,   // 1 - Funds held in escrow, pending confirmation
        Completed,  // 2 - Task confirmed, funds moved to agentBalances
        Refunded    // 3 - Task refunded, funds returned to payer
    }

    // ============ Structs ============

    /// @notice Per-task escrow record
    struct TaskEscrow {
        address payer;      // The address that paid
        uint256 agentId;    // The agent being paid
        uint256 amount;     // Native TON escrowed
        uint256 paidAt;     // Block timestamp when paid
        TaskStatus status;  // Current escrow status
    }

    // ============ Custom Errors ============

    /// @notice Thrown when the caller is not the owner of the agent
    error NotAgentOwner();

    /// @notice Thrown when attempting to set a zero fee
    error ZeroFee();

    /// @notice Thrown when a task has already been paid for
    error TaskAlreadyPaid();

    /// @notice Thrown when there are no fees to claim
    error NoFeesAccumulated();

    /// @notice Thrown when agent has no fee configured
    error FeeNotSet();

    /// @notice Thrown when msg.value does not match the required fee
    error IncorrectFeeAmount();

    /// @notice Thrown when native TON transfer fails
    error TransferFailed();

    /// @notice Thrown when the task escrow is not in Escrowed status
    error TaskNotEscrowed();

    /// @notice Thrown when the payer tries to self-refund before the deadline
    error RefundTooEarly();

    /// @notice Thrown when the caller is not authorized (not owner, operator, or payer)
    error NotAuthorized();

    /// @notice Thrown when a user has not used the agent (no completed task)
    error NotAgentUser();

    // ============ Events ============

    /**
     * @notice Emitted when an agent owner sets or updates their per-task fee
     * @param agentId The on-chain agent ID (ERC-721 token ID)
     * @param feePerTask The fee amount in native TON (18 decimals)
     */
    event AgentFeeSet(uint256 indexed agentId, uint256 feePerTask);

    /**
     * @notice Emitted when a user pays the fee for a task (funds escrowed)
     * @param agentId The agent being paid
     * @param payer The address that paid
     * @param taskRef The deterministic task reference hash
     * @param amount The native TON amount escrowed
     */
    event TaskPaid(uint256 indexed agentId, address indexed payer, bytes32 indexed taskRef, uint256 amount);

    /**
     * @notice Emitted when a task is confirmed and escrowed funds move to agentBalances
     * @param taskRef The task reference hash
     * @param agentId The agent whose balance is credited
     * @param amount The native TON amount confirmed
     */
    event TaskConfirmed(bytes32 indexed taskRef, uint256 indexed agentId, uint256 amount);

    /**
     * @notice Emitted when escrowed funds are refunded to the payer
     * @param taskRef The task reference hash
     * @param payer The address receiving the refund
     * @param amount The native TON amount refunded
     */
    event TaskRefunded(bytes32 indexed taskRef, address indexed payer, uint256 amount);

    /**
     * @notice Emitted when an agent owner claims accumulated fees
     * @param agentId The agent whose fees are claimed
     * @param owner The owner who received the fees
     * @param amount The native TON amount claimed
     */
    event FeesClaimed(uint256 indexed agentId, address indexed owner, uint256 amount);

    // ============ Constants ============

    /**
     * @notice Time after which the payer can self-refund a task (1 hour)
     * @return The refund deadline in seconds
     */
    function REFUND_DEADLINE() external view returns (uint256);

    // ============ Agent Owner Functions ============

    /**
     * @notice Set the per-task fee for an agent
     * @param agentId The on-chain agent ID
     * @param feePerTask The fee in native TON (18 decimals). Must be > 0.
     */
    function setAgentFee(uint256 agentId, uint256 feePerTask) external;

    /**
     * @notice Claim all accumulated (confirmed) fees for an agent
     * @param agentId The on-chain agent ID
     */
    function claimFees(uint256 agentId) external;

    // ============ User Functions ============

    /**
     * @notice Pay the fee for a task with native TON via msg.value.
     *         Funds are held in escrow until confirmed or refunded.
     * @param agentId The agent to pay
     * @param taskRef Deterministic task reference: keccak256(abi.encodePacked(agentId, userAddress, nonce))
     */
    function payForTask(uint256 agentId, bytes32 taskRef) external payable;

    // ============ Escrow Management ============

    /**
     * @notice Confirm a task as successfully completed, moving escrowed funds to agentBalances.
     *         Only callable by agent owner or operator.
     * @param taskRef The task reference hash
     */
    function confirmTask(bytes32 taskRef) external;

    /**
     * @notice Refund escrowed funds to the payer.
     *         Callable by agent owner/operator at any time, or by payer after REFUND_DEADLINE.
     * @param taskRef The task reference hash
     */
    function refundTask(bytes32 taskRef) external;

    // ============ View Functions ============

    /**
     * @notice Check if a task has been paid for (escrowed or completed)
     * @param taskRef The task reference hash
     * @return Whether the task fee has been paid (status is Escrowed or Completed)
     */
    function isTaskPaid(bytes32 taskRef) external view returns (bool);

    /**
     * @notice Get the per-task fee for an agent
     * @param agentId The on-chain agent ID
     * @return The fee amount in native TON (18 decimals), 0 if not set
     */
    function getAgentFee(uint256 agentId) external view returns (uint256);

    /**
     * @notice Get the unclaimed (confirmed) balance for an agent
     * @param agentId The on-chain agent ID
     * @return The accumulated native TON balance
     */
    function getAgentBalance(uint256 agentId) external view returns (uint256);

    /**
     * @notice Get the escrow details for a task
     * @param taskRef The task reference hash
     * @return The TaskEscrow struct with payer, agentId, amount, paidAt, status
     */
    function getTaskEscrow(bytes32 taskRef) external view returns (TaskEscrow memory);

    /**
     * @notice Check if a user has completed at least one task for an agent
     * @param agentId The on-chain agent ID
     * @param user The user address to check
     * @return Whether the user has completed a task for this agent
     */
    function hasUsedAgent(uint256 agentId, address user) external view returns (bool);
}
