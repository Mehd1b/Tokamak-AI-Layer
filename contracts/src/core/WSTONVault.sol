// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title WSTONVault
 * @notice L2 vault for locking bridged WSTON tokens with slashing support
 * @dev Non-upgradeable. Operators lock WSTON on L2 to back agent validations.
 *      SLASH_ROLE holders (e.g. StakingIntegrationModule, ValidationRegistry)
 *      can seize locked WSTON and send it to the treasury.
 *
 * Flow:
 * 1. Operator bridges WSTON from L1 → L2 via Tokamak bridge portal
 * 2. Operator approves + calls lock(amount) to deposit WSTON into vault
 * 3. Locked WSTON determines operator tier (UNVERIFIED / VERIFIED / PREMIUM)
 * 4. To exit: requestUnlock(amount) → wait withdrawalDelay blocks → processUnlock()
 * 5. On misbehaviour: SLASH_ROLE calls slash(operator, amount) → WSTON sent to treasury
 */
contract WSTONVault is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    bytes32 public constant SLASH_ROLE = keccak256("SLASH_ROLE");

    uint256 public constant VERIFIED_THRESHOLD = 1000 ether;  // 1000 WSTON
    uint256 public constant PREMIUM_THRESHOLD = 10000 ether;   // 10000 WSTON

    // ============ Enums ============

    enum OperatorTier {
        UNVERIFIED,
        VERIFIED,
        PREMIUM
    }

    // ============ Structs ============

    struct WithdrawalRequest {
        uint256 amount;
        uint256 unlockBlock;
    }

    // ============ State ============

    /// @notice The bridged WSTON ERC20 token on L2
    IERC20 public immutable wstonToken;

    /// @notice Treasury address that receives slashed WSTON
    address public treasury;

    /// @notice Number of blocks to wait after requestUnlock before processUnlock
    uint256 public withdrawalDelay;

    /// @notice Minimum amount that can be locked at once
    uint256 public minLockAmount;

    /// @notice Operator address → locked WSTON balance
    mapping(address => uint256) public lockedBalance;

    /// @notice Operator address → pending withdrawal requests
    mapping(address => WithdrawalRequest[]) private _withdrawalRequests;

    // ============ Events ============

    event Locked(address indexed operator, uint256 amount);
    event UnlockRequested(address indexed operator, uint256 amount, uint256 unlockBlock);
    event UnlockProcessed(address indexed operator, uint256 totalAmount);
    event Slashed(address indexed operator, uint256 amount, address indexed treasury);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event WithdrawalDelayUpdated(uint256 oldDelay, uint256 newDelay);
    event MinLockAmountUpdated(uint256 oldMin, uint256 newMin);

    // ============ Errors ============

    error ZeroAmount();
    error BelowMinLock(uint256 amount, uint256 minRequired);
    error InsufficientLockedBalance(uint256 requested, uint256 available);
    error NoReadyWithdrawals();
    error ZeroAddress();
    error SlashExceedsBalance(uint256 slashAmount, uint256 balance);

    // ============ Constructor ============

    /**
     * @param _wstonToken Address of the bridged WSTON ERC20 on L2
     * @param _treasury Address to receive slashed WSTON
     * @param _withdrawalDelay Blocks to wait before processUnlock
     * @param _minLockAmount Minimum lock amount
     * @param _admin Admin address (receives DEFAULT_ADMIN_ROLE + SLASH_ROLE)
     */
    constructor(
        address _wstonToken,
        address _treasury,
        uint256 _withdrawalDelay,
        uint256 _minLockAmount,
        address _admin
    ) {
        if (_wstonToken == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();

        wstonToken = IERC20(_wstonToken);
        treasury = _treasury;
        withdrawalDelay = _withdrawalDelay;
        minLockAmount = _minLockAmount;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(SLASH_ROLE, _admin);
    }

    // ============ Core Functions ============

    /**
     * @notice Lock WSTON in the vault. Caller must have approved this contract.
     * @param amount Amount of WSTON to lock
     */
    function lock(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount < minLockAmount) revert BelowMinLock(amount, minLockAmount);

        wstonToken.safeTransferFrom(msg.sender, address(this), amount);
        lockedBalance[msg.sender] += amount;

        emit Locked(msg.sender, amount);
    }

    /**
     * @notice Request to unlock WSTON. Starts the withdrawal delay.
     * @param amount Amount of WSTON to unlock
     */
    function requestUnlock(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (lockedBalance[msg.sender] < amount) {
            revert InsufficientLockedBalance(amount, lockedBalance[msg.sender]);
        }

        lockedBalance[msg.sender] -= amount;
        uint256 unlockBlock = block.number + withdrawalDelay;

        _withdrawalRequests[msg.sender].push(WithdrawalRequest({
            amount: amount,
            unlockBlock: unlockBlock
        }));

        emit UnlockRequested(msg.sender, amount, unlockBlock);
    }

    /**
     * @notice Process all ready withdrawal requests. Transfers WSTON back to operator.
     */
    function processUnlock() external nonReentrant {
        WithdrawalRequest[] storage requests = _withdrawalRequests[msg.sender];
        uint256 totalReady = 0;
        uint256 writeIdx = 0;

        for (uint256 i = 0; i < requests.length; i++) {
            if (requests[i].unlockBlock <= block.number) {
                totalReady += requests[i].amount;
            } else {
                if (writeIdx != i) {
                    requests[writeIdx] = requests[i];
                }
                writeIdx++;
            }
        }

        if (totalReady == 0) revert NoReadyWithdrawals();

        // Remove processed entries by trimming the array
        uint256 toRemove = requests.length - writeIdx;
        for (uint256 i = 0; i < toRemove; i++) {
            requests.pop();
        }

        wstonToken.safeTransfer(msg.sender, totalReady);

        emit UnlockProcessed(msg.sender, totalReady);
    }

    // ============ Slashing ============

    /**
     * @notice Slash an operator's locked WSTON. Sends slashed tokens to treasury.
     * @param operator The operator to slash
     * @param amount Amount of WSTON to slash
     */
    function slash(address operator, uint256 amount) external onlyRole(SLASH_ROLE) nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (lockedBalance[operator] < amount) {
            revert SlashExceedsBalance(amount, lockedBalance[operator]);
        }

        lockedBalance[operator] -= amount;
        wstonToken.safeTransfer(treasury, amount);

        emit Slashed(operator, amount, treasury);
    }

    // ============ View Functions ============

    /**
     * @notice Get locked WSTON balance for an operator
     */
    function getLockedBalance(address operator) external view returns (uint256) {
        return lockedBalance[operator];
    }

    /**
     * @notice Check if operator meets VERIFIED threshold
     */
    function isVerifiedOperator(address operator) external view returns (bool) {
        return lockedBalance[operator] >= VERIFIED_THRESHOLD;
    }

    /**
     * @notice Get operator tier based on locked WSTON amount
     */
    function getOperatorTier(address operator) external view returns (OperatorTier) {
        uint256 balance = lockedBalance[operator];
        if (balance >= PREMIUM_THRESHOLD) return OperatorTier.PREMIUM;
        if (balance >= VERIFIED_THRESHOLD) return OperatorTier.VERIFIED;
        return OperatorTier.UNVERIFIED;
    }

    /**
     * @notice Get the number of pending withdrawal requests for an operator
     */
    function getWithdrawalRequestCount(address operator) external view returns (uint256) {
        return _withdrawalRequests[operator].length;
    }

    /**
     * @notice Get a specific withdrawal request
     */
    function getWithdrawalRequest(address operator, uint256 index) external view returns (
        uint256 amount,
        uint256 unlockBlock
    ) {
        WithdrawalRequest storage req = _withdrawalRequests[operator][index];
        return (req.amount, req.unlockBlock);
    }

    /**
     * @notice Get total amount ready for processUnlock
     */
    function getReadyAmount(address operator) external view returns (uint256 total) {
        WithdrawalRequest[] storage requests = _withdrawalRequests[operator];
        for (uint256 i = 0; i < requests.length; i++) {
            if (requests[i].unlockBlock <= block.number) {
                total += requests[i].amount;
            }
        }
    }

    // ============ Admin Functions ============

    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_treasury == address(0)) revert ZeroAddress();
        address old = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(old, _treasury);
    }

    function setWithdrawalDelay(uint256 _delay) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 old = withdrawalDelay;
        withdrawalDelay = _delay;
        emit WithdrawalDelayUpdated(old, _delay);
    }

    function setMinLockAmount(uint256 _min) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 old = minLockAmount;
        minLockAmount = _min;
        emit MinLockAmountUpdated(old, _min);
    }
}
