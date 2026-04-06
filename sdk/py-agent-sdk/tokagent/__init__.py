"""Tokamak AI Layer Python SDK for building provable on-chain agents."""

from .actions import address_to_bytes32, call, no_op, transfer_erc20
from .agent import AgentValidationError, tokagent_agent
from .backtest import BacktestEngine, BacktestResult
from .codec import (
    CodecError,
    decode_input,
    decode_journal,
    decode_output,
    encode_journal,
    encode_output,
)
from .indicators import bollinger_bands, ema, macd, rsi, sma
from .oracle import encode_feed, get_price, parse_feed
from .types import (
    ActionType,
    ActionV1,
    AgentContext,
    AgentOutput,
    ExecutionStatus,
    KernelInputV1,
    KernelJournalV1,
    OraclePriceFeed,
    PricePoint,
    Signature,
)

__all__ = [
    # Types
    "ActionType",
    "ActionV1",
    "AgentContext",
    "AgentOutput",
    "ExecutionStatus",
    "KernelInputV1",
    "KernelJournalV1",
    "OraclePriceFeed",
    "PricePoint",
    "Signature",
    # Actions
    "address_to_bytes32",
    "call",
    "no_op",
    "transfer_erc20",
    # Codec
    "CodecError",
    "decode_input",
    "decode_journal",
    "decode_output",
    "encode_journal",
    "encode_output",
    # Agent
    "AgentValidationError",
    "tokagent_agent",
    # Oracle
    "encode_feed",
    "get_price",
    "parse_feed",
    # Indicators
    "bollinger_bands",
    "ema",
    "macd",
    "rsi",
    "sma",
    # Backtest
    "BacktestEngine",
    "BacktestResult",
]
