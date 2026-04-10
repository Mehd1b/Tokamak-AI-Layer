// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IVaultFactory } from "./interfaces/IVaultFactory.sol";

/// @title IKernelVaultLike
/// @notice Minimal interface for interacting with KernelVault (deposit/withdraw/shares)
interface IKernelVaultLike {
    function asset() external view returns (IERC20);
    function depositERC20Tokens(uint256 assets) external returns (uint256 sharesMinted);
    function withdraw(uint256 shareAmount) external returns (uint256 assetsOut);
    function totalAssets() external view returns (uint256);
    /// @notice Returns the frozen pre-strategy snapshot during an active strategy, and
    ///         the live totalAssets at other times. MetaVault MUST use this for NAV
    ///         pricing during an active strategy (H-01).
    function effectiveTotalAssets() external view returns (uint256);
    function totalShares() external view returns (uint256);
    function shares(address account) external view returns (uint256);
}

/// @title MetaVault
/// @notice A vault-of-vaults that holds shares of multiple KernelVaults, providing
///         diversified exposure to different agent strategies through a single deposit.
/// @dev Deposits accept the base asset (e.g., USDC) and mint meta shares based on NAV.
///      Allocation to underlying KernelVaults happens only during rebalance, not on deposit.
///      Withdrawals pull proportionally from underlying vaults when idle balance is insufficient.
contract MetaVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    /// @notice Virtual offset for share/asset math (prevents inflation/donation attacks)
    uint256 public constant DECIMALS_OFFSET = 1e3;

    /// @notice Basis points denominator
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Maximum allocation per vault (40%)
    uint256 public constant MAX_ALLOCATION_BPS = 4000;

    /// @notice Minimum time between rebalances (1 hour)
    uint256 public constant REBALANCE_COOLDOWN = 1 hours;

    /// @notice Maximum NAV drop allowed during rebalance (2% = 200 bps)
    uint256 public constant MAX_REBALANCE_SLIPPAGE_BPS = 200;

    // ============ Immutables ============

    /// @notice The deposit token (e.g., USDC)
    IERC20 public immutable baseAsset;

    /// @notice Reference to VaultFactory for validation
    IVaultFactory public immutable vaultFactory;

    // ============ State ============

    /// @notice Admin address
    address public owner;

    /// @notice Total meta shares outstanding
    uint256 public totalShares;

    /// @notice Meta shares per account
    mapping(address => uint256) public shares;

    /// @notice Ordered list of whitelisted underlying KernelVaults
    address[] public underlyingVaults;

    /// @notice Target allocation in basis points per vault (must sum to 10000)
    mapping(address => uint256) public targetWeights;

    /// @notice Whether an address is a whitelisted underlying vault
    mapping(address => bool) public isUnderlyingVault;

    /// @notice Timestamp of the last rebalance
    uint256 public lastRebalanceTimestamp;

    /// @notice Internally-tracked idle balance (M-14 fix).
    /// @dev NAV calculations use this value rather than `baseAsset.balanceOf(this)`,
    ///      which prevents a direct ERC20 donation from inflating NAV and diluting
    ///      new depositors. Any balance above `trackedIdle` can be reclaimed via
    ///      {sweepDonations} by the owner without affecting existing depositors.
    uint256 public trackedIdle;

    // ============ Events ============

    /// @notice Emitted when a user deposits base asset and receives meta shares
    event Deposit(address indexed user, uint256 assets, uint256 shares);

    /// @notice Emitted when a user withdraws by burning meta shares
    event Withdraw(address indexed user, uint256 assets, uint256 shares);

    /// @notice Emitted after a successful rebalance
    event Rebalanced(uint256 timestamp, uint256 navBefore, uint256 navAfter);

    /// @notice Emitted when an underlying vault is added
    event VaultAdded(address indexed vault, uint256 weightBps);

    /// @notice Emitted when an underlying vault is removed
    event VaultRemoved(address indexed vault);

    /// @notice Emitted when a deposit to an underlying vault fails during rebalance
    event RebalanceDepositFailed(address indexed vault, uint256 amount);

    /// @notice Emitted when a withdrawal from an underlying vault fails during rebalance
    event RebalanceWithdrawFailed(address indexed vault, uint256 amount);

    // ============ Errors ============

    error NotOwner();
    error ZeroDeposit();
    error ZeroShares();
    error InsufficientShares(uint256 requested, uint256 available);
    error ZeroAssetsOut();
    error VaultNotFactoryDeployed(address vault);
    error VaultAssetMismatch(address vault);
    error VaultAlreadyAdded(address vault);
    error VaultNotWhitelisted(address vault);
    error VaultHasAllocation(address vault, uint256 allocation);
    error WeightExceedsMax(uint256 weightBps);
    error WeightSumMismatch(uint256 actual, uint256 expected);
    error RebalanceCooldown(uint256 nextAllowed, uint256 current);
    error RebalanceSlippageExceeded(uint256 navBefore, uint256 navAfter);
    error ArrayLengthMismatch();
    error ZeroAddress();
    /// @notice Withdrawal shortfall exceeds acceptable threshold
    error WithdrawalShortfall(uint256 expected, uint256 available);

    // ============ Modifiers ============

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ============ Constructor ============

    /// @param _baseAsset The deposit token (e.g., USDC)
    /// @param _vaultFactory The VaultFactory for validating underlying vaults
    /// @param _owner The admin address
    constructor(address _baseAsset, address _vaultFactory, address _owner) {
        if (_baseAsset == address(0)) revert ZeroAddress();
        if (_vaultFactory == address(0)) revert ZeroAddress();
        if (_owner == address(0)) revert ZeroAddress();

        baseAsset = IERC20(_baseAsset);
        vaultFactory = IVaultFactory(_vaultFactory);
        owner = _owner;
    }

    // ============ Core Functions ============

    /// @notice Deposit base asset and receive meta shares based on current NAV
    /// @dev Does NOT auto-allocate to underlying vaults. Allocation happens during rebalance.
    /// @param assets Amount of base asset to deposit
    /// @return sharesOut Number of meta shares minted
    function deposit(uint256 assets) external nonReentrant returns (uint256 sharesOut) {
        if (assets == 0) revert ZeroDeposit();

        uint256 nav = getNav();

        // Transfer base asset from sender
        uint256 balBefore = baseAsset.balanceOf(address(this));
        baseAsset.safeTransferFrom(msg.sender, address(this), assets);
        uint256 actualReceived = baseAsset.balanceOf(address(this)) - balBefore;

        // Calculate shares: assets * (totalShares + OFFSET) / (nav + 1)
        sharesOut = (actualReceived * (totalShares + DECIMALS_OFFSET)) / (nav + 1);
        if (sharesOut == 0) revert ZeroShares();

        shares[msg.sender] += sharesOut;
        totalShares += sharesOut;

        // M-14 fix: credit the tracked idle balance with the actual received amount.
        trackedIdle += actualReceived;

        emit Deposit(msg.sender, actualReceived, sharesOut);
    }

    /// @notice Withdraw by burning meta shares. Pulls from idle balance first, then from
    ///         underlying vaults in reverse weight order if insufficient idle balance.
    /// @param metaShares Number of meta shares to burn
    /// @return assetsOut Amount of base asset returned
    function withdraw(uint256 metaShares) external nonReentrant returns (uint256 assetsOut) {
        if (metaShares == 0) revert ZeroShares();
        if (shares[msg.sender] < metaShares) {
            revert InsufficientShares(metaShares, shares[msg.sender]);
        }

        uint256 nav = getNav();

        // M-01 fix: use the same virtual-offset formula as deposit. Without the
        // DECIMALS_OFFSET term the withdraw path over-pays early-stage withdrawers
        // relative to the offset-protected deposit path.
        assetsOut = (metaShares * (nav + 1)) / (totalShares + DECIMALS_OFFSET);
        if (assetsOut == 0) revert ZeroAssetsOut();

        // L-04 fix: ensure sufficient assets BEFORE burning shares. If the pull
        // from underlyings reverts, the user keeps their shares.
        uint256 idle = trackedIdle;
        if (idle < assetsOut) {
            uint256 deficit = assetsOut - idle;
            _withdrawFromUnderlyings(deficit);
            // The pull increases the actual ERC20 balance; update the tracked idle
            // to reflect the new idle balance (honors any donations already present).
            trackedIdle = baseAsset.balanceOf(address(this));
        }

        // Burn shares (after liquidity has been secured)
        shares[msg.sender] -= metaShares;
        totalShares -= metaShares;

        // Cap to tracked idle (M-14: donations are NOT used to service withdrawals)
        uint256 available = trackedIdle;
        if (assetsOut > available) {
            // Allow 1 unit of dust for rounding, revert on material shortfall
            if (assetsOut - available > 1) {
                revert WithdrawalShortfall(assetsOut, available);
            }
            assetsOut = available;
        }

        trackedIdle = available - assetsOut;
        baseAsset.safeTransfer(msg.sender, assetsOut);

        emit Withdraw(msg.sender, assetsOut, metaShares);
    }

    /// @notice Sweep ERC20 donations above the tracked idle to the owner.
    /// @dev M-14: prevents donation NAV inflation. Anyone who transfers baseAsset
    ///      directly to the MetaVault forfeits those funds — the owner can reclaim
    ///      the delta between the true balance and the tracked idle without
    ///      affecting NAV.
    function sweepDonations() external nonReentrant onlyOwner {
        uint256 actual = baseAsset.balanceOf(address(this));
        if (actual > trackedIdle) {
            uint256 excess = actual - trackedIdle;
            baseAsset.safeTransfer(owner, excess);
        }
    }

    /// @notice Rebalance allocations across underlying vaults.
    ///         Withdraws from overweight vaults and deposits to underweight vaults.
    /// @dev Only callable by owner. Enforces 1-hour cooldown and 2% max NAV slippage.
    /// @param vaults Array of vault addresses (must match underlyingVaults)
    /// @param newWeightsBps Array of new target weights in basis points
    function rebalance(address[] calldata vaults, uint256[] calldata newWeightsBps)
        external
        nonReentrant
        onlyOwner
    {
        if (vaults.length != newWeightsBps.length) revert ArrayLengthMismatch();
        if (lastRebalanceTimestamp != 0
            && block.timestamp < lastRebalanceTimestamp + REBALANCE_COOLDOWN)
        {
            revert RebalanceCooldown(lastRebalanceTimestamp + REBALANCE_COOLDOWN, block.timestamp);
        }

        uint256 navBefore = getNav();

        // Validate and set new weights for the SUBMITTED array first
        for (uint256 i = 0; i < vaults.length; i++) {
            if (!isUnderlyingVault[vaults[i]]) revert VaultNotWhitelisted(vaults[i]);
            if (newWeightsBps[i] > MAX_ALLOCATION_BPS) revert WeightExceedsMax(newWeightsBps[i]);
            targetWeights[vaults[i]] = newWeightsBps[i];
        }

        // M-06 fix: validate the GLOBAL weight sum across ALL underlying vaults,
        // not just the submitted array. Omitted vaults retain their stale weight
        // which can push targets above 100% of NAV.
        uint256 globalSum;
        for (uint256 i = 0; i < underlyingVaults.length; i++) {
            globalSum += targetWeights[underlyingVaults[i]];
        }
        if (globalSum != BPS_DENOMINATOR) {
            revert WeightSumMismatch(globalSum, BPS_DENOMINATOR);
        }

        // Phase 1: Withdraw from overweight vaults (bring them to target or below)
        for (uint256 i = 0; i < underlyingVaults.length; i++) {
            address vault = underlyingVaults[i];
            uint256 currentValue = _vaultAllocation(vault);
            uint256 targetValue = (navBefore * targetWeights[vault]) / BPS_DENOMINATOR;

            if (currentValue > targetValue) {
                uint256 excess = currentValue - targetValue;
                try this.withdrawFromVaultExternal(vault, excess) {
                    // success
                } catch {
                    emit RebalanceWithdrawFailed(vault, excess);
                }
            }
        }

        // L-02 fix: re-read NAV after Phase 1 so Phase 2 deposits are sized against
        // the actual post-withdraw NAV (which may have shifted due to slippage/ rounding).
        uint256 navMid = getNav();

        // Phase 2: Deposit to underweight vaults (using post-Phase-1 NAV)
        for (uint256 i = 0; i < underlyingVaults.length; i++) {
            address vault = underlyingVaults[i];
            uint256 currentValue = _vaultAllocation(vault);
            uint256 targetValue = (navMid * targetWeights[vault]) / BPS_DENOMINATOR;

            if (currentValue < targetValue) {
                uint256 deficit = targetValue - currentValue;
                uint256 available = trackedIdle;
                uint256 toDeposit = deficit < available ? deficit : available;
                if (toDeposit > 0) {
                    try this.depositToVaultExternal(vault, toDeposit) {
                        // success
                    } catch {
                        emit RebalanceDepositFailed(vault, toDeposit);
                    }
                }
            }
        }

        lastRebalanceTimestamp = block.timestamp;

        // Slippage guard: revert if NAV dropped > 2%
        uint256 navAfter = getNav();
        if (navBefore > 0) {
            uint256 maxDrop = (navBefore * MAX_REBALANCE_SLIPPAGE_BPS) / BPS_DENOMINATOR;
            if (navAfter + maxDrop < navBefore) {
                revert RebalanceSlippageExceeded(navBefore, navAfter);
            }
        }

        emit Rebalanced(block.timestamp, navBefore, navAfter);
    }

    // ============ Vault Management ============

    /// @notice Add an underlying KernelVault to the whitelist
    /// @dev Vault must be factory-deployed and use the same base asset
    /// @param vault Address of the KernelVault to add
    /// @param weightBps Target weight in basis points for this vault
    function addVault(address vault, uint256 weightBps) external onlyOwner {
        if (vault == address(0)) revert ZeroAddress();
        if (!vaultFactory.isDeployedVault(vault)) revert VaultNotFactoryDeployed(vault);
        if (isUnderlyingVault[vault]) revert VaultAlreadyAdded(vault);
        if (weightBps > MAX_ALLOCATION_BPS) revert WeightExceedsMax(weightBps);

        // Verify the vault uses the same base asset
        IKernelVaultLike kernelVault = IKernelVaultLike(vault);
        if (address(kernelVault.asset()) != address(baseAsset)) {
            revert VaultAssetMismatch(vault);
        }

        isUnderlyingVault[vault] = true;
        underlyingVaults.push(vault);
        targetWeights[vault] = weightBps;

        emit VaultAdded(vault, weightBps);
    }

    /// @notice Remove an underlying vault from the whitelist
    /// @dev Must withdraw all allocation from the vault first (allocation must be 0)
    /// @param vault Address of the KernelVault to remove
    function removeVault(address vault) external onlyOwner {
        if (!isUnderlyingVault[vault]) revert VaultNotWhitelisted(vault);

        uint256 allocation = _vaultAllocation(vault);
        if (allocation > 0) revert VaultHasAllocation(vault, allocation);

        isUnderlyingVault[vault] = false;
        targetWeights[vault] = 0;

        // Remove from array (swap and pop)
        uint256 len = underlyingVaults.length;
        for (uint256 i = 0; i < len; i++) {
            if (underlyingVaults[i] == vault) {
                underlyingVaults[i] = underlyingVaults[len - 1];
                underlyingVaults.pop();
                break;
            }
        }

        emit VaultRemoved(vault);
    }

    // ============ View Functions ============

    /// @notice Calculate the total net asset value of the MetaVault
    /// @return Total NAV = idle base asset balance + sum of underlying vault allocations
    function getNav() public view returns (uint256) {
        // M-14 fix: use the tracked idle balance (not baseAsset.balanceOf(this))
        // so unsolicited donations cannot inflate NAV.
        uint256 idle = trackedIdle;
        uint256 underlyingValue;

        for (uint256 i = 0; i < underlyingVaults.length; i++) {
            underlyingValue += _vaultAllocation(underlyingVaults[i]);
        }

        return idle + underlyingValue;
    }

    /// @notice Get current allocations across all underlying vaults
    /// @return vaults Array of underlying vault addresses
    /// @return values Array of current value held in each vault (in base asset terms)
    function getUnderlyingAllocations()
        external
        view
        returns (address[] memory vaults, uint256[] memory values)
    {
        uint256 len = underlyingVaults.length;
        vaults = new address[](len);
        values = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            vaults[i] = underlyingVaults[i];
            values[i] = _vaultAllocation(underlyingVaults[i]);
        }
    }

    /// @notice Get the number of underlying vaults
    /// @return Number of whitelisted underlying vaults
    function getUnderlyingVaultCount() external view returns (uint256) {
        return underlyingVaults.length;
    }

    // ============ External Self-Call Wrappers (for try-catch) ============

    /// @notice External wrapper for vault deposits (used by rebalance try-catch)
    /// @dev Only callable by this contract itself
    function depositToVaultExternal(address vault, uint256 assets) external {
        require(msg.sender == address(this), "only self");
        _depositToVault(vault, assets);
    }

    /// @notice External wrapper for vault withdrawals (used by rebalance try-catch)
    /// @dev Only callable by this contract itself
    function withdrawFromVaultExternal(address vault, uint256 targetAssets) external returns (uint256) {
        require(msg.sender == address(this), "only self");
        return _withdrawFromVault(vault, targetAssets);
    }

    // ============ Internal Functions ============

    /// @notice Calculate the current value of this MetaVault's holdings in an underlying vault
    /// @dev Uses previewRedeem-style math: shares * (totalAssets + 1) / (totalShares + OFFSET)
    /// @param vault Address of the underlying KernelVault
    /// @return value Current value in base asset terms
    function _vaultAllocation(address vault) internal view returns (uint256 value) {
        IKernelVaultLike kv = IKernelVaultLike(vault);
        uint256 myShares = kv.shares(address(this));
        if (myShares == 0) return 0;

        // H-01 fix: use effectiveTotalAssets() rather than totalAssets(). During an
        // active strategy the vault's live totalAssets() is the depleted balance,
        // but the vault prices withdrawals against the frozen pre-strategy snapshot.
        // Using the snapshot here makes MetaVault deposits/withdrawals consistent
        // with the KernelVault's own pricing, closing the undervalue-and-grab window.
        uint256 vaultTotalAssets = kv.effectiveTotalAssets();
        uint256 vaultTotalShares = kv.totalShares();

        // Same formula as KernelVault._processWithdraw:
        // assets = shares * (totalAssets + 1) / (totalShares + OFFSET)
        value = (myShares * (vaultTotalAssets + 1)) / (vaultTotalShares + DECIMALS_OFFSET);
    }

    /// @notice Withdraw deficit from underlying vaults in reverse weight order (heaviest last)
    /// @param deficit Amount of base asset needed beyond idle balance
    function _withdrawFromUnderlyings(uint256 deficit) internal {
        // Withdraw in reverse order of underlyingVaults (reverse weight order)
        uint256 remaining = deficit;
        uint256 len = underlyingVaults.length;

        for (uint256 i = len; i > 0 && remaining > 0; i--) {
            address vault = underlyingVaults[i - 1];
            uint256 allocation = _vaultAllocation(vault);
            if (allocation == 0) continue;

            uint256 toWithdraw = remaining < allocation ? remaining : allocation;
            uint256 actualOut = _withdrawFromVault(vault, toWithdraw);
            remaining = actualOut >= remaining ? 0 : remaining - actualOut;
        }
    }

    /// @notice Withdraw a target amount of base asset from an underlying vault
    /// @param vault Address of the underlying KernelVault
    /// @param targetAssets Desired amount of base asset to withdraw
    /// @return actualOut Actual amount received
    function _withdrawFromVault(address vault, uint256 targetAssets)
        internal
        returns (uint256 actualOut)
    {
        IKernelVaultLike kv = IKernelVaultLike(vault);
        uint256 myShares = kv.shares(address(this));
        if (myShares == 0) return 0;

        // H-01: price our shares against effectiveTotalAssets (snapshot during
        // active strategy) so the computed sharesToBurn is consistent with the
        // vault's own pricing.
        uint256 vaultTotalAssets = kv.effectiveTotalAssets();
        uint256 vaultTotalShares = kv.totalShares();

        // Calculate shares needed: targetAssets * (totalShares + OFFSET) / (totalAssets + 1)
        uint256 sharesToBurn =
            (targetAssets * (vaultTotalShares + DECIMALS_OFFSET)) / (vaultTotalAssets + 1);

        // Cap to our actual share balance
        if (sharesToBurn > myShares) {
            sharesToBurn = myShares;
        }

        if (sharesToBurn == 0) return 0;

        uint256 balBefore = baseAsset.balanceOf(address(this));
        kv.withdraw(sharesToBurn);
        actualOut = baseAsset.balanceOf(address(this)) - balBefore;

        // Maintain trackedIdle: the withdrawn assets increase our idle balance.
        trackedIdle += actualOut;
    }

    /// @notice Deposit base asset into an underlying vault
    /// @param vault Address of the underlying KernelVault
    /// @param assets Amount of base asset to deposit
    function _depositToVault(address vault, uint256 assets) internal {
        baseAsset.forceApprove(vault, assets);
        IKernelVaultLike(vault).depositERC20Tokens(assets);
        // Maintain trackedIdle: assets leave idle into the underlying allocation.
        // The allocation is reflected by _vaultAllocation via the KernelVault shares.
        if (assets > trackedIdle) {
            trackedIdle = 0;
        } else {
            trackedIdle -= assets;
        }
    }
}
