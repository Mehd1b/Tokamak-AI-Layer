"""Action builder helpers matching the Rust kernel-sdk helpers.

Payload encoding follows Solidity ABI conventions:
- CALL payload: abi.encode(uint256 value, bytes callData)
- TRANSFER_ERC20 payload: abi.encode(address token, address to, uint256 amount)
"""

from __future__ import annotations

from .types import ActionType, ActionV1


# ---------------------------------------------------------------------------
# Address helper
# ---------------------------------------------------------------------------

def address_to_bytes32(addr: str | bytes) -> bytes:
    """Convert a 20-byte EVM address to bytes32 (left-padded with 12 zero bytes).

    Accepts either a hex string (with or without ``0x`` prefix) or raw 20 bytes.
    """
    if isinstance(addr, str):
        addr = bytes.fromhex(addr.removeprefix("0x"))
    if len(addr) != 20:
        raise ValueError(f"address must be 20 bytes, got {len(addr)}")
    return b"\x00" * 12 + addr


# ---------------------------------------------------------------------------
# ABI-encoding helpers (pure stdlib, no eth-abi dependency here)
# ---------------------------------------------------------------------------

def _encode_u256_be(value: int) -> bytes:
    """Encode a non-negative integer as a big-endian uint256 (32 bytes)."""
    return value.to_bytes(32, byteorder="big")


def _encode_call_payload(value: int, call_data: bytes) -> bytes:
    """Encode CALL payload: abi.encode(uint256 value, bytes callData).

    Layout:
      bytes  0-31: value (uint256 big-endian)
      bytes 32-63: offset to bytes data (always 64 = 0x40)
      bytes 64-95: length of callData
      bytes 96+  : callData padded to 32-byte boundary
    """
    data_len = len(call_data)
    padded_len = ((data_len + 31) // 32) * 32

    payload = bytearray()
    payload += _encode_u256_be(value)
    payload += _encode_u256_be(64)           # offset
    payload += _encode_u256_be(data_len)     # length
    payload += call_data
    payload += b"\x00" * (padded_len - data_len)  # padding
    return bytes(payload)


def _encode_transfer_erc20_payload(token: bytes, to: bytes, amount: int) -> bytes:
    """Encode TRANSFER_ERC20 payload: abi.encode(address token, address to, uint256 amount).

    Layout:
      bytes  0-31: token address (left-padded to 32 bytes)
      bytes 32-63: to address (left-padded to 32 bytes)
      bytes 64-95: amount (uint256 big-endian)
    """
    payload = bytearray()
    payload += address_to_bytes32(token)
    payload += address_to_bytes32(to)
    payload += _encode_u256_be(amount)
    return bytes(payload)


# ---------------------------------------------------------------------------
# Action builders
# ---------------------------------------------------------------------------

def call(target: bytes, value: int, calldata: bytes) -> ActionV1:
    """Create a CALL action for on-chain execution.

    Args:
        target: 32-byte target (EVM address left-padded). Use
            ``address_to_bytes32`` to convert a 20-byte address.
        value: ETH value to send in wei.
        calldata: Raw calldata bytes (function selector + encoded args).

    Returns:
        An ``ActionV1`` with type CALL whose payload is ABI-encoded as
        ``abi.encode(uint256 value, bytes callData)``.
    """
    return ActionV1(
        action_type=ActionType.CALL,
        target=target,
        payload=_encode_call_payload(value, calldata),
    )


def transfer_erc20(token: bytes, to: bytes, amount: int) -> ActionV1:
    """Create a TRANSFER_ERC20 action for on-chain execution.

    Args:
        token: 20-byte ERC20 token address.
        to: 20-byte recipient address.
        amount: Amount to transfer (in token's smallest unit).

    Returns:
        An ``ActionV1`` with type TRANSFER_ERC20 whose payload is
        ``abi.encode(address token, address to, uint256 amount)``.
        Target is set to zero bytes (unused for ERC20 transfers).
    """
    return ActionV1(
        action_type=ActionType.TRANSFER_ERC20,
        target=b"\x00" * 32,
        payload=_encode_transfer_erc20_payload(token, to, amount),
    )


def no_op() -> ActionV1:
    """Create a NO_OP action (skipped during on-chain execution)."""
    return ActionV1(
        action_type=ActionType.NO_OP,
        target=b"\x00" * 32,
        payload=b"",
    )
