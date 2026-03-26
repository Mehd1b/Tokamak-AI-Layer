import 'dotenv/config';
import { config } from './config.js';
import { createBot, stopBot } from './bot.js';
import { startMonitor, stopMonitor } from './monitor.js';
import { closeDb } from './db.js';

async function main(): Promise<void> {
  console.log('=== Tokagent Notification Service ===');
  console.log(`RPC:  ${config.rpcUrl}`);
  console.log(`Chain: ${config.chainId}`);
  console.log(`Poll:  ${config.pollIntervalMs}ms`);
  console.log('');

  // 1. Start the Telegram bot (handles commands)
  createBot(config.telegramBotToken);

  // 2. Start the on-chain event monitor (polls for new blocks)
  startMonitor();

  console.log('Service running. Press Ctrl+C to stop.');
}

// Graceful shutdown
function shutdown(signal: string): void {
  console.log(`\n[${signal}] Shutting down...`);
  stopMonitor();
  stopBot();
  closeDb();
  console.log('Shutdown complete.');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
