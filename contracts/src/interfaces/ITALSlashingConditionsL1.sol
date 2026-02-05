// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ITALSlashingConditionsL1
 * @notice Interface for TAL slashing execution on Ethereum L1
 * @dev Registered with Staking V3 as an authorized slashing entity
 */
interface ITALSlashingConditionsL1 {
    // ============ Events ============

    event SlashExecuted(address indexed operator, uint256 amount, bytes32 reason);
    event SlasherAuthorized(address indexed slasher);
    event SlasherRevoked(address indexed slasher);

    // ============ Errors ============

    error UnauthorizedSlasher(address caller);
    error SlashAmountExceedsStake(address operator, uint256 amount, uint256 stake);
    error SlashingDisabled();

    // ============ Functions ============

    /// @notice Execute a slash against an operator's L1 stake
    /// @param operator The operator to slash
    /// @param amount The amount of TON to slash
    /// @return slashedAmount The actual amount slashed
    function slash(address operator, uint256 amount) external returns (uint256 slashedAmount);

    /// @notice Check if a caller is authorized to execute slashing
    function isAuthorizedSlasher(address caller) external view returns (bool);

    /// @notice Get the total amount slashed for an operator
    function totalSlashed(address operator) external view returns (uint256);
}
