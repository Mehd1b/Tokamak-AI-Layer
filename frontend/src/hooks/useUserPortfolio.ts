'use client';

import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { useNetwork } from '@/lib/NetworkContext';
import { useDeployedVaultsList, type VaultInfo } from '@/hooks/useVaultFactory';
import { KernelVaultABI } from '@/lib/contracts';
import {
  paginatedGetLogs,
  depositEvent,
  withdrawEvent,
  recentFromBlock,
  getLogsClient,
} from '@/lib/vaultEvents';

export interface UserPosition {
  vaultAddress: `0x${string}`;
  agentId: string;
  shares: bigint;
  currentValue: bigint;
  depositedValue: bigint;
  unrealizedPnL: bigint;
  assetDecimals: number;
  assetSymbol: string;
  totalShares: bigint;
  totalAssets: bigint;
  protocolType?: number;
}

export interface UserPortfolio {
  positions: UserPosition[];
  totalValue: bigint;
  totalPnL: bigint;
  isLoading: boolean;
  error: Error | null;
}

/** Mirrors the on-chain _DECIMALS_OFFSET used by KernelVault. */
const DECIMALS_OFFSET = 1000n;

/** Mirrors KernelVault.convertToAssets — accounts for the virtual offset. */
function convertToAssets(shares: bigint, totalAssets: bigint, totalShares: bigint): bigint {
  const denom = totalShares + DECIMALS_OFFSET;
  if (denom === 0n) return 0n;
  return (shares * (totalAssets + 1n)) / denom;
}

/**
 * Fetches the connected user's portfolio across all deployed vaults.
 * For each vault with user shares > 0, computes the current value and
 * unrealized P&L based on deposit cost vs current share value.
 */
export function useUserPortfolio(userAddress: `0x${string}` | undefined): UserPortfolio {
  const { selectedChainId } = useNetwork();
  const client = usePublicClient({ chainId: selectedChainId });
  const { data: allVaults, isLoading: vaultsLoading } = useDeployedVaultsList();

  const { data, isLoading: queryLoading, error } = useQuery<{
    positions: UserPosition[];
    totalValue: bigint;
    totalPnL: bigint;
  }>({
    queryKey: ['userPortfolio', userAddress, selectedChainId, allVaults?.length],
    queryFn: async () => {
      if (!client || !userAddress || !allVaults || allVaults.length === 0) {
        return { positions: [], totalValue: 0n, totalPnL: 0n };
      }

      // Batch-read user shares for all vaults via multicall
      const sharesCalls = allVaults.map((vault) => ({
        address: vault.address as `0x${string}`,
        abi: KernelVaultABI,
        functionName: 'shares' as const,
        args: [userAddress] as const,
      }));

      let sharesResults: any[];
      try {
        sharesResults = await client.multicall({ contracts: sharesCalls });
      } catch {
        // Fallback: sequential reads
        sharesResults = await Promise.all(
          sharesCalls.map(async (call) => {
            try {
              const result = await client.readContract(call);
              return { status: 'success', result };
            } catch {
              return { status: 'failure', result: undefined };
            }
          }),
        );
      }

      // Identify vaults where the user holds shares
      const activeVaults: { vault: VaultInfo; shares: bigint }[] = [];
      for (let i = 0; i < allVaults.length; i++) {
        const sharesResult = sharesResults[i];
        if (sharesResult?.status !== 'success') continue;
        const shares = sharesResult.result as bigint;
        if (!shares || shares <= 0n) continue;
        activeVaults.push({ vault: allVaults[i], shares });
      }

      if (activeVaults.length === 0) {
        return { positions: [], totalValue: 0n, totalPnL: 0n };
      }

      // Read Deposit/Withdraw events per vault to compute cost basis.
      // Uses the indexed `sender` field so the RPC can filter server-side.
      const logClient = getLogsClient(client, selectedChainId);
      let currentBlock: bigint;
      try {
        currentBlock = await logClient.getBlockNumber();
      } catch {
        currentBlock = 0n;
      }
      const fromBlock = currentBlock > 0n ? recentFromBlock(currentBlock) : 0n;

      const eventResults = await Promise.all(
        activeVaults.flatMap(({ vault }) => [
          paginatedGetLogs(logClient, {
            address: vault.address as `0x${string}`,
            event: depositEvent,
            args: { sender: userAddress },
            fromBlock,
            toBlock: currentBlock > 0n ? currentBlock : 'latest' as any,
          }).catch(() => []),
          paginatedGetLogs(logClient, {
            address: vault.address as `0x${string}`,
            event: withdrawEvent,
            args: { sender: userAddress },
            fromBlock,
            toBlock: currentBlock > 0n ? currentBlock : 'latest' as any,
          }).catch(() => []),
        ]),
      );

      const positions: UserPosition[] = [];
      let totalValue = 0n;
      let totalPnL = 0n;

      for (let i = 0; i < activeVaults.length; i++) {
        const { vault, shares } = activeVaults[i];

        // Current value via convertToAssets (mirrors contract with DECIMALS_OFFSET)
        const currentValue = convertToAssets(shares, vault.totalAssets, vault.totalShares);

        // Cost basis from on-chain Deposit/Withdraw events
        const depositLogs = eventResults[i * 2] as any[];
        const withdrawLogs = eventResults[i * 2 + 1] as any[];

        let depositedValue = 0n;
        for (const log of depositLogs) {
          depositedValue += (log.args?.amount ?? 0n) as bigint;
        }
        for (const log of withdrawLogs) {
          depositedValue -= (log.args?.amount ?? 0n) as bigint;
        }
        if (depositedValue < 0n) depositedValue = 0n;

        // If no events were found (RPC limitation), fall back to currentValue
        // so P&L displays as 0 rather than a wildly incorrect number.
        if (depositLogs.length === 0 && withdrawLogs.length === 0) {
          depositedValue = currentValue;
        }

        const unrealizedPnL = currentValue - depositedValue;

        positions.push({
          vaultAddress: vault.address,
          agentId: vault.agentId,
          shares,
          currentValue,
          depositedValue,
          unrealizedPnL,
          assetDecimals: vault.assetDecimals,
          assetSymbol: vault.assetSymbol,
          totalShares: vault.totalShares,
          totalAssets: vault.totalAssets,
          protocolType: vault.protocolType,
        });

        totalValue += currentValue;
        totalPnL += unrealizedPnL;
      }

      return { positions, totalValue, totalPnL };
    },
    enabled: !!client && !!userAddress && !!allVaults && allVaults.length > 0,
    staleTime: 30_000,
  });

  return {
    positions: data?.positions ?? [],
    totalValue: data?.totalValue ?? 0n,
    totalPnL: data?.totalPnL ?? 0n,
    isLoading: vaultsLoading || queryLoading,
    error: error as Error | null,
  };
}
