import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encodeAbiParameters, encodeEventTopics } from 'viem';
import { AgentRegistryClient } from '../clients/AgentRegistryClient';
import { AgentRegistryABI } from '../abi/AgentRegistry';
import type { KernelAgentInfo } from '../types';

const REGISTRY_ADDRESS = '0xBa1DA5f7e12F2c8614696D019A2eb48918E1f2AA' as `0x${string}`;
const MOCK_AGENT_ID = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`;
const MOCK_IMAGE_ID = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;
const MOCK_CODE_HASH = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as `0x${string}`;
const MOCK_AUTHOR = '0x1111111111111111111111111111111111111111' as `0x${string}`;

function createAgentRegisteredLog(agentId: `0x${string}`, author: `0x${string}`, imageId: `0x${string}`, agentCodeHash: `0x${string}`) {
  const topics = encodeEventTopics({
    abi: AgentRegistryABI,
    eventName: 'AgentRegistered',
    args: { agentId, author, imageId },
  });
  const data = encodeAbiParameters(
    [{ name: 'agentCodeHash', type: 'bytes32' }],
    [agentCodeHash],
  );
  return { topics, data };
}

function createMockPublicClient() {
  return {
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
  } as any;
}

function createMockWalletClient() {
  return {
    writeContract: vi.fn(),
  } as any;
}

describe('AgentRegistryClient', () => {
  let publicClient: ReturnType<typeof createMockPublicClient>;
  let walletClient: ReturnType<typeof createMockWalletClient>;
  let client: AgentRegistryClient;

  beforeEach(() => {
    publicClient = createMockPublicClient();
    walletClient = createMockWalletClient();
    client = new AgentRegistryClient(publicClient, REGISTRY_ADDRESS, walletClient);
  });

  describe('computeAgentId', () => {
    it('calls readContract with correct params', async () => {
      const salt = '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`;
      publicClient.readContract.mockResolvedValue(MOCK_AGENT_ID);

      const result = await client.computeAgentId(MOCK_AUTHOR, salt);

      expect(publicClient.readContract).toHaveBeenCalledWith({
        address: REGISTRY_ADDRESS,
        abi: expect.any(Array),
        functionName: 'computeAgentId',
        args: [MOCK_AUTHOR, salt],
      });
      expect(result).toBe(MOCK_AGENT_ID);
    });
  });

  describe('get', () => {
    it('returns mapped KernelAgentInfo', async () => {
      publicClient.readContract.mockResolvedValue({
        author: MOCK_AUTHOR,
        imageId: MOCK_IMAGE_ID,
        agentCodeHash: MOCK_CODE_HASH,
        _deprecated: '',
        exists: true,
      });

      const result = await client.get(MOCK_AGENT_ID);

      expect(result).toEqual<KernelAgentInfo>({
        agentId: MOCK_AGENT_ID,
        author: MOCK_AUTHOR,
        imageId: MOCK_IMAGE_ID,
        agentCodeHash: MOCK_CODE_HASH,
        exists: true,
      });
    });

    it('returns exists=false for non-existent agent', async () => {
      publicClient.readContract.mockResolvedValue({
        author: '0x0000000000000000000000000000000000000000',
        imageId: '0x0000000000000000000000000000000000000000000000000000000000000000',
        agentCodeHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
        _deprecated: '',
        exists: false,
      });

      const result = await client.get(MOCK_AGENT_ID);
      expect(result.exists).toBe(false);
    });
  });

  describe('agentExists', () => {
    it('returns true for existing agent', async () => {
      publicClient.readContract.mockResolvedValue(true);
      const result = await client.agentExists(MOCK_AGENT_ID);
      expect(result).toBe(true);
    });

    it('returns false for non-existing agent', async () => {
      publicClient.readContract.mockResolvedValue(false);
      const result = await client.agentExists(MOCK_AGENT_ID);
      expect(result).toBe(false);
    });
  });

  describe('register', () => {
    it('calls writeContract and returns agentId', async () => {
      const txHash = '0xabc123' as `0x${string}`;
      walletClient.writeContract.mockResolvedValue(txHash);
      const mockLog = createAgentRegisteredLog(MOCK_AGENT_ID, MOCK_AUTHOR, MOCK_IMAGE_ID, MOCK_CODE_HASH);
      publicClient.waitForTransactionReceipt.mockResolvedValue({
        logs: [mockLog],
      });

      const result = await client.register({
        salt: '0x0000000000000000000000000000000000000000000000000000000000000001',
        imageId: MOCK_IMAGE_ID,
        agentCodeHash: MOCK_CODE_HASH,
      });

      expect(walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: REGISTRY_ADDRESS,
          functionName: 'register',
        }),
      );
      expect(result.txHash).toBe(txHash);
      expect(result.agentId).toBe(MOCK_AGENT_ID);
    });

    it('throws without wallet client', async () => {
      const readOnlyClient = new AgentRegistryClient(publicClient, REGISTRY_ADDRESS);
      await expect(
        readOnlyClient.register({
          salt: '0x0000000000000000000000000000000000000000000000000000000000000001',
          imageId: MOCK_IMAGE_ID,
          agentCodeHash: MOCK_CODE_HASH,
        }),
      ).rejects.toThrow('WalletClient required for write operations');
    });
  });

  describe('update', () => {
    it('calls writeContract with correct params', async () => {
      const txHash = '0xdef456' as `0x${string}`;
      walletClient.writeContract.mockResolvedValue(txHash);

      const result = await client.update({
        agentId: MOCK_AGENT_ID,
        newImageId: MOCK_IMAGE_ID,
        newAgentCodeHash: MOCK_CODE_HASH,
      });

      expect(walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: REGISTRY_ADDRESS,
          functionName: 'update',
          args: [MOCK_AGENT_ID, MOCK_IMAGE_ID, MOCK_CODE_HASH],
        }),
      );
      expect(result).toBe(txHash);
    });

    it('throws without wallet client', async () => {
      const readOnlyClient = new AgentRegistryClient(publicClient, REGISTRY_ADDRESS);
      await expect(
        readOnlyClient.update({
          agentId: MOCK_AGENT_ID,
          newImageId: MOCK_IMAGE_ID,
          newAgentCodeHash: MOCK_CODE_HASH,
        }),
      ).rejects.toThrow('WalletClient required for write operations');
    });
  });
});
