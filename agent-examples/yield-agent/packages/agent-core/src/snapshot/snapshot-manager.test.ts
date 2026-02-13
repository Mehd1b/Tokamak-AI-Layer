import { describe, it, expect, beforeEach } from "vitest";
import { SnapshotManager } from "./snapshot-manager.js";
import { EXPECTED_AAVE_POOL, MOCK_PRICE_FEED } from "../__mocks__/mock-data.js";
import type { PoolData, IIPFSStorage, DataSnapshot } from "../types.js";
import { DataSnapshotSchema } from "../types.js";
import { z } from "zod";

// ================================================================
// Mock IPFS Storage
// ================================================================
class MockIPFSStorage implements IIPFSStorage {
  private store: Map<string, unknown> = new Map();

  async pin(data: unknown): Promise<string> {
    const cid = `QmMock${Date.now()}`;
    this.store.set(cid, data);
    return cid;
  }

  async get<T>(cid: string, schema: z.ZodType<T>): Promise<T> {
    const data = this.store.get(cid);
    if (!data) throw new Error(`CID not found: ${cid}`);
    return schema.parse(data);
  }
}

// ================================================================
// Tests
// ================================================================
describe("SnapshotManager", () => {
  let manager: SnapshotManager;
  let pools: PoolData[];

  beforeEach(() => {
    manager = new SnapshotManager();
    pools = [
      EXPECTED_AAVE_POOL,
      {
        ...EXPECTED_AAVE_POOL,
        poolId: "compound-v3-eth-usdc",
        protocol: "Compound V3",
        currentAPY: 3.12,
        tvl: 1_800_000_000,
      },
    ];
  });

  // ================================================================
  // Snapshot Creation
  // ================================================================
  describe("createSnapshot", () => {
    it("creates a valid snapshot", () => {
      const snapshot = manager.createSnapshot({
        poolStates: pools,
        priceFeed: MOCK_PRICE_FEED,
        blockNumbers: { "1": 19_000_000, "10": 115_000_000 },
        timestamp: 1700000000000,
        sources: ["Aave V3", "Compound V3"],
        fetchDuration: 1500,
        adapterVersions: { "Aave V3": "1.0.0", "Compound V3": "1.0.0" },
      });

      expect(snapshot.snapshotId).toBeDefined();
      expect(snapshot.snapshotId).toMatch(/^0x[a-f0-9]{64}$/);
      expect(snapshot.timestamp).toBe(1700000000000);
      expect(snapshot.poolStates).toHaveLength(2);
      expect(snapshot.priceFeed).toEqual(MOCK_PRICE_FEED);
      expect(snapshot.metadata.sources).toEqual(["Aave V3", "Compound V3"]);
      expect(snapshot.metadata.fetchDuration).toBe(1500);
    });

    it("validates with Zod schema", () => {
      const snapshot = manager.createSnapshot({
        poolStates: pools,
        priceFeed: MOCK_PRICE_FEED,
        blockNumbers: { "1": 19_000_000 },
        timestamp: 1700000000000,
        sources: ["test"],
        fetchDuration: 100,
        adapterVersions: {},
      });

      const result = DataSnapshotSchema.safeParse(snapshot);
      expect(result.success).toBe(true);
    });

    it("sorts pools deterministically", () => {
      const poolsReversed = [...pools].reverse();

      const snap1 = manager.createSnapshot({
        poolStates: pools,
        priceFeed: MOCK_PRICE_FEED,
        blockNumbers: { "1": 100 },
        timestamp: 1000,
        sources: [],
        fetchDuration: 0,
        adapterVersions: {},
      });

      const snap2 = manager.createSnapshot({
        poolStates: poolsReversed,
        priceFeed: MOCK_PRICE_FEED,
        blockNumbers: { "1": 100 },
        timestamp: 1000,
        sources: [],
        fetchDuration: 0,
        adapterVersions: {},
      });

      expect(snap1.snapshotId).toBe(snap2.snapshotId);
    });

    it("sorts price feed keys deterministically", () => {
      const pricesA = { ETH: 3200, USDC: 1, BTC: 62000 };
      const pricesB = { BTC: 62000, ETH: 3200, USDC: 1 };

      const snap1 = manager.createSnapshot({
        poolStates: pools,
        priceFeed: pricesA,
        blockNumbers: {},
        timestamp: 1000,
        sources: [],
        fetchDuration: 0,
        adapterVersions: {},
      });

      const snap2 = manager.createSnapshot({
        poolStates: pools,
        priceFeed: pricesB,
        blockNumbers: {},
        timestamp: 1000,
        sources: [],
        fetchDuration: 0,
        adapterVersions: {},
      });

      expect(snap1.snapshotId).toBe(snap2.snapshotId);
    });

    it("produces different IDs for different data", () => {
      const snap1 = manager.createSnapshot({
        poolStates: pools,
        priceFeed: MOCK_PRICE_FEED,
        blockNumbers: {},
        timestamp: 1000,
        sources: [],
        fetchDuration: 0,
        adapterVersions: {},
      });

      const snap2 = manager.createSnapshot({
        poolStates: pools,
        priceFeed: { ...MOCK_PRICE_FEED, ETH: 9999 },
        blockNumbers: {},
        timestamp: 1000,
        sources: [],
        fetchDuration: 0,
        adapterVersions: {},
      });

      expect(snap1.snapshotId).not.toBe(snap2.snapshotId);
    });
  });

  // ================================================================
  // Snapshot Verification
  // ================================================================
  describe("verifySnapshot", () => {
    it("verifies a valid snapshot", () => {
      const snapshot = manager.createSnapshot({
        poolStates: pools,
        priceFeed: MOCK_PRICE_FEED,
        blockNumbers: { "1": 100 },
        timestamp: 1000,
        sources: [],
        fetchDuration: 0,
        adapterVersions: {},
      });

      expect(manager.verifySnapshot(snapshot)).toBe(true);
    });

    it("rejects a tampered snapshot", () => {
      const snapshot = manager.createSnapshot({
        poolStates: pools,
        priceFeed: MOCK_PRICE_FEED,
        blockNumbers: { "1": 100 },
        timestamp: 1000,
        sources: [],
        fetchDuration: 0,
        adapterVersions: {},
      });

      // Tamper with data
      const tampered: DataSnapshot = {
        ...snapshot,
        priceFeed: { ...snapshot.priceFeed, ETH: 9999 },
      };

      expect(manager.verifySnapshot(tampered)).toBe(false);
    });

    it("rejects a snapshot with altered timestamp", () => {
      const snapshot = manager.createSnapshot({
        poolStates: pools,
        priceFeed: MOCK_PRICE_FEED,
        blockNumbers: {},
        timestamp: 1000,
        sources: [],
        fetchDuration: 0,
        adapterVersions: {},
      });

      const tampered: DataSnapshot = { ...snapshot, timestamp: 2000 };
      expect(manager.verifySnapshot(tampered)).toBe(false);
    });
  });

  // ================================================================
  // Determinism (Snapshot Tests)
  // ================================================================
  describe("determinism", () => {
    it("same input produces identical snapshot ID across runs", () => {
      const params = {
        poolStates: pools,
        priceFeed: MOCK_PRICE_FEED,
        blockNumbers: { "1": 19_000_000, "42161": 180_000_000 },
        timestamp: 1700000000000,
        sources: ["Aave V3", "Compound V3"],
        fetchDuration: 1500,
        adapterVersions: { "Aave V3": "1.0.0" },
      } as const;

      const snap1 = manager.createSnapshot({ ...params });
      const snap2 = manager.createSnapshot({ ...params });
      const snap3 = manager.createSnapshot({ ...params });

      expect(snap1.snapshotId).toBe(snap2.snapshotId);
      expect(snap2.snapshotId).toBe(snap3.snapshotId);
    });

    it("serialization is deterministic", () => {
      const snapshot = manager.createSnapshot({
        poolStates: pools,
        priceFeed: MOCK_PRICE_FEED,
        blockNumbers: { "1": 100 },
        timestamp: 1000,
        sources: [],
        fetchDuration: 0,
        adapterVersions: {},
      });

      const str1 = manager.serialize(snapshot);
      const str2 = manager.serialize(snapshot);
      expect(str1).toBe(str2);
    });
  });

  // ================================================================
  // IPFS Integration
  // ================================================================
  describe("IPFS storage", () => {
    let ipfs: MockIPFSStorage;
    let ipfsManager: SnapshotManager;

    beforeEach(() => {
      ipfs = new MockIPFSStorage();
      ipfsManager = new SnapshotManager(ipfs);
    });

    it("pins snapshot to IPFS and retrieves it", async () => {
      const snapshot = ipfsManager.createSnapshot({
        poolStates: pools,
        priceFeed: MOCK_PRICE_FEED,
        blockNumbers: { "1": 100 },
        timestamp: 1000,
        sources: ["test"],
        fetchDuration: 50,
        adapterVersions: {},
      });

      const cid = await ipfsManager.pinToIPFS(snapshot);
      expect(cid).toMatch(/^QmMock/);

      const retrieved = await ipfsManager.getFromIPFS(cid);
      expect(retrieved.snapshotId).toBe(snapshot.snapshotId);
      expect(retrieved.poolStates).toEqual(snapshot.poolStates);
    });

    it("throws without IPFS storage configured", async () => {
      const noIpfs = new SnapshotManager();
      const snapshot = noIpfs.createSnapshot({
        poolStates: pools,
        priceFeed: {},
        blockNumbers: {},
        timestamp: 1000,
        sources: [],
        fetchDuration: 0,
        adapterVersions: {},
      });

      await expect(noIpfs.pinToIPFS(snapshot)).rejects.toThrow("IPFS storage not configured");
    });
  });
});
