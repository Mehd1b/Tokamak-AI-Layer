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
        className="btn-secondary w-full inline-flex items-center justify-center gap-2"
      >
        {(isPending || isConfirming) && (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {isPending ? 'Signing...' : isConfirming ? 'Confirming...' : 'Withdraw'}
      </button>
      {isSuccess && (
        <div className="flex items-center gap-2 text-emerald-400 text-sm font-mono p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Withdrawal successful!
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 text-red-400 text-sm font-mono p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {parseVaultError(error)}
        </div>
      )}
    </form>
  );
}
