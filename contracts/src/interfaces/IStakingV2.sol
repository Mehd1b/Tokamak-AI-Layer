// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IStakingV2
 * @notice Interface wrapping Tokamak Staking V2 SeigManager functions
 * @dev Based on the SeigManager contract from tokamak-network/ton-staking-v2
 *
 * Key points:
 * - Stake balances are queried via SeigManager.stakeOf(layer2, account)
 * - Slashing is done via DepositManager.slash() (see IDepositManagerV2)
 * - Seigniorage is updated via updateSeigniorage() / updateSeigniorageLayer()
 *
 * Used by:
 * - TALStakingBridgeL1: queries operator stake via stakeOf()
 * - TALSlashingConditionsL1: queries stake via stakeOf() (slashing via IDepositManagerV2)
 */
interface IStakingV2 {
    // ============ Stake Query Functions ============

    /// @notice Get the staked amount for an account on a specific layer2
    /// @dev Maps to SeigManager.stakeOf(layer2, account)
    /// @dev Returns the coinage-based stake amount (includes seigniorage accrual)
    /// @param layer2 The Layer2 contract address
    /// @param account The staker/operator address
    /// @return The staked TON amount (in wei, via coinage token balance)
    function stakeOf(address layer2, address account) external view returns (uint256);

    // ============ Seigniorage Functions ============

    /// @notice Update seigniorage distribution for all layer2s
    /// @dev Maps to SeigManager.updateSeigniorage()
    /// @return True if seigniorage was updated successfully
    function updateSeigniorage() external returns (bool);

    /// @notice Update seigniorage distribution for a specific layer2
    /// @dev Maps to SeigManager.updateSeigniorageLayer(layer2)
    /// @param layer2 The Layer2 contract address
    /// @return True if seigniorage was updated successfully
    function updateSeigniorageLayer(address layer2) external returns (bool);

    // ============ Deposit/Withdraw Callbacks ============

    /// @notice Callback when tokens are deposited via DepositManager
    /// @dev Maps to SeigManager.onDeposit(layer2, account, amount)
    /// @dev Only callable by DepositManager
    /// @param layer2 The Layer2 contract address
    /// @param account The depositor address
    /// @param amount The deposit amount
    /// @return True if callback succeeded
    function onDeposit(address layer2, address account, uint256 amount) external returns (bool);

    /// @notice Callback when tokens are withdrawn via DepositManager
    /// @dev Maps to SeigManager.onWithdraw(layer2, account, amount)
    /// @dev Only callable by DepositManager
    /// @param layer2 The Layer2 contract address
    /// @param account The withdrawer address
    /// @param amount The withdrawal amount
    /// @return True if callback succeeded
    function onWithdraw(address layer2, address account, uint256 amount) external returns (bool);
}
