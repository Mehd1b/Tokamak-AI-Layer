// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IVaultFactory } from "./interfaces/IVaultFactory.sol";

/// @notice Minimal interface to query the underlying ERC20 asset and its
///         decimals from a KernelVault. Used for decimal normalisation in
///         the points accrual formula.
interface IVaultAssetInfo {
    function asset() external view returns (address);
}

interface IERC20DecimalsView {
    function decimals() external view returns (uint8);
}

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

    /// @notice L-29 fix: maximum depositors per recordExecution call (bounds
    ///         the O(N^2) dedupe pass and caps gas).
    uint256 public constant MAX_RECORD_EXECUTION_BATCH = 100;

    /// @notice L-52 fix: minimum notice before a newly-set seasonEnd activates,
    ///         giving users time to accrue their final points before the cutoff.
    uint256 public constant MIN_SEASON_NOTICE = 24 hours;

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

    // ─────────────────────────────────────────────────────────────────────
    // Decimal-aware point accrual
    // ─────────────────────────────────────────────────────────────────────
    // The accrual formula has the form
    //   points = (depositBalance * elapsed * multiplier) / (POINTS_PRECISION * SECONDS_PER_DAY)
    // where POINTS_PRECISION = 1e18. The formula was designed assuming a
    // vault whose asset uses 18 decimals — a 1 token balance is 1e18. For
    // a USDC vault (6 decimals) a 1-token balance is 1e6, so the formula
    // underrepresents the deposit by a factor of 1e12 and rounds most
    // legitimate deposits down to zero points per second.
    //
    // The fix is to normalise `depositBalance` to 18 decimals before
    // feeding it into the formula. The per-vault scale factor is
    // `10 ** (18 - assetDecimals)`, cached lazily on first use so we make
    // at most two external view calls per vault over the contract's
    // lifetime (one to read `asset()`, one to read `decimals()`). For
    // vaults whose asset has more than 18 decimals, normalisation scales
    // DOWN instead — a per-vault down-scale factor is cached symmetrically.
    //
    // Native-ETH vaults (asset == address(0)) use 18 decimals by
    // convention, producing a scale factor of 1.
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Per-vault multiplier applied to raw `depositBalance` to
    ///         convert it to 18-decimal "normalised" units. Values > 0
    ///         are multiplicative; `vaultDecimalDownScale` handles the
    ///         divisor case for >18-decimal assets.
    mapping(address => uint256) public vaultDecimalUpScale;

    /// @notice Per-vault divisor applied to raw `depositBalance` when
    ///         the asset has more than 18 decimals. Exactly one of
    ///         `vaultDecimalUpScale` and `vaultDecimalDownScale` is > 0
    ///         per vault after initialisation.
    mapping(address => uint256) public vaultDecimalDownScale;

    /// @notice Whether a vault's decimal scale has been cached. Used to
    ///         distinguish "not yet fetched" from "fetched with scale 1".
    mapping(address => bool) public vaultDecimalsCached;

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

    /// @notice L-30 helper: return the effective "now" for accrual computations,
    ///         clamped to the season boundary so late callers still collect their
    ///         pro-rata points up to the cutoff instead of forfeiting them.
    function _accrualNow() internal view returns (uint256) {
        if (seasonEnd != 0 && block.timestamp > seasonEnd) return seasonEnd;
        return block.timestamp;
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
    /// @dev L-52 fix: non-zero timestamps must give users at least
    ///      MIN_SEASON_NOTICE to accrue their final points before the cutoff.
    function setSeasonEnd(uint256 timestamp) external onlyOwner {
        if (timestamp != 0) {
            if (timestamp <= block.timestamp) revert InvalidSeasonEnd();
            require(
                timestamp >= block.timestamp + MIN_SEASON_NOTICE,
                "notice too short"
            );
        }
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
    /// @dev L-30 / L-52 fix: removed the hard `seasonActive` revert. Users can
    ///      still call `accruePoints` after the season has ended to collect
    ///      their final pro-rata points up to `seasonEnd`. Once their
    ///      lastAccrualTimestamp reaches seasonEnd, subsequent calls are no-ops.
    function accruePoints(address vault, address user)
        public
        onlyDeployedVault(vault)
    {
        AccrualState storage state = accrualStates[user][vault];

        // Nothing to accrue if no deposit balance is tracked
        if (state.depositBalance == 0) return;

        uint256 nowEff = _accrualNow();

        // Nothing to accrue if no time has passed
        if (state.lastAccrualTimestamp == 0 || nowEff <= state.lastAccrualTimestamp) {
            if (state.lastAccrualTimestamp == 0) {
                state.lastAccrualTimestamp = nowEff;
            }
            return;
        }

        uint256 elapsed = nowEff - state.lastAccrualTimestamp;
        uint256 multiplier = getMultiplier();

        // Normalise the stored depositBalance to 18-decimal units BEFORE
        // feeding it into the accrual formula. Without normalisation,
        // non-18-decimal vaults (notably USDC at 6 decimals) round to
        // zero points per second under any realistic deposit size.
        uint256 normalized = _normalizeBalance(vault, state.depositBalance);

        // Points = (normalizedBalance / 1e18) * (elapsed / 86400) * multiplier
        // Rewritten to avoid precision loss: (normalized * elapsed * multiplier) / (1e18 * 86400)
        uint256 rawPoints =
            (normalized * elapsed * multiplier) / (POINTS_PRECISION * SECONDS_PER_DAY);

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

        state.lastAccrualTimestamp = nowEff;
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

        // Accrue any pending points before balance change (now safe to call
        // after season end — accruePoints clamps elapsed to seasonEnd).
        if (accrualStates[user][vault].depositBalance > 0) {
            accruePoints(vault, user);
        }

        accrualStates[user][vault].depositBalance = newBalance;
        accrualStates[user][vault].lastAccrualTimestamp = _accrualNow();

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

        // L-29 fix: cap batch size
        require(depositors.length <= MAX_RECORD_EXECUTION_BATCH, "batch too large");

        // L-29 fix: dedupe depositors via a mapping nested in the execution tx.
        // We track which depositors have already been rewarded in this call to
        // prevent N×bonus amplification via `[alice, alice, ...]` arrays.
        uint256 rewarded = 0;
        for (uint256 i = 0; i < depositors.length; i++) {
            address depositor = depositors[i];
            if (depositor == address(0)) continue;
            // Inner dedupe loop — O(N^2) for small N is cheaper than a storage map.
            // Practical cap is MAX_RECORD_EXECUTION_BATCH below.
            bool seen = false;
            for (uint256 j = 0; j < i; j++) {
                if (depositors[j] == depositor) {
                    seen = true;
                    break;
                }
            }
            if (seen) continue;
            executionPoints[depositor] += EXECUTION_BONUS_POINTS;
            totalPoints[depositor] += EXECUTION_BONUS_POINTS;
            rewarded++;
        }

        emit ExecutionBonus(vault, rewarded);
    }

    /// @notice Set the referrer for a user (can only be set once)
    /// @param user The user being referred
    /// @param referrer The referrer address
    /// @dev L-14 fix: only the user being referred may designate their own
    ///      referrer. Without this check, an attacker could front-run any
    ///      victim's first `setReferrer` call to hijack the referral bonus.
    /// @dev L-52 fix: block mutual (two-hop) cycles so pairs cannot farm each
    ///      other's referral bonuses indefinitely.
    function setReferrer(address user, address referrer) external {
        if (msg.sender != user) revert NotAuthorized();
        if (user == referrer) revert SelfReferral();
        if (referrers[user] != address(0)) revert AlreadyReferred();
        if (referrer == address(0)) revert ZeroAddress();
        // L-52: prevent the direct `A → B → A` cycle
        if (referrers[referrer] == user) revert SelfReferral();

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
    /// @dev View variant applies the same decimal normalisation as the
    ///      state-mutating `accruePoints`. Uses the stored cached scale
    ///      where available; if the vault's scale has not yet been
    ///      fetched, falls back to the raw balance (which will match
    ///      the first `accruePoints` call that populates the cache).
    function getPendingPoints(address vault, address user) external view returns (uint256) {
        AccrualState memory state = accrualStates[user][vault];
        if (state.depositBalance == 0 || state.lastAccrualTimestamp == 0) return 0;
        if (block.timestamp <= state.lastAccrualTimestamp) return 0;

        uint256 elapsed = block.timestamp - state.lastAccrualTimestamp;
        uint256 multiplier = getMultiplier();
        uint256 normalized = _normalizeBalanceView(vault, state.depositBalance);

        return (normalized * elapsed * multiplier) / (POINTS_PRECISION * SECONDS_PER_DAY);
    }

    /// @notice Get the daily accrual rate for a user in a vault
    /// @param vault The vault address
    /// @param user The user address
    /// @return Points per day at current multiplier
    function getDailyRate(address vault, address user) external view returns (uint256) {
        AccrualState memory state = accrualStates[user][vault];
        if (state.depositBalance == 0) return 0;

        uint256 multiplier = getMultiplier();
        uint256 normalized = _normalizeBalanceView(vault, state.depositBalance);
        return (normalized * multiplier) / POINTS_PRECISION;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internal decimal-normalisation helpers
    // ─────────────────────────────────────────────────────────────────────

    /// @notice State-mutating variant: normalises `amount` to 18-decimal
    ///         units using the per-vault decimal scale, caching the
    ///         scale on first use so we only make external calls once
    ///         per vault.
    /// @dev Safe for native-ETH vaults (asset == address(0)) — they are
    ///      treated as 18-decimal and produce an up-scale of 1.
    function _normalizeBalance(address vault, uint256 amount) internal returns (uint256) {
        if (amount == 0) return 0;

        if (!vaultDecimalsCached[vault]) {
            _cacheVaultDecimals(vault);
        }

        uint256 upScale = vaultDecimalUpScale[vault];
        if (upScale > 0) {
            return amount * upScale;
        }
        uint256 downScale = vaultDecimalDownScale[vault];
        if (downScale > 0) {
            return amount / downScale;
        }
        // Cached, scale == 1 (exactly 18-decimal asset).
        return amount;
    }

    /// @notice View variant of `_normalizeBalance`: reads cached scale
    ///         but does not write. If the cache has not been filled for
    ///         this vault, falls back to the raw amount.
    function _normalizeBalanceView(address vault, uint256 amount) internal view returns (uint256) {
        if (amount == 0) return 0;
        if (!vaultDecimalsCached[vault]) return amount;

        uint256 upScale = vaultDecimalUpScale[vault];
        if (upScale > 0) return amount * upScale;
        uint256 downScale = vaultDecimalDownScale[vault];
        if (downScale > 0) return amount / downScale;
        return amount;
    }

    /// @notice Read the vault's asset decimals once and cache the
    ///         corresponding scale factor. For 18-decimal assets the
    ///         cached scale is neutral (both up and down are 0, and
    ///         `_normalizeBalance` returns the raw amount).
    /// @dev Defensive code layers:
    ///        1. Skip if the vault address has no bytecode — calling a
    ///           typed function on an EOA would revert with
    ///           "call to non-contract address", not a catchable revert.
    ///        2. try/catch the `asset()` read so a vault that does not
    ///           expose the getter falls through to the neutral default.
    ///        3. Skip if the returned asset is `address(0)` (native-ETH
    ///           vault — 18 decimals by convention).
    ///        4. try/catch the `decimals()` read on the asset contract
    ///           with a code-length check, same pattern.
    ///      Any skip sets the "cached" flag so we do not retry per
    ///      accrual, and leaves both scale factors at 0 (neutral).
    function _cacheVaultDecimals(address vault) internal {
        vaultDecimalsCached[vault] = true;

        // Guard against calling a typed function on an EOA — Solidity
        // / the test environment aborts with "call to non-contract
        // address" and that is NOT a catchable revert.
        if (vault.code.length == 0) return;

        address assetAddr;
        try IVaultAssetInfo(vault).asset() returns (address a) {
            assetAddr = a;
        } catch {
            return; // fall through to 1:1 default
        }

        // Native-ETH vaults use 18 decimals by convention.
        if (assetAddr == address(0)) return;
        if (assetAddr.code.length == 0) return;

        uint8 assetDecimals;
        try IERC20DecimalsView(assetAddr).decimals() returns (uint8 d) {
            assetDecimals = d;
        } catch {
            return; // fall through to 1:1 default
        }

        if (assetDecimals < 18) {
            vaultDecimalUpScale[vault] = 10 ** (18 - assetDecimals);
        } else if (assetDecimals > 18) {
            vaultDecimalDownScale[vault] = 10 ** (assetDecimals - 18);
        }
        // else: 18-decimal asset; both scales stay 0, handler returns raw.
    }
}
