'use client';

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, parseUnits } from 'viem';
import { KernelVaultABI } from '@/lib/contracts';
import { useNetwork } from '@/lib/NetworkContext';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const ERC20_DECIMALS_ABI = [
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
] as const;

export function useVaultInfo(vaultAddress: `0x${string}` | undefined) {
  const { selectedChainId } = useNetwork();

  const asset = useReadContract({
    address: vaultAddress,
    abi: KernelVaultABI,
    functionName: 'asset',
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress },
  });

  const assetAddress = asset.data as `0x${string}` | undefined;
  const isEthVault = assetAddress === ZERO_ADDRESS;

  const decimalsQuery = useReadContract({
    address: assetAddress,
    abi: ERC20_DECIMALS_ABI,
    functionName: 'decimals',
    chainId: selectedChainId,
    query: { enabled: !!assetAddress && !isEthVault },
  });

  const symbolQuery = useReadContract({
    address: assetAddress,
    abi: ERC20_DECIMALS_ABI,
    functionName: 'symbol',
    chainId: selectedChainId,
    query: { enabled: !!assetAddress && !isEthVault },
  });

  const agentId = useReadContract({
    address: vaultAddress,
    abi: KernelVaultABI,
    functionName: 'agentId',
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress },
  });

  const trustedImageId = useReadContract({
    address: vaultAddress,
    abi: KernelVaultABI,
    functionName: 'trustedImageId',
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress },
  });

  const totalShares = useReadContract({
    address: vaultAddress,
    abi: KernelVaultABI,
    functionName: 'totalShares',
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress },
  });

  const totalAssets = useReadContract({
    address: vaultAddress,
    abi: KernelVaultABI,
    functionName: 'totalAssets',
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress },
  });

  const totalValueLocked = useReadContract({
    address: vaultAddress,
    abi: KernelVaultABI,
    functionName: 'totalValueLocked',
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress },
  });

  const lastExecutionNonce = useReadContract({
    address: vaultAddress,
    abi: KernelVaultABI,
    functionName: 'lastExecutionNonce',
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress },
  });

  const lastExecutionTimestamp = useReadContract({
    address: vaultAddress,
    abi: KernelVaultABI,
    functionName: 'lastExecutionTimestamp',
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress },
  });

  const assetDecimals = isEthVault ? 18 : (decimalsQuery.data as number | undefined) ?? 18;
  const assetSymbol = isEthVault ? 'ETH' : (symbolQuery.data as string | undefined) ?? 'TOKEN';

  return {
    asset: asset.data,
    agentId: agentId.data,
    trustedImageId: trustedImageId.data,
    totalShares: totalShares.data,
    totalAssets: totalAssets.data,
    totalValueLocked: totalValueLocked.data,
    lastExecutionNonce: lastExecutionNonce.data,
    lastExecutionTimestamp: lastExecutionTimestamp.data,
    assetDecimals,
    assetSymbol,
    isEthVault,
    isLoading: asset.isLoading || agentId.isLoading || trustedImageId.isLoading || totalShares.isLoading || totalAssets.isLoading,
  };
}

export function useVaultShares(vaultAddress: `0x${string}` | undefined, depositor: `0x${string}` | undefined) {
  const { selectedChainId } = useNetwork();
  return useReadContract({
    address: vaultAddress,
    abi: KernelVaultABI,
    functionName: 'shares',
    args: depositor ? [depositor] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!vaultAddress && !!depositor },
  });
}

export function useDepositETH(vaultAddress: `0x${string}` | undefined) {
  const { selectedChainId } = useNetwork();
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId: selectedChainId });

  const deposit = (ethAmount: string) => {
    if (!vaultAddress) return;
    writeContract({
      address: vaultAddress,
      abi: KernelVaultABI,
      functionName: 'depositETH',
      value: parseEther(ethAmount),
      chainId: selectedChainId,
    });
  };

  return { deposit, hash, isPending, isConfirming, isSuccess, error };
}

export function useDepositERC20(vaultAddress: `0x${string}` | undefined) {
  const { selectedChainId } = useNetwork();
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId: selectedChainId });

  const deposit = (amount: bigint) => {
    if (!vaultAddress) return;
    writeContract({
      address: vaultAddress,
      abi: KernelVaultABI,
      functionName: 'depositERC20Tokens',
      args: [amount],
      chainId: selectedChainId,
    });
  };

  return { deposit, hash, isPending, isConfirming, isSuccess, error };
}

export function useWithdraw(vaultAddress: `0x${string}` | undefined) {
  const { selectedChainId } = useNetwork();
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId: selectedChainId });

  const withdraw = (shareAmount: bigint) => {
    if (!vaultAddress) return;
    writeContract({
      address: vaultAddress,
      abi: KernelVaultABI,
      functionName: 'withdraw',
      args: [shareAmount],
      chainId: selectedChainId,
    });
  };

  return { withdraw, hash, isPending, isConfirming, isSuccess, error };
}

export function useExecute(vaultAddress: `0x${string}` | undefined) {
  const { selectedChainId } = useNetwork();
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId: selectedChainId });

  const execute = (journal: `0x${string}`, seal: `0x${string}`, agentOutputBytes: `0x${string}`) => {
    if (!vaultAddress) return;
    writeContract({
      address: vaultAddress,
      abi: KernelVaultABI,
      functionName: 'execute',
      args: [journal, seal, agentOutputBytes],
      chainId: selectedChainId,
    });
  };

  return { execute, hash, isPending, isConfirming, isSuccess, error };
}
