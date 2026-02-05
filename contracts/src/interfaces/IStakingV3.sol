// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IStakingV3
 * @notice Interface wrapping Tokamak Staking V3 SeigManagerV3_1 functions
 * @dev Based on the actual SeigManagerV3_1 contract from tokamak-network/ton-staking-v2 (ton-staking-v3/dev branch)
 *
 * Key differences from the placeholder:
 * - Stake balances are queried via SeigManagerV3_1.stakeOf(), NOT DepositManagerV3.balanceOf()
 * - Slashing is done via transferCoinageToRat() (coinage transfer to RAT contract)
 * - Seigniorage is updated via updateSeigniorage() / updateSeigniorageLayer()
 *
 * Used by:
 * - TALStakingBridgeL1: queries operator stake via stakeOf()
 * - TALSlashingConditionsL1: executes slashing via transferCoinageToRat()
 */
interface IStakingV3 {
    // ============ Stake Query Functions ============

    /// @notice Get the staked amount for an account on a specific layer2
    /// @dev Maps to SeigManagerV3_1.stakeOf(layer2, account)
    /// @dev Returns the coinage-based stake amount (includes seigniorage accrual)
    /// @param layer2 The Layer2 contract address
    /// @param account The staker/operator address
    /// @return The staked TON amount (in wei, via coinage token balance)
    function stakeOf(address layer2, address account) external view returns (uint256);

    /// @notice Get total staked amount on a specific layer2
    /// @dev Maps to SeigManagerV3_1.stakeOfTotal(layer2)
    /// @param layer2 The Layer2 contract address
    /// @return The total staked amount on that layer2
    function stakeOfTotal(address layer2) external view returns (uint256);

    // ============ Seigniorage Functions ============

    /// @notice Update seigniorage distribution for all layer2s
    /// @dev Maps to SeigManagerV3_1.updateSeigniorage()
    /// @return True if seigniorage was updated successfully
    function updateSeigniorage() external returns (bool);

    /// @notice Update seigniorage distribution for a specific layer2
    /// @dev Maps to SeigManagerV3_1.updateSeigniorageLayer(layer2)
    /// @param layer2 The Layer2 contract address
    /// @return True if seigniorage was updated successfully
    function updateSeigniorageLayer(address layer2) external returns (bool);

    // ============ V3 Slashing Functions (RAT Integration) ============

    /// @notice Transfer coinage from a validator to the RAT contract (slashing)
    /// @dev Maps to ISeigManagerV3.transferCoinageToRat(layer2, validator, amount)
    /// @dev Only callable by the authorized RAT contract
    /// @dev Implements V3 slashing: validator coinage -> RAT coinage transfer (burn/mint)
    /// @param layer2 The Layer2 contract address
    /// @param validator The validator address to slash
    /// @param amount The amount of coinage to transfer (slash)
    /// @return True if transfer succeeded
    function transferCoinageToRat(address layer2, address validator, uint256 amount) external returns (bool);

    /// @notice Transfer coinage from RAT back to a validator (restoration after successful challenge)
    /// @dev Maps to ISeigManagerV3.transferCoinageFromRatTo(layer2, to, amount)
    /// @dev Only callable by the authorized RAT contract
    /// @dev Implements V3 restoration: RAT coinage -> validator coinage transfer
    /// @param layer2 The Layer2 contract address
    /// @param to The validator address to restore funds to
    /// @param amount The amount of coinage to restore
    /// @return True if transfer succeeded
    function transferCoinageFromRatTo(address layer2, address to, uint256 amount) external returns (bool);

    // ============ Deposit/Withdraw Callbacks ============

    /// @notice Callback when tokens are deposited via DepositManager
    /// @dev Maps to SeigManagerV3_1.onDeposit(layer2, account, amount)
    /// @dev Only callable by DepositManager
    /// @param layer2 The Layer2 contract address
    /// @param account The depositor address
    /// @param amount The deposit amount
    /// @return True if callback succeeded
    function onDeposit(address layer2, address account, uint256 amount) external returns (bool);

    /// @notice Callback when tokens are withdrawn via DepositManager
    /// @dev Maps to SeigManagerV3_1.onWithdraw(layer2, account, amount)
    /// @dev Only callable by DepositManager
    /// @param layer2 The Layer2 contract address
    /// @param account The withdrawer address
    /// @param amount The withdrawal amount
    /// @return True if callback succeeded
    function onWithdraw(address layer2, address account, uint256 amount) external returns (bool);
}
