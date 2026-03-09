import { describe, it, expect } from 'vitest';
import {
  encodePacked,
  keccak256,
  recoverAddress,
  type Hex,
  type Address,
  hashMessage,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { BondSigner } from '../signing/bond-signer.js';
import { FeedSigner } from '../signing/feed-signer.js';

// Test private key (DO NOT use in production)
const TEST_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
const TEST_ACCOUNT = privateKeyToAccount(TEST_KEY);

describe('BondSigner', () => {
  const signer = new BondSigner(TEST_KEY);

  it('produces correct signer address', () => {
    expect(signer.address).toBe(TEST_ACCOUNT.address);
  });

  it('signs bond attestation matching OracleVerifier.requireValidBondAttestation()', async () => {
    const params = {
      operator: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address,
      vault: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address,
      nonce: 1n,
      amount: 1000000000000000000000000000n, // 1e27
      chainId: 1n,
    };

    const result = await signer.signBondAttestation(params);

    // Verify attestation is 65 bytes (130 hex chars + 0x prefix)
    expect(result.attestation).toMatch(/^0x[0-9a-f]{130}$/i);

    // Verify bondHash matches Solidity encodePacked
    // keccak256(abi.encodePacked("BOND_LOCK_V1", operator, vault, nonce, amount, chainId))
    const expectedBondHash = keccak256(
      encodePacked(
        ['string', 'address', 'address', 'uint64', 'uint256', 'uint256'],
        ['BOND_LOCK_V1', params.operator, params.vault, params.nonce, params.amount, params.chainId]
      )
    );
    expect(result.bondHash).toBe(expectedBondHash);

    // Verify packed encoding is exactly 124 bytes
    const packed = encodePacked(
      ['string', 'address', 'address', 'uint64', 'uint256', 'uint256'],
      ['BOND_LOCK_V1', params.operator, params.vault, params.nonce, params.amount, params.chainId]
    );
    // Remove 0x prefix, divide by 2 for byte count
    expect((packed.length - 2) / 2).toBe(124);

    // Verify EIP-191 recovery matches signer
    const ethSignedHash = hashMessage({ raw: result.bondHash as Hex });
    const recovered = await recoverAddress({
      hash: ethSignedHash,
      signature: result.attestation,
    });
    expect(recovered.toLowerCase()).toBe(signer.address.toLowerCase());
  });

  it('uint64 nonce is 8 bytes in encodePacked (not 32)', () => {
    // This is the critical encoding difference from uint256
    const nonce = 42n;

    const packedU64 = encodePacked(['uint64'], [nonce]);
    // uint64 = 8 bytes = 16 hex chars
    expect((packedU64.length - 2) / 2).toBe(8);

    const packedU256 = encodePacked(['uint256'], [nonce]);
    // uint256 = 32 bytes = 64 hex chars
    expect((packedU256.length - 2) / 2).toBe(32);
  });

  it('produces different signatures for different nonces', async () => {
    const base = {
      operator: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address,
      vault: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address,
      amount: 1000000000000000000000000000n,
      chainId: 1n,
    };

    const r1 = await signer.signBondAttestation({ ...base, nonce: 1n });
    const r2 = await signer.signBondAttestation({ ...base, nonce: 2n });

    expect(r1.bondHash).not.toBe(r2.bondHash);
    expect(r1.attestation).not.toBe(r2.attestation);
  });
});

describe('FeedSigner', () => {
  const signer = new FeedSigner(TEST_KEY);

  it('produces correct signer address', () => {
    expect(signer.address).toBe(TEST_ACCOUNT.address);
  });

  it('signs feed matching OracleVerifier.requireValidOracleSignature()', async () => {
    const params = {
      feedHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex,
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
      chainId: 999n,
      vaultAddress: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address,
    };

    const result = await signer.signFeed(params);

    // Verify signature is 65 bytes
    expect(result.signature).toMatch(/^0x[0-9a-f]{130}$/i);

    // Verify domainFeedHash matches Solidity encodePacked
    // keccak256(abi.encodePacked(feedHash, oracleTimestamp, chainId, vaultAddress))
    const expectedDomainHash = keccak256(
      encodePacked(
        ['bytes32', 'uint64', 'uint256', 'address'],
        [params.feedHash, params.timestamp, params.chainId, params.vaultAddress]
      )
    );

    // Verify packed encoding is exactly 92 bytes
    const packed = encodePacked(
      ['bytes32', 'uint64', 'uint256', 'address'],
      [params.feedHash, params.timestamp, params.chainId, params.vaultAddress]
    );
    expect((packed.length - 2) / 2).toBe(92);

    // Verify EIP-191 recovery
    const ethSignedHash = hashMessage({ raw: expectedDomainHash as Hex });
    const recovered = await recoverAddress({
      hash: ethSignedHash,
      signature: result.signature,
    });
    expect(recovered.toLowerCase()).toBe(signer.address.toLowerCase());
  });

  it('uint64 timestamp is 8 bytes in encodePacked', () => {
    const ts = BigInt(Math.floor(Date.now() / 1000));
    const packed = encodePacked(['uint64'], [ts]);
    expect((packed.length - 2) / 2).toBe(8);
  });
});
