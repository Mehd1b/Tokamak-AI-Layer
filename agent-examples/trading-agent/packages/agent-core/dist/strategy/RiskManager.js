import pino from "pino";
import { getAddress, isAddress } from "viem";
import { DEFAULT_RISK_PARAMS } from "@tal-trading-agent/shared";
export class RiskManager {
    params;
    log;
    constructor(config = {}) {
        this.params = { ...DEFAULT_RISK_PARAMS, ...config.params };
        this.log = pino({ name: "RiskManager" });
    }
    /**
     * Validates a trading strategy against risk parameters.
     * Returns validation result with errors (hard blockers) and warnings (advisory).
     */
    validateStrategy(strategy) {
        const errors = [];
        const warnings = [];
        const budget = strategy.request.budget;
        // 1. Check strategy expiration
        if (strategy.expiresAt <= Date.now()) {
            errors.push("Strategy has expired");
        }
        // 2. Validate total trade amounts don't exceed budget
        const totalAmountIn = strategy.trades.reduce((sum, trade) => sum + trade.amountIn, 0n);
        if (totalAmountIn > budget) {
            errors.push(`Total trade amount (${totalAmountIn.toString()}) exceeds budget (${budget.toString()})`);
        }
        // 3. Check individual trade sizes against maxSingleTradePercent
        for (const trade of strategy.trades) {
            const tradePercent = Number((trade.amountIn * 10000n) / budget) / 100;
            if (tradePercent > this.params.maxSingleTradePercent) {
                errors.push(`Trade ${trade.tokenIn} -> ${trade.tokenOut}: ${tradePercent.toFixed(1)}% of budget exceeds max single trade limit (${this.params.maxSingleTradePercent}%)`);
            }
        }
        // 4. Validate token addresses are valid checksummed addresses
        for (const trade of strategy.trades) {
            for (const addr of [trade.tokenIn, trade.tokenOut, ...trade.route]) {
                if (!isAddress(addr, { strict: true })) {
                    // Try to checksum it - if it fails, it's genuinely invalid
                    try {
                        getAddress(addr);
                        warnings.push(`Address ${addr} is valid but not checksummed`);
                    }
                    catch {
                        errors.push(`Invalid token address: ${addr}`);
                    }
                }
            }
        }
        // 5. Check price impact against max threshold
        for (const trade of strategy.trades) {
            if (trade.priceImpact > this.params.maxPriceImpactPercent) {
                errors.push(`Trade ${trade.tokenIn} -> ${trade.tokenOut}: price impact ${trade.priceImpact.toFixed(2)}% exceeds max (${this.params.maxPriceImpactPercent}%)`);
            }
            else if (trade.priceImpact > this.params.maxPriceImpactPercent * 0.75) {
                warnings.push(`Trade ${trade.tokenIn} -> ${trade.tokenOut}: price impact ${trade.priceImpact.toFixed(2)}% is approaching max (${this.params.maxPriceImpactPercent}%)`);
            }
        }
        // 6. Check stop-loss requirement
        if (this.params.requireStopLoss && strategy.riskMetrics.stopLossPrice === 0n) {
            errors.push("Stop-loss is required but not set");
        }
        // 7. Validate liquidity from quant scores (top candidates)
        for (const trade of strategy.trades) {
            const candidateScore = strategy.analysis.topCandidates.find((c) => c.tokenAddress.toLowerCase() === trade.tokenOut.toLowerCase());
            if (candidateScore) {
                const liquidityUsd = candidateScore.defiMetrics.liquidityDepth;
                if (liquidityUsd < this.params.minPoolTvlUsd) {
                    errors.push(`Token ${candidateScore.symbol}: liquidity depth $${liquidityUsd.toFixed(0)} below minimum $${this.params.minPoolTvlUsd}`);
                }
            }
        }
        // 8. Validate minAmountOut is set (slippage protection)
        for (const trade of strategy.trades) {
            if (trade.minAmountOut === 0n) {
                errors.push(`Trade ${trade.tokenIn} -> ${trade.tokenOut}: minAmountOut is zero - no slippage protection`);
            }
        }
        const valid = errors.length === 0;
        this.log.info({ valid, errorCount: errors.length, warningCount: warnings.length, strategyId: strategy.id }, "Strategy validation complete");
        return { valid, warnings, errors };
    }
    /**
     * Adjusts a trading strategy to comply with risk limits.
     * Returns a new strategy with modifications applied.
     */
    adjustForRisk(strategy) {
        this.log.info({ strategyId: strategy.id }, "Adjusting strategy for risk compliance");
        const budget = strategy.request.budget;
        const maxSingleAmount = (budget * BigInt(this.params.maxSingleTradePercent)) / 100n;
        const adjustedTrades = [];
        for (const trade of strategy.trades) {
            let adjustedTrade = { ...trade };
            // 1. Cap individual position sizes
            if (adjustedTrade.amountIn > maxSingleAmount) {
                this.log.info({ tokenOut: trade.tokenOut, original: trade.amountIn.toString(), capped: maxSingleAmount.toString() }, "Capping position size");
                const ratio = (maxSingleAmount * 10000n) / adjustedTrade.amountIn;
                adjustedTrade = {
                    ...adjustedTrade,
                    amountIn: maxSingleAmount,
                    // Scale minAmountOut proportionally
                    minAmountOut: (adjustedTrade.minAmountOut * ratio) / 10000n,
                };
            }
            // 2. Increase minAmountOut for better slippage protection
            // Enforce at least (100% - maxSlippage%) of the proportional amount
            if (adjustedTrade.minAmountOut > 0n) {
                const slippageFactor = BigInt(10000 - Math.round(this.params.maxSlippagePercent * 100));
                const minWithSlippage = (adjustedTrade.amountIn * slippageFactor) / 10000n;
                // Use the higher of current minAmountOut and slippage-adjusted value
                // (only when they're in the same token, which is a simplification -
                //  in practice the swap output is a different token with different decimals)
                // We keep the existing minAmountOut if it's already more protective
                if (adjustedTrade.minAmountOut < minWithSlippage) {
                    adjustedTrade = { ...adjustedTrade, minAmountOut: minWithSlippage };
                }
            }
            adjustedTrades.push(adjustedTrade);
        }
        // 3. Cap total exposure: if sum exceeds budget, scale all trades down proportionally
        const totalAfterCaps = adjustedTrades.reduce((sum, t) => sum + t.amountIn, 0n);
        let finalTrades;
        if (totalAfterCaps > budget) {
            this.log.info({ total: totalAfterCaps.toString(), budget: budget.toString() }, "Scaling down trades to fit budget");
            finalTrades = adjustedTrades.map((trade) => {
                const scaledAmountIn = (trade.amountIn * budget) / totalAfterCaps;
                const scaledMinOut = (trade.minAmountOut * budget) / totalAfterCaps;
                return { ...trade, amountIn: scaledAmountIn, minAmountOut: scaledMinOut };
            });
        }
        else {
            finalTrades = adjustedTrades;
        }
        // 4. Ensure stop-loss is set if required
        let adjustedRiskMetrics = { ...strategy.riskMetrics };
        if (this.params.requireStopLoss && adjustedRiskMetrics.stopLossPrice === 0n) {
            // Default stop-loss: 10% below current implied price
            // Use take-profit or budget as reference if available
            const reference = adjustedRiskMetrics.takeProfitPrice > 0n
                ? adjustedRiskMetrics.takeProfitPrice
                : budget;
            adjustedRiskMetrics = {
                ...adjustedRiskMetrics,
                stopLossPrice: (reference * 90n) / 100n,
            };
            this.log.info({ stopLossPrice: adjustedRiskMetrics.stopLossPrice.toString() }, "Added default stop-loss (10% below reference)");
        }
        // 5. Recalculate position size percent
        const finalTotal = finalTrades.reduce((sum, t) => sum + t.amountIn, 0n);
        adjustedRiskMetrics = {
            ...adjustedRiskMetrics,
            positionSizePercent: Number((finalTotal * 10000n) / budget) / 100,
        };
        const adjusted = {
            ...strategy,
            trades: finalTrades,
            riskMetrics: adjustedRiskMetrics,
        };
        this.log.info({
            strategyId: adjusted.id,
            originalTradeCount: strategy.trades.length,
            adjustedTradeCount: finalTrades.length,
            positionSizePercent: adjustedRiskMetrics.positionSizePercent,
        }, "Risk adjustment complete");
        return adjusted;
    }
}
//# sourceMappingURL=RiskManager.js.map