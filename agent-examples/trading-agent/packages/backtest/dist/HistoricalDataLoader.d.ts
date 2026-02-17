import type { Address } from "viem";
import type { PriceBar, BarInterval } from "./types.js";
export declare class HistoricalDataLoader {
    private readonly cacheDir;
    constructor(basePath?: string);
    /**
     * Load price bars for a token over a date range at a given interval.
     * Uses disk cache to avoid repeated API calls.
     */
    loadPrices(token: Address, startDate: Date, endDate: Date, interval: BarInterval): Promise<PriceBar[]>;
    /**
     * Fetch price data from DeFiLlama chart endpoint.
     * Uses `start` (unix timestamp) + `period` (sampling interval like "1d")
     * + `span` (max points) + `searchWidth` (tolerance in seconds).
     */
    private fetchFromDeFiLlama;
    /**
     * Resample raw price bars to the desired interval.
     * Takes the last price in each interval bucket.
     */
    private resample;
    private getCacheKey;
    private loadFromCache;
    private saveToCache;
    private delay;
}
//# sourceMappingURL=HistoricalDataLoader.d.ts.map