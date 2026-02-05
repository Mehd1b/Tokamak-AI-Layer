// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IDRBIntegrationModule
 * @notice Interface for DRB-powered fair validator selection
 * @dev Wraps Tokamak's DRB Commit-Reveal² for TAL validator selection
 *
 * The DRB uses a CALLBACK model (not pull):
 * 1. requestValidatorSelection() calls CommitReveal2.requestRandomNumber{value}(callbackGasLimit)
 * 2. DRB operators run the Commit-Reveal² protocol
 * 3. CommitReveal2 calls rawFulfillRandomNumber(round, randomNumber) on this contract
 * 4. The random number is stored for the corresponding request
 * 5. finalizeValidatorSelection() uses the stored randomness for weighted selection
 *
 * There is NO getRandomness() or isRandomnessAvailable() function on the DRB.
 * Randomness is delivered asynchronously via callback.
 */
interface IDRBIntegrationModule {
    // ============ Events ============

    /// @notice Emitted when a randomness request is sent to CommitReveal2
    event RandomnessRequested(uint256 indexed round, bytes32 indexed requestHash);

    /// @notice Emitted when CommitReveal2 delivers the random number via callback
    event RandomnessReceived(uint256 indexed round, uint256 randomNumber);

    /// @notice Emitted when a validator is selected using DRB randomness
    event ValidatorSelected(bytes32 indexed requestHash, address indexed validator);

    // ============ Errors ============

    error RandomnessNotAvailable(uint256 round);
    error InvalidCandidateList();
    error DRBRequestFailed();
    error NoCandidatesProvided();
    error WeightsMismatch(uint256 candidateCount, uint256 weightCount);
    error ValidatorAlreadySelected(bytes32 requestHash);
    error OnlyCoordinatorCanFulfill(address caller, address coordinator);
    error InsufficientFee(uint256 required, uint256 provided);

    // ============ Selection Functions ============

    /// @notice Select a validator from weighted candidate list using provided randomness
    /// @dev Pure function - uses cumulative sum approach for weighted random selection
    function selectFromWeightedList(
        address[] calldata candidates,
        uint256[] calldata weights,
        uint256 randomValue
    ) external pure returns (address selected);

    /// @notice Request validator selection for a validation request
    /// @dev Payable - must send ETH to cover DRB request fee
    ///      Calls CommitReveal2.requestRandomNumber{value}(callbackGasLimit)
    function requestValidatorSelection(
        bytes32 requestHash,
        address[] calldata candidates,
        uint256[] calldata stakes
    ) external payable returns (uint256 drbRound);

    /// @notice Finalize validator selection after DRB callback delivers randomness
    /// @dev Must be called after rawFulfillRandomNumber has been invoked by the coordinator
    function finalizeValidatorSelection(
        bytes32 requestHash,
        address[] calldata candidates,
        uint256[] calldata stakes
    ) external returns (address selected);

    /// @notice Check if randomness has been received for a round
    function isRandomnessReceived(uint256 round) external view returns (bool);

    /// @notice Get the selected validator for a request
    function getSelectedValidator(bytes32 requestHash) external view returns (address);

    /// @notice Estimate the fee for a DRB randomness request
    function estimateRequestFee(uint32 callbackGasLimit) external view returns (uint256);
}
