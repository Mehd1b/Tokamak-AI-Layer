import pino from "pino";
import { getAddress, isAddress } from "viem";
import type {
  TradingStrategy,
  TradeAction,
  RiskValidation,
  RiskParams,
} from "@tal-trading-agent/shared";
import { RISK_PRESETS } from "@tal-trading-agent/shared";

export interface RiskManagerConfig {
  params?: Partial<RiskParams>;
}

export class RiskManager {
  private readonly defaultParams: RiskParams;
  private readonly log: pino.Logger;

  constructor(config: RiskManagerConfig = {}) {
    this.defaultParams = { ...RISK_PRESETS.moderate, ...config.params };
    this.log = pino({ name: "RiskManager" });
  }

  /**
   * Create a RiskManager tuned for a specific risk tolerance.
   */
  static forTolerance(tolerance: "conservative" | "moderate" | "aggressive"): RiskManager {
    return new RiskManager({ params: RISK_PRESETS[tolerance] });
  }

  /**
   * Get the risk params for a strategy based on its risk tolerance.
   */
  private getParams(strategy: TradingStrategy): RiskParams {
    return RISK_PRESETS[strategy.request.riskTolerance] ?? this.defaultParams;
  }

  /**
   * Validates a trading strategy against risk parameters.
   * Returns validation result with errors (hard blockers) and warnings (advisory).
   */
  validateStrategy(strategy: TradingStrategy): RiskValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    const budget = strategy.request.budget;
    const params = this.getParams(strategy);

    // 1. Check strategy expiration
    if (strategy.expiresAt <= Date.now()) {
      errors.push("Strategy has expired");
    }

    // 2. Validate total trade amounts don't exceed budget
    const totalAmountIn = strategy.trades.reduce(
      (sum, trade) => sum + trade.amountIn,
      0n,
    );
    if (totalAmountIn > budget) {
      errors.push(
        `Total trade amount (${totalAmountIn.toString()}) exceeds budget (${budget.toString()})`,
      );
    }

    // 3. Check individual trade sizes against maxSingleTradePercent
    for (const trade of strategy.trades) {
      const tradePercent = Number((trade.amountIn * 10000n) / budget) / 100;
      if (tradePercent > params.maxSingleTradePercent) {
        errors.push(
          `Trade ${trade.tokenIn} -> ${trade.tokenOut}: ${tradePercent.toFixed(1)}% of budget exceeds max single trade limit (${params.maxSingleTradePercent}%)`,
        );
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
          } catch {
            errors.push(`Invalid token address: ${addr}`);
          }
        }
      }
    }

    // 5. Check price impact against max threshold
    for (const trade of strategy.trades) {
      if (trade.priceImpact > params.maxPriceImpactPercent) {
        errors.push(
          `Trade ${trade.tokenIn} -> ${trade.tokenOut}: price impact ${trade.priceImpact.toFixed(2)}% exceeds max (${params.maxPriceImpactPercent}%)`,
        );
      } else if (trade.priceImpact > params.maxPriceImpactPercent * 0.75) {
        warnings.push(
          `Trade ${trade.tokenIn} -> ${trade.tokenOut}: price impact ${trade.priceImpact.toFixed(2)}% is approaching max (${params.maxPriceImpactPercent}%)`,
        );
      }
    }

    // 6. Check stop-loss requirement
    if (params.requireStopLoss && strategy.riskMetrics.stopLossPrice === 0n) {
      errors.push("Stop-loss is required but not set");
    }

    // 7. Validate liquidity from quant scores (top candidates)
    for (const trade of strategy.trades) {
      const candidateScore = strategy.analysis.topCandidates.find(
        (c) =>
          c.tokenAddress.toLowerCase() === trade.tokenOut.toLowerCase(),
      );
      if (candidateScore) {
        const liquidityUsd = candidateScore.defiMetrics.liquidityDepth;
        if (liquidityUsd < params.minPoolTvlUsd) {
          errors.push(
            `Token ${candidateScore.symbol}: liquidity depth $${liquidityUsd.toFixed(0)} below minimum $${params.minPoolTvlUsd}`,
          );
        }
      }
    }

    // 8. Validate minAmountOut is set (slippage protection)
    for (const trade of strategy.trades) {
      if (trade.minAmountOut === 0n) {
        errors.push(
          `Trade ${trade.tokenIn} -> ${trade.tokenOut}: minAmountOut is zero - no slippage protection`,
        );
      }
    }

    // 9. Validate investment plan if present
    if (strategy.investmentPlan) {
      const plan = strategy.investmentPlan;
      const totalAlloc = plan.allocations.reduce((s, a) => s + a.targetPercent, 0);
      if (totalAlloc < 80 || totalAlloc > 120) {
        warnings.push(`Investment plan allocations sum to ${totalAlloc.toFixed(1)}% (expected ~100%)`);
      }

      // Check concentration limits per risk profile
      for (const alloc of plan.allocations) {
        if (alloc.targetPercent > params.maxSingleTradePercent) {
          warnings.push(
            `Allocation ${alloc.symbol}: ${alloc.targetPercent}% exceeds recommended max single position (${params.maxSingleTradePercent}%)`,
          );
        }
      }
    }

    // 10. Validate leverage limits
    for (const trade of strategy.trades) {
      if (trade.leverageConfig) {
        const maxLev = params.maxLeverage ?? 1;
        if (trade.leverageConfig.leverageMultiplier > maxLev) {
          errors.push(
            `Trade ${trade.tokenIn} -> ${trade.tokenOut}: leverage ${trade.leverageConfig.leverageMultiplier}x exceeds max (${maxLev}x)`
          );
        }
      }

      // Check if shorts are allowed
      if (trade.direction === "short" && params.allowShorts === false) {
        errors.push(
          `Short position on ${trade.tokenOut} is not allowed for ${strategy.request.riskTolerance} risk tolerance`
        );
      }
    }

    // 11. Validate health factor for leveraged positions
    if (strategy.riskMetrics.healthFactor !== undefined) {
      const minHf = params.minHealthFactor ?? 1.0;
      if (strategy.riskMetrics.healthFactor < minHf) {
        errors.push(
          `Health factor ${strategy.riskMetrics.healthFactor.toFixed(2)} below minimum (${minHf})`
        );
      }
    }

    // 12. Total leveraged exposure check
    const leveragedTrades = strategy.trades.filter(t => t.leverageConfig);
    if (leveragedTrades.length > 0) {
      const totalLeveragedAmount = leveragedTrades.reduce(
        (sum, t) => sum + t.amountIn * BigInt(Math.round((t.leverageConfig?.leverageMultiplier ?? 1) * 100)) / 100n,
        0n,
      );
      if (totalLeveragedAmount > budget * 2n) {
        warnings.push(
          `Total leveraged exposure (${totalLeveragedAmount.toString()}) exceeds 2x budget`
        );
      }
    }

    const valid = errors.length === 0;

    this.log.info(
      { valid, errorCount: errors.length, warningCount: warnings.length, strategyId: strategy.id },
      "Strategy validation complete",
    );

    return { valid, warnings, errors };
  }

  /**
   * Adjusts a trading strategy to comply with risk limits.
   * Returns a new strategy with modifications applied.
   */
  adjustForRisk(strategy: TradingStrategy): TradingStrategy {
    this.log.info({ strategyId: strategy.id }, "Adjusting strategy for risk compliance");

    const budget = strategy.request.budget;
    const params = this.getParams(strategy);
    const maxSingleAmount = (budget * BigInt(params.maxSingleTradePercent)) / 100n;
    const adjustedTrades: TradeAction[] = [];

    for (const trade of strategy.trades) {
      let adjustedTrade = { ...trade };

      // 1. Cap individual position sizes
      if (adjustedTrade.amountIn > maxSingleAmount) {
        this.log.info(
          { tokenOut: trade.tokenOut, original: trade.amountIn.toString(), capped: maxSingleAmount.toString() },
          "Capping position size",
        );
        const ratio = (maxSingleAmount * 10000n) / adjustedTrade.amountIn;
        adjustedTrade = {
          ...adjustedTrade,
          amountIn: maxSingleAmount,
          // Scale minAmountOut proportionally
          minAmountOut: (adjustedTrade.minAmountOut * ratio) / 10000n,
        };
      }

      // 2. Increase minAmountOut for better slippage protection
      if (adjustedTrade.minAmountOut > 0n) {
        const slippageFactor = BigInt(10000 - Math.round(params.maxSlippagePercent * 100));
        const minWithSlippage = (adjustedTrade.amountIn * slippageFactor) / 10000n;
        if (adjustedTrade.minAmountOut < minWithSlippage) {
          adjustedTrade = { ...adjustedTrade, minAmountOut: minWithSlippage };
        }
      }

      adjustedTrades.push(adjustedTrade);
    }

    // 3. Cap total exposure: if sum exceeds budget, scale all trades down proportionally
    const totalAfterCaps = adjustedTrades.reduce((sum, t) => sum + t.amountIn, 0n);
    let finalTrades: TradeAction[];

    if (totalAfterCaps > budget) {
      this.log.info(
        { total: totalAfterCaps.toString(), budget: budget.toString() },
        "Scaling down trades to fit budget",
      );
      finalTrades = adjustedTrades.map((trade) => {
        const scaledAmountIn = (trade.amountIn * budget) / totalAfterCaps;
        const scaledMinOut = (trade.minAmountOut * budget) / totalAfterCaps;
        return { ...trade, amountIn: scaledAmountIn, minAmountOut: scaledMinOut };
      });
    } else {
      finalTrades = adjustedTrades;
    }

    // 4. Ensure stop-loss is set if required
    let adjustedRiskMetrics = { ...strategy.riskMetrics };
    if (params.requireStopLoss && adjustedRiskMetrics.stopLossPrice === 0n) {
      const reference = adjustedRiskMetrics.takeProfitPrice > 0n
        ? adjustedRiskMetrics.takeProfitPrice
        : budget;
      adjustedRiskMetrics = {
        ...adjustedRiskMetrics,
        stopLossPrice: (reference * 90n) / 100n,
      };
      this.log.info(
        { stopLossPrice: adjustedRiskMetrics.stopLossPrice.toString() },
        "Added default stop-loss (10% below reference)",
      );
    }

    // 5b. Reduce leverage if it exceeds max allowed
    for (let i = 0; i < finalTrades.length; i++) {
      const trade = finalTrades[i]!;
      if (trade.leverageConfig) {
        const maxLev = params.maxLeverage ?? 1;
        if (trade.leverageConfig.leverageMultiplier > maxLev) {
          this.log.info(
            { tokenOut: trade.tokenOut, original: trade.leverageConfig.leverageMultiplier, capped: maxLev },
            "Capping leverage multiplier",
          );
          finalTrades[i] = {
            ...trade,
            leverageConfig: {
              ...trade.leverageConfig,
              leverageMultiplier: maxLev,
            },
          };
        }
      }
    }

    // 5. Recalculate position size percent
    const finalTotal = finalTrades.reduce((sum, t) => sum + t.amountIn, 0n);
    adjustedRiskMetrics = {
      ...adjustedRiskMetrics,
      positionSizePercent: Number((finalTotal * 10000n) / budget) / 100,
    };

    const adjusted: TradingStrategy = {
      ...strategy,
      trades: finalTrades,
      riskMetrics: adjustedRiskMetrics,
    };

    this.log.info(
      {
        strategyId: adjusted.id,
        originalTradeCount: strategy.trades.length,
        adjustedTradeCount: finalTrades.length,
        positionSizePercent: adjustedRiskMetrics.positionSizePercent,
      },
      "Risk adjustment complete",
    );

    return adjusted;
  }
}
