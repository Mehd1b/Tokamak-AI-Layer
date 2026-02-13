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

  it("pins report to IPFS when reportJson and pinToIPFS provided", async () => {
    const pinToIPFS = vi.fn().mockResolvedValue("QmTestCid123");
    const deps: StrategyDeliverDeps = {
      logger: pino({ level: "silent" }),
      pinToIPFS,
    };

    const reportJson = JSON.stringify({ reportId: "r1", allocations: [] });
    const result = await processStrategyDeliver(
      makeMockJob({ taskId: "task-pin", snapshotId: "snap-1", executionHash: "0x1", reportJson }),
      deps,
    );

    expect(pinToIPFS).toHaveBeenCalledWith({ reportId: "r1", allocations: [] });
    expect(result.ipfsCid).toBe("QmTestCid123");
  });

  it("continues without CID when IPFS pinning fails", async () => {
    const pinToIPFS = vi.fn().mockRejectedValue(new Error("IPFS down"));
    const deps: StrategyDeliverDeps = {
      logger: pino({ level: "silent" }),
      pinToIPFS,
    };

    const reportJson = JSON.stringify({ data: "test" });
    const result = await processStrategyDeliver(
      makeMockJob({ taskId: "task-fail", snapshotId: "snap-1", executionHash: "0x2", reportJson }),
      deps,
    );

    expect(result.ipfsCid).toBeUndefined();
    expect(result.taskId).toBe("task-fail");
  });

  it("uses pre-existing IPFS CID when reportIpfsCid is set", async () => {
    const deps: StrategyDeliverDeps = {
      logger: pino({ level: "silent" }),
    };

    const result = await processStrategyDeliver(
      makeMockJob({ taskId: "task-pre", snapshotId: "snap-1", executionHash: "0x3", reportIpfsCid: "QmExisting" }),
      deps,
    );

    expect(result.ipfsCid).toBe("QmExisting");
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
