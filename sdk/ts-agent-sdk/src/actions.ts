/**
 * Action builder functions for constructing well-formed ActionV1 instances.
 *
 * These mirror the Rust helper constructors in kernel-sdk/src/types.rs.
 */

import type { ActionV1 } from "./types.js";
import { ActionType } from "./types.js";

/** Hex string type (0x-prefixed). */
export type Hex = `0x${string}`;

// ============================================================================
// Internal Helpers
// ============================================================================

/** Convert a hex string to Uint8Array. */
function hexToBytes(hex: Hex): Uint8Array {
  const stripped = hex.slice(2);
  if (stripped.length % 2 !== 0) {
    throw new Error(`Invalid hex string: odd length`);
  }
  const bytes = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert a 20-byte EVM address (as hex) to a 32-byte left-padded target.
 *
 * The resulting bytes32 has:
 * - Upper 12 bytes: 0x00
 * - Lower 20 bytes: The EVM address
 */
function addressToBytes32(addr: Hex): Uint8Array {
  const addrBytes = hexToBytes(addr);
  if (addrBytes.length !== 20) {
    throw new Error(`Expected 20-byte address, got ${addrBytes.length} bytes`);
  }
  const result = new Uint8Array(32);
  result.set(addrBytes, 12);
  return result;
}

/**
 * Encode a u256 value (from bigint) in big-endian format for ABI encoding.
 * Values must fit in u128 range (the Rust side uses u128).
 */
function encodeU256BE(value: bigint): Uint8Array {
  if (value < 0n) {
    throw new Error("Value must be non-negative");
  }
  const result = new Uint8Array(32);
  // Write as big-endian: fill from the right
  let v = value;
  for (let i = 31; i >= 0; i--) {
    result[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return result;
}

// ============================================================================
// Action Builders
// ============================================================================

export const Actions = {
  /**
   * Create a CALL action for on-chain execution.
   *
   * Executed by KernelVault as: `target.call{value: value}(calldata)`
   *
   * @param target - 20-byte EVM address as 0x-prefixed hex
   * @param value - ETH value to send in wei
   * @param calldata - Raw calldata bytes as 0x-prefixed hex
   * @returns ActionV1 with ABI-encoded payload
   *
   * Payload format (ABI-encoded `abi.encode(uint256 value, bytes callData)`):
   * - bytes 0-31: value as uint256 (big-endian)
   * - bytes 32-63: offset to bytes data (always 64 = 0x40)
   * - bytes 64-95: length of callData
   * - bytes 96+: callData (padded to 32-byte boundary)
   */
  call(target: Hex, value: bigint, calldata: Hex): ActionV1 {
    const calldataBytes = hexToBytes(calldata);
    const paddedLen = Math.ceil(calldataBytes.length / 32) * 32;
    const totalSize = 96 + paddedLen;

    const payload = new Uint8Array(totalSize);

    // 1. uint256 value
    payload.set(encodeU256BE(value), 0);

    // 2. offset to bytes data (always 64 = 0x40)
    payload.set(encodeU256BE(64n), 32);

    // 3. length of bytes data
    payload.set(encodeU256BE(BigInt(calldataBytes.length)), 64);

    // 4. bytes data (already zero-padded by Uint8Array initialization)
    payload.set(calldataBytes, 96);

    return {
      actionType: ActionType.CALL,
      target: addressToBytes32(target),
      payload,
    };
  },

  /**
   * Create a TRANSFER_ERC20 action for on-chain execution.
   *
   * Executed by KernelVault as: `IERC20(token).transfer(to, amount)`
   *
   * @param token - ERC20 token address as 0x-prefixed hex
   * @param to - Recipient address as 0x-prefixed hex
   * @param amount - Amount to transfer in token's smallest unit
   * @returns ActionV1 with 96-byte ABI-encoded payload
   *
   * Payload format (ABI-encoded `abi.encode(address token, address to, uint256 amount)`):
   * - bytes 0-31: token address (left-padded to 32 bytes)
   * - bytes 32-63: to address (left-padded to 32 bytes)
   * - bytes 64-95: amount as uint256 (big-endian)
   */
  transferERC20(token: Hex, to: Hex, amount: bigint): ActionV1 {
    const payload = new Uint8Array(96);

    // 1. address token (left-padded)
    payload.set(addressToBytes32(token), 0);

    // 2. address to (left-padded)
    payload.set(addressToBytes32(to), 32);

    // 3. uint256 amount
    payload.set(encodeU256BE(amount), 64);

    return {
      actionType: ActionType.TRANSFER_ERC20,
      target: new Uint8Array(32), // target unused for ERC20 transfers
      payload,
    };
  },

  /**
   * Create a NO_OP action.
   *
   * Skipped during on-chain execution. Useful for padding or placeholders.
   */
  noOp(): ActionV1 {
    return {
      actionType: ActionType.NO_OP,
      target: new Uint8Array(32),
      payload: new Uint8Array(0),
    };
  },
} as const;
