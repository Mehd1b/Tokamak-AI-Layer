import { Readable } from "node:stream";
import type { TradingStrategy } from "@tal-trading-agent/shared";
import { UNISWAP_V3, TOKENS } from "@tal-trading-agent/shared";

/**
 * Generates a zip buffer containing a self-contained trading bot repo
 * for the given strategy. The user can unzip, fill in .env, and run.
 */
export async function generateBotZip(strategy: TradingStrategy): Promise<Buffer> {
  // Dynamic import of archiver to keep it optional
  const archiver = (await import("archiver")).default;

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);

    const prefix = `trading-bot-${strategy.id}`;

    // ── package.json ──────────────────────────────────────
    archive.append(
      JSON.stringify(
        {
          name: `trading-bot-${strategy.id}`,
          version: "1.0.0",
          private: true,
          type: "module",
          scripts: {
            start: "tsx src/index.ts",
            build: "tsc",
            "start:prod": "node dist/index.js",
          },
          dependencies: {
            viem: "^2.21.0",
            dotenv: "^17.2.4",
          },
          devDependencies: {
            tsx: "^4.19.0",
            typescript: "^5.4.0",
            "@types/node": "^20.0.0",
          },
        },
        null,
        2,
      ),
      { name: `${prefix}/package.json` },
    );

    // ── tsconfig.json ─────────────────────────────────────
    archive.append(
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            outDir: "dist",
            rootDir: "src",
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            declaration: true,
          },
          include: ["src"],
        },
        null,
        2,
      ),
      { name: `${prefix}/tsconfig.json` },
    );

    // ── .env.example ──────────────────────────────────────
    const tradesJson = JSON.stringify(
      strategy.trades.map((t) => ({
        action: t.action,
        tokenIn: t.tokenIn,
        tokenOut: t.tokenOut,
        amountIn: t.amountIn.toString(),
        minAmountOut: t.minAmountOut.toString(),
        poolFee: t.poolFee,
        route: t.route,
      })),
    );

    archive.append(
      [
        `# Trading Bot Configuration`,
        `# Strategy ID: ${strategy.id}`,
        `# Generated: ${new Date(strategy.generatedAt).toISOString()}`,
        `# Expires: ${new Date(strategy.expiresAt).toISOString()}`,
        ``,
        `# Your Ethereum RPC URL (Alchemy, Infura, etc.)`,
        `ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY`,
        ``,
        `# Your wallet private key (KEEP SECRET)`,
        `PRIVATE_KEY=0x...`,
        ``,
        `# Strategy parameters (pre-configured)`,
        `STRATEGY_ID=${strategy.id}`,
        `TRADES=${tradesJson}`,
        `STOP_LOSS_PRICE=${strategy.riskMetrics.stopLossPrice.toString()}`,
        `TAKE_PROFIT_PRICE=${strategy.riskMetrics.takeProfitPrice.toString()}`,
        `MAX_SLIPPAGE_BPS=100`,
        ``,
        `# Monitoring interval in seconds`,
        `CHECK_INTERVAL=60`,
      ].join("\n"),
      { name: `${prefix}/.env.example` },
    );

    // ── Dockerfile ────────────────────────────────────────
    archive.append(
      [
        `FROM node:20-alpine`,
        `WORKDIR /app`,
        `COPY package.json ./`,
        `RUN npm install`,
        `COPY . .`,
        `RUN npx tsc`,
        `CMD ["node", "dist/index.js"]`,
      ].join("\n"),
      { name: `${prefix}/Dockerfile` },
    );

    // ── src/index.ts ──────────────────────────────────────
    archive.append(
      [
        `import "dotenv/config";`,
        `import { execute } from "./executor.js";`,
        `import { startMonitor } from "./monitor.js";`,
        ``,
        `async function main() {`,
        `  console.log("Trading Bot - Strategy ${strategy.id}");`,
        `  console.log("Market condition: ${strategy.analysis.marketCondition}");`,
        `  console.log("Confidence: ${strategy.analysis.confidence}%");`,
        `  console.log("Expected return: ${strategy.estimatedReturn.expected}%");`,
        `  console.log("");`,
        ``,
        `  // Execute the initial trades`,
        `  await execute();`,
        ``,
        `  // Start price monitoring for stop-loss / take-profit`,
        `  const interval = parseInt(process.env.CHECK_INTERVAL ?? "60", 10);`,
        `  startMonitor(interval);`,
        `}`,
        ``,
        `main().catch((err) => {`,
        `  console.error("Fatal error:", err);`,
        `  process.exit(1);`,
        `});`,
      ].join("\n"),
      { name: `${prefix}/src/index.ts` },
    );

    // ── src/executor.ts ───────────────────────────────────
    const swapRouterAddr = UNISWAP_V3.swapRouter;
    archive.append(
      [
        `import { createPublicClient, createWalletClient, http, parseAbi, type Hex } from "viem";`,
        `import { mainnet } from "viem/chains";`,
        `import { privateKeyToAccount } from "viem/accounts";`,
        ``,
        `const SWAP_ROUTER = "${swapRouterAddr}" as const;`,
        ``,
        `const routerAbi = parseAbi([`,
        `  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",`,
        `]);`,
        ``,
        `export async function execute() {`,
        `  const rpcUrl = process.env.ETHEREUM_RPC_URL;`,
        `  const privateKey = process.env.PRIVATE_KEY as Hex;`,
        `  if (!rpcUrl || !privateKey) throw new Error("Missing ETHEREUM_RPC_URL or PRIVATE_KEY in .env");`,
        ``,
        `  const account = privateKeyToAccount(privateKey);`,
        `  const publicClient = createPublicClient({ chain: mainnet, transport: http(rpcUrl) });`,
        `  const walletClient = createWalletClient({ account, chain: mainnet, transport: http(rpcUrl) });`,
        ``,
        `  const trades = JSON.parse(process.env.TRADES ?? "[]");`,
        ``,
        `  for (const trade of trades) {`,
        `    console.log(\`Executing \${trade.action}: \${trade.tokenIn} -> \${trade.tokenOut}\`);`,
        `    console.log(\`  Amount: \${trade.amountIn} | Min out: \${trade.minAmountOut}\`);`,
        ``,
        `    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800); // 30 min`,
        `    const isETH = trade.tokenIn.toLowerCase() === "${TOKENS.WETH}".toLowerCase();`,
        ``,
        `    const hash = await walletClient.writeContract({`,
        `      address: SWAP_ROUTER,`,
        `      abi: routerAbi,`,
        `      functionName: "exactInputSingle",`,
        `      args: [{`,
        `        tokenIn: trade.tokenIn,`,
        `        tokenOut: trade.tokenOut,`,
        `        fee: trade.poolFee,`,
        `        recipient: account.address,`,
        `        deadline,`,
        `        amountIn: BigInt(trade.amountIn),`,
        `        amountOutMinimum: BigInt(trade.minAmountOut),`,
        `        sqrtPriceLimitX96: 0n,`,
        `      }],`,
        `      value: isETH ? BigInt(trade.amountIn) : 0n,`,
        `    });`,
        ``,
        `    console.log(\`  Tx submitted: \${hash}\`);`,
        `    const receipt = await publicClient.waitForTransactionReceipt({ hash });`,
        `    console.log(\`  Confirmed in block \${receipt.blockNumber} | Status: \${receipt.status}\`);`,
        `  }`,
        ``,
        `  console.log("All trades executed.");`,
        `}`,
      ].join("\n"),
      { name: `${prefix}/src/executor.ts` },
    );

    // ── src/monitor.ts ────────────────────────────────────
    archive.append(
      [
        `import { createPublicClient, http, parseAbi } from "viem";`,
        `import { mainnet } from "viem/chains";`,
        ``,
        `const quoterAbi = parseAbi([`,
        `  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",`,
        `]);`,
        ``,
        `const QUOTER = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e" as const;`,
        ``,
        `export function startMonitor(intervalSec: number) {`,
        `  const stopLoss = BigInt(process.env.STOP_LOSS_PRICE ?? "0");`,
        `  const takeProfit = BigInt(process.env.TAKE_PROFIT_PRICE ?? "0");`,
        `  const trades = JSON.parse(process.env.TRADES ?? "[]");`,
        ``,
        `  if (trades.length === 0 || (stopLoss === 0n && takeProfit === 0n)) {`,
        `    console.log("No monitoring targets configured. Exiting.");`,
        `    return;`,
        `  }`,
        ``,
        `  const client = createPublicClient({`,
        `    chain: mainnet,`,
        `    transport: http(process.env.ETHEREUM_RPC_URL),`,
        `  });`,
        ``,
        `  console.log(\`Price monitor started (checking every \${intervalSec}s)\`);`,
        `  if (stopLoss > 0n) console.log(\`  Stop-loss: \${stopLoss}\`);`,
        `  if (takeProfit > 0n) console.log(\`  Take-profit: \${takeProfit}\`);`,
        ``,
        `  const timer = setInterval(async () => {`,
        `    try {`,
        `      const trade = trades[0];`,
        `      const result = await client.simulateContract({`,
        `        address: QUOTER,`,
        `        abi: quoterAbi,`,
        `        functionName: "quoteExactInputSingle",`,
        `        args: [{`,
        `          tokenIn: trade.tokenOut,`,
        `          tokenOut: trade.tokenIn,`,
        `          amountIn: BigInt(trade.minAmountOut),`,
        `          fee: trade.poolFee,`,
        `          sqrtPriceLimitX96: 0n,`,
        `        }],`,
        `      });`,
        ``,
        `      const currentValue = result.result[0];`,
        `      const now = new Date().toISOString();`,
        `      console.log(\`[\${now}] Current value: \${currentValue}\`);`,
        ``,
        `      if (stopLoss > 0n && currentValue <= stopLoss) {`,
        `        console.log("STOP-LOSS TRIGGERED! Manual action required.");`,
        `        clearInterval(timer);`,
        `      }`,
        `      if (takeProfit > 0n && currentValue >= takeProfit) {`,
        `        console.log("TAKE-PROFIT TRIGGERED! Manual action required.");`,
        `        clearInterval(timer);`,
        `      }`,
        `    } catch (err) {`,
        `      console.error("Monitor error:", err);`,
        `    }`,
        `  }, intervalSec * 1000);`,
        `}`,
      ].join("\n"),
      { name: `${prefix}/src/monitor.ts` },
    );

    // ── README.md ─────────────────────────────────────────
    archive.append(
      [
        `# Trading Bot - ${strategy.id}`,
        ``,
        `Auto-generated trading bot from TAL Trading Agent.`,
        ``,
        `## Strategy`,
        `- **Market condition**: ${strategy.analysis.marketCondition}`,
        `- **Confidence**: ${strategy.analysis.confidence}%`,
        `- **Expected return**: ${strategy.estimatedReturn.expected}%`,
        `- **Risk score**: ${strategy.riskMetrics.score}/10`,
        `- **Horizon**: ${strategy.request.horizon}`,
        ``,
        `## Quick Start`,
        ``,
        "```bash",
        `# 1. Install dependencies`,
        `npm install`,
        ``,
        `# 2. Configure environment`,
        `cp .env.example .env`,
        `# Edit .env with your RPC URL and private key`,
        ``,
        `# 3. Run the bot`,
        `npm start`,
        "```",
        ``,
        `## Docker`,
        ``,
        "```bash",
        `docker build -t trading-bot .`,
        `docker run --env-file .env trading-bot`,
        "```",
        ``,
        `## Trades`,
        ``,
        ...strategy.trades.map(
          (t, i) =>
            `${i + 1}. **${t.action.toUpperCase()}**: ${t.tokenIn} -> ${t.tokenOut} (amount: ${t.amountIn}, fee: ${t.poolFee})`,
        ),
        ``,
        `## Risk`,
        `- Max drawdown: ${strategy.riskMetrics.maxDrawdown}%`,
        `- Position size: ${strategy.riskMetrics.positionSizePercent}%`,
        `- Stop-loss configured: Yes`,
        ``,
        `---`,
        `Generated by [TAL Trading Agent](https://github.com/tokamak-network)`,
      ].join("\n"),
      { name: `${prefix}/README.md` },
    );

    archive.finalize();
  });
}
