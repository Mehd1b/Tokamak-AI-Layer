import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { createMockContext } from "../__mocks__/mock-context.js";

describe("GET /api/v1/health", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const ctx = createMockContext();
    app = await buildApp(ctx);
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 200 with health data", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.poolCount).toBeGreaterThanOrEqual(0);
    expect(body.snapshotCount).toBeGreaterThanOrEqual(0);
    expect(body.taskCount).toBeGreaterThanOrEqual(0);
    expect(body.timestamp).toBeGreaterThan(0);
  });
});
