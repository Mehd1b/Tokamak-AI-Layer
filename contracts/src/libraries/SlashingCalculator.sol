// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SlashingCalculator
 * @notice Library for calculating slashing amounts and conditions
 * @dev Used by TALValidationRegistry and StakingIntegrationModule
 *
 * Slashing Conditions:
 * - Failed TEE attestation: 50% of operator stake
 * - Proven validator fraud: 100% of operator stake
 * - Repeated low reputation (below threshold): 25% of operator stake
 * - Malicious behavior (DAO adjudicated): Variable, set by governance
 *
 * Cross-Layer Flow:
 * 1. Misbehavior detected on L2 (TALValidationRegistry)
 * 2. Slash request created with evidence hash
 * 3. Request relayed L2→L1 via TALStakingBridgeL2
 * 4. After 7-day Optimism finalization (natural appeal window)
 * 5. TALSlashingConditionsL1 executes against DepositManagerV3
 */
library SlashingCalculator {
    // ============ Constants ============

    /// @notice Slash percentage for failed TEE attestation
    uint256 internal constant SLASH_FAILED_TEE = 50;

    /// @notice Slash percentage for proven fraud
    uint256 internal constant SLASH_PROVEN_FRAUD = 100;

    /// @notice Slash percentage for repeated low reputation
    uint256 internal constant SLASH_LOW_REPUTATION = 25;

    /// @notice Maximum slash percentage
    uint256 internal constant MAX_SLASH_PERCENTAGE = 100;

    /// @notice Minimum stake that can be slashed (dust threshold)
    uint256 internal constant MIN_SLASHABLE_STAKE = 1 ether;

    /// @notice Reputation threshold below which slashing is triggered
    int128 internal constant LOW_REPUTATION_THRESHOLD = -50;

    // ============ Enums ============

    /// @notice Types of slashing conditions
    enum SlashReason {
        FailedTEEAttestation,
        ProvenFraud,
        LowReputation,
        DAOAdjudicated
    }

    // ============ Structs ============

    /// @notice Parameters for a slash calculation
    struct SlashParams {
        uint256 operatorStake;     // Current operator stake on L1
        SlashReason reason;         // Reason for slashing
        uint256 customPercentage;   // Custom percentage for DAO-adjudicated slashing
        int128 reputationScore;     // Current reputation score (for low rep slashing)
    }

    // ============ Functions ============

    /// @notice Calculate the amount to slash based on reason and stake
    /// @param params The slash calculation parameters
    /// @return slashAmount The amount of TON to slash
    /// @return percentage The slash percentage applied
    function calculateSlashAmount(SlashParams memory params)
        internal
        pure
        returns (uint256 slashAmount, uint256 percentage)
    {
        if (params.operatorStake < MIN_SLASHABLE_STAKE) {
            return (0, 0);
        }

        percentage = getSlashPercentage(params.reason, params.customPercentage);
        slashAmount = (params.operatorStake * percentage) / 100;
    }

    /// @notice Get the slash percentage for a given reason
    /// @param reason The slashing reason
    /// @param customPercentage Custom percentage for DAO-adjudicated
    /// @return percentage The slash percentage (0-100)
    function getSlashPercentage(SlashReason reason, uint256 customPercentage)
        internal
        pure
        returns (uint256 percentage)
    {
        if (reason == SlashReason.FailedTEEAttestation) {
            percentage = SLASH_FAILED_TEE;
        } else if (reason == SlashReason.ProvenFraud) {
            percentage = SLASH_PROVEN_FRAUD;
        } else if (reason == SlashReason.LowReputation) {
            percentage = SLASH_LOW_REPUTATION;
        } else if (reason == SlashReason.DAOAdjudicated) {
            percentage = customPercentage > MAX_SLASH_PERCENTAGE
                ? MAX_SLASH_PERCENTAGE
                : customPercentage;
        }
    }

    /// @notice Check if an operator's reputation qualifies for low-rep slashing
    /// @param reputationScore The operator's current reputation score
    /// @return True if reputation is below slashing threshold
    function isLowReputation(int128 reputationScore) internal pure returns (bool) {
        return reputationScore < LOW_REPUTATION_THRESHOLD;
    }

    /// @notice Calculate cumulative slash for multiple offenses
    /// @dev Slashes are applied sequentially: each offense reduces the remaining stake
    /// @param stake The initial operator stake
    /// @param percentages Array of slash percentages to apply
    /// @return totalSlashed The total amount slashed
    /// @return remainingStake The stake remaining after all slashes
    function calculateCumulativeSlash(
        uint256 stake,
        uint256[] memory percentages
    ) internal pure returns (uint256 totalSlashed, uint256 remainingStake) {
        remainingStake = stake;

        for (uint256 i = 0; i < percentages.length; i++) {
            uint256 pct = percentages[i] > MAX_SLASH_PERCENTAGE
                ? MAX_SLASH_PERCENTAGE
                : percentages[i];
            uint256 slashAmount = (remainingStake * pct) / 100;
            totalSlashed += slashAmount;
            remainingStake -= slashAmount;
        }
    }

    /// @notice Encode slash evidence for cross-layer relay
    /// @param agentId The agent involved
    /// @param reason The slash reason
    /// @param details Additional evidence details hash
    /// @return evidenceHash The encoded evidence hash
    function encodeEvidence(
        uint256 agentId,
        SlashReason reason,
        bytes32 details
    ) internal pure returns (bytes32 evidenceHash) {
        evidenceHash = keccak256(abi.encodePacked(agentId, uint8(reason), details));
    }

    /// @notice Validate that a slash request is reasonable
    /// @param stake The current operator stake
    /// @param requestedAmount The requested slash amount
    /// @return valid Whether the request is valid
    /// @return adjustedAmount The adjusted slash amount (capped at stake)
    function validateSlashRequest(
        uint256 stake,
        uint256 requestedAmount
    ) internal pure returns (bool valid, uint256 adjustedAmount) {
        if (stake < MIN_SLASHABLE_STAKE) {
            return (false, 0);
        }

        adjustedAmount = requestedAmount > stake ? stake : requestedAmount;
        valid = adjustedAmount > 0;
    }
}
