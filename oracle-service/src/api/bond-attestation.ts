import type { FastifyInstance } from 'fastify';
import { type Address, isAddress } from 'viem';
import { BondSigner } from '../signing/bond-signer.js';
import { L1Verifier } from '../verification/l1-verifier.js';
import { VaultRegistry } from '../registry/vault-registry.js';
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

    // Check vault is registered (across all chains)
    const vaultChainId = Number(chainIdBig) === 1 ? 1 : 999;
    // The vault lives on HyperEVM typically, but we check all registered chains
    let isRegistered = await registry.isRegisteredVault(vault, 999);
    if (!isRegistered) {
      isRegistered = await registry.isRegisteredVault(vault, 1);
    }

    if (!isRegistered) {
      logger.warn({ vault }, 'Bond attestation rejected: vault not registered');
      return reply.status(403).send({
        error: 'Vault not registered',
        detail: 'The vault address is not a registered OptimisticKernelVault deployed by VaultFactory',
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
