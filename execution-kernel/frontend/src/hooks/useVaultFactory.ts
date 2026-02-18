'use client';

import { useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { sepolia } from 'wagmi/chains';
import { KERNEL_CONTRACTS, VaultFactoryABI, KernelVaultABI } from '@/lib/contracts';

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

  return useQuery({
    queryKey: ['deployedVaults'],
    queryFn: async () => {
      if (!client) return [];

      // Fetch all vault addresses using the enumeration getter
      const vaultAddresses = await client.readContract({
        address: KERNEL_CONTRACTS.vaultFactory as `0x${string}`,
        abi: VaultFactoryABI,
        functionName: 'getAllVaults',
      });

      // Fetch details for each vault
      const vaults = await Promise.all(
        (vaultAddresses as `0x${string}`[]).map(async (vaultAddress) => {
          const [agentId, asset, totalAssets, totalShares] = await Promise.all([
            client.readContract({
              address: vaultAddress,
              abi: KernelVaultABI,
              functionName: 'agentId',
            }),
            client.readContract({
              address: vaultAddress,
              abi: KernelVaultABI,
              functionName: 'asset',
            }),
            client.readContract({
              address: vaultAddress,
              abi: KernelVaultABI,
              functionName: 'totalAssets',
            }),
            client.readContract({
              address: vaultAddress,
              abi: KernelVaultABI,
              functionName: 'totalShares',
            }),
          ]);

          return {
            address: vaultAddress,
            agentId: agentId as string,
            asset: asset as string,
            totalAssets: totalAssets as bigint,
            totalShares: totalShares as bigint,
          };
        }),
      );

      return vaults;
    },
    enabled: !!client,
  });
}

export function useVaultsForAgent(agentId: `0x${string}` | undefined) {
  const client = usePublicClient({ chainId: sepolia.id });

  return useQuery({
    queryKey: ['vaultsForAgent', agentId],
    queryFn: async () => {
      if (!client || !agentId) return [];

      // Fetch all vault addresses
      const vaultAddresses = await client.readContract({
        address: KERNEL_CONTRACTS.vaultFactory as `0x${string}`,
        abi: VaultFactoryABI,
        functionName: 'getAllVaults',
      });

      // Filter vaults that match the agent ID
      const matchingVaults = await Promise.all(
        (vaultAddresses as `0x${string}`[]).map(async (vaultAddress) => {
          const vaultAgentId = await client.readContract({
            address: vaultAddress,
            abi: KernelVaultABI,
            functionName: 'agentId',
          });

          if (vaultAgentId !== agentId) return null;

          const [asset, totalAssets, totalShares] = await Promise.all([
            client.readContract({
              address: vaultAddress,
              abi: KernelVaultABI,
              functionName: 'asset',
            }),
            client.readContract({
              address: vaultAddress,
              abi: KernelVaultABI,
              functionName: 'totalAssets',
            }),
            client.readContract({
              address: vaultAddress,
              abi: KernelVaultABI,
              functionName: 'totalShares',
            }),
          ]);

          return {
            address: vaultAddress,
            agentId: vaultAgentId as string,
            asset: asset as string,
            totalAssets: totalAssets as bigint,
            totalShares: totalShares as bigint,
          };
        }),
      );

      return matchingVaults.filter((v): v is NonNullable<typeof v> => v !== null);
    },
    enabled: !!client && !!agentId,
  });
}
