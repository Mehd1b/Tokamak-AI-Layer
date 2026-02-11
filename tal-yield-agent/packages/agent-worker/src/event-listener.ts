import { createPublicClient, http, parseAbiItem } from "viem";
import type { PublicClient, Log } from "viem";
import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { thanosSepolia, THANOS_SEPOLIA_ADDRESSES, TaskFeeEscrowABI } from "@tal-yield-agent/shared";
import { JOB_NAMES } from "./jobs/index.js";
import type { StrategyGenerateData, PaymentClaimData } from "./jobs/index.js";
import type { WorkerConfig } from "./config.js";
import type { Logger } from "./logger.js";

// ABI event signatures
const TASK_PAID_EVENT = parseAbiItem(
  "event TaskPaid(bytes32 indexed taskRef, uint256 indexed agentId, address payer, uint256 amount)",
);

const TASK_CONFIRMED_EVENT = parseAbiItem(
  "event TaskConfirmed(bytes32 indexed taskRef, uint256 indexed agentId)",
);

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
 * - TaskPaid → triggers strategy generation
 * - TaskConfirmed → triggers payment claim (after dispute window)
 */
export class EventListener {
  private readonly config: WorkerConfig;
  private readonly logger: Logger;
  private readonly publicClient: PublicClient;
  private readonly connection: ConnectionOptions;
  private unwatch: (() => void) | null = null;
  private strategyQueue: Queue | null = null;
  private paymentQueue: Queue | null = null;

  constructor(options: EventListenerOptions) {
    this.config = options.config;
    this.logger = options.logger;
    this.connection = options.connection;
    this.publicClient = options.publicClient ?? createPublicClient({
      chain: thanosSepolia,
      transport: http(this.config.RPC_URL),
    });
  }

  async start(): Promise<void> {
    this.logger.info("Starting event listener");

    this.strategyQueue = new Queue(JOB_NAMES.STRATEGY_GENERATE, { connection: this.connection });
    this.paymentQueue = new Queue(JOB_NAMES.PAYMENT_CLAIM, { connection: this.connection });

    // Watch TaskPaid events
    this.unwatch = this.publicClient.watchContractEvent({
      address: THANOS_SEPOLIA_ADDRESSES.TaskFeeEscrow,
      abi: TaskFeeEscrowABI,
      eventName: "TaskPaid",
      onLogs: (logs) => {
        for (const log of logs) {
          this.handleTaskPaid(log);
        }
      },
      onError: (err) => {
        this.logger.error({ err }, "Event watch error");
      },
    });

    this.logger.info(
      { escrowAddress: THANOS_SEPOLIA_ADDRESSES.TaskFeeEscrow },
      "Event listener started, watching TaskPaid events",
    );
  }

  async stop(): Promise<void> {
    this.logger.info("Stopping event listener");
    this.unwatch?.();
    this.unwatch = null;
    await this.strategyQueue?.close();
    await this.paymentQueue?.close();
    this.strategyQueue = null;
    this.paymentQueue = null;
    this.logger.info("Event listener stopped");
  }

  private handleTaskPaid(log: Log): void {
    try {
      // Extract event args from log topics
      const taskRef = log.topics[1]; // indexed bytes32
      const agentIdHex = log.topics[2]; // indexed uint256

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

      // Queue strategy generation with default moderate profile
      // In production, the requester would specify the risk level in the transaction
      const jobData: StrategyGenerateData = {
        taskId: taskRef,
        requester: "on-chain",
        riskLevel: "moderate",
        capitalUSD: 100_000, // Default, would be derived from payment amount
      };

      this.strategyQueue?.add("generate", jobData, {
        priority: 1, // High priority
        jobId: `strategy-${taskRef}`, // Prevent duplicates
      });

      this.logger.info({ taskRef }, "Strategy generation job queued");
    } catch (err) {
      this.logger.error({ err, log }, "Failed to handle TaskPaid event");
    }
  }
}
