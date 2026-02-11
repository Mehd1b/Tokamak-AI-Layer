import { describe, it, expect } from "vitest";
import type { Job } from "bullmq";
import { processReputationUpdate, type ReputationUpdateDeps } from "./reputation-update.js";
import type { ReputationUpdateData } from "./types.js";
import pino from "pino";

function makeMockJob(data: ReputationUpdateData): Job<ReputationUpdateData> {
  return { id: "test-job", data } as Job<ReputationUpdateData>;
}

describe("processReputationUpdate", () => {
  const baseDeps: ReputationUpdateDeps = {
    logger: pino({ level: "silent" }),
  };

  it("logs feedback when no cache configured", async () => {
    const result = await processReputationUpdate(
      makeMockJob({ agentId: "1", taskId: "task-1", score: 85 }),
      baseDeps,
    );

    expect(result.agentId).toBe("1");
    expect(result.taskId).toBe("task-1");
    expect(result.cached).toBe(false);
  });

  it("updates reputation cache with new entry", async () => {
    const cache = new Map<string, { score: number; count: number; lastUpdated: number }>();
    const deps: ReputationUpdateDeps = { ...baseDeps, reputationCache: cache };

    await processReputationUpdate(
      makeMockJob({ agentId: "1", taskId: "task-1", score: 80 }),
      deps,
    );

    expect(cache.has("1")).toBe(true);
    expect(cache.get("1")!.score).toBe(80);
    expect(cache.get("1")!.count).toBe(1);
  });

  it("averages score into existing cache entry", async () => {
    const cache = new Map<string, { score: number; count: number; lastUpdated: number }>();
    cache.set("1", { score: 80, count: 1, lastUpdated: 0 });
    const deps: ReputationUpdateDeps = { ...baseDeps, reputationCache: cache };

    await processReputationUpdate(
      makeMockJob({ agentId: "1", taskId: "task-2", score: 90 }),
      deps,
    );

    expect(cache.get("1")!.score).toBe(85); // (80*1 + 90) / 2
    expect(cache.get("1")!.count).toBe(2);
  });
});
