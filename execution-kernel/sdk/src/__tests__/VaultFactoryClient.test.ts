import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VaultFactoryClient } from '../clients/VaultFactoryClient';

const FACTORY_ADDRESS = '0x3bB48a146bBC50F8990c86787a41185A6fC474d2' as `0x${string}`;
const MOCK_AGENT_ID = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`;
const MOCK_VAULT_ADDRESS = '0x2222222222222222222222222222222222222222' as `0x${string}`;
const MOCK_OWNER = '0x1111111111111111111111111111111111111111' as `0x${string}`;
const MOCK_ASSET = '0x3333333333333333333333333333333333333333' as `0x${string}`;
const MOCK_SALT = '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`;

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

describe('VaultFactoryClient', () => {
  let publicClient: ReturnType<typeof createMockPublicClient>;
  let walletClient: ReturnType<typeof createMockWalletClient>;
  let client: VaultFactoryClient;

  beforeEach(() => {
    publicClient = createMockPublicClient();
    walletClient = createMockWalletClient();
    client = new VaultFactoryClient(publicClient, FACTORY_ADDRESS, walletClient);
  });

  describe('registry', () => {
    it('reads registry address', async () => {
      const registryAddr = '0x4444444444444444444444444444444444444444' as `0x${string}`;
      publicClient.readContract.mockResolvedValue(registryAddr);

      const result = await client.registry();

      expect(publicClient.readContract).toHaveBeenCalledWith({
        address: FACTORY_ADDRESS,
        abi: expect.any(Array),
        functionName: 'registry',
      });
      expect(result).toBe(registryAddr);
    });
  });

  describe('verifier', () => {
    it('reads verifier address', async () => {
      const verifierAddr = '0x5555555555555555555555555555555555555555' as `0x${string}`;
      publicClient.readContract.mockResolvedValue(verifierAddr);

      const result = await client.verifier();

      expect(publicClient.readContract).toHaveBeenCalledWith({
        address: FACTORY_ADDRESS,
        abi: expect.any(Array),
        functionName: 'verifier',
      });
      expect(result).toBe(verifierAddr);
    });
  });

  describe('computeVaultAddress', () => {
    it('returns vault address and salt', async () => {
      const computedSalt = '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' as `0x${string}`;
      publicClient.readContract.mockResolvedValue([MOCK_VAULT_ADDRESS, computedSalt]);

      const result = await client.computeVaultAddress(MOCK_OWNER, MOCK_AGENT_ID, MOCK_ASSET, MOCK_SALT);

      expect(publicClient.readContract).toHaveBeenCalledWith({
        address: FACTORY_ADDRESS,
        abi: expect.any(Array),
        functionName: 'computeVaultAddress',
        args: [MOCK_OWNER, MOCK_AGENT_ID, MOCK_ASSET, MOCK_SALT],
      });
      expect(result.vault).toBe(MOCK_VAULT_ADDRESS);
      expect(result.salt).toBe(computedSalt);
    });
  });

  describe('deployVault', () => {
    it('deploys and returns vault address', async () => {
      const txHash = '0xabc123' as `0x${string}`;
      // VaultDeployed event: topics[1] is vault address (padded to 32 bytes)
      const paddedVault = `0x000000000000000000000000${MOCK_VAULT_ADDRESS.slice(2)}`;
      walletClient.writeContract.mockResolvedValue(txHash);
      publicClient.waitForTransactionReceipt.mockResolvedValue({
        logs: [{ topics: [null, paddedVault] }],
      });

      const result = await client.deployVault({
        agentId: MOCK_AGENT_ID,
        asset: MOCK_ASSET,
        userSalt: MOCK_SALT,
      });

      expect(walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: FACTORY_ADDRESS,
          functionName: 'deployVault',
          args: [MOCK_AGENT_ID, MOCK_ASSET, MOCK_SALT],
        }),
      );
      expect(result.txHash).toBe(txHash);
      expect(result.vaultAddress).toBe(MOCK_VAULT_ADDRESS);
    });

    it('throws without wallet client', async () => {
      const readOnlyClient = new VaultFactoryClient(publicClient, FACTORY_ADDRESS);
      await expect(
        readOnlyClient.deployVault({
          agentId: MOCK_AGENT_ID,
          asset: MOCK_ASSET,
          userSalt: MOCK_SALT,
        }),
      ).rejects.toThrow('WalletClient required for write operations');
    });
  });

  describe('isDeployedVault', () => {
    it('returns true for deployed vault', async () => {
      publicClient.readContract.mockResolvedValue(true);
      const result = await client.isDeployedVault(MOCK_VAULT_ADDRESS);
      expect(result).toBe(true);
    });

    it('returns false for non-deployed address', async () => {
      publicClient.readContract.mockResolvedValue(false);
      const result = await client.isDeployedVault(MOCK_VAULT_ADDRESS);
      expect(result).toBe(false);
    });
  });
});
