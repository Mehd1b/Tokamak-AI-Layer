import { createPublicClient, http } from "viem";
import { thanosSepolia, THANOS_SEPOLIA_ADDRESSES } from "@tal-yield-agent/shared";
import { TALClient } from "@tal-yield-agent/tal-sdk";
import {
  DataPipeline,
  HttpDataSource,
  SnapshotManager,
  StrategyGenerator,
  RiskScorer,
  APYPredictor,
} from "@tal-yield-agent/agent-core";
import type { DataSnapshot, PoolData } from "@tal-yield-agent/agent-core";
import type { RiskProfile, StrategyReport } from "@tal-yield-agent/agent-core";
import type { Config } from "./config.js";
import type { Logger } from "./logger.js";

/**
 * Application context — shared state across all routes.
 * Injected via Fastify decorators for testability.
 */
export interface AppContext {
  config: Config;
  logger: Logger;
  pipeline: DataPipeline;
  snapshotManager: SnapshotManager;
  strategyGenerator: StrategyGenerator;
  talClient: TALClient;

  // In-memory caches (production would use Redis/PG)
  snapshotCache: Map<string, DataSnapshot>;
  taskCache: Map<string, TaskRecord>;
  poolCache: PoolData[];
}

export interface TaskRecord {
  taskId: string;
  requester: string;
  riskProfile: RiskProfile;
  capitalUSD: number;
  status: "pending" | "processing" | "completed" | "failed";
  snapshotId?: string;
  report?: StrategyReport;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export function createContext(config: Config, logger: Logger): AppContext {
  const publicClient = createPublicClient({
    chain: thanosSepolia,
    transport: http(config.RPC_URL),
  });

  const talClient = new TALClient({
    publicClient,
    addresses: {
      identityRegistry: THANOS_SEPOLIA_ADDRESSES.TALIdentityRegistry,
      taskFeeEscrow: THANOS_SEPOLIA_ADDRESSES.TaskFeeEscrow,
      reputationRegistry: THANOS_SEPOLIA_ADDRESSES.TALReputationRegistry,
    },
  });

  const dataSource = new HttpDataSource();
  const snapshotManager = new SnapshotManager();
  const pipeline = new DataPipeline(dataSource, snapshotManager);
  const strategyGenerator = new StrategyGenerator(new RiskScorer(), new APYPredictor());

  return {
    config,
    logger,
    pipeline,
    snapshotManager,
    strategyGenerator,
    talClient,
    snapshotCache: new Map(),
    taskCache: new Map(),
    poolCache: [],
  };
}
