// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TALValidationRegistryV2.sol";

/**
 * @title TALValidationRegistryV3
 * @notice Upgraded validation registry with dual-staking enforcement and automated slashing
 * @dev UUPS upgrade of TALValidationRegistryV2. Inherits V2 (which inherits V1).
 *
 * V3 Additions:
 * - Reject ReputationOnly validation requests (no longer supported)
 * - Dual-staking: agent owner must have >= 1000 TON staked for StakeSecured/Hybrid
 * - Automated slashing for incorrect computation (score < 50 -> slash 50% of agent owner stake)
 * - Permissionless slashing for missed deadlines (10% of validator operator stake)
 *
 * Storage: V3 variables are placed after V2's __gapV2[38].
 * _deadlineSlashExecuted mapping consumes 1 slot declaration, leaving 37 for __gapV3.
 */
contract TALValidationRegistryV3 is TALValidationRegistryV2 {
    // ============ V3 Constants ============

    /// @notice Minimum stake required for an agent owner (1000 TON)
    uint256 public constant MIN_AGENT_OWNER_STAKE = 1000 ether;

    /// @notice Minimum operator stake required for validators in V3 (1000 TON)
    uint256 public constant MIN_OPERATOR_STAKE_V3 = 1000 ether;

    /// @notice Score threshold below which a computation is considered incorrect
    uint8 public constant INCORRECT_COMPUTATION_THRESHOLD = 50;

    /// @notice Slash percentage for missed validation deadline (10%)
    uint256 public constant SLASH_MISSED_DEADLINE_PCT = 10;

    /// @notice Slash percentage for incorrect computation (50%)
    uint256 public constant SLASH_INCORRECT_COMPUTATION_PCT = 50;

    // ============ V3 Storage ============

    /// @notice Tracks whether a request has already been slashed for missed deadline
    mapping(bytes32 => bool) internal _deadlineSlashExecuted;

    /// @dev V3 storage gap
    uint256[37] private __gapV3;

    // ============ V3 Events ============

    event V3Initialized();

    // ============ V3 Initializer ============

    /**
     * @notice V3 initializer -- called once after proxy upgrade
     */
    function initializeV3() external reinitializer(3) {
        emit V3Initialized();
    }

    // ============ V3 Overrides ============

    /**
     * @notice Request validation -- overrides V1 to reject ReputationOnly and enforce dual-staking
     * @dev For StakeSecured/Hybrid, the agent owner must have >= MIN_AGENT_OWNER_STAKE staked
     */
    function requestValidation(
        uint256 agentId,
        bytes32 taskHash,
        bytes32 outputHash,
        ValidationModel model,
        uint256 deadline
    ) external payable override whenNotPaused nonReentrant returns (bytes32 requestHash) {
        // V3: Reject ReputationOnly model
        if (model == ValidationModel.ReputationOnly) {
            revert ReputationOnlyNoValidationNeeded();
        }

        // Validate deadline is in the future
        if (deadline <= block.timestamp) {
            revert DeadlineInPast(deadline);
        }

        // Validate agent exists
        _validateAgent(agentId);

        // V3: Enforce dual-staking for StakeSecured/Hybrid
        if (model == ValidationModel.StakeSecured || model == ValidationModel.Hybrid) {
            _validateDualStaking(agentId);
        }

        // Validate bounty requirements based on model
        _validateBounty(model, msg.value);

        // Generate unique request hash
        requestHash = keccak256(
            abi.encodePacked(
                agentId,
                msg.sender,
                taskHash,
                outputHash,
                model,
                deadline,
                block.timestamp,
                _requestNonce++
            )
        );

        // Create validation request
        _requests[requestHash] = ValidationRequest({
            agentId: agentId,
            requester: msg.sender,
            taskHash: taskHash,
            outputHash: outputHash,
            model: model,
            bounty: msg.value,
            deadline: deadline,
            status: ValidationStatus.Pending
        });

        // Track validations
        _agentValidations[agentId].push(requestHash);
        _requesterValidations[msg.sender].push(requestHash);
        _pendingValidationCount[agentId]++;

        emit ValidationRequested(requestHash, agentId, model);

        return requestHash;
    }

    /**
     * @notice Submit validation result -- overrides V2 to add automated slashing for incorrect computation
     * @dev After V2 logic (store response, epoch stats), checks if score < INCORRECT_COMPUTATION_THRESHOLD
     *      and slashes 50% of the agent owner's stake for StakeSecured/Hybrid models
     */
    function submitValidation(
        bytes32 requestHash,
        uint8 score,
        bytes calldata proof,
        string calldata detailsURI
    ) external override whenNotPaused nonReentrant {
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

        // Model-specific validation (V3: ReputationOnly branch removed - unreachable due to requestValidation guard)
        if (request.model == ValidationModel.StakeSecured) {
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

        // --- V3 addition: automated slashing for incorrect computation ---
        if (
            score < INCORRECT_COMPUTATION_THRESHOLD &&
            (request.model == ValidationModel.StakeSecured || request.model == ValidationModel.Hybrid)
        ) {
            _slashAgentOwnerForIncorrectComputation(request.agentId, requestHash);
        }

        // Distribute bounty if applicable
        if (request.bounty > 0) {
            _distributeBounty(requestHash, request, msg.sender);
        }

        emit ValidationCompleted(requestHash, msg.sender, score);
    }

    // ============ V3 External Functions ============

    /**
     * @notice Slash a validator for missing a validation deadline (permissionless)
     * @dev Can be called by anyone after the deadline has passed.
     *      Slashes 10% of the selected validator's operator stake and refunds the bounty.
     * @param requestHash The validation request identifier
     */
    function slashForMissedDeadline(bytes32 requestHash) external override whenNotPaused nonReentrant {
        ValidationRequest storage request = _requests[requestHash];

        // Request must exist
        if (request.requester == address(0)) {
            revert ValidationNotFound(requestHash);
        }

        // Request must be Pending
        if (request.status != ValidationStatus.Pending) {
            revert ValidationAlreadyCompleted(requestHash);
        }

        // Deadline must have passed
        if (block.timestamp <= request.deadline) {
            revert DeadlineNotPassed(requestHash);
        }

        // Model must be StakeSecured or Hybrid
        if (request.model != ValidationModel.StakeSecured && request.model != ValidationModel.Hybrid) {
            revert NotSlashableModel(requestHash);
        }

        // A validator must have been selected
        address operator = _selectedValidators[requestHash];
        if (operator == address(0)) {
            revert NoValidatorSelected(requestHash);
        }

        // Must not have already been slashed for this deadline
        if (_deadlineSlashExecuted[requestHash]) {
            revert AlreadySlashedForDeadline(requestHash);
        }

        // Mark as expired
        request.status = ValidationStatus.Expired;

        // Decrement pending count
        if (_pendingValidationCount[request.agentId] > 0) {
            _pendingValidationCount[request.agentId]--;
        }

        // Mark as slashed for deadline
        _deadlineSlashExecuted[requestHash] = true;

        // Slash 10% of operator stake
        if (stakingBridge != address(0)) {
            (bool stakeSuccess, bytes memory stakeData) = stakingBridge.staticcall(
                abi.encodeWithSignature("getOperatorStake(address)", operator)
            );
            if (stakeSuccess && stakeData.length >= 32) {
                uint256 operatorStake = abi.decode(stakeData, (uint256));
                uint256 slashAmount = (operatorStake * SLASH_MISSED_DEADLINE_PCT) / 100;

                if (slashAmount > 0) {
                    bytes memory evidence = abi.encodePacked(
                        requestHash, "MISSED_DEADLINE"
                    );
                    (bool slashSuccess,) = stakingBridge.call(
                        abi.encodeWithSignature(
                            "requestSlashing(address,uint256,bytes)",
                            operator,
                            slashAmount,
                            evidence
                        )
                    );
                }
            }
        }

        // Refund bounty to requester
        if (request.bounty > 0) {
            (bool refundSuccess,) = request.requester.call{value: request.bounty}("");
        }

        emit OperatorSlashedForDeadline(requestHash, operator);
    }

    // ============ V3 Internal Functions ============

    /**
     * @notice Validate dual-staking requirement for agent owner
     * @dev Checks that the agent owner has >= MIN_AGENT_OWNER_STAKE staked via the bridge
     * @param agentId The agent ID to validate
     */
    function _validateDualStaking(uint256 agentId) internal view {
        if (identityRegistry == address(0) || stakingBridge == address(0)) return;

        // Get agent owner
        (bool ownerSuccess, bytes memory ownerData) = identityRegistry.staticcall(
            abi.encodeWithSignature("ownerOf(uint256)", agentId)
        );
        if (!ownerSuccess || ownerData.length < 32) return;
        address ownerAddress = abi.decode(ownerData, (address));

        // Get owner's stake
        (bool stakeSuccess, bytes memory stakeData) = stakingBridge.staticcall(
            abi.encodeWithSignature("getOperatorStake(address)", ownerAddress)
        );
        if (!stakeSuccess || stakeData.length < 32) return;
        uint256 ownerStake = abi.decode(stakeData, (uint256));

        if (ownerStake < MIN_AGENT_OWNER_STAKE) {
            revert InsufficientAgentOwnerStake(ownerAddress, ownerStake, MIN_AGENT_OWNER_STAKE);
        }
    }

    /**
     * @notice Slash agent owner for incorrect computation
     * @dev Called when validation score < INCORRECT_COMPUTATION_THRESHOLD for StakeSecured/Hybrid
     *      Slashes 50% of the agent owner's stake
     * @param agentId The agent ID
     * @param requestHash The validation request hash (for evidence)
     */
    function _slashAgentOwnerForIncorrectComputation(uint256 agentId, bytes32 requestHash) internal {
        if (identityRegistry == address(0) || stakingBridge == address(0)) return;

        // Get agent owner
        (bool ownerSuccess, bytes memory ownerData) = identityRegistry.staticcall(
            abi.encodeWithSignature("ownerOf(uint256)", agentId)
        );
        if (!ownerSuccess || ownerData.length < 32) return;
        address ownerAddress = abi.decode(ownerData, (address));

        // Get owner's stake
        (bool stakeSuccess, bytes memory stakeData) = stakingBridge.staticcall(
            abi.encodeWithSignature("getOperatorStake(address)", ownerAddress)
        );
        if (!stakeSuccess || stakeData.length < 32) return;
        uint256 ownerStake = abi.decode(stakeData, (uint256));

        // Calculate slash amount (50% of owner stake)
        uint256 slashAmount = (ownerStake * SLASH_INCORRECT_COMPUTATION_PCT) / 100;

        if (slashAmount > 0) {
            bytes memory evidence = abi.encodePacked(
                requestHash, "INCORRECT_COMPUTATION"
            );
            (bool slashSuccess,) = stakingBridge.call(
                abi.encodeWithSignature(
                    "requestSlashing(address,uint256,bytes)",
                    ownerAddress,
                    slashAmount,
                    evidence
                )
            );

            emit AgentSlashed(agentId, requestHash, slashAmount, SLASH_INCORRECT_COMPUTATION_PCT);
        }
    }
}
