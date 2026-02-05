// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IDRB
 * @notice Interface for Tokamak's Decentralized Random Beacon
 * @dev Implements Commit-Reveal² protocol for manipulation-resistant randomness
 */
interface IDRB {
    /// @notice Request a new random number
    /// @param seed Application-specific seed for the request
    /// @return requestId Unique identifier for the randomness request
    function requestRandomness(bytes32 seed) external returns (uint256 requestId);

    /// @notice Get the random value for a completed request
    /// @param requestId The request identifier
    /// @return randomValue The generated random value
    function getRandomness(uint256 requestId) external view returns (uint256 randomValue);

    /// @notice Check if randomness is available for a request
    /// @param requestId The request identifier
    /// @return True if randomness has been generated
    function isRandomnessAvailable(uint256 requestId) external view returns (bool);

    /// @notice Get the current round number
    /// @return The current DRB round
    function currentRound() external view returns (uint256);
}
