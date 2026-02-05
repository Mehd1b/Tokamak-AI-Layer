// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IERC8004ValidationRegistry.sol";

/**
 * @title ITALValidationRegistry
 * @notice TAL-specific extensions to ERC-8004 Validation Registry
 * @dev Adds DRB validator selection, TEE attestation verification, bounty distribution, and dispute handling
 *
 * This interface provides the core functionality required for the Tokamak AI Layer validation system:
 * - DRB-based validator selection for fair, manipulation-resistant assignment
 * - TEE attestation verification with trusted provider whitelisting
 * - Bounty distribution with configurable fee splits
 * - Dispute mechanism for challenging validation results
 * - Query functions for tracking validation requests and validator performance
 *
 * Implementation should ensure:
 * - All validation requests have proper bounty collateral
 * - TEE attestations are verified against trusted providers
 * - Validators are selected fairly using Commit-Reveal² mechanism
 * - Bounties are distributed correctly to validators, agents, and treasury
 * - Disputes are tracked and resolved by authorized parties
 * - All operations emit appropriate events for off-chain tracking
 */
interface ITALValidationRegistry is IERC8004ValidationRegistry {
    // ============ Custom Errors ============

    /// @notice Raised when attempting to operate on a non-existent validation request
    error ValidationNotFound(bytes32 requestHash);

    /// @notice Raised when attempting to complete a validation that's already been completed
    error ValidationAlreadyCompleted(bytes32 requestHash);

    /// @notice Raised when a validation request has expired and can no longer be processed
    error ValidationExpired(bytes32 requestHash);

    /// @notice Raised when the provided bounty is below the minimum required amount
    error InsufficientBounty(uint256 provided, uint256 required);

    /// @notice Raised when a non-selected validator attempts to submit validation results
    error NotSelectedValidator(bytes32 requestHash, address caller);

    /// @notice Raised when TEE attestation verification fails
    error InvalidTEEAttestation();

    /// @notice Raised when attempting to verify attestation from a non-trusted TEE provider
    error TEEProviderNotTrusted(address provider);

    /// @notice Raised when a validation score is invalid (outside 0-100 range)
    error InvalidScore(uint8 score);

    /// @notice Raised when setting a validation deadline in the past
    error DeadlineInPast(uint256 deadline);

    /// @notice Raised when attempting to dispute a validation that's already under dispute
    error DisputeAlreadyActive(bytes32 requestHash);

    /// @notice Raised when a non-authorized address attempts to dispute a validation
    error NotAuthorizedToDispute(bytes32 requestHash, address caller);

    /// @notice Raised when agent slashing fails (e.g., insufficient stake)
    error SlashingFailed(uint256 agentId);

    // ============ Events ============

    /**
     * @notice Emitted when a validator is selected via DRB
     * @param requestHash The validation request identifier
     * @param validator The selected validator address
     * @param randomSeed The random seed used for selection (from Commit-Reveal²)
     */
    event ValidatorSelected(
        bytes32 indexed requestHash,
        address indexed validator,
        uint256 randomSeed
    );

    /**
     * @notice Emitted when bounty is distributed to validator, agent, and treasury
     * @param requestHash The validation request identifier
     * @param validator The validator receiving their share
     * @param validatorAmount Amount distributed to the validator
     * @param agentAmount Amount distributed to the agent being validated
     * @param treasuryAmount Amount distributed to protocol treasury
     */
    event BountyDistributed(
        bytes32 indexed requestHash,
        address indexed validator,
        uint256 validatorAmount,
        uint256 agentAmount,
        uint256 treasuryAmount
    );

    /**
     * @notice Emitted when a TEE provider is added to or removed from the whitelist
     * @param provider The TEE provider's signing address
     * @param trusted True if added to whitelist, false if removed
     */
    event TEEProviderUpdated(address indexed provider, bool trusted);

    /**
     * @notice Emitted when an agent is slashed due to validation failure
     * @param agentId The unique identifier of the slashed agent
     * @param requestHash The validation request that triggered the slash
     * @param slashAmount The total amount slashed from agent stake
     * @param slashPercentage The percentage of stake that was slashed
     */
    event AgentSlashed(
        uint256 indexed agentId,
        bytes32 indexed requestHash,
        uint256 slashAmount,
        uint256 slashPercentage
    );

    /**
     * @notice Emitted when validation system parameters are updated
     * @param minStakeSecuredBounty New minimum bounty for StakeSecured validation type
     * @param minTEEBounty New minimum bounty for TEEAttested validation type
     * @param protocolFeeBps New protocol fee as basis points (e.g., 1000 = 10%)
     */
    event ValidationParametersUpdated(
        uint256 minStakeSecuredBounty,
        uint256 minTEEBounty,
        uint256 protocolFeeBps
    );

    // ============ Constants ============

    /**
     * @notice Get minimum bounty required for StakeSecured validation type
     * @dev StakeSecured validations use validator stake as security mechanism
     * @return The minimum bounty amount in TON (wei)
     */
    function MIN_STAKE_SECURED_BOUNTY() external view returns (uint256);

    /**
     * @notice Get minimum bounty required for TEEAttested validation type
     * @dev TEEAttested validations require TEE attestation signature verification
     * @return The minimum bounty amount in TON (wei)
     */
    function MIN_TEE_BOUNTY() external view returns (uint256);

    /**
     * @notice Get the protocol fee in basis points
     * @dev This fee is taken from bounty and distributed to treasury
     * Example: 1000 basis points = 10% of bounty goes to treasury
     * @return Fee in basis points
     */
    function PROTOCOL_FEE_BPS() external view returns (uint256);

    /**
     * @notice Get the agent reward percentage in basis points
     * @dev This is the percentage of remaining bounty (after protocol fee) distributed to agent
     * Example: 1000 basis points = 10% of remaining bounty goes to agent
     * @return Reward percentage in basis points
     */
    function AGENT_REWARD_BPS() external view returns (uint256);

    /**
     * @notice Get the validator reward percentage in basis points
     * @dev This is the percentage of remaining bounty (after protocol fee and agent reward) distributed to validator
     * Example: 8000 basis points = 80% of remaining bounty goes to validator
     * @return Reward percentage in basis points
     */
    function VALIDATOR_REWARD_BPS() external view returns (uint256);

    // ============ Validator Selection ============

    /**
     * @notice Select a validator using DRB (Decentralized Random Beacon) for fair assignment
     * @dev Uses Commit-Reveal² mechanism to prevent manipulation and ensure fairness:
     * - Commits are collected from eligible validators in first phase
     * - Random seed is revealed in second phase
     * - Selected validator is determined using hash(randomSeed + request data)
     * - Only one validator is selected per request to ensure single point of validation
     *
     * Requirements:
     * - candidates array must not be empty
     * - all candidates must be registered validators with sufficient stake
     * - selection must occur before validation deadline
     * - only one validator can be selected per request
     *
     * @param requestHash The validation request identifier (typically hash of request data)
     * @param candidates Array of eligible validator addresses to choose from
     * @return selectedValidator The selected validator address from candidates array
     *
     * Emits ValidatorSelected event with selected validator and random seed used
     */
    function selectValidator(
        bytes32 requestHash,
        address[] calldata candidates
    ) external returns (address selectedValidator);

    /**
     * @notice Get the validator selected for a validation request
     * @dev Returns address(0) if no validator has been selected yet
     * @param requestHash The validation request identifier
     * @return The selected validator address, or address(0) if not yet selected
     */
    function getSelectedValidator(bytes32 requestHash) external view returns (address);

    // ============ TEE Attestation ============

    /**
     * @notice Add a trusted TEE attestation provider to the whitelist
     * @dev Only authorized governance can call this function
     * TEE providers must sign attestations with their private key for verification
     * Adding a provider allows their attestations to be verified and accepted
     *
     * Requirements:
     * - provider address must not be zero
     * - provider must not already be in trusted list
     *
     * @param provider The TEE provider's signing address to whitelist
     *
     * Emits TEEProviderUpdated event with provider and trusted=true
     */
    function setTrustedTEEProvider(address provider) external;

    /**
     * @notice Remove a trusted TEE attestation provider from the whitelist
     * @dev Only authorized governance can call this function
     * Removing a provider prevents their attestations from being verified
     *
     * Requirements:
     * - provider must be in trusted list
     *
     * @param provider The TEE provider's address to remove from whitelist
     *
     * Emits TEEProviderUpdated event with provider and trusted=false
     */
    function removeTrustedTEEProvider(address provider) external;

    /**
     * @notice Check if a TEE attestation provider is on the trusted whitelist
     * @param provider The TEE provider's address to check
     * @return Whether the provider is currently trusted
     */
    function isTrustedTEEProvider(address provider) external view returns (bool);

    /**
     * @notice Get all currently trusted TEE attestation providers
     * @return Array of trusted TEE provider addresses
     */
    function getTrustedTEEProviders() external view returns (address[] memory);

    // ============ Dispute Handling ============

    /**
     * @notice Dispute a validation result with evidence supporting the dispute
     * @dev Initiates dispute mechanism when validation result is questionable
     * Disputes can be raised by:
     * - The request originator/agent being validated
     * - Other registered validators
     * - Authorized governance entities
     *
     * The dispute mechanism protects against:
     * - Collusion between validator and requester
     * - Incorrect validation results
     * - Attestation forgery (for TEE-based validations)
     * - Manipulation of validator selection
     *
     * Requirements:
     * - validation must exist and be completed
     * - caller must be authorized to dispute
     * - no other dispute can be active on same request
     * - evidence must be non-empty bytes
     *
     * @param requestHash The validation request identifier to dispute
     * @param evidence Encoded evidence supporting the dispute claim
     *                 Format depends on dispute type being challenged
     *
     * Emits DisputeInitiated event with request and evidence
     */
    function disputeValidation(bytes32 requestHash, bytes calldata evidence) external;

    /**
     * @notice Resolve an active dispute with final determination
     * @dev Only authorized arbiters (governance, dispute committee) can call
     * Resolution determines whether:
     * - Original validation stands (upholdOriginal=true)
     * - Validation is overturned (upholdOriginal=false)
     *
     * Consequences:
     * - If upheld: validator reward is locked, agent may be slashed
     * - If overturned: dispute raiser receives portion of validator stake, validator is slashed
     * - Affected agent validation status is updated accordingly
     *
     * Requirements:
     * - validation must be under active dispute
     * - only authorized arbiters can call
     *
     * @param requestHash The validation request identifier to resolve
     * @param upholdOriginal True to accept original validation, false to overturn it
     *
     * Emits DisputeResolved event with outcome and penalty information
     */
    function resolveDispute(bytes32 requestHash, bool upholdOriginal) external;

    /**
     * @notice Check if a validation request is currently under dispute
     * @param requestHash The validation request identifier to check
     * @return Whether the validation is actively disputed and awaiting resolution
     */
    function isDisputed(bytes32 requestHash) external view returns (bool);

    // ============ Query Functions ============

    /**
     * @notice Get all validation requests initiated by a specific requester
     * @dev Useful for tracking validation history and performance metrics
     * Returns all requests (completed, pending, and disputed)
     *
     * @param requester The requester/agent address to query
     * @return Array of validation request hashes, sorted by timestamp
     */
    function getValidationsByRequester(address requester) external view returns (bytes32[] memory);

    /**
     * @notice Get all validation requests handled by a specific validator
     * @dev Useful for calculating validator rewards and tracking performance
     * Returns only requests where validator was selected and result was submitted
     *
     * @param validator The validator address to query
     * @return Array of validation request hashes handled by this validator
     */
    function getValidationsByValidator(address validator) external view returns (bytes32[] memory);

    /**
     * @notice Get count of pending (incomplete) validation requests for an agent
     * @dev Used to track validation queue and system load
     * Pending validations are those initiated but not yet completed
     *
     * @param agentId The agent's unique identifier
     * @return Number of validations still awaiting completion
     */
    function getPendingValidationCount(uint256 agentId) external view returns (uint256);

    /**
     * @notice Get the treasury address that receives protocol fees
     * @dev Treasury is controlled by governance and receives portion of each bounty
     * Treasury funds are used for protocol maintenance and development
     *
     * @return The address of the protocol treasury
     */
    function getTreasury() external view returns (address);

    // ============ Admin Functions ============

    /**
     * @notice Set the treasury address for protocol fee collection
     * @dev Only authorized governance can call this function
     * Treasury address receives PROTOCOL_FEE_BPS percentage of each bounty
     *
     * Requirements:
     * - newTreasury must not be zero address
     * - caller must have governance authority
     *
     * @param treasury The new treasury address to receive protocol fees
     *
     * Emits TreasuryUpdated event with new address
     */
    function setTreasury(address treasury) external;

    /**
     * @notice Update validation system parameters (governance only)
     * @dev This function allows fine-tuning of the validation system economics
     * Parameters control:
     * - Minimum bounty amounts for different validation types
     * - Fee distribution percentages across stakeholders
     * - Economic incentives and security properties
     *
     * Bounty Calculation Example:
     * If bounty = 100 TON, protocolFeeBps = 1000 (10%), agentRewardBps = 1000 (10% of remainder):
     * - Protocol gets: 100 * 1000 / 10000 = 10 TON
     * - Remaining: 90 TON
     * - Agent gets: 90 * 1000 / 10000 = 9 TON
     * - Validator gets: remainder after agent share
     *
     * Requirements:
     * - All basis point values must be <= 10000 (100%)
     * - Sum of agent + validator rewards should not exceed 10000
     * - Protocol fee should be reasonable (typically 5-20%)
     * - Minimum bounties should reflect cost of validation work
     *
     * @param minStakeSecuredBounty New minimum bounty for StakeSecured validations (in wei)
     * @param minTEEBounty New minimum bounty for TEEAttested validations (in wei)
     * @param protocolFeeBps New protocol fee as basis points (10000 = 100%)
     *
     * Emits ValidationParametersUpdated event with new values
     */
    function updateValidationParameters(
        uint256 minStakeSecuredBounty,
        uint256 minTEEBounty,
        uint256 protocolFeeBps
    ) external;
}
