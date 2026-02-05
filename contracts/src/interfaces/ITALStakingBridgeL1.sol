// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ITALStakingBridgeL1
 * @notice Interface for TAL Staking Bridge on Ethereum L1
 * @dev Queries Staking V3 and relays data to L2 via CrossDomainMessenger
 */
interface ITALStakingBridgeL1 {
    // ============ Events ============

    event StakeRelayed(address indexed operator, uint256 amount, uint256 l1Block);
    event BatchStakeRelayed(uint256 operatorCount, uint256 l1Block);
    event SlashingExecuted(address indexed operator, uint256 amount, bytes32 evidenceHash);
    event SeigniorageBridged(address indexed operator, uint256 amount);
    event OperatorRegistered(address indexed operator);
    event OperatorRemoved(address indexed operator);

    // ============ Errors ============

    error UnauthorizedBridgeCaller();
    error InvalidL2Sender();
    error OperatorNotRegistered(address operator);
    error SlashingFailed(address operator, uint256 amount);
    error SeigniorageClaimFailed(address operator);
    error BatchTooLarge(uint256 count, uint256 maxBatch);

    // ============ Stake Query Functions ============

    /// @notice Query operator stake on V3 and relay to L2
    function queryAndRelayStake(address operator) external;

    /// @notice Batch query and relay stakes for multiple operators
    function batchQueryStakes(address[] calldata operators) external;

    /// @notice Refresh all registered TAL operators
    function refreshAllOperators() external;

    // ============ Cross-Layer Functions (called via bridge) ============

    /// @notice Execute slashing received from L2
    function executeSlashing(address operator, uint256 amount, bytes calldata evidence) external;

    // ============ Seigniorage Functions ============

    /// @notice Claim seigniorage from V3 and bridge to L2
    function claimAndBridgeSeigniorage(address operator) external;

    // ============ Operator Management ============

    /// @notice Register an operator for TAL stake tracking
    function registerOperator(address operator) external;

    /// @notice Remove an operator from TAL tracking
    function removeOperator(address operator) external;

    /// @notice Get all registered TAL operators
    function getRegisteredOperators() external view returns (address[] memory);

    /// @notice Check if an operator is registered
    function isRegisteredOperator(address operator) external view returns (bool);
}
