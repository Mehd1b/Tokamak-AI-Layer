import { describe, it, expect } from "vitest";
import {
  PoolDataSchema,
  ChainIdSchema,
  TokenInfoSchema,
  AuditInfoSchema,
  RiskMetricsSchema,
  APYTimeseriesSchema,
  DataSnapshotSchema,
  DefiLlamaPoolSchema,
  DefiLlamaYieldsResponseSchema,
} from "./types.js";

describe("Zod Schemas", () => {
  // ================================================================
  // ChainId
  // ================================================================
  describe("ChainIdSchema", () => {
    it("accepts valid chain IDs", () => {
      expect(ChainIdSchema.parse(1)).toBe(1);
      expect(ChainIdSchema.parse(10)).toBe(10);
      expect(ChainIdSchema.parse(42161)).toBe(42161);
      expect(ChainIdSchema.parse(55004)).toBe(55004);
    });

    it("rejects invalid chain IDs", () => {
      expect(() => ChainIdSchema.parse(999)).toThrow();
      expect(() => ChainIdSchema.parse(0)).toThrow();
      expect(() => ChainIdSchema.parse("1")).toThrow();
    });
  });

  // ================================================================
  // TokenInfo
  // ================================================================
  describe("TokenInfoSchema", () => {
    it("validates a valid token", () => {
      const token = {
        symbol: "USDC",
        address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        decimals: 6,
        priceUSD: 1.0,
      };
      expect(TokenInfoSchema.parse(token)).toEqual(token);
    });

    it("rejects negative decimals", () => {
      expect(() =>
        TokenInfoSchema.parse({ symbol: "X", address: "0x", decimals: -1, priceUSD: 0 }),
      ).toThrow();
    });

    it("rejects negative price", () => {
      expect(() =>
        TokenInfoSchema.parse({ symbol: "X", address: "0x", decimals: 18, priceUSD: -1 }),
      ).toThrow();
    });
  });

  // ================================================================
  // AuditInfo
  // ================================================================
  describe("AuditInfoSchema", () => {
    it("validates correct audit info", () => {
      const info = {
        audited: true,
        auditors: ["OpenZeppelin"],
        auditCount: 5,
        bugBountyActive: true,
        bugBountySize: 1_000_000,
      };
      expect(AuditInfoSchema.parse(info)).toEqual(info);
    });
  });

  // ================================================================
  // RiskMetrics
  // ================================================================
  describe("RiskMetricsSchema", () => {
    it("validates valid risk metrics", () => {
      const metrics = {
        overallScore: 25,
        smartContractRisk: 10,
        marketRisk: 30,
        liquidityRisk: 20,
        protocolRisk: 15,
        centralizationRisk: 40,
      };
      expect(RiskMetricsSchema.parse(metrics)).toEqual(metrics);
    });

    it("rejects scores over 100", () => {
      expect(() =>
        RiskMetricsSchema.parse({
          overallScore: 101,
          smartContractRisk: 0,
          marketRisk: 0,
          liquidityRisk: 0,
          protocolRisk: 0,
          centralizationRisk: 0,
        }),
      ).toThrow();
    });

    it("rejects negative scores", () => {
      expect(() =>
        RiskMetricsSchema.parse({
          overallScore: -1,
          smartContractRisk: 0,
          marketRisk: 0,
          liquidityRisk: 0,
          protocolRisk: 0,
          centralizationRisk: 0,
        }),
      ).toThrow();
    });
  });

  // ================================================================
  // PoolData
  // ================================================================
  describe("PoolDataSchema", () => {
    const validPool = {
      protocol: "Aave V3",
      protocolType: "lending",
      chain: 1,
      poolId: "aave-v3-eth-usdc",
      tokens: [{ symbol: "USDC", address: "0x123", decimals: 6, priceUSD: 1.0 }],
      currentAPY: 3.45,
      tvl: 2_500_000_000,
      volume24h: 150_000_000,
      ilRisk: 0,
      protocolRiskScore: 15,
      auditStatus: {
        audited: true,
        auditors: ["OZ"],
        auditCount: 5,
        bugBountyActive: true,
        bugBountySize: 1_000_000,
      },
      contractAge: 900,
    };

    it("validates a correct pool", () => {
      expect(PoolDataSchema.parse(validPool)).toEqual(validPool);
    });

    it("rejects invalid protocol type", () => {
      expect(() =>
        PoolDataSchema.parse({ ...validPool, protocolType: "invalid" }),
      ).toThrow();
    });

    it("rejects IL risk > 1", () => {
      expect(() =>
        PoolDataSchema.parse({ ...validPool, ilRisk: 1.5 }),
      ).toThrow();
    });

    it("rejects negative TVL", () => {
      expect(() =>
        PoolDataSchema.parse({ ...validPool, tvl: -100 }),
      ).toThrow();
    });
  });

  // ================================================================
  // DeFi Llama Schemas
  // ================================================================
  describe("DefiLlamaPoolSchema", () => {
    it("handles null fields gracefully", () => {
      const raw = {
        pool: "test-pool",
        chain: "Ethereum",
        project: "test",
        symbol: "TEST",
        tvlUsd: 100,
        apy: null,
        apyBase: null,
        apyReward: null,
        il7d: null,
        volumeUsd1d: null,
      };
      const parsed = DefiLlamaPoolSchema.parse(raw);
      expect(parsed.apy).toBeNull();
      expect(parsed.il7d).toBeNull();
      expect(parsed.volumeUsd1d).toBeNull();
    });

    it("preserves numeric values", () => {
      const raw = {
        pool: "test",
        chain: "Ethereum",
        project: "test",
        symbol: "T",
        tvlUsd: 1000,
        apy: 5.5,
        apyBase: 3.0,
        apyReward: 2.5,
        il7d: -1.2,
        volumeUsd1d: 50000,
      };
      const parsed = DefiLlamaPoolSchema.parse(raw);
      expect(parsed.apy).toBe(5.5);
      expect(parsed.il7d).toBe(-1.2);
    });
  });

  describe("DefiLlamaYieldsResponseSchema", () => {
    it("validates a full response", () => {
      const response = {
        status: "success",
        data: [
          {
            pool: "test",
            chain: "Ethereum",
            project: "aave-v3",
            symbol: "USDC",
            tvlUsd: 1000,
            apy: 3.0,
            apyBase: 2.0,
            apyReward: 1.0,
            il7d: null,
            volumeUsd1d: null,
          },
        ],
      };
      const parsed = DefiLlamaYieldsResponseSchema.parse(response);
      expect(parsed.data).toHaveLength(1);
    });
  });

  // ================================================================
  // APYTimeseries
  // ================================================================
  describe("APYTimeseriesSchema", () => {
    it("validates a valid timeseries", () => {
      const ts = {
        poolId: "test-pool",
        protocol: "Aave V3",
        chain: 1 as const,
        dataPoints: [
          { timestamp: 1700000000, apy: 3.2 },
          { timestamp: 1700086400, apy: 3.3 },
        ],
        periodDays: 30,
      };
      expect(APYTimeseriesSchema.parse(ts)).toEqual(ts);
    });

    it("rejects non-positive period", () => {
      expect(() =>
        APYTimeseriesSchema.parse({
          poolId: "t",
          protocol: "t",
          chain: 1,
          dataPoints: [],
          periodDays: 0,
        }),
      ).toThrow();
    });
  });

  // ================================================================
  // DataSnapshot
  // ================================================================
  describe("DataSnapshotSchema", () => {
    it("validates a full snapshot", () => {
      const snapshot = {
        snapshotId: "0xabc123",
        timestamp: 1700000000,
        blockNumbers: { "1": 19000000 },
        poolStates: [],
        priceFeed: { ETH: 3200 },
        metadata: {
          sources: ["test"],
          fetchDuration: 100,
          adapterVersions: { test: "1.0.0" },
        },
      };
      expect(DataSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    });
  });
});
