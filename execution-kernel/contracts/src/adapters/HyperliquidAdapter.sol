// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IHyperliquidAdapter } from "../interfaces/IHyperliquidAdapter.sol";
import { IVaultFactory } from "../interfaces/IVaultFactory.sol";
import { IERC20 } from "../interfaces/IERC20.sol";
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
///        openPosition(bool,uint256,uint256)  => 0xe3255731
///        closePosition()                     => 0xc393d0e3
///        withdrawToVault()                   => 0x84f22721
contract HyperliquidAdapter is IHyperliquidAdapter {
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
    function registerVault(address vault, uint32 perpAsset)
        external
        override
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

        // 5. Deploy TradingSubAccount via CREATE2 (salt = keccak256(vault))
        bytes32 salt = keccak256(abi.encodePacked(vault));
        subAccount = address(
            new TradingSubAccount{salt: salt}(
                address(this), vault, usdc, coreDepositWallet, perpAsset
            )
        );

        // 6. Store config
        vaultConfigs[vault] = VaultConfig({subAccount: subAccount, perpAsset: perpAsset});

        // 7. Emit event
        emit VaultRegistered(vault, subAccount, perpAsset);
    }

    // ============ Margin Management ============

    /// @inheritdoc IHyperliquidAdapter
    function depositMargin(address vault, uint256 amount) external override {
        if (amount == 0) revert ZeroDeposit();

        VaultConfig memory config = vaultConfigs[vault];
        if (config.subAccount == address(0)) revert VaultNotRegistered();

        // Only vault owner can deposit margin
        if (msg.sender != IKernelVaultOwner(vault).owner()) revert NotVaultOwner();

        // Pull USDC from vault to sub-account
        bool success = IERC20(usdc).transferFrom(vault, config.subAccount, amount);
        if (!success) revert USDCTransferFailed();

        // Deposit into HyperCore margin (no order placed)
        TradingSubAccount(config.subAccount).executeDepositMargin(amount);
    }

    // ============ Core Functions ============

    /// @inheritdoc IHyperliquidAdapter
    function openPosition(bool isBuy, uint256 size, uint256 limitPrice)
        external
        override
        onlyRegisteredVault
    {
        if (size > type(uint64).max) revert SizeOverflow(size);
        if (limitPrice > type(uint64).max) revert PriceOverflow(limitPrice);

        VaultConfig memory config = vaultConfigs[msg.sender];

        // Pull USDC from vault directly to sub-account
        bool success = IERC20(usdc).transferFrom(msg.sender, config.subAccount, size);
        if (!success) revert USDCTransferFailed();

        // Delegate execution to sub-account
        TradingSubAccount(config.subAccount).executeOpen(isBuy, uint64(size), uint64(limitPrice));
    }

    /// @inheritdoc IHyperliquidAdapter
    function closePosition() external override onlyRegisteredVault {
        VaultConfig memory config = vaultConfigs[msg.sender];
        TradingSubAccount(config.subAccount).executeClose();
    }

    /// @inheritdoc IHyperliquidAdapter
    function withdrawToVault() external override onlyRegisteredVault {
        VaultConfig memory config = vaultConfigs[msg.sender];
        TradingSubAccount(config.subAccount).executeWithdraw(msg.sender);
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

    /// @inheritdoc IHyperliquidAdapter
    function computeSubAccountAddress(address vault, uint32 perpAsset)
        external
        view
        override
        returns (address)
    {
        bytes32 salt = keccak256(abi.encodePacked(vault));
        bytes32 bytecodeHash = keccak256(
            abi.encodePacked(
                type(TradingSubAccount).creationCode,
                abi.encode(address(this), vault, usdc, coreDepositWallet, perpAsset)
            )
        );
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(bytes1(0xff), address(this), salt, bytecodeHash)
                    )
                )
            )
        );
    }
}
