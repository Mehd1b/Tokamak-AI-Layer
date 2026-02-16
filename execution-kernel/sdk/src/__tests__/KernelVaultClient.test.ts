import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KernelVaultClient } from '../clients/KernelVaultClient';

const VAULT_ADDRESS = '0x2222222222222222222222222222222222222222' as `0x${string}`;
const MOCK_AGENT_ID = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`;
const MOCK_IMAGE_ID = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;
const MOCK_ASSET = '0x3333333333333333333333333333333333333333' as `0x${string}`;
const MOCK_USER = '0x1111111111111111111111111111111111111111' as `0x${string}`;

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

describe('KernelVaultClient', () => {
  let publicClient: ReturnType<typeof createMockPublicClient>;
  let walletClient: ReturnType<typeof createMockWalletClient>;
  let client: KernelVaultClient;

  beforeEach(() => {
    publicClient = createMockPublicClient();
    walletClient = createMockWalletClient();
    client = new KernelVaultClient(publicClient, VAULT_ADDRESS, walletClient);
  });

  describe('view functions', () => {
    it('reads asset', async () => {
      publicClient.readContract.mockResolvedValue(MOCK_ASSET);
      const result = await client.asset();
      expect(result).toBe(MOCK_ASSET);
      expect(publicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: 'asset' }),
      );
    });

    it('reads agentId', async () => {
      publicClient.readContract.mockResolvedValue(MOCK_AGENT_ID);
      const result = await client.agentId();
      expect(result).toBe(MOCK_AGENT_ID);
    });

    it('reads trustedImageId', async () => {
      publicClient.readContract.mockResolvedValue(MOCK_IMAGE_ID);
      const result = await client.trustedImageId();
      expect(result).toBe(MOCK_IMAGE_ID);
    });

    it('reads totalShares', async () => {
      publicClient.readContract.mockResolvedValue(1000n);
      const result = await client.totalShares();
      expect(result).toBe(1000n);
    });

    it('reads totalAssets', async () => {
      publicClient.readContract.mockResolvedValue(2000n);
      const result = await client.totalAssets();
      expect(result).toBe(2000n);
    });

    it('reads shares for account', async () => {
      publicClient.readContract.mockResolvedValue(500n);
      const result = await client.shares(MOCK_USER);
      expect(result).toBe(500n);
      expect(publicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'shares',
          args: [MOCK_USER],
        }),
      );
    });

    it('reads lastExecutionNonce', async () => {
      publicClient.readContract.mockResolvedValue(5n);
      const result = await client.lastExecutionNonce();
      expect(result).toBe(5n);
    });

    it('reads lastExecutionTimestamp', async () => {
      publicClient.readContract.mockResolvedValue(1700000000n);
      const result = await client.lastExecutionTimestamp();
      expect(result).toBe(1700000000n);
    });

    it('converts assets to shares', async () => {
      publicClient.readContract.mockResolvedValue(500n);
      const result = await client.convertToShares(1000n);
      expect(result).toBe(500n);
    });

    it('converts shares to assets', async () => {
      publicClient.readContract.mockResolvedValue(2000n);
      const result = await client.convertToAssets(1000n);
      expect(result).toBe(2000n);
    });
  });

  describe('depositERC20', () => {
    it('calls writeContract for ERC20 deposit', async () => {
      const txHash = '0xdep123' as `0x${string}`;
      walletClient.writeContract.mockResolvedValue(txHash);
      publicClient.waitForTransactionReceipt.mockResolvedValue({ logs: [] });

      const result = await client.depositERC20(1000n);

      expect(walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: VAULT_ADDRESS,
          functionName: 'depositERC20Tokens',
          args: [1000n],
        }),
      );
      expect(result.txHash).toBe(txHash);
    });

    it('throws without wallet client', async () => {
      const readOnlyClient = new KernelVaultClient(publicClient, VAULT_ADDRESS);
      await expect(readOnlyClient.depositERC20(1000n)).rejects.toThrow(
        'WalletClient required for write operations',
      );
    });
  });

  describe('depositETH', () => {
    it('calls writeContract with value for ETH deposit', async () => {
      const txHash = '0xeth123' as `0x${string}`;
      walletClient.writeContract.mockResolvedValue(txHash);
      publicClient.waitForTransactionReceipt.mockResolvedValue({ logs: [] });

      const result = await client.depositETH(1000000000000000000n);

      expect(walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: VAULT_ADDRESS,
          functionName: 'depositETH',
          value: 1000000000000000000n,
        }),
      );
      expect(result.txHash).toBe(txHash);
    });
  });

  describe('withdraw', () => {
    it('calls writeContract for withdrawal', async () => {
      const txHash = '0xwit123' as `0x${string}`;
      walletClient.writeContract.mockResolvedValue(txHash);
      publicClient.waitForTransactionReceipt.mockResolvedValue({ logs: [] });

      const result = await client.withdraw(500n);

      expect(walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: VAULT_ADDRESS,
          functionName: 'withdraw',
          args: [500n],
        }),
      );
      expect(result.txHash).toBe(txHash);
    });
  });

  describe('execute', () => {
    it('calls writeContract with journal, seal, and output', async () => {
      const txHash = '0xexe123' as `0x${string}`;
      walletClient.writeContract.mockResolvedValue(txHash);

      const result = await client.execute({
        journal: '0xaabb',
        seal: '0xccdd',
        agentOutputBytes: '0xeeff',
      });

      expect(walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: VAULT_ADDRESS,
          functionName: 'execute',
          args: ['0xaabb', '0xccdd', '0xeeff'],
        }),
      );
      expect(result).toBe(txHash);
    });

    it('throws without wallet client', async () => {
      const readOnlyClient = new KernelVaultClient(publicClient, VAULT_ADDRESS);
      await expect(
        readOnlyClient.execute({
          journal: '0xaabb',
          seal: '0xccdd',
          agentOutputBytes: '0xeeff',
        }),
      ).rejects.toThrow('WalletClient required for write operations');
    });
  });

  describe('getInfo', () => {
    it('returns aggregated vault info without user', async () => {
      publicClient.readContract
        .mockResolvedValueOnce(MOCK_ASSET)     // asset
        .mockResolvedValueOnce(MOCK_AGENT_ID)  // agentId
        .mockResolvedValueOnce(2000n)          // totalAssets
        .mockResolvedValueOnce(1000n);         // totalShares

      const info = await client.getInfo();

      expect(info.address).toBe(VAULT_ADDRESS);
      expect(info.agentId).toBe(MOCK_AGENT_ID);
      expect(info.asset).toBe(MOCK_ASSET);
      expect(info.totalAssets).toBe(2000n);
      expect(info.totalShares).toBe(1000n);
      expect(info.userShares).toBe(0n);
      expect(info.userAssets).toBe(0n);
    });

    it('returns user-specific info when user address provided', async () => {
      publicClient.readContract
        .mockResolvedValueOnce(MOCK_ASSET)     // asset
        .mockResolvedValueOnce(MOCK_AGENT_ID)  // agentId
        .mockResolvedValueOnce(2000n)          // totalAssets
        .mockResolvedValueOnce(1000n)          // totalShares
        .mockResolvedValueOnce(500n)           // shares(user)
        .mockResolvedValueOnce(1000n);         // convertToAssets(500)

      const info = await client.getInfo(MOCK_USER);

      expect(info.userShares).toBe(500n);
      expect(info.userAssets).toBe(1000n);
    });
  });

  describe('vaultAddress', () => {
    it('exposes vault address as read-only', () => {
      expect(client.vaultAddress).toBe(VAULT_ADDRESS);
    });
  });
});
