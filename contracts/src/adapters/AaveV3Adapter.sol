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

        // Withdraw from Aave Pool directly to the vault (msg.sender)
        uint256 withdrawn = pool.withdraw(asset, amount, msg.sender);
        if (withdrawn == 0) revert WithdrawFailed();

        emit Withdrawn(msg.sender, asset, withdrawn);
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

        // Borrow from Aave Pool on behalf of this adapter
        pool.borrow(asset, amount, rateMode, 0, address(this));

        // Transfer borrowed asset to vault
        IERC20(asset).safeTransfer(msg.sender, amount);

        // Check health factor after borrow
        _checkHealthFactor();

        // Track the asset for emergency withdrawal
        if (!_assetTracked[msg.sender][asset]) {
            _suppliedAssets[msg.sender].push(asset);
            _assetTracked[msg.sender][asset] = true;
        }

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

        // Pull asset from vault to adapter
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);

        // Approve Aave Pool to spend the asset
        IERC20(asset).forceApprove(address(pool), amount);

        // Repay debt on Aave Pool
        pool.repay(asset, amount, rateMode, address(this));

        emit Repaid(msg.sender, asset, amount, rateMode);
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
    function withdrawToVault() external override nonReentrant onlyRegisteredVault {
        address[] memory assets = _suppliedAssets[msg.sender];

        for (uint256 i = 0; i < assets.length; i++) {
            // Withdraw max available for each tracked asset
            // withdraw with type(uint256).max withdraws the full aToken balance
            try pool.withdraw(assets[i], type(uint256).max, msg.sender) returns (uint256) {
                // Success — asset withdrawn
            } catch {
                // Skip assets with zero balance or other issues
            }
        }

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

    /// @notice Check that the adapter's health factor on Aave is above the minimum
    /// @dev Called after every borrow operation
    function _checkHealthFactor() internal view {
        (,,,,, uint256 healthFactor) = pool.getUserAccountData(address(this));

        // If there is no debt, healthFactor is type(uint256).max — always passes
        if (healthFactor < minHealthFactor) {
            revert HealthFactorTooLow(healthFactor, minHealthFactor);
        }
    }
}
