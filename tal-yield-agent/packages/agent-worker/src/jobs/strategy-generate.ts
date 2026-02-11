import type { Job } from "bullmq";
import {
  DEFAULT_RISK_PROFILES,
  StrategyGenerator,
  DataPipeline,
} from "@tal-yield-agent/agent-core";
import type { RiskProfile, StrategyReport, DataSnapshot } from "@tal-yield-agent/agent-core";
import type { Logger } from "../logger.js";
import type { StrategyGenerateData, StrategyGenerateResult } from "./types.js";

export interface StrategyGenerateDeps {
  pipeline: DataPipeline;
  strategyGenerator: StrategyGenerator;
  logger: Logger;
  onComplete?: (taskId: string, report: StrategyReport, snapshot: DataSnapshot) => void;
}

export async function processStrategyGenerate(
  job: Job<StrategyGenerateData>,
  deps: StrategyGenerateDeps,
): Promise<StrategyGenerateResult> {
  const { taskId, riskLevel, capitalUSD, chainPreferences, excludeProtocols, maxSinglePoolAllocation } = job.data;

  deps.logger.info({ jobId: job.id, taskId, riskLevel, capitalUSD }, "Starting strategy generation");

  // Build risk profile
  const baseProfile = DEFAULT_RISK_PROFILES[riskLevel];
  const riskProfile: RiskProfile = {
    ...baseProfile,
    ...(chainPreferences && { chainPreferences: chainPreferences as RiskProfile["chainPreferences"] }),
    ...(excludeProtocols && { excludeProtocols }),
    ...(maxSinglePoolAllocation !== undefined && { maxSinglePoolAllocation }),
  };

  // Create fresh snapshot
  await job.updateProgress(10);
  const snapshot = await deps.pipeline.createSnapshot();
  await job.updateProgress(40);

  // Generate strategy
  const report = deps.strategyGenerator.generate(
    snapshot,
    riskProfile,
    capitalUSD,
    taskId,
  );
  await job.updateProgress(90);

  deps.onComplete?.(taskId, report, snapshot);

  const result: StrategyGenerateResult = {
    taskId,
    snapshotId: snapshot.snapshotId,
    executionHash: report.executionHash,
    allocationCount: report.allocations.length,
    blendedAPY: report.expectedAPY.blended,
  };

  deps.logger.info(result, "Strategy generation complete");
  await job.updateProgress(100);

  return result;
}
