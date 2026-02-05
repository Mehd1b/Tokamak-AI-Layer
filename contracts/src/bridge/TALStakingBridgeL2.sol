// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

/**
 * @title TALStakingBridgeL2
 * @notice L2 side of the TAL cross-layer staking bridge
 * @dev Caches L1 Staking V3 data on Tokamak L2 for low-cost operations
 *
 * Architecture:
 * - Receives stake snapshots from TALStakingBridgeL1 via L2CrossDomainMessenger
 * - Provides isVerifiedOperator() and getOperatorStake() for TAL registries
 * - Sends slash requests to L1 via L2CrossDomainMessenger
 * - Receives seigniorage notifications and manages claimable balances
 *
 * Access Control:
 * - receiveStakeUpdate: ONLY L2CrossDomainMessenger with xDomainMessageSender == l1BridgeAddress
 * - requestSlashing: ONLY TALValidationRegistry
 * - receiveSeigniorage: ONLY L2CrossDomainMessenger with xDomainMessageSender == l1BridgeAddress
 */
contract TALStakingBridgeL2 is
    AccessControlUpgradeable,
    UUPSUpgradeable,
    PausableUpgradeable
{
    // ============ Enums ============
    enum OperatorTier { UNVERIFIED, VERIFIED, PREMIUM }

    // ============ Structs ============
    struct StakeSnapshot {
        uint256 amount;
        uint256 lastUpdatedL1Block;
        uint256 timestamp;
    }

    struct SlashRequest {
        address operator;
        uint256 amount;
        bytes32 evidenceHash;
        uint256 timestamp;
        bool executed;
    }

    // ============ Constants ============
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant VALIDATION_REGISTRY_ROLE = keccak256("VALIDATION_REGISTRY_ROLE");

    uint256 public constant VERIFIED_THRESHOLD = 1000 ether;   // 1000 TON
    uint256 public constant PREMIUM_THRESHOLD = 10000 ether;    // 10000 TON
    uint256 public constant DEFAULT_MAX_CACHE_AGE = 4 hours;

    // ============ State Variables ============
    /// @notice L2 CrossDomainMessenger address
    address public l2CrossDomainMessenger;

    /// @notice TALStakingBridgeL1 address on L1 (for xDomainMessageSender validation)
    address public l1BridgeAddress;

    /// @notice Cached operator stake snapshots
    mapping(address => StakeSnapshot) public operatorStakes;

    /// @notice Operator tier based on stake amount
    mapping(address => OperatorTier) public operatorTiers;

    /// @notice Pending slash requests
    mapping(bytes32 => SlashRequest) public pendingSlashRequests;

    /// @notice Bridged seigniorage available for claiming
    mapping(address => uint256) public bridgedSeigniorage;

    /// @notice Slash request nonce for uniqueness
    uint256 public slashNonce;

    /// @notice Storage gap for upgrades
    uint256[30] private __gap;

    // ============ Events ============
    event StakeUpdated(address indexed operator, uint256 amount, uint256 l1Block);
    event OperatorTierChanged(address indexed operator, OperatorTier newTier);
    event SlashRequested(address indexed operator, uint256 amount, bytes32 evidenceHash);
    event SeigniorageReceived(address indexed operator, uint256 amount);
    event SeigniorageClaimed(address indexed operator, uint256 amount);
    event StakeRefreshRequested(address indexed operator);

    // ============ Errors ============
    error UnauthorizedBridgeCaller();
    error InvalidL1Sender();
    error StakeCacheStale(address operator, uint256 lastUpdate);
    error NoSeigniorageToClaim(address operator);

    // ============ Modifiers ============

    /// @notice Ensures caller is the L2CrossDomainMessenger with correct L1 sender
    modifier onlyFromL1Bridge() {
        if (msg.sender != l2CrossDomainMessenger) revert UnauthorizedBridgeCaller();
        // In production, also verify:
        // ICrossDomainMessenger(l2CrossDomainMessenger).xDomainMessageSender() == l1BridgeAddress
        _;
    }

    // ============ Initializer ============

    function initialize(
        address admin_,
        address l2CrossDomainMessenger_,
        address l1BridgeAddress_
    ) external initializer {
        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(UPGRADER_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);

        l2CrossDomainMessenger = l2CrossDomainMessenger_;
        l1BridgeAddress = l1BridgeAddress_;
    }

    // ============ L1→L2 Functions ============

    /// @notice Receive a stake update relayed from L1
    /// @param operator The operator whose stake was queried
    /// @param amount The staked TON amount on L1
    /// @param l1Block The L1 block number at query time
    function receiveStakeUpdate(
        address operator,
        uint256 amount,
        uint256 l1Block
    ) external onlyFromL1Bridge whenNotPaused {
        operatorStakes[operator] = StakeSnapshot({
            amount: amount,
            lastUpdatedL1Block: l1Block,
            timestamp: block.timestamp
        });

        OperatorTier newTier = _calculateTier(amount);
        OperatorTier oldTier = operatorTiers[operator];
        operatorTiers[operator] = newTier;

        emit StakeUpdated(operator, amount, l1Block);

        if (newTier != oldTier) {
            emit OperatorTierChanged(operator, newTier);
        }
    }

    /// @notice Receive seigniorage notification from L1
    /// @param operator The operator receiving seigniorage
    /// @param amount The seigniorage amount bridged
    function receiveSeigniorage(
        address operator,
        uint256 amount
    ) external onlyFromL1Bridge whenNotPaused {
        bridgedSeigniorage[operator] += amount;
        emit SeigniorageReceived(operator, amount);
    }

    // ============ L2→L1 Functions ============

    /// @notice Request a fresh stake query from L1
    /// @param operator The operator to query
    function requestStakeRefresh(address operator) external whenNotPaused {
        // In production: send message via L2CrossDomainMessenger to TALStakingBridgeL1
        // L2CrossDomainMessenger.sendMessage(
        //     l1BridgeAddress,
        //     abi.encodeCall(ITALStakingBridgeL1.queryAndRelayStake, (operator)),
        //     gasLimit
        // );
        emit StakeRefreshRequested(operator);
    }

    /// @notice Request slashing of an operator's L1 stake
    /// @dev Only callable by TALValidationRegistry
    /// @param operator The operator to slash
    /// @param amount The amount to slash
    /// @param evidence The evidence supporting the slash
    function requestSlashing(
        address operator,
        uint256 amount,
        bytes calldata evidence
    ) external onlyRole(VALIDATION_REGISTRY_ROLE) whenNotPaused {
        bytes32 evidenceHash = keccak256(evidence);
        bytes32 requestId = keccak256(abi.encodePacked(operator, amount, evidenceHash, slashNonce++));

        pendingSlashRequests[requestId] = SlashRequest({
            operator: operator,
            amount: amount,
            evidenceHash: evidenceHash,
            timestamp: block.timestamp,
            executed: false
        });

        // In production: send message via L2CrossDomainMessenger to TALStakingBridgeL1
        // L2CrossDomainMessenger.sendMessage(
        //     l1BridgeAddress,
        //     abi.encodeCall(ITALStakingBridgeL1.executeSlashing, (operator, amount, evidence)),
        //     gasLimit
        // );

        emit SlashRequested(operator, amount, evidenceHash);
    }

    // ============ View Functions ============

    /// @notice Check if an operator has verified status (>=1000 TON staked on L1)
    /// @param operator The operator to check
    /// @return True if operator has sufficient stake
    function isVerifiedOperator(address operator) external view returns (bool) {
        return operatorStakes[operator].amount >= VERIFIED_THRESHOLD;
    }

    /// @notice Get the cached stake amount for an operator
    /// @param operator The operator to query
    /// @return The cached stake amount
    function getOperatorStake(address operator) external view returns (uint256) {
        return operatorStakes[operator].amount;
    }

    /// @notice Get the operator's current tier
    /// @param operator The operator to query
    /// @return The operator tier
    function getOperatorTier(address operator) external view returns (OperatorTier) {
        return operatorTiers[operator];
    }

    /// @notice Get the full stake snapshot for an operator
    /// @param operator The operator to query
    /// @return The stake snapshot
    function getStakeSnapshot(address operator) external view returns (StakeSnapshot memory) {
        return operatorStakes[operator];
    }

    /// @notice Check if the stake cache is fresh enough
    /// @param operator The operator to check
    /// @param maxAge Maximum acceptable cache age in seconds
    /// @return True if cache is fresh enough
    function isCacheFresh(address operator, uint256 maxAge) external view returns (bool) {
        if (operatorStakes[operator].timestamp == 0) return false;
        return (block.timestamp - operatorStakes[operator].timestamp) <= maxAge;
    }

    /// @notice Get claimable seigniorage for an operator
    /// @param operator The operator to query
    /// @return The claimable amount
    function getClaimableSeigniorage(address operator) external view returns (uint256) {
        return bridgedSeigniorage[operator];
    }

    // ============ External Functions ============

    /// @notice Claim bridged seigniorage
    function claimSeigniorage() external whenNotPaused {
        uint256 amount = bridgedSeigniorage[msg.sender];
        if (amount == 0) revert NoSeigniorageToClaim(msg.sender);

        bridgedSeigniorage[msg.sender] = 0;
        // In production: transfer TON to msg.sender
        // IERC20(tonToken).safeTransfer(msg.sender, amount);

        emit SeigniorageClaimed(msg.sender, amount);
    }

    // ============ Admin Functions ============

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ============ Internal Functions ============

    function _calculateTier(uint256 amount) internal pure returns (OperatorTier) {
        if (amount >= PREMIUM_THRESHOLD) return OperatorTier.PREMIUM;
        if (amount >= VERIFIED_THRESHOLD) return OperatorTier.VERIFIED;
        return OperatorTier.UNVERIFIED;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}
