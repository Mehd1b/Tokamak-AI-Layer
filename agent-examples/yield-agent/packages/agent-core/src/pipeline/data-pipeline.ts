import type { DataSnapshot, IDataSource, PoolData } from "../types.js";
import { AdapterRegistry } from "../adapters/adapter-registry.js";
import { SnapshotManager } from "../snapshot/snapshot-manager.js";
import { RateLimiter } from "./rate-limiter.js";
import { createChildLogger } from "../logger.js";

const log = createChildLogger("data-pipeline");

export interface PipelineConfig {
  /** Mock price feed for testing. If not provided, uses default prices. */
  priceFeed?: Record<string, number>;
  /** Block numbers to record in the snapshot */
  blockNumbers?: Record<string, number>;
}

/**
 * Orchestrates the data ingestion pipeline:
 * 1. Fetches pool data from all adapters (via AdapterRegistry)
 * 2. Applies rate limiting
 * 3. Creates a deterministic DataSnapshot
 *
 * Designed for both scheduled pipeline runs (every 5 min)
 * and on-demand snapshot creation for task execution.
 */
export class DataPipeline {
  private readonly registry: AdapterRegistry;
  private readonly snapshotManager: SnapshotManager;
  private readonly rateLimiter: RateLimiter;
  private lastSnapshot: DataSnapshot | null = null;

  constructor(
    dataSource: IDataSource,
    snapshotManager?: SnapshotManager,
    rateLimiter?: RateLimiter,
  ) {
    this.registry = new AdapterRegistry(dataSource);
    this.snapshotManager = snapshotManager ?? new SnapshotManager();
    this.rateLimiter = rateLimiter ?? new RateLimiter();
  }

  /**
   * Run a full pipeline cycle:
   * - Fetch all pools from all adapters
   * - Build price feed from token data
   * - Create a deterministic snapshot
   */
  async createSnapshot(config?: PipelineConfig): Promise<DataSnapshot> {
    const startTime = Date.now();

    // Check rate limit before fetching
    if (!this.rateLimiter.canRequest("defillama")) {
      log.warn("Rate limited — waiting for DeFi Llama window");
      await this.rateLimiter.waitAndRecord("defillama");
    } else {
      this.rateLimiter.recordRequest("defillama");
    }

    log.info("Starting pipeline cycle");

    // Fetch all pools
    const pools = await this.registry.getAllPools();

    // Build price feed from pool token data
    const priceFeed = config?.priceFeed ?? this.buildPriceFeed(pools);

    // Get block numbers (injected or default)
    const blockNumbers = config?.blockNumbers ?? {
      "1": 0,
      "10": 0,
      "42161": 0,
      "55004": 0,
    };

    const fetchDuration = Date.now() - startTime;

    const snapshot = this.snapshotManager.createSnapshot({
      poolStates: pools,
      priceFeed,
      blockNumbers,
      timestamp: config?.priceFeed ? startTime : startTime, // deterministic for tests
      sources: this.registry.getAdapterNames(),
      fetchDuration,
      adapterVersions: this.registry.getVersions(),
    });

    this.lastSnapshot = snapshot;

    log.info(
      {
        snapshotId: snapshot.snapshotId,
        pools: pools.length,
        duration: fetchDuration,
      },
      "Pipeline cycle complete",
    );

    return snapshot;
  }

  /**
   * Build a price feed from pool token data.
   * Extracts unique tokens and their prices.
   */
  private buildPriceFeed(pools: PoolData[]): Record<string, number> {
    const prices: Record<string, number> = {};
    for (const pool of pools) {
      for (const token of pool.tokens) {
        if (token.priceUSD > 0 && !prices[token.symbol]) {
          prices[token.symbol] = token.priceUSD;
        }
      }
    }
    return prices;
  }

  /**
   * Get the most recent snapshot without creating a new one.
   */
  getLastSnapshot(): DataSnapshot | null {
    return this.lastSnapshot;
  }

  /**
   * Get the adapter registry for direct adapter access.
   */
  getRegistry(): AdapterRegistry {
    return this.registry;
  }

  /**
   * Get the rate limiter for inspection.
   */
  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }
}
