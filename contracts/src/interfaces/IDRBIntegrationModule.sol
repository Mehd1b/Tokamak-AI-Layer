// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IDRBIntegrationModule
 * @notice Interface for DRB-powered fair validator selection
 * @dev Wraps Tokamak's DRB Commit-Reveal² for TAL validator selection
 */
interface IDRBIntegrationModule {
    // ============ Events ============

    event RandomnessRequested(uint256 indexed requestId, bytes32 indexed seed);
    event RandomnessReceived(uint256 indexed requestId, uint256 randomValue);
    event ValidatorSelected(bytes32 indexed requestHash, address indexed validator);

    // ============ Errors ============

    error RandomnessNotAvailable(uint256 requestId);
    error InvalidCandidateList();
    error DRBRequestFailed();
    error NoCandidatesProvided();
    error WeightsMismatch(uint256 candidateCount, uint256 weightCount);

    // ============ Randomness Functions ============

    /// @notice Request randomness from DRB
    function requestRandomness(bytes32 seed) external returns (uint256 requestId);

    /// @notice Get randomness for a completed request
    function getRandomness(uint256 requestId) external view returns (uint256 randomValue);

    /// @notice Check if randomness is available
    function isRandomnessAvailable(uint256 requestId) external view returns (bool);

    // ============ Selection Functions ============

    /// @notice Select a validator from weighted candidate list using DRB randomness
    function selectFromWeightedList(
        address[] calldata candidates,
        uint256[] calldata weights,
        uint256 randomValue
    ) external pure returns (address selected);

    /// @notice Request validator selection for a validation request
    function requestValidatorSelection(
        bytes32 requestHash,
        address[] calldata candidates,
        uint256[] calldata stakes
    ) external returns (uint256 drbRequestId);

    /// @notice Finalize validator selection after randomness is available
    function finalizeValidatorSelection(
        bytes32 requestHash,
        uint256 drbRequestId
    ) external returns (address selected);
}
