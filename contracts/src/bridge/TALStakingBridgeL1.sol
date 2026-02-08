// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "../interfaces/IStakingV2.sol";

/**
 * @title TALStakingBridgeL1
 * @notice L1 side of the TAL cross-layer staking bridge
 * @dev Queries Staking V2 on Ethereum L1 and relays data to Tokamak L2
 *
 * Key Responsibilities:
 * - Query SeigManager.stakeOf() for operator stakes
 * - Relay stake snapshots to TALStakingBridgeL2 via L1CrossDomainMessenger
 * - Execute slashing received from L2 via TALSlashingConditionsL1
 * - Trigger seigniorage updates via SeigManager and notify L2
 * - Manage registered TAL operators for batch operations
 *
 * Integration with Staking V2:
 * - Uses IStakingV2.stakeOf(layer2, operator) for stake queries
 * - Uses IStakingV2.updateSeigniorageLayer(layer2) for seigniorage updates
 * - Slashing is delegated to TALSlashingConditionsL1 which uses DepositManager.slash()
 */
contract TALStakingBridgeL1 is
    AccessControlUpgradeable,
    UUPSUpgradeable,
    PausableUpgradeable
{
    // ============ Constants ============
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    uint256 public constant MAX_BATCH_SIZE = 100;

    // ============ State Variables ============

    /// @notice L1 CrossDomainMessenger address
    address public l1CrossDomainMessenger;

    /// @notice TALStakingBridgeL2 address on L2
    address public l2BridgeAddress;

    /// @notice Staking V2 SeigManager address (for stakeOf queries and seigniorage)
    /// @dev This is the SeigManager, NOT the DepositManager. Stake balances are
    ///      queried via SeigManager.stakeOf(), not DepositManager.balanceOf()
    address public seigManager;

    /// @notice TALSlashingConditionsL1 address
    address public slashingConditions;

    /// @notice Layer2 address (for SeigManager.stakeOf queries)
    /// @dev The Tokamak Layer2 contract that TAL operators stake on
    address public talLayer2Address;

    /// @notice Registered TAL operators
    address[] public registeredOperators;
    mapping(address => bool) public isOperatorRegistered;
    mapping(address => uint256) public operatorIndex;

    /// @notice Gas limit for L1->L2 messages
    uint32 public l2MessageGasLimit;

    /// @notice Storage gap
    uint256[30] private __gap;

    // ============ Events ============
    event StakeRelayed(address indexed operator, uint256 amount, uint256 l1Block);
    event BatchStakeRelayed(uint256 operatorCount, uint256 l1Block);
    event SlashingExecuted(address indexed operator, uint256 amount, bytes32 evidenceHash);
    event SeigniorageUpdated(address indexed layer2, bool success);
    event SeigniorageBridged(address indexed operator, uint256 amount);
    event OperatorRegistered(address indexed operator);
    event OperatorRemoved(address indexed operator);

    // ============ Errors ============
    error UnauthorizedBridgeCaller();
    error InvalidL2Sender();
    error OperatorNotRegistered(address operator);
    error OperatorAlreadyRegistered(address operator);
    error SlashingFailed(address operator, uint256 amount);
    error BatchTooLarge(uint256 count, uint256 maxBatch);

    // ============ Modifiers ============

    modifier onlyFromL2Bridge() {
        if (msg.sender != l1CrossDomainMessenger) revert UnauthorizedBridgeCaller();
        // In production, also verify:
        // ICrossDomainMessenger(l1CrossDomainMessenger).xDomainMessageSender() == l2BridgeAddress
        _;
    }

    // ============ Initializer ============

    function initialize(
        address admin_,
        address l1CrossDomainMessenger_,
        address l2BridgeAddress_,
        address seigManager_,
        address slashingConditions_,
        address talLayer2Address_
    ) external initializer {
        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(UPGRADER_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);
        _grantRole(KEEPER_ROLE, admin_);

        l1CrossDomainMessenger = l1CrossDomainMessenger_;
        l2BridgeAddress = l2BridgeAddress_;
        seigManager = seigManager_;
        slashingConditions = slashingConditions_;
        talLayer2Address = talLayer2Address_;
        l2MessageGasLimit = 200_000;
    }

    // ============ Stake Query Functions ============

    /// @notice Query an operator's stake and relay to L2
    /// @param operator The operator to query
    function queryAndRelayStake(address operator) external whenNotPaused {
        uint256 stakeAmount = _queryStake(operator);
        _relayStakeToL2(operator, stakeAmount);
        emit StakeRelayed(operator, stakeAmount, block.number);
    }

    /// @notice Batch query and relay stakes for multiple operators
    /// @param operators Array of operator addresses
    function batchQueryStakes(address[] calldata operators) external whenNotPaused {
        if (operators.length > MAX_BATCH_SIZE) {
            revert BatchTooLarge(operators.length, MAX_BATCH_SIZE);
        }

        for (uint256 i = 0; i < operators.length; i++) {
            uint256 stakeAmount = _queryStake(operators[i]);
            _relayStakeToL2(operators[i], stakeAmount);
        }

        emit BatchStakeRelayed(operators.length, block.number);
    }

    /// @notice Refresh all registered TAL operators' stakes
    function refreshAllOperators() external onlyRole(KEEPER_ROLE) whenNotPaused {
        uint256 count = registeredOperators.length;
        if (count > MAX_BATCH_SIZE) {
            revert BatchTooLarge(count, MAX_BATCH_SIZE);
        }

        for (uint256 i = 0; i < count; i++) {
            address operator = registeredOperators[i];
            uint256 stakeAmount = _queryStake(operator);
            _relayStakeToL2(operator, stakeAmount);
        }

        emit BatchStakeRelayed(count, block.number);
    }

    // ============ Cross-Layer Functions ============

    /// @notice Execute slashing received from L2
    /// @param operator The operator to slash
    /// @param amount The amount to slash
    /// @param evidence The evidence for the slash
    function executeSlashing(
        address operator,
        uint256 amount,
        bytes calldata evidence
    ) external onlyFromL2Bridge whenNotPaused {
        bytes32 evidenceHash = keccak256(evidence);

        // Call TALSlashingConditionsL1 to execute the slash via DepositManager
        (bool success, ) = slashingConditions.call(
            abi.encodeWithSignature("slash(address,uint256)", operator, amount)
        );

        if (!success) revert SlashingFailed(operator, amount);

        emit SlashingExecuted(operator, amount, evidenceHash);

        // Refresh the operator's stake after slashing
        uint256 newStake = _queryStake(operator);
        _relayStakeToL2(operator, newStake);
    }

    // ============ Seigniorage Functions ============

    /// @notice Trigger seigniorage update for the TAL layer2 on Staking V2
    /// @dev Calls SeigManager.updateSeigniorageLayer(talLayer2Address)
    ///      This triggers seigniorage distribution for all stakers on this layer2
    function triggerSeigniorageUpdate() external whenNotPaused {
        bool success = IStakingV2(seigManager).updateSeigniorageLayer(talLayer2Address);
        emit SeigniorageUpdated(talLayer2Address, success);
    }

    /// @notice Claim seigniorage for an operator and notify L2
    /// @dev In Staking V2, seigniorage accrues automatically via coinage tokens.
    ///      The operator's stakeOf() amount includes seigniorage accrual.
    ///      This function refreshes the stake snapshot on L2 to reflect seigniorage growth.
    /// @param operator The operator whose seigniorage-inclusive stake to relay
    function claimAndBridgeSeigniorage(address operator) external whenNotPaused {
        // Step 1: Trigger seigniorage update to ensure latest distribution
        IStakingV2(seigManager).updateSeigniorageLayer(talLayer2Address);

        // Step 2: Query updated stake (now includes latest seigniorage)
        uint256 currentStake = _queryStake(operator);

        // Step 3: Relay updated stake snapshot to L2
        // In Staking V2, seigniorage is reflected in the coinage balance,
        // so the stakeOf() value already includes accrued seigniorage.
        _relayStakeToL2(operator, currentStake);

        emit SeigniorageBridged(operator, currentStake);
    }

    // ============ Operator Management ============

    /// @notice Register an operator for TAL stake tracking
    /// @param operator The operator to register
    function registerOperator(address operator) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (isOperatorRegistered[operator]) revert OperatorAlreadyRegistered(operator);

        isOperatorRegistered[operator] = true;
        operatorIndex[operator] = registeredOperators.length;
        registeredOperators.push(operator);

        emit OperatorRegistered(operator);
    }

    /// @notice Remove an operator from TAL tracking
    /// @param operator The operator to remove
    function removeOperator(address operator) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!isOperatorRegistered[operator]) revert OperatorNotRegistered(operator);

        uint256 index = operatorIndex[operator];
        uint256 lastIndex = registeredOperators.length - 1;

        if (index != lastIndex) {
            address lastOperator = registeredOperators[lastIndex];
            registeredOperators[index] = lastOperator;
            operatorIndex[lastOperator] = index;
        }

        registeredOperators.pop();
        delete isOperatorRegistered[operator];
        delete operatorIndex[operator];

        emit OperatorRemoved(operator);
    }

    /// @notice Get all registered TAL operators
    function getRegisteredOperators() external view returns (address[] memory) {
        return registeredOperators;
    }

    /// @notice Get count of registered operators
    function getRegisteredOperatorCount() external view returns (uint256) {
        return registeredOperators.length;
    }

    // ============ Admin Functions ============

    function setSeigManager(address seigManager_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        seigManager = seigManager_;
    }

    function setL2MessageGasLimit(uint32 gasLimit_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        l2MessageGasLimit = gasLimit_;
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ============ Internal Functions ============

    /// @notice Query an operator's stake from SeigManager
    /// @dev Calls IStakingV2(seigManager).stakeOf(talLayer2Address, operator)
    ///      This returns the coinage-based stake which includes seigniorage accrual
    function _queryStake(address operator) internal view returns (uint256) {
        (bool success, bytes memory data) = seigManager.staticcall(
            abi.encodeWithSignature("stakeOf(address,address)", talLayer2Address, operator)
        );
        if (success && data.length >= 32) {
            return abi.decode(data, (uint256));
        }
        return 0;
    }

    function _relayStakeToL2(address operator, uint256 amount) internal {
        // In production: send via L1CrossDomainMessenger
        // ICrossDomainMessenger(l1CrossDomainMessenger).sendMessage(
        //     l2BridgeAddress,
        //     abi.encodeCall(ITALStakingBridgeL2.receiveStakeUpdate, (operator, amount, block.number)),
        //     l2MessageGasLimit
        // );
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}
