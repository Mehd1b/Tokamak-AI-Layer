"""Example: SMA crossover momentum strategy on ETH/USD.

Demonstrates the full ``@tokagent_agent`` pattern with oracle price feeds
and indicator-driven decision making.  Actions are CALL operations
targeting a Hyperliquid perpetual adapter contract.
"""

from __future__ import annotations

import struct

from tokagent import (
    AgentContext,
    AgentOutput,
    ActionType,
    address_to_bytes32,
    call,
    no_op,
    sma,
    tokagent_agent,
)
from tokagent.oracle import parse_feed, get_price

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Hyperliquid adapter contract (example address)
ADAPTER_ADDRESS = address_to_bytes32(
    bytes.fromhex("1111111111111111111111111111111111111111")
)

# ETH asset ID in the oracle feed
ETH_ASSET_ID = 1

# SMA periods
FAST_PERIOD = 10
SLOW_PERIOD = 30

# Minimum number of price observations before trading
MIN_HISTORY = SLOW_PERIOD + 1


# ---------------------------------------------------------------------------
# Strategy
# ---------------------------------------------------------------------------

@tokagent_agent
def momentum_agent(ctx: AgentContext, opaque_inputs: bytes) -> AgentOutput:
    """SMA crossover strategy.

    Buy signal:  fast SMA crosses above slow SMA.
    Sell signal: fast SMA crosses below slow SMA.
    Otherwise:   no-op.

    The opaque_inputs are expected to contain a sequence of 8-byte LE
    doubles representing historical prices (most recent last).
    """
    # Parse price history from opaque inputs
    n_prices = len(opaque_inputs) // 8
    if n_prices < MIN_HISTORY:
        return AgentOutput(actions=[no_op()])

    prices = [
        struct.unpack_from("<d", opaque_inputs, i * 8)[0]
        for i in range(n_prices)
    ]

    # Compute indicators
    fast_ma = sma(prices, FAST_PERIOD)
    slow_ma = sma(prices, SLOW_PERIOD)

    # Check latest crossover (compare last two valid points)
    idx = len(prices) - 1
    idx_prev = idx - 1

    import math
    if (
        math.isnan(fast_ma[idx])
        or math.isnan(slow_ma[idx])
        or math.isnan(fast_ma[idx_prev])
        or math.isnan(slow_ma[idx_prev])
    ):
        return AgentOutput(actions=[no_op()])

    prev_diff = fast_ma[idx_prev] - slow_ma[idx_prev]
    curr_diff = fast_ma[idx] - slow_ma[idx]

    # Golden cross: fast crosses above slow
    if prev_diff <= 0 and curr_diff > 0:
        # Encode a "buy" calldata for the adapter
        # Function selector: openLong(uint256 size)
        selector = bytes.fromhex("a0b1c2d3")
        size = (10 ** 18)  # 1 ETH in wei
        size_bytes = size.to_bytes(32, byteorder="big")
        calldata = selector + size_bytes
        return AgentOutput(actions=[call(ADAPTER_ADDRESS, 0, calldata)])

    # Death cross: fast crosses below slow
    if prev_diff >= 0 and curr_diff < 0:
        # Encode a "sell" calldata for the adapter
        selector = bytes.fromhex("d4e5f6a7")
        size = (10 ** 18)
        size_bytes = size.to_bytes(32, byteorder="big")
        calldata = selector + size_bytes
        return AgentOutput(actions=[call(ADAPTER_ADDRESS, 0, calldata)])

    return AgentOutput(actions=[no_op()])


# ---------------------------------------------------------------------------
# Local test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import random

    random.seed(42)

    # Generate synthetic price data with trend changes
    prices: list[float] = []
    price = 2000.0
    for _ in range(200):
        price += random.gauss(0, 30)
        price = max(price, 100.0)
        prices.append(price)

    # Run the strategy step by step
    trade_count = 0
    for step in range(len(prices)):
        ctx = AgentContext(
            protocol_version=1,
            kernel_version=1,
            agent_id=b"\x00" * 32,
            agent_code_hash=b"\x00" * 32,
            constraint_set_hash=b"\x00" * 32,
            input_root=b"\x00" * 32,
            execution_nonce=step,
        )
        opaque = b"".join(struct.pack("<d", p) for p in prices[: step + 1])
        output = momentum_agent(ctx, opaque)

        for action in output.actions:
            if action.action_type != ActionType.NO_OP:
                trade_count += 1
                direction = "BUY" if b"\xa0\xb1\xc2\xd3" in action.payload else "SELL"
                print(f"Step {step:3d}  price={prices[step]:8.2f}  {direction}")

    print(f"\nTotal trades: {trade_count}")
