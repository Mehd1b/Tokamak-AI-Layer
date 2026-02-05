// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

/**
 * @title TALSlashingConditionsL1
 * @notice Executes slashing against Staking V3 DepositManagerV3
 * @dev Registered with Staking V3 as an authorized slashing entity
 *
 * Only accepts slash calls from TALStakingBridgeL1.
 * The L2->L1 message finalization period (~7 days on Optimism)
 * serves as a natural appeal window before slashing executes.
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

    /// @notice Staking V3 DepositManagerV3 address
    address public depositManagerV3;

    /// @notice Layer2 address for stake queries
    address public talLayer2Address;

    /// @notice Total slashed per operator
    mapping(address => uint256) public totalSlashedAmount;

    /// @notice Slash count per operator
    mapping(address => uint256) public slashCount;

    /// @notice Last slash timestamp per operator
    mapping(address => uint256) public lastSlashTime;

    /// @notice Whether slashing is globally enabled
    bool public slashingEnabled;

    /// @notice Storage gap
    uint256[30] private __gap;

    // ============ Events ============
    event SlashExecuted(address indexed operator, uint256 amount, bytes32 reason);
    event SlashingEnabled();
    event SlashingDisabled();

    // ============ Errors ============
    error UnauthorizedSlasher(address caller);
    error SlashAmountExceedsStake(address operator, uint256 amount, uint256 stake);
    error SlashingIsDisabled();

    // ============ Initializer ============

    function initialize(
        address admin_,
        address depositManagerV3_,
        address talLayer2Address_,
        address bridgeL1_
    ) external initializer {
        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(UPGRADER_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);
        _grantRole(SLASHER_ROLE, bridgeL1_);

        depositManagerV3 = depositManagerV3_;
        talLayer2Address = talLayer2Address_;
        slashingEnabled = true;
    }

    // ============ Slashing Functions ============

    /// @notice Execute a slash against an operator's L1 stake
    /// @param operator The operator to slash
    /// @param amount The amount of TON to slash
    /// @return slashedAmount The actual amount slashed
    function slash(
        address operator,
        uint256 amount
    ) external onlyRole(SLASHER_ROLE) whenNotPaused returns (uint256 slashedAmount) {
        if (!slashingEnabled) revert SlashingIsDisabled();

        // In production: call DepositManagerV3 to execute slash
        // (bool success, bytes memory data) = depositManagerV3.call(
        //     abi.encodeWithSignature("slash(address,address,uint256)", talLayer2Address, operator, amount)
        // );

        slashedAmount = amount; // Placeholder
        totalSlashedAmount[operator] += slashedAmount;
        slashCount[operator]++;
        lastSlashTime[operator] = block.timestamp;

        bytes32 reason = keccak256(abi.encodePacked("TAL_SLASH", operator, amount, block.timestamp));
        emit SlashExecuted(operator, slashedAmount, reason);
    }

    // ============ View Functions ============

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
