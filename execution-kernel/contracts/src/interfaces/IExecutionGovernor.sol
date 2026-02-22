// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title IExecutionGovernor
/// @notice Interface for host-level execution frequency governance.
///         Enforces minimum intervals between agent executions and maximum
///         trades per epoch to control turnover and fee drag.
///
/// @dev Expected trade frequency: ~2-5 trades per week on 4h candles.
///      Estimated fee drag: ~0.05-0.15% of AUM per week (depends on Hyperliquid fees).
///
///      The governor is consulted by the vault owner before submitting executions.
///      It does NOT intercept adapter calls directly — it provides a check-and-record
///      pattern that integrators enforce off-chain or in their execution pipeline.
interface IExecutionGovernor {
    // ============ Structs ============

    /// @notice Frequency configuration for a vault
    /// @param minIntervalSeconds Minimum seconds between executions (e.g., 14400 for 4h)
    /// @param maxTradesPerEpoch Maximum trade executions per epoch
    /// @param epochDurationSeconds Duration of one epoch (e.g., 604800 for 1 week)
    struct FrequencyConfig {
        uint32 minIntervalSeconds;
        uint32 maxTradesPerEpoch;
        uint32 epochDurationSeconds;
    }

    /// @notice Execution state for a vault
    /// @param lastExecutionTimestamp Last recorded execution time
    /// @param epochStartTimestamp Start of the current epoch
    /// @param epochTradeCount Trades executed in the current epoch
    struct ExecutionState {
        uint64 lastExecutionTimestamp;
        uint64 epochStartTimestamp;
        uint32 epochTradeCount;
    }

    // ============ Events ============

    /// @notice Emitted when a vault's frequency config is set
    event FrequencyConfigSet(
        address indexed vault,
        uint32 minIntervalSeconds,
        uint32 maxTradesPerEpoch,
        uint32 epochDurationSeconds
    );

    /// @notice Emitted when an execution is recorded
    event ExecutionRecorded(
        address indexed vault, uint64 timestamp, uint32 epochTradeCount
    );

    // ============ Errors ============

    /// @notice Execution interval not elapsed
    error IntervalNotElapsed(uint64 lastExecution, uint64 currentTime, uint32 requiredInterval);

    /// @notice Maximum trades per epoch exceeded
    error MaxTradesPerEpochExceeded(uint32 currentCount, uint32 maxAllowed);

    /// @notice Caller is not the vault owner
    error NotVaultOwner();

    /// @notice Invalid configuration (zero interval or epoch)
    error InvalidConfig();

    /// @notice Vault not configured
    error VaultNotConfigured();

    // ============ Write Functions ============

    /// @notice Set the frequency configuration for a vault
    /// @dev Only the vault owner can configure.
    /// @param vault The vault address
    /// @param minIntervalSeconds Minimum seconds between executions
    /// @param maxTradesPerEpoch Maximum trades per epoch
    /// @param epochDurationSeconds Epoch duration in seconds
    function setFrequencyConfig(
        address vault,
        uint32 minIntervalSeconds,
        uint32 maxTradesPerEpoch,
        uint32 epochDurationSeconds
    ) external;

    /// @notice Check if execution is allowed and record it
    /// @dev Reverts if frequency limits are violated. Otherwise records the execution.
    /// @param vault The vault requesting execution
    function recordExecution(address vault) external;

    // ============ View Functions ============

    /// @notice Check if an execution would be allowed (without recording)
    /// @param vault The vault to check
    /// @return allowed True if execution is permitted
    /// @return reason Human-readable reason if not allowed
    function canExecute(address vault) external view returns (bool allowed, string memory reason);

    /// @notice Get the frequency config for a vault
    /// @param vault The vault address
    /// @return The frequency configuration
    function getFrequencyConfig(address vault) external view returns (FrequencyConfig memory);

    /// @notice Get the execution state for a vault
    /// @param vault The vault address
    /// @return The execution state
    function getExecutionState(address vault) external view returns (ExecutionState memory);
}
