import { describe, it, expect, vi } from "vitest";
import { processPaymentClaim } from "./payment-claim.js";
import type { PaymentClaimDeps } from "./payment-claim.js";
import type { PaymentClaimData } from "./types.js";
import pino from "pino";

function makeMockJob(data: PaymentClaimData) {
  return { id: "test-job-1", data } as Parameters<typeof processPaymentClaim>[0];
}

describe("processPaymentClaim", () => {
  it("skips claim when no wallet configured", async () => {
    const deps: PaymentClaimDeps = {
      logger: pino({ level: "silent" }),
    };

    const result = await processPaymentClaim(
      makeMockJob({ taskId: "task-1", agentId: "1", taskRef: "0xref" }),
      deps,
    );

    expect(result.taskId).toBe("task-1");
    expect(result.txHash).toBeUndefined();
  });

  it("claims fees when wallet available", async () => {
    const claimFees = vi.fn().mockResolvedValue("0xclaimed");
    const deps: PaymentClaimDeps = {
      logger: pino({ level: "silent" }),
      claimFees,
    };

    const result = await processPaymentClaim(
      makeMockJob({ taskId: "task-2", agentId: "42", taskRef: "0xref" }),
      deps,
    );

    expect(claimFees).toHaveBeenCalledWith(42n);
    expect(result.txHash).toBe("0xclaimed");
  });

  it("throws when claim fails", async () => {
    const claimFees = vi.fn().mockRejectedValue(new Error("insufficient funds"));
    const deps: PaymentClaimDeps = {
      logger: pino({ level: "silent" }),
      claimFees,
    };

    await expect(
      processPaymentClaim(
        makeMockJob({ taskId: "task-3", agentId: "1", taskRef: "0xref" }),
        deps,
      ),
    ).rejects.toThrow("insufficient funds");
  });
});
