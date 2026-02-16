'use client';

import { useState } from 'react';
import { useDepositETH } from '@/hooks/useKernelVault';

export function VaultDepositForm({ vaultAddress }: { vaultAddress: `0x${string}` }) {
  const [amount, setAmount] = useState('');
  const { deposit, isPending, isConfirming, isSuccess, error } = useDepositETH(vaultAddress);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;
    deposit(amount);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-gray-400 mb-1" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          ETH Amount
        </label>
        <input
          type="number"
          step="0.001"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.1"
          className="input-dark font-mono"
        />
      </div>
      <button
        type="submit"
        disabled={!amount || parseFloat(amount) <= 0 || isPending || isConfirming}
        className="btn-primary w-full"
      >
        {isPending ? 'Signing...' : isConfirming ? 'Confirming...' : 'Deposit ETH'}
      </button>
      {isSuccess && (
        <p className="text-emerald-400 text-sm font-mono">Deposit successful!</p>
      )}
      {error && (
        <p className="text-red-400 text-sm font-mono">{error.message.slice(0, 100)}</p>
      )}
    </form>
  );
}
