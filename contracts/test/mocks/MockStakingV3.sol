// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockStakingV3
 * @notice Mock contract for testing cross-layer staking bridge integration
 * @dev Simulates the TALStakingBridgeL2 contract which caches L1 Staking V3 data on L2.
 *      Provides simulated staking functionality for testing without real token transfers
 *      or cross-layer messaging.
 */
contract MockStakingV3 {
    /// @notice Operator tier levels for categorizing stake amounts
    enum OperatorTier {
        UNVERIFIED,  // Below minimum stake threshold
        VERIFIED,    // Meets minimum stake requirement
        PREMIUM      // High-tier operator with significant stake
    }

    mapping(address => uint256) public stakes;
    mapping(address => bool) public slashed;
    mapping(address => OperatorTier) public operatorTiers;

    uint256 public constant MIN_OPERATOR_STAKE = 1000 ether;
    uint256 public constant PREMIUM_STAKE = 10000 ether;

    event Staked(address indexed operator, uint256 amount);
    event Unstaked(address indexed operator, uint256 amount);
    event Slashed(address indexed operator, uint256 amount);
    event OperatorTierUpdated(address indexed operator, OperatorTier tier);

    /**
     * @notice Stake tokens for an operator
     * @param amount The amount to stake
     */
    function stake(uint256 amount) external {
        stakes[msg.sender] += amount;
        _updateOperatorTier(msg.sender);
        emit Staked(msg.sender, amount);
    }

    /**
     * @notice Unstake tokens from an operator
     * @param amount The amount to unstake
     */
    function unstake(uint256 amount) external {
        require(stakes[msg.sender] >= amount, "Insufficient stake");
        stakes[msg.sender] -= amount;
        _updateOperatorTier(msg.sender);
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
     * @notice Get the locked balance for an operator (WSTONVault-compatible)
     * @param operator The operator address
     * @return The staked amount
     */
    function getLockedBalance(address operator) external view returns (uint256) {
        return stakes[operator];
    }

    /**
     * @notice Get the stake amount for an operator (bridge-style naming)
     * @param operator The operator address
     * @return The staked amount cached from L1
     */
    function getOperatorStake(address operator) external view returns (uint256) {
        return stakes[operator];
    }

    /**
     * @notice Check if an operator has sufficient stake (bridge verification)
     * @param operator The operator address
     * @return True if operator stake meets minimum requirement
     */
    function isVerifiedOperator(address operator) external view returns (bool) {
        return stakes[operator] >= MIN_OPERATOR_STAKE;
    }

    /**
     * @notice Get the tier of an operator based on stake amount
     * @param operator The operator address
     * @return The operator's tier (UNVERIFIED, VERIFIED, or PREMIUM)
     */
    function getOperatorTier(address operator) external view returns (OperatorTier) {
        return operatorTiers[operator];
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
        _updateOperatorTier(operator);
        emit Slashed(operator, slashedAmount);
    }

    /**
     * @notice Test helper to set stake directly
     * @param operator The operator address
     * @param amount The stake amount to set
     */
    function setStake(address operator, uint256 amount) external {
        stakes[operator] = amount;
        _updateOperatorTier(operator);
    }

    /**
     * @notice Test helper to set operator tier directly
     * @param operator The operator address
     * @param tier The tier to set
     */
    function setOperatorTier(address operator, OperatorTier tier) external {
        operatorTiers[operator] = tier;
        emit OperatorTierUpdated(operator, tier);
    }

    /**
     * @notice Internal function to update operator tier based on stake
     * @param operator The operator address
     */
    /**
     * @notice Request slashing of an operator (bridge-style)
     * @param operator The operator address
     * @param amount The amount to slash
     * @param evidence The evidence for slashing
     */
    function requestSlashing(address operator, uint256 amount, bytes calldata evidence) external {
        // Mock implementation - just record that slashing was requested
        require(stakes[operator] >= amount, "Insufficient stake to slash");
        stakes[operator] -= amount;
        slashed[operator] = true;
        _updateOperatorTier(operator);
        emit Slashed(operator, amount);
    }

    /**
     * @notice Check if cache is fresh (always true in mock)
     * @param operator The operator address
     * @param maxAge Maximum age in seconds (ignored in mock)
     * @return True since mock always returns fresh data
     */
    function isCacheFresh(address operator, uint256 maxAge) external pure returns (bool) {
        return true;
    }

    function _updateOperatorTier(address operator) internal {
        OperatorTier newTier;
        if (stakes[operator] >= PREMIUM_STAKE) {
            newTier = OperatorTier.PREMIUM;
        } else if (stakes[operator] >= MIN_OPERATOR_STAKE) {
            newTier = OperatorTier.VERIFIED;
        } else {
            newTier = OperatorTier.UNVERIFIED;
        }

        if (operatorTiers[operator] != newTier) {
            operatorTiers[operator] = newTier;
            emit OperatorTierUpdated(operator, newTier);
        }
    }
}
