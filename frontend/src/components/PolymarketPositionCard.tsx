'use client';

import { usePolymarketPositions } from '@/hooks/usePolymarketPosition';
import type { PolymarketPosition } from '@/hooks/usePolymarketPosition';

function formatUsd(value: number, decimals = 2): string {
  if (isNaN(value)) return '$0.00';
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function formatPrice(value: number): string {
  if (isNaN(value)) return '0.00';
  // Polymarket prices are 0–1 range (cents), display as cents
  return `${(value * 100).toFixed(1)}¢`;
}

function formatPercent(value: number): string {
  if (isNaN(value)) return '0.00%';
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
}

function PositionRow({ position }: { position: PolymarketPosition }) {
  const isYes = position.outcome.toLowerCase() === 'yes';
  const pnlPositive = position.pnl >= 0;

  return (
    <tr className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
      <td className="py-3 px-5">
        <div className="max-w-[280px]">
          <p className="text-white text-sm font-medium truncate" title={position.title}>
            {position.title}
          </p>
          {position.resolved && (
            <span className="text-[10px] font-mono text-gray-500 uppercase">Resolved</span>
          )}
        </div>
      </td>
      <td className="py-3 px-3">
        <span
          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-bold ${
            isYes
              ? 'bg-green-500/15 text-green-400'
              : 'bg-red-500/15 text-red-400'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isYes ? 'bg-green-400' : 'bg-red-400'}`} />
          {position.outcome.toUpperCase()}
        </span>
      </td>
      <td className="py-3 px-3 text-right text-gray-300 font-mono">
        {position.size.toLocaleString('en-US', { maximumFractionDigits: 2 })}
      </td>
      <td className="py-3 px-3 text-right text-gray-300 font-mono">
        {formatPrice(position.avgPrice)}
      </td>
      <td className="py-3 px-3 text-right text-white font-mono">
        {formatPrice(position.curPrice)}
      </td>
      <td className="py-3 px-3 text-right text-gray-300 font-mono">
        {formatUsd(position.currentValue)}
      </td>
      <td className="py-3 px-3 text-right">
        <span className={`font-medium font-mono ${pnlPositive ? 'text-green-400' : 'text-red-400'}`}>
          {pnlPositive ? '+' : ''}{formatUsd(position.pnl)}
        </span>
      </td>
      <td className="py-3 px-5 text-right">
        <span className={`font-mono ${pnlPositive ? 'text-green-400' : 'text-red-400'}`}>
          {formatPercent(position.pnlPercent)}
        </span>
      </td>
    </tr>
  );
}

interface PolymarketPositionCardProps {
  vaultAddress: `0x${string}`;
}

export function PolymarketPositionCard({ vaultAddress }: PolymarketPositionCardProps) {
  const { data: portfolio, isLoading, error } = usePolymarketPositions(vaultAddress);

  const activePositions = portfolio?.positions.filter((p) => !p.resolved) ?? [];
  const resolvedPositions = portfolio?.positions.filter((p) => p.resolved) ?? [];
  const totalPnl = portfolio?.totalPnl ?? 0;
  const pnlPositive = totalPnl >= 0;

  return (
    <div className="space-y-4 mb-8">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)' }}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-lg font-light text-white" style={{ fontFamily: 'var(--font-serif), serif' }}>
            Polymarket Trading
          </h2>
          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium bg-blue-500/10 text-blue-400 border-blue-500/20">
            Predictions
          </span>
        </div>
        {portfolio && portfolio.positions.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-xs text-gray-500 font-mono">Live</span>
            <span className="text-xs text-gray-600 font-mono">|</span>
            <span className="text-xs text-gray-500 font-mono">
              {portfolio.activeMarkets} market{portfolio.activeMarkets !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="card">
          <div className="space-y-3 animate-pulse">
            <div className="grid grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-white/5 rounded-lg" />)}
            </div>
            <div className="h-24 bg-white/5 rounded-lg" />
          </div>
        </div>
      )}

      {/* Empty state — no positions */}
      {!isLoading && portfolio && portfolio.positions.length === 0 && (
        <div className="card">
          <div className="text-center py-10">
            <div className="mb-4">
              <svg viewBox="0 0 48 48" className="w-12 h-12 mx-auto opacity-25" fill="none">
                <circle cx="24" cy="24" r="18" stroke="#3B82F6" strokeWidth="1.5" />
                <path d="M18 24h12M24 18v12" stroke="#3B82F6" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
              </svg>
            </div>
            <p className="text-gray-400 text-sm font-mono mb-1">No prediction market positions</p>
            <p className="text-gray-600 text-xs font-mono max-w-md mx-auto">
              The agent will open positions on Polymarket based on its prediction strategy.
              Once active, market positions, outcomes, and PnL will appear here.
            </p>
          </div>
        </div>
      )}

      {/* Portfolio summary + positions */}
      {!isLoading && portfolio && portfolio.positions.length > 0 && (
        <>
          {/* Portfolio Summary Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="card !py-3 !px-4">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Portfolio Value</div>
              <div className="text-lg font-semibold text-white font-mono">{formatUsd(portfolio.totalValue)}</div>
            </div>
            <div className="card !py-3 !px-4">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Unrealized PnL</div>
              <div className={`text-lg font-semibold font-mono ${pnlPositive ? 'text-green-400' : 'text-red-400'}`}>
                {pnlPositive ? '+' : ''}{formatUsd(totalPnl)}
              </div>
            </div>
            <div className="card !py-3 !px-4">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Active Markets</div>
              <div className="text-lg font-semibold text-white font-mono">{portfolio.activeMarkets}</div>
            </div>
            <div className="card !py-3 !px-4">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Resolved</div>
              <div className="text-lg font-semibold text-white font-mono">{portfolio.resolvedMarkets}</div>
            </div>
            <div className="card !py-3 !px-4">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Avg Return</div>
              {(() => {
                const positions = portfolio.positions.filter((p) => p.pnlPercent !== 0);
                const avgReturn = positions.length > 0
                  ? positions.reduce((sum, p) => sum + p.pnlPercent, 0) / positions.length
                  : 0;
                const positive = avgReturn >= 0;
                return (
                  <div className={`text-lg font-semibold font-mono ${positive ? 'text-green-400' : 'text-red-400'}`}>
                    {formatPercent(avgReturn)}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Active Positions Table */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-400 font-mono uppercase tracking-wider">
                Active Positions ({activePositions.length})
              </h3>
              {activePositions.length > 0 && (
                <div className={`text-sm font-mono font-medium ${pnlPositive ? 'text-green-400' : 'text-red-400'}`}>
                  Total PnL: {pnlPositive ? '+' : ''}{formatUsd(totalPnl)}
                </div>
              )}
            </div>

            {activePositions.length > 0 ? (
              <div className="overflow-x-auto -mx-5">
                <table className="w-full text-sm font-mono min-w-[800px]">
                  <thead>
                    <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-white/5">
                      <th className="text-left py-2.5 px-5">Market</th>
                      <th className="text-left py-2.5 px-3">Outcome</th>
                      <th className="text-right py-2.5 px-3">Shares</th>
                      <th className="text-right py-2.5 px-3">Entry</th>
                      <th className="text-right py-2.5 px-3">Current</th>
                      <th className="text-right py-2.5 px-3">Value</th>
                      <th className="text-right py-2.5 px-3">PnL</th>
                      <th className="text-right py-2.5 px-5">Return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activePositions.map((pos) => (
                      <PositionRow key={`${pos.conditionId}-${pos.outcome}`} position={pos} />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 text-sm font-mono">No active positions</p>
                <p className="text-gray-600 text-xs font-mono mt-1">
                  All positions have been resolved
                </p>
              </div>
            )}
          </div>

          {/* Resolved Positions (collapsed by default if many) */}
          {resolvedPositions.length > 0 && (
            <div className="card opacity-75">
              <h3 className="text-sm font-medium text-gray-500 font-mono uppercase tracking-wider mb-4">
                Resolved Positions ({resolvedPositions.length})
              </h3>
              <div className="overflow-x-auto -mx-5">
                <table className="w-full text-sm font-mono min-w-[800px]">
                  <thead>
                    <tr className="text-gray-600 text-xs uppercase tracking-wider border-b border-white/5">
                      <th className="text-left py-2.5 px-5">Market</th>
                      <th className="text-left py-2.5 px-3">Outcome</th>
                      <th className="text-right py-2.5 px-3">Shares</th>
                      <th className="text-right py-2.5 px-3">Entry</th>
                      <th className="text-right py-2.5 px-3">Final</th>
                      <th className="text-right py-2.5 px-3">Value</th>
                      <th className="text-right py-2.5 px-3">PnL</th>
                      <th className="text-right py-2.5 px-5">Return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resolvedPositions.map((pos) => (
                      <PositionRow key={`${pos.conditionId}-${pos.outcome}`} position={pos} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="card">
          <div className="text-center py-6">
            <p className="text-red-400/70 text-sm font-mono">Failed to fetch Polymarket data</p>
          </div>
        </div>
      )}
    </div>
  );
}
