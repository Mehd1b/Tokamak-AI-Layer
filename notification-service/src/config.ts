import 'dotenv/config';

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env: ${key}`);
  return val;
}

export const config = {
  telegramBotToken: requireEnv('TELEGRAM_BOT_TOKEN'),
  rpcUrl: process.env.RPC_URL || 'https://rpc.hyperliquid.xyz/evm',
  chainId: parseInt(process.env.CHAIN_ID || '999'),
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '15000'),
} as const;
