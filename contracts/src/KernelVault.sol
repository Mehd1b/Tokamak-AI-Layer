// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IKernelExecutionVerifier } from "./interfaces/IKernelExecutionVerifier.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { KernelOutputParser } from "./KernelOutputParser.sol";
import { OracleVerifier } from "./libraries/OracleVerifier.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

/// @notice Minimal interface for VaultAccessControl deposit/withdrawal recording
interface IVaultAccessControl {
    function canDeposit(address user, uint256 amount) external view returns (bool);
    function recordDeposit(address user, uint256 amount) external;
    function recordWithdrawal(address user, uint256 amount) external;
}

/// @title KernelVault
/// @notice MVP vault that executes agent actions verified by RISC Zero proofs
/// @dev This contract:
///      1. Holds a single ERC20 asset
///      2. Allows deposits/withdrawals with ERC4626-like PPS (price-per-share) accounting
///      3. Executes agent actions only when valid proof + journal are provided
///      4. Verifies action commitment and parses actions from AgentOutput bytes
///      5. Share price adjusts automatically based on totalAssets/totalShares ratio
contract KernelVault is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    /// @notice Action type for generic contract call
    uint32 public constant ACTION_TYPE_CALL = 0x00000002;

    /// @notice Action type for ERC20 transfer
    uint32 public constant ACTION_TYPE_TRANSFER_ERC20 = 0x00000003;

    /// @notice Action type for no-op
    uint32 public constant ACTION_TYPE_NO_OP = 0x00000004;

    /// @notice Virtual offset for share/asset math (prevents inflation/donation attacks)
    /// @dev Equivalent to OpenZeppelin ERC4626's _decimalsOffset() = 3 → 10**3 = 1000
    /// @notice Virtual offset for share/asset math (public to match MetaVault)
    uint256 public constant DECIMALS_OFFSET = 1e3;
    uint256 internal constant _DECIMALS_OFFSET = DECIMALS_OFFSET;

    /// @notice Maximum allowed gap between nonces for liveness (prevents stuck execution)
    /// @dev Allows operators to skip intermediate executions if needed (e.g., if nonce N is lost/stuck,
    ///      executions N+1 through N+MAX_NONCE_GAP can still proceed). This weakens strict ordering
    ///      but improves liveness. Document: skipped nonces are permanently lost.
    /// @dev Reduced from 100 to 10. A gap of 100 was over-permissive
    ///      and made nonce-squatting DoS cheaper. Ten covers legitimate
    ///      short-term failures and retries.
    uint64 public constant MAX_NONCE_GAP = 10;

    /// @notice Maximum allowed oracle age: 24 hours
    uint64 public constant MAX_ORACLE_AGE_LIMIT = 24 hours;

    /// @notice Delay after which anyone can emergency-settle a stuck strategy
    uint256 public constant EMERGENCY_SETTLE_DELAY = 7 days;

    /// @notice Delay after which depositors can emergency-withdraw while paused
    uint256 public constant EMERGENCY_WITHDRAW_DELAY = 14 days;

    /// @notice Per-CALL ETH value cap, expressed in basis points of
    ///         the vault's `trackedETHBalance`. Applied to ETH vaults only.
    uint256 public constant MAX_CALL_VALUE_BPS = 4000;

    /// @notice Per-CALL asset outflow delta cap, expressed in basis
    ///         points of the vault's `totalAssets()` at the start of the call.
    /// @dev Applied as a post-call balance delta check on BOTH ETH and ERC20
    ///      vaults. Bounds the blast radius of a malicious callData that
    ///      drains via approvals/pulls, and prevents re-entrant drains on
    ///      ETH vaults that would bypass the per-call `value` cap.
    uint256 public constant MAX_CALL_ASSET_DELTA_BPS = 4000;

    // ============ Immutables ============

    /// @notice The ERC20 asset this vault holds
    IERC20 public immutable asset;

    /// @notice The KernelExecutionVerifier contract
    IKernelExecutionVerifier public immutable verifier;

    /// @notice The agent ID this vault is bound to
    bytes32 public immutable agentId;

    /// @notice The trusted imageId pinned at vault deployment (immutable)
    /// @dev This is read from AgentRegistry at deployment time and never changes.
    ///      Registry updates do NOT affect this vault's imageId.
    bytes32 public immutable trustedImageId;

    /// @notice The vault owner (agent author) who can call execute()
    address public immutable owner;

    // ============ State ============

    /// @notice Total shares outstanding
    uint256 public totalShares;

    /// @notice Last execution timestamp
    uint256 public lastExecutionTimestamp;

    /// @notice Last execution nonce processed (for replay protection)
    uint64 public lastExecutionNonce;

    /// @notice Shares balance per account
    mapping(address => uint256) public shares;

    /// @notice Cumulative deposited assets (for TVL tracking)
    uint256 public totalDeposited;

    /// @notice Cumulative withdrawn assets (for TVL tracking)
    uint256 public totalWithdrawn;

    /// @notice Whether a strategy is active (CALL reduced tracked asset balance)
    bool public strategyActive;

    /// @notice Snapshot of totalAssets at time strategy was activated
    uint256 public snapshotTotalAssets;

    /// @notice Snapshot of totalShares at time strategy was activated
    uint256 public snapshotTotalShares;

    /// @notice Timestamp when strategy was activated (for emergency settlement)
    uint256 public strategyActivatedAt;

    /// @notice Trusted oracle signer for PRICE attestations (Role A,
    ///         SEMI_TRUSTED). Used exclusively by
    ///         `KernelVault._validateParsedJournal` for the bound oracle
    ///         signature check. See block comment above for full rationale.
    address public oracleSigner;

    /// @notice Dedicated BOND attestation signer for optimistic
    ///         execution (Role B, FULLY_TRUSTED). Used exclusively by
    ///         `OptimisticKernelVault._verifyOptimisticOracleAndBond`.
    /// @dev Defaults to address(0). OptimisticKernelVault refuses to enable
    ///      optimistic mode until this is set AND differs from `oracleSigner`.
    ///      Regular (non-optimistic) KernelVault flows do NOT read this field.
    address public bondSigner;

    /// @notice Maximum age of oracle data in seconds (0 = no age check)
    uint64 public maxOracleAge;

    /// @notice Whether oracle verification is mandatory for all executions
    bool public requireOracle;

    /// @notice Timestamp when the vault was paused (for emergency withdraw delay)
    uint256 public pausedAt;

    /// @notice Tracked ETH balance for ETH vaults (prevents donation/selfdestruct inflation attacks)
    /// @dev Only meaningful when asset == address(0). Updated in depositETH, withdraw, execute, receive.
    uint256 public trackedETHBalance;

    /// @notice Initial vault balance captured at the start of _executeActions.
    /// @dev Used by _executeCall to cap the per-action asset delta against the INITIAL
    ///      balance rather than the current (diminishing) balance. Without this, N actions
    ///      compound: 1-(0.6)^N drain (3 actions = 78.4%, 10 = 99.4%). With this fix,
    ///      cumulative drain across ALL actions is hard-capped at 40%.
    uint256 internal _executionInitialBalance;

    /// @notice Optional VaultAccessControl address. When set, _processWithdraw
    ///         calls recordWithdrawal() to decrement the deposit counter, allowing users
    ///         who withdraw to re-deposit up to their cap.
    address public accessControl;

    // ============ Fee State ============

    /// @notice Annual management fee in basis points (e.g., 200 = 2%). Max 500 (5%).
    uint256 public managementFeeBps;

    /// @notice Performance fee on profits in basis points (e.g., 2000 = 20%). Max 5000 (50%).
    uint256 public performanceFeeBps;

    /// @notice Address that receives the agent author's share of fees
    address public feeRecipient;

    /// @notice Protocol treasury address (receives protocol's share of fees)
    address public protocolTreasury;

    /// @notice Protocol's share of collected fees in basis points (e.g., 1000 = 10%)
    uint256 public protocolFeeSplitBps;

    /// @notice Timestamp when management fee was last collected
    uint256 public lastFeeTimestamp;

    /// @notice PPS high water mark for performance fee (scaled by 1e18)
    uint256 public highWaterMark;

    // ============ Fee Constants ============

    /// @notice Basis points denominator
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Maximum management fee: 500 bps = 5% annual
    uint256 public constant MAX_MANAGEMENT_FEE_BPS = 500;

    /// @notice Maximum performance fee: 5000 bps = 50% of profits
    uint256 public constant MAX_PERFORMANCE_FEE_BPS = 5000;

    /// @notice Maximum protocol fee split: 5000 bps = 50% of fees
    uint256 public constant MAX_PROTOCOL_FEE_SPLIT_BPS = 5000;

    /// @notice Cooldown between fee rate changes.
    /// @dev Prevents the owner from atomically raising fees before a profitable
    ///      execution (cycle attack). Depositors have at least this much time to
    ///      observe fee changes and exit before new rates apply.
    uint256 public constant FEE_CHANGE_COOLDOWN = 7 days;

    /// @notice Hard cap on the combined maximum (management + performance) fee
    ///         extraction. Sum of mgmtBps+perfBps may not exceed this.
    /// @dev 5000 bps = 50%. Prevents setting MAX both which would allow 75% of
    ///      gross profit to be extracted as fees at max settings.
    uint256 public constant MAX_COMBINED_FEE_BPS = 5000;

    /// @notice Timestamp of the last fee-rate change
    uint256 public lastFeeRateChange;

    /// @notice Separate cooldown tracker for fee recipient rotations so
    ///         it does not interfere with the setFees rate-change cooldown.
    uint256 public lastFeeRecipientChange;

    // ============ Performance Tracking ============

    /// @notice PPS scaled by 1e18 at first deposit (set once)
    uint256 public initialPps;

    /// @notice Timestamp when initialPps was recorded
    uint256 public initialPpsTimestamp;

    /// @notice All-time peak PPS (scaled by 1e18)
    uint256 public peakPps;

    /// @notice Maximum drawdown from peak in basis points (e.g., 500 = 5%)
    uint256 public maxDrawdownBps;

    /// @notice Number of executions where PPS did not decrease
    uint256 public executionWins;

    /// @notice Total number of completed executions
    uint256 public totalExecutionCount;

    /// @notice PPS before the most recent execution (scaled by 1e18)
    uint256 public preExecutionPps;

    /// @notice Circular buffer of PPS checkpoints for time-windowed returns
    uint256 public constant MAX_PPS_CHECKPOINTS = 30;

    /// @notice PPS values in the circular buffer (scaled by 1e18)
    uint256[30] public ppsCheckpointValues;

    /// @notice Timestamps in the circular buffer
    uint256[30] public ppsCheckpointTimestamps;

    /// @notice Next write index in the circular buffer
    uint256 public ppsCheckpointIndex;

    // ============ Events ============

    /// @notice Emitted when the access control contract is updated
    event AccessControlUpdated(address indexed previousAccessControl, address indexed newAccessControl);

    /// @notice Emitted when tokens are deposited
    event Deposit(address indexed sender, uint256 amount, uint256 shares);

    /// @notice Emitted when tokens are withdrawn
    event Withdraw(address indexed sender, uint256 amount, uint256 shares);

    /// @notice Emitted when an execution is applied
    event ExecutionApplied(
        bytes32 indexed agentId,
        uint64 indexed executionNonce,
        bytes32 actionCommitment,
        uint256 actionCount
    );

    /// @notice Emitted when an action is executed
    event ActionExecuted(
        uint256 indexed actionIndex, uint32 actionType, bytes32 target, bool success
    );

    /// @notice Emitted when a no-op action is executed
    event NoOpActionExecuted(uint256 indexed actionIndex, uint32 actionType);

    /// @notice Emitted when a transfer action is executed (more detailed than ActionExecuted)
    /// @dev For transfers, `to` is the meaningful recipient (ActionExecuted.target is the token address)
    event TransferExecuted(
        uint256 indexed actionIndex, address indexed token, address indexed to, uint256 amount
    );

    /// @notice Emitted when nonces are skipped (gap in sequence)
    event NoncesSkipped(uint64 indexed fromNonce, uint64 indexed toNonce, uint64 skippedCount);

    /// @notice Emitted when a strategy is activated (CALL reduced tracked asset balance)
    event StrategyActivated(uint256 snapshotAssets, uint256 snapshotShares);

    /// @notice Emitted when a strategy is settled (assets returned to vault)
    event StrategySettled(uint256 settledAssets, uint256 currentAssets);

    /// @notice Emitted when oracle signer configuration is updated
    event OracleSignerUpdated(address indexed signer, uint64 maxAge);

    /// @notice Emitted when the bond signer (Role B) is updated
    event BondSignerUpdated(address indexed signer);

    /// @notice Emitted when requireOracle flag is updated
    event RequireOracleUpdated(bool required);

    /// @notice Emitted when management fee shares are collected
    event ManagementFeeCollected(uint256 shares, address recipient);

    /// @notice Emitted when performance fee shares are collected
    event PerformanceFeeCollected(uint256 shares, address recipient, uint256 pps);

    /// @notice Emitted when fee parameters are updated
    event FeesUpdated(uint256 managementFeeBps, uint256 performanceFeeBps);

    /// @notice Emitted when fee recipient is updated
    event FeeRecipientUpdated(address indexed recipient);

    /// @notice Emitted when protocol treasury is updated
    event ProtocolTreasuryUpdated(address indexed treasury, uint256 splitBps);

    // ============ Errors ============

    /// @notice Agent ID in journal doesn't match vault's agent ID
    error AgentIdMismatch(bytes32 expected, bytes32 actual);

    /// @notice Execution nonce is not valid (must be > lastNonce and <= lastNonce + MAX_NONCE_GAP)
    error InvalidNonce(uint64 lastNonce, uint64 providedNonce);

    /// @notice Nonce gap too large (exceeds MAX_NONCE_GAP)
    error NonceGapTooLarge(uint64 lastNonce, uint64 providedNonce, uint64 maxGap);

    /// @notice Action commitment doesn't match sha256(agentOutputBytes)
    error ActionCommitmentMismatch(bytes32 expected, bytes32 actual);

    /// @notice Deposit amount is zero
    error ZeroDeposit();

    /// @notice Withdraw amount exceeds balance
    error InsufficientShares(uint256 requested, uint256 available);

    /// @notice Withdraw amount is zero
    error ZeroWithdraw();

    /// @notice ERC20 transfer failed
    error TransferFailed();

    /// @notice External call failed
    error CallFailed(bytes32 target, bytes returnData);

    /// @notice Unknown action type
    error UnknownActionType(uint32 actionType);

    /// @notice Invalid transfer payload
    error InvalidTransferPayload();

    /// @notice Invalid call payload
    error InvalidCallPayload();

    /// @notice Zero shares provided
    error ZeroShares();

    /// @notice Zero assets provided
    error ZeroAssets();

    /// @notice Zero assets out calculated
    error ZeroAssetsOut();

    /// @notice ETH deposit amount doesn't match msg.value
    error ETHDepositMismatch(uint256 expected, uint256 actual);

    /// @notice ETH transfer failed
    error ETHTransferFailed();

    /// @notice Wrong deposit function called for this vault type
    error WrongDepositFunction();

    /// @notice Invalid trusted image ID (zero)
    error InvalidTrustedImageId();

    /// @notice Strategy is not active (cannot settle)
    error StrategyNotActive();

    /// @notice Caller is not the vault owner
    error NotOwner();

    /// @notice Insufficient available assets for withdrawal during active strategy
    error InsufficientAvailableAssets(uint256 requested, uint256 available);

    /// @notice Deposits are locked while a strategy is active (prevents yield dilution)
    error DepositsLockedDuringStrategy();

    /// @notice Cannot rescue tokens while shares are outstanding
    error SharesStillOutstanding();

    /// @notice CALL action targets the vault itself (blocked)
    error InvalidCallTarget(address target);

    /// @notice CALL action's `value` exceeds the per-call ETH cap
    error CallValueExceedsLimit(uint256 requested, uint256 maxAllowed);

    /// @notice CALL action caused the vault's ERC20 asset balance to
    ///         drop by more than MAX_CALL_ASSET_DELTA_BPS in a single action
    error CallAssetDeltaExceedsLimit(uint256 actualDelta, uint256 maxAllowed);

    /// @notice Emergency settlement called too early
    error EmergencySettleTooEarly(uint256 earliest, uint256 current);

    /// @notice Emergency withdrawal called too early
    error EmergencyWithdrawTooEarly(uint256 earliest, uint256 current);

    /// @notice Management fee exceeds maximum
    error ManagementFeeTooHigh(uint256 feeBps, uint256 maxBps);
    error CombinedFeeTooHigh(uint256 combinedBps, uint256 maxBps);
    error FeeChangeCooldown(uint256 nextAllowed, uint256 current);
    error OracleAgeRequired();

    /// @notice Performance fee exceeds maximum
    error PerformanceFeeTooHigh(uint256 feeBps, uint256 maxBps);

    /// @notice Protocol fee split exceeds maximum
    error ProtocolFeeSplitTooHigh(uint256 splitBps, uint256 maxBps);

    /// @notice Fee recipient is zero address
    error ZeroFeeRecipient();

    /// @notice No fees to collect
    error NoFeesToCollect();

    /// @notice Oracle signature is required but was not provided
    error OracleSignatureRequired();

    /// @notice Oracle age exceeds maximum allowed
    error OracleAgeTooHigh(uint64 provided, uint64 maximum);

    /// @notice Bond signer (Role B) is not set
    error BondSignerNotSet();

    /// @notice Bond signer (Role B) must differ from oracle signer (Role A)
    error BondSignerMustDiffer();

    // ============ Constructor ============

    /// @notice Initialize the vault
    /// @param _asset The ERC20 asset this vault holds
    /// @param _verifier The KernelExecutionVerifier contract address
    /// @param _agentId The agent ID this vault is bound to
    /// @param _trustedImageId The trusted RISC Zero image ID (pinned at deployment)
    /// @param _owner The vault owner (agent author) who can submit executions
    constructor(
        address _asset,
        address _verifier,
        bytes32 _agentId,
        bytes32 _trustedImageId,
        address _owner
    ) {
        if (_trustedImageId == bytes32(0)) revert InvalidTrustedImageId();
        require(_verifier != address(0), "zero verifier");
        require(_owner != address(0), "zero owner");
        asset = IERC20(_asset);
        verifier = IKernelExecutionVerifier(_verifier);
        agentId = _agentId;
        trustedImageId = _trustedImageId;
        owner = _owner;
    }

    // ============ Token Rescue ============

    /// @notice Rescue tokens stuck in the vault when no depositors have shares.
    /// @dev Prevents the ERC4626 virtual offset from permanently trapping tokens
    ///      that entered the vault outside the deposit flow (e.g., admin recovery
    ///      returning USDC after all shares were burned). Only callable when
    ///      totalShares == 0, meaning no depositor has any claim on the vault's assets.
    /// @param token The ERC20 token to rescue
    /// @param to The recipient address
    /// @param amount The amount to transfer
    function rescueTokens(address token, address to, uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        if (totalShares != 0) revert SharesStillOutstanding();
        IERC20(token).safeTransfer(to, amount);
    }

    // ============ Oracle Configuration ============

    /// @notice Configure the trusted oracle signer and maximum data age
    /// @param _signer Oracle signer address (address(0) disables oracle verification)
    /// @param _maxAge Maximum age of oracle data in seconds. Must be
    ///        non-zero when a signer is set, otherwise the freshness check is
    ///        silently disabled.
    /// @dev When `requireOracle` is true, the signer MUST remain non-zero,
    ///      otherwise the compound AND in _validateParsedJournal silently skips the
    ///      oracle check even though the mandatory-oracle flag is set.
    function setOracleSigner(address _signer, uint64 _maxAge) external {
        if (msg.sender != owner) revert NotOwner();
        if (_maxAge > MAX_ORACLE_AGE_LIMIT) revert OracleAgeTooHigh(_maxAge, MAX_ORACLE_AGE_LIMIT);
        if (_signer != address(0) && _maxAge == 0) revert OracleAgeRequired();
        // Reject rotating signer to zero while mandatory oracle is enabled
        if (requireOracle && _signer == address(0)) revert OracleSignatureRequired();
        // Enforce role separation — oracleSigner (Role A) must not
        // collide with bondSigner (Role B). We allow both to simultaneously
        // be the zero address (fully unset) but reject any non-zero overlap.
        if (_signer != address(0) && _signer == bondSigner) revert BondSignerMustDiffer();
        oracleSigner = _signer;
        maxOracleAge = _maxAge;
        emit OracleSignerUpdated(_signer, _maxAge);
    }

    /// @notice Configure the dedicated BOND attestation signer
    ///         (Role B, FULLY_TRUSTED). This key is used exclusively by
    ///         `OptimisticKernelVault._verifyOptimisticOracleAndBond` to
    ///         verify L1 bond attestations. It MUST be distinct from
    ///         `oracleSigner` to prevent a single-key compromise from
    ///         escalating from price manipulation to unbonded drain.
    /// @param _signer Bond signer address. Pass address(0) to clear.
    /// @dev Setting to zero is permitted (e.g., to decommission optimistic
    ///      mode) but will cause any subsequent `executeOptimistic` call to
    ///      revert with `BondSignerNotSet`.
    function setBondSigner(address _signer) external {
        if (msg.sender != owner) revert NotOwner();
        // Role separation: reject any non-zero value that equals oracleSigner
        if (_signer != address(0) && _signer == oracleSigner) {
            revert BondSignerMustDiffer();
        }
        bondSigner = _signer;
        emit BondSignerUpdated(_signer);
    }

    /// @notice Enable/disable mandatory oracle verification
    /// @param _required If true, all executions must include a valid oracle signature
    /// @dev Cannot enable mandatory oracle when signer is unset; otherwise
    ///      the `oracleSigner != address(0)` clause silently bypasses the check.
    function setRequireOracle(bool _required) external {
        if (msg.sender != owner) revert NotOwner();
        if (_required && oracleSigner == address(0)) revert OracleSignatureRequired();
        requireOracle = _required;
        emit RequireOracleUpdated(_required);
    }

    /// @notice Set the VaultAccessControl contract for automatic
    ///         deposit counter management. Pass address(0) to disable.
    function setAccessControl(address _accessControl) external {
        if (msg.sender != owner) revert NotOwner();
        address previous = accessControl;
        accessControl = _accessControl;
        emit AccessControlUpdated(previous, _accessControl);
    }

    // ============ Fee Configuration ============

    /// @notice Set management and performance fee rates (owner only)
    /// @param mgmtBps Annual management fee in basis points (max 500 = 5%)
    /// @param perfBps Performance fee on profits in basis points (max 5000 = 50%)
    function setFees(uint256 mgmtBps, uint256 perfBps) external {
        if (msg.sender != owner) revert NotOwner();
        if (mgmtBps > MAX_MANAGEMENT_FEE_BPS) revert ManagementFeeTooHigh(mgmtBps, MAX_MANAGEMENT_FEE_BPS);
        if (perfBps > MAX_PERFORMANCE_FEE_BPS) revert PerformanceFeeTooHigh(perfBps, MAX_PERFORMANCE_FEE_BPS);
        // Aggregate fee extraction cap
        if (mgmtBps + perfBps > MAX_COMBINED_FEE_BPS) {
            revert CombinedFeeTooHigh(mgmtBps + perfBps, MAX_COMBINED_FEE_BPS);
        }
        // Cooldown between rate changes
        if (lastFeeRateChange != 0
            && block.timestamp < lastFeeRateChange + FEE_CHANGE_COOLDOWN)
        {
            revert FeeChangeCooldown(
                lastFeeRateChange + FEE_CHANGE_COOLDOWN, block.timestamp
            );
        }

        // Collect any outstanding fees before changing rates
        if (managementFeeBps > 0 && totalShares > 0 && lastFeeTimestamp > 0) {
            _collectManagementFee();
        }
        if (performanceFeeBps > 0 && totalShares > 0 && highWaterMark > 0) {
            _collectPerformanceFee();
        }

        managementFeeBps = mgmtBps;
        performanceFeeBps = perfBps;
        lastFeeRateChange = block.timestamp;

        // Do NOT initialize lastFeeTimestamp here.
        //   - If fees are being enabled before any deposit, there is no AUM to charge
        //     against, so charging the first depositor for the pre-deposit dead period
        //     would be unfair. lastFeeTimestamp is now initialized at first deposit only.
        //   - If there is already AUM (totalShares > 0) and management fees were
        //     previously zero, stamp the clock now so accrual begins from this moment
        //     (prevents retroactive charge of any stale pre-existing lastFeeTimestamp).
        if (mgmtBps > 0 && totalShares > 0) {
            lastFeeTimestamp = block.timestamp;
        }

        // First-time HWM anchor gate.
        //   - Fires only when `highWaterMark == 0` (has never been set).
        //   - Subsequent setFees calls preserve the existing HWM.
        //   - The HWM can only advance upward via _collectPerformanceFee.
        if (perfBps > 0 && totalShares > 0 && highWaterMark == 0) {
            highWaterMark = currentPps();
        }

        emit FeesUpdated(mgmtBps, perfBps);
    }

    /// @notice Set the fee recipient address (owner only)
    /// @param recipient Address that receives the agent author's share of fees
    /// @dev Cooldown between recipient rotations + pre-collect
    ///      accrued fees so the OUTGOING recipient gets its share. Without
    ///      this, owner could rotate the recipient and immediately call
    ///      collectPerformanceFee in the same block to divert accumulated fees.
    ///      Uses a SEPARATE `lastFeeRecipientChange` tracker so the cooldown
    ///      does not interfere with the setFees rate-change cooldown.
    function setFeeRecipient(address recipient) external {
        if (msg.sender != owner) revert NotOwner();
        if (recipient == address(0)) revert ZeroFeeRecipient();

        // Pre-collect accrued fees so the existing recipient is settled first
        if (managementFeeBps > 0 && totalShares > 0 && lastFeeTimestamp > 0 && !strategyActive) {
            _collectManagementFee();
        }
        if (performanceFeeBps > 0 && totalShares > 0 && highWaterMark > 0 && !strategyActive) {
            _collectPerformanceFee();
        }

        // Cooldown between recipient changes (separate tracker).
        //   If feeRecipient was previously unset, allow the initial assignment
        //   to take effect immediately — the cooldown only applies to ROTATIONS.
        if (feeRecipient != address(0)
            && lastFeeRecipientChange != 0
            && block.timestamp < lastFeeRecipientChange + FEE_CHANGE_COOLDOWN)
        {
            revert FeeChangeCooldown(
                lastFeeRecipientChange + FEE_CHANGE_COOLDOWN, block.timestamp
            );
        }

        feeRecipient = recipient;
        lastFeeRecipientChange = block.timestamp;
        emit FeeRecipientUpdated(recipient);
    }

    /// @notice Set the protocol treasury and fee split (callable by factory owner or vault owner for initial setup)
    /// @param treasury Protocol treasury address
    /// @param splitBps Protocol's share of fees in basis points (max 5000 = 50%)
    function setProtocolTreasury(address treasury, uint256 splitBps) external {
        if (msg.sender != owner) revert NotOwner();
        if (splitBps > MAX_PROTOCOL_FEE_SPLIT_BPS) revert ProtocolFeeSplitTooHigh(splitBps, MAX_PROTOCOL_FEE_SPLIT_BPS);
        // Reject zero address when a non-zero split is configured; otherwise
        // fee shares would be minted to address(0) and permanently burned.
        if (splitBps > 0 && treasury == address(0)) revert ZeroFeeRecipient();

        // Pre-collect accrued fees before switching treasuries so the
        // outgoing treasury gets its share.
        if (managementFeeBps > 0 && totalShares > 0 && lastFeeTimestamp > 0 && !strategyActive) {
            _collectManagementFee();
        }
        if (performanceFeeBps > 0 && totalShares > 0 && highWaterMark > 0) {
            _collectPerformanceFee();
        }

        protocolTreasury = treasury;
        protocolFeeSplitBps = splitBps;
        emit ProtocolTreasuryUpdated(treasury, splitBps);
    }

    /// @notice Collect accrued management fee by minting shares to fee recipient
    /// @dev Management fee is time-based: feeShares = totalShares * mgmtFeeBps * elapsed / (365 days * 10000)
    function collectManagementFee() external nonReentrant returns (uint256 feeShares) {
        return _collectManagementFee();
    }

    /// @notice Collect accrued performance fee by minting shares based on PPS above high water mark
    /// @dev Performance fee is profit-based: only charged on PPS increase above highWaterMark
    function collectPerformanceFee() external nonReentrant returns (uint256 feeShares) {
        return _collectPerformanceFee();
    }

    // ============ Deposit/Withdraw ============

    /// @notice Deposit ERC20 tokens and receive shares based on current PPS
    /// @param assets Amount of ERC20 tokens to deposit
    /// @return sharesMinted Number of shares minted based on current exchange rate
    /// @dev Uses balance-before/after pattern to support fee-on-transfer tokens.
    ///      Share calculation uses virtual offset formula (ERC4626) for inflation protection.
    function depositERC20Tokens(uint256 assets)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 sharesMinted)
    {
        if (strategyActive) revert DepositsLockedDuringStrategy();
        if (address(asset) == address(0)) revert WrongDepositFunction();
        if (assets == 0) revert ZeroDeposit();

        // Enforce access control gates (whitelist, deposit cap, KYC)
        if (accessControl != address(0)) {
            require(
                IVaultAccessControl(accessControl).canDeposit(msg.sender, assets),
                "deposit blocked by access control"
            );
        }

        // Capture effectiveAssets BEFORE transfer for share calculation
        uint256 effectiveAssets = effectiveTotalAssets();

        // Measure actual received (supports fee-on-transfer tokens)
        uint256 balanceBefore = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), assets);
        uint256 actualReceived = asset.balanceOf(address(this)) - balanceBefore;

        // Calculate shares using actual received amount and virtual offset formula
        // shares = actualReceived * (totalShares + OFFSET) / (effectiveAssets + 1)
        sharesMinted = (actualReceived * (totalShares + _DECIMALS_OFFSET)) / (effectiveAssets + 1);
        if (sharesMinted == 0) revert ZeroShares();

        // Update state with actual received amount
        shares[msg.sender] += sharesMinted;
        totalShares += sharesMinted;
        totalDeposited += actualReceived;

        // Initialize performance tracking on first deposit
        if (initialPps == 0) {
            uint256 pps = currentPps();
            initialPps = pps;
            initialPpsTimestamp = block.timestamp;
            peakPps = pps;
        }

        // Re-anchor fee epoch when the prior cohort left the vault empty.
        // After a full-drain withdrawal the fee timestamp and HWM are
        // cleared, so the first post-empty deposit re-initialises them
        // at the current block — that way the new cohort is never
        // retroactively charged fees for the idle interval.
        if (managementFeeBps > 0 && lastFeeTimestamp == 0) {
            lastFeeTimestamp = block.timestamp;
        }
        if (performanceFeeBps > 0 && highWaterMark == 0) {
            highWaterMark = currentPps();
        }

        // Record deposit for cap tracking in access control
        if (accessControl != address(0)) {
            IVaultAccessControl(accessControl).recordDeposit(msg.sender, actualReceived);
        }

        emit Deposit(msg.sender, actualReceived, sharesMinted);
    }

    /// @notice Deposit ETH and receive shares based on current PPS
    /// @return sharesMinted Number of shares minted based on current exchange rate
    /// @dev MVP uses simple PPS math. First deposit is 1:1, subsequent deposits use
    ///      shares = msg.value * totalShares / totalAssets.
    ///      Only works when vault asset is address(0) (ETH vault).
    function depositETH()
        external
        payable
        nonReentrant
        whenNotPaused
        returns (uint256 sharesMinted)
    {
        if (strategyActive) revert DepositsLockedDuringStrategy();
        if (address(asset) != address(0)) revert WrongDepositFunction();
        if (msg.value == 0) revert ZeroDeposit();

        // Enforce access control gates (whitelist, deposit cap, KYC)
        if (accessControl != address(0)) {
            require(
                IVaultAccessControl(accessControl).canDeposit(msg.sender, msg.value),
                "deposit blocked by access control"
            );
        }

        // Calculate shares using virtual offset formula (ERC4626)
        // Use tracked balance (pre-deposit) for PPS calculation
        uint256 effectiveAssets = strategyActive ? snapshotTotalAssets : trackedETHBalance;

        // shares = assets * (totalShares + OFFSET) / (effectiveAssets + 1)
        sharesMinted = (msg.value * (totalShares + _DECIMALS_OFFSET)) / (effectiveAssets + 1);
        if (sharesMinted == 0) revert ZeroShares();

        // Update state
        shares[msg.sender] += sharesMinted;
        totalShares += sharesMinted;
        totalDeposited += msg.value;
        trackedETHBalance += msg.value;

        // Initialize performance tracking on first deposit
        if (initialPps == 0) {
            uint256 pps = currentPps();
            initialPps = pps;
            initialPpsTimestamp = block.timestamp;
            peakPps = pps;
        }

        // Re-anchor fee epoch when the prior cohort left the vault empty.
        // After a full-drain withdrawal the fee timestamp and HWM are
        // cleared, so the first post-empty deposit re-initialises them
        // at the current block — that way the new cohort is never
        // retroactively charged fees for the idle interval.
        if (managementFeeBps > 0 && lastFeeTimestamp == 0) {
            lastFeeTimestamp = block.timestamp;
        }
        if (performanceFeeBps > 0 && highWaterMark == 0) {
            highWaterMark = currentPps();
        }

        // Record deposit for cap tracking in access control
        if (accessControl != address(0)) {
            IVaultAccessControl(accessControl).recordDeposit(msg.sender, msg.value);
        }

        emit Deposit(msg.sender, msg.value, sharesMinted);
    }

    /// @notice Withdraw tokens (or ETH if asset is address(0)) by burning shares based on current PPS
    /// @param shareAmount Number of shares to burn
    /// @return assetsOut Amount of tokens returned based on current exchange rate
    function withdraw(uint256 shareAmount)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 assetsOut)
    {
        return _processWithdraw(shareAmount, msg.sender);
    }

    /// @notice Withdraw to an alternate recipient address (e.g., if msg.sender is blacklisted)
    /// @param shareAmount Number of shares to burn
    /// @param to Recipient address for the withdrawn assets
    /// @return assetsOut Amount of tokens returned based on current exchange rate
    function withdrawTo(uint256 shareAmount, address to)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 assetsOut)
    {
        require(to != address(0), "zero recipient");
        return _processWithdraw(shareAmount, to);
    }

    // ============ Execution ============

    /// @notice Execute agent actions from a verified proof (atomic - all actions must succeed)
    /// @param journal The raw journal bytes (209 bytes)
    /// @param seal The RISC Zero proof seal
    /// @param agentOutputBytes The agent output bytes containing actions
    function execute(bytes calldata journal, bytes calldata seal, bytes calldata agentOutputBytes)
        external
        nonReentrant
        whenNotPaused
    {
        _execute(journal, seal, agentOutputBytes, "", 0);
    }

    /// @notice Execute with oracle signature verification
    /// @param journal The raw journal bytes (209 bytes)
    /// @param seal The RISC Zero proof seal
    /// @param agentOutputBytes The agent output bytes containing actions
    /// @param oracleSignature 65-byte ECDSA signature over the feed hash (journal.inputRoot)
    /// @param oracleTimestamp Timestamp of the oracle data (included in signed message)
    function executeWithOracle(
        bytes calldata journal,
        bytes calldata seal,
        bytes calldata agentOutputBytes,
        bytes calldata oracleSignature,
        uint64 oracleTimestamp
    ) external nonReentrant whenNotPaused {
        _execute(journal, seal, agentOutputBytes, oracleSignature, oracleTimestamp);
    }

    /// @notice Validate parsed journal: agentId, oracle signature, nonce, action commitment
    /// @dev Shared by execute() and OptimisticKernelVault.executeOptimistic()
    function _validateParsedJournal(
        IKernelExecutionVerifier.ParsedJournal memory parsed,
        bytes calldata agentOutputBytes,
        bytes memory oracleSignature,
        uint64 oracleTimestamp
    ) internal returns (uint64 providedNonce) {
        if (parsed.agentId != agentId) {
            revert AgentIdMismatch(agentId, parsed.agentId);
        }

        // Enforce `requireOracle` BEFORE any bypass opportunity.
        // Previously the compound AND (`oracleSigner != address(0)`) silently
        // skipped the check when signer was rotated to zero even with the
        // mandatory flag set.
        if (requireOracle && oracleSignature.length == 0) {
            revert OracleSignatureRequired();
        }

        // Use the BOUND variant (inputRoot || actionCommitment) so
        // the same signature format satisfies BOTH this path and the optimistic
        // `_verifyOptimisticOracleAndBond` path. Previously these two sites
        // expected signatures over DIFFERENT payloads, creating a structural
        // trap where `requireOracle=true` could never produce a valid config.
        if (oracleSigner != address(0) && oracleSignature.length > 0) {
            OracleVerifier.requireValidOracleSignatureBound(
                parsed.inputRoot,
                parsed.actionCommitment,
                oracleSignature,
                oracleSigner,
                oracleTimestamp,
                block.chainid,
                address(this),
                maxOracleAge
            );
        }

        uint64 lastNonce = lastExecutionNonce;
        providedNonce = parsed.executionNonce;

        if (providedNonce <= lastNonce) {
            revert InvalidNonce(lastNonce, providedNonce);
        }

        uint64 gap = providedNonce - lastNonce;
        if (gap > MAX_NONCE_GAP) {
            revert NonceGapTooLarge(lastNonce, providedNonce, MAX_NONCE_GAP);
        }

        if (gap > 1) {
            emit NoncesSkipped(lastNonce + 1, providedNonce - 1, gap - 1);
        }

        bytes32 computedCommitment = sha256(agentOutputBytes);
        if (computedCommitment != parsed.actionCommitment) {
            revert ActionCommitmentMismatch(parsed.actionCommitment, computedCommitment);
        }
    }

    /// @notice Execute parsed and validated actions
    function _executeActions(
        bytes calldata agentOutputBytes,
        bytes32 parsedAgentId,
        uint64 providedNonce,
        bytes32 actionCommitment
    ) internal {
        lastExecutionNonce = providedNonce;

        // Capture the initial balance BEFORE any actions execute.
        // _executeCall uses this to cap each action's delta against the initial
        // balance, preventing compound drain: N actions each draining 40% of the
        // *current* balance would compound to 1-(0.6)^N. With this fix, the
        // cumulative drain across ALL actions is capped at 40% of the initial balance.
        _executionInitialBalance = totalAssets();

        // Snapshot PPS before execution for performance tracking
        uint256 ppsBefore = currentPps();
        preExecutionPps = ppsBefore;

        KernelOutputParser.Action[] memory actions =
            KernelOutputParser.parseActions(agentOutputBytes);

        for (uint256 i = 0; i < actions.length; i++) {
            _executeAction(i, actions[i]);
        }

        // Update performance metrics after execution
        _updatePerformanceMetrics(ppsBefore);

        // Collect any accrued fees after execution
        _collectFeesAfterExecution();

        emit ExecutionApplied(parsedAgentId, providedNonce, actionCommitment, actions.length);
    }

    /// @notice Update on-chain performance tracking after an execution
    function _updatePerformanceMetrics(uint256 ppsBefore) internal {
        uint256 ppsAfter = currentPps();
        totalExecutionCount++;

        // Win tracking: PPS did not decrease
        if (ppsAfter >= ppsBefore) {
            executionWins++;
        }

        // Peak PPS tracking
        if (ppsAfter > peakPps) {
            peakPps = ppsAfter;
        }

        // Max drawdown tracking (from peak)
        if (peakPps > 0 && ppsAfter < peakPps) {
            uint256 drawdownBps = ((peakPps - ppsAfter) * 10000) / peakPps;
            if (drawdownBps > maxDrawdownBps) {
                maxDrawdownBps = drawdownBps;
            }
        }

        // Write PPS checkpoint to circular buffer
        uint256 idx = ppsCheckpointIndex % MAX_PPS_CHECKPOINTS;
        ppsCheckpointValues[idx] = ppsAfter;
        ppsCheckpointTimestamps[idx] = block.timestamp;
        ppsCheckpointIndex++;
    }

    /// @notice Internal execution logic shared by execute() and executeWithOracle()
    function _execute(
        bytes calldata journal,
        bytes calldata seal,
        bytes calldata agentOutputBytes,
        bytes memory oracleSignature,
        uint64 oracleTimestamp
    ) internal {
        if (msg.sender != owner) revert NotOwner();

        IKernelExecutionVerifier.ParsedJournal memory parsed =
            verifier.verifyAndParseWithImageId(trustedImageId, journal, seal);

        uint64 providedNonce =
            _validateParsedJournal(parsed, agentOutputBytes, oracleSignature, oracleTimestamp);

        _executeActions(agentOutputBytes, parsed.agentId, providedNonce, parsed.actionCommitment);
    }

    // ============ Internal Withdraw ============

    /// @notice Internal withdrawal logic shared by withdraw() and withdrawTo()
    function _processWithdraw(uint256 shareAmount, address to)
        internal
        returns (uint256 assetsOut)
    {
        if (shareAmount == 0) revert ZeroWithdraw();
        if (shares[msg.sender] < shareAmount) {
            revert InsufficientShares(shareAmount, shares[msg.sender]);
        }

        // Calculate assets using virtual offset formula (ERC4626).
        // During an active strategy, price against `snapshotTotalShares`
        // instead of live `totalShares`. Live totalShares can be inflated by fee
        // share minting after the snapshot was taken, which would otherwise
        // dilute depositor PPS.
        uint256 effectiveAssets = effectiveTotalAssets();
        uint256 denomShares =
            strategyActive ? snapshotTotalShares : totalShares;
        assetsOut =
            (shareAmount * (effectiveAssets + 1)) / (denomShares + _DECIMALS_OFFSET);
        if (assetsOut == 0) revert ZeroAssetsOut();

        // Cap to actual available balance during active strategy.
        // Previously, this hard-reverted, locking depositors out of withdrawals
        // when most funds are deployed externally. Now uses a partial-withdrawal
        // fallback matching _processEmergencyWithdraw: scale share burn
        // proportionally and send what's available.
        uint256 available = totalAssets();
        if (assetsOut > available) {
            uint256 origAssets = assetsOut;
            shareAmount = (shareAmount * available) / origAssets;
            if (shareAmount == 0) revert ZeroAssetsOut();
            assetsOut = available;
        }

        // Burn shares
        shares[msg.sender] -= shareAmount;
        totalShares -= shareAmount;
        totalWithdrawn += assetsOut;

        // Decrement the deposit counter in VaultAccessControl so
        // users who withdraw can re-deposit up to their cap. Without this,
        // the deposited[user] counter monotonically increases and users who
        // reach their cap are permanently locked out after withdrawal.
        // Wrapped in try-catch so a reverting or malicious accessControl
        // contract cannot permanently trap depositor funds (H-04).
        if (accessControl != address(0)) {
            try IVaultAccessControl(accessControl).recordWithdrawal(msg.sender, assetsOut) {} catch {}
        }

        // If the vault has emptied completely, reset the fee epoch so the
        // next generation of depositors starts with a clean slate. See
        // `_resetFeeEpochIfEmpty` for the rationale.
        _resetFeeEpochIfEmpty();

        // Update snapshot to reflect withdrawal
        if (strategyActive) {
            snapshotTotalAssets -= assetsOut;
            snapshotTotalShares -= shareAmount;
        }

        // Transfer tokens or ETH
        bool isETH = address(asset) == address(0);
        if (isETH) {
            trackedETHBalance -= assetsOut;
            (bool success,) = to.call{ value: assetsOut }("");
            if (!success) revert ETHTransferFailed();
        } else {
            asset.safeTransfer(to, assetsOut);
        }

        emit Withdraw(msg.sender, assetsOut, shareAmount);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Fee-epoch reset when the vault empties
    // ─────────────────────────────────────────────────────────────────────
    // The performance-fee high-water mark (HWM) is anchored at first-enable
    // and thereafter only advances upward via `_collectPerformanceFee`. If
    // every depositor redeems their shares and the vault sits empty before
    // new depositors arrive, the HWM from the previous generation persists.
    // Consequences if the HWM were left alone:
    //   - A new depositor enters at a fresh PPS set by `depositERC20Tokens`.
    //     That PPS is typically much lower than the stale HWM.
    //   - Any NAV growth the new depositor experiences — even growth they
    //     were fully present for from block 0 — is charged as "profit"
    //     against the old HWM and partially minted to the fee recipient.
    //   - The new depositors effectively pay a performance fee on a
    //     recovery they did not live through.
    // The equivalent issue exists for management fees: `lastFeeTimestamp`
    // is not cleared on empty, so the first new deposit is charged
    // management fees for the entire empty period as if assets had been
    // under management the whole time.
    //
    // Both state variables are reset here when `totalShares` reaches 0.
    // After the reset, the first new deposit re-initialises them via the
    // existing first-deposit anchor logic in `depositERC20Tokens` /
    // `depositETH`, so the new epoch starts fresh.
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Reset the performance-fee high-water mark and management
    ///         fee timestamp when the vault empties, so the next cohort
    ///         of depositors starts a clean fee epoch.
    /// @dev Called after every share-burn path (normal withdraw, emergency
    ///      withdraw). A no-op when `totalShares` is still positive.
    function _resetFeeEpochIfEmpty() internal {
        if (totalShares == 0) {
            highWaterMark = 0;
            lastFeeTimestamp = 0;
        }
    }

    // ============ Internal ============

    /// @notice Execute a single action
    /// @param index Action index (for events)
    /// @param action The action to execute
    function _executeAction(uint256 index, KernelOutputParser.Action memory action) internal {
        lastExecutionTimestamp = block.timestamp;

        if (action.actionType == ACTION_TYPE_TRANSFER_ERC20) {
            _executeTransferERC20(index, action);
        } else if (action.actionType == ACTION_TYPE_CALL) {
            _executeCall(index, action);
        } else if (action.actionType == ACTION_TYPE_NO_OP) {
            emit NoOpActionExecuted(index, action.actionType);
        } else {
            revert UnknownActionType(action.actionType);
        }
    }

    /// @notice Execute a TRANSFER_ERC20 action (also handles ETH if token is address(0))
    /// @dev Payload format: abi.encode(address token, address to, uint256 amount)
    ///      MVP: only allows transfers of the vault's single asset.
    ///      Snapshots PPS on first balance-reducing transfer to prevent yield dilution.
    ///
    ///      Cumulative blast-radius cap: the total amount drained by ALL
    ///      TRANSFER_ERC20 actions in a single execute() call may not
    ///      exceed `MAX_CALL_VALUE_BPS` (40%) of the vault's initial
    ///      balance (captured at the start of _executeActions). This
    ///      mirrors the cumulative cap on CALL actions and prevents a
    ///      forged or malicious proof from compounding multiple 40%
    ///      transfers to drain the vault. Legitimate strategies that
    ///      need to move more than 40% must split across multiple proofs.
    function _executeTransferERC20(uint256 index, KernelOutputParser.Action memory action)
        internal
    {
        // Decode payload: (address token, address to, uint256 amount)
        if (action.payload.length != 96) {
            revert InvalidTransferPayload();
        }

        (address token, address to, uint256 amount) =
            abi.decode(action.payload, (address, address, uint256));

        // MVP: enforce single-asset - only allow transfers of the vault's asset
        if (token != address(asset)) {
            revert InvalidTransferPayload();
        }

        // Capture balance before transfer for strategy snapshot detection
        uint256 balanceBefore = totalAssets();

        // Cumulative drain cap using _executionInitialBalance.
        // Previous code used balanceBefore (recalculated per action), allowing
        // compound drain: 3 actions × 40% of *current* balance = 78.4% total.
        // Now we compute cumulative drain from the initial balance set once at
        // the start of _executeActions, matching _executeCall's approach.
        if (_executionInitialBalance > 0) {
            if (amount > balanceBefore) {
                revert CallValueExceedsLimit(amount, balanceBefore);
            }
            uint256 balanceAfterTransfer = balanceBefore - amount;
            uint256 cumulativeDrain = _executionInitialBalance > balanceAfterTransfer
                ? _executionInitialBalance - balanceAfterTransfer
                : 0;
            uint256 maxDelta = (_executionInitialBalance * MAX_CALL_VALUE_BPS) / BPS_DENOMINATOR;
            if (cumulativeDrain > maxDelta) {
                revert CallValueExceedsLimit(cumulativeDrain, maxDelta);
            }
        } else if (amount > 0) {
            // If the vault has zero balance, any non-zero transfer is a
            // definitional overshoot. The underlying safeTransfer would
            // revert anyway; this makes the error explicit.
            revert CallValueExceedsLimit(amount, 0);
        }

        // Execute transfer (ETH or ERC20)
        if (token == address(0)) {
            // ETH transfer — update tracking before external call
            trackedETHBalance -= amount;
            (bool success,) = to.call{ value: amount }("");
            if (!success) revert ETHTransferFailed();
        } else {
            // ERC20 transfer
            IERC20(token).safeTransfer(to, amount);
        }

        // Snapshot PPS if balance decreased and no strategy is active yet
        uint256 balanceAfter = totalAssets();
        if (!strategyActive && balanceAfter < balanceBefore) {
            snapshotTotalAssets = balanceBefore;
            snapshotTotalShares = totalShares;
            strategyActive = true;
            strategyActivatedAt = block.timestamp;
            emit StrategyActivated(balanceBefore, totalShares);
        }

        // Emit detailed transfer event (includes recipient `to` for better observability)
        emit TransferExecuted(index, token, to, amount);
    }

    /// @notice Execute a CALL action
    /// @dev Payload format: abi.encode(uint256 value, bytes callData)
    ///      Snapshots PPS on first balance-reducing call to prevent yield dilution.
    function _executeCall(uint256 index, KernelOutputParser.Action memory action) internal {
        // Decode payload: (uint256 value, bytes callData)
        if (action.payload.length < 64) {
            revert InvalidCallPayload();
        }

        // Validate target is a valid EVM address (upper 12 bytes must be zero)
        if (uint256(action.target) >> 160 != 0) {
            revert InvalidCallPayload();
        }

        (uint256 value, bytes memory callData) = abi.decode(action.payload, (uint256, bytes));

        // Convert target bytes32 to address (safe after validation above)
        address target = address(uint160(uint256(action.target)));

        // Block CALL to self (prevents agent from calling vault functions like pause/settle)
        if (target == address(this)) revert InvalidCallTarget(target);

        // Capture balance before call for (a) snapshot detection and (b) delta cap
        uint256 balanceBefore = totalAssets();

        // VALUE CAP — ETH vaults only.
        // An ETH vault refuses any CALL whose `value` exceeds 40% of the
        // current tracked balance. ERC20 vaults pass through because
        // `value > 0` is unusual for ERC20 strategies and no tracking
        // update is needed.
        if (value > 0 && address(asset) == address(0)) {
            uint256 maxValue = (trackedETHBalance * MAX_CALL_VALUE_BPS) / BPS_DENOMINATOR;
            if (value > maxValue) {
                revert CallValueExceedsLimit(value, maxValue);
            }
            // Update ETH tracking BEFORE the external call to prevent
            // donation-inflation races if the target re-enters via receive().
            trackedETHBalance -= value;
        }
        // Note: ERC20 vaults with value > 0 are a pre-existing edge case.
        // No tracking update is needed here since the outbound ETH is not
        // accounted for in trackedETHBalance (ERC20 vaults use asset.balanceOf).

        // Execute the external call.
        (bool success, bytes memory returnData) = target.call{ value: value }(callData);
        if (!success) {
            revert CallFailed(action.target, returnData);
        }

        // ASSET DELTA CAP — both vault types.
        // Cap is now computed against _executionInitialBalance (set once at the
        // start of _executeActions) instead of the per-action balanceBefore.
        // This prevents compound drain: with the old code, 3 actions each draining
        // 40% of current balance would remove 78.4%. With this fix, cumulative
        // drain across ALL actions is capped at 40% of the initial balance.
        uint256 balanceAfter = totalAssets();
        if (balanceAfter < balanceBefore) {
            uint256 cumulativeDrain = _executionInitialBalance > balanceAfter
                ? _executionInitialBalance - balanceAfter
                : 0;
            uint256 maxDelta = (_executionInitialBalance * MAX_CALL_ASSET_DELTA_BPS) / BPS_DENOMINATOR;
            if (cumulativeDrain > maxDelta) {
                revert CallAssetDeltaExceedsLimit(cumulativeDrain, maxDelta);
            }
        }

        // Snapshot PPS if balance decreased and no strategy is active yet
        if (!strategyActive && balanceAfter < balanceBefore) {
            snapshotTotalAssets = balanceBefore;
            snapshotTotalShares = totalShares;
            strategyActive = true;
            strategyActivatedAt = block.timestamp;
            emit StrategyActivated(balanceBefore, totalShares);
        }

        emit ActionExecuted(index, action.actionType, action.target, true);
    }

    // ============ Settlement ============

    /// @notice Owner-only settlement — clears strategy and restores live PPS accounting
    /// @dev Restricted to owner to prevent griefing: an attacker could settle mid-strategy
    ///      to bypass the deposit lock, then deposit at artificially low PPS.
    function settle() external {
        if (msg.sender != owner) revert NotOwner();
        if (!strategyActive) revert StrategyNotActive();
        _settle();
    }

    /// @notice Emergency settlement — callable by anyone after EMERGENCY_SETTLE_DELAY
    /// @dev Prevents funds from being locked indefinitely if the owner disappears
    function emergencySettle() external {
        if (!strategyActive) revert StrategyNotActive();
        uint256 earliest = strategyActivatedAt + EMERGENCY_SETTLE_DELAY;
        if (block.timestamp < earliest) {
            revert EmergencySettleTooEarly(earliest, block.timestamp);
        }
        _settle();
    }

    // ============ Pause ============

    /// @notice Pause the vault (owner only) — blocks deposits, withdrawals, and executions
    function pause() external {
        if (msg.sender != owner) revert NotOwner();
        _pause();
    }

    /// @notice Unpause the vault (owner only)
    function unpause() external {
        if (msg.sender != owner) revert NotOwner();
        _unpause();
    }

    /// @notice Override _pause to track pause timestamp
    /// @dev Only STAMPS the pause timestamp on the very first
    ///      pause (when `pausedAt == 0`). Once set, the timestamp is
    ///      permanent: subsequent pauses do NOT re-stamp. Combined with
    ///      the `_unpause` override (no clear), the 14-day emergency
    ///      countdown is anchored once and cannot be reset by cycling.
    function _pause() internal override {
        super._pause();
        if (pausedAt == 0) {
            pausedAt = block.timestamp;
        }
    }

    /// @notice Override _unpause — does NOT clear `pausedAt`.
    /// @dev Previously this cleared `pausedAt = 0`, which — combined with
    ///      the _pause guard that stamps only when pausedAt == 0 — allowed
    ///      a pause/unpause/pause cycle to push the emergency withdrawal
    ///      deadline forward indefinitely. The fix is to leave `pausedAt`
    ///      alone on unpause, making the first-pause timestamp permanent.
    ///      `_processEmergencyWithdraw` still requires `paused() == true`,
    ///      so emergency withdrawals are only possible during actual
    ///      pauses — the non-zero `pausedAt` is just the countdown anchor.
    function _unpause() internal override {
        super._unpause();
        // Deliberately do NOT clear `pausedAt`.
        // The countdown must stay anchored to the first pause.
    }

    /// @notice Emergency withdraw bypassing pause after EMERGENCY_WITHDRAW_DELAY
    /// @dev Allows depositors to exit if the vault is paused and the owner disappears
    /// @param shareAmount Number of shares to burn
    /// @return assetsOut Amount of tokens returned
    function emergencyWithdraw(uint256 shareAmount)
        external
        nonReentrant
        returns (uint256 assetsOut)
    {
        return _processEmergencyWithdraw(shareAmount, msg.sender);
    }

    /// @notice Emergency withdraw to an alternate recipient (e.g., if msg.sender is blacklisted)
    /// @param shareAmount Number of shares to burn
    /// @param to Recipient address for the withdrawn assets
    /// @return assetsOut Amount of tokens returned
    function emergencyWithdrawTo(uint256 shareAmount, address to)
        external
        nonReentrant
        returns (uint256 assetsOut)
    {
        require(to != address(0), "zero recipient");
        return _processEmergencyWithdraw(shareAmount, to);
    }

    /// @notice Internal emergency withdrawal logic
    function _processEmergencyWithdraw(uint256 shareAmount, address to)
        internal
        returns (uint256 assetsOut)
    {
        require(paused(), "not paused");
        uint256 earliest = pausedAt + EMERGENCY_WITHDRAW_DELAY;
        if (block.timestamp < earliest) revert EmergencyWithdrawTooEarly(earliest, block.timestamp);

        if (shareAmount == 0) revert ZeroWithdraw();
        if (shares[msg.sender] < shareAmount) {
            revert InsufficientShares(shareAmount, shares[msg.sender]);
        }

        // During an active strategy, price against `snapshotTotalShares`
        // so that phantom fee mints (perf fee minted while snapshot is frozen) do not
        // dilute the emergency-exit pro-rata share. Mirrors the _processWithdraw fix.
        uint256 effectiveAssets = effectiveTotalAssets();
        uint256 denomShares =
            strategyActive ? snapshotTotalShares : totalShares;
        assetsOut =
            (shareAmount * (effectiveAssets + 1)) / (denomShares + _DECIMALS_OFFSET);
        if (assetsOut == 0) revert ZeroAssetsOut();

        // During an active strategy the live balance may be smaller than
        // the fair share (assets deployed externally). Rather than reverting and
        // permanently locking depositors, we perform a PARTIAL emergency withdraw:
        // pay out what is liquidly available and burn shares proportionally so the
        // remaining claim on the snapshot is preserved.
        uint256 available = totalAssets();
        if (assetsOut > available) {
            uint256 origAssets = assetsOut;
            // Scale the share burn: user gets `available` assets and burns a
            // proportional slice of their requested shares. The unburned shares
            // retain their claim on the rest of the snapshot.
            shareAmount = (shareAmount * available) / origAssets;
            if (shareAmount == 0) revert ZeroAssetsOut();
            assetsOut = available;
        }

        // Burn shares
        shares[msg.sender] -= shareAmount;
        totalShares -= shareAmount;
        totalWithdrawn += assetsOut;

        // Reset the fee epoch if the vault has emptied. Ensures a fresh
        // HWM anchor and management-fee clock for any future depositors
        // who enter after an emergency-withdraw drain.
        _resetFeeEpochIfEmpty();

        // If the vault has fully emptied via emergency withdrawals, also
        // clear `strategyActive` and the associated snapshot. Otherwise
        // the flag would remain stuck `true`, locking out any future
        // deposits with `DepositsLockedDuringStrategy` until an admin
        // settlement runs — even though there is nothing left to settle.
        if (totalShares == 0 && strategyActive) {
            strategyActive = false;
            snapshotTotalAssets = 0;
            snapshotTotalShares = 0;
            strategyActivatedAt = 0;
        } else if (strategyActive) {
            // Update snapshot to reflect withdrawal. Clamp to avoid
            // underflow when partial-burn dust overshoots.
            if (assetsOut > snapshotTotalAssets) {
                snapshotTotalAssets = 0;
            } else {
                snapshotTotalAssets -= assetsOut;
            }
            if (shareAmount > snapshotTotalShares) {
                snapshotTotalShares = 0;
            } else {
                snapshotTotalShares -= shareAmount;
            }
        }

        // Transfer tokens or ETH
        bool isETH = address(asset) == address(0);
        if (isETH) {
            trackedETHBalance -= assetsOut;
            (bool success,) = to.call{ value: assetsOut }("");
            if (!success) revert ETHTransferFailed();
        } else {
            asset.safeTransfer(to, assetsOut);
        }

        emit Withdraw(msg.sender, assetsOut, shareAmount);
    }

    /// @notice Internal settlement logic (used by settle() and auto-settlement in _executeCall)
    /// @dev Declared virtual so OptimisticKernelVault can override to
    ///      block settle while optimistic executions are pending.
    function _settle() internal virtual {
        uint256 settledAssets = snapshotTotalAssets;
        uint256 currentAssets = totalAssets();

        strategyActive = false;
        snapshotTotalAssets = 0;
        snapshotTotalShares = 0;
        strategyActivatedAt = 0;

        // Advance lastFeeTimestamp to prevent retroactive lump-sum
        // fee accumulation. Without this, _collectManagementFee() returns 0
        // during strategy (correct) but does NOT advance the timestamp. On
        // settlement, the next fee collection computes timeElapsed spanning
        // the entire strategy duration, charging the full fee as a single
        // lump-sum. With this fix, the strategy period is skipped for fee
        // purposes — consistent with the intent of the strategyActive guard.
        if (lastFeeTimestamp > 0) {
            lastFeeTimestamp = block.timestamp;
        }

        emit StrategySettled(settledAssets, currentAssets);
    }

    // ============ View Functions ============

    /// @notice Returns effective total assets for PPS calculations
    /// @dev During active strategy, returns snapshot value to prevent yield dilution.
    ///      Otherwise returns live totalAssets().
    function effectiveTotalAssets() public view returns (uint256) {
        return strategyActive ? snapshotTotalAssets : totalAssets();
    }

    /// @notice Returns total assets held by the vault
    /// @return Total balance of the vault's asset (tracked ETH balance if asset is address(0))
    /// @dev For ETH vaults, uses internally tracked balance to prevent selfdestruct donation attacks
    function totalAssets() public view returns (uint256) {
        if (address(asset) == address(0)) {
            return trackedETHBalance;
        }
        return asset.balanceOf(address(this));
    }

    /// @notice Returns total value locked (cumulative deposits minus cumulative withdrawals)
    /// @dev Independent of vault balance — tracks depositor capital flows only.
    function totalValueLocked() public view returns (uint256) {
        if (totalWithdrawn > totalDeposited) return 0;
        return totalDeposited - totalWithdrawn;
    }

    /// @notice Returns current PPS scaled by 1e18
    /// @dev During active strategy, divide by `snapshotTotalShares`
    ///      (not live `totalShares`) so view/HWM tracking is not distorted
    ///      by fee share mints.
    /// @dev The virtual-offset formula was initially added
    ///      here but that broke the PPS*totalShares ≈ effectiveAssets invariant
    ///      for small vaults. The virtual offset divergence is documented in
    ///      code comments and users should always use `convertToAssets` for
    ///      precise entitlement calculations.
    function currentPps() public view returns (uint256) {
        uint256 ts = strategyActive ? snapshotTotalShares : totalShares;
        if (ts == 0) return 1e18;
        return (effectiveTotalAssets() * 1e18) / ts;
    }

    /// @notice Returns performance metrics in a single call
    function getPerformanceMetrics()
        external
        view
        returns (
            uint256 _initialPps,
            uint256 _initialPpsTimestamp,
            uint256 _currentPps,
            uint256 _peakPps,
            uint256 _maxDrawdownBps,
            uint256 _executionWins,
            uint256 _totalExecutionCount,
            uint256 _checkpointIndex
        )
    {
        return (
            initialPps,
            initialPpsTimestamp,
            currentPps(),
            peakPps,
            maxDrawdownBps,
            executionWins,
            totalExecutionCount,
            ppsCheckpointIndex
        );
    }

    /// @notice Returns a batch of PPS checkpoints for time-windowed return computation
    function getPpsCheckpoints()
        external
        view
        returns (uint256[30] memory values, uint256[30] memory timestamps, uint256 index)
    {
        return (ppsCheckpointValues, ppsCheckpointTimestamps, ppsCheckpointIndex);
    }

    /// @notice Returns fee configuration in a single call
    function getFeeInfo()
        external
        view
        returns (
            uint256 _managementFeeBps,
            uint256 _performanceFeeBps,
            address _feeRecipient,
            address _protocolTreasury,
            uint256 _protocolFeeSplitBps,
            uint256 _lastFeeTimestamp,
            uint256 _highWaterMark
        )
    {
        return (
            managementFeeBps,
            performanceFeeBps,
            feeRecipient,
            protocolTreasury,
            protocolFeeSplitBps,
            lastFeeTimestamp,
            highWaterMark
        );
    }

    /// @notice Convert assets to shares using current exchange rate (virtual offset)
    /// @param assets Amount of assets to convert
    /// @return Amount of shares that would be minted
    /// @dev Use `snapshotTotalShares` during active strategy to match the
    ///      denominator used by _processWithdraw/_processEmergencyWithdraw.
    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 denomShares = strategyActive ? snapshotTotalShares : totalShares;
        return (assets * (denomShares + _DECIMALS_OFFSET)) / (effectiveTotalAssets() + 1);
    }

    /// @notice Convert shares to assets using current exchange rate (virtual offset)
    /// @param _shares Amount of shares to convert
    /// @return Amount of assets that would be returned
    /// @dev Use `snapshotTotalShares` during active strategy to match the
    ///      denominator used by _processWithdraw/_processEmergencyWithdraw.
    function convertToAssets(uint256 _shares) public view returns (uint256) {
        uint256 denomShares = strategyActive ? snapshotTotalShares : totalShares;
        return (_shares * (effectiveTotalAssets() + 1)) / (denomShares + _DECIMALS_OFFSET);
    }

    // ============ Internal Fee Functions ============

    /// @notice Internal management fee collection
    /// @dev feeShares = totalShares * mgmtFeeBps * timeElapsed / (365 days * 10000)
    function _collectManagementFee() internal returns (uint256 feeShares) {
        if (managementFeeBps == 0 || totalShares == 0 || lastFeeTimestamp == 0) return 0;

        // Do NOT accrue management fees while a strategy is active.
        // The snapshot is frozen at pre-strategy assets, which the fee formula
        // would charge against regardless of the strategy's true P&L (potentially
        // taxing depositors on capital they cannot access because emergency
        // withdraw is restricted during the active period).
        if (strategyActive) return 0;

        uint256 timeElapsed = block.timestamp - lastFeeTimestamp;
        if (timeElapsed == 0) return 0;

        // feeShares = totalShares * mgmtFeeBps * timeElapsed / (365 days * 10000)
        feeShares = (totalShares * managementFeeBps * timeElapsed) / (365 days * 10000);

        // Advance lastFeeTimestamp UNCONDITIONALLY regardless of whether
        // the computed fee rounded to zero. Otherwise zero-round periods accumulate
        // and are batched as a single lump charge when TVL eventually grows — hitting
        // late depositors with retroactive fees for a time window when no AUM existed.
        lastFeeTimestamp = block.timestamp;

        if (feeShares == 0) return 0;

        _distributeFeeShares(feeShares);

        emit ManagementFeeCollected(feeShares, feeRecipient);
    }

    /// @notice Internal performance fee collection
    /// @dev Only collects if current PPS > highWaterMark
    ///      feeShares = totalShares * profitBps * perfFeeBps / (10000 * 10000)
    /// @dev Do NOT mint performance fee shares while a strategy
    ///      is active. During strategy:
    ///        - snapshotTotalShares is frozen at strategy activation
    ///        - totalShares is LIVE
    ///      If we mint here, totalShares inflates above snapshotTotalShares
    ///      ("phantom fees"). The emergency withdraw path then prices users
    ///      against the diluted denominator. Deferring collection to strategy
    ///      settlement aligns both counters and eliminates the dilution vector.
    function _collectPerformanceFee() internal returns (uint256 feeShares) {
        if (performanceFeeBps == 0 || totalShares == 0) return 0;
        if (strategyActive) return 0;

        uint256 pps = currentPps();

        if (highWaterMark == 0) {
            // Initialize HWM on first collection
            highWaterMark = pps;
            return 0;
        }

        if (pps <= highWaterMark) return 0;

        // profitBps = (pps - hwm) * 10000 / hwm
        uint256 profitBps = ((pps - highWaterMark) * 10000) / highWaterMark;

        // feeShares = totalShares * profitBps * perfFeeBps / (10000 * 10000)
        feeShares = (totalShares * profitBps * performanceFeeBps) / (10000 * 10000);

        if (feeShares == 0) return 0;

        // Update high water mark BEFORE minting (which dilutes PPS)
        highWaterMark = pps;

        _distributeFeeShares(feeShares);

        emit PerformanceFeeCollected(feeShares, feeRecipient, pps);
    }

    /// @notice Distribute fee shares between fee recipient and protocol treasury
    /// @param feeShares Total fee shares to distribute
    function _distributeFeeShares(uint256 feeShares) internal {
        if (feeShares == 0) return;

        uint256 protocolShares = 0;
        uint256 recipientShares = feeShares;

        // Split between protocol treasury and fee recipient
        if (protocolTreasury != address(0) && protocolFeeSplitBps > 0) {
            protocolShares = (feeShares * protocolFeeSplitBps) / 10000;
            recipientShares = feeShares - protocolShares;
        }

        // Mint shares to fee recipient (defaults to owner if not set)
        address recipient = feeRecipient != address(0) ? feeRecipient : owner;
        if (recipientShares > 0) {
            shares[recipient] += recipientShares;
            totalShares += recipientShares;
        }

        // Mint shares to protocol treasury
        if (protocolShares > 0 && protocolTreasury != address(0)) {
            shares[protocolTreasury] += protocolShares;
            totalShares += protocolShares;
        }
    }

    /// @notice Collect fees after execution if any are due
    /// @dev Called internally after _updatePerformanceMetrics in execution flow
    function _collectFeesAfterExecution() internal {
        if (managementFeeBps > 0 && lastFeeTimestamp > 0) {
            _collectManagementFee();
        }
        if (performanceFeeBps > 0) {
            _collectPerformanceFee();
        }
    }

    /// @notice Allow receiving ETH for CALL actions with value (ETH vaults only)
    /// @dev Reverts for ERC20 vaults to prevent stuck ETH
    receive() external payable {
        if (address(asset) != address(0)) revert WrongDepositFunction();
        trackedETHBalance += msg.value;
    }
}
