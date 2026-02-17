/**
 * Computes all performance metrics from equity curve and trade list.
 */
export class PerformanceMetrics {
    /**
     * Compute full backtest result from raw data.
     */
    compute(config, equityCurve, trades, tokenPrices) {
        const initialCapital = config.initialCapital;
        const finalEquity = equityCurve.at(-1)?.equity ?? initialCapital;
        // Returns
        const totalReturnPct = ((finalEquity - initialCapital) / initialCapital) * 100;
        const annualizedReturnPct = this.computeCAGR(initialCapital, finalEquity, config.startDate, config.endDate);
        // Risk from equity curve
        const { maxDrawdownPct, maxDrawdownDurationBars, drawdownCurve } = this.computeDrawdown(equityCurve);
        const annualizedVolatility = this.computeAnnualizedVolatility(equityCurve, config.barInterval);
        const downsideDeviation = this.computeDownsideDeviation(equityCurve, config.barInterval);
        // Risk-adjusted
        const sharpeRatio = annualizedVolatility > 0 ? annualizedReturnPct / 100 / annualizedVolatility : 0;
        const sortinoRatio = downsideDeviation > 0 ? annualizedReturnPct / 100 / downsideDeviation : 0;
        const calmarRatio = maxDrawdownPct > 0 ? annualizedReturnPct / maxDrawdownPct : 0;
        // Trade stats
        const { winRate, profitFactor, avgWinPct, avgLossPct, largestWinPct, largestLossPct, avgHoldingBars } = this.computeTradeStats(trades);
        // Benchmark
        const buyAndHoldReturnPct = this.computeBuyAndHold(tokenPrices, initialCapital);
        const alpha = totalReturnPct - buyAndHoldReturnPct;
        return {
            config,
            totalReturnPct: round(totalReturnPct),
            annualizedReturnPct: round(annualizedReturnPct),
            maxDrawdownPct: round(maxDrawdownPct),
            maxDrawdownDurationBars,
            annualizedVolatility: round(annualizedVolatility * 100),
            downsideDeviation: round(downsideDeviation * 100),
            sharpeRatio: round(sharpeRatio),
            sortinoRatio: round(sortinoRatio),
            calmarRatio: round(calmarRatio),
            totalTrades: trades.length,
            winRate: round(winRate),
            profitFactor: round(profitFactor),
            avgWinPct: round(avgWinPct),
            avgLossPct: round(avgLossPct),
            largestWinPct: round(largestWinPct),
            largestLossPct: round(largestLossPct),
            avgHoldingBars: round(avgHoldingBars),
            buyAndHoldReturnPct: round(buyAndHoldReturnPct),
            alpha: round(alpha),
            equityCurve,
            trades,
            drawdownCurve,
        };
    }
    /**
     * CAGR: Compound Annual Growth Rate.
     */
    computeCAGR(initial, final, startDate, endDate) {
        const days = (endDate.getTime() - startDate.getTime()) / (1000 * 86400);
        if (days <= 0 || initial <= 0)
            return 0;
        const years = days / 365;
        return (Math.pow(final / initial, 1 / years) - 1) * 100;
    }
    /**
     * Max drawdown from equity curve high-water mark.
     * Also computes the longest underwater period and full drawdown curve.
     */
    computeDrawdown(equityCurve) {
        if (equityCurve.length === 0) {
            return { maxDrawdownPct: 0, maxDrawdownDurationBars: 0, drawdownCurve: [] };
        }
        let hwm = equityCurve[0].equity;
        let maxDd = 0;
        let maxDdDuration = 0;
        let currentDdDuration = 0;
        const drawdownCurve = [];
        for (const point of equityCurve) {
            if (point.equity > hwm) {
                hwm = point.equity;
                currentDdDuration = 0;
            }
            else {
                currentDdDuration++;
            }
            const dd = hwm > 0 ? ((hwm - point.equity) / hwm) * 100 : 0;
            if (dd > maxDd)
                maxDd = dd;
            if (currentDdDuration > maxDdDuration)
                maxDdDuration = currentDdDuration;
            drawdownCurve.push({ timestamp: point.timestamp, drawdownPct: dd });
        }
        return { maxDrawdownPct: maxDd, maxDrawdownDurationBars: maxDdDuration, drawdownCurve };
    }
    /**
     * Annualized volatility from bar-to-bar equity returns.
     */
    computeAnnualizedVolatility(equityCurve, barInterval) {
        const returns = this.computeReturns(equityCurve);
        if (returns.length < 2)
            return 0;
        const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
        const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
        const stdDev = Math.sqrt(variance);
        const barsPerYear = this.barsPerYear(barInterval);
        return stdDev * Math.sqrt(barsPerYear);
    }
    /**
     * Downside deviation: std dev of negative returns only.
     */
    computeDownsideDeviation(equityCurve, barInterval) {
        const returns = this.computeReturns(equityCurve);
        const negativeReturns = returns.filter((r) => r < 0);
        if (negativeReturns.length < 2)
            return 0;
        const variance = negativeReturns.reduce((s, r) => s + r ** 2, 0) / negativeReturns.length;
        const stdDev = Math.sqrt(variance);
        const barsPerYear = this.barsPerYear(barInterval);
        return stdDev * Math.sqrt(barsPerYear);
    }
    /**
     * Trade statistics: win rate, profit factor, averages, extremes.
     */
    computeTradeStats(trades) {
        if (trades.length === 0) {
            return {
                winRate: 0,
                profitFactor: 0,
                avgWinPct: 0,
                avgLossPct: 0,
                largestWinPct: 0,
                largestLossPct: 0,
                avgHoldingBars: 0,
            };
        }
        const wins = trades.filter((t) => t.pnl > 0);
        const losses = trades.filter((t) => t.pnl <= 0);
        const winRate = (wins.length / trades.length) * 100;
        const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
        const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
        const avgWinPct = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPercent, 0) / wins.length : 0;
        const avgLossPct = losses.length > 0 ? losses.reduce((s, t) => s + t.pnlPercent, 0) / losses.length : 0;
        const largestWinPct = wins.length > 0 ? Math.max(...wins.map((t) => t.pnlPercent)) : 0;
        const largestLossPct = losses.length > 0 ? Math.min(...losses.map((t) => t.pnlPercent)) : 0;
        const avgHoldingBars = trades.reduce((s, t) => s + t.holdingBars, 0) / trades.length;
        return { winRate, profitFactor, avgWinPct, avgLossPct, largestWinPct, largestLossPct, avgHoldingBars };
    }
    /**
     * Buy-and-hold benchmark: equal-weight portfolio of all tokens, held start to end.
     */
    computeBuyAndHold(tokenPrices, initialCapital) {
        const tokens = [...tokenPrices.entries()].filter(([, bars]) => bars.length >= 2);
        if (tokens.length === 0)
            return 0;
        const perToken = initialCapital / tokens.length;
        let finalValue = 0;
        for (const [, bars] of tokens) {
            const startPrice = bars[0].price;
            const endPrice = bars.at(-1).price;
            if (startPrice > 0) {
                finalValue += perToken * (endPrice / startPrice);
            }
        }
        return ((finalValue - initialCapital) / initialCapital) * 100;
    }
    // ── Helpers ───────────────────────────────────────────
    computeReturns(equityCurve) {
        const returns = [];
        for (let i = 1; i < equityCurve.length; i++) {
            const prev = equityCurve[i - 1].equity;
            const curr = equityCurve[i].equity;
            if (prev > 0) {
                returns.push((curr - prev) / prev);
            }
        }
        return returns;
    }
    barsPerYear(barInterval) {
        switch (barInterval) {
            case "1h":
                return 8760;
            case "4h":
                return 2190;
            case "1d":
                return 365;
            default:
                return 365;
        }
    }
}
function round(n) {
    if (!isFinite(n))
        return 0;
    return Math.round(n * 100) / 100;
}
//# sourceMappingURL=PerformanceMetrics.js.map