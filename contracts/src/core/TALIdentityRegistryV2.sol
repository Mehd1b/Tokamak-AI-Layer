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

/**
 * @title TALIdentityRegistryV2
 * @notice Upgraded TAL identity registry with multi-operator staking and slashing
 * @dev UUPS upgrade of TALIdentityRegistry. Storage layout preserves V1 exactly,
 *      with new variables consuming slots from the V1 `__gap`.
 *
 * V2 Additions:
 * - Multi-operator support with EIP-712 consent signatures
 * - Validation model selection (ReputationOnly / StakeSecured / Hybrid)
 * - Agent slashing: >30% validation failure rate triggers operator slash + agent pause
 * - Reactivation after cooldown with operator stake top-up
 * - Operator voluntary exit
 */
contract TALIdentityRegistryV2 is
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

    /// @notice Maximum operators per agent to bound gas costs
    uint256 public constant MAX_OPERATORS_PER_AGENT = 10;

    /// @notice Slashing threshold: >30% failure rate (expressed as 30)
    uint256 public constant SLASH_FAILURE_THRESHOLD = 30;

    /// @notice Slash percentage of minOperatorStake (25%)
    uint256 public constant SLASH_PERCENTAGE = 25;

    // ============ Agent Status Enum ============

    uint8 public constant STATUS_ACTIVE = 0;
    uint8 public constant STATUS_PAUSED = 1;
    uint8 public constant STATUS_DEREGISTERED = 2;

    // ============ Validation Model Constants ============

    uint8 public constant MODEL_REPUTATION_ONLY = 0;
    uint8 public constant MODEL_STAKE_SECURED = 1;
    uint8 public constant MODEL_HYBRID = 2;

    // =====================================================================
    // V1 STORAGE — DO NOT REORDER, RENAME, OR CHANGE TYPES
    // =====================================================================

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
    address public stakingBridge;
    address public zkVerifier;
    bytes32 private _domainSeparator;

    // =====================================================================
    // V2 STORAGE — Appended in place of __gap slots (40 → 28)
    // =====================================================================

    /// @notice Validation model for each agent (0=ReputationOnly, 1=StakeSecured, 2=Hybrid)
    mapping(uint256 => uint8) internal _agentValidationModel;

    /// @notice List of operator addresses backing each agent
    mapping(uint256 => address[]) internal _agentOperators;

    /// @notice Reverse lookup: operator → list of agent IDs they back
    mapping(address => uint256[]) internal _operatorAgents;

    /// @notice Whether an operator has consented to back a specific agent
    mapping(uint256 => mapping(address => bool)) internal _operatorConsent;

    /// @notice Agent status: 0=ACTIVE, 1=PAUSED, 2=DEREGISTERED
    mapping(uint256 => uint8) internal _agentStatus;

    /// @notice Timestamp when agent was paused (for cooldown calculation)
    mapping(uint256 => uint256) internal _agentPausedAt;

    /// @notice Protocol treasury address for receiving slashed funds
    address public protocolTreasury;

    /// @notice Minimum operator stake required for StakeSecured/Hybrid (in wei)
    uint256 public minOperatorStake;

    /// @notice Cooldown period after pause before reactivation (seconds)
    uint256 public reactivationCooldown;

    /// @notice Reference to the validation registry for failure rate reads
    address public validationRegistry;

    /// @notice Reference to the reputation registry
    address public reputationRegistry;

    /// @notice Nonce per operator for EIP-712 signature replay protection
    mapping(address => uint256) public operatorNonces;

    // ============ Storage Gap (reduced from 40 to 28) ============

    uint256[28] private __gap;

    // =====================================================================
    // V2 EVENTS
    // =====================================================================

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
    event V2Initialized(address protocolTreasury, address validationRegistry, uint256 minOperatorStake);

    // =====================================================================
    // V2 ERRORS
    // =====================================================================

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

    // =====================================================================
    // V2 STRUCTS
    // =====================================================================

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

    /**
     * @notice V1 initializer (preserved for proxy compatibility)
     */
    function initialize(
        address admin,
        address _stakingBridge,
        address _zkVerifier
    ) public initializer {
        __ERC721_init("TAL Agent Identity", "TALID");
        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);

        stakingBridge = _stakingBridge;
        zkVerifier = _zkVerifier;
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

    /**
     * @notice V2 initializer — called once after proxy upgrade
     * @param _protocolTreasury Treasury address for slashed funds
     * @param _stakingBridge Staking bridge address (can update existing)
     * @param _validationRegistry Validation registry for failure stats
     * @param _reputationRegistry Reputation registry
     * @param _minOperatorStake Minimum stake for StakeSecured operators (wei)
     * @param _reactivationCooldown Cooldown after pause before reactivation (seconds)
     */
    function initializeV2(
        address _protocolTreasury,
        address _stakingBridge,
        address _validationRegistry,
        address _reputationRegistry,
        uint256 _minOperatorStake,
        uint256 _reactivationCooldown
    ) external reinitializer(2) {
        require(_protocolTreasury != address(0), "Zero treasury");
        require(_validationRegistry != address(0), "Zero validation registry");

        // Initialize EIP-712 for V2 operator consent signatures
        __EIP712_init("TAL Identity Registry", "2");

        // Grant slasher role to admin
        _grantRole(SLASHER_ROLE, msg.sender);

        protocolTreasury = _protocolTreasury;
        if (_stakingBridge != address(0)) {
            stakingBridge = _stakingBridge;
        }
        validationRegistry = _validationRegistry;
        reputationRegistry = _reputationRegistry;
        minOperatorStake = _minOperatorStake;
        reactivationCooldown = _reactivationCooldown;

        emit V2Initialized(_protocolTreasury, _validationRegistry, _minOperatorStake);
    }

    // =====================================================================
    // V1 FUNCTIONS (preserved unchanged for backward compatibility)
    // =====================================================================

    /// @inheritdoc IERC8004IdentityRegistry
    function register(string calldata _agentURI) external whenNotPaused nonReentrant returns (uint256 agentId) {
        agentId = _nextTokenId++;
        _safeMint(msg.sender, agentId);
        _agentURIs[agentId] = _agentURI;
        // _agentStatus defaults to 0 (ACTIVE)
        // _agentValidationModel defaults to 0 (ReputationOnly)

        emit Registered(agentId, msg.sender, _agentURI);
    }

    /// @inheritdoc IERC8004IdentityRegistry
    function updateAgentURI(uint256 agentId, string calldata newURI) external {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner(agentId, msg.sender);

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

        // Uses V1 domain separator for backward compat
        bytes32 structHash = keccak256(
            abi.encode(WALLET_VERIFICATION_TYPEHASH, agentId, wallet, walletNonces[wallet]++)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator, structHash));

        address recovered = _recoverSigner(digest, signature);
        require(recovered == wallet, "Invalid signature");

        _verifiedWallets[agentId][wallet] = true;
        emit AgentWalletVerified(agentId, wallet);
    }

    /// @inheritdoc IERC8004IdentityRegistry
    function isVerifiedWallet(uint256 agentId, address wallet) external view returns (bool) {
        return _verifiedWallets[agentId][wallet];
    }

    // ============ TAL ZK Identity Functions (V1) ============

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

    // ============ Capability Verification (V1) ============

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

    /// @inheritdoc ITALIdentityRegistry
    function getVerifiedCapabilities(uint256 agentId) external view returns (bytes32[] memory) {
        return _verifiedCapabilitiesList[agentId];
    }

    // ============ Operator Management (V1 — backward compat) ============

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
    function checkOperatorStatus(uint256 agentId) external view returns (bool isVerified) {
        return verifiedOperators[agentId];
    }

    /// @inheritdoc ITALIdentityRegistry
    function refreshOperatorStatus(uint256 agentId) external {
        _refreshOperatorStatus(agentId);
    }

    /// @inheritdoc ITALIdentityRegistry
    function isVerifiedOperator(uint256 agentId) external view returns (bool) {
        return verifiedOperators[agentId];
    }

    // ============ Query Functions (V1) ============

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

    // =====================================================================
    // V2 FUNCTIONS — Multi-Operator Registration
    // =====================================================================

    /**
     * @notice Register agent with validation model and operator backing
     * @param _agentURI Agent metadata URI
     * @param _validationModel 0=ReputationOnly, 1=StakeSecured, 2=Hybrid
     * @param operatorConsents EIP-712 consent data from each operator
     * @param operatorSignatures Corresponding signatures
     * @return agentId The newly minted agent ID
     */
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

        // StakeSecured / Hybrid require at least 1 operator
        if (_validationModel == MODEL_STAKE_SECURED || _validationModel == MODEL_HYBRID) {
            if (operatorConsents.length == 0) revert StakeSecuredRequiresOperators();
        }

        // Verify each operator's consent and stake
        address[] memory operators = new address[](operatorConsents.length);
        for (uint256 i = 0; i < operatorConsents.length; i++) {
            OperatorConsentData calldata consent = operatorConsents[i];

            if (consent.agentOwner != msg.sender) revert ConsentOwnerMismatch();
            if (keccak256(bytes(consent.agentURI)) != keccak256(bytes(_agentURI))) revert ConsentURIMismatch();
            if (consent.validationModel != _validationModel) revert ConsentModelMismatch();

            _verifyOperatorConsent(consent, operatorSignatures[i]);

            // For StakeSecured/Hybrid: check operator's stake
            if (_validationModel == MODEL_STAKE_SECURED || _validationModel == MODEL_HYBRID) {
                uint256 opStake = _getOperatorStake(consent.operator);
                if (opStake < minOperatorStake) {
                    revert OperatorStakeInsufficient(consent.operator, opStake, minOperatorStake);
                }
            }

            // Prevent duplicate operators
            for (uint256 j = 0; j < i; j++) {
                if (operators[j] == consent.operator) revert DuplicateOperator(consent.operator);
            }

            operators[i] = consent.operator;
        }

        // Mint agent NFT
        agentId = _nextTokenId++;
        _safeMint(msg.sender, agentId);
        _agentURIs[agentId] = _agentURI;

        // Store V2 state
        _agentValidationModel[agentId] = _validationModel;
        // _agentStatus defaults to 0 (ACTIVE)

        for (uint256 i = 0; i < operators.length; i++) {
            _agentOperators[agentId].push(operators[i]);
            _operatorAgents[operators[i]].push(agentId);
            _operatorConsent[agentId][operators[i]] = true;
        }

        emit AgentRegisteredV2(agentId, msg.sender, _validationModel, operators);
    }

    // =====================================================================
    // V2 FUNCTIONS — Slashing
    // =====================================================================

    /**
     * @notice Slash operators of an agent with >30% validation failure rate
     * @dev Anyone can call. Verifies conditions on-chain via ValidationRegistry.
     * @param agentId The agent to check and potentially slash
     */
    function checkAndSlash(uint256 agentId) external whenNotPaused nonReentrant {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        if (_agentStatus[agentId] != STATUS_ACTIVE) revert AgentNotActive(agentId);

        uint8 model = _agentValidationModel[agentId];
        if (model != MODEL_STAKE_SECURED && model != MODEL_HYBRID) {
            revert NotSlashableModel(agentId);
        }

        // Query validation stats from ValidationRegistry
        (uint256 totalValidations, uint256 failedValidations) = _getAgentValidationStats(agentId);

        if (totalValidations == 0) revert NoValidationsInWindow(agentId);

        // Check threshold: failedValidations / totalValidations > 30%
        // Rearranged to avoid division: failedValidations * 100 > totalValidations * 30
        if (failedValidations * 100 <= totalValidations * SLASH_FAILURE_THRESHOLD) {
            revert BelowSlashThreshold(failedValidations, totalValidations);
        }

        address[] storage operators = _agentOperators[agentId];
        if (operators.length == 0) revert NoOperatorsToSlash(agentId);

        // Calculate slash amount per operator
        uint256 totalSlash = (minOperatorStake * SLASH_PERCENTAGE) / 100;
        uint256 slashPerOperator = totalSlash / operators.length;

        // Execute slashing on each operator
        // Copy array to avoid issues with storage during iteration
        address[] memory opsCopy = new address[](operators.length);
        for (uint256 i = 0; i < operators.length; i++) {
            opsCopy[i] = operators[i];
        }

        for (uint256 i = 0; i < opsCopy.length; i++) {
            _slashOperator(opsCopy[i], slashPerOperator);
        }

        // Pause the agent
        _agentStatus[agentId] = STATUS_PAUSED;
        _agentPausedAt[agentId] = block.timestamp;

        emit AgentSlashed(agentId, opsCopy, slashPerOperator, failedValidations, totalValidations);
    }

    // =====================================================================
    // V2 FUNCTIONS — Reactivation
    // =====================================================================

    /**
     * @notice Reactivate a paused agent after cooldown, if operators have re-staked
     * @param agentId The agent to reactivate
     */
    function reactivate(uint256 agentId) external {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner(agentId, msg.sender);
        if (_agentStatus[agentId] != STATUS_PAUSED) revert AgentNotPaused(agentId);

        uint256 readyAt = _agentPausedAt[agentId] + reactivationCooldown;
        if (block.timestamp < readyAt) {
            revert CooldownNotElapsed(agentId, readyAt);
        }

        // All operators must still meet minimum stake
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

    // =====================================================================
    // V2 FUNCTIONS — Deregistration
    // =====================================================================

    /**
     * @notice Permanently deregister an agent (owner only)
     * @dev Burns the ERC-721 NFT, removes all operators, and clears agent data.
     *      This action is irreversible.
     * @param agentId The agent to deregister
     */
    function deregister(uint256 agentId) external nonReentrant {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner(agentId, msg.sender);
        if (_agentStatus[agentId] == STATUS_DEREGISTERED) revert AgentAlreadyDeregistered(agentId);

        // Remove all operators
        address[] storage operators = _agentOperators[agentId];
        for (uint256 i = operators.length; i > 0; i--) {
            address op = operators[i - 1];
            _removeOperatorFromAgent(agentId, op);
        }

        // Clear agent data
        delete _agentURIs[agentId];
        _agentStatus[agentId] = STATUS_DEREGISTERED;
        _agentPausedAt[agentId] = 0;

        // Clear V1 operator
        delete _operators[agentId];
        verifiedOperators[agentId] = false;

        address owner = ownerOf(agentId);

        // Burn the ERC-721 NFT (also removes from _agentsByOwner via _update override)
        _burn(agentId);

        emit AgentDeregistered(agentId, owner);
    }

    // =====================================================================
    // V2 FUNCTIONS — Operator Management
    // =====================================================================

    /**
     * @notice Add an operator to an existing agent
     * @param agentId The agent ID
     * @param consent EIP-712 consent data from the operator
     * @param signature The operator's signature
     */
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

    /**
     * @notice Remove an operator from an agent (owner only)
     * @param agentId The agent ID
     * @param operator The operator to remove
     */
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

    /**
     * @notice Operator voluntarily exits an agent
     * @dev If last operator of a StakeSecured/Hybrid agent, the agent is paused
     * @param agentId The agent ID to exit
     */
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

    // =====================================================================
    // V2 VIEW FUNCTIONS
    // =====================================================================

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

    function getAgentPausedAt(uint256 agentId) external view returns (uint256) {
        return _agentPausedAt[agentId];
    }

    function canReactivate(uint256 agentId) external view returns (bool) {
        if (_agentStatus[agentId] != STATUS_PAUSED) return false;
        if (block.timestamp < _agentPausedAt[agentId] + reactivationCooldown) return false;

        address[] storage operators = _agentOperators[agentId];
        for (uint256 i = 0; i < operators.length; i++) {
            uint256 opStake = _getOperatorStake(operators[i]);
            if (opStake < minOperatorStake) return false;
        }
        return true;
    }

    // =====================================================================
    // ADMIN FUNCTIONS
    // =====================================================================

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function setStakingBridge(address _stakingBridge) external onlyRole(DEFAULT_ADMIN_ROLE) {
        stakingBridge = _stakingBridge;
    }

    function setZKVerifier(address _zkVerifier) external onlyRole(DEFAULT_ADMIN_ROLE) {
        zkVerifier = _zkVerifier;
    }

    function setProtocolTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_treasury != address(0), "Zero treasury");
        protocolTreasury = _treasury;
    }

    function setValidationRegistry(address _validationRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        validationRegistry = _validationRegistry;
    }

    function setReputationRegistry(address _reputationRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        reputationRegistry = _reputationRegistry;
    }

    function setMinOperatorStake(uint256 _minOperatorStake) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minOperatorStake = _minOperatorStake;
    }

    function setReactivationCooldown(uint256 _cooldown) external onlyRole(DEFAULT_ADMIN_ROLE) {
        reactivationCooldown = _cooldown;
    }

    // =====================================================================
    // INTERNAL FUNCTIONS
    // =====================================================================

    function _refreshOperatorStatus(uint256 agentId) internal {
        address operator = _operators[agentId];
        if (operator == address(0)) {
            verifiedOperators[agentId] = false;
            emit OperatorStatusChanged(agentId, false, 0);
            return;
        }

        uint256 stake = 0;
        if (stakingBridge != address(0)) {
            (bool success, bytes memory result) = stakingBridge.staticcall(
                abi.encodeWithSignature("getStake(address)", operator)
            );
            if (success && result.length >= 32) {
                stake = abi.decode(result, (uint256));
            }
        }

        bool isVerified = stake >= MIN_OPERATOR_STAKE;
        verifiedOperators[agentId] = isVerified;
        emit OperatorStatusChanged(agentId, isVerified, stake);
    }

    /**
     * @notice Verify EIP-712 operator consent signature
     */
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
     * @notice Read operator stake from the staking bridge
     */
    function _getOperatorStake(address operator) internal view returns (uint256) {
        if (stakingBridge == address(0)) return 0;

        (bool success, bytes memory data) = stakingBridge.staticcall(
            abi.encodeWithSignature("getOperatorStake(address)", operator)
        );
        if (success && data.length >= 32) {
            return abi.decode(data, (uint256));
        }
        return 0;
    }

    /**
     * @notice Query validation stats from the ValidationRegistry
     * @dev Requires ValidationRegistry to expose getAgentValidationStats()
     */
    function _getAgentValidationStats(uint256 agentId) internal view returns (uint256 total, uint256 failed) {
        if (validationRegistry == address(0)) return (0, 0);

        (bool success, bytes memory data) = validationRegistry.staticcall(
            abi.encodeWithSignature("getAgentValidationStats(uint256,uint256)", agentId, 30 days)
        );
        if (success && data.length >= 64) {
            (total, failed) = abi.decode(data, (uint256, uint256));
        }
    }

    /**
     * @notice Execute slash on an operator via the staking bridge
     */
    function _slashOperator(address operator, uint256 amount) internal {
        if (stakingBridge == address(0) || amount == 0) return;

        bytes memory evidence = abi.encodePacked(operator, amount, "AGENT_SLASH");
        (bool success,) = stakingBridge.call(
            abi.encodeWithSignature(
                "requestSlashing(address,uint256,bytes)",
                operator,
                amount,
                evidence
            )
        );
        // Best-effort slash — don't revert if bridge call fails
        // The agent is still paused regardless
    }

    /**
     * @notice Remove an operator from all internal mappings
     */
    function _removeOperatorFromAgent(uint256 agentId, address operator) internal {
        // Remove from _agentOperators[agentId]
        address[] storage agentOps = _agentOperators[agentId];
        for (uint256 i = 0; i < agentOps.length; i++) {
            if (agentOps[i] == operator) {
                agentOps[i] = agentOps[agentOps.length - 1];
                agentOps.pop();
                break;
            }
        }

        // Remove from _operatorAgents[operator]
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

    function _recoverSigner(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        require(signature.length == 65, "Invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        if (v < 27) v += 27;

        return ecrecover(digest, v, r, s);
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

        return from;
    }
}
