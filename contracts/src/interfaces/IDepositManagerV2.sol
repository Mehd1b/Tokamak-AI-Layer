// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IDepositManagerV2
 * @notice Interface for Tokamak Staking V2 DepositManager slashing
 * @dev In Staking V2, slashing is executed via DepositManager.slash(layer2, recipient, amount).
 *      The slashed funds are transferred to the specified recipient (e.g., treasury).
 *
 * Used by:
 * - TALSlashingConditionsL1: executes slashing via slash()
 */
interface IDepositManagerV2 {
    /// @notice Slash an operator's stake on a specific layer2
    /// @dev Transfers slashed funds to the recipient address
    /// @param layer2 The Layer2 contract address
    /// @param recipient The address to receive slashed funds (e.g., treasury)
    /// @param amount The amount to slash
    /// @return True if slashing succeeded
    function slash(address layer2, address recipient, uint256 amount) external returns (bool);

    /// @notice Get pending unstaked amount for an account on a layer2
    /// @param layer2 The Layer2 contract address
    /// @param account The account address
    /// @return The pending unstaked amount
    function pendingUnstaked(address layer2, address account) external view returns (uint256);

    /// @notice Get accumulated staked amount for an account on a layer2
    /// @param layer2 The Layer2 contract address
    /// @param account The account address
    /// @return The accumulated staked amount
    function accStaked(address layer2, address account) external view returns (uint256);
}
