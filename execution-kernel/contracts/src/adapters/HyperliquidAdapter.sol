// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IHyperliquidAdapter } from "../interfaces/IHyperliquidAdapter.sol";
import { IVaultFactory } from "../interfaces/IVaultFactory.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { TradingSubAccount } from "./TradingSubAccount.sol";

/// @title IKernelVaultOwner
/// @notice Minimal interface for reading the vault owner
interface IKernelVaultOwner {
    function owner() external view returns (address);
}

/// @title HyperliquidAdapter
/// @notice Canonical singleton adapter that routes KernelVault CALL actions to Hyperliquid's
///         HyperCore perpetual futures order system via per-vault TradingSubAccounts.
///
/// @dev Architecture:
///      ┌───────────┐   ┌───────────┐
///      │ Vault A   │   │ Vault B   │    (any KernelVault)
///      └─────┬─────┘   └─────┬─────┘
///            │  CALL          │  CALL
///            ▼                ▼
///      ┌──────────────────────────────────┐
///      │   HyperliquidAdapter (singleton) │
///      │   vaultConfigs mapping:          │
///      │     vault A → SubAccount A       │
///      │     vault B → SubAccount B       │
///      │   Routes by msg.sender           │
///      └──────┬────────────────┬──────────┘
///             │                │
///             ▼                ▼
///      ┌────────────┐   ┌────────────┐
///      │SubAccount A│   │SubAccount B│   (CREATE2, per-vault)
///      │ BTC perps  │   │ ETH perps  │
///      └──────┬─────┘   └──────┬─────┘
///             │                │
///             ▼                ▼
///         CoreWriter (0x3333...3333)
///
///      Key constraints:
///      - CoreWriter does NOT revert on HyperCore-level failures (non-atomic)
///      - Order execution is asynchronous (settles after EVM tx finalizes)
///      - Each sub-account trades under its own HyperCore address (position isolation)
///      - Only registered KernelVaults can invoke order functions
///      - Vault registration is permissioned: only vault owner + factory-deployed vaults
///
///      Selector reference (used by perp-trader zkVM agent):
///        openPosition(bool,uint256,uint256,uint256) => 0x04ba41cb
///        closePosition()                            => 0xc393d0e3
///        withdrawToVault()                          => 0x84f22721
contract HyperliquidAdapter is IHyperliquidAdapter, ReentrancyGuard {
    using SafeERC20 for IERC20;
    // ============ Immutables ============

    /// @notice The native USDC token address on HyperEVM
    address public immutable usdc;

    /// @notice CoreDepositWallet for depositing USDC from HyperEVM to HyperCore
    address public immutable coreDepositWallet;

    /// @notice The VaultFactory used to verify vault provenance
    address public immutable vaultFactory;

    // ============ State ============

    /// @notice Mapping from vault address to its configuration (sub-account + perp asset)
    mapping(address vault => VaultConfig) public vaultConfigs;

    // ============ Modifiers ============

    modifier onlyRegisteredVault() {
        if (vaultConfigs[msg.sender].subAccount == address(0)) {
            revert VaultNotRegistered();
        }
        _;
    }

    // ============ Constructor ============

    /// @notice Deploy the canonical HyperliquidAdapter singleton
    /// @param _usdc The native USDC token address on HyperEVM
    /// @param _coreDepositWallet The CoreDepositWallet address for margin deposits
    /// @param _vaultFactory The VaultFactory contract address for vault verification
    constructor(address _usdc, address _coreDepositWallet, address _vaultFactory) {
        if (_usdc == address(0)) revert ZeroAddress();
        if (_coreDepositWallet == address(0)) revert ZeroAddress();
        if (_vaultFactory == address(0)) revert ZeroAddress();
        usdc = _usdc;
        coreDepositWallet = _coreDepositWallet;
        vaultFactory = _vaultFactory;
    }

    // ============ Registration ============

    /// @inheritdoc IHyperliquidAdapter
    function registerVault(address vault, uint32 perpAsset, uint8 szDecimals)
        external
        override
        nonReentrant
        returns (address subAccount)
    {
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
        if (vaultConfigs[vault].subAccount != address(0)) {
            revert VaultAlreadyRegistered();
        }

        // 5. Validate szDecimals (must be <= 8 to avoid overflow in scaling)
        if (szDecimals > 8) revert InvalidSzDecimals();

        // 6. Deploy TradingSubAccount via CREATE2 (salt = keccak256(vault))
        bytes32 salt = keccak256(abi.encodePacked(vault));
        subAccount = address(
            new TradingSubAccount{salt: salt}(
                address(this), vault, usdc, coreDepositWallet, perpAsset
            )
        );

        // 7. Store config
        vaultConfigs[vault] =
            VaultConfig({subAccount: subAccount, perpAsset: perpAsset, szDecimals: szDecimals});

        // 8. Emit event
        emit VaultRegistered(vault, subAccount, perpAsset);
    }

    // ============ Margin Management ============

    /// @inheritdoc IHyperliquidAdapter
    function depositMargin(uint256 amount) external override nonReentrant {
        if (amount == 0) revert ZeroDeposit();

        VaultConfig memory config = vaultConfigs[msg.sender];
        if (config.subAccount == address(0)) revert VaultNotRegistered();

        // Pull USDC from vault (msg.sender) to sub-account — requires vault to have approved adapter
        IERC20(usdc).safeTransferFrom(msg.sender, config.subAccount, amount);

        // Deposit into HyperCore margin (no order placed)
        TradingSubAccount(payable(config.subAccount)).executeDepositMargin(amount);
    }

    // ============ Core Functions ============

    /// @inheritdoc IHyperliquidAdapter
    function openPosition(bool isBuy, uint256 marginAmount, uint256 orderSize, uint256 limitPrice)
        external
        override
        nonReentrant
        onlyRegisteredVault
    {
        if (marginAmount > type(uint64).max) revert MarginOverflow(marginAmount);
        if (limitPrice > type(uint64).max) revert PriceOverflow(limitPrice);

        VaultConfig memory config = vaultConfigs[msg.sender];

        // Scale orderSize from szDecimals to 1e8 (CoreWriter expects 1e8-scaled sizes)
        // Agent outputs size in szDecimals units (e.g. 72 = 0.00072 BTC with szDecimals=5)
        // CoreWriter needs 1e8 scale (e.g. 72000 = 0.00072 BTC)
        uint256 scaledSize = orderSize * (10 ** (8 - config.szDecimals));
        if (scaledSize > type(uint64).max) revert OrderSizeOverflow(scaledSize);

        // Pull USDC margin from vault directly to sub-account
        IERC20(usdc).safeTransferFrom(msg.sender, config.subAccount, marginAmount);

        // Delegate execution to sub-account (margin for deposit, scaledSize for the order)
        TradingSubAccount(payable(config.subAccount)).executeOpen(
            isBuy, uint64(marginAmount), uint64(scaledSize), uint64(limitPrice)
        );
    }

    /// @inheritdoc IHyperliquidAdapter
    function closePosition() external override nonReentrant onlyRegisteredVault {
        VaultConfig memory config = vaultConfigs[msg.sender];
        TradingSubAccount(payable(config.subAccount)).executeClose();
    }

    /// @inheritdoc IHyperliquidAdapter
    function withdrawToVault() external override nonReentrant onlyRegisteredVault {
        VaultConfig memory config = vaultConfigs[msg.sender];
        TradingSubAccount(payable(config.subAccount)).executeWithdraw(msg.sender);
    }

    // ============ Admin Margin Management ============

    /// @inheritdoc IHyperliquidAdapter
    function depositMarginAdmin(address vault, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroDeposit();

        VaultConfig memory config = vaultConfigs[vault];
        if (config.subAccount == address(0)) revert VaultNotRegistered();
        if (msg.sender != IKernelVaultOwner(vault).owner()) revert NotVaultOwner();

        // Pull USDC from caller (vault owner) to sub-account, then deposit to HyperCore
        IERC20(usdc).safeTransferFrom(msg.sender, config.subAccount, amount);
        TradingSubAccount(payable(config.subAccount)).executeDepositMargin(amount);
    }

    // ============ HYPE Funding (vault owner only) ============

    /// @notice Fund a vault's sub-account with native HYPE and bridge to HyperCore.
    /// @dev CoreWriter actions (orders, usdClassTransfer, spotSend) require HYPE on HyperCore
    ///      for gas. Without it, actions are silently rejected. Call this ONCE after registration,
    ///      then wait ~5s for HyperCore settlement before any trading.
    /// @param vault The vault whose sub-account to fund with HYPE
    function fundSubAccountHype(address vault) external payable nonReentrant {
        VaultConfig memory config = vaultConfigs[vault];
        if (config.subAccount == address(0)) revert VaultNotRegistered();
        if (msg.sender != IKernelVaultOwner(vault).owner()) revert NotVaultOwner();
        if (msg.value == 0) revert ZeroDeposit();

        // Send HYPE to sub-account (it has receive())
        (bool success,) = config.subAccount.call{value: msg.value}("");
        if (!success) revert HypeTransferFailed();

        // Bridge from HyperEVM to HyperCore
        TradingSubAccount(payable(config.subAccount)).bridgeHypeToCore();
    }


    // ============ Admin Position Management (vault owner only) ============

    /// @notice Close the full position for a vault's sub-account. Callable by vault owner.
    /// @dev Used when the bot's atomic close+withdraw reverts (withdraw fails because USDC
    ///      is on HyperCore, not as ERC-20). After calling, use the 3-step recovery flow:
    ///      1. Wait ~5s for HyperCore to settle the close order
    ///      2. transferPerpToSpot → wait ~2s → transferSpotToEvm → wait ~2s
    ///      3. withdrawToVaultAdmin
    /// @param vault The vault whose sub-account position to close
    function closePositionAdmin(address vault) external nonReentrant {
        VaultConfig memory config = vaultConfigs[vault];
        if (config.subAccount == address(0)) revert VaultNotRegistered();
        if (msg.sender != IKernelVaultOwner(vault).owner()) revert NotVaultOwner();
        TradingSubAccount(payable(config.subAccount)).executeClose();
    }

    // ============ Margin Recovery (vault owner only) ============
    //
    // CoreWriter amount scaling (from HLConversions in hyper-evm-lib):
    //   - usdClassTransfer (action 7): "perp" format — 1e6 units (1 USDC = 1_000_000)
    //   - spotSend (action 6):         "wei"  format — 1e8 units (1 USDC = 100_000_000)
    //
    // Both functions below accept USDC in native 1e6 decimals and handle conversion internally.
    //

    /// @notice Transfer USDC from HyperCore perp margin to spot for a vault's sub-account.
    /// @dev Step 1 of 3 for recovering stuck margin. Only callable by vault owner.
    ///      After calling, wait ~5s for HyperCore settlement, then call transferSpotToEvm.
    /// @param vault The vault whose sub-account to recover margin from
    /// @param usdcAmount Amount in USDC native 1e6 decimals (e.g., 10000000 = 10 USDC)
    function transferPerpToSpot(address vault, uint64 usdcAmount) external nonReentrant {
        VaultConfig memory config = vaultConfigs[vault];
        if (config.subAccount == address(0)) revert VaultNotRegistered();
        if (msg.sender != IKernelVaultOwner(vault).owner()) revert NotVaultOwner();
        // usdClassTransfer uses 1e6 "perp" format — same as USDC native decimals
        TradingSubAccount(payable(config.subAccount)).executePerpToSpot(usdcAmount);
    }

    /// @notice Send USDC from HyperCore spot back to HyperEVM for a vault's sub-account.
    /// @dev Step 2 of 3. Must be called after transferPerpToSpot has settled.
    ///      After this settles, call withdrawToVaultAdmin to move USDC to the vault.
    /// @param vault The vault whose sub-account to recover margin from
    /// @param usdcAmount Amount in USDC native 1e6 decimals (e.g., 10000000 = 10 USDC)
    function transferSpotToEvm(address vault, uint64 usdcAmount) external nonReentrant {
        VaultConfig memory config = vaultConfigs[vault];
        if (config.subAccount == address(0)) revert VaultNotRegistered();
        if (msg.sender != IKernelVaultOwner(vault).owner()) revert NotVaultOwner();
        // spotSend uses 1e8 "wei" format — multiply USDC amount by 100
        TradingSubAccount(payable(config.subAccount)).executeSpotToEvm(usdcAmount * 100);
    }

    /// @notice Withdraw ERC-20 USDC from sub-account to vault. Callable by vault owner.
    /// @dev Step 3 of 3. Call after transferSpotToEvm has settled and USDC is on HyperEVM.
    /// @param vault The vault to withdraw to
    function withdrawToVaultAdmin(address vault) external nonReentrant {
        VaultConfig memory config = vaultConfigs[vault];
        if (config.subAccount == address(0)) revert VaultNotRegistered();
        if (msg.sender != IKernelVaultOwner(vault).owner()) revert NotVaultOwner();
        TradingSubAccount(payable(config.subAccount)).executeWithdraw(vault);
    }

    // ============ API Wallet Management (vault owner only) ============

    /// @notice Add an EOA as API wallet for a vault's sub-account on HyperCore.
    /// @dev CoreWriter action 9. After settlement (~5s), the wallet can call
    ///      updateLeverage and other exchange actions via Hyperliquid REST API
    ///      on behalf of the sub-account. Required because CoreWriter has no
    ///      updateLeverage action, and leverage must be set before limit orders work.
    /// @param vault The vault whose sub-account to add the API wallet for
    /// @param wallet The EOA address to authorize
    /// @param name A human-readable name for the wallet
    function addApiWalletAdmin(address vault, address wallet, string calldata name) external nonReentrant {
        VaultConfig memory config = vaultConfigs[vault];
        if (config.subAccount == address(0)) revert VaultNotRegistered();
        if (msg.sender != IKernelVaultOwner(vault).owner()) revert NotVaultOwner();
        TradingSubAccount(payable(config.subAccount)).executeAddApiWallet(wallet, name);
    }

    /// @notice Send a raw CoreWriter action for a vault's sub-account.
    /// @dev Escape hatch for future CoreWriter actions not yet wrapped.
    /// @param vault The vault whose sub-account to send the action from
    /// @param rawData The complete CoreWriter payload (version + actionId + abi.encode(...))
    function rawCoreWriterAdmin(address vault, bytes calldata rawData) external nonReentrant {
        VaultConfig memory config = vaultConfigs[vault];
        if (config.subAccount == address(0)) revert VaultNotRegistered();
        if (msg.sender != IKernelVaultOwner(vault).owner()) revert NotVaultOwner();
        TradingSubAccount(payable(config.subAccount)).executeRawCoreWriter(rawData);
    }

    /// @notice Deposit the sub-account's existing EVM USDC balance to HyperCore.
    /// @dev Use when USDC was sent directly to the sub-account address (not via vault).
    ///      Calls sub.executeDeposit() which transfers USDC to CoreDepositWallet.
    /// @param vault The vault whose sub-account to deposit from
    function depositSubBalanceAdmin(address vault) external nonReentrant {
        VaultConfig memory config = vaultConfigs[vault];
        if (config.subAccount == address(0)) revert VaultNotRegistered();
        if (msg.sender != IKernelVaultOwner(vault).owner()) revert NotVaultOwner();
        uint256 bal = IERC20(usdc).balanceOf(config.subAccount);
        require(bal > 0, "sub has no USDC");
        TradingSubAccount(payable(config.subAccount)).executeDepositMargin(bal);
    }

    // ============ View Functions ============

    /// @inheritdoc IHyperliquidAdapter
    function getSubAccount(address vault) external view override returns (address) {
        return vaultConfigs[vault].subAccount;
    }

    /// @inheritdoc IHyperliquidAdapter
    function isRegistered(address vault) external view override returns (bool) {
        return vaultConfigs[vault].subAccount != address(0);
    }

    /// @inheritdoc IHyperliquidAdapter
    function getVaultConfig(address vault)
        external
        view
        override
        returns (VaultConfig memory)
    {
        return vaultConfigs[vault];
    }

}
