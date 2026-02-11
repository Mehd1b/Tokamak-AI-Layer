import type { Job } from "bullmq";
import type { Logger } from "../logger.js";
import type { StrategyDeliverData, StrategyDeliverResult } from "./types.js";

export interface StrategyDeliverDeps {
  logger: Logger;
  // In production: TALClient for on-chain delivery, IPFS for report upload
  confirmTask?: (taskRef: string) => Promise<string>;
  pinToIPFS?: (data: unknown) => Promise<string>;
}

export async function processStrategyDeliver(
  job: Job<StrategyDeliverData>,
  deps: StrategyDeliverDeps,
): Promise<StrategyDeliverResult> {
  const { taskId, snapshotId, executionHash } = job.data;

  deps.logger.info({ jobId: job.id, taskId, executionHash }, "Delivering strategy on-chain");

  let txHash: string | undefined;
  let ipfsCid: string | undefined;

  // Pin report to IPFS if available
  if (deps.pinToIPFS && job.data.reportIpfsCid) {
    ipfsCid = job.data.reportIpfsCid;
    deps.logger.info({ taskId, ipfsCid }, "Report already pinned");
  }

  // Confirm task on-chain if wallet available
  if (deps.confirmTask) {
    try {
      txHash = await deps.confirmTask(taskId);
      deps.logger.info({ taskId, txHash }, "Task confirmed on-chain");
    } catch (err) {
      deps.logger.error({ taskId, err }, "Failed to confirm task on-chain");
      throw err;
    }
  } else {
    deps.logger.warn({ taskId }, "No wallet configured, skipping on-chain delivery");
  }

  return { taskId, txHash, ipfsCid };
}
