// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/ITALIdentityRegistry.sol";

/**
 * @title TALIdentityRegistry
 * @notice Tokamak Agent Layer identity registry for AI agents
 * @dev Implements ERC-8004 + TAL extensions with UUPS upgradeability
 *
 * This contract serves as the core identity layer for the Tokamak AI Layer (TAL),
 * providing a decentralized registry for AI agent identities. Each agent is
 * represented as an ERC-721 NFT with associated metadata, ZK identity commitments,
 * and operator management capabilities.
 *
 * Key Features:
 * - ERC-721 based identity tokens for AI agents
 * - ZK identity commitments using Poseidon hashes for privacy-preserving verification
 * - Capability verification through SNARK proofs
 * - Operator management with stake-based verification via Staking V3 (cross-layer bridge)
 * - EIP-712 signature-based wallet verification
 * - UUPS upgradeable proxy pattern for future improvements
 *
 * Security Considerations:
 * - Uses OpenZeppelin's battle-tested upgradeable contracts
 * - Implements reentrancy guards on state-changing functions
 * - Pausable in case of emergencies
 * - Role-based access control for admin functions
 */
contract TALIdentityRegistry is
    ERC721Upgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    PausableUpgradeable,
    ReentrancyGuard,
    ITALIdentityRegistry
{
    // ============ Constants ============

    /// @notice Role identifier for accounts allowed to upgrade the contract
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    /// @notice Role identifier for accounts allowed to pause/unpause the contract
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice Minimum stake required for an operator to be verified (1000 TON)
    /// @dev Enforced via cross-layer bridge from Staking V3 on L1
    uint256 public constant MIN_OPERATOR_STAKE = 1000 ether;

    /// @notice EIP-712 typehash for wallet verification signatures
    bytes32 private constant WALLET_VERIFICATION_TYPEHASH =
        keccak256("WalletVerification(uint256 agentId,address wallet,uint256 nonce)");

    // ============ State Variables ============

    /// @notice Counter for token IDs, starts at 1
    uint256 private _nextTokenId;

    /// @notice Agent URI mapping (agentId => URI)
    mapping(uint256 => string) private _agentURIs;

    /// @notice Agent metadata mapping (agentId => key => value)
    mapping(uint256 => mapping(string => bytes)) private _metadata;

    /// @notice ZK identity commitments (agentId => Poseidon commitment)
    mapping(uint256 => bytes32) public zkIdentities;

    /// @notice Verified capabilities (agentId => capabilityHash => verified)
    mapping(uint256 => mapping(bytes32 => bool)) public zkCapabilities;

    /// @notice List of verified capabilities per agent (for enumeration)
    mapping(uint256 => bytes32[]) private _verifiedCapabilitiesList;

    /// @notice Verified operator status (agentId => isVerified)
    mapping(uint256 => bool) public verifiedOperators;

    /// @notice Verified wallets (agentId => wallet => verified)
    mapping(uint256 => mapping(address => bool)) private _verifiedWallets;

    /// @notice Operator addresses (agentId => operator)
    mapping(uint256 => address) private _operators;

    /// @notice Agents by owner (owner => agentIds)
    mapping(address => uint256[]) private _agentsByOwner;

    /// @notice Wallet verification nonces to prevent replay attacks
    mapping(address => uint256) public walletNonces;

    /// @notice Staking bridge contract address for operator stake verification (L2 cache of L1 Staking V3)
    address public stakingBridge;

    /// @notice ZK Verifier module address for capability proof verification
    address public zkVerifier;

    /// @notice EIP-712 domain separator for signature verification
    bytes32 private _domainSeparator;

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
     * @param admin The admin address that will receive all admin roles
     * @param _stakingBridge The Staking bridge contract address (L2 cache of L1 Staking V3)
     * @param _zkVerifier The ZK Verifier module address for proof verification
     *
     * @dev This function can only be called once due to the initializer modifier.
     * It sets up all inherited contracts and grants initial roles to the admin.
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
        _nextTokenId = 1; // Start from 1, 0 is reserved as invalid

        // Build EIP-712 domain separator for signature verification
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

    // ============ ERC-8004 Identity Functions ============

    /**
     * @inheritdoc IERC8004IdentityRegistry
     * @dev Mints a new agent identity NFT to the caller and stores the agent URI.
     * The agent ID is auto-incremented starting from 1.
     */
    function register(string calldata _agentURI) external whenNotPaused nonReentrant returns (uint256 agentId) {
        agentId = _nextTokenId++;
        _safeMint(msg.sender, agentId);
        _agentURIs[agentId] = _agentURI;
        // Note: _agentsByOwner is updated in _update() override, no need to add here

        emit Registered(agentId, msg.sender, _agentURI);
    }

    /**
     * @inheritdoc IERC8004IdentityRegistry
     * @dev Only the agent owner can update the URI. The URI typically points to
     * an IPFS or HTTPS location containing the agent's registration metadata.
     */
    function updateAgentURI(uint256 agentId, string calldata newURI) external {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner(agentId, msg.sender);

        _agentURIs[agentId] = newURI;
        emit AgentURIUpdated(agentId, newURI);
    }

    /**
     * @inheritdoc IERC8004IdentityRegistry
     * @dev Returns the URI associated with the agent, which should point to
     * a JSON file containing the agent's registration metadata.
     */
    function agentURI(uint256 agentId) external view returns (string memory) {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        return _agentURIs[agentId];
    }

    /**
     * @inheritdoc IERC8004IdentityRegistry
     * @dev Allows storing arbitrary key-value metadata for an agent.
     * Only the agent owner can set metadata.
     */
    function setMetadata(uint256 agentId, string calldata key, bytes calldata value) external {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner(agentId, msg.sender);

        _metadata[agentId][key] = value;
        emit MetadataUpdated(agentId, key);
    }

    /**
     * @inheritdoc IERC8004IdentityRegistry
     * @dev Returns the raw bytes value associated with a metadata key.
     */
    function getMetadata(uint256 agentId, string calldata key) external view returns (bytes memory) {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        return _metadata[agentId][key];
    }

    /**
     * @inheritdoc IERC8004IdentityRegistry
     * @dev Verifies wallet ownership using EIP-712 typed data signatures.
     * The wallet must sign a message containing the agentId, wallet address, and nonce.
     * Nonces are incremented to prevent replay attacks.
     */
    function verifyAgentWallet(uint256 agentId, address wallet, bytes calldata signature) external {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner(agentId, msg.sender);

        // Build EIP-712 digest
        bytes32 structHash = keccak256(
            abi.encode(WALLET_VERIFICATION_TYPEHASH, agentId, wallet, walletNonces[wallet]++)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator, structHash));

        // Recover signer from signature
        address recovered = _recoverSigner(digest, signature);
        require(recovered == wallet, "Invalid signature");

        _verifiedWallets[agentId][wallet] = true;
        emit AgentWalletVerified(agentId, wallet);
    }

    /**
     * @inheritdoc IERC8004IdentityRegistry
     * @dev Returns true if the wallet has been verified for the given agent.
     */
    function isVerifiedWallet(uint256 agentId, address wallet) external view returns (bool) {
        return _verifiedWallets[agentId][wallet];
    }

    // ============ TAL ZK Identity Functions ============

    /**
     * @inheritdoc ITALIdentityRegistry
     * @dev Combines agent registration with ZK identity setup in a single transaction.
     * This is more gas-efficient than calling register() and setZKIdentity() separately.
     */
    function registerWithZKIdentity(
        string calldata _agentURI,
        bytes32 zkCommitment
    ) external whenNotPaused nonReentrant returns (uint256 agentId) {
        agentId = _nextTokenId++;
        _safeMint(msg.sender, agentId);
        _agentURIs[agentId] = _agentURI;
        // Note: _agentsByOwner is updated in _update() override, no need to add here
        zkIdentities[agentId] = zkCommitment;

        emit Registered(agentId, msg.sender, _agentURI);
        emit ZKIdentitySet(agentId, zkCommitment);
    }

    /**
     * @inheritdoc ITALIdentityRegistry
     * @dev Sets the ZK identity commitment for an existing agent.
     * Can only be called once per agent - the commitment is immutable once set.
     * This ensures the agent's cryptographic identity cannot be changed after creation.
     */
    function setZKIdentity(uint256 agentId, bytes32 zkCommitment) external {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner(agentId, msg.sender);
        if (zkIdentities[agentId] != bytes32(0)) revert ZKIdentityAlreadySet(agentId);

        zkIdentities[agentId] = zkCommitment;
        emit ZKIdentitySet(agentId, zkCommitment);
    }

    /**
     * @inheritdoc ITALIdentityRegistry
     * @dev Returns bytes32(0) if no ZK identity has been set for the agent.
     */
    function getZKIdentity(uint256 agentId) external view returns (bytes32) {
        return zkIdentities[agentId];
    }

    // ============ Capability Verification ============

    /**
     * @inheritdoc ITALIdentityRegistry
     * @dev Verifies that an agent possesses a capability using a ZK proof.
     * The proof is verified against the agent's ZK identity commitment.
     * Once a capability is verified, it cannot be revoked.
     *
     * The ZK verifier contract (if set) is called to validate the proof.
     * If no verifier is set, the capability is auto-verified (useful for testing).
     */
    function verifyCapability(
        uint256 agentId,
        bytes32 capabilityHash,
        bytes calldata zkProof
    ) external returns (bool success) {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        if (zkCapabilities[agentId][capabilityHash]) revert CapabilityAlreadyVerified(agentId, capabilityHash);

        bytes32 commitment = zkIdentities[agentId];
        require(commitment != bytes32(0), "No ZK identity set");

        // Call ZK verifier if configured
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

        // Mark capability as verified
        zkCapabilities[agentId][capabilityHash] = true;
        _verifiedCapabilitiesList[agentId].push(capabilityHash);

        emit CapabilityVerified(agentId, capabilityHash);
        return true;
    }

    /**
     * @inheritdoc ITALIdentityRegistry
     * @dev Returns true if the capability has been verified for the agent.
     */
    function isCapabilityVerified(uint256 agentId, bytes32 capabilityHash) external view returns (bool) {
        return zkCapabilities[agentId][capabilityHash];
    }

    /**
     * @inheritdoc ITALIdentityRegistry
     * @dev Returns an array of all capability hashes verified for the agent.
     * Warning: This may be gas-intensive for agents with many capabilities.
     */
    function getVerifiedCapabilities(uint256 agentId) external view returns (bytes32[] memory) {
        return _verifiedCapabilitiesList[agentId];
    }

    // ============ Operator Management ============

    /**
     * @inheritdoc ITALIdentityRegistry
     * @dev Sets the operator address for an agent and automatically refreshes
     * the operator's verification status by checking their stake via the cross-layer bridge.
     */
    function setOperator(uint256 agentId, address operator) external {
        if (!_exists(agentId)) revert AgentNotFound(agentId);
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner(agentId, msg.sender);

        _operators[agentId] = operator;
        emit OperatorSet(agentId, operator);

        // Automatically refresh operator verification status
        _refreshOperatorStatus(agentId);
    }

    /**
     * @inheritdoc ITALIdentityRegistry
     * @dev Returns address(0) if no operator has been set.
     */
    function getOperator(uint256 agentId) external view returns (address) {
        return _operators[agentId];
    }

    /**
     * @inheritdoc ITALIdentityRegistry
     * @dev Returns the cached verification status. Use refreshOperatorStatus()
     * to update the cache with the latest stake information.
     */
    function checkOperatorStatus(uint256 agentId) external view returns (bool isVerified) {
        return verifiedOperators[agentId];
    }

    /**
     * @inheritdoc ITALIdentityRegistry
     * @dev Queries the staking bridge for the operator's current stake (cached from L1 Staking V3)
     * and updates the verification status accordingly. Should be called
     * periodically to keep the status in sync.
     */
    function refreshOperatorStatus(uint256 agentId) external {
        _refreshOperatorStatus(agentId);
    }

    /**
     * @inheritdoc ITALIdentityRegistry
     * @dev Alias for checkOperatorStatus for convenience.
     */
    function isVerifiedOperator(uint256 agentId) external view returns (bool) {
        return verifiedOperators[agentId];
    }

    // ============ Query Functions ============

    /**
     * @inheritdoc ITALIdentityRegistry
     * @dev Returns the total number of agents registered (nextTokenId - 1).
     */
    function getAgentCount() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    /**
     * @inheritdoc ITALIdentityRegistry
     * @dev Returns all agent IDs owned by the given address.
     * Warning: May be gas-intensive for owners with many agents.
     */
    function getAgentsByOwner(address owner) external view returns (uint256[] memory) {
        return _agentsByOwner[owner];
    }

    /**
     * @inheritdoc ITALIdentityRegistry
     * @dev Returns true if the agent exists (has been minted and not burned).
     */
    function agentExists(uint256 agentId) external view returns (bool) {
        return _exists(agentId);
    }

    // ============ Admin Functions ============

    /**
     * @notice Pause the contract, preventing new registrations and transfers
     * @dev Can only be called by accounts with PAUSER_ROLE
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause the contract, resuming normal operations
     * @dev Can only be called by accounts with PAUSER_ROLE
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice Update the staking bridge contract address
     * @param _stakingBridge The new staking bridge contract address
     * @dev Can only be called by accounts with DEFAULT_ADMIN_ROLE
     */
    function setStakingBridge(address _stakingBridge) external onlyRole(DEFAULT_ADMIN_ROLE) {
        stakingBridge = _stakingBridge;
    }

    /**
     * @notice Update the ZK Verifier module address
     * @param _zkVerifier The new ZK Verifier contract address
     * @dev Can only be called by accounts with DEFAULT_ADMIN_ROLE
     */
    function setZKVerifier(address _zkVerifier) external onlyRole(DEFAULT_ADMIN_ROLE) {
        zkVerifier = _zkVerifier;
    }

    // ============ Internal Functions ============

    /**
     * @notice Internal function to refresh operator verification status
     * @param agentId The agent ID to refresh
     * @dev Queries the staking bridge (L2 cache of L1 Staking V3) for the operator's stake and
     * updates the verification status based on MIN_OPERATOR_STAKE threshold.
     */
    function _refreshOperatorStatus(uint256 agentId) internal {
        address operator = _operators[agentId];
        if (operator == address(0)) {
            verifiedOperators[agentId] = false;
            emit OperatorStatusChanged(agentId, false, 0);
            return;
        }

        uint256 stake = 0;
        if (stakingBridge != address(0)) {
            // Query stake from staking bridge (cached L1 Staking V3 data)
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
     * @notice Check if a token exists
     * @param tokenId The token ID to check
     * @return True if the token exists
     */
    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    /**
     * @notice Recover signer address from EIP-712 signature
     * @param digest The EIP-712 digest to verify
     * @param signature The signature bytes (65 bytes: r, s, v)
     * @return The recovered signer address
     * @dev Uses ecrecover with proper v value handling
     */
    function _recoverSigner(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        require(signature.length == 65, "Invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;

        // Extract r, s, v from signature
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        // Handle both legacy (27/28) and modern (0/1) v values
        if (v < 27) v += 27;

        return ecrecover(digest, v, r, s);
    }

    /**
     * @notice Authorize contract upgrades
     * @param newImplementation The address of the new implementation
     * @dev Can only be called by accounts with UPGRADER_ROLE
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    // ============ ERC721 Overrides ============

    /**
     * @notice Returns the token URI for a given token ID
     * @param tokenId The token ID to query
     * @return The agent URI associated with the token
     * @dev Overrides ERC721's tokenURI to return the agentURI
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (!_exists(tokenId)) revert AgentNotFound(tokenId);
        return _agentURIs[tokenId];
    }

    /**
     * @notice Check if the contract supports a given interface
     * @param interfaceId The interface identifier to check
     * @return True if the interface is supported
     * @dev Overrides both ERC721 and AccessControl implementations
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Upgradeable, AccessControlUpgradeable, IERC165)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @notice Internal function to update token ownership
     * @param to The new owner address
     * @param tokenId The token ID being transferred
     * @param auth The address authorized to make this transfer
     * @return The previous owner address
     * @dev Overrides ERC721's _update to maintain the _agentsByOwner mapping.
     * This ensures getAgentsByOwner() returns accurate results after transfers.
     */
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = super._update(to, tokenId, auth);

        // Remove token from previous owner's list
        if (from != address(0)) {
            uint256[] storage fromAgents = _agentsByOwner[from];
            for (uint256 i = 0; i < fromAgents.length; i++) {
                if (fromAgents[i] == tokenId) {
                    // Swap with last element and pop for O(1) removal
                    fromAgents[i] = fromAgents[fromAgents.length - 1];
                    fromAgents.pop();
                    break;
                }
            }
        }

        // Add token to new owner's list
        if (to != address(0)) {
            _agentsByOwner[to].push(tokenId);
        }

        return from;
    }
}
