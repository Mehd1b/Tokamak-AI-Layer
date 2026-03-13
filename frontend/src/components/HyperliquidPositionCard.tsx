'use client';

import { useHyperliquidPosition, useSubAccount } from '@/hooks/useHyperliquidPosition';
import { truncateAddress } from '@/lib/utils';

function formatUsd(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '$0.00';
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatSize(szi: string): { size: string; isShort: boolean } {
  const num = parseFloat(szi);
  return { size: Math.abs(num).toString(), isShort: num < 0 };
}

function formatPercent(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return `${(num * 100).toFixed(2)}%`;
}

interface HyperliquidPositionCardProps {
  vaultAddress: `0x${string}`;
}

export function HyperliquidPositionCard({ vaultAddress }: HyperliquidPositionCardProps) {
  const { data: subAccount } = useSubAccount(vaultAddress);
  const { data: accountState, isLoading, error } = useHyperliquidPosition(vaultAddress);

  const subAddr = subAccount as `0x${string}` | undefined;
  const isZero = subAddr === '0x0000000000000000000000000000000000000000';
  const positions = accountState?.assetPositions?.filter(
    (ap) => parseFloat(ap.position.szi) !== 0
  );
  const marginSummary = accountState?.crossMarginSummary ?? accountState?.marginSummary;

  return (
    <div className="card mb-8">
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)' }}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-light text-white" style={{ fontFamily: 'var(--font-serif), serif' }}>
            Hyperliquid Positions
          </h2>
          {subAddr && !isZero && (
            <span className="text-xs text-gray-500 font-mono">
              Sub-account: {truncateAddress(subAddr, 6)}
            </span>
          )}
        </div>
        <div className="ml-auto">
          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
            Hyperliquid
          </span>
        </div>
      </div>

      {/* No sub-account registered */}
      {(!subAddr || isZero) && !isLoading && (
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm font-mono">No sub-account registered for this vault</p>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3 animate-pulse">
          <div className="h-16 bg-white/5 rounded" />
          <div className="h-16 bg-white/5 rounded" />
        </div>
      )}

      {/* Account summary */}
      {marginSummary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-3 rounded-lg border border-white/5 bg-white/[0.02]">
            <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Account Value</div>
            <div className="text-sm font-medium text-white font-mono">
              {formatUsd(marginSummary.accountValue)}
            </div>
          </div>
          <div className="p-3 rounded-lg border border-white/5 bg-white/[0.02]">
            <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Margin Used</div>
            <div className="text-sm font-medium text-white font-mono">
              {formatUsd(marginSummary.totalMarginUsed)}
            </div>
          </div>
          <div className="p-3 rounded-lg border border-white/5 bg-white/[0.02]">
            <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Total Position</div>
            <div className="text-sm font-medium text-white font-mono">
              {formatUsd(marginSummary.totalNtlPos)}
            </div>
          </div>
          <div className="p-3 rounded-lg border border-white/5 bg-white/[0.02]">
            <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Free Margin</div>
            <div className="text-sm font-medium text-white font-mono">
              {formatUsd(
                parseFloat(marginSummary.accountValue) - parseFloat(marginSummary.totalMarginUsed)
              )}
            </div>
          </div>
        </div>
      )}

      {/* Positions table */}
      {positions && positions.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-mono">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-white/5">
                <th className="text-left py-3 px-2">Asset</th>
                <th className="text-left py-3 px-2">Side</th>
                <th className="text-right py-3 px-2">Size</th>
                <th className="text-right py-3 px-2">Entry Price</th>
                <th className="text-right py-3 px-2">Position Value</th>
                <th className="text-right py-3 px-2">uPnL</th>
                <th className="text-right py-3 px-2">ROE</th>
                <th className="text-right py-3 px-2">Leverage</th>
                <th className="text-right py-3 px-2">Liq. Price</th>
                <th className="text-right py-3 px-2">Margin</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((ap) => {
                const pos = ap.position;
                const { size, isShort } = formatSize(pos.szi);
                const pnl = parseFloat(pos.unrealizedPnl);
                const roe = parseFloat(pos.returnOnEquity);

                return (
                  <tr key={pos.coin} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-3 px-2 text-white font-medium">{pos.coin}</td>
                    <td className="py-3 px-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        isShort
                          ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                          : 'bg-green-500/10 text-green-400 border border-green-500/20'
                      }`}>
                        {isShort ? 'SHORT' : 'LONG'}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right text-gray-300">{size}</td>
                    <td className="py-3 px-2 text-right text-gray-300">{formatUsd(pos.entryPx)}</td>
                    <td className="py-3 px-2 text-right text-gray-300">{formatUsd(pos.positionValue)}</td>
                    <td className={`py-3 px-2 text-right font-medium ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {pnl >= 0 ? '+' : ''}{formatUsd(pos.unrealizedPnl)}
                    </td>
                    <td className={`py-3 px-2 text-right ${roe >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {roe >= 0 ? '+' : ''}{formatPercent(pos.returnOnEquity)}
                    </td>
                    <td className="py-3 px-2 text-right text-gray-300">
                      {pos.leverage.value}x
                    </td>
                    <td className="py-3 px-2 text-right text-gray-300">
                      {pos.liquidationPx ? formatUsd(pos.liquidationPx) : '-'}
                    </td>
                    <td className="py-3 px-2 text-right text-gray-300">
                      {formatUsd(pos.marginUsed)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        accountState && (
          <div className="text-center py-8 border-t border-white/5">
            <p className="text-gray-500 text-sm font-mono">No open positions</p>
            <p className="text-gray-600 text-xs font-mono mt-1">
              The agent is not currently holding any perpetual positions
            </p>
          </div>
        )
      )}

      {/* Error state */}
      {error && (
        <div className="text-center py-8">
          <p className="text-red-400 text-sm font-mono">Failed to fetch position data</p>
        </div>
      )}
    </div>
  );
}
