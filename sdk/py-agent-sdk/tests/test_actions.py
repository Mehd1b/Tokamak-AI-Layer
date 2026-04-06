"""Tests for the action builder helpers."""

from __future__ import annotations

import pytest

from tokagent.actions import (
    address_to_bytes32,
    call,
    no_op,
    transfer_erc20,
)
from tokagent.types import ActionType


class TestAddressToBytes32:
    def test_from_raw_bytes(self):
        addr = b"\xab" * 20
        result = address_to_bytes32(addr)
        assert len(result) == 32
        assert result[:12] == b"\x00" * 12
        assert result[12:] == addr

    def test_from_hex_string(self):
        addr_hex = "ab" * 20
        result = address_to_bytes32(addr_hex)
        assert result[:12] == b"\x00" * 12
        assert result[12:] == bytes.fromhex(addr_hex)

    def test_from_0x_prefixed_hex(self):
        addr_hex = "0x" + "11" * 20
        result = address_to_bytes32(addr_hex)
        assert result[:12] == b"\x00" * 12
        assert result[12:] == b"\x11" * 20

    def test_wrong_length_rejected(self):
        with pytest.raises(ValueError, match="20 bytes"):
            address_to_bytes32(b"\x00" * 19)

        with pytest.raises(ValueError, match="20 bytes"):
            address_to_bytes32(b"\x00" * 21)


class TestCallAction:
    def test_basic_call(self):
        target = address_to_bytes32(b"\x11" * 20)
        action = call(target, value=1000, calldata=b"\xab\xcd\xef\x12")

        assert action.action_type == ActionType.CALL
        assert action.target == target

        # Payload: value(32) + offset(32) + length(32) + data(32 padded) = 128
        assert len(action.payload) == 128

        # Value (big-endian uint256)
        value_bytes = action.payload[:32]
        assert int.from_bytes(value_bytes, "big") == 1000

        # Offset = 64
        offset_bytes = action.payload[32:64]
        assert int.from_bytes(offset_bytes, "big") == 64

        # Length = 4
        length_bytes = action.payload[64:96]
        assert int.from_bytes(length_bytes, "big") == 4

        # Calldata
        assert action.payload[96:100] == b"\xab\xcd\xef\x12"
        # Padding
        assert action.payload[100:128] == b"\x00" * 28

    def test_call_zero_value(self):
        target = b"\x00" * 32
        action = call(target, value=0, calldata=b"")

        # value(32) + offset(32) + length(32) + data(0 padded to 0) = 96
        assert len(action.payload) == 96
        assert int.from_bytes(action.payload[:32], "big") == 0

    def test_call_empty_calldata(self):
        target = b"\x00" * 32
        action = call(target, value=0, calldata=b"")
        assert int.from_bytes(action.payload[64:96], "big") == 0


class TestTransferErc20Action:
    def test_basic_transfer(self):
        token = b"\x11" * 20
        to = b"\x22" * 20
        action = transfer_erc20(token, to, amount=1_000_000)

        assert action.action_type == ActionType.TRANSFER_ERC20
        assert action.target == b"\x00" * 32  # target unused
        assert len(action.payload) == 96

        # Token address (left-padded)
        assert action.payload[:12] == b"\x00" * 12
        assert action.payload[12:32] == token

        # To address (left-padded)
        assert action.payload[32:44] == b"\x00" * 12
        assert action.payload[44:64] == to

        # Amount (big-endian uint256)
        amount = int.from_bytes(action.payload[64:96], "big")
        assert amount == 1_000_000


class TestNoOpAction:
    def test_no_op(self):
        action = no_op()
        assert action.action_type == ActionType.NO_OP
        assert action.target == b"\x00" * 32
        assert action.payload == b""
