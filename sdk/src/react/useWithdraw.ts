'use client';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTokamakClient } from './provider';
import { WithdrawError, ErrorCode } from '../errors';

export type WithdrawStep = 'idle' | 'withdrawing' | 'success' | 'error';

export interface UseWithdrawReturn {
  step: WithdrawStep;
  error: WithdrawError | null;
  txHash: `0x${string}` | null;
  assetsOut: bigint | null;
  withdraw: (shares: bigint) => Promise<void>;
  reset: () => void;
}

export function useWithdraw(vaultAddress: `0x${string}` | undefined): UseWithdrawReturn {
  const client = useTokamakClient();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<WithdrawStep>('idle');
  const [error, setError] = useState<WithdrawError | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [assetsOut, setAssetsOut] = useState<bigint | null>(null);

  const withdraw = useCallback(async (shares: bigint) => {
    if (!client || !vaultAddress) {
      setError(new WithdrawError(ErrorCode.TRANSACTION_REVERTED, 'Wallet not connected'));
      setStep('error');
      return;
    }

    try {
      setError(null);
      setTxHash(null);
      setAssetsOut(null);
      setStep('withdrawing');

      const vaultClient = client.createVaultClient(vaultAddress);
      const result = await vaultClient.withdraw(shares);

      setTxHash(result.txHash);
      setAssetsOut(result.assetsOut);
      setStep('success');

      await queryClient.invalidateQueries({ queryKey: ['tokamak', 'vault', vaultAddress] });
      await queryClient.invalidateQueries({ queryKey: ['tokamak', 'userShares', vaultAddress] });
    } catch (err) {
      setError(WithdrawError.from(err));
      setStep('error');
    }
  }, [client, vaultAddress, queryClient]);

  const reset = useCallback(() => {
    setStep('idle');
    setError(null);
    setTxHash(null);
    setAssetsOut(null);
  }, []);

  return { step, error, txHash, assetsOut, withdraw, reset };
}
