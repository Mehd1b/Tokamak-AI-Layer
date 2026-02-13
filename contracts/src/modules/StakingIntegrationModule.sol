// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title IWSTONVault
 * @notice Minimal interface for querying the L2 WSTON vault
 */
interface IWSTONVault {
    function getLockedBalance(address operator) external view returns (uint256);
    function isVerifiedOperator(address operator) external view returns (bool);
    function getOperatorTier(address operator) external view returns (uint8);
    function slash(address operator, uint256 amount) external;
}

/**
 * @title StakingIntegrationModule
 * @notice Wraps WSTONVault for use by TAL registries
 * @dev Provides stake query, slashing, and seigniorage routing functions.
 *
 * This module delegates to WSTONVault on L2 for actual staking data.
 * It adds TAL-specific logic like:
 * - Slashing condition registration and execution
 * - Seigniorage bonus calculations based on reputation
 * - Operator status tracking with slash history
 */
contract StakingIntegrationModule is
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    // ============ Constants ============
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant SLASH_EXECUTOR_ROLE = keccak256("SLASH_EXECUTOR_ROLE");
    bytes32 public constant SEIGNIORAGE_ROUTER_ROLE = keccak256("SEIGNIORAGE_ROUTER_ROLE");

    uint256 public constant MIN_OPERATOR_STAKE = 1000 ether; // 1000 WSTON

    /// @notice Slash percentage for failed TEE attestation
    uint256 public constant SLASHING_FAILED_TEE = 50;

    /// @notice Slash percentage for proven fraud
    uint256 public constant SLASHING_PROVEN_FRAUD = 100;

    /// @notice Slash percentage for repeated low reputation
    uint256 public constant SLASHING_LOW_REPUTATION = 25;

    /// @notice Precision for reputation bonus calculations
    uint256 public constant PRECISION = 1e18;

    // ============ Structs ============

    struct SlashingCondition {
        bytes32 conditionHash;
        uint256 percentage;
        bool active;
    }

    struct OperatorSlashRecord {
        uint256 totalSlashed;
        uint256 slashCount;
        uint256 lastSlashTime;
    }

    // ============ State Variables ============

    /// @notice WSTONVault address on L2
    address public wstonVault;

    /// @notice TALIdentityRegistry address (for agent owner lookup)
    address public identityRegistry;

    /// @notice TALReputationRegistry address (for reputation bonus)
    address public reputationRegistry;

    /// @notice Registered slashing conditions per agent
    mapping(uint256 => SlashingCondition[]) public slashingConditions;

    /// @notice Slash records per operator
    mapping(address => OperatorSlashRecord) public slashRecords;

    /// @notice Storage gap
    uint256[30] private __gap;

    // ============ Events ============
    event SlashingConditionRegistered(uint256 indexed agentId, bytes32 conditionHash, uint256 percentage);
    event SlashingExecuted(uint256 indexed agentId, address indexed operator, uint256 amount, bytes32 reason);
    event SeigniorageRouted(uint256 indexed agentId, address indexed operator, uint256 amount);

    // ============ Errors ============
    error InsufficientStake(address operator);
    error SlashingConditionNotMet(bytes32 conditionHash);
    error UnauthorizedSlashing();
    error InvalidPercentage(uint256 percentage);
    error VaultNotSet();

    // ============ Initializer ============

    function initialize(
        address admin_,
        address wstonVault_,
        address identityRegistry_,
        address reputationRegistry_
    ) external initializer {
        __AccessControl_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(UPGRADER_ROLE, admin_);
        _grantRole(SLASH_EXECUTOR_ROLE, admin_);
        _grantRole(SEIGNIORAGE_ROUTER_ROLE, admin_);

        wstonVault = wstonVault_;
        identityRegistry = identityRegistry_;
        reputationRegistry = reputationRegistry_;
    }

    // ============ Stake Query Functions ============

    /// @notice Get operator's locked WSTON from vault
    /// @param operator The operator address
    /// @return stakedAmount The locked WSTON amount
    function getStake(address operator) external view returns (uint256 stakedAmount) {
        if (wstonVault == address(0)) revert VaultNotSet();
        stakedAmount = IWSTONVault(wstonVault).getLockedBalance(operator);
    }

    /// @notice Check if operator meets minimum verified stake
    /// @param operator The operator address
    /// @return True if operator has sufficient locked WSTON
    function isVerifiedOperator(address operator) external view returns (bool) {
        if (wstonVault == address(0)) return false;
        return IWSTONVault(wstonVault).isVerifiedOperator(operator);
    }

    /// @notice Get full operator status including slash history
    /// @param operator The operator address
    /// @return stakedAmount The locked WSTON amount
    /// @return isVerified Whether operator meets minimum stake
    /// @return slashingCount Number of times operator was slashed
    /// @return lastSlashTime Timestamp of last slash
    function getOperatorStatus(address operator) external view returns (
        uint256 stakedAmount,
        bool isVerified,
        uint256 slashingCount,
        uint256 lastSlashTime
    ) {
        if (wstonVault != address(0)) {
            stakedAmount = IWSTONVault(wstonVault).getLockedBalance(operator);
            isVerified = stakedAmount >= MIN_OPERATOR_STAKE;
        }

        OperatorSlashRecord storage record = slashRecords[operator];
        slashingCount = record.slashCount;
        lastSlashTime = record.lastSlashTime;
    }

    // ============ Slashing Functions ============

    /// @notice Register a slashing condition for an agent
    /// @param agentId The agent ID
    /// @param conditionHash Hash identifying the condition type
    /// @param percentage Slash percentage (1-100)
    function registerSlashingCondition(
        uint256 agentId,
        bytes32 conditionHash,
        uint256 percentage
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (percentage == 0 || percentage > 100) revert InvalidPercentage(percentage);

        slashingConditions[agentId].push(SlashingCondition({
            conditionHash: conditionHash,
            percentage: percentage,
            active: true
        }));

        emit SlashingConditionRegistered(agentId, conditionHash, percentage);
    }

    /// @notice Execute slashing via WSTONVault
    /// @param agentId The agent that misbehaved
    /// @param percentage The slash percentage
    /// @param evidence Evidence of misbehavior (stored off-chain, emitted in event)
    /// @param reason Human-readable reason hash
    /// @return slashedAmount The amount slashed from the vault
    function executeSlash(
        uint256 agentId,
        uint256 percentage,
        bytes calldata evidence,
        bytes32 reason
    ) external onlyRole(SLASH_EXECUTOR_ROLE) returns (uint256 slashedAmount) {
        if (wstonVault == address(0)) revert VaultNotSet();
        if (percentage == 0 || percentage > 100) revert InvalidPercentage(percentage);

        // Get agent owner/operator
        address operator = _getAgentOperator(agentId);

        // Get current locked balance from vault
        uint256 currentStake = IWSTONVault(wstonVault).getLockedBalance(operator);
        slashedAmount = (currentStake * percentage) / 100;

        if (slashedAmount > 0) {
            // Execute slash directly on vault (seizes WSTON to treasury)
            IWSTONVault(wstonVault).slash(operator, slashedAmount);

            OperatorSlashRecord storage record = slashRecords[operator];
            record.totalSlashed += slashedAmount;
            record.slashCount++;
            record.lastSlashTime = block.timestamp;

            emit SlashingExecuted(agentId, operator, slashedAmount, reason);
        }
    }

    // ============ Seigniorage Functions ============

    /// @notice Calculate seigniorage bonus based on agent reputation
    /// @dev Formula: bonus = baseEmission * (repScore / 100)
    /// @param agentId The agent ID
    /// @param baseEmission The base seigniorage emission
    /// @return bonusAmount The additional bonus amount
    function calculateSeigniorageBonus(
        uint256 agentId,
        uint256 baseEmission
    ) external view returns (uint256 bonusAmount) {
        if (reputationRegistry == address(0)) return 0;

        (bool success, bytes memory data) = reputationRegistry.staticcall(
            abi.encodeWithSignature("getAgentScore(uint256)", agentId)
        );

        if (success && data.length >= 32) {
            uint256 repScore = abi.decode(data, (uint256));
            if (repScore > 100) repScore = 100;
            bonusAmount = (baseEmission * repScore) / 100;
        }
    }

    /// @notice Route seigniorage to agent operator with reputation bonus
    /// @param agentId The agent ID to route seigniorage for
    function routeSeigniorage(uint256 agentId) external onlyRole(SEIGNIORAGE_ROUTER_ROLE) {
        if (wstonVault == address(0)) revert VaultNotSet();
        address operator = _getAgentOperator(agentId);

        // Get operator's locked balance from vault
        uint256 currentStake = IWSTONVault(wstonVault).getLockedBalance(operator);

        // Calculate reputation bonus (on a notional seigniorage amount)
        uint256 bonus = this.calculateSeigniorageBonus(agentId, currentStake);

        emit SeigniorageRouted(agentId, operator, bonus);
    }

    // ============ Internal Functions ============

    /// @notice Get agent operator address from identity registry
    function _getAgentOperator(uint256 agentId) internal view returns (address) {
        (bool success, bytes memory data) = identityRegistry.staticcall(
            abi.encodeWithSignature("ownerOf(uint256)", agentId)
        );
        if (success && data.length >= 32) {
            return abi.decode(data, (address));
        }
        return address(0);
    }

    // ============ Admin Functions ============

    function setWSTONVault(address wstonVault_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        wstonVault = wstonVault_;
    }

    function setIdentityRegistry(address identityRegistry_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        identityRegistry = identityRegistry_;
    }

    function setReputationRegistry(address reputationRegistry_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        reputationRegistry = reputationRegistry_;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}
