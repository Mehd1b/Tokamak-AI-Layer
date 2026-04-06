// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IVaultFactory } from "./interfaces/IVaultFactory.sol";

/// @title PointsProgram
/// @notice Non-transferable points system that rewards depositors for vault participation.
/// @dev Points accrue over time based on deposit balances, with bonuses for early adoption,
///      referrals, and successful vault executions. Points are stored as a simple mapping
///      and are NOT an ERC20 token.
contract PointsProgram {
    // ============ State ============

    /// @notice Contract owner (can update season end, authorized callers)
    address public owner;

    /// @notice Timestamp when the contract was deployed (for early adopter bonus)
    uint256 public immutable deployedAt;

    /// @notice Duration of the early adopter bonus period (30 days)
    uint256 public constant EARLY_ADOPTER_PERIOD = 30 days;

    /// @notice Early adopter multiplier (3x)
    uint256 public constant EARLY_ADOPTER_MULTIPLIER = 3;

    /// @notice Standard multiplier (1x)
    uint256 public constant STANDARD_MULTIPLIER = 1;

    /// @notice Bonus points awarded per depositor for each successful vault execution
    uint256 public constant EXECUTION_BONUS_POINTS = 50;

    /// @notice Referral bonus percentage (10% = 1000 bps)
    uint256 public constant REFERRAL_BONUS_BPS = 1000;

    /// @notice Basis points denominator
    uint256 public constant BPS_DENOMINATOR = 10000;

    /// @notice Precision factor for points (1 point per 1e18 deposited per day)
    uint256 public constant POINTS_PRECISION = 1e18;

    /// @notice Seconds in one day
    uint256 public constant SECONDS_PER_DAY = 86400;

    /// @notice VaultFactory for checking deployed vaults
    IVaultFactory public immutable vaultFactory;

    /// @notice Season end timestamp (0 = no season end set)
    uint256 public seasonEnd;

    /// @notice Total accumulated points per user
    mapping(address => uint256) public totalPoints;

    /// @notice Deposit points per user (excluding bonuses)
    mapping(address => uint256) public depositPoints;

    /// @notice Execution bonus points per user
    mapping(address => uint256) public executionPoints;

    /// @notice Referral bonus points per user
    mapping(address => uint256) public referralBonusPoints;

    /// @notice Per-user per-vault accrual state
    struct AccrualState {
        uint256 lastAccrualTimestamp;
        uint256 depositBalance;
    }

    /// @notice user => vault => accrual state
    mapping(address => mapping(address => AccrualState)) public accrualStates;

    /// @notice Referrer mapping: user => referrer address
    mapping(address => address) public referrers;

    /// @notice Authorized callers that can record executions
    mapping(address => bool) public authorizedCallers;

    // ============ Events ============

    /// @notice Emitted when points are accrued for a user
    event PointsAccrued(address indexed user, uint256 points);

    /// @notice Emitted when execution bonus points are awarded
    event ExecutionBonus(address indexed vault, uint256 usersRewarded);

    /// @notice Emitted when a referral bonus is awarded
    event ReferralBonus(address indexed referrer, address indexed user, uint256 points);

    /// @notice Emitted when ownership is transferred
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /// @notice Emitted when season end is updated
    event SeasonEndUpdated(uint256 timestamp);

    /// @notice Emitted when an authorized caller is updated
    event AuthorizedCallerUpdated(address indexed caller, bool authorized);

    /// @notice Emitted when a deposit balance is updated for accrual tracking
    event DepositBalanceUpdated(address indexed user, address indexed vault, uint256 balance);

    /// @notice Emitted when a referrer is set for a user
    event ReferrerSet(address indexed user, address indexed referrer);

    // ============ Errors ============

    /// @notice Caller is not the owner
    error NotOwner();

    /// @notice Vault is not deployed by the factory
    error InvalidVault(address vault);

    /// @notice Season has ended
    error SeasonEnded();

    /// @notice Season end must be in the future
    error InvalidSeasonEnd();

    /// @notice User cannot refer themselves
    error SelfReferral();

    /// @notice User already has a referrer
    error AlreadyReferred();

    /// @notice Caller is not authorized to record executions
    error NotAuthorized();

    /// @notice Array length mismatch
    error ArrayLengthMismatch();

    /// @notice Zero address not allowed
    error ZeroAddress();

    // ============ Constructor ============

    /// @param _vaultFactory The VaultFactory contract address
    constructor(address _vaultFactory) {
        if (_vaultFactory == address(0)) revert ZeroAddress();
        owner = msg.sender;
        vaultFactory = IVaultFactory(_vaultFactory);
        deployedAt = block.timestamp;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ============ Modifiers ============

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyDeployedVault(address vault) {
        if (!vaultFactory.isDeployedVault(vault)) revert InvalidVault(vault);
        _;
    }

    modifier seasonActive() {
        if (seasonEnd != 0 && block.timestamp >= seasonEnd) revert SeasonEnded();
        _;
    }

    // ============ Owner Functions ============

    /// @notice Transfer ownership to a new address
    /// @param newOwner The new owner address
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Set the season end timestamp
    /// @param timestamp The season end timestamp (must be in the future, or 0 to clear)
    function setSeasonEnd(uint256 timestamp) external onlyOwner {
        if (timestamp != 0 && timestamp <= block.timestamp) revert InvalidSeasonEnd();
        seasonEnd = timestamp;
        emit SeasonEndUpdated(timestamp);
    }

    /// @notice Set an authorized caller for recording executions
    /// @param caller The caller address
    /// @param authorized Whether the caller is authorized
    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        authorizedCallers[caller] = authorized;
        emit AuthorizedCallerUpdated(caller, authorized);
    }

    // ============ Public Functions ============

    /// @notice Accrue points for a user in a specific vault based on elapsed time
    /// @param vault The vault address (must be deployed by VaultFactory)
    /// @param user The user address to accrue points for
    function accruePoints(address vault, address user)
        public
        onlyDeployedVault(vault)
        seasonActive
    {
        AccrualState storage state = accrualStates[user][vault];

        // Nothing to accrue if no deposit balance is tracked
        if (state.depositBalance == 0) return;

        // Nothing to accrue if no time has passed
        if (state.lastAccrualTimestamp == 0 || block.timestamp <= state.lastAccrualTimestamp) {
            if (state.lastAccrualTimestamp == 0) {
                state.lastAccrualTimestamp = block.timestamp;
            }
            return;
        }

        uint256 elapsed = block.timestamp - state.lastAccrualTimestamp;
        uint256 multiplier = getMultiplier();

        // Points = (depositBalance / 1e18) * (elapsed / 86400) * multiplier
        // Rewritten to avoid precision loss: (depositBalance * elapsed * multiplier) / (1e18 * 86400)
        uint256 rawPoints =
            (state.depositBalance * elapsed * multiplier) / (POINTS_PRECISION * SECONDS_PER_DAY);

        if (rawPoints > 0) {
            depositPoints[user] += rawPoints;
            totalPoints[user] += rawPoints;
            emit PointsAccrued(user, rawPoints);

            // Award referral bonus (10% of accrued points to referrer)
            address referrer = referrers[user];
            if (referrer != address(0)) {
                uint256 referralBonus = (rawPoints * REFERRAL_BONUS_BPS) / BPS_DENOMINATOR;
                if (referralBonus > 0) {
                    referralBonusPoints[referrer] += referralBonus;
                    totalPoints[referrer] += referralBonus;
                    emit ReferralBonus(referrer, user, referralBonus);
                }
            }
        }

        state.lastAccrualTimestamp = block.timestamp;
    }

    /// @notice Batch accrue points for multiple user-vault pairs
    /// @param vaults Array of vault addresses
    /// @param users Array of user addresses (must match vaults length)
    function batchAccrue(address[] calldata vaults, address[] calldata users) external {
        if (vaults.length != users.length) revert ArrayLengthMismatch();
        for (uint256 i = 0; i < vaults.length; i++) {
            accruePoints(vaults[i], users[i]);
        }
    }

    /// @notice Update the tracked deposit balance for a user in a vault.
    ///         Accrues any pending points before updating.
    /// @param vault The vault address
    /// @param user The user address
    /// @param newBalance The new deposit balance (in token units, e.g., 100e18 for 100 tokens)
    function updateDepositBalance(address vault, address user, uint256 newBalance)
        external
        onlyDeployedVault(vault)
    {
        // Only allow owner, authorized callers, or the vault itself to update balances
        if (msg.sender != owner && !authorizedCallers[msg.sender] && msg.sender != vault) {
            revert NotAuthorized();
        }

        // Accrue any pending points before balance change
        if (accrualStates[user][vault].depositBalance > 0) {
            // Inline check to avoid revert if season ended — just skip accrual
            if (seasonEnd == 0 || block.timestamp < seasonEnd) {
                accruePoints(vault, user);
            }
        }

        accrualStates[user][vault].depositBalance = newBalance;
        accrualStates[user][vault].lastAccrualTimestamp = block.timestamp;

        emit DepositBalanceUpdated(user, vault, newBalance);
    }

    /// @notice Record a successful vault execution and award bonus points.
    ///         Awards EXECUTION_BONUS_POINTS to each depositor provided.
    /// @param vault The vault address
    /// @param depositors The depositors to award execution bonus to
    function recordExecution(address vault, address[] calldata depositors)
        external
        onlyDeployedVault(vault)
        seasonActive
    {
        // Only allow owner, authorized callers, or the vault itself
        if (msg.sender != owner && !authorizedCallers[msg.sender] && msg.sender != vault) {
            revert NotAuthorized();
        }

        uint256 rewarded = 0;
        for (uint256 i = 0; i < depositors.length; i++) {
            address depositor = depositors[i];
            executionPoints[depositor] += EXECUTION_BONUS_POINTS;
            totalPoints[depositor] += EXECUTION_BONUS_POINTS;
            rewarded++;
        }

        emit ExecutionBonus(vault, rewarded);
    }

    /// @notice Set the referrer for a user (can only be set once)
    /// @param user The user being referred
    /// @param referrer The referrer address
    function setReferrer(address user, address referrer) external {
        if (user == referrer) revert SelfReferral();
        if (referrers[user] != address(0)) revert AlreadyReferred();
        if (referrer == address(0)) revert ZeroAddress();

        referrers[user] = referrer;
        emit ReferrerSet(user, referrer);
    }

    // ============ View Functions ============

    /// @notice Get total points for a user
    /// @param user The user address
    /// @return Total accumulated points
    function getPoints(address user) external view returns (uint256) {
        return totalPoints[user];
    }

    /// @notice Get the current multiplier (3x during early adopter period, 1x after)
    /// @return The current multiplier
    function getMultiplier() public view returns (uint256) {
        if (block.timestamp <= deployedAt + EARLY_ADOPTER_PERIOD) {
            return EARLY_ADOPTER_MULTIPLIER;
        }
        return STANDARD_MULTIPLIER;
    }

    /// @notice Get the points breakdown for a user
    /// @param user The user address
    /// @return deposit_ Deposit-based points
    /// @return execution_ Execution bonus points
    /// @return referral_ Referral bonus points
    /// @return total_ Total points
    function getPointsBreakdown(address user)
        external
        view
        returns (uint256 deposit_, uint256 execution_, uint256 referral_, uint256 total_)
    {
        return (depositPoints[user], executionPoints[user], referralBonusPoints[user], totalPoints[user]);
    }

    /// @notice Get the pending (unaccrued) points for a user in a vault
    /// @param vault The vault address
    /// @param user The user address
    /// @return Pending points that would be accrued if accruePoints is called now
    function getPendingPoints(address vault, address user) external view returns (uint256) {
        AccrualState memory state = accrualStates[user][vault];
        if (state.depositBalance == 0 || state.lastAccrualTimestamp == 0) return 0;
        if (block.timestamp <= state.lastAccrualTimestamp) return 0;

        uint256 elapsed = block.timestamp - state.lastAccrualTimestamp;
        uint256 multiplier = getMultiplier();

        return (state.depositBalance * elapsed * multiplier) / (POINTS_PRECISION * SECONDS_PER_DAY);
    }

    /// @notice Get the daily accrual rate for a user in a vault
    /// @param vault The vault address
    /// @param user The user address
    /// @return Points per day at current multiplier
    function getDailyRate(address vault, address user) external view returns (uint256) {
        AccrualState memory state = accrualStates[user][vault];
        if (state.depositBalance == 0) return 0;

        uint256 multiplier = getMultiplier();
        return (state.depositBalance * multiplier) / POINTS_PRECISION;
    }
}
