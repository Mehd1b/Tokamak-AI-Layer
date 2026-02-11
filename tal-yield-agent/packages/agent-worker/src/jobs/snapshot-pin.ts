import type { Job } from "bullmq";
import type { Logger } from "../logger.js";
import type { SnapshotPinData } from "./types.js";

export interface SnapshotPinDeps {
  logger: Logger;
  pinToIPFS?: (data: unknown) => Promise<string>;
}

export async function processSnapshotPin(
  job: Job<SnapshotPinData>,
  deps: SnapshotPinDeps,
): Promise<{ snapshotId: string; cid?: string }> {
  const { snapshotId, snapshotData } = job.data;

  deps.logger.info({ jobId: job.id, snapshotId }, "Pinning snapshot to IPFS");

  if (!deps.pinToIPFS) {
    deps.logger.warn({ snapshotId }, "IPFS not configured, skipping pin");
    return { snapshotId };
  }

  const data = JSON.parse(snapshotData);
  const cid = await deps.pinToIPFS(data);

  deps.logger.info({ snapshotId, cid }, "Snapshot pinned to IPFS");
  return { snapshotId, cid };
}
