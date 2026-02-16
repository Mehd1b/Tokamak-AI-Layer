import { type Address } from "viem";
interface ParsedBudget {
    /** Budget in smallest unit of the budget token */
    wei: bigint;
    /** The token address the budget is denominated in */
    token: Address;
    /** Human-readable description for logging */
    description: string;
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
export declare function inferBudgetFromPrompt(prompt: string): Promise<ParsedBudget | undefined>;
export {};
//# sourceMappingURL=budgetParser.d.ts.map