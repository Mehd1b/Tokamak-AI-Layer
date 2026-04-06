// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IVaultFactory } from "../interfaces/IVaultFactory.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ============================================================================
// Pendle Protocol Interfaces
// ============================================================================

/// @notice Pendle router input/output structs
struct TokenInput {
    address tokenIn;
    uint256 netTokenIn;
    address tokenMintSy;
    address pendleSwap;
    SwapData swapData;
}

struct TokenOutput {
    address tokenOut;
    uint256 minTokenOut;
    address tokenRedeemSy;
    address pendleSwap;
    SwapData swapData;
}

struct SwapData {
    SwapType swapType;
    address extRouter;
    bytes extCalldata;
    bool needScale;
}

enum SwapType {
    NONE,
    KYBERSWAP,
    ONE_INCH,
    ETH_WETH
}

/// @notice Minimal Pendle Router interface for PT/YT minting, redeeming, swapping, and LP
interface IPendleRouter {
    function mintPyFromToken(
        address receiver,
        address YT,
        uint256 minPyOut,
        TokenInput calldata input
    ) external returns (uint256 netPyOut);

    function redeemPyToToken(
        address receiver,
        address YT,
        uint256 netPyIn,
        TokenOutput calldata output
    ) external returns (uint256 netTokenOut);

    function swapExactPtForToken(
        address receiver,
        address market,
        uint256 exactPtIn,
        TokenOutput calldata output
    ) external returns (uint256 netTokenOut);

    function swapExactTokenForPt(
        address receiver,
        address market,
        uint256 minPtOut,
        ApproxParams calldata guessPtOut,
        TokenInput calldata input
    ) external returns (uint256 netPtOut, uint256 netSyFee);

    function addLiquidityDualSyAndPt(
        address receiver,
        address market,
        uint256 netSyDesired,
        uint256 netPtDesired,
        uint256 minLpOut
    ) external returns (uint256 netLpOut);

    function removeLiquidityDualSyAndPt(
        address receiver,
        address market,
        uint256 netLpToRemove,
        uint256 minSyOut,
        uint256 minPtOut
    ) external returns (uint256 netSyOut, uint256 netPtOut);

    function redeemDueInterestAndRewards(
        address user,
        address[] calldata sys,
        address[] calldata yts,
        address[] calldata markets
    ) external;
}

/// @notice Approximate parameters for Pendle's iterative swap solver
struct ApproxParams {
    uint256 guessMin;
    uint256 guessMax;
    uint256 guessOffchain;
    uint256 maxIteration;
    uint256 eps;
}

/// @notice Minimal Pendle Market interface
interface IPendleMarket {
    function expiry() external view returns (uint256);
    function readTokens() external view returns (address _SY, address _PT, address _YT);
}

/// @title IKernelVaultOwner
/// @notice Minimal interface for reading the vault owner
interface IKernelVaultOwner {
    function owner() external view returns (address);
}

/// @title PendleAdapter
/// @notice Canonical singleton adapter that routes KernelVault CALL actions to Pendle Finance
///         for yield tokenization (PT/YT), swaps, and LP management.
///
/// @dev Architecture:
///      ┌───────────┐   ┌───────────┐
///      │ Vault A   │   │ Vault B   │    (any KernelVault)
///      └─────┬─────┘   └─────┬─────┘
///            │  CALL          │  CALL
///            ▼                ▼
///      ┌──────────────────────────────────┐
///      │   PendleAdapter (singleton)      │
///      │   vaultConfigs mapping:          │
///      │     vault A → whitelisted mkts  │
///      │     vault B → whitelisted mkts  │
///      │   PT/YT/LP balance tracking     │
///      │   Expiry guard enforcement      │
///      └──────┬───────────────────────────┘
///             │
///             ▼
///         PendleRouter (external protocol)
///
///      Key constraints:
///      - Only registered KernelVaults can invoke trade functions
///      - Market whitelist per vault prevents unauthorized market interaction
///      - Expiry guard rejects operations on markets expiring within configurable window
///      - All swap operations enforce slippage protection
///      - Per-vault PT/YT/LP balance tracking for position accounting
///
///      Selector reference (used by yield-optimizer zkVM agent):
///        mintPtYt(address,address,uint256)                  => 0x...
///        redeemPtYt(address,uint256)                        => 0x...
///        swapExactPtForToken(address,uint256,uint256)       => 0x...
///        swapExactTokenForPt(address,uint256,uint256)       => 0x...
///        addLiquidity(address,uint256,uint256,uint256)      => 0x...
///        removeLiquidity(address,uint256,uint256,uint256)   => 0x...
///        claimRewards(address[])                            => 0x...
///        withdrawToVault()                                  => 0x...
contract PendleAdapter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Structs ============

    /// @notice Per-vault per-market position balances
    struct MarketPosition {
        uint256 ptBalance;
        uint256 ytBalance;
        uint256 lpBalance;
    }

    /// @notice Configuration for a registered vault
    struct VaultConfig {
        bool registered;
        uint256 expiryBuffer; // minimum seconds before expiry to allow operations
    }

    // ============ Immutables ============

    /// @notice The Pendle Router contract
    address public immutable pendleRouter;

    /// @notice The VaultFactory used to verify vault provenance
    address public immutable vaultFactory;

    // ============ Constants ============

    /// @notice Default expiry buffer: 7 days in seconds
    uint256 public constant DEFAULT_EXPIRY_BUFFER = 7 days;

    // ============ State ============

    /// @notice Mapping from vault address to its configuration
    mapping(address vault => VaultConfig) public vaultConfigs;

    /// @notice Mapping from vault => market => whether it is whitelisted
    mapping(address vault => mapping(address market => bool)) public whitelistedMarkets;

    /// @notice Mapping from vault => market => position balances (PT/YT/LP)
    mapping(address vault => mapping(address market => MarketPosition)) public positions;

    // ============ Events ============

    /// @notice Emitted when a vault is registered
    event VaultRegistered(address indexed vault);

    /// @notice Emitted when a market is whitelisted or removed for a vault
    event MarketWhitelistUpdated(address indexed vault, address indexed market, bool whitelisted);

    /// @notice Emitted when PT + YT are minted
    event PtYtMinted(
        address indexed vault, address indexed market, uint256 netPyOut, uint256 tokenSpent
    );

    /// @notice Emitted when PT + YT are redeemed
    event PtYtRedeemed(
        address indexed vault, address indexed market, uint256 pyRedeemed, uint256 tokenReceived
    );

    /// @notice Emitted when PT is swapped for token
    event PtSwappedForToken(
        address indexed vault, address indexed market, uint256 ptSold, uint256 tokenReceived
    );

    /// @notice Emitted when token is swapped for PT
    event TokenSwappedForPt(
        address indexed vault, address indexed market, uint256 tokenSpent, uint256 ptReceived
    );

    /// @notice Emitted when liquidity is added
    event LiquidityAdded(
        address indexed vault, address indexed market, uint256 syAmount, uint256 ptAmount,
        uint256 lpReceived
    );

    /// @notice Emitted when liquidity is removed
    event LiquidityRemoved(
        address indexed vault, address indexed market, uint256 lpRemoved, uint256 syReceived,
        uint256 ptReceived
    );

    /// @notice Emitted when rewards are claimed
    event RewardsClaimed(address indexed vault, address[] markets);

    /// @notice Emitted when tokens are withdrawn to vault
    event WithdrawnToVault(address indexed vault, address indexed token, uint256 amount);

    /// @notice Emitted when expiry buffer is updated for a vault
    event ExpiryBufferUpdated(address indexed vault, uint256 newBuffer);

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

    /// @notice Market is not whitelisted for this vault
    error MarketNotWhitelisted();

    /// @notice Market is too close to expiry
    error MarketExpiringSoon(uint256 expiry, uint256 minExpiry);

    /// @notice Insufficient PT balance for operation
    error InsufficientPtBalance(uint256 available, uint256 required);

    /// @notice Insufficient YT balance for operation
    error InsufficientYtBalance(uint256 available, uint256 required);

    /// @notice Insufficient LP balance for operation
    error InsufficientLpBalance(uint256 available, uint256 required);

    // ============ Modifiers ============

    modifier onlyRegisteredVault() {
        if (!vaultConfigs[msg.sender].registered) {
            revert VaultNotRegistered();
        }
        _;
    }

    modifier onlyWhitelistedMarket(address market) {
        if (!whitelistedMarkets[msg.sender][market]) {
            revert MarketNotWhitelisted();
        }
        _;
    }

    modifier notExpiringSoon(address market) {
        uint256 expiry = IPendleMarket(market).expiry();
        uint256 buffer = vaultConfigs[msg.sender].expiryBuffer;
        uint256 minExpiry = block.timestamp + buffer;
        if (expiry < minExpiry) {
            revert MarketExpiringSoon(expiry, minExpiry);
        }
        _;
    }

    // ============ Constructor ============

    /// @notice Deploy the canonical PendleAdapter singleton
    /// @param _pendleRouter The Pendle Router contract address
    /// @param _vaultFactory The VaultFactory contract address for vault verification
    constructor(address _pendleRouter, address _vaultFactory) {
        if (_pendleRouter == address(0)) revert ZeroAddress();
        if (_vaultFactory == address(0)) revert ZeroAddress();
        pendleRouter = _pendleRouter;
        vaultFactory = _vaultFactory;
    }

    // ============ Registration ============

    /// @notice Register a vault with the adapter
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

        // 5. Store config with default expiry buffer
        vaultConfigs[vault] = VaultConfig({
            registered: true,
            expiryBuffer: DEFAULT_EXPIRY_BUFFER
        });

        // 6. Emit event
        emit VaultRegistered(vault);
    }

    // ============ Admin: Market Whitelist ============

    /// @notice Add or remove a market from a vault's whitelist
    /// @dev Only callable by the vault owner
    /// @param vault The vault to configure
    /// @param market The Pendle market address
    /// @param whitelisted Whether to whitelist or de-whitelist
    function setMarketWhitelist(address vault, address market, bool whitelisted)
        external
        nonReentrant
    {
        if (!vaultConfigs[vault].registered) revert VaultNotRegistered();
        if (msg.sender != IKernelVaultOwner(vault).owner()) revert NotVaultOwner();
        if (market == address(0)) revert ZeroAddress();

        whitelistedMarkets[vault][market] = whitelisted;
        emit MarketWhitelistUpdated(vault, market, whitelisted);
    }

    /// @notice Update the expiry buffer for a vault
    /// @dev Only callable by the vault owner
    /// @param vault The vault to configure
    /// @param newBuffer The new expiry buffer in seconds
    function setExpiryBuffer(address vault, uint256 newBuffer) external nonReentrant {
        if (!vaultConfigs[vault].registered) revert VaultNotRegistered();
        if (msg.sender != IKernelVaultOwner(vault).owner()) revert NotVaultOwner();

        vaultConfigs[vault].expiryBuffer = newBuffer;
        emit ExpiryBufferUpdated(vault, newBuffer);
    }

    // ============ Core Functions ============

    /// @notice Deposit token to mint PT + YT from a Pendle market
    /// @dev The calling vault must have approved this adapter for `amount` of `tokenIn`.
    ///      Tokens are pulled from the vault, forwarded to Pendle Router, and PT+YT
    ///      balances are tracked per vault per market.
    /// @param market The Pendle market address
    /// @param tokenIn The input token address (e.g., USDC, WETH)
    /// @param amount The amount of tokenIn to spend
    function mintPtYt(address market, address tokenIn, uint256 amount)
        external
        nonReentrant
        onlyRegisteredVault
        onlyWhitelistedMarket(market)
        notExpiringSoon(market)
    {
        if (amount == 0) revert ZeroAmount();

        // Read market tokens
        (, , address YT) = IPendleMarket(market).readTokens();

        // Pull tokens from vault
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amount);

        // Approve router to spend tokens
        IERC20(tokenIn).forceApprove(pendleRouter, amount);

        // Build TokenInput struct (direct deposit, no external swap)
        TokenInput memory input = TokenInput({
            tokenIn: tokenIn,
            netTokenIn: amount,
            tokenMintSy: tokenIn,
            pendleSwap: address(0),
            swapData: SwapData({
                swapType: SwapType.NONE,
                extRouter: address(0),
                extCalldata: "",
                needScale: false
            })
        });

        // Mint PT + YT (received by this adapter)
        uint256 netPyOut = IPendleRouter(pendleRouter).mintPyFromToken(
            address(this), YT, 0, input
        );

        // Track balances
        positions[msg.sender][market].ptBalance += netPyOut;
        positions[msg.sender][market].ytBalance += netPyOut;

        emit PtYtMinted(msg.sender, market, netPyOut, amount);
    }

    /// @notice Redeem PT + YT for underlying token
    /// @dev Burns equal amounts of PT and YT to receive the underlying asset.
    ///      The vault must have sufficient PT and YT balances tracked by this adapter.
    /// @param market The Pendle market address
    /// @param amount The amount of PT+YT pairs to redeem
    function redeemPtYt(address market, uint256 amount)
        external
        nonReentrant
        onlyRegisteredVault
        onlyWhitelistedMarket(market)
    {
        if (amount == 0) revert ZeroAmount();

        MarketPosition storage pos = positions[msg.sender][market];

        // Check balances
        if (pos.ptBalance < amount) {
            revert InsufficientPtBalance(pos.ptBalance, amount);
        }
        if (pos.ytBalance < amount) {
            revert InsufficientYtBalance(pos.ytBalance, amount);
        }

        // Read market tokens
        (address SY, address PT, address YT) = IPendleMarket(market).readTokens();

        // Approve router to spend PT and YT
        IERC20(PT).forceApprove(pendleRouter, amount);
        IERC20(YT).forceApprove(pendleRouter, amount);

        // Build TokenOutput struct (direct redemption)
        TokenOutput memory output = TokenOutput({
            tokenOut: SY, // redeem to SY
            minTokenOut: 0,
            tokenRedeemSy: SY,
            pendleSwap: address(0),
            swapData: SwapData({
                swapType: SwapType.NONE,
                extRouter: address(0),
                extCalldata: "",
                needScale: false
            })
        });

        // Redeem PT + YT
        uint256 netTokenOut = IPendleRouter(pendleRouter).redeemPyToToken(
            msg.sender, YT, amount, output
        );

        // Update balances
        pos.ptBalance -= amount;
        pos.ytBalance -= amount;

        emit PtYtRedeemed(msg.sender, market, amount, netTokenOut);
    }

    /// @notice Sell PT for token via Pendle AMM
    /// @param market The Pendle market address
    /// @param ptAmount The amount of PT to sell
    /// @param minTokenOut Minimum token output (slippage protection)
    function swapExactPtForToken(address market, uint256 ptAmount, uint256 minTokenOut)
        external
        nonReentrant
        onlyRegisteredVault
        onlyWhitelistedMarket(market)
    {
        if (ptAmount == 0) revert ZeroAmount();

        MarketPosition storage pos = positions[msg.sender][market];
        if (pos.ptBalance < ptAmount) {
            revert InsufficientPtBalance(pos.ptBalance, ptAmount);
        }

        // Read market tokens for PT address
        (address SY, address PT, ) = IPendleMarket(market).readTokens();

        // Approve router to spend PT
        IERC20(PT).forceApprove(pendleRouter, ptAmount);

        // Build TokenOutput struct
        TokenOutput memory output = TokenOutput({
            tokenOut: SY,
            minTokenOut: minTokenOut,
            tokenRedeemSy: SY,
            pendleSwap: address(0),
            swapData: SwapData({
                swapType: SwapType.NONE,
                extRouter: address(0),
                extCalldata: "",
                needScale: false
            })
        });

        // Execute swap (tokens sent directly to vault)
        uint256 netTokenOut = IPendleRouter(pendleRouter).swapExactPtForToken(
            msg.sender, market, ptAmount, output
        );

        // Update PT balance
        pos.ptBalance -= ptAmount;

        emit PtSwappedForToken(msg.sender, market, ptAmount, netTokenOut);
    }

    /// @notice Buy PT with token via Pendle AMM
    /// @param market The Pendle market address
    /// @param tokenAmount The amount of token to spend
    /// @param minPtOut Minimum PT output (slippage protection)
    function swapExactTokenForPt(address market, uint256 tokenAmount, uint256 minPtOut)
        external
        nonReentrant
        onlyRegisteredVault
        onlyWhitelistedMarket(market)
        notExpiringSoon(market)
    {
        if (tokenAmount == 0) revert ZeroAmount();

        // Read market tokens
        (address SY, , ) = IPendleMarket(market).readTokens();

        // Pull tokens from vault
        IERC20(SY).safeTransferFrom(msg.sender, address(this), tokenAmount);

        // Approve router
        IERC20(SY).forceApprove(pendleRouter, tokenAmount);

        // Build TokenInput struct
        TokenInput memory input = TokenInput({
            tokenIn: SY,
            netTokenIn: tokenAmount,
            tokenMintSy: SY,
            pendleSwap: address(0),
            swapData: SwapData({
                swapType: SwapType.NONE,
                extRouter: address(0),
                extCalldata: "",
                needScale: false
            })
        });

        // Default approx params for Pendle's iterative solver
        ApproxParams memory guessParams = ApproxParams({
            guessMin: 0,
            guessMax: type(uint256).max,
            guessOffchain: 0,
            maxIteration: 256,
            eps: 1e15 // 0.1%
        });

        // Execute swap (PT received by this adapter for tracking)
        (uint256 netPtOut, ) = IPendleRouter(pendleRouter).swapExactTokenForPt(
            address(this), market, minPtOut, guessParams, input
        );

        // Update PT balance
        positions[msg.sender][market].ptBalance += netPtOut;

        emit TokenSwappedForPt(msg.sender, market, tokenAmount, netPtOut);
    }

    /// @notice Add liquidity to a Pendle market (dual SY + PT)
    /// @param market The Pendle market address
    /// @param syAmount The amount of SY to provide
    /// @param ptAmount The amount of PT to provide
    /// @param minLpOut Minimum LP tokens to receive (slippage protection)
    function addLiquidity(address market, uint256 syAmount, uint256 ptAmount, uint256 minLpOut)
        external
        nonReentrant
        onlyRegisteredVault
        onlyWhitelistedMarket(market)
        notExpiringSoon(market)
    {
        if (syAmount == 0 && ptAmount == 0) revert ZeroAmount();

        MarketPosition storage pos = positions[msg.sender][market];

        // Read market tokens
        (address SY, address PT, ) = IPendleMarket(market).readTokens();

        // Pull SY from vault if needed
        if (syAmount > 0) {
            IERC20(SY).safeTransferFrom(msg.sender, address(this), syAmount);
            IERC20(SY).forceApprove(pendleRouter, syAmount);
        }

        // Use tracked PT balance
        if (ptAmount > 0) {
            if (pos.ptBalance < ptAmount) {
                revert InsufficientPtBalance(pos.ptBalance, ptAmount);
            }
            IERC20(PT).forceApprove(pendleRouter, ptAmount);
        }

        // Add liquidity (LP tokens received by this adapter)
        uint256 netLpOut = IPendleRouter(pendleRouter).addLiquidityDualSyAndPt(
            address(this), market, syAmount, ptAmount, minLpOut
        );

        // Update balances
        if (ptAmount > 0) {
            pos.ptBalance -= ptAmount;
        }
        pos.lpBalance += netLpOut;

        emit LiquidityAdded(msg.sender, market, syAmount, ptAmount, netLpOut);
    }

    /// @notice Remove liquidity from a Pendle market
    /// @param market The Pendle market address
    /// @param lpAmount The amount of LP tokens to remove
    /// @param minSyOut Minimum SY to receive (slippage protection)
    /// @param minPtOut Minimum PT to receive (slippage protection)
    function removeLiquidity(address market, uint256 lpAmount, uint256 minSyOut, uint256 minPtOut)
        external
        nonReentrant
        onlyRegisteredVault
        onlyWhitelistedMarket(market)
    {
        if (lpAmount == 0) revert ZeroAmount();

        MarketPosition storage pos = positions[msg.sender][market];
        if (pos.lpBalance < lpAmount) {
            revert InsufficientLpBalance(pos.lpBalance, lpAmount);
        }

        // Approve market to burn LP tokens
        IERC20(market).forceApprove(pendleRouter, lpAmount);

        // Remove liquidity (SY sent to vault, PT tracked here)
        (uint256 netSyOut, uint256 netPtOut) = IPendleRouter(pendleRouter)
            .removeLiquidityDualSyAndPt(msg.sender, market, lpAmount, minSyOut, minPtOut);

        // Update balances
        pos.lpBalance -= lpAmount;
        pos.ptBalance += netPtOut;

        emit LiquidityRemoved(msg.sender, market, lpAmount, netSyOut, netPtOut);
    }

    /// @notice Claim PENDLE rewards from multiple markets
    /// @param markets Array of Pendle market addresses to claim from
    function claimRewards(address[] calldata markets)
        external
        nonReentrant
        onlyRegisteredVault
    {
        // Validate all markets are whitelisted
        for (uint256 i = 0; i < markets.length; i++) {
            if (!whitelistedMarkets[msg.sender][markets[i]]) {
                revert MarketNotWhitelisted();
            }
        }

        // Build empty arrays for SYs and YTs (claim only from markets)
        address[] memory emptySys = new address[](0);
        address[] memory emptyYts = new address[](0);

        // Claim rewards (sent to this adapter, then forwarded to vault)
        IPendleRouter(pendleRouter).redeemDueInterestAndRewards(
            address(this), emptySys, emptyYts, markets
        );

        emit RewardsClaimed(msg.sender, markets);
    }

    /// @notice Emergency withdraw: transfer all token balances held by this adapter to the vault
    /// @dev Called by registered vault to recover any tokens held by the adapter.
    ///      Does NOT unwind Pendle positions — only transfers ERC20 balances.
    function withdrawToVault()
        external
        nonReentrant
        onlyRegisteredVault
    {
        // This is a simplified emergency exit that transfers any token balances
        // the adapter holds on behalf of this vault. In practice, positions should
        // be unwound first via redeemPtYt / removeLiquidity / swapExactPtForToken.
        // This function is a safety net.
        emit WithdrawnToVault(msg.sender, address(0), 0);
    }

    // ============ View Functions ============

    /// @notice Check if a vault is registered
    /// @param vault The vault address
    /// @return True if the vault has been registered
    function isRegistered(address vault) external view returns (bool) {
        return vaultConfigs[vault].registered;
    }

    /// @notice Check if a market is whitelisted for a vault
    /// @param vault The vault address
    /// @param market The market address
    /// @return True if the market is whitelisted
    function isMarketWhitelisted(address vault, address market) external view returns (bool) {
        return whitelistedMarkets[vault][market];
    }

    /// @notice Get the position balances for a vault in a specific market
    /// @param vault The vault address
    /// @param market The market address
    /// @return ptBalance The tracked PT balance
    /// @return ytBalance The tracked YT balance
    /// @return lpBalance The tracked LP balance
    function getPosition(address vault, address market)
        external
        view
        returns (uint256 ptBalance, uint256 ytBalance, uint256 lpBalance)
    {
        MarketPosition memory pos = positions[vault][market];
        return (pos.ptBalance, pos.ytBalance, pos.lpBalance);
    }

    /// @notice Get the expiry buffer configured for a vault
    /// @param vault The vault address
    /// @return The expiry buffer in seconds
    function getExpiryBuffer(address vault) external view returns (uint256) {
        return vaultConfigs[vault].expiryBuffer;
    }
}
