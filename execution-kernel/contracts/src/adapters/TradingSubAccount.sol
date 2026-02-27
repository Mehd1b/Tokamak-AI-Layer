// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

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
    using SafeERC20 for IERC20;

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

    /// @notice CoreWriter action ID for spotSend (HyperCore spot → HyperEVM)
    uint24 private constant ACTION_SPOT_SEND = 6;

    /// @notice CoreWriter action ID for usdClassTransfer (perp ↔ spot)
    uint24 private constant ACTION_USD_CLASS_TRANSFER = 7;

    /// @notice CoreWriter action ID for addApiWallet
    uint24 private constant ACTION_ADD_API_WALLET = 9;

    /// @notice Time-in-force: IOC (immediate-or-cancel) for market-like orders
    uint8 private constant TIF_IOC = 3;

    /// @notice Time-in-force: GTC (good-til-canceled) for limit orders
    uint8 private constant TIF_GTC = 2;

    /// @notice Destination DEX ID for perp margin deposits
    uint32 private constant DEST_DEX_PERP = 0;

    /// @notice HyperCore token index for USDC
    uint64 private constant USDC_TOKEN_INDEX = 0;

    /// @notice System address for USDC bridging (base 0x2000...0000 + token index 0)
    address private constant USDC_SYSTEM_ADDRESS = 0x2000000000000000000000000000000000000000;

    /// @notice HYPE system address for bridging native HYPE from HyperEVM to HyperCore
    address private constant HYPE_SYSTEM_ADDRESS = 0x2222222222222222222222222222222222222222;

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

    /// @notice No native HYPE balance to bridge
    error NoHypeBalance();

    /// @notice HYPE bridge to HyperCore failed
    error HypeBridgeFailed();

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

    // ============ HYPE Funding ============

    /// @notice Accept native HYPE transfers (required for HyperCore CoreWriter gas)
    receive() external payable {}

    /// @notice Bridge all native HYPE held by this contract to HyperCore spot balance
    /// @dev Sends native HYPE to the HYPE system address (0x2222...2222), which credits
    ///      HYPE to this contract's HyperCore spot balance. CoreWriter actions (limit orders,
    ///      usdClassTransfer, spotSend) require HYPE on HyperCore for gas — without it,
    ///      actions are silently rejected.
    function bridgeHypeToCore() external onlyAdapter {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NoHypeBalance();
        (bool success,) = HYPE_SYSTEM_ADDRESS.call{value: balance}("");
        if (!success) revert HypeBridgeFailed();
        emit HypeBridgedToCore(balance);
    }

    /// @notice Emitted when native HYPE is bridged from HyperEVM to HyperCore
    event HypeBridgedToCore(uint256 amount);

    // ============ Execution Functions ============

    /// @notice Deposit USDC into HyperCore perp margin without placing an order.
    /// @dev Used to seed the sub-account with initial margin so the agent sees
    ///      non-zero equity on HyperCore and can begin evaluating trade signals.
    ///      USDC must already be in this sub-account (transferred by the adapter).
    /// @param amount The amount of USDC to deposit
    function executeDepositMargin(uint256 amount) external onlyAdapter {
        // 1. Approve CoreDepositWallet to spend USDC
        IERC20(usdc).forceApprove(coreDepositWallet, amount);

        // 2. Deposit USDC to HyperCore perp margin
        ICoreDepositWallet(coreDepositWallet).deposit(amount, DEST_DEX_PERP);
        emit MarginDeposited(amount);
    }

    /// @notice Open a perpetual position on Hyperliquid
    /// @dev USDC must already be in this sub-account (transferred by the adapter).
    ///      Approves CoreDepositWallet, deposits margin, places IOC order at the agent's
    ///      limit price. HyperCore rejects orders with prices outside the oracle price band
    ///      (~5-10%), so the agent must provide a reasonable price (not MAX_UINT64).
    /// @param isBuy True for long, false for short
    /// @param marginAmount USDC margin to deposit (raw 6-decimal units)
    /// @param orderSize Position size in base asset units (szDecimals-scaled)
    /// @param px Limit price in 1e8 scaled units (agent-computed, must be within HyperCore price band)
    function executeOpen(bool isBuy, uint64 marginAmount, uint64 orderSize, uint64 px) external onlyAdapter {
        uint256 margin = uint256(marginAmount);

        // 1. Approve CoreDepositWallet to spend USDC margin
        IERC20(usdc).forceApprove(coreDepositWallet, margin);

        // 2. Deposit USDC to HyperCore perp margin
        ICoreDepositWallet(coreDepositWallet).deposit(margin, DEST_DEX_PERP);
        emit MarginDeposited(margin);

        // 3. Place IOC order at agent's limit price via CoreWriter
        //    HyperCore enforces price bands around the oracle price — extreme prices
        //    (MAX_UINT64 / MIN_PRICE) are silently rejected. The agent must compute
        //    a reasonable aggressive price (e.g., mark * 1.05 for buys, mark * 0.95 for sells).
        bytes memory encodedAction =
            abi.encode(perpAsset, isBuy, px, orderSize, false, TIF_IOC, uint128(0));

        bytes memory data = _packCoreWriterAction(ACTION_LIMIT_ORDER, encodedAction);
        ICoreWriter(CORE_WRITER).sendRawAction(data);

        emit OrderSubmitted(perpAsset, isBuy, px, orderSize, false, TIF_IOC);
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
            sz = uint64(uint256(-int256(szi)));
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

        IERC20(usdc).safeTransfer(to, balance);

        emit WithdrawnToVault(balance);
    }

    // ============ HyperCore Margin Recovery ============
    //
    // Amount scaling per CoreWriter action (from HLConversions in hyper-evm-lib):
    //   - usdClassTransfer (action 7): "perp" format — 1e6 units (1 USDC = 1000000)
    //   - spotSend (action 6):         "wei"  format — 1e8 units (1 USDC = 100000000)
    //   - Conversion: weiAmount = perpAmount * 100
    //

    /// @notice Transfer USDC from HyperCore perp margin to HyperCore spot.
    /// @dev CoreWriter action 7 (usdClassTransfer). Async — takes effect next L1 block.
    ///      Call this FIRST, then wait ~2s, then call executeSpotToEvm.
    /// @param ntl Amount in 1e6 "perp" units (e.g., 1000000 = 1 USDC, 10000000 = 10 USDC).
    function executePerpToSpot(uint64 ntl) external onlyAdapter {
        bytes memory encodedAction = abi.encode(ntl, false); // toPerp = false
        bytes memory data = _packCoreWriterAction(ACTION_USD_CLASS_TRANSFER, encodedAction);
        ICoreWriter(CORE_WRITER).sendRawAction(data);
        emit PerpToSpotTransfer(ntl);
    }

    /// @notice Send USDC from HyperCore spot back to HyperEVM (this contract's address).
    /// @dev CoreWriter action 6 (spotSend) to the USDC system address.
    ///      Must be called AFTER executePerpToSpot has settled on HyperCore.
    ///      After this settles, USDC appears as ERC-20 balance on this contract.
    /// @param amount Amount in 1e8 "wei" units (e.g., 100000000 = 1 USDC, 1000000000 = 10 USDC).
    function executeSpotToEvm(uint64 amount) external onlyAdapter {
        bytes memory encodedAction = abi.encode(USDC_SYSTEM_ADDRESS, USDC_TOKEN_INDEX, amount);
        bytes memory data = _packCoreWriterAction(ACTION_SPOT_SEND, encodedAction);
        ICoreWriter(CORE_WRITER).sendRawAction(data);
        emit SpotToEvmTransfer(amount);
    }

    // ============ Events (Recovery) ============

    /// @notice Emitted when margin is transferred from perp to spot on HyperCore
    event PerpToSpotTransfer(uint64 amount);

    /// @notice Emitted when USDC is sent from HyperCore spot back to HyperEVM
    event SpotToEvmTransfer(uint64 amount);

    // ============ API Wallet & Raw CoreWriter ============

    /// @notice Register an EOA as an API wallet for this sub-account on HyperCore.
    /// @dev CoreWriter action 9 (addApiWallet). After this settles (~5s), the wallet
    ///      can call updateLeverage and other exchange actions via Hyperliquid REST API
    ///      on behalf of this sub-account. Required because CoreWriter has no updateLeverage action.
    /// @param wallet The EOA address to authorize as API wallet
    /// @param name A human-readable name for the wallet (e.g., "deployer")
    function executeAddApiWallet(address wallet, string calldata name) external onlyAdapter {
        bytes memory encodedAction = abi.encode(wallet, name);
        bytes memory data = _packCoreWriterAction(ACTION_ADD_API_WALLET, encodedAction);
        ICoreWriter(CORE_WRITER).sendRawAction(data);
        emit ApiWalletAdded(wallet, name);
    }

    /// @notice Send an arbitrary pre-encoded CoreWriter action.
    /// @dev Escape hatch for actions not yet wrapped (e.g., future CoreWriter extensions).
    ///      The caller must provide the full payload including version byte and action ID.
    /// @param rawData The complete CoreWriter payload (version + actionId + abi.encode(...))
    function executeRawCoreWriter(bytes calldata rawData) external onlyAdapter {
        ICoreWriter(CORE_WRITER).sendRawAction(rawData);
        emit RawCoreWriterAction(rawData.length);
    }

    /// @notice Emitted when an API wallet is added
    event ApiWalletAdded(address indexed wallet, string name);

    /// @notice Emitted when a raw CoreWriter action is sent
    event RawCoreWriterAction(uint256 dataLength);

    // ============ Internal ============

    /// @notice Pack an action into CoreWriter's expected format
    /// @dev Format: [0x01 version][3-byte action ID big-endian][abi.encode(...params)]
    ///      Matches official hyper-evm-lib: abi.encodePacked(uint8(1), uint24(actionId), abi.encode(...))
    function _packCoreWriterAction(uint24 actionId, bytes memory encodedAction)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodePacked(ENCODING_VERSION, actionId, encodedAction);
    }
}
