// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title IERC8004IdentityRegistry
 * @notice ERC-8004 standard interface for trustless AI agent identity registry
 * @dev Extends ERC-721 for agent identity NFTs
 */
interface IERC8004IdentityRegistry is IERC721 {
    /// @notice Emitted when a new agent is registered
    event Registered(uint256 indexed agentId, address indexed owner, string agentURI);

    /// @notice Emitted when an agent's URI is updated
    event AgentURIUpdated(uint256 indexed agentId, string newURI);

    /// @notice Emitted when agent metadata is updated
    event MetadataUpdated(uint256 indexed agentId, string key);

    /// @notice Emitted when an agent wallet is verified
    event AgentWalletVerified(uint256 indexed agentId, address wallet);

    /**
     * @notice Register a new agent identity
     * @param agentURI The URI pointing to the agent's registration file (IPFS or HTTPS)
     * @return agentId The unique identifier for the registered agent
     */
    function register(string calldata agentURI) external returns (uint256 agentId);

    /**
     * @notice Update the URI for an agent
     * @param agentId The agent's unique identifier
     * @param newURI The new URI for the agent's registration file
     */
    function updateAgentURI(uint256 agentId, string calldata newURI) external;

    /**
     * @notice Get the URI for an agent
     * @param agentId The agent's unique identifier
     * @return The agent's registration file URI
     */
    function agentURI(uint256 agentId) external view returns (string memory);

    /**
     * @notice Set arbitrary metadata for an agent
     * @param agentId The agent's unique identifier
     * @param key The metadata key
     * @param value The metadata value (arbitrary bytes)
     */
    function setMetadata(uint256 agentId, string calldata key, bytes calldata value) external;

    /**
     * @notice Get metadata for an agent
     * @param agentId The agent's unique identifier
     * @param key The metadata key
     * @return The metadata value
     */
    function getMetadata(uint256 agentId, string calldata key) external view returns (bytes memory);

    /**
     * @notice Verify that a wallet belongs to an agent using EIP-712 or ERC-1271 signature
     * @param agentId The agent's unique identifier
     * @param wallet The wallet address to verify
     * @param signature The signature proving wallet ownership
     */
    function verifyAgentWallet(uint256 agentId, address wallet, bytes calldata signature) external;

    /**
     * @notice Check if a wallet is verified for an agent
     * @param agentId The agent's unique identifier
     * @param wallet The wallet address to check
     * @return True if the wallet is verified for the agent
     */
    function isVerifiedWallet(uint256 agentId, address wallet) external view returns (bool);
}
