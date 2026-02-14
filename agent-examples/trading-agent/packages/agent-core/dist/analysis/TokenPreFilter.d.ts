import type { Address, PublicClient } from "viem";
import type { TokenMeta } from "@tal-trading-agent/shared";
export declare class TokenPreFilter {
    private readonly client;
    constructor(client: PublicClient);
    preFilter(allTokens: TokenMeta[], quoteToken: Address, options: {
        riskTolerance: string;
        prompt: string;
        maxCandidates?: number;
    }): Promise<Address[]>;
    private batchPriceCheck;
    private batchPoolCheck;
}
//# sourceMappingURL=TokenPreFilter.d.ts.map