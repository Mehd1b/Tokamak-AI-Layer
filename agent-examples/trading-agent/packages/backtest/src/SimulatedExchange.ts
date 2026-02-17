import type { ExecutionConfig, FillResult } from "./types.js";

/**
 * Simulates trade execution with slippage and fees.
 * Two models: fixed slippage (default) and sqrt-based (AMM-realistic).
 */
export class SimulatedExchange {
  private readonly config: ExecutionConfig;

  constructor(config: ExecutionConfig) {
    this.config = config;
  }

  /**
   * Simulate a buy fill at the given market price.
   * Returns the fill price (higher due to slippage) and total fees.
   */
  simulateBuy(marketPrice: number, notionalUsd: number): FillResult {
    const slippage = this.computeSlippage(notionalUsd);
    const fillPrice = marketPrice * (1 + slippage);
    const swapFee = notionalUsd * (this.config.swapFeeBps / 10000);
    const totalFees = swapFee + this.config.gasPerTradeUsd;

    return { fillPrice, totalFees };
  }

  /**
   * Simulate a sell fill at the given market price.
   * Returns the fill price (lower due to slippage) and total fees.
   */
  simulateSell(marketPrice: number, notionalUsd: number): FillResult {
    const slippage = this.computeSlippage(notionalUsd);
    const fillPrice = marketPrice * (1 - slippage);
    const swapFee = notionalUsd * (this.config.swapFeeBps / 10000);
    const totalFees = swapFee + this.config.gasPerTradeUsd;

    return { fillPrice, totalFees };
  }

  /**
   * Compute slippage as a fraction (0.003 = 0.3%).
   */
  private computeSlippage(notionalUsd: number): number {
    if (this.config.slippageModel === "sqrt") {
      // Sqrt model: priceImpact = baseSlippage * sqrt(tradeUsd / referenceLiquidity)
      // Reference liquidity of $1M (reasonable for mid-cap tokens on Uniswap)
      const referenceLiquidity = 1_000_000;
      const baseSlippage = this.config.fixedSlippageBps / 10000;
      return baseSlippage * Math.sqrt(notionalUsd / referenceLiquidity);
    }

    // Fixed model
    return this.config.fixedSlippageBps / 10000;
  }
}
