// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IStakingV3
 * @notice Interface for Tokamak Staking V3 DepositManagerV3 on Ethereum L1
 * @dev Used by TALStakingBridgeL1 to query operator stake balances
 */
interface IStakingV3 {
    /// @notice Get the staked balance for an operator on a specific layer2
    /// @param layer2 The L2 chain contract address
    /// @param operator The operator address
    /// @return The staked TON amount
    function balanceOf(address layer2, address operator) external view returns (uint256);

    /// @notice Get total staked amount across all layer2s for an operator
    /// @param operator The operator address
    /// @return The total staked amount
    function totalStakedOf(address operator) external view returns (uint256);
}
