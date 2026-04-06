// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAaveV3Adapter
/// @notice Interface for the canonical singleton adapter that routes KernelVault CALL actions
///         to Aave V3 lending pool operations (supply, borrow, repay, withdraw).
/// @dev Function signatures are fixed — the lending-agent zkVM agent emits CALL actions
///      with these exact selectors. Vaults register once, then all lending calls are routed
///      through the singleton adapter which manages Aave positions on behalf of each vault.
///
///      Selector reference (used by lending-agent zkVM agent):
///        supply(address,uint256)                   => 0x47e7ef24
///        withdraw(address,uint256)                 => 0xf3fef3a3
///        borrow(address,uint256,uint256)           => 0x4b8a3529
///        repay(address,uint256,uint256)            => 0x5ceae9c4
///        claimRewards(address[])                   => 0x6fa7abab
///        withdrawToVault()                         => 0x84f22721
interface IAaveV3Adapter {
    // ============ Structs ============

    /// @notice Configuration for a registered vault
    /// @param registered Whether the vault has been registered
    struct VaultConfig {
        bool registered;
    }

    // ============ Events ============

    /// @notice Emitted when a vault is registered
    event VaultRegistered(address indexed vault, address indexed caller);

    /// @notice Emitted when assets are supplied to Aave
    event Supplied(address indexed vault, address indexed asset, uint256 amount);

    /// @notice Emitted when assets are withdrawn from Aave
    event Withdrawn(address indexed vault, address indexed asset, uint256 amount);

    /// @notice Emitted when assets are borrowed from Aave
    event Borrowed(address indexed vault, address indexed asset, uint256 amount, uint256 rateMode);

    /// @notice Emitted when debt is repaid on Aave
    event Repaid(address indexed vault, address indexed asset, uint256 amount, uint256 rateMode);

    /// @notice Emitted when rewards are claimed
    event RewardsClaimed(address indexed vault, address[] assets, uint256 rewardAmount);

    /// @notice Emitted when all positions are emergency-withdrawn to vault
    event EmergencyWithdrawn(address indexed vault);

    /// @notice Emitted when an asset is allowed/disallowed for a vault
    event AssetAllowanceUpdated(address indexed vault, address indexed asset, bool allowed);

    /// @notice Emitted when minimum health factor is updated
    event MinHealthFactorUpdated(uint256 oldFactor, uint256 newFactor);

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

    /// @notice Asset is not allowed for this vault
    error AssetNotAllowed(address asset);

    /// @notice Health factor would drop below minimum after borrow
    error HealthFactorTooLow(uint256 healthFactor, uint256 minHealthFactor);

    /// @notice Aave withdraw returned zero
    error WithdrawFailed();

    // ============ Registration ============

    /// @notice Register a vault for use with this adapter
    /// @dev Only the vault owner can register. Vault must be deployed by the VaultFactory.
    /// @param vault The KernelVault address to register
    function registerVault(address vault) external;

    // ============ Asset Management ============

    /// @notice Allow or disallow an asset for a vault
    /// @dev Only the vault owner can configure allowed assets
    /// @param vault The vault to configure
    /// @param asset The asset address
    /// @param allowed Whether the asset is allowed
    function setAllowedAsset(address vault, address asset, bool allowed) external;

    // ============ Core Functions ============

    /// @notice Supply an asset to Aave V3 Pool
    /// @dev Called by a registered KernelVault via CALL action.
    ///      The vault must have approved the asset to this adapter.
    /// @param asset The ERC20 asset to supply
    /// @param amount The amount to supply
    function supply(address asset, uint256 amount) external;

    /// @notice Withdraw an asset from Aave V3 Pool back to vault
    /// @param asset The ERC20 asset to withdraw
    /// @param amount The amount to withdraw (use type(uint256).max for full balance)
    function withdraw(address asset, uint256 amount) external;

    /// @notice Borrow an asset from Aave V3 Pool
    /// @param asset The ERC20 asset to borrow
    /// @param amount The amount to borrow
    /// @param rateMode The interest rate mode (1 = stable, 2 = variable)
    function borrow(address asset, uint256 amount, uint256 rateMode) external;

    /// @notice Repay borrowed asset to Aave V3 Pool
    /// @param asset The ERC20 asset to repay
    /// @param amount The amount to repay (use type(uint256).max to repay full debt)
    /// @param rateMode The interest rate mode (1 = stable, 2 = variable)
    function repay(address asset, uint256 amount, uint256 rateMode) external;

    /// @notice Claim Aave rewards for supplied/borrowed assets
    /// @param assets The list of aToken/debtToken addresses to claim rewards for
    function claimRewards(address[] calldata assets) external;

    /// @notice Emergency withdraw all positions back to vault
    /// @dev Withdraws all supplied assets. Called by vault via CALL action.
    function withdrawToVault() external;

    // ============ Configuration ============

    /// @notice Set the minimum health factor required after borrows
    /// @dev Only callable by the adapter deployer (owner)
    /// @param newMinHealthFactor The new minimum health factor (1.5e18 = 1.5)
    function setMinHealthFactor(uint256 newMinHealthFactor) external;

    // ============ View Functions ============

    /// @notice Check if a vault is registered
    /// @param vault The vault address
    /// @return True if the vault has been registered
    function isRegistered(address vault) external view returns (bool);

    /// @notice Check if an asset is allowed for a vault
    /// @param vault The vault address
    /// @param asset The asset address
    /// @return True if the asset is allowed
    function isAssetAllowed(address vault, address asset) external view returns (bool);

    /// @notice Get the current health factor for this adapter on Aave
    /// @return The health factor (1e18 scaled)
    function getHealthFactor() external view returns (uint256);
}
