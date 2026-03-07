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

    /// @notice Authorized vaults that can lock/release/slash bonds
    mapping(address => bool) public authorizedVaults;

    /// @notice Trusted relayer address for cross-chain bond operations
    address public trustedRelayer;

    // ============ Events ============

    event BondLocked(address indexed operator, address indexed vault, uint64 indexed nonce, uint256 amount);
    event BondReleased(address indexed operator, address indexed vault, uint64 indexed nonce, uint256 amount);
    event BondSlashed(address indexed operator, address indexed vault, uint64 indexed nonce, uint256 amount, address slasher);
    event TreasuryUpdated(address indexed newTreasury);
    event MinBondFloorUpdated(uint256 newMinBondFloor);
    event VaultAuthorized(address indexed vault);
    event VaultRevoked(address indexed vault);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event TrustedRelayerUpdated(address indexed newRelayer);
    event CrossChainBondLocked(address indexed operator, address indexed vault, uint64 indexed nonce, uint256 amount);

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
    function lockBond(
        address operator,
        address vault,
        uint64 nonce,
        uint256 amount
    ) external override nonReentrant onlyAuthorizedVault {
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

        emit BondLocked(operator, vault, nonce, amount);
    }

    /// @inheritdoc IBondManager
    function releaseBond(
        address operator,
        address vault,
        uint64 nonce
    ) external override nonReentrant onlyAuthorizedVault {
        BondInfo storage bond = bonds[operator][vault][nonce];
        if (bond.status != BondStatus.Locked) {
            revert InvalidBondStatus(operator, vault, nonce, bond.status);
        }

        uint256 amount = bond.amount;
        bond.status = BondStatus.Released;
        totalBonded[operator] -= amount;

        // Return WSTON to operator
        wston.safeTransfer(operator, amount);

        emit BondReleased(operator, vault, nonce, amount);
    }

    /// @inheritdoc IBondManager
    function slashBond(
        address operator,
        address vault,
        uint64 nonce,
        address slasher
    ) external override nonReentrant onlyAuthorizedVault {
        BondInfo storage bond = bonds[operator][vault][nonce];
        if (bond.status != BondStatus.Locked) {
            revert InvalidBondStatus(operator, vault, nonce, bond.status);
        }

        uint256 amount = bond.amount;
        bond.status = BondStatus.Slashed;
        totalBonded[operator] -= amount;

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
    /// @param vault The cross-chain vault address (used as key, not called)
    /// @param nonce The execution nonce
    /// @param amount The bond amount to lock
    function lockBondDirect(address vault, uint64 nonce, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroBondAmount();

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

        emit CrossChainBondLocked(msg.sender, vault, nonce, amount);
        emit BondLocked(msg.sender, vault, nonce, amount);
    }

    /// @notice Release a bond via trusted relayer (cross-chain: oracle relays ProofSubmitted from HyperEVM)
    /// @param operator The operator address
    /// @param vault The cross-chain vault address
    /// @param nonce The execution nonce
    function releaseBondByRelayer(
        address operator,
        address vault,
        uint64 nonce
    ) external nonReentrant onlyRelayer {
        BondInfo storage bond = bonds[operator][vault][nonce];
        if (bond.status != BondStatus.Locked) {
            revert InvalidBondStatus(operator, vault, nonce, bond.status);
        }

        uint256 amount = bond.amount;
        bond.status = BondStatus.Released;
        totalBonded[operator] -= amount;

        wston.safeTransfer(operator, amount);

        emit BondReleased(operator, vault, nonce, amount);
    }

    /// @notice Slash a bond via trusted relayer (cross-chain: oracle relays ExecutionSlashed from HyperEVM)
    /// @param operator The operator address
    /// @param vault The cross-chain vault address
    /// @param nonce The execution nonce
    /// @param slasher The address that triggered the slash on HyperEVM (address(0) for self-slash)
    function slashBondByRelayer(
        address operator,
        address vault,
        uint64 nonce,
        address slasher
    ) external nonReentrant onlyRelayer {
        BondInfo storage bond = bonds[operator][vault][nonce];
        if (bond.status != BondStatus.Locked) {
            revert InvalidBondStatus(operator, vault, nonce, bond.status);
        }

        uint256 amount = bond.amount;
        bond.status = BondStatus.Slashed;
        totalBonded[operator] -= amount;

        // Calculate distribution shares
        uint256 treasuryShare = (amount * TREASURY_SHARE_BPS) / BPS_DENOMINATOR;
        uint256 depositorShare;

        if (slasher == address(0)) {
            // Self-slash: no finder fee, extra goes to treasury (cross-chain can't send to vault depositors)
            depositorShare = 0;
        } else {
            depositorShare = 0; // Cross-chain: no direct transfer to HyperEVM depositors
        }

        // Cross-chain slash: all goes to treasury (treasury handles redistribution off-chain or via bridge)
        uint256 treasuryTotal = amount;
        if (treasuryTotal > 0) {
            wston.safeTransfer(treasury, treasuryTotal);
        }

        emit BondSlashed(operator, vault, nonce, amount, slasher);
    }

    // ============ View Functions ============

    /// @inheritdoc IBondManager
    function getMinBond(address /* vault */) external view override returns (uint256) {
        return minBondFloor;
    }

    /// @inheritdoc IBondManager
    function getBondedAmount(address operator) external view override returns (uint256) {
        return totalBonded[operator];
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
        trustedRelayer = relayer;
        emit TrustedRelayerUpdated(relayer);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroOwner();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
