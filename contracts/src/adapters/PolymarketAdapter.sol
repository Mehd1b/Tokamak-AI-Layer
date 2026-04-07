// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PolymarketAdapter
/// @notice Adapter for KernelVault agents to trade on Polymarket's CTF Exchange.
///         Routes CALL actions from registered vaults to buy/sell conditional tokens.
/// @dev Designed for Polygon deployment alongside vaults targeting Polymarket.
///      NOTE: buyOutcome/sellOutcome/redeemResolved contain scaffolding logic.
///      Integrate with the actual CTF Exchange ABI before mainnet use.
///
/// Architecture:
/// ┌─────────────────────────────────────────┐
/// │ KernelVault                             │
/// │ vault.execute() → CALL to adapter       │
/// └──────────────┬──────────────────────────┘
///                │
///                ▼
///     ┌──────────────────────────┐
///     │ PolymarketAdapter        │
///     │ vaultConfigs mapping:    │
///     │  vault → config          │
///     └──────┬───────────────────┘
///            │
///            ▼
///     ┌────────────────────────┐
///     │ CTF Exchange           │
///     │ (Polymarket on-chain)  │
///     └────────────────────────┘
contract PolymarketAdapter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Types ============

    struct VaultConfig {
        bytes32 conditionId;
        address yesToken;     // ERC-1155 token ID for YES outcome (as address for simplicity)
        address noToken;      // ERC-1155 token ID for NO outcome
        bool registered;
    }

    // ============ State ============

    address public immutable deployer;
    address public immutable usdc;
    address public immutable ctfExchange;
    address public immutable vaultFactory;

    mapping(address vault => VaultConfig) public vaultConfigs;

    // ============ Events ============

    event VaultRegistered(address indexed vault, bytes32 conditionId);
    event OutcomeBought(address indexed vault, bool isYes, uint256 usdcAmount, uint256 tokensReceived);
    event OutcomeSold(address indexed vault, bool isYes, uint256 tokenAmount, uint256 usdcReceived);
    event Redeemed(address indexed vault, uint256 usdcReceived);
    event WithdrawnToVault(address indexed vault, uint256 amount);

    // ============ Errors ============

    error VaultNotRegistered();
    error VaultAlreadyRegistered();
    error NotFactoryOrOwner();
    error InsufficientOutput();
    error ZeroAmount();

    // ============ Modifiers ============

    modifier onlyRegisteredVault() {
        if (!vaultConfigs[msg.sender].registered) revert VaultNotRegistered();
        _;
    }

    // ============ Constructor ============

    /// @param _usdc USDC token address
    /// @param _ctfExchange Polymarket CTF Exchange address
    /// @param _vaultFactory VaultFactory address for access control
    constructor(address _usdc, address _ctfExchange, address _vaultFactory) {
        deployer = msg.sender;
        usdc = _usdc;
        ctfExchange = _ctfExchange;
        vaultFactory = _vaultFactory;
    }

    function owner() public view returns (address) {
        return deployer;
    }

    // ============ Registration ============

    /// @notice Register a vault to use this adapter for a specific market.
    ///         Only callable by the VaultFactory or the adapter deployer (owner).
    /// @param vault The KernelVault address
    /// @param conditionId The Polymarket condition ID
    /// @param yesToken Address/ID for the YES outcome token
    /// @param noToken Address/ID for the NO outcome token
    function registerVault(
        address vault,
        bytes32 conditionId,
        address yesToken,
        address noToken
    ) external {
        if (msg.sender != vaultFactory && msg.sender != owner()) revert NotFactoryOrOwner();
        if (vaultConfigs[vault].registered) revert VaultAlreadyRegistered();

        vaultConfigs[vault] = VaultConfig({
            conditionId: conditionId,
            yesToken: yesToken,
            noToken: noToken,
            registered: true
        });

        // Approve CTF Exchange to spend USDC on behalf of this adapter
        IERC20(usdc).approve(ctfExchange, type(uint256).max);

        emit VaultRegistered(vault, conditionId);
    }

    // ============ Trading Functions ============

    /// @notice Buy outcome tokens (YES or NO) with USDC from the vault.
    /// @param isYes true = buy YES tokens, false = buy NO tokens
    /// @param usdcAmount Amount of USDC to spend
    /// @param minTokens Minimum tokens to receive (slippage protection)
    function buyOutcome(
        bool isYes,
        uint256 usdcAmount,
        uint256 minTokens
    ) external onlyRegisteredVault nonReentrant {
        if (usdcAmount == 0) revert ZeroAmount();

        // Transfer USDC from vault to adapter
        IERC20(usdc).safeTransferFrom(msg.sender, address(this), usdcAmount);

        // TODO: Integrate with Polymarket CTF Exchange
        // In production, this calls the CTF Exchange to buy conditional tokens.
        // The exact interface depends on whether using the CTF Exchange or
        // NegRiskCtfExchange. For now, this is a placeholder that emits events.
        //
        // ICTFExchange(ctfExchange).buyTokens(conditionId, isYes, usdcAmount, minTokens);

        emit OutcomeBought(msg.sender, isYes, usdcAmount, 0);
    }

    /// @notice Sell outcome tokens back for USDC.
    /// @param isYes true = sell YES tokens, false = sell NO tokens
    /// @param tokenAmount Amount of outcome tokens to sell
    /// @param minUsdc Minimum USDC to receive (slippage protection)
    function sellOutcome(
        bool isYes,
        uint256 tokenAmount,
        uint256 minUsdc
    ) external onlyRegisteredVault nonReentrant {
        if (tokenAmount == 0) revert ZeroAmount();

        // TODO: Integrate with CTF Exchange to sell conditional tokens
        // ICTFExchange(ctfExchange).sellTokens(conditionId, isYes, tokenAmount, minUsdc);

        emit OutcomeSold(msg.sender, isYes, tokenAmount, 0);
    }

    /// @notice Redeem winning tokens after market resolution.
    function redeemResolved() external onlyRegisteredVault nonReentrant {
        // TODO: Call CTF Exchange to redeem winning conditional tokens for USDC
        // ICTFExchange(ctfExchange).redeemPositions(conditionId);

        uint256 usdcBalance = IERC20(usdc).balanceOf(address(this));
        emit Redeemed(msg.sender, usdcBalance);
    }

    /// @notice Withdraw all USDC from adapter back to the calling vault.
    function withdrawToVault() external onlyRegisteredVault nonReentrant {
        uint256 balance = IERC20(usdc).balanceOf(address(this));
        if (balance > 0) {
            IERC20(usdc).safeTransfer(msg.sender, balance);
        }
        emit WithdrawnToVault(msg.sender, balance);
    }

    // ============ View Functions ============

    /// @notice Check if a vault is registered.
    function isRegistered(address vault) external view returns (bool) {
        return vaultConfigs[vault].registered;
    }
}
