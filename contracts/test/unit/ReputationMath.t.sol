// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/libraries/ReputationMath.sol";

/**
 * @title ReputationMathWrapper
 * @notice Wrapper contract to test library reverts
 */
contract ReputationMathWrapper {
    function calculateWeightedAverage(
        int128[] memory values,
        uint256[] memory stakes
    ) external pure returns (int256) {
        return ReputationMath.calculateWeightedAverage(values, stakes);
    }
}

/**
 * @title ReputationMathTest
 * @notice Unit tests for the ReputationMath library
 */
contract ReputationMathTest is Test {
    ReputationMathWrapper public wrapper;

    function setUp() public {
        wrapper = new ReputationMathWrapper();
    }
    using ReputationMath for *;

    // ============ sqrt Tests ============

    function test_sqrt_zero() public pure {
        assertEq(ReputationMath.sqrt(0), 0);
    }

    function test_sqrt_one() public pure {
        assertEq(ReputationMath.sqrt(1), 1);
    }

    function test_sqrt_perfectSquare() public pure {
        assertEq(ReputationMath.sqrt(4), 2);
        assertEq(ReputationMath.sqrt(9), 3);
        assertEq(ReputationMath.sqrt(16), 4);
        assertEq(ReputationMath.sqrt(25), 5);
        assertEq(ReputationMath.sqrt(100), 10);
        assertEq(ReputationMath.sqrt(10000), 100);
        assertEq(ReputationMath.sqrt(1000000), 1000);
    }

    function test_sqrt_nonPerfectSquare() public pure {
        // sqrt(2) ≈ 1.41, integer sqrt = 1
        assertEq(ReputationMath.sqrt(2), 1);
        // sqrt(5) ≈ 2.23, integer sqrt = 2
        assertEq(ReputationMath.sqrt(5), 2);
        // sqrt(10) ≈ 3.16, integer sqrt = 3
        assertEq(ReputationMath.sqrt(10), 3);
        // sqrt(15) ≈ 3.87, integer sqrt = 3
        assertEq(ReputationMath.sqrt(15), 3);
        // sqrt(24) ≈ 4.89, integer sqrt = 4
        assertEq(ReputationMath.sqrt(24), 4);
    }

    function test_sqrt_largeNumbers() public pure {
        // sqrt(1e18) = 1e9
        assertEq(ReputationMath.sqrt(1e18), 1e9);
        // sqrt(4e18) = 2e9
        assertEq(ReputationMath.sqrt(4e18), 2e9);
        // sqrt(1e36) = 1e18
        assertEq(ReputationMath.sqrt(1e36), 1e18);
    }

    function test_sqrt_maxUint256() public pure {
        uint256 result = ReputationMath.sqrt(type(uint256).max);
        // Result should be less than or equal to max uint128
        assertTrue(result <= type(uint128).max);
        // Result squared should be less than or equal to max uint256
        if (result <= type(uint128).max) {
            assertLe(result * result, type(uint256).max);
        }
    }

    function testFuzz_sqrt(uint256 x) public pure {
        uint256 result = ReputationMath.sqrt(x);
        // Check that result^2 <= x
        if (result > 0) {
            assertTrue(result * result <= x);
        }
        // Check that (result+1)^2 > x (if result+1 won't overflow)
        if (result < type(uint128).max) {
            assertTrue((result + 1) * (result + 1) > x);
        }
    }

    // ============ calculateWeightedAverage Tests ============

    function test_calculateWeightedAverage_empty() public pure {
        int128[] memory values = new int128[](0);
        uint256[] memory stakes = new uint256[](0);
        assertEq(ReputationMath.calculateWeightedAverage(values, stakes), 0);
    }

    function test_calculateWeightedAverage_singleValue() public pure {
        int128[] memory values = new int128[](1);
        uint256[] memory stakes = new uint256[](1);
        values[0] = 80;
        stakes[0] = 100 ether;

        int256 result = ReputationMath.calculateWeightedAverage(values, stakes);
        // With single value, weighted average should equal the value (scaled by PRECISION)
        // weight = sqrt(100e18) = 10e9
        // result = (80 * 10e9 * 1e18) / 10e9 = 80 * 1e18
        assertEq(result, 80 * int256(ReputationMath.PRECISION));
    }

    function test_calculateWeightedAverage_equalStakes() public pure {
        int128[] memory values = new int128[](3);
        uint256[] memory stakes = new uint256[](3);
        values[0] = 60;
        values[1] = 80;
        values[2] = 100;
        stakes[0] = 100 ether;
        stakes[1] = 100 ether;
        stakes[2] = 100 ether;

        int256 result = ReputationMath.calculateWeightedAverage(values, stakes);
        // Average of 60, 80, 100 = 80
        // All have equal weights (sqrt(100e18) = 10e9)
        assertEq(result, 80 * int256(ReputationMath.PRECISION));
    }

    function test_calculateWeightedAverage_differentStakes() public pure {
        int128[] memory values = new int128[](2);
        uint256[] memory stakes = new uint256[](2);
        values[0] = 100;  // High score
        values[1] = 0;    // Low score
        stakes[0] = 100 ether;  // sqrt(100e18) = 10e9
        stakes[1] = 400 ether;  // sqrt(400e18) = 20e9

        // Weighted: (100 * 10e9 + 0 * 20e9) / (10e9 + 20e9) = 1000e9 / 30e9 ≈ 33.33
        int256 result = ReputationMath.calculateWeightedAverage(values, stakes);
        // Result should be approximately 33.33 * PRECISION
        assertTrue(result > 33 * int256(ReputationMath.PRECISION));
        assertTrue(result < 34 * int256(ReputationMath.PRECISION));
    }

    function test_calculateWeightedAverage_negativeValues() public pure {
        int128[] memory values = new int128[](2);
        uint256[] memory stakes = new uint256[](2);
        values[0] = 50;
        values[1] = -50;
        stakes[0] = 100 ether;
        stakes[1] = 100 ether;

        int256 result = ReputationMath.calculateWeightedAverage(values, stakes);
        assertEq(result, 0); // Average of 50 and -50 = 0
    }

    function test_calculateWeightedAverage_allNegativeValues() public pure {
        int128[] memory values = new int128[](2);
        uint256[] memory stakes = new uint256[](2);
        values[0] = -30;
        values[1] = -70;
        stakes[0] = 100 ether;
        stakes[1] = 100 ether;

        int256 result = ReputationMath.calculateWeightedAverage(values, stakes);
        assertEq(result, -50 * int256(ReputationMath.PRECISION));
    }

    function test_calculateWeightedAverage_mixedPositiveNegative() public pure {
        int128[] memory values = new int128[](3);
        uint256[] memory stakes = new uint256[](3);
        values[0] = 100;
        values[1] = -50;
        values[2] = 50;
        stakes[0] = 100 ether;  // sqrt = 10e9
        stakes[1] = 100 ether;  // sqrt = 10e9
        stakes[2] = 400 ether;  // sqrt = 20e9

        // Weighted: (100*10e9 - 50*10e9 + 50*20e9) / 40e9 = 1500e9 / 40e9 = 37.5
        int256 result = ReputationMath.calculateWeightedAverage(values, stakes);
        // Result should be approximately 37.5 * PRECISION
        assertTrue(result > 37 * int256(ReputationMath.PRECISION));
        assertTrue(result < 38 * int256(ReputationMath.PRECISION));
    }

    function test_calculateWeightedAverage_zeroStakes() public pure {
        int128[] memory values = new int128[](2);
        uint256[] memory stakes = new uint256[](2);
        values[0] = 50;
        values[1] = 75;
        stakes[0] = 0;  // sqrt(0) = 0
        stakes[1] = 0;  // sqrt(0) = 0

        // Total weight = 0, should return 0
        int256 result = ReputationMath.calculateWeightedAverage(values, stakes);
        assertEq(result, 0);
    }

    function test_calculateWeightedAverage_largeValues() public pure {
        int128[] memory values = new int128[](2);
        uint256[] memory stakes = new uint256[](2);
        values[0] = 100;
        values[1] = -100;
        stakes[0] = 1e36;  // Very large stake
        stakes[1] = 1e36;  // Very large stake

        int256 result = ReputationMath.calculateWeightedAverage(values, stakes);
        assertEq(result, 0); // Equal weights and opposite values
    }

    function test_calculateWeightedAverage_lengthMismatch() public {
        int128[] memory values = new int128[](2);
        uint256[] memory stakes = new uint256[](3);

        vm.expectRevert("ReputationMath: length mismatch");
        wrapper.calculateWeightedAverage(values, stakes);
    }

    function test_calculateWeightedAverage_lengthMismatchOpposite() public {
        int128[] memory values = new int128[](3);
        uint256[] memory stakes = new uint256[](2);

        vm.expectRevert("ReputationMath: length mismatch");
        wrapper.calculateWeightedAverage(values, stakes);
    }

    function test_calculateWeightedAverage_manyValues() public pure {
        int128[] memory values = new int128[](10);
        uint256[] memory stakes = new uint256[](10);

        // Create a mix of values and stakes (use smaller stakes to avoid overflow)
        for (uint256 i = 0; i < 10; i++) {
            // Cast to int256 first to avoid uint256 underflow
            values[i] = int128(int256(i) * 10 - 45); // -45, -35, ..., 45
            stakes[i] = (i + 1) * 1 ether;
        }

        int256 result = ReputationMath.calculateWeightedAverage(values, stakes);
        // Should not revert and should return a reasonable value
        assertTrue(result >= -100 * int256(ReputationMath.PRECISION));
        assertTrue(result <= 100 * int256(ReputationMath.PRECISION));
    }

    // ============ calculateStakeWeight Tests ============

    function test_calculateStakeWeight_zero() public pure {
        assertEq(ReputationMath.calculateStakeWeight(0), 0);
    }

    function test_calculateStakeWeight_perfectSquare() public pure {
        assertEq(ReputationMath.calculateStakeWeight(100 ether), ReputationMath.sqrt(100 ether));
        assertEq(ReputationMath.calculateStakeWeight(1000 ether), ReputationMath.sqrt(1000 ether));
        assertEq(ReputationMath.calculateStakeWeight(10000 ether), ReputationMath.sqrt(10000 ether));
    }

    function test_calculateStakeWeight_nonPerfectSquare() public pure {
        uint256 result = ReputationMath.calculateStakeWeight(123 ether);
        assertEq(result, ReputationMath.sqrt(123 ether));
    }

    function test_calculateStakeWeight_largeValue() public pure {
        uint256 result = ReputationMath.calculateStakeWeight(1e36);
        assertEq(result, ReputationMath.sqrt(1e36));
        assertEq(result, 1e18);
    }

    // ============ normalizeScore Tests ============

    function test_normalizeScore_zero() public pure {
        assertEq(ReputationMath.normalizeScore(0), 0);
    }

    function test_normalizeScore_positiveWithinRange() public pure {
        assertEq(ReputationMath.normalizeScore(1), 1);
        assertEq(ReputationMath.normalizeScore(50), 50);
        assertEq(ReputationMath.normalizeScore(100), 100);
    }

    function test_normalizeScore_negativeWithinRange() public pure {
        assertEq(ReputationMath.normalizeScore(-1), -1);
        assertEq(ReputationMath.normalizeScore(-50), -50);
        assertEq(ReputationMath.normalizeScore(-100), -100);
    }

    function test_normalizeScore_positiveClamp() public pure {
        assertEq(ReputationMath.normalizeScore(101), 100);
        assertEq(ReputationMath.normalizeScore(150), 100);
        assertEq(ReputationMath.normalizeScore(1000), 100);
        assertEq(ReputationMath.normalizeScore(type(int128).max), 100);
    }

    function test_normalizeScore_negativeClamp() public pure {
        assertEq(ReputationMath.normalizeScore(-101), -100);
        assertEq(ReputationMath.normalizeScore(-150), -100);
        assertEq(ReputationMath.normalizeScore(-1000), -100);
        assertEq(ReputationMath.normalizeScore(type(int128).min), -100);
    }

    function test_normalizeScore_boundaryPositive() public pure {
        assertEq(ReputationMath.normalizeScore(99), 99);
        assertEq(ReputationMath.normalizeScore(100), 100);
        assertEq(ReputationMath.normalizeScore(101), 100);
    }

    function test_normalizeScore_boundaryNegative() public pure {
        assertEq(ReputationMath.normalizeScore(-99), -99);
        assertEq(ReputationMath.normalizeScore(-100), -100);
        assertEq(ReputationMath.normalizeScore(-101), -100);
    }

    // ============ aggregateFeedback Tests ============

    function test_aggregateFeedback_empty() public pure {
        int128[] memory values = new int128[](0);
        (int256 total, uint256 count, int128 min, int128 max) = ReputationMath.aggregateFeedback(values);
        assertEq(total, 0);
        assertEq(count, 0);
        assertEq(min, 0);
        assertEq(max, 0);
    }

    function test_aggregateFeedback_single() public pure {
        int128[] memory values = new int128[](1);
        values[0] = 75;

        (int256 total, uint256 count, int128 min, int128 max) = ReputationMath.aggregateFeedback(values);
        assertEq(total, 75);
        assertEq(count, 1);
        assertEq(min, 75);
        assertEq(max, 75);
    }

    function test_aggregateFeedback_singleNegative() public pure {
        int128[] memory values = new int128[](1);
        values[0] = -42;

        (int256 total, uint256 count, int128 min, int128 max) = ReputationMath.aggregateFeedback(values);
        assertEq(total, -42);
        assertEq(count, 1);
        assertEq(min, -42);
        assertEq(max, -42);
    }

    function test_aggregateFeedback_multiple() public pure {
        int128[] memory values = new int128[](5);
        values[0] = 10;
        values[1] = 50;
        values[2] = 30;
        values[3] = -20;
        values[4] = 80;

        (int256 total, uint256 count, int128 min, int128 max) = ReputationMath.aggregateFeedback(values);
        assertEq(total, 150); // 10+50+30-20+80
        assertEq(count, 5);
        assertEq(min, -20);
        assertEq(max, 80);
    }

    function test_aggregateFeedback_allNegative() public pure {
        int128[] memory values = new int128[](3);
        values[0] = -10;
        values[1] = -30;
        values[2] = -5;

        (int256 total, uint256 count, int128 min, int128 max) = ReputationMath.aggregateFeedback(values);
        assertEq(total, -45);
        assertEq(count, 3);
        assertEq(min, -30);
        assertEq(max, -5);
    }

    function test_aggregateFeedback_allPositive() public pure {
        int128[] memory values = new int128[](4);
        values[0] = 25;
        values[1] = 75;
        values[2] = 50;
        values[3] = 100;

        (int256 total, uint256 count, int128 min, int128 max) = ReputationMath.aggregateFeedback(values);
        assertEq(total, 250);
        assertEq(count, 4);
        assertEq(min, 25);
        assertEq(max, 100);
    }

    function test_aggregateFeedback_zeros() public pure {
        int128[] memory values = new int128[](3);
        values[0] = 0;
        values[1] = 0;
        values[2] = 0;

        (int256 total, uint256 count, int128 min, int128 max) = ReputationMath.aggregateFeedback(values);
        assertEq(total, 0);
        assertEq(count, 3);
        assertEq(min, 0);
        assertEq(max, 0);
    }

    function test_aggregateFeedback_sameMinMax() public pure {
        int128[] memory values = new int128[](3);
        values[0] = 50;
        values[1] = 50;
        values[2] = 50;

        (int256 total, uint256 count, int128 min, int128 max) = ReputationMath.aggregateFeedback(values);
        assertEq(total, 150);
        assertEq(count, 3);
        assertEq(min, 50);
        assertEq(max, 50);
    }

    function test_aggregateFeedback_extremeValues() public pure {
        int128[] memory values = new int128[](2);
        values[0] = 100;
        values[1] = -100;

        (int256 total, uint256 count, int128 min, int128 max) = ReputationMath.aggregateFeedback(values);
        assertEq(total, 0);
        assertEq(count, 2);
        assertEq(min, -100);
        assertEq(max, 100);
    }

    function test_aggregateFeedback_largeArray() public pure {
        int128[] memory values = new int128[](100);
        int256 expectedSum = 0;

        for (uint256 i = 0; i < 100; i++) {
            int128 value = int128(int256(i) - 50);
            values[i] = value;
            expectedSum += int256(value);
        }

        (int256 total, uint256 count, int128 min, int128 max) = ReputationMath.aggregateFeedback(values);
        assertEq(total, expectedSum);
        assertEq(count, 100);
        assertEq(min, -50);
        assertEq(max, 49);
    }

    // ============ calculateDecay Tests ============

    function test_calculateDecay_noTimeElapsed() public pure {
        uint256 result = ReputationMath.calculateDecay(1000, 1000, 1000);
        assertEq(result, ReputationMath.PRECISION);
    }

    function test_calculateDecay_futureTimestamp() public pure {
        // Current time before submission time (shouldn't happen but handled)
        uint256 result = ReputationMath.calculateDecay(2000, 1000, 1000);
        assertEq(result, ReputationMath.PRECISION);
    }

    function test_calculateDecay_halfLife() public pure {
        // elapsed = 500, maxAge = 1000
        // decay = 1e18 - (500 * 1e18) / 1000 = 1e18 - 0.5e18 = 0.5e18
        uint256 result = ReputationMath.calculateDecay(0, 500, 1000);
        assertEq(result, ReputationMath.PRECISION / 2);
    }

    function test_calculateDecay_quarterLife() public pure {
        // elapsed = 250, maxAge = 1000
        // decay = 1e18 - (250 * 1e18) / 1000 = 0.75e18
        uint256 result = ReputationMath.calculateDecay(0, 250, 1000);
        assertEq(result, (ReputationMath.PRECISION * 3) / 4);
    }

    function test_calculateDecay_threeQuarterLife() public pure {
        // elapsed = 750, maxAge = 1000
        // decay = 1e18 - (750 * 1e18) / 1000 = 0.25e18
        uint256 result = ReputationMath.calculateDecay(0, 750, 1000);
        assertEq(result, ReputationMath.PRECISION / 4);
    }

    function test_calculateDecay_atExpiry() public pure {
        // elapsed = maxAge = 1000
        // decay = 1e18 - (1000 * 1e18) / 1000 = 0
        uint256 result = ReputationMath.calculateDecay(0, 1000, 1000);
        assertEq(result, 0);
    }

    function test_calculateDecay_pastExpiry() public pure {
        // elapsed > maxAge
        uint256 result = ReputationMath.calculateDecay(0, 2000, 1000);
        assertEq(result, 0);
    }

    function test_calculateDecay_farPastExpiry() public pure {
        // elapsed much greater than maxAge
        uint256 result = ReputationMath.calculateDecay(100, 100000, 1000);
        assertEq(result, 0);
    }

    function test_calculateDecay_oneSecondElapsed() public pure {
        // elapsed = 1, maxAge = 1000
        // decay = 1e18 - (1 * 1e18) / 1000
        uint256 result = ReputationMath.calculateDecay(0, 1, 1000);
        assertEq(result, ReputationMath.PRECISION - ReputationMath.PRECISION / 1000);
    }

    function test_calculateDecay_largeMaxAge() public pure {
        // elapsed = 1000, maxAge = 1e18
        // decay = 1e18 - (1000 * 1e18) / 1e18
        uint256 result = ReputationMath.calculateDecay(0, 1000, 1e18);
        assertEq(result, ReputationMath.PRECISION - 1000);
    }

    function test_calculateDecay_verySmallMaxAge() public pure {
        // elapsed = 1, maxAge = 2
        // decay = 1e18 - (1 * 1e18) / 2 = 0.5e18
        uint256 result = ReputationMath.calculateDecay(0, 1, 2);
        assertEq(result, ReputationMath.PRECISION / 2);
    }

    function test_calculateDecay_proportionalDecay() public pure {
        // Test that decay is proportional to elapsed time
        uint256 elapsed1 = 100;
        uint256 elapsed2 = 200;
        uint256 maxAge = 1000;

        uint256 result1 = ReputationMath.calculateDecay(0, elapsed1, maxAge);
        uint256 result2 = ReputationMath.calculateDecay(0, elapsed2, maxAge);

        // result1 should be greater than result2
        assertTrue(result1 > result2);
        // result1 should be twice result2 (approximately)
        assertEq(result1, ReputationMath.PRECISION - (elapsed1 * ReputationMath.PRECISION) / maxAge);
        assertEq(result2, ReputationMath.PRECISION - (elapsed2 * ReputationMath.PRECISION) / maxAge);
    }

    function test_calculateDecay_realWorldScenario() public pure {
        // Feedback submitted 7 days ago (604800 seconds)
        // Max age is 30 days (2592000 seconds)
        // Current time is 7 days after submission
        uint256 timestamp = 1000;
        uint256 currentTime = 1000 + 604800;
        uint256 maxAge = 2592000;

        uint256 result = ReputationMath.calculateDecay(timestamp, currentTime, maxAge);
        // decay = 1e18 - (604800 * 1e18) / 2592000
        // decay ≈ 0.767e18
        assertTrue(result > 0);
        assertTrue(result < ReputationMath.PRECISION);
    }

    function test_calculateDecay_zeroMaxAge() public pure {
        // Edge case: maxAge = 0 would cause division by zero, but feedback older than current time
        // Since elapsed > maxAge (any elapsed >= 0), should return 0
        uint256 result = ReputationMath.calculateDecay(0, 1, 0);
        assertEq(result, 0);
    }

    // ============ Integration Tests ============

    function test_integration_reputationCalculation() public pure {
        // Simulate a reputation calculation with multiple feedback entries
        int128[] memory feedbackValues = new int128[](3);
        feedbackValues[0] = 80;  // Good feedback
        feedbackValues[1] = 60;  // Medium feedback
        feedbackValues[2] = -40; // Negative feedback

        uint256[] memory stakes = new uint256[](3);
        stakes[0] = 100 ether;   // stake1 = 100, weight = 10e9
        stakes[1] = 400 ether;   // stake2 = 400, weight = 20e9
        stakes[2] = 100 ether;   // stake3 = 100, weight = 10e9

        int256 weightedReputation = ReputationMath.calculateWeightedAverage(feedbackValues, stakes);
        // Weighted: (80*10e9 + 60*20e9 + (-40)*10e9) / 40e9 = 1600e9 / 40e9 = 40
        assertTrue(weightedReputation > 39 * int256(ReputationMath.PRECISION));
        assertTrue(weightedReputation < 41 * int256(ReputationMath.PRECISION));

        // Normalize the result
        int128 normalizedScore = ReputationMath.normalizeScore(
            int128(weightedReputation / int256(ReputationMath.PRECISION))
        );
        assertEq(normalizedScore, 40);
    }

    function test_integration_feedbackAggregationWithDecay() public pure {
        // Simulate feedback aggregation with decay over time
        int128[] memory feedbackValues = new int128[](3);
        feedbackValues[0] = 100;
        feedbackValues[1] = 80;
        feedbackValues[2] = 60;

        // Get aggregate statistics
        (int256 total, uint256 count, int128 min, int128 max) = ReputationMath.aggregateFeedback(feedbackValues);

        assertEq(total, 240);
        assertEq(count, 3);
        assertEq(min, 60);
        assertEq(max, 100);

        // Apply decay to each feedback
        uint256[] memory decayFactors = new uint256[](3);
        decayFactors[0] = ReputationMath.calculateDecay(0, 7 days, 30 days); // Recent feedback
        decayFactors[1] = ReputationMath.calculateDecay(0, 15 days, 30 days); // Medium age
        decayFactors[2] = ReputationMath.calculateDecay(0, 31 days, 30 days); // Expired feedback

        // Verify decay factors
        assertTrue(decayFactors[0] > decayFactors[1]);
        assertTrue(decayFactors[1] > decayFactors[2]);
        assertEq(decayFactors[2], 0); // Should be 0 since > 30 days
    }

    function test_integration_normalizeAndValidate() public pure {
        // Test normalizing extreme scores
        int128[] memory scores = new int128[](5);
        scores[0] = 200;
        scores[1] = -150;
        scores[2] = 75;
        scores[3] = -50;
        scores[4] = 0;

        int128[] memory normalized = new int128[](5);
        for (uint256 i = 0; i < scores.length; i++) {
            normalized[i] = ReputationMath.normalizeScore(scores[i]);
        }

        assertEq(normalized[0], 100);
        assertEq(normalized[1], -100);
        assertEq(normalized[2], 75);
        assertEq(normalized[3], -50);
        assertEq(normalized[4], 0);

        // Verify all normalized scores are within bounds
        for (uint256 i = 0; i < normalized.length; i++) {
            assertTrue(normalized[i] >= -100);
            assertTrue(normalized[i] <= 100);
        }
    }
}
