import pino from "pino";
import { DEFILLAMA } from "@tal-trading-agent/shared";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
const logger = pino({ name: "historical-data-loader" });
const CACHE_DIR = ".backtest-cache";
/** Interval in seconds for resampling */
const INTERVAL_SECONDS = {
    "1h": 3600,
    "4h": 14400,
    "1d": 86400,
};
export class HistoricalDataLoader {
    cacheDir;
    constructor(basePath = process.cwd()) {
        this.cacheDir = join(basePath, CACHE_DIR);
    }
    /**
     * Load price bars for a token over a date range at a given interval.
     * Uses disk cache to avoid repeated API calls.
     */
    async loadPrices(token, startDate, endDate, interval) {
        const cacheKey = this.getCacheKey(token, startDate, endDate);
        const cached = await this.loadFromCache(cacheKey);
        if (cached) {
            logger.info({ token, bars: cached.length }, "Loaded prices from cache");
            return this.resample(cached, interval);
        }
        const raw = await this.fetchFromDeFiLlama(token, startDate, endDate);
        if (raw.length === 0) {
            logger.warn({ token }, "No price data fetched");
            return [];
        }
        await this.saveToCache(cacheKey, raw);
        logger.info({ token, bars: raw.length }, "Fetched and cached price data");
        return this.resample(raw, interval);
    }
    /**
     * Fetch price data from DeFiLlama chart endpoint.
     * Uses `start` (unix timestamp) + `period` (sampling interval like "1d")
     * + `span` (max points) + `searchWidth` (tolerance in seconds).
     */
    async fetchFromDeFiLlama(token, startDate, endDate) {
        const coinId = `ethereum:${token}`;
        const startTs = Math.floor(startDate.getTime() / 1000);
        const endTs = Math.floor(endDate.getTime() / 1000);
        const durationDays = Math.ceil((endTs - startTs) / 86400);
        // `period` is the sampling interval (time between data points)
        // `span` is the max number of data points to return
        const span = durationDays + 1;
        const url = `${DEFILLAMA.chartUrl}/${encodeURIComponent(coinId)}?start=${startTs}&span=${span}&period=1d&searchWidth=600`;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
                if (!response.ok) {
                    logger.warn({ token, status: response.status, attempt }, "DeFiLlama chart request failed");
                    if (attempt < 2)
                        await this.delay(1000 * (attempt + 1));
                    continue;
                }
                const data = (await response.json());
                const points = data.coins?.[coinId]?.prices;
                if (!points || points.length === 0) {
                    logger.warn({ token }, "Chart response empty");
                    if (attempt < 2)
                        await this.delay(1000 * (attempt + 1));
                    continue;
                }
                // Sort ascending and filter to our date range
                const sorted = [...points]
                    .sort((a, b) => a.timestamp - b.timestamp)
                    .filter((p) => p.timestamp >= startTs && p.timestamp <= endTs && p.price > 0);
                return sorted.map((p) => ({ timestamp: p.timestamp, price: p.price }));
            }
            catch (error) {
                logger.warn({ token, attempt, error: error instanceof Error ? error.message : error }, "Chart fetch attempt failed");
                if (attempt < 2)
                    await this.delay(1000 * (attempt + 1));
            }
        }
        return [];
    }
    /**
     * Resample raw price bars to the desired interval.
     * Takes the last price in each interval bucket.
     */
    resample(bars, interval) {
        if (bars.length === 0)
            return [];
        const intervalSec = INTERVAL_SECONDS[interval];
        const result = [];
        // Group bars into interval buckets
        let bucketStart = Math.floor(bars[0].timestamp / intervalSec) * intervalSec;
        let lastBarInBucket = null;
        for (const bar of bars) {
            const barBucket = Math.floor(bar.timestamp / intervalSec) * intervalSec;
            if (barBucket !== bucketStart) {
                // New bucket — push the last bar from previous bucket
                if (lastBarInBucket) {
                    result.push({ timestamp: bucketStart, price: lastBarInBucket.price });
                }
                bucketStart = barBucket;
            }
            lastBarInBucket = bar;
        }
        // Don't forget the last bucket
        if (lastBarInBucket) {
            result.push({ timestamp: bucketStart, price: lastBarInBucket.price });
        }
        return result;
    }
    // ── Cache Methods ─────────────────────────────────────
    getCacheKey(token, startDate, endDate) {
        const start = startDate.toISOString().slice(0, 10);
        const end = endDate.toISOString().slice(0, 10);
        return `${token.toLowerCase()}_${start}_${end}.json`;
    }
    async loadFromCache(key) {
        const path = join(this.cacheDir, key);
        try {
            if (!existsSync(path))
                return null;
            const content = await readFile(path, "utf-8");
            return JSON.parse(content);
        }
        catch {
            return null;
        }
    }
    async saveToCache(key, bars) {
        try {
            if (!existsSync(this.cacheDir)) {
                await mkdir(this.cacheDir, { recursive: true });
            }
            const path = join(this.cacheDir, key);
            await writeFile(path, JSON.stringify(bars), "utf-8");
        }
        catch (error) {
            logger.warn({ error }, "Failed to save to cache");
        }
    }
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
//# sourceMappingURL=HistoricalDataLoader.js.map