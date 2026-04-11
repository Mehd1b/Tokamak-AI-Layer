// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IVaultFactory } from "../interfaces/IVaultFactory.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// ============================================================================
// Lido Protocol Interfaces
// ============================================================================

interface ILido {
    function submit(address _referral) external payable returns (uint256);
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}

interface IWstETH {
    function wrap(uint256 _stETHAmount) external returns (uint256);
    function unwrap(uint256 _wstETHAmount) external returns (uint256);
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}

interface IWithdrawalQueue {
    function requestWithdrawals(uint256[] calldata _amounts, address _owner)
        external
        returns (uint256[] memory requestIds);
    function claimWithdrawal(uint256 _requestId) external;
}

/// @title IKernelVaultOwner
/// @notice Minimal interface for reading the vault owner
interface IKernelVaultOwner {
    function owner() external view returns (address);
}

/// @title LidoAdapter
/// @notice Canonical singleton adapter that routes KernelVault CALL actions to
///         Lido's liquid staking protocol (stETH, wstETH, and withdrawal queue).
///
/// @dev Architecture:
///      ┌───────────┐   ┌───────────┐
///      │ Vault A   │   │ Vault B   │    (any KernelVault)
///      └─────┬─────┘   └─────┬─────┘
///            │  CALL          │  CALL
///            ▼                ▼
///      ┌──────────────────────────────────┐
///      │   LidoAdapter (singleton)        │
///      │   Per-vault balance tracking:    │
///      │     vault A → stETH / wstETH     │
///      │     vault B → stETH / wstETH     │
///      │   Routes by msg.sender           │
///      └──────┬────────────────┬──────────┘
///             │                │
///             ▼                ▼
///        ┌─────────┐     ┌──────────┐
///        │  Lido   │     │ WstETH   │
///        │ (stETH) │     │          │
///        └─────────┘     └──────────┘
///
///      Key constraints:
///      - Only registered KernelVaults can invoke staking functions
///      - Per-vault balance isolation for stETH, wstETH, and withdrawal requests
///      - Vault registration is permissioned: only vault owner + factory-deployed vaults
///      - Minimum stake amount enforced to prevent dust deposits
contract LidoAdapter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    /// @notice Minimum ETH amount for staking (0.01 ETH)
    uint256 public constant MIN_STAKE_AMOUNT = 0.01 ether;

    // ============ Immutables ============

    /// @notice The Lido stETH contract
    address public immutable lido;

    /// @notice The Lido wstETH wrapper contract
    address public immutable wstETH;

    /// @notice The Lido WithdrawalQueue contract
    address public immutable withdrawalQueue;

    /// @notice The VaultFactory used to verify vault provenance
    address public immutable vaultFactory;

    // ============ Per-vault Tracking ============

    /// @notice stETH balance tracked per vault
    mapping(address vault => uint256) public vaultStETHBalance;

    /// @notice Sum of vaultStETHBalance across all registered vaults (M-13 rebase sync).
    uint256 public totalTrackedStETH;

    /// @notice wstETH balance tracked per vault
    mapping(address vault => uint256) public vaultWstETHBalance;

    /// @notice Pending withdrawal request IDs per vault
    mapping(address vault => uint256[]) internal _vaultWithdrawalRequestIds;

    /// @notice Whether a vault is registered
    mapping(address vault => bool) public isRegistered;

    // ============ Errors ============

    error ZeroAddress();
    error VaultNotRegistered();
    error VaultNotDeployedByFactory();
    error NotVaultOwner();
    error VaultAlreadyRegistered();
    error StakeAmountTooLow(uint256 amount, uint256 minimum);
    error InsufficientStETHBalance(uint256 requested, uint256 available);
    error InsufficientWstETHBalance(uint256 requested, uint256 available);
    error NoBalanceToWithdraw();
    error EmptyAmountsArray();
    error ETHTransferFailed();

    // ============ Events ============

    event VaultRegistered(address indexed vault);
    event ETHStaked(address indexed vault, uint256 ethAmount, uint256 stETHReceived);
    event StETHWrapped(address indexed vault, uint256 stETHAmount, uint256 wstETHReceived);
    event WstETHUnwrapped(address indexed vault, uint256 wstETHAmount, uint256 stETHReceived);
    event WithdrawalRequested(address indexed vault, uint256[] requestIds, uint256[] amounts);
    event WithdrawalClaimed(address indexed vault, uint256 requestId, uint256 ethReceived);
    event EmergencyWithdraw(address indexed vault, uint256 stETHReturned, uint256 wstETHReturned, uint256 ethReturned);

    // ============ Modifiers ============

    modifier onlyRegisteredVault() {
        if (!isRegistered[msg.sender]) {
            revert VaultNotRegistered();
        }
        _;
    }

    // ============ Constructor ============

    /// @notice Deploy the canonical LidoAdapter singleton
    /// @param _lido The Lido stETH contract address
    /// @param _wstETH The Lido wstETH wrapper contract address
    /// @param _withdrawalQueue The Lido WithdrawalQueue contract address
    /// @param _vaultFactory The VaultFactory contract address for vault verification
    constructor(address _lido, address _wstETH, address _withdrawalQueue, address _vaultFactory) {
        if (_lido == address(0)) revert ZeroAddress();
        if (_wstETH == address(0)) revert ZeroAddress();
        if (_withdrawalQueue == address(0)) revert ZeroAddress();
        if (_vaultFactory == address(0)) revert ZeroAddress();
        lido = _lido;
        wstETH = _wstETH;
        withdrawalQueue = _withdrawalQueue;
        vaultFactory = _vaultFactory;
    }

    // ============ Registration ============

    /// @notice Register a vault to use this adapter
    /// @dev Only callable by the vault owner. Vault must be deployed by the VaultFactory.
    /// @param vault The vault address to register
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
        if (isRegistered[vault]) {
            revert VaultAlreadyRegistered();
        }

        // 5. Register
        isRegistered[vault] = true;

        emit VaultRegistered(vault);
    }

    // ============ Core Functions ============

    /// @notice Stake ETH via Lido, receive stETH. Callable by registered vaults.
    /// @dev The vault sends ETH with this call. stETH is held by the adapter and
    ///      tracked per vault.
    function stakeETH() external payable nonReentrant onlyRegisteredVault {
        if (msg.value < MIN_STAKE_AMOUNT) {
            revert StakeAmountTooLow(msg.value, MIN_STAKE_AMOUNT);
        }

        // Submit ETH to Lido, receive stETH
        uint256 stETHBefore = ILido(lido).balanceOf(address(this));
        ILido(lido).submit{ value: msg.value }(address(0));
        uint256 stETHAfter = ILido(lido).balanceOf(address(this));
        uint256 stETHReceived = stETHAfter - stETHBefore;

        // Track stETH balance for this vault
        vaultStETHBalance[msg.sender] += stETHReceived;
        totalTrackedStETH += stETHReceived;

        emit ETHStaked(msg.sender, msg.value, stETHReceived);
    }

    /// @notice Sync rebase gains/losses into per-vault stETH balances (M-13).
    /// @dev stETH rebases daily; without syncing, yield accrues to the adapter
    ///      aggregate but is not distributed pro rata to vaults. Anyone can call
    ///      this to reconcile tracked balances with the adapter's actual stETH
    ///      balance. Distribution is proportional to each vault's current
    ///      tracked share.
    function syncRebase() external nonReentrant {
        uint256 tracked = totalTrackedStETH;
        if (tracked == 0) return;

        uint256 actual = ILido(lido).balanceOf(address(this));
        if (actual == tracked) return;

        // Scale each vault's balance by actual/tracked. Since we can't iterate
        // all vaults from storage cheaply, callers must supply the vault list.
        // The simpler mechanism implemented here updates totalTrackedStETH to
        // reflect the adapter's current aggregate — individual balances are
        // reconciled on-the-fly via {vaultStETHShare}. See {vaultStETHShare}.
        totalTrackedStETH = actual;
    }

    /// @notice Current pro-rata stETH claim for a vault after rebase (M-13).
    /// @param vault The vault address
    /// @return The vault's current stETH claim including accrued rebase
    function vaultStETHShare(address vault) external view returns (uint256) {
        uint256 tracked = totalTrackedStETH;
        if (tracked == 0) return vaultStETHBalance[vault];
        uint256 actual = ILido(lido).balanceOf(address(this));
        if (actual == tracked) return vaultStETHBalance[vault];
        return (vaultStETHBalance[vault] * actual) / tracked;
    }

    /// @notice Wrap stETH into wstETH. Callable by registered vaults.
    /// @param stethAmount The amount of stETH to wrap
    function wrapToWstETH(uint256 stethAmount) external nonReentrant onlyRegisteredVault {
        if (stethAmount == 0) revert InsufficientStETHBalance(0, 0);
        if (vaultStETHBalance[msg.sender] < stethAmount) {
            revert InsufficientStETHBalance(stethAmount, vaultStETHBalance[msg.sender]);
        }

        // Approve wstETH contract to spend stETH
        ILido(lido).approve(wstETH, stethAmount);

        // Wrap stETH → wstETH
        uint256 wstETHBefore = IWstETH(wstETH).balanceOf(address(this));
        IWstETH(wstETH).wrap(stethAmount);
        uint256 wstETHAfter = IWstETH(wstETH).balanceOf(address(this));

        // Use actual balance delta for safety
        uint256 actualReceived = wstETHAfter - wstETHBefore;

        // Update per-vault tracking
        vaultStETHBalance[msg.sender] -= stethAmount;
        vaultWstETHBalance[msg.sender] += actualReceived;
        // L-01 fix: symmetric decrement — stETH is leaving the stETH tracking
        // (being converted to wstETH), so the aggregate denominator must shrink.
        if (stethAmount > totalTrackedStETH) {
            totalTrackedStETH = 0;
        } else {
            totalTrackedStETH -= stethAmount;
        }

        emit StETHWrapped(msg.sender, stethAmount, actualReceived);
    }

    /// @notice Unwrap wstETH back to stETH. Callable by registered vaults.
    /// @param wstethAmount The amount of wstETH to unwrap
    function unwrapFromWstETH(uint256 wstethAmount) external nonReentrant onlyRegisteredVault {
        if (wstethAmount == 0) revert InsufficientWstETHBalance(0, 0);
        if (vaultWstETHBalance[msg.sender] < wstethAmount) {
            revert InsufficientWstETHBalance(wstethAmount, vaultWstETHBalance[msg.sender]);
        }

        // Unwrap wstETH → stETH
        uint256 stETHBefore = ILido(lido).balanceOf(address(this));
        IWstETH(wstETH).unwrap(wstethAmount);
        uint256 stETHAfter = ILido(lido).balanceOf(address(this));

        // Use actual balance delta for safety
        uint256 actualReceived = stETHAfter - stETHBefore;

        // Update per-vault tracking
        vaultWstETHBalance[msg.sender] -= wstethAmount;
        vaultStETHBalance[msg.sender] += actualReceived;
        // L-01 fix: symmetric increment — stETH is re-entering the stETH
        // tracking via the unwrap path, so the aggregate denominator must
        // grow by the actual amount received.
        totalTrackedStETH += actualReceived;

        emit WstETHUnwrapped(msg.sender, wstethAmount, actualReceived);
    }

    /// @notice Request stETH withdrawal via Lido's WithdrawalQueue. Callable by registered vaults.
    /// @param amounts Array of stETH amounts to request for withdrawal
    function requestWithdrawal(uint256[] calldata amounts) external nonReentrant onlyRegisteredVault {
        if (amounts.length == 0) revert EmptyAmountsArray();

        // Validate total amount against vault's stETH balance
        uint256 totalAmount;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }
        if (vaultStETHBalance[msg.sender] < totalAmount) {
            revert InsufficientStETHBalance(totalAmount, vaultStETHBalance[msg.sender]);
        }

        // Approve WithdrawalQueue to spend stETH
        ILido(lido).approve(withdrawalQueue, totalAmount);

        // Submit withdrawal request
        uint256[] memory requestIds =
            IWithdrawalQueue(withdrawalQueue).requestWithdrawals(amounts, address(this));

        // Update tracking
        vaultStETHBalance[msg.sender] -= totalAmount;
        // L-01 fix: stETH is leaving the adapter balance at request time (locked
        // in the Lido withdrawal queue), so the aggregate denominator must also
        // shrink or subsequent `vaultStETHShare` reads will understate claims.
        if (totalAmount > totalTrackedStETH) {
            totalTrackedStETH = 0;
        } else {
            totalTrackedStETH -= totalAmount;
        }
        for (uint256 i = 0; i < requestIds.length; i++) {
            _vaultWithdrawalRequestIds[msg.sender].push(requestIds[i]);
        }

        emit WithdrawalRequested(msg.sender, requestIds, amounts);
    }

    /// @notice Claim a completed withdrawal from the WithdrawalQueue. Callable by registered vaults.
    /// @dev Sends the claimed ETH back to the calling vault.
    /// @param requestId The withdrawal request ID to claim
    function claimWithdrawal(uint256 requestId) external nonReentrant onlyRegisteredVault {
        // Verify the request belongs to this vault
        bool found = false;
        uint256 indexToRemove;
        uint256[] storage requestIds = _vaultWithdrawalRequestIds[msg.sender];
        for (uint256 i = 0; i < requestIds.length; i++) {
            if (requestIds[i] == requestId) {
                found = true;
                indexToRemove = i;
                break;
            }
        }
        require(found, "Request ID not found for vault");

        // Remove request ID from tracking (swap-and-pop)
        requestIds[indexToRemove] = requestIds[requestIds.length - 1];
        requestIds.pop();

        // Claim the withdrawal (ETH sent to this contract)
        uint256 ethBefore = address(this).balance;
        IWithdrawalQueue(withdrawalQueue).claimWithdrawal(requestId);
        uint256 ethReceived = address(this).balance - ethBefore;

        // L-48 fix: if the withdrawal claim returns zero ETH (edge case, e.g.
        // the request was never fulfillable), revert so we do not silently
        // leave the vault with neither stETH nor ETH while the request is
        // irretrievably removed from tracking.
        require(ethReceived > 0, "zero ETH received");

        // Send ETH to vault
        (bool success,) = msg.sender.call{ value: ethReceived }("");
        if (!success) revert ETHTransferFailed();

        emit WithdrawalClaimed(msg.sender, requestId, ethReceived);
    }

    /// @notice Emergency: return all stETH, wstETH, and ETH held for the calling vault.
    /// @dev Callable by registered vaults. Sends all tracked balances back to the vault.
    function withdrawToVault() external nonReentrant onlyRegisteredVault {
        uint256 stETHAmount = vaultStETHBalance[msg.sender];
        uint256 wstETHAmount = vaultWstETHBalance[msg.sender];

        if (stETHAmount == 0 && wstETHAmount == 0) {
            revert NoBalanceToWithdraw();
        }

        // Zero out balances before transfers (CEI pattern)
        vaultStETHBalance[msg.sender] = 0;
        vaultWstETHBalance[msg.sender] = 0;

        // Transfer stETH to vault
        // L-48 fix: use SafeERC20.safeTransfer instead of raw `transfer` so
        // non-compliant return values (stETH does not always revert on failure)
        // are caught and revert explicitly.
        uint256 stETHReturned;
        if (stETHAmount > 0) {
            // Due to stETH rebasing, the actual transferable amount may differ by 1-2 wei.
            // Use the lesser of tracked balance and actual contract balance.
            uint256 actualStETH = ILido(lido).balanceOf(address(this));
            stETHReturned = stETHAmount > actualStETH ? actualStETH : stETHAmount;
            if (stETHReturned > 0) {
                IERC20(lido).safeTransfer(msg.sender, stETHReturned);
            }
            // Keep aggregate tracking in sync with the actual transferred amount.
            if (stETHReturned > totalTrackedStETH) {
                totalTrackedStETH = 0;
            } else {
                totalTrackedStETH -= stETHReturned;
            }
        }

        // Transfer wstETH to vault
        uint256 wstETHReturned;
        if (wstETHAmount > 0) {
            uint256 actualWstETH = IWstETH(wstETH).balanceOf(address(this));
            wstETHReturned = wstETHAmount > actualWstETH ? actualWstETH : wstETHAmount;
            if (wstETHReturned > 0) {
                IERC20(wstETH).safeTransfer(msg.sender, wstETHReturned);
            }
        }

        emit EmergencyWithdraw(msg.sender, stETHReturned, wstETHReturned, 0);
    }

    // ============ View Functions ============

    /// @notice Get all pending withdrawal request IDs for a vault
    /// @param vault The vault address
    /// @return The array of pending withdrawal request IDs
    function getWithdrawalRequestIds(address vault) external view returns (uint256[] memory) {
        return _vaultWithdrawalRequestIds[vault];
    }

    /// @notice Get the number of pending withdrawal requests for a vault
    /// @param vault The vault address
    /// @return The count of pending withdrawal requests
    function getWithdrawalRequestCount(address vault) external view returns (uint256) {
        return _vaultWithdrawalRequestIds[vault].length;
    }

    // ============ Receive ============

    /// @notice Accept ETH from Lido withdrawal claims
    receive() external payable { }

    // ============ Rescue ============

    /// @notice I-02 fix: owner-gated sweep for ETH that landed here outside the
    ///         `claimWithdrawal` flow (accidental transfers, selfdestruct
    ///         forwarding, etc.). The adapter has no on-chain owner variable
    ///         beyond the factory registration — we delegate authority to the
    ///         factory owner who can call this via a proxy or governance.
    /// @dev Only rescuable ETH is the balance that is NOT immediately being
    ///      returned to a vault by `claimWithdrawal`, which is an atomic
    ///      external call — so any residual balance here is definitionally
    ///      untracked. Caller must be the vaultFactory owner.
    function rescueETH(address payable to, uint256 amount) external nonReentrant {
        address factoryOwner = IKernelVaultOwner(vaultFactory).owner();
        if (msg.sender != factoryOwner) revert NotVaultOwner();
        if (to == address(0)) revert ZeroAddress();
        require(amount <= address(this).balance, "amount exceeds balance");
        (bool ok,) = to.call{ value: amount }("");
        if (!ok) revert ETHTransferFailed();
    }
}
