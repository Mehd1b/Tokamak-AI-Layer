import Fastify, { type FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { BondSigner } from '../signing/bond-signer.js';
import { FeedSigner } from '../signing/feed-signer.js';
import { L1Verifier } from '../verification/l1-verifier.js';
import { VaultRegistry } from '../registry/vault-registry.js';
import { MultiVaultListener } from '../relayer/multi-vault-listener.js';
import { RelayExecutor } from '../relayer/relay-executor.js';
import { registerBondAttestation } from './bond-attestation.js';
import { registerPriceFeed } from './price-feed.js';
import * as vaultStore from '../registry/vault-store.js';
import { query } from '../db/client.js';
import pino from 'pino';

const logger = pino({ name: 'server' });

export async function createServer(deps: {
  bondSigner: BondSigner;
  feedSigner: FeedSigner;
  l1Verifier: L1Verifier;
  registry: VaultRegistry;
  listener: MultiVaultListener;
  relayExecutor: RelayExecutor;
}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: 'info' },
  });

  // Rate limiting for bond attestation
  await app.register(import('@fastify/rate-limit'), {
    max: config.rateLimitPerMinute,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      // Rate limit by operator address in body
      const body = request.body as any;
      return body?.operator?.toLowerCase() || request.ip;
    },
    // Only apply to bond attestation
    allowList: (request) => {
      return !request.url.startsWith('/api/v1/attest-bond');
    },
  });

  // ============ Health ============

  app.get('/health', async () => {
    const vaultCount = await vaultStore.getVaultCount();
    const blocks = await deps.listener.getLastRelayedBlocks();
    const pending = await deps.listener.getPendingCount();

    return {
      status: 'healthy',
      registeredVaults: vaultCount,
      lastRelayedBlock: {
        hyper: blocks.hyper.toString(),
        ethereum: blocks.ethereum.toString(),
      },
      pendingRelays: pending,
      signers: {
        bondOracle: deps.bondSigner.address,
        priceOracle: deps.feedSigner.address,
        relayer: deps.relayExecutor.address,
      },
    };
  });

  // ============ Oracle Endpoints ============

  registerBondAttestation(app, deps.bondSigner, deps.l1Verifier, deps.registry);
  registerPriceFeed(app, deps.feedSigner, deps.registry);

  // ============ Admin Endpoints ============

  // Simple API key auth for admin routes
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api/v1/admin/')) {
      const apiKey = request.headers['x-api-key'];
      if (!config.adminApiKey || apiKey !== config.adminApiKey) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
    }
  });

  app.get('/api/v1/admin/vaults', async () => {
    const vaults = await deps.registry.getVaults();
    return { vaults };
  });

  app.get<{ Querystring: { status?: string } }>('/api/v1/admin/relays', async (request) => {
    const status = request.query.status || 'pending';
    const { rows } = await query(
      'SELECT * FROM relayed_events WHERE status = $1 ORDER BY created_at DESC LIMIT 100',
      [status]
    );
    return { relays: rows };
  });

  app.post<{ Querystring: { vault?: string; fromBlock?: string; chainId?: string } }>(
    '/api/v1/admin/replay',
    async (request, reply) => {
      const { vault, fromBlock, chainId } = request.query;
      if (!vault) {
        return reply.status(400).send({ error: 'vault query param required' });
      }

      const chain = chainId ? parseInt(chainId) : 999;
      const from = fromBlock ? BigInt(fromBlock) : undefined;

      await deps.listener.replayFrom(vault, chain, from);

      return { status: 'replay started', vault, fromBlock: from?.toString() ?? 'last checkpoint' };
    }
  );

  return app;
}
