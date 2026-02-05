// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ITALStakingBridgeL2
 * @notice Interface for TAL Staking Bridge on Tokamak L2
 * @dev Caches L1 stake data and manages cross-layer operations
 */
interface ITALStakingBridgeL2 {
    // ============ Enums ============

    /// @notice Operator verification tiers based on L1 stake amount
    enum OperatorTier { UNVERIFIED, VERIFIED, PREMIUM }

    // ============ Structs ============

    /// @notice Snapshot of an operator's L1 stake state
    struct StakeSnapshot {
        uint256 amount;              // Staked TON amount on L1
        uint256 lastUpdatedL1Block;  // L1 block number of last update
        uint256 timestamp;           // L2 timestamp when update was received
    }

    /// @notice Slash request pending cross-layer relay
    struct SlashRequest {
        address operator;
        uint256 amount;
        bytes32 evidenceHash;
        uint256 timestamp;
        bool executed;
    }

    // ============ Events ============

    event StakeUpdated(address indexed operator, uint256 amount, uint256 l1Block);
    event OperatorTierChanged(address indexed operator, OperatorTier newTier);
    event SlashRequested(address indexed operator, uint256 amount, bytes32 evidenceHash);
    event SeigniorageReceived(address indexed operator, uint256 amount);
    event SeigniorageClaimed(address indexed operator, uint256 amount);
    event StakeRefreshRequested(address indexed operator);

    // ============ Errors ============

    error UnauthorizedBridgeCaller();
    error InvalidL1Sender();
    error StakeCacheStale(address operator, uint256 lastUpdate);
    error NoSeigniorageToClaim(address operator);
    error SlashRequestAlreadyPending(bytes32 evidenceHash);

    // ============ L1→L2 Functions (called via bridge) ============

    /// @notice Receive stake update from L1 bridge
    function receiveStakeUpdate(address operator, uint256 amount, uint256 l1Block) external;

    /// @notice Receive seigniorage notification from L1 bridge
    function receiveSeigniorage(address operator, uint256 amount) external;

    // ============ L2→L1 Functions (trigger cross-layer message) ============

    /// @notice Request fresh stake data from L1
    function requestStakeRefresh(address operator) external;

    /// @notice Request slashing of an operator's L1 stake
    function requestSlashing(address operator, uint256 amount, bytes calldata evidence) external;

    // ============ View Functions ============

    /// @notice Check if operator has sufficient stake for verified status
    function isVerifiedOperator(address operator) external view returns (bool);

    /// @notice Get the cached stake amount for an operator
    function getOperatorStake(address operator) external view returns (uint256);

    /// @notice Get the operator's current tier
    function getOperatorTier(address operator) external view returns (OperatorTier);

    /// @notice Get full stake snapshot for an operator
    function getStakeSnapshot(address operator) external view returns (StakeSnapshot memory);

    /// @notice Check if stake cache is fresh enough for a given operation
    function isCacheFresh(address operator, uint256 maxAge) external view returns (bool);

    /// @notice Get claimable seigniorage for an operator
    function getClaimableSeigniorage(address operator) external view returns (uint256);

    // ============ External Functions ============

    /// @notice Claim bridged seigniorage
    function claimSeigniorage() external;
}
