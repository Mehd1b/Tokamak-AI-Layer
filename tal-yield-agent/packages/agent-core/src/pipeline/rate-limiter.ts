import { createChildLogger } from "../logger.js";

const log = createChildLogger("rate-limiter");

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

/**
 * Token-bucket rate limiter that enforces API rate limits.
 * Tracks requests per source and queues excess calls.
 */
export class RateLimiter {
  private readonly windows: Map<string, number[]> = new Map();
  private readonly configs: Map<string, RateLimitConfig> = new Map();

  /** Default configs per source */
  private static readonly DEFAULTS: Record<string, RateLimitConfig> = {
    "defillama": { maxRequests: 300, windowMs: 5 * 60 * 1000 },
    "thegraph": { maxRequests: 100, windowMs: 60 * 1000 },
    "default": { maxRequests: 60, windowMs: 60 * 1000 },
  };

  constructor(overrides?: Record<string, RateLimitConfig>) {
    for (const [name, config] of Object.entries(RateLimiter.DEFAULTS)) {
      this.configs.set(name, config);
    }
    if (overrides) {
      for (const [name, config] of Object.entries(overrides)) {
        this.configs.set(name, config);
      }
    }
  }

  private getConfig(source: string): RateLimitConfig {
    return this.configs.get(source) ?? this.configs.get("default")!;
  }

  private cleanWindow(source: string, now: number): number[] {
    const config = this.getConfig(source);
    const window = this.windows.get(source) ?? [];
    const cutoff = now - config.windowMs;
    const cleaned = window.filter((ts) => ts > cutoff);
    this.windows.set(source, cleaned);
    return cleaned;
  }

  /**
   * Check if a request can be made to the given source.
   */
  canRequest(source: string): boolean {
    const now = Date.now();
    const window = this.cleanWindow(source, now);
    const config = this.getConfig(source);
    return window.length < config.maxRequests;
  }

  /**
   * Record a request to the given source.
   * Returns true if the request was allowed, false if rate limited.
   */
  recordRequest(source: string): boolean {
    const now = Date.now();
    const window = this.cleanWindow(source, now);
    const config = this.getConfig(source);

    if (window.length >= config.maxRequests) {
      log.warn({ source, current: window.length, max: config.maxRequests }, "Rate limited");
      return false;
    }

    window.push(now);
    return true;
  }

  /**
   * Wait until a request can be made, then record it.
   * Returns the wait time in ms (0 if immediately available).
   */
  async waitAndRecord(source: string): Promise<number> {
    const now = Date.now();
    const window = this.cleanWindow(source, now);
    const config = this.getConfig(source);

    if (window.length < config.maxRequests) {
      window.push(Date.now());
      return 0;
    }

    // Calculate when the oldest request will expire
    const oldest = window[0]!;
    const waitMs = oldest + config.windowMs - now + 1;

    log.info({ source, waitMs }, "Waiting for rate limit window");
    await new Promise((resolve) => setTimeout(resolve, waitMs));

    // Clean and record after waiting
    this.cleanWindow(source, Date.now());
    const updatedWindow = this.windows.get(source) ?? [];
    updatedWindow.push(Date.now());
    return waitMs;
  }

  /**
   * Get remaining requests for a source.
   */
  remaining(source: string): number {
    const window = this.cleanWindow(source, Date.now());
    const config = this.getConfig(source);
    return Math.max(0, config.maxRequests - window.length);
  }

  /**
   * Reset all rate limit state.
   */
  reset(): void {
    this.windows.clear();
  }
}
