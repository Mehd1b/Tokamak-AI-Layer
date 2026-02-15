import Anthropic from "@anthropic-ai/sdk";
import pino from "pino";
import { TOKEN_REGISTRY, HORIZON_MS, RISK_PRESETS } from "@tal-trading-agent/shared";
const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
// ── Mode Resolution ─────────────────────────────────────
function resolveMode(horizon) {
    switch (horizon) {
        case "1h":
        case "4h":
            return "scalp";
        case "1d":
        case "1w":
            return "swing";
        case "1m":
        case "3m":
            return "position";
        case "6m":
        case "1y":
            return "investment";
    }
}
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
        const mode = resolveMode(request.horizon);
        this.log.info({ horizon: request.horizon, mode, riskTolerance: request.riskTolerance, candidateCount: candidates.length }, "Generating trading strategy via LLM");
        const systemPrompt = this.buildSystemPrompt(mode, request.riskTolerance, candidates);
        const userMessage = this.buildUserMessage(request, candidates, mode);
        let llmResponse;
        let llmReasoning;
        // Use extended thinking for investment/position modes
        if (mode === "investment" || mode === "position") {
            const result = await this.callLLMWithThinking(systemPrompt, userMessage);
            llmResponse = result.text;
            llmReasoning = result.thinking;
        }
        else {
            llmResponse = await this.callLLM(systemPrompt, userMessage);
        }
        // Parse the response - retry once if invalid JSON
        let parsed;
        try {
            parsed = this.parseResponse(llmResponse, mode);
        }
        catch (firstError) {
            this.log.warn({ error: firstError }, "First LLM response had invalid JSON, retrying with correction");
            llmResponse = await this.callLLMWithCorrection(systemPrompt, userMessage, llmResponse);
            parsed = this.parseResponse(llmResponse, mode);
        }
        const now = Date.now();
        const strategy = {
            id: crypto.randomUUID(),
            request,
            mode,
            analysis: {
                marketCondition: parsed.analysis.marketCondition,
                confidence: Math.max(0, Math.min(1, parsed.analysis.confidence)),
                reasoning: parsed.analysis.reasoning,
                topCandidates: candidates.slice(0, 5),
            },
            trades: parsed.trades.map((t) => this.toLLMTradeAction(t)),
            investmentPlan: parsed.investmentPlan,
            llmReasoning,
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
        this.log.info({ strategyId: strategy.id, mode, tradeCount: strategy.trades.length, confidence: strategy.analysis.confidence }, "Strategy generated successfully");
        return strategy;
    }
    // ── System Prompt Builder ─────────────────────────────
    buildSystemPrompt(mode, riskTolerance, candidates) {
        // Only include the scored candidate tokens in the prompt, not all 103
        const candidateSymbols = new Set(candidates.map((c) => c.symbol));
        const relevantTokens = TOKEN_REGISTRY.filter((t) => candidateSymbols.has(t.symbol));
        const tokenList = relevantTokens
            .map((t) => `  - ${t.symbol} (${t.category}): ${t.address}`)
            .join("\n");
        const riskPreset = RISK_PRESETS[riskTolerance];
        const modeGuidance = this.getModeGuidance(mode);
        const riskRules = this.getRiskRules(riskTolerance, riskPreset);
        const outputSchema = this.getOutputSchema(mode);
        return `${modeGuidance}

## Available Tokens (Ethereum Mainnet)
${tokenList}

${riskRules}

${outputSchema}

IMPORTANT: All token amounts MUST be strings (representing wei values) since they may exceed JavaScript's Number.MAX_SAFE_INTEGER.
IMPORTANT: Respond with ONLY the JSON object. No surrounding text, no markdown code blocks.`;
    }
    getModeGuidance(mode) {
        switch (mode) {
            case "scalp":
                return `You are a quantitative DeFi SCALP TRADER optimizing for short-term trades (hours).
Technical indicators (RSI, MACD, momentum) are your PRIMARY signals.
Focus on tokens with high recent momentum and clear technical setups.
Prioritize quick entries and exits with tight risk management.
You can recommend LONG or SHORT positions. SHORT = borrow and sell the asset, profit when price drops.
Use SHORT when: RSI > 70, negative MACD histogram, bearish ADX (-DI > +DI), overbought StochRSI.`;
            case "swing":
                return `You are a quantitative DeFi SWING TRADER optimizing for multi-day trades.
Blend technical indicators with DeFi fundamentals for balanced analysis.
Look for confluence between technical signals and on-chain metrics.
Consider both LONG and SHORT positions. Bearish confluence across technical indicators warrants a SHORT recommendation.
SHORT positions borrow the target token via Aave V3 and sell immediately, profiting from price declines.`;
            case "position":
                return `You are a quantitative DeFi POSITION TRADER building medium-term positions.
DeFi fundamentals (liquidity, TVL stability, smart money flows) OUTWEIGH short-term technical indicators.
Technical indicators with low data confidence should be treated with skepticism.
Focus on protocol health and sustainable yield.
Leverage available via Aave V3 (up to 5x depending on risk tolerance). Consider SHORT positions for hedging or when bearish thesis is strong.
Leveraged positions use Aave V3: supply collateral, borrow, and swap to amplify exposure.`;
            case "investment":
                return `You are a DeFi PORTFOLIO MANAGER building a long-term investment allocation.
Your job is to build an INVESTMENT THESIS, define portfolio ALLOCATIONS, and recommend a DCA schedule.
Short-term RSI, MACD, and momentum indicators are IRRELEVANT for 6-month to 1-year holds — IGNORE them.
Focus exclusively on: protocol fundamentals, liquidity depth, TVL stability, ecosystem positioning, and smart money flows.
You MUST include an investmentPlan with allocations, entry strategy, and thesis.
Trades array can be empty if recommending pure DCA entry.
The portfolio may include SHORT hedges for risk management in bearish market conditions.
Use leverage sparingly and only for high-conviction positions within risk limits.`;
        }
    }
    getRiskRules(tolerance, preset) {
        const toleranceRules = {
            conservative: `## Risk Rules (CONSERVATIVE - MANDATORY)
1. NEVER allocate more than ${preset.maxSingleTradePercent}% of the budget to a single position.
2. ALWAYS include a stop-loss price — stop-loss is REQUIRED.
3. Prefer high-liquidity blue-chip tokens (minimum TVL: $${(preset.minPoolTvlUsd / 1000).toFixed(0)}k).
4. Maximum price impact: ${preset.maxPriceImpactPercent}%.
5. Diversify across at least 3-4 positions.
Max leverage: 2x. No short positions allowed. Minimum health factor: 1.5.`,
            moderate: `## Risk Rules (MODERATE - MANDATORY)
1. NEVER allocate more than ${preset.maxSingleTradePercent}% of the budget to a single position.
2. ALWAYS include a stop-loss price — stop-loss is REQUIRED.
3. Minimum pool TVL: $${(preset.minPoolTvlUsd / 1000).toFixed(0)}k.
4. Maximum price impact: ${preset.maxPriceImpactPercent}%.
5. Balance between concentrated and diversified positions.
Max leverage: 3x. Short positions permitted when bearish signals dominate. Minimum health factor: 1.3.`,
            aggressive: `## Risk Rules (AGGRESSIVE - MANDATORY)
1. NEVER allocate more than ${preset.maxSingleTradePercent}% of the budget to a single position.
2. Stop-loss is OPTIONAL — wider stops or no stops acceptable for conviction plays.
3. Higher volatility tokens acceptable (minimum TVL: $${(preset.minPoolTvlUsd / 1000).toFixed(0)}k).
4. Maximum price impact: ${preset.maxPriceImpactPercent}%.
5. Concentrated bets on high-conviction tokens are acceptable.
Max leverage: 5x. Shorts and leveraged shorts acceptable for high-conviction bearish plays. Minimum health factor: 1.1.`,
        };
        return toleranceRules[tolerance] + `
6. Each trade must specify a realistic priceImpact (0-100 as percent).
7. The poolFee must be one of: 100, 500, 3000, or 10000 (Uniswap V3 fee tiers).
8. The route array must contain valid Ethereum addresses representing the swap path.
9. minAmountOut must be strictly less than amountIn to account for slippage and fees.
10. The sum of all amountIn values must not exceed the user's budget.`;
    }
    getOutputSchema(mode) {
        const baseSchema = `## Output Format
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
      "route": ["<address>", ...],
      "direction": "long" | "short",
      "positionType": "spot_long" | "leveraged_long" | "spot_short" | "leveraged_short",
      "leverage": <number, 1.0 for spot, up to 5.0 for leveraged>
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
  }`;
        if (mode === "investment" || mode === "position") {
            return baseSchema + `,
  "investmentPlan": {
    "allocations": [
      {
        "tokenAddress": "<address>",
        "symbol": "<string>",
        "targetPercent": <number, 0-100>,
        "reasoning": "<string, why this token>"
      }
    ],
    "entryStrategy": "lump-sum" | "dca" | "hybrid",
    "dcaSchedule": {
      "frequency": "daily" | "weekly" | "biweekly" | "monthly",
      "totalPeriods": <number>,
      "amountPerPeriodPercent": <number>
    },
    "rebalancing": {
      "type": "calendar" | "drift",
      "frequency": "weekly" | "monthly" | "quarterly",
      "driftThresholdPercent": <number>
    },
    "exitCriteria": {
      "takeProfitPercent": <number>,
      "stopLossPercent": <number>,
      "trailingStopPercent": <number>,
      "timeExitMonths": <number>
    },
    "thesis": "<string, overall investment thesis>"
  }
}

NOTE: For investment mode, the investmentPlan is REQUIRED. The trades array may be empty if recommending DCA entry.
NOTE: Allocation targetPercent values should sum to approximately 100%.`;
        }
        return baseSchema + "\n}";
    }
    // ── User Message Builder ──────────────────────────────
    buildUserMessage(request, candidates, mode) {
        // Build data quality warnings
        const unreliableTokens = candidates.filter((c) => c.dataQuality && !c.dataQuality.indicatorsReliable);
        let dataWarning = "";
        if (unreliableTokens.length > 0) {
            const tokenNames = unreliableTokens.map((c) => c.symbol).join(", ");
            dataWarning = `\n## DATA QUALITY WARNING
The following tokens have INSUFFICIENT price data: ${tokenNames}.
RSI=50.0 and MACD=0 are DEFAULT values, NOT real market signals.
For these tokens, rely ONLY on DeFi metrics (liquidity, TVL, smart money flows).\n`;
        }
        // For investment mode, omit short-term indicators entirely
        const candidateSummaries = candidates.map((c) => {
            const directionalScore = c.directionalScore ? {
                longScore: c.directionalScore.longScore,
                shortScore: c.directionalScore.shortScore,
                preferredDirection: c.directionalScore.preferredDirection,
                directionConfidence: c.directionalScore.directionConfidence,
            } : undefined;
            if (mode === "investment" || mode === "position") {
                return {
                    token: c.symbol,
                    address: c.tokenAddress,
                    overallScore: c.overallScore,
                    reasoning: c.reasoning,
                    directionalScore,
                    dataQuality: c.dataQuality ? {
                        confidence: c.dataQuality.confidenceScore,
                        reliable: c.dataQuality.indicatorsReliable,
                        note: c.dataQuality.confidenceNote,
                    } : undefined,
                    defi: {
                        liquidityDepth: c.defiMetrics.liquidityDepth,
                        feeApy: c.defiMetrics.feeApy,
                        volumeTrend: c.defiMetrics.volumeTrend,
                        tvlStability: c.defiMetrics.tvlStability,
                        smartMoneyFlow: c.defiMetrics.smartMoneyFlow,
                    },
                };
            }
            return {
                token: c.symbol,
                address: c.tokenAddress,
                overallScore: c.overallScore,
                reasoning: c.reasoning,
                directionalScore,
                dataQuality: c.dataQuality ? {
                    confidence: c.dataQuality.confidenceScore,
                    reliable: c.dataQuality.indicatorsReliable,
                } : undefined,
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
            };
        });
        return `## Trade Request
- User prompt: "${request.prompt}"
- Budget: ${request.budget.toString()} wei of token ${request.budgetToken}
- Horizon: ${request.horizon}
- Mode: ${mode}
- Risk tolerance: ${request.riskTolerance}
- Chain: Ethereum Mainnet (ID: ${request.chainId})
- Wallet: ${request.walletAddress}
${dataWarning}
## Market Analysis (Quantitative Scores)
${JSON.stringify(candidateSummaries, null, 2)}

Based on the above data, generate an optimal ${mode === "investment" ? "investment portfolio allocation" : "trading strategy"}. The risk tolerance is "${request.riskTolerance}" and the time horizon is "${request.horizon}".

Produce the JSON ${mode === "investment" ? "investment plan" : "strategy"} now.`;
    }
    // ── LLM Callers ───────────────────────────────────────
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
    async callLLMWithThinking(systemPrompt, userMessage) {
        const response = await this.client.messages.create({
            model: this.model,
            max_tokens: 16000,
            thinking: { type: "enabled", budget_tokens: 8000 },
            system: systemPrompt,
            messages: [{ role: "user", content: userMessage }],
        });
        let text = "";
        let thinking;
        for (const block of response.content) {
            if (block.type === "thinking") {
                thinking = block.thinking;
            }
            else if (block.type === "text") {
                text = block.text;
            }
        }
        if (!text) {
            throw new Error("LLM returned no text content");
        }
        return { text, thinking };
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
    // ── Response Parser ───────────────────────────────────
    parseResponse(raw, mode) {
        // Strip markdown code blocks if present
        let cleaned = raw.trim();
        if (cleaned.startsWith("```")) {
            cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
        }
        const parsed = JSON.parse(cleaned);
        // Validate required fields exist
        if (!parsed.analysis || !parsed.riskMetrics || !parsed.estimatedReturn) {
            throw new Error("LLM response missing required top-level fields");
        }
        if (!Array.isArray(parsed.trades)) {
            throw new Error("LLM response must include trades array");
        }
        // For investment mode: require investmentPlan, trades can be empty
        if (mode === "investment") {
            if (!parsed.investmentPlan?.allocations?.length) {
                throw new Error("Investment mode requires investmentPlan with allocations");
            }
            // Validate allocation percentages roughly sum to 100%
            const totalAlloc = parsed.investmentPlan.allocations.reduce((sum, a) => sum + a.targetPercent, 0);
            if (totalAlloc < 80 || totalAlloc > 120) {
                this.log.warn({ totalAlloc }, "Allocation percentages don't sum to ~100%");
            }
        }
        else {
            // Trading modes require at least one trade
            if (parsed.trades.length === 0) {
                throw new Error("Trading mode must include at least one trade");
            }
        }
        for (const trade of parsed.trades) {
            if (!trade.tokenIn || !trade.tokenOut || !trade.amountIn || !trade.minAmountOut) {
                throw new Error("Trade missing required fields (tokenIn, tokenOut, amountIn, minAmountOut)");
            }
            // Validate that amount strings are valid bigint representations
            BigInt(trade.amountIn);
            BigInt(trade.minAmountOut);
            // Apply defaults for new directional fields
            trade.direction = trade.direction ?? "long";
            trade.positionType = trade.positionType ?? "spot_long";
            trade.leverage = trade.leverage ?? 1;
        }
        BigInt(parsed.riskMetrics.stopLossPrice);
        BigInt(parsed.riskMetrics.takeProfitPrice);
        return parsed;
    }
    toLLMTradeAction(trade) {
        const direction = (trade.direction ?? "long");
        const positionType = (trade.positionType ?? "spot_long");
        const leverage = trade.leverage ?? 1;
        const action = {
            action: trade.action,
            tokenIn: trade.tokenIn,
            tokenOut: trade.tokenOut,
            amountIn: BigInt(trade.amountIn),
            minAmountOut: BigInt(trade.minAmountOut),
            poolFee: trade.poolFee,
            priceImpact: trade.priceImpact,
            route: trade.route.map((addr) => addr),
            direction,
            positionType,
        };
        // Build LeverageConfig if leverage > 1
        if (leverage > 1) {
            action.leverageConfig = {
                collateralToken: trade.tokenIn,
                debtToken: trade.tokenOut,
                leverageMultiplier: leverage,
                protocol: "aave-v3",
            };
        }
        return action;
    }
}
//# sourceMappingURL=StrategyEngine.js.map