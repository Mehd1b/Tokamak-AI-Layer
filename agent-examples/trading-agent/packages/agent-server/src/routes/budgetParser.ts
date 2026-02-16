import { DEFILLAMA, WETH_ADDRESS, USDT_ADDRESS, USDT_DECIMALS } from "@tal-trading-agent/shared";
import { parseEther, parseUnits, type Address } from "viem";

interface ParsedBudget {
  /** Budget in smallest unit of the budget token */
  wei: bigint;
  /** The token address the budget is denominated in */
  token: Address;
  /** Human-readable description for logging */
  description: string;
}

/**
 * Fetch the current ETH price in USD via DeFiLlama.
 * Returns 0 on failure (caller should fall back to default).
 */
async function fetchEthPriceUsd(): Promise<number> {
  try {
    const coinId = `ethereum:${WETH_ADDRESS}`;
    const url = `${DEFILLAMA.pricesUrl}/${encodeURIComponent(coinId)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return 0;
    const data = (await response.json()) as {
      coins: Record<string, { price: number }>;
    };
    return data.coins[coinId]?.price ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Infer the budget from a natural language prompt.
 *
 * The default budget token is USDT (6 decimals).
 *
 * Supported patterns:
 *   - USD/USDT amounts:  "$50", "$1,000", "$100k", "$1.5M", "50 dollars",
 *                        "100 USD", "500 USDT", "1000 USDT"
 *   - ETH amounts:       "0.5 ETH", "1 ETH", "2 WETH", "0.025 ether"
 *                        (converted to USDT equivalent via DeFiLlama)
 *
 * Returns undefined if no budget pattern is found in the prompt.
 */
export async function inferBudgetFromPrompt(
  prompt: string,
): Promise<ParsedBudget | undefined> {
  const text = prompt.toLowerCase();

  // ── Try USDT amounts first (direct, no price lookup) ──

  // Patterns: "500 USDT", "1000 usdt"
  const usdtRegex = /(\d+(?:\.\d+)?)\s*usdt\b/i;
  const usdtMatch = usdtRegex.exec(text);
  if (usdtMatch) {
    const amount = usdtMatch[1]!;
    const wei = parseUnits(amount, USDT_DECIMALS);
    return {
      wei,
      token: USDT_ADDRESS,
      description: `${amount} USDT`,
    };
  }

  // ── Try ETH/WETH amounts (convert to USDT via price) ──

  // Patterns: "0.5 ETH", "1 eth", "2 WETH", "0.025 ether"
  const ethRegex = /(\d+(?:\.\d+)?)\s*(?:eth|weth|ether)\b/i;
  const ethMatch = ethRegex.exec(text);
  if (ethMatch) {
    const ethAmount = parseFloat(ethMatch[1]!);
    const ethPrice = await fetchEthPriceUsd();
    if (ethPrice <= 0) {
      // Can't convert — fall back to a reasonable USDT equivalent
      const fallbackUsdt = ethAmount * 2000; // rough estimate
      const wei = parseUnits(fallbackUsdt.toFixed(USDT_DECIMALS), USDT_DECIMALS);
      return {
        wei,
        token: USDT_ADDRESS,
        description: `${ethMatch[1]} ETH ≈ ${fallbackUsdt.toFixed(2)} USDT (estimated)`,
      };
    }
    const usdtAmount = ethAmount * ethPrice;
    const wei = parseUnits(usdtAmount.toFixed(USDT_DECIMALS), USDT_DECIMALS);
    return {
      wei,
      token: USDT_ADDRESS,
      description: `${ethMatch[1]} ETH ≈ ${usdtAmount.toFixed(2)} USDT (@ $${ethPrice.toFixed(2)}/ETH)`,
    };
  }

  // ── Try USD amounts (map directly to USDT) ──

  let usdAmount: number | undefined;

  // Pattern: "$50", "$1,000", "$100.50", "$1.5k", "$2M"
  const dollarSignRegex = /\$\s?([\d,]+(?:\.\d+)?)\s*([km])?/i;
  const dollarMatch = dollarSignRegex.exec(text);
  if (dollarMatch) {
    const raw = dollarMatch[1]!.replace(/,/g, "");
    usdAmount = parseFloat(raw);
    const suffix = dollarMatch[2]?.toLowerCase();
    if (suffix === "k") usdAmount *= 1_000;
    if (suffix === "m") usdAmount *= 1_000_000;
  }

  // Pattern: "50 dollars", "1000 usd", "100 bucks"
  if (usdAmount === undefined) {
    const wordRegex = /([\d,]+(?:\.\d+)?)\s*(?:dollars?|usd|bucks?)\b/i;
    const wordMatch = wordRegex.exec(text);
    if (wordMatch) {
      usdAmount = parseFloat(wordMatch[1]!.replace(/,/g, ""));
    }
  }

  if (usdAmount === undefined || usdAmount <= 0) return undefined;

  // Map directly to USDT (1:1 with USD)
  const wei = parseUnits(usdAmount.toFixed(USDT_DECIMALS), USDT_DECIMALS);

  if (wei <= 0n) return undefined;

  return {
    wei,
    token: USDT_ADDRESS,
    description: `$${usdAmount} = ${usdAmount} USDT`,
  };
}
