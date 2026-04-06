"""Trading indicators implemented with NumPy.

All functions accept a plain ``list[float]`` and return ``list[float]``
(or a tuple of lists for multi-output indicators).  ``NaN`` is used for
the initial warm-up period where the indicator cannot be computed.
"""

from __future__ import annotations

import math
from typing import Tuple

import numpy as np


def sma(prices: list[float], period: int) -> list[float]:
    """Simple Moving Average.

    Returns a list of the same length as *prices*.  The first
    ``period - 1`` entries are ``NaN``.
    """
    if period <= 0:
        raise ValueError("period must be positive")
    arr = np.asarray(prices, dtype=np.float64)
    out = np.full(len(arr), np.nan)
    if len(arr) >= period:
        cumsum = np.cumsum(arr)
        cumsum = np.insert(cumsum, 0, 0.0)
        out[period - 1 :] = (cumsum[period:] - cumsum[:-period]) / period
    return out.tolist()


def ema(prices: list[float], period: int) -> list[float]:
    """Exponential Moving Average.

    Uses the standard multiplier ``2 / (period + 1)``.  The first value
    is seeded with SMA of the first *period* values; preceding entries
    are ``NaN``.
    """
    if period <= 0:
        raise ValueError("period must be positive")
    arr = np.asarray(prices, dtype=np.float64)
    out = np.full(len(arr), np.nan)
    if len(arr) < period:
        return out.tolist()

    # Seed with SMA
    seed = float(np.mean(arr[:period]))
    out[period - 1] = seed

    alpha = 2.0 / (period + 1)
    for i in range(period, len(arr)):
        out[i] = arr[i] * alpha + out[i - 1] * (1.0 - alpha)

    return out.tolist()


def rsi(prices: list[float], period: int = 14) -> list[float]:
    """Relative Strength Index (Wilder's smoothing).

    Returns values in ``[0, 100]``.  The first *period* entries are
    ``NaN``.
    """
    if period <= 0:
        raise ValueError("period must be positive")
    arr = np.asarray(prices, dtype=np.float64)
    out = np.full(len(arr), np.nan)
    if len(arr) < period + 1:
        return out.tolist()

    deltas = np.diff(arr)
    gains = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)

    avg_gain = float(np.mean(gains[:period]))
    avg_loss = float(np.mean(losses[:period]))

    if avg_loss == 0:
        out[period] = 100.0
    else:
        rs = avg_gain / avg_loss
        out[period] = 100.0 - 100.0 / (1.0 + rs)

    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        if avg_loss == 0:
            out[i + 1] = 100.0
        else:
            rs = avg_gain / avg_loss
            out[i + 1] = 100.0 - 100.0 / (1.0 + rs)

    return out.tolist()


def macd(
    prices: list[float],
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> Tuple[list[float], list[float], list[float]]:
    """MACD (Moving Average Convergence Divergence).

    Returns ``(macd_line, signal_line, histogram)`` each of the same
    length as *prices*.
    """
    fast_ema = ema(prices, fast)
    slow_ema = ema(prices, slow)

    n = len(prices)
    macd_line = [float("nan")] * n
    for i in range(n):
        if not (math.isnan(fast_ema[i]) or math.isnan(slow_ema[i])):
            macd_line[i] = fast_ema[i] - slow_ema[i]

    # Signal line = EMA of MACD line (only over valid MACD values)
    valid_start = slow - 1  # first index where macd_line is valid
    valid_macd = [macd_line[i] for i in range(valid_start, n)]
    signal_values = ema(valid_macd, signal)

    signal_line = [float("nan")] * n
    histogram = [float("nan")] * n
    for i, val in enumerate(signal_values):
        idx = valid_start + i
        signal_line[idx] = val
        if not (math.isnan(macd_line[idx]) or math.isnan(val)):
            histogram[idx] = macd_line[idx] - val

    return macd_line, signal_line, histogram


def bollinger_bands(
    prices: list[float],
    period: int = 20,
    std_dev: float = 2.0,
) -> Tuple[list[float], list[float], list[float]]:
    """Bollinger Bands.

    Returns ``(upper, middle, lower)`` each of the same length as *prices*.
    """
    middle = sma(prices, period)
    arr = np.asarray(prices, dtype=np.float64)

    upper = [float("nan")] * len(prices)
    lower = [float("nan")] * len(prices)

    for i in range(period - 1, len(prices)):
        window = arr[i - period + 1 : i + 1]
        sd = float(np.std(window, ddof=0))
        upper[i] = middle[i] + std_dev * sd
        lower[i] = middle[i] - std_dev * sd

    return upper, middle, lower
