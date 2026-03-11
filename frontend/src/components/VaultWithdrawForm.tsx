'use client';

import { useState } from 'react';
import { parseUnits, formatUnits } from 'viem';
import { useWithdraw } from '@/hooks/useKernelVault';
import { parseVaultError } from '@/lib/vaultErrors';

const DECIMALS_OFFSET = BigInt(1000);

interface VaultWithdrawFormProps {
  vaultAddress: `0x${string}`;
  assetDecimals?: number;
  assetSymbol?: string;
  userShares?: bigint;
  totalShares?: bigint;
  totalAssets?: bigint;
}

/** Convert shares → assets using the vault's ERC4626 virtual offset formula. */
function sharesToAssets(shares: bigint, totalAssets: bigint, totalShares: bigint): bigint {
  if (totalShares + DECIMALS_OFFSET === BigInt(0)) return BigInt(0);
  return (shares * (totalAssets + BigInt(1))) / (totalShares + DECIMALS_OFFSET);
}

/** Convert assets → shares using the vault's ERC4626 virtual offset formula. */
function assetsToShares(assets: bigint, totalAssets: bigint, totalShares: bigint): bigint {
  if (totalAssets + BigInt(1) === BigInt(0)) return BigInt(0);
  return (assets * (totalShares + DECIMALS_OFFSET)) / (totalAssets + BigInt(1));
}

export function VaultWithdrawForm({
  vaultAddress,
  assetDecimals = 18,
  assetSymbol = 'TOKEN',
  userShares,
  totalShares,
  totalAssets,
}: VaultWithdrawFormProps) {
  const [amount, setAmount] = useState('');
  const { withdraw, isPending, isConfirming, isSuccess, error } = useWithdraw(vaultAddress);

  const hasVaultData = userShares !== undefined && totalShares !== undefined && totalAssets !== undefined;

  // Compute available assets from user's shares
  const availableAssets = hasVaultData
    ? sharesToAssets(userShares, totalAssets, totalShares)
    : undefined;

  const availableFormatted = availableAssets !== undefined
    ? formatUnits(availableAssets, assetDecimals)
    : undefined;

  const handleMax = () => {
    if (availableFormatted) {
      setAmount(availableFormatted);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0 || !hasVaultData) return;

    const assetAmount = parseUnits(amount, assetDecimals);

    // Check if user is withdrawing the max — if so, pass all shares directly to avoid rounding dust
    let shareAmount: bigint;
    if (availableAssets !== undefined && assetAmount >= availableAssets) {
      shareAmount = userShares;
    } else {
      shareAmount = assetsToShares(assetAmount, totalAssets, totalShares);
    }

    if (shareAmount <= BigInt(0)) return;
    withdraw(shareAmount);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Available balance */}
      {availableFormatted !== undefined && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5">
          <span className="text-xs text-gray-500 font-mono">Available</span>
          <span className="text-sm text-white font-mono">
            {parseFloat(availableFormatted).toFixed(4)} {assetSymbol}
          </span>
        </div>
      )}

      <div>
        <label className="block text-sm text-gray-400 mb-1" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          Amount to Withdraw
        </label>
        <div className="relative">
          <input
            type="number"
            step="any"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="input-dark font-mono pr-20"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <span className="text-xs text-gray-500 font-mono">{assetSymbol}</span>
            {availableFormatted && (
              <button
                type="button"
                onClick={handleMax}
                className="text-xs text-[#A855F7] hover:text-[#C084FC] font-mono px-1.5 py-0.5 rounded bg-[#A855F7]/10 hover:bg-[#A855F7]/20 transition-colors"
              >
                MAX
              </button>
            )}
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={!amount || parseFloat(amount) <= 0 || isPending || isConfirming || !hasVaultData}
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
