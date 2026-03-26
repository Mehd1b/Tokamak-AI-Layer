'use client';

import { useVaultPerformance } from '@/hooks/useVaultPerformance';

interface PerformanceCardProps {
  vaultAddress: `0x${string}`;
}

function formatPct(value: number | null): string {
  if (value === null) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function pctColor(value: number | null): string {
  if (value === null) return 'text-gray-400';
  if (value > 0) return 'text-green-400';
  if (value < 0) return 'text-red-400';
  return 'text-gray-300';
}

function pctBg(value: number | null): string {
  if (value === null) return 'bg-white/[0.03]';
  if (value > 0) return 'bg-green-500/[0.06]';
  if (value < 0) return 'bg-red-500/[0.06]';
  return 'bg-white/[0.03]';
}

function pctBorder(value: number | null): string {
  if (value === null) return 'border-white/5';
  if (value > 0) return 'border-green-500/10';
  if (value < 0) return 'border-red-500/10';
  return 'border-white/5';
}

function SkeletonCell() {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <div className="h-3 w-16 rounded bg-white/5 animate-pulse mb-2" />
      <div className="h-6 w-20 rounded bg-white/5 animate-pulse" />
    </div>
  );
}

export function PerformanceCard({ vaultAddress }: PerformanceCardProps) {
  const {
    totalReturn,
    apy,
    returnSince7d,
    returnSince30d,
    maxDrawdown,
    executionCount,
    winRate,
    sharpeRatio,
    isLoading,
  } = useVaultPerformance(vaultAddress);

  return (
    <div className="card mb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            background: 'rgba(168, 85, 247, 0.1)',
            border: '1px solid rgba(168, 85, 247, 0.2)',
          }}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#A855F7]" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        </div>
        <h2 className="text-lg font-light text-white" style={{ fontFamily: 'var(--font-serif), serif' }}>
          Performance
        </h2>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SkeletonCell />
          <SkeletonCell />
          <SkeletonCell />
          <SkeletonCell />
        </div>
      ) : (
        <>
          {/* Primary metrics — summary grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {/* APY */}
            <div className={`rounded-xl border ${pctBorder(apy)} ${pctBg(apy)} p-4`}>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-1">APY</p>
              <p className={`text-lg font-mono font-medium ${pctColor(apy)}`}>
                {formatPct(apy)}
              </p>
            </div>

            {/* Max Drawdown */}
            <div className={`rounded-xl border ${pctBorder(maxDrawdown)} ${pctBg(maxDrawdown)} p-4`}>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-1">Max Drawdown</p>
              <p className={`text-lg font-mono font-medium ${pctColor(maxDrawdown)}`}>
                {formatPct(maxDrawdown)}
              </p>
            </div>

            {/* Win Rate */}
            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-1">Win Rate</p>
              <p className={`text-lg font-mono font-medium ${winRate !== null ? (winRate >= 50 ? 'text-green-400' : 'text-amber-400') : 'text-gray-400'}`}>
                {winRate !== null ? `${winRate.toFixed(1)}%` : '-'}
              </p>
            </div>

            {/* Executions */}
            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-1">Executions</p>
              <p className="text-lg font-mono font-medium text-gray-300">
                {executionCount}
              </p>
            </div>
          </div>

          {/* Secondary metrics — detail rows */}
          <div className="space-y-0" style={{ fontFamily: 'var(--font-mono), monospace' }}>
            <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
              <span className="text-gray-500 text-sm">Total Return</span>
              <span className={`text-sm ${pctColor(totalReturn)}`}>{formatPct(totalReturn)}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
              <span className="text-gray-500 text-sm">7d Return</span>
              <span className={`text-sm ${pctColor(returnSince7d)}`}>{formatPct(returnSince7d)}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
              <span className="text-gray-500 text-sm">30d Return</span>
              <span className={`text-sm ${pctColor(returnSince30d)}`}>{formatPct(returnSince30d)}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between py-3">
              <span className="text-gray-500 text-sm">Sharpe Ratio</span>
              <span className="text-sm text-gray-300">{sharpeRatio !== null ? sharpeRatio.toFixed(2) : '-'}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
