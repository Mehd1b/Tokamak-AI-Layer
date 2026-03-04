'use client';

import { useState } from 'react';
import { parseUnits } from 'viem';
import { useWithdraw } from '@/hooks/useKernelVault';
import { parseVaultError } from '@/lib/vaultErrors';

export function VaultWithdrawForm({ vaultAddress, assetDecimals = 18 }: { vaultAddress: `0x${string}`; assetDecimals?: number }) {
  const [shares, setShares] = useState('');
  const { withdraw, isPending, isConfirming, isSuccess, error } = useWithdraw(vaultAddress);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shares || parseFloat(shares) <= 0) return;
    withdraw(parseUnits(shares, assetDecimals));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-gray-400 mb-1" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          Shares to Withdraw
        </label>
        <input
          type="number"
          step="0.001"
          min="0"
          value={shares}
          onChange={(e) => setShares(e.target.value)}
          placeholder="0.1"
          className="input-dark font-mono"
        />
      </div>
      <button
        type="submit"
        disabled={!shares || parseFloat(shares) <= 0 || isPending || isConfirming}
        className="btn-secondary w-full"
      >
        {isPending ? 'Signing...' : isConfirming ? 'Confirming...' : 'Withdraw'}
      </button>
      {isSuccess && (
        <p className="text-emerald-400 text-sm font-mono">Withdrawal successful!</p>
      )}
      {error && (
        <p className="text-red-400 text-sm font-mono">{parseVaultError(error)}</p>
      )}
    </form>
  );
}
