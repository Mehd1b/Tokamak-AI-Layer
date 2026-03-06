// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title IBondManager
/// @notice Interface for managing operator bonds in the optimistic execution framework
/// @dev Bonds are locked when operators submit optimistic executions and released/slashed
///      based on whether valid proofs are submitted within the challenge window.
///      Chain-agnostic: bonds are denominated in an ERC20 token (e.g., WSTON).
interface IBondManager {
    /// @notice Lock a bond for an operator submitting an optimistic execution
    /// @dev Caller must have approved this contract to spend `amount` of bondToken.
    /// @param operator The operator address (vault owner)
    /// @param vault The vault address the execution targets
    /// @param nonce The execution nonce (unique per vault)
    /// @param amount The bond amount to lock (in bondToken units)
    function lockBond(
        address operator,
        address vault,
        uint64 nonce,
        uint256 amount
    ) external;

    /// @notice Release a bond back to the operator after proof submission
    /// @param operator The operator address
    /// @param vault The vault address
    /// @param nonce The execution nonce
    function releaseBond(address operator, address vault, uint64 nonce) external;

    /// @notice Slash a bond after challenge window expiry or self-slash
    /// @dev Distribution: 10% to slasher (finder fee), 80% to vault (depositors), 10% to treasury.
    ///      If slasher == address(0) (self-slash), finder share goes to vault (90% vault, 10% treasury).
    /// @param operator The operator address
    /// @param vault The vault address
    /// @param nonce The execution nonce
    /// @param slasher The address that triggered the slash (address(0) for self-slash)
    function slashBond(
        address operator,
        address vault,
        uint64 nonce,
        address slasher
    ) external;

    /// @notice Get the minimum bond required for a vault
    /// @param vault The vault address
    /// @return The minimum bond amount in bondToken units
    function getMinBond(address vault) external view returns (uint256);

    /// @notice Get the total bonded amount for an operator
    /// @param operator The operator address
    /// @return The total amount currently bonded
    function getBondedAmount(address operator) external view returns (uint256);

    /// @notice Get the ERC20 token used for bonds
    /// @return The bond token address
    function bondToken() external view returns (address);
}
