# Polymarket Bot

A verifiable prediction market trading agent for [Polymarket](https://polymarket.com),
built on the Tokamak AI Layer. Runs strategy logic inside RISC Zero zkVM for
provable, trustless execution.

## Strategy Modes

### Mode 0: Probability Threshold (default)

Buys YES tokens when the market probability drops below `BUY_THRESHOLD` (undervalued)
and buys NO tokens when it rises above `SELL_THRESHOLD` (overvalued). Exits on
stop loss, take profit, or drawdown circuit breaker.

### Mode 1: Spread Capture

Buys when bid-ask spread is wide (>2%) and probability is near 50% (30-70% range).
Profits from spread compression.

## Risk Management

- **Slippage protection**: Minimum output enforced on every trade
- **Stop loss / Take profit**: Configurable in basis points
- **Drawdown circuit breaker**: Closes positions if portfolio drawdown exceeds limit (default 5%)
- **Position sizing**: 10% of available balance per trade, capped at `MAX_POSITION_USDC`
- **Market resolution**: Automatically redeems winning tokens when market resolves

## Architecture

```
┌──────────────────────────────────┐
│ Host (polymarket-bot-host)       │
│ - Fetches orderbook from CLOB API│
│ - Builds PolymarketInput         │
│ - Signs oracle price feed        │
│ - Submits execution to vault     │
└──────────────┬───────────────────┘
               │ input bytes
               ▼
┌──────────────────────────────────┐
│ Agent (polymarket-bot)           │
│ - Runs inside RISC Zero zkVM    │
│ - Deterministic decision logic   │
│ - Outputs CALL actions           │
└──────────────┬───────────────────┘
               │ actions
               ▼
┌──────────────────────────────────┐
│ KernelVault → PolymarketAdapter  │
│ - Verifies ZK proof              │
│ - Executes buy/sell/redeem       │
│ - Routes to CTF Exchange         │
└──────────────────────────────────┘
```

## Quick Start

```bash
# 1. Configure
cp .env.example .env
# Edit .env with your market, thresholds, and keys

# 2. Build
tal build --elf

# 3. Deploy (to Polygon)
tal deploy

# 4. Run
./run-bot.sh

# Dry run (no on-chain submission):
./run-bot.sh --dry-run --once
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CONDITION_ID` | — | Polymarket market condition ID |
| `YES_TOKEN_ID` | — | Token ID for YES outcome |
| `NO_TOKEN_ID` | — | Token ID for NO outcome |
| `STRATEGY_MODE` | `0` | 0 = threshold, 1 = spread |
| `BUY_THRESHOLD` | `0.40` | Buy YES below this probability |
| `SELL_THRESHOLD` | `0.70` | Buy NO above this probability |
| `MAX_POSITION_USDC` | `100` | Max position size in USDC |
| `SLIPPAGE_BPS` | `100` | Max slippage (1%) |
| `STOP_LOSS_BPS` | `500` | Stop loss (5%) |
| `TAKE_PROFIT_BPS` | `1000` | Take profit (10%) |
| `MONITOR_INTERVAL` | `30` | Seconds between cycles |

## Input Format

The agent receives 196 bytes of input:

- **Bytes 0-35**: `StateSnapshotV1` (drawdown/cooldown state)
- **Bytes 36-195**: `PolymarketInput` (market data + strategy params)

All probabilities are 1e6-scaled (500000 = 50%). USDC amounts are raw 6-decimal values.

## Output Actions

The agent outputs CALL actions targeting the PolymarketAdapter:

| Action | Selector | When |
|--------|----------|------|
| `buyOutcome(bool,uint256,uint256)` | `0x193099a8` | Enter position |
| `sellOutcome(bool,uint256,uint256)` | `0xe88b997b` | Exit position |
| `redeemResolved()` | `0xe48f8d53` | Market resolved, we won |
| `withdrawToVault()` | `0x84f22721` | Return USDC to vault |
