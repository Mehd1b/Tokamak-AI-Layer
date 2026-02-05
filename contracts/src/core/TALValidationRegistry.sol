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

    /// @notice Staking V2 contract address for stake verification
    address public stakingV2;

    /// @notice DRB (Decentralized Random Beacon) contract address
    address public drbContract;

    /// @notice Protocol treasury address for fee collection
    address public treasury;

    /// @notice Validation request counter for unique IDs
    uint256 private _requestNonce;

    /// @notice Validation requests mapping (requestHash => ValidationRequest)
    mapping(bytes32 => ValidationRequest) private _requests;

    /// @notice Validation responses mapping (requestHash => ValidationResponse)
    mapping(bytes32 => ValidationResponse) private _responses;

    /// @notice Selected validators mapping (requestHash => validator address)
    mapping(bytes32 => address) private _selectedValidators;

    /// @notice Dispute status mapping (requestHash => isDisputed)
    mapping(bytes32 => bool) private _disputeStatus;

    /// @notice Dispute evidence mapping (requestHash => evidence)
    mapping(bytes32 => bytes) private _disputeEvidence;

    /// @notice Trusted TEE providers mapping (provider => isTrusted)
    mapping(address => bool) private _trustedTEEProviders;

    /// @notice Array of trusted TEE providers for enumeration
    address[] private _trustedTEEProviderList;

    /// @notice Index in trusted provider list (provider => index + 1, 0 means not in list)
    mapping(address => uint256) private _trustedTEEProviderIndex;

    /// @notice Agent validations mapping (agentId => requestHashes)
    mapping(uint256 => bytes32[]) private _agentValidations;

    /// @notice Requester validations mapping (requester => requestHashes)
    mapping(address => bytes32[]) private _requesterValidations;

    /// @notice Validator validations mapping (validator => requestHashes)
    mapping(address => bytes32[]) private _validatorValidations;

    /// @notice Pending validation count per agent (agentId => count)
    mapping(uint256 => uint256) private _pendingValidationCount;

    /// @notice Configurable minimum bounty for StakeSecured (can be updated by admin)
    uint256 public minStakeSecuredBounty;

    /// @notice Configurable minimum bounty for TEE (can be updated by admin)
    uint256 public minTEEBounty;

    /// @notice Configurable protocol fee (can be updated by admin)
    uint256 public protocolFeeBps;

    // ============ Storage Gap ============

    /// @dev Reserved storage space for future upgrades
    uint256[40] private __gap;

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
    ) external payable override whenNotPaused nonReentrant returns (bytes32 requestHash) {
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

        // Model-specific validation
        if (request.model == ValidationModel.ReputationOnly) {
            // ReputationOnly: Any address can submit validation
            // No additional validation required for Sprint 1
        } else if (request.model == ValidationModel.StakeSecured) {
            // StakeSecured: Only selected validator can submit (Sprint 2)
            address selectedValidator = _selectedValidators[requestHash];
            if (selectedValidator != address(0) && selectedValidator != msg.sender) {
                revert NotSelectedValidator(requestHash, msg.sender);
            }
            // TODO: Sprint 2 - Verify validator stake
        } else if (request.model == ValidationModel.TEEAttested) {
            // TEEAttested: Verify TEE attestation (Sprint 2)
            _verifyTEEAttestation(proof);
        } else if (request.model == ValidationModel.Hybrid) {
            // Hybrid: Both validator selection and TEE attestation required (Sprint 2)
            address selectedValidator = _selectedValidators[requestHash];
            if (selectedValidator != address(0) && selectedValidator != msg.sender) {
                revert NotSelectedValidator(requestHash, msg.sender);
            }
            _verifyTEEAttestation(proof);
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

        // Sprint 1: Use blockhash-based randomness (placeholder)
        // Sprint 2: Integrate with DRB contract for Commit-Reveal² randomness
        uint256 randomSeed;
        if (drbContract != address(0)) {
            // TODO: Sprint 2 - Call DRB contract for secure randomness
            // (bool success, bytes memory result) = drbContract.staticcall(
            //     abi.encodeWithSignature("getRandomness(bytes32)", requestHash)
            // );
            // randomSeed = abi.decode(result, (uint256));
            randomSeed = uint256(keccak256(abi.encodePacked(blockhash(block.number - 1), requestHash)));
        } else {
            // Fallback: blockhash-based randomness (not secure for production)
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

    // ============ TEE Attestation Management ============

    /**
     * @inheritdoc ITALValidationRegistry
     * @dev Adds a trusted TEE attestation provider to the whitelist
     */
    function setTrustedTEEProvider(address provider) external override onlyRole(TEE_MANAGER_ROLE) {
        require(provider != address(0), "Invalid provider address");
        require(!_trustedTEEProviders[provider], "Provider already trusted");

        _trustedTEEProviders[provider] = true;
        _trustedTEEProviderList.push(provider);
        _trustedTEEProviderIndex[provider] = _trustedTEEProviderList.length; // 1-indexed

        emit TEEProviderUpdated(provider, true);
    }

    /**
     * @inheritdoc ITALValidationRegistry
     * @dev Removes a trusted TEE attestation provider from the whitelist
     */
    function removeTrustedTEEProvider(address provider) external override onlyRole(TEE_MANAGER_ROLE) {
        require(_trustedTEEProviders[provider], "Provider not trusted");

        _trustedTEEProviders[provider] = false;

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
        return _trustedTEEProviders[provider];
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

        // TODO: Sprint 2 - Check if caller is registered validator

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
    function resolveDispute(bytes32 requestHash, bool upholdOriginal) external override onlyRole(DISPUTE_RESOLVER_ROLE) {
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
            // TODO: Sprint 2 - Slash disputer if applicable
        } else {
            // Validation overturned
            // TODO: Sprint 2 - Slash validator, refund bounty, update reputation
            // For now, mark as expired (invalid)
            request.status = ValidationStatus.Expired;
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
     * @notice Set the staking V2 contract address
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     * @param _stakingV2 The new staking V2 address
     */
    function setStakingV2(address _stakingV2) external onlyRole(DEFAULT_ADMIN_ROLE) {
        stakingV2 = _stakingV2;
    }

    /**
     * @notice Set the DRB contract address
     * @dev Only callable by DEFAULT_ADMIN_ROLE
     * @param _drbContract The new DRB contract address
     */
    function setDRBContract(address _drbContract) external onlyRole(DEFAULT_ADMIN_ROLE) {
        drbContract = _drbContract;
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
     * @notice Verify TEE attestation proof
     * @dev Sprint 1: Basic structure. Sprint 2: Full verification.
     * @param proof The TEE attestation proof bytes
     */
    function _verifyTEEAttestation(bytes calldata proof) internal view {
        if (proof.length == 0) {
            revert InvalidTEEAttestation();
        }

        // Sprint 2: Decode proof and verify against trusted providers
        // Expected proof format: abi.encode(providerAddress, signature, attestationData)
        if (proof.length >= 20) {
            // Extract provider address from proof (first 20 bytes after decoding)
            // For Sprint 1, we do basic length validation
            // Sprint 2 will implement full signature verification

            // TODO: Sprint 2 - Full TEE attestation verification
            // address provider;
            // bytes memory signature;
            // bytes memory attestationData;
            // (provider, signature, attestationData) = abi.decode(proof, (address, bytes, bytes));
            //
            // if (!_trustedTEEProviders[provider]) {
            //     revert TEEProviderNotTrusted(provider);
            // }
            //
            // // Verify signature
            // bytes32 messageHash = keccak256(attestationData);
            // address recovered = ECDSA.recover(messageHash, signature);
            // if (recovered != provider) {
            //     revert InvalidTEEAttestation();
            // }
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
