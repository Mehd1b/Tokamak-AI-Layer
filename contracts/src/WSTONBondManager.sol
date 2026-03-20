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
    /// @dev Safety valve against stuck bonds (revoked vaults, lost relayer keys, etc.)
    uint256 public constant BOND_EXPIRY = 30 days;

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

    /// @notice Slash a bond via trusted relayer (cross-chain: oracle relays ExecutionSlashed from HyperEVM)
    /// @dev Cross-chain slash sends 100% to treasury. Treasury handles redistribution to HyperEVM
    ///      depositors off-chain or via bridge (cannot transfer directly to cross-chain vault).
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

        uint256 amount = bond.amount;
        bond.status = BondStatus.Slashed;
        totalBonded[operator] -= amount;
        totalLockedGlobal -= amount;

        // Cross-chain slash: 100% to treasury (treasury redistributes off-chain or via bridge)
        wston.safeTransfer(treasury, amount);

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
        if (trustedRelayer == address(0)) revert RelayerNotSet();

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < vaults.length; i++) {
            if (amounts[i] == 0) revert ZeroBondAmount();
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
    function getOperatorBondCount(address operator, address vault, uint64 fromNonce, uint64 toNonce)
        external
        view
        returns (uint256 activeCount, uint256 totalLocked)
    {
        for (uint64 i = fromNonce; i <= toNonce; i++) {
            BondInfo storage bond = bonds[operator][vault][i];
            if (bond.status == BondStatus.Locked) {
                activeCount++;
                totalLocked += bond.amount;
            }
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

    function setMinBondFloor(uint256 _minBondFloor) external onlyOwner {
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

    function setTrustedRelayer(address relayer) external onlyOwner {
        if (relayer == address(0)) revert ZeroRelayer();
        trustedRelayer = relayer;
        emit TrustedRelayerUpdated(relayer);
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
