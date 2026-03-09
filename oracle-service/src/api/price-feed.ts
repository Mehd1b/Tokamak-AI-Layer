import type { FastifyInstance } from 'fastify';
import { type Address, type Hex, isAddress, isHex } from 'viem';
import { FeedSigner } from '../signing/feed-signer.js';
import { VaultRegistry } from '../registry/vault-registry.js';
import { config } from '../config.js';
import pino from 'pino';

const logger = pino({ name: 'price-feed' });

interface SignFeedBody {
  feedHash: string;
  timestamp: string;
  chainId: string;
  vaultAddress: string;
}

export function registerPriceFeed(
  app: FastifyInstance,
  feedSigner: FeedSigner,
  registry: VaultRegistry
): void {
  app.post<{ Body: SignFeedBody }>('/api/v1/sign-feed', async (request, reply) => {
    const { feedHash, timestamp, chainId, vaultAddress } = request.body;

    // Validate inputs
    if (!feedHash || !isHex(feedHash) || feedHash.length !== 66) {
      return reply.status(400).send({ error: 'Invalid feedHash: must be 32-byte hex string' });
    }
    if (!vaultAddress || !isAddress(vaultAddress)) {
      return reply.status(400).send({ error: 'Invalid vaultAddress' });
    }
    if (!timestamp || !chainId) {
      return reply.status(400).send({ error: 'Missing required fields: timestamp, chainId' });
    }

    const timestampBig = BigInt(timestamp);
    const chainIdBig = BigInt(chainId);

    // Check vault is registered
    const vaultChainId = Number(chainIdBig);
    let isRegistered = await registry.isRegisteredVault(vaultAddress, 999);
    if (!isRegistered) {
      isRegistered = await registry.isRegisteredVault(vaultAddress, 1);
    }

    if (!isRegistered) {
      return reply.status(403).send({
        error: 'Vault not registered',
        detail: 'The vault address is not a registered vault deployed by VaultFactory',
      });
    }

    // Validate timestamp freshness
    const now = BigInt(Math.floor(Date.now() / 1000));
    const age = now - timestampBig;
    if (age < 0n) {
      return reply.status(400).send({ error: 'Timestamp is in the future' });
    }
    if (age > BigInt(config.maxOracleAge)) {
      return reply.status(400).send({
        error: 'Timestamp too old',
        detail: `Age ${age}s exceeds maxOracleAge ${config.maxOracleAge}s`,
      });
    }

    // Sign feed
    const result = await feedSigner.signFeed({
      feedHash: feedHash as Hex,
      timestamp: timestampBig,
      chainId: chainIdBig,
      vaultAddress: vaultAddress as Address,
    });

    return reply.send({
      signature: result.signature,
      signer: result.signer,
    });
  });
}
