import type { Job } from "bullmq";
import type { Logger } from "../logger.js";
import type { PaymentClaimData } from "./types.js";

export interface PaymentClaimDeps {
  logger: Logger;
  claimFees?: (agentId: bigint) => Promise<string>;
}

export async function processPaymentClaim(
  job: Job<PaymentClaimData>,
  deps: PaymentClaimDeps,
): Promise<{ taskId: string; txHash?: string }> {
  const { taskId, agentId } = job.data;

  deps.logger.info({ jobId: job.id, taskId, agentId }, "Claiming payment");

  if (!deps.claimFees) {
    deps.logger.warn({ taskId }, "No wallet configured, skipping payment claim");
    return { taskId };
  }

  try {
    const txHash = await deps.claimFees(BigInt(agentId));
    deps.logger.info({ taskId, txHash }, "Payment claimed");
    return { taskId, txHash };
  } catch (err) {
    deps.logger.error({ taskId, err }, "Payment claim failed");
    throw err;
  }
}
