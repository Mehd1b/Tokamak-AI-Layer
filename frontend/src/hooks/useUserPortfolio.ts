'use client';

import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { useNetwork } from '@/lib/NetworkContext';
import { useDeployedVaultsList, type VaultInfo } from '@/hooks/useVaultFactory';
import { KernelVaultABI } from '@/lib/contracts';

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

      // Filter to vaults with shares > 0
      const positions: UserPosition[] = [];
      let totalValue = 0n;
      let totalPnL = 0n;

      for (let i = 0; i < allVaults.length; i++) {
        const vault = allVaults[i];
        const sharesResult = sharesResults[i];
        if (sharesResult?.status !== 'success') continue;

        const shares = sharesResult.result as bigint;
        if (!shares || shares <= 0n) continue;

        // Calculate current value of position: (shares * totalAssets) / totalShares
        const vaultTotalShares = vault.totalShares;
        const vaultTotalAssets = vault.totalAssets;

        let currentValue = 0n;
        if (vaultTotalShares > 0n) {
          currentValue = (shares * vaultTotalAssets) / vaultTotalShares;
        }

        // Deposited value approximation: shares at 1:1 ratio (initial deposit assumption)
        // In ERC-4626 style vaults, initial deposit mints shares 1:1 with assets.
        // The difference between currentValue and depositedValue is unrealized P&L.
        const depositedValue = shares; // shares represent the original deposit amount at mint time
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
          totalShares: vaultTotalShares,
          totalAssets: vaultTotalAssets,
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
