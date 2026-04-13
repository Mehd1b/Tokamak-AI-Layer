// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IBondManager } from "./interfaces/IBondManager.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title WSTONBondManager
/// @notice Manages WSTON (Wrapped Staked TON) bonds for optimistic execution operators
/// @dev Chain-agnostic ERC20 bond manager. Operators stake WSTON as collateral for optimistic
///      executions. Bonds are slashed if proofs are not submitted within the challenge window.
///      Slash distribution: 10% finder, 80% vault (depositors), 10% treasury.
///      Safety: bonds that remain locked beyond BOND_EXPIRY can be reclaimed by operators.
contract WSTONBondManager is IBondManager, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Enums ============

    /// @notice Bond lifecycle status
    enum BondStatus {
        Empty,
        Locked,
        Released,
        Slashed
    }

    // ============ Structs ============

    /// @notice Information about a single bond
    struct BondInfo {
        uint256 amount;
        uint256 lockedAt;
        BondStatus status;
    }

    // ============ Constants ============

    /// @notice Finder fee: 10% of slashed bond goes to the address that triggered the slash
    uint256 public constant FINDER_FEE_BPS = 1000;

    /// @notice Depositor share: 80% of slashed bond goes to the vault (for depositors)
    uint256 public constant DEPOSITOR_SHARE_BPS = 8000;

    /// @notice Treasury share: 10% of slashed bond goes to the protocol treasury
    uint256 public constant TREASURY_SHARE_BPS = 1000;

    /// @notice Basis points denominator
    uint256 public constant BPS_DENOMINATOR = 10000;

    /// @notice Bond expiry: operators can reclaim bonds after this duration if not released/slashed
    /// @dev Safety valve against stuck bonds (revoked vaults, lost relayer keys, etc.).
    ///      Extended from 30 to 90 days to give relayers a larger window to
    ///      resolve pending slashes before the expiry valve opens.
    uint256 public constant BOND_EXPIRY = 90 days;

    /// @notice Maximum number of bonds that can be locked in a single batch
    uint256 public constant MAX_BATCH_SIZE = 20;

    /// @notice Maximum range for getOperatorBondCount queries
    /// @dev Prevents eth_call DoS via toNonce = type(uint64).max spinning the node.
    uint256 public constant MAX_BOND_QUERY_RANGE = 10_000;

    /// @notice Delay enforced before a newly-set trusted relayer becomes active.
    /// @dev Rotating the relayer instantly would invalidate in-flight cross-chain
    ///      slash messages signed by the previous relayer. A queued rotation gives
    ///      pending slashes time to land before the old relayer's signature becomes
    ///      unusable.
    uint256 public constant RELAYER_ROTATION_DELAY = 1 hours;

    // ============ State ============

    /// @notice Contract owner
    address public owner;

    /// @notice Protocol treasury address for receiving slash proceeds
    address public treasury;

    /// @notice The WSTON ERC20 token used for bonds
    IERC20 public immutable wston;

    /// @notice Minimum bond floor in WSTON units
    uint256 public minBondFloor;

    /// @notice Bond storage: operator => vault => nonce => BondInfo
    mapping(address => mapping(address => mapping(uint64 => BondInfo))) public bonds;

    /// @notice Total amount currently bonded per operator
    mapping(address => uint256) public totalBonded;

    /// @notice Global total WSTON locked as bonds (for rescue token accounting)
    uint256 public totalLockedGlobal;

    /// @notice Authorized vaults that can lock/release/slash bonds
    mapping(address => bool) public authorizedVaults;

    /// @notice Trusted relayer address for cross-chain bond operations
    address public trustedRelayer;

    /// @notice Queued relayer rotation - proposed new relayer waits this long before activation
    address public pendingRelayer;
    uint256 public pendingRelayerActivatesAt;

    /// @notice Flag tracking whether the first trusted relayer
    ///         has ever been set. Only the very first assignment (before
    ///         this flag flips to true) bypasses the rotation timelock.
    ///         All subsequent assignments — including from address(0)
    ///         back to a non-zero relayer — go through the queued
    ///         `pendingRelayer` + timelock path. This closes the
    ///         clear-then-set bypass where a compromised owner could call
    ///         setTrustedRelayer(0) followed by setTrustedRelayer(evil) in
    ///         the SAME block to install an arbitrary relayer with zero
    ///         delay.
    bool public relayerInitialized;

    /// @notice Tracks bonds that have been slashed on the vault
    ///         chain (HyperEVM) but not yet resolved on L1. Prevents operators
    ///         from reclaiming bonds via the 90-day expiry safety valve while
    ///         a slash is pending cross-chain relay.
    mapping(address => mapping(address => mapping(uint64 => bool))) public slashPending;

    // ============ Events ============

    event BondLocked(
        address indexed operator, address indexed vault, uint64 indexed nonce, uint256 amount
    );
    event BondReleased(
        address indexed operator, address indexed vault, uint64 indexed nonce, uint256 amount
    );
    event BondSlashed(
        address indexed operator,
        address indexed vault,
        uint64 indexed nonce,
        uint256 amount,
        address slasher
    );
    event TreasuryUpdated(address indexed newTreasury);
    event MinBondFloorUpdated(uint256 newMinBondFloor);
    event VaultAuthorized(address indexed vault);
    event VaultRevoked(address indexed vault);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event TrustedRelayerUpdated(address indexed newRelayer);
    event CrossChainBondLocked(
        address indexed operator, address indexed vault, uint64 indexed nonce, uint256 amount
    );
    event BondReclaimed(
        address indexed operator, address indexed vault, uint64 indexed nonce, uint256 amount
    );
    event TokensRescued(address indexed token, address indexed to, uint256 amount);
    /// @notice Emitted when a new trusted relayer is proposed and queued
    event TrustedRelayerProposed(address indexed newRelayer, uint256 activatesAt);
    /// @notice Emitted when a bond is flagged as slash-pending
    event SlashPendingMarked(address indexed operator, address indexed vault, uint64 indexed nonce);

    // ============ Errors ============

    error NotOwner();
    error NotAuthorizedVault(address caller);
    error BondAlreadyExists(address operator, address vault, uint64 nonce);
    error InvalidBondStatus(address operator, address vault, uint64 nonce, BondStatus current);
    error ZeroTreasury();
    error ZeroOwner();
    error ZeroToken();
    error ZeroBondAmount();
    error NotTrustedRelayer(address caller);
    error ZeroRelayer();
    error RelayerNotSet();
    error BondNotExpired(uint256 lockedAt, uint256 expiry, uint256 current);
    error InsufficientRescuableBalance(uint256 requested, uint256 available);

    /// @notice Batch size exceeds maximum
    error BatchTooLarge(uint256 size, uint256 maximum);
    error BondBelowFloor(uint256 amount, uint256 floor);
    error UnresolvedSlashPending();

    // ============ Modifiers ============

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAuthorizedVault() {
        if (!authorizedVaults[msg.sender]) revert NotAuthorizedVault(msg.sender);
        _;
    }

    modifier onlyRelayer() {
        if (msg.sender != trustedRelayer) revert NotTrustedRelayer(msg.sender);
        _;
    }

    // ============ Constructor ============

    /// @notice Initialize the WSTON bond manager
    /// @param _wston The WSTON token address (L1WrappedStakedTON)
    /// @param _treasury Protocol treasury address for receiving slash proceeds
    /// @param _owner Contract owner who can configure settings
    /// @param _minBondFloor Initial minimum bond floor in WSTON units
    constructor(address _wston, address _treasury, address _owner, uint256 _minBondFloor) {
        if (_wston == address(0)) revert ZeroToken();
        if (_treasury == address(0)) revert ZeroTreasury();
        if (_owner == address(0)) revert ZeroOwner();
        wston = IERC20(_wston);
        treasury = _treasury;
        owner = _owner;
        minBondFloor = _minBondFloor;
        emit OwnershipTransferred(address(0), _owner);
    }

    // ============ Core Functions ============

    /// @inheritdoc IBondManager
    function lockBond(address operator, address vault, uint64 nonce, uint256 amount)
        external
        override
        nonReentrant
        onlyAuthorizedVault
    {
        if (amount == 0) revert ZeroBondAmount();
        // Enforce minBondFloor at the bond manager level — prevents dust
        // bonds that neutralize slashing economics.
        if (amount < minBondFloor) revert BondBelowFloor(amount, minBondFloor);

        BondInfo storage bond = bonds[operator][vault][nonce];
        if (bond.status != BondStatus.Empty) {
            revert BondAlreadyExists(operator, vault, nonce);
        }

        // Pull WSTON from the caller (the vault, which was approved by the operator)
        wston.safeTransferFrom(operator, address(this), amount);

        bond.amount = amount;
        bond.lockedAt = block.timestamp;
        bond.status = BondStatus.Locked;

        totalBonded[operator] += amount;
        totalLockedGlobal += amount;

        emit BondLocked(operator, vault, nonce, amount);
    }

    /// @inheritdoc IBondManager
    function releaseBond(address operator, address vault, uint64 nonce)
        external
        override
        nonReentrant
        onlyAuthorizedVault
    {
        BondInfo storage bond = bonds[operator][vault][nonce];
        if (bond.status != BondStatus.Locked) {
            revert InvalidBondStatus(operator, vault, nonce, bond.status);
        }

        uint256 amount = bond.amount;
        bond.status = BondStatus.Released;
        totalBonded[operator] -= amount;
        totalLockedGlobal -= amount;

        // Return WSTON to operator
        wston.safeTransfer(operator, amount);

        emit BondReleased(operator, vault, nonce, amount);
    }

    /// @inheritdoc IBondManager
    function slashBond(address operator, address vault, uint64 nonce, address slasher)
        external
        override
        nonReentrant
        onlyAuthorizedVault
    {
        BondInfo storage bond = bonds[operator][vault][nonce];
        if (bond.status != BondStatus.Locked) {
            revert InvalidBondStatus(operator, vault, nonce, bond.status);
        }

        uint256 amount = bond.amount;
        bond.status = BondStatus.Slashed;
        totalBonded[operator] -= amount;
        totalLockedGlobal -= amount;

        // Calculate distribution shares
        uint256 treasuryShare = (amount * TREASURY_SHARE_BPS) / BPS_DENOMINATOR;
        uint256 finderShare;
        uint256 depositorShare;

        if (slasher == address(0)) {
            // Self-slash: no finder fee, extra goes to vault (depositors)
            finderShare = 0;
            depositorShare = amount - treasuryShare;
        } else {
            // External slash: 10% finder, 80% vault, 10% treasury
            finderShare = (amount * FINDER_FEE_BPS) / BPS_DENOMINATOR;
            depositorShare = amount - treasuryShare - finderShare;
        }

        // Distribute WSTON via SafeERC20
        if (finderShare > 0) {
            wston.safeTransfer(slasher, finderShare);
        }
        if (depositorShare > 0) {
            wston.safeTransfer(vault, depositorShare);
        }
        if (treasuryShare > 0) {
            wston.safeTransfer(treasury, treasuryShare);
        }

        emit BondSlashed(operator, vault, nonce, amount, slasher);
    }

    // ============ Cross-Chain Functions ============

    /// @notice Lock a bond directly as the operator (no vault intermediary)
    /// @dev Used for cross-chain bonds: operator locks WSTON on L1 before submitting
    ///      an optimistic execution on HyperEVM. The vault address is the cross-chain vault.
    ///      Requires trustedRelayer to be set, otherwise bonds would be permanently stuck.
    /// @param vault The cross-chain vault address (used as key, not called)
    /// @param nonce The execution nonce
    /// @param amount The bond amount to lock
    function lockBondDirect(address vault, uint64 nonce, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroBondAmount();
        if (amount < minBondFloor) revert BondBelowFloor(amount, minBondFloor);
        if (trustedRelayer == address(0)) revert RelayerNotSet();

        BondInfo storage bond = bonds[msg.sender][vault][nonce];
        if (bond.status != BondStatus.Empty) {
            revert BondAlreadyExists(msg.sender, vault, nonce);
        }

        // Pull WSTON from operator
        wston.safeTransferFrom(msg.sender, address(this), amount);

        bond.amount = amount;
        bond.lockedAt = block.timestamp;
        bond.status = BondStatus.Locked;

        totalBonded[msg.sender] += amount;
        totalLockedGlobal += amount;

        emit CrossChainBondLocked(msg.sender, vault, nonce, amount);
        emit BondLocked(msg.sender, vault, nonce, amount);
    }

    /// @notice Release a bond via trusted relayer (cross-chain: oracle relays ProofSubmitted from HyperEVM)
    /// @param operator The operator address
    /// @param vault The cross-chain vault address
    /// @param nonce The execution nonce
    function releaseBondByRelayer(address operator, address vault, uint64 nonce)
        external
        nonReentrant
        onlyRelayer
    {
        BondInfo storage bond = bonds[operator][vault][nonce];
        if (bond.status != BondStatus.Locked) {
            revert InvalidBondStatus(operator, vault, nonce, bond.status);
        }

        uint256 amount = bond.amount;
        bond.status = BondStatus.Released;
        totalBonded[operator] -= amount;
        totalLockedGlobal -= amount;

        wston.safeTransfer(operator, amount);

        emit BondReleased(operator, vault, nonce, amount);
    }

    /// @notice Mark a bond as having a pending slash from the vault chain.
    ///         Callable by the relayer, owner, OR permissionlessly by anyone.
    ///         The permissionless path eliminates the relayer as a single point
    ///         of failure: if the relayer is offline, any observer of the
    ///         HyperEVM `ExecutionSlashed` event can flag the bond on L1 to
    ///         prevent the operator from reclaiming via the 90-day expiry valve.
    /// @param operator The operator whose bond is being flagged
    /// @param vault The vault address
    /// @param nonce The execution nonce
    function markSlashPending(address operator, address vault, uint64 nonce) external {
        BondInfo storage bond = bonds[operator][vault][nonce];
        if (bond.status != BondStatus.Locked) {
            revert InvalidBondStatus(operator, vault, nonce, bond.status);
        }
        slashPending[operator][vault][nonce] = true;
        emit SlashPendingMarked(operator, vault, nonce);
    }

    /// @notice Slash a bond via trusted relayer (cross-chain: oracle relays ExecutionSlashed from HyperEVM)
    /// @dev Cross-chain slash sends proceeds to treasury. Treasury handles redistribution.
    /// @param operator The operator address
    /// @param vault The cross-chain vault address
    /// @param nonce The execution nonce
    /// @param slasher The address that triggered the slash on HyperEVM (address(0) for self-slash)
    function slashBondByRelayer(address operator, address vault, uint64 nonce, address slasher)
        external
        nonReentrant
        onlyRelayer
    {
        BondInfo storage bond = bonds[operator][vault][nonce];
        if (bond.status != BondStatus.Locked) {
            revert InvalidBondStatus(operator, vault, nonce, bond.status);
        }

        // Clear the slash-pending flag (if set) now that the slash is being executed.
        slashPending[operator][vault][nonce] = false;

        uint256 amount = bond.amount;
        bond.status = BondStatus.Slashed;
        totalBonded[operator] -= amount;
        totalLockedGlobal -= amount;

        // Cross-chain slash honours the TREASURY_SHARE_BPS split explicitly.
        // The treasury receives its fixed 10% share, the finder gets its 10%
        // (or 0 for self-slash), and the remaining 80% depositor share is
        // forwarded to the treasury as escrow (cross-chain depositor transfer
        // is out of scope for this contract).
        uint256 treasuryShare = (amount * TREASURY_SHARE_BPS) / BPS_DENOMINATOR;
        uint256 finderShare;
        uint256 depositorShare;

        if (slasher == address(0)) {
            // Self-slash: no finder, depositor portion accrues to treasury as escrow
            finderShare = 0;
            depositorShare = amount - treasuryShare;
        } else {
            finderShare = (amount * FINDER_FEE_BPS) / BPS_DENOMINATOR;
            depositorShare = amount - treasuryShare - finderShare;
        }

        if (finderShare > 0) {
            wston.safeTransfer(slasher, finderShare);
        }
        // Treasury accumulates both its own share AND the cross-chain depositor share
        wston.safeTransfer(treasury, treasuryShare + depositorShare);

        emit BondSlashed(operator, vault, nonce, amount, slasher);
    }

    /// @notice Lock bonds for multiple executions in a single transaction
    /// @dev Reduces L1 gas costs for operators running multiple concurrent executions
    /// @param vaults Array of vault addresses
    /// @param nonces Array of execution nonces
    /// @param amounts Array of bond amounts
    function lockBondBatch(
        address[] calldata vaults,
        uint64[] calldata nonces,
        uint256[] calldata amounts
    ) external nonReentrant {
        require(
            vaults.length == nonces.length && nonces.length == amounts.length, "length mismatch"
        );
        require(vaults.length > 0, "empty batch");
        if (vaults.length > MAX_BATCH_SIZE) revert BatchTooLarge(vaults.length, MAX_BATCH_SIZE);
        if (trustedRelayer == address(0)) revert RelayerNotSet();

        uint256 totalAmount = 0;
        uint256 _minFloor = minBondFloor;
        for (uint256 i = 0; i < vaults.length; i++) {
            if (amounts[i] == 0) revert ZeroBondAmount();
            if (amounts[i] < _minFloor) revert BondBelowFloor(amounts[i], _minFloor);
            BondInfo storage bond = bonds[msg.sender][vaults[i]][nonces[i]];
            if (bond.status != BondStatus.Empty) {
                revert BondAlreadyExists(msg.sender, vaults[i], nonces[i]);
            }
            bond.amount = amounts[i];
            bond.lockedAt = block.timestamp;
            bond.status = BondStatus.Locked;
            totalAmount += amounts[i];

            emit CrossChainBondLocked(msg.sender, vaults[i], nonces[i], amounts[i]);
            emit BondLocked(msg.sender, vaults[i], nonces[i], amounts[i]);
        }

        wston.safeTransferFrom(msg.sender, address(this), totalAmount);
        totalBonded[msg.sender] += totalAmount;
        totalLockedGlobal += totalAmount;
    }

    // ============ Bond Safety Valve ============

    /// @notice Reclaim an expired bond that was never released or slashed
    /// @dev Safety valve: if a vault is revoked, relayer is lost, or cross-chain relay fails,
    ///      operators can reclaim their bond after BOND_EXPIRY (30 days) from lock time.
    ///      This prevents permanent fund lockup from any access control or relay failure.
    /// @param vault The vault address the bond was locked for
    /// @param nonce The execution nonce
    function reclaimExpiredBond(address vault, uint64 nonce) external nonReentrant {
        BondInfo storage bond = bonds[msg.sender][vault][nonce];
        if (bond.status != BondStatus.Locked) {
            revert InvalidBondStatus(msg.sender, vault, nonce, bond.status);
        }

        // Block reclamation if a cross-chain slash is pending.
        // Without this check, an operator could drain a vault via malicious
        // optimistic execution, wait 90 days for the relayer to fail, and
        // reclaim the full bond — zero economic penalty.
        if (slashPending[msg.sender][vault][nonce]) {
            revert UnresolvedSlashPending();
        }

        uint256 expiry = bond.lockedAt + BOND_EXPIRY;
        if (block.timestamp < expiry) {
            revert BondNotExpired(bond.lockedAt, expiry, block.timestamp);
        }

        uint256 amount = bond.amount;
        bond.status = BondStatus.Released;
        totalBonded[msg.sender] -= amount;
        totalLockedGlobal -= amount;

        wston.safeTransfer(msg.sender, amount);

        emit BondReclaimed(msg.sender, vault, nonce, amount);
        emit BondReleased(msg.sender, vault, nonce, amount);
    }

    // ============ View Functions ============

    /// @inheritdoc IBondManager
    function getMinBond(address /* vault */ ) external view override returns (uint256) {
        return minBondFloor;
    }

    /// @inheritdoc IBondManager
    function getBondedAmount(address operator) external view override returns (uint256) {
        return totalBonded[operator];
    }

    /// @notice Get detailed bond info for a specific operator-vault-nonce combination
    function getBondInfo(address operator, address vault, uint64 nonce)
        external
        view
        override
        returns (uint256 amount, uint256 lockedAt, uint8 status)
    {
        BondInfo storage bond = bonds[operator][vault][nonce];
        return (bond.amount, bond.lockedAt, uint8(bond.status));
    }

    /// @notice Get operator's total active bond count for a vault across all nonces
    /// @dev Range capped to MAX_BOND_QUERY_RANGE to guard against a
    ///      toNonce of type(uint64).max that would otherwise cause `i <= toNonce`
    ///      to loop forever and exhaust the node's gas budget on eth_call.
    function getOperatorBondCount(address operator, address vault, uint64 fromNonce, uint64 toNonce)
        external
        view
        returns (uint256 activeCount, uint256 totalLocked)
    {
        if (fromNonce > toNonce) return (0, 0);
        uint256 range = uint256(toNonce) - uint256(fromNonce) + 1;
        require(range <= MAX_BOND_QUERY_RANGE, "range too large");
        for (uint64 i = fromNonce; i <= toNonce; i++) {
            BondInfo storage bond = bonds[operator][vault][i];
            if (bond.status == BondStatus.Locked) {
                activeCount++;
                totalLocked += bond.amount;
            }
            // Prevent overflow wraparound when i == type(uint64).max after
            // the MAX_BOND_QUERY_RANGE cap has been satisfied.
            if (i == type(uint64).max) break;
        }
    }

    /// @inheritdoc IBondManager
    function bondToken() external view override returns (address) {
        return address(wston);
    }

    // ============ Owner Functions ============

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroTreasury();
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// @dev Rejects `_minBondFloor == 0`. A zero floor silently
    ///      eliminates the global slash economics and lets operators submit
    ///      executions with zero stake, undermining the entire bond system.
    function setMinBondFloor(uint256 _minBondFloor) external onlyOwner {
        require(_minBondFloor > 0, "zero bond floor");
        minBondFloor = _minBondFloor;
        emit MinBondFloorUpdated(_minBondFloor);
    }

    function authorizeVault(address vault) external onlyOwner {
        authorizedVaults[vault] = true;
        emit VaultAuthorized(vault);
    }

    function revokeVault(address vault) external onlyOwner {
        authorizedVaults[vault] = false;
        emit VaultRevoked(vault);
    }

    /// @notice Update the trusted relayer (clearing to zero revokes the relayer).
    /// @dev Cross-chain functions (lockBondDirect, lockBondBatch) require a
    ///      non-zero relayer, so clearing it cleanly stops new cross-chain
    ///      bonds without breaking the existing bonds.
    /// @dev Non-zero assignments are queued for RELAYER_ROTATION_DELAY so
    ///      in-flight cross-chain slash messages signed by the old relayer can
    ///      still land. ONLY the very first deployment-time assignment (tracked
    ///      by the `relayerInitialized` flag) bypasses the delay. Clearing to
    ///      zero is immediate.
    function setTrustedRelayer(address relayer) external onlyOwner {
        if (relayer == address(0)) {
            // Clearing is always immediate — there is no signature replay
            // concern when the relayer is unset. A cross-chain function
            // like lockBondDirect reverts with RelayerNotSet until a new
            // relayer is configured via the queued path below.
            trustedRelayer = address(0);
            pendingRelayer = address(0);
            pendingRelayerActivatesAt = 0;
            // Note: `relayerInitialized` deliberately NOT reset here — the
            // flag is a one-way door that prevents the clear-then-set bypass.
            emit TrustedRelayerUpdated(address(0));
            return;
        }

        // Very first lifetime assignment — take effect immediately.
        // This path can only be hit ONCE per contract deployment because
        // `relayerInitialized` is a one-way flag. After the first call
        // with a non-zero relayer, this branch is permanently closed and
        // all future assignments must go through the queued path below.
        if (!relayerInitialized) {
            relayerInitialized = true;
            trustedRelayer = relayer;
            emit TrustedRelayerUpdated(relayer);
            return;
        }

        // All subsequent assignments — INCLUDING transitioning from
        // a cleared address(0) state back to a non-zero relayer — are
        // queued through the full RELAYER_ROTATION_DELAY. This closes the
        // clear-then-set bypass of the rotation timelock.
        pendingRelayer = relayer;
        pendingRelayerActivatesAt = block.timestamp + RELAYER_ROTATION_DELAY;
        emit TrustedRelayerProposed(relayer, pendingRelayerActivatesAt);
    }

    /// @notice Activate a queued relayer rotation after the delay elapses
    /// @dev Permissionless — anyone can call once the timelock has
    ///      elapsed, so an absent owner cannot indefinitely stall a queued
    ///      rotation. The `activateTrustedRelayer` call is the ONLY way
    ///      (post-initialization) to install a non-zero relayer address.
    function activateTrustedRelayer() external {
        if (pendingRelayer == address(0)) revert RelayerNotSet();
        require(block.timestamp >= pendingRelayerActivatesAt, "rotation delay");
        trustedRelayer = pendingRelayer;
        pendingRelayer = address(0);
        pendingRelayerActivatesAt = 0;
        emit TrustedRelayerUpdated(trustedRelayer);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroOwner();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ============ Token Rescue ============

    /// @notice Rescue tokens accidentally sent to this contract
    /// @dev For WSTON: only rescues excess beyond totalLockedGlobal (bonded funds are protected).
    ///      For other tokens: rescues any amount (they should never be in this contract).
    /// @param token The ERC20 token to rescue
    /// @param to The recipient address
    /// @param amount The amount to rescue
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(wston)) {
            uint256 balance = wston.balanceOf(address(this));
            uint256 rescuable = balance > totalLockedGlobal ? balance - totalLockedGlobal : 0;
            if (amount > rescuable) {
                revert InsufficientRescuableBalance(amount, rescuable);
            }
        }
        IERC20(token).safeTransfer(to, amount);
        emit TokensRescued(token, to, amount);
    }
}
