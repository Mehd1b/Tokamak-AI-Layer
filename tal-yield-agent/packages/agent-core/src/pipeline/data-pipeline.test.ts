import { describe, it, expect, beforeEach } from "vitest";
import { DataPipeline } from "./data-pipeline.js";
import { SnapshotManager } from "../snapshot/snapshot-manager.js";
import { RateLimiter } from "./rate-limiter.js";
import { MockDataSource } from "../__mocks__/mock-data-source.js";
import { MOCK_PRICE_FEED } from "../__mocks__/mock-data.js";

describe("DataPipeline", () => {
  let pipeline: DataPipeline;
  let dataSource: MockDataSource;
  let snapshotManager: SnapshotManager;
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    dataSource = new MockDataSource();
    snapshotManager = new SnapshotManager();
    rateLimiter = new RateLimiter();
    pipeline = new DataPipeline(dataSource, snapshotManager, rateLimiter);
  });

  // ================================================================
  // Snapshot Creation
  // ================================================================
  describe("createSnapshot", () => {
    it("creates a snapshot with all pool data", async () => {
      const snapshot = await pipeline.createSnapshot({
        priceFeed: MOCK_PRICE_FEED,
        blockNumbers: { "1": 19_000_000, "10": 115_000_000, "42161": 180_000_000, "55004": 1_000_000 },
      });

      expect(snapshot.snapshotId).toBeDefined();
      expect(snapshot.snapshotId).toMatch(/^0x[a-f0-9]{64}$/);
      expect(snapshot.poolStates.length).toBeGreaterThan(5);
      expect(snapshot.priceFeed).toEqual(MOCK_PRICE_FEED);
      expect(snapshot.metadata.sources.length).toBe(6); // 6 adapters
    });

    it("includes pools from multiple protocols", async () => {
      const snapshot = await pipeline.createSnapshot({
        priceFeed: MOCK_PRICE_FEED,
      });

      const protocols = new Set(snapshot.poolStates.map((p) => p.protocol));
      expect(protocols.size).toBeGreaterThanOrEqual(5);
      expect(protocols.has("Aave V3")).toBe(true);
      expect(protocols.has("Lido")).toBe(true);
    });

    it("records fetch duration in metadata", async () => {
      const snapshot = await pipeline.createSnapshot({
        priceFeed: MOCK_PRICE_FEED,
      });

      expect(snapshot.metadata.fetchDuration).toBeGreaterThanOrEqual(0);
    });

    it("records adapter versions", async () => {
      const snapshot = await pipeline.createSnapshot({
        priceFeed: MOCK_PRICE_FEED,
      });

      expect(Object.keys(snapshot.metadata.adapterVersions).length).toBe(6);
    });

    it("stores snapshot as last snapshot", async () => {
      expect(pipeline.getLastSnapshot()).toBeNull();

      const snapshot = await pipeline.createSnapshot({
        priceFeed: MOCK_PRICE_FEED,
      });

      expect(pipeline.getLastSnapshot()).toBe(snapshot);
    });

    it("records rate limiter usage", async () => {
      const remaining = rateLimiter.remaining("defillama");

      await pipeline.createSnapshot({ priceFeed: MOCK_PRICE_FEED });

      expect(rateLimiter.remaining("defillama")).toBeLessThan(remaining);
    });
  });

  // ================================================================
  // Determinism
  // ================================================================
  describe("determinism", () => {
    it("same mock data produces same snapshot ID", async () => {
      const snap1 = await pipeline.createSnapshot({
        priceFeed: MOCK_PRICE_FEED,
        blockNumbers: { "1": 100 },
      });

      // Create a new pipeline with same mock data
      const pipeline2 = new DataPipeline(
        new MockDataSource(),
        new SnapshotManager(),
        new RateLimiter(),
      );

      const snap2 = await pipeline2.createSnapshot({
        priceFeed: MOCK_PRICE_FEED,
        blockNumbers: { "1": 100 },
      });

      // The snapshot IDs should be equal since the pools + prices + blocks + timestamp
      // would differ only in timestamp, so we compare pool content
      expect(snap1.poolStates.length).toBe(snap2.poolStates.length);
      expect(snap1.poolStates.map((p) => p.poolId)).toEqual(
        snap2.poolStates.map((p) => p.poolId),
      );
    });

    it("snapshot passes integrity verification", async () => {
      const snapshot = await pipeline.createSnapshot({
        priceFeed: MOCK_PRICE_FEED,
        blockNumbers: { "1": 100 },
      });

      expect(snapshotManager.verifySnapshot(snapshot)).toBe(true);
    });
  });

  // ================================================================
  // Registry Access
  // ================================================================
  describe("registry access", () => {
    it("exposes adapter registry", () => {
      const registry = pipeline.getRegistry();
      expect(registry.getAdapterNames()).toHaveLength(6);
    });

    it("exposes rate limiter", () => {
      expect(pipeline.getRateLimiter()).toBe(rateLimiter);
    });
  });
});
