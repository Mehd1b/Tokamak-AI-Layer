// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "../interfaces/IStakingV2.sol";
import "../interfaces/IDepositManagerV2.sol";

/**
 * @title TALSlashingConditionsL1
 * @notice Executes slashing against Staking V2 via DepositManager.slash()
 * @dev In Staking V2, slashing is done via DepositManager.slash(layer2, recipient, amount).
 *      The slashed funds are transferred to the specified recipient (e.g., treasury).
 *
 * Slashing Mechanism (Staking V2):
 * - DepositManager.slash(layer2, recipient, amount): Transfers slashed stake to recipient
 * - No restoration mechanism in V2 (unlike V3's RAT-based restore)
 *
 * TAL Integration:
 * - Only accepts slash calls from TALStakingBridgeL1 (via SLASHER_ROLE)
 * - The L2->L1 message finalization period (~7 days on Optimism)
 *   serves as a natural appeal window before slashing executes
 */
contract TALSlashingConditionsL1 is
    AccessControlUpgradeable,
    UUPSUpgradeable,
    PausableUpgradeable
{
    // ============ Constants ============
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant SLASHER_ROLE = keccak256("SLASHER_ROLE");

    // ============ State Variables ============

    /// @notice Staking V2 SeigManager address (for stakeOf queries)
    address public seigManager;

    /// @notice Layer2 address for stake queries and slashing
    address public talLayer2Address;

    /// @notice Total slashed per operator
    mapping(address => uint256) public totalSlashedAmount;

    /// @notice Slash count per operator
    mapping(address => uint256) public slashCount;

    /// @notice Last slash timestamp per operator
    mapping(address => uint256) public lastSlashTime;

    /// @notice Whether slashing is globally enabled
    bool public slashingEnabled;

    /// @notice V2 DepositManager address (for slash execution)
    address public depositManager;

    /// @notice Treasury address to receive slashed funds
    address public slashRecipient;

    /// @notice Storage gap
    uint256[28] private __gap;

    // ============ Events ============
    event SlashExecuted(address indexed operator, uint256 amount, bytes32 reason);
    event SlashingEnabled();
    event SlashingDisabled();

    // ============ Errors ============
    error UnauthorizedSlasher(address caller);
    error SlashAmountExceedsStake(address operator, uint256 amount, uint256 stake);
    error SlashingIsDisabled();
    error SlashingTransferFailed(address operator, uint256 amount);

    // ============ Initializer ============

    function initialize(
        address admin_,
        address seigManager_,
        address talLayer2Address_,
        address bridgeL1_,
        address depositManager_,
        address slashRecipient_
    ) external initializer {
        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(UPGRADER_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);
        _grantRole(SLASHER_ROLE, bridgeL1_);

        seigManager = seigManager_;
        talLayer2Address = talLayer2Address_;
        depositManager = depositManager_;
        slashRecipient = slashRecipient_;
        slashingEnabled = true;
    }

    // ============ Slashing Functions ============

    /// @notice Execute a slash against an operator's L1 stake
    /// @dev Uses DepositManager.slash(layer2, recipient, amount) to transfer slashed
    ///      funds to the slash recipient (treasury)
    /// @param operator The operator to slash
    /// @param amount The amount of TON to slash
    /// @return slashedAmount The actual amount slashed
    function slash(
        address operator,
        uint256 amount
    ) external onlyRole(SLASHER_ROLE) whenNotPaused returns (uint256 slashedAmount) {
        if (!slashingEnabled) revert SlashingIsDisabled();

        // Query current stake to validate slash amount
        uint256 currentStake = IStakingV2(seigManager).stakeOf(talLayer2Address, operator);
        if (amount > currentStake) {
            revert SlashAmountExceedsStake(operator, amount, currentStake);
        }

        // Execute slash via Staking V2 DepositManager
        // slash() transfers the slashed funds to the slashRecipient (treasury)
        bool success = IDepositManagerV2(depositManager).slash(
            talLayer2Address,
            slashRecipient,
            amount
        );
        if (!success) revert SlashingTransferFailed(operator, amount);

        slashedAmount = amount;
        totalSlashedAmount[operator] += slashedAmount;
        slashCount[operator]++;
        lastSlashTime[operator] = block.timestamp;

        bytes32 reason = keccak256(abi.encodePacked("TAL_SLASH", operator, amount, block.timestamp));
        emit SlashExecuted(operator, slashedAmount, reason);
    }

    // ============ View Functions ============

    /// @notice Get current stake of an operator from SeigManager
    /// @param operator The operator address
    /// @return The current staked amount (coinage-based, includes seigniorage)
    function getOperatorStake(address operator) external view returns (uint256) {
        return IStakingV2(seigManager).stakeOf(talLayer2Address, operator);
    }

    /// @notice Check if a caller is authorized to execute slashing
    function isAuthorizedSlasher(address caller) external view returns (bool) {
        return hasRole(SLASHER_ROLE, caller);
    }

    /// @notice Get total amount slashed for an operator
    function getTotalSlashed(address operator) external view returns (uint256) {
        return totalSlashedAmount[operator];
    }

    /// @notice Get operator slash stats
    function getSlashStats(address operator) external view returns (
        uint256 totalSlashed_,
        uint256 slashCount_,
        uint256 lastSlash_
    ) {
        return (totalSlashedAmount[operator], slashCount[operator], lastSlashTime[operator]);
    }

    // ============ Admin Functions ============

    function setSeigManager(address seigManager_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        seigManager = seigManager_;
    }

    function setDepositManager(address depositManager_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        depositManager = depositManager_;
    }

    function setSlashRecipient(address slashRecipient_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        slashRecipient = slashRecipient_;
    }

    function enableSlashing() external onlyRole(DEFAULT_ADMIN_ROLE) {
        slashingEnabled = true;
        emit SlashingEnabled();
    }

    function disableSlashing() external onlyRole(DEFAULT_ADMIN_ROLE) {
        slashingEnabled = false;
        emit SlashingDisabled();
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}
