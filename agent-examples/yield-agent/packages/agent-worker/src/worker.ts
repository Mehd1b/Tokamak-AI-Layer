import { Worker, Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import {
  DataPipeline,
  HttpDataSource,
  SnapshotManager,
  StrategyGenerator,
  RiskScorer,
  APYPredictor,
} from "@tal-yield-agent/agent-core";
import type { DataSnapshot, StrategyReport } from "@tal-yield-agent/agent-core";
import {
  JOB_NAMES,
  processPoolDataRefresh,
  processStrategyGenerate,
  processStrategyDeliver,
  processSnapshotPin,
  processPaymentClaim,
  processAPYAccuracyCheck,
  processReputationUpdate,
} from "./jobs/index.js";
import type {
  PoolDataRefreshData,
  StrategyGenerateData,
  StrategyDeliverData,
  SnapshotPinData,
  PaymentClaimData,
  APYAccuracyCheckData,
  ReputationUpdateData,
} from "./jobs/index.js";
import type { WorkerConfig } from "./config.js";
import type { Logger } from "./logger.js";

export interface WorkerOrchestratorOptions {
  config: WorkerConfig;
  logger: Logger;
  connection: ConnectionOptions;
}

/**
 * Orchestrates all BullMQ workers for the yield agent.
 *
 * Manages:
 * - Pool data refresh (cron)
 * - Strategy generation (event-triggered)
 * - Strategy delivery (after generation)
 * - Snapshot pinning (after refresh)
 * - Payment claims (after dispute window)
 */
export class WorkerOrchestrator {
  private readonly config: WorkerConfig;
  private readonly logger: Logger;
  private readonly connection: ConnectionOptions;

  private readonly pipeline: DataPipeline;
  private readonly strategyGenerator: StrategyGenerator;

  private workers: Worker[] = [];
  private queues: Map<string, Queue> = new Map();

  // In-memory caches
  private readonly snapshotCache = new Map<string, DataSnapshot>();
  private readonly taskResults = new Map<string, StrategyReport>();

  constructor(options: WorkerOrchestratorOptions) {
    this.config = options.config;
    this.logger = options.logger;
    this.connection = options.connection;

    const dataSource = new HttpDataSource();
    this.pipeline = new DataPipeline(dataSource, new SnapshotManager());
    this.strategyGenerator = new StrategyGenerator(new RiskScorer(), new APYPredictor());
  }

  async start(): Promise<void> {
    this.logger.info("Starting worker orchestrator");

    // Create queues
    for (const name of Object.values(JOB_NAMES)) {
      const queue = new Queue(name, { connection: this.connection });
      this.queues.set(name, queue);
    }

    // Start workers
    this.startPoolRefreshWorker();
    this.startStrategyGenerateWorker();
    this.startStrategyDeliverWorker();
    this.startSnapshotPinWorker();
    this.startPaymentClaimWorker();
    this.startAPYAccuracyCheckWorker();
    this.startReputationUpdateWorker();

    // Schedule cron jobs
    await this.scheduleCronJobs();

    this.logger.info({ workers: this.workers.length }, "Worker orchestrator started");
  }

  async stop(): Promise<void> {
    this.logger.info("Stopping worker orchestrator");

    for (const worker of this.workers) {
      await worker.close();
    }

    for (const queue of this.queues.values()) {
      await queue.close();
    }

    this.workers = [];
    this.queues.clear();

    this.logger.info("Worker orchestrator stopped");
  }

  getQueue(name: string): Queue | undefined {
    return this.queues.get(name);
  }

  private startPoolRefreshWorker(): void {
    const worker = new Worker<PoolDataRefreshData>(
      JOB_NAMES.POOL_DATA_REFRESH,
      async (job) => processPoolDataRefresh(job, {
        pipeline: this.pipeline,
        logger: this.logger,
        onSnapshot: (snapshot) => {
          this.snapshotCache.set(snapshot.snapshotId, snapshot);
          // Queue snapshot pinning
          this.queues.get(JOB_NAMES.SNAPSHOT_PIN)?.add("pin", {
            snapshotId: snapshot.snapshotId,
            snapshotData: JSON.stringify(snapshot),
          } satisfies SnapshotPinData);
        },
      }),
      { connection: this.connection, concurrency: 1 },
    );
    this.registerWorkerEvents(worker, JOB_NAMES.POOL_DATA_REFRESH);
    this.workers.push(worker);
  }

  private startStrategyGenerateWorker(): void {
    const worker = new Worker<StrategyGenerateData>(
      JOB_NAMES.STRATEGY_GENERATE,
      async (job) => processStrategyGenerate(job, {
        pipeline: this.pipeline,
        strategyGenerator: this.strategyGenerator,
        logger: this.logger,
        onComplete: (taskId, report, snapshot) => {
          this.taskResults.set(taskId, report);
          this.snapshotCache.set(snapshot.snapshotId, snapshot);
          // Queue delivery with serialized report for IPFS pinning
          this.queues.get(JOB_NAMES.STRATEGY_DELIVER)?.add("deliver", {
            taskId,
            snapshotId: snapshot.snapshotId,
            executionHash: report.executionHash,
            reportJson: JSON.stringify(report),
          } satisfies StrategyDeliverData, { priority: 1 });
        },
      }),
      { connection: this.connection, concurrency: 2 },
    );
    this.registerWorkerEvents(worker, JOB_NAMES.STRATEGY_GENERATE);
    this.workers.push(worker);
  }

  private startStrategyDeliverWorker(): void {
    const worker = new Worker<StrategyDeliverData>(
      JOB_NAMES.STRATEGY_DELIVER,
      async (job) => processStrategyDeliver(job, {
        logger: this.logger,
        // In production: wire up TALClient.confirmTask here
      }),
      { connection: this.connection, concurrency: 1 },
    );
    this.registerWorkerEvents(worker, JOB_NAMES.STRATEGY_DELIVER);
    this.workers.push(worker);
  }

  private startSnapshotPinWorker(): void {
    const worker = new Worker<SnapshotPinData>(
      JOB_NAMES.SNAPSHOT_PIN,
      async (job) => processSnapshotPin(job, {
        logger: this.logger,
        // In production: wire up IPFS pin here
      }),
      { connection: this.connection, concurrency: 1 },
    );
    this.registerWorkerEvents(worker, JOB_NAMES.SNAPSHOT_PIN);
    this.workers.push(worker);
  }

  private startPaymentClaimWorker(): void {
    const worker = new Worker<PaymentClaimData>(
      JOB_NAMES.PAYMENT_CLAIM,
      async (job) => processPaymentClaim(job, {
        logger: this.logger,
        // In production: wire up TALClient.claimFees here
      }),
      { connection: this.connection, concurrency: 1 },
    );
    this.registerWorkerEvents(worker, JOB_NAMES.PAYMENT_CLAIM);
    this.workers.push(worker);
  }

  private startAPYAccuracyCheckWorker(): void {
    const worker = new Worker<APYAccuracyCheckData>(
      JOB_NAMES.APY_ACCURACY_CHECK,
      async (job) => processAPYAccuracyCheck(job, {
        pipeline: this.pipeline,
        logger: this.logger,
        // In production: wire up TALClient.reputation.updateAPYAccuracy here
      }),
      { connection: this.connection, concurrency: 1 },
    );
    this.registerWorkerEvents(worker, JOB_NAMES.APY_ACCURACY_CHECK);
    this.workers.push(worker);
  }

  private startReputationUpdateWorker(): void {
    const worker = new Worker<ReputationUpdateData>(
      JOB_NAMES.REPUTATION_UPDATE,
      async (job) => processReputationUpdate(job, {
        logger: this.logger,
        // In production: pass Redis-backed reputation cache here
      }),
      { connection: this.connection, concurrency: 1 },
    );
    this.registerWorkerEvents(worker, JOB_NAMES.REPUTATION_UPDATE);
    this.workers.push(worker);
  }

  private async scheduleCronJobs(): Promise<void> {
    const refreshQueue = this.queues.get(JOB_NAMES.POOL_DATA_REFRESH);
    if (refreshQueue) {
      await refreshQueue.upsertJobScheduler(
        "pool-refresh-cron",
        { every: this.config.POOL_REFRESH_INTERVAL_MS },
        {
          name: "scheduled-refresh",
          data: { triggeredBy: "cron" as const },
        },
      );
      this.logger.info(
        { intervalMs: this.config.POOL_REFRESH_INTERVAL_MS },
        "Pool refresh cron scheduled",
      );
    }

    // APY accuracy check: once per day (configured via APY_CHECK_INTERVAL_MS)
    const apyQueue = this.queues.get(JOB_NAMES.APY_ACCURACY_CHECK);
    if (apyQueue) {
      await apyQueue.upsertJobScheduler(
        "apy-accuracy-cron",
        { every: this.config.APY_CHECK_INTERVAL_MS },
        {
          name: "scheduled-apy-check",
          data: { taskId: "cron", reportTimestamp: 0, horizon: "7d" as const },
        },
      );
      this.logger.info(
        { intervalMs: this.config.APY_CHECK_INTERVAL_MS },
        "APY accuracy check cron scheduled",
      );
    }
  }

  private registerWorkerEvents(worker: Worker, name: string): void {
    worker.on("completed", (job) => {
      this.logger.info({ worker: name, jobId: job?.id }, "Job completed");
    });
    worker.on("failed", (job, err) => {
      this.logger.error({ worker: name, jobId: job?.id, error: err.message }, "Job failed");
    });
    worker.on("error", (err) => {
      this.logger.error({ worker: name, error: err.message }, "Worker error");
    });
  }
}
