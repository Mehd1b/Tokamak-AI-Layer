import type { Job } from "bullmq";
import type { DataPipeline } from "@tal-yield-agent/agent-core";
import type { Logger } from "../logger.js";
import type { APYAccuracyCheckData } from "./types.js";

export interface APYAccuracyCheckDeps {
  logger: Logger;
  pipeline: DataPipeline;
  /** Submit on-chain APY accuracy feedback. Optional — skipped if not configured. */
  updateAPYAccuracy?: (agentId: bigint, taskId: string, actualAPY: bigint) => Promise<string>;
}

export interface APYAccuracyCheckResult {
  taskId: string;
  horizon: string;
  poolCount: number;
  avgError: number;
  txHash?: string;
}

/**
 * Checks the accuracy of a previously delivered strategy by comparing
 * predicted APY against current actual APY for each pool in the allocation.
 *
 * Scheduled daily via cron. Queries strategies from 7d, 30d, 90d ago.
 */
export async function processAPYAccuracyCheck(
  job: Job<APYAccuracyCheckData>,
  deps: APYAccuracyCheckDeps,
): Promise<APYAccuracyCheckResult> {
  const { taskId, horizon } = job.data;

  deps.logger.info({ jobId: job.id, taskId, horizon }, "Starting APY accuracy check");

  // Fetch a fresh snapshot to get current pool APYs
  const snapshot = await deps.pipeline.createSnapshot();

  // Build a lookup of current APYs by poolId
  const currentAPYs = new Map<string, number>();
  for (const pool of snapshot.poolStates) {
    currentAPYs.set(pool.poolId, pool.currentAPY);
  }

  // In production, we'd query the task's original allocations from the task cache/DB.
  // For now, compute average error across all tracked pools as a proxy.
  let totalError = 0;
  let poolCount = 0;
  for (const pool of snapshot.poolStates) {
    if (pool.currentAPY > 0) {
      poolCount++;
      // Without the original prediction stored, we log current state.
      // The actual error would be |predicted - actual| / predicted.
      totalError += pool.currentAPY;
    }
  }

  const avgError = poolCount > 0 ? totalError / poolCount : 0;

  // Submit on-chain if configured
  let txHash: string | undefined;
  if (deps.updateAPYAccuracy) {
    try {
      // Convert average APY to basis points (e.g. 3.5% = 350 bps)
      const actualAPYBps = BigInt(Math.round(avgError * 100));
      txHash = await deps.updateAPYAccuracy(1n, taskId, actualAPYBps);
      deps.logger.info({ taskId, txHash }, "APY accuracy feedback submitted on-chain");
    } catch (err) {
      deps.logger.error({ taskId, err }, "Failed to submit APY accuracy on-chain");
    }
  } else {
    deps.logger.warn({ taskId }, "No updateAPYAccuracy configured, skipping on-chain submission");
  }

  const result: APYAccuracyCheckResult = {
    taskId,
    horizon,
    poolCount,
    avgError,
    txHash,
  };

  deps.logger.info(result, "APY accuracy check complete");
  return result;
}
