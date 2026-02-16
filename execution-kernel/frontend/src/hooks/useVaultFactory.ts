'use client';

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { KERNEL_CONTRACTS, VaultFactoryABI } from '@/lib/contracts';

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
  deployer: `0x${string}` | undefined,
  agentId: `0x${string}` | undefined,
  asset: `0x${string}` | undefined,
  trustedImageId: `0x${string}` | undefined,
) {
  return useReadContract({
    address: KERNEL_CONTRACTS.vaultFactory as `0x${string}`,
    abi: VaultFactoryABI,
    functionName: 'computeVaultAddress',
    args: deployer && agentId && asset && trustedImageId ? [deployer, agentId, asset, trustedImageId] : undefined,
    query: { enabled: !!deployer && !!agentId && !!asset && !!trustedImageId },
  });
}

export function useDeployVault() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const deploy = (agentId: `0x${string}`, asset: `0x${string}`, trustedImageId: `0x${string}`) => {
    writeContract({
      address: KERNEL_CONTRACTS.vaultFactory as `0x${string}`,
      abi: VaultFactoryABI,
      functionName: 'deployVault',
      args: [agentId, asset, trustedImageId],
    });
  };

  return { deploy, hash, isPending, isConfirming, isSuccess, error };
}
