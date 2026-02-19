'use client';

import { useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { sepolia } from 'wagmi/chains';
import { KERNEL_CONTRACTS, VaultFactoryABI, KernelVaultABI } from '@/lib/contracts';

export interface VaultInfo {
  address: `0x${string}`;
  agentId: string;
  asset: string;
  totalAssets: bigint;
  totalShares: bigint;
  totalValueLocked: bigint;
}

export function useIsDeployedVault(vaultAddress: `0x${string}` | undefined) {
  return useReadContract({
    address: KERNEL_CONTRACTS.vaultFactory as `0x${string}`,
    abi: VaultFactoryABI,
    functionName: 'isDeployedVault',
    args: vaultAddress ? [vaultAddress] : undefined,
    query: { enabled: !!vaultAddress },
  });
}

export function useComputeVaultAddress(
  owner: `0x${string}` | undefined,
  agentId: `0x${string}` | undefined,
  asset: `0x${string}` | undefined,
  userSalt: `0x${string}` | undefined,
) {
  return useReadContract({
    address: KERNEL_CONTRACTS.vaultFactory as `0x${string}`,
    abi: VaultFactoryABI,
    functionName: 'computeVaultAddress',
    args: owner && agentId && asset && userSalt ? [owner, agentId, asset, userSalt] : undefined,
    query: { enabled: !!owner && !!agentId && !!asset && !!userSalt },
  });
}

export function useDeployVault() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const deploy = (agentId: `0x${string}`, asset: `0x${string}`, userSalt: `0x${string}`) => {
    writeContract({
      address: KERNEL_CONTRACTS.vaultFactory as `0x${string}`,
      abi: VaultFactoryABI,
      functionName: 'deployVault',
      args: [agentId, asset, userSalt],
    });
  };

  return { deploy, hash, isPending, isConfirming, isSuccess, error };
}

export function useDeployedVaultsList() {
  const client = usePublicClient({ chainId: sepolia.id });

  return useQuery<VaultInfo[]>({
    queryKey: ['deployedVaults'],
    queryFn: async () => {
      if (!client) return [];

      const vaultAddresses = await client.readContract({
        address: KERNEL_CONTRACTS.vaultFactory as `0x${string}`,
        abi: VaultFactoryABI,
        functionName: 'getAllVaults',
      }) as `0x${string}`[];

      if (vaultAddresses.length === 0) return [];

      // Batch all per-vault reads into a single multicall (1 RPC call instead of 4N)
      const calls = vaultAddresses.flatMap((vaultAddress) => [
        {
          address: vaultAddress,
          abi: KernelVaultABI,
          functionName: 'agentId' as const,
        },
        {
          address: vaultAddress,
          abi: KernelVaultABI,
          functionName: 'asset' as const,
        },
        {
          address: vaultAddress,
          abi: KernelVaultABI,
          functionName: 'totalAssets' as const,
        },
        {
          address: vaultAddress,
          abi: KernelVaultABI,
          functionName: 'totalShares' as const,
        },
      ]);

      const results = await client.multicall({ contracts: calls });

      // Also batch totalValueLocked calls (may fail for old vaults)
      const tvlCalls = vaultAddresses.map((vaultAddress) => ({
        address: vaultAddress,
        abi: KernelVaultABI,
        functionName: 'totalValueLocked' as const,
      }));

      const tvlResults = await client.multicall({ contracts: tvlCalls });

      const vaults: VaultInfo[] = vaultAddresses.map((vaultAddress, i) => {
        const base = i * 4;
        const agentId = results[base]?.result as string ?? '0x';
        const asset = results[base + 1]?.result as string ?? '0x';
        const totalAssets = (results[base + 2]?.result as bigint) ?? BigInt(0);
        const totalShares = (results[base + 3]?.result as bigint) ?? BigInt(0);

        // Fallback to totalAssets if totalValueLocked call failed (old vaults)
        const totalValueLocked = tvlResults[i]?.status === 'success'
          ? (tvlResults[i].result as bigint)
          : totalAssets;

        return {
          address: vaultAddress,
          agentId,
          asset,
          totalAssets,
          totalShares,
          totalValueLocked,
        };
      });

      return vaults;
    },
    enabled: !!client,
    staleTime: 30_000,
  });
}

export function useVaultsForAgent(agentId: `0x${string}` | undefined) {
  const { data: allVaults, isLoading, error } = useDeployedVaultsList();

  return useQuery<VaultInfo[]>({
    queryKey: ['vaultsForAgent', agentId],
    queryFn: () => {
      if (!allVaults || !agentId) return [];
      return allVaults.filter((v) => v.agentId === agentId);
    },
    enabled: !!allVaults && !!agentId && !isLoading,
    // Re-derive whenever the underlying vault list changes
    staleTime: 0,
  });
}
