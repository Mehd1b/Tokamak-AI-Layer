/**
 * Simulates trade execution with slippage and fees.
 * Two models: fixed slippage (default) and sqrt-based (AMM-realistic).
 */
export class SimulatedExchange {
    config;
    constructor(config) {
        this.config = config;
    }
    /**
     * Simulate a buy fill at the given market price.
     * Returns the fill price (higher due to slippage) and total fees.
     */
    simulateBuy(marketPrice, notionalUsd) {
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
    simulateSell(marketPrice, notionalUsd) {
        const slippage = this.computeSlippage(notionalUsd);
        const fillPrice = marketPrice * (1 - slippage);
        const swapFee = notionalUsd * (this.config.swapFeeBps / 10000);
        const totalFees = swapFee + this.config.gasPerTradeUsd;
        return { fillPrice, totalFees };
    }
    /**
     * Compute slippage as a fraction (0.003 = 0.3%).
     */
    computeSlippage(notionalUsd) {
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
//# sourceMappingURL=SimulatedExchange.js.map