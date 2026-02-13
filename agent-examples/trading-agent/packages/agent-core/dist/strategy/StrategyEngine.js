import Anthropic from "@anthropic-ai/sdk";
import pino from "pino";
import { TOKENS } from "@tal-trading-agent/shared";
// ── Horizon to milliseconds mapping ─────────────────────
const HORIZON_MS = {
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
    "1w": 7 * 24 * 60 * 60 * 1000,
    "1m": 30 * 24 * 60 * 60 * 1000,
};
const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
export class StrategyEngine {
    client;
    model;
    log;
    constructor(config) {
        this.client = new Anthropic({ apiKey: config.anthropicApiKey });
        this.model = config.model ?? DEFAULT_MODEL;
        this.log = pino({ name: "StrategyEngine" });
    }
    async generateStrategy(request, candidates) {
        this.log.info({ horizon: request.horizon, riskTolerance: request.riskTolerance, candidateCount: candidates.length }, "Generating trading strategy via LLM");
        const systemPrompt = this.buildSystemPrompt();
        const userMessage = this.buildUserMessage(request, candidates);
        let llmResponse = await this.callLLM(systemPrompt, userMessage);
        // Parse the response - retry once if invalid JSON
        let parsed;
        try {
            parsed = this.parseResponse(llmResponse);
        }
        catch (firstError) {
            this.log.warn({ error: firstError }, "First LLM response had invalid JSON, retrying with correction");
            llmResponse = await this.callLLMWithCorrection(systemPrompt, userMessage, llmResponse);
            parsed = this.parseResponse(llmResponse);
        }
        const now = Date.now();
        const strategy = {
            id: crypto.randomUUID(),
            request,
            analysis: {
                marketCondition: parsed.analysis.marketCondition,
                confidence: Math.max(0, Math.min(1, parsed.analysis.confidence)),
                reasoning: parsed.analysis.reasoning,
                topCandidates: candidates.slice(0, 5),
            },
            trades: parsed.trades.map((t) => this.toLLMTradeAction(t)),
            riskMetrics: {
                score: Math.max(0, Math.min(100, parsed.riskMetrics.score)),
                maxDrawdown: parsed.riskMetrics.maxDrawdown,
                stopLossPrice: BigInt(parsed.riskMetrics.stopLossPrice),
                takeProfitPrice: BigInt(parsed.riskMetrics.takeProfitPrice),
                positionSizePercent: parsed.riskMetrics.positionSizePercent,
            },
            estimatedReturn: parsed.estimatedReturn,
            generatedAt: now,
            expiresAt: now + HORIZON_MS[request.horizon],
        };
        this.log.info({ strategyId: strategy.id, tradeCount: strategy.trades.length, confidence: strategy.analysis.confidence }, "Strategy generated successfully");
        return strategy;
    }
    // ── Private helpers ─────────────────────────────────────
    buildSystemPrompt() {
        const tokenList = Object.entries(TOKENS)
            .map(([symbol, address]) => `  - ${symbol}: ${address}`)
            .join("\n");
        return `You are a quantitative DeFi trading analyst. Your task is to analyze market data and produce precise, actionable trading strategies.

## Available Tokens (Ethereum Mainnet)
${tokenList}

## Risk Rules (MANDATORY)
1. NEVER suggest allocating more than 50% of the budget to a single position.
2. ALWAYS include a stop-loss price.
3. Each trade must specify a realistic priceImpact (0-100 as percent).
4. The poolFee must be one of: 100, 500, 3000, or 10000 (Uniswap V3 fee tiers in hundredths of a basis point).
5. The route array must contain valid Ethereum addresses representing the swap path.
6. minAmountOut must be strictly less than amountIn to account for slippage and fees.
7. The sum of all amountIn values must not exceed the user's budget.

## Output Format
Respond ONLY with a valid JSON object (no markdown, no explanation). The schema is:

{
  "analysis": {
    "marketCondition": "bullish" | "bearish" | "sideways",
    "confidence": <number 0-1>,
    "reasoning": "<string>"
  },
  "trades": [
    {
      "action": "buy" | "sell",
      "tokenIn": "<address>",
      "tokenOut": "<address>",
      "amountIn": "<string, wei value>",
      "minAmountOut": "<string, wei value>",
      "poolFee": <number>,
      "priceImpact": <number, percent>,
      "route": ["<address>", ...]
    }
  ],
  "riskMetrics": {
    "score": <number 0-100, higher = riskier>,
    "maxDrawdown": <number, percent>,
    "stopLossPrice": "<string, wei value>",
    "takeProfitPrice": "<string, wei value>",
    "positionSizePercent": <number, percent of budget used>
  },
  "estimatedReturn": {
    "optimistic": <number, percent>,
    "expected": <number, percent>,
    "pessimistic": <number, percent>
  }
}

IMPORTANT: All token amounts MUST be strings (representing wei values) since they may exceed JavaScript's Number.MAX_SAFE_INTEGER.
IMPORTANT: Respond with ONLY the JSON object. No surrounding text, no markdown code blocks.`;
    }
    buildUserMessage(request, candidates) {
        const candidateSummaries = candidates.map((c) => ({
            token: c.symbol,
            address: c.tokenAddress,
            overallScore: c.overallScore,
            reasoning: c.reasoning,
            indicators: {
                rsi: c.indicators.rsi,
                macdHistogram: c.indicators.macd.histogram,
                momentum: c.indicators.momentum,
                vwap: c.indicators.vwap,
            },
            defi: {
                liquidityDepth: c.defiMetrics.liquidityDepth,
                feeApy: c.defiMetrics.feeApy,
                volumeTrend: c.defiMetrics.volumeTrend,
                tvlStability: c.defiMetrics.tvlStability,
                smartMoneyFlow: c.defiMetrics.smartMoneyFlow,
            },
        }));
        return `## Trade Request
- User prompt: "${request.prompt}"
- Budget: ${request.budget.toString()} wei of token ${request.budgetToken}
- Horizon: ${request.horizon}
- Risk tolerance: ${request.riskTolerance}
- Chain: Ethereum Mainnet (ID: ${request.chainId})
- Wallet: ${request.walletAddress}

## Market Analysis (Quantitative Scores)
${JSON.stringify(candidateSummaries, null, 2)}

Based on the above data, generate an optimal trading strategy. Consider the user's risk tolerance ("${request.riskTolerance}") when sizing positions and setting stop-losses:
- Conservative: smaller positions, tighter stops, prefer high-liquidity tokens
- Moderate: balanced approach
- Aggressive: larger positions, wider stops, accept higher volatility tokens

Produce the JSON strategy now.`;
    }
    async callLLM(systemPrompt, userMessage) {
        const response = await this.client.messages.create({
            model: this.model,
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: "user", content: userMessage }],
        });
        const textBlock = response.content.find((b) => b.type === "text");
        if (!textBlock || textBlock.type !== "text") {
            throw new Error("LLM returned no text content");
        }
        return textBlock.text;
    }
    async callLLMWithCorrection(systemPrompt, userMessage, previousResponse) {
        const response = await this.client.messages.create({
            model: this.model,
            max_tokens: 4096,
            system: systemPrompt,
            messages: [
                { role: "user", content: userMessage },
                { role: "assistant", content: previousResponse },
                {
                    role: "user",
                    content: "Your previous response was not valid JSON. Please respond with ONLY a valid JSON object matching the schema I described. No markdown, no explanation, just the raw JSON.",
                },
            ],
        });
        const textBlock = response.content.find((b) => b.type === "text");
        if (!textBlock || textBlock.type !== "text") {
            throw new Error("LLM returned no text content on retry");
        }
        return textBlock.text;
    }
    parseResponse(raw) {
        // Strip markdown code blocks if present
        let cleaned = raw.trim();
        if (cleaned.startsWith("```")) {
            cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
        }
        const parsed = JSON.parse(cleaned);
        // Validate required fields exist
        if (!parsed.analysis || !parsed.trades || !parsed.riskMetrics || !parsed.estimatedReturn) {
            throw new Error("LLM response missing required top-level fields");
        }
        if (!Array.isArray(parsed.trades) || parsed.trades.length === 0) {
            throw new Error("LLM response must include at least one trade");
        }
        for (const trade of parsed.trades) {
            if (!trade.tokenIn || !trade.tokenOut || !trade.amountIn || !trade.minAmountOut) {
                throw new Error("Trade missing required fields (tokenIn, tokenOut, amountIn, minAmountOut)");
            }
            // Validate that amount strings are valid bigint representations
            BigInt(trade.amountIn);
            BigInt(trade.minAmountOut);
        }
        BigInt(parsed.riskMetrics.stopLossPrice);
        BigInt(parsed.riskMetrics.takeProfitPrice);
        return parsed;
    }
    toLLMTradeAction(trade) {
        return {
            action: trade.action,
            tokenIn: trade.tokenIn,
            tokenOut: trade.tokenOut,
            amountIn: BigInt(trade.amountIn),
            minAmountOut: BigInt(trade.minAmountOut),
            poolFee: trade.poolFee,
            priceImpact: trade.priceImpact,
            route: trade.route.map((addr) => addr),
        };
    }
}
//# sourceMappingURL=StrategyEngine.js.map