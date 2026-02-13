import type { Job } from "bullmq";
import type { Logger } from "../logger.js";
import type { ReputationUpdateData } from "./types.js";

export interface ReputationUpdateDeps {
  logger: Logger;
  /** Optional local reputation cache (e.g. Redis or in-memory Map). */
  reputationCache?: Map<string, { score: number; count: number; lastUpdated: number }>;
}

export interface ReputationUpdateResult {
  agentId: string;
  taskId: string;
  cached: boolean;
}

/**
 * Triggered by FeedbackSubmitted event.
 * The on-chain write already happened via the user's transaction.
 * This job keeps the local reputation cache in sync.
 */
export async function processReputationUpdate(
  job: Job<ReputationUpdateData>,
  deps: ReputationUpdateDeps,
): Promise<ReputationUpdateResult> {
  const { agentId, taskId, score, comment } = job.data;

  deps.logger.info({ jobId: job.id, agentId, taskId, score }, "Processing reputation update");

  let cached = false;

  if (deps.reputationCache) {
    const existing = deps.reputationCache.get(agentId);
    if (existing) {
      existing.score = Math.round(
        (existing.score * existing.count + score) / (existing.count + 1),
      );
      existing.count += 1;
      existing.lastUpdated = Date.now();
    } else {
      deps.reputationCache.set(agentId, {
        score,
        count: 1,
        lastUpdated: Date.now(),
      });
    }
    cached = true;
    deps.logger.info({ agentId, cached: deps.reputationCache.get(agentId) }, "Reputation cache updated");
  } else {
    deps.logger.info({ agentId }, "No reputation cache configured, event logged only");
  }

  if (comment) {
    deps.logger.info({ agentId, comment }, "Feedback comment received");
  }

  return { agentId, taskId, cached };
}
