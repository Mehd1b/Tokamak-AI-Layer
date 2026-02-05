// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ICommitReveal2
 * @notice Interface for Tokamak's Decentralized Random Beacon (DRB) coordinator
 * @dev Based on the actual CommitReveal2 contract from tokamak-network/Commit-Reveal2 (audit/main-fixes branch)
 *
 * The DRB uses a CALLBACK/PUSH model (not pull):
 * 1. Consumer calls requestRandomNumber{value: fee}(callbackGasLimit) on the coordinator
 * 2. DRB operators execute the Commit-Reveal² protocol off-chain
 * 3. When complete, the coordinator calls rawFulfillRandomNumber(round, randomNumber) on the consumer
 * 4. The consumer's fulfillRandomNumber() implementation is invoked with the result
 *
 * IMPORTANT: There is NO getRandomness() or isRandomnessAvailable() function.
 * Randomness is delivered asynchronously via callback, not polled.
 */
interface ICommitReveal2 {
    // ============ Consumer Functions ============

    /// @notice Request a new random number from the DRB
    /// @dev Consumer must send ETH to cover the request fee (use estimateRequestPrice to calculate)
    /// @param callbackGasLimit Gas limit for the consumer's callback function
    /// @return newRound The round number assigned to this request
    function requestRandomNumber(uint32 callbackGasLimit) external payable returns (uint256 newRound);

    /// @notice Estimate the cost of a randomness request
    /// @param callbackGasLimit Gas limit for the callback
    /// @param gasPrice Current gas price for fee estimation
    /// @return The estimated fee in wei
    function estimateRequestPrice(uint256 callbackGasLimit, uint256 gasPrice) external view returns (uint256);

    /// @notice Estimate the cost with a specific number of operators
    /// @param callbackGasLimit Gas limit for the callback
    /// @param gasPrice Current gas price for fee estimation
    /// @param numOfOperators Number of DRB operators
    /// @return The estimated fee in wei
    function estimateRequestPrice(uint256 callbackGasLimit, uint256 gasPrice, uint256 numOfOperators) external view returns (uint256);

    /// @notice Refund the cost of a round that was not fulfilled
    /// @dev Only callable by the original consumer of the round
    /// @dev Round must not have been fulfilled (no random number generated)
    /// @param round The round to refund
    function refund(uint256 round) external;

    // ============ View Functions ============

    /// @notice Get the current round number
    /// @return The current DRB round being processed
    function s_currentRound() external view returns (uint256);

    /// @notice Get the total number of requests made
    /// @return The total request count
    function s_requestCount() external view returns (uint256);

    /// @notice Get request information for a specific round
    /// @param round The round number to query
    /// @return consumer The address that requested the round
    /// @return startTime The timestamp when the round started
    /// @return cost The fee paid for the request
    /// @return callbackGasLimit The gas limit for the callback
    function s_requestInfo(uint256 round) external view returns (
        address consumer,
        uint256 startTime,
        uint256 cost,
        uint256 callbackGasLimit
    );

    /// @notice Get the number of activated DRB operators
    /// @return The count of activated operators
    function getActivatedOperatorsLength() external view returns (uint256);

    /// @notice Get all activated DRB operator addresses
    /// @return Array of activated operator addresses
    function getActivatedOperators() external view returns (address[] memory);

    /// @notice Get the flat fee for requests
    /// @return The flat fee in wei
    function s_flatFee() external view returns (uint256);
}

/**
 * @title IDRBConsumerBase
 * @notice Interface that DRB consumers must implement to receive random numbers
 * @dev Based on ConsumerBase.sol from tokamak-network/Commit-Reveal2
 *
 * Consumers should:
 * 1. Store the coordinator address
 * 2. Implement rawFulfillRandomNumber() that validates msg.sender == coordinator
 * 3. Implement internal fulfillRandomNumber() with the actual business logic
 *
 * Note: For UUPS upgradeable contracts (like DRBIntegrationModule), the coordinator
 * address should be stored in regular storage rather than immutable (ConsumerBase
 * uses immutable which is incompatible with proxies).
 */
interface IDRBConsumerBase {
    /// @notice External callback invoked by the CommitReveal2 coordinator
    /// @dev MUST validate that msg.sender is the coordinator address
    /// @dev Internally should call the consumer's fulfillRandomNumber logic
    /// @param round The round number that was fulfilled
    /// @param randomNumber The generated random number
    function rawFulfillRandomNumber(uint256 round, uint256 randomNumber) external;
}
