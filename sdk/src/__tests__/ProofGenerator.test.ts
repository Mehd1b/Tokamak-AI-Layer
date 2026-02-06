import { describe, it, expect } from 'vitest';
import { ProofGenerator } from '../zk/ProofGenerator';
import type { ZKProof } from '../types';

describe('ProofGenerator', () => {
  const generator = new ProofGenerator();

  describe('isAvailable', () => {
    it('returns false without circuit paths', () => {
      expect(generator.isAvailable).toBe(false);
    });

    it('returns false with partial config', () => {
      const partial = new ProofGenerator({
        circuitWasmPath: '/path/to/wasm',
      });
      expect(partial.isAvailable).toBe(false);
    });

    it('returns true with full config', () => {
      const full = new ProofGenerator({
        circuitWasmPath: '/path/to/wasm',
        zkeyPath: '/path/to/zkey',
      });
      expect(full.isAvailable).toBe(true);
    });
  });

  describe('generateIdentityCommitment()', () => {
    it('throws NotImplemented error (Sprint 3 postponed)', async () => {
      await expect(
        generator.generateIdentityCommitment({
          name: 'Test',
          capabilities: ['text-gen'],
          organization: 'TestOrg',
        }),
      ).rejects.toThrow('Sprint 3 Circom circuits');
    });
  });

  describe('generateCapabilityProof()', () => {
    it('throws NotImplemented error (Sprint 3 postponed)', async () => {
      await expect(
        generator.generateCapabilityProof(
          { name: 0n, capabilities: [], organization: 0n, nonce: 0n },
          '0x0000000000000000000000000000000000000000000000000000000000000000',
          'text-gen',
        ),
      ).rejects.toThrow('Sprint 3 Circom circuits');
    });
  });

  describe('generateReputationThresholdProof()', () => {
    it('throws NotImplemented error (Sprint 3 postponed)', async () => {
      await expect(
        generator.generateReputationThresholdProof(85, 70, 1n, {
          root: '0x0000000000000000000000000000000000000000000000000000000000000000',
          siblings: [],
          pathIndices: [],
        }),
      ).rejects.toThrow('Sprint 3 Circom circuits');
    });
  });

  describe('verifyProof()', () => {
    it('throws NotImplemented error (Sprint 3 postponed)', async () => {
      const proof: ZKProof = {
        pi_a: ['1', '2'],
        pi_b: [
          ['3', '4'],
          ['5', '6'],
        ],
        pi_c: ['7', '8'],
        protocol: 'groth16',
        curve: 'bn128',
      };

      await expect(
        generator.verifyProof(proof, [1n, 2n], {}),
      ).rejects.toThrow('Sprint 3 verification keys');
    });
  });

  describe('encodeProof() / decodeProof()', () => {
    const sampleProof: ZKProof = {
      pi_a: ['1', '2'],
      pi_b: [
        ['3', '4'],
        ['5', '6'],
      ],
      pi_c: ['7', '8'],
      protocol: 'groth16',
      curve: 'bn128',
    };

    it('encodes a proof to hex string', () => {
      const encoded = generator.encodeProof(sampleProof);
      expect(encoded).toMatch(/^0x[0-9a-f]+$/);
    });

    it('roundtrips encode/decode correctly', () => {
      const encoded = generator.encodeProof(sampleProof);
      const decoded = generator.decodeProof(encoded);

      expect(decoded.pi_a).toEqual(sampleProof.pi_a);
      expect(decoded.pi_b).toEqual(sampleProof.pi_b);
      expect(decoded.pi_c).toEqual(sampleProof.pi_c);
      expect(decoded.protocol).toBe('groth16');
      expect(decoded.curve).toBe('bn128');
    });

    it('encodes proof components as 64-char hex chunks', () => {
      const encoded = generator.encodeProof(sampleProof);
      // 8 components (2 + 4 + 2) * 64 chars each + 0x prefix
      expect(encoded.length).toBe(2 + 8 * 64);
    });

    it('handles large numbers correctly', () => {
      const largeProof: ZKProof = {
        pi_a: [
          '21888242871839275222246405745257275088696311157297823662689037894645226208583',
          '21888242871839275222246405745257275088696311157297823662689037894645226208582',
        ],
        pi_b: [
          [
            '10505242626370262277552901082094356697409835680220590971873171140371331206856',
            '8443984746853142084565830287082785486119930084481314399989876543210',
          ],
          [
            '3097419028245562908120298244273690630516489158345771336259905981',
            '12345678901234567890',
          ],
        ],
        pi_c: ['999999999999999999999', '888888888888888888888'],
        protocol: 'groth16',
        curve: 'bn128',
      };

      const encoded = generator.encodeProof(largeProof);
      expect(encoded).toMatch(/^0x[0-9a-f]+$/);
    });
  });
});
