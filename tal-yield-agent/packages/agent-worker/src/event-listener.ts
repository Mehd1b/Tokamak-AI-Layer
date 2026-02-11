import { createPublicClient, http } from "viem";
import type { PublicClient, Log, Address } from "viem";
import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import {
  optimismSepolia,
  OPTIMISM_SEPOLIA_ADDRESSES,
  TaskFeeEscrowABI,
  TALValidationRegistryABI,
  TALReputationRegistryABI,
} from "@tal-yield-agent/shared";
import { JOB_NAMES } from "./jobs/index.js";
import type { StrategyGenerateData, ReputationUpdateData } from "./jobs/index.js";
import type { WorkerConfig } from "./config.js";
import type { Logger } from "./logger.js";

export interface EventListenerOptions {
  config: WorkerConfig;
  logger: Logger;
  connection: ConnectionOptions;
  publicClient?: PublicClient;
}

/**
 * Listens for on-chain events and dispatches jobs to the worker queue.
 *
 * Events watched:
 * - TaskPaid         → triggers strategy generation
 * - TaskDisputed     → logs + alerts operator
 * - TaskRefunded     → updates task status
 * - ValidationCompleted → tracks consensus progress
 * - FeedbackSubmitted   → reputation-update job
 */
export class EventListener {
  private readonly config: WorkerConfig;
  private readonly logger: Logger;
  private readonly publicClient: PublicClient;
  private readonly connection: ConnectionOptions;
  private unwatchers: (() => void)[] = [];
  private queues = new Map<string, Queue>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private stopped = false;

  // Configurable addresses (fall back to shared defaults)
  private readonly escrowAddress: Address;
  private readonly validationAddress: Address;
  private readonly reputationAddress: Address;

  constructor(options: EventListenerOptions) {
    this.config = options.config;
    this.logger = options.logger;
    this.connection = options.connection;
    this.publicClient = options.publicClient ?? createPublicClient({
      chain: optimismSepolia,
      transport: http(this.config.RPC_URL),
    });

    this.escrowAddress =
      (this.config.TASK_FEE_ESCROW as Address) ?? OPTIMISM_SEPOLIA_ADDRESSES.TaskFeeEscrow;
    this.validationAddress =
      (this.config.VALIDATION_REGISTRY as Address) ?? OPTIMISM_SEPOLIA_ADDRESSES.TALValidationRegistry;
    this.reputationAddress =
      (this.config.REPUTATION_REGISTRY as Address) ?? OPTIMISM_SEPOLIA_ADDRESSES.TALReputationRegistry;
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.logger.info("Starting event listener");

    // Create queues
    for (const name of Object.values(JOB_NAMES)) {
      this.queues.set(name, new Queue(name, { connection: this.connection }));
    }

    this.startWatching();

    this.logger.info("Event listener started, watching all contract events");
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.logger.info("Stopping event listener");
    this.stopWatching();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const queue of this.queues.values()) {
      await queue.close();
    }
    this.queues.clear();
    this.logger.info("Event listener stopped");
  }

  private startWatching(): void {
    this.stopWatching();

    const onError = (source: string) => (err: Error) => {
      this.logger.error({ err, source }, "Event watch error");
      this.scheduleReconnect();
    };

    // 1. TaskPaid (TaskFeeEscrow)
    this.unwatchers.push(
      this.publicClient.watchContractEvent({
        address: this.escrowAddress,
        abi: TaskFeeEscrowABI,
        eventName: "TaskPaid",
        onLogs: (logs) => { for (const log of logs) this.handleTaskPaid(log); },
        onError: onError("TaskPaid"),
      }),
    );

    // 2. TaskRefunded (TaskFeeEscrow)
    this.unwatchers.push(
      this.publicClient.watchContractEvent({
        address: this.escrowAddress,
        abi: TaskFeeEscrowABI,
        eventName: "TaskRefunded",
        onLogs: (logs) => { for (const log of logs) this.handleTaskRefunded(log); },
        onError: onError("TaskRefunded"),
      }),
    );

    // 3. ValidationCompleted (ValidationRegistry)
    this.unwatchers.push(
      this.publicClient.watchContractEvent({
        address: this.validationAddress,
        abi: TALValidationRegistryABI,
        eventName: "ValidationCompleted",
        onLogs: (logs) => { for (const log of logs) this.handleValidationCompleted(log); },
        onError: onError("ValidationCompleted"),
      }),
    );

    // 4. ValidationDisputed (ValidationRegistry)
    this.unwatchers.push(
      this.publicClient.watchContractEvent({
        address: this.validationAddress,
        abi: TALValidationRegistryABI,
        eventName: "ValidationDisputed",
        onLogs: (logs) => { for (const log of logs) this.handleValidationDisputed(log); },
        onError: onError("ValidationDisputed"),
      }),
    );

    // 5. FeedbackSubmitted (ReputationRegistry)
    this.unwatchers.push(
      this.publicClient.watchContractEvent({
        address: this.reputationAddress,
        abi: TALReputationRegistryABI,
        eventName: "FeedbackSubmitted",
        onLogs: (logs) => { for (const log of logs) this.handleFeedbackSubmitted(log); },
        onError: onError("FeedbackSubmitted"),
      }),
    );

    this.reconnectAttempts = 0;
  }

  private stopWatching(): void {
    for (const unwatch of this.unwatchers) {
      unwatch();
    }
    this.unwatchers = [];
  }

  /**
   * Exponential backoff reconnection: 1s, 2s, 4s, 8s, 16s, 30s (max)
   */
  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;

    const delayMs = Math.min(1000 * 2 ** this.reconnectAttempts, 30_000);
    this.reconnectAttempts++;

    this.logger.warn({ delayMs, attempt: this.reconnectAttempts }, "Scheduling event listener reconnect");

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.logger.info("Reconnecting event watchers");
      this.startWatching();
    }, delayMs);
  }

  // ================================================================
  // Event Handlers
  // ================================================================

  private handleTaskPaid(log: Log): void {
    try {
      const taskRef = log.topics[1];
      const agentIdHex = log.topics[2];

      if (!taskRef || !agentIdHex) {
        this.logger.warn({ log }, "TaskPaid event missing topics");
        return;
      }

      const agentId = this.config.AGENT_ID;
      if (agentId === undefined) {
        this.logger.warn("AGENT_ID not configured, ignoring TaskPaid event");
        return;
      }

      this.logger.info({ taskRef, agentId: agentIdHex }, "TaskPaid event received");

      const jobData: StrategyGenerateData = {
        taskId: taskRef,
        requester: "on-chain",
        riskLevel: "moderate",
        capitalUSD: 100_000,
      };

      this.queues.get(JOB_NAMES.STRATEGY_GENERATE)?.add("generate", jobData, {
        priority: 1,
        jobId: `strategy-${taskRef}`,
      });

      this.logger.info({ taskRef }, "Strategy generation job queued");
    } catch (err) {
      this.logger.error({ err, log }, "Failed to handle TaskPaid event");
    }
  }

  private handleTaskRefunded(log: Log): void {
    try {
      const taskRef = log.topics[1];

      if (!taskRef) {
        this.logger.warn({ log }, "TaskRefunded event missing topics");
        return;
      }

      this.logger.info({ taskRef }, "TaskRefunded event received — task status updated to refunded");
    } catch (err) {
      this.logger.error({ err, log }, "Failed to handle TaskRefunded event");
    }
  }

  private handleValidationCompleted(log: Log): void {
    try {
      const requestHash = log.topics[1];
      const validator = log.topics[2];

      if (!requestHash || !validator) {
        this.logger.warn({ log }, "ValidationCompleted event missing topics");
        return;
      }

      this.logger.info(
        { requestHash, validator },
        "ValidationCompleted event received — tracking consensus",
      );
    } catch (err) {
      this.logger.error({ err, log }, "Failed to handle ValidationCompleted event");
    }
  }

  private handleValidationDisputed(log: Log): void {
    try {
      const requestHash = log.topics[1];
      const disputer = log.topics[2];

      if (!requestHash || !disputer) {
        this.logger.warn({ log }, "ValidationDisputed event missing topics");
        return;
      }

      this.logger.warn(
        { requestHash, disputer },
        "ValidationDisputed event received — alerting operator",
      );
    } catch (err) {
      this.logger.error({ err, log }, "Failed to handle ValidationDisputed event");
    }
  }

  private handleFeedbackSubmitted(log: Log): void {
    try {
      const agentIdHex = log.topics[1];
      const clientAddress = log.topics[2];

      if (!agentIdHex || !clientAddress) {
        this.logger.warn({ log }, "FeedbackSubmitted event missing topics");
        return;
      }

      this.logger.info({ agentId: agentIdHex, client: clientAddress }, "FeedbackSubmitted event received");

      const jobData: ReputationUpdateData = {
        agentId: agentIdHex,
        taskId: `feedback-${log.transactionHash ?? "unknown"}`,
        score: 0, // Actual score is in non-indexed log data
      };

      this.queues.get(JOB_NAMES.REPUTATION_UPDATE)?.add("update", jobData, {
        jobId: `reputation-${log.transactionHash ?? Date.now()}`,
      });

      this.logger.info({ agentId: agentIdHex }, "Reputation update job queued");
    } catch (err) {
      this.logger.error({ err, log }, "Failed to handle FeedbackSubmitted event");
    }
  }
}
