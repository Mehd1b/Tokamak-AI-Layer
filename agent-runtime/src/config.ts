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
  RPC_URL: optional('RPC_URL', 'https://opt-sepolia.g.alchemy.com/v2/N-Gnpjy1WvCfokwj6fiOfuAVL_At6IvE'),
  PRIVATE_KEY: process.env.PRIVATE_KEY || '',
  CHAIN_ID: parseInt(optional('CHAIN_ID', '11155420'), 10),

  // Contract addresses (Optimism Sepolia)
  IDENTITY_REGISTRY: optional(
    'IDENTITY_REGISTRY',
    '0x3f89CD27fD877827E7665A9883b3c0180E22A525',
  ),
  REPUTATION_REGISTRY: optional(
    'REPUTATION_REGISTRY',
    '0x0052258E517835081c94c0B685409f2EfC4D502b',
  ),
  VALIDATION_REGISTRY: optional(
    'VALIDATION_REGISTRY',
    '0x09447147C6E75a60A449f38532F06E19F5F632F3',
  ),
  TASK_FEE_ESCROW: optional(
    'TASK_FEE_ESCROW',
    '0x8462C8DB2ae0eE76744343c57DCC071AdC43A9E4',
  ),

  // Storage
  STORAGE_DIR: optional('STORAGE_DIR', './data'),
} as const;
