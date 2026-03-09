import 'dotenv/config';
import { config } from './config.js';
import { runMigrations } from './db/migrate.js';
import { closePool } from './db/client.js';
import { BondSigner } from './signing/bond-signer.js';
import { FeedSigner } from './signing/feed-signer.js';
import { L1Verifier } from './verification/l1-verifier.js';
import { VaultRegistry } from './registry/vault-registry.js';
import { RelayExecutor } from './relayer/relay-executor.js';
import { MultiVaultListener } from './relayer/multi-vault-listener.js';
import { createServer } from './api/server.js';
import pino from 'pino';

const logger = pino({ name: 'oracle-service' });

async function main(): Promise<void> {
  logger.info('Starting oracle service...');

  // 1. Run database migrations
  logger.info('Running database migrations...');
  await runMigrations();

  // 2. Initialize signers
  const bondSigner = new BondSigner(config.bondOraclePrivateKey);
  const feedSigner = new FeedSigner(config.priceOraclePrivateKey);
  const l1Verifier = new L1Verifier();
  const relayExecutor = new RelayExecutor();

  // 3. Start vault registry (scans historical + subscribes to new)
  const registry = new VaultRegistry();
  await registry.start();

  // 4. Start multi-vault listener (relayer)
  const listener = new MultiVaultListener(relayExecutor);
  const vaults = await registry.getVaults();
  await listener.start(vaults);

  // Wire up dynamic vault discovery → relayer
  registry.setNewVaultCallback((vault) => {
    listener.addVault(vault).catch((err) => {
      logger.error({ err, vault: vault.address }, 'Failed to add vault to listener');
    });
  });

  // 5. Start HTTP server
  const server = await createServer({
    bondSigner,
    feedSigner,
    l1Verifier,
    registry,
    listener,
    relayExecutor,
  });

  await server.listen({ port: config.port, host: '0.0.0.0' });
  logger.info({ port: config.port }, 'Oracle service listening');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    listener.stop();
    registry.stop();
    await server.close();
    await closePool();
    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Fatal error');
  process.exit(1);
});
