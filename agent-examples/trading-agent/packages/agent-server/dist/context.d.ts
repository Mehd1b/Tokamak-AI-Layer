import { type Logger } from "pino";
import type { PublicClient, WalletClient } from "viem";
import { type AppConfig, type TradingStrategy, type ExecutionResult } from "@tal-trading-agent/shared";
import { PoolAnalyzer } from "@tal-trading-agent/agent-core";
import { QuantAnalysis } from "@tal-trading-agent/agent-core";
import { TokenScorer } from "@tal-trading-agent/agent-core";
import { TokenPreFilter } from "@tal-trading-agent/agent-core";
import { StrategyEngine } from "@tal-trading-agent/agent-core";
import { RiskManager } from "@tal-trading-agent/agent-core";
import { TradeExecutor } from "@tal-trading-agent/agent-core";
import { SwapBuilder } from "@tal-trading-agent/agent-core";
import { TradingAgentTAL } from "@tal-trading-agent/tal-integration";
import { SIWAProvider } from "@tal-trading-agent/siwa-auth";
export interface AppContext {
    config: AppConfig;
    logger: Logger;
    ethClient: PublicClient;
    walletClient: WalletClient | null;
    poolAnalyzer: PoolAnalyzer;
    quantAnalysis: QuantAnalysis;
    tokenScorer: TokenScorer;
    tokenPreFilter: TokenPreFilter;
    strategyEngine: StrategyEngine;
    riskManager: RiskManager;
    tradeExecutor: TradeExecutor;
    swapBuilder: SwapBuilder;
    talIntegration: TradingAgentTAL;
    siwaProvider: SIWAProvider;
    strategyCache: Map<string, TradingStrategy>;
    executionCache: Map<string, ExecutionResult>;
}
export declare function buildContext(): Promise<AppContext>;
//# sourceMappingURL=context.d.ts.map