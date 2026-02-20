import type { PublicClient, WalletClient } from 'viem';
import { decodeEventLog } from 'viem';
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
      chain: this.walletClient!.chain ?? null,
      account: this.walletClient!.account!,
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: 'depositERC20Tokens',
      args: [assets],
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    const sharesMinted = this.parseDepositEvent(receipt.logs);
    return { sharesMinted, txHash };
  }

  async depositETH(value: bigint): Promise<{ sharesMinted: bigint; txHash: `0x${string}` }> {
    this.requireWallet();
    const txHash = await this.walletClient!.writeContract({
      chain: this.walletClient!.chain ?? null,
      account: this.walletClient!.account!,
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: 'depositETH',
      value,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    const sharesMinted = this.parseDepositEvent(receipt.logs);
    return { sharesMinted, txHash };
  }

  async withdraw(shareAmount: bigint): Promise<{ assetsOut: bigint; txHash: `0x${string}` }> {
    this.requireWallet();
    const txHash = await this.walletClient!.writeContract({
      chain: this.walletClient!.chain ?? null,
      account: this.walletClient!.account!,
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: 'withdraw',
      args: [shareAmount],
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    const assetsOut = this.parseWithdrawEvent(receipt.logs);
    return { assetsOut, txHash };
  }

  async execute(params: ExecuteParams): Promise<`0x${string}`> {
    this.requireWallet();
    return await this.walletClient!.writeContract({
      chain: this.walletClient!.chain ?? null,
      account: this.walletClient!.account!,
      address: this.vaultAddress,
      abi: KernelVaultABI,
      functionName: 'execute',
      args: [params.journal, params.seal, params.agentOutputBytes],
    });
  }

  async getInfo(userAddress?: `0x${string}`): Promise<KernelVaultInfo> {
    const [assetAddr, agentIdVal, totalAssetsVal, totalSharesVal] = await Promise.all([
      this.asset(),
      this.agentId(),
      this.totalAssets(),
      this.totalShares(),
    ]);

    // Fallback for old vaults without totalValueLocked()
    let totalValueLockedVal: bigint;
    try {
      totalValueLockedVal = await this.totalValueLocked();
    } catch {
      totalValueLockedVal = totalAssetsVal;
    }

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

  private parseDepositEvent(logs: readonly { data: `0x${string}`; topics: readonly `0x${string}`[] }[]): bigint {
    for (const log of logs) {
      try {
        const event = decodeEventLog({
          abi: KernelVaultABI,
          data: log.data,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        });
        if (event.eventName === 'Deposit') {
          return (event.args as { shares: bigint }).shares;
        }
      } catch {
        continue;
      }
    }
    return 0n;
  }

  private parseWithdrawEvent(logs: readonly { data: `0x${string}`; topics: readonly `0x${string}`[] }[]): bigint {
    for (const log of logs) {
      try {
        const event = decodeEventLog({
          abi: KernelVaultABI,
          data: log.data,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        });
        if (event.eventName === 'Withdraw') {
          return (event.args as { amount: bigint }).amount;
        }
      } catch {
        continue;
      }
    }
    return 0n;
  }

  private requireWallet(): void {
    if (!this.walletClient) {
      throw new Error('WalletClient required for write operations');
    }
  }
}
