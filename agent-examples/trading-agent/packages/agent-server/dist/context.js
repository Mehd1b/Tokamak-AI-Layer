import pino from "pino";
import { createPublicClient, createWalletClient, http } from "viem";
import { mainnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { loadConfig } from "@tal-trading-agent/shared";
import { PoolAnalyzer } from "@tal-trading-agent/agent-core";
import { QuantAnalysis } from "@tal-trading-agent/agent-core";
import { TokenScorer } from "@tal-trading-agent/agent-core";
import { TokenPreFilter } from "@tal-trading-agent/agent-core";
import { StrategyEngine } from "@tal-trading-agent/agent-core";
import { RiskManager } from "@tal-trading-agent/agent-core";
import { TradeExecutor } from "@tal-trading-agent/agent-core";
import { SwapBuilder } from "@tal-trading-agent/agent-core";
import { AaveV3Client } from "@tal-trading-agent/agent-core";
import { LendingBuilder } from "@tal-trading-agent/agent-core";
import { PositionManager } from "@tal-trading-agent/agent-core";
import { TradingAgentTAL } from "@tal-trading-agent/tal-integration";
import { SIWAProvider } from "@tal-trading-agent/siwa-auth";
export async function buildContext() {
    const config = loadConfig();
    const logger = pino({
        name: "tal-trading-agent",
        level: config.nodeEnv === "production" ? "info" : "debug",
    });
    // Ethereum mainnet client for pool reads and trade execution
    const ethClient = createPublicClient({
        chain: mainnet,
        transport: http(config.ethereumRpcUrl),
    });
    // Wallet client for TAL registration (Thanos Sepolia)
    let walletClient = null;
    if (config.agentPrivateKey && config.agentPrivateKey !== "0x") {
        const thanosChain = {
            id: 111551119090,
            name: "Thanos Sepolia",
            nativeCurrency: { name: "TON", symbol: "TON", decimals: 18 },
            rpcUrls: { default: { http: [config.thanosRpcUrl] } },
        };
        const account = privateKeyToAccount(config.agentPrivateKey);
        walletClient = createWalletClient({
            account,
            chain: thanosChain,
            transport: http(config.thanosRpcUrl),
        });
    }
    const thanosPublicClient = createPublicClient({
        transport: http(config.thanosRpcUrl),
    });
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
    const aaveV3Client = new AaveV3Client(ethClient);
    const lendingBuilder = new LendingBuilder({ swapBuilder });
    const positionManager = new PositionManager(aaveV3Client, lendingBuilder);
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
        aaveV3Client,
        lendingBuilder,
        positionManager,
        talIntegration,
        siwaProvider,
        strategyCache: new Map(),
        executionCache: new Map(),
        positionCache: new Map(),
    };
}
//# sourceMappingURL=context.js.map