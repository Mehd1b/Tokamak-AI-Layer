import { z } from "zod";

const ConfigSchema = z.object({
  // Redis
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Chain
  RPC_URL: z.string().default("https://rpc.thanos-sepolia.tokamak.network"),

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
