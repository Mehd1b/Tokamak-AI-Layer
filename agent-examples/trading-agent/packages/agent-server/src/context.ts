import pino, { type Logger } from "pino";
import { createPublicClient, createWalletClient, http } from "viem";
import { mainnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import type { PublicClient, WalletClient } from "viem";
import { loadConfig, type AppConfig, type TradingStrategy, type ExecutionResult } from "@tal-trading-agent/shared";
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

export async function buildContext(): Promise<AppContext> {
  const config = loadConfig();
  const logger = pino({
    name: "tal-trading-agent",
    level: config.nodeEnv === "production" ? "info" : "debug",
  });

  // Ethereum mainnet client for pool reads and trade execution
  const ethClient = createPublicClient({
    chain: mainnet,
    transport: http(config.ethereumRpcUrl),
  }) as PublicClient;

  // Wallet client for TAL registration (Thanos Sepolia)
  let walletClient: WalletClient | null = null;
  if (config.agentPrivateKey && config.agentPrivateKey !== "0x") {
    const thanosChain = {
      id: 111551119090,
      name: "Thanos Sepolia",
      nativeCurrency: { name: "TON", symbol: "TON", decimals: 18 },
      rpcUrls: { default: { http: [config.thanosRpcUrl] } },
    } as const;
    const account = privateKeyToAccount(config.agentPrivateKey);
    walletClient = createWalletClient({
      account,
      chain: thanosChain,
      transport: http(config.thanosRpcUrl),
    });
  }

  const thanosPublicClient = createPublicClient({
    transport: http(config.thanosRpcUrl),
  }) as PublicClient;

  // Initialize all modules
  const poolAnalyzer = new PoolAnalyzer(ethClient);
  const quantAnalysis = new QuantAnalysis();
  const tokenScorer = new TokenScorer(ethClient);
  const tokenPreFilter = new TokenPreFilter(ethClient);
  const strategyEngine = new StrategyEngine({
    anthropicApiKey: config.anthropicApiKey,
  });
  const riskManager = new RiskManager({});
  const tradeExecutor = new TradeExecutor({ publicClient: ethClient });
  const swapBuilder = new SwapBuilder({});
  const talIntegration = new TradingAgentTAL({
    publicClient: thanosPublicClient,
    walletClient: walletClient ?? undefined,
    config,
    logger,
  });
  const siwaProvider = new SIWAProvider({
    domain: config.siwaDomain,
    sessionTtl: config.siwaSessionTtl,
  });

  logger.info("All modules initialized");

  return {
    config,
    logger,
    ethClient,
    walletClient,
    poolAnalyzer,
    quantAnalysis,
    tokenScorer,
    tokenPreFilter,
    strategyEngine,
    riskManager,
    tradeExecutor,
    swapBuilder,
    talIntegration,
    siwaProvider,
    strategyCache: new Map(),
    executionCache: new Map(),
  };
}
