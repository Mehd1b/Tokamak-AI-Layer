'use client';

import { useState, useCallback } from 'react';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import { erc20Abi, parseEther } from 'viem';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useTokamakClient } from './provider';
import { getLegacyGasOverrides } from './useChainValidation';
import { DepositError, ErrorCode } from '../errors';

export type DepositStep = 'idle' | 'checking' | 'approving' | 'depositing' | 'success' | 'error';

export interface UseDepositReturn {
  step: DepositStep;
  error: DepositError | null;
  txHash: `0x${string}` | null;
  sharesMinted: bigint | null;
  deposit: (amount: bigint) => Promise<void>;
  reset: () => void;
  needsApproval: (amount: bigint) => boolean;
  isETH: boolean;
  allowance: bigint;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

export function useDeposit(
  vaultAddress: `0x${string}` | undefined,
  asset: `0x${string}` | undefined
): UseDepositReturn {
  const client = useTokamakClient();
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<DepositStep>('idle');
  const [error, setError] = useState<DepositError | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [sharesMinted, setSharesMinted] = useState<bigint | null>(null);

  const isETH = !asset || asset === ZERO_ADDRESS;

  // Query allowance for ERC20
  const { data: allowance = 0n } = useQuery({
    queryKey: ['tokamak', 'allowance', asset, vaultAddress, address],
    queryFn: async () => {
      if (!publicClient || !address || !vaultAddress || !asset || isETH) return 0n;
      return publicClient.readContract({
        address: asset,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, vaultAddress],
      });
    },
    enabled: !!publicClient && !!address && !!vaultAddress && !isETH,
    staleTime: 10_000,
  });

  const needsApproval = useCallback(
    (amount: bigint) => !isETH && allowance < amount,
    [isETH, allowance]
  );

  const deposit = useCallback(async (amount: bigint) => {
    if (!client || !vaultAddress || !walletClient || !publicClient || !address) {
      setError(new DepositError(ErrorCode.TRANSACTION_REVERTED, 'Wallet not connected'));
      setStep('error');
      return;
    }

    try {
      setError(null);
      setTxHash(null);
      setSharesMinted(null);

      const vaultClient = client.createVaultClient(vaultAddress);

      // Approve if needed (ERC20 only)
      if (!isETH && allowance < amount) {
        setStep('approving');
        const approveTx = await walletClient.writeContract({
          address: asset!,
          abi: erc20Abi,
          functionName: 'approve',
          args: [vaultAddress, amount],
          ...getLegacyGasOverrides(chainId),
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        // Invalidate allowance cache
        await queryClient.invalidateQueries({
          queryKey: ['tokamak', 'allowance', asset, vaultAddress, address],
        });
      }

      // Deposit
      setStep('depositing');
      const result = isETH
        ? await vaultClient.depositETH(amount)
        : await vaultClient.depositERC20(amount);

      setTxHash(result.txHash);
      setSharesMinted(result.sharesMinted);
      setStep('success');

      // Invalidate vault and user shares queries
      await queryClient.invalidateQueries({ queryKey: ['tokamak', 'vault', vaultAddress] });
      await queryClient.invalidateQueries({ queryKey: ['tokamak', 'userShares', vaultAddress] });
    } catch (err) {
      const depositErr = DepositError.from(err);
      setError(depositErr);
      setStep('error');
    }
  }, [client, vaultAddress, walletClient, publicClient, address, isETH, allowance, asset, chainId, queryClient]);

  const reset = useCallback(() => {
    setStep('idle');
    setError(null);
    setTxHash(null);
    setSharesMinted(null);
  }, []);

  return { step, error, txHash, sharesMinted, deposit, reset, needsApproval, isETH, allowance };
}
