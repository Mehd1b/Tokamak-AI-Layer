import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { createMockContext } from "../__mocks__/mock-context.js";

describe("Strategy routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const ctx = createMockContext();
    app = await buildApp(ctx);
  });

  afterAll(async () => {
    await app.close();
  });

  // ================================================================
  // POST /api/v1/strategy/request
  // ================================================================
  describe("POST /api/v1/strategy/request", () => {
    it("creates a strategy task and returns 201", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/strategy/request",
        payload: {
          riskLevel: "moderate",
          capitalUSD: 100_000,
          requester: "0xtest",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.taskId).toMatch(/^0x/);
      expect(body.status).toBe("completed");
      expect(body.message).toContain("successfully");
    });

    it("rejects invalid risk level", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/strategy/request",
        payload: {
          riskLevel: "yolo",
          capitalUSD: 100_000,
          requester: "0xtest",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("rejects capital below minimum", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/strategy/request",
        payload: {
          riskLevel: "moderate",
          capitalUSD: 10,
          requester: "0xtest",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("accepts optional overrides", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/strategy/request",
        payload: {
          riskLevel: "conservative",
          capitalUSD: 50_000,
          requester: "0xtest",
          excludeProtocols: ["Curve"],
          maxSinglePoolAllocation: 0.25,
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().status).toBe("completed");
    });
  });

  // ================================================================
  // GET /api/v1/strategy/:taskId
  // ================================================================
  describe("GET /api/v1/strategy/:taskId", () => {
    it("returns task status for existing task", async () => {
      // Create a task first
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/strategy/request",
        payload: { riskLevel: "moderate", capitalUSD: 100_000, requester: "0xtest" },
      });
      const { taskId } = createRes.json();

      const res = await app.inject({ method: "GET", url: `/api/v1/strategy/${taskId}` });
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.taskId).toBe(taskId);
      expect(body.status).toBe("completed");
      expect(body.snapshotId).toBeDefined();
      expect(body.executionHash).toMatch(/^0x/);
    });

    it("returns 404 for unknown task", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/strategy/0xnonexistent" });
      expect(res.statusCode).toBe(404);
    });
  });

  // ================================================================
  // GET /api/v1/strategy/:taskId/report
  // ================================================================
  describe("GET /api/v1/strategy/:taskId/report", () => {
    it("returns full report for completed task", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/strategy/request",
        payload: { riskLevel: "moderate", capitalUSD: 100_000, requester: "0xtest" },
      });
      const { taskId } = createRes.json();

      const res = await app.inject({ method: "GET", url: `/api/v1/strategy/${taskId}/report` });
      expect(res.statusCode).toBe(200);

      const report = res.json();
      expect(report.reportId).toMatch(/^0x/);
      expect(report.executionHash).toMatch(/^0x/);
      expect(report.allocations.length).toBeGreaterThan(0);
      expect(report.expectedAPY.blended).toBeGreaterThan(0);
    });

    it("returns 404 for unknown task", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/strategy/0xbad/report" });
      expect(res.statusCode).toBe(404);
    });
  });
});
