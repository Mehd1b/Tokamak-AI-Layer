import type { TradeRequest, TradingStrategy, QuantScore } from "@tal-trading-agent/shared";
export interface StrategyEngineConfig {
    anthropicApiKey: string;
    model?: string;
}
export declare class StrategyEngine {
    private readonly client;
    private readonly model;
    private readonly log;
    constructor(config: StrategyEngineConfig);
    generateStrategy(request: TradeRequest, candidates: QuantScore[]): Promise<TradingStrategy>;
    private buildSystemPrompt;
    private getModeGuidance;
    private getRiskRules;
    private getOutputSchema;
    private buildUserMessage;
    private callLLM;
    private callLLMWithThinking;
    private callLLMWithCorrection;
    private parseResponse;
    private toLLMTradeAction;
}
//# sourceMappingURL=StrategyEngine.d.ts.map