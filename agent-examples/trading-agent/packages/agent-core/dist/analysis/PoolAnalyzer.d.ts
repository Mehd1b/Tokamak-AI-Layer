import type { Address, PublicClient } from "viem";
import type { PoolData, TokenInfo } from "@tal-trading-agent/shared";
export declare class PoolAnalyzer {
    private readonly client;
    private readonly tokenInfoCache;
    constructor(client: PublicClient);
    /**
     * Read full pool state for a given token pair and fee tier.
     */
    getPoolData(tokenA: Address, tokenB: Address, feeTier: number): Promise<PoolData | null>;
    /**
     * Scan pools across all fee tiers for given token pairs. Returns the top
     * pools sorted by liquidity (descending).
     */
    getTopPools(tokens: Address[], limit?: number): Promise<PoolData[]>;
    /**
     * Compute spot price from sqrtPriceX96.
     * Returns the price of `token` denominated in `quoteToken`.
     */
    getTokenPrice(token: Address, quoteToken: Address): Promise<number | null>;
    /**
     * Analyze liquidity concentration around the current tick.
     * Returns an object with concentrated liquidity within the given tick range.
     */
    getLiquidityDepth(poolAddress: Address, tickRange?: number): Promise<{
        totalLiquidity: bigint;
        concentratedLiquidity: bigint;
        depthScore: number;
        tickSpacing: number;
    }>;
    /**
     * Fetch token metadata and USD price. Results are cached for 5 minutes.
     */
    getTokenInfo(address: Address): Promise<TokenInfo>;
    /**
     * Fetch current USD price from DeFiLlama.
     */
    private fetchUsdPrice;
    /**
     * Convert sqrtPriceX96 to a human-readable price.
     * If `tokenIsToken0` is true, returns price of token0 in terms of token1.
     * Otherwise returns price of token1 in terms of token0.
     */
    private sqrtPriceX96ToPrice;
    /**
     * Rough TVL estimation from liquidity and token prices.
     */
    private estimateTvl;
    /**
     * Rough fee APY estimation. Without actual volume data from an indexer,
     * this uses a heuristic based on TVL and fee tier.
     */
    private estimateFeeApy;
    /**
     * Get tick spacing for common fee tiers.
     */
    private getTickSpacingForPool;
}
//# sourceMappingURL=PoolAnalyzer.d.ts.map