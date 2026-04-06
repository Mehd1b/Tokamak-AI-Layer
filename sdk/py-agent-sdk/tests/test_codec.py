"""Tests for the wire-format codec — encode/decode round-trips and edge cases."""

from __future__ import annotations

import struct

import pytest

from tokagent.codec import (
    CodecError,
    decode_input,
    decode_journal,
    decode_output,
    encode_journal,
    encode_output,
)
from tokagent.types import (
    JOURNAL_SIZE,
    KERNEL_VERSION,
    PROTOCOL_VERSION,
    ActionType,
    ActionV1,
    AgentOutput,
    ExecutionStatus,
    KernelInputV1,
    KernelJournalV1,
)


# ---------------------------------------------------------------------------
# AgentOutput round-trip
# ---------------------------------------------------------------------------


class TestAgentOutputCodec:
    def test_empty_actions(self):
        output = AgentOutput(actions=[])
        encoded = encode_output(output)
        # Should be just the 4-byte action count = 0
        assert encoded == struct.pack("<I", 0)
        decoded = decode_output(encoded)
        assert decoded.actions == []

    def test_single_action_roundtrip(self):
        action = ActionV1(
            action_type=ActionType.CALL,
            target=b"\x11" * 32,
            payload=b"\xab\xcd\xef",
        )
        output = AgentOutput(actions=[action])
        encoded = encode_output(output)
        decoded = decode_output(encoded)

        assert len(decoded.actions) == 1
        assert decoded.actions[0].action_type == ActionType.CALL
        assert decoded.actions[0].target == b"\x11" * 32
        assert decoded.actions[0].payload == b"\xab\xcd\xef"

    def test_multiple_actions_roundtrip(self):
        actions = [
            ActionV1(action_type=ActionType.CALL, target=b"\x11" * 32, payload=b"\x01\x02"),
            ActionV1(action_type=ActionType.NO_OP, target=b"\x00" * 32, payload=b""),
            ActionV1(
                action_type=ActionType.TRANSFER_ERC20,
                target=b"\x00" * 32,
                payload=b"\xaa" * 96,
            ),
        ]
        output = AgentOutput(actions=actions)
        encoded = encode_output(output)
        decoded = decode_output(encoded)

        assert len(decoded.actions) == 3
        assert decoded.actions[0].action_type == ActionType.CALL
        assert decoded.actions[1].action_type == ActionType.NO_OP
        assert decoded.actions[2].action_type == ActionType.TRANSFER_ERC20
        assert decoded.actions[2].payload == b"\xaa" * 96

    def test_action_order_preserved(self):
        """Codec preserves agent's action order (no sorting)."""
        a = ActionV1(action_type=0x02, target=b"\x11" * 32, payload=b"")
        b = ActionV1(action_type=0x01, target=b"\x22" * 32, payload=b"")
        output = AgentOutput(actions=[a, b])
        encoded = encode_output(output)
        decoded = decode_output(encoded)

        assert decoded.actions[0].action_type == 0x02
        assert decoded.actions[1].action_type == 0x01

    def test_action_type_encoding_little_endian(self):
        """action_type is encoded as u32 LE."""
        action = ActionV1(action_type=ActionType.CALL, target=b"\x00" * 32, payload=b"")
        output = AgentOutput(actions=[action])
        encoded = encode_output(output)

        # Skip: action_count(4) + action_len(4) => offset 8
        action_type_bytes = encoded[8:12]
        assert action_type_bytes == b"\x02\x00\x00\x00"  # 2 in LE

    def test_too_many_actions_rejected(self):
        actions = [
            ActionV1(action_type=ActionType.NO_OP, target=b"\x00" * 32, payload=b"")
            for _ in range(65)
        ]
        output = AgentOutput(actions=actions)
        with pytest.raises(CodecError, match="Too many actions"):
            encode_output(output)


# ---------------------------------------------------------------------------
# KernelJournalV1
# ---------------------------------------------------------------------------


class TestJournalCodec:
    def _make_journal(self, status: ExecutionStatus = ExecutionStatus.SUCCESS) -> KernelJournalV1:
        return KernelJournalV1(
            protocol_version=PROTOCOL_VERSION,
            kernel_version=KERNEL_VERSION,
            agent_id=b"\x42" * 32,
            agent_code_hash=b"\xaa" * 32,
            constraint_set_hash=b"\xbb" * 32,
            input_root=b"\xcc" * 32,
            execution_nonce=12345,
            input_commitment=b"\xdd" * 32,
            action_commitment=b"\xee" * 32,
            execution_status=status,
        )

    def test_journal_fixed_size(self):
        journal = self._make_journal()
        encoded = encode_journal(journal)
        assert len(encoded) == JOURNAL_SIZE  # 209 bytes

    def test_journal_roundtrip_success(self):
        journal = self._make_journal(ExecutionStatus.SUCCESS)
        encoded = encode_journal(journal)
        decoded = decode_journal(encoded)

        assert decoded.protocol_version == PROTOCOL_VERSION
        assert decoded.kernel_version == KERNEL_VERSION
        assert decoded.agent_id == b"\x42" * 32
        assert decoded.execution_nonce == 12345
        assert decoded.execution_status == ExecutionStatus.SUCCESS

    def test_journal_roundtrip_failure(self):
        journal = self._make_journal(ExecutionStatus.FAILURE)
        encoded = encode_journal(journal)
        decoded = decode_journal(encoded)
        assert decoded.execution_status == ExecutionStatus.FAILURE

    def test_journal_status_byte_position(self):
        """execution_status is the last byte (offset 208)."""
        journal = self._make_journal(ExecutionStatus.SUCCESS)
        encoded = encode_journal(journal)
        assert encoded[208] == 0x01

        journal.execution_status = ExecutionStatus.FAILURE
        encoded = encode_journal(journal)
        assert encoded[208] == 0x02

    def test_journal_wrong_size_rejected(self):
        with pytest.raises(CodecError, match="exactly"):
            decode_journal(b"\x00" * 100)

    def test_journal_invalid_status_rejected(self):
        journal = self._make_journal()
        encoded = bytearray(encode_journal(journal))
        encoded[208] = 0x00  # Invalid status byte
        with pytest.raises(CodecError, match="Invalid execution status"):
            decode_journal(bytes(encoded))


# ---------------------------------------------------------------------------
# KernelInputV1
# ---------------------------------------------------------------------------


class TestInputCodec:
    def test_input_roundtrip(self):
        """Build raw bytes manually (matching Rust LE layout) and decode."""
        buf = bytearray()
        buf += struct.pack("<I", PROTOCOL_VERSION)
        buf += struct.pack("<I", KERNEL_VERSION)
        buf += b"\x42" * 32  # agent_id
        buf += b"\xaa" * 32  # agent_code_hash
        buf += b"\xbb" * 32  # constraint_set_hash
        buf += b"\xcc" * 32  # input_root
        buf += struct.pack("<Q", 999)  # execution_nonce
        buf += struct.pack("<I", 5)    # opaque_len
        buf += b"\x01\x02\x03\x04\x05"  # opaque data

        inp = decode_input(bytes(buf))
        assert inp.protocol_version == PROTOCOL_VERSION
        assert inp.kernel_version == KERNEL_VERSION
        assert inp.agent_id == b"\x42" * 32
        assert inp.execution_nonce == 999
        assert inp.opaque_agent_inputs == b"\x01\x02\x03\x04\x05"

    def test_input_empty_opaque(self):
        buf = bytearray()
        buf += struct.pack("<I", PROTOCOL_VERSION)
        buf += struct.pack("<I", KERNEL_VERSION)
        buf += b"\x00" * 32 * 4  # 4x bytes32
        buf += struct.pack("<Q", 0)
        buf += struct.pack("<I", 0)  # opaque_len = 0

        inp = decode_input(bytes(buf))
        assert inp.opaque_agent_inputs == b""

    def test_input_too_short_rejected(self):
        with pytest.raises(CodecError, match="too short"):
            decode_input(b"\x00" * 10)

    def test_input_wrong_version_rejected(self):
        buf = bytearray()
        buf += struct.pack("<I", 99)  # wrong protocol version
        buf += struct.pack("<I", KERNEL_VERSION)
        buf += b"\x00" * (148 - 8)  # pad to min size
        with pytest.raises(CodecError, match="Version mismatch"):
            decode_input(bytes(buf))
