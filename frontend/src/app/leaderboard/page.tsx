'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useAgentLeaderboard, type AgentLeaderboardEntry, type TimePeriod } from '@/hooks/useAgentLeaderboard';
import { formatEther, truncateBytes32 } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SortKey = 'rank' | 'name' | 'strategy' | 'return' | 'drawdown' | 'tvl' | 'vaults' | 'executions';
type SortDir = 'asc' | 'desc';

const TIME_PERIODS: { key: TimePeriod; label: string }[] = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: 'all', label: 'All-time' },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Format TVL for display, handling multi-decimal assets. Uses first vault's decimals. */
function formatTVL(entry: AgentLeaderboardEntry): string {
  if (entry.vaults.length === 0) return '0';
  // Use the first vault's decimals as representative
  const decimals = entry.vaults[0].assetDecimals;
  const raw = formatEther(entry.totalTVL, decimals);
  return raw.replace(/\.?0+$/, '');
}

function assetSymbol(entry: AgentLeaderboardEntry): string {
  if (entry.vaults.length === 0) return '';
  return entry.vaults[0].assetSymbol;
}

function getReturnForPeriod(entry: AgentLeaderboardEntry, period: TimePeriod): number | null {
  switch (period) {
    case '7d': return entry.return7d;
    case '30d': return entry.return30d;
    case 'all': return entry.returnAllTime;
  }
}

function periodLabel(period: TimePeriod): string {
  switch (period) {
    case '7d': return '7d';
    case '30d': return '30d';
    case 'all': return 'All';
  }
}

/* Strategy badge color mapping (consistent with VaultCard) */
function strategyBadge(strategy: string): { bg: string; text: string; border: string } {
  const s = strategy.toLowerCase();
  if (s.includes('yield') || s.includes('farm')) return { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' };
  if (s.includes('arb') || s.includes('arbitrage')) return { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' };
  if (s.includes('hedge') || s.includes('neutral')) return { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' };
  if (s.includes('snip') || s.includes('mev')) return { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20' };
  if (s.includes('lp') || s.includes('liquidity')) return { bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/20' };
  if (s.includes('perp') || s.includes('trading')) return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' };
  if (s.includes('prediction') || s.includes('market')) return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' };
  return { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' };
}

/* ------------------------------------------------------------------ */
/*  Sort header component                                              */
/* ------------------------------------------------------------------ */

function SortHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
  className = '',
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = currentSort === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider transition-colors ${
        isActive ? 'text-[#d5f972]' : 'text-gray-600 hover:text-gray-400'
      } ${className}`}
    >
      {label}
      {isActive && (
        <svg
          className={`w-3 h-3 transition-transform ${currentDir === 'asc' ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function LeaderboardPage() {
  const { data: entries, isLoading } = useAgentLeaderboard();
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('30d');
  const [sortKey, setSortKey] = useState<SortKey>('tvl');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = useMemo(() => {
    if (!entries || entries.length === 0) return [];
    const arr = [...entries];
    const dir = sortDir === 'desc' ? -1 : 1;

    arr.sort((a, b) => {
      switch (sortKey) {
        case 'rank':
        case 'tvl':
          return a.totalTVL > b.totalTVL ? -1 * dir : a.totalTVL < b.totalTVL ? 1 * dir : 0;
        case 'name': {
          const an = a.name || a.agentId;
          const bn = b.name || b.agentId;
          return an.localeCompare(bn) * dir;
        }
        case 'strategy': {
          return (a.strategy || '').localeCompare(b.strategy || '') * dir;
        }
        case 'return': {
          const ar = getReturnForPeriod(a, timePeriod) ?? -Infinity;
          const br = getReturnForPeriod(b, timePeriod) ?? -Infinity;
          return (br - ar) * dir;
        }
        case 'drawdown': {
          // Better drawdown (closer to 0) first when desc
          const ad = a.maxDrawdown ?? -Infinity;
          const bd = b.maxDrawdown ?? -Infinity;
          return (bd - ad) * dir;
        }
        case 'vaults':
          return (b.vaultCount - a.vaultCount) * dir;
        case 'executions':
          return (b.executionCount - a.executionCount) * dir;
        default:
          return 0;
      }
    });

    return arr;
  }, [entries, sortKey, sortDir, timePeriod]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-px flex-1 max-w-[40px] bg-gradient-to-r from-[#c4f547] to-transparent" />
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d5f972] font-mono"
          >
            Leaderboard
          </span>
        </div>
        <h1
          className="text-4xl md:text-5xl font-light mb-3 tracking-tight"
          style={{ fontFamily: 'var(--font-serif), serif' }}
        >
          <span className="italic text-[#c4f547]">Agent</span>{' '}
          <span className="text-white">Rankings</span>
        </h1>
        <p className="text-gray-500 max-w-lg text-sm leading-relaxed font-mono">
          Compare AI agents by performance, risk, and total value locked across all deployed vaults.
        </p>
      </div>

      {/* Controls: time period selector */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-1 bg-white/[0.02] rounded-lg p-0.5 border border-white/5">
          {TIME_PERIODS.map((tp) => (
            <button
              key={tp.key}
              onClick={() => setTimePeriod(tp.key)}
              className={`px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-md text-[11px] font-mono font-medium transition-all duration-200 ${
                timePeriod === tp.key
                  ? 'bg-[#c4f547]/15 text-[#d5f972] shadow-sm'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tp.label}
            </button>
          ))}
        </div>
        {sorted.length > 0 && (
          <span className="text-xs font-mono text-gray-500">
            {sorted.length} agent{sorted.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-2">
          {/* Skeleton header */}
          <div className="flex items-center gap-4 px-5 py-3">
            <div className="w-8 h-3 skeleton rounded" />
            <div className="flex-1 h-3 skeleton rounded max-w-[120px]" />
            <div className="w-20 h-3 skeleton rounded" />
            <div className="w-16 h-3 skeleton rounded" />
            <div className="w-16 h-3 skeleton rounded" />
            <div className="w-20 h-3 skeleton rounded" />
            <div className="w-12 h-3 skeleton rounded" />
            <div className="w-16 h-3 skeleton rounded" />
          </div>
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/5 bg-[#12121a]/80 p-4"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-center gap-4">
                <div className="w-8 h-6 skeleton rounded" />
                <div className="flex-1">
                  <div className="w-32 h-4 skeleton rounded mb-1" />
                  <div className="w-20 h-3 skeleton rounded" />
                </div>
                <div className="w-20 h-5 skeleton rounded" />
                <div className="w-16 h-5 skeleton rounded" />
                <div className="w-16 h-5 skeleton rounded" />
                <div className="w-24 h-5 skeleton rounded" />
                <div className="w-12 h-5 skeleton rounded" />
                <div className="w-16 h-5 skeleton rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && sorted.length === 0 && (
        <div className="rounded-2xl border border-white/5 bg-[#12121a]/80 text-center py-20">
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[#c4f547]/5 border border-[#c4f547]/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-[#c4f547]/40" fill="none" stroke="currentColor" strokeWidth="1">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-4.5A3.375 3.375 0 0012.75 10.5h-1.5A3.375 3.375 0 007.5 14.25v4.5m9-9V6.375c0-.621-.504-1.125-1.125-1.125H8.625c-.621 0-1.125.504-1.125 1.125V9.75" />
              </svg>
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-1">No agents found</p>
          <p className="text-gray-600 text-xs mb-6 font-mono">Deploy a vault with an agent to appear on the leaderboard.</p>
          <Link
            href="/vaults"
            className="btn-secondary inline-flex items-center gap-2 text-xs"
          >
            Browse Vaults
          </Link>
        </div>
      )}

      {/* Leaderboard table — desktop */}
      {!isLoading && sorted.length > 0 && (
        <>
          {/* Desktop table (hidden on mobile) */}
          <div className="hidden md:block overflow-x-auto">
            {/* Table header */}
            <div className="flex items-center gap-4 px-5 py-2 mb-1 min-w-[800px]">
              <div className="w-10 shrink-0">
                <SortHeader label="#" sortKey="rank" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              </div>
              <div className="flex-1 min-w-[140px]">
                <SortHeader label="Agent" sortKey="name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              </div>
              <div className="w-24 shrink-0">
                <SortHeader label="Strategy" sortKey="strategy" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              </div>
              <div className="w-24 shrink-0 text-right">
                <SortHeader label={`${periodLabel(timePeriod)} Return`} sortKey="return" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="justify-end" />
              </div>
              <div className="w-24 shrink-0 text-right">
                <SortHeader label="Drawdown" sortKey="drawdown" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="justify-end" />
              </div>
              <div className="w-32 shrink-0 text-right">
                <SortHeader label="TVL" sortKey="tvl" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="justify-end" />
              </div>
              <div className="w-16 shrink-0 text-right">
                <SortHeader label="Vaults" sortKey="vaults" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="justify-end" />
              </div>
              <div className="w-20 shrink-0 text-right">
                <SortHeader label="Execs" sortKey="executions" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="justify-end" />
              </div>
              <div className="w-5 shrink-0" />
            </div>

            {/* Table rows */}
            <div className="space-y-1.5 min-w-[800px]">
              {sorted.map((entry, i) => {
                const ret = getReturnForPeriod(entry, timePeriod);
                const isPositive = ret !== null && ret >= 0;
                const retArrow = ret !== null ? (isPositive ? '\u2191' : '\u2193') : '';
                const retColor = ret !== null
                  ? isPositive ? 'text-green-400' : 'text-red-400'
                  : 'text-gray-600';
                const ddColor = entry.maxDrawdown !== null
                  ? entry.maxDrawdown < -10 ? 'text-red-400'
                    : entry.maxDrawdown < -5 ? 'text-amber-400'
                    : 'text-gray-400'
                  : 'text-gray-600';

                const badge = entry.strategy ? strategyBadge(entry.strategy) : null;

                return (
                  <Link
                    key={entry.agentId}
                    href={`/agents/${encodeURIComponent(entry.agentId)}`}
                  >
                    <div
                      className="group flex items-center gap-4 px-5 py-3.5 rounded-xl border border-white/5 bg-[#12121a]/80 transition-all duration-300 ease-out hover:bg-[#1a1a28]/80 hover:border-[#c4f547]/20 vault-card-enter cursor-pointer"
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      {/* Rank */}
                      <div className="w-10 shrink-0">
                        <span className={`text-sm font-mono font-medium ${
                          i === 0 ? 'text-amber-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-orange-400' : 'text-gray-500'
                        }`}>
                          {i + 1}
                        </span>
                      </div>

                      {/* Agent name */}
                      <div className="flex-1 min-w-[140px]">
                        <p className="text-sm font-mono text-gray-200 group-hover:text-white transition-colors truncate">
                          {entry.name || truncateBytes32(entry.agentId, 6)}
                        </p>
                        {!entry.name && (
                          <p className="text-[10px] font-mono text-gray-600 truncate">{entry.agentId}</p>
                        )}
                      </div>

                      {/* Strategy */}
                      <div className="w-24 shrink-0">
                        {badge ? (
                          <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider shrink-0 ${badge.bg} ${badge.text} ${badge.border}`}>
                            {entry.strategy}
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-gray-600">-</span>
                        )}
                      </div>

                      {/* Return */}
                      <div className="w-24 shrink-0 text-right">
                        <span className={`text-sm font-mono font-medium ${retColor}`}>
                          {ret !== null ? `${retArrow} ${Math.abs(ret).toFixed(2)}%` : '-'}
                        </span>
                      </div>

                      {/* Drawdown */}
                      <div className="w-24 shrink-0 text-right">
                        <span className={`text-sm font-mono ${ddColor}`}>
                          {entry.maxDrawdown !== null ? `${entry.maxDrawdown.toFixed(2)}%` : '-'}
                        </span>
                      </div>

                      {/* TVL */}
                      <div className="w-32 shrink-0 text-right">
                        <span className="text-sm font-mono text-white">{formatTVL(entry)}</span>
                        <span className="text-xs font-mono text-gray-500 ml-1">{assetSymbol(entry)}</span>
                      </div>

                      {/* Vault count */}
                      <div className="w-16 shrink-0 text-right">
                        <span className="text-sm font-mono text-gray-400">{entry.vaultCount}</span>
                      </div>

                      {/* Executions */}
                      <div className="w-20 shrink-0 text-right">
                        <span className="text-sm font-mono text-gray-400">{entry.executionCount}</span>
                      </div>

                      {/* Arrow */}
                      <div className="w-5 shrink-0">
                        <svg className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Mobile card layout (visible only on mobile) */}
          <div className="md:hidden space-y-3">
            {sorted.map((entry, i) => {
              const ret = getReturnForPeriod(entry, timePeriod);
              const isPositive = ret !== null && ret >= 0;
              const retArrow = ret !== null ? (isPositive ? '\u2191' : '\u2193') : '';
              const retColor = ret !== null
                ? isPositive ? 'text-green-400' : 'text-red-400'
                : 'text-gray-600';

              const badge = entry.strategy ? strategyBadge(entry.strategy) : null;

              return (
                <Link
                  key={entry.agentId}
                  href={`/agents/${encodeURIComponent(entry.agentId)}`}
                >
                  <div
                    className="rounded-xl border border-white/5 bg-[#12121a]/80 p-4 min-h-[44px] active:bg-[#1a1a28]/80 transition-colors vault-card-enter"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    {/* Top row: rank + name + arrow */}
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`text-lg font-mono font-bold w-8 shrink-0 ${
                        i === 0 ? 'text-amber-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-orange-400' : 'text-gray-500'
                      }`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-mono text-gray-200 truncate">
                          {entry.name || truncateBytes32(entry.agentId, 6)}
                        </p>
                        {badge && (
                          <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider mt-1 ${badge.bg} ${badge.text} ${badge.border}`}>
                            {entry.strategy}
                          </span>
                        )}
                      </div>
                      <svg className="w-4 h-4 text-gray-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </div>

                    {/* Metrics grid */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-0.5">
                          {periodLabel(timePeriod)} Return
                        </p>
                        <span className={`text-sm font-mono font-medium ${retColor}`}>
                          {ret !== null ? `${retArrow} ${Math.abs(ret).toFixed(1)}%` : '-'}
                        </span>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-0.5">TVL</p>
                        <span className="text-sm font-mono text-white">{formatTVL(entry)}</span>
                        <span className="text-[10px] font-mono text-gray-500 ml-0.5">{assetSymbol(entry)}</span>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-0.5">Execs</p>
                        <span className="text-sm font-mono text-gray-400">{entry.executionCount}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
