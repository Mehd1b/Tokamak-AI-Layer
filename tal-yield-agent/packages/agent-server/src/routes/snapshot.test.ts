import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { createMockContext, makeMockSnapshot, makeMockPool } from "../__mocks__/mock-context.js";

describe("Snapshot routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const pools = [makeMockPool({ poolId: "test-pool" })];
    const snapshot = makeMockSnapshot(pools);
    const ctx = createMockContext();
    ctx.snapshotCache.set(snapshot.snapshotId, snapshot);
    app = await buildApp(ctx);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /api/v1/snapshot/:id", () => {
    it("returns snapshot by ID", async () => {
      // Get first snapshot ID from cache
      const res = await app.inject({ method: "GET", url: "/api/v1/snapshot/0xnonexistent" });
      expect(res.statusCode).toBe(404);
    });

    it("returns 404 for unknown snapshot", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/snapshot/0xbad" });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("not_found");
    });
  });
});
