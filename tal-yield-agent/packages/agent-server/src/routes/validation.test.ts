import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { createMockContext } from "../__mocks__/mock-context.js";

describe("Validation routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const ctx = createMockContext();
    app = await buildApp(ctx);
  });

  afterAll(async () => {
    await app.close();
  });

  // ================================================================
  // POST /api/v1/validate/submit
  // ================================================================
  describe("POST /api/v1/validate/submit", () => {
    it("accepts a validation for a completed task", async () => {
      // Create and complete a task first
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/strategy/request",
        payload: { riskLevel: "moderate", capitalUSD: 100_000, requester: "0xtest" },
      });
      const { taskId } = createRes.json();

      // Get the report to find the execution hash
      const reportRes = await app.inject({ method: "GET", url: `/api/v1/strategy/${taskId}/report` });
      const { executionHash } = reportRes.json();

      // Submit matching validation
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/validate/submit",
        payload: {
          taskId,
          validator: "0xvalidator1",
          isValid: true,
          executionHash,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.accepted).toBe(true);
      expect(body.hashMatch).toBe(true);
    });

    it("detects non-matching execution hash", async () => {
      // Create a task
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/strategy/request",
        payload: { riskLevel: "moderate", capitalUSD: 100_000, requester: "0xtest2" },
      });
      const { taskId } = createRes.json();

      // Submit with wrong hash
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/validate/submit",
        payload: {
          taskId,
          validator: "0xvalidator2",
          isValid: false,
          executionHash: "0x0000000000000000000000000000000000000000000000000000000000000bad",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.hashMatch).toBe(false);
    });

    it("returns 404 for unknown task", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/validate/submit",
        payload: {
          taskId: "0xnonexistent",
          validator: "0xval",
          isValid: true,
          executionHash: "0x123",
        },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ================================================================
  // GET /api/v1/validate/queue
  // ================================================================
  describe("GET /api/v1/validate/queue", () => {
    it("returns completed tasks with validation info", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/validate/queue" });
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.tasks).toBeDefined();
      expect(body.count).toBeGreaterThanOrEqual(0);
    });
  });
});
