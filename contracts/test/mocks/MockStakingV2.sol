// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockStakingV2
 * @notice Mock contract for testing staking integration
 * @dev Provides simulated staking functionality for testing without real token transfers
 */
contract MockStakingV2 {
    mapping(address => uint256) public stakes;
    mapping(address => bool) public slashed;

    uint256 public constant MIN_OPERATOR_STAKE = 1000 ether;

    event Staked(address indexed operator, uint256 amount);
    event Unstaked(address indexed operator, uint256 amount);
    event Slashed(address indexed operator, uint256 amount);

    /**
     * @notice Stake tokens for an operator
     * @param amount The amount to stake
     */
    function stake(uint256 amount) external {
        stakes[msg.sender] += amount;
        emit Staked(msg.sender, amount);
    }

    /**
     * @notice Unstake tokens from an operator
     * @param amount The amount to unstake
     */
    function unstake(uint256 amount) external {
        require(stakes[msg.sender] >= amount, "Insufficient stake");
        stakes[msg.sender] -= amount;
        emit Unstaked(msg.sender, amount);
    }

    /**
     * @notice Get the stake amount for an operator
     * @param operator The operator address
     * @return The staked amount
     */
    function getStake(address operator) external view returns (uint256) {
        return stakes[operator];
    }

    /**
     * @notice Check if an operator has sufficient stake
     * @param operator The operator address
     * @return True if operator stake meets minimum requirement
     */
    function isVerifiedOperator(address operator) external view returns (bool) {
        return stakes[operator] >= MIN_OPERATOR_STAKE;
    }

    /**
     * @notice Slash a portion of an operator's stake
     * @param operator The operator address to slash
     * @param percentage The percentage to slash (0-100)
     * @return slashedAmount The amount that was slashed
     */
    function slash(address operator, uint256 percentage) external returns (uint256 slashedAmount) {
        require(percentage <= 100, "Invalid percentage");
        slashedAmount = (stakes[operator] * percentage) / 100;
        stakes[operator] -= slashedAmount;
        slashed[operator] = true;
        emit Slashed(operator, slashedAmount);
    }

    /**
     * @notice Test helper to set stake directly
     * @param operator The operator address
     * @param amount The stake amount to set
     */
    function setStake(address operator, uint256 amount) external {
        stakes[operator] = amount;
    }
}
