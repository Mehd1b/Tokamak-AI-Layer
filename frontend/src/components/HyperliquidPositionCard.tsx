'use client';

import {
  useHyperliquidPosition,
  useHyperliquidMarkets,
  useSubAccount,
} from '@/hooks/useHyperliquidPosition';
import type { HyperliquidMarketMeta } from '@/hooks/useHyperliquidPosition';
import { truncateAddress } from '@/lib/utils';

function formatUsd(value: string | number, decimals = 2): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '$0.00';
  if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (Math.abs(num) >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function formatPrice(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '$0.00';
  if (num >= 10_000) return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (num >= 1) return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  return `$${num.toFixed(6)}`;
}

function formatPercent(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return `${(num * 100).toFixed(4)}%`;
}

function formatPctChange(current: string, prev: string): { text: string; positive: boolean } {
  const cur = parseFloat(current);
  const pre = parseFloat(prev);
  if (!pre || isNaN(cur) || isNaN(pre)) return { text: '0.00%', positive: true };
  const change = ((cur - pre) / pre) * 100;
  return { text: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`, positive: change >= 0 };
}

function MarketTicker({ market }: { market: HyperliquidMarketMeta }) {
  const change = formatPctChange(market.markPx, market.prevDayPx);
  const fundingRate = parseFloat(market.funding);
  const fundingPositive = fundingRate >= 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <div>
        <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Mark Price</div>
        <div className="text-xl font-semibold text-white font-mono">{formatPrice(market.markPx)}</div>
        <div className={`text-xs font-mono ${change.positive ? 'text-green-400' : 'text-red-400'}`}>
          {change.text} 24h
        </div>
      </div>
      <div>
        <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Oracle Price</div>
        <div className="text-lg text-gray-200 font-mono">{formatPrice(market.oraclePx)}</div>
      </div>
      <div>
        <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Funding Rate</div>
        <div className={`text-lg font-mono ${fundingPositive ? 'text-green-400' : 'text-red-400'}`}>
          {formatPercent(market.funding)}
        </div>
        <div className="text-xs text-gray-600 font-mono">{fundingPositive ? 'Longs pay' : 'Shorts pay'}</div>
      </div>
      <div>
        <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Open Interest</div>
        <div className="text-lg text-gray-200 font-mono">{formatUsd(market.openInterest)}</div>
      </div>
      <div>
        <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">24h Volume</div>
        <div className="text-lg text-gray-200 font-mono">{formatUsd(market.dayNtlVlm)}</div>
      </div>
    </div>
  );
}

interface HyperliquidPositionCardProps {
  vaultAddress: `0x${string}`;
}

export function HyperliquidPositionCard({ vaultAddress }: HyperliquidPositionCardProps) {
  const { data: subAddr, isLoading: subLoading } = useSubAccount(vaultAddress);
  const { data: accountState, isLoading, error } = useHyperliquidPosition(vaultAddress);
  const { data: markets } = useHyperliquidMarkets();

  const hasSubAccount = !!subAddr;

  const positions = accountState?.assetPositions?.filter(
    (ap) => parseFloat(ap.position.szi) !== 0
  ) ?? [];
  const marginSummary = accountState?.crossMarginSummary ?? accountState?.marginSummary;

  // Find relevant market data for positions held
  const positionCoins = positions.map((p) => p.position.coin);
  const relevantMarkets = (markets ?? []).filter(
    (m) => positionCoins.includes(m.coin) || m.coin === 'BTC' || m.coin === 'ETH'
  );
  // Primary market: first position's coin, or BTC as default
  const primaryMarket = (markets ?? []).find(
    (m) => (positionCoins.length > 0 ? m.coin === positionCoins[0] : m.coin === 'BTC')
  );

  // Total unrealized PnL across all positions
  const totalPnl = positions.reduce((sum, ap) => sum + parseFloat(ap.position.unrealizedPnl || '0'), 0);
  const accountValue = parseFloat(marginSummary?.accountValue ?? '0');
  const totalMargin = parseFloat(marginSummary?.totalMarginUsed ?? '0');
  const freeMargin = accountValue - totalMargin;
  const marginUtilization = accountValue > 0 ? (totalMargin / accountValue) * 100 : 0;

  return (
    <div className="space-y-4 mb-8">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)' }}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <h2 className="text-lg font-light text-white" style={{ fontFamily: 'var(--font-serif), serif' }}>
            Hyperliquid Trading
          </h2>
          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
            Perpetuals
          </span>
        </div>
        {hasSubAccount && subAddr && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-gray-500 font-mono">Live</span>
            <span className="text-xs text-gray-600 font-mono">|</span>
            <span className="text-xs text-gray-500 font-mono">Sub: {truncateAddress(subAddr, 4)}</span>
          </div>
        )}
      </div>

      {/* Market Ticker */}
      {primaryMarket && (
        <div className="card !py-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-white font-mono">{primaryMarket.coin}-USD</span>
            <span className="text-xs text-gray-600 font-mono">PERP</span>
          </div>
          <MarketTicker market={primaryMarket} />
        </div>
      )}

      {/* No sub-account state */}
      {!hasSubAccount && !subLoading && (
        <div className="card">
          <div className="text-center py-10">
            <div className="mb-4">
              <svg viewBox="0 0 48 48" className="w-12 h-12 mx-auto opacity-25" fill="none">
                <rect x="8" y="12" width="32" height="24" rx="3" stroke="#10B981" strokeWidth="1.5" />
                <path d="M16 24h16M24 18v12" stroke="#10B981" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
              </svg>
            </div>
            <p className="text-gray-400 text-sm font-mono mb-1">No sub-account registered</p>
            <p className="text-gray-600 text-xs font-mono max-w-md mx-auto">
              Register this vault on the HyperliquidAdapter to enable perpetual trading.
              Once registered, live positions, PnL, and market data will appear here.
            </p>
          </div>
        </div>
      )}

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

      {/* Account Overview + Positions (when sub-account exists) */}
      {hasSubAccount && accountState && (
        <>
          {/* Account Summary Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="card !py-3 !px-4">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Account Value</div>
              <div className="text-lg font-semibold text-white font-mono">{formatUsd(accountValue)}</div>
            </div>
            <div className="card !py-3 !px-4">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Unrealized PnL</div>
              <div className={`text-lg font-semibold font-mono ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalPnl >= 0 ? '+' : ''}{formatUsd(totalPnl)}
              </div>
            </div>
            <div className="card !py-3 !px-4">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Margin Used</div>
              <div className="text-lg font-semibold text-white font-mono">{formatUsd(totalMargin)}</div>
            </div>
            <div className="card !py-3 !px-4">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Free Margin</div>
              <div className="text-lg font-semibold text-white font-mono">{formatUsd(freeMargin)}</div>
            </div>
            <div className="card !py-3 !px-4">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Margin Use</div>
              <div className="text-lg font-semibold text-white font-mono">{marginUtilization.toFixed(1)}%</div>
              {/* Utilization bar */}
              <div className="mt-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    marginUtilization > 80 ? 'bg-red-500' : marginUtilization > 50 ? 'bg-yellow-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(marginUtilization, 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Positions Table */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-400 font-mono uppercase tracking-wider">
                Open Positions ({positions.length})
              </h3>
              {positions.length > 0 && (
                <div className={`text-sm font-mono font-medium ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  Total PnL: {totalPnl >= 0 ? '+' : ''}{formatUsd(totalPnl)}
                </div>
              )}
            </div>

            {positions.length > 0 ? (
              <div className="overflow-x-auto -mx-5">
                <table className="w-full text-sm font-mono min-w-[800px]">
                  <thead>
                    <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-white/5">
                      <th className="text-left py-2.5 px-5">Asset</th>
                      <th className="text-left py-2.5 px-3">Side</th>
                      <th className="text-right py-2.5 px-3">Size</th>
                      <th className="text-right py-2.5 px-3">Entry</th>
                      <th className="text-right py-2.5 px-3">Mark</th>
                      <th className="text-right py-2.5 px-3">Value</th>
                      <th className="text-right py-2.5 px-3">uPnL</th>
                      <th className="text-right py-2.5 px-3">ROE</th>
                      <th className="text-right py-2.5 px-3">Lev</th>
                      <th className="text-right py-2.5 px-5">Liq. Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((ap) => {
                      const pos = ap.position;
                      const size = parseFloat(pos.szi);
                      const isShort = size < 0;
                      const pnl = parseFloat(pos.unrealizedPnl);
                      const roe = parseFloat(pos.returnOnEquity);
                      const marketData = (markets ?? []).find((m) => m.coin === pos.coin);

                      return (
                        <tr key={pos.coin} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                          <td className="py-3 px-5">
                            <div className="flex items-center gap-2">
                              <span className="text-white font-medium">{pos.coin}</span>
                              <span className="text-gray-600 text-xs">PERP</span>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-bold ${
                              isShort
                                ? 'bg-red-500/15 text-red-400'
                                : 'bg-green-500/15 text-green-400'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isShort ? 'bg-red-400' : 'bg-green-400'}`} />
                              {isShort ? 'SHORT' : 'LONG'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right text-gray-300">
                            {Math.abs(size).toString()}
                          </td>
                          <td className="py-3 px-3 text-right text-gray-300">
                            {formatPrice(pos.entryPx)}
                          </td>
                          <td className="py-3 px-3 text-right text-white">
                            {marketData ? formatPrice(marketData.markPx) : '-'}
                          </td>
                          <td className="py-3 px-3 text-right text-gray-300">
                            {formatUsd(pos.positionValue)}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span className={`font-medium ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {pnl >= 0 ? '+' : ''}{formatUsd(pos.unrealizedPnl)}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span className={`${roe >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {roe >= 0 ? '+' : ''}{(roe * 100).toFixed(2)}%
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right text-yellow-400 font-medium">
                            {pos.leverage.value}x
                          </td>
                          <td className="py-3 px-5 text-right text-gray-400">
                            {pos.liquidationPx ? formatPrice(pos.liquidationPx) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 text-sm font-mono">No open positions</p>
                <p className="text-gray-600 text-xs font-mono mt-1">
                  The agent will open positions based on its trading strategy
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="card">
          <div className="text-center py-6">
            <p className="text-red-400/70 text-sm font-mono">Failed to fetch Hyperliquid data</p>
          </div>
        </div>
      )}
    </div>
  );
}
