"""Core type definitions matching the Rust kernel types byte-for-byte.

All wire-format integers are little-endian to match the Rust codec.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import IntEnum
from typing import List


# ---------------------------------------------------------------------------
# Constants (from kernel-core/src/lib.rs)
# ---------------------------------------------------------------------------

PROTOCOL_VERSION: int = 1
KERNEL_VERSION: int = 1

MAX_ACTIONS_PER_OUTPUT: int = 64
MAX_ACTION_PAYLOAD_BYTES: int = 16_384
MAX_SINGLE_ACTION_BYTES: int = 40 + MAX_ACTION_PAYLOAD_BYTES  # 16424
MAX_AGENT_INPUT_BYTES: int = 64_000
MAX_AGENT_OUTPUT_BYTES: int = 64_000

JOURNAL_SIZE: int = 209

# Oracle constants
MAX_PRICE_COUNT: int = 32
FEED_VERSION: int = 0x01
PRICE_POINT_SIZE: int = 16
FEED_HEADER_SIZE: int = 30
SIGNATURE_SIZE: int = 65


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class ActionType(IntEnum):
    """On-chain action type identifiers (consensus-critical values)."""

    ECHO = 1            # Testing only, not executable by KernelVault
    CALL = 2            # Generic contract call
    TRANSFER_ERC20 = 3  # ERC20 token transfer
    NO_OP = 4           # No operation (skipped)


class ExecutionStatus(IntEnum):
    """Execution result status."""

    SUCCESS = 0x01  # Execution completed and constraints passed
    FAILURE = 0x02  # Execution completed but constraints violated


# ---------------------------------------------------------------------------
# Core data classes
# ---------------------------------------------------------------------------

@dataclass
class ActionV1:
    """A single on-chain action.

    Attributes:
        action_type: 4-byte action type identifier (see ActionType).
        target: 32-byte target address/identifier.
        payload: Variable-length action data (max 16 KB).
    """

    action_type: int
    target: bytes  # 32 bytes
    payload: bytes = b""

    def __post_init__(self) -> None:
        if len(self.target) != 32:
            raise ValueError(f"target must be exactly 32 bytes, got {len(self.target)}")


@dataclass
class AgentOutput:
    """Structured agent output containing ordered actions."""

    actions: List[ActionV1] = field(default_factory=list)


@dataclass
class AgentContext:
    """Execution context provided to agents by the kernel.

    All fields are populated by the kernel before the agent executes.
    """

    protocol_version: int
    kernel_version: int
    agent_id: bytes          # 32 bytes
    agent_code_hash: bytes   # 32 bytes
    constraint_set_hash: bytes  # 32 bytes
    input_root: bytes        # 32 bytes
    execution_nonce: int


@dataclass
class KernelInputV1:
    """Kernel input structure for P0.1 protocol."""

    protocol_version: int
    kernel_version: int
    agent_id: bytes              # 32 bytes
    agent_code_hash: bytes       # 32 bytes
    constraint_set_hash: bytes   # 32 bytes
    input_root: bytes            # 32 bytes
    execution_nonce: int
    opaque_agent_inputs: bytes = b""


@dataclass
class KernelJournalV1:
    """Kernel journal (output) structure for P0.1 protocol.

    Fixed size: 209 bytes when encoded.
    """

    protocol_version: int
    kernel_version: int
    agent_id: bytes              # 32 bytes
    agent_code_hash: bytes       # 32 bytes
    constraint_set_hash: bytes   # 32 bytes
    input_root: bytes            # 32 bytes
    execution_nonce: int
    input_commitment: bytes      # 32 bytes
    action_commitment: bytes     # 32 bytes
    execution_status: ExecutionStatus = ExecutionStatus.SUCCESS


# ---------------------------------------------------------------------------
# Oracle types
# ---------------------------------------------------------------------------

@dataclass
class PricePoint:
    """A single price observation from the oracle."""

    asset_id: int   # u32
    price: int      # u64, 1e8 fixed-point
    conf: int       # u32, 1e8 fixed-point confidence


@dataclass
class Signature:
    """ECDSA signature (v, r, s)."""

    v: int          # u8
    r: bytes        # 32 bytes
    s: bytes        # 32 bytes


@dataclass
class OraclePriceFeed:
    """Decoded oracle price feed."""

    feed_version: int          # u8
    signer: bytes              # 20 bytes
    timestamp: int             # u64
    price_count: int           # u8
    prices: List[PricePoint] = field(default_factory=list)
    signature: Signature | None = None
