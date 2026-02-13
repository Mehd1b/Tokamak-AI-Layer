/**
 * CLI script to register the trading agent on TAL (Thanos Sepolia).
 *
 * Usage:
 *   pnpm register
 *   # or: tsx scripts/register-agent.ts
 *
 * Requires .env with:
 *   - AGENT_PRIVATE_KEY
 *   - THANOS_RPC_URL
 *   - PINATA_API_KEY + PINATA_SECRET_KEY (optional, for IPFS upload)
 */
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import pino from "pino";
import { loadConfig } from "@tal-trading-agent/shared";
import { TradingAgentTAL } from "@tal-trading-agent/tal-integration";

const logger = pino({ name: "register-agent" });

async function main() {
  const config = loadConfig();

  if (!config.agentPrivateKey || config.agentPrivateKey === "0x") {
    logger.error("AGENT_PRIVATE_KEY is required in .env");
    process.exit(1);
  }

  const thanosChain = {
    id: 111551119090,
    name: "Thanos Sepolia",
    nativeCurrency: { name: "TON", symbol: "TON", decimals: 18 },
    rpcUrls: { default: { http: [config.thanosRpcUrl] } },
  } as const;

  const account = privateKeyToAccount(config.agentPrivateKey);
  logger.info({ address: account.address }, "Using account");

  const publicClient = createPublicClient({
    chain: thanosChain,
    transport: http(config.thanosRpcUrl),
  }) as PublicClient;

  const walletClient = createWalletClient({
    account,
    chain: thanosChain,
    transport: http(config.thanosRpcUrl),
  });

  const tal = new TradingAgentTAL({
    publicClient,
    walletClient,
    config,
    logger,
  });

  // Default to localhost for development; change for production
  const baseUrl = process.env["BASE_URL"] ?? "http://localhost:3000";

  logger.info({ baseUrl }, "Registering trading agent on TAL...");
  const result = await tal.registerTradingAgent(baseUrl);

  logger.info(
    {
      agentId: result.agentId.toString(),
      txHash: result.txHash,
    },
    "Agent registered successfully!",
  );

  console.log("\n========================================");
  console.log(`  Agent ID: ${result.agentId}`);
  console.log(`  Tx Hash:  ${result.txHash}`);
  console.log("========================================");
  console.log("\nAdd to your .env:");
  console.log(`  AGENT_ID=${result.agentId}`);
  console.log("");
}

main().catch((err) => {
  logger.error({ err }, "Registration failed");
  process.exit(1);
});
