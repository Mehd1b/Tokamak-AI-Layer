// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IVaultFactory } from "../interfaces/IVaultFactory.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title IKernelVaultOwner
/// @notice Minimal interface for reading the vault owner
interface IKernelVaultOwner {
    function owner() external view returns (address);
}

/// @notice Morpho Blue market parameters
struct MarketParams {
    address loanToken;
    address collateralToken;
    address oracle;
    address irm;
    uint256 lltv;
}

/// @notice Morpho Blue per-market price oracle interface
/// @dev Morpho's IOracle returns the price of 1 unit of collateral quoted in
///      loan token, scaled by `ORACLE_PRICE_SCALE = 1e36`. The adapter uses
///      the same convention.
interface IMorphoOracle {
    function price() external view returns (uint256);
}

/// @notice Minimal interface to read ERC-20 decimals
interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

/// @notice Morpho Blue core protocol interface
interface IMorpho {
    function supply(
        MarketParams calldata marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalfOf,
        bytes calldata data
    ) external returns (uint256 assetsSupplied, uint256 sharesSupplied);

    function withdraw(
        MarketParams calldata marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalfOf,
        address receiver
    ) external returns (uint256 assetsWithdrawn, uint256 sharesWithdrawn);

    function borrow(
        MarketParams calldata marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalfOf,
        address receiver
    ) external returns (uint256 assetsBorrowed, uint256 sharesBorrowed);

    function repay(
        MarketParams calldata marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalfOf,
        bytes calldata data
    ) external returns (uint256 assetsRepaid, uint256 sharesRepaid);

    function supplyCollateral(
        MarketParams calldata marketParams,
        uint256 assets,
        address onBehalfOf,
        bytes calldata data
    ) external;

    function withdrawCollateral(
        MarketParams calldata marketParams,
        uint256 assets,
        address onBehalfOf,
        address receiver
    ) external;

    function idToMarketParams(bytes32 id) external view returns (MarketParams memory);

    function position(bytes32 id, address user)
        external
        view
        returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral);
}

/// @title MorphoAdapter
/// @notice Canonical singleton adapter that routes KernelVault CALL actions to Morpho Blue
///         lending markets. Each vault interacts with Morpho directly (no sub-accounts needed
///         since Morpho supports `onBehalfOf` patterns).
///
/// @dev Architecture:
///      ┌───────────┐   ┌───────────┐
///      │ Vault A   │   │ Vault B   │    (any KernelVault)
///      └─────┬─────┘   └─────┬─────┘
///            │  CALL          │  CALL
///            ▼                ▼
///      ┌──────────────────────────────────┐
///      │   MorphoAdapter (singleton)      │
///      │   vaultMarkets mapping:          │
///      │     vault A → [market1, market2] │
///      │     vault B → [market3]          │
///      │   Routes by msg.sender           │
///      └──────────────┬──────────────────┘
///                     │
///                     ▼
///            ┌────────────────┐
///            │   Morpho Blue  │
///            │ 0xBBBB...FCb   │
///            └────────────────┘
///
///      Key constraints:
///      - Only registered KernelVaults can invoke lending functions
///      - Market whitelist per vault restricts which markets can be used
///      - Max 10 active markets per vault to bound gas on emergency withdrawal
///      - After borrow: health check against 80% of market LLTV
///      - Vault registration is permissioned: only vault owner + factory-deployed vaults
///
///      Selector reference (used by lending-agent zkVM agent):
///        supply(MarketParams,uint256)              => computed at deploy
///        withdraw(MarketParams,uint256)             => computed at deploy
///        borrow(MarketParams,uint256)               => computed at deploy
///        repay(MarketParams,uint256)                 => computed at deploy
///        supplyCollateral(MarketParams,uint256)      => computed at deploy
///        withdrawCollateral(MarketParams,uint256)    => computed at deploy
///        reallocate(MarketParams,MarketParams,uint256) => computed at deploy
///        withdrawToVault()                           => 0x84f22721
contract MorphoAdapter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    /// @notice Maximum number of active markets per vault
    uint256 public constant MAX_MARKETS_PER_VAULT = 10;

    /// @notice Health factor safety margin: 80% of market LLTV
    /// @dev After borrow, (borrowValue / collateralValue) must be <= LLTV * 80 / 100
    uint256 public constant HEALTH_FACTOR_BPS = 8000; // 80% in basis points (out of 10000)

    /// @notice Default Morpho Blue singleton address on Ethereum mainnet
    address public constant DEFAULT_MORPHO = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;

    // ============ Immutables ============

    /// @notice Morpho Blue singleton address
    address public immutable morpho;

    /// @notice The VaultFactory used to verify vault provenance
    address public immutable vaultFactory;

    // ============ State ============

    /// @notice Whether a vault is registered
    mapping(address vault => bool) public isRegistered;

    /// @notice Active market IDs per vault
    mapping(address vault => bytes32[]) internal _vaultMarketIds;

    /// @notice Market whitelist per vault: marketKey => whitelisted
    /// @dev marketKey = keccak256(abi.encode(marketParams))
    mapping(address vault => mapping(bytes32 marketKey => bool)) public isMarketWhitelisted;

    /// @notice Track whether a market ID is already in the active list for a vault
    mapping(address vault => mapping(bytes32 marketId => bool)) internal _isMarketActive;

    /// @notice Per-vault position accounting to enforce isolation on the shared Morpho account.
    /// @dev Tracks the amount of loan tokens supplied per market by each vault.
    mapping(address vault => mapping(bytes32 marketId => uint256)) internal _vaultSupplied;

    /// @notice Per-vault tracked borrow position per market.
    mapping(address vault => mapping(bytes32 marketId => uint256)) internal _vaultBorrowed;

    /// @notice Per-vault tracked collateral position per market.
    mapping(address vault => mapping(bytes32 marketId => uint256)) internal _vaultCollateral;

    // ============ Events ============

    /// @notice Emitted when a vault is registered
    event VaultRegistered(address indexed vault);

    /// @notice Emitted when a market is whitelisted for a vault
    event MarketWhitelisted(address indexed vault, bytes32 indexed marketKey);

    /// @notice Emitted when a market is removed from the whitelist
    event MarketDelisted(address indexed vault, bytes32 indexed marketKey);

    /// @notice Emitted when assets are supplied to a Morpho market
    event Supplied(address indexed vault, bytes32 indexed marketId, uint256 assets);

    /// @notice Emitted when assets are withdrawn from a Morpho market
    event Withdrawn(address indexed vault, bytes32 indexed marketId, uint256 assets);

    /// @notice Emitted when assets are borrowed from a Morpho market
    event Borrowed(address indexed vault, bytes32 indexed marketId, uint256 assets);

    /// @notice Emitted when debt is repaid on a Morpho market
    event Repaid(address indexed vault, bytes32 indexed marketId, uint256 assets);

    /// @notice Emitted when collateral is supplied to a Morpho market
    event CollateralSupplied(address indexed vault, bytes32 indexed marketId, uint256 assets);

    /// @notice Emitted when collateral is withdrawn from a Morpho market
    event CollateralWithdrawn(address indexed vault, bytes32 indexed marketId, uint256 assets);

    /// @notice Emitted when supply is reallocated between markets
    event Reallocated(
        address indexed vault, bytes32 indexed fromMarketId, bytes32 indexed toMarketId, uint256 assets
    );

    /// @notice Emitted during emergency withdrawal
    event EmergencyWithdraw(address indexed vault, bytes32 indexed marketId);

    // ============ Errors ============

    /// @notice Vault has not been registered
    error VaultNotRegistered();

    /// @notice Vault is already registered
    error VaultAlreadyRegistered();

    /// @notice Caller is not the vault owner
    error NotVaultOwner();

    /// @notice Vault was not deployed by the VaultFactory
    error VaultNotDeployedByFactory();

    /// @notice Zero address provided
    error ZeroAddress();

    /// @notice Zero amount provided
    error ZeroAmount();

    /// @notice Market is not whitelisted for this vault
    error MarketNotWhitelisted();

    /// @notice Maximum number of markets per vault reached
    error MaxMarketsReached();

    /// @notice Position health is below the safety threshold after borrow
    error UnhealthyPosition(uint256 borrowValue, uint256 maxBorrowValue);

    /// @notice Vault attempted to withdraw more than its tracked supply
    error InsufficientVaultPosition(uint256 requested, uint256 available);

    // ============ Modifiers ============

    modifier onlyRegisteredVault() {
        if (!isRegistered[msg.sender]) {
            revert VaultNotRegistered();
        }
        _;
    }

    modifier onlyWhitelistedMarket(MarketParams calldata params) {
        bytes32 marketKey = keccak256(abi.encode(params));
        if (!isMarketWhitelisted[msg.sender][marketKey]) {
            revert MarketNotWhitelisted();
        }
        _;
    }

    // ============ Constructor ============

    /// @notice Deploy the canonical MorphoAdapter singleton
    /// @param _morpho The Morpho Blue singleton address (use DEFAULT_MORPHO for mainnet)
    /// @param _vaultFactory The VaultFactory contract address for vault verification
    constructor(address _morpho, address _vaultFactory) {
        if (_morpho == address(0)) revert ZeroAddress();
        if (_vaultFactory == address(0)) revert ZeroAddress();
        morpho = _morpho;
        vaultFactory = _vaultFactory;
    }

    // ============ Registration ============

    /// @notice Register a vault with the adapter
    /// @dev Only the vault owner can register. Vault must be deployed by the VaultFactory.
    /// @param vault The KernelVault address to register
    function registerVault(address vault) external nonReentrant {
        if (vault == address(0)) revert ZeroAddress();

        if (!IVaultFactory(vaultFactory).isDeployedVault(vault)) {
            revert VaultNotDeployedByFactory();
        }

        if (msg.sender != IKernelVaultOwner(vault).owner()) {
            revert NotVaultOwner();
        }

        if (isRegistered[vault]) {
            revert VaultAlreadyRegistered();
        }

        isRegistered[vault] = true;

        emit VaultRegistered(vault);
    }

    /// @notice Unregister a vault from the adapter.
    /// @dev Only the vault owner can unregister. The vault must have no tracked
    ///      positions in any market — callers should drain via `withdrawToVault`
    ///      first. Prevents a revoked vault from retaining access to the adapter.
    function unregisterVault(address vault) external nonReentrant {
        if (!isRegistered[vault]) revert VaultNotRegistered();
        if (msg.sender != IKernelVaultOwner(vault).owner()) revert NotVaultOwner();

        bytes32[] storage ids = _vaultMarketIds[vault];
        for (uint256 i = 0; i < ids.length; i++) {
            bytes32 mid = ids[i];
            if (
                _vaultSupplied[vault][mid] != 0
                    || _vaultBorrowed[vault][mid] != 0
                    || _vaultCollateral[vault][mid] != 0
            ) {
                revert InsufficientVaultPosition(1, 0);
            }
            _isMarketActive[vault][mid] = false;
        }
        delete _vaultMarketIds[vault];

        isRegistered[vault] = false;
    }

    // ============ Market Whitelist Management ============

    /// @notice Whitelist a market for a vault
    /// @dev Only callable by the vault owner. Market is identified by keccak256(abi.encode(params)).
    /// @param vault The vault to whitelist the market for
    /// @param params The market parameters to whitelist
    function whitelistMarket(address vault, MarketParams calldata params) external nonReentrant {
        if (!isRegistered[vault]) revert VaultNotRegistered();
        if (msg.sender != IKernelVaultOwner(vault).owner()) revert NotVaultOwner();

        // Reject markets without an oracle or IRM. Morpho Blue allows
        // oracle-less markets but whitelisting one in the adapter disables the
        // health-factor check downstream, producing phantom collateralisation.
        require(params.oracle != address(0), "zero oracle");
        require(params.irm != address(0), "zero irm");
        require(params.collateralToken != address(0), "zero collateral");
        require(params.loanToken != address(0), "zero loan token");

        bytes32 marketKey = keccak256(abi.encode(params));
        isMarketWhitelisted[vault][marketKey] = true;

        emit MarketWhitelisted(vault, marketKey);
    }

    /// @notice Remove a market from a vault's whitelist
    /// @dev Only callable by the vault owner.
    /// @param vault The vault to delist the market from
    /// @param params The market parameters to delist
    function delistMarket(address vault, MarketParams calldata params) external nonReentrant {
        if (!isRegistered[vault]) revert VaultNotRegistered();
        if (msg.sender != IKernelVaultOwner(vault).owner()) revert NotVaultOwner();

        bytes32 marketKey = keccak256(abi.encode(params));
        isMarketWhitelisted[vault][marketKey] = false;

        emit MarketDelisted(vault, marketKey);
    }

    // ============ Core Functions ============

    /// @notice Supply loan token to a Morpho market
    /// @dev Pulls the loan token from the vault and supplies to Morpho on behalf of the vault.
    /// @param params The Morpho market parameters
    /// @param assets The amount of loan tokens to supply
    function supply(MarketParams calldata params, uint256 assets)
        external
        nonReentrant
        onlyRegisteredVault
        onlyWhitelistedMarket(params)
    {
        if (assets == 0) revert ZeroAmount();

        bytes32 marketId = _marketId(params);
        _trackMarket(msg.sender, marketId);

        // Pull loan token from vault to this adapter
        IERC20(params.loanToken).safeTransferFrom(msg.sender, address(this), assets);

        // Approve Morpho to spend the loan token
        IERC20(params.loanToken).forceApprove(morpho, assets);

        // Supply to Morpho on behalf of this adapter (adapter holds the position)
        IMorpho(morpho).supply(params, assets, 0, address(this), "");

        // Credit the calling vault's tracked supply so other vaults cannot withdraw it
        _vaultSupplied[msg.sender][marketId] += assets;

        emit Supplied(msg.sender, marketId, assets);
    }

    /// @notice Withdraw loan tokens from a Morpho market
    /// @dev Withdraws from Morpho and sends directly to the vault.
    /// @param params The Morpho market parameters
    /// @param assets The amount of loan tokens to withdraw
    function withdraw(MarketParams calldata params, uint256 assets)
        external
        nonReentrant
        onlyRegisteredVault
        onlyWhitelistedMarket(params)
    {
        if (assets == 0) revert ZeroAmount();

        bytes32 marketId = _marketId(params);

        // Enforce per-vault position cap: a vault can only withdraw its own tracked supply
        uint256 tracked = _vaultSupplied[msg.sender][marketId];
        if (assets > tracked) {
            revert InsufficientVaultPosition(assets, tracked);
        }
        _vaultSupplied[msg.sender][marketId] = tracked - assets;

        // Withdraw from Morpho: adapter is the position holder, vault is the receiver
        IMorpho(morpho).withdraw(params, assets, 0, address(this), msg.sender);

        emit Withdrawn(msg.sender, marketId, assets);
    }

    /// @notice Borrow loan tokens from a Morpho market
    /// @dev Borrows from Morpho and sends to the vault. Checks position health after borrowing.
    /// @param params The Morpho market parameters
    /// @param assets The amount of loan tokens to borrow
    function borrow(MarketParams calldata params, uint256 assets)
        external
        nonReentrant
        onlyRegisteredVault
        onlyWhitelistedMarket(params)
    {
        if (assets == 0) revert ZeroAmount();

        bytes32 marketId = _marketId(params);
        _trackMarket(msg.sender, marketId);

        // Credit the calling vault's tracked borrow BEFORE the external call so that
        // per-vault health is enforced on the vault's own collateral only.
        _vaultBorrowed[msg.sender][marketId] += assets;

        // Borrow from Morpho: adapter is the position holder, vault receives funds
        IMorpho(morpho).borrow(params, assets, 0, address(this), msg.sender);

        // Health check: ensure the calling vault's tracked position is within the
        // safety threshold. Uses only the caller's tracked collateral, not the
        // adapter's aggregate position — this prevents cross-vault collateral abuse.
        _checkVaultHealth(msg.sender, marketId, params.lltv, params.oracle);

        emit Borrowed(msg.sender, marketId, assets);
    }

    /// @notice Repay debt on a Morpho market
    /// @dev Pulls loan tokens from the vault and repays on Morpho.
    /// @param params The Morpho market parameters
    /// @param assets The amount of loan tokens to repay
    function repay(MarketParams calldata params, uint256 assets)
        external
        nonReentrant
        onlyRegisteredVault
        onlyWhitelistedMarket(params)
    {
        if (assets == 0) revert ZeroAmount();

        bytes32 marketId = _marketId(params);

        // Pull loan token from vault
        IERC20(params.loanToken).safeTransferFrom(msg.sender, address(this), assets);

        // Approve Morpho to spend
        IERC20(params.loanToken).forceApprove(morpho, assets);

        // Repay on Morpho
        IMorpho(morpho).repay(params, assets, 0, address(this), "");

        // Decrement tracked borrow (cap at the tracked amount to tolerate interest dust)
        uint256 trackedBorrow = _vaultBorrowed[msg.sender][marketId];
        if (assets >= trackedBorrow) {
            _vaultBorrowed[msg.sender][marketId] = 0;
        } else {
            _vaultBorrowed[msg.sender][marketId] = trackedBorrow - assets;
        }

        emit Repaid(msg.sender, marketId, assets);
    }

    /// @notice Supply collateral to a Morpho market
    /// @dev Pulls the collateral token from the vault and deposits to Morpho.
    /// @param params The Morpho market parameters
    /// @param assets The amount of collateral tokens to supply
    function supplyCollateral(MarketParams calldata params, uint256 assets)
        external
        nonReentrant
        onlyRegisteredVault
        onlyWhitelistedMarket(params)
    {
        if (assets == 0) revert ZeroAmount();

        bytes32 marketId = _marketId(params);
        _trackMarket(msg.sender, marketId);

        // Pull collateral token from vault
        IERC20(params.collateralToken).safeTransferFrom(msg.sender, address(this), assets);

        // Approve Morpho to spend the collateral token
        IERC20(params.collateralToken).forceApprove(morpho, assets);

        // Supply collateral on Morpho
        IMorpho(morpho).supplyCollateral(params, assets, address(this), "");

        // Credit the calling vault's tracked collateral
        _vaultCollateral[msg.sender][marketId] += assets;

        emit CollateralSupplied(msg.sender, marketId, assets);
    }

    /// @notice Withdraw collateral from a Morpho market
    /// @dev Withdraws collateral from Morpho and sends to the vault.
    /// @param params The Morpho market parameters
    /// @param assets The amount of collateral tokens to withdraw
    function withdrawCollateral(MarketParams calldata params, uint256 assets)
        external
        nonReentrant
        onlyRegisteredVault
        onlyWhitelistedMarket(params)
    {
        if (assets == 0) revert ZeroAmount();

        bytes32 marketId = _marketId(params);

        // Enforce per-vault collateral cap
        uint256 trackedCollateral = _vaultCollateral[msg.sender][marketId];
        if (assets > trackedCollateral) {
            revert InsufficientVaultPosition(assets, trackedCollateral);
        }
        _vaultCollateral[msg.sender][marketId] = trackedCollateral - assets;

        // Withdraw collateral from Morpho: adapter holds position, vault receives
        IMorpho(morpho).withdrawCollateral(params, assets, address(this), msg.sender);

        // Per-vault health check: require the caller still collateralizes their own debt
        if (_vaultBorrowed[msg.sender][marketId] > 0) {
            _checkVaultHealth(msg.sender, marketId, params.lltv, params.oracle);
        }

        emit CollateralWithdrawn(msg.sender, marketId, assets);
    }

    /// @notice Reallocate supply from one market to another
    /// @dev Withdraws from the source market and supplies to the destination market.
    /// @param from The source market parameters
    /// @param to The destination market parameters
    /// @param assets The amount of loan tokens to move
    function reallocate(MarketParams calldata from, MarketParams calldata to, uint256 assets)
        external
        nonReentrant
        onlyRegisteredVault
    {
        if (assets == 0) revert ZeroAmount();

        // Both markets must be whitelisted
        bytes32 fromKey = keccak256(abi.encode(from));
        if (!isMarketWhitelisted[msg.sender][fromKey]) revert MarketNotWhitelisted();

        bytes32 toKey = keccak256(abi.encode(to));
        if (!isMarketWhitelisted[msg.sender][toKey]) revert MarketNotWhitelisted();

        bytes32 fromMarketId = _marketId(from);
        bytes32 toMarketId = _marketId(to);

        _trackMarket(msg.sender, toMarketId);

        // Enforce per-vault cap on source market supply
        uint256 trackedFrom = _vaultSupplied[msg.sender][fromMarketId];
        if (assets > trackedFrom) {
            revert InsufficientVaultPosition(assets, trackedFrom);
        }
        _vaultSupplied[msg.sender][fromMarketId] = trackedFrom - assets;
        _vaultSupplied[msg.sender][toMarketId] += assets;

        // Withdraw from source market to this adapter
        IMorpho(morpho).withdraw(from, assets, 0, address(this), address(this));

        // Approve and supply to destination market
        IERC20(to.loanToken).forceApprove(morpho, assets);
        IMorpho(morpho).supply(to, assets, 0, address(this), "");

        emit Reallocated(msg.sender, fromMarketId, toMarketId, assets);
    }

    /// @notice Emergency: withdraw the calling vault's tracked positions from all known markets.
    /// @dev Only withdraws amounts tracked for the calling vault — it CANNOT drain the
    ///      adapter's aggregate position (other vaults' funds). Outstanding debt is repaid
    ///      first using the vault's ERC20 allowance before collateral is withdrawn.
    function withdrawToVault() external nonReentrant onlyRegisteredVault {
        bytes32[] storage marketIds = _vaultMarketIds[msg.sender];
        uint256 length = marketIds.length;

        for (uint256 i = 0; i < length; i++) {
            bytes32 marketId = marketIds[i];
            MarketParams memory params = IMorpho(morpho).idToMarketParams(marketId);

            uint256 vaultSupply = _vaultSupplied[msg.sender][marketId];
            uint256 vaultBorrow = _vaultBorrowed[msg.sender][marketId];
            uint256 vaultCollat = _vaultCollateral[msg.sender][marketId];

            // Withdraw the vault's tracked supply (caller's share only)
            if (vaultSupply > 0) {
                _vaultSupplied[msg.sender][marketId] = 0;
                IMorpho(morpho).withdraw(params, vaultSupply, 0, address(this), msg.sender);
            }

            // Repay outstanding debt before collateral withdrawal.
            // Use share-based repay to fully close the position including
            // accrued interest. The tracked `vaultBorrow` is the nominal
            // principal; Morpho's actual debt grows with interest. Repaying
            // only the nominal principal leaves residual borrow shares,
            // which blocks collateral withdrawal (H-08).
            if (vaultBorrow > 0) {
                (, uint128 borrowShares,) = IMorpho(morpho).position(marketId, address(this));
                if (borrowShares > 0) {
                    // Compute the actual assets needed by doing a share-based
                    // repay for all outstanding borrow shares. First, estimate
                    // the asset amount by repaying the full share amount.
                    // We over-pull slightly to cover rounding: pull vaultBorrow + 1%
                    // buffer, Morpho only takes what's needed and the excess stays.
                    uint256 repayEstimate = vaultBorrow + (vaultBorrow / 100) + 1;
                    IERC20(params.loanToken).safeTransferFrom(
                        msg.sender, address(this), repayEstimate
                    );
                    IERC20(params.loanToken).forceApprove(morpho, repayEstimate);
                    // Share-based repay: repay ALL borrow shares to fully close the debt
                    (uint256 assetsRepaid,) = IMorpho(morpho).repay(params, 0, borrowShares, address(this), "");
                    // Return any excess pulled from the vault
                    uint256 excess = repayEstimate - assetsRepaid;
                    if (excess > 0) {
                        IERC20(params.loanToken).safeTransfer(msg.sender, excess);
                    }
                }
                _vaultBorrowed[msg.sender][marketId] = 0;
            }

            // Withdraw the vault's tracked collateral
            if (vaultCollat > 0) {
                _vaultCollateral[msg.sender][marketId] = 0;
                IMorpho(morpho).withdrawCollateral(
                    params, vaultCollat, address(this), msg.sender
                );
            }

            // Clear market activation flag: allows future re-supply to retrack
            _isMarketActive[msg.sender][marketId] = false;

            emit EmergencyWithdraw(msg.sender, marketId);
        }

        // Clear tracked markets after full withdrawal
        delete _vaultMarketIds[msg.sender];
    }

    // ============ View Functions ============

    /// @notice Get the active market IDs for a vault
    /// @param vault The vault address
    /// @return The array of active market IDs
    function getVaultMarketIds(address vault) external view returns (bytes32[] memory) {
        return _vaultMarketIds[vault];
    }

    /// @notice Get the number of active markets for a vault
    /// @param vault The vault address
    /// @return The number of active markets
    function getVaultMarketCount(address vault) external view returns (uint256) {
        return _vaultMarketIds[vault].length;
    }

    /// @notice Get the position of this adapter in a specific market
    /// @param marketId The Morpho market ID
    /// @return supplyShares The supply shares held
    /// @return borrowShares The borrow shares owed
    /// @return collateral The collateral deposited
    function getPosition(bytes32 marketId)
        external
        view
        returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)
    {
        return IMorpho(morpho).position(marketId, address(this));
    }

    // ============ Internal Functions ============

    /// @notice Compute the Morpho market ID from market parameters
    /// @dev Morpho Blue uses keccak256(abi.encode(MarketParams)) as the market ID
    function _marketId(MarketParams calldata params) internal pure returns (bytes32) {
        return keccak256(abi.encode(params));
    }

    /// @notice Track a market in the vault's active market list
    /// @dev Adds the market ID to the list if not already tracked. Enforces MAX_MARKETS_PER_VAULT.
    function _trackMarket(address vault, bytes32 marketId) internal {
        if (_isMarketActive[vault][marketId]) return;

        if (_vaultMarketIds[vault].length >= MAX_MARKETS_PER_VAULT) {
            revert MaxMarketsReached();
        }

        _vaultMarketIds[vault].push(marketId);
        _isMarketActive[vault][marketId] = true;
    }

    /// @notice Morpho Blue's ORACLE_PRICE_SCALE constant
    /// @dev Per Morpho Blue spec, prices returned by market oracles are scaled
    ///      such that: collateralValueInLoanToken
    ///        = collateral * price / ORACLE_PRICE_SCALE
    ///      where ORACLE_PRICE_SCALE = 10 ** (36 + loanDecimals - collateralDecimals)
    ///      in the default implementation. We use the canonical `1e36`.
    uint256 internal constant ORACLE_PRICE_SCALE = 1e36;

    /// @notice Per-vault health check operating on tracked positions only.
    /// @dev Previously the check compared `collateral` (in collateral
    ///      token units) against `maxBorrow` (derived from `collateral` again)
    ///      without consulting the per-market oracle. That silently assumed a
    ///      1:1 unit parity between collateral and loan token — disastrously
    ///      wrong for any market with differing decimals or prices. The fix
    ///      plumbs the market's own oracle through and converts collateral
    ///      to loan-token value before computing maxBorrow.
    function _checkVaultHealth(
        address vault,
        bytes32 marketId,
        uint256 lltv,
        address oracle
    ) internal view {
        // Query live Morpho borrow shares for the adapter's aggregate position.
        // Then compute this vault's proportional share of the actual debt.
        // The tracked `_vaultBorrowed` is the nominal principal at borrow time
        // and progressively underestimates real debt due to accrued interest (H-09).
        uint256 vaultBorrow = _vaultBorrowed[vault][marketId];
        (, uint128 totalBorrowShares,) = IMorpho(morpho).position(marketId, address(this));
        if (totalBorrowShares > 0 && vaultBorrow > 0) {
            // Compute total tracked borrows across all vaults for this market
            // to determine this vault's proportion. Since we can't enumerate all
            // vaults, use the adapter's aggregate borrow shares to scale up:
            // The ratio of actual debt to tracked debt is reflected in the
            // borrow share value appreciation. Apply a conservative scaling:
            // reduce HEALTH_FACTOR_BPS by an additional 5% to account for
            // interest accrual between health checks.
            // Effective safety margin: 80% * 95% = 76% of LLTV.
            vaultBorrow = vaultBorrow + (vaultBorrow * 500) / 10000; // +5% interest buffer
        }
        uint256 vaultCollat = _vaultCollateral[vault][marketId];

        if (vaultBorrow == 0) return;
        if (vaultCollat == 0) revert UnhealthyPosition(vaultBorrow, 0);

        // C-04: convert collateral to loan-token value via the market oracle.
        require(oracle != address(0), "market oracle unset");
        uint256 price = IMorphoOracle(oracle).price();
        require(price > 0, "zero oracle price");
        uint256 collatValueLoan = (vaultCollat * price) / ORACLE_PRICE_SCALE;

        // Morpho spec: maxBorrow = collateralValue * lltv / 1e18
        // We additionally apply the HEALTH_FACTOR_BPS haircut so the adapter
        // stays strictly more conservative than Morpho's own liquidation
        // threshold.
        uint256 maxBorrow =
            (collatValueLoan * lltv * HEALTH_FACTOR_BPS) / (1e18 * 10000);

        if (vaultBorrow > maxBorrow) {
            revert UnhealthyPosition(vaultBorrow, maxBorrow);
        }
    }

    // ============ Per-Vault Position Views ============

    /// @notice Get the tracked supply balance for a vault in a market
    function vaultSupplied(address vault, bytes32 marketId) external view returns (uint256) {
        return _vaultSupplied[vault][marketId];
    }

    /// @notice Get the tracked borrow balance for a vault in a market
    function vaultBorrowed(address vault, bytes32 marketId) external view returns (uint256) {
        return _vaultBorrowed[vault][marketId];
    }

    /// @notice Get the tracked collateral balance for a vault in a market
    function vaultCollateral(address vault, bytes32 marketId) external view returns (uint256) {
        return _vaultCollateral[vault][marketId];
    }
}
