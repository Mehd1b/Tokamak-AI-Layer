import { z } from "zod";
import { OPTIMISM_SEPOLIA_ADDRESSES } from "@tal-yield-agent/shared";

const ConfigSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),

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

  // Redis (for worker integration)
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // IPFS
  IPFS_GATEWAY: z.string().default("https://gateway.pinata.cloud"),

  // API Keys (comma-separated)
  API_KEYS: z.string().default(""),

  // EIP-712 wallet signature auth (set to "true" to enable on write endpoints)
  EIP712_AUTH: z
    .string()
    .default("false")
    .transform((v) => v === "true"),

  // Logging
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  return ConfigSchema.parse(process.env);
}
