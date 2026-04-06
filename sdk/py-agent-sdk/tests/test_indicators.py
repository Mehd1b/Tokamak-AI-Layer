"""Tests for trading indicators against known reference values."""

from __future__ import annotations

import math

import pytest

from tokagent.indicators import bollinger_bands, ema, macd, rsi, sma


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def assert_close(actual: float, expected: float, tol: float = 1e-6) -> None:
    """Assert two floats are within tolerance."""
    assert abs(actual - expected) < tol, f"{actual} != {expected} (tol={tol})"


def count_nan(values: list[float]) -> int:
    return sum(1 for v in values if math.isnan(v))


# ---------------------------------------------------------------------------
# SMA
# ---------------------------------------------------------------------------

class TestSMA:
    def test_known_values(self):
        prices = [1.0, 2.0, 3.0, 4.0, 5.0]
        result = sma(prices, period=3)

        assert math.isnan(result[0])
        assert math.isnan(result[1])
        assert_close(result[2], 2.0)  # (1+2+3)/3
        assert_close(result[3], 3.0)  # (2+3+4)/3
        assert_close(result[4], 4.0)  # (3+4+5)/3

    def test_period_one(self):
        prices = [10.0, 20.0, 30.0]
        result = sma(prices, period=1)
        for i in range(3):
            assert_close(result[i], prices[i])

    def test_period_equals_length(self):
        prices = [1.0, 2.0, 3.0]
        result = sma(prices, period=3)
        assert math.isnan(result[0])
        assert math.isnan(result[1])
        assert_close(result[2], 2.0)

    def test_period_exceeds_length(self):
        prices = [1.0, 2.0]
        result = sma(prices, period=5)
        assert all(math.isnan(v) for v in result)

    def test_invalid_period(self):
        with pytest.raises(ValueError):
            sma([1.0], period=0)


# ---------------------------------------------------------------------------
# EMA
# ---------------------------------------------------------------------------

class TestEMA:
    def test_known_values(self):
        prices = [22.27, 22.19, 22.08, 22.17, 22.18, 22.13, 22.23, 22.43, 22.24, 22.29]
        result = ema(prices, period=5)

        # First 4 entries should be NaN
        assert count_nan(result[:4]) == 4
        # EMA(5) seed = SMA of first 5 = (22.27+22.19+22.08+22.17+22.18)/5
        expected_seed = (22.27 + 22.19 + 22.08 + 22.17 + 22.18) / 5.0
        assert_close(result[4], expected_seed, tol=1e-4)
        # Subsequent values follow EMA formula
        assert not math.isnan(result[5])

    def test_period_exceeds_length(self):
        prices = [1.0, 2.0]
        result = ema(prices, period=5)
        assert all(math.isnan(v) for v in result)


# ---------------------------------------------------------------------------
# RSI
# ---------------------------------------------------------------------------

class TestRSI:
    def test_all_gains(self):
        """When all changes are positive, RSI should be 100."""
        prices = list(range(1, 20))
        result = rsi(prices, period=14)
        # After warm-up, RSI should be 100 (no losses)
        for v in result[14:]:
            if not math.isnan(v):
                assert_close(v, 100.0, tol=0.01)

    def test_all_losses(self):
        """When all changes are negative, RSI should be 0."""
        prices = list(range(20, 0, -1))
        result = rsi(prices, period=14)
        for v in result[14:]:
            if not math.isnan(v):
                assert_close(v, 0.0, tol=0.01)

    def test_range_bounds(self):
        """RSI should always be in [0, 100]."""
        prices = [100 + (i % 7) * (-1) ** i * 3 for i in range(50)]
        result = rsi(prices, period=14)
        for v in result:
            if not math.isnan(v):
                assert 0.0 <= v <= 100.0

    def test_warmup_period(self):
        prices = [float(i) for i in range(30)]
        result = rsi(prices, period=14)
        # First 14 entries (indices 0..13) should be NaN
        assert count_nan(result[:14]) == 14
        assert not math.isnan(result[14])


# ---------------------------------------------------------------------------
# MACD
# ---------------------------------------------------------------------------

class TestMACD:
    def test_output_lengths(self):
        prices = [float(100 + i) for i in range(50)]
        macd_line, signal_line, histogram = macd(prices)
        assert len(macd_line) == 50
        assert len(signal_line) == 50
        assert len(histogram) == 50

    def test_macd_line_valid_after_slow_period(self):
        prices = [float(100 + i) for i in range(50)]
        macd_line, _, _ = macd(prices, fast=12, slow=26, signal=9)

        # MACD line should be NaN before slow-1 index (25)
        for i in range(25):
            assert math.isnan(macd_line[i])
        # And valid from index 25 onward
        assert not math.isnan(macd_line[25])

    def test_constant_prices_zero_macd(self):
        """With constant prices, MACD line should be zero once warm."""
        prices = [100.0] * 50
        macd_line, signal_line, histogram = macd(prices)

        for v in macd_line:
            if not math.isnan(v):
                assert_close(v, 0.0, tol=1e-10)


# ---------------------------------------------------------------------------
# Bollinger Bands
# ---------------------------------------------------------------------------

class TestBollingerBands:
    def test_output_lengths(self):
        prices = [float(100 + i) for i in range(30)]
        upper, middle, lower = bollinger_bands(prices, period=20)
        assert len(upper) == 30
        assert len(middle) == 30
        assert len(lower) == 30

    def test_upper_above_lower(self):
        prices = [float(100 + i % 5) for i in range(40)]
        upper, middle, lower = bollinger_bands(prices, period=20)

        for i in range(19, 40):
            assert upper[i] >= middle[i]
            assert middle[i] >= lower[i]

    def test_constant_prices_bands_equal(self):
        """With constant prices, std dev is 0 so bands collapse to SMA."""
        prices = [50.0] * 30
        upper, middle, lower = bollinger_bands(prices, period=20)

        for i in range(19, 30):
            assert_close(upper[i], 50.0)
            assert_close(middle[i], 50.0)
            assert_close(lower[i], 50.0)

    def test_warmup_nan(self):
        prices = [float(i) for i in range(25)]
        upper, middle, lower = bollinger_bands(prices, period=20)
        assert count_nan(upper[:19]) == 19
        assert count_nan(middle[:19]) == 19
        assert count_nan(lower[:19]) == 19
