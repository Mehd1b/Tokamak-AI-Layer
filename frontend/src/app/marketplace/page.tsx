'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useAgentLeaderboard, type AgentLeaderboardEntry } from '@/hooks/useAgentLeaderboard';
import { formatEther, truncateBytes32, truncateAddress } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Category = 'all' | 'yield' | 'perp-trading' | 'market-making' | 'governance';

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'yield', label: 'Yield' },
  { key: 'perp-trading', label: 'Perp Trading' },
  { key: 'market-making', label: 'Market Making' },
  { key: 'governance', label: 'Governance' },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatTVL(entry: AgentLeaderboardEntry): string {
  if (entry.vaults.length === 0) return '0';
  const decimals = entry.vaults[0].assetDecimals;
  const raw = formatEther(entry.totalTVL, decimals);
  return raw.replace(/\.?0+$/, '');
}

function assetSymbol(entry: AgentLeaderboardEntry): string {
  if (entry.vaults.length === 0) return '';
  return entry.vaults[0].assetSymbol;
}

/* Strategy badge color mapping (consistent with leaderboard and agent detail) */
function strategyBadge(strategy: string): { bg: string; text: string; border: string } {
  const s = strategy.toLowerCase();
  if (s.includes('yield') || s.includes('farm')) return { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' };
  if (s.includes('arb') || s.includes('arbitrage')) return { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' };
  if (s.includes('hedge') || s.includes('neutral')) return { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' };
  if (s.includes('snip') || s.includes('mev')) return { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20' };
  if (s.includes('lp') || s.includes('liquidity')) return { bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/20' };
  if (s.includes('perp') || s.includes('trading')) return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' };
  if (s.includes('prediction') || s.includes('market')) return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' };
  if (s.includes('governance') || s.includes('gov')) return { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' };
  return { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' };
}

/** Check if an agent matches the selected category filter */
function matchesCategory(strategy: string, category: Category): boolean {
  if (category === 'all') return true;
  const s = strategy.toLowerCase();
  switch (category) {
    case 'yield':
      return s.includes('yield') || s.includes('farm') || s.includes('lending');
    case 'perp-trading':
      return s.includes('perp') || s.includes('trading') || s.includes('arb');
    case 'market-making':
      return s.includes('market') || s.includes('lp') || s.includes('liquidity') || s.includes('mm');
    case 'governance':
      return s.includes('governance') || s.includes('gov') || s.includes('vote');
    default:
      return true;
  }
}

/* ------------------------------------------------------------------ */
/*  Fork Modal component                                               */
/* ------------------------------------------------------------------ */

function ForkModal({
  agentId,
  agentName,
  onClose,
}: {
  agentId: string;
  agentName: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const command = `tal fork ${agentId}`;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text
    }
  }, [command]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg rounded-2xl border border-[#A855F7]/20 bg-[#0a0a0f] p-8">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="h-px flex-1 max-w-[40px] bg-gradient-to-r from-[#A855F7] to-transparent" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C084FC] font-mono">
            Fork Agent
          </span>
        </div>

        <h2
          className="text-2xl font-light mb-2 tracking-tight"
          style={{ fontFamily: 'var(--font-serif), serif' }}
        >
          <span className="italic text-[#A855F7]">Fork</span>{' '}
          <span className="text-white">{agentName || truncateBytes32(agentId, 6)}</span>
        </h2>

        <p className="text-gray-400 text-sm font-mono leading-relaxed mb-6">
          Fork this agent to create your own version. Modify the strategy and deploy your own vault.
        </p>

        {/* Command */}
        <div className="mb-6">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-2">
            Run in your terminal
          </p>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <code className="flex-1 text-sm font-mono text-[#C084FC] break-all">
              {command}
            </code>
            <button
              onClick={handleCopy}
              className="shrink-0 p-2 rounded-lg border border-white/10 hover:border-[#A855F7]/30 bg-white/[0.02] hover:bg-[#A855F7]/5 transition-all"
              title="Copy command"
            >
              {copied ? (
                <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-3 mb-6">
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-5 h-5 rounded-full bg-[#A855F7]/10 border border-[#A855F7]/20 flex items-center justify-center text-[10px] font-mono text-[#C084FC]">1</span>
            <p className="text-xs font-mono text-gray-400">Install the Tokagent CLI if you haven&apos;t already</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-5 h-5 rounded-full bg-[#A855F7]/10 border border-[#A855F7]/20 flex items-center justify-center text-[10px] font-mono text-[#C084FC]">2</span>
            <p className="text-xs font-mono text-gray-400">Run the fork command to clone the agent&apos;s strategy code</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-5 h-5 rounded-full bg-[#A855F7]/10 border border-[#A855F7]/20 flex items-center justify-center text-[10px] font-mono text-[#C084FC]">3</span>
            <p className="text-xs font-mono text-gray-400">Customize the strategy, register, and deploy your vault</p>
          </div>
        </div>

        {/* Docs link */}
        <a
          href="https://docs.tokagent.network"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-xs font-mono text-[#C084FC] hover:text-[#A855F7] transition-colors"
        >
          Read the full guide
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Agent Card component                                               */
/* ------------------------------------------------------------------ */

function AgentCard({
  entry,
  index,
  onFork,
}: {
  entry: AgentLeaderboardEntry;
  index: number;
  onFork: (agentId: string, name: string) => void;
}) {
  const badge = entry.strategy ? strategyBadge(entry.strategy) : null;
  const tvl = formatTVL(entry);
  const symbol = assetSymbol(entry);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/5 bg-[#12121a]/80 backdrop-blur-sm p-5 group transition-all duration-500 ease-out hover:-translate-y-1 hover:border-[#A855F7]/20 vault-card-enter"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Row 1: Strategy badge + vault count */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {badge && (
            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badge.bg} ${badge.text} ${badge.border}`}>
              {entry.strategy}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-gray-500">
            {entry.vaultCount} vault{entry.vaultCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Row 2: Agent name */}
      <Link href={`/agents/${encodeURIComponent(entry.agentId)}`}>
        <h3 className="text-lg font-mono font-medium text-gray-200 group-hover:text-white transition-colors mb-1 cursor-pointer truncate">
          {entry.name || truncateBytes32(entry.agentId, 6)}
        </h3>
      </Link>

      {/* Row 3: Author (from agentId or metadata, placeholder for now) */}
      <p className="text-[11px] font-mono text-gray-500 mb-3 truncate">
        {truncateAddress(entry.agentId.slice(0, 42), 6)}
      </p>

      {/* Row 4: TVL */}
      <div className="mb-4">
        <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-1">
          Total Value Locked
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-light tracking-tight text-white font-mono">
            {tvl}
          </span>
          <span className="text-xs font-mono font-medium text-[#C084FC]">
            {symbol}
          </span>
        </div>
      </div>

      {/* Row 5: Returns */}
      {entry.return30d !== null && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] font-mono font-semibold ${
              entry.return30d >= 0
                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                : 'bg-red-500/10 text-red-400 border-red-500/20'
            }`}>
              {entry.return30d >= 0 ? '\u2191' : '\u2193'} {Math.abs(entry.return30d).toFixed(1)}%
              <span className="text-[9px] opacity-70 ml-0.5">30d</span>
            </span>
            {entry.maxDrawdown !== null && entry.maxDrawdown < -5 && (
              <span className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-mono font-medium bg-amber-500/10 text-amber-400 border-amber-500/20" title="Max drawdown">
                {entry.maxDrawdown.toFixed(1)}% DD
              </span>
            )}
          </div>
        </div>
      )}

      {/* Row 6: Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-white/5">
        <Link
          href={`/agents/${encodeURIComponent(entry.agentId)}`}
          className="flex-1 text-center py-2 rounded-lg border border-white/10 hover:border-[#A855F7]/30 bg-white/[0.02] hover:bg-[#A855F7]/5 text-xs font-mono text-gray-400 hover:text-[#C084FC] transition-all"
        >
          View Details
        </Link>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFork(entry.agentId, entry.name);
          }}
          className="flex-1 text-center py-2 rounded-lg border border-[#A855F7]/20 hover:border-[#A855F7]/40 bg-[#A855F7]/5 hover:bg-[#A855F7]/10 text-xs font-mono text-[#C084FC] hover:text-[#A855F7] transition-all"
        >
          Fork Agent
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function MarketplacePage() {
  const { data: entries, isLoading } = useAgentLeaderboard();
  const [category, setCategory] = useState<Category>('all');
  const [search, setSearch] = useState('');
  const [forkTarget, setForkTarget] = useState<{ agentId: string; name: string } | null>(null);

  const filtered = useMemo(() => {
    if (!entries || entries.length === 0) return [];
    return entries.filter((entry) => {
      // Category filter
      if (!matchesCategory(entry.strategy, category)) return false;

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const nameMatch = (entry.name || '').toLowerCase().includes(q);
        const strategyMatch = (entry.strategy || '').toLowerCase().includes(q);
        const idMatch = entry.agentId.toLowerCase().includes(q);
        if (!nameMatch && !strategyMatch && !idMatch) return false;
      }

      return true;
    });
  }, [entries, category, search]);

  const handleFork = useCallback((agentId: string, name: string) => {
    setForkTarget({ agentId, name });
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 py-12">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-px flex-1 max-w-[40px] bg-gradient-to-r from-[#A855F7] to-transparent" />
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C084FC] font-mono"
          >
            Marketplace
          </span>
        </div>
        <h1
          className="text-4xl md:text-5xl font-light mb-3 tracking-tight"
          style={{ fontFamily: 'var(--font-serif), serif' }}
        >
          <span className="italic text-[#A855F7]">Agent</span>{' '}
          <span className="text-white">Templates</span>
        </h1>
        <p className="text-gray-500 max-w-lg text-sm leading-relaxed font-mono">
          Browse verified AI agent strategies. Fork any agent to build your own version, customize the logic, and deploy your vault.
        </p>
      </div>

      {/* Controls: Category filter + Search */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
        {/* Category chips */}
        <div className="flex items-center gap-1 bg-white/[0.02] rounded-lg p-0.5 border border-white/5 overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-mono font-medium transition-all duration-200 whitespace-nowrap ${
                category === cat.key
                  ? 'bg-[#A855F7]/15 text-[#C084FC] shadow-sm'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="relative w-full md:w-64">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-white/10 bg-white/[0.02] text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-[#A855F7]/30 transition-colors"
          />
        </div>
      </div>

      {/* Results count */}
      {!isLoading && filtered.length > 0 && (
        <div className="flex items-center justify-between mb-6">
          <span className="text-xs font-mono text-gray-500">
            {filtered.length} agent{filtered.length !== 1 ? 's' : ''} found
          </span>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-white/5 bg-[#12121a]/80 p-5"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-20 h-5 skeleton rounded" />
                <div className="w-14 h-3 skeleton rounded" />
              </div>
              <div className="w-40 h-5 skeleton rounded mb-2" />
              <div className="w-24 h-3 skeleton rounded mb-4" />
              <div className="w-16 h-2 skeleton rounded mb-1" />
              <div className="w-32 h-6 skeleton rounded mb-4" />
              <div className="w-24 h-5 skeleton rounded mb-4" />
              <div className="flex gap-2 pt-3 border-t border-white/5">
                <div className="flex-1 h-8 skeleton rounded-lg" />
                <div className="flex-1 h-8 skeleton rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <div className="rounded-2xl border border-white/5 bg-[#12121a]/80 text-center py-20">
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[#A855F7]/5 border border-[#A855F7]/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-[#A855F7]/40" fill="none" stroke="currentColor" strokeWidth="1">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-1">No agents found</p>
          <p className="text-gray-600 text-xs mb-6 font-mono">
            {search.trim()
              ? 'Try adjusting your search or filter criteria.'
              : 'No agents are registered yet. Deploy an agent to get started.'}
          </p>
          {search.trim() && (
            <button
              onClick={() => { setSearch(''); setCategory('all'); }}
              className="btn-secondary inline-flex items-center gap-2 text-xs"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Agent cards grid */}
      {!isLoading && filtered.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((entry, i) => (
            <AgentCard
              key={entry.agentId}
              entry={entry}
              index={i}
              onFork={handleFork}
            />
          ))}
        </div>
      )}

      {/* Fork modal */}
      {forkTarget && (
        <ForkModal
          agentId={forkTarget.agentId}
          agentName={forkTarget.name}
          onClose={() => setForkTarget(null)}
        />
      )}
    </div>
  );
}
