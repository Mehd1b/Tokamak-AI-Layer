// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title IVaultFactory
/// @notice Interface for CREATE2 vault deployment factory
interface IVaultFactory {
    /// @notice Compute the deterministic vault address before deployment
    /// @param owner The vault owner's address
    /// @param agentId The agent ID from AgentRegistry
    /// @param asset The ERC20 asset address (or address(0) for ETH)
    /// @param userSalt A unique salt chosen by the user
    /// @return vault The computed vault address
    /// @return salt The CREATE2 salt used for deployment
    function computeVaultAddress(
        address owner,
        bytes32 agentId,
        address asset,
        bytes32 userSalt
    ) external view returns (address vault, bytes32 salt);

    /// @notice Deploy a new vault with pinned imageId from registry
    /// @param agentId The agent ID from AgentRegistry
    /// @param asset The ERC20 asset address (or address(0) for ETH)
    /// @param userSalt A unique salt for deterministic deployment
    /// @param expectedImageId The expected imageId (must match registry to prevent race conditions)
    /// @return vault The deployed vault address
    function deployVault(
        bytes32 agentId,
        address asset,
        bytes32 userSalt,
        bytes32 expectedImageId
    ) external returns (address vault);

    /// @notice Deploy a new OptimisticKernelVault for an agent
    /// @param agentId The agent ID to bind the vault to
    /// @param asset The ERC20 asset address (or address(0) for ETH)
    /// @param userSalt User-provided salt for CREATE2 address prediction
    /// @param expectedImageId The expected RISC Zero image ID (verified against registry)
    /// @param bondChainId The L1 chain ID where bonds are locked (e.g., 1 for Ethereum)
    /// @param challengeWindow Initial challenge window in seconds
    /// @return vault The deployed OptimisticKernelVault address
    function deployOptimisticVault(
        bytes32 agentId,
        address asset,
        bytes32 userSalt,
        bytes32 expectedImageId,
        uint256 bondChainId,
        uint256 challengeWindow
    ) external returns (address vault);

    /// @notice Compute the deterministic optimistic vault address before deployment
    /// @param owner The vault owner's address
    /// @param agentId The agent ID from AgentRegistry
    /// @param asset The ERC20 asset address (or address(0) for ETH)
    /// @param userSalt A unique salt chosen by the user
    /// @param bondChainId The L1 chain ID where bonds are locked
    /// @return vault The computed vault address
    /// @return salt The CREATE2 salt used for deployment
    function computeOptimisticVaultAddress(
        address owner,
        bytes32 agentId,
        address asset,
        bytes32 userSalt,
        uint256 bondChainId
    ) external view returns (address vault, bytes32 salt);

    /// @notice Image ID changed between computeVaultAddress and deployVault
    error ImageIdChanged(bytes32 expected, bytes32 actual);

    /// @notice Get the AgentRegistry address
    /// @return The registry contract address
    function registry() external view returns (address);

    /// @notice Get the KernelExecutionVerifier address
    /// @return The verifier contract address
    function verifier() external view returns (address);

    /// @notice Check if an address is a vault deployed by this factory
    /// @param vault The address to check
    /// @return True if the vault was deployed by this factory
    function isDeployedVault(address vault) external view returns (bool);

    /// @notice Get the total number of deployed vaults
    /// @return The number of deployed vaults
    function vaultCount() external view returns (uint256);

    /// @notice Get the vault address at a specific index
    /// @param index The index in the vault list
    /// @return The vault address at that index
    function vaultAt(uint256 index) external view returns (address);

    /// @notice Get all deployed vault addresses
    /// @return All vault addresses as an array
    function getAllVaults() external view returns (address[] memory);

    /// @notice Get all vault addresses deployed for a specific agent
    /// @param agentIdQuery The agent ID to query
    /// @return All vault addresses for that agent
    function getAgentVaults(bytes32 agentIdQuery) external view returns (address[] memory);

    /// @notice Get the VaultCreationCodeStore address
    /// @return The code store contract whose runtime bytecode is KernelVault creation code
    function vaultCreationCodeStore() external view returns (address);

    /// @notice Get the OptimisticVaultCreationCodeStore address
    /// @return The code store contract whose runtime bytecode is OptimisticKernelVault creation code
    function optimisticVaultCreationCodeStore() external view returns (address);

    /// @notice Emitted when a vault is deployed
    event VaultDeployed(
        address indexed vault,
        address indexed owner,
        bytes32 indexed agentId,
        address asset,
        bytes32 trustedImageId,
        bytes32 salt
    );

    /// @notice Emitted when an optimistic vault is deployed
    event OptimisticVaultDeployed(
        address indexed vault,
        bytes32 indexed agentId,
        address indexed owner,
        uint256 bondChainId
    );

    /// @notice Register an externally deployed vault with the factory
    /// @dev Allows the factory owner to register vaults that were deployed directly
    ///      (e.g., when creation code exceeds block gas limits for code store deployment).
    ///      The vault must have code at the given address.
    /// @param vault The vault address to register
    /// @param agentId The agent ID the vault is bound to
    function registerExternalVault(address vault, bytes32 agentId) external;

    /// @notice Emitted when an external vault is registered
    event ExternalVaultRegistered(address indexed vault, bytes32 indexed agentId);

    /// @notice Agent not registered in the registry
    error AgentNotRegistered(bytes32 agentId);

    /// @notice Caller is not the agent author
    error NotAgentAuthor(bytes32 agentId, address caller, address author);

    /// @notice Vault already exists at computed address
    error VaultAlreadyExists(address vault);
}
