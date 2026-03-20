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
  if (value === null) return 'text-gray-300';
  if (value > 0) return 'text-green-400';
  if (value < 0) return 'text-red-400';
  return 'text-gray-300';
}

function SkeletonRow() {
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
      <div className="h-4 w-24 rounded bg-white/5 animate-pulse" />
      <div className="h-4 w-16 rounded bg-white/5 animate-pulse mt-1 sm:mt-0" />
    </div>
  );
}

export function PerformanceCard({ vaultAddress }: PerformanceCardProps) {
  const {
    totalReturn,
    returnSince7d,
    returnSince30d,
    maxDrawdown,
    executionCount,
    winRate,
    sharpeRatio,
    isLoading,
  } = useVaultPerformance(vaultAddress);

  const metrics: Array<{ label: string; value: string; colorClass: string }> = [
    { label: 'Total Return', value: formatPct(totalReturn), colorClass: pctColor(totalReturn) },
    { label: '7d Return', value: formatPct(returnSince7d), colorClass: pctColor(returnSince7d) },
    { label: '30d Return', value: formatPct(returnSince30d), colorClass: pctColor(returnSince30d) },
    { label: 'Max Drawdown', value: formatPct(maxDrawdown), colorClass: pctColor(maxDrawdown) },
    { label: 'Win Rate', value: winRate !== null ? `${winRate.toFixed(2)}%` : '-', colorClass: 'text-gray-300' },
    { label: 'Executions', value: String(executionCount), colorClass: 'text-gray-300' },
    { label: 'Sharpe Ratio', value: sharpeRatio !== null ? sharpeRatio.toFixed(2) : '-', colorClass: 'text-gray-300' },
  ];

  return (
    <div className="card mb-8">
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

      <div className="space-y-4" style={{ fontFamily: 'var(--font-mono), monospace' }}>
        {isLoading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : (
          metrics.map((metric, idx) => (
            <div
              key={metric.label}
              className={`flex flex-col sm:flex-row sm:justify-between py-3 ${
                idx < metrics.length - 1 ? 'border-b border-white/5' : ''
              }`}
            >
              <span className="text-gray-500 text-sm">{metric.label}</span>
              <span className={`text-sm ${metric.colorClass}`}>{metric.value}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
