// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IAaveV3Adapter } from "../interfaces/IAaveV3Adapter.sol";
import { IVaultFactory } from "../interfaces/IVaultFactory.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title IKernelVaultOwner
/// @notice Minimal interface for reading the vault owner
interface IKernelVaultOwner {
    function owner() external view returns (address);
}

/// @title IPool
/// @notice Minimal Aave V3 Pool interface
interface IPool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
    function borrow(
        address asset,
        uint256 amount,
        uint256 interestRateMode,
        uint16 referralCode,
        address onBehalfOf
    ) external;
    function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf)
        external
        returns (uint256);
    function getUserAccountData(address user)
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        );
    function ADDRESSES_PROVIDER() external view returns (address);
}

/// @title IPoolAddressesProvider
/// @notice Minimal Aave V3 addresses provider — used to locate the price oracle
interface IPoolAddressesProvider {
    function getPriceOracle() external view returns (address);
}

/// @title IPriceOracleGetter
/// @notice Aave V3 price oracle interface — returns asset prices in base currency
interface IPriceOracleGetter {
    function getAssetPrice(address asset) external view returns (uint256);
    function BASE_CURRENCY() external view returns (address);
    function BASE_CURRENCY_UNIT() external view returns (uint256);
}

/// @title IERC20Decimals
/// @notice Minimal interface to read ERC-20 decimals for normalisation
interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

/// @title IRewardsController
/// @notice Minimal Aave V3 Rewards Controller interface
interface IRewardsController {
    function claimAllRewards(address[] calldata assets, address to)
        external
        returns (address[] memory rewardsList, uint256[] memory claimedAmounts);
}

/// @title AaveV3Adapter
/// @notice Canonical singleton adapter that routes KernelVault CALL actions to Aave V3
///         lending pool operations (supply, borrow, repay, withdraw).
///
/// @dev Architecture:
///      ┌───────────┐   ┌───────────┐
///      │ Vault A   │   │ Vault B   │    (any KernelVault)
///      └─────┬─────┘   └─────┬─────┘
///            │  CALL          │  CALL
///            ▼                ▼
///      ┌──────────────────────────────────┐
///      │   AaveV3Adapter (singleton)      │
///      │   vaultConfigs mapping:          │
///      │     vault A → config             │
///      │     vault B → config             │
///      │   Routes by msg.sender           │
///      └──────┬───────────────────────────┘
///             │
///             ▼
///      ┌──────────────┐
///      │  Aave V3 Pool│
///      │  (lending)   │
///      └──────────────┘
///
///      Key constraints:
///      - The adapter holds Aave positions on its own address (all vaults share the adapter's
///        Aave account). Per-vault aToken tracking is maintained in allowedAssets.
///      - Health factor is checked after every borrow to prevent liquidation risk
///      - Only registered KernelVaults can invoke lending functions
///      - Vault registration is permissioned: only vault owner + factory-deployed vaults
///
///      Selector reference (used by lending-agent zkVM agent):
///        supply(address,uint256)                   => 0x47e7ef24
///        withdraw(address,uint256)                 => 0xf3fef3a3
///        borrow(address,uint256,uint256)           => 0x4b8a3529
///        repay(address,uint256,uint256)            => 0x5ceae9c4
///        claimRewards(address[])                   => 0x6fa7abab
///        withdrawToVault()                         => 0x84f22721
contract AaveV3Adapter is IAaveV3Adapter, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Immutables ============

    /// @notice The Aave V3 Pool contract
    IPool public immutable pool;

    /// @notice The Aave V3 Rewards Controller contract
    IRewardsController public immutable rewardsController;

    /// @notice The VaultFactory used to verify vault provenance
    address public immutable vaultFactory;

    /// @notice The adapter deployer (can configure global settings)
    address public immutable adapterOwner;

    // ============ State ============

    /// @notice Minimum health factor required after borrows (1.5e18 = 1.5 by default)
    uint256 public minHealthFactor;

    /// @notice Mapping from vault address to its registration status
    mapping(address vault => bool registered) internal _vaultRegistered;

    /// @notice Mapping from vault address to allowed assets
    mapping(address vault => mapping(address asset => bool allowed)) internal _allowedAssets;

    /// @notice List of assets that have been supplied (for emergency withdrawal)
    /// @dev Per-vault tracking of supplied assets for withdrawToVault
    mapping(address vault => address[]) internal _suppliedAssets;

    /// @notice Whether an asset has already been added to the supplied list for a vault
    mapping(address vault => mapping(address asset => bool tracked)) internal _assetTracked;

    /// @notice Per-vault supplied amount per asset (in the asset's own units).
    /// @dev Enforces isolation on the shared Aave account: a vault may only withdraw
    ///      up to the amount it supplied. Interest accrual is retained in the adapter
    ///      until a protocol-level rebase distribution is implemented.
    mapping(address vault => mapping(address asset => uint256)) internal _vaultSupplied;

    /// @notice Per-vault borrowed amount per asset.
    mapping(address vault => mapping(address asset => uint256)) internal _vaultBorrowed;

    /// @notice C-03 support: list of assets the vault has outstanding borrows in.
    ///         Needed so `_checkVaultHealth` can enumerate borrows even when
    ///         the asset is not in `_suppliedAssets` (borrowing without
    ///         supplying the same asset).
    mapping(address vault => address[]) internal _borrowedAssets;

    /// @notice C-03 support: whether an asset is already tracked in `_borrowedAssets[vault]`
    mapping(address vault => mapping(address asset => bool)) internal _borrowedAssetTracked;

    // ============ Events (not in interface) ============

    /// @notice L-08: emitted when emergency withdrawToVault clears a non-zero
    ///         tracked borrow without repaying the underlying debt on Aave.
    event BorrowForfeited(address indexed vault, address indexed asset, uint256 amount);

    // ============ Modifiers ============

    modifier onlyRegisteredVault() {
        if (!_vaultRegistered[msg.sender]) {
            revert VaultNotRegistered();
        }
        _;
    }

    modifier onlyAdapterOwner() {
        require(msg.sender == adapterOwner, "not adapter owner");
        _;
    }

    // ============ Constructor ============

    /// @notice Deploy the canonical AaveV3Adapter singleton
    /// @param _pool The Aave V3 Pool contract address
    /// @param _rewardsController The Aave V3 Rewards Controller address
    /// @param _vaultFactory The VaultFactory contract address for vault verification
    /// @param _minHealthFactor Initial minimum health factor (recommended: 1.5e18)
    constructor(
        address _pool,
        address _rewardsController,
        address _vaultFactory,
        uint256 _minHealthFactor
    ) {
        if (_pool == address(0)) revert ZeroAddress();
        if (_rewardsController == address(0)) revert ZeroAddress();
        if (_vaultFactory == address(0)) revert ZeroAddress();
        require(_minHealthFactor >= 1e18, "min HF must be >= 1.0");

        pool = IPool(_pool);
        rewardsController = IRewardsController(_rewardsController);
        vaultFactory = _vaultFactory;
        adapterOwner = msg.sender;
        minHealthFactor = _minHealthFactor;
    }

    // ============ Registration ============

    /// @inheritdoc IAaveV3Adapter
    function registerVault(address vault) external override nonReentrant {
        // 1. Verify vault is not zero address
        if (vault == address(0)) revert ZeroAddress();

        // 2. Verify vault was deployed by the VaultFactory
        if (!IVaultFactory(vaultFactory).isDeployedVault(vault)) {
            revert VaultNotDeployedByFactory();
        }

        // 3. Verify caller is the vault owner
        if (msg.sender != IKernelVaultOwner(vault).owner()) {
            revert NotVaultOwner();
        }

        // 4. Verify vault is not already registered
        if (_vaultRegistered[vault]) {
            revert VaultAlreadyRegistered();
        }

        // 5. Store registration
        _vaultRegistered[vault] = true;

        // 6. Emit event
        emit VaultRegistered(vault, msg.sender);
    }

    /// @notice Unregister a vault (L-32). All tracked positions must be zero.
    function unregisterVault(address vault) external nonReentrant {
        if (!_vaultRegistered[vault]) revert VaultNotRegistered();
        if (msg.sender != IKernelVaultOwner(vault).owner()) revert NotVaultOwner();

        address[] memory assets = _suppliedAssets[vault];
        for (uint256 i = 0; i < assets.length; i++) {
            if (
                _vaultSupplied[vault][assets[i]] != 0
                    || _vaultBorrowed[vault][assets[i]] != 0
            ) {
                revert InsufficientVaultPosition(1, 0);
            }
            _assetTracked[vault][assets[i]] = false;
        }
        delete _suppliedAssets[vault];
        _vaultRegistered[vault] = false;
    }

    // ============ Asset Management ============

    /// @inheritdoc IAaveV3Adapter
    function setAllowedAsset(address vault, address asset, bool allowed)
        external
        override
        nonReentrant
    {
        // Only vault owner can configure allowed assets
        if (msg.sender != IKernelVaultOwner(vault).owner()) {
            revert NotVaultOwner();
        }

        // Vault must be registered
        if (!_vaultRegistered[vault]) {
            revert VaultNotRegistered();
        }

        if (asset == address(0)) revert ZeroAddress();

        _allowedAssets[vault][asset] = allowed;
        emit AssetAllowanceUpdated(vault, asset, allowed);
    }

    // ============ Core Functions ============

    /// @inheritdoc IAaveV3Adapter
    function supply(address asset, uint256 amount) external override nonReentrant onlyRegisteredVault {
        if (amount == 0) revert ZeroAmount();
        if (!_allowedAssets[msg.sender][asset]) revert AssetNotAllowed(asset);

        // Pull asset from vault (msg.sender) to adapter
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);

        // Approve Aave Pool to spend the asset
        IERC20(asset).forceApprove(address(pool), amount);

        // Supply to Aave Pool on behalf of this adapter
        pool.supply(asset, amount, address(this), 0);

        // Track supplied asset for emergency withdrawal
        if (!_assetTracked[msg.sender][asset]) {
            _suppliedAssets[msg.sender].push(asset);
            _assetTracked[msg.sender][asset] = true;
        }

        // Credit the calling vault's tracked supply (C-02 isolation)
        _vaultSupplied[msg.sender][asset] += amount;

        emit Supplied(msg.sender, asset, amount);
    }

    /// @inheritdoc IAaveV3Adapter
    function withdraw(address asset, uint256 amount)
        external
        override
        nonReentrant
        onlyRegisteredVault
    {
        if (amount == 0) revert ZeroAmount();
        if (!_allowedAssets[msg.sender][asset]) revert AssetNotAllowed(asset);

        // Enforce per-vault position cap (C-02 fix): cannot withdraw other vaults' funds.
        // If caller passes type(uint256).max, interpret it as "my full tracked balance".
        uint256 tracked = _vaultSupplied[msg.sender][asset];
        uint256 toWithdraw = amount == type(uint256).max ? tracked : amount;
        if (toWithdraw == 0) revert ZeroAmount();
        if (toWithdraw > tracked) {
            revert InsufficientVaultPosition(toWithdraw, tracked);
        }
        uint256 newTracked = tracked - toWithdraw;
        _vaultSupplied[msg.sender][asset] = newTracked;

        // Withdraw from Aave Pool directly to the vault (msg.sender)
        uint256 withdrawn = pool.withdraw(asset, toWithdraw, msg.sender);
        if (withdrawn == 0) revert WithdrawFailed();

        // L-44 fix: when the tracked supply drops to zero AND there is no
        // outstanding borrow for the asset, swap-and-pop the entry from
        // `_suppliedAssets` so the array does not grow monotonically and
        // eventually exceed the per-call gas budget.
        if (newTracked == 0 && _vaultBorrowed[msg.sender][asset] == 0) {
            _removeSuppliedAsset(msg.sender, asset);
        }

        emit Withdrawn(msg.sender, asset, withdrawn);
    }

    /// @notice L-44 helper: swap-and-pop an asset from the supplied list
    function _removeSuppliedAsset(address vault, address asset) internal {
        address[] storage assets = _suppliedAssets[vault];
        uint256 length = assets.length;
        for (uint256 i = 0; i < length; i++) {
            if (assets[i] == asset) {
                assets[i] = assets[length - 1];
                assets.pop();
                _assetTracked[vault][asset] = false;
                return;
            }
        }
    }

    /// @inheritdoc IAaveV3Adapter
    function borrow(address asset, uint256 amount, uint256 rateMode)
        external
        override
        nonReentrant
        onlyRegisteredVault
    {
        if (amount == 0) revert ZeroAmount();
        if (!_allowedAssets[msg.sender][asset]) revert AssetNotAllowed(asset);

        // Credit per-vault borrow BEFORE the external call and pool.borrow call so the
        // per-vault health check operates on the CALLER's own tracked position, not the
        // adapter's aggregate (the C-02 root cause).
        _vaultBorrowed[msg.sender][asset] += amount;

        // C-03: track borrowed-only assets so the health check can enumerate them
        if (!_borrowedAssetTracked[msg.sender][asset]) {
            _borrowedAssets[msg.sender].push(asset);
            _borrowedAssetTracked[msg.sender][asset] = true;
        }

        // Borrow from Aave Pool on behalf of this adapter
        pool.borrow(asset, amount, rateMode, 0, address(this));

        // Transfer borrowed asset to vault
        IERC20(asset).safeTransfer(msg.sender, amount);

        // Per-vault health check — require the calling vault to remain over-collateralized
        // based on its OWN tracked supplies, not the adapter's aggregate.
        _checkVaultHealth(msg.sender);

        // L-28: do NOT add the borrowed asset to `_suppliedAssets`. That list
        // is used by `withdrawToVault` to enumerate the vault's supply
        // positions; the borrowed asset is debt, not supply, and incorrectly
        // tracking it here caused empty withdraw calls at emergency exit.

        emit Borrowed(msg.sender, asset, amount, rateMode);
    }

    /// @inheritdoc IAaveV3Adapter
    function repay(address asset, uint256 amount, uint256 rateMode)
        external
        override
        nonReentrant
        onlyRegisteredVault
    {
        if (amount == 0) revert ZeroAmount();
        if (!_allowedAssets[msg.sender][asset]) revert AssetNotAllowed(asset);

        // Cap repay amount at the caller's tracked borrow to prevent a vault from
        // paying down another vault's debt via the shared account.
        uint256 trackedBorrow = _vaultBorrowed[msg.sender][asset];
        if (trackedBorrow == 0) revert ZeroAmount();
        uint256 toRepay = amount > trackedBorrow ? trackedBorrow : amount;

        // Pull asset from vault to adapter
        IERC20(asset).safeTransferFrom(msg.sender, address(this), toRepay);

        // Approve Aave Pool to spend the asset
        IERC20(asset).forceApprove(address(pool), toRepay);

        // Repay debt on Aave Pool
        pool.repay(asset, toRepay, rateMode, address(this));

        uint256 newBorrow = trackedBorrow - toRepay;
        _vaultBorrowed[msg.sender][asset] = newBorrow;

        // C-03: remove from _borrowedAssets when fully repaid
        if (newBorrow == 0) {
            _removeBorrowedAsset(msg.sender, asset);
        }

        emit Repaid(msg.sender, asset, toRepay, rateMode);
    }

    /// @notice C-03 helper: swap-and-pop the asset from _borrowedAssets
    function _removeBorrowedAsset(address vault, address asset) internal {
        address[] storage list = _borrowedAssets[vault];
        uint256 len = list.length;
        for (uint256 i = 0; i < len; i++) {
            if (list[i] == asset) {
                list[i] = list[len - 1];
                list.pop();
                _borrowedAssetTracked[vault][asset] = false;
                return;
            }
        }
    }

    /// @inheritdoc IAaveV3Adapter
    function claimRewards(address[] calldata assets)
        external
        override
        nonReentrant
        onlyRegisteredVault
    {
        // Claim all rewards to the calling vault
        (, uint256[] memory claimedAmounts) =
            rewardsController.claimAllRewards(assets, msg.sender);

        // Sum total rewards for event
        uint256 totalRewards;
        for (uint256 i = 0; i < claimedAmounts.length; i++) {
            totalRewards += claimedAmounts[i];
        }

        emit RewardsClaimed(msg.sender, assets, totalRewards);
    }

    /// @inheritdoc IAaveV3Adapter
    /// @dev L-08 fix: emergency withdrawToVault now also clears stale
    ///      `_vaultBorrowed` entries so the vault is NOT permanently bricked
    ///      by a ghost debt record after an emergency exit. Outstanding debt
    ///      on Aave is not settled by this function (the adapter cannot know
    ///      how the underlying is to be unwound); if a non-zero borrow is
    ///      cleared we emit `BorrowForfeited` so the off-chain monitor can
    ///      reconcile. Use `repay` before `withdrawToVault` for a clean exit.
    function withdrawToVault() external override nonReentrant onlyRegisteredVault {
        address[] memory assets = _suppliedAssets[msg.sender];

        for (uint256 i = 0; i < assets.length; i++) {
            address asset = assets[i];

            // Only withdraw the calling vault's TRACKED position — this is the core
            // isolation guarantee that prevents cross-vault emergency drains.
            uint256 tracked = _vaultSupplied[msg.sender][asset];
            if (tracked > 0) {
                _vaultSupplied[msg.sender][asset] = 0;

                // Withdraw from the pool to the calling vault. We use the tracked amount
                // rather than type(uint256).max because max would drain other vaults too.
                try pool.withdraw(asset, tracked, msg.sender) returns (uint256) {
                    // Success — asset withdrawn
                } catch {
                    // On failure, restore the tracked balance so the user may retry.
                    _vaultSupplied[msg.sender][asset] = tracked;
                }
            }

            // L-08: clear any lingering `_vaultBorrowed` tracking for this vault so
            // subsequent `_checkVaultHealth` calls do not revert with a stale debt
            // against a zeroed supply (which would brick the vault forever).
            uint256 trackedBorrow = _vaultBorrowed[msg.sender][asset];
            if (trackedBorrow > 0) {
                _vaultBorrowed[msg.sender][asset] = 0;
                emit BorrowForfeited(msg.sender, asset, trackedBorrow);
            }
        }

        // C-03: also clear borrowed-only assets (those never supplied) so the
        // _borrowedAssets array doesn't leak stale debt references.
        address[] memory borrowedOnly = _borrowedAssets[msg.sender];
        for (uint256 i = 0; i < borrowedOnly.length; i++) {
            address asset = borrowedOnly[i];
            uint256 trackedBorrow = _vaultBorrowed[msg.sender][asset];
            if (trackedBorrow > 0) {
                _vaultBorrowed[msg.sender][asset] = 0;
                emit BorrowForfeited(msg.sender, asset, trackedBorrow);
            }
            _borrowedAssetTracked[msg.sender][asset] = false;
        }
        delete _borrowedAssets[msg.sender];

        emit EmergencyWithdrawn(msg.sender);
    }

    // ============ Configuration ============

    /// @inheritdoc IAaveV3Adapter
    function setMinHealthFactor(uint256 newMinHealthFactor) external override onlyAdapterOwner {
        require(newMinHealthFactor >= 1e18, "min HF must be >= 1.0");
        uint256 oldFactor = minHealthFactor;
        minHealthFactor = newMinHealthFactor;
        emit MinHealthFactorUpdated(oldFactor, newMinHealthFactor);
    }

    // ============ View Functions ============

    /// @inheritdoc IAaveV3Adapter
    function isRegistered(address vault) external view override returns (bool) {
        return _vaultRegistered[vault];
    }

    /// @inheritdoc IAaveV3Adapter
    function isAssetAllowed(address vault, address asset) external view override returns (bool) {
        return _allowedAssets[vault][asset];
    }

    /// @inheritdoc IAaveV3Adapter
    function getHealthFactor() external view override returns (uint256) {
        (,,,,, uint256 healthFactor) = pool.getUserAccountData(address(this));
        return healthFactor;
    }

    /// @notice Get the list of supplied assets for a vault
    /// @param vault The vault address
    /// @return The list of asset addresses that have been supplied
    function getSuppliedAssets(address vault) external view returns (address[] memory) {
        return _suppliedAssets[vault];
    }

    // ============ Internal Functions ============

    /// @notice Per-vault health check operating on TRACKED positions only.
    /// @dev C-03 fix: normalise each asset through Aave's own price oracle and
    ///      the asset's decimal scale BEFORE aggregating. Previously the check
    ///      summed raw units 1:1 across heterogeneous assets, which let a vault
    ///      stack cheap 18-decimal collateral to mint expensive 8-decimal debt
    ///      (the H-02 decimal mismatch PoC).
    ///
    ///      Math:
    ///        assetValueBase = rawAmount * price / 10**decimals
    ///      All values are in the Aave oracle's base currency (USD or ETH with
    ///      BASE_CURRENCY_UNIT scale, typically 1e8 for USD). The ratio
    ///      `supplied/borrowed` is dimensionless so the scale cancels.
    function _checkVaultHealth(address vault) internal view {
        address[] memory supplied = _suppliedAssets[vault];
        address[] memory borrowedOnly = _borrowedAssets[vault];
        uint256 supLen = supplied.length;
        uint256 borLen = borrowedOnly.length;
        if (supLen == 0 && borLen == 0) return;

        IPriceOracleGetter oracle = IPriceOracleGetter(
            IPoolAddressesProvider(pool.ADDRESSES_PROVIDER()).getPriceOracle()
        );

        uint256 totalSuppliedBase;
        uint256 totalBorrowedBase;

        // Phase 1: enumerate every asset the vault has SUPPLIED (collateral
        // contribution) and include any borrow of the same asset.
        for (uint256 i = 0; i < supLen; i++) {
            address asset = supplied[i];
            uint256 sAmt = _vaultSupplied[vault][asset];
            uint256 bAmt = _vaultBorrowed[vault][asset];
            if (sAmt == 0 && bAmt == 0) continue;

            uint256 price = oracle.getAssetPrice(asset);
            require(price > 0, "zero oracle price");
            uint256 unit = 10 ** IERC20Decimals(asset).decimals();

            if (sAmt > 0) totalSuppliedBase += (sAmt * price) / unit;
            if (bAmt > 0) totalBorrowedBase += (bAmt * price) / unit;
        }

        // Phase 2: enumerate assets that were BORROWED WITHOUT being supplied.
        // These must still count toward totalBorrowedBase; otherwise a vault
        // could borrow asset X without supplying X and the health check would
        // silently exclude the debt.
        for (uint256 i = 0; i < borLen; i++) {
            address asset = borrowedOnly[i];
            // Skip if already counted in phase 1 (asset appears in both lists)
            if (_assetTracked[vault][asset]) continue;

            uint256 bAmt = _vaultBorrowed[vault][asset];
            if (bAmt == 0) continue;

            uint256 price = oracle.getAssetPrice(asset);
            require(price > 0, "zero oracle price");
            uint256 unit = 10 ** IERC20Decimals(asset).decimals();
            totalBorrowedBase += (bAmt * price) / unit;
        }

        if (totalBorrowedBase == 0) return;

        uint256 nominalHealth = (totalSuppliedBase * 1e18) / totalBorrowedBase;
        if (nominalHealth < minHealthFactor) {
            revert HealthFactorTooLow(nominalHealth, minHealthFactor);
        }
    }

    // ============ Per-Vault Position Views ============

    /// @notice Get the tracked supply balance for a vault in a specific asset
    function vaultSupplied(address vault, address asset) external view returns (uint256) {
        return _vaultSupplied[vault][asset];
    }

    /// @notice Get the tracked borrow balance for a vault in a specific asset
    function vaultBorrowed(address vault, address asset) external view returns (uint256) {
        return _vaultBorrowed[vault][asset];
    }
}
