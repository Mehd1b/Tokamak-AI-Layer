// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/IDRB.sol";

/**
 * @title DRBIntegrationModule
 * @notice Wraps Tokamak's DRB Commit-Reveal² for fair validator selection
 * @dev Implements the DRB consumer callback pattern for UUPS upgradeable contracts.
 *
 * Unlike ConsumerBase (which uses immutable variables), this contract stores the
 * coordinator address in regular storage to remain compatible with UUPS proxies.
 *
 * Selection Algorithm (async, callback-based):
 * 1. requestValidatorSelection() sends ETH + callbackGasLimit to CommitReveal2
 * 2. CommitReveal2 operators run the Commit-Reveal² protocol
 * 3. rawFulfillRandomNumber() callback delivers the random number
 * 4. finalizeValidatorSelection() uses random value + stake weights for weighted selection
 *
 * Weighted Selection:
 * - Uses cumulative sum approach with stake-based weights
 * - Higher stake = higher probability of selection (linear, not quadratic)
 * - Never uses block.timestamp or prevrandao for randomness
 */
contract DRBIntegrationModule is
    AccessControlUpgradeable,
    UUPSUpgradeable,
    IDRBConsumerBase
{
    // ============ Constants ============
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant VALIDATOR_SELECTOR_ROLE = keccak256("VALIDATOR_SELECTOR_ROLE");

    /// @notice Default callback gas limit for DRB requests
    uint32 public constant DEFAULT_CALLBACK_GAS_LIMIT = 100_000;

    // ============ State Variables ============

    /// @notice CommitReveal2 coordinator contract address
    /// @dev Stored in storage (not immutable) for UUPS proxy compatibility
    address public coordinator;

    /// @notice Configurable callback gas limit for DRB requests
    uint32 public callbackGasLimit;

    /// @notice Mapping from DRB round to delivered random number
    mapping(uint256 => uint256) public deliveredRandomness;

    /// @notice Mapping from DRB round to whether randomness has been delivered
    mapping(uint256 => bool) public randomnessDelivered;

    /// @notice Mapping from validation request hash to DRB round
    mapping(bytes32 => uint256) public drbRounds;

    /// @notice Mapping from DRB round to validation request hash
    mapping(uint256 => bytes32) public requestHashByRound;

    /// @notice Mapping from validation request hash to selected validator
    mapping(bytes32 => address) public selectedValidators;

    /// @notice Storage gap
    uint256[30] private __gap;

    // ============ Events ============
    event RandomnessRequested(uint256 indexed round, bytes32 indexed requestHash);
    event RandomnessReceived(uint256 indexed round, uint256 randomNumber);
    event ValidatorSelected(bytes32 indexed requestHash, address indexed validator);

    // ============ Errors ============
    error RandomnessNotAvailable(uint256 round);
    error InvalidCandidateList();
    error NoCandidatesProvided();
    error WeightsMismatch(uint256 candidateCount, uint256 weightCount);
    error DRBRequestFailed();
    error ValidatorAlreadySelected(bytes32 requestHash);
    error OnlyCoordinatorCanFulfill(address caller, address expectedCoordinator);
    error InsufficientFee(uint256 required, uint256 provided);

    // ============ Initializer ============

    function initialize(
        address admin_,
        address coordinator_
    ) external initializer {
        __AccessControl_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(UPGRADER_ROLE, admin_);
        _grantRole(VALIDATOR_SELECTOR_ROLE, admin_);

        coordinator = coordinator_;
        callbackGasLimit = DEFAULT_CALLBACK_GAS_LIMIT;
    }

    // ============ DRB Consumer Callback ============

    /// @notice Callback invoked by CommitReveal2 when random number is generated
    /// @dev Only the coordinator contract can call this function
    ///      Mirrors ConsumerBase.rawFulfillRandomNumber() but without immutable dependency
    /// @param round The DRB round that was fulfilled
    /// @param randomNumber The generated random number
    function rawFulfillRandomNumber(uint256 round, uint256 randomNumber) external override {
        if (msg.sender != coordinator) {
            revert OnlyCoordinatorCanFulfill(msg.sender, coordinator);
        }

        // Store the delivered randomness
        deliveredRandomness[round] = randomNumber;
        randomnessDelivered[round] = true;

        emit RandomnessReceived(round, randomNumber);
    }

    // ============ Selection Functions ============

    /// @notice Select a validator from weighted candidate list
    /// @dev Pure function - uses cumulative sum approach for weighted random selection
    /// @param candidates Array of candidate addresses
    /// @param weights Array of weights (typically stake amounts)
    /// @param randomValue Random value from DRB
    /// @return selected The selected validator address
    function selectFromWeightedList(
        address[] calldata candidates,
        uint256[] calldata weights,
        uint256 randomValue
    ) external pure returns (address selected) {
        if (candidates.length == 0) revert NoCandidatesProvided();
        if (candidates.length != weights.length) {
            revert WeightsMismatch(candidates.length, weights.length);
        }

        // Calculate total weight
        uint256 totalWeight = 0;
        for (uint256 i = 0; i < weights.length; i++) {
            totalWeight += weights[i];
        }

        if (totalWeight == 0) revert InvalidCandidateList();

        // Weighted random selection using cumulative sum
        uint256 threshold = randomValue % totalWeight;
        uint256 cumulative = 0;

        for (uint256 i = 0; i < candidates.length; i++) {
            cumulative += weights[i];
            if (threshold < cumulative) {
                return candidates[i];
            }
        }

        // Fallback (should never reach here)
        return candidates[candidates.length - 1];
    }

    /// @notice Request validator selection for a validation request
    /// @dev Calls CommitReveal2.requestRandomNumber{value}(callbackGasLimit)
    ///      The caller must send enough ETH to cover the DRB request fee.
    ///      Use estimateRequestFee() to determine the required amount.
    ///      Excess ETH is refunded to the caller.
    /// @param requestHash The validation request hash
    /// @param candidates Array of candidate validators (stored for verification only)
    /// @param stakes Array of candidate stakes (stored for verification only)
    /// @return drbRound The DRB round number for tracking
    function requestValidatorSelection(
        bytes32 requestHash,
        address[] calldata candidates,
        uint256[] calldata stakes
    ) external payable onlyRole(VALIDATOR_SELECTOR_ROLE) returns (uint256 drbRound) {
        if (candidates.length == 0) revert NoCandidatesProvided();
        if (candidates.length != stakes.length) {
            revert WeightsMismatch(candidates.length, stakes.length);
        }
        if (selectedValidators[requestHash] != address(0)) {
            revert ValidatorAlreadySelected(requestHash);
        }

        // Estimate the required fee
        uint256 requestFee = ICommitReveal2(coordinator).estimateRequestPrice(
            callbackGasLimit,
            tx.gasprice
        );

        if (msg.value < requestFee) {
            revert InsufficientFee(requestFee, msg.value);
        }

        // Request randomness from CommitReveal2 (payable call)
        drbRound = ICommitReveal2(coordinator).requestRandomNumber{value: requestFee}(
            callbackGasLimit
        );

        // Store mappings for callback resolution
        drbRounds[requestHash] = drbRound;
        requestHashByRound[drbRound] = requestHash;

        // Refund excess ETH to caller
        uint256 excess = msg.value - requestFee;
        if (excess > 0) {
            (bool refundSuccess, ) = msg.sender.call{value: excess}("");
            // Best-effort refund - don't revert if it fails
        }

        emit RandomnessRequested(drbRound, requestHash);
    }

    /// @notice Finalize validator selection after DRB callback delivers randomness
    /// @dev Must be called after rawFulfillRandomNumber has been invoked by the coordinator
    ///      The candidates and stakes must match the original request for integrity
    /// @param requestHash The validation request hash
    /// @param candidates Array of candidate validators
    /// @param stakes Array of candidate stakes
    /// @return selected The selected validator
    function finalizeValidatorSelection(
        bytes32 requestHash,
        address[] calldata candidates,
        uint256[] calldata stakes
    ) external onlyRole(VALIDATOR_SELECTOR_ROLE) returns (address selected) {
        uint256 round = drbRounds[requestHash];
        if (round == 0) revert DRBRequestFailed();

        // Verify randomness has been delivered via callback
        if (!randomnessDelivered[round]) {
            revert RandomnessNotAvailable(round);
        }

        uint256 randomValue = deliveredRandomness[round];

        // Select validator using weighted random selection
        selected = this.selectFromWeightedList(candidates, stakes, randomValue);
        selectedValidators[requestHash] = selected;

        emit ValidatorSelected(requestHash, selected);
    }

    // ============ View Functions ============

    /// @notice Check if randomness has been received for a round
    function isRandomnessReceived(uint256 round) external view returns (bool) {
        return randomnessDelivered[round];
    }

    /// @notice Get the selected validator for a request
    function getSelectedValidator(bytes32 requestHash) external view returns (address) {
        return selectedValidators[requestHash];
    }

    /// @notice Estimate the fee for a DRB randomness request
    /// @param _callbackGasLimit The callback gas limit to estimate for
    /// @return The estimated fee in wei
    function estimateRequestFee(uint32 _callbackGasLimit) external view returns (uint256) {
        return ICommitReveal2(coordinator).estimateRequestPrice(
            _callbackGasLimit,
            tx.gasprice
        );
    }

    /// @notice Get the DRB round for a request hash
    function getDRBRound(bytes32 requestHash) external view returns (uint256) {
        return drbRounds[requestHash];
    }

    // ============ Admin Functions ============

    function setCoordinator(address coordinator_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        coordinator = coordinator_;
    }

    function setCallbackGasLimit(uint32 callbackGasLimit_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        callbackGasLimit = callbackGasLimit_;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    /// @notice Receive function to accept ETH for DRB request fees
    receive() external payable {}
}
