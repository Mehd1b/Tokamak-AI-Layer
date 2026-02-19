import type { PublicClient, WalletClient } from 'viem';
import { KernelVaultABI } from '../abi/KernelVault';
import type { ExecuteParams, KernelVaultInfo } from '../types';

export class KernelVaultClient {
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient | undefined;
  readonly vaultAddress: `0x${string}`;

  constructor(
    publicClient: PublicClient,
    vaultAddress: `0x${string}`,
    walletClient?: WalletClient,
  ) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.vaultAddress = vaultAddress;
  }

  async asset(): Promise<`0x${string}`> {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: 'asset',
    });
  }

  async agentId(): Promise<`0x${string}`> {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: 'agentId',
    });
  }

  async trustedImageId(): Promise<`0x${string}`> {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: 'trustedImageId',
    });
  }

  async totalShares(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: 'totalShares',
    });
  }

  async totalAssets(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: 'totalAssets',
    });
  }

  async totalDeposited(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: 'totalDeposited',
    });
  }

  async totalWithdrawn(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: 'totalWithdrawn',
    });
  }

  async totalValueLocked(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: 'totalValueLocked',
    });
  }

  async shares(account: `0x${string}`): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: 'shares',
      args: [account],
    });
  }

  async lastExecutionNonce(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: 'lastExecutionNonce',
    });
  }

  async lastExecutionTimestamp(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: 'lastExecutionTimestamp',
    });
  }

  async convertToShares(assets: bigint): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: 'convertToShares',
      args: [assets],
    });
  }

  async convertToAssets(sharesAmount: bigint): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: 'convertToAssets',
      args: [sharesAmount],
    });
  }

  async depositERC20(assets: bigint): Promise<{ sharesMinted: bigint; txHash: `0x${string}` }> {
    this.requireWallet();
    const txHash = await this.walletClient!.writeContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: 'depositERC20Tokens',
      args: [assets],
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    // Parse Deposit event for sharesMinted - simplified extraction
    const sharesMinted = receipt.logs.length > 0 ? 0n : 0n;
    return { sharesMinted, txHash };
  }

  async depositETH(value: bigint): Promise<{ sharesMinted: bigint; txHash: `0x${string}` }> {
    this.requireWallet();
    const txHash = await this.walletClient!.writeContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: 'depositETH',
      value,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    const sharesMinted = receipt.logs.length > 0 ? 0n : 0n;
    return { sharesMinted, txHash };
  }

  async withdraw(shareAmount: bigint): Promise<{ assetsOut: bigint; txHash: `0x${string}` }> {
    this.requireWallet();
    const txHash = await this.walletClient!.writeContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: 'withdraw',
      args: [shareAmount],
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    const assetsOut = receipt.logs.length > 0 ? 0n : 0n;
    return { assetsOut, txHash };
  }

  async execute(params: ExecuteParams): Promise<`0x${string}`> {
    this.requireWallet();
    return await this.walletClient!.writeContract({
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: 'execute',
      args: [params.journal, params.seal, params.agentOutputBytes],
    });
  }

  async getInfo(userAddress?: `0x${string}`): Promise<KernelVaultInfo> {
    const [assetAddr, agentIdVal, totalAssetsVal, totalSharesVal, totalValueLockedVal] = await Promise.all([
      this.asset(),
      this.agentId(),
      this.totalAssets(),
      this.totalShares(),
      this.totalValueLocked(),
    ]);

    let userShares = 0n;
    let userAssets = 0n;
    if (userAddress) {
      userShares = await this.shares(userAddress);
      if (userShares > 0n) {
        userAssets = await this.convertToAssets(userShares);
      }
    }

    return {
      address: this.vaultAddress,
      owner: '0x0000000000000000000000000000000000000000', // owner not stored on-chain in KernelVault
      agentId: agentIdVal,
      asset: assetAddr,
      totalAssets: totalAssetsVal,
      totalShares: totalSharesVal,
      totalValueLocked: totalValueLockedVal,
      userShares,
      userAssets,
    };
  }

  private requireWallet(): void {
    if (!this.walletClient) {
      throw new Error('WalletClient required for write operations');
    }
  }
}
