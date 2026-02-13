import { type Address } from "viem";
interface ParsedBudget {
    /** Budget in wei (of the budget token) */
    wei: bigint;
    /** The token address the budget is denominated in */
    token: Address;
    /** Human-readable description for logging */
    description: string;
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
export declare function inferBudgetFromPrompt(prompt: string): Promise<ParsedBudget | undefined>;
export {};
//# sourceMappingURL=budgetParser.d.ts.map