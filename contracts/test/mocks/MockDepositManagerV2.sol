// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockDepositManagerV2
 * @notice Mock for Staking V2 SeigManager + DepositManager on Ethereum L1
 * @dev Simulates L1 staking functionality for testing TAL bridge contracts.
 *      Implements:
 *      - IStakingV2 functions: stakeOf(), updateSeigniorage(), updateSeigniorageLayer()
 *      - IDepositManagerV2 functions: slash()
 *
 *      Used by:
 *      - TALStakingBridgeL1: stakeOf() for stake queries
 *      - TALSlashingConditionsL1: stakeOf() for validation + slash() for slashing
 */
contract MockDepositManagerV2 {
    // layer2 => operator => stake amount
    mapping(address => mapping(address => uint256)) public stakes;

    // operator => total stake across all layer2s
    mapping(address => uint256) public totalStakes;

    // operator => slashed flag
    mapping(address => bool) public slashed;

    // recipient => total slashed funds received
    mapping(address => uint256) public slashedFundsReceived;

    event Deposited(address indexed layer2, address indexed operator, uint256 amount);
    event WithdrawalRequested(address indexed layer2, address indexed operator, uint256 amount);
    event Slashed(address indexed layer2, address indexed recipient, uint256 amount);
    event SeigniorageUpdated(address indexed layer2);

    // ============ IStakingV2 Interface Functions ============

    /// @notice Get the staked amount for an account on a specific layer2
    /// @dev This is the primary function used by TALStakingBridgeL1._queryStake()
    function stakeOf(address layer2, address account) external view returns (uint256) {
        return stakes[layer2][account];
    }

    /// @notice Update seigniorage for all layer2s (mock - no-op, returns true)
    function updateSeigniorage() external pure returns (bool) {
        return true;
    }

    /// @notice Update seigniorage for a specific layer2 (mock - emits event, returns true)
    function updateSeigniorageLayer(address layer2) external returns (bool) {
        emit SeigniorageUpdated(layer2);
        return true;
    }

    /// @notice Deposit/Withdraw callbacks (mock - no-op)
    function onDeposit(address, address, uint256) external pure returns (bool) {
        return true;
    }

    function onWithdraw(address, address, uint256) external pure returns (bool) {
        return true;
    }

    // ============ IDepositManagerV2 Interface Functions ============

    /// @notice Slash stake via V2 DepositManager mechanism
    /// @dev Transfers slashed amount to recipient. In the mock, we reduce the total
    ///      stake pool for the layer2 and track funds sent to recipient.
    function slash(address layer2, address recipient, uint256 amount) external returns (bool) {
        // In V2, slash operates on the layer2's total deposit pool
        // For testing, we just track the slash and return success
        slashedFundsReceived[recipient] += amount;
        emit Slashed(layer2, recipient, amount);
        return true;
    }

    /// @notice Get pending unstaked amount (mock - returns 0)
    function pendingUnstaked(address, address) external pure returns (uint256) {
        return 0;
    }

    /// @notice Get accumulated staked amount (mock - returns stakes)
    function accStaked(address layer2, address account) external view returns (uint256) {
        return stakes[layer2][account];
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
