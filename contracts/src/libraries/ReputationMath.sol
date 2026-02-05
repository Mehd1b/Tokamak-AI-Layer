// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ReputationMath
 * @notice Library for reputation calculation helpers
 * @dev Provides stake-weighted averaging and score normalization
 */
library ReputationMath {
    /// @notice Precision for fixed-point calculations (18 decimals)
    uint256 internal constant PRECISION = 1e18;

    /// @notice Maximum allowed score value
    int128 internal constant MAX_SCORE = 100;

    /// @notice Minimum allowed score value
    int128 internal constant MIN_SCORE = -100;

    /**
     * @notice Calculate the square root of a number (for stake weighting)
     * @dev Uses Babylonian method for integer square root, handles max uint256
     * @param x The input value
     * @return y The square root of x
     */
    function sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        if (x == 1) return 1;
        // For max uint256, (x+1) would overflow to 0, so use x/2 + 1 for very large x
        // For smaller x, use (x+1)/2 for better initial guess
        uint256 z;
        if (x >= type(uint256).max - 1) {
            z = x / 2 + 1;
        } else {
            z = (x + 1) / 2;
        }
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    /**
     * @notice Calculate stake-weighted average of feedback values
     * @dev Weight = sqrt(stake), prevents plutocracy while valuing skin-in-the-game
     * @param values Array of feedback values
     * @param stakes Array of corresponding stakes
     * @return weightedAverage The stake-weighted average (scaled by PRECISION)
     */
    function calculateWeightedAverage(
        int128[] memory values,
        uint256[] memory stakes
    ) internal pure returns (int256 weightedAverage) {
        require(values.length == stakes.length, "ReputationMath: length mismatch");
        if (values.length == 0) return 0;

        int256 weightedSum = 0;
        uint256 totalWeight = 0;

        for (uint256 i = 0; i < values.length; i++) {
            uint256 weight = sqrt(stakes[i]);
            weightedSum += int256(values[i]) * int256(weight);
            totalWeight += weight;
        }

        if (totalWeight == 0) return 0;
        return (weightedSum * int256(PRECISION)) / int256(totalWeight);
    }

    /**
     * @notice Calculate stake weight using square root formula
     * @param stake The stake amount
     * @return weight The calculated weight
     */
    function calculateStakeWeight(uint256 stake) internal pure returns (uint256 weight) {
        return sqrt(stake);
    }

    /**
     * @notice Normalize a score to the valid range [-100, 100]
     * @param score The raw score
     * @return normalizedScore The clamped score
     */
    function normalizeScore(int128 score) internal pure returns (int128 normalizedScore) {
        if (score > MAX_SCORE) return MAX_SCORE;
        if (score < MIN_SCORE) return MIN_SCORE;
        return score;
    }

    /**
     * @notice Aggregate multiple feedback entries into a summary
     * @param values Array of feedback values
     * @return totalValue Sum of all values
     * @return count Number of values
     * @return minValue Minimum value
     * @return maxValue Maximum value
     */
    function aggregateFeedback(int128[] memory values)
        internal
        pure
        returns (int256 totalValue, uint256 count, int128 minValue, int128 maxValue)
    {
        if (values.length == 0) {
            return (0, 0, 0, 0);
        }

        count = values.length;
        minValue = values[0];
        maxValue = values[0];

        for (uint256 i = 0; i < values.length; i++) {
            totalValue += int256(values[i]);
            if (values[i] < minValue) minValue = values[i];
            if (values[i] > maxValue) maxValue = values[i];
        }
    }

    /**
     * @notice Calculate reputation decay factor based on time elapsed
     * @dev Uses linear decay: factor = 1 - (elapsed / maxAge), clamped to [0, PRECISION]
     * @param timestamp When the feedback was submitted
     * @param currentTime Current block timestamp
     * @param maxAge Maximum age before feedback has zero weight (in seconds)
     * @return decayFactor The decay factor (scaled by PRECISION)
     */
    function calculateDecay(
        uint256 timestamp,
        uint256 currentTime,
        uint256 maxAge
    ) internal pure returns (uint256 decayFactor) {
        if (currentTime <= timestamp) return PRECISION;

        uint256 elapsed = currentTime - timestamp;
        if (elapsed >= maxAge) return 0;

        return PRECISION - (elapsed * PRECISION) / maxAge;
    }
}
