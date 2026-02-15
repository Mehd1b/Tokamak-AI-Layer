// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TALValidationRegistry.sol";

/**
 * @title TALValidationRegistryV2
 * @notice Upgraded validation registry with epoch-based validation stats tracking
 * @dev UUPS upgrade of TALValidationRegistry. Inherits V1 and overrides
 *      submitValidation/resolveDispute to maintain per-agent epoch counters.
 *
 * V2 Additions:
 * - Epoch-based validation stats (30-day epochs)
 * - getAgentValidationStats(agentId, windowSeconds) for IdentityRegistryV2 slashing
 * - Configurable failure score threshold
 *
 * Storage: V2 variables are placed after V1's __gap[40]. The gap is NOT consumed
 * because V2 inherits V1 (Solidity places derived storage after base storage).
 * V1's gap remains reserved for future V1-level additions.
 */
contract TALValidationRegistryV2 is TALValidationRegistry {
    // ============ V2 Constants ============

    /// @notice Duration of each stats epoch (30 days)
    uint256 public constant EPOCH_DURATION = 30 days;

    /// @notice Score threshold below which a validation counts as "failed"
    uint8 public constant FAILURE_SCORE_THRESHOLD = 50;

    // ============ V2 Storage ============

    /// @notice Total validations per agent per epoch
    /// agentId => epochNumber => count
    mapping(uint256 => mapping(uint256 => uint256)) internal _epochTotalValidations;

    /// @notice Failed validations per agent per epoch (score < FAILURE_SCORE_THRESHOLD)
    /// agentId => epochNumber => count
    mapping(uint256 => mapping(uint256 => uint256)) internal _epochFailedValidations;

    /// @dev V2 storage gap
    uint256[38] private __gapV2;

    // ============ V2 Events ============

    event ValidationStatsUpdated(
        uint256 indexed agentId,
        uint256 epoch,
        uint256 totalInEpoch,
        uint256 failedInEpoch
    );
    event V2Initialized();

    // ============ V2 Initializer ============

    /**
     * @notice V2 initializer — called once after proxy upgrade
     */
    function initializeV2() external reinitializer(2) {
        emit V2Initialized();
    }

    // ============ V2 Overrides ============

    /**
     * @notice Submit validation result — overrides V1 to track epoch stats
     * @dev Replicates V1 logic and adds epoch counter updates after completion
     */
    function submitValidation(
        bytes32 requestHash,
        uint8 score,
        bytes calldata proof,
        string calldata detailsURI
    ) external virtual override whenNotPaused nonReentrant {
        ValidationRequest storage request = _requests[requestHash];

        // --- V1 validation logic (replicated) ---

        if (request.requester == address(0)) {
            revert ValidationNotFound(requestHash);
        }

        if (request.status == ValidationStatus.Completed) {
            revert ValidationAlreadyCompleted(requestHash);
        }

        if (block.timestamp > request.deadline) {
            request.status = ValidationStatus.Expired;
            revert ValidationExpired(requestHash);
        }

        if (score > MAX_SCORE) {
            revert InvalidScore(score);
        }

        // Model-specific validation
        if (request.model == ValidationModel.ReputationOnly) {
            // No additional validation
        } else if (request.model == ValidationModel.StakeSecured) {
            address selectedValidator = _selectedValidators[requestHash];
            if (selectedValidator != address(0) && selectedValidator != msg.sender) {
                revert NotSelectedValidator(requestHash, msg.sender);
            }
            if (stakingBridge != address(0)) {
                (bool success, bytes memory data) = stakingBridge.staticcall(
                    abi.encodeWithSignature("isVerifiedOperator(address)", msg.sender)
                );
                if (success && data.length >= 32) {
                    bool isVerified = abi.decode(data, (bool));
                    require(isVerified, "Validator not verified: insufficient L1 stake");
                }
            }
        } else if (request.model == ValidationModel.TEEAttested) {
            _verifyTEEAttestation(proof, requestHash);
        } else if (request.model == ValidationModel.Hybrid) {
            address selectedValidator = _selectedValidators[requestHash];
            if (selectedValidator != address(0) && selectedValidator != msg.sender) {
                revert NotSelectedValidator(requestHash, msg.sender);
            }
            if (stakingBridge != address(0)) {
                (bool success, bytes memory data) = stakingBridge.staticcall(
                    abi.encodeWithSignature("isVerifiedOperator(address)", msg.sender)
                );
                if (success && data.length >= 32) {
                    bool isVerified = abi.decode(data, (bool));
                    require(isVerified, "Validator not verified: insufficient L1 stake");
                }
            }
            _verifyTEEAttestation(proof, requestHash);
        }

        // Store response
        _responses[requestHash] = ValidationResponse({
            validator: msg.sender,
            score: score,
            proof: proof,
            detailsURI: detailsURI,
            timestamp: block.timestamp
        });

        // Update request status
        request.status = ValidationStatus.Completed;

        // Update pending count
        if (_pendingValidationCount[request.agentId] > 0) {
            _pendingValidationCount[request.agentId]--;
        }

        // Track validator's validations
        _validatorValidations[msg.sender].push(requestHash);

        // --- V2 addition: epoch stats tracking ---
        _recordValidationStats(request.agentId, score);

        // Distribute bounty if applicable
        if (request.bounty > 0) {
            _distributeBounty(requestHash, request, msg.sender);
        }

        emit ValidationCompleted(requestHash, msg.sender, score);
    }

    /**
     * @notice Resolve dispute — overrides V1 to track failure stats when dispute overturns
     */
    function resolveDispute(
        bytes32 requestHash,
        bool upholdOriginal
    ) external override onlyRole(DISPUTE_RESOLVER_ROLE) {
        ValidationRequest storage request = _requests[requestHash];

        if (!_disputeStatus[requestHash]) {
            revert ValidationNotFound(requestHash);
        }

        _disputeStatus[requestHash] = false;

        if (upholdOriginal) {
            request.status = ValidationStatus.Completed;
        } else {
            // Validation overturned — count as failure for the agent
            _recordDisputeFailure(request.agentId);

            address validator = _responses[requestHash].validator;

            // Request slashing via bridge
            if (stakingBridge != address(0) && validator != address(0)) {
                bytes memory evidence = abi.encodePacked(requestHash, "DISPUTE_UPHELD");
                (bool success,) = stakingBridge.call(
                    abi.encodeWithSignature(
                        "requestSlashing(address,uint256,bytes)",
                        validator,
                        request.bounty,
                        evidence
                    )
                );
            }

            request.status = ValidationStatus.Expired;

            if (request.bounty > 0) {
                (bool refundSuccess,) = request.requester.call{value: request.bounty}("");
            }
        }
    }

    // ============ V2 View Functions ============

    /**
     * @notice Get validation stats for an agent within a time window
     * @dev Used by TALIdentityRegistryV2.checkAndSlash() for slashing decisions.
     *      Uses epoch-based counters. For windowSeconds <= 30 days, returns
     *      current epoch stats. For larger windows, sums current + previous epoch.
     * @param agentId The agent ID
     * @param windowSeconds The time window in seconds (typically 30 days)
     * @return total Total completed validations in window
     * @return failed Failed validations in window (score < FAILURE_SCORE_THRESHOLD)
     */
    function getAgentValidationStats(
        uint256 agentId,
        uint256 windowSeconds
    ) external view returns (uint256 total, uint256 failed) {
        uint256 epoch = block.timestamp / EPOCH_DURATION;

        total = _epochTotalValidations[agentId][epoch];
        failed = _epochFailedValidations[agentId][epoch];

        // For windows > 1 epoch, include the previous epoch
        if (windowSeconds > EPOCH_DURATION && epoch > 0) {
            total += _epochTotalValidations[agentId][epoch - 1];
            failed += _epochFailedValidations[agentId][epoch - 1];
        }
    }

    /**
     * @notice Get raw epoch stats for an agent
     * @param agentId The agent ID
     * @param epoch The epoch number (block.timestamp / EPOCH_DURATION)
     * @return total Total validations in epoch
     * @return failed Failed validations in epoch
     */
    function getEpochStats(
        uint256 agentId,
        uint256 epoch
    ) external view returns (uint256 total, uint256 failed) {
        total = _epochTotalValidations[agentId][epoch];
        failed = _epochFailedValidations[agentId][epoch];
    }

    /**
     * @notice Get the current epoch number
     */
    function currentEpoch() external view returns (uint256) {
        return block.timestamp / EPOCH_DURATION;
    }

    // ============ V2 Internal Functions ============

    /**
     * @notice Record validation stats for an agent
     * @param agentId The agent ID
     * @param score The validation score (0-100)
     */
    function _recordValidationStats(uint256 agentId, uint8 score) internal {
        uint256 epoch = block.timestamp / EPOCH_DURATION;

        _epochTotalValidations[agentId][epoch]++;

        if (score < FAILURE_SCORE_THRESHOLD) {
            _epochFailedValidations[agentId][epoch]++;
        }

        emit ValidationStatsUpdated(
            agentId,
            epoch,
            _epochTotalValidations[agentId][epoch],
            _epochFailedValidations[agentId][epoch]
        );
    }

    /**
     * @notice Record a dispute-overturned failure for an agent
     * @dev Called when a dispute is resolved against the original validation.
     *      Increments the failed counter without incrementing total
     *      (the original submitValidation already counted the total).
     * @param agentId The agent ID
     */
    function _recordDisputeFailure(uint256 agentId) internal {
        uint256 epoch = block.timestamp / EPOCH_DURATION;
        _epochFailedValidations[agentId][epoch]++;

        emit ValidationStatsUpdated(
            agentId,
            epoch,
            _epochTotalValidations[agentId][epoch],
            _epochFailedValidations[agentId][epoch]
        );
    }
}
