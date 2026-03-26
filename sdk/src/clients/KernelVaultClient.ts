import type { PublicClient, WalletClient } from 'viem';
import { decodeEventLog } from 'viem';
import { KernelVaultABI } from '../abi/KernelVault';
import type { ExecuteParams, ExecutionRecord, KernelVaultInfo, PerformanceMetrics } from '../types';

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

  // ============ Performance Methods ============

  /**
   * Read PPS checkpoint arrays and return as ordered history.
   * The on-chain storage is a circular buffer of up to 30 entries.
   * Returned array is sorted oldest-first and excludes empty slots.
   */
  async getPpsHistory(): Promise<{ timestamp: number; value: bigint }[]> {
    const maxCheckpoints = 30; // MAX_PPS_CHECKPOINTS constant on contract

    // Read all checkpoint slots in parallel
    const indexPromises: Promise<bigint>[] = [];
    for (let i = 0; i < maxCheckpoints; i++) {
      indexPromises.push(
        this.publicClient.readContract({
          address: this.vaultAddress,
          abi: KernelVaultABI,
          functionName: 'ppsCheckpointValues',
          args: [BigInt(i)],
        }),
      );
      indexPromises.push(
        this.publicClient.readContract({
          address: this.vaultAddress,
          abi: KernelVaultABI,
          functionName: 'ppsCheckpointTimestamps',
          args: [BigInt(i)],
        }),
      );
    }

    const results = await Promise.all(indexPromises);

    // Pair up values and timestamps, filter out empty (zero-timestamp) slots
    const checkpoints: { timestamp: number; value: bigint }[] = [];
    for (let i = 0; i < maxCheckpoints; i++) {
      const value = results[i * 2];
      const timestamp = results[i * 2 + 1];
      if (timestamp > 0n) {
        checkpoints.push({ timestamp: Number(timestamp), value });
      }
    }

    // Sort oldest-first by timestamp
    checkpoints.sort((a, b) => a.timestamp - b.timestamp);
    return checkpoints;
  }

  /**
   * Read on-chain performance data and compute derived metrics.
   * Uses parallel reads for all scalar fields plus the PPS history.
   */
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    const [
      initialPpsVal,
      peakPpsVal,
      maxDrawdownBpsVal,
      executionWinsVal,
      totalExecutionCountVal,
      totalAssetsVal,
      totalSharesVal,
      ppsHistory,
    ] = await Promise.all([
      this.publicClient.readContract({
        address: this.vaultAddress,
        abi: KernelVaultABI,
        functionName: 'initialPps',
      }) as Promise<bigint>,
      this.publicClient.readContract({
        address: this.vaultAddress,
        abi: KernelVaultABI,
        functionName: 'peakPps',
      }) as Promise<bigint>,
      this.publicClient.readContract({
        address: this.vaultAddress,
        abi: KernelVaultABI,
        functionName: 'maxDrawdownBps',
      }) as Promise<bigint>,
      this.publicClient.readContract({
        address: this.vaultAddress,
        abi: KernelVaultABI,
        functionName: 'executionWins',
      }) as Promise<bigint>,
      this.publicClient.readContract({
        address: this.vaultAddress,
        abi: KernelVaultABI,
        functionName: 'totalExecutionCount',
      }) as Promise<bigint>,
      this.totalAssets(),
      this.totalShares(),
      this.getPpsHistory(),
    ]);

    // Compute current PPS: totalAssets / totalShares (scaled by 1e18 like the contract)
    // When no shares exist, PPS is 1e18 (1:1)
    const PPS_SCALE = 10n ** 18n;
    const DECIMALS_OFFSET = 1000n; // matches contract _DECIMALS_OFFSET
    let currentPps: bigint;
    if (totalSharesVal === 0n) {
      currentPps = PPS_SCALE;
    } else {
      // Mirror the contract's convertToAssets math: assets * (totalShares + offset) / (totalAssets + offset)
      // PPS = totalAssets * 1e18 / totalShares (simplified, offset negligible at scale)
      currentPps = (totalAssetsVal * PPS_SCALE) / (totalSharesVal + DECIMALS_OFFSET);
    }

    const executionCount = Number(totalExecutionCountVal);
    const executionWins = Number(executionWinsVal);

    // Derived: win rate (0 if no executions)
    const winRate = executionCount > 0
      ? (executionWins / executionCount) * 100
      : 0;

    // Derived: all-time return percentage
    const initialPps = initialPpsVal > 0n ? initialPpsVal : PPS_SCALE;
    const allTimeReturnPct = initialPps > 0n
      ? Number(((currentPps - initialPps) * 10000n) / initialPps) / 100
      : 0;

    return {
      currentPps,
      initialPps,
      peakPps: peakPpsVal,
      maxDrawdownBps: Number(maxDrawdownBpsVal),
      executionCount,
      executionWins,
      winRate,
      allTimeReturnPct,
      ppsHistory,
    };
  }

  // ============ Execution History ============

  /**
   * Query ExecutionApplied event logs from the vault contract.
   * Returns execution records sorted newest-first.
   * Optional `fromBlock` parameter allows pagination (defaults to earliest).
   */
  async getExecutionHistory(options?: {
    fromBlock?: bigint;
    toBlock?: bigint;
  }): Promise<ExecutionRecord[]> {
    const agentIdVal = await this.agentId();

    const logs = await this.publicClient.getLogs({
      address: this.vaultAddress,
      event: {
        type: 'event',
        name: 'ExecutionApplied',
        inputs: [
          { name: 'agentId', type: 'bytes32', indexed: true },
          { name: 'executionNonce', type: 'uint64', indexed: true },
          { name: 'actionCommitment', type: 'bytes32', indexed: false },
          { name: 'actionCount', type: 'uint256', indexed: false },
        ],
      },
      args: {
        agentId: agentIdVal,
      },
      fromBlock: options?.fromBlock ?? 'earliest',
      toBlock: options?.toBlock ?? 'latest',
    });

    // Fetch block timestamps in parallel for all logs
    const uniqueBlockNumbers = [...new Set(logs.map((l) => l.blockNumber))];
    const blockMap = new Map<bigint, number>();
    const blocks = await Promise.all(
      uniqueBlockNumbers.map((bn) =>
        this.publicClient.getBlock({ blockNumber: bn }),
      ),
    );
    for (const block of blocks) {
      blockMap.set(block.number, Number(block.timestamp));
    }

    const records: ExecutionRecord[] = logs.map((log) => ({
      nonce: log.args.executionNonce!,
      actionCommitment: log.args.actionCommitment! as `0x${string}`,
      actionCount: Number(log.args.actionCount!),
      timestamp: blockMap.get(log.blockNumber) ?? 0,
      txHash: log.transactionHash as `0x${string}`,
      blockNumber: log.blockNumber,
    }));

    // Sort newest-first
    records.sort((a, b) => b.timestamp - a.timestamp);
    return records;
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
