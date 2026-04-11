// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IAgentRegistry } from "./interfaces/IAgentRegistry.sol";
import { IVaultFactory } from "./interfaces/IVaultFactory.sol";
import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

/// @notice Minimal interface for vault checks during unregistration
interface IKernelVaultView {
    function agentId() external view returns (bytes32);
    function totalAssets() external view returns (uint256);
}

/// @title AgentRegistry
/// @notice Permissionless registry for agent registration
/// @dev Agents are identified by a deterministic ID: keccak256(author, salt)
///      Only the original author can update an agent's configuration.
///      Uses UUPS proxy pattern for upgradeability.
contract AgentRegistry is IAgentRegistry, Initializable, UUPSUpgradeable {
    // ============ State ============

    /// @notice Mapping from agentId to agent information
    mapping(bytes32 => AgentInfo) internal _agents;

    /// @notice Ordered list of all registered agent IDs
    bytes32[] private _agentIds;

    /// @notice Contract owner (authorized to upgrade)
    address private _owner;

    /// @notice VaultFactory address (for querying agent vaults during unregister)
    address private _factory;

    /// @notice Mapping from agentId to its index in _agentIds array (for O(1) removal)
    mapping(bytes32 => uint256) internal _agentIdIndex;

    /// @notice Maximum number of vaults checked during unregister (prevents OOG)
    uint256 public constant MAX_VAULTS_PER_UNREGISTER = 50;

    /// @notice Mapping from agentId to deprecation status
    mapping(bytes32 => bool) internal _deprecated;

    /// @notice Mapping from agentId to successor agentId
    mapping(bytes32 => bytes32) internal _successors;

    /// @notice Mapping of agent ID to metadata URI (IPFS/HTTPS pointer to JSON)
    mapping(bytes32 => string) internal _agentMetadataURI;

    // ─────────────────────────────────────────────────────────────────────
    // UUPS implementation-upgrade timelock state
    // ─────────────────────────────────────────────────────────────────────
    // The registry proxy's `_authorizeUpgrade` previously only enforced
    // `onlyOwner`, allowing a single-transaction implementation swap by a
    // compromised owner key. The new flow requires an upgrade candidate
    // to be scheduled via `scheduleImplementation` and to sit for at
    // least `UPGRADE_DELAY` before any `upgradeTo`/`upgradeToAndCall`
    // call can take effect.
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Mandatory delay between scheduling and activating a UUPS upgrade.
    uint256 public constant UPGRADE_DELAY = 48 hours;

    /// @notice Implementation currently scheduled for upgrade.
    address public pendingImplementation;

    /// @notice Earliest `block.timestamp` at which the pending
    ///         implementation may be activated.
    uint256 public pendingImplementationActivatesAt;

    /// @notice Proposed owner awaiting acceptance (two-step ownership transfer).
    address public pendingOwner;

    /// @notice Storage gap for future upgrades. Reduced from 43 → 40 slots
    ///         to accommodate the new state above.
    uint256[40] private __gap;

    // ============ Errors ============

    /// @notice Caller is not the owner
    error OwnableUnauthorizedAccount(address account);

    /// @notice Too many vaults to check during unregister — empty some vaults first
    error TooManyVaultsToUnregister(bytes32 agentId, uint256 vaultCount, uint256 maxAllowed);

    /// @notice Upgrade attempted without a matching scheduled proposal
    error UpgradeNotScheduled(address attempted);

    /// @notice Upgrade attempted before the scheduling timelock elapsed
    error UpgradeTimelockNotElapsed(uint256 currentTime, uint256 activatesAt);

    /// @notice No implementation upgrade is currently pending
    error NoPendingImplementation();

    /// @notice Ownership acceptance attempted by the wrong caller
    error NotPendingOwner(address caller, address expected);

    /// @notice No pending ownership transfer exists
    error NoPendingOwner();

    /// @notice Zero implementation address
    error ZeroImplementation();

    // ============ Events ============

    /// @notice Emitted when ownership is transferred
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /// @notice Emitted when the factory address is updated
    event FactoryUpdated(address indexed previousFactory, address indexed newFactory);

    /// @notice Emitted when a UUPS implementation upgrade is scheduled.
    event ImplementationScheduled(address indexed implementation, uint256 activatesAt);

    /// @notice Emitted when a scheduled UUPS upgrade is cancelled.
    event ImplementationCancelled(address indexed implementation);

    /// @notice Emitted when an ownership transfer is proposed.
    event OwnershipTransferProposed(address indexed currentOwner, address indexed proposedOwner);

    // ============ Modifiers ============

    /// @notice Restricts function access to the contract owner
    modifier onlyOwner() {
        if (msg.sender != _owner) revert OwnableUnauthorizedAccount(msg.sender);
        _;
    }

    // ============ Constructor ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ============ Initializer ============

    /// @notice Initialize the registry (called once via proxy)
    /// @param initialOwner The address that will own this contract
    function initialize(address initialOwner) external initializer {
        require(initialOwner != address(0), "zero owner");
        _owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    // ============ Owner Functions ============

    /// @notice Returns the current owner
    function owner() external view returns (address) {
        return _owner;
    }

    /// @notice Propose a new owner. Completes only when the proposed
    ///         owner explicitly calls `acceptOwnership`. Pass address(0)
    ///         to cancel a pending proposal.
    /// @param newOwner The proposed owner address
    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferProposed(_owner, newOwner);
    }

    /// @notice Accept a pending ownership transfer. Callable only by
    ///         the proposed owner.
    function acceptOwnership() external {
        address proposed = pendingOwner;
        if (proposed == address(0)) revert NoPendingOwner();
        if (msg.sender != proposed) revert NotPendingOwner(msg.sender, proposed);
        address previous = _owner;
        _owner = proposed;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, proposed);
    }

    /// @notice Returns the VaultFactory address
    function factory() external view returns (address) {
        return _factory;
    }

    /// @notice Set the VaultFactory address (for querying agent vaults during unregister)
    /// @param factory_ The VaultFactory contract address
    function setFactory(address factory_) external onlyOwner {
        require(factory_ != address(0), "zero factory");
        address previous = _factory;
        _factory = factory_;
        emit FactoryUpdated(previous, factory_);
    }

    // ============ UUPS Implementation Upgrade Scheduling ============

    /// @notice Schedule a UUPS implementation upgrade. Overwrites any
    ///         previously pending upgrade.
    /// @param newImplementation Implementation contract to schedule.
    function scheduleImplementation(address newImplementation) external onlyOwner {
        if (newImplementation == address(0)) revert ZeroImplementation();
        pendingImplementation = newImplementation;
        pendingImplementationActivatesAt = block.timestamp + UPGRADE_DELAY;
        emit ImplementationScheduled(newImplementation, pendingImplementationActivatesAt);
    }

    /// @notice Cancel a scheduled UUPS upgrade before activation.
    function cancelImplementation() external onlyOwner {
        if (pendingImplementation == address(0)) revert NoPendingImplementation();
        emit ImplementationCancelled(pendingImplementation);
        pendingImplementation = address(0);
        pendingImplementationActivatesAt = 0;
    }

    /// @notice Authorize upgrade (only owner, scheduled, timelocked).
    ///         An implementation MUST have been scheduled via
    ///         `scheduleImplementation` and the `UPGRADE_DELAY` must
    ///         have elapsed before an upgrade transaction can succeed.
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        if (newImplementation != pendingImplementation || newImplementation == address(0)) {
            revert UpgradeNotScheduled(newImplementation);
        }
        if (block.timestamp < pendingImplementationActivatesAt) {
            revert UpgradeTimelockNotElapsed(block.timestamp, pendingImplementationActivatesAt);
        }
        pendingImplementation = address(0);
        pendingImplementationActivatesAt = 0;
    }

    // ============ External Functions ============

    /// @inheritdoc IAgentRegistry
    function computeAgentId(address author, bytes32 salt) external pure returns (bytes32) {
        return _computeAgentId(author, salt);
    }

    /// @inheritdoc IAgentRegistry
    function register(bytes32 salt, bytes32 imageId, bytes32 agentCodeHash)
        external
        returns (bytes32 agentId)
    {
        // Validate inputs
        if (imageId == bytes32(0)) revert InvalidImageId();
        if (agentCodeHash == bytes32(0)) revert InvalidAgentCodeHash();

        // Compute deterministic agentId
        agentId = _computeAgentId(msg.sender, salt);

        // Check agent doesn't already exist
        if (_agents[agentId].exists) {
            revert AgentAlreadyExists(agentId);
        }

        // Store agent info
        _agents[agentId] = AgentInfo({
            author: msg.sender,
            imageId: imageId,
            agentCodeHash: agentCodeHash,
            _deprecated: "",
            exists: true
        });

        // Track agent ID for enumeration (store index for O(1) removal)
        _agentIdIndex[agentId] = _agentIds.length;
        _agentIds.push(agentId);

        emit AgentRegistered(agentId, msg.sender, imageId, agentCodeHash);

        return agentId;
    }

    /// @inheritdoc IAgentRegistry
    function update(bytes32 agentId, bytes32 newImageId, bytes32 newAgentCodeHash) external {
        // Check agent exists
        AgentInfo storage agent = _agents[agentId];
        if (!agent.exists) {
            revert AgentNotFound(agentId);
        }

        // Check caller is the author
        if (msg.sender != agent.author) {
            revert NotAgentAuthor(agentId, msg.sender, agent.author);
        }

        // Validate inputs
        if (newImageId == bytes32(0)) revert InvalidImageId();
        if (newAgentCodeHash == bytes32(0)) revert InvalidAgentCodeHash();

        // Update agent info
        agent.imageId = newImageId;
        agent.agentCodeHash = newAgentCodeHash;

        emit AgentUpdated(agentId, newImageId, newAgentCodeHash);
    }

    /// @inheritdoc IAgentRegistry
    function unregister(bytes32 agentId) external {
        AgentInfo storage agent = _agents[agentId];
        if (!agent.exists) revert AgentNotFound(agentId);
        if (msg.sender != agent.author) revert NotAgentAuthor(agentId, msg.sender, agent.author);

        // Query factory for all vaults deployed for this agent
        require(_factory != address(0), "factory not set");
        address[] memory vaults = IVaultFactory(_factory).getAgentVaults(agentId);
        if (vaults.length > MAX_VAULTS_PER_UNREGISTER) {
            revert TooManyVaultsToUnregister(agentId, vaults.length, MAX_VAULTS_PER_UNREGISTER);
        }
        for (uint256 i = 0; i < vaults.length; i++) {
            uint256 assets = IKernelVaultView(vaults[i]).totalAssets();
            if (assets > 0) revert VaultHasDeposits(vaults[i], assets);
        }

        // Save author for event before deletion
        address author = agent.author;

        // Remove from agents mapping
        delete _agents[agentId];

        // Remove from _agentIds array using O(1) swap-and-pop with stored index
        uint256 idx = _agentIdIndex[agentId];
        uint256 lastIdx = _agentIds.length - 1;
        if (idx != lastIdx) {
            bytes32 lastId = _agentIds[lastIdx];
            _agentIds[idx] = lastId;
            _agentIdIndex[lastId] = idx;
        }
        _agentIds.pop();
        delete _agentIdIndex[agentId];

        // M-26: clear deprecation flag and successor link so off-chain consumers
        // do not get misdirected to a non-existent agent.
        delete _deprecated[agentId];
        delete _successors[agentId];

        emit AgentUnregistered(agentId, author);
    }

    /// @inheritdoc IAgentRegistry
    function get(bytes32 agentId) external view returns (AgentInfo memory info) {
        return _agents[agentId];
    }

    /// @inheritdoc IAgentRegistry
    function agentExists(bytes32 agentId) external view returns (bool) {
        return _agents[agentId].exists;
    }

    /// @inheritdoc IAgentRegistry
    function agentCount() external view returns (uint256) {
        return _agentIds.length;
    }

    /// @inheritdoc IAgentRegistry
    function agentAt(uint256 index) external view returns (bytes32) {
        return _agentIds[index];
    }

    /// @inheritdoc IAgentRegistry
    function getAllAgentIds() external view returns (bytes32[] memory) {
        return _agentIds;
    }

    /// @inheritdoc IAgentRegistry
    function deprecate(bytes32 agentId) external {
        AgentInfo storage agent = _agents[agentId];
        if (!agent.exists) revert AgentNotFound(agentId);
        if (msg.sender != agent.author) revert NotAgentAuthor(agentId, msg.sender, agent.author);
        if (_deprecated[agentId]) revert AgentAlreadyDeprecated(agentId);

        _deprecated[agentId] = true;

        emit AgentDeprecated(agentId, msg.sender);
    }

    /// @inheritdoc IAgentRegistry
    function undeprecate(bytes32 agentId) external {
        AgentInfo storage agent = _agents[agentId];
        if (!agent.exists) revert AgentNotFound(agentId);
        if (msg.sender != agent.author) revert NotAgentAuthor(agentId, msg.sender, agent.author);
        if (!_deprecated[agentId]) revert AgentNotDeprecated(agentId);

        _deprecated[agentId] = false;
        delete _successors[agentId];

        emit AgentUndeprecated(agentId, msg.sender);
    }

    /// @inheritdoc IAgentRegistry
    /// @dev L-45 fix: walk the successor chain to reject multi-hop cycles.
    ///      Previously only direct self-loops (`A → A`) were blocked, so
    ///      `setSuccessor(A, B)` followed by `setSuccessor(B, A)` created
    ///      an unbounded traversal for any consumer following successor links.
    function setSuccessor(bytes32 agentId, bytes32 successorAgentId) external {
        AgentInfo storage agent = _agents[agentId];
        if (!agent.exists) revert AgentNotFound(agentId);
        if (msg.sender != agent.author) revert NotAgentAuthor(agentId, msg.sender, agent.author);
        if (!_deprecated[agentId]) revert AgentNotDeprecated(agentId);
        if (!_agents[successorAgentId].exists) revert SuccessorDoesNotExist(successorAgentId);
        if (agentId == successorAgentId) revert CannotSucceedSelf(agentId);

        // L-45: cycle detection — walk the successor chain starting at the
        // proposed successor and abort if we encounter `agentId`.
        bytes32 current = successorAgentId;
        uint256 maxDepth = 64; // hard cap to bound gas
        for (uint256 i = 0; i < maxDepth; i++) {
            bytes32 next = _successors[current];
            if (next == bytes32(0)) break;
            if (next == agentId) revert CannotSucceedSelf(agentId);
            current = next;
        }

        _successors[agentId] = successorAgentId;

        emit AgentSuccessorSet(agentId, successorAgentId);
    }

    /// @inheritdoc IAgentRegistry
    function isDeprecated(bytes32 agentId) external view returns (bool) {
        return _deprecated[agentId];
    }

    /// @inheritdoc IAgentRegistry
    function getSuccessor(bytes32 agentId) external view returns (bytes32) {
        return _successors[agentId];
    }

    // ============ Metadata Functions ============

    /// @notice Set metadata URI for an agent (name, description, tags, source repo)
    /// @param agentId The agent to set metadata for
    /// @param uri URI pointing to JSON metadata (IPFS, HTTPS, Arweave, etc.)
    function setMetadataURI(bytes32 agentId, string calldata uri) external {
        AgentInfo storage agent = _agents[agentId];
        require(agent.exists, "AgentDoesNotExist");
        require(agent.author == msg.sender, "NotAgentAuthor");
        _agentMetadataURI[agentId] = uri;
        emit AgentMetadataUpdated(agentId, uri);
    }

    /// @notice Get the metadata URI for an agent
    /// @param agentId The agent to query
    /// @return The metadata URI string (empty if not set)
    function getMetadataURI(bytes32 agentId) external view returns (string memory) {
        return _agentMetadataURI[agentId];
    }

    // ============ Internal Functions ============

    /// @notice Compute deterministic agent ID
    /// @param author The agent author's address
    /// @param salt A unique salt chosen by the author
    /// @return The deterministic agent ID
    function _computeAgentId(address author, bytes32 salt) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(author, salt));
    }
}
