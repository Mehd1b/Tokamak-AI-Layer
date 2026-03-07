'use client';

import { formatEther, formatDuration, truncateAddress } from '@/lib/utils';
import { useNetwork } from '@/lib/NetworkContext';

interface OptimisticStatusCardProps {
  optimisticEnabled: boolean;
  challengeWindow?: bigint;
  minBond?: bigint;
  maxPending?: bigint;
  pendingCount?: bigint;
  bondManagerAddress?: `0x${string}`;
}

export function OptimisticStatusCard({
  optimisticEnabled,
  challengeWindow,
  minBond,
  maxPending,
  pendingCount,
  bondManagerAddress,
}: OptimisticStatusCardProps) {
  const { explorerUrl } = useNetwork();

  const pending = Number(pendingCount ?? BigInt(0));
  const max = Number(maxPending ?? BigInt(3));
  const pendingPct = max > 0 ? (pending / max) * 100 : 0;

  return (
    <div className="card mb-8">
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            background: optimisticEnabled ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255, 255, 255, 0.03)',
            border: `1px solid ${optimisticEnabled ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.08)'}`,
          }}
        >
          <svg viewBox="0 0 24 24" className={`w-5 h-5 ${optimisticEnabled ? 'text-green-400' : 'text-gray-500'}`} fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-light text-white" style={{ fontFamily: 'var(--font-serif), serif' }}>
            Optimistic Execution
          </h2>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              optimisticEnabled
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-white/5 text-gray-400 border border-white/10'
            }`}
          >
            {optimisticEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </div>

      {optimisticEnabled && (
        <div className="space-y-4" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
            <span className="text-gray-500 text-sm">Challenge Window</span>
            <span className="text-gray-300 text-sm">
              {challengeWindow !== undefined ? formatDuration(challengeWindow) : '-'}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
            <span className="text-gray-500 text-sm">Min Bond</span>
            <span className="text-gray-300 text-sm">
              {minBond !== undefined ? `${formatEther(minBond, 18)} WSTON` : '-'}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-white/5">
            <span className="text-gray-500 text-sm">Pending Executions</span>
            <div className="flex items-center gap-3">
              <span className="text-gray-300 text-sm">{pending} / {max}</span>
              <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pendingPct}%`,
                    background: pendingPct > 80 ? '#ef4444' : pendingPct > 50 ? '#eab308' : '#22c55e',
                  }}
                />
              </div>
            </div>
          </div>
          {bondManagerAddress && (
            <div className="flex flex-col sm:flex-row sm:justify-between py-3">
              <span className="text-gray-500 text-sm">Bond Manager</span>
              <a
                href={`${explorerUrl}/address/${bondManagerAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#A855F7] text-sm hover:underline"
              >
                {truncateAddress(bondManagerAddress, 6)}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
