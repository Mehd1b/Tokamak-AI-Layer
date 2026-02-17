import { SimulatedExchange } from "./SimulatedExchange.js";
/**
 * Manages portfolio state: cash, positions, equity tracking.
 * Handles stop-loss, take-profit, and trailing stop execution.
 */
export class Portfolio {
    cash;
    positions = [];
    closedTrades = [];
    equityCurve = [];
    peakEquity;
    nextPositionId = 1;
    exchange;
    constructor(initialCapital, executionConfig) {
        this.cash = initialCapital;
        this.peakEquity = initialCapital;
        this.exchange = new SimulatedExchange(executionConfig);
    }
    // ── Getters ───────────────────────────────────────────
    getCash() {
        return this.cash;
    }
    getPositions() {
        return this.positions;
    }
    getClosedTrades() {
        return this.closedTrades;
    }
    getEquityCurve() {
        return this.equityCurve;
    }
    getOpenPositionCount() {
        return this.positions.length;
    }
    hasPositionFor(token) {
        return this.positions.some((p) => p.token.toLowerCase() === token.toLowerCase());
    }
    /**
     * Compute mark-to-market equity.
     */
    computeEquity(currentPrices) {
        let positionsValue = 0;
        for (const pos of this.positions) {
            const price = currentPrices.get(pos.token.toLowerCase()) ?? pos.entryPrice;
            if (pos.direction === "long") {
                positionsValue += pos.size * price;
            }
            else {
                // Short P&L: (entryPrice - currentPrice) * size
                positionsValue += pos.size * (2 * pos.entryPrice - price);
            }
        }
        return this.cash + positionsValue;
    }
    // ── Position Management ───────────────────────────────
    /**
     * Open a new position.
     */
    openPosition(token, symbol, direction, price, equityPct, currentEquity, atr, riskConfig, barIndex) {
        const allocationUsd = currentEquity * (equityPct / 100);
        if (allocationUsd <= 0 || this.cash < allocationUsd)
            return null;
        // Simulate fill
        const fill = direction === "long"
            ? this.exchange.simulateBuy(price, allocationUsd)
            : this.exchange.simulateSell(price, allocationUsd);
        const effectiveUsd = allocationUsd - fill.totalFees;
        if (effectiveUsd <= 0)
            return null;
        const size = effectiveUsd / fill.fillPrice;
        // ATR-based stop-loss and take-profit
        const atrValue = atr > 0 ? atr : price * 0.02; // Fallback to 2% if ATR is 0
        let stopLoss;
        let takeProfit;
        if (direction === "long") {
            stopLoss = fill.fillPrice - riskConfig.stopLossAtrMultiple * atrValue;
            takeProfit = fill.fillPrice + riskConfig.takeProfitAtrMultiple * atrValue;
        }
        else {
            stopLoss = fill.fillPrice + riskConfig.stopLossAtrMultiple * atrValue;
            takeProfit = fill.fillPrice - riskConfig.takeProfitAtrMultiple * atrValue;
        }
        // Trailing stop initial value
        const trailingStop = riskConfig.trailingStopPct !== null
            ? (direction === "long"
                ? fill.fillPrice * (1 - riskConfig.trailingStopPct / 100)
                : fill.fillPrice * (1 + riskConfig.trailingStopPct / 100))
            : null;
        const position = {
            id: `pos-${this.nextPositionId++}`,
            token,
            symbol,
            direction,
            entryPrice: fill.fillPrice,
            entryBar: barIndex,
            size,
            costBasis: allocationUsd,
            stopLoss,
            takeProfit,
            trailingStop,
        };
        this.cash -= allocationUsd;
        this.positions.push(position);
        return position;
    }
    /**
     * Close a position at the given price.
     */
    closePosition(positionId, exitPrice, exitReason, barIndex, timestamp, entryTimestamp) {
        const idx = this.positions.findIndex((p) => p.id === positionId);
        if (idx === -1)
            return null;
        const pos = this.positions[idx];
        const notional = pos.size * exitPrice;
        // Simulate fill
        const fill = pos.direction === "long"
            ? this.exchange.simulateSell(exitPrice, notional)
            : this.exchange.simulateBuy(exitPrice, notional);
        let pnl;
        if (pos.direction === "long") {
            pnl = pos.size * fill.fillPrice - pos.costBasis - fill.totalFees;
        }
        else {
            // Short: profit when price goes down
            pnl = pos.costBasis - pos.size * fill.fillPrice - fill.totalFees;
        }
        const pnlPercent = pos.costBasis > 0 ? (pnl / pos.costBasis) * 100 : 0;
        // Add proceeds to cash
        if (pos.direction === "long") {
            this.cash += pos.size * fill.fillPrice - fill.totalFees;
        }
        else {
            this.cash += pos.costBasis + pnl;
        }
        const trade = {
            token: pos.token,
            symbol: pos.symbol,
            direction: pos.direction,
            entryPrice: pos.entryPrice,
            exitPrice: fill.fillPrice,
            entryTimestamp,
            exitTimestamp: timestamp,
            pnl,
            pnlPercent,
            holdingBars: barIndex - pos.entryBar,
            exitReason,
            fees: fill.totalFees,
        };
        this.closedTrades.push(trade);
        this.positions.splice(idx, 1);
        return trade;
    }
    // ── Order Execution ───────────────────────────────────
    /**
     * Check and execute pending stop-loss, take-profit, and trailing stop orders.
     * Called at the start of each bar with the current bar's price.
     */
    checkOrders(currentPrices, barIndex, timestamp, barTimestamps, riskConfig) {
        const triggered = [];
        // Iterate in reverse so splicing doesn't break indices
        for (let i = this.positions.length - 1; i >= 0; i--) {
            const pos = this.positions[i];
            const price = currentPrices.get(pos.token.toLowerCase());
            if (price === undefined)
                continue;
            let exitReason = null;
            if (pos.direction === "long") {
                // Update trailing stop
                if (pos.trailingStop !== null && riskConfig.trailingStopPct !== null) {
                    const newTrailing = price * (1 - riskConfig.trailingStopPct / 100);
                    if (newTrailing > pos.trailingStop) {
                        pos.trailingStop = newTrailing;
                    }
                }
                // Check stop-loss
                if (price <= pos.stopLoss) {
                    exitReason = "stop_loss";
                }
                // Check take-profit
                else if (price >= pos.takeProfit) {
                    exitReason = "take_profit";
                }
                // Check trailing stop
                else if (pos.trailingStop !== null && price <= pos.trailingStop) {
                    exitReason = "trailing_stop";
                }
            }
            else {
                // Short position
                if (pos.trailingStop !== null && riskConfig.trailingStopPct !== null) {
                    const newTrailing = price * (1 + riskConfig.trailingStopPct / 100);
                    if (newTrailing < pos.trailingStop) {
                        pos.trailingStop = newTrailing;
                    }
                }
                if (price >= pos.stopLoss) {
                    exitReason = "stop_loss";
                }
                else if (price <= pos.takeProfit) {
                    exitReason = "take_profit";
                }
                else if (pos.trailingStop !== null && price >= pos.trailingStop) {
                    exitReason = "trailing_stop";
                }
            }
            if (exitReason !== null) {
                const tokenTimestamps = barTimestamps.get(pos.token.toLowerCase()) ?? [];
                const entryTs = tokenTimestamps[pos.entryBar] ?? timestamp;
                const trade = this.closePosition(pos.id, price, exitReason, barIndex, timestamp, entryTs);
                if (trade)
                    triggered.push(trade);
            }
        }
        return triggered;
    }
    // ── Equity Curve ──────────────────────────────────────
    /**
     * Record an equity point for the current bar.
     */
    recordEquityPoint(currentPrices, barIndex, timestamp) {
        let positionsValue = 0;
        for (const pos of this.positions) {
            const price = currentPrices.get(pos.token.toLowerCase()) ?? pos.entryPrice;
            if (pos.direction === "long") {
                positionsValue += pos.size * price;
            }
            else {
                positionsValue += pos.size * (2 * pos.entryPrice - price);
            }
        }
        const equity = this.cash + positionsValue;
        if (equity > this.peakEquity)
            this.peakEquity = equity;
        const drawdownPct = this.peakEquity > 0
            ? ((this.peakEquity - equity) / this.peakEquity) * 100
            : 0;
        const point = {
            timestamp,
            bar: barIndex,
            equity,
            cash: this.cash,
            positionsValue,
            drawdownPct,
        };
        this.equityCurve.push(point);
        return point;
    }
    /**
     * Close all remaining positions at end of backtest.
     */
    closeAllPositions(currentPrices, barIndex, timestamp, barTimestamps) {
        const trades = [];
        for (let i = this.positions.length - 1; i >= 0; i--) {
            const pos = this.positions[i];
            const price = currentPrices.get(pos.token.toLowerCase()) ?? pos.entryPrice;
            const tokenTimestamps = barTimestamps.get(pos.token.toLowerCase()) ?? [];
            const entryTs = tokenTimestamps[pos.entryBar] ?? timestamp;
            const trade = this.closePosition(pos.id, price, "end_of_data", barIndex, timestamp, entryTs);
            if (trade)
                trades.push(trade);
        }
        return trades;
    }
    /**
     * Check if circuit breaker should halt trading.
     */
    isCircuitBreakerTriggered(maxDrawdownPct) {
        const lastPoint = this.equityCurve.at(-1);
        if (!lastPoint)
            return false;
        return lastPoint.drawdownPct >= maxDrawdownPct;
    }
}
//# sourceMappingURL=Portfolio.js.map