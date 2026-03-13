'use client';

interface PolymarketPositionCardProps {
  vaultAddress: `0x${string}`;
}

export function PolymarketPositionCard({ vaultAddress }: PolymarketPositionCardProps) {
  return (
    <div className="card mb-8">
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)' }}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-light text-white" style={{ fontFamily: 'var(--font-serif), serif' }}>
            Polymarket Positions
          </h2>
          <span className="text-xs text-gray-500 font-mono">Prediction market positions</span>
        </div>
        <div className="ml-auto">
          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium bg-blue-500/10 text-blue-400 border-blue-500/20">
            Polymarket
          </span>
        </div>
      </div>

      <div className="text-center py-12 border-t border-white/5">
        <div className="mb-4">
          <svg viewBox="0 0 64 64" className="w-16 h-16 mx-auto opacity-20" fill="none">
            <circle cx="32" cy="32" r="24" stroke="#3B82F6" strokeWidth="1.5" strokeOpacity="0.5" />
            <path d="M24 32h16M32 24v16" stroke="#3B82F6" strokeWidth="1.5" strokeOpacity="0.4" strokeLinecap="round" />
          </svg>
        </div>
        <p className="text-gray-500 text-sm font-mono mb-1">Polymarket integration coming soon</p>
        <p className="text-gray-600 text-xs font-mono">
          This vault will display prediction market positions, outcome shares, and potential payouts
        </p>
      </div>
    </div>
  );
}
