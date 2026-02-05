// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "../interfaces/IStakingV3.sol";

/**
 * @title TALSlashingConditionsL1
 * @notice Executes slashing against Staking V3 via the RAT coinage transfer mechanism
 * @dev In Staking V3, slashing is NOT done via a direct DepositManagerV3.slash() call.
 *      Instead, it uses SeigManagerV3's transferCoinageToRat() to transfer the validator's
 *      coinage (staked tokens) to the RAT contract, effectively reducing their stake.
 *
 * Slashing Mechanism (Staking V3):
 * - transferCoinageToRat(layer2, validator, amount): Burns validator coinage, mints to RAT
 * - transferCoinageFromRatTo(layer2, to, amount): Restores coinage from RAT (if challenge succeeds)
 * - Only the authorized RAT contract can call these functions on SeigManagerV3
 *
 * TAL Integration:
 * - TALSlashingConditionsL1 must be registered as the RAT contract in SeigManagerV3,
 *   OR work through the existing RAT contract for slashing authorization
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

    /// @notice Staking V3 SeigManagerV3_1 address (for transferCoinageToRat)
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
    error SlashingTransferFailed(address operator, uint256 amount);

    // ============ Initializer ============

    function initialize(
        address admin_,
        address seigManager_,
        address talLayer2Address_,
        address bridgeL1_
    ) external initializer {
        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(UPGRADER_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);
        _grantRole(SLASHER_ROLE, bridgeL1_);

        seigManager = seigManager_;
        talLayer2Address = talLayer2Address_;
        slashingEnabled = true;
    }

    // ============ Slashing Functions ============

    /// @notice Execute a slash against an operator's L1 stake
    /// @dev Uses SeigManagerV3's transferCoinageToRat to transfer stake to RAT contract
    ///      This requires TALSlashingConditionsL1 to be authorized as the RAT contract
    ///      in SeigManagerV3, or to route through the existing RAT contract.
    /// @param operator The operator to slash
    /// @param amount The amount of TON to slash (in coinage units)
    /// @return slashedAmount The actual amount slashed
    function slash(
        address operator,
        uint256 amount
    ) external onlyRole(SLASHER_ROLE) whenNotPaused returns (uint256 slashedAmount) {
        if (!slashingEnabled) revert SlashingIsDisabled();

        // Query current stake to validate slash amount
        uint256 currentStake = IStakingV3(seigManager).stakeOf(talLayer2Address, operator);
        if (amount > currentStake) {
            revert SlashAmountExceedsStake(operator, amount, currentStake);
        }

        // Execute slash via Staking V3 RAT coinage transfer mechanism
        // transferCoinageToRat burns the validator's coinage and mints it to RAT
        bool success = IStakingV3(seigManager).transferCoinageToRat(
            talLayer2Address,
            operator,
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

    /// @notice Restore slashed funds to an operator (e.g., after successful dispute)
    /// @dev Uses SeigManagerV3's transferCoinageFromRatTo to return coinage
    /// @param operator The operator to restore funds to
    /// @param amount The amount to restore
    /// @return True if restoration succeeded
    function restoreSlashedFunds(
        address operator,
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused returns (bool) {
        bool success = IStakingV3(seigManager).transferCoinageFromRatTo(
            talLayer2Address,
            operator,
            amount
        );
        return success;
    }

    // ============ View Functions ============

    /// @notice Get current stake of an operator from SeigManagerV3
    /// @param operator The operator address
    /// @return The current staked amount (coinage-based, includes seigniorage)
    function getOperatorStake(address operator) external view returns (uint256) {
        return IStakingV3(seigManager).stakeOf(talLayer2Address, operator);
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
