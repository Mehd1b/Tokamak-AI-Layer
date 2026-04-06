"""Wire-format codec matching the Rust canonical codec byte-for-byte.

All multi-byte integers use **little-endian** encoding (matching Rust's
``to_le_bytes``).  The only exception is ABI-encoded payloads inside
actions, which follow Solidity's big-endian uint256 convention -- but
those are opaque bytes from the codec's perspective.

Wire layouts
============

KernelInputV1 (variable length, min 148 bytes)::

    protocol_version   u32 LE   4
    kernel_version     u32 LE   4
    agent_id           bytes32  32
    agent_code_hash    bytes32  32
    constraint_set_hash bytes32 32
    input_root         bytes32  32
    execution_nonce    u64 LE   8
    opaque_len         u32 LE   4
    opaque_data        [u8]     variable

KernelJournalV1 (exactly 209 bytes)::

    protocol_version   u32 LE   4
    kernel_version     u32 LE   4
    agent_id           bytes32  32
    agent_code_hash    bytes32  32
    constraint_set_hash bytes32 32
    input_root         bytes32  32
    execution_nonce    u64 LE   8
    input_commitment   bytes32  32
    action_commitment  bytes32  32
    execution_status   u8       1

ActionV1::

    action_type        u32 LE   4
    target             bytes32  32
    payload_len        u32 LE   4
    payload            [u8]     variable

AgentOutput::

    action_count       u32 LE   4
    for each action:
      action_len       u32 LE   4
      action           ActionV1 (variable)
"""

from __future__ import annotations

import struct
from typing import List

from .types import (
    JOURNAL_SIZE,
    KERNEL_VERSION,
    MAX_ACTION_PAYLOAD_BYTES,
    MAX_ACTIONS_PER_OUTPUT,
    MAX_AGENT_INPUT_BYTES,
    MAX_AGENT_OUTPUT_BYTES,
    MAX_SINGLE_ACTION_BYTES,
    PROTOCOL_VERSION,
    ActionV1,
    AgentOutput,
    ExecutionStatus,
    KernelInputV1,
    KernelJournalV1,
)


class CodecError(Exception):
    """Raised when encoding or decoding violates the wire format."""


# ---------------------------------------------------------------------------
# Encoding
# ---------------------------------------------------------------------------

def _encode_action(action: ActionV1) -> bytes:
    """Encode a single ActionV1 (without the outer length prefix)."""
    payload = action.payload
    if len(payload) > MAX_ACTION_PAYLOAD_BYTES:
        raise CodecError(
            f"Action payload too large: {len(payload)} bytes (limit {MAX_ACTION_PAYLOAD_BYTES})"
        )
    buf = bytearray()
    buf += struct.pack("<I", action.action_type)
    buf += action.target  # 32 bytes
    buf += struct.pack("<I", len(payload))
    buf += payload
    return bytes(buf)


def encode_output(output: AgentOutput) -> bytes:
    """Encode an ``AgentOutput`` into canonical wire bytes.

    Must match the Rust ``AgentOutput::encode()`` byte-for-byte.
    """
    n = len(output.actions)
    if n > MAX_ACTIONS_PER_OUTPUT:
        raise CodecError(f"Too many actions: {n} (limit {MAX_ACTIONS_PER_OUTPUT})")

    buf = bytearray()
    buf += struct.pack("<I", n)

    for action in output.actions:
        action_bytes = _encode_action(action)
        if len(action_bytes) > MAX_SINGLE_ACTION_BYTES:
            raise CodecError(
                f"Action too large: {len(action_bytes)} bytes (limit {MAX_SINGLE_ACTION_BYTES})"
            )
        buf += struct.pack("<I", len(action_bytes))
        buf += action_bytes

    if len(buf) > MAX_AGENT_OUTPUT_BYTES:
        raise CodecError(
            f"Output too large: {len(buf)} bytes (limit {MAX_AGENT_OUTPUT_BYTES})"
        )
    return bytes(buf)


def encode_journal(journal: KernelJournalV1) -> bytes:
    """Encode a ``KernelJournalV1`` into exactly 209 bytes.

    Must match the Rust ``KernelJournalV1::encode()`` byte-for-byte.
    """
    status_byte: int
    if journal.execution_status == ExecutionStatus.SUCCESS:
        status_byte = 0x01
    elif journal.execution_status == ExecutionStatus.FAILURE:
        status_byte = 0x02
    else:
        raise CodecError(f"Invalid execution status: {journal.execution_status}")

    buf = bytearray()
    buf += struct.pack("<I", journal.protocol_version)
    buf += struct.pack("<I", journal.kernel_version)
    buf += journal.agent_id            # 32
    buf += journal.agent_code_hash     # 32
    buf += journal.constraint_set_hash # 32
    buf += journal.input_root          # 32
    buf += struct.pack("<Q", journal.execution_nonce)
    buf += journal.input_commitment    # 32
    buf += journal.action_commitment   # 32
    buf += struct.pack("B", status_byte)

    assert len(buf) == JOURNAL_SIZE, f"Journal size mismatch: {len(buf)} != {JOURNAL_SIZE}"
    return bytes(buf)


# ---------------------------------------------------------------------------
# Decoding
# ---------------------------------------------------------------------------

def _decode_action(data: bytes) -> ActionV1:
    """Decode a single ActionV1 from raw bytes (no outer length prefix)."""
    if len(data) < 40:
        raise CodecError("Action data too short (need at least 40 bytes)")

    action_type = struct.unpack_from("<I", data, 0)[0]
    target = data[4:36]
    payload_len = struct.unpack_from("<I", data, 36)[0]

    if payload_len > MAX_ACTION_PAYLOAD_BYTES:
        raise CodecError(
            f"Action payload too large: {payload_len} bytes (limit {MAX_ACTION_PAYLOAD_BYTES})"
        )

    expected_end = 40 + payload_len
    if len(data) < expected_end:
        raise CodecError("Action data truncated")
    if len(data) != expected_end:
        raise CodecError("Trailing bytes in action data")

    payload = data[40:expected_end]
    return ActionV1(action_type=action_type, target=target, payload=payload)


def decode_output(data: bytes) -> AgentOutput:
    """Decode an ``AgentOutput`` from canonical wire bytes."""
    if len(data) > MAX_AGENT_OUTPUT_BYTES:
        raise CodecError(
            f"Output too large: {len(data)} bytes (limit {MAX_AGENT_OUTPUT_BYTES})"
        )
    if len(data) < 4:
        raise CodecError("Output data too short")

    offset = 0
    action_count = struct.unpack_from("<I", data, offset)[0]
    offset += 4

    if action_count > MAX_ACTIONS_PER_OUTPUT:
        raise CodecError(f"Too many actions: {action_count} (limit {MAX_ACTIONS_PER_OUTPUT})")

    actions: List[ActionV1] = []
    for _ in range(action_count):
        if offset + 4 > len(data):
            raise CodecError("Unexpected end of output data")
        action_len = struct.unpack_from("<I", data, offset)[0]
        offset += 4

        if action_len > MAX_SINGLE_ACTION_BYTES:
            raise CodecError(
                f"Action too large: {action_len} bytes (limit {MAX_SINGLE_ACTION_BYTES})"
            )

        action_end = offset + action_len
        if action_end > len(data):
            raise CodecError("Action data truncated")

        action = _decode_action(data[offset:action_end])
        actions.append(action)
        offset = action_end

    if offset != len(data):
        raise CodecError("Trailing bytes in output data")

    return AgentOutput(actions=actions)


def decode_input(data: bytes) -> KernelInputV1:
    """Decode a ``KernelInputV1`` from canonical wire bytes."""
    if len(data) < 148:
        raise CodecError("Input data too short (need at least 148 bytes)")

    offset = 0

    protocol_version = struct.unpack_from("<I", data, offset)[0]
    offset += 4
    if protocol_version != PROTOCOL_VERSION:
        raise CodecError(
            f"Version mismatch: expected protocol {PROTOCOL_VERSION}, got {protocol_version}"
        )

    kernel_version = struct.unpack_from("<I", data, offset)[0]
    offset += 4
    if kernel_version != KERNEL_VERSION:
        raise CodecError(
            f"Version mismatch: expected kernel {KERNEL_VERSION}, got {kernel_version}"
        )

    agent_id = data[offset : offset + 32]
    offset += 32
    agent_code_hash = data[offset : offset + 32]
    offset += 32
    constraint_set_hash = data[offset : offset + 32]
    offset += 32
    input_root = data[offset : offset + 32]
    offset += 32

    execution_nonce = struct.unpack_from("<Q", data, offset)[0]
    offset += 8

    opaque_len = struct.unpack_from("<I", data, offset)[0]
    offset += 4

    if opaque_len > MAX_AGENT_INPUT_BYTES:
        raise CodecError(
            f"Input too large: {opaque_len} bytes (limit {MAX_AGENT_INPUT_BYTES})"
        )

    opaque_end = offset + opaque_len
    if opaque_end > len(data):
        raise CodecError("Input data truncated")
    if opaque_end != len(data):
        raise CodecError("Trailing bytes in input data")

    opaque_agent_inputs = data[offset:opaque_end]

    return KernelInputV1(
        protocol_version=protocol_version,
        kernel_version=kernel_version,
        agent_id=agent_id,
        agent_code_hash=agent_code_hash,
        constraint_set_hash=constraint_set_hash,
        input_root=input_root,
        execution_nonce=execution_nonce,
        opaque_agent_inputs=opaque_agent_inputs,
    )


def decode_journal(data: bytes) -> KernelJournalV1:
    """Decode a ``KernelJournalV1`` from exactly 209 bytes."""
    if len(data) != JOURNAL_SIZE:
        raise CodecError(f"Journal must be exactly {JOURNAL_SIZE} bytes, got {len(data)}")

    offset = 0

    protocol_version = struct.unpack_from("<I", data, offset)[0]
    offset += 4
    kernel_version = struct.unpack_from("<I", data, offset)[0]
    offset += 4
    agent_id = data[offset : offset + 32]
    offset += 32
    agent_code_hash = data[offset : offset + 32]
    offset += 32
    constraint_set_hash = data[offset : offset + 32]
    offset += 32
    input_root = data[offset : offset + 32]
    offset += 32
    execution_nonce = struct.unpack_from("<Q", data, offset)[0]
    offset += 8
    input_commitment = data[offset : offset + 32]
    offset += 32
    action_commitment = data[offset : offset + 32]
    offset += 32

    status_byte = data[offset]
    offset += 1

    if status_byte == 0x01:
        execution_status = ExecutionStatus.SUCCESS
    elif status_byte == 0x02:
        execution_status = ExecutionStatus.FAILURE
    else:
        raise CodecError(f"Invalid execution status byte: 0x{status_byte:02x}")

    return KernelJournalV1(
        protocol_version=protocol_version,
        kernel_version=kernel_version,
        agent_id=agent_id,
        agent_code_hash=agent_code_hash,
        constraint_set_hash=constraint_set_hash,
        input_root=input_root,
        execution_nonce=execution_nonce,
        input_commitment=input_commitment,
        action_commitment=action_commitment,
        execution_status=execution_status,
    )
