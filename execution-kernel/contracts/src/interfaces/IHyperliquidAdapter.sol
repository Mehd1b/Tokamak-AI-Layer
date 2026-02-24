// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title IHyperliquidAdapter
/// @notice Interface for the canonical singleton adapter that routes KernelVault CALL actions
///         to Hyperliquid's on-chain perpetual futures order system via per-vault sub-accounts.
/// @dev Function signatures are fixed — the perp-trader zkVM agent emits CALL actions
///      with these exact selectors. Changing signatures requires updating the agent constants.
///      Vaults register once, then all trading calls are routed to per-vault TradingSubAccounts.
///
///      Selector reference:
///        openPosition(bool,uint256,uint256)  => 0xe3255731
///        closePosition()                     => 0xc393d0e3
///        withdrawToVault()                   => 0x84f22721
interface IHyperliquidAdapter {
    // ============ Structs ============

    /// @notice Configuration for a registered vault
    /// @param subAccount The deployed TradingSubAccount address
    /// @param perpAsset The Hyperliquid perp asset index
    struct VaultConfig {
        address subAccount;
        uint32 perpAsset;
    }

    // ============ Events ============

    /// @notice Emitted when USDC is deposited from HyperEVM to HyperCore perp margin
    event MarginDeposited(uint256 amount);

    /// @notice Emitted when a limit order is submitted to CoreWriter
    event OrderSubmitted(
        uint32 indexed asset, bool isBuy, uint64 limitPx, uint64 sz, bool reduceOnly, uint8 tif
    );

    /// @notice Emitted when USDC is withdrawn back to the vault
    event WithdrawnToVault(uint256 amount);

    /// @notice Emitted when a vault is registered and its sub-account is deployed
    event VaultRegistered(address indexed vault, address indexed subAccount, uint32 perpAsset);

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

    /// @notice Size exceeds uint64 range (Hyperliquid uses uint64 for sizes)
    error SizeOverflow(uint256 size);

    /// @notice Price exceeds uint64 range (Hyperliquid uses uint64 for prices)
    error PriceOverflow(uint256 price);

    /// @notice USDC transfer from vault failed
    error USDCTransferFailed();

    /// @notice No position to close (position size is zero)
    error NoPositionToClose();

    /// @notice No USDC balance to withdraw
    error NoBalanceToWithdraw();

    // ============ Registration ============

    /// @notice Register a vault and deploy its TradingSubAccount via CREATE2
    /// @dev Only the vault owner can register. Vault must be deployed by the VaultFactory.
    /// @param vault The KernelVault address to register
    /// @param perpAsset The Hyperliquid perp asset index (BTC=0, ETH=1, etc.)
    /// @return subAccount The deployed TradingSubAccount address
    function registerVault(address vault, uint32 perpAsset) external returns (address subAccount);

    /// @notice Zero deposit amount provided
    error ZeroDeposit();

    // ============ Margin Management ============

    /// @notice Deposit USDC from the calling vault into its sub-account's HyperCore perp margin.
    /// @dev Callable only by a registered vault (via CALL action in the ZK-verified execute path).
    ///      Pulls USDC from msg.sender (the vault) and deposits to HyperCore via the sub-account.
    /// @param amount The amount of USDC to deposit
    function depositMargin(uint256 amount) external;

    // ============ Core Functions (selectors preserved) ============

    /// @notice Open a perpetual position on Hyperliquid
    /// @dev Called by a registered KernelVault via CALL action.
    ///      The vault must have approved USDC to this adapter.
    ///      Routes to the vault's TradingSubAccount.
    /// @param isBuy True for long, false for short
    /// @param size Position size in USDC margin (will be cast to uint64 for Hyperliquid)
    /// @param limitPrice Limit price in 1e8 scaled units (will be cast to uint64)
    function openPosition(bool isBuy, uint256 size, uint256 limitPrice) external;

    /// @notice Close the full position for the calling vault's perpetual asset
    /// @dev Routes to the vault's TradingSubAccount which reads position via precompile.
    function closePosition() external;

    /// @notice Withdraw all USDC from the vault's sub-account back to the vault
    /// @dev Called after position is closed and funds have returned from HyperCore.
    function withdrawToVault() external;

    // ============ View Functions ============

    /// @notice Get the sub-account address for a registered vault
    /// @param vault The vault address
    /// @return The TradingSubAccount address (address(0) if not registered)
    function getSubAccount(address vault) external view returns (address);

    /// @notice Check if a vault is registered
    /// @param vault The vault address
    /// @return True if the vault has been registered
    function isRegistered(address vault) external view returns (bool);

    /// @notice Get the full config for a registered vault
    /// @param vault The vault address
    /// @return The VaultConfig struct
    function getVaultConfig(address vault) external view returns (VaultConfig memory);

    /// @notice Compute the deterministic sub-account address for a vault before registration
    /// @param vault The vault address
    /// @param perpAsset The perp asset index
    /// @return The computed TradingSubAccount address
    function computeSubAccountAddress(address vault, uint32 perpAsset)
        external
        view
        returns (address);
}
