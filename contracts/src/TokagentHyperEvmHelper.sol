// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title TokagentHyperEvmHelper
/// @notice Stateless helper for TokagentVault-driven HyperCore interactions.
/// @dev
///   TokagentVault's executeBatch rejects calls with calldata shorter than 4 bytes
///   (the selector check). That makes it impossible for the vault to directly send
///   native HYPE to the HyperCore bridge at 0x2222...2222 (which takes empty calldata).
///   This helper wraps the native transfer in a selector-addressable function.
///
///   Usage: operator builds a Call { target: helper, data: bridgeHype(amount), value: amount }
///   and submits via vault.executeBatch. The helper forwards the value to the bridge.
///
///   The helper is stateless — no ownership, no admin, no upgradability. Anyone can call
///   it. The vault's allowlist gate is the authorization boundary.
///
///   Selector reference (keccak256 first 4 bytes):
///     bridgeHype(uint256)      => 0xf4e0b185
///     dispatchCoreWriter(bytes) => 0xa62c829a
contract TokagentHyperEvmHelper {
    /// @notice Well-known HyperCore native-token bridge address.
    address payable public constant HYPE_BRIDGE = payable(0x2222222222222222222222222222222222222222);

    /// @notice HyperCore precompile / system contract that accepts CoreWriter action bytes.
    address public constant CORE_WRITER = 0x3333333333333333333333333333333333333333;

    error AmountMismatch(uint256 value, uint256 amount);
    error BridgeFailed();
    error CoreWriterCallFailed();

    event HypeBridged(address indexed from, uint256 amount);
    event CoreWriterDispatched(address indexed from, bytes4 actionHeader, uint256 dataLen);

    /// @notice Forward `amount` of native HYPE to the HyperCore bridge.
    /// @dev msg.value MUST equal `amount` (protects against allowlist-value mismatch).
    ///      selector: 0xf4e0b185
    function bridgeHype(uint256 amount) external payable {
        if (msg.value != amount) revert AmountMismatch(msg.value, amount);
        (bool ok, ) = HYPE_BRIDGE.call{value: amount}("");
        if (!ok) revert BridgeFailed();
        emit HypeBridged(msg.sender, amount);
    }

    /// @notice Forward a pre-encoded CoreWriter action to the CoreWriter precompile.
    /// @param actionBytes Full encoded CoreWriter action:
    ///        `abi.encodePacked(uint8(1), uint24(actionId), abi.encode(params...))`.
    /// @dev
    ///   CoreWriter actions are non-reverting from the EVM perspective (HyperCore
    ///   consumes them asynchronously; errors surface as no-ops). We revert on
    ///   the low-level call failure (infrastructure-level error) for observability.
    ///   selector: 0xa62c829a
    function dispatchCoreWriter(bytes calldata actionBytes) external {
        if (actionBytes.length < 4) revert CoreWriterCallFailed();
        bytes4 header = bytes4(actionBytes[0:4]);
        (bool ok, ) = CORE_WRITER.call(actionBytes);
        if (!ok) revert CoreWriterCallFailed();
        emit CoreWriterDispatched(msg.sender, header, actionBytes.length);
    }
}
