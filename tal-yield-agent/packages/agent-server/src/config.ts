import { z } from "zod";

const ConfigSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),

  // Chain
  RPC_URL: z.string().default("https://rpc.thanos-sepolia.tokamak.network"),

  // TAL Agent
  AGENT_ID: z.coerce.bigint().optional(),
  OPERATOR_PRIVATE_KEY: z.string().optional(),

  // Redis (for worker integration)
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // IPFS
  IPFS_GATEWAY: z.string().default("https://gateway.pinata.cloud"),

  // API Keys (comma-separated)
  API_KEYS: z.string().default(""),

  // Logging
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  return ConfigSchema.parse(process.env);
}
