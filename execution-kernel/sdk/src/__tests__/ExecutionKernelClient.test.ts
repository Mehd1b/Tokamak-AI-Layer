import { describe, it, expect, vi } from 'vitest';
import { encodeAbiParameters, encodeEventTopics } from 'viem';
import { ExecutionKernelClient } from '../ExecutionKernelClient';
import { OPTIMISM_SEPOLIA_ADDRESSES } from '../types';
import { AgentRegistryABI } from '../abi/AgentRegistry';
import { VaultFactoryABI } from '../abi/VaultFactory';

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

describe('ExecutionKernelClient', () => {
  describe('constructor', () => {
    it('initializes with provided publicClient', () => {
      const publicClient = createMockPublicClient();
      const client = new ExecutionKernelClient({
        agentRegistry: OPTIMISM_SEPOLIA_ADDRESSES.agentRegistry,
        vaultFactory: OPTIMISM_SEPOLIA_ADDRESSES.vaultFactory,
        kernelExecutionVerifier: OPTIMISM_SEPOLIA_ADDRESSES.kernelExecutionVerifier,
        publicClient,
      });

      expect(client.agents).toBeDefined();
      expect(client.vaultFactory).toBeDefined();
      expect(client.verifier).toBeDefined();
    });

    it('initializes with rpcUrl when no publicClient provided', () => {
      // Should not throw
      const client = new ExecutionKernelClient({
        rpcUrl: 'https://sepolia.optimism.io',
        agentRegistry: OPTIMISM_SEPOLIA_ADDRESSES.agentRegistry,
        vaultFactory: OPTIMISM_SEPOLIA_ADDRESSES.vaultFactory,
        kernelExecutionVerifier: OPTIMISM_SEPOLIA_ADDRESSES.kernelExecutionVerifier,
      });

      expect(client.agents).toBeDefined();
      expect(client.vaultFactory).toBeDefined();
      expect(client.verifier).toBeDefined();
    });
  });

  describe('createVaultClient', () => {
    it('creates a KernelVaultClient for given address', () => {
      const publicClient = createMockPublicClient();
      const client = new ExecutionKernelClient({
        agentRegistry: OPTIMISM_SEPOLIA_ADDRESSES.agentRegistry,
        vaultFactory: OPTIMISM_SEPOLIA_ADDRESSES.vaultFactory,
        kernelExecutionVerifier: OPTIMISM_SEPOLIA_ADDRESSES.kernelExecutionVerifier,
        publicClient,
      });

      const vaultAddress = '0x2222222222222222222222222222222222222222' as `0x${string}`;
      const vaultClient = client.createVaultClient(vaultAddress);

      expect(vaultClient).toBeDefined();
      expect(vaultClient.vaultAddress).toBe(vaultAddress);
    });
  });

  describe('convenience methods', () => {
    it('registerAgent delegates to agents.register', async () => {
      const publicClient = createMockPublicClient();
      const walletClient = createMockWalletClient();
      const client = new ExecutionKernelClient({
        agentRegistry: OPTIMISM_SEPOLIA_ADDRESSES.agentRegistry,
        vaultFactory: OPTIMISM_SEPOLIA_ADDRESSES.vaultFactory,
        kernelExecutionVerifier: OPTIMISM_SEPOLIA_ADDRESSES.kernelExecutionVerifier,
        publicClient,
        walletClient,
      });

      const mockAgentId = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`;
      const mockAuthor = '0x1111111111111111111111111111111111111111' as `0x${string}`;
      const mockImageId = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;
      const mockCodeHash = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as `0x${string}`;
      const txHash = '0xabc' as `0x${string}`;
      walletClient.writeContract.mockResolvedValue(txHash);

      const topics = encodeEventTopics({
        abi: AgentRegistryABI,
        eventName: 'AgentRegistered',
        args: { agentId: mockAgentId, author: mockAuthor, imageId: mockImageId },
      });
      const data = encodeAbiParameters(
        [{ name: 'agentCodeHash', type: 'bytes32' }],
        [mockCodeHash],
      );
      publicClient.waitForTransactionReceipt.mockResolvedValue({
        logs: [{ topics, data }],
      });

      const result = await client.registerAgent({
        salt: '0x0000000000000000000000000000000000000000000000000000000000000001',
        imageId: mockImageId,
        agentCodeHash: mockCodeHash,
      });

      expect(result.txHash).toBe(txHash);
      expect(result.agentId).toBe(mockAgentId);
    });

    it('getAgent delegates to agents.get', async () => {
      const publicClient = createMockPublicClient();
      const client = new ExecutionKernelClient({
        agentRegistry: OPTIMISM_SEPOLIA_ADDRESSES.agentRegistry,
        vaultFactory: OPTIMISM_SEPOLIA_ADDRESSES.vaultFactory,
        kernelExecutionVerifier: OPTIMISM_SEPOLIA_ADDRESSES.kernelExecutionVerifier,
        publicClient,
      });

      const mockAgentId = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`;
      publicClient.readContract.mockResolvedValue({
        author: '0x1111111111111111111111111111111111111111',
        imageId: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        agentCodeHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        _deprecated: '',
        exists: true,
      });

      const info = await client.getAgent(mockAgentId);

      expect(info.agentId).toBe(mockAgentId);
      expect(info.exists).toBe(true);
    });

    it('deployVault delegates to vaultFactory.deployVault', async () => {
      const publicClient = createMockPublicClient();
      const walletClient = createMockWalletClient();
      const client = new ExecutionKernelClient({
        agentRegistry: OPTIMISM_SEPOLIA_ADDRESSES.agentRegistry,
        vaultFactory: OPTIMISM_SEPOLIA_ADDRESSES.vaultFactory,
        kernelExecutionVerifier: OPTIMISM_SEPOLIA_ADDRESSES.kernelExecutionVerifier,
        publicClient,
        walletClient,
      });

      const txHash = '0xvault123' as `0x${string}`;
      const vaultAddr = '0x2222222222222222222222222222222222222222' as `0x${string}`;
      const ownerAddr = '0x1111111111111111111111111111111111111111' as `0x${string}`;
      const agentId = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`;
      const asset = '0x3333333333333333333333333333333333333333' as `0x${string}`;
      const imageId = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;
      const salt = '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`;

      walletClient.writeContract.mockResolvedValue(txHash);

      const topics = encodeEventTopics({
        abi: VaultFactoryABI,
        eventName: 'VaultDeployed',
        args: { vault: vaultAddr, owner: ownerAddr, agentId },
      });
      const data = encodeAbiParameters(
        [
          { name: 'asset', type: 'address' },
          { name: 'trustedImageId', type: 'bytes32' },
          { name: 'salt', type: 'bytes32' },
        ],
        [asset, imageId, salt],
      );
      publicClient.waitForTransactionReceipt.mockResolvedValue({
        logs: [{ topics, data }],
      });

      const result = await client.deployVault({
        agentId,
        asset,
        userSalt: salt,
      });

      expect(result.txHash).toBe(txHash);
      expect(result.vaultAddress).toBe(vaultAddr);
    });

    it('verifyExecution delegates to verifier.verifyAndParse', async () => {
      const publicClient = createMockPublicClient();
      const client = new ExecutionKernelClient({
        agentRegistry: OPTIMISM_SEPOLIA_ADDRESSES.agentRegistry,
        vaultFactory: OPTIMISM_SEPOLIA_ADDRESSES.vaultFactory,
        kernelExecutionVerifier: OPTIMISM_SEPOLIA_ADDRESSES.kernelExecutionVerifier,
        publicClient,
      });

      const mockParsed = {
        agentId: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`,
        agentCodeHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as `0x${string}`,
        constraintSetHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' as `0x${string}`,
        inputRoot: '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd' as `0x${string}`,
        executionNonce: 1n,
        inputCommitment: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as `0x${string}`,
        actionCommitment: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as `0x${string}`,
      };
      publicClient.readContract.mockResolvedValue(mockParsed);

      const imageId = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;
      const result = await client.verifyExecution(imageId, '0xjournal', '0xseal');

      expect(result.valid).toBe(true);
      expect(result.parsed.agentId).toBe(mockParsed.agentId);
    });

    it('verifyExecution throws on verification failure', async () => {
      const publicClient = createMockPublicClient();
      const client = new ExecutionKernelClient({
        agentRegistry: OPTIMISM_SEPOLIA_ADDRESSES.agentRegistry,
        vaultFactory: OPTIMISM_SEPOLIA_ADDRESSES.vaultFactory,
        kernelExecutionVerifier: OPTIMISM_SEPOLIA_ADDRESSES.kernelExecutionVerifier,
        publicClient,
      });

      publicClient.readContract.mockRejectedValue(new Error('invalid proof'));

      const imageId = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;
      await expect(
        client.verifyExecution(imageId, '0xbad', '0xbad'),
      ).rejects.toThrow('Proof verification failed');
    });
  });
});
