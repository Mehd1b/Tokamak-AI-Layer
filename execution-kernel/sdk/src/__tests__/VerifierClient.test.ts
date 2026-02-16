import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VerifierClient } from '../clients/VerifierClient';
import type { ParsedJournal } from '../types';

const VERIFIER_ADDRESS = '0x9Ef5bAB590AFdE8036D57b89ccD2947D4E3b1EFA' as `0x${string}`;
const MOCK_IMAGE_ID = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;
const MOCK_AGENT_ID = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`;
const MOCK_CODE_HASH = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as `0x${string}`;
const MOCK_CONSTRAINT_HASH = '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' as `0x${string}`;
const MOCK_INPUT_ROOT = '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd' as `0x${string}`;
const MOCK_INPUT_COMMITMENT = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as `0x${string}`;
const MOCK_ACTION_COMMITMENT = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as `0x${string}`;

function createMockPublicClient() {
  return {
    readContract: vi.fn(),
  } as any;
}

const MOCK_PARSED_JOURNAL = {
  agentId: MOCK_AGENT_ID,
  agentCodeHash: MOCK_CODE_HASH,
  constraintSetHash: MOCK_CONSTRAINT_HASH,
  inputRoot: MOCK_INPUT_ROOT,
  executionNonce: 1n,
  inputCommitment: MOCK_INPUT_COMMITMENT,
  actionCommitment: MOCK_ACTION_COMMITMENT,
};

describe('VerifierClient', () => {
  let publicClient: ReturnType<typeof createMockPublicClient>;
  let client: VerifierClient;

  beforeEach(() => {
    publicClient = createMockPublicClient();
    client = new VerifierClient(publicClient, VERIFIER_ADDRESS);
  });

  describe('verifyAndParse', () => {
    it('calls verifyAndParseWithImageId with correct params', async () => {
      publicClient.readContract.mockResolvedValue(MOCK_PARSED_JOURNAL);

      const result = await client.verifyAndParse(MOCK_IMAGE_ID, '0xjournal', '0xseal');

      expect(publicClient.readContract).toHaveBeenCalledWith({
        address: VERIFIER_ADDRESS,
        abi: expect.any(Array),
        functionName: 'verifyAndParseWithImageId',
        args: [MOCK_IMAGE_ID, '0xjournal', '0xseal'],
      });
      expect(result).toEqual<ParsedJournal>({
        agentId: MOCK_AGENT_ID,
        agentCodeHash: MOCK_CODE_HASH,
        constraintSetHash: MOCK_CONSTRAINT_HASH,
        inputRoot: MOCK_INPUT_ROOT,
        executionNonce: 1n,
        inputCommitment: MOCK_INPUT_COMMITMENT,
        actionCommitment: MOCK_ACTION_COMMITMENT,
      });
    });

    it('propagates errors from verification failure', async () => {
      publicClient.readContract.mockRejectedValue(new Error('verification failed'));

      await expect(
        client.verifyAndParse(MOCK_IMAGE_ID, '0xbadjournal', '0xbadseal'),
      ).rejects.toThrow('verification failed');
    });
  });

  describe('parseJournal', () => {
    it('calls parseJournal with correct params', async () => {
      publicClient.readContract.mockResolvedValue(MOCK_PARSED_JOURNAL);

      const result = await client.parseJournal('0xjournal');

      expect(publicClient.readContract).toHaveBeenCalledWith({
        address: VERIFIER_ADDRESS,
        abi: expect.any(Array),
        functionName: 'parseJournal',
        args: ['0xjournal'],
      });
      expect(result.agentId).toBe(MOCK_AGENT_ID);
      expect(result.executionNonce).toBe(1n);
      expect(result.actionCommitment).toBe(MOCK_ACTION_COMMITMENT);
    });
  });

  describe('read-only nature', () => {
    it('does not require a wallet client', async () => {
      // VerifierClient only does reads, no wallet needed
      const readOnlyClient = new VerifierClient(publicClient, VERIFIER_ADDRESS);
      publicClient.readContract.mockResolvedValue(MOCK_PARSED_JOURNAL);

      // Should not throw
      await expect(readOnlyClient.parseJournal('0xjournal')).resolves.toBeDefined();
    });
  });
});
