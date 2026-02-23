'use client';

import { useState } from 'react';
import { parseEther, parseUnits } from 'viem';
import { useDepositETH, useDepositERC20 } from '@/hooks/useKernelVault';

interface VaultDepositFormProps {
  vaultAddress: `0x${string}`;
  isEthVault?: boolean;
  assetDecimals?: number;
  assetSymbol?: string;
}

export function VaultDepositForm({ vaultAddress, isEthVault = true, assetDecimals = 18, assetSymbol = 'ETH' }: VaultDepositFormProps) {
  const [amount, setAmount] = useState('');
  const ethDeposit = useDepositETH(vaultAddress);
  const erc20Deposit = useDepositERC20(vaultAddress);

  const { isPending, isConfirming, isSuccess, error } = isEthVault ? ethDeposit : erc20Deposit;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;
    if (isEthVault) {
      ethDeposit.deposit(amount);
    } else {
      erc20Deposit.deposit(parseUnits(amount, assetDecimals));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-gray-400 mb-1" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          {assetSymbol} Amount
        </label>
        <input
          type="number"
          step="any"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.1"
          className="input-dark font-mono"
        />
      </div>
      {!isEthVault && (
        <p className="text-xs text-gray-500 font-mono">
          Make sure you have approved the vault to spend your {assetSymbol} tokens first.
        </p>
      )}
      <button
        type="submit"
        disabled={!amount || parseFloat(amount) <= 0 || isPending || isConfirming}
        className="btn-primary w-full"
      >
        {isPending ? 'Signing...' : isConfirming ? 'Confirming...' : `Deposit ${assetSymbol}`}
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
