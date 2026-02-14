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
    const swapRouterAddr = UNISWAP_V3.swapRouter;
    const quoterAddr = UNISWAP_V3.quoterV2;
    const wethAddr = TOKENS.WETH;
    const isInvestment = strategy.mode === "investment";
    const isDCA =
      isInvestment && strategy.investmentPlan?.entryStrategy === "dca";
    const hasRebalancing =
      isInvestment && !!strategy.investmentPlan?.rebalancing;

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
            resolveJsonModule: true,
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

    const envLines = [
      `# ═══════════════════════════════════════════════════════════`,
      `# Trading Bot — Environment Configuration`,
      `# ═══════════════════════════════════════════════════════════`,
      `#`,
      `# 1. Copy this file:  cp .env.example .env`,
      `# 2. Fill in YOUR_KEY values below`,
      `# 3. Run the bot:     npm start`,
      `#`,
      ``,
      `# ── Network ────────────────────────────────────────────────`,
      `# Your Ethereum RPC URL (Alchemy, Infura, QuickNode, etc.)`,
      `ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY`,
      ``,
      `# ── Wallet ─────────────────────────────────────────────────`,
      `# Your wallet private key — NEVER share or commit this`,
      `PRIVATE_KEY=0x...`,
      ``,
      `# ── Strategy (auto-configured) ─────────────────────────────`,
      `STRATEGY_ID=${strategy.id}`,
      `STRATEGY_MODE=${strategy.mode}`,
      ``,
      `# JSON array of trades to execute`,
      `TRADES=${tradesJson}`,
      ``,
      `# ── Risk Management ────────────────────────────────────────`,
      `STOP_LOSS_PRICE=${strategy.riskMetrics.stopLossPrice.toString()}`,
      `TAKE_PROFIT_PRICE=${strategy.riskMetrics.takeProfitPrice.toString()}`,
      `MAX_SLIPPAGE_BPS=100`,
      ``,
      `# ── Auto-Execution Listener ───────────────────────────────`,
      `AUTO_EXECUTE=true`,
      `TRAILING_STOP_PERCENT=${strategy.investmentPlan?.exitCriteria?.trailingStopPercent ?? 10}`,
      `CHECK_INTERVAL=60`,
    ];

    if (isInvestment && strategy.investmentPlan) {
      const plan = strategy.investmentPlan;

      envLines.push(
        ``,
        `# ── Investment Mode ─────────────────────────────────────`,
        `ENTRY_STRATEGY=${plan.entryStrategy}`,
      );

      if (plan.allocations.length > 0) {
        const allocJson = JSON.stringify(
          plan.allocations.map((a) => ({
            tokenAddress: a.tokenAddress,
            symbol: a.symbol,
            targetPercent: a.targetPercent,
          })),
        );
        envLines.push(`ALLOCATIONS=${allocJson}`);
      }

      if (plan.dcaSchedule) {
        envLines.push(
          ``,
          `# DCA Schedule`,
          `DCA_FREQUENCY=${plan.dcaSchedule.frequency}`,
          `DCA_TOTAL_PERIODS=${plan.dcaSchedule.totalPeriods}`,
          `DCA_AMOUNT_PER_PERIOD_PERCENT=${plan.dcaSchedule.amountPerPeriodPercent}`,
        );
      }

      if (plan.rebalancing) {
        envLines.push(
          ``,
          `# Rebalancing`,
          `REBALANCE_TYPE=${plan.rebalancing.type}`,
        );
        if (plan.rebalancing.frequency) {
          envLines.push(`REBALANCE_FREQUENCY=${plan.rebalancing.frequency}`);
        }
        if (plan.rebalancing.driftThresholdPercent != null) {
          envLines.push(`DRIFT_THRESHOLD_PERCENT=${plan.rebalancing.driftThresholdPercent}`);
        }
      }

      if (plan.exitCriteria) {
        envLines.push(``, `# Exit Criteria`);
        if (plan.exitCriteria.takeProfitPercent != null) {
          envLines.push(`EXIT_TAKE_PROFIT_PERCENT=${plan.exitCriteria.takeProfitPercent}`);
        }
        if (plan.exitCriteria.stopLossPercent != null) {
          envLines.push(`EXIT_STOP_LOSS_PERCENT=${plan.exitCriteria.stopLossPercent}`);
        }
        if (plan.exitCriteria.timeExitMonths != null) {
          envLines.push(`EXIT_TIME_MONTHS=${plan.exitCriteria.timeExitMonths}`);
        }
      }
    }

    archive.append(envLines.join("\n"), { name: `${prefix}/.env.example` });

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

    // ── src/helpers.ts ────────────────────────────────────
    archive.append(
      [
        `import {`,
        `  createPublicClient,`,
        `  createWalletClient,`,
        `  http,`,
        `  parseAbi,`,
        `  type Hex,`,
        `  type Address,`,
        `} from "viem";`,
        `import { mainnet } from "viem/chains";`,
        `import { privateKeyToAccount } from "viem/accounts";`,
        ``,
        `export const SWAP_ROUTER = "${swapRouterAddr}" as const;`,
        `export const QUOTER = "${quoterAddr}" as const;`,
        `export const WETH = "${wethAddr}" as const;`,
        ``,
        `const routerAbi = parseAbi([`,
        `  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",`,
        `]);`,
        ``,
        `const erc20Abi = parseAbi([`,
        `  "function approve(address spender, uint256 amount) external returns (bool)",`,
        `  "function balanceOf(address account) external view returns (uint256)",`,
        `  "function allowance(address owner, address spender) external view returns (uint256)",`,
        `]);`,
        ``,
        `const quoterAbi = parseAbi([`,
        `  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",`,
        `]);`,
        ``,
        `export function getClients() {`,
        `  const rpcUrl = process.env.ETHEREUM_RPC_URL;`,
        `  const privateKey = process.env.PRIVATE_KEY as Hex;`,
        `  if (!rpcUrl || !privateKey) throw new Error("Missing ETHEREUM_RPC_URL or PRIVATE_KEY in .env");`,
        ``,
        `  const account = privateKeyToAccount(privateKey);`,
        `  const publicClient = createPublicClient({ chain: mainnet, transport: http(rpcUrl) });`,
        `  const walletClient = createWalletClient({ account, chain: mainnet, transport: http(rpcUrl) });`,
        `  return { publicClient, walletClient, account };`,
        `}`,
        ``,
        `export async function approveToken(`,
        `  token: Address,`,
        `  spender: Address,`,
        `  amount: bigint,`,
        `) {`,
        `  const { publicClient, walletClient, account } = getClients();`,
        ``,
        `  const currentAllowance = await publicClient.readContract({`,
        `    address: token,`,
        `    abi: erc20Abi,`,
        `    functionName: "allowance",`,
        `    args: [account.address, spender],`,
        `  });`,
        ``,
        `  if (currentAllowance >= amount) {`,
        `    console.log(\`  Allowance sufficient (\${currentAllowance} >= \${amount})\`);`,
        `    return;`,
        `  }`,
        ``,
        `  console.log(\`  Approving \${token} for \${amount}...\`);`,
        `  const hash = await walletClient.writeContract({`,
        `    address: token,`,
        `    abi: erc20Abi,`,
        `    functionName: "approve",`,
        `    args: [spender, amount],`,
        `  });`,
        `  const receipt = await publicClient.waitForTransactionReceipt({ hash });`,
        `  console.log(\`  Approved in block \${receipt.blockNumber}\`);`,
        `}`,
        ``,
        `export async function executeSwap(trade: {`,
        `  tokenIn: Address;`,
        `  tokenOut: Address;`,
        `  amountIn: bigint;`,
        `  minAmountOut: bigint;`,
        `  poolFee: number;`,
        `}) {`,
        `  const { publicClient, walletClient, account } = getClients();`,
        `  const isETH = trade.tokenIn.toLowerCase() === WETH.toLowerCase();`,
        ``,
        `  if (!isETH) {`,
        `    await approveToken(trade.tokenIn, SWAP_ROUTER, trade.amountIn);`,
        `  }`,
        ``,
        `  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);`,
        `  const hash = await walletClient.writeContract({`,
        `    address: SWAP_ROUTER,`,
        `    abi: routerAbi,`,
        `    functionName: "exactInputSingle",`,
        `    args: [{`,
        `      tokenIn: trade.tokenIn,`,
        `      tokenOut: trade.tokenOut,`,
        `      fee: trade.poolFee,`,
        `      recipient: account.address,`,
        `      deadline,`,
        `      amountIn: trade.amountIn,`,
        `      amountOutMinimum: trade.minAmountOut,`,
        `      sqrtPriceLimitX96: 0n,`,
        `    }],`,
        `    value: isETH ? trade.amountIn : 0n,`,
        `  });`,
        ``,
        `  console.log(\`  Tx submitted: \${hash}\`);`,
        `  const receipt = await publicClient.waitForTransactionReceipt({ hash });`,
        `  console.log(\`  Confirmed in block \${receipt.blockNumber} | Status: \${receipt.status}\`);`,
        `  return receipt;`,
        `}`,
        ``,
        `export async function getQuote(trade: {`,
        `  tokenIn: Address;`,
        `  tokenOut: Address;`,
        `  amountIn: bigint;`,
        `  poolFee: number;`,
        `}): Promise<bigint> {`,
        `  const { publicClient } = getClients();`,
        `  const result = await publicClient.simulateContract({`,
        `    address: QUOTER,`,
        `    abi: quoterAbi,`,
        `    functionName: "quoteExactInputSingle",`,
        `    args: [{`,
        `      tokenIn: trade.tokenIn,`,
        `      tokenOut: trade.tokenOut,`,
        `      amountIn: trade.amountIn,`,
        `      fee: trade.poolFee,`,
        `      sqrtPriceLimitX96: 0n,`,
        `    }],`,
        `  });`,
        `  return result.result[0];`,
        `}`,
        ``,
        `export async function getTokenBalance(token: Address, owner: Address): Promise<bigint> {`,
        `  const { publicClient } = getClients();`,
        `  return publicClient.readContract({`,
        `    address: token,`,
        `    abi: erc20Abi,`,
        `    functionName: "balanceOf",`,
        `    args: [owner],`,
        `  });`,
        `}`,
      ].join("\n"),
      { name: `${prefix}/src/helpers.ts` },
    );

    // ── src/executor.ts ───────────────────────────────────
    archive.append(
      [
        `import type { Address } from "viem";`,
        `import { getClients, executeSwap } from "./helpers.js";`,
        ``,
        `export async function execute() {`,
        `  const trades: Array<{`,
        `    action: string;`,
        `    tokenIn: string;`,
        `    tokenOut: string;`,
        `    amountIn: string;`,
        `    minAmountOut: string;`,
        `    poolFee: number;`,
        `  }> = JSON.parse(process.env.TRADES ?? "[]");`,
        ``,
        `  if (trades.length === 0) {`,
        `    console.log("No trades configured.");`,
        `    return;`,
        `  }`,
        ``,
        `  for (const trade of trades) {`,
        `    console.log(\`Executing \${trade.action}: \${trade.tokenIn} -> \${trade.tokenOut}\`);`,
        `    console.log(\`  Amount: \${trade.amountIn} | Min out: \${trade.minAmountOut}\`);`,
        ``,
        `    await executeSwap({`,
        `      tokenIn: trade.tokenIn as Address,`,
        `      tokenOut: trade.tokenOut as Address,`,
        `      amountIn: BigInt(trade.amountIn),`,
        `      minAmountOut: BigInt(trade.minAmountOut),`,
        `      poolFee: trade.poolFee,`,
        `    });`,
        `  }`,
        ``,
        `  console.log("All trades executed.");`,
        `}`,
      ].join("\n"),
      { name: `${prefix}/src/executor.ts` },
    );

    // ── src/listener.ts ───────────────────────────────────
    archive.append(
      [
        `import type { Address } from "viem";`,
        `import { getClients, getQuote, getTokenBalance, executeSwap, WETH } from "./helpers.js";`,
        ``,
        `interface Position {`,
        `  tokenIn: Address;  // original tokenIn (budget token)`,
        `  tokenOut: Address; // token we're holding`,
        `  poolFee: number;`,
        `}`,
        ``,
        `export function startListener(intervalSec: number) {`,
        `  const stopLoss = BigInt(process.env.STOP_LOSS_PRICE ?? "0");`,
        `  const takeProfit = BigInt(process.env.TAKE_PROFIT_PRICE ?? "0");`,
        `  const trailingStopPct = parseInt(process.env.TRAILING_STOP_PERCENT ?? "0", 10);`,
        `  const autoExecute = process.env.AUTO_EXECUTE !== "false";`,
        `  const trades: Array<{`,
        `    action: string;`,
        `    tokenIn: string;`,
        `    tokenOut: string;`,
        `    amountIn: string;`,
        `    minAmountOut: string;`,
        `    poolFee: number;`,
        `  }> = JSON.parse(process.env.TRADES ?? "[]");`,
        ``,
        `  // Build positions from executed buy trades`,
        `  const positions: Position[] = trades`,
        `    .filter((t) => t.action === "buy")`,
        `    .map((t) => ({`,
        `      tokenIn: t.tokenIn as Address,`,
        `      tokenOut: t.tokenOut as Address,`,
        `      poolFee: t.poolFee,`,
        `    }));`,
        ``,
        `  if (positions.length === 0 || (stopLoss === 0n && takeProfit === 0n && trailingStopPct === 0)) {`,
        `    console.log("No positions to monitor or no triggers configured. Exiting listener.");`,
        `    return;`,
        `  }`,
        ``,
        `  let peakValue = 0n;`,
        ``,
        `  console.log(\`\\nListener started (checking every \${intervalSec}s)\`);`,
        `  console.log(\`  Auto-execute: \${autoExecute}\`);`,
        `  if (stopLoss > 0n) console.log(\`  Stop-loss: \${stopLoss}\`);`,
        `  if (takeProfit > 0n) console.log(\`  Take-profit: \${takeProfit}\`);`,
        `  if (trailingStopPct > 0) console.log(\`  Trailing stop: \${trailingStopPct}%\`);`,
        ``,
        `  const timer = setInterval(async () => {`,
        `    try {`,
        `      const { account } = getClients();`,
        `      let totalValue = 0n;`,
        ``,
        `      // Sum portfolio value: for each held token, quote what we'd get swapping back`,
        `      for (const pos of positions) {`,
        `        const balance = await getTokenBalance(pos.tokenOut, account.address);`,
        `        if (balance === 0n) continue;`,
        ``,
        `        const value = await getQuote({`,
        `          tokenIn: pos.tokenOut,`,
        `          tokenOut: pos.tokenIn,`,
        `          amountIn: balance,`,
        `          poolFee: pos.poolFee,`,
        `        });`,
        `        totalValue += value;`,
        `      }`,
        ``,
        `      const now = new Date().toISOString();`,
        `      console.log(\`[\${now}] Portfolio value: \${totalValue}\`);`,
        ``,
        `      // Track peak for trailing stop`,
        `      if (totalValue > peakValue) {`,
        `        peakValue = totalValue;`,
        `        console.log(\`  New peak: \${peakValue}\`);`,
        `      }`,
        ``,
        `      // Check triggers`,
        `      let triggered = false;`,
        `      let reason = "";`,
        ``,
        `      if (stopLoss > 0n && totalValue <= stopLoss) {`,
        `        triggered = true;`,
        `        reason = \`STOP-LOSS hit (\${totalValue} <= \${stopLoss})\`;`,
        `      } else if (takeProfit > 0n && totalValue >= takeProfit) {`,
        `        triggered = true;`,
        `        reason = \`TAKE-PROFIT hit (\${totalValue} >= \${takeProfit})\`;`,
        `      } else if (trailingStopPct > 0 && peakValue > 0n) {`,
        `        const threshold = peakValue - (peakValue * BigInt(trailingStopPct)) / 100n;`,
        `        if (totalValue <= threshold) {`,
        `          triggered = true;`,
        `          reason = \`TRAILING STOP hit (\${totalValue} <= \${threshold}, peak was \${peakValue})\`;`,
        `        }`,
        `      }`,
        ``,
        `      if (!triggered) return;`,
        ``,
        `      console.log(\`\\n** \${reason} **\`);`,
        `      clearInterval(timer);`,
        ``,
        `      if (!autoExecute) {`,
        `        console.log("AUTO_EXECUTE is disabled. Manual action required.");`,
        `        return;`,
        `      }`,
        ``,
        `      // Auto-execute: sell all positions back to budget token`,
        `      console.log("Auto-executing exit trades...\\n");`,
        `      for (const pos of positions) {`,
        `        const balance = await getTokenBalance(pos.tokenOut, account.address);`,
        `        if (balance === 0n) {`,
        `          console.log(\`  Skipping \${pos.tokenOut} — zero balance\`);`,
        `          continue;`,
        `        }`,
        ``,
        `        console.log(\`  Selling \${balance} of \${pos.tokenOut} -> \${pos.tokenIn}\`);`,
        ``,
        `        // Get a quote for the reverse trade to calculate minAmountOut with slippage`,
        `        const expectedOut = await getQuote({`,
        `          tokenIn: pos.tokenOut,`,
        `          tokenOut: pos.tokenIn,`,
        `          amountIn: balance,`,
        `          poolFee: pos.poolFee,`,
        `        });`,
        `        const slippageBps = BigInt(process.env.MAX_SLIPPAGE_BPS ?? "100");`,
        `        const minOut = expectedOut - (expectedOut * slippageBps) / 10000n;`,
        ``,
        `        await executeSwap({`,
        `          tokenIn: pos.tokenOut,`,
        `          tokenOut: pos.tokenIn,`,
        `          amountIn: balance,`,
        `          minAmountOut: minOut,`,
        `          poolFee: pos.poolFee,`,
        `        });`,
        `      }`,
        ``,
        `      console.log("\\nAll positions closed. Bot shutting down.");`,
        `      process.exit(0);`,
        `    } catch (err) {`,
        `      console.error("Listener error:", err);`,
        `    }`,
        `  }, intervalSec * 1000);`,
        `}`,
      ].join("\n"),
      { name: `${prefix}/src/listener.ts` },
    );

    // ── src/dca.ts (investment mode only) ─────────────────
    if (isDCA) {
      archive.append(
        [
          `import { readFileSync, writeFileSync, existsSync } from "node:fs";`,
          `import type { Address } from "viem";`,
          `import { getClients, executeSwap, WETH } from "./helpers.js";`,
          ``,
          `interface Allocation {`,
          `  tokenAddress: string;`,
          `  symbol: string;`,
          `  targetPercent: number;`,
          `}`,
          ``,
          `interface DCAState {`,
          `  periodsCompleted: number;`,
          `  lastExecutedAt: number;`,
          `  totalSpent: Record<string, string>; // token -> amount spent (bigint string)`,
          `}`,
          ``,
          `const STATE_FILE = "./state.json";`,
          ``,
          `function loadState(): DCAState {`,
          `  if (existsSync(STATE_FILE)) {`,
          `    return JSON.parse(readFileSync(STATE_FILE, "utf-8"));`,
          `  }`,
          `  return { periodsCompleted: 0, lastExecutedAt: 0, totalSpent: {} };`,
          `}`,
          ``,
          `function saveState(state: DCAState) {`,
          `  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));`,
          `}`,
          ``,
          `const FREQ_MS: Record<string, number> = {`,
          `  daily: 24 * 60 * 60 * 1000,`,
          `  weekly: 7 * 24 * 60 * 60 * 1000,`,
          `  biweekly: 14 * 24 * 60 * 60 * 1000,`,
          `  monthly: 30 * 24 * 60 * 60 * 1000,`,
          `};`,
          ``,
          `export function startDCA(intervalSec: number) {`,
          `  const frequency = process.env.DCA_FREQUENCY ?? "weekly";`,
          `  const totalPeriods = parseInt(process.env.DCA_TOTAL_PERIODS ?? "52", 10);`,
          `  const amountPerPeriodPct = parseFloat(process.env.DCA_AMOUNT_PER_PERIOD_PERCENT ?? "0");`,
          `  const allocations: Allocation[] = JSON.parse(process.env.ALLOCATIONS ?? "[]");`,
          `  const budgetToken = process.env.TRADES`,
          `    ? (JSON.parse(process.env.TRADES)[0]?.tokenIn as Address)`,
          `    : WETH;`,
          ``,
          `  if (allocations.length === 0 || amountPerPeriodPct === 0) {`,
          `    console.log("DCA: No allocations or period amount configured. Skipping.");`,
          `    return;`,
          `  }`,
          ``,
          `  const periodIntervalMs = FREQ_MS[frequency] ?? FREQ_MS.weekly;`,
          `  const trades = JSON.parse(process.env.TRADES ?? "[]");`,
          `  // Use pool fees from trades where available, default 3000`,
          `  const feeByToken: Record<string, number> = {};`,
          `  for (const t of trades) {`,
          `    feeByToken[t.tokenOut.toLowerCase()] = t.poolFee;`,
          `  }`,
          ``,
          `  console.log(\`\\nDCA scheduler started\`);`,
          `  console.log(\`  Frequency: \${frequency} | Periods: \${totalPeriods}\`);`,
          `  console.log(\`  Allocations: \${allocations.map((a) => \`\${a.symbol}(\${a.targetPercent}%)\`).join(", ")}\`);`,
          ``,
          `  const checkInterval = setInterval(async () => {`,
          `    try {`,
          `      const state = loadState();`,
          ``,
          `      if (state.periodsCompleted >= totalPeriods) {`,
          `        console.log("DCA: All periods completed.");`,
          `        clearInterval(checkInterval);`,
          `        return;`,
          `      }`,
          ``,
          `      const now = Date.now();`,
          `      if (state.lastExecutedAt > 0 && now - state.lastExecutedAt < periodIntervalMs) {`,
          `        return; // Not yet time for next period`,
          `      }`,
          ``,
          `      console.log(\`\\nDCA period \${state.periodsCompleted + 1}/\${totalPeriods}\`);`,
          `      const { account } = getClients();`,
          ``,
          `      // Calculate total budget per period from the original budget and percentage`,
          `      const originalBudget = BigInt(trades[0]?.amountIn ?? "0");`,
          `      const periodBudget = (originalBudget * BigInt(Math.round(amountPerPeriodPct * 100))) / 10000n;`,
          ``,
          `      for (const alloc of allocations) {`,
          `        const allocAmount = (periodBudget * BigInt(alloc.targetPercent)) / 100n;`,
          `        if (allocAmount === 0n) continue;`,
          ``,
          `        const fee = feeByToken[alloc.tokenAddress.toLowerCase()] ?? 3000;`,
          `        console.log(\`  Buying \${alloc.symbol}: \${allocAmount} of \${budgetToken}\`);`,
          ``,
          `        await executeSwap({`,
          `          tokenIn: budgetToken as Address,`,
          `          tokenOut: alloc.tokenAddress as Address,`,
          `          amountIn: allocAmount,`,
          `          minAmountOut: 0n, // DCA accepts market price`,
          `          poolFee: fee,`,
          `        });`,
          ``,
          `        const prev = BigInt(state.totalSpent[alloc.tokenAddress] ?? "0");`,
          `        state.totalSpent[alloc.tokenAddress] = (prev + allocAmount).toString();`,
          `      }`,
          ``,
          `      state.periodsCompleted++;`,
          `      state.lastExecutedAt = now;`,
          `      saveState(state);`,
          `      console.log(\`  Period \${state.periodsCompleted} complete. State saved.\`);`,
          `    } catch (err) {`,
          `      console.error("DCA error:", err);`,
          `    }`,
          `  }, intervalSec * 1000);`,
          `}`,
        ].join("\n"),
        { name: `${prefix}/src/dca.ts` },
      );
    }

    // ── src/rebalancer.ts (investment mode only) ──────────
    if (hasRebalancing) {
      archive.append(
        [
          `import type { Address } from "viem";`,
          `import { getClients, getQuote, getTokenBalance, executeSwap, WETH } from "./helpers.js";`,
          ``,
          `interface Allocation {`,
          `  tokenAddress: string;`,
          `  symbol: string;`,
          `  targetPercent: number;`,
          `}`,
          ``,
          `const REBALANCE_FREQ_MS: Record<string, number> = {`,
          `  weekly: 7 * 24 * 60 * 60 * 1000,`,
          `  monthly: 30 * 24 * 60 * 60 * 1000,`,
          `  quarterly: 90 * 24 * 60 * 60 * 1000,`,
          `};`,
          ``,
          `export function startRebalancer(intervalSec: number) {`,
          `  const rebalanceType = process.env.REBALANCE_TYPE ?? "drift";`,
          `  const driftThreshold = parseInt(process.env.DRIFT_THRESHOLD_PERCENT ?? "5", 10);`,
          `  const rebalanceFreq = process.env.REBALANCE_FREQUENCY ?? "monthly";`,
          `  const allocations: Allocation[] = JSON.parse(process.env.ALLOCATIONS ?? "[]");`,
          `  const trades = JSON.parse(process.env.TRADES ?? "[]");`,
          ``,
          `  const budgetToken: Address = trades[0]?.tokenIn ?? WETH;`,
          `  const feeByToken: Record<string, number> = {};`,
          `  for (const t of trades) {`,
          `    feeByToken[t.tokenOut.toLowerCase()] = t.poolFee;`,
          `    feeByToken[t.tokenIn.toLowerCase()] = t.poolFee;`,
          `  }`,
          ``,
          `  if (allocations.length === 0) {`,
          `    console.log("Rebalancer: No allocations configured. Skipping.");`,
          `    return;`,
          `  }`,
          ``,
          `  let lastRebalance = 0;`,
          `  const freqMs = REBALANCE_FREQ_MS[rebalanceFreq] ?? REBALANCE_FREQ_MS.monthly;`,
          ``,
          `  console.log(\`\\nRebalancer started (type: \${rebalanceType})\`);`,
          `  if (rebalanceType === "drift") console.log(\`  Drift threshold: \${driftThreshold}%\`);`,
          `  if (rebalanceType === "calendar") console.log(\`  Frequency: \${rebalanceFreq}\`);`,
          ``,
          `  const timer = setInterval(async () => {`,
          `    try {`,
          `      const now = Date.now();`,
          ``,
          `      // Calendar check: skip if not enough time has passed`,
          `      if (rebalanceType === "calendar" && lastRebalance > 0 && now - lastRebalance < freqMs) {`,
          `        return;`,
          `      }`,
          ``,
          `      const { account } = getClients();`,
          ``,
          `      // Get current balances valued in budget token`,
          `      const holdings: Array<{`,
          `        alloc: Allocation;`,
          `        balance: bigint;`,
          `        valueBudget: bigint;`,
          `        fee: number;`,
          `      }> = [];`,
          `      let totalValue = 0n;`,
          ``,
          `      for (const alloc of allocations) {`,
          `        const token = alloc.tokenAddress as Address;`,
          `        const balance = await getTokenBalance(token, account.address);`,
          `        const fee = feeByToken[token.toLowerCase()] ?? 3000;`,
          ``,
          `        let valueBudget = 0n;`,
          `        if (balance > 0n) {`,
          `          valueBudget = await getQuote({`,
          `            tokenIn: token,`,
          `            tokenOut: budgetToken,`,
          `            amountIn: balance,`,
          `            poolFee: fee,`,
          `          });`,
          `        }`,
          ``,
          `        holdings.push({ alloc, balance, valueBudget, fee });`,
          `        totalValue += valueBudget;`,
          `      }`,
          ``,
          `      if (totalValue === 0n) return;`,
          ``,
          `      // Calculate drift for each position`,
          `      let maxDrift = 0;`,
          `      for (const h of holdings) {`,
          `        const currentPct = Number((h.valueBudget * 10000n) / totalValue) / 100;`,
          `        const drift = Math.abs(currentPct - h.alloc.targetPercent);`,
          `        if (drift > maxDrift) maxDrift = drift;`,
          `      }`,
          ``,
          `      // Drift check: skip if no position exceeds threshold`,
          `      if (rebalanceType === "drift" && maxDrift < driftThreshold) {`,
          `        return;`,
          `      }`,
          ``,
          `      console.log(\`\\nRebalancing (max drift: \${maxDrift.toFixed(2)}%, total value: \${totalValue})\`);`,
          ``,
          `      // Determine over/under-weight positions`,
          `      const overweight: Array<typeof holdings[0] & { excess: bigint }> = [];`,
          `      const underweight: Array<typeof holdings[0] & { deficit: bigint }> = [];`,
          ``,
          `      for (const h of holdings) {`,
          `        const targetValue = (totalValue * BigInt(h.alloc.targetPercent)) / 100n;`,
          `        if (h.valueBudget > targetValue) {`,
          `          overweight.push({ ...h, excess: h.valueBudget - targetValue });`,
          `        } else if (h.valueBudget < targetValue) {`,
          `          underweight.push({ ...h, deficit: targetValue - h.valueBudget });`,
          `        }`,
          `      }`,
          ``,
          `      // Sell overweight positions back to budget token`,
          `      for (const ow of overweight) {`,
          `        // Calculate token amount to sell proportional to excess value`,
          `        const sellAmount = (ow.balance * ow.excess) / ow.valueBudget;`,
          `        if (sellAmount === 0n) continue;`,
          ``,
          `        console.log(\`  Selling \${sellAmount} of \${ow.alloc.symbol} (excess: \${ow.excess})\`);`,
          `        await executeSwap({`,
          `          tokenIn: ow.alloc.tokenAddress as Address,`,
          `          tokenOut: budgetToken,`,
          `          amountIn: sellAmount,`,
          `          minAmountOut: 0n,`,
          `          poolFee: ow.fee,`,
          `        });`,
          `      }`,
          ``,
          `      // Buy underweight positions with budget token`,
          `      for (const uw of underweight) {`,
          `        if (uw.deficit === 0n) continue;`,
          ``,
          `        console.log(\`  Buying \${uw.alloc.symbol} for \${uw.deficit} of budget token\`);`,
          `        await executeSwap({`,
          `          tokenIn: budgetToken,`,
          `          tokenOut: uw.alloc.tokenAddress as Address,`,
          `          amountIn: uw.deficit,`,
          `          minAmountOut: 0n,`,
          `          poolFee: uw.fee,`,
          `        });`,
          `      }`,
          ``,
          `      lastRebalance = now;`,
          `      console.log("  Rebalancing complete.");`,
          `    } catch (err) {`,
          `      console.error("Rebalancer error:", err);`,
          `    }`,
          `  }, intervalSec * 1000);`,
          `}`,
        ].join("\n"),
        { name: `${prefix}/src/rebalancer.ts` },
      );
    }

    // ── src/index.ts ──────────────────────────────────────
    const indexLines = [
      `import "dotenv/config";`,
      `import { execute } from "./executor.js";`,
      `import { startListener } from "./listener.js";`,
    ];

    if (isDCA) {
      indexLines.push(`import { startDCA } from "./dca.js";`);
    }
    if (hasRebalancing) {
      indexLines.push(`import { startRebalancer } from "./rebalancer.js";`);
    }

    indexLines.push(
      ``,
      `async function main() {`,
      `  console.log("Trading Bot - Strategy ${strategy.id}");`,
      `  console.log("Mode: ${strategy.mode}");`,
      `  console.log("Market condition: ${strategy.analysis.marketCondition}");`,
      `  console.log("Confidence: ${strategy.analysis.confidence}%");`,
      `  console.log("Expected return: ${strategy.estimatedReturn.expected}%");`,
      `  console.log("");`,
      ``,
      `  const interval = parseInt(process.env.CHECK_INTERVAL ?? "60", 10);`,
      `  const mode = process.env.STRATEGY_MODE ?? "${strategy.mode}";`,
      `  const entryStrategy = process.env.ENTRY_STRATEGY ?? "${strategy.investmentPlan?.entryStrategy ?? "lump-sum"}";`,
    );

    if (isDCA) {
      indexLines.push(
        ``,
        `  if (mode === "investment" && entryStrategy === "dca") {`,
        `    console.log("Investment mode: DCA entry\\n");`,
        `    // DCA buys over time instead of immediate execution`,
        `    startDCA(interval);`,
        `    // Start listener for exit criteria`,
        `    startListener(interval);`,
      );
      if (hasRebalancing) {
        indexLines.push(
          `    // Start rebalancer`,
          `    startRebalancer(interval);`,
        );
      }
      indexLines.push(`  } else {`);
    } else {
      indexLines.push(``, `  {`);
    }

    indexLines.push(
      `    // Execute initial trades immediately`,
      `    await execute();`,
      `    // Start listener for stop-loss / take-profit / trailing-stop`,
      `    startListener(interval);`,
    );

    if (hasRebalancing && !isDCA) {
      indexLines.push(
        `    // Start rebalancer if in investment mode`,
        `    if (mode === "investment") {`,
        `      startRebalancer(interval);`,
        `    }`,
      );
    }

    indexLines.push(
      `  }`,
      `}`,
      ``,
      `main().catch((err) => {`,
      `  console.error("Fatal error:", err);`,
      `  process.exit(1);`,
      `});`,
    );

    archive.append(indexLines.join("\n"), { name: `${prefix}/src/index.ts` });

    // ── README.md ─────────────────────────────────────────
    const readmeLines = [
      `# Trading Bot - ${strategy.id}`,
      ``,
      `Auto-generated trading bot from TAL Trading Agent.`,
      ``,
      `## Strategy`,
      `- **Mode**: ${strategy.mode}`,
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
      `## Auto-Execution Listener`,
      ``,
      `The bot includes an auto-executing listener that monitors your positions and`,
      `triggers sell actions when conditions are met:`,
      ``,
      `- **Stop-loss**: Sells all positions when portfolio value drops below \`STOP_LOSS_PRICE\``,
      `- **Take-profit**: Sells all positions when portfolio value exceeds \`TAKE_PROFIT_PRICE\``,
      `- **Trailing stop**: Tracks peak portfolio value and sells if it drops by \`TRAILING_STOP_PERCENT\`% from the peak`,
      ``,
      `Set \`AUTO_EXECUTE=false\` in \`.env\` to disable auto-execution and only log triggers.`,
      ``,
    ];

    if (isInvestment) {
      readmeLines.push(
        `## Investment Mode`,
        ``,
        `This bot is configured for long-term investment with:`,
        ``,
      );
      if (isDCA) {
        readmeLines.push(
          `### DCA (Dollar Cost Averaging)`,
          ``,
          `Instead of buying everything at once, the bot spreads purchases over time:`,
          `- **Frequency**: \`DCA_FREQUENCY\` (${strategy.investmentPlan?.dcaSchedule?.frequency ?? "weekly"})`,
          `- **Total periods**: \`DCA_TOTAL_PERIODS\` (${strategy.investmentPlan?.dcaSchedule?.totalPeriods ?? 52})`,
          `- **Amount per period**: \`DCA_AMOUNT_PER_PERIOD_PERCENT\`% of original budget`,
          ``,
          `DCA state is persisted in \`state.json\` so the bot can be restarted safely.`,
          ``,
        );
      }
      if (hasRebalancing) {
        const rb = strategy.investmentPlan!.rebalancing!;
        readmeLines.push(
          `### Rebalancing`,
          ``,
          `The bot automatically rebalances your portfolio to maintain target allocations:`,
          `- **Type**: ${rb.type}`,
        );
        if (rb.type === "drift") {
          readmeLines.push(
            `- **Drift threshold**: ${rb.driftThresholdPercent ?? 5}% — rebalances when any position drifts beyond this`,
          );
        }
        if (rb.frequency) {
          readmeLines.push(`- **Frequency**: ${rb.frequency}`);
        }
        readmeLines.push(``);
      }
    }

    readmeLines.push(
      `## Risk`,
      `- Max drawdown: ${strategy.riskMetrics.maxDrawdown}%`,
      `- Position size: ${strategy.riskMetrics.positionSizePercent}%`,
      `- Stop-loss configured: Yes`,
      ``,
      `## Warning`,
      ``,
      `This bot executes real transactions with real funds. Running it requires a funded`,
      `wallet with your private key in the \`.env\` file. Review all settings carefully`,
      `before running. Use at your own risk.`,
      ``,
      `---`,
      `Generated by [TAL Trading Agent](https://github.com/tokamak-network)`,
    );

    archive.append(readmeLines.join("\n"), { name: `${prefix}/README.md` });

    archive.finalize();
  });
}
