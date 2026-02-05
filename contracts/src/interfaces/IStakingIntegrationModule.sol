// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IStakingIntegrationModule
 * @notice Interface for TAL staking integration via cross-layer bridge
 * @dev Wraps TALStakingBridgeL2 for use by TAL registries
 */
interface IStakingIntegrationModule {
    // ============ Events ============

    event SlashingConditionRegistered(uint256 indexed agentId, bytes32 conditionHash);
    event SlashingExecuted(uint256 indexed agentId, uint256 amount, bytes32 reason);
    event SeigniorageRouted(uint256 indexed agentId, uint256 amount);

    // ============ Errors ============

    error InsufficientStake(address operator);
    error SlashingConditionNotMet(bytes32 conditionHash);
    error UnauthorizedSlashing();

    // ============ Slashing Constants ============

    /// @notice Percentage slashed for failed TEE attestation
    function SLASHING_FAILED_TEE() external view returns (uint256); // 50%

    /// @notice Percentage slashed for proven fraud
    function SLASHING_PROVEN_FRAUD() external view returns (uint256); // 100%

    /// @notice Percentage slashed for repeated low reputation
    function SLASHING_LOW_REPUTATION() external view returns (uint256); // 25%

    // ============ Stake Query Functions ============

    /// @notice Get operator's stake from bridge cache
    function getStake(address operator) external view returns (uint256 stakedAmount);

    /// @notice Check if operator meets minimum verified stake
    function isVerifiedOperator(address operator) external view returns (bool);

    /// @notice Get full operator status
    function getOperatorStatus(address operator) external view returns (
        uint256 stakedAmount,
        bool isVerified,
        uint256 slashingCount,
        uint256 lastSlashTime
    );

    // ============ Slashing Functions ============

    /// @notice Register a slashing condition for an agent
    function registerSlashingCondition(
        uint256 agentId,
        bytes32 conditionHash,
        uint256 percentage
    ) external;

    /// @notice Execute slashing via cross-layer bridge
    function executeSlash(
        uint256 agentId,
        uint256 percentage,
        bytes calldata evidence,
        bytes32 reason
    ) external returns (uint256 slashedAmount);

    // ============ Seigniorage Functions ============

    /// @notice Route seigniorage to agent operator
    function routeSeigniorage(uint256 agentId) external;

    /// @notice Calculate seigniorage bonus based on reputation
    function calculateSeigniorageBonus(
        uint256 agentId,
        uint256 baseEmission
    ) external view returns (uint256 bonusAmount);

    // ============ Constants ============

    /// @notice Minimum TON stake for verified operator status
    function MIN_OPERATOR_STAKE() external view returns (uint256); // 1000 TON
}
