import { getAddress } from "viem";
import pino from "pino";
import { UNISWAP_V3, FEE_TIERS, TOKENS, DEFILLAMA } from "@tal-trading-agent/shared";
const logger = pino({ name: "pool-analyzer" });
// ── Minimal ABIs ────────────────────────────────────────────
const factoryAbi = [
    {
        name: "getPool",
        type: "function",
        stateMutability: "view",
        inputs: [
            { name: "tokenA", type: "address" },
            { name: "tokenB", type: "address" },
            { name: "fee", type: "uint24" },
        ],
        outputs: [{ name: "pool", type: "address" }],
    },
];
const poolAbi = [
    {
        name: "slot0",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [
            { name: "sqrtPriceX96", type: "uint160" },
            { name: "tick", type: "int24" },
            { name: "observationIndex", type: "uint16" },
            { name: "observationCardinality", type: "uint16" },
            { name: "observationCardinalityNext", type: "uint16" },
            { name: "feeProtocol", type: "uint8" },
            { name: "unlocked", type: "bool" },
        ],
    },
    {
        name: "liquidity",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint128" }],
    },
    {
        name: "token0",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "address" }],
    },
    {
        name: "token1",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "address" }],
    },
    {
        name: "fee",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint24" }],
    },
    {
        name: "ticks",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "tick", type: "int24" }],
        outputs: [
            { name: "liquidityGross", type: "uint128" },
            { name: "liquidityNet", type: "int128" },
            { name: "feeGrowthOutside0X128", type: "uint256" },
            { name: "feeGrowthOutside1X128", type: "uint256" },
            { name: "tickCumulativeOutside", type: "int56" },
            { name: "secondsPerLiquidityOutsideX128", type: "uint160" },
            { name: "secondsOutside", type: "uint32" },
            { name: "initialized", type: "bool" },
        ],
    },
];
const erc20Abi = [
    {
        name: "symbol",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "string" }],
    },
    {
        name: "name",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "string" }],
    },
    {
        name: "decimals",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint8" }],
    },
];
const quoterAbi = [
    {
        name: "quoteExactInputSingle",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
            {
                name: "params",
                type: "tuple",
                components: [
                    { name: "tokenIn", type: "address" },
                    { name: "tokenOut", type: "address" },
                    { name: "amountIn", type: "uint256" },
                    { name: "fee", type: "uint24" },
                    { name: "sqrtPriceLimitX96", type: "uint160" },
                ],
            },
        ],
        outputs: [
            { name: "amountOut", type: "uint256" },
            { name: "sqrtPriceX96After", type: "uint160" },
            { name: "initializedTicksCrossed", type: "uint32" },
            { name: "gasEstimate", type: "uint256" },
        ],
    },
];
// ── Constants ───────────────────────────────────────────────
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const Q96 = 2n ** 96n;
const Q192 = 2n ** 192n;
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
// ── PoolAnalyzer ────────────────────────────────────────────
export class PoolAnalyzer {
    client;
    tokenInfoCache = new Map();
    constructor(client) {
        this.client = client;
    }
    /**
     * Read full pool state for a given token pair and fee tier.
     */
    async getPoolData(tokenA, tokenB, feeTier) {
        try {
            const poolAddress = await this.client.readContract({
                address: UNISWAP_V3.factory,
                abi: factoryAbi,
                functionName: "getPool",
                args: [tokenA, tokenB, feeTier],
            });
            if (!poolAddress || poolAddress === ZERO_ADDRESS) {
                return null;
            }
            // Multicall: read slot0, liquidity, token0, token1 in one RPC call
            const results = await this.client.multicall({
                contracts: [
                    {
                        address: poolAddress,
                        abi: poolAbi,
                        functionName: "slot0",
                    },
                    {
                        address: poolAddress,
                        abi: poolAbi,
                        functionName: "liquidity",
                    },
                    {
                        address: poolAddress,
                        abi: poolAbi,
                        functionName: "token0",
                    },
                    {
                        address: poolAddress,
                        abi: poolAbi,
                        functionName: "token1",
                    },
                ],
                allowFailure: false,
            });
            const [slot0, liquidity, token0Addr, token1Addr] = results;
            const [sqrtPriceX96, tick] = slot0;
            const [token0Info, token1Info] = await Promise.all([
                this.getTokenInfo(token0Addr),
                this.getTokenInfo(token1Addr),
            ]);
            // Compute TVL from price data
            const tvlUsd = await this.estimateTvl(poolAddress, liquidity, sqrtPriceX96, token0Info, token1Info);
            // Estimate volume and fee APY (use DeFiLlama price for a rough estimate)
            const feeApy = this.estimateFeeApy(feeTier, tvlUsd);
            return {
                poolAddress,
                token0: token0Info,
                token1: token1Info,
                feeTier,
                liquidity,
                sqrtPriceX96,
                tick,
                tvlUsd,
                volume24hUsd: 0, // Requires off-chain indexer; set to 0 for on-chain only
                feeApy,
            };
        }
        catch (error) {
            logger.error({ tokenA, tokenB, feeTier, error }, "Failed to get pool data");
            return null;
        }
    }
    /**
     * Scan pools across all fee tiers for given token pairs. Returns the top
     * pools sorted by liquidity (descending).
     */
    async getTopPools(tokens, limit = 10) {
        const quoteToken = TOKENS.WETH;
        const poolPromises = [];
        for (const token of tokens) {
            if (getAddress(token) === getAddress(quoteToken))
                continue;
            for (const fee of FEE_TIERS) {
                poolPromises.push(this.getPoolData(token, quoteToken, fee));
            }
        }
        const results = await Promise.allSettled(poolPromises);
        const pools = [];
        for (const result of results) {
            if (result.status === "fulfilled" && result.value !== null) {
                pools.push(result.value);
            }
        }
        // Sort by liquidity descending
        pools.sort((a, b) => {
            if (b.liquidity > a.liquidity)
                return 1;
            if (b.liquidity < a.liquidity)
                return -1;
            return 0;
        });
        return pools.slice(0, limit);
    }
    /**
     * Compute spot price from sqrtPriceX96.
     * Returns the price of `token` denominated in `quoteToken`.
     */
    async getTokenPrice(token, quoteToken) {
        // Try each fee tier to find the most liquid pool
        let bestPool = null;
        for (const fee of FEE_TIERS) {
            const pool = await this.getPoolData(token, quoteToken, fee);
            if (pool !== null &&
                (bestPool === null || pool.liquidity > bestPool.liquidity)) {
                bestPool = pool;
            }
        }
        if (!bestPool)
            return null;
        return this.sqrtPriceX96ToPrice(bestPool.sqrtPriceX96, bestPool.token0.decimals, bestPool.token1.decimals, getAddress(token) === getAddress(bestPool.token0.address));
    }
    /**
     * Analyze liquidity concentration around the current tick.
     * Returns an object with concentrated liquidity within the given tick range.
     */
    async getLiquidityDepth(poolAddress, tickRange = 200) {
        try {
            const [slot0Result, totalLiquidity] = await this.client.multicall({
                contracts: [
                    {
                        address: poolAddress,
                        abi: poolAbi,
                        functionName: "slot0",
                    },
                    {
                        address: poolAddress,
                        abi: poolAbi,
                        functionName: "liquidity",
                    },
                ],
                allowFailure: false,
            });
            const currentTick = slot0Result[1];
            const tickSpacing = this.getTickSpacingForPool(poolAddress);
            // Sample ticks around the current tick
            const ticksToCheck = [];
            for (let t = currentTick - tickRange; t <= currentTick + tickRange; t += tickSpacing) {
                ticksToCheck.push(t);
            }
            // Batch read tick data
            const tickCalls = ticksToCheck.map((t) => ({
                address: poolAddress,
                abi: poolAbi,
                functionName: "ticks",
                args: [t],
            }));
            const tickResults = await this.client.multicall({
                contracts: tickCalls,
                allowFailure: true,
            });
            let concentratedLiquidity = 0n;
            for (const result of tickResults) {
                if (result.status === "success") {
                    const liquidityGross = result.result[0];
                    concentratedLiquidity += liquidityGross;
                }
            }
            // Score: ratio of concentrated liquidity to total, scaled 0-100
            let depthScore = 0;
            if (totalLiquidity > 0n) {
                // Use a normalized score: concentrated around current tick vs total
                const ratio = Number(concentratedLiquidity) / Number(totalLiquidity);
                depthScore = Math.min(100, Math.round(ratio * 50));
            }
            // Boost score if total liquidity is high
            if (totalLiquidity > 10n ** 18n)
                depthScore = Math.min(100, depthScore + 20);
            if (totalLiquidity > 10n ** 20n)
                depthScore = Math.min(100, depthScore + 20);
            return {
                totalLiquidity,
                concentratedLiquidity,
                depthScore,
                tickSpacing,
            };
        }
        catch (error) {
            logger.error({ poolAddress, error }, "Failed to get liquidity depth");
            return {
                totalLiquidity: 0n,
                concentratedLiquidity: 0n,
                depthScore: 0,
                tickSpacing: 60,
            };
        }
    }
    // ── Internal Helpers ────────────────────────────────────────
    /**
     * Fetch token metadata and USD price. Results are cached for 5 minutes.
     */
    async getTokenInfo(address) {
        const key = getAddress(address);
        const cached = this.tokenInfoCache.get(key);
        if (cached && Date.now() - cached.timestamp < TOKEN_CACHE_TTL_MS) {
            return cached.data;
        }
        try {
            const [symbol, name, decimals] = await this.client.multicall({
                contracts: [
                    { address, abi: erc20Abi, functionName: "symbol" },
                    { address, abi: erc20Abi, functionName: "name" },
                    { address, abi: erc20Abi, functionName: "decimals" },
                ],
                allowFailure: false,
            });
            const priceUsd = await this.fetchUsdPrice(address);
            const info = {
                address,
                symbol,
                name,
                decimals,
                priceUsd,
            };
            this.tokenInfoCache.set(key, { data: info, timestamp: Date.now() });
            return info;
        }
        catch (error) {
            logger.warn({ address, error }, "Failed to fetch token info, using fallback");
            return {
                address,
                symbol: "UNKNOWN",
                name: "Unknown Token",
                decimals: 18,
                priceUsd: 0,
            };
        }
    }
    /**
     * Fetch current USD price from DeFiLlama.
     */
    async fetchUsdPrice(token) {
        try {
            const coinId = `ethereum:${token}`;
            const url = `${DEFILLAMA.pricesUrl}/${encodeURIComponent(coinId)}`;
            const response = await fetch(url);
            if (!response.ok)
                return 0;
            const data = (await response.json());
            return data.coins[coinId]?.price ?? 0;
        }
        catch {
            return 0;
        }
    }
    /**
     * Convert sqrtPriceX96 to a human-readable price.
     * If `tokenIsToken0` is true, returns price of token0 in terms of token1.
     * Otherwise returns price of token1 in terms of token0.
     */
    sqrtPriceX96ToPrice(sqrtPriceX96, decimals0, decimals1, tokenIsToken0) {
        // price = (sqrtPriceX96 / 2^96)^2 = sqrtPriceX96^2 / 2^192
        // This gives price of token0 in terms of token1 (adjusted for decimals)
        const numerator = sqrtPriceX96 * sqrtPriceX96;
        const decimalAdjustment = 10 ** (decimals0 - decimals1);
        // price0in1 = (sqrtPriceX96^2 / Q192) * 10^(decimals0 - decimals1)
        const price0in1 = (Number(numerator) / Number(Q192)) * decimalAdjustment;
        return tokenIsToken0 ? price0in1 : 1 / price0in1;
    }
    /**
     * Rough TVL estimation from liquidity and token prices.
     */
    async estimateTvl(_poolAddress, liquidity, sqrtPriceX96, token0, token1) {
        if (liquidity === 0n || (token0.priceUsd === 0 && token1.priceUsd === 0)) {
            return 0;
        }
        // Approximate amounts using current price and liquidity
        // amount0 ≈ L / sqrtPrice, amount1 ≈ L * sqrtPrice
        const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
        if (sqrtPrice === 0)
            return 0;
        const liq = Number(liquidity);
        const amount0 = liq / sqrtPrice / 10 ** token0.decimals;
        const amount1 = (liq * sqrtPrice) / 10 ** token1.decimals;
        const tvl0 = amount0 * token0.priceUsd;
        const tvl1 = amount1 * token1.priceUsd;
        return tvl0 + tvl1;
    }
    /**
     * Rough fee APY estimation. Without actual volume data from an indexer,
     * this uses a heuristic based on TVL and fee tier.
     */
    estimateFeeApy(feeTier, tvlUsd) {
        if (tvlUsd === 0)
            return 0;
        // Base estimate: higher fee tiers tend to have higher APY but less volume
        // This is a placeholder; real APY requires volume data from subgraph/indexer
        const feePercent = feeTier / 1_000_000;
        // Assume ~$1M daily volume per $10M TVL as a baseline
        const assumedDailyVolumeRatio = 0.1;
        const dailyFees = tvlUsd * assumedDailyVolumeRatio * feePercent;
        const annualFees = dailyFees * 365;
        return tvlUsd > 0 ? (annualFees / tvlUsd) * 100 : 0;
    }
    /**
     * Get tick spacing for common fee tiers.
     */
    getTickSpacingForPool(_poolAddress) {
        // Default to 60 (matching the 3000 fee tier)
        // In production, read this from the pool contract
        return 60;
    }
}
//# sourceMappingURL=PoolAnalyzer.js.map