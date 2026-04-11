// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title BuilderProgram
/// @notice Incentive program for agent builders on Tokamak AI Layer.
/// @dev Tracks builder stats (TVL, fees, executions), assigns tiers with
///      differentiated fee splits, and distributes vesting grants.
contract BuilderProgram {
    using SafeERC20 for IERC20;

    // ============ Enums ============

    /// @notice Builder tier based on aggregate TVL
    enum Tier {
        Bronze,
        Silver,
        Gold
    }

    // ============ Structs ============

    /// @notice On-chain profile for a registered builder
    struct Builder {
        address builderAddress;
        string name;
        string url;
        uint256 totalTvl;
        uint256 totalFeesEarned;
        uint256 totalExecutions;
        Tier tier;
        uint256 registeredAt;
    }

    /// @notice Vesting grant allocated to a builder
    struct Grant {
        uint256 totalAmount;
        uint256 claimed;
        uint256 startTime;
        uint256 vestingDuration;
    }

    // ============ Constants ============

    /// @notice TVL threshold for Silver tier (in 18-decimal units, i.e. $100K)
    uint256 public constant SILVER_THRESHOLD = 100_000e18;

    /// @notice TVL threshold for Gold tier (in 18-decimal units, i.e. $1M)
    uint256 public constant GOLD_THRESHOLD = 1_000_000e18;

    /// @notice Basis-point denominator
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // ============ State ============

    /// @notice Contract owner (admin)
    address public owner;

    /// @notice VaultFactory reference for vault validation
    address public vaultFactory;

    /// @notice AgentRegistry reference for agent validation
    address public agentRegistry;

    /// @notice ERC20 token used for grant payments
    IERC20 public grantToken;

    /// @notice Mapping from builder address to Builder profile
    mapping(address => Builder) public builders;

    /// @notice Ordered list of all builder addresses (for enumeration)
    address[] public builderAddresses;

    /// @notice Mapping from builder address to vesting grant
    mapping(address => Grant) public grants;

    /// @notice Addresses authorized to call updateStats (besides owner)
    mapping(address => bool) public authorizedUpdaters;

    // ============ Events ============

    /// @notice Emitted when a new builder registers
    event BuilderRegistered(address indexed builder, string name, string url);

    /// @notice Emitted when builder stats are updated
    event StatsUpdated(address indexed builder, uint256 tvl, uint256 fees, uint256 executions);

    /// @notice Emitted when a builder's tier changes
    event TierChanged(address indexed builder, Tier oldTier, Tier newTier);

    /// @notice Emitted when a grant is allocated to a builder
    event GrantAllocated(address indexed builder, uint256 amount, uint256 vestingDuration);

    /// @notice Emitted when a builder claims vested grant tokens
    event GrantClaimed(address indexed builder, uint256 amount);

    /// @notice Emitted when ownership is transferred
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /// @notice Emitted when an authorized updater is set or removed
    event AuthorizedUpdaterSet(address indexed updater, bool authorized);

    // ============ Errors ============

    /// @notice Caller is not the owner
    error NotOwner();

    /// @notice Caller is not authorized to update stats
    error NotAuthorized();

    /// @notice Builder is already registered
    error AlreadyRegistered();

    /// @notice Builder is not registered
    error NotRegistered();

    /// @notice Zero address not allowed
    error ZeroAddress();

    /// @notice No claimable amount available
    error NothingToClaim();

    /// @notice Invalid grant parameters
    error InvalidGrant();

    /// @notice Name cannot be empty
    error EmptyName();

    // ============ Modifiers ============

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAuthorized() {
        if (msg.sender != owner && !authorizedUpdaters[msg.sender]) revert NotAuthorized();
        _;
    }

    // ============ Constructor ============

    /// @param _vaultFactory The VaultFactory contract address
    /// @param _agentRegistry The AgentRegistry contract address
    /// @param _grantToken The ERC20 token used for grants
    constructor(address _vaultFactory, address _agentRegistry, address _grantToken) {
        if (_vaultFactory == address(0)) revert ZeroAddress();
        if (_agentRegistry == address(0)) revert ZeroAddress();
        if (_grantToken == address(0)) revert ZeroAddress();

        owner = msg.sender;
        vaultFactory = _vaultFactory;
        agentRegistry = _agentRegistry;
        grantToken = IERC20(_grantToken);

        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ============ Owner Functions ============

    /// @notice Transfer ownership to a new address
    /// @param newOwner The new owner address
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Set an authorized updater for stats updates
    /// @param updater The updater address
    /// @param authorized Whether the updater is authorized
    function setAuthorizedUpdater(address updater, bool authorized) external onlyOwner {
        authorizedUpdaters[updater] = authorized;
        emit AuthorizedUpdaterSet(updater, authorized);
    }

    // ============ Builder Registration ============

    /// @notice Register as a builder (anyone can call)
    /// @param name Display name for the builder
    /// @param url Website or profile URL
    function registerBuilder(string calldata name, string calldata url) external {
        if (builders[msg.sender].registeredAt != 0) revert AlreadyRegistered();
        if (bytes(name).length == 0) revert EmptyName();

        builders[msg.sender] = Builder({
            builderAddress: msg.sender,
            name: name,
            url: url,
            totalTvl: 0,
            totalFeesEarned: 0,
            totalExecutions: 0,
            tier: Tier.Bronze,
            registeredAt: block.timestamp
        });

        builderAddresses.push(msg.sender);

        emit BuilderRegistered(msg.sender, name, url);
    }

    // ============ Stats Management ============

    /// @notice Update stats for a builder (owner or authorized updater only)
    /// @param builder The builder address
    /// @param tvl New total TVL value, expressed in 18-decimal normalised
    ///        units. Callers with a multi-decimal vault mix MUST scale
    ///        the vault's native TVL up to 18 decimals before calling —
    ///        e.g. a $50,000 USDC TVL (6 decimals) should be passed as
    ///        `50_000e18`, NOT `50_000e6`. Use `updateStatsWithDecimals`
    ///        if you want the contract to normalise on your behalf.
    /// @param fees New total fees earned value
    /// @param executions New total executions value
    function updateStats(
        address builder,
        uint256 tvl,
        uint256 fees,
        uint256 executions
    ) external onlyAuthorized {
        _updateStatsNormalized(builder, tvl, fees, executions);
    }

    /// @notice Update stats for a builder with automatic decimal
    ///         normalisation.
    /// @param builder The builder address
    /// @param rawTvl TVL in the native decimal precision of `assetDecimals`
    /// @param assetDecimals Number of decimals of the underlying vault
    ///        asset (e.g. 6 for USDC, 8 for WBTC, 18 for WETH).
    /// @param fees New total fees earned value
    /// @param executions New total executions value
    /// @dev Convenience wrapper for callers that track TVL in the vault's
    ///      native decimals. Scales `rawTvl` up to 18-decimal units so
    ///      the tier thresholds — which are denominated in 18-decimal
    ///      units — apply uniformly to all asset decimals. Overflow is
    ///      not a concern because `assetDecimals` is bounded to 18 and
    ///      the multiplier is at most `10 ** 12`.
    function updateStatsWithDecimals(
        address builder,
        uint256 rawTvl,
        uint8 assetDecimals,
        uint256 fees,
        uint256 executions
    ) external onlyAuthorized {
        uint256 normalized;
        if (assetDecimals >= 18) {
            normalized = rawTvl / (10 ** (assetDecimals - 18));
        } else {
            normalized = rawTvl * (10 ** (18 - assetDecimals));
        }
        _updateStatsNormalized(builder, normalized, fees, executions);
    }

    /// @dev Shared body — assumes `tvl` is already in 18-decimal units.
    function _updateStatsNormalized(
        address builder,
        uint256 tvl,
        uint256 fees,
        uint256 executions
    ) internal {
        if (builders[builder].registeredAt == 0) revert NotRegistered();

        Builder storage b = builders[builder];
        b.totalTvl = tvl;
        b.totalFeesEarned = fees;
        b.totalExecutions = executions;

        // Recalculate tier
        Tier oldTier = b.tier;
        Tier newTier = _computeTier(tvl);

        if (newTier != oldTier) {
            b.tier = newTier;
            emit TierChanged(builder, oldTier, newTier);
        }

        emit StatsUpdated(builder, tvl, fees, executions);
    }

    // ============ Tier & Fee Split ============

    /// @notice Get the tier for a builder based on their TVL
    /// @param builder The builder address
    /// @return The builder's current tier
    function getTier(address builder) external view returns (Tier) {
        return _computeTier(builders[builder].totalTvl);
    }

    /// @notice Get the fee split for a builder based on their tier
    /// @param builder The builder address
    /// @return builderBps Builder's share in basis points
    /// @return protocolBps Protocol's share in basis points
    function getFeeSplit(address builder)
        external
        view
        returns (uint256 builderBps, uint256 protocolBps)
    {
        Tier tier = _computeTier(builders[builder].totalTvl);

        if (tier == Tier.Gold) {
            return (9000, 1000);
        } else if (tier == Tier.Silver) {
            return (8000, 2000);
        } else {
            return (7000, 3000);
        }
    }

    // ============ Builder Queries ============

    /// @notice Get full stats for a builder
    /// @param builder The builder address
    /// @return The Builder struct
    function getBuilderStats(address builder) external view returns (Builder memory) {
        return builders[builder];
    }

    /// @notice Get a paginated leaderboard sorted by TVL descending
    /// @param offset Starting index
    /// @param limit Maximum number of results
    /// @return result Array of Builder structs sorted by TVL descending
    function getLeaderboard(uint256 offset, uint256 limit)
        external
        view
        returns (Builder[] memory result)
    {
        uint256 total = builderAddresses.length;
        if (offset >= total) {
            return new Builder[](0);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        // Build a copy of all builders for sorting
        Builder[] memory all = new Builder[](total);
        for (uint256 i = 0; i < total; i++) {
            all[i] = builders[builderAddresses[i]];
        }

        // Simple insertion sort by TVL descending (suitable for on-chain enumeration)
        for (uint256 i = 1; i < total; i++) {
            Builder memory key = all[i];
            uint256 j = i;
            while (j > 0 && all[j - 1].totalTvl < key.totalTvl) {
                all[j] = all[j - 1];
                j--;
            }
            all[j] = key;
        }

        // Extract the requested page
        uint256 count = end - offset;
        result = new Builder[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = all[offset + i];
        }

        return result;
    }

    /// @notice Get the total number of registered builders
    /// @return The builder count
    function builderCount() external view returns (uint256) {
        return builderAddresses.length;
    }

    // ============ Grant Management ============

    /// @notice Allocate a vesting grant to a builder (owner only)
    /// @dev Transfers `amount` of grantToken from the caller to this contract.
    /// @param builder The builder address
    /// @param amount Total grant amount
    /// @param vestingDuration Duration over which the grant vests (seconds)
    function allocateGrant(
        address builder,
        uint256 amount,
        uint256 vestingDuration
    ) external onlyOwner {
        if (builders[builder].registeredAt == 0) revert NotRegistered();
        if (amount == 0 || vestingDuration == 0) revert InvalidGrant();

        // Transfer tokens from owner to this contract
        grantToken.safeTransferFrom(msg.sender, address(this), amount);

        // If builder already has a grant, add to it (keeping earliest startTime)
        Grant storage g = grants[builder];
        if (g.totalAmount > 0) {
            // L-16 fix: reject top-ups on grants that have already fully vested.
            // Otherwise the incremental amount would be immediately claimable
            // (getClaimable returns g.totalAmount when elapsed >= duration),
            // bypassing the vesting schedule entirely.
            if (block.timestamp >= g.startTime + g.vestingDuration) {
                revert InvalidGrant();
            }
            // Top-up: add amount, keep existing vesting schedule
            g.totalAmount += amount;
            // L-53 fix: the stored schedule was NOT updated by the top-up, so
            // emit the ACTUAL in-effect vestingDuration rather than the caller's
            // parameter that would mislead indexers.
            emit GrantAllocated(builder, amount, g.vestingDuration);
        } else {
            grants[builder] = Grant({
                totalAmount: amount,
                claimed: 0,
                startTime: block.timestamp,
                vestingDuration: vestingDuration
            });
            emit GrantAllocated(builder, amount, vestingDuration);
        }
    }

    /// @notice Claim vested portion of a builder's grant
    function claimGrant() external {
        if (builders[msg.sender].registeredAt == 0) revert NotRegistered();

        uint256 claimable = getClaimable(msg.sender);
        if (claimable == 0) revert NothingToClaim();

        grants[msg.sender].claimed += claimable;

        grantToken.safeTransfer(msg.sender, claimable);

        emit GrantClaimed(msg.sender, claimable);
    }

    /// @notice Get the claimable (vested but unclaimed) amount for a builder
    /// @param builder The builder address
    /// @return The claimable amount
    function getClaimable(address builder) public view returns (uint256) {
        Grant memory g = grants[builder];
        if (g.totalAmount == 0) return 0;

        uint256 elapsed = block.timestamp - g.startTime;
        uint256 vested;

        if (elapsed >= g.vestingDuration) {
            vested = g.totalAmount;
        } else {
            vested = (g.totalAmount * elapsed) / g.vestingDuration;
        }

        if (vested <= g.claimed) return 0;
        return vested - g.claimed;
    }

    // ============ Internal Functions ============

    /// @notice Compute the tier for a given TVL
    /// @param tvl The total value locked
    /// @return The computed tier
    function _computeTier(uint256 tvl) internal pure returns (Tier) {
        if (tvl >= GOLD_THRESHOLD) {
            return Tier.Gold;
        } else if (tvl >= SILVER_THRESHOLD) {
            return Tier.Silver;
        } else {
            return Tier.Bronze;
        }
    }
}
