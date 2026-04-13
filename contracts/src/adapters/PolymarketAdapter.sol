// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IVaultFactory } from "../interfaces/IVaultFactory.sol";

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

    /// @notice Per-vault USDC position.
    /// @dev The adapter pools USDC across vaults for CTF trades. Without per-vault
    ///      accounting, a single vault could withdraw every vault's USDC via
    ///      `withdrawToVault()`. This mapping enforces isolation.
    mapping(address vault => uint256) public vaultUsdcBalance;

    // ============ Events ============

    event VaultRegistered(address indexed vault, bytes32 conditionId);
    event OutcomeBought(address indexed vault, bool isYes, uint256 usdcAmount, uint256 tokensReceived);
    event OutcomeSold(address indexed vault, bool isYes, uint256 tokenAmount, uint256 usdcReceived);
    event Redeemed(address indexed vault, uint256 usdcReceived);
    event WithdrawnToVault(address indexed vault, uint256 amount);

    /// @notice I-07 fix: dedicated event for pure USDC deposits (no market position)
    event USDCDeposited(address indexed vault, uint256 amount);

    // ============ Errors ============

    error VaultNotRegistered();
    error VaultAlreadyRegistered();
    error NotFactoryOrOwner();
    error InsufficientOutput();
    error ZeroAmount();
    error NotImplemented();
    error InsufficientVaultBalance(uint256 requested, uint256 available);
    /// @notice L-39: vault is not a factory-deployed vault
    error VaultNotDeployedByFactory();

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
        // Verify the vault is actually a factory-deployed vault.
        // Previously the caller authority check (factory OR deployer) did NOT
        // validate the vault address itself, so the adapter deployer could
        // register arbitrary contracts — bypassing the vault isolation model.
        if (!IVaultFactory(vaultFactory).isDeployedVault(vault)) {
            revert VaultNotDeployedByFactory();
        }

        vaultConfigs[vault] = VaultConfig({
            conditionId: conditionId,
            yesToken: yesToken,
            noToken: noToken,
            registered: true
        });

        // NOTE: the unlimited USDC approval to the CTF Exchange was removed.
        // It is not needed while the trading functions are stubs, and would allow a
        // compromised CTF Exchange to drain every vault's pooled USDC.

        emit VaultRegistered(vault, conditionId);
    }

    // ============ Trading Functions ============

    /// @notice Deposit USDC into the adapter for future Polymarket trading.
    /// @dev Until the CTF Exchange integration is implemented, USDC is simply held
    ///      in the adapter against a per-vault ledger and can be withdrawn at any
    ///      time. Each vault can only touch its own tracked balance.
    function depositUSDC(uint256 usdcAmount) external onlyRegisteredVault nonReentrant {
        if (usdcAmount == 0) revert ZeroAmount();
        IERC20(usdc).safeTransferFrom(msg.sender, address(this), usdcAmount);
        vaultUsdcBalance[msg.sender] += usdcAmount;
        // I-07 fix: emit a dedicated USDCDeposited event so downstream indexers
        // do not misinterpret a plain deposit as an outcome purchase.
        emit USDCDeposited(msg.sender, usdcAmount);
    }

    /// @notice Buy outcome tokens (YES or NO) with USDC from the vault.
    /// @dev NOT IMPLEMENTED: the CTF Exchange integration is a stub. This function
    ///      reverts rather than silently stranding USDC. Use {depositUSDC} and
    ///      {withdrawToVault} until the integration is complete.
    function buyOutcome(
        bool, /* isYes */
        uint256, /* usdcAmount */
        uint256 /* minTokens */
    ) external view onlyRegisteredVault {
        revert NotImplemented();
    }

    /// @notice Sell outcome tokens back for USDC.
    /// @dev NOT IMPLEMENTED: the CTF Exchange integration is a stub.
    function sellOutcome(
        bool, /* isYes */
        uint256, /* tokenAmount */
        uint256 /* minUsdc */
    ) external view onlyRegisteredVault {
        revert NotImplemented();
    }

    /// @notice Redeem winning tokens after market resolution.
    /// @dev NOT IMPLEMENTED: the CTF Exchange integration is a stub.
    function redeemResolved() external view onlyRegisteredVault {
        revert NotImplemented();
    }

    /// @notice Withdraw the calling vault's tracked USDC balance.
    /// @dev Only drains the caller's own tracked balance, not the adapter's
    ///      aggregate USDC — this prevents cross-vault theft.
    function withdrawToVault() external onlyRegisteredVault nonReentrant {
        uint256 balance = vaultUsdcBalance[msg.sender];
        if (balance > 0) {
            vaultUsdcBalance[msg.sender] = 0;
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
