// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockDepositManagerV3
 * @notice Mock for Staking V3 SeigManagerV3_1 on Ethereum L1
 * @dev Simulates L1 staking functionality for testing TAL bridge contracts.
 *      Implements the IStakingV3 interface functions used by:
 *      - TALStakingBridgeL1: stakeOf() for stake queries
 *      - TALSlashingConditionsL1: stakeOf() + transferCoinageToRat() for slashing
 */
contract MockDepositManagerV3 {
    // layer2 => operator => stake amount
    mapping(address => mapping(address => uint256)) public stakes;

    // operator => total stake across all layer2s
    mapping(address => uint256) public totalStakes;

    // operator => slashed flag
    mapping(address => bool) public slashed;

    // RAT balance (slashed funds held in RAT)
    mapping(address => mapping(address => uint256)) public ratBalances;

    event Deposited(address indexed layer2, address indexed operator, uint256 amount);
    event WithdrawalRequested(address indexed layer2, address indexed operator, uint256 amount);
    event Slashed(address indexed layer2, address indexed operator, uint256 amount);
    event CoinageTransferredToRat(address indexed layer2, address indexed validator, uint256 amount);
    event CoinageRestoredFromRat(address indexed layer2, address indexed to, uint256 amount);
    event SeigniorageUpdated(address indexed layer2);

    // ============ IStakingV3 Interface Functions ============

    /// @notice Get the staked amount for an account on a specific layer2
    /// @dev This is the primary function used by TALStakingBridgeL1._queryStake()
    function stakeOf(address layer2, address account) external view returns (uint256) {
        return stakes[layer2][account];
    }

    /// @notice Get total staked amount on a specific layer2
    function stakeOfTotal(address layer2) external view returns (uint256) {
        uint256 total = 0;
        // In mock, we just sum what we know - simplified
        return total;
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

    /// @notice Transfer coinage to RAT (slashing mechanism in V3)
    /// @dev Used by TALSlashingConditionsL1.slash()
    function transferCoinageToRat(address layer2, address validator, uint256 amount) external returns (bool) {
        require(stakes[layer2][validator] >= amount, "Insufficient stake to slash");
        stakes[layer2][validator] -= amount;
        totalStakes[validator] -= amount;
        ratBalances[layer2][validator] += amount;
        slashed[validator] = true;
        emit CoinageTransferredToRat(layer2, validator, amount);
        return true;
    }

    /// @notice Transfer coinage from RAT back to validator (restoration)
    /// @dev Used by TALSlashingConditionsL1.restoreSlashedFunds()
    function transferCoinageFromRatTo(address layer2, address to, uint256 amount) external returns (bool) {
        require(ratBalances[layer2][to] >= amount, "Insufficient RAT balance");
        ratBalances[layer2][to] -= amount;
        stakes[layer2][to] += amount;
        totalStakes[to] += amount;
        emit CoinageRestoredFromRat(layer2, to, amount);
        return true;
    }

    /// @notice Deposit/Withdraw callbacks (mock - no-op)
    function onDeposit(address, address, uint256) external pure returns (bool) {
        return true;
    }

    function onWithdraw(address, address, uint256) external pure returns (bool) {
        return true;
    }

    // ============ Legacy Functions (kept for backward compatibility) ============

    /// @notice Get the staked balance for an operator on a specific layer2 (legacy name)
    function balanceOf(address layer2, address operator) external view returns (uint256) {
        return stakes[layer2][operator];
    }

    /// @notice Get total staked amount for an operator (legacy)
    function totalStakedOf(address operator) external view returns (uint256) {
        return totalStakes[operator];
    }

    /// @notice Legacy slash function
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
