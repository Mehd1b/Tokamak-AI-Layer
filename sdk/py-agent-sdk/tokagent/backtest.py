"""Simple backtesting harness for Tokamak agents.

Feeds historical price data through an agent function one step at a time,
simulates action effects, and reports performance metrics.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable, List

from .types import ActionType, AgentContext, AgentOutput


@dataclass
class BacktestResult:
    """Aggregated results of a backtest run."""

    returns: float = 0.0
    sharpe_ratio: float = 0.0
    max_drawdown: float = 0.0
    pps_history: List[float] = field(default_factory=list)
    trade_count: int = 0


class BacktestEngine:
    """Drive an agent with historical prices and track simulated PPS.

    The engine calls the agent function once per price bar, interprets
    CALL / TRANSFER_ERC20 actions as "trades" (simplified), and updates
    a running balance.

    This is intentionally simplistic: it does not simulate gas, slippage,
    or actual on-chain execution.  Its purpose is rapid iteration on
    strategy logic.
    """

    def run(
        self,
        agent_fn: Callable[[AgentContext, bytes], AgentOutput],
        price_data: list[float],
        initial_balance: float = 10_000.0,
    ) -> BacktestResult:
        """Execute the backtest.

        Args:
            agent_fn: Strategy function ``(ctx, opaque_inputs) -> AgentOutput``.
            price_data: List of prices (one per time step).
            initial_balance: Starting balance in notional terms.

        Returns:
            A ``BacktestResult`` with performance metrics.
        """
        if not price_data:
            return BacktestResult()

        balance = initial_balance
        position = 0.0  # units held
        pps_history: list[float] = []
        peak_balance = initial_balance
        max_drawdown = 0.0
        trade_count = 0
        period_returns: list[float] = []

        prev_equity = initial_balance

        for step, current_price in enumerate(price_data):
            # Build a minimal AgentContext for the step
            ctx = AgentContext(
                protocol_version=1,
                kernel_version=1,
                agent_id=b"\x00" * 32,
                agent_code_hash=b"\x00" * 32,
                constraint_set_hash=b"\x00" * 32,
                input_root=b"\x00" * 32,
                execution_nonce=step,
            )

            # Pack the price history seen so far as opaque inputs.
            # We encode prices as a simple sequence of 8-byte LE doubles
            # so the agent can reconstruct the history.
            import struct

            prices_seen = price_data[: step + 1]
            opaque = b"".join(struct.pack("<d", p) for p in prices_seen)

            try:
                output = agent_fn(ctx, opaque)
            except Exception:
                # Agent failures are recorded as no-ops for this step.
                output = AgentOutput(actions=[])

            # Interpret actions
            for action in output.actions:
                if action.action_type in (ActionType.CALL, ActionType.TRANSFER_ERC20):
                    trade_count += 1

                    # Simplified trade model:
                    # CALL => buy: spend 10% of cash balance
                    # TRANSFER_ERC20 => sell: sell 10% of position
                    if action.action_type == ActionType.CALL:
                        spend = balance * 0.10
                        if spend > 0 and current_price > 0:
                            units = spend / current_price
                            position += units
                            balance -= spend
                    else:
                        sell_units = position * 0.10
                        if sell_units > 0:
                            revenue = sell_units * current_price
                            position -= sell_units
                            balance += revenue

            # Mark-to-market equity
            equity = balance + position * current_price
            pps = equity / initial_balance
            pps_history.append(pps)

            # Drawdown
            if equity > peak_balance:
                peak_balance = equity
            dd = (peak_balance - equity) / peak_balance if peak_balance > 0 else 0.0
            if dd > max_drawdown:
                max_drawdown = dd

            # Period return
            if prev_equity > 0:
                period_returns.append((equity - prev_equity) / prev_equity)
            prev_equity = equity

        # Final metrics
        final_equity = balance + position * price_data[-1]
        total_return = (final_equity - initial_balance) / initial_balance

        # Annualised Sharpe (assuming daily bars, 252 trading days)
        sharpe = 0.0
        if len(period_returns) > 1:
            mean_r = sum(period_returns) / len(period_returns)
            var_r = sum((r - mean_r) ** 2 for r in period_returns) / (
                len(period_returns) - 1
            )
            std_r = math.sqrt(var_r) if var_r > 0 else 0.0
            if std_r > 0:
                sharpe = (mean_r / std_r) * math.sqrt(252)

        return BacktestResult(
            returns=total_return,
            sharpe_ratio=sharpe,
            max_drawdown=max_drawdown,
            pps_history=pps_history,
            trade_count=trade_count,
        )
