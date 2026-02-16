// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../interfaces/ITALIdentityRegistry.sol";
import "./WSTONVault.sol";

/**
 * @title TALIdentityRegistry
 * @notice Tokamak Agent Layer identity registry for AI agents
 * @dev Implements ERC-8004 + TAL extensions with ERC-721 agent identity NFTs,
 *      ZK identity commitments, multi-operator management, content-hash
 *      commitment, and WSTONVault integration.
 *
 * @author Tokamak AI Layer
 * @custom:security-contact security@tokamak.ai
 *
 * Features:
 * - ERC-721 based identity tokens for AI agents
 * - ZK identity commitments using Poseidon hashes for privacy-preserving verification
 * - Capability verification through SNARK proofs
 * - Multi-operator management with EIP-712 consent signatures
 * - Agent slashing for poor validation performance
 * - Agent deregistration
 * - Content-hash commitment for tamper-evident agent URIs
 * - WSTONVault integration for stake verification and slashing
 *
 * Architecture:
 * - Uses UUPS proxy pattern for upgradeability
 * - Role-based access control for administrative functions
 * - Pausable for emergency situations
 * - ReentrancyGuard for protection against reentrancy attacks
 */
contract TALIdentityRegistry is
    ERC721Upgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    PausableUpgradeable,
    ReentrancyGuard,
    EIP712Upgradeable,
    ITALIdentityRegistry
{
    using ECDSA for bytes32;

    // ============ Constants ============

    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant SLASHER_ROLE = keccak256("SLASHER_ROLE");

    uint256 public constant MIN_OPERATOR_STAKE = 1000 ether;

    bytes32 private constant WALLET_VERIFICATION_TYPEHASH =
        keccak256("WalletVerification(uint256 agentId,address wallet,uint256 nonce)");

    bytes32 public constant OPERATOR_CONSENT_TYPEHASH = keccak256(
        "OperatorConsent(address operator,address agentOwner,string agentURI,uint8 validationModel,uint256 nonce,uint256 deadline)"
    );

    uint256 internal constant MAX_OPERATORS_PER_AGENT = 10;
    uint256 internal constant SLASH_FAILURE_THRESHOLD = 30;
    uint256 internal constant SLASH_PERCENTAGE = 25;
    uint256 internal constant SLASH_EPOCH_DURATION = 30 days;

    // ============ Agent Status Enum ============

    uint8 internal constant STATUS_ACTIVE = 0;
    uint8 internal constant STATUS_PAUSED = 1;
    uint8 internal constant STATUS_DEREGISTERED = 2;

    // ============ Validation Model Constants ============

    uint8 internal constant MODEL_REPUTATION_ONLY = 0;
    uint8 internal constant MODEL_STAKE_SECURED = 1;
    uint8 internal constant MODEL_HYBRID = 2;

    // ============ Storage ============

    uint256 private _nextTokenId;
    mapping(uint256 => string) private _agentURIs;
    mapping(uint256 => mapping(string => bytes)) private _metadata;
    mapping(uint256 => bytes32) public zkIdentities;
    mapping(uint256 => mapping(bytes32 => bool)) public zkCapabilities;
    mapping(uint256 => bytes32[]) private _verifiedCapabilitiesList;
    mapping(uint256 => bool) public verifiedOperators;
    mapping(uint256 => mapping(address => bool)) private _verifiedWallets;
    mapping(uint256 => address) private _operators;
    mapping(address => uint256[]) private _agentsByOwner;
    mapping(address => uint256) public walletNonces;
    uint256 private __reserved_slot_13;
    address public zkVerifier;
    bytes32 private _domainSeparator;

    mapping(uint256 => uint8) internal _agentValidationModel;
    mapping(uint256 => address[]) internal _agentOperators;
    mapping(address => uint256[]) internal _operatorAgents;
    mapping(uint256 => mapping(address => bool)) internal _operatorConsent;
    mapping(uint256 => uint8) internal _agentStatus;
    mapping(uint256 => uint256) internal _agentPausedAt;
    uint256 private __reserved_slot_18;
    uint256 public minOperatorStake;
    uint256 public reactivationCooldown;
    address public validationRegistry;
    uint256 private __reserved_slot_22;
    mapping(address => uint256) public operatorNonces;

    /// @notice Full registration file content hash (agentId => keccak256 of canonical JSON)
    mapping(uint256 => bytes32) internal _contentHash;

    /// @notice Security-critical fields hash (agentId => keccak256 of critical subset)
    mapping(uint256 => bytes32) internal _criticalFieldsHash;

    /// @notice Content version counter (agentId => version). 0 = legacy agent (no content hash)
    mapping(uint256 => uint256) internal _contentVersion;

    /// @notice WSTONVault address for stake verification and slashing
    address public wstonVault;

    /// @notice Last epoch in which an agent was slashed (prevents re-slashing in same epoch)
    mapping(uint256 => uint256) internal _lastSlashEpoch;

    // ============ Storage Gap ============

    uint256[23] private __gap;

    // ============ Events ============

    event AgentRegisteredV2(
        uint256 indexed agentId,
        address indexed owner,
        uint8 validationModel,
        address[] operators
    );

    event AgentSlashed(
        uint256 indexed agentId,
        address[] operators,
        uint256 slashAmountPerOperator,
        uint256 failedValidations,
        uint256 totalValidations
    );

    event AgentPaused(uint256 indexed agentId, string reason);
    event AgentPausedNoOperators(uint256 indexed agentId);
    event AgentReactivated(uint256 indexed agentId, address indexed owner);
    event AgentDeregistered(uint256 indexed agentId, address indexed owner);
    event OperatorAdded(uint256 indexed agentId, address indexed operator);
    event OperatorRemoved(uint256 indexed agentId, address indexed operator);
    event OperatorExited(uint256 indexed agentId, address indexed operator);
    event SlashingFailed(address indexed operator, uint256 amount);

    /// @notice Emitted when a content hash is committed for an agent (registration or update)
    event ContentHashCommitted(
        uint256 indexed agentId,
        bytes32 contentHash,
        bytes32 criticalFieldsHash,
        uint256 version
    );

    // ============ Errors ============

    error AgentNotActive(uint256 agentId);
    error AgentNotPaused(uint256 agentId);
    error CooldownNotElapsed(uint256 agentId, uint256 readyAt);
    error NotSlashableModel(uint256 agentId);
    error BelowSlashThreshold(uint256 failed, uint256 total);
    error NoValidationsInWindow(uint256 agentId);
    error NoOperatorsToSlash(uint256 agentId);
    error AgentAlreadyDeregistered(uint256 agentId);
    error OperatorAlreadyBacking(uint256 agentId, address operator);
    error OperatorNotBacking(uint256 agentId, address operator);
    error MustKeepOneOperator(uint256 agentId);
    error TooManyOperators(uint256 agentId);
    error InvalidValidationModel(uint8 model);
    error StakeSecuredRequiresOperators();
    error LengthMismatch();
    error ConsentOwnerMismatch();
    error ConsentURIMismatch();
    error ConsentModelMismatch();
    error DuplicateOperator(address operator);
    error SignatureExpired();
    error InvalidOperatorNonce();
    error InvalidOperatorSignature();
    error OperatorStakeInsufficient(address operator, uint256 stake, uint256 required);

    /// @notice Thrown when updateAgentURI() is called on an agent that has a content hash commitment
    error ContentHashRequired(uint256 agentId);

    /// @notice Thrown when a zero content hash is provided
    error InvalidContentHash();

    /// @notice Thrown when an agent was already slashed in the current epoch
    error AlreadySlashedInEpoch(uint256 agentId, uint256 epoch);

    // ============ Structs ============

    struct OperatorConsentData {
        address operator;
        address agentOwner;
        string agentURI;
        uint8 validationModel;
        uint256 nonce;
        uint256 deadline;
    }

    // ============ Initializer ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        address _zkVerifier,
        address _validationRegistry,
        uint256 _minOperatorStake,
        uint256 _reactivationCooldown
    ) public initializer {
        __ERC721_init("TAL Agent Identity", "TALID");
        __AccessControl_init();
        __Pausable_init();
        __EIP712_init("TAL Identity Registry", "2");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(SLASHER_ROLE, admin);

        zkVerifier = _zkVerifier;
        validationRegistry = _validationRegistry;
        minOperatorStake = _minOperatorStake;
        reactivationCooldown = _reactivationCooldown;
        _nextTokenId = 1;

        _domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("TALIdentityRegistry")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    // ============ Core Functions ============

    /// @inheritdoc IERC8004IdentityRegistry
    function register(string calldata _agentURI) external whenNotPaused nonReentrant returns (uint256 agentId) {
        agentId = _nextTokenId++;
        _safeMint(msg.sender, agentId);
        _agentURIs[agentId] = _agentURI;

        emit Registered(agentId, msg.sender, _agentURI);
    }

    /**
     * @notice Update agent URI (legacy path)
     * @dev Reverts if the agent has a content hash commitment. Use updateAgentURIWithHash() instead.
     */
    function updateAgentURI(uint256 agentId, string calldata newURI) external {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner(agentId, msg.sender);

        // Block legacy updates for agents with content hash commitment
        if (_contentVersion[agentId] > 0) revert ContentHashRequired(agentId);

        _agentURIs[agentId] = newURI;
        emit AgentURIUpdated(agentId, newURI);
    }

    /// @inheritdoc IERC8004IdentityRegistry
    function agentURI(uint256 agentId) external view returns (string memory) {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        return _agentURIs[agentId];
    }

    /// @inheritdoc IERC8004IdentityRegistry
    function setMetadata(uint256 agentId, string calldata key, bytes calldata value) external {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner(agentId, msg.sender);

        _metadata[agentId][key] = value;
        emit MetadataUpdated(agentId, key);
    }

    /// @inheritdoc IERC8004IdentityRegistry
    function getMetadata(uint256 agentId, string calldata key) external view returns (bytes memory) {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        return _metadata[agentId][key];
    }

    /// @inheritdoc IERC8004IdentityRegistry
    function verifyAgentWallet(uint256 agentId, address wallet, bytes calldata signature) external {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner(agentId, msg.sender);

        bytes32 structHash = keccak256(
            abi.encode(WALLET_VERIFICATION_TYPEHASH, agentId, wallet, walletNonces[wallet]++)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator, structHash));

        address recovered = ECDSA.recover(digest, signature);
        require(recovered == wallet, "Invalid signature");

        _verifiedWallets[agentId][wallet] = true;
        emit AgentWalletVerified(agentId, wallet);
    }

    /// @inheritdoc IERC8004IdentityRegistry
    function isVerifiedWallet(uint256 agentId, address wallet) external view returns (bool) {
        return _verifiedWallets[agentId][wallet];
    }

    // ============ TAL ZK Identity Functions ============

    /// @inheritdoc ITALIdentityRegistry
    function registerWithZKIdentity(
        string calldata _agentURI,
        bytes32 zkCommitment
    ) external whenNotPaused nonReentrant returns (uint256 agentId) {
        agentId = _nextTokenId++;
        _safeMint(msg.sender, agentId);
        _agentURIs[agentId] = _agentURI;
        zkIdentities[agentId] = zkCommitment;

        emit Registered(agentId, msg.sender, _agentURI);
        emit ZKIdentitySet(agentId, zkCommitment);
    }

    /// @inheritdoc ITALIdentityRegistry
    function setZKIdentity(uint256 agentId, bytes32 zkCommitment) external {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner(agentId, msg.sender);
        if (zkIdentities[agentId] != bytes32(0)) revert ZKIdentityAlreadySet(agentId);

        zkIdentities[agentId] = zkCommitment;
        emit ZKIdentitySet(agentId, zkCommitment);
    }

    /// @inheritdoc ITALIdentityRegistry
    function getZKIdentity(uint256 agentId) external view returns (bytes32) {
        return zkIdentities[agentId];
    }

    // ============ Capability Verification ============

    /// @inheritdoc ITALIdentityRegistry
    function verifyCapability(
        uint256 agentId,
        bytes32 capabilityHash,
        bytes calldata zkProof
    ) external returns (bool success) {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        if (zkCapabilities[agentId][capabilityHash]) revert CapabilityAlreadyVerified(agentId, capabilityHash);

        bytes32 commitment = zkIdentities[agentId];
        require(commitment != bytes32(0), "No ZK identity set");

        if (zkVerifier != address(0)) {
            (bool callSuccess, bytes memory result) = zkVerifier.staticcall(
                abi.encodeWithSignature(
                    "verifyCapabilityProof(bytes32,bytes32,bytes)",
                    commitment,
                    capabilityHash,
                    zkProof
                )
            );
            if (!callSuccess || (result.length > 0 && !abi.decode(result, (bool)))) {
                revert InvalidZKProof();
            }
        }

        zkCapabilities[agentId][capabilityHash] = true;
        _verifiedCapabilitiesList[agentId].push(capabilityHash);

        emit CapabilityVerified(agentId, capabilityHash);
        return true;
    }

    /// @inheritdoc ITALIdentityRegistry
    function isCapabilityVerified(uint256 agentId, bytes32 capabilityHash) external view returns (bool) {
        return zkCapabilities[agentId][capabilityHash];
    }

    // ============ Operator Management ============

    /// @inheritdoc ITALIdentityRegistry
    function setOperator(uint256 agentId, address operator) external {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner(agentId, msg.sender);

        _operators[agentId] = operator;
        emit OperatorSet(agentId, operator);

        _refreshOperatorStatus(agentId);
    }

    /// @inheritdoc ITALIdentityRegistry
    function getOperator(uint256 agentId) external view returns (address) {
        return _operators[agentId];
    }

    /// @inheritdoc ITALIdentityRegistry
    function refreshOperatorStatus(uint256 agentId) external {
        _refreshOperatorStatus(agentId);
    }

    /// @inheritdoc ITALIdentityRegistry
    function isVerifiedOperator(uint256 agentId) external view returns (bool) {
        return verifiedOperators[agentId];
    }

    // ============ Query Functions ============

    /// @inheritdoc ITALIdentityRegistry
    function getAgentCount() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    /// @inheritdoc ITALIdentityRegistry
    function getAgentsByOwner(address owner) external view returns (uint256[] memory) {
        return _agentsByOwner[owner];
    }

    /// @inheritdoc ITALIdentityRegistry
    function agentExists(uint256 agentId) external view returns (bool) {
        return _exists(agentId);
    }

    // ============ Multi-Operator Registration ============

    function registerV2(
        string calldata _agentURI,
        uint8 _validationModel,
        OperatorConsentData[] calldata operatorConsents,
        bytes[] calldata operatorSignatures
    ) external whenNotPaused nonReentrant returns (uint256 agentId) {
        if (operatorConsents.length != operatorSignatures.length) revert LengthMismatch();
        if (_validationModel > MODEL_HYBRID) revert InvalidValidationModel(_validationModel);
        if (operatorConsents.length > MAX_OPERATORS_PER_AGENT) {
            revert TooManyOperators(0);
        }

        if (_validationModel == MODEL_STAKE_SECURED || _validationModel == MODEL_HYBRID) {
            if (operatorConsents.length == 0) revert StakeSecuredRequiresOperators();
        }

        address[] memory operators = new address[](operatorConsents.length);
        for (uint256 i = 0; i < operatorConsents.length; i++) {
            OperatorConsentData calldata consent = operatorConsents[i];

            if (consent.agentOwner != msg.sender) revert ConsentOwnerMismatch();
            if (keccak256(bytes(consent.agentURI)) != keccak256(bytes(_agentURI))) revert ConsentURIMismatch();
            if (consent.validationModel != _validationModel) revert ConsentModelMismatch();

            _verifyOperatorConsent(consent, operatorSignatures[i]);

            if (_validationModel == MODEL_STAKE_SECURED || _validationModel == MODEL_HYBRID) {
                uint256 opStake = _getOperatorStake(consent.operator);
                if (opStake < minOperatorStake) {
                    revert OperatorStakeInsufficient(consent.operator, opStake, minOperatorStake);
                }
            }

            for (uint256 j = 0; j < i; j++) {
                if (operators[j] == consent.operator) revert DuplicateOperator(consent.operator);
            }

            operators[i] = consent.operator;
        }

        agentId = _nextTokenId++;
        _safeMint(msg.sender, agentId);
        _agentURIs[agentId] = _agentURI;

        _agentValidationModel[agentId] = _validationModel;

        for (uint256 i = 0; i < operators.length; i++) {
            _agentOperators[agentId].push(operators[i]);
            _operatorAgents[operators[i]].push(agentId);
            _operatorConsent[agentId][operators[i]] = true;
        }

        emit AgentRegisteredV2(agentId, msg.sender, _validationModel, operators);
    }

    // ============ Slashing ============

    function checkAndSlash(uint256 agentId) external whenNotPaused nonReentrant {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        if (_agentStatus[agentId] != STATUS_ACTIVE) revert AgentNotActive(agentId);

        // H-4 fix: Prevent re-slashing in the same epoch
        uint256 currentEpochNum = block.timestamp / SLASH_EPOCH_DURATION;
        if (_lastSlashEpoch[agentId] == currentEpochNum) {
            revert AlreadySlashedInEpoch(agentId, currentEpochNum);
        }

        uint8 model = _agentValidationModel[agentId];
        if (model != MODEL_STAKE_SECURED && model != MODEL_HYBRID) {
            revert NotSlashableModel(agentId);
        }

        (uint256 totalValidations, uint256 failedValidations) = _getAgentValidationStats(agentId);

        if (totalValidations == 0) revert NoValidationsInWindow(agentId);

        if (failedValidations * 100 <= totalValidations * SLASH_FAILURE_THRESHOLD) {
            revert BelowSlashThreshold(failedValidations, totalValidations);
        }

        address[] storage operators = _agentOperators[agentId];
        if (operators.length == 0) revert NoOperatorsToSlash(agentId);

        uint256 totalSlash = (minOperatorStake * SLASH_PERCENTAGE) / 100;
        uint256 slashPerOperator = totalSlash / operators.length;

        address[] memory opsCopy = new address[](operators.length);
        for (uint256 i = 0; i < operators.length; i++) {
            opsCopy[i] = operators[i];
        }

        for (uint256 i = 0; i < opsCopy.length; i++) {
            _slashOperator(opsCopy[i], slashPerOperator);
        }

        _agentStatus[agentId] = STATUS_PAUSED;
        _agentPausedAt[agentId] = block.timestamp;
        _lastSlashEpoch[agentId] = currentEpochNum;

        emit AgentSlashed(agentId, opsCopy, slashPerOperator, failedValidations, totalValidations);
    }

    // ============ Reactivation ============

    function reactivate(uint256 agentId) external {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner(agentId, msg.sender);
        if (_agentStatus[agentId] != STATUS_PAUSED) revert AgentNotPaused(agentId);

        uint256 readyAt = _agentPausedAt[agentId] + reactivationCooldown;
        if (block.timestamp < readyAt) {
            revert CooldownNotElapsed(agentId, readyAt);
        }

        address[] storage operators = _agentOperators[agentId];
        for (uint256 i = 0; i < operators.length; i++) {
            uint256 opStake = _getOperatorStake(operators[i]);
            if (opStake < minOperatorStake) {
                revert OperatorStakeInsufficient(operators[i], opStake, minOperatorStake);
            }
        }

        _agentStatus[agentId] = STATUS_ACTIVE;
        _agentPausedAt[agentId] = 0;

        emit AgentReactivated(agentId, msg.sender);
    }

    // ============ Deregistration ============

    function deregister(uint256 agentId) external nonReentrant {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner(agentId, msg.sender);
        if (_agentStatus[agentId] == STATUS_DEREGISTERED) revert AgentAlreadyDeregistered(agentId);

        address[] storage operators = _agentOperators[agentId];
        for (uint256 i = operators.length; i > 0; i--) {
            address op = operators[i - 1];
            _removeOperatorFromAgent(agentId, op);
        }

        delete _agentURIs[agentId];
        _agentStatus[agentId] = STATUS_DEREGISTERED;
        _agentPausedAt[agentId] = 0;

        delete _operators[agentId];
        verifiedOperators[agentId] = false;

        address owner = ownerOf(agentId);

        _burn(agentId);

        emit AgentDeregistered(agentId, owner);
    }

    // ============ Multi-Operator Management ============

    function addOperator(
        uint256 agentId,
        OperatorConsentData calldata consent,
        bytes calldata signature
    ) external {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner(agentId, msg.sender);
        if (_agentStatus[agentId] != STATUS_ACTIVE) revert AgentNotActive(agentId);
        if (_operatorConsent[agentId][consent.operator]) revert OperatorAlreadyBacking(agentId, consent.operator);
        if (_agentOperators[agentId].length >= MAX_OPERATORS_PER_AGENT) revert TooManyOperators(agentId);

        _verifyOperatorConsent(consent, signature);

        uint8 model = _agentValidationModel[agentId];
        if (model == MODEL_STAKE_SECURED || model == MODEL_HYBRID) {
            uint256 opStake = _getOperatorStake(consent.operator);
            if (opStake < minOperatorStake) {
                revert OperatorStakeInsufficient(consent.operator, opStake, minOperatorStake);
            }
        }

        _agentOperators[agentId].push(consent.operator);
        _operatorAgents[consent.operator].push(agentId);
        _operatorConsent[agentId][consent.operator] = true;

        emit OperatorAdded(agentId, consent.operator);
    }

    function removeOperator(uint256 agentId, address operator) external {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner(agentId, msg.sender);
        if (!_operatorConsent[agentId][operator]) revert OperatorNotBacking(agentId, operator);

        uint8 model = _agentValidationModel[agentId];
        if (model == MODEL_STAKE_SECURED || model == MODEL_HYBRID) {
            if (_agentOperators[agentId].length <= 1) revert MustKeepOneOperator(agentId);
        }

        _removeOperatorFromAgent(agentId, operator);

        emit OperatorRemoved(agentId, operator);
    }

    function operatorExit(uint256 agentId) external {
        if (!_operatorConsent[agentId][msg.sender]) revert OperatorNotBacking(agentId, msg.sender);

        uint8 model = _agentValidationModel[agentId];
        if (model == MODEL_STAKE_SECURED || model == MODEL_HYBRID) {
            if (_agentOperators[agentId].length == 1) {
                _agentStatus[agentId] = STATUS_PAUSED;
                _agentPausedAt[agentId] = block.timestamp;
                emit AgentPausedNoOperators(agentId);
            }
        }

        _removeOperatorFromAgent(agentId, msg.sender);

        emit OperatorExited(agentId, msg.sender);
    }

    // ============ View Functions ============

    function getAgentOperators(uint256 agentId) external view returns (address[] memory) {
        return _agentOperators[agentId];
    }

    function getAgentValidationModel(uint256 agentId) external view returns (uint8) {
        return _agentValidationModel[agentId];
    }

    function getAgentStatus(uint256 agentId) external view returns (uint8) {
        return _agentStatus[agentId];
    }

    function getOperatorAgents(address operator) external view returns (uint256[] memory) {
        return _operatorAgents[operator];
    }

    function isOperatorOf(uint256 agentId, address operator) external view returns (bool) {
        return _operatorConsent[agentId][operator];
    }

    // ============ Content Hash Commitment ============

    /**
     * @notice Register a new agent with a content hash commitment
     * @param _agentURI The agent metadata URI (e.g., IPFS CID)
     * @param contentHash keccak256 of the canonical registration JSON
     * @param criticalFieldsHash keccak256 of security-critical fields subset
     * @return agentId The newly minted agent ID
     */
    function registerWithContentHash(
        string calldata _agentURI,
        bytes32 contentHash,
        bytes32 criticalFieldsHash
    ) external whenNotPaused nonReentrant returns (uint256 agentId) {
        if (contentHash == bytes32(0)) revert InvalidContentHash();

        agentId = _nextTokenId++;
        _safeMint(msg.sender, agentId);
        _agentURIs[agentId] = _agentURI;

        _contentHash[agentId] = contentHash;
        _criticalFieldsHash[agentId] = criticalFieldsHash;
        _contentVersion[agentId] = 1;

        emit Registered(agentId, msg.sender, _agentURI);
        emit ContentHashCommitted(agentId, contentHash, criticalFieldsHash, 1);
    }

    /**
     * @notice Update agent URI with new content hashes (required for agents with content commitment)
     * @param agentId The agent ID to update
     * @param newURI The new metadata URI
     * @param newContentHash keccak256 of the new canonical registration JSON
     * @param newCriticalFieldsHash keccak256 of the new security-critical fields
     */
    function updateAgentURIWithHash(
        uint256 agentId,
        string calldata newURI,
        bytes32 newContentHash,
        bytes32 newCriticalFieldsHash
    ) external {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner(agentId, msg.sender);
        if (newContentHash == bytes32(0)) revert InvalidContentHash();

        _agentURIs[agentId] = newURI;
        _contentHash[agentId] = newContentHash;
        _criticalFieldsHash[agentId] = newCriticalFieldsHash;

        uint256 newVersion = _contentVersion[agentId] + 1;
        _contentVersion[agentId] = newVersion;

        emit AgentURIUpdated(agentId, newURI);
        emit ContentHashCommitted(agentId, newContentHash, newCriticalFieldsHash, newVersion);
    }

    /**
     * @notice Get the content hash info for an agent
     * @param agentId The agent ID
     * @return contentHash The full content hash (bytes32(0) for legacy agents)
     * @return criticalFieldsHash The critical fields hash
     * @return version The content version (0 for legacy agents)
     */
    function getContentHash(uint256 agentId) external view returns (
        bytes32 contentHash,
        bytes32 criticalFieldsHash,
        uint256 version
    ) {
        return (_contentHash[agentId], _criticalFieldsHash[agentId], _contentVersion[agentId]);
    }

    // ============ Admin Functions ============

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice Set the WSTONVault address for stake verification and slashing
     * @dev Only callable by DEFAULT_ADMIN_ROLE.
     * @param _wstonVault The WSTONVault contract address
     */
    function setWSTONVault(address _wstonVault) external onlyRole(DEFAULT_ADMIN_ROLE) {
        wstonVault = _wstonVault;
    }

    function setZKVerifier(address _zkVerifier) external onlyRole(DEFAULT_ADMIN_ROLE) {
        zkVerifier = _zkVerifier;
    }

    function setValidationRegistry(address _validationRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        validationRegistry = _validationRegistry;
    }

    function setMinOperatorStake(uint256 _minOperatorStake) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minOperatorStake = _minOperatorStake;
    }

    // ============ Internal Functions ============

    /**
     * @notice Refresh operator verification status
     * @dev Uses WSTONVault to query locked balance
     */
    function _refreshOperatorStatus(uint256 agentId) internal {
        address operator = _operators[agentId];
        if (operator == address(0)) {
            verifiedOperators[agentId] = false;
            emit OperatorStatusChanged(agentId, false, 0);
            return;
        }

        uint256 stake = 0;
        if (wstonVault != address(0)) {
            stake = WSTONVault(wstonVault).getLockedBalance(operator);
        }

        bool isVerified = stake >= MIN_OPERATOR_STAKE;
        verifiedOperators[agentId] = isVerified;
        emit OperatorStatusChanged(agentId, isVerified, stake);
    }

    function _verifyOperatorConsent(
        OperatorConsentData calldata consent,
        bytes calldata signature
    ) internal {
        if (block.timestamp > consent.deadline) revert SignatureExpired();
        if (consent.nonce != operatorNonces[consent.operator]) revert InvalidOperatorNonce();

        bytes32 structHash = keccak256(abi.encode(
            OPERATOR_CONSENT_TYPEHASH,
            consent.operator,
            consent.agentOwner,
            keccak256(bytes(consent.agentURI)),
            consent.validationModel,
            consent.nonce,
            consent.deadline
        ));
        bytes32 digest = _hashTypedDataV4(structHash);

        address signer = ECDSA.recover(digest, signature);
        if (signer != consent.operator) revert InvalidOperatorSignature();

        operatorNonces[consent.operator]++;
    }

    /**
     * @notice Get operator stake via WSTONVault
     */
    function _getOperatorStake(address operator) internal view returns (uint256) {
        if (wstonVault != address(0)) {
            return WSTONVault(wstonVault).getLockedBalance(operator);
        }
        return 0;
    }

    function _getAgentValidationStats(uint256 agentId) internal view returns (uint256 total, uint256 failed) {
        if (validationRegistry == address(0)) return (0, 0);
        // selector: keccak256("getAgentValidationStats(uint256,uint256)") = 0x...
        (bool ok, bytes memory data) = validationRegistry.staticcall(
            abi.encodeWithSelector(bytes4(keccak256("getAgentValidationStats(uint256,uint256)")), agentId, 30 days)
        );
        if (ok && data.length >= 64) (total, failed) = abi.decode(data, (uint256, uint256));
    }

    /**
     * @notice Slash an operator via WSTONVault
     */
    function _slashOperator(address operator, uint256 amount) internal {
        if (amount == 0 || wstonVault == address(0)) return;
        // H-3 fix: Emit SlashingFailed when slash reverts
        try WSTONVault(wstonVault).slash(operator, amount) {
        } catch {
            emit SlashingFailed(operator, amount);
        }
    }

    function _removeOperatorFromAgent(uint256 agentId, address operator) internal {
        address[] storage agentOps = _agentOperators[agentId];
        for (uint256 i = 0; i < agentOps.length; i++) {
            if (agentOps[i] == operator) {
                agentOps[i] = agentOps[agentOps.length - 1];
                agentOps.pop();
                break;
            }
        }

        uint256[] storage opAgents = _operatorAgents[operator];
        for (uint256 i = 0; i < opAgents.length; i++) {
            if (opAgents[i] == agentId) {
                opAgents[i] = opAgents[opAgents.length - 1];
                opAgents.pop();
                break;
            }
        }

        _operatorConsent[agentId][operator] = false;
    }

    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    // ============ ERC721 Overrides ============

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (!_exists(tokenId)) revert AgentNotFound(tokenId);
        return _agentURIs[tokenId];
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Upgradeable, AccessControlUpgradeable, IERC165)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = super._update(to, tokenId, auth);

        if (from != address(0)) {
            uint256[] storage fromAgents = _agentsByOwner[from];
            for (uint256 i = 0; i < fromAgents.length; i++) {
                if (fromAgents[i] == tokenId) {
                    fromAgents[i] = fromAgents[fromAgents.length - 1];
                    fromAgents.pop();
                    break;
                }
            }
        }

        if (to != address(0)) {
            _agentsByOwner[to].push(tokenId);
        }

        // H-2 fix: On transfer (not mint/burn), invalidate operator consent
        // Operators signed EIP-712 consent for the original owner — transfer breaks that trust
        if (from != address(0) && to != address(0)) {
            // Remove all V2 operators (reverse iteration for safe swap-and-pop)
            address[] storage operators = _agentOperators[tokenId];
            for (uint256 i = operators.length; i > 0; i--) {
                _removeOperatorFromAgent(tokenId, operators[i - 1]);
            }

            // Clear legacy single operator
            delete _operators[tokenId];
            verifiedOperators[tokenId] = false;

            // Pause stake-backed agents — new owner must add operators and reactivate
            uint8 model = _agentValidationModel[tokenId];
            if (model == MODEL_STAKE_SECURED || model == MODEL_HYBRID) {
                _agentStatus[tokenId] = STATUS_PAUSED;
                _agentPausedAt[tokenId] = block.timestamp;
                emit AgentPausedNoOperators(tokenId);
            }
        }

        return from;
    }
}
