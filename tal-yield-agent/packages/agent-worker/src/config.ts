import { z } from "zod";
import { OPTIMISM_SEPOLIA_ADDRESSES } from "@tal-yield-agent/shared";

const ConfigSchema = z.object({
  // Redis
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Chain
  RPC_URL: z.string().default("https://opt-sepolia.g.alchemy.com/v2/N-Gnpjy1WvCfokwj6fiOfuAVL_At6IvE"),

  // Contract addresses (override defaults from shared package)
  IDENTITY_REGISTRY: z.string().default(OPTIMISM_SEPOLIA_ADDRESSES.TALIdentityRegistry),
  REPUTATION_REGISTRY: z.string().default(OPTIMISM_SEPOLIA_ADDRESSES.TALReputationRegistry),
  VALIDATION_REGISTRY: z.string().default(OPTIMISM_SEPOLIA_ADDRESSES.TALValidationRegistry),
  TASK_FEE_ESCROW: z.string().default(OPTIMISM_SEPOLIA_ADDRESSES.TaskFeeEscrow),
  STAKING_INTEGRATION_MODULE: z.string().default(OPTIMISM_SEPOLIA_ADDRESSES.StakingIntegrationModule),

  // TAL Agent
  AGENT_ID: z.coerce.bigint().optional(),
  OPERATOR_PRIVATE_KEY: z.string().optional(),

  // IPFS
  IPFS_GATEWAY: z.string().default("https://gateway.pinata.cloud"),

  // Cron intervals
  POOL_REFRESH_INTERVAL_MS: z.coerce.number().default(5 * 60 * 1000), // 5 min
  APY_CHECK_INTERVAL_MS: z.coerce.number().default(24 * 60 * 60 * 1000), // 1 day

  // Logging
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type WorkerConfig = z.infer<typeof ConfigSchema>;

export function loadWorkerConfig(): WorkerConfig {
  return ConfigSchema.parse(process.env);
}
