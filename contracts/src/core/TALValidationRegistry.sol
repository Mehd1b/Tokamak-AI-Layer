// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/ITALValidationRegistry.sol";

/**
 * @title TALValidationRegistry
 * @notice Tokamak Agent Layer validation registry for AI agent task validation
 * @dev Implements ERC-8004 + TAL extensions with multiple validation models
 *
 * @author Tokamak AI Layer
 * @custom:security-contact security@tokamak.ai
 *
 * This contract serves as the central validation system for AI agents:
 * - ERC-8004 compliant validation request and submission
 * - Multiple validation models: ReputationOnly, StakeSecured, TEEAttested, Hybrid
 * - DRB-based validator selection for fair assignment (Sprint 2)
 * - TEE attestation verification with trusted provider whitelisting
 * - Bounty distribution with configurable fee splits
 * - Dispute mechanism for challenging validation results
 *
 * Sprint 1 Focus:
 * - ReputationOnly validation model (fully functional)
 * - Basic TEE provider management
 * - Placeholder for DRB integration
 *
 * Sprint 2 Additions:
 * - StakeSecured and TEEAttested validation models
 * - Full DRB integration with Commit-Reveal²
 * - Complete bounty distribution
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

    // ============ State Variables ============

    /// @notice Identity registry address for agent validation
    address public identityRegistry;

    /// @notice Reputation registry address for reputation updates
    address public reputationRegistry;

    /// @notice Staking bridge contract address for stake verification (L2 cache of L1 Staking V3)
    address public stakingBridge;

    /// @notice DRB (Decentralized Random Beacon) contract address
    address public drbContract;

    /// @notice DRB Integration Module address (Sprint 2)
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

    /// @notice TEE enclave hashes mapping (provider => enclaveHash) - Sprint 2
    mapping(address => bytes32) public teeEnclaveHashes;

    /// @notice DRB request IDs mapping (requestHash => drbRequestId) - Sprint 2
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
     * @dev Creates a validation request for an agent's task execution.
     * For Sprint 1, only ReputationOnly model is fully supported.
     * StakeSecured and TEEAttested will be added in Sprint 2.
     */
    function requestValidation(
        uint256 agentId,
        bytes32 taskHash,
        bytes32 outputHash,
        ValidationModel model,
        uint256 deadline
    ) external payable virtual override whenNotPaused nonReentrant returns (bytes32 requestHash) {
        // Validate deadline is in the future
        if (deadline <= block.timestamp) {
            revert DeadlineInPast(deadline);
        }

        // Validate agent exists
        _validateAgent(agentId);

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
     * @dev Submits validation result for a pending request.
     * For ReputationOnly model, any address can submit.
     * For StakeSecured/TEEAttested, only selected validator can submit (Sprint 2).
     */
    function submitValidation(
        bytes32 requestHash,
        uint8 score,
        bytes calldata proof,
        string calldata detailsURI
    ) external virtual override whenNotPaused nonReentrant {
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

        // Model-specific validation
        if (request.model == ValidationModel.ReputationOnly) {
            // ReputationOnly: Any address can submit validation
            // No additional validation required for Sprint 1
        } else if (request.model == ValidationModel.StakeSecured) {
            // StakeSecured: Only selected validator can submit
            address selectedValidator = _selectedValidators[requestHash];
            if (selectedValidator != address(0) && selectedValidator != msg.sender) {
                revert NotSelectedValidator(requestHash, msg.sender);
            }
            // Sprint 2: Verify validator has sufficient stake via bridge
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
            // TEEAttested: Verify TEE attestation
            _verifyTEEAttestation(proof, requestHash);
        } else if (request.model == ValidationModel.Hybrid) {
            // Hybrid: Both validator selection and TEE attestation required
            address selectedValidator = _selectedValidators[requestHash];
            if (selectedValidator != address(0) && selectedValidator != msg.sender) {
                revert NotSelectedValidator(requestHash, msg.sender);
            }
            // Sprint 2: Verify validator has sufficient stake via bridge
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
     * Sprint 1: Basic implementation using blockhash-based randomness.
     * Sprint 2: Full DRB integration with Commit-Reveal² mechanism.
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

        // Sprint 2: Integrate with DRB module for fair validator selection
        // DRB uses a callback model (Commit-Reveal²):
        // 1. requestValidatorSelection() sends request to CommitReveal2 (async)
        // 2. CommitReveal2 delivers randomness via rawFulfillRandomNumber callback
        // 3. finalizeValidatorSelection() uses delivered randomness for weighted selection
        uint256 randomSeed;

        // Try DRB module first for stake-weighted selection (async path)
        if (drbModule != address(0)) {
            // Estimate the DRB fee and request randomness via callback pattern
            uint256[] memory stakes = _getCandidateStakes(candidates);
            (bool feeSuccess, bytes memory feeData) = drbModule.staticcall(
                abi.encodeWithSignature("estimateRequestFee(uint32)", uint32(100000))
            );
            uint256 estimatedFee = 0;
            if (feeSuccess && feeData.length >= 32) {
                estimatedFee = abi.decode(feeData, (uint256));
            }

            // Request DRB randomness (payable call to DRB module)
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
            // For immediate selection, use blockhash as fallback
            // The DRB-based selection can be finalized via finalizeValidatorSelection()
            // once the CommitReveal2 callback delivers the random number
            randomSeed = uint256(keccak256(abi.encodePacked(blockhash(block.number - 1), requestHash)));
        } else {
            // Fallback: blockhash-based randomness (not secure for production)
            // In production, DRB module MUST be configured for fair selection
            randomSeed = uint256(keccak256(abi.encodePacked(blockhash(block.number - 1), requestHash)));
        }

        // Select validator based on random seed
        uint256 selectedIndex = randomSeed % candidates.length;
        selectedValidator = candidates[selectedIndex];

        // Store selected validator
        _selectedValidators[requestHash] = selectedValidator;

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
     * @dev Sprint 2: Called after the DRB's rawFulfillRandomNumber callback has delivered
     *      the random number to the DRBIntegrationModule. The module stores the randomness
     *      and this function uses it for stake-weighted validator selection.
     *
     *      Flow: requestValidatorSelection() → CommitReveal2 callback → finalizeValidatorSelection()
     *
     * @param requestHash The validation request hash
     * @param candidates The candidate validators (must match original request)
     * @param stakes The candidate stake amounts
     */
    function finalizeValidatorSelection(
        bytes32 requestHash,
        address[] calldata candidates,
        uint256[] calldata stakes
    ) external whenNotPaused {
        require(_requests[requestHash].status == ValidationStatus.Pending, "Not pending");
        require(drbModule != address(0), "DRB module not set");

        uint256 drbRound = _drbRequestIds[requestHash];
        require(drbRound > 0, "No DRB request");

        // Check if randomness has been delivered via DRB callback
        (bool checkSuccess, bytes memory checkData) = drbModule.staticcall(
            abi.encodeWithSignature("isRandomnessReceived(uint256)", drbRound)
        );
        require(checkSuccess && checkData.length >= 32, "Check failed");
        bool isReady = abi.decode(checkData, (bool));
        require(isReady, "DRB randomness not yet delivered via callback");

        // Finalize selection using the delivered randomness
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
     * @dev Adds a trusted TEE attestation provider to the whitelist
     */
    function setTrustedTEEProvider(address provider) external override onlyRole(TEE_MANAGER_ROLE) {
        require(provider != address(0), "Invalid provider address");
        require(!trustedTEEProviders[provider], "Provider already trusted");

        trustedTEEProviders[provider] = true;
        _trustedTEEProviderList.push(provider);
        _trustedTEEProviderIndex[provider] = _trustedTEEProviderList.length; // 1-indexed

        emit TEEProviderUpdated(provider, true);
    }

    /**
     * @inheritdoc ITALValidationRegistry
     * @dev Removes a trusted TEE attestation provider from the whitelist
     */
    function removeTrustedTEEProvider(address provider) external override onlyRole(TEE_MANAGER_ROLE) {
        require(trustedTEEProviders[provider], "Provider not trusted");

        trustedTEEProviders[provider] = false;

        // Remove from list using swap-and-pop
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
     * @dev Checks if a TEE attestation provider is trusted
     */
    function isTrustedTEEProvider(address provider) external view override returns (bool) {
        return trustedTEEProviders[provider];
    }

    /**
     * @inheritdoc ITALValidationRegistry
     * @dev Returns all trusted TEE attestation providers
     */
    function getTrustedTEEProviders() external view override returns (address[] memory) {
        return _trustedTEEProviderList;
    }

    // ============ Dispute Handling ============

    /**
     * @inheritdoc ITALValidationRegistry
     * @dev Initiates a dispute for a completed validation
     */
    function disputeValidation(bytes32 requestHash, bytes calldata evidence) external override whenNotPaused {
        ValidationRequest storage request = _requests[requestHash];

        // Validate request exists
        if (request.requester == address(0)) {
            revert ValidationNotFound(requestHash);
        }

        // Validate request is completed (can only dispute completed validations)
        if (request.status != ValidationStatus.Completed) {
            revert ValidationNotFound(requestHash);
        }

        // Validate not already disputed
        if (_disputeStatus[requestHash]) {
            revert DisputeAlreadyActive(requestHash);
        }

        // Validate caller is authorized to dispute
        // Authorized: requester, agent owner, or registered validators
        bool isAuthorized = (msg.sender == request.requester);

        // Check if caller is agent owner
        if (!isAuthorized && identityRegistry != address(0)) {
            (bool success, bytes memory result) = identityRegistry.staticcall(
                abi.encodeWithSignature("ownerOf(uint256)", request.agentId)
            );
            if (success && result.length >= 32) {
                address owner = abi.decode(result, (address));
                isAuthorized = (msg.sender == owner);
            }
        }

        // Sprint 2: Check if caller is a registered validator (has submitted validations)
        if (!isAuthorized) {
            // Check if caller has any validation history (registered as validator)
            bytes32[] storage validatorHistory = _validatorValidations[msg.sender];
            if (validatorHistory.length > 0) {
                isAuthorized = true;
            }
        }

        // Also check if caller was the selected validator for this specific request
        if (!isAuthorized) {
            address selectedValidator = _selectedValidators[requestHash];
            if (selectedValidator == msg.sender) {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            revert NotAuthorizedToDispute(requestHash, msg.sender);
        }

        // Validate evidence is provided
        require(evidence.length > 0, "Evidence required");

        // Mark as disputed
        _disputeStatus[requestHash] = true;
        _disputeEvidence[requestHash] = evidence;
        request.status = ValidationStatus.Disputed;

        emit ValidationDisputed(requestHash, msg.sender);
    }

    /**
     * @inheritdoc ITALValidationRegistry
     * @dev Resolves a dispute with final determination
     */
    function resolveDispute(bytes32 requestHash, bool upholdOriginal) external virtual override onlyRole(DISPUTE_RESOLVER_ROLE) {
        ValidationRequest storage request = _requests[requestHash];

        // Validate request is disputed
        if (!_disputeStatus[requestHash]) {
            revert ValidationNotFound(requestHash);
        }

        // Clear dispute status
        _disputeStatus[requestHash] = false;

        if (upholdOriginal) {
            // Original validation upheld
            request.status = ValidationStatus.Completed;
            // Sprint 2: Could slash disputer if frivolous disputes become an issue
        } else {
            // Validation overturned - slash the validator
            address validator = _responses[requestHash].validator;

            // Request slashing via bridge (cross-layer slashing)
            if (stakingBridge != address(0) && validator != address(0)) {
                bytes memory evidence = abi.encodePacked(requestHash, "DISPUTE_UPHELD");
                (bool success, ) = stakingBridge.call(
                    abi.encodeWithSignature(
                        "requestSlashing(address,uint256,bytes)",
                        validator,
                        request.bounty, // Slash amount = bounty value
                        evidence
                    )
                );
                // Note: We don't revert if slashing fails - the dispute resolution still succeeds
                // The slashing request is best-effort
            }

            // Mark as expired (invalid validation)
            request.status = ValidationStatus.Expired;

            // Refund bounty to requester if validation was paid
            if (request.bounty > 0) {
                (bool refundSuccess, ) = request.requester.call{value: request.bounty}("");
                // Best-effort refund - don't revert if it fails
            }
        }
    }

    /**
     * @inheritdoc ITALValidationRegistry
     * @dev Checks if a validation is currently disputed
     */
    function isDisputed(bytes32 requestHash) external view override returns (bool) {
        return _disputeStatus[requestHash];
    }

    // ============ Query Functions ============

    /**
     * @inheritdoc ITALValidationRegistry
     * @dev Returns all validation requests by a requester
     */
    function getValidationsByRequester(address requester) external view override returns (bytes32[] memory) {
        return _requesterValidations[requester];
    }

    /**
     * @inheritdoc ITALValidationRegistry
     * @dev Returns all validation requests handled by a validator
     */
    function getValidationsByValidator(address validator) external view override returns (bytes32[] memory) {
        return _validatorValidations[validator];
    }

    /**
     * @inheritdoc ITALValidationRegistry
     * @dev Returns count of pending validations for an agent
     */
    function getPendingValidationCount(uint256 agentId) external view override returns (uint256) {
        return _pendingValidationCount[agentId];
    }

    /**
     * @inheritdoc ITALValidationRegistry
     * @dev Returns the treasury address
     */
    function getTreasury() external view override returns (address) {
        return treasury;
    }

    // ============ V3 Placeholder ============

    /**
     * @inheritdoc ITALValidationRegistry
     * @dev V1/V2 stub -- reverts. Implemented in V3.
     */
    function slashForMissedDeadline(bytes32 /*requestHash*/) external virtual override {
        revert("Not implemented until V3");
    }

    // ============ Admin Functions ============

    /**
     * @inheritdoc ITALValidationRegistry
     * @dev Sets the treasury address for protocol fee collection
     */
    function setTreasury(address _treasury) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_treasury != address(0), "Invalid treasury address");
        treasury = _treasury;
    }

    /**
     * @inheritdoc ITALValidationRegistry
     * @dev Updates validation system parameters
     */
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

    /**
     * @notice Pause the contract
     * @dev Only callable by PAUSER_ROLE
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause the contract
     * @dev Only callable by PAUSER_ROLE
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice Set the identity registry address
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     * @param _identityRegistry The new identity registry address
     */
    function setIdentityRegistry(address _identityRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        identityRegistry = _identityRegistry;
    }

    /**
     * @notice Set the reputation registry address
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     * @param _reputationRegistry The new reputation registry address
     */
    function setReputationRegistry(address _reputationRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        reputationRegistry = _reputationRegistry;
    }

    /**
     * @notice Set the staking bridge contract address
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     * @param _stakingBridge The new staking bridge address (L2 cache of L1 Staking V3)
     */
    function setStakingBridge(address _stakingBridge) external onlyRole(DEFAULT_ADMIN_ROLE) {
        stakingBridge = _stakingBridge;
    }

    /**
     * @notice Set the DRB contract address
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     * @param _drbContract The new DRB contract address
     */
    function setDRBContract(address _drbContract) external onlyRole(DEFAULT_ADMIN_ROLE) {
        drbContract = _drbContract;
    }

    /**
     * @notice Set the DRB module address (Sprint 2)
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     * @param _drbModule The new DRB module address for validator selection
     */
    function setDRBModule(address _drbModule) external onlyRole(DEFAULT_ADMIN_ROLE) {
        drbModule = _drbModule;
    }

    /**
     * @notice Set the TEE enclave hash for a trusted provider (Sprint 2)
     * @dev Only callable by TEE_MANAGER_ROLE
     * @param provider The TEE provider address
     * @param enclaveHash The expected enclave hash for attestation verification
     */
    function setTEEEnclaveHash(address provider, bytes32 enclaveHash) external onlyRole(TEE_MANAGER_ROLE) {
        require(trustedTEEProviders[provider], "Provider not trusted");
        teeEnclaveHashes[provider] = enclaveHash;
    }

    // ============ Internal Functions ============

    /**
     * @notice Validate that an agent exists in the identity registry
     * @dev Skips validation if identity registry is not set
     * @param agentId The agent ID to validate
     */
    function _validateAgent(uint256 agentId) internal view {
        if (identityRegistry == address(0)) return; // Skip if not set

        (bool success, bytes memory result) = identityRegistry.staticcall(
            abi.encodeWithSignature("agentExists(uint256)", agentId)
        );
        if (!success || (result.length > 0 && !abi.decode(result, (bool)))) {
            revert ValidationNotFound(bytes32(agentId));
        }
    }

    /**
     * @notice Validate bounty amount based on validation model
     * @dev ReputationOnly requires no bounty, others have minimum requirements
     * @param model The validation model
     * @param bounty The bounty amount provided
     */
    function _validateBounty(ValidationModel model, uint256 bounty) internal view {
        if (model == ValidationModel.ReputationOnly) {
            // ReputationOnly: No bounty required (can be zero)
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
            // Hybrid requires both stake and TEE minimums
            uint256 requiredBounty = minStakeSecuredBounty > minTEEBounty ? minStakeSecuredBounty : minTEEBounty;
            if (bounty < requiredBounty) {
                revert InsufficientBounty(bounty, requiredBounty);
            }
        }
    }

    /**
     * @notice Get stake amounts for candidate validators
     * @dev Sprint 2: Queries staking bridge for each candidate's stake
     * @param candidates Array of candidate validator addresses
     * @return stakes Array of stake amounts for each candidate
     */
    function _getCandidateStakes(address[] memory candidates) internal view returns (uint256[] memory stakes) {
        stakes = new uint256[](candidates.length);
        for (uint256 i = 0; i < candidates.length; i++) {
            if (stakingBridge != address(0)) {
                (bool success, bytes memory data) = stakingBridge.staticcall(
                    abi.encodeWithSignature("getOperatorStake(address)", candidates[i])
                );
                if (success && data.length >= 32) {
                    stakes[i] = abi.decode(data, (uint256));
                }
            }
            // Default weight of 1 for candidates without stake data
            if (stakes[i] == 0) stakes[i] = 1;
        }
    }

    /**
     * @notice Verify TEE attestation proof
     * @dev Sprint 2: Full TEE attestation verification with signature recovery
     * @param proof The TEE attestation proof bytes
     * @param requestHash The validation request hash for context
     */
    function _verifyTEEAttestation(bytes calldata proof, bytes32 requestHash) internal view {
        if (proof.length < 128) {
            revert InvalidTEEAttestation();
        }

        // Decode attestation: (bytes32 enclaveHash, address teeSigner, uint256 timestamp, bytes signature)
        (bytes32 enclaveHash, address teeSigner, uint256 timestamp, bytes memory sig) =
            abi.decode(proof, (bytes32, address, uint256, bytes));

        // Check TEE provider is whitelisted
        if (!trustedTEEProviders[teeSigner]) {
            revert TEEProviderNotTrusted(teeSigner);
        }

        // Check enclave hash matches registered hash for this provider
        if (teeEnclaveHashes[teeSigner] != enclaveHash) {
            revert InvalidTEEAttestation();
        }

        // Check freshness (within 1 hour)
        if (block.timestamp - timestamp > 1 hours) {
            revert InvalidTEEAttestation();
        }

        // Verify signature
        ValidationRequest storage req = _requests[requestHash];
        bytes32 messageHash = keccak256(abi.encodePacked(
            enclaveHash, req.taskHash, req.outputHash, requestHash, timestamp
        ));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));

        // Recover signer from signature
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

    /**
     * @notice Distribute bounty to validator, agent owner, and treasury
     * @dev Sprint 1: Basic implementation. Sprint 2: Full integration with staking.
     * @param requestHash The validation request hash
     * @param request The validation request data
     * @param validator The validator address
     */
    function _distributeBounty(
        bytes32 requestHash,
        ValidationRequest storage request,
        address validator
    ) internal {
        uint256 bounty = request.bounty;
        if (bounty == 0) return;

        // Calculate fee distribution
        // Protocol fee: 10% of total bounty
        uint256 treasuryAmount = (bounty * protocolFeeBps) / BPS_DENOMINATOR;

        // Remaining after protocol fee
        uint256 remaining = bounty - treasuryAmount;

        // Agent reward: 10% of remaining (to agent owner)
        uint256 agentAmount = (remaining * AGENT_REWARD_BPS) / BPS_DENOMINATOR;

        // Validator reward: remaining after agent reward
        uint256 validatorAmount = remaining - agentAmount;

        // Get agent owner address
        address agentOwner = address(0);
        if (identityRegistry != address(0)) {
            (bool success, bytes memory result) = identityRegistry.staticcall(
                abi.encodeWithSignature("ownerOf(uint256)", request.agentId)
            );
            if (success && result.length >= 32) {
                agentOwner = abi.decode(result, (address));
            }
        }

        // Transfer to treasury
        if (treasuryAmount > 0 && treasury != address(0)) {
            (bool treasurySuccess, ) = treasury.call{value: treasuryAmount}("");
            require(treasurySuccess, "Treasury transfer failed");
        }

        // Transfer to agent owner
        if (agentAmount > 0 && agentOwner != address(0)) {
            (bool agentSuccess, ) = agentOwner.call{value: agentAmount}("");
            require(agentSuccess, "Agent reward transfer failed");
        }

        // Transfer to validator
        if (validatorAmount > 0) {
            (bool validatorSuccess, ) = validator.call{value: validatorAmount}("");
            require(validatorSuccess, "Validator reward transfer failed");
        }

        emit BountyDistributed(requestHash, validator, validatorAmount, agentAmount, treasuryAmount);
    }

    /**
     * @notice Authorize contract upgrades
     * @dev Only callable by UPGRADER_ROLE
     * @param newImplementation Address of the new implementation
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    // ============ Receive Function ============

    /**
     * @notice Receive function to accept ETH for bounties
     * @dev Required for receiving bounty payments
     */
    receive() external payable {}
}
