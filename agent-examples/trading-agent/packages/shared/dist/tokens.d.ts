import type { Address } from "viem";
export type TokenCategory = "wrapped" | "stablecoin" | "liquid-staking" | "blue-chip-defi" | "defi-infrastructure" | "l2-infrastructure" | "oracle-data" | "ai-data" | "gaming-metaverse" | "meme" | "rwa" | "other";
export interface TokenMeta {
    address: Address;
    symbol: string;
    name: string;
    decimals: number;
    category: TokenCategory;
    isDefault: boolean;
}
export declare const TOKEN_REGISTRY: TokenMeta[];
/** Backward-compatible TOKENS record (symbol -> address) */
export declare const TOKENS: Record<string, Address>;
export declare const WETH_ADDRESS: Address;
export declare const USDT_ADDRESS: Address;
export declare const USDT_DECIMALS = 6;
export declare function getTokensByCategory(category: TokenCategory): TokenMeta[];
export declare function getDefaultTokens(): TokenMeta[];
export declare function getTokenMeta(address: Address): TokenMeta | undefined;
export declare function getTokenBySymbol(symbol: string): TokenMeta | undefined;
//# sourceMappingURL=tokens.d.ts.map