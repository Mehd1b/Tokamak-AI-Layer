import { DEFILLAMA, TOKENS } from "@tal-trading-agent/shared";
import { parseEther, type Address } from "viem";

interface ParsedBudget {
  /** Budget in wei (of the budget token) */
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
    const coinId = `ethereum:${TOKENS.WETH}`;
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
 * Supported patterns:
 *   - USD amounts:  "$50", "$1,000", "$100k", "$1.5M", "50 dollars", "100 USD"
 *   - ETH amounts:  "0.5 ETH", "1 ETH", "2 WETH", "0.025 ether"
 *
 * For USD amounts, fetches the current ETH price from DeFiLlama
 * and converts to wei (WETH).
 *
 * Returns undefined if no budget pattern is found in the prompt.
 */
export async function inferBudgetFromPrompt(
  prompt: string,
): Promise<ParsedBudget | undefined> {
  const text = prompt.toLowerCase();

  // ── Try ETH/WETH amounts first (no price lookup needed) ──

  // Patterns: "0.5 ETH", "1 eth", "2 WETH", "0.025 ether"
  const ethRegex = /(\d+(?:\.\d+)?)\s*(?:eth|weth|ether)\b/i;
  const ethMatch = ethRegex.exec(text);
  if (ethMatch) {
    const ethAmount = ethMatch[1]!;
    const wei = parseEther(ethAmount);
    return {
      wei,
      token: TOKENS.WETH,
      description: `${ethAmount} ETH`,
    };
  }

  // ── Try USD amounts ──

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

  // Fetch ETH price and convert
  const ethPrice = await fetchEthPriceUsd();
  if (ethPrice <= 0) return undefined; // can't convert without a price

  const ethAmount = usdAmount / ethPrice;
  // Convert to wei with 18 decimal precision (cap at 18 decimals)
  const ethString = ethAmount.toFixed(18);
  const wei = parseEther(ethString);

  if (wei <= 0n) return undefined;

  return {
    wei,
    token: TOKENS.WETH,
    description: `$${usdAmount} ≈ ${ethAmount.toFixed(6)} ETH (@ $${ethPrice.toFixed(2)}/ETH)`,
  };
}
