// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IERC8004IdentityRegistry.sol";

/**
 * @title ITALIdentityRegistry
 * @notice TAL-specific extensions to ERC-8004 Identity Registry
 * @dev Adds ZK identity commitments, capability verification, and operator status
 *
 * This interface extends the ERC-8004 Identity Registry standard with Tokamak AI Layer
 * specific functionality for managing agent identities, ZK proofs, and operator status.
 *
 * Key Features:
 * - ZK Identity Management: Register and manage Poseidon hash commitments for agents
 * - Capability Verification: Verify agent capabilities using SNARK proofs
 * - Operator Management: Track and verify operator status with stake requirements
 * - Agent Queries: Retrieve agent information and ownership details
 */
interface ITALIdentityRegistry is IERC8004IdentityRegistry {

    // ============ Custom Errors ============

    /// @notice Thrown when an agent with the given ID does not exist
    /// @param agentId The queried agent ID
    error AgentNotFound(uint256 agentId);

    /// @notice Thrown when the caller is not the owner of the agent
    /// @param agentId The agent ID
    /// @param caller The address that attempted the operation
    error NotAgentOwner(uint256 agentId, address caller);

    /// @notice Thrown when attempting to set a ZK identity that has already been set
    /// @param agentId The agent ID with existing ZK identity
    error ZKIdentityAlreadySet(uint256 agentId);

    /// @notice Thrown when a ZK proof verification fails
    error InvalidZKProof();

    /// @notice Thrown when attempting to verify a capability that is already verified
    /// @param agentId The agent ID
    /// @param capabilityHash The capability hash
    error CapabilityAlreadyVerified(uint256 agentId, bytes32 capabilityHash);

    /// @notice Thrown when an operator has not been set for an agent
    /// @param agentId The agent ID
    error OperatorNotSet(uint256 agentId);

    /// @notice Thrown when an operator does not have sufficient stake
    /// @param operator The operator address
    /// @param required The required stake amount
    /// @param actual The actual stake amount
    error InsufficientStake(address operator, uint256 required, uint256 actual);

    // ============ Events ============

    /**
     * @notice Emitted when a ZK identity commitment is set for an agent
     * @param agentId The unique identifier of the agent
     * @param zkCommitment The Poseidon hash commitment of the agent's private identity
     */
    event ZKIdentitySet(uint256 indexed agentId, bytes32 zkCommitment);

    /**
     * @notice Emitted when a capability is verified for an agent via ZK proof
     * @param agentId The unique identifier of the agent
     * @param capabilityHash The hash of the verified capability
     */
    event CapabilityVerified(uint256 indexed agentId, bytes32 indexed capabilityHash);

    /**
     * @notice Emitted when an operator's verification status changes
     * @param agentId The unique identifier of the agent
     * @param isVerified Whether the operator is now verified
     * @param stakeAmount The amount of stake held by the operator
     */
    event OperatorStatusChanged(uint256 indexed agentId, bool isVerified, uint256 stakeAmount);

    /**
     * @notice Emitted when an operator is set for an agent
     * @param agentId The unique identifier of the agent
     * @param operator The address of the assigned operator
     */
    event OperatorSet(uint256 indexed agentId, address indexed operator);

    // ============ ZK Identity Functions ============

    /**
     * @notice Register a new agent with a ZK identity commitment
     *
     * Creates a new agent identity on-chain with an associated ZK commitment.
     * The ZK commitment is a Poseidon hash of the agent's private identity data,
     * allowing for privacy-preserving identity verification through zero-knowledge proofs.
     *
     * @param agentURI The URI pointing to the agent's registration file or metadata
     * @param zkCommitment The Poseidon hash commitment of the agent's private identity
     * @return agentId The unique identifier for the newly registered agent
     *
     * @dev Emits ZKIdentitySet event upon successful registration
     * Requirements:
     * - agentURI must not be empty
     * - zkCommitment must not be zero
     */
    function registerWithZKIdentity(
        string calldata agentURI,
        bytes32 zkCommitment
    ) external returns (uint256 agentId);

    /**
     * @notice Set or update the ZK identity commitment for an existing agent
     *
     * Allows the agent owner to set or update their ZK identity commitment.
     * This commitment represents a privacy-preserving hash of the agent's identity data.
     *
     * @param agentId The agent's unique identifier
     * @param zkCommitment The Poseidon hash commitment of the agent's private identity
     *
     * @dev Emits ZKIdentitySet event upon success
     * Requirements:
     * - Agent must exist
     * - Caller must be the agent owner (inherited from ERC-8004)
     * - ZK identity must not already be set (unless updating via owner)
     * - zkCommitment must not be zero
     */
    function setZKIdentity(uint256 agentId, bytes32 zkCommitment) external;

    /**
     * @notice Retrieve the ZK identity commitment for an agent
     *
     * Fetches the Poseidon hash commitment associated with an agent's identity.
     * This commitment can be used to verify claims about the agent without revealing
     * the underlying private identity data.
     *
     * @param agentId The agent's unique identifier
     * @return The ZK commitment (bytes32(0) if not set)
     */
    function getZKIdentity(uint256 agentId) external view returns (bytes32);

    // ============ Capability Verification ============

    /**
     * @notice Verify a capability for an agent using a zero-knowledge proof
     *
     * Allows verification that an agent possesses a specific capability without
     * revealing the underlying implementation details. Uses SNARK proofs to prove
     * that the capability claim is valid against the agent's ZK identity.
     *
     * @param agentId The agent's unique identifier
     * @param capabilityHash The hash of the capability being verified
     * @param zkProof The SNARK proof proving the capability claim
     * @return success Whether the verification succeeded
     *
     * @dev Emits CapabilityVerified event upon successful verification
     * Requirements:
     * - Agent must exist
     * - Agent must have a ZK identity set
     * - ZK proof must be valid and correctly formatted
     * - Capability must not already be verified for this agent
     *
     * @custom:security The zkProof parameter must be validated by a ZK verifier contract
     */
    function verifyCapability(
        uint256 agentId,
        bytes32 capabilityHash,
        bytes calldata zkProof
    ) external returns (bool success);

    /**
     * @notice Check if a specific capability has been verified for an agent
     *
     * Allows querying whether an agent has already had a particular capability
     * verified on-chain. This is useful for avoiding duplicate verifications and
     * checking agent capability status.
     *
     * @param agentId The agent's unique identifier
     * @param capabilityHash The hash of the capability
     * @return Whether the capability is verified for the agent
     */
    function isCapabilityVerified(uint256 agentId, bytes32 capabilityHash) external view returns (bool);

    /**
     * @notice Retrieve all verified capabilities for an agent
     *
     * Returns a complete list of all capability hashes that have been verified
     * for a given agent. This allows discovery of an agent's verified capabilities.
     *
     * @param agentId The agent's unique identifier
     * @return Array of verified capability hashes
     *
     * @dev This function may be gas-intensive for agents with many verified capabilities
     */
    function getVerifiedCapabilities(uint256 agentId) external view returns (bytes32[] memory);

    // ============ Operator Management ============

    /**
     * @notice Set an operator address for an agent
     *
     * Assigns an operator address that will manage transactions and actions on behalf
     * of an agent. The operator must meet stake requirements as defined by the TAL system.
     * Only the agent owner can set the operator.
     *
     * @param agentId The agent's unique identifier
     * @param operator The operator address to assign
     *
     * @dev Emits OperatorSet event upon success
     * Requirements:
     * - Agent must exist
     * - Caller must be the agent owner
     * - operator must not be address(0)
     * - Operator must have sufficient stake in Staking V2
     */
    function setOperator(uint256 agentId, address operator) external;

    /**
     * @notice Retrieve the operator address for an agent
     *
     * Returns the address of the operator currently assigned to manage this agent.
     * If no operator has been set, returns address(0).
     *
     * @param agentId The agent's unique identifier
     * @return The operator address (address(0) if not set)
     */
    function getOperator(uint256 agentId) external view returns (address);

    /**
     * @notice Check if an agent's operator has sufficient stake and is verified
     *
     * Verifies that the operator assigned to an agent meets the minimum stake
     * requirement as determined by the Staking V2 contract. This is critical for
     * ensuring operator reliability and economic security.
     *
     * @param agentId The agent's unique identifier
     * @return isVerified Whether the operator is verified (meets stake requirement)
     *
     * @dev This function queries the Staking V2 contract for the operator's stake
     * Requirements:
     * - Agent must exist
     * - Operator must be set for the agent
     */
    function checkOperatorStatus(uint256 agentId) external view returns (bool isVerified);

    /**
     * @notice Refresh the cached operator status from the Staking V2 contract
     *
     * Updates the on-chain cache of an operator's verification status by querying
     * the Staking V2 contract. This should be called periodically to ensure the
     * cached status remains synchronized with actual stake amounts.
     *
     * @param agentId The agent's unique identifier
     *
     * @dev Emits OperatorStatusChanged event if status changes
     * Requirements:
     * - Agent must exist
     * - Operator must be set for the agent
     *
     * @custom:gas This is a state-changing operation that may interact with external contracts
     */
    function refreshOperatorStatus(uint256 agentId) external;

    /**
     * @notice Check if an agent's operator is a verified operator in the system
     *
     * Determines whether the operator assigned to an agent is currently verified
     * (i.e., meets the minimum stake requirement and is in good standing).
     *
     * @param agentId The agent's unique identifier
     * @return Whether the agent is a verified operator
     *
     * @dev This checks the cached operator status set by refreshOperatorStatus()
     * Requirements:
     * - Agent must exist
     */
    function isVerifiedOperator(uint256 agentId) external view returns (bool);

    // ============ Query Functions ============

    /**
     * @notice Get the total number of registered agents in the system
     *
     * Returns a count of all agents that have been registered in this identity registry.
     * Useful for pagination and system-wide agent enumeration.
     *
     * @return The total count of registered agents
     */
    function getAgentCount() external view returns (uint256);

    /**
     * @notice Get all agent IDs owned by a specific address
     *
     * Retrieves a list of all agents that are owned by a given address.
     * This is useful for discovering all agents controlled by a particular entity.
     *
     * @param owner The owner address to query
     * @return Array of agent IDs owned by the address
     *
     * @dev This function may be gas-intensive if an owner has many agents
     */
    function getAgentsByOwner(address owner) external view returns (uint256[] memory);

    /**
     * @notice Check if an agent with the given ID exists
     *
     * Provides a simple way to verify that an agent has been registered
     * in the identity registry.
     *
     * @param agentId The agent's unique identifier
     * @return Whether the agent exists
     */
    function agentExists(uint256 agentId) external view returns (bool);
}
