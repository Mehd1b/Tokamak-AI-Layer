// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockDRB
 * @notice Mock CommitReveal2 coordinator for testing DRB integration
 * @dev Simulates the callback-based DRB model:
 *      1. Consumer calls requestRandomNumber{value}(callbackGasLimit) → returns round
 *      2. Test calls fulfillRandomNumber(round) to simulate operator delivery
 *      3. Coordinator calls rawFulfillRandomNumber(round, randomNumber) on consumer
 */
contract MockDRB {
    // ============ State ============

    uint256 public nextRound;

    /// @notice Simulated flat fee for requests
    uint256 public s_flatFee;

    /// @notice Request info per round
    struct RequestInfo {
        address consumer;
        uint256 startTime;
        uint256 cost;
        uint256 callbackGasLimit;
    }
    mapping(uint256 => RequestInfo) public requestInfo;

    /// @notice Pre-set random values for deterministic testing
    mapping(uint256 => uint256) public presetRandomValues;

    /// @notice Whether a round has been fulfilled
    mapping(uint256 => bool) public fulfilled;

    // ============ Events ============
    event RandomnessRequested(uint256 indexed round, address indexed consumer, uint256 fee);
    event RandomnessFulfilled(uint256 indexed round, uint256 randomNumber);

    constructor() {
        nextRound = 1; // Rounds start at 1 (0 is used as "not set")
        s_flatFee = 0.001 ether;
    }

    // ============ ICommitReveal2 Implementation ============

    /// @notice Request a random number (mock)
    /// @dev Mimics CommitReveal2.requestRandomNumber{value}(callbackGasLimit)
    function requestRandomNumber(uint32 callbackGasLimit) external payable returns (uint256 newRound) {
        newRound = nextRound++;

        requestInfo[newRound] = RequestInfo({
            consumer: msg.sender,
            startTime: block.timestamp,
            cost: msg.value,
            callbackGasLimit: callbackGasLimit
        });

        emit RandomnessRequested(newRound, msg.sender, msg.value);
    }

    /// @notice Estimate request price (mock - returns flat fee)
    function estimateRequestPrice(uint256 /* callbackGasLimit */, uint256 /* gasPrice */) external view returns (uint256) {
        return s_flatFee;
    }

    /// @notice Estimate request price with operator count (mock)
    function estimateRequestPrice(uint256 /* callbackGasLimit */, uint256 /* gasPrice */, uint256 /* numOfOperators */) external view returns (uint256) {
        return s_flatFee;
    }

    /// @notice Refund a round (mock - no-op)
    function refund(uint256 /* round */) external pure {}

    /// @notice Get current round
    function s_currentRound() external view returns (uint256) {
        return nextRound - 1;
    }

    /// @notice Get request count
    function s_requestCount() external view returns (uint256) {
        return nextRound - 1;
    }

    /// @notice Get request info for a round
    function s_requestInfo(uint256 round) external view returns (
        address consumer,
        uint256 startTime,
        uint256 cost,
        uint256 callbackGasLimit
    ) {
        RequestInfo storage info = requestInfo[round];
        return (info.consumer, info.startTime, info.cost, info.callbackGasLimit);
    }

    /// @notice Get activated operators length (mock)
    function getActivatedOperatorsLength() external pure returns (uint256) {
        return 3;
    }

    /// @notice Get activated operators (mock)
    function getActivatedOperators() external pure returns (address[] memory) {
        address[] memory ops = new address[](3);
        ops[0] = address(0xA1);
        ops[1] = address(0xA2);
        ops[2] = address(0xA3);
        return ops;
    }

    // ============ Test Helpers ============

    /// @notice Simulate DRB operators fulfilling a round (delivers callback to consumer)
    /// @dev This is the key test helper. Call this after requestRandomNumber to simulate
    ///      the async callback delivery that CommitReveal2 does in production.
    /// @param round The round to fulfill
    function fulfillRandomNumber(uint256 round) external {
        require(requestInfo[round].consumer != address(0), "MockDRB: round not requested");
        require(!fulfilled[round], "MockDRB: already fulfilled");

        // Use preset value if available, otherwise generate deterministic random
        uint256 randomNumber = presetRandomValues[round];
        if (randomNumber == 0) {
            randomNumber = uint256(keccak256(abi.encodePacked(round, block.timestamp, block.prevrandao)));
            // Ensure non-zero
            if (randomNumber == 0) randomNumber = 1;
        }

        fulfilled[round] = true;

        // Deliver callback to consumer (mimics CommitReveal2's callback)
        address consumer = requestInfo[round].consumer;
        (bool success, ) = consumer.call(
            abi.encodeWithSignature("rawFulfillRandomNumber(uint256,uint256)", round, randomNumber)
        );
        require(success, "MockDRB: callback failed");

        emit RandomnessFulfilled(round, randomNumber);
    }

    /// @notice Fulfill with a specific random value (for deterministic tests)
    /// @param round The round to fulfill
    /// @param randomNumber The exact random value to deliver
    function fulfillRandomNumberWith(uint256 round, uint256 randomNumber) external {
        require(requestInfo[round].consumer != address(0), "MockDRB: round not requested");
        require(!fulfilled[round], "MockDRB: already fulfilled");

        fulfilled[round] = true;

        address consumer = requestInfo[round].consumer;
        (bool success, ) = consumer.call(
            abi.encodeWithSignature("rawFulfillRandomNumber(uint256,uint256)", round, randomNumber)
        );
        require(success, "MockDRB: callback failed");

        emit RandomnessFulfilled(round, randomNumber);
    }

    /// @notice Pre-set a random value for a specific round
    function setRandomValue(uint256 round, uint256 value) external {
        presetRandomValues[round] = value;
    }

    /// @notice Set the flat fee for requests
    function setFlatFee(uint256 fee) external {
        s_flatFee = fee;
    }

    /// @notice Allow receiving ETH
    receive() external payable {}
}
