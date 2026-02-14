import pino from "pino";
import { DEFILLAMA, UNISWAP_V3 } from "@tal-trading-agent/shared";
const logger = pino({ name: "token-pre-filter" });
// Category filters by risk tolerance
const RISK_CATEGORIES = {
    conservative: ["wrapped", "blue-chip-defi", "liquid-staking", "stablecoin"],
    moderate: [
        "wrapped", "stablecoin", "liquid-staking", "blue-chip-defi",
        "defi-infrastructure", "l2-infrastructure", "oracle-data",
        "ai-data", "gaming-metaverse", "rwa", "other",
    ],
    aggressive: [
        "wrapped", "stablecoin", "liquid-staking", "blue-chip-defi",
        "defi-infrastructure", "l2-infrastructure", "oracle-data",
        "ai-data", "gaming-metaverse", "meme", "rwa", "other",
    ],
};
// Keyword to category mapping for prompt-based boosting
const PROMPT_CATEGORY_MAP = {
    ai: ["ai-data"],
    artificial: ["ai-data"],
    gaming: ["gaming-metaverse"],
    metaverse: ["gaming-metaverse"],
    game: ["gaming-metaverse"],
    meme: ["meme"],
    defi: ["blue-chip-defi", "defi-infrastructure"],
    l2: ["l2-infrastructure"],
    layer: ["l2-infrastructure"],
    oracle: ["oracle-data"],
    staking: ["liquid-staking"],
    liquid: ["liquid-staking"],
    rwa: ["rwa"],
    "real world": ["rwa"],
    nft: ["gaming-metaverse"],
    stablecoin: ["stablecoin"],
    stable: ["stablecoin"],
    infrastructure: ["defi-infrastructure", "l2-infrastructure"],
};
// Uniswap V3 Factory ABI for getPool
const FACTORY_ABI = [
    {
        inputs: [
            { name: "tokenA", type: "address" },
            { name: "tokenB", type: "address" },
            { name: "fee", type: "uint24" },
        ],
        name: "getPool",
        outputs: [{ name: "pool", type: "address" }],
        stateMutability: "view",
        type: "function",
    },
];
export class TokenPreFilter {
    client;
    constructor(client) {
        this.client = client;
    }
    async preFilter(allTokens, quoteToken, options) {
        const maxCandidates = options.maxCandidates ?? 20;
        logger.info({ totalTokens: allTokens.length, riskTolerance: options.riskTolerance, maxCandidates }, "Starting token pre-filter");
        // Step 1: Exclude quote token and stablecoins if budget is stablecoin
        let filtered = allTokens.filter((t) => t.address.toLowerCase() !== quoteToken.toLowerCase());
        const quoteIsStablecoin = allTokens.find((t) => t.address.toLowerCase() === quoteToken.toLowerCase() && t.category === "stablecoin");
        if (quoteIsStablecoin) {
            filtered = filtered.filter((t) => t.category !== "stablecoin");
        }
        // Step 2: Category filter by risk tolerance
        const allowedCategories = RISK_CATEGORIES[options.riskTolerance] ?? RISK_CATEGORIES.moderate;
        filtered = filtered.filter((t) => allowedCategories.includes(t.category));
        // Step 3: Prompt keyword matching — boost categories
        const promptLower = options.prompt.toLowerCase();
        const boostedCategories = new Set();
        for (const [keyword, categories] of Object.entries(PROMPT_CATEGORY_MAP)) {
            if (promptLower.includes(keyword)) {
                for (const cat of categories) {
                    boostedCategories.add(cat);
                }
            }
        }
        // Score tokens: defaults get base score, boosted categories get extra
        const scored = filtered.map((t) => {
            let score = 0;
            if (t.isDefault)
                score += 10;
            if (boostedCategories.has(t.category))
                score += 20;
            return { token: t, score };
        });
        // Sort by score descending, then by symbol for stability
        scored.sort((a, b) => b.score - a.score || a.token.symbol.localeCompare(b.token.symbol));
        // Take more candidates than needed for the price/pool checks
        const preSelected = scored.slice(0, maxCandidates * 2);
        // Step 4: Batch DeFiLlama price check
        const withPrices = await this.batchPriceCheck(preSelected.map((s) => s.token));
        // Step 5: Pool existence check for tokens that passed price check
        const withPools = await this.batchPoolCheck(withPrices, quoteToken);
        // Return top maxCandidates
        const result = withPools.slice(0, maxCandidates).map((t) => t.address);
        logger.info({ filtered: result.length, fromTotal: allTokens.length }, "Token pre-filter complete");
        return result;
    }
    async batchPriceCheck(tokens) {
        try {
            const coinIds = tokens.map((t) => `ethereum:${t.address}`).join(",");
            const url = `${DEFILLAMA.pricesUrl}/${encodeURIComponent(coinIds)}`;
            const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
            if (!response.ok) {
                logger.warn({ status: response.status }, "DeFiLlama batch price check failed, passing all tokens");
                return tokens;
            }
            const data = (await response.json());
            return tokens.filter((t) => {
                const coinId = `ethereum:${t.address}`;
                const price = data.coins[coinId]?.price;
                return price !== undefined && price > 0;
            });
        }
        catch (error) {
            logger.warn({ error }, "Batch price check failed, passing all tokens");
            return tokens;
        }
    }
    async batchPoolCheck(tokens, quoteToken) {
        if (tokens.length === 0)
            return [];
        try {
            const calls = tokens.map((t) => ({
                address: UNISWAP_V3.factory,
                abi: FACTORY_ABI,
                functionName: "getPool",
                args: [t.address, quoteToken, 3000],
            }));
            const results = await this.client.multicall({ contracts: calls });
            return tokens.filter((_, i) => {
                const result = results[i];
                if (result?.status !== "success")
                    return false;
                const poolAddress = result.result;
                return poolAddress !== "0x0000000000000000000000000000000000000000";
            });
        }
        catch (error) {
            logger.warn({ error }, "Batch pool check failed, passing all tokens with prices");
            return tokens;
        }
    }
}
//# sourceMappingURL=TokenPreFilter.js.map