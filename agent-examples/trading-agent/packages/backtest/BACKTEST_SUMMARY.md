# Backtest Engine: Technical Summary

## 1. Architecture Overview

The backtest engine is a bar-driven event-loop simulator that replays historical prices through the same signal pipeline used by the live trading agent. It enforces a **1-bar execution delay** on all entries and signal-based exits to eliminate look-ahead bias: signals are computed on bar `t`, but fills execute at bar `t+1` price.

### Package Structure (10 source files)

| File | Class/Module | Lines | Responsibility |
|------|-------------|-------|----------------|
| `BacktestEngine.ts` | `BacktestEngine` | 406 | Main orchestrator: data loading, timestamp alignment, bar-by-bar simulation loop, trend filter |
| `SignalEngine.ts` | `SignalEngine` | 282 | Signal generation: 13 technical indicators with weighted long/short scoring |
| `Portfolio.ts` | `Portfolio` | 350 | Position management: open/close, equity tracking, stop/TP/trailing execution |
| `SimulatedExchange.ts` | `SimulatedExchange` | 55 | Fill simulation: slippage models, swap fees, gas costs |
| `PerformanceMetrics.ts` | `PerformanceMetrics` | 243 | Post-run metrics: returns, drawdown, Sharpe/Sortino/Calmar, trade stats, buy-and-hold benchmark |
| `HistoricalDataLoader.ts` | `HistoricalDataLoader` | 191 | DeFiLlama chart API fetcher with disk cache and resampling |
| `ReportGenerator.ts` | `ReportGenerator` | 172 | Console report formatter with sparkline equity curve and JSON export |
| `cli.ts` | CLI entry point | 171 | Argument parsing, token resolution, config assembly |
| `types.ts` | Type definitions | 226 | All interfaces, enums, and default configs |
| `index.ts` | Public exports | 31 | Re-exports all classes, types, and defaults |

### Event Loop (per bar)

```
for each bar t in [0..N]:
  1. checkOrders()         -- execute pending stop-loss / take-profit / trailing stop at bar t price
  2. trendFilter()         -- compute WETH SMA regime gate (if enabled)
  3. computeSignal()       -- generate long/short scores from lookback window [0..t]
  4. closePositions()      -- exit positions where score < exitThreshold (fill at bar t+1)
  5. rankAndOpen()         -- rank tokens by score, open new positions above entryThreshold (fill at bar t+1)
  6. recordEquityPoint()   -- mark-to-market portfolio snapshot
  7. checkCircuitBreaker() -- halt new trades if drawdown exceeds maxDrawdownPct
```

### Indicator Pipeline Reuse

The `SignalEngine` calls `QuantAnalysis.computeTechnicalIndicators()` directly from `@tal-trading-agent/agent-core`, ensuring **zero divergence** between backtest and live signal computation. The 13 signal conversion functions (e.g., `rsiToSignal`, `macdToSignal`) are reimplemented as standalone functions because `TokenScorer` keeps them as private methods. The `TECHNICAL_WEIGHTS` object is copied verbatim from `TokenScorer` (lines 12-26 in agent-core).

DeFi metrics (TVL, volume, holder count, etc.) are unavailable in historical data. The technical-only subset is re-normalized: `TOTAL_TECH_WEIGHT = 0.47` (sum of 13 weights), and scores are scaled to `[0, 100]` via `(weightedSum / TOTAL_TECH_WEIGHT)`.

---

## 2. Signal Pipeline

### 13 Technical Indicators

| # | Indicator | Weight | Long Signal Logic | Short Signal Logic |
|---|-----------|--------|-------------------|--------------------|
| 1 | Price Momentum | 0.05 | Linear map [-20%, +20%] to [0, 100] | Inverted: [-20%, +20%] to [100, 0] |
| 2 | RSI | 0.04 | Contrarian: RSI <= 20 -> 90, >= 80 -> 10 | RSI >= 80 -> 90, <= 20 -> 10 |
| 3 | MACD Histogram | 0.04 | `tanh(histogram * 10) * 50 + 50` | `tanh(-histogram * 10) * 50 + 50` |
| 4 | ADX (+DI/-DI) | 0.05 | Strong uptrend (ADX>20, +DI>-DI) -> 90 | Strong downtrend (-DI>+DI) -> 90 |
| 5 | Aroon Oscillator | 0.03 | Linear map [-100, +100] to [0, 100] | Inverted oscillator |
| 6 | Stochastic RSI | 0.04 | Contrarian: K <= 20 -> 85, >= 80 -> 15 | K >= 80 -> 85, <= 20 -> 15 |
| 7 | Williams %R | 0.03 | Contrarian: WR <= -80 -> 85, >= -20 -> 15 | WR >= -20 -> 85, <= -80 -> 15 |
| 8 | ROC | 0.03 | Linear map [-30%, +30%] to [0, 100] | Inverted ROC |
| 9 | ATR (% of price) | 0.03 | Low vol favored: ATR% <= 1 -> 70, >= 10 -> 15 | Same (direction-agnostic) |
| 10 | Historical Volatility | 0.02 | Low vol favored: annVol <= 0.3 -> 75 | Same (direction-agnostic) |
| 11 | VWAP Deviation | 0.03 | Linear map [-10%, +10%] to [0, 100] | Linear map (same direction as deviation) |
| 12 | Bollinger %B | 0.03 | Below band (%B<0) -> 80, above (>1) -> 20 | Above band -> 80, below -> 20 |
| 13 | Trend Strength Composite | 0.05 | Clamped to [0, 100] | Inverted: `max(0, -TSC)` |

**Total technical weight**: 0.47 (normalized to 1.0 for scoring)

### Score Output

- `longScore`: Weighted average of 13 long signals, normalized to [0, 100], rounded to 1 decimal
- `shortScore`: Weighted average of 13 short (inverted) signals, normalized to [0, 100], rounded to 1 decimal
- `atr`: Raw ATR value used for stop-loss/take-profit placement

---

## 3. Execution Simulation

### Slippage Models

| Model | Formula | Default |
|-------|---------|---------|
| **Fixed** | `slippage = fixedSlippageBps / 10000` | 30 bps (0.3%) |
| **Sqrt (AMM)** | `slippage = baseBps/10000 * sqrt(notionalUsd / 1,000,000)` | Reference liquidity $1M |

Buy fills: `fillPrice = marketPrice * (1 + slippage)`
Sell fills: `fillPrice = marketPrice * (1 - slippage)`

### Fee Structure

| Component | Default | Description |
|-----------|---------|-------------|
| Swap fee | 30 bps | `notionalUsd * (swapFeeBps / 10000)` per trade |
| Gas cost | $5 flat | Added to every fill |

Total fees per trade: `swapFee + gasPerTradeUsd`

### Risk Controls

| Control | Formula | Default |
|---------|---------|---------|
| Stop-loss (long) | `entryPrice - N * ATR` | N = 2 |
| Stop-loss (short) | `entryPrice + N * ATR` | N = 2 |
| Take-profit (long) | `entryPrice + N * ATR` | N = 4 |
| Take-profit (short) | `entryPrice - N * ATR` | N = 4 |
| Trailing stop (long) | `currentPrice * (1 - trailingPct/100)`, ratchets up | Off by default |
| Trailing stop (short) | `currentPrice * (1 + trailingPct/100)`, ratchets down | Off by default |
| Circuit breaker | Halt new trades when drawdown >= maxDrawdownPct | 25% |
| Position sizing | `currentEquity * (maxPositionPct / 100)` per position | 20% equity |
| Max concurrent | Hard cap on open positions | 5 |

### Order Execution Priority

Each bar, orders are checked before new signals: `stop_loss > take_profit > trailing_stop`. This ensures risk limits are respected before any new position logic runs.

---

## 4. Parameter Optimization Journey

Six iterative runs on WETH, WBTC, UNI, AAVE, LINK with $10,000 initial capital and 1d bars.

### Run Results

| Run | Period | Entry | Short Entry | Shorts | Stop ATR | Trailing | Return | B&H | Alpha | Sharpe | Trades | Key Insight |
|-----|--------|-------|-------------|--------|----------|----------|--------|-----|-------|--------|--------|-------------|
| 1 | 2025-2026 | 62 | - | No | 2.0 | Off | -17.18% | -45.20% | +28.02% | -0.82 | 37 | Bear market, too many entries at low threshold |
| 2 | 2025-2026 | 62 | 65 | Yes | 1.5 | Off | -13.20% | -45.20% | +32.00% | N/A | N/A | Shorts help, tighter stops reduce tail losses |
| 3 | 2025-2026 | 68 | 56 | Yes | 1.5 | 8% | -3.94% | -45.20% | +41.26% | -0.44 | 18 | Higher selectivity cuts bad trades in half |
| 4 | 2025-2026 | 72 | 52 | Yes | 1.5 | 8% | -7.18% | N/A | N/A | N/A | 47 | Short threshold too loose, excessive short entries |
| 5 | 2025-2026 | 72 | 56 | Yes | 1.5 | 8% | **+2.30%** | -45.20% | **+47.50%** | **+0.52** | 7 | **First profitable configuration** |
| 6 (OOS) | 2024-2025 | 72 | 56 | Yes | 1.5 | 8% | -6.67% | 55.98% | -62.69% | -0.65 | 11 | Overfit to bear regime, underperforms bull market |

### Optimization Trajectory

- **Runs 1-2**: Established that shorts add value and tighter stops (1.5x ATR vs 2.0x) reduce drawdowns
- **Run 3**: Raised entry threshold from 62 to 68, cutting trades from 37 to 18 with dramatic alpha improvement
- **Run 4**: Explored loosening short threshold to 52 -- catastrophic, generated 47 trades (noise trading)
- **Run 5**: Sweet spot at entry 72 / short-entry 56 -- only 7 high-conviction trades, first positive absolute return
- **Run 6**: Out-of-sample validation on 2024-2025 bull period. Parameters are overfit to bear regime

---

## 5. Trend Filter Implementation & Analysis

### Design

- **Reference token**: WETH
- **Indicator**: 50-bar Simple Moving Average (SMA)
- **Regime logic**:
  - Price > SMA (uptrend) -> allow longs only, block shorts
  - Price < SMA (downtrend) -> allow shorts only, block longs

The SMA is computed inline in `BacktestEngine.computeSMA()` over the aligned price matrix. The filter is evaluated before signal-based entry decisions each bar. It does not affect stop-loss, take-profit, or trailing stop execution.

### CLI Usage

```bash
pnpm --filter @tal-trading-agent/backtest backtest \
  --entry 72 --shorts true --short-entry 56 \
  --stop-atr 1.5 --trailing-stop 8 \
  --trend-filter true --tf-period 50
```

### Results: Bear Period (2025-02-17 to 2026-02-17)

| Metric | Without Filter | With Filter | Delta |
|--------|---------------|-------------|-------|
| Total Return | +2.30% | +3.11% | +0.81% |
| Sharpe Ratio | 0.52 | 0.71 | +0.19 |
| Max Drawdown | 3.09% | 2.45% | -0.64% |
| Trades | 7 | 6 | -1 |

The filter blocked 1 bad long trade during a downtrend bar, preventing a small loss. Marginal but directionally correct.

### Results: Bull Period (2024-02-17 to 2025-02-17)

| Metric | Without Filter | With Filter | Delta |
|--------|---------------|-------------|-------|
| Total Return | -6.67% | -6.67% | 0.00% |
| Sharpe Ratio | -0.65 | -0.65 | 0.00 |
| Trades | 11 | 11 | 0 |

Zero effect. All 11 trades were identical with and without the filter.

### Interpretation

The trend filter is **largely redundant** with the signal pipeline at high entry thresholds (72+). The 13-indicator composite already implicitly captures trend (via momentum, MACD, ADX, Aroon, trend strength composite = 0.22 combined weight). At threshold 72, only strong-conviction signals pass, and these are almost always aligned with the macro trend. The simple MA filter adds minimal additional information.

The filter may have more impact at lower thresholds (e.g., 62) where marginal signals could be counter-trend, but lower thresholds produce worse overall results regardless.

---

## 6. Key Quantitative Findings

### Best Configuration

```
entry-threshold:       72
short-entry-threshold: 56
exit-threshold:        40
short-exit-threshold:  40
stop-loss-atr:         1.5
take-profit-atr:       4.0
trailing-stop:         8%
max-positions:         5
max-position-pct:      20%
slippage:              30 bps (fixed)
swap-fee:              30 bps
gas:                   $5/trade
```

### Performance Summary

| Metric | Bear (2025-2026) | Bull (2024-2025) |
|--------|-------------------|-------------------|
| Total Return | +2.30% | -6.67% |
| Buy & Hold | -45.20% | +55.98% |
| Alpha | +47.50% | -62.69% |
| Max Drawdown | 3.09% | N/A |
| Sharpe Ratio | 0.52 | -0.65 |
| Total Trades | 7 | 11 |

### Core Observations

1. **Bear market alpha generation**: The strategy outperforms buy-and-hold by +47.50% in bear markets through high selectivity and short exposure. Only 7 trades in 365 days -- the edge is in not trading.

2. **Bull market underperformance**: The same parameters produce -62.69% alpha in bull markets. High entry thresholds (72) filter out many valid long signals during a rising market, and the 8% trailing stop exits positions prematurely during volatile uptrends.

3. **Regime dependence**: Parameters optimized for bear conditions are anti-correlated with bull performance. This is the classic overfitting signature -- the strategy memorizes one regime.

4. **Signal pipeline trend-awareness**: The composite signal inherently captures trend through 5 trend-sensitive indicators (momentum, MACD, ADX, Aroon, trend strength) totaling 0.22 weight. Simple MA overlays add negligible information at high thresholds.

5. **Trade frequency inversely correlates with performance**: Run 1 (37 trades, -17.18%) vs Run 5 (7 trades, +2.30%). Fewer, higher-conviction trades consistently outperform.

---

## 7. Recommendations for Production

### Walk-Forward Optimization

The single in-sample/out-of-sample split (Runs 5 vs 6) reveals clear overfitting. Production deployment requires:

- Rolling 6-month in-sample window, 3-month out-of-sample validation
- Re-optimize parameters at each roll
- Track parameter stability across windows (if optimal entry threshold jumps from 60 to 80, the signal is unstable)

### Regime-Adaptive Parameters

Rather than a single parameter set, use regime detection to switch between configurations:

| Regime | Entry | Short Entry | Trailing Stop | Rationale |
|--------|-------|-------------|---------------|-----------|
| Bear (WETH < 200d MA) | 72 | 56 | 8% | High selectivity, favor shorts |
| Bull (WETH > 200d MA) | 58-62 | 70+ | 12-15% | Lower long threshold, restrict shorts, wider trailing |
| Sideways (ADX < 20) | 75+ | 75+ | 5% | Ultra-selective, tight exits |

### Statistical Significance

- Current dataset: ~365 bars per test, 7-11 trades per run
- Minimum for confidence: 30+ trades across 2+ years (730+ daily bars)
- Recommend: extend backtest to 2022-2026 (4 years) covering multiple regime transitions (2022 bear, 2023 recovery, 2024 bull, 2025 correction)

### Ensemble Approach

Deploy multiple parameter sets in parallel, weighted by detected regime:

```
finalScore = w_bear * score_bear_params + w_bull * score_bull_params + w_neutral * score_neutral_params
```

Where `w_*` weights are derived from a regime classifier (e.g., WETH position relative to 50/200 MA crossover, realized volatility percentile, or ADX level).

### Execution Improvements

- Replace fixed slippage with the sqrt AMM model for more realistic large-trade simulation
- Add partial position sizing: scale allocation by signal conviction (score 72 = 50% size, score 85 = 100% size)
- Implement time-based exits: force close after N bars regardless of signal (prevents holding through regime changes)

---

## Appendix: Default Configuration Reference

```typescript
// Strategy defaults
entryThreshold: 62       // Score > 62 triggers long
exitThreshold: 40        // Score < 40 exits long
maxPositions: 5          // Max concurrent positions
useShorts: false          // Short selling disabled
shortEntryThreshold: 65  // Score > 65 triggers short
shortExitThreshold: 40   // Score < 40 covers short
lookbackBars: 50         // Indicator computation window
trendFilter.enabled: false
trendFilter.token: WETH (0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2)
trendFilter.maPeriod: 50

// Execution defaults
slippageModel: "fixed"
fixedSlippageBps: 30     // 0.3%
swapFeeBps: 30           // 0.3%
gasPerTradeUsd: 5        // $5 flat

// Risk defaults
maxPositionPct: 20       // 20% of equity per position
stopLossAtrMultiple: 2   // Stop at entry - 2*ATR
takeProfitAtrMultiple: 4 // TP at entry + 4*ATR
maxDrawdownPct: 25       // Circuit breaker at 25% drawdown
trailingStopPct: null    // Trailing stop disabled
```

## Appendix: CLI Reference

```bash
pnpm --filter @tal-trading-agent/backtest backtest [options]

Options:
  --tokens        Comma-separated symbols (default: WETH,WBTC,UNI,AAVE,LINK)
  --start         Start date YYYY-MM-DD (default: 1 year ago)
  --end           End date YYYY-MM-DD (default: today)
  --capital       Initial capital USD (default: 10000)
  --interval      Bar interval: 1h, 4h, 1d (default: 1d)
  --entry         Entry score threshold (default: 62)
  --exit          Exit score threshold (default: 40)
  --max-positions Max concurrent positions (default: 5)
  --stop-atr      Stop-loss ATR multiple (default: 2)
  --tp-atr        Take-profit ATR multiple (default: 4)
  --trailing-stop Trailing stop % (default: off)
  --slippage      Fixed slippage bps (default: 30)
  --fee           Swap fee bps (default: 30)
  --shorts        Allow shorts (default: false)
  --short-entry   Short entry score threshold (default: 65)
  --short-exit    Short exit score threshold (default: 40)
  --trend-filter  Enable WETH 50-bar MA trend filter (default: false)
  --tf-period     Trend filter MA period (default: 50)
  --output        Output JSON path (default: .backtest-results/latest.json)
```
