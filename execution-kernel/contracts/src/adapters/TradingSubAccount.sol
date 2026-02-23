// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20 } from "../interfaces/IERC20.sol";

/// @title ICoreWriter
/// @notice Minimal interface for Hyperliquid's CoreWriter system contract
interface ICoreWriter {
    function sendRawAction(bytes calldata data) external;
}

/// @title ICoreDepositWallet
/// @notice Minimal interface for Hyperliquid's CoreDepositWallet
interface ICoreDepositWallet {
    function deposit(uint256 amount, uint32 destinationDex) external;
}

/// @title TradingSubAccount
/// @notice Per-vault HyperCore executor deployed via CREATE2.
///         Each vault gets its own sub-account so that Hyperliquid positions
///         are isolated per-vault (HyperCore positions are per-address).
///
/// @dev Only the canonical HyperliquidAdapter can call execution functions.
///      The sub-account holds the HyperCore identity for its vault's positions.
contract TradingSubAccount {
    // ============ Hyperliquid System Addresses ============

    /// @notice CoreWriter system contract for submitting actions to HyperCore
    address public constant CORE_WRITER = 0x3333333333333333333333333333333333333333;

    /// @notice Precompile for reading perp positions from HyperCore
    address public constant PERP_POSITION_PRECOMPILE =
        0x0000000000000000000000000000000000000800;

    /// @notice CoreWriter encoding version
    uint8 private constant ENCODING_VERSION = 0x01;

    /// @notice CoreWriter action ID for limit orders
    uint24 private constant ACTION_LIMIT_ORDER = 1;

    /// @notice Time-in-force: IOC (immediate-or-cancel) for market-like orders
    uint8 private constant TIF_IOC = 3;

    /// @notice Time-in-force: GTC (good-til-canceled) for limit orders
    uint8 private constant TIF_GTC = 2;

    /// @notice Destination DEX ID for perp margin deposits
    uint32 private constant DEST_DEX_PERP = 0;

    /// @notice Maximum uint64 value, used as extreme buy price for closing shorts
    uint64 private constant MAX_PRICE = type(uint64).max;

    /// @notice Minimum price (1), used as extreme sell price for closing longs
    uint64 private constant MIN_PRICE = 1;

    // ============ Immutables ============

    /// @notice The canonical HyperliquidAdapter that controls this sub-account
    address public immutable adapter;

    /// @notice The vault this sub-account belongs to
    address public immutable vault;

    /// @notice The native USDC token address on HyperEVM
    address public immutable usdc;

    /// @notice CoreDepositWallet for depositing USDC from HyperEVM to HyperCore
    address public immutable coreDepositWallet;

    /// @notice The Hyperliquid perp asset index this sub-account trades
    uint32 public immutable perpAsset;

    // ============ Errors ============

    /// @notice Caller is not the canonical adapter
    error OnlyAdapter();

    /// @notice No position to close (position size is zero)
    error NoPositionToClose();

    /// @notice No USDC balance to withdraw
    error NoBalanceToWithdraw();

    /// @notice USDC transfer failed
    error USDCTransferFailed();

    // ============ Events ============

    /// @notice Emitted when USDC is deposited from HyperEVM to HyperCore perp margin
    event MarginDeposited(uint256 amount);

    /// @notice Emitted when a limit order is submitted to CoreWriter
    event OrderSubmitted(
        uint32 indexed asset, bool isBuy, uint64 limitPx, uint64 sz, bool reduceOnly, uint8 tif
    );

    /// @notice Emitted when USDC is withdrawn back to the vault
    event WithdrawnToVault(uint256 amount);

    // ============ Modifiers ============

    modifier onlyAdapter() {
        if (msg.sender != adapter) revert OnlyAdapter();
        _;
    }

    // ============ Constructor ============

    /// @notice Deploy a new TradingSubAccount bound to a specific adapter, vault, and perp asset
    /// @param _adapter The canonical HyperliquidAdapter
    /// @param _vault The KernelVault this sub-account serves
    /// @param _usdc The native USDC token address
    /// @param _coreDepositWallet The CoreDepositWallet address for margin deposits
    /// @param _perpAsset The Hyperliquid perp asset index (BTC=0, ETH=1, etc.)
    constructor(
        address _adapter,
        address _vault,
        address _usdc,
        address _coreDepositWallet,
        uint32 _perpAsset
    ) {
        adapter = _adapter;
        vault = _vault;
        usdc = _usdc;
        coreDepositWallet = _coreDepositWallet;
        perpAsset = _perpAsset;
    }

    // ============ Execution Functions ============

    /// @notice Deposit USDC into HyperCore perp margin without placing an order.
    /// @dev Used to seed the sub-account with initial margin so the agent sees
    ///      non-zero equity on HyperCore and can begin evaluating trade signals.
    ///      USDC must already be in this sub-account (transferred by the adapter).
    /// @param amount The amount of USDC to deposit
    function executeDepositMargin(uint256 amount) external onlyAdapter {
        // 1. Approve CoreDepositWallet to spend USDC
        IERC20(usdc).approve(coreDepositWallet, amount);

        // 2. Deposit USDC to HyperCore perp margin
        ICoreDepositWallet(coreDepositWallet).deposit(amount, DEST_DEX_PERP);
        emit MarginDeposited(amount);
    }

    /// @notice Open a perpetual position on Hyperliquid
    /// @dev USDC must already be in this sub-account (transferred by the adapter).
    ///      Approves CoreDepositWallet, deposits margin, places GTC limit order.
    /// @param isBuy True for long, false for short
    /// @param sz Position size (uint64)
    /// @param px Limit price in 1e8 scaled units (uint64)
    function executeOpen(bool isBuy, uint64 sz, uint64 px) external onlyAdapter {
        uint256 size = uint256(sz);

        // 1. Approve CoreDepositWallet to spend USDC
        IERC20(usdc).approve(coreDepositWallet, size);

        // 2. Deposit USDC to HyperCore perp margin
        ICoreDepositWallet(coreDepositWallet).deposit(size, DEST_DEX_PERP);
        emit MarginDeposited(size);

        // 3. Place limit order via CoreWriter
        bytes memory encodedAction =
            abi.encode(perpAsset, isBuy, px, sz, false, TIF_GTC, uint128(0));

        bytes memory data = _packCoreWriterAction(ACTION_LIMIT_ORDER, encodedAction);
        ICoreWriter(CORE_WRITER).sendRawAction(data);

        emit OrderSubmitted(perpAsset, isBuy, px, sz, false, TIF_GTC);
    }

    /// @notice Close the full position on this sub-account's perpetual asset
    /// @dev Reads position via precompile, places reduce-only IOC order at extreme price.
    function executeClose() external onlyAdapter {
        // 1. Read current position via precompile
        (bool success, bytes memory result) = PERP_POSITION_PRECOMPILE.staticcall(
            abi.encode(address(this), uint16(perpAsset))
        );

        if (!success) revert NoPositionToClose();

        // Decode position: struct Position { int64 szi; uint32 leverage; uint64 entryNtl; }
        (int64 szi,,) = abi.decode(result, (int64, uint32, uint64));

        if (szi == 0) revert NoPositionToClose();

        // 2. Determine close direction and size
        bool isBuy;
        uint64 sz;
        uint64 px;

        if (szi > 0) {
            // Long position -> sell to close
            isBuy = false;
            sz = uint64(szi);
            px = MIN_PRICE;
        } else {
            // Short position -> buy to close
            isBuy = true;
            sz = uint64(-szi);
            px = MAX_PRICE;
        }

        // 3. Place reduce-only IOC order via CoreWriter
        bytes memory encodedAction =
            abi.encode(perpAsset, isBuy, px, sz, true, TIF_IOC, uint128(0));

        bytes memory data = _packCoreWriterAction(ACTION_LIMIT_ORDER, encodedAction);
        ICoreWriter(CORE_WRITER).sendRawAction(data);

        emit OrderSubmitted(perpAsset, isBuy, px, sz, true, TIF_IOC);
    }

    /// @notice Withdraw all USDC from this sub-account to a recipient (the vault)
    /// @param to The address to send USDC to
    function executeWithdraw(address to) external onlyAdapter {
        uint256 balance = IERC20(usdc).balanceOf(address(this));
        if (balance == 0) revert NoBalanceToWithdraw();

        bool success = IERC20(usdc).transfer(to, balance);
        if (!success) revert USDCTransferFailed();

        emit WithdrawnToVault(balance);
    }

    // ============ View Functions ============

    /// @notice Read the current position from HyperCore precompile
    /// @return szi Position size (positive=long, negative=short)
    /// @return leverage Position leverage
    /// @return entryNtl Entry notional
    function getPosition() external view returns (int64 szi, uint32 leverage, uint64 entryNtl) {
        (bool success, bytes memory result) = PERP_POSITION_PRECOMPILE.staticcall(
            abi.encode(address(this), uint16(perpAsset))
        );

        if (success && result.length >= 96) {
            (szi, leverage, entryNtl) = abi.decode(result, (int64, uint32, uint64));
        }
    }

    /// @notice Get the USDC balance held by this sub-account
    /// @return The USDC balance
    function getBalance() external view returns (uint256) {
        return IERC20(usdc).balanceOf(address(this));
    }

    // ============ Internal ============

    /// @notice Pack an action into CoreWriter's expected format
    /// @dev Format: [0x01 version][3-byte action ID big-endian][abi.encode(...params)]
    /// @param actionId The CoreWriter action ID (e.g., 1 for limit order)
    /// @param encodedAction ABI-encoded action parameters
    /// @return data The packed bytes ready for sendRawAction
    function _packCoreWriterAction(uint24 actionId, bytes memory encodedAction)
        internal
        pure
        returns (bytes memory data)
    {
        data = new bytes(4 + encodedAction.length);

        // Byte 0: encoding version
        data[0] = bytes1(ENCODING_VERSION);

        // Bytes 1-3: action ID (big-endian uint24)
        data[1] = bytes1(uint8(actionId >> 16));
        data[2] = bytes1(uint8(actionId >> 8));
        data[3] = bytes1(uint8(actionId));

        // Bytes 4+: ABI-encoded action parameters
        for (uint256 i = 0; i < encodedAction.length; i++) {
            data[4 + i] = encodedAction[i];
        }
    }
}
