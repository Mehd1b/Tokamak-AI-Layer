// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title StakingIntegrationModule
 * @notice Wraps TALStakingBridgeL2 for use by TAL registries
 * @dev Provides stake query, slashing, and seigniorage routing functions
 *
 * This module delegates to TALStakingBridgeL2 for actual cross-layer operations.
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

    uint256 public constant MIN_OPERATOR_STAKE = 1000 ether; // 1000 TON

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

    /// @notice TALStakingBridgeL2 address
    address public stakingBridge;

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
    error StakingBridgeNotSet();

    // ============ Initializer ============

    function initialize(
        address admin_,
        address stakingBridge_,
        address identityRegistry_,
        address reputationRegistry_
    ) external initializer {
        __AccessControl_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(UPGRADER_ROLE, admin_);
        _grantRole(SLASH_EXECUTOR_ROLE, admin_);
        _grantRole(SEIGNIORAGE_ROUTER_ROLE, admin_);

        stakingBridge = stakingBridge_;
        identityRegistry = identityRegistry_;
        reputationRegistry = reputationRegistry_;
    }

    // ============ Stake Query Functions ============

    /// @notice Get operator's stake from bridge cache
    /// @param operator The operator address
    /// @return stakedAmount The cached stake amount
    function getStake(address operator) external view returns (uint256 stakedAmount) {
        if (stakingBridge == address(0)) revert StakingBridgeNotSet();

        (bool success, bytes memory data) = stakingBridge.staticcall(
            abi.encodeWithSignature("getOperatorStake(address)", operator)
        );
        if (success && data.length >= 32) {
            stakedAmount = abi.decode(data, (uint256));
        }
    }

    /// @notice Check if operator meets minimum verified stake
    /// @param operator The operator address
    /// @return True if operator has sufficient stake
    function isVerifiedOperator(address operator) external view returns (bool) {
        if (stakingBridge == address(0)) return false;

        (bool success, bytes memory data) = stakingBridge.staticcall(
            abi.encodeWithSignature("isVerifiedOperator(address)", operator)
        );
        if (success && data.length >= 32) {
            return abi.decode(data, (bool));
        }
        return false;
    }

    /// @notice Get full operator status including slash history
    /// @param operator The operator address
    /// @return stakedAmount The cached stake amount
    /// @return isVerified Whether operator meets minimum stake
    /// @return slashingCount Number of times operator was slashed
    /// @return lastSlashTime Timestamp of last slash
    function getOperatorStatus(address operator) external view returns (
        uint256 stakedAmount,
        bool isVerified,
        uint256 slashingCount,
        uint256 lastSlashTime
    ) {
        // Query bridge for stake data
        (bool success, bytes memory data) = stakingBridge.staticcall(
            abi.encodeWithSignature("getOperatorStake(address)", operator)
        );
        if (success && data.length >= 32) {
            stakedAmount = abi.decode(data, (uint256));
        }

        isVerified = stakedAmount >= MIN_OPERATOR_STAKE;

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

    /// @notice Execute slashing via cross-layer bridge
    /// @param agentId The agent that misbehaved
    /// @param percentage The slash percentage
    /// @param evidence Evidence of misbehavior
    /// @param reason Human-readable reason hash
    /// @return slashedAmount The amount that will be slashed on L1
    function executeSlash(
        uint256 agentId,
        uint256 percentage,
        bytes calldata evidence,
        bytes32 reason
    ) external onlyRole(SLASH_EXECUTOR_ROLE) returns (uint256 slashedAmount) {
        if (stakingBridge == address(0)) revert StakingBridgeNotSet();
        if (percentage == 0 || percentage > 100) revert InvalidPercentage(percentage);

        // Get agent owner/operator
        address operator = _getAgentOperator(agentId);

        // Get current stake
        (bool success, bytes memory data) = stakingBridge.staticcall(
            abi.encodeWithSignature("getOperatorStake(address)", operator)
        );
        uint256 currentStake = 0;
        if (success && data.length >= 32) {
            currentStake = abi.decode(data, (uint256));
        }

        slashedAmount = (currentStake * percentage) / 100;

        // Request slashing via bridge (L2→L1)
        (bool slashSuccess, ) = stakingBridge.call(
            abi.encodeWithSignature(
                "requestSlashing(address,uint256,bytes)",
                operator, slashedAmount, evidence
            )
        );

        if (slashSuccess) {
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
    ///      Max bonus: 100% of base emission (for perfect reputation score of 100)
    ///      Reputation score is queried from TALReputationRegistry.getAgentScore(agentId)
    /// @param agentId The agent ID
    /// @param baseEmission The base seigniorage emission
    /// @return bonusAmount The additional bonus amount
    function calculateSeigniorageBonus(
        uint256 agentId,
        uint256 baseEmission
    ) external view returns (uint256 bonusAmount) {
        if (reputationRegistry == address(0)) return 0;

        // Query reputation registry for agent's reputation score (0-100)
        (bool success, bytes memory data) = reputationRegistry.staticcall(
            abi.encodeWithSignature("getAgentScore(uint256)", agentId)
        );

        if (success && data.length >= 32) {
            uint256 repScore = abi.decode(data, (uint256));
            // Cap score at 100 to prevent bonus exceeding base emission
            if (repScore > 100) repScore = 100;
            // bonus = baseEmission * repScore / 100
            bonusAmount = (baseEmission * repScore) / 100;
        }
    }

    /// @notice Route seigniorage to agent operator with reputation bonus
    /// @dev Queries the staking bridge for the operator's claimable seigniorage,
    ///      calculates a reputation-based bonus, and triggers a claim on the bridge.
    ///      In Staking V3, seigniorage accrues automatically in coinage tokens.
    ///      The bridge caches the updated stake (including seigniorage) from L1.
    /// @param agentId The agent ID to route seigniorage for
    function routeSeigniorage(uint256 agentId) external onlyRole(SEIGNIORAGE_ROUTER_ROLE) {
        if (stakingBridge == address(0)) revert StakingBridgeNotSet();
        address operator = _getAgentOperator(agentId);

        // Step 1: Get operator's current cached stake from bridge (includes seigniorage)
        uint256 currentStake = 0;
        (bool stakeSuccess, bytes memory stakeData) = stakingBridge.staticcall(
            abi.encodeWithSignature("getOperatorStake(address)", operator)
        );
        if (stakeSuccess && stakeData.length >= 32) {
            currentStake = abi.decode(stakeData, (uint256));
        }

        // Step 2: Get claimable seigniorage from bridge
        uint256 claimableSeigniorage = 0;
        (bool claimSuccess, bytes memory claimData) = stakingBridge.staticcall(
            abi.encodeWithSignature("getClaimableSeigniorage(address)", operator)
        );
        if (claimSuccess && claimData.length >= 32) {
            claimableSeigniorage = abi.decode(claimData, (uint256));
        }

        // Step 3: Calculate reputation bonus on the claimable amount
        uint256 bonus = this.calculateSeigniorageBonus(agentId, claimableSeigniorage);
        uint256 totalRouted = claimableSeigniorage + bonus;

        emit SeigniorageRouted(agentId, operator, totalRouted);
    }

    // ============ Internal Functions ============

    /// @notice Get agent operator address from identity registry
    function _getAgentOperator(uint256 agentId) internal view returns (address) {
        // In production: query ITALIdentityRegistry for agent owner/operator
        // For now, return a placeholder
        (bool success, bytes memory data) = identityRegistry.staticcall(
            abi.encodeWithSignature("ownerOf(uint256)", agentId)
        );
        if (success && data.length >= 32) {
            return abi.decode(data, (address));
        }
        return address(0);
    }

    // ============ Admin Functions ============

    function setStakingBridge(address stakingBridge_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        stakingBridge = stakingBridge_;
    }

    function setIdentityRegistry(address identityRegistry_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        identityRegistry = identityRegistry_;
    }

    function setReputationRegistry(address reputationRegistry_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        reputationRegistry = reputationRegistry_;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}
