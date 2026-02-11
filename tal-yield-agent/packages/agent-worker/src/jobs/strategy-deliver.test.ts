import { describe, it, expect, vi } from "vitest";
import { processStrategyDeliver } from "./strategy-deliver.js";
import type { StrategyDeliverDeps } from "./strategy-deliver.js";
import type { StrategyDeliverData } from "./types.js";
import pino from "pino";

function makeMockJob(data: StrategyDeliverData) {
  return { id: "test-job-1", data } as Parameters<typeof processStrategyDeliver>[0];
}

describe("processStrategyDeliver", () => {
  it("skips on-chain delivery when no wallet configured", async () => {
    const deps: StrategyDeliverDeps = {
      logger: pino({ level: "silent" }),
    };

    const result = await processStrategyDeliver(
      makeMockJob({ taskId: "task-1", snapshotId: "snap-1", executionHash: "0xabc" }),
      deps,
    );

    expect(result.taskId).toBe("task-1");
    expect(result.txHash).toBeUndefined();
  });

  it("calls confirmTask when wallet available", async () => {
    const confirmTask = vi.fn().mockResolvedValue("0xtxhash");
    const deps: StrategyDeliverDeps = {
      logger: pino({ level: "silent" }),
      confirmTask,
    };

    const result = await processStrategyDeliver(
      makeMockJob({ taskId: "task-2", snapshotId: "snap-1", executionHash: "0xdef" }),
      deps,
    );

    expect(confirmTask).toHaveBeenCalledWith("task-2");
    expect(result.txHash).toBe("0xtxhash");
  });

  it("throws when on-chain confirm fails", async () => {
    const confirmTask = vi.fn().mockRejectedValue(new Error("tx reverted"));
    const deps: StrategyDeliverDeps = {
      logger: pino({ level: "silent" }),
      confirmTask,
    };

    await expect(
      processStrategyDeliver(
        makeMockJob({ taskId: "task-3", snapshotId: "snap-1", executionHash: "0x" }),
        deps,
      ),
    ).rejects.toThrow("tx reverted");
  });
});
