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
///        openPosition(bool,uint256,uint256,uint256) => 0x04ba41cb
///        closePosition()                            => 0xc393d0e3
///        withdrawToVault()                          => 0x84f22721
interface IHyperliquidAdapter {
    // ============ Structs ============

    /// @notice Configuration for a registered vault
    /// @param subAccount The deployed TradingSubAccount address
    /// @param perpAsset The Hyperliquid perp asset index
    /// @param szDecimals Hyperliquid szDecimals for the asset (BTC=5, ETH=4, SOL=2)
    struct VaultConfig {
        address subAccount;
        uint32 perpAsset;
        uint8 szDecimals;
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

    /// @notice Margin amount exceeds uint64 range
    error MarginOverflow(uint256 marginAmount);

    /// @notice Order size exceeds uint64 range (Hyperliquid uses uint64 for sizes)
    error OrderSizeOverflow(uint256 orderSize);

    /// @notice Price exceeds uint64 range (Hyperliquid uses uint64 for prices)
    error PriceOverflow(uint256 price);

    /// @notice szDecimals exceeds maximum (8)
    error InvalidSzDecimals();

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
    /// @param szDecimals Hyperliquid szDecimals for the asset (BTC=5, ETH=4, SOL=2)
    /// @return subAccount The deployed TradingSubAccount address
    function registerVault(address vault, uint32 perpAsset, uint8 szDecimals)
        external
        returns (address subAccount);

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
    /// @param marginAmount USDC margin to deposit (raw 6-decimal units, cast to uint64)
    /// @param orderSize Position size in base asset units (szDecimals-scaled, cast to uint64)
    /// @param limitPrice Limit price in 1e8 scaled units (will be cast to uint64)
    function openPosition(bool isBuy, uint256 marginAmount, uint256 orderSize, uint256 limitPrice) external;

    /// @notice Close the full position for the calling vault's perpetual asset
    /// @dev Routes to the vault's TradingSubAccount which reads position via precompile.
    function closePosition() external;

    /// @notice Withdraw all USDC from the vault's sub-account back to the vault
    /// @dev Called after position is closed and funds have returned from HyperCore.
    function withdrawToVault() external;

    // ============ Admin Margin Management ============

    /// @notice Deposit USDC from the vault owner's wallet to a vault's sub-account HyperCore margin.
    /// @dev Used to pre-fund margin BEFORE bot execution. CoreWriter deposits are async —
    ///      margin deposited in the same tx as an order hasn't settled yet, causing silent
    ///      rejection. Pre-depositing in a separate tx ensures margin is available when the
    ///      bot's limit order is processed.
    ///
    ///      Workflow:
    ///      1. Vault owner calls depositMarginAdmin() (this function)
    ///      2. Wait ~5s for HyperCore settlement
    ///      3. Run bot — openPosition() places order using pre-deposited margin
    ///
    /// @param vault The vault whose sub-account to fund
    /// @param amount The amount of USDC to deposit (EVM 6-decimal units)
    function depositMarginAdmin(address vault, uint256 amount) external;

    // ============ HYPE Funding ============

    /// @notice Fund a vault's sub-account with native HYPE and bridge to HyperCore.
    /// @dev CoreWriter actions require HYPE on HyperCore for gas. Call once after registration.
    /// @param vault The vault whose sub-account to fund with HYPE
    function fundSubAccountHype(address vault) external payable;

    /// @notice Native HYPE transfer to sub-account failed
    error HypeTransferFailed();

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

}
