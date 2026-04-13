// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IVaultFactory } from "../interfaces/IVaultFactory.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title IKernelVaultOwner
/// @notice Minimal interface for reading the vault owner
interface IKernelVaultOwner {
    function owner() external view returns (address);
}

/// @title ISwapRouter
/// @notice Simplified Uniswap V4 swap router interface
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

/// @title INonfungiblePositionManager
/// @notice Simplified Uniswap V4 position manager interface
interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    struct DecreaseLiquidityParams {
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);

    function decreaseLiquidity(DecreaseLiquidityParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1);

    function collect(CollectParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1);

    /// @notice Returns the position data for a given tokenId
    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        );

    function transferFrom(address from, address to, uint256 tokenId) external;
}

/// @title UniswapV4Adapter
/// @notice Canonical singleton adapter that routes KernelVault CALL actions to Uniswap V4's
///         swap router and position manager for token swaps and concentrated liquidity management.
///
/// @dev Architecture:
///      ┌───────────┐   ┌───────────┐
///      │ Vault A   │   │ Vault B   │    (any KernelVault)
///      └─────┬─────┘   └─────┬─────┘
///            │  CALL          │  CALL
///            ▼                ▼
///      ┌──────────────────────────────────────┐
///      │   UniswapV4Adapter (singleton)       │
///      │   vaultConfigs mapping:              │
///      │     vault A → {slippage, positions}  │
///      │     vault B → {slippage, positions}  │
///      │   Routes by msg.sender               │
///      └──────┬────────────────┬──────────────┘
///             │                │
///             ▼                ▼
///      ┌────────────┐   ┌──────────────────────┐
///      │ SwapRouter │   │ PositionManager (NFT) │
///      └────────────┘   └──────────────────────┘
///
///      Key constraints:
///      - Only registered KernelVaults can invoke swap/liquidity functions
///      - Vault registration is permissioned: only vault owner + factory-deployed vaults
///      - Slippage protection on all swaps (configurable per vault, default 1%)
///      - Maximum 10 active positions per vault to bound gas costs
///      - Positions are held by the adapter on behalf of the vault (NFT ownership)
///
///      Selector reference (used by swap-agent zkVM agent):
///        swap(address,address,uint256,uint256)                              => computed
///        addLiquidity(address,address,uint24,int24,int24,uint256,uint256,uint256) => computed
///        removeLiquidity(uint256,uint128,uint256,uint256)                   => computed
///        collectFees(uint256)                                               => computed
///        withdrawToVault()                                                  => 0x84f22721
contract UniswapV4Adapter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    /// @notice Default slippage tolerance in basis points (1% = 100 bps)
    uint256 public constant DEFAULT_SLIPPAGE_BPS = 100;

    /// @notice Maximum number of active positions per vault
    uint256 public constant MAX_POSITIONS_PER_VAULT = 10;

    /// @notice Basis points denominator
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // ============ Immutables ============

    /// @notice The Uniswap V4 swap router address
    address public immutable swapRouter;

    /// @notice The Uniswap V4 nonfungible position manager address
    address public immutable positionManager;

    /// @notice The VaultFactory used to verify vault provenance
    address public immutable vaultFactory;

    // ============ Structs ============

    /// @notice Configuration for a registered vault
    /// @param registered Whether the vault has been registered
    /// @param slippageBps Slippage tolerance in basis points
    /// @param defaultFee Default pool fee tier for swaps (e.g., 3000 = 0.3%)
    struct VaultConfig {
        bool registered;
        uint256 slippageBps;
        uint24 defaultFee;
    }

    // ============ State ============

    /// @notice Mapping from vault address to its configuration
    mapping(address vault => VaultConfig) public vaultConfigs;

    /// @notice Mapping from vault address to its active position IDs
    mapping(address vault => uint256[]) internal _vaultPositions;

    /// @notice Mapping from position ID to owning vault (for reverse lookup)
    mapping(uint256 positionId => address vault) public positionOwner;

    // ============ Events ============

    /// @notice Emitted when a vault is registered
    event VaultRegistered(address indexed vault);

    /// @notice Emitted when a swap is executed
    event SwapExecuted(
        address indexed vault,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    /// @notice Emitted when liquidity is added
    event LiquidityAdded(
        address indexed vault,
        uint256 indexed positionId,
        uint128 liquidity,
        uint256 amount0,
        uint256 amount1
    );

    /// @notice Emitted when liquidity is removed
    event LiquidityRemoved(
        address indexed vault,
        uint256 indexed positionId,
        uint128 liquidity,
        uint256 amount0,
        uint256 amount1
    );

    /// @notice Emitted when fees are collected
    event FeesCollected(
        address indexed vault, uint256 indexed positionId, uint256 amount0, uint256 amount1
    );

    /// @notice Emitted when slippage is updated
    event SlippageUpdated(address indexed vault, uint256 newSlippageBps);

    /// @notice L-54: emitted when the default swap fee tier is updated
    event DefaultFeeUpdated(address indexed vault, uint24 newFee);

    /// @notice Emitted when all positions are withdrawn to vault
    event WithdrawnToVault(address indexed vault);

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

    /// @notice Slippage too high — output below minimum
    error SlippageTooHigh(uint256 amountOut, uint256 minAmountOut);

    /// @notice Maximum position count reached for this vault
    error MaxPositionsReached();

    /// @notice Position not owned by the calling vault
    error PositionNotOwnedByVault(uint256 positionId);

    /// @notice Slippage BPS exceeds maximum (10000)
    error InvalidSlippageBps(uint256 bps);

    /// @notice No positions to withdraw
    error NoPositionsToWithdraw();

    // ============ Modifiers ============

    modifier onlyRegisteredVault() {
        if (!vaultConfigs[msg.sender].registered) {
            revert VaultNotRegistered();
        }
        _;
    }

    // ============ Constructor ============

    /// @notice Deploy the canonical UniswapV4Adapter singleton
    /// @param _swapRouter The Uniswap V4 swap router address
    /// @param _positionManager The Uniswap V4 nonfungible position manager address
    /// @param _vaultFactory The VaultFactory contract address for vault verification
    constructor(address _swapRouter, address _positionManager, address _vaultFactory) {
        if (_swapRouter == address(0)) revert ZeroAddress();
        if (_positionManager == address(0)) revert ZeroAddress();
        if (_vaultFactory == address(0)) revert ZeroAddress();
        swapRouter = _swapRouter;
        positionManager = _positionManager;
        vaultFactory = _vaultFactory;
    }

    // ============ Registration ============

    /// @notice Register a vault for Uniswap V4 trading
    /// @dev Only the vault owner can register. Vault must be deployed by the VaultFactory.
    /// @param vault The KernelVault address to register
    function registerVault(address vault) external nonReentrant {
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
        if (vaultConfigs[vault].registered) {
            revert VaultAlreadyRegistered();
        }

        // 5. Store config with defaults
        vaultConfigs[vault] = VaultConfig({
            registered: true,
            slippageBps: DEFAULT_SLIPPAGE_BPS,
            defaultFee: 3000 // 0.3% default fee tier
        });

        // 6. Emit event
        emit VaultRegistered(vault);
    }

    // ============ Configuration ============

    /// @notice Update slippage tolerance for a vault
    /// @dev Only callable by the vault owner
    /// @param vault The vault to configure
    /// @param slippageBps New slippage in basis points (max 10000)
    function setSlippage(address vault, uint256 slippageBps) external nonReentrant {
        if (!vaultConfigs[vault].registered) revert VaultNotRegistered();
        if (msg.sender != IKernelVaultOwner(vault).owner()) revert NotVaultOwner();
        if (slippageBps > BPS_DENOMINATOR) revert InvalidSlippageBps(slippageBps);

        vaultConfigs[vault].slippageBps = slippageBps;
        emit SlippageUpdated(vault, slippageBps);
    }

    /// @notice Update default fee tier for a vault
    /// @dev Only callable by the vault owner
    /// @param vault The vault to configure
    /// @param fee New default fee tier (e.g., 500, 3000, 10000)
    /// @dev Reject zero-fee (would silently change routing to an
    ///      unintended tier) and emit a dedicated event so admin changes are
    ///      observable off-chain.
    function setDefaultFee(address vault, uint24 fee) external nonReentrant {
        if (!vaultConfigs[vault].registered) revert VaultNotRegistered();
        if (msg.sender != IKernelVaultOwner(vault).owner()) revert NotVaultOwner();
        require(fee > 0, "zero fee");

        vaultConfigs[vault].defaultFee = fee;
        emit DefaultFeeUpdated(vault, fee);
    }

    // ============ Core Functions ============

    /// @notice Execute a token swap via Uniswap V4
    /// @dev Called by a registered KernelVault via CALL action.
    ///      Pulls tokenIn from the vault, swaps via router, sends tokenOut to vault.
    /// @param tokenIn The input token address
    /// @param tokenOut The output token address
    /// @param amountIn The amount of tokenIn to swap
    /// @param minAmountOut The minimum acceptable amount of tokenOut (slippage protection)
    /// @return amountOut The actual amount of tokenOut received
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut)
        external
        nonReentrant
        onlyRegisteredVault
        returns (uint256 amountOut)
    {
        if (amountIn == 0) revert ZeroAmount();
        // L-15: minAmountOut must be non-zero — callers supplying 0 disable
        // slippage protection and open a sandwich vector.
        if (minAmountOut == 0) revert SlippageTooHigh(0, 1);

        VaultConfig memory config = vaultConfigs[msg.sender];

        // Pull tokenIn from vault to adapter
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // Approve router to spend tokenIn
        IERC20(tokenIn).forceApprove(swapRouter, amountIn);

        // Execute swap
        amountOut = ISwapRouter(swapRouter).exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: config.defaultFee,
                recipient: msg.sender, // Send output directly to vault
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0 // No price limit — rely on minAmountOut
            })
        );

        // Verify slippage
        if (amountOut < minAmountOut) {
            revert SlippageTooHigh(amountOut, minAmountOut);
        }

        emit SwapExecuted(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
    }

    /// @notice Add concentrated liquidity to a Uniswap V4 pool
    /// @dev Called by a registered KernelVault. Pulls both tokens, mints position NFT.
    ///      The position NFT is held by this adapter; the positionId is tracked per vault.
    /// @param token0 The first token of the pair (must be sorted: token0 < token1)
    /// @param token1 The second token of the pair
    /// @param fee The pool fee tier
    /// @param tickLower The lower tick of the position range
    /// @param tickUpper The upper tick of the position range
    /// @param amount0 The desired amount of token0
    /// @param amount1 The desired amount of token1
    /// @param minLiquidity The minimum acceptable liquidity minted
    /// @return positionId The NFT token ID representing the position
    /// @return liquidity The amount of liquidity minted
    function addLiquidity(
        address token0,
        address token1,
        uint24 fee,
        int24 tickLower,
        int24 tickUpper,
        uint256 amount0,
        uint256 amount1,
        uint256 minLiquidity
    )
        external
        nonReentrant
        onlyRegisteredVault
        returns (uint256 positionId, uint128 liquidity)
    {
        // Check position limit
        if (_vaultPositions[msg.sender].length >= MAX_POSITIONS_PER_VAULT) {
            revert MaxPositionsReached();
        }

        // Pull tokens from vault
        if (amount0 > 0) {
            IERC20(token0).safeTransferFrom(msg.sender, address(this), amount0);
            IERC20(token0).forceApprove(positionManager, amount0);
        }
        if (amount1 > 0) {
            IERC20(token1).safeTransferFrom(msg.sender, address(this), amount1);
            IERC20(token1).forceApprove(positionManager, amount1);
        }

        // Mint position
        uint256 actualAmount0;
        uint256 actualAmount1;
        (positionId, liquidity, actualAmount0, actualAmount1) =
            _mintPosition(token0, token1, fee, tickLower, tickUpper, amount0, amount1);

        // Verify minimum liquidity (top-level caller slippage guard)
        require(liquidity >= minLiquidity, "Insufficient liquidity minted");

        // Track position
        _vaultPositions[msg.sender].push(positionId);
        positionOwner[positionId] = msg.sender;

        // Refund unused tokens to vault
        if (actualAmount0 < amount0) {
            IERC20(token0).safeTransfer(msg.sender, amount0 - actualAmount0);
        }
        if (actualAmount1 < amount1) {
            IERC20(token1).safeTransfer(msg.sender, amount1 - actualAmount1);
        }

        emit LiquidityAdded(msg.sender, positionId, liquidity, actualAmount0, actualAmount1);
    }

    /// @notice Remove liquidity from a position
    /// @dev Called by the vault that owns the position. Collected tokens are sent to the vault.
    /// @param positionId The NFT token ID of the position
    /// @param liquidity The amount of liquidity to remove
    /// @param minAmount0 Minimum amount of token0 to receive
    /// @param minAmount1 Minimum amount of token1 to receive
    /// @return amount0 The amount of token0 received
    /// @return amount1 The amount of token1 received
    function removeLiquidity(
        uint256 positionId,
        uint128 liquidity,
        uint256 minAmount0,
        uint256 minAmount1
    )
        external
        nonReentrant
        onlyRegisteredVault
        returns (uint256 amount0, uint256 amount1)
    {
        // Verify position ownership
        if (positionOwner[positionId] != msg.sender) {
            revert PositionNotOwnedByVault(positionId);
        }

        // Decrease liquidity
        (amount0, amount1) = INonfungiblePositionManager(positionManager).decreaseLiquidity(
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: positionId,
                liquidity: liquidity,
                amount0Min: minAmount0,
                amount1Min: minAmount1,
                deadline: block.timestamp
            })
        );

        // Collect the tokens (decreaseLiquidity doesn't transfer, collect does)
        INonfungiblePositionManager(positionManager).collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: positionId,
                recipient: msg.sender, // Send to vault
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        // Check if position is fully closed and remove from tracking
        (,,,,,,, uint128 remainingLiquidity,,,,) =
            INonfungiblePositionManager(positionManager).positions(positionId);

        if (remainingLiquidity == 0) {
            _removePositionFromVault(msg.sender, positionId);
        }

        emit LiquidityRemoved(msg.sender, positionId, liquidity, amount0, amount1);
    }

    /// @notice Collect accrued fees from a position
    /// @dev Called by the vault that owns the position. Fees are sent to the vault.
    /// @param positionId The NFT token ID of the position
    /// @return amount0 The amount of token0 fees collected
    /// @return amount1 The amount of token1 fees collected
    function collectFees(uint256 positionId)
        external
        nonReentrant
        onlyRegisteredVault
        returns (uint256 amount0, uint256 amount1)
    {
        // Verify position ownership
        if (positionOwner[positionId] != msg.sender) {
            revert PositionNotOwnedByVault(positionId);
        }

        // Collect fees
        (amount0, amount1) = INonfungiblePositionManager(positionManager).collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: positionId,
                recipient: msg.sender, // Send to vault
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        emit FeesCollected(msg.sender, positionId, amount0, amount1);
    }

    /// @notice Emergency: remove all positions and return tokens to vault
    /// @dev Removes all liquidity from all positions, collects all fees, and sends
    ///      everything back to the calling vault. Cleans up position tracking.
    function withdrawToVault() external nonReentrant onlyRegisteredVault {
        uint256[] storage positions = _vaultPositions[msg.sender];
        uint256 positionCount = positions.length;

        if (positionCount == 0) revert NoPositionsToWithdraw();

        // Iterate in reverse to safely remove from array
        for (uint256 i = positionCount; i > 0; i--) {
            uint256 positionId = positions[i - 1];

            // Get remaining liquidity
            (,,,,,,, uint128 liquidity,,,,) =
                INonfungiblePositionManager(positionManager).positions(positionId);

            // Remove all liquidity if any remains
            if (liquidity > 0) {
                INonfungiblePositionManager(positionManager).decreaseLiquidity(
                    INonfungiblePositionManager.DecreaseLiquidityParams({
                        tokenId: positionId,
                        liquidity: liquidity,
                        amount0Min: 0, // Emergency — accept any amount
                        amount1Min: 0,
                        deadline: block.timestamp
                    })
                );
            }

            // Collect all tokens and fees
            INonfungiblePositionManager(positionManager).collect(
                INonfungiblePositionManager.CollectParams({
                    tokenId: positionId,
                    recipient: msg.sender,
                    amount0Max: type(uint128).max,
                    amount1Max: type(uint128).max
                })
            );

            // Clean up tracking
            delete positionOwner[positionId];
            positions.pop();
        }

        emit WithdrawnToVault(msg.sender);
    }

    // ============ View Functions ============

    /// @notice Check if a vault is registered
    /// @param vault The vault address
    /// @return True if the vault has been registered
    function isRegistered(address vault) external view returns (bool) {
        return vaultConfigs[vault].registered;
    }

    /// @notice Get the active position IDs for a vault
    /// @param vault The vault address
    /// @return The array of position IDs
    function getVaultPositions(address vault) external view returns (uint256[] memory) {
        return _vaultPositions[vault];
    }

    /// @notice Get the number of active positions for a vault
    /// @param vault The vault address
    /// @return The number of active positions
    function getPositionCount(address vault) external view returns (uint256) {
        return _vaultPositions[vault].length;
    }

    /// @notice Get the slippage configuration for a vault
    /// @param vault The vault address
    /// @return slippageBps The slippage tolerance in basis points
    function getSlippage(address vault) external view returns (uint256 slippageBps) {
        return vaultConfigs[vault].slippageBps;
    }

    // ============ Internal ============

    /// @dev Remove a position ID from a vault's tracked positions array
    /// @param vault The vault address
    /// @param positionId The position ID to remove
    function _removePositionFromVault(address vault, uint256 positionId) internal {
        uint256[] storage positions = _vaultPositions[vault];
        uint256 len = positions.length;
        for (uint256 i = 0; i < len; i++) {
            if (positions[i] == positionId) {
                // Swap with last element and pop
                positions[i] = positions[len - 1];
                positions.pop();
                delete positionOwner[positionId];
                return;
            }
        }
    }

    /// @notice L-13 helper: internal mint wrapper that derives slippage minimums
    ///         from the vault's configured slippageBps. Extracted to avoid
    ///         stack-too-deep in addLiquidity.
    function _mintPosition(
        address token0,
        address token1,
        uint24 fee,
        int24 tickLower,
        int24 tickUpper,
        uint256 amount0,
        uint256 amount1
    ) internal returns (uint256, uint128, uint256, uint256) {
        uint256 slipBps = vaultConfigs[msg.sender].slippageBps;
        if (slipBps == 0) slipBps = DEFAULT_SLIPPAGE_BPS;
        return INonfungiblePositionManager(positionManager).mint(
            INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: fee,
                tickLower: tickLower,
                tickUpper: tickUpper,
                amount0Desired: amount0,
                amount1Desired: amount1,
                amount0Min: amount0 - (amount0 * slipBps) / BPS_DENOMINATOR,
                amount1Min: amount1 - (amount1 * slipBps) / BPS_DENOMINATOR,
                recipient: address(this),
                deadline: block.timestamp
            })
        );
    }

    // ============ ERC721 Receiver ============

    /// @notice Implement ERC721Receiver so the Uniswap V4 position
    ///         manager can `safeTransferFrom` position NFTs to this adapter.
    ///         Without this selector, any `safeTransferFrom` call reverts and
    ///         the LP NFT becomes permanently unclaimable.
    function onERC721Received(
        address, /* operator */
        address, /* from */
        uint256, /* tokenId */
        bytes calldata /* data */
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
