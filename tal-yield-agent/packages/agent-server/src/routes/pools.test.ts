import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { createMockContext } from "../__mocks__/mock-context.js";

describe("Pool routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const ctx = createMockContext();
    app = await buildApp(ctx);
  });

  afterAll(async () => {
    await app.close();
  });

  // ================================================================
  // GET /api/v1/pools
  // ================================================================
  describe("GET /api/v1/pools", () => {
    it("returns all pools with risk scores", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/pools" });
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.pools.length).toBe(3);
      expect(body.count).toBe(3);
      for (const pool of body.pools) {
        expect(pool.riskScore).toBeDefined();
        expect(pool.poolId).toBeDefined();
      }
    });
  });

  // ================================================================
  // GET /api/v1/pools/search
  // ================================================================
  describe("GET /api/v1/pools/search", () => {
    it("filters by protocol", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/pools/search?protocol=Aave" });
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.pools.length).toBe(1);
      expect(body.pools[0].protocol).toBe("Aave V3");
    });

    it("filters by minAPY", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/pools/search?minAPY=3.2" });
      expect(res.statusCode).toBe(200);

      const body = res.json();
      for (const pool of body.pools) {
        expect(pool.currentAPY).toBeGreaterThanOrEqual(3.2);
      }
    });

    it("filters by minTVL", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/pools/search?minTVL=2000000000" });
      expect(res.statusCode).toBe(200);

      const body = res.json();
      for (const pool of body.pools) {
        expect(pool.tvl).toBeGreaterThanOrEqual(2_000_000_000);
      }
    });

    it("supports pagination", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/pools/search?limit=1&offset=0" });
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.pools.length).toBe(1);
      expect(body.total).toBe(3);
      expect(body.limit).toBe(1);
      expect(body.offset).toBe(0);
    });

    it("returns empty for non-matching filter", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/pools/search?protocol=NonExistent" });
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.pools.length).toBe(0);
    });
  });

  // ================================================================
  // GET /api/v1/pools/:poolId
  // ================================================================
  describe("GET /api/v1/pools/:poolId", () => {
    it("returns pool detail with risk breakdown", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/pools/aave-usdc" });
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.poolId).toBe("aave-usdc");
      expect(body.riskScore).toBeDefined();
      expect(body.riskBreakdown).toBeDefined();
      expect(body.riskConfidence).toBeDefined();
    });

    it("returns 404 for unknown pool", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/pools/nonexistent" });
      expect(res.statusCode).toBe(404);
    });
  });
});
