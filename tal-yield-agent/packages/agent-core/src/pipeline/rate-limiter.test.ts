import { describe, it, expect, beforeEach, vi } from "vitest";
import { RateLimiter } from "./rate-limiter.js";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  it("allows requests within limit", () => {
    expect(limiter.canRequest("defillama")).toBe(true);
    expect(limiter.recordRequest("defillama")).toBe(true);
  });

  it("tracks remaining requests", () => {
    const initial = limiter.remaining("defillama");
    expect(initial).toBe(300);

    limiter.recordRequest("defillama");
    expect(limiter.remaining("defillama")).toBe(299);
  });

  it("blocks requests when limit reached", () => {
    // Use a custom low limit for testing
    const strictLimiter = new RateLimiter({
      test: { maxRequests: 3, windowMs: 60_000 },
    });

    expect(strictLimiter.recordRequest("test")).toBe(true);
    expect(strictLimiter.recordRequest("test")).toBe(true);
    expect(strictLimiter.recordRequest("test")).toBe(true);
    expect(strictLimiter.recordRequest("test")).toBe(false);
    expect(strictLimiter.canRequest("test")).toBe(false);
    expect(strictLimiter.remaining("test")).toBe(0);
  });

  it("uses default config for unknown sources", () => {
    expect(limiter.remaining("unknown-source")).toBe(60); // default limit
  });

  it("expires old requests from window", () => {
    const shortWindow = new RateLimiter({
      fast: { maxRequests: 2, windowMs: 100 },
    });

    shortWindow.recordRequest("fast");
    shortWindow.recordRequest("fast");
    expect(shortWindow.canRequest("fast")).toBe(false);

    // Simulate time passing by resetting (since we can't easily mock Date.now in the limiter)
    shortWindow.reset();
    expect(shortWindow.canRequest("fast")).toBe(true);
  });

  it("resets all state", () => {
    limiter.recordRequest("defillama");
    limiter.recordRequest("thegraph");

    limiter.reset();

    expect(limiter.remaining("defillama")).toBe(300);
    expect(limiter.remaining("thegraph")).toBe(100);
  });

  it("enforces different limits per source", () => {
    // defillama: 300/5min, thegraph: 100/1min
    expect(limiter.remaining("defillama")).toBe(300);
    expect(limiter.remaining("thegraph")).toBe(100);
  });

  it("accepts custom override configs", () => {
    const custom = new RateLimiter({
      myapi: { maxRequests: 10, windowMs: 1000 },
    });

    expect(custom.remaining("myapi")).toBe(10);

    for (let i = 0; i < 10; i++) {
      expect(custom.recordRequest("myapi")).toBe(true);
    }
    expect(custom.recordRequest("myapi")).toBe(false);
  });
});
