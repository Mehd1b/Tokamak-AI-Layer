'use client';

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { KernelVaultABI } from '@/lib/contracts';

export function useVaultInfo(vaultAddress: `0x${string}` | undefined) {
  const asset = useReadContract({
    address: vaultAddress,
    abi: KernelVaultABI,
    functionName: 'asset',
    query: { enabled: !!vaultAddress },
  });

  const agentId = useReadContract({
    address: vaultAddress,
    abi: KernelVaultABI,
    functionName: 'agentId',
    query: { enabled: !!vaultAddress },
  });

  const trustedImageId = useReadContract({
    address: vaultAddress,
    abi: KernelVaultABI,
    functionName: 'trustedImageId',
    query: { enabled: !!vaultAddress },
  });

  const totalShares = useReadContract({
    address: vaultAddress,
    abi: KernelVaultABI,
    functionName: 'totalShares',
    query: { enabled: !!vaultAddress },
  });

  const totalAssets = useReadContract({
    address: vaultAddress,
    abi: KernelVaultABI,
    functionName: 'totalAssets',
    query: { enabled: !!vaultAddress },
  });

  const totalValueLocked = useReadContract({
    address: vaultAddress,
    abi: KernelVaultABI,
    functionName: 'totalValueLocked',
    query: { enabled: !!vaultAddress },
  });

  const lastExecutionNonce = useReadContract({
    address: vaultAddress,
    abi: KernelVaultABI,
    functionName: 'lastExecutionNonce',
    query: { enabled: !!vaultAddress },
  });

  const lastExecutionTimestamp = useReadContract({
    address: vaultAddress,
    abi: KernelVaultABI,
    functionName: 'lastExecutionTimestamp',
    query: { enabled: !!vaultAddress },
  });

  return {
    asset: asset.data,
    agentId: agentId.data,
    trustedImageId: trustedImageId.data,
    totalShares: totalShares.data,
    totalAssets: totalAssets.data,
    totalValueLocked: totalValueLocked.data,
    lastExecutionNonce: lastExecutionNonce.data,
    lastExecutionTimestamp: lastExecutionTimestamp.data,
    isLoading: asset.isLoading || agentId.isLoading || trustedImageId.isLoading || totalShares.isLoading || totalAssets.isLoading,
  };
}

export function useVaultShares(vaultAddress: `0x${string}` | undefined, depositor: `0x${string}` | undefined) {
  return useReadContract({
    address: vaultAddress,
    abi: KernelVaultABI,
    functionName: 'shares',
    args: depositor ? [depositor] : undefined,
    query: { enabled: !!vaultAddress && !!depositor },
  });
}

export function useDepositETH(vaultAddress: `0x${string}` | undefined) {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const deposit = (ethAmount: string) => {
    if (!vaultAddress) return;
    writeContract({
      address: vaultAddress,
      abi: KernelVaultABI,
      functionName: 'depositETH',
      value: parseEther(ethAmount),
    });
  };

  return { deposit, hash, isPending, isConfirming, isSuccess, error };
}

export function useDepositERC20(vaultAddress: `0x${string}` | undefined) {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const deposit = (amount: bigint) => {
    if (!vaultAddress) return;
    writeContract({
      address: vaultAddress,
      abi: KernelVaultABI,
      functionName: 'depositERC20Tokens',
      args: [amount],
    });
  };

  return { deposit, hash, isPending, isConfirming, isSuccess, error };
}

export function useWithdraw(vaultAddress: `0x${string}` | undefined) {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const withdraw = (shareAmount: bigint) => {
    if (!vaultAddress) return;
    writeContract({
      address: vaultAddress,
      abi: KernelVaultABI,
      functionName: 'withdraw',
      args: [shareAmount],
    });
  };

  return { withdraw, hash, isPending, isConfirming, isSuccess, error };
}

export function useExecute(vaultAddress: `0x${string}` | undefined) {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const execute = (journal: `0x${string}`, seal: `0x${string}`, agentOutputBytes: `0x${string}`) => {
    if (!vaultAddress) return;
    writeContract({
      address: vaultAddress,
      abi: KernelVaultABI,
      functionName: 'execute',
      args: [journal, seal, agentOutputBytes],
    });
  };

  return { execute, hash, isPending, isConfirming, isSuccess, error };
}
