import type { PublicClient, WalletClient } from 'viem';
import { decodeEventLog } from 'viem';
import { VaultFactoryABI } from '../abi/VaultFactory';
import type { DeployVaultParams } from '../types';

export class VaultFactoryClient {
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient | undefined;
  private readonly address: `0x${string}`;

  constructor(
    publicClient: PublicClient,
    address: `0x${string}`,
    walletClient?: WalletClient,
  ) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.address = address;
  }

  async registry(): Promise<`0x${string}`> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: VaultFactoryABI,
      functionName: 'registry',
    });
  }

  async verifier(): Promise<`0x${string}`> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: VaultFactoryABI,
      functionName: 'verifier',
    });
  }

  async computeVaultAddress(
    owner: `0x${string}`,
    agentId: `0x${string}`,
    asset: `0x${string}`,
    userSalt: `0x${string}`,
  ): Promise<{ vault: `0x${string}`; salt: `0x${string}` }> {
    const [vault, salt] = await this.publicClient.readContract({
      address: this.address,
      abi: VaultFactoryABI,
      functionName: 'computeVaultAddress',
      args: [owner, agentId, asset, userSalt],
    });
    return { vault, salt };
  }

  async deployVault(
    params: DeployVaultParams,
  ): Promise<{ vaultAddress: `0x${string}`; txHash: `0x${string}` }> {
    this.requireWallet();
    const txHash = await this.walletClient!.writeContract({
      chain: this.walletClient!.chain ?? null,
      account: this.walletClient!.account!,
      address: this.address,
      abi: VaultFactoryABI,
      functionName: 'deployVault',
      args: [params.agentId, params.asset, params.userSalt],
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    // Parse VaultDeployed event to get vault address
    let vaultAddress: `0x${string}` | undefined;
    for (const log of receipt.logs) {
      try {
        const event = decodeEventLog({
          abi: VaultFactoryABI,
          data: log.data,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        });
        if (event.eventName === 'VaultDeployed') {
          vaultAddress = (event.args as { vault: `0x${string}` }).vault;
          break;
        }
      } catch {
        continue;
      }
    }
    if (!vaultAddress) {
      throw new Error('VaultDeployed event not found in transaction receipt');
    }
    return { vaultAddress, txHash };
  }

  async isDeployedVault(vault: `0x${string}`): Promise<boolean> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: VaultFactoryABI,
      functionName: 'isDeployedVault',
      args: [vault],
    });
  }

  private requireWallet(): void {
    if (!this.walletClient) {
      throw new Error('WalletClient required for write operations');
    }
  }
}
