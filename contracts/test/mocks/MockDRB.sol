// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockDRB
 * @notice Mock contract for testing DRB integration
 * @dev Simulates Commit-Reveal² randomness for deterministic testing
 */
contract MockDRB {
    mapping(uint256 => uint256) public randomValues;
    mapping(uint256 => bool) public isAvailable;
    uint256 public nextRequestId;
    uint256 public currentRoundNumber;

    event RandomnessRequested(uint256 indexed requestId, bytes32 seed);
    event RandomnessSet(uint256 indexed requestId, uint256 randomValue);

    /// @notice Request randomness (simulated)
    function requestRandomness(bytes32 seed) external returns (uint256 requestId) {
        requestId = nextRequestId++;
        // Auto-generate deterministic randomness from seed for testing
        randomValues[requestId] = uint256(keccak256(abi.encodePacked(seed, requestId, block.timestamp)));
        isAvailable[requestId] = true;
        emit RandomnessRequested(requestId, seed);
    }

    /// @notice Get randomness for a request
    function getRandomness(uint256 requestId) external view returns (uint256) {
        require(isAvailable[requestId], "Randomness not available");
        return randomValues[requestId];
    }

    /// @notice Check if randomness is available
    function isRandomnessAvailable(uint256 requestId) external view returns (bool) {
        return isAvailable[requestId];
    }

    /// @notice Get current round
    function currentRound() external view returns (uint256) {
        return currentRoundNumber;
    }

    // ============ Test Helpers ============

    /// @notice Set a specific random value for testing
    function setRandomValue(uint256 requestId, uint256 value) external {
        randomValues[requestId] = value;
        isAvailable[requestId] = true;
        emit RandomnessSet(requestId, value);
    }

    /// @notice Set current round number
    function setCurrentRound(uint256 round) external {
        currentRoundNumber = round;
    }

    /// @notice Make randomness unavailable (simulate pending state)
    function setUnavailable(uint256 requestId) external {
        isAvailable[requestId] = false;
    }
}
