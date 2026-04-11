// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ============ Interfaces ============

/// @dev Minimal interface for WTON (wraps TON 1:1 with decimal conversion)
interface IWTON {
    function swapFromTON(uint256 tonAmount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @dev Minimal interface for WSTON (liquid staking wrapper)
interface IWSTON {
    function depositWTONAndGetWSTON(uint256 _amount) external;
    function requestWithdrawal(uint256 _wstonAmount) external;
    function balanceOf(address owner) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @title StakingRouter
/// @notice Batches the full TON -> WTON -> WSTON staking flow into a single transaction.
/// @dev Users approve this router once per token, then call stakeFromTON or stakeFromWTON
///      to execute the entire wrapping pipeline atomically. No tokens should remain in the
///      contract after any call — dust is swept back to the caller.
contract StakingRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Events ============

    /// @notice Emitted when a user stakes tokens and receives WSTON
    event Staked(address indexed user, uint256 tonAmount, uint256 wstonReceived);

    /// @notice Emitted when a user initiates unstaking of WSTON
    event Unstaked(address indexed user, uint256 wstonAmount);

    // ============ Immutable State ============

    /// @notice TON token contract (18 decimals)
    IERC20 public immutable ton;

    /// @notice WTON token contract (27 decimals)
    IWTON public immutable wton;

    /// @notice WSTON liquid staking contract (27 decimals)
    IWSTON public immutable wston;

    // ============ Errors ============

    error ZeroAmount();
    error TransferFailed();

    // ============ Constructor ============

    /// @param _ton  Address of the TON ERC-20 token
    /// @param _wton Address of the WTON contract (supports swapFromTON)
    /// @param _wston Address of the WSTON liquid staking contract
    constructor(address _ton, address _wton, address _wston) {
        require(_ton != address(0) && _wton != address(0) && _wston != address(0), "zero address");
        ton = IERC20(_ton);
        wton = IWTON(_wton);
        wston = IWSTON(_wston);
    }

    // ============ External Functions ============

    /// @notice Stake TON in a single transaction: TON -> WTON -> WSTON
    /// @dev Caller must have approved this contract to spend `tonAmount` of TON.
    ///      The full pipeline is: transfer TON in, swap to WTON, deposit WTON for WSTON,
    ///      transfer WSTON to caller.
    /// @param tonAmount Amount of TON to stake (18 decimals)
    function stakeFromTON(uint256 tonAmount) external nonReentrant {
        if (tonAmount == 0) revert ZeroAmount();

        // 1. Transfer TON from user to this contract
        ton.safeTransferFrom(msg.sender, address(this), tonAmount);

        // 2. Approve WTON contract to spend TON and swap TON -> WTON
        //    M-20: the return value must be checked. A silent false would
        //    consume user TON without minting WTON.
        ton.safeIncreaseAllowance(address(wton), tonAmount);
        if (!wton.swapFromTON(tonAmount)) revert TransferFailed();

        // 3. Calculate WTON received (TON is 18 decimals, WTON is 27 decimals)
        uint256 wtonAmount = tonAmount * 1e9;

        // 4. Approve WSTON contract to spend WTON and deposit WTON -> WSTON
        IERC20(address(wton)).safeIncreaseAllowance(address(wston), wtonAmount);

        uint256 wstonBefore = wston.balanceOf(address(this));
        wston.depositWTONAndGetWSTON(wtonAmount);
        uint256 wstonReceived = wston.balanceOf(address(this)) - wstonBefore;

        // 5. Transfer all WSTON to user
        if (wstonReceived > 0) {
            IERC20(address(wston)).safeTransfer(msg.sender, wstonReceived);
        }

        // 6. Sweep any dust tokens back to caller
        _sweepDust(msg.sender);

        emit Staked(msg.sender, tonAmount, wstonReceived);
    }

    /// @notice Stake WTON directly in a single transaction: WTON -> WSTON
    /// @dev Caller must have approved this contract to spend `wtonAmount` of WTON.
    /// @param wtonAmount Amount of WTON to stake (27 decimals)
    /// @dev I-06 fix: emit the Staked event with the TON-equivalent of the
    ///      WTON input. WTON is the 27-decimal wrapped TON, so the TON-value
    ///      scale is `wtonAmount / 1e18` (27 → 9 decimals drop). We instead
    ///      pass the raw WTON amount as the TON-equivalent placeholder until
    ///      an explicit scaling constant is agreed with off-chain analytics;
    ///      this is still more informative than the previous hardcoded `0`.
    function stakeFromWTON(uint256 wtonAmount) external nonReentrant {
        if (wtonAmount == 0) revert ZeroAmount();

        // 1. Transfer WTON from user to this contract
        IERC20(address(wton)).safeTransferFrom(msg.sender, address(this), wtonAmount);

        // 2. Approve WSTON contract to spend WTON and deposit
        IERC20(address(wton)).safeIncreaseAllowance(address(wston), wtonAmount);

        uint256 wstonBefore = wston.balanceOf(address(this));
        wston.depositWTONAndGetWSTON(wtonAmount);
        uint256 wstonReceived = wston.balanceOf(address(this)) - wstonBefore;

        // 3. Transfer all WSTON to user
        if (wstonReceived > 0) {
            IERC20(address(wston)).safeTransfer(msg.sender, wstonReceived);
        }

        // 4. Sweep any dust tokens back to caller
        _sweepDust(msg.sender);

        // I-06: WTON is 27 decimals, TON is 18 decimals → scale down by 1e9.
        emit Staked(msg.sender, wtonAmount / 1e9, wstonReceived);
    }

    /// @notice Initiate unstaking of WSTON and immediately return it to the caller.
    /// @dev L-07 fix: previously this function pulled WSTON from the user and
    ///      called requestWithdrawal() in the router's own name, stranding the
    ///      withdrawal ownership away from the user. The router now simply
    ///      emits the intent and asks the caller to request the withdrawal
    ///      directly on the WSTON contract so the user remains the owner of the
    ///      pending withdrawal.
    /// @param wstonAmount Amount of WSTON to unstake (27 decimals) — informational only
    function unstake(uint256 wstonAmount) external nonReentrant {
        if (wstonAmount == 0) revert ZeroAmount();

        // Do NOT custody the WSTON here. The caller must approve and call
        // `wston.requestWithdrawal` themselves; this function only records
        // their intent via the Unstaked event for off-chain indexing.
        emit Unstaked(msg.sender, wstonAmount);
    }

    // ============ Internal Functions ============

    /// @dev Sweep any leftover token balances back to the recipient.
    ///      Ensures no value is permanently locked in the router contract.
    function _sweepDust(address recipient) internal {
        uint256 tonDust = ton.balanceOf(address(this));
        if (tonDust > 0) {
            ton.safeTransfer(recipient, tonDust);
        }

        uint256 wtonDust = IERC20(address(wton)).balanceOf(address(this));
        if (wtonDust > 0) {
            IERC20(address(wton)).safeTransfer(recipient, wtonDust);
        }

        uint256 wstonDust = IERC20(address(wston)).balanceOf(address(this));
        if (wstonDust > 0) {
            IERC20(address(wston)).safeTransfer(recipient, wstonDust);
        }
    }
}
