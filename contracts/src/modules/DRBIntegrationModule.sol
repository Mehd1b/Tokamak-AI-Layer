// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title DRBIntegrationModule
 * @notice Wraps Tokamak's DRB Commit-Reveal² for fair validator selection
 * @dev Used by TALValidationRegistry for StakeSecured and Hybrid validation models
 *
 * Selection Algorithm:
 * 1. Request randomness from DRB contract
 * 2. Wait for randomness generation (Commit-Reveal² protocol)
 * 3. Use random value + stake weights for weighted random selection
 * 4. Selected validator is assigned to the validation request
 *
 * Weighted Selection:
 * - Uses cumulative sum approach with stake-based weights
 * - Higher stake = higher probability of selection (linear, not quadratic)
 * - Never uses block.timestamp or prevrandao for randomness
 */
contract DRBIntegrationModule is
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    // ============ Constants ============
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant VALIDATOR_SELECTOR_ROLE = keccak256("VALIDATOR_SELECTOR_ROLE");

    // ============ State Variables ============

    /// @notice DRB contract address
    address public drbContract;

    /// @notice Mapping from validation request hash to DRB request ID
    mapping(bytes32 => uint256) public drbRequestIds;

    /// @notice Mapping from validation request hash to selected validator
    mapping(bytes32 => address) public selectedValidators;

    /// @notice Mapping from DRB request ID to validation request hash
    mapping(uint256 => bytes32) public requestHashByDRBId;

    /// @notice Storage gap
    uint256[30] private __gap;

    // ============ Events ============
    event RandomnessRequested(uint256 indexed requestId, bytes32 indexed seed);
    event RandomnessReceived(uint256 indexed requestId, uint256 randomValue);
    event ValidatorSelected(bytes32 indexed requestHash, address indexed validator);

    // ============ Errors ============
    error RandomnessNotAvailable(uint256 requestId);
    error InvalidCandidateList();
    error NoCandidatesProvided();
    error WeightsMismatch(uint256 candidateCount, uint256 weightCount);
    error DRBRequestFailed();
    error ValidatorAlreadySelected(bytes32 requestHash);

    // ============ Initializer ============

    function initialize(
        address admin_,
        address drbContract_
    ) external initializer {
        __AccessControl_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(UPGRADER_ROLE, admin_);
        _grantRole(VALIDATOR_SELECTOR_ROLE, admin_);

        drbContract = drbContract_;
    }

    // ============ Randomness Functions ============

    /// @notice Request randomness from DRB
    /// @param seed Application-specific seed
    /// @return requestId The DRB request identifier
    function requestRandomness(bytes32 seed) external onlyRole(VALIDATOR_SELECTOR_ROLE) returns (uint256 requestId) {
        (bool success, bytes memory data) = drbContract.call(
            abi.encodeWithSignature("requestRandomness(bytes32)", seed)
        );
        if (!success) revert DRBRequestFailed();
        requestId = abi.decode(data, (uint256));
        emit RandomnessRequested(requestId, seed);
    }

    /// @notice Get randomness for a completed request
    /// @param requestId The DRB request identifier
    /// @return randomValue The generated random value
    function getRandomness(uint256 requestId) external view returns (uint256 randomValue) {
        (bool success, bytes memory data) = drbContract.staticcall(
            abi.encodeWithSignature("getRandomness(uint256)", requestId)
        );
        if (!success || data.length < 32) revert RandomnessNotAvailable(requestId);
        randomValue = abi.decode(data, (uint256));
    }

    /// @notice Check if randomness is available
    /// @param requestId The DRB request identifier
    /// @return True if randomness has been generated
    function isRandomnessAvailable(uint256 requestId) external view returns (bool) {
        (bool success, bytes memory data) = drbContract.staticcall(
            abi.encodeWithSignature("isRandomnessAvailable(uint256)", requestId)
        );
        if (!success) return false;
        return abi.decode(data, (bool));
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
    /// @param requestHash The validation request hash
    /// @param candidates Array of candidate validators
    /// @param stakes Array of candidate stakes (used as weights)
    /// @return drbRequestId The DRB request ID for tracking
    function requestValidatorSelection(
        bytes32 requestHash,
        address[] calldata candidates,
        uint256[] calldata stakes
    ) external onlyRole(VALIDATOR_SELECTOR_ROLE) returns (uint256 drbRequestId) {
        if (candidates.length == 0) revert NoCandidatesProvided();
        if (candidates.length != stakes.length) {
            revert WeightsMismatch(candidates.length, stakes.length);
        }
        if (selectedValidators[requestHash] != address(0)) {
            revert ValidatorAlreadySelected(requestHash);
        }

        // Create seed from request hash
        bytes32 seed = keccak256(abi.encodePacked(requestHash, block.number));

        // Request randomness from DRB
        (bool success, bytes memory data) = drbContract.call(
            abi.encodeWithSignature("requestRandomness(bytes32)", seed)
        );
        if (!success) revert DRBRequestFailed();
        drbRequestId = abi.decode(data, (uint256));

        drbRequestIds[requestHash] = drbRequestId;
        requestHashByDRBId[drbRequestId] = requestHash;

        emit RandomnessRequested(drbRequestId, seed);
    }

    /// @notice Finalize validator selection after randomness is available
    /// @param requestHash The validation request hash
    /// @param candidates Array of candidate validators (must match original request)
    /// @param stakes Array of candidate stakes
    /// @return selected The selected validator
    function finalizeValidatorSelection(
        bytes32 requestHash,
        address[] calldata candidates,
        uint256[] calldata stakes
    ) external onlyRole(VALIDATOR_SELECTOR_ROLE) returns (address selected) {
        uint256 drbRequestId = drbRequestIds[requestHash];

        // Get randomness from DRB
        (bool success, bytes memory data) = drbContract.staticcall(
            abi.encodeWithSignature("getRandomness(uint256)", drbRequestId)
        );
        if (!success || data.length < 32) revert RandomnessNotAvailable(drbRequestId);
        uint256 randomValue = abi.decode(data, (uint256));

        // Select validator using weighted random selection
        selected = this.selectFromWeightedList(candidates, stakes, randomValue);
        selectedValidators[requestHash] = selected;

        emit ValidatorSelected(requestHash, selected);
    }

    /// @notice Get the selected validator for a request
    function getSelectedValidator(bytes32 requestHash) external view returns (address) {
        return selectedValidators[requestHash];
    }

    // ============ Admin Functions ============

    function setDRBContract(address drbContract_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        drbContract = drbContract_;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}
