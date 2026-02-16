// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/ITALValidationRegistry.sol";
import "./WSTONVault.sol";

/**
 * @title TALValidationRegistry
 * @notice Tokamak Agent Layer validation registry for AI agent task validation
 * @dev Implements ERC-8004 + TAL extensions
 *      with multiple validation models, epoch-based stats, dual staking,
 *      and automated slashing.
 *
 * @author Tokamak AI Layer
 * @custom:security-contact security@tokamak.ai
 *
 * Features:
 * - ERC-8004 compliant validation request and submission
 * - Multiple validation models: StakeSecured, TEEAttested, Hybrid
 *   (ReputationOnly is REJECTED)
 * - DRB-based validator selection for fair assignment
 * - TEE attestation verification with trusted provider whitelisting
 * - Bounty distribution with configurable fee splits
 * - Dispute mechanism for challenging validation results
 * - Epoch-based validation stats (30-day epochs)
 * - Dual-staking: agent owner must have >= 1000 TON staked for StakeSecured/Hybrid
 * - Automated slashing for incorrect computation (score < 50 -> 50% agent owner stake)
 * - Permissionless slashing for missed deadlines (10% of validator operator stake)
 * - WSTONVault integration for stake verification and slashing
 *
 * Architecture:
 * - Uses UUPS proxy pattern for upgradeability
 * - Role-based access control for administrative functions
 * - Pausable for emergency situations
 * - ReentrancyGuard for protection against reentrancy attacks
 */
contract TALValidationRegistry is
    AccessControlUpgradeable,
    UUPSUpgradeable,
    PausableUpgradeable,
    ReentrancyGuard,
    ITALValidationRegistry
{
    // ============ Constants ============

    /// @notice Role for upgrading the contract implementation
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    /// @notice Role for pausing/unpausing the contract
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice Role for managing TEE providers
    bytes32 public constant TEE_MANAGER_ROLE = keccak256("TEE_MANAGER_ROLE");

    /// @notice Role for resolving disputes
    bytes32 public constant DISPUTE_RESOLVER_ROLE = keccak256("DISPUTE_RESOLVER_ROLE");

    /// @notice Role for DRB integration (validator selection)
    bytes32 public constant DRB_ROLE = keccak256("DRB_ROLE");

    /// @notice Minimum bounty for StakeSecured validation (10 TON)
    uint256 public constant override MIN_STAKE_SECURED_BOUNTY = 10 ether;

    /// @notice Minimum bounty for TEEAttested validation (1 TON)
    uint256 public constant override MIN_TEE_BOUNTY = 1 ether;

    /// @notice Protocol fee in basis points (10% = 1000 bps)
    uint256 public constant override PROTOCOL_FEE_BPS = 1000;

    /// @notice Agent reward in basis points (10% of remaining after protocol fee)
    uint256 public constant override AGENT_REWARD_BPS = 1000;

    /// @notice Validator reward in basis points (80% of remaining after protocol fee)
    uint256 public constant override VALIDATOR_REWARD_BPS = 8000;

    /// @notice Maximum score value (100)
    uint8 public constant MAX_SCORE = 100;

    /// @notice Basis points denominator (10000 = 100%)
    uint256 public constant BPS_DENOMINATOR = 10000;

    /// @notice Duration of each stats epoch (30 days)
    uint256 public constant EPOCH_DURATION = 30 days;

    /// @notice Score threshold below which a validation counts as "failed"
    uint8 public constant FAILURE_SCORE_THRESHOLD = 50;

    /// @notice Minimum stake required for an agent owner (1000 TON)
    uint256 public constant MIN_AGENT_OWNER_STAKE = 1000 ether;

    /// @notice Minimum operator stake required for validators (1000 TON)
    uint256 public constant MIN_OPERATOR_STAKE_V3 = 1000 ether;

    /// @notice Score threshold below which a computation is considered incorrect
    uint8 public constant INCORRECT_COMPUTATION_THRESHOLD = 50;

    /// @notice Slash percentage for missed validation deadline (10%)
    uint256 public constant SLASH_MISSED_DEADLINE_PCT = 10;

    /// @notice Slash percentage for incorrect computation (50%)
    uint256 public constant SLASH_INCORRECT_COMPUTATION_PCT = 50;

    // ============ State Variables ============

    /// @notice Identity registry address for agent validation
    address public identityRegistry;

    /// @notice Reputation registry address for reputation updates
    address public reputationRegistry;

    uint256 private __reserved_slot_2;

    uint256 private __reserved_slot_3;

    /// @notice DRB Integration Module address
    address public drbModule;

    /// @notice Protocol treasury address for fee collection
    address public treasury;

    /// @notice Validation request counter for unique IDs
    uint256 internal _requestNonce;

    /// @notice Validation requests mapping (requestHash => ValidationRequest)
    mapping(bytes32 => ValidationRequest) internal _requests;

    /// @notice Validation responses mapping (requestHash => ValidationResponse)
    mapping(bytes32 => ValidationResponse) internal _responses;

    /// @notice Selected validators mapping (requestHash => validator address)
    mapping(bytes32 => address) internal _selectedValidators;

    /// @notice Dispute status mapping (requestHash => isDisputed)
    mapping(bytes32 => bool) internal _disputeStatus;

    /// @notice Dispute evidence mapping (requestHash => evidence)
    mapping(bytes32 => bytes) internal _disputeEvidence;

    /// @notice Trusted TEE providers mapping (provider => isTrusted)
    mapping(address => bool) public trustedTEEProviders;

    /// @notice TEE enclave hashes mapping (provider => enclaveHash)
    mapping(address => bytes32) public teeEnclaveHashes;

    /// @notice DRB request IDs mapping (requestHash => drbRequestId)
    mapping(bytes32 => uint256) internal _drbRequestIds;

    /// @notice Array of trusted TEE providers for enumeration
    address[] internal _trustedTEEProviderList;

    /// @notice Index in trusted provider list (provider => index + 1, 0 means not in list)
    mapping(address => uint256) internal _trustedTEEProviderIndex;

    /// @notice Agent validations mapping (agentId => requestHashes)
    mapping(uint256 => bytes32[]) internal _agentValidations;

    /// @notice Requester validations mapping (requester => requestHashes)
    mapping(address => bytes32[]) internal _requesterValidations;

    /// @notice Validator validations mapping (validator => requestHashes)
    mapping(address => bytes32[]) internal _validatorValidations;

    /// @notice Pending validation count per agent (agentId => count)
    mapping(uint256 => uint256) internal _pendingValidationCount;

    /// @notice Configurable minimum bounty for StakeSecured (can be updated by admin)
    uint256 public minStakeSecuredBounty;

    /// @notice Configurable minimum bounty for TEE (can be updated by admin)
    uint256 public minTEEBounty;

    /// @notice Configurable protocol fee (can be updated by admin)
    uint256 public protocolFeeBps;

    // ============ Storage Gap ============

    /// @dev Reserved storage space for future upgrades
    uint256[40] internal __gap;

    /// @notice Total validations per agent per epoch
    /// agentId => epochNumber => count
    mapping(uint256 => mapping(uint256 => uint256)) internal _epochTotalValidations;

    /// @notice Failed validations per agent per epoch (score < FAILURE_SCORE_THRESHOLD)
    /// agentId => epochNumber => count
    mapping(uint256 => mapping(uint256 => uint256)) internal _epochFailedValidations;

    /// @dev V2 storage gap
    uint256[38] private __gapV2;

    /// @notice Tracks whether a request has already been slashed for missed deadline
    mapping(bytes32 => bool) internal _deadlineSlashExecuted;

    /// @notice WSTONVault address for stake verification and slashing
    address public wstonVault;

    /// @notice Pending ETH withdrawals for failed transfers (pull-payment pattern)
    mapping(address => uint256) public pendingWithdrawals;

    /// @notice Hash of candidates array stored during selectValidator for finalize verification
    mapping(bytes32 => bytes32) internal _candidatesHash;

    /// @dev V3 storage gap (reduced by 2 for new variables)
    uint256[34] private __gapV3;

    // ============ Events ============

    event ValidationStatsUpdated(
        uint256 indexed agentId,
        uint256 epoch,
        uint256 totalInEpoch,
        uint256 failedInEpoch
    );

    /// @notice Emitted when an ETH transfer fails and amount is stored for pull-withdrawal
    event WithdrawalPending(address indexed recipient, uint256 amount);

    /// @notice Emitted when a recipient withdraws their pending ETH
    event PendingWithdrawn(address indexed recipient, uint256 amount);

    /// @notice Emitted when a slashing attempt fails (e.g. insufficient locked balance)
    event SlashAttemptFailed(address indexed target, uint256 attemptedAmount);

    /// @notice Thrown when withdrawPending is called with zero balance
    error NoPendingWithdrawal();

    /// @notice Thrown when finalizeValidatorSelection candidates don't match original
    error CandidatesMismatch();

    // ============ Initializer ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract
     * @dev Sets up roles and external contract references
     * @param admin The admin address that receives all initial roles
     * @param _identityRegistry The identity registry address for agent validation
     * @param _reputationRegistry The reputation registry address
     * @param _treasury The treasury address for protocol fees
     */
    function initialize(
        address admin,
        address _identityRegistry,
        address _reputationRegistry,
        address _treasury
    ) public initializer {
        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(TEE_MANAGER_ROLE, admin);
        _grantRole(DISPUTE_RESOLVER_ROLE, admin);
        _grantRole(DRB_ROLE, admin);

        identityRegistry = _identityRegistry;
        reputationRegistry = _reputationRegistry;
        treasury = _treasury;

        // Initialize configurable parameters with defaults
        minStakeSecuredBounty = MIN_STAKE_SECURED_BOUNTY;
        minTEEBounty = MIN_TEE_BOUNTY;
        protocolFeeBps = PROTOCOL_FEE_BPS;

        _requestNonce = 1; // Start from 1
    }

    // ============ ERC-8004 Validation Functions ============

    /**
     * @inheritdoc IERC8004ValidationRegistry
     * @dev Creates a validation request. ReputationOnly is REJECTED.
     *      For StakeSecured/Hybrid, the agent owner must have >= MIN_AGENT_OWNER_STAKE staked.
     */
    function requestValidation(
        uint256 agentId,
        bytes32 taskHash,
        bytes32 outputHash,
        ValidationModel model,
        uint256 deadline
    ) external payable override whenNotPaused nonReentrant returns (bytes32 requestHash) {
        // Reject ReputationOnly model
        if (model == ValidationModel.ReputationOnly) {
            revert ReputationOnlyNoValidationNeeded();
        }

        // Validate deadline is in the future
        if (deadline <= block.timestamp) {
            revert DeadlineInPast(deadline);
        }

        // Validate agent exists
        _validateAgent(agentId);

        // Enforce dual-staking for StakeSecured/Hybrid
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
     * @inheritdoc IERC8004ValidationRegistry
     * @dev Submits validation result. Includes epoch stats and incorrect computation slashing.
     */
    function submitValidation(
        bytes32 requestHash,
        uint8 score,
        bytes calldata proof,
        string calldata detailsURI
    ) external override whenNotPaused nonReentrant {
        ValidationRequest storage request = _requests[requestHash];

        // Validate request exists
        if (request.requester == address(0)) {
            revert ValidationNotFound(requestHash);
        }

        // Validate not already completed
        if (request.status == ValidationStatus.Completed) {
            revert ValidationAlreadyCompleted(requestHash);
        }

        // Validate not expired
        if (block.timestamp > request.deadline) {
            request.status = ValidationStatus.Expired;
            revert ValidationExpired(requestHash);
        }

        // Validate score range
        if (score > MAX_SCORE) {
            revert InvalidScore(score);
        }

        // Model-specific validation (ReputationOnly branch removed - unreachable due to requestValidation guard)
        if (request.model == ValidationModel.StakeSecured) {
            address selectedValidator = _selectedValidators[requestHash];
            if (selectedValidator != address(0) && selectedValidator != msg.sender) {
                revert NotSelectedValidator(requestHash, msg.sender);
            }
            _verifyValidatorStake(msg.sender);
        } else if (request.model == ValidationModel.TEEAttested) {
            _verifyTEEAttestation(proof, requestHash);
        } else if (request.model == ValidationModel.Hybrid) {
            address selectedValidator = _selectedValidators[requestHash];
            if (selectedValidator != address(0) && selectedValidator != msg.sender) {
                revert NotSelectedValidator(requestHash, msg.sender);
            }
            _verifyValidatorStake(msg.sender);
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

        // Epoch stats tracking
        _recordValidationStats(request.agentId, score);

        // Automated slashing for incorrect computation
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

    /**
     * @inheritdoc IERC8004ValidationRegistry
     * @dev Returns validation request and response data
     */
    function getValidation(bytes32 requestHash)
        external
        view
        override
        returns (ValidationRequest memory request, ValidationResponse memory response)
    {
        request = _requests[requestHash];
        response = _responses[requestHash];
    }

    /**
     * @inheritdoc IERC8004ValidationRegistry
     * @dev Returns all validation request hashes for an agent
     */
    function getAgentValidations(uint256 agentId) external view override returns (bytes32[] memory) {
        return _agentValidations[agentId];
    }

    // ============ TAL Validator Selection ============

    /**
     * @inheritdoc ITALValidationRegistry
     * @dev Selects a validator using DRB for fair assignment.
     */
    function selectValidator(
        bytes32 requestHash,
        address[] calldata candidates
    ) external override onlyRole(DRB_ROLE) returns (address selectedValidator) {
        ValidationRequest storage request = _requests[requestHash];

        // Validate request exists
        if (request.requester == address(0)) {
            revert ValidationNotFound(requestHash);
        }

        // Validate request is pending
        if (request.status != ValidationStatus.Pending) {
            revert ValidationAlreadyCompleted(requestHash);
        }

        // Validate candidates array
        require(candidates.length > 0, "No candidates provided");

        uint256 randomSeed;

        if (drbModule != address(0)) {
            uint256[] memory stakes = _getCandidateStakes(candidates);
            (bool feeSuccess, bytes memory feeData) = drbModule.staticcall(
                abi.encodeWithSignature("estimateRequestFee(uint32)", uint32(100000))
            );
            uint256 estimatedFee = 0;
            if (feeSuccess && feeData.length >= 32) {
                estimatedFee = abi.decode(feeData, (uint256));
            }

            (bool success, bytes memory data) = drbModule.call{value: estimatedFee}(
                abi.encodeWithSignature(
                    "requestValidatorSelection(bytes32,address[],uint256[])",
                    requestHash, candidates, stakes
                )
            );
            if (success && data.length >= 32) {
                uint256 drbRound = abi.decode(data, (uint256));
                _drbRequestIds[requestHash] = drbRound;
            }
            randomSeed = uint256(keccak256(abi.encodePacked(blockhash(block.number - 1), requestHash)));
        } else {
            randomSeed = uint256(keccak256(abi.encodePacked(blockhash(block.number - 1), requestHash)));
        }

        uint256 selectedIndex = randomSeed % candidates.length;
        selectedValidator = candidates[selectedIndex];

        _selectedValidators[requestHash] = selectedValidator;
        _candidatesHash[requestHash] = keccak256(abi.encode(candidates));

        emit ValidatorSelected(requestHash, selectedValidator, randomSeed);

        return selectedValidator;
    }

    /**
     * @inheritdoc ITALValidationRegistry
     * @dev Returns the validator selected for a validation request
     */
    function getSelectedValidator(bytes32 requestHash) external view override returns (address) {
        return _selectedValidators[requestHash];
    }

    /**
     * @notice Finalize DRB-based validator selection after CommitReveal2 callback
     */
    function finalizeValidatorSelection(
        bytes32 requestHash,
        address[] calldata candidates,
        uint256[] calldata stakes
    ) external onlyRole(DRB_ROLE) whenNotPaused {
        require(_requests[requestHash].status == ValidationStatus.Pending, "Not pending");
        require(drbModule != address(0), "DRB module not set");

        // C-1 fix: Verify candidates match the original selectValidator call
        if (_candidatesHash[requestHash] != keccak256(abi.encode(candidates))) {
            revert CandidatesMismatch();
        }

        uint256 drbRound = _drbRequestIds[requestHash];
        require(drbRound > 0, "No DRB request");

        (bool checkSuccess, bytes memory checkData) = drbModule.staticcall(
            abi.encodeWithSignature("isRandomnessReceived(uint256)", drbRound)
        );
        require(checkSuccess && checkData.length >= 32, "Check failed");
        bool isReady = abi.decode(checkData, (bool));
        require(isReady, "DRB randomness not yet delivered via callback");

        (bool success, bytes memory data) = drbModule.call(
            abi.encodeWithSignature(
                "finalizeValidatorSelection(bytes32,address[],uint256[])",
                requestHash, candidates, stakes
            )
        );
        require(success && data.length >= 32, "Finalization failed");
        address selected = abi.decode(data, (address));
        _selectedValidators[requestHash] = selected;

        emit ValidatorSelected(requestHash, selected, drbRound);
    }

    // ============ TEE Attestation Management ============

    /**
     * @inheritdoc ITALValidationRegistry
     */
    function setTrustedTEEProvider(address provider) external override onlyRole(TEE_MANAGER_ROLE) {
        require(provider != address(0), "Invalid provider address");
        require(!trustedTEEProviders[provider], "Provider already trusted");

        trustedTEEProviders[provider] = true;
        _trustedTEEProviderList.push(provider);
        _trustedTEEProviderIndex[provider] = _trustedTEEProviderList.length;

        emit TEEProviderUpdated(provider, true);
    }

    /**
     * @inheritdoc ITALValidationRegistry
     */
    function removeTrustedTEEProvider(address provider) external override onlyRole(TEE_MANAGER_ROLE) {
        require(trustedTEEProviders[provider], "Provider not trusted");

        trustedTEEProviders[provider] = false;

        uint256 indexPlusOne = _trustedTEEProviderIndex[provider];
        if (indexPlusOne > 0) {
            uint256 index = indexPlusOne - 1;
            uint256 lastIndex = _trustedTEEProviderList.length - 1;

            if (index != lastIndex) {
                address lastProvider = _trustedTEEProviderList[lastIndex];
                _trustedTEEProviderList[index] = lastProvider;
                _trustedTEEProviderIndex[lastProvider] = indexPlusOne;
            }

            _trustedTEEProviderList.pop();
            _trustedTEEProviderIndex[provider] = 0;
        }

        emit TEEProviderUpdated(provider, false);
    }

    /**
     * @inheritdoc ITALValidationRegistry
     */
    function isTrustedTEEProvider(address provider) external view override returns (bool) {
        return trustedTEEProviders[provider];
    }

    /**
     * @inheritdoc ITALValidationRegistry
     */
    function getTrustedTEEProviders() external view override returns (address[] memory) {
        return _trustedTEEProviderList;
    }

    // ============ Dispute Handling ============

    /**
     * @inheritdoc ITALValidationRegistry
     */
    function disputeValidation(bytes32 requestHash, bytes calldata evidence) external override whenNotPaused {
        ValidationRequest storage request = _requests[requestHash];

        if (request.requester == address(0)) {
            revert ValidationNotFound(requestHash);
        }

        if (request.status != ValidationStatus.Completed) {
            revert ValidationNotFound(requestHash);
        }

        if (_disputeStatus[requestHash]) {
            revert DisputeAlreadyActive(requestHash);
        }

        bool isAuthorized = (msg.sender == request.requester);

        if (!isAuthorized && identityRegistry != address(0)) {
            (bool success, bytes memory result) = identityRegistry.staticcall(
                abi.encodeWithSignature("ownerOf(uint256)", request.agentId)
            );
            if (success && result.length >= 32) {
                address owner = abi.decode(result, (address));
                isAuthorized = (msg.sender == owner);
            }
        }

        // H-5 fix: Removed broad "any past validator" authorization.
        // Only requester, agent owner, and the selected validator for THIS request can dispute.
        if (!isAuthorized) {
            address selectedValidator = _selectedValidators[requestHash];
            if (selectedValidator == msg.sender) {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            revert NotAuthorizedToDispute(requestHash, msg.sender);
        }

        require(evidence.length > 0, "Evidence required");

        _disputeStatus[requestHash] = true;
        _disputeEvidence[requestHash] = evidence;
        request.status = ValidationStatus.Disputed;

        emit ValidationDisputed(requestHash, msg.sender);
    }

    /**
     * @inheritdoc ITALValidationRegistry
     * @dev Resolves a dispute. Tracks failure stats when dispute overturns.
     *      Uses WSTONVault for slashing.
     */
    function resolveDispute(bytes32 requestHash, bool upholdOriginal) external override onlyRole(DISPUTE_RESOLVER_ROLE) {
        ValidationRequest storage request = _requests[requestHash];

        if (!_disputeStatus[requestHash]) {
            revert ValidationNotFound(requestHash);
        }

        _disputeStatus[requestHash] = false;

        if (upholdOriginal) {
            request.status = ValidationStatus.Completed;
        } else {
            // Count as failure for the agent
            _recordDisputeFailure(request.agentId);

            address validator = _responses[requestHash].validator;

            // Slash via WSTONVault
            if (wstonVault != address(0) && validator != address(0)) {
                uint256 validatorStake = WSTONVault(wstonVault).getLockedBalance(validator);
                uint256 slashAmount = validatorStake > request.bounty ? request.bounty : validatorStake;
                if (slashAmount > 0) {
                    try WSTONVault(wstonVault).slash(validator, slashAmount) {
                    } catch {
                        emit SlashAttemptFailed(validator, slashAmount);
                    }
                }
            }

            request.status = ValidationStatus.Expired;

            // H-1 fix: Use pull-payment for safe refund
            if (request.bounty > 0) {
                _safeSendETH(request.requester, request.bounty);
            }
        }
    }

    /**
     * @inheritdoc ITALValidationRegistry
     */
    function isDisputed(bytes32 requestHash) external view override returns (bool) {
        return _disputeStatus[requestHash];
    }

    // ============ Missed Deadline Slashing ============

    /**
     * @inheritdoc ITALValidationRegistry
     * @dev Permissionless slashing for missed deadlines. Uses WSTONVault.
     */
    function slashForMissedDeadline(bytes32 requestHash) external override whenNotPaused nonReentrant {
        ValidationRequest storage request = _requests[requestHash];

        if (request.requester == address(0)) {
            revert ValidationNotFound(requestHash);
        }

        if (request.status != ValidationStatus.Pending) {
            revert ValidationAlreadyCompleted(requestHash);
        }

        if (block.timestamp <= request.deadline) {
            revert DeadlineNotPassed(requestHash);
        }

        if (request.model != ValidationModel.StakeSecured && request.model != ValidationModel.Hybrid) {
            revert NotSlashableModel(requestHash);
        }

        address operator = _selectedValidators[requestHash];
        if (operator == address(0)) {
            revert NoValidatorSelected(requestHash);
        }

        if (_deadlineSlashExecuted[requestHash]) {
            revert AlreadySlashedForDeadline(requestHash);
        }

        // Mark as expired
        request.status = ValidationStatus.Expired;

        // Decrement pending count
        if (_pendingValidationCount[request.agentId] > 0) {
            _pendingValidationCount[request.agentId]--;
        }

        _deadlineSlashExecuted[requestHash] = true;

        // Slash 10% of operator stake via WSTONVault
        if (wstonVault != address(0)) {
            uint256 operatorStake = WSTONVault(wstonVault).getLockedBalance(operator);
            uint256 slashAmount = (operatorStake * SLASH_MISSED_DEADLINE_PCT) / 100;

            if (slashAmount > 0) {
                try WSTONVault(wstonVault).slash(operator, slashAmount) {
                } catch {
                    emit SlashAttemptFailed(operator, slashAmount);
                }
            }
        }

        // H-1 fix: Use pull-payment for safe refund
        if (request.bounty > 0) {
            _safeSendETH(request.requester, request.bounty);
        }

        emit OperatorSlashedForDeadline(requestHash, operator);
    }

    // ============ View Functions ============

    /**
     * @notice Get validation stats for an agent within a time window
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

        if (windowSeconds > EPOCH_DURATION && epoch > 0) {
            total += _epochTotalValidations[agentId][epoch - 1];
            failed += _epochFailedValidations[agentId][epoch - 1];
        }
    }

    /**
     * @notice Get raw epoch stats for an agent
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

    // ============ Query Functions ============

    /// @inheritdoc ITALValidationRegistry
    function getValidationsByRequester(address requester) external view override returns (bytes32[] memory) {
        return _requesterValidations[requester];
    }

    /// @inheritdoc ITALValidationRegistry
    function getValidationsByValidator(address validator) external view override returns (bytes32[] memory) {
        return _validatorValidations[validator];
    }

    /// @inheritdoc ITALValidationRegistry
    function getPendingValidationCount(uint256 agentId) external view override returns (uint256) {
        return _pendingValidationCount[agentId];
    }

    /// @inheritdoc ITALValidationRegistry
    function getTreasury() external view override returns (address) {
        return treasury;
    }

    // ============ Admin Functions ============

    /// @inheritdoc ITALValidationRegistry
    function setTreasury(address _treasury) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_treasury != address(0), "Invalid treasury address");
        treasury = _treasury;
    }

    /// @inheritdoc ITALValidationRegistry
    function updateValidationParameters(
        uint256 _minStakeSecuredBounty,
        uint256 _minTEEBounty,
        uint256 _protocolFeeBps
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_protocolFeeBps <= BPS_DENOMINATOR, "Invalid protocol fee");

        minStakeSecuredBounty = _minStakeSecuredBounty;
        minTEEBounty = _minTEEBounty;
        protocolFeeBps = _protocolFeeBps;

        emit ValidationParametersUpdated(_minStakeSecuredBounty, _minTEEBounty, _protocolFeeBps);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function setIdentityRegistry(address _identityRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        identityRegistry = _identityRegistry;
    }

    function setReputationRegistry(address _reputationRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        reputationRegistry = _reputationRegistry;
    }

    /**
     * @notice Set the WSTONVault address for stake verification and slashing
     * @dev Only callable by DEFAULT_ADMIN_ROLE.
     * @param _wstonVault The WSTONVault contract address
     */
    function setWSTONVault(address _wstonVault) external onlyRole(DEFAULT_ADMIN_ROLE) {
        wstonVault = _wstonVault;
    }

    function setDRBModule(address _drbModule) external onlyRole(DEFAULT_ADMIN_ROLE) {
        drbModule = _drbModule;
    }

    function setTEEEnclaveHash(address provider, bytes32 enclaveHash) external onlyRole(TEE_MANAGER_ROLE) {
        require(trustedTEEProviders[provider], "Provider not trusted");
        teeEnclaveHashes[provider] = enclaveHash;
    }

    // ============ Internal Functions ============

    /**
     * @notice Verify validator has sufficient stake via WSTONVault
     */
    function _verifyValidatorStake(address validator) internal view {
        if (wstonVault != address(0)) {
            require(
                WSTONVault(wstonVault).isVerifiedOperator(validator),
                "Validator not verified: insufficient L1 stake"
            );
        }
    }

    function _validateAgent(uint256 agentId) internal view {
        if (identityRegistry == address(0)) return;

        (bool success, bytes memory result) = identityRegistry.staticcall(
            abi.encodeWithSignature("agentExists(uint256)", agentId)
        );
        if (!success || (result.length > 0 && !abi.decode(result, (bool)))) {
            revert ValidationNotFound(bytes32(agentId));
        }
    }

    function _validateBounty(ValidationModel model, uint256 bounty) internal view {
        if (model == ValidationModel.ReputationOnly) {
            return;
        } else if (model == ValidationModel.StakeSecured) {
            if (bounty < minStakeSecuredBounty) {
                revert InsufficientBounty(bounty, minStakeSecuredBounty);
            }
        } else if (model == ValidationModel.TEEAttested) {
            if (bounty < minTEEBounty) {
                revert InsufficientBounty(bounty, minTEEBounty);
            }
        } else if (model == ValidationModel.Hybrid) {
            uint256 requiredBounty = minStakeSecuredBounty > minTEEBounty ? minStakeSecuredBounty : minTEEBounty;
            if (bounty < requiredBounty) {
                revert InsufficientBounty(bounty, requiredBounty);
            }
        }
    }

    /**
     * @notice Validate dual-staking requirement for agent owner
     * @dev Uses WSTONVault for stake verification
     */
    function _validateDualStaking(uint256 agentId) internal view {
        if (identityRegistry == address(0)) return;
        if (wstonVault == address(0)) return;

        // Get agent owner
        (bool ownerSuccess, bytes memory ownerData) = identityRegistry.staticcall(
            abi.encodeWithSignature("ownerOf(uint256)", agentId)
        );
        if (!ownerSuccess || ownerData.length < 32) return;
        address ownerAddress = abi.decode(ownerData, (address));

        // Get owner's stake via WSTONVault
        uint256 ownerStake = WSTONVault(wstonVault).getLockedBalance(ownerAddress);

        if (ownerStake < MIN_AGENT_OWNER_STAKE) {
            revert InsufficientAgentOwnerStake(ownerAddress, ownerStake, MIN_AGENT_OWNER_STAKE);
        }
    }

    function _getCandidateStakes(address[] memory candidates) internal view returns (uint256[] memory stakes) {
        stakes = new uint256[](candidates.length);
        for (uint256 i = 0; i < candidates.length; i++) {
            if (wstonVault != address(0)) {
                stakes[i] = WSTONVault(wstonVault).getLockedBalance(candidates[i]);
            }
            if (stakes[i] == 0) stakes[i] = 1;
        }
    }

    function _verifyTEEAttestation(bytes calldata proof, bytes32 requestHash) internal view {
        if (proof.length < 128) {
            revert InvalidTEEAttestation();
        }

        (bytes32 enclaveHash, address teeSigner, uint256 timestamp, bytes memory sig) =
            abi.decode(proof, (bytes32, address, uint256, bytes));

        if (!trustedTEEProviders[teeSigner]) {
            revert TEEProviderNotTrusted(teeSigner);
        }

        if (teeEnclaveHashes[teeSigner] != enclaveHash) {
            revert InvalidTEEAttestation();
        }

        if (block.timestamp - timestamp > 1 hours) {
            revert InvalidTEEAttestation();
        }

        ValidationRequest storage req = _requests[requestHash];
        bytes32 messageHash = keccak256(abi.encodePacked(
            enclaveHash, req.taskHash, req.outputHash, requestHash, timestamp
        ));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));

        if (sig.length != 65) {
            revert InvalidTEEAttestation();
        }
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v < 27) v += 27;
        address recovered = ecrecover(ethSignedHash, v, r, s);

        if (recovered != teeSigner) {
            revert InvalidTEEAttestation();
        }
    }

    function _distributeBounty(
        bytes32 requestHash,
        ValidationRequest storage request,
        address validator
    ) internal {
        uint256 bounty = request.bounty;
        if (bounty == 0) return;

        uint256 treasuryAmount = (bounty * protocolFeeBps) / BPS_DENOMINATOR;
        uint256 remaining = bounty - treasuryAmount;
        uint256 agentAmount = (remaining * AGENT_REWARD_BPS) / BPS_DENOMINATOR;
        uint256 validatorAmount = remaining - agentAmount;

        address agentOwner = address(0);
        if (identityRegistry != address(0)) {
            (bool success, bytes memory result) = identityRegistry.staticcall(
                abi.encodeWithSignature("ownerOf(uint256)", request.agentId)
            );
            if (success && result.length >= 32) {
                agentOwner = abi.decode(result, (address));
            }
        }

        // C-2 fix: Use pull-payment pattern to prevent DoS via reverting recipients
        _safeSendETH(treasury, treasuryAmount);
        _safeSendETH(agentOwner, agentAmount);
        _safeSendETH(validator, validatorAmount);

        emit BountyDistributed(requestHash, validator, validatorAmount, agentAmount, treasuryAmount);
    }

    // ============ Stats Internal Functions ============

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

    // ============ Slashing Internal Functions ============

    /**
     * @notice Slash agent owner for incorrect computation via WSTONVault
     */
    function _slashAgentOwnerForIncorrectComputation(uint256 agentId, bytes32 requestHash) internal {
        if (identityRegistry == address(0)) return;

        // Get agent owner
        (bool ownerSuccess, bytes memory ownerData) = identityRegistry.staticcall(
            abi.encodeWithSignature("ownerOf(uint256)", agentId)
        );
        if (!ownerSuccess || ownerData.length < 32) return;
        address ownerAddress = abi.decode(ownerData, (address));

        // Get owner's stake and slash via WSTONVault
        if (wstonVault == address(0)) return;

        uint256 ownerStake = WSTONVault(wstonVault).getLockedBalance(ownerAddress);
        uint256 slashAmount = (ownerStake * SLASH_INCORRECT_COMPUTATION_PCT) / 100;
        if (slashAmount > 0) {
            // H-3 fix: Only emit AgentSlashed on successful slash
            try WSTONVault(wstonVault).slash(ownerAddress, slashAmount) {
                emit AgentSlashed(agentId, requestHash, slashAmount, SLASH_INCORRECT_COMPUTATION_PCT);
            } catch {
                emit SlashAttemptFailed(ownerAddress, slashAmount);
            }
        }
    }

    /**
     * @notice Send ETH with pull-payment fallback
     * @dev If direct transfer fails, stores amount in pendingWithdrawals for later claim
     */
    function _safeSendETH(address recipient, uint256 amount) internal {
        if (amount == 0 || recipient == address(0)) return;
        (bool success, ) = recipient.call{value: amount}("");
        if (!success) {
            pendingWithdrawals[recipient] += amount;
            emit WithdrawalPending(recipient, amount);
        }
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    // ============ Pull-Payment Functions ============

    /**
     * @notice Withdraw pending ETH from failed transfers
     * @dev Pull-payment pattern — recipients call this to claim ETH
     *      that couldn't be sent directly during bounty distribution or refunds
     */
    function withdrawPending() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NoPendingWithdrawal();
        pendingWithdrawals[msg.sender] = 0;
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
        emit PendingWithdrawn(msg.sender, amount);
    }

    // ============ Receive Function ============

    receive() external payable {}
}
