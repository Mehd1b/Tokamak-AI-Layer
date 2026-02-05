// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockDepositManagerV3
 * @notice Mock for Staking V3 DepositManagerV3 on Ethereum L1
 * @dev Simulates L1 staking functionality for testing TAL bridge contracts
 */
contract MockDepositManagerV3 {
    // layer2 => operator => stake amount
    mapping(address => mapping(address => uint256)) public stakes;

    // operator => total stake across all layer2s
    mapping(address => uint256) public totalStakes;

    // operator => slashed flag
    mapping(address => bool) public slashed;

    event Deposited(address indexed layer2, address indexed operator, uint256 amount);
    event WithdrawalRequested(address indexed layer2, address indexed operator, uint256 amount);
    event Slashed(address indexed layer2, address indexed operator, uint256 amount);

    /// @notice Get the staked balance for an operator on a specific layer2
    function balanceOf(address layer2, address operator) external view returns (uint256) {
        return stakes[layer2][operator];
    }

    /// @notice Get total staked amount for an operator
    function totalStakedOf(address operator) external view returns (uint256) {
        return totalStakes[operator];
    }

    /// @notice Slash an operator's stake (called by authorized slashing contracts)
    function slash(address layer2, address operator, uint256 amount) external returns (uint256) {
        require(stakes[layer2][operator] >= amount, "Insufficient stake to slash");
        stakes[layer2][operator] -= amount;
        totalStakes[operator] -= amount;
        slashed[operator] = true;
        emit Slashed(layer2, operator, amount);
        return amount;
    }

    // ============ Test Helpers ============

    /// @notice Set stake directly for testing
    function setStake(address layer2, address operator, uint256 amount) external {
        uint256 oldAmount = stakes[layer2][operator];
        stakes[layer2][operator] = amount;

        if (amount > oldAmount) {
            totalStakes[operator] += (amount - oldAmount);
        } else {
            totalStakes[operator] -= (oldAmount - amount);
        }
    }

    /// @notice Simulate a deposit
    function deposit(address layer2, address operator, uint256 amount) external {
        stakes[layer2][operator] += amount;
        totalStakes[operator] += amount;
        emit Deposited(layer2, operator, amount);
    }
}
