import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { createMockContext } from "../__mocks__/mock-context.js";

describe("Agent routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const ctx = createMockContext();
    app = await buildApp(ctx);
  });

  afterAll(async () => {
    await app.close();
  });

  // ================================================================
  // GET /api/v1/agent/stats
  // ================================================================
  describe("GET /api/v1/agent/stats", () => {
    it("returns agent stats with zero tasks", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/agent/stats" });
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.totalTasks).toBe(0);
      expect(body.completedTasks).toBe(0);
      expect(body.failedTasks).toBe(0);
      expect(body.successRate).toBe(0);
      expect(body.poolsTracked).toBeGreaterThan(0);
    });

    it("updates stats after strategy generation", async () => {
      // Generate a strategy
      await app.inject({
        method: "POST",
        url: "/api/v1/strategy/request",
        payload: { riskLevel: "moderate", capitalUSD: 100_000, requester: "0xtest" },
      });

      const res = await app.inject({ method: "GET", url: "/api/v1/agent/stats" });
      const body = res.json();
      expect(body.totalTasks).toBeGreaterThanOrEqual(1);
      expect(body.completedTasks).toBeGreaterThanOrEqual(1);
      expect(body.successRate).toBeGreaterThan(0);
      expect(body.avgBlendedAPY).toBeGreaterThan(0);
    });
  });
});
