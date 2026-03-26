// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IKernelExecutionVerifier } from "./interfaces/IKernelExecutionVerifier.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { KernelOutputParser } from "./KernelOutputParser.sol";
import { OracleVerifier } from "./libraries/OracleVerifier.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

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
    uint256 internal constant _DECIMALS_OFFSET = 1e3;

    /// @notice Maximum allowed gap between nonces for liveness (prevents stuck execution)
    /// @dev Allows operators to skip intermediate executions if needed (e.g., if nonce N is lost/stuck,
    ///      executions N+1 through N+MAX_NONCE_GAP can still proceed). This weakens strict ordering
    ///      but improves liveness. Document: skipped nonces are permanently lost.
    uint64 public constant MAX_NONCE_GAP = 100;

    /// @notice Delay after which anyone can emergency-settle a stuck strategy
    uint256 public constant EMERGENCY_SETTLE_DELAY = 7 days;

    /// @notice Delay after which depositors can emergency-withdraw while paused
    uint256 public constant EMERGENCY_WITHDRAW_DELAY = 14 days;

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

    /// @notice Trusted oracle signer address (address(0) = oracle verification disabled)
    address public oracleSigner;

    /// @notice Maximum age of oracle data in seconds (0 = no age check)
    uint64 public maxOracleAge;

    /// @notice Timestamp when the vault was paused (for emergency withdraw delay)
    uint256 public pausedAt;

    /// @notice Tracked ETH balance for ETH vaults (prevents donation/selfdestruct inflation attacks)
    /// @dev Only meaningful when asset == address(0). Updated in depositETH, withdraw, execute, receive.
    uint256 public trackedETHBalance;

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

    /// @notice Maximum management fee: 500 bps = 5% annual
    uint256 public constant MAX_MANAGEMENT_FEE_BPS = 500;

    /// @notice Maximum performance fee: 5000 bps = 50% of profits
    uint256 public constant MAX_PERFORMANCE_FEE_BPS = 5000;

    /// @notice Maximum protocol fee split: 5000 bps = 50% of fees
    uint256 public constant MAX_PROTOCOL_FEE_SPLIT_BPS = 5000;

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

    /// @notice Emergency settlement called too early
    error EmergencySettleTooEarly(uint256 earliest, uint256 current);

    /// @notice Emergency withdrawal called too early
    error EmergencyWithdrawTooEarly(uint256 earliest, uint256 current);

    /// @notice Management fee exceeds maximum
    error ManagementFeeTooHigh(uint256 feeBps, uint256 maxBps);

    /// @notice Performance fee exceeds maximum
    error PerformanceFeeTooHigh(uint256 feeBps, uint256 maxBps);

    /// @notice Protocol fee split exceeds maximum
    error ProtocolFeeSplitTooHigh(uint256 splitBps, uint256 maxBps);

    /// @notice Fee recipient is zero address
    error ZeroFeeRecipient();

    /// @notice No fees to collect
    error NoFeesToCollect();

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
    /// @param _maxAge Maximum age of oracle data in seconds (0 = no age check)
    function setOracleSigner(address _signer, uint64 _maxAge) external {
        if (msg.sender != owner) revert NotOwner();
        oracleSigner = _signer;
        maxOracleAge = _maxAge;
        emit OracleSignerUpdated(_signer, _maxAge);
    }

    // ============ Fee Configuration ============

    /// @notice Set management and performance fee rates (owner only)
    /// @param mgmtBps Annual management fee in basis points (max 500 = 5%)
    /// @param perfBps Performance fee on profits in basis points (max 5000 = 50%)
    function setFees(uint256 mgmtBps, uint256 perfBps) external {
        if (msg.sender != owner) revert NotOwner();
        if (mgmtBps > MAX_MANAGEMENT_FEE_BPS) revert ManagementFeeTooHigh(mgmtBps, MAX_MANAGEMENT_FEE_BPS);
        if (perfBps > MAX_PERFORMANCE_FEE_BPS) revert PerformanceFeeTooHigh(perfBps, MAX_PERFORMANCE_FEE_BPS);

        // Collect any outstanding fees before changing rates
        if (managementFeeBps > 0 && totalShares > 0 && lastFeeTimestamp > 0) {
            _collectManagementFee();
        }
        if (performanceFeeBps > 0 && totalShares > 0 && highWaterMark > 0) {
            _collectPerformanceFee();
        }

        managementFeeBps = mgmtBps;
        performanceFeeBps = perfBps;

        // Initialize fee timestamp if setting fees for the first time
        if (lastFeeTimestamp == 0 && mgmtBps > 0) {
            lastFeeTimestamp = block.timestamp;
        }

        // Initialize high water mark if setting performance fee for the first time
        if (highWaterMark == 0 && perfBps > 0 && totalShares > 0) {
            highWaterMark = currentPps();
        }

        emit FeesUpdated(mgmtBps, perfBps);
    }

    /// @notice Set the fee recipient address (owner only)
    /// @param recipient Address that receives the agent author's share of fees
    function setFeeRecipient(address recipient) external {
        if (msg.sender != owner) revert NotOwner();
        if (recipient == address(0)) revert ZeroFeeRecipient();
        feeRecipient = recipient;
        emit FeeRecipientUpdated(recipient);
    }

    /// @notice Set the protocol treasury and fee split (callable by factory owner or vault owner for initial setup)
    /// @param treasury Protocol treasury address
    /// @param splitBps Protocol's share of fees in basis points (max 5000 = 50%)
    function setProtocolTreasury(address treasury, uint256 splitBps) external {
        if (msg.sender != owner) revert NotOwner();
        if (splitBps > MAX_PROTOCOL_FEE_SPLIT_BPS) revert ProtocolFeeSplitTooHigh(splitBps, MAX_PROTOCOL_FEE_SPLIT_BPS);
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
            // Initialize fee tracking
            if (managementFeeBps > 0 && lastFeeTimestamp == 0) {
                lastFeeTimestamp = block.timestamp;
            }
            if (performanceFeeBps > 0 && highWaterMark == 0) {
                highWaterMark = pps;
            }
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
            // Initialize fee tracking
            if (managementFeeBps > 0 && lastFeeTimestamp == 0) {
                lastFeeTimestamp = block.timestamp;
            }
            if (performanceFeeBps > 0 && highWaterMark == 0) {
                highWaterMark = pps;
            }
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

        if (oracleSigner != address(0) && oracleSignature.length > 0) {
            OracleVerifier.requireValidOracleSignature(
                parsed.inputRoot,
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

        // Calculate assets using virtual offset formula (ERC4626)
        // assets = shares * (effectiveAssets + 1) / (totalShares + OFFSET)
        uint256 effectiveAssets = effectiveTotalAssets();
        assetsOut = (shareAmount * (effectiveAssets + 1)) / (totalShares + _DECIMALS_OFFSET);
        if (assetsOut == 0) revert ZeroAssetsOut();

        // Cap to actual available balance during active strategy
        uint256 available = totalAssets();
        if (assetsOut > available) {
            revert InsufficientAvailableAssets(assetsOut, available);
        }

        // Burn shares
        shares[msg.sender] -= shareAmount;
        totalShares -= shareAmount;
        totalWithdrawn += assetsOut;

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

        // Capture balance before call for snapshot detection
        uint256 balanceBefore = totalAssets();

        // Update ETH tracking before external call (prevents donation inflation)
        if (value > 0 && address(asset) == address(0)) {
            trackedETHBalance -= value;
        }

        // Execute call
        (bool success, bytes memory returnData) = target.call{ value: value }(callData);
        if (!success) {
            revert CallFailed(action.target, returnData);
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
    function _pause() internal override {
        super._pause();
        pausedAt = block.timestamp;
    }

    /// @notice Override _unpause to clear pause timestamp
    function _unpause() internal override {
        super._unpause();
        pausedAt = 0;
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

        // Calculate assets using virtual offset formula (ERC4626)
        uint256 effectiveAssets = effectiveTotalAssets();
        assetsOut = (shareAmount * (effectiveAssets + 1)) / (totalShares + _DECIMALS_OFFSET);
        if (assetsOut == 0) revert ZeroAssetsOut();

        // Cap to actual available balance during active strategy
        uint256 available = totalAssets();
        if (assetsOut > available) {
            revert InsufficientAvailableAssets(assetsOut, available);
        }

        // Burn shares
        shares[msg.sender] -= shareAmount;
        totalShares -= shareAmount;
        totalWithdrawn += assetsOut;

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

    /// @notice Internal settlement logic (used by settle() and auto-settlement in _executeCall)
    function _settle() internal {
        uint256 settledAssets = snapshotTotalAssets;
        uint256 currentAssets = totalAssets();

        strategyActive = false;
        snapshotTotalAssets = 0;
        snapshotTotalShares = 0;
        strategyActivatedAt = 0;

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
    function currentPps() public view returns (uint256) {
        uint256 ts = totalShares;
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
    function convertToShares(uint256 assets) public view returns (uint256) {
        return (assets * (totalShares + _DECIMALS_OFFSET)) / (effectiveTotalAssets() + 1);
    }

    /// @notice Convert shares to assets using current exchange rate (virtual offset)
    /// @param _shares Amount of shares to convert
    /// @return Amount of assets that would be returned
    function convertToAssets(uint256 _shares) public view returns (uint256) {
        return (_shares * (effectiveTotalAssets() + 1)) / (totalShares + _DECIMALS_OFFSET);
    }

    // ============ Internal Fee Functions ============

    /// @notice Internal management fee collection
    /// @dev feeShares = totalShares * mgmtFeeBps * timeElapsed / (365 days * 10000)
    function _collectManagementFee() internal returns (uint256 feeShares) {
        if (managementFeeBps == 0 || totalShares == 0 || lastFeeTimestamp == 0) return 0;

        uint256 timeElapsed = block.timestamp - lastFeeTimestamp;
        if (timeElapsed == 0) return 0;

        // feeShares = totalShares * mgmtFeeBps * timeElapsed / (365 days * 10000)
        feeShares = (totalShares * managementFeeBps * timeElapsed) / (365 days * 10000);

        if (feeShares == 0) return 0;

        lastFeeTimestamp = block.timestamp;

        _distributeFeeShares(feeShares);

        emit ManagementFeeCollected(feeShares, feeRecipient);
    }

    /// @notice Internal performance fee collection
    /// @dev Only collects if current PPS > highWaterMark
    ///      feeShares = totalShares * profitBps * perfFeeBps / (10000 * 10000)
    function _collectPerformanceFee() internal returns (uint256 feeShares) {
        if (performanceFeeBps == 0 || totalShares == 0) return 0;

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

    /// @notice Allow receiving ETH for CALL actions with value
    /// @dev Updates tracked ETH balance for ETH vaults to prevent donation inflation
    receive() external payable {
        if (address(asset) == address(0)) {
            trackedETHBalance += msg.value;
        }
    }
}
