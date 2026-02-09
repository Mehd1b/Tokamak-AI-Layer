import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const config = {
  // LLM
  OPENAI_API_KEY: required('OPENAI_API_KEY'),
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || '',
  LLM_MODEL: optional('LLM_MODEL', 'gpt-5.2'),

  // Server
  PORT: parseInt(optional('PORT', '3001'), 10),
  HOST: optional('HOST', '0.0.0.0'),

  // Blockchain
  RPC_URL: optional('RPC_URL', 'https://rpc.thanos-sepolia.tokamak.network'),
  PRIVATE_KEY: process.env.PRIVATE_KEY || '',
  CHAIN_ID: parseInt(optional('CHAIN_ID', '111551119090'), 10),

  // Contract addresses (Thanos Sepolia - update after deployment)
  IDENTITY_REGISTRY: optional(
    'IDENTITY_REGISTRY',
    '0x0000000000000000000000000000000000000000',
  ),
  REPUTATION_REGISTRY: optional(
    'REPUTATION_REGISTRY',
    '0x0000000000000000000000000000000000000000',
  ),
  VALIDATION_REGISTRY: optional(
    'VALIDATION_REGISTRY',
    '0x0000000000000000000000000000000000000000',
  ),
  TASK_FEE_ESCROW: optional(
    'TASK_FEE_ESCROW',
    '0x0000000000000000000000000000000000000000',
  ),

  // Storage
  STORAGE_DIR: optional('STORAGE_DIR', './data'),
} as const;
