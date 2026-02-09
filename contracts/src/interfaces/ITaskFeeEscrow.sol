// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ITaskFeeEscrow
 * @notice Interface for the per-task fee escrow system using native TON
 * @dev On Thanos L2, TON is the native gas token. Fees are paid via msg.value
 *      and accumulated per agent for the owner to claim.
 *
 * Flow:
 * 1. Agent owner calls setAgentFee(agentId, feePerTask)
 * 2. User calls payForTask{value: fee}(agentId, taskRef)
 * 3. Runtime verifies payment via isTaskPaid(taskRef)
 * 4. Agent owner claims accumulated fees via claimFees(agentId)
 */
interface ITaskFeeEscrow {
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

    // ============ Events ============

    /**
     * @notice Emitted when an agent owner sets or updates their per-task fee
     * @param agentId The on-chain agent ID (ERC-721 token ID)
     * @param feePerTask The fee amount in native TON (18 decimals)
     */
    event AgentFeeSet(uint256 indexed agentId, uint256 feePerTask);

    /**
     * @notice Emitted when a user pays the fee for a task
     * @param agentId The agent being paid
     * @param payer The address that paid
     * @param taskRef The deterministic task reference hash
     * @param amount The native TON amount paid
     */
    event TaskPaid(uint256 indexed agentId, address indexed payer, bytes32 indexed taskRef, uint256 amount);

    /**
     * @notice Emitted when an agent owner claims accumulated fees
     * @param agentId The agent whose fees are claimed
     * @param owner The owner who received the fees
     * @param amount The native TON amount claimed
     */
    event FeesClaimed(uint256 indexed agentId, address indexed owner, uint256 amount);

    // ============ Agent Owner Functions ============

    /**
     * @notice Set the per-task fee for an agent
     * @param agentId The on-chain agent ID
     * @param feePerTask The fee in native TON (18 decimals). Must be > 0.
     */
    function setAgentFee(uint256 agentId, uint256 feePerTask) external;

    /**
     * @notice Claim all accumulated fees for an agent
     * @param agentId The on-chain agent ID
     */
    function claimFees(uint256 agentId) external;

    // ============ User Functions ============

    /**
     * @notice Pay the fee for a task with native TON via msg.value
     * @param agentId The agent to pay
     * @param taskRef Deterministic task reference: keccak256(abi.encodePacked(agentId, userAddress, nonce))
     */
    function payForTask(uint256 agentId, bytes32 taskRef) external payable;

    // ============ View Functions ============

    /**
     * @notice Check if a task has been paid for
     * @param taskRef The task reference hash
     * @return Whether the task fee has been paid
     */
    function isTaskPaid(bytes32 taskRef) external view returns (bool);

    /**
     * @notice Get the per-task fee for an agent
     * @param agentId The on-chain agent ID
     * @return The fee amount in native TON (18 decimals), 0 if not set
     */
    function getAgentFee(uint256 agentId) external view returns (uint256);

    /**
     * @notice Get the unclaimed balance for an agent
     * @param agentId The on-chain agent ID
     * @return The accumulated native TON balance
     */
    function getAgentBalance(uint256 agentId) external view returns (uint256);
}
