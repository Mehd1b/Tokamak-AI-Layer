// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/ITaskFeeEscrow.sol";

/// @dev Minimal interface for checking ERC-721 agent ownership
interface IIdentityRegistryMinimal {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/**
 * @title TaskFeeEscrow
 * @notice Per-task fee escrow for AI agents on Thanos L2 (native TON)
 * @dev Non-upgradeable. Uses native TON (the gas token on Thanos L2) for payments.
 *      Agent ownership is verified via the TALIdentityRegistry (ERC-721 ownerOf).
 *
 * Flow:
 * 1. Agent owner sets fee via setAgentFee()
 * 2. User sends native TON via payForTask{value: fee}()
 * 3. Runtime verifies payment via isTaskPaid()
 * 4. Agent owner withdraws accumulated fees via claimFees()
 */
contract TaskFeeEscrow is ITaskFeeEscrow, ReentrancyGuard {
    // ============ Immutable State ============

    /// @notice The TALIdentityRegistry for agent ownership verification
    IIdentityRegistryMinimal public immutable identityRegistry;

    // ============ Mutable State ============

    /// @notice Per-task fee configured by agent owner (agentId => fee in native TON)
    mapping(uint256 agentId => uint256 fee) public agentFees;

    /// @notice Whether a task reference has been paid (taskRef => paid)
    mapping(bytes32 taskRef => bool) public taskPayments;

    /// @notice Accumulated unclaimed fees per agent (agentId => balance)
    mapping(uint256 agentId => uint256) public agentBalances;

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
        if (taskPayments[taskRef]) revert TaskAlreadyPaid();

        taskPayments[taskRef] = true;
        agentBalances[agentId] += fee;

        emit TaskPaid(agentId, msg.sender, taskRef, fee);
    }

    // ============ View Functions ============

    /// @inheritdoc ITaskFeeEscrow
    function isTaskPaid(bytes32 taskRef) external view returns (bool) {
        return taskPayments[taskRef];
    }

    /// @inheritdoc ITaskFeeEscrow
    function getAgentFee(uint256 agentId) external view returns (uint256) {
        return agentFees[agentId];
    }

    /// @inheritdoc ITaskFeeEscrow
    function getAgentBalance(uint256 agentId) external view returns (uint256) {
        return agentBalances[agentId];
    }
}
