import type { Job } from "bullmq";
import type { DataPipeline, DataSnapshot } from "@tal-yield-agent/agent-core";
import type { Logger } from "../logger.js";
import type { PoolDataRefreshData, PoolDataRefreshResult } from "./types.js";

export interface PoolRefreshDeps {
  pipeline: DataPipeline;
  logger: Logger;
  onSnapshot?: (snapshot: DataSnapshot) => void;
}

export async function processPoolDataRefresh(
  job: Job<PoolDataRefreshData>,
  deps: PoolRefreshDeps,
): Promise<PoolDataRefreshResult> {
  const start = Date.now();
  deps.logger.info({ jobId: job.id, triggeredBy: job.data.triggeredBy }, "Starting pool data refresh");

  const snapshot = await deps.pipeline.createSnapshot();

  deps.onSnapshot?.(snapshot);

  const result: PoolDataRefreshResult = {
    snapshotId: snapshot.snapshotId,
    poolCount: snapshot.poolStates.length,
    durationMs: Date.now() - start,
  };

  deps.logger.info(result, "Pool data refresh complete");
  return result;
}
