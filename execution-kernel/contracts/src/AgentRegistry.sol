// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IAgentRegistry } from "./interfaces/IAgentRegistry.sol";
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

    /// @notice Storage gap for future upgrades
    uint256[48] private __gap;

    // ============ Errors ============

    /// @notice Caller is not the owner
    error OwnableUnauthorizedAccount(address account);

    // ============ Events ============

    /// @notice Emitted when ownership is transferred
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

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
        _owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    // ============ Owner Functions ============

    /// @notice Returns the current owner
    function owner() external view returns (address) {
        return _owner;
    }

    // ============ UUPS ============

    /// @notice Authorize upgrade (only owner)
    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ============ External Functions ============

    /// @inheritdoc IAgentRegistry
    function computeAgentId(address author, bytes32 salt) external pure returns (bytes32) {
        return _computeAgentId(author, salt);
    }

    /// @inheritdoc IAgentRegistry
    function register(
        bytes32 salt,
        bytes32 imageId,
        bytes32 agentCodeHash
    ) external returns (bytes32 agentId) {
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

        // Track agent ID for enumeration
        _agentIds.push(agentId);

        emit AgentRegistered(agentId, msg.sender, imageId, agentCodeHash);

        return agentId;
    }

    /// @inheritdoc IAgentRegistry
    function update(
        bytes32 agentId,
        bytes32 newImageId,
        bytes32 newAgentCodeHash
    ) external {
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
    function unregister(bytes32 agentId, address[] calldata vaults) external {
        AgentInfo storage agent = _agents[agentId];
        if (!agent.exists) revert AgentNotFound(agentId);
        if (msg.sender != agent.author) revert NotAgentAuthor(agentId, msg.sender, agent.author);

        // Verify all provided vaults are empty
        for (uint256 i = 0; i < vaults.length; i++) {
            address vault = vaults[i];

            // Must be a deployed contract
            if (vault.code.length == 0) revert VaultNotDeployed(vault);

            // Must belong to this agent
            bytes32 vaultAgentId = IKernelVaultView(vault).agentId();
            if (vaultAgentId != agentId) revert VaultAgentIdMismatch(vault, agentId, vaultAgentId);

            // Must have zero deposits
            uint256 assets = IKernelVaultView(vault).totalAssets();
            if (assets > 0) revert VaultHasDeposits(vault, assets);
        }

        // Save author for event before deletion
        address author = agent.author;

        // Remove from agents mapping
        delete _agents[agentId];

        // Remove from _agentIds array (swap-and-pop)
        uint256 len = _agentIds.length;
        for (uint256 i = 0; i < len; i++) {
            if (_agentIds[i] == agentId) {
                _agentIds[i] = _agentIds[len - 1];
                _agentIds.pop();
                break;
            }
        }

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

    // ============ Internal Functions ============

    /// @notice Compute deterministic agent ID
    /// @param author The agent author's address
    /// @param salt A unique salt chosen by the author
    /// @return The deterministic agent ID
    function _computeAgentId(address author, bytes32 salt) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(author, salt));
    }
}
