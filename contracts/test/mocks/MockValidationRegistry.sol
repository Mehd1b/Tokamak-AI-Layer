// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockValidationRegistry
 * @notice Mock for testing TALIdentityRegistry slashing integration
 * @dev Provides settable validation stats for agents
 */
contract MockValidationRegistry {
    mapping(uint256 => uint256) public totalValidations;
    mapping(uint256 => uint256) public failedValidations;

    /**
     * @notice Set validation stats for an agent (test helper)
     * @param agentId The agent ID
     * @param total Total validations in window
     * @param failed Failed validations in window
     */
    function setAgentStats(uint256 agentId, uint256 total, uint256 failed) external {
        totalValidations[agentId] = total;
        failedValidations[agentId] = failed;
    }

    /**
     * @notice Get agent validation stats for a time window
     * @param agentId The agent ID
     * @return total Total validations in window
     * @return failed Failed validations in window
     */
    function getAgentValidationStats(
        uint256 agentId,
        uint256 /* windowSeconds */
    ) external view returns (uint256 total, uint256 failed) {
        return (totalValidations[agentId], failedValidations[agentId]);
    }
}
