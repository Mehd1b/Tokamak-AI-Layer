'use client';

import { useStrategyStatus } from '@/hooks/useStrategyStatus';
import { formatEther, timestampToDate } from '@/lib/utils';

interface StrategyStatusBannerProps {
  vaultAddress: `0x${string}`;
  assetDecimals: number;
  assetSymbol: string;
}

function formatPPS(snapshotAssets: bigint | undefined, snapshotShares: bigint | undefined, decimals: number): string {
  if (snapshotAssets === undefined || snapshotShares === undefined || snapshotShares === BigInt(0)) {
    return '-';
  }
  // PPS = assets / shares, scaled to `decimals` decimal places for display
  // Multiply assets by 10^decimals, divide by shares, then format
  const scale = BigInt(10) ** BigInt(decimals);
  const ppsScaled = (snapshotAssets * scale) / snapshotShares;
  return formatEther(ppsScaled, decimals);
}

export function StrategyStatusBanner({
  vaultAddress,
  assetDecimals,
  assetSymbol,
}: StrategyStatusBannerProps) {
  const {
    isActive,
    snapshotAssets,
    snapshotShares,
    availableLiquidity,
    lastExecutionTime,
    isLoading,
  } = useStrategyStatus(vaultAddress);

  if (isLoading || !isActive) {
    return null;
  }

  return (
    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl mb-8">
      {/* Header */}
      <div className="flex items-center gap-3 p-5 pb-0">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.2)',
          }}
        >
          {/* Shield / clock icon in amber */}
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5 text-amber-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div>
          <h2
            className="text-lg font-light text-amber-400"
            style={{ fontFamily: 'var(--font-serif), serif' }}
          >
            Strategy In Progress
          </h2>
          <p className="text-sm text-gray-400">
            Deposits are temporarily paused while the agent is executing a strategy.
          </p>
        </div>
      </div>

      {/* Info rows */}
      <div className="p-5 space-y-4" style={{ fontFamily: 'var(--font-mono), monospace' }}>
        <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
          <span className="text-gray-500 text-sm">Available for withdrawal</span>
          <span className="text-gray-300 text-sm">
            {availableLiquidity !== undefined
              ? `${formatEther(availableLiquidity, assetDecimals)} ${assetSymbol}`
              : '-'}
          </span>
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
          <span className="text-gray-500 text-sm">Snapshot PPS</span>
          <span className="text-gray-300 text-sm">
            {formatPPS(snapshotAssets, snapshotShares, assetDecimals)}
          </span>
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
          <span className="text-gray-500 text-sm">Last execution</span>
          <span className="text-gray-300 text-sm">
            {lastExecutionTime !== undefined
              ? timestampToDate(lastExecutionTime)
              : '-'}
          </span>
        </div>
      </div>

      {/* Footer note */}
      <div className="px-5 pb-4">
        <p className="text-xs text-gray-500">
          Deposits will resume after the vault owner settles the strategy.
        </p>
      </div>
    </div>
  );
}
