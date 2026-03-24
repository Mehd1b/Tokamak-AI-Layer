import type { FastifyInstance } from 'fastify';
import { type Address, isAddress, createPublicClient, http, parseAbi } from 'viem';
import { BondSigner } from '../signing/bond-signer.js';
import { L1Verifier } from '../verification/l1-verifier.js';
import { VaultRegistry } from '../registry/vault-registry.js';
import { config } from '../config.js';
import pino from 'pino';

const logger = pino({ name: 'bond-attestation' });

interface AttestBondBody {
  operator: string;
  vault: string;
  nonce: string;
  amount: string;
  chainId: string;
}

export function registerBondAttestation(
  app: FastifyInstance,
  bondSigner: BondSigner,
  l1Verifier: L1Verifier,
  registry: VaultRegistry
): void {
  app.post<{ Body: AttestBondBody }>('/api/v1/attest-bond', async (request, reply) => {
    const { operator, vault, nonce, amount, chainId } = request.body;

    // Validate inputs
    if (!operator || !isAddress(operator)) {
      return reply.status(400).send({ error: 'Invalid operator address' });
    }
    if (!vault || !isAddress(vault)) {
      return reply.status(400).send({ error: 'Invalid vault address' });
    }
    if (!nonce || !amount || !chainId) {
      return reply.status(400).send({ error: 'Missing required fields: nonce, amount, chainId' });
    }

    const nonceBig = BigInt(nonce);
    const amountBig = BigInt(amount);
    const chainIdBig = BigInt(chainId);

    // Check vault is registered: first DB (event-scanned), then on-chain fallback
    const chainsToCheck = [999, 998, 1];
    let isRegistered = false;
    for (const cid of chainsToCheck) {
      if (await registry.isRegisteredVault(vault, cid)) {
        isRegistered = true;
        break;
      }
    }

    // On-chain fallback: query isDeployedVault() directly on each factory
    if (!isRegistered) {
      const isDeployedAbi = parseAbi(['function isDeployedVault(address) view returns (bool)']);
      const factoryChecks: { rpc: string; factory: string }[] = [
        { rpc: config.hyperRpcUrl, factory: config.vaultFactoryHyper },
      ];
      if (config.hyperTestnetRpcUrl && config.vaultFactoryHyperTestnet) {
        factoryChecks.push({ rpc: config.hyperTestnetRpcUrl, factory: config.vaultFactoryHyperTestnet });
      }
      factoryChecks.push({ rpc: config.ethRpcUrl, factory: config.vaultFactoryEth });

      for (const { rpc, factory } of factoryChecks) {
        try {
          const client = createPublicClient({ transport: http(rpc) });
          const deployed = await client.readContract({
            address: factory as Address,
            abi: isDeployedAbi,
            functionName: 'isDeployedVault',
            args: [vault as Address],
          });
          if (deployed) {
            isRegistered = true;
            logger.info({ vault, factory }, 'Vault verified on-chain (not in DB yet)');
            break;
          }
        } catch (err) {
          logger.debug({ err, factory }, 'On-chain vault check failed, trying next');
        }
      }
    }

    if (!isRegistered) {
      logger.warn({ vault }, 'Bond attestation rejected: vault not registered on any factory');
      return reply.status(403).send({
        error: 'Vault not registered',
        detail: 'The vault address is not deployed by any known VaultFactory',
      });
    }

    // Verify bond on L1
    const verification = await l1Verifier.verifyBondLocked(
      operator as Address,
      vault as Address,
      nonceBig,
      amountBig
    );

    if (!verification.valid) {
      logger.warn({ operator, vault, nonce, reason: verification.reason }, 'Bond verification failed');
      return reply.status(400).send({
        error: 'Bond verification failed',
        detail: verification.reason,
      });
    }

    // Sign attestation
    const result = await bondSigner.signBondAttestation({
      operator: operator as Address,
      vault: vault as Address,
      nonce: nonceBig,
      amount: amountBig,
      chainId: chainIdBig,
    });

    return reply.send({
      attestation: result.attestation,
      bondHash: result.bondHash,
      signer: result.signer,
    });
  });
}
