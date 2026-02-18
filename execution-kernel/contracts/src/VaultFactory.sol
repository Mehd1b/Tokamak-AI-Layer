// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IVaultFactory } from "./interfaces/IVaultFactory.sol";
import { IAgentRegistry } from "./interfaces/IAgentRegistry.sol";
import { KernelVault } from "./KernelVault.sol";
import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

/// @title VaultFactory
/// @notice Factory for deploying KernelVault instances with CREATE2
/// @dev Deploys vaults with imageId pinned from AgentRegistry at deployment time.
///      Registry updates do NOT affect already-deployed vaults.
///      Uses UUPS proxy pattern for upgradeability.
contract VaultFactory is IVaultFactory, Initializable, UUPSUpgradeable {
    // ============ State ============

    /// @notice The AgentRegistry contract
    IAgentRegistry public _registry;

    /// @notice The KernelExecutionVerifier contract address
    address public _verifier;

    /// @notice Mapping of deployed vault addresses
    mapping(address => bool) public isDeployedVault;

    /// @notice Ordered list of all deployed vault addresses
    address[] private _deployedVaults;

    /// @notice Contract owner (authorized to upgrade)
    address private _owner;

    /// @notice Storage gap for future upgrades
    uint256[46] private __gap;

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

    /// @notice Initialize the factory (called once via proxy)
    /// @param registry_ The AgentRegistry contract address
    /// @param verifier_ The KernelExecutionVerifier contract address
    /// @param initialOwner The address that will own this contract
    function initialize(address registry_, address verifier_, address initialOwner)
        external
        initializer
    {
        _registry = IAgentRegistry(registry_);
        _verifier = verifier_;
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

    /// @inheritdoc IVaultFactory
    function registry() external view returns (address) {
        return address(_registry);
    }

    /// @inheritdoc IVaultFactory
    function verifier() external view returns (address) {
        return _verifier;
    }

    /// @inheritdoc IVaultFactory
    function computeVaultAddress(
        address owner_,
        bytes32 agentId,
        address asset,
        bytes32 userSalt
    ) external view returns (address vault, bytes32 salt) {
        // Compute CREATE2 salt
        salt = _computeSalt(owner_, agentId, asset, userSalt);

        // Get agent info to include imageId in bytecode
        IAgentRegistry.AgentInfo memory agentInfo = _registry.get(agentId);
        if (!agentInfo.exists) {
            revert AgentNotRegistered(agentId);
        }

        // Compute CREATE2 address
        bytes memory bytecode = _getCreationBytecode(asset, agentId, agentInfo.imageId);
        bytes32 bytecodeHash = keccak256(bytecode);

        vault = address(
            uint160(
                uint256(
                    keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, bytecodeHash))
                )
            )
        );

        return (vault, salt);
    }

    /// @inheritdoc IVaultFactory
    function deployVault(
        bytes32 agentId,
        address asset,
        bytes32 userSalt
    ) external returns (address vault) {
        // Get agent info from registry
        IAgentRegistry.AgentInfo memory agentInfo = _registry.get(agentId);
        if (!agentInfo.exists) {
            revert AgentNotRegistered(agentId);
        }

        // Only the agent author can deploy vaults for their agent
        if (msg.sender != agentInfo.author) {
            revert NotAgentAuthor(agentId, msg.sender, agentInfo.author);
        }

        // Compute CREATE2 salt
        bytes32 salt = _computeSalt(msg.sender, agentId, asset, userSalt);

        // Get creation bytecode with constructor args
        bytes memory bytecode = _getCreationBytecode(asset, agentId, agentInfo.imageId);

        // Deploy with CREATE2
        assembly {
            vault := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        }

        // Verify deployment succeeded
        if (vault == address(0)) {
            revert VaultAlreadyExists(vault);
        }

        // Track deployment
        isDeployedVault[vault] = true;
        _deployedVaults.push(vault);

        emit VaultDeployed(vault, msg.sender, agentId, asset, agentInfo.imageId, salt);

        return vault;
    }

    /// @inheritdoc IVaultFactory
    function vaultCount() external view returns (uint256) {
        return _deployedVaults.length;
    }

    /// @inheritdoc IVaultFactory
    function vaultAt(uint256 index) external view returns (address) {
        return _deployedVaults[index];
    }

    /// @inheritdoc IVaultFactory
    function getAllVaults() external view returns (address[] memory) {
        return _deployedVaults;
    }

    // ============ Internal Functions ============

    /// @notice Compute CREATE2 salt from deployment parameters
    /// @param owner_ The vault owner
    /// @param agentId The agent ID
    /// @param asset The asset address
    /// @param userSalt User-provided salt for uniqueness
    /// @return The CREATE2 salt
    function _computeSalt(
        address owner_,
        bytes32 agentId,
        address asset,
        bytes32 userSalt
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(owner_, agentId, asset, userSalt));
    }

    /// @notice Get the creation bytecode for KernelVault with constructor arguments
    /// @param asset The asset address
    /// @param agentId The agent ID
    /// @param imageId The trusted image ID
    /// @return The creation bytecode
    function _getCreationBytecode(
        address asset,
        bytes32 agentId,
        bytes32 imageId
    ) internal view returns (bytes memory) {
        return abi.encodePacked(
            type(KernelVault).creationCode,
            abi.encode(asset, _verifier, agentId, imageId)
        );
    }
}
