'use client';

import { useMemo, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAgentMetadata } from '@/hooks/useAgentMetadata';
import { useDeployedVaultsList, type VaultInfo } from '@/hooks/useVaultFactory';
import { useVaultPerformance } from '@/hooks/useVaultPerformance';
import { useAgentAuthor } from '@/hooks/useAgentAuthor';
import { formatEther, truncateBytes32, truncateAddress } from '@/lib/utils';
import { protocolLabel, protocolColor, PROTOCOL_TYPE, type ProtocolType } from '@/lib/protocolTypes';
import { NetworkBadge } from '@/components/NetworkLogo';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatClean(value: bigint, decimals: number): string {
  const raw = formatEther(value, decimals);
  return raw.replace(/\.?0+$/, '');
}

/* Strategy badge color mapping (matches VaultCard and leaderboard) */
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

/* Protocol accent colors (matches VaultCard) */
function protocolAccent(type: number): { border: string; dot: string } {
  switch (type) {
    case PROTOCOL_TYPE.HYPERLIQUID:
      return { border: 'border-emerald-500/20 hover:border-emerald-400/40', dot: 'bg-emerald-400' };
    case PROTOCOL_TYPE.POLYMARKET:
      return { border: 'border-blue-500/20 hover:border-blue-400/40', dot: 'bg-blue-400' };
    default:
      return { border: 'border-white/10 hover:border-[#A855F7]/30', dot: 'bg-[#A855F7]' };
  }
}

/* ------------------------------------------------------------------ */
/*  Small components                                                   */
/* ------------------------------------------------------------------ */

function VaultReturnsBadge({ address }: { address: string }) {
  const { returnSince30d, maxDrawdown, isLoading } = useVaultPerformance(address as `0x${string}`);
  if (isLoading || returnSince30d === null) return null;

  const isPositive = returnSince30d >= 0;
  const arrow = isPositive ? '\u2191' : '\u2193';
  const colorClasses = isPositive
    ? 'bg-green-500/10 text-green-400 border-green-500/20'
    : 'bg-red-500/10 text-red-400 border-red-500/20';

  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] font-mono font-semibold ${colorClasses}`}>
        {arrow} {Math.abs(returnSince30d).toFixed(1)}%
        <span className="text-[9px] opacity-70 ml-0.5">30d</span>
      </span>
      {maxDrawdown !== null && maxDrawdown < -5 && (
        <span className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-mono font-medium bg-amber-500/10 text-amber-400 border-amber-500/20" title="Max drawdown">
          {maxDrawdown.toFixed(1)}% DD
        </span>
      )}
    </div>
  );
}

function AgentVaultCard({ vault, index }: { vault: VaultInfo; index: number }) {
  const accent = protocolAccent(vault.protocolType ?? 0);
  const tvl = formatClean(vault.totalValueLocked ?? vault.totalAssets, vault.assetDecimals);
  const hasActivity = vault.totalAssets > 0n;

  return (
    <Link href={`/vaults/${vault.address}`}>
      <div
        className={`
          relative overflow-hidden rounded-2xl border
          bg-[#12121a]/80 backdrop-blur-sm
          p-5 cursor-pointer group
          transition-all duration-500 ease-out
          hover:-translate-y-1
          ${accent.border}
          vault-card-enter
        `}
        style={{ animationDelay: `${index * 60}ms` }}
      >
        {/* Row 1: Badges + Network */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {hasActivity && (
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${accent.dot}`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${accent.dot}`} />
              </span>
            )}
            {(vault.protocolType ?? 0) !== PROTOCOL_TYPE.GENERIC && (
              <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${protocolColor((vault.protocolType ?? 0) as ProtocolType).bg} ${protocolColor((vault.protocolType ?? 0) as ProtocolType).text} ${protocolColor((vault.protocolType ?? 0) as ProtocolType).border}`}>
                {protocolLabel((vault.protocolType ?? 0) as ProtocolType)}
              </span>
            )}
            {vault.isOptimistic && (
              <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
                Optimistic
              </span>
            )}
          </div>
          <NetworkBadge />
        </div>

        {/* Row 2: TVL */}
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-1">
            Total Value Locked
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-light tracking-tight text-white font-mono">
              {tvl}
            </span>
            <span className="text-xs font-mono font-medium text-[#C084FC]">
              {vault.assetSymbol}
            </span>
          </div>
        </div>

        {/* Row 3: Returns */}
        <div className="mb-3">
          <VaultReturnsBadge address={vault.address} />
        </div>

        {/* Row 4: Address */}
        <div className="flex items-center justify-between text-[11px] font-mono text-gray-500">
          <span className="group-hover:text-gray-400 transition-colors">
            {truncateAddress(vault.address, 6)}
          </span>
        </div>
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*  Aggregate Performance section                                      */
/* ------------------------------------------------------------------ */

function AggregateStats({ vaults }: { vaults: VaultInfo[] }) {
  // Compute aggregate TVL
  const totalTVL = useMemo(() => {
    return vaults.reduce((acc, v) => acc + (v.totalValueLocked ?? v.totalAssets), 0n);
  }, [vaults]);

  // Use the first vault's decimals/symbol as representative
  const decimals = vaults[0]?.assetDecimals ?? 18;
  const symbol = vaults[0]?.assetSymbol ?? 'ETH';
  const tvlDisplay = formatClean(totalTVL, decimals);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
      <div className="rounded-xl border border-white/5 bg-[#12121a]/80 p-4">
        <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-1">Total TVL</p>
        <p className="text-lg font-mono text-white">{tvlDisplay} <span className="text-xs text-gray-500">{symbol}</span></p>
      </div>
      <div className="rounded-xl border border-white/5 bg-[#12121a]/80 p-4">
        <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-1">Vaults</p>
        <p className="text-lg font-mono text-white">{vaults.length}</p>
      </div>
      <div className="rounded-xl border border-white/5 bg-[#12121a]/80 p-4">
        <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-1">Asset</p>
        <p className="text-lg font-mono text-white">{symbol}</p>
      </div>
      <div className="rounded-xl border border-white/5 bg-[#12121a]/80 p-4">
        <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-1">Network</p>
        <div className="mt-1"><NetworkBadge /></div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Fork Section component                                             */
/* ------------------------------------------------------------------ */

function ForkSection({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [copied, setCopied] = useState(false);
  const command = `tal fork ${agentId}`;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }, [command]);

  return (
    <div className="rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/5 p-8 mb-10">
      <div className="flex flex-col md:flex-row md:items-start gap-6">
        <div className="flex-1">
          <h3 className="text-lg font-light text-white mb-2" style={{ fontFamily: 'var(--font-serif), serif' }}>
            <span className="italic text-[#A855F7]">Fork</span> this agent
          </h3>
          <p className="text-gray-400 text-sm font-mono leading-relaxed mb-4">
            Fork this agent to create your own version. Modify the strategy and deploy your own vault.
          </p>

          {/* Command */}
          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-2">
              Run in your terminal
            </p>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-4">
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

        {/* Steps */}
        <div className="md:w-64 space-y-3">
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-5 h-5 rounded-full bg-[#A855F7]/10 border border-[#A855F7]/20 flex items-center justify-center text-[10px] font-mono text-[#C084FC]">1</span>
            <p className="text-xs font-mono text-gray-400">Install the Tokagent CLI</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-5 h-5 rounded-full bg-[#A855F7]/10 border border-[#A855F7]/20 flex items-center justify-center text-[10px] font-mono text-[#C084FC]">2</span>
            <p className="text-xs font-mono text-gray-400">Fork the agent&apos;s strategy code</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-5 h-5 rounded-full bg-[#A855F7]/10 border border-[#A855F7]/20 flex items-center justify-center text-[10px] font-mono text-[#C084FC]">3</span>
            <p className="text-xs font-mono text-gray-400">Customize, register, and deploy</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Author Section component                                           */
/* ------------------------------------------------------------------ */

function AuthorSection({
  authorAddress,
  authorDisplayName,
  allVaults,
  currentAgentId,
}: {
  authorAddress: string;
  authorDisplayName?: string;
  allVaults: VaultInfo[];
  currentAgentId: string;
}) {
  // Find all unique agent IDs that share the same author address
  // We get this from the useAgentAuthor hook results passed in from the parent
  // For now, we show the author info card; the parent queries author's other agents

  return (
    <div className="mb-10">
      <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-5">
        Author
      </h2>
      <div className="rounded-xl border border-white/5 bg-[#12121a]/80 p-5">
        <div className="flex items-center gap-3 mb-3">
          {/* Author avatar placeholder */}
          <div className="w-10 h-10 rounded-full bg-[#A855F7]/10 border border-[#A855F7]/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-[#A855F7]/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <div>
            {authorDisplayName && (
              <p className="text-sm font-mono text-white">{authorDisplayName}</p>
            )}
            <p className="text-[11px] font-mono text-gray-500 break-all">
              {truncateAddress(authorAddress, 6)}
            </p>
          </div>
        </div>
        <p className="text-[10px] font-mono text-gray-600 uppercase tracking-wider">
          On-chain Author Address
        </p>
        <p className="text-[11px] font-mono text-gray-500 break-all mt-1">
          {authorAddress}
        </p>
      </div>
    </div>
  );
}

function AuthorOtherAgents({
  authorAgentIds,
  currentAgentId,
  allVaults,
}: {
  authorAgentIds: string[];
  currentAgentId: string;
  allVaults: VaultInfo[];
}) {
  // Filter out the current agent
  const otherAgentIds = authorAgentIds.filter(
    (id) => id.toLowerCase() !== currentAgentId.toLowerCase()
  );

  if (otherAgentIds.length === 0) return null;

  return (
    <div className="mb-10">
      <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-5">
        Other agents by this author
      </h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {otherAgentIds.map((otherId, i) => {
          const vaultCount = allVaults.filter(
            (v) => v.agentId.toLowerCase() === otherId.toLowerCase()
          ).length;

          return (
            <Link key={otherId} href={`/agents/${encodeURIComponent(otherId)}`}>
              <div
                className="rounded-xl border border-white/5 bg-[#12121a]/80 p-4 group hover:border-[#A855F7]/20 transition-all duration-300 cursor-pointer vault-card-enter"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <p className="text-sm font-mono text-gray-200 group-hover:text-white transition-colors truncate mb-1">
                  {truncateBytes32(otherId, 6)}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-gray-500">
                    {vaultCount} vault{vaultCount !== 1 ? 's' : ''}
                  </span>
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
  );
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function AgentDetailPage() {
  const params = useParams();
  const agentId = params.agentId as string;

  // Decode in case it was URL-encoded
  const decodedAgentId = decodeURIComponent(agentId);

  const { data: metadata, isLoading: isLoadingMeta } = useAgentMetadata(decodedAgentId as `0x${string}`);
  const { data: allVaults, isLoading: isLoadingVaults } = useDeployedVaultsList();
  const { authorAddress, authorAgentIds, isLoading: isLoadingAuthor } = useAgentAuthor(decodedAgentId as `0x${string}`);

  const agentVaults = useMemo(() => {
    if (!allVaults) return [];
    return allVaults.filter((v) => v.agentId.toLowerCase() === decodedAgentId.toLowerCase());
  }, [allVaults, decodedAgentId]);

  const isLoading = isLoadingMeta || isLoadingVaults;

  const badge = metadata?.strategy ? strategyBadge(metadata.strategy) : null;

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 py-12">
      {/* Back link */}
      <Link
        href="/leaderboard"
        className="inline-flex items-center gap-1.5 text-xs font-mono text-gray-500 hover:text-[#C084FC] transition-colors mb-8"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to Leaderboard
      </Link>

      {/* Loading state */}
      {isLoading && (
        <div>
          <div className="mb-10">
            <div className="w-48 h-8 skeleton rounded mb-3" />
            <div className="w-96 h-4 skeleton rounded mb-2" />
            <div className="w-64 h-3 skeleton rounded" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border border-white/5 bg-[#12121a]/80 p-4">
                <div className="w-16 h-2 skeleton rounded mb-2" />
                <div className="w-24 h-6 skeleton rounded" />
              </div>
            ))}
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-2xl border border-white/5 bg-[#12121a]/80 p-5">
                <div className="w-full h-4 skeleton rounded mb-3" />
                <div className="w-32 h-7 skeleton rounded mb-3" />
                <div className="w-20 h-4 skeleton rounded" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loaded state */}
      {!isLoading && (
        <>
          {/* Agent profile header */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-px flex-1 max-w-[40px] bg-gradient-to-r from-[#A855F7] to-transparent" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C084FC] font-mono">
                Agent Profile
              </span>
            </div>

            <h1
              className="text-4xl md:text-5xl font-light mb-3 tracking-tight"
              style={{ fontFamily: 'var(--font-serif), serif' }}
            >
              {metadata?.name ? (
                <>
                  <span className="italic text-[#A855F7]">{metadata.name}</span>
                </>
              ) : (
                <span className="text-white font-mono text-2xl">{truncateBytes32(decodedAgentId, 8)}</span>
              )}
            </h1>

            {/* Meta badges */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {metadata?.author && (
                <span className="text-xs font-mono text-gray-500">
                  by <span className="text-gray-400">{metadata.author}</span>
                </span>
              )}
              {badge && (
                <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badge.bg} ${badge.text} ${badge.border}`}>
                  {metadata!.strategy}
                </span>
              )}
              {metadata?.tags && metadata.tags.length > 0 && (
                <div className="flex items-center gap-1">
                  {metadata.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-md border border-white/5 bg-white/[0.03] px-2 py-0.5 text-[10px] font-mono text-gray-500"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Description */}
            {metadata?.description && (
              <p className="text-gray-400 max-w-2xl text-sm leading-relaxed font-mono mb-4">
                {metadata.description}
              </p>
            )}

            {/* Agent ID (always shown for transparency) */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-gray-600 uppercase tracking-wider">Agent ID:</span>
              <span className="text-[11px] font-mono text-gray-500 break-all">{decodedAgentId}</span>
            </div>
          </div>

          {/* Fork section */}
          <ForkSection
            agentId={decodedAgentId}
            agentName={metadata?.name || truncateBytes32(decodedAgentId, 6)}
          />

          {/* Aggregate stats */}
          {agentVaults.length > 0 && <AggregateStats vaults={agentVaults} />}

          {/* Author section */}
          {authorAddress && (
            <AuthorSection
              authorAddress={authorAddress}
              authorDisplayName={metadata?.author}
              allVaults={allVaults ?? []}
              currentAgentId={decodedAgentId}
            />
          )}

          {/* Other agents by this author */}
          {authorAgentIds.length > 0 && allVaults && (
            <AuthorOtherAgents
              authorAgentIds={authorAgentIds}
              currentAgentId={decodedAgentId}
              allVaults={allVaults}
            />
          )}

          {/* Vaults section */}
          <div className="mb-10">
            <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-5">
              {agentVaults.length} vault{agentVaults.length !== 1 ? 's' : ''} using this agent
            </h2>

            {agentVaults.length > 0 ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                {agentVaults.map((vault, i) => (
                  <AgentVaultCard key={vault.address} vault={vault} index={i} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/5 bg-[#12121a]/80 text-center py-16">
                <p className="text-gray-400 text-sm mb-1">No vaults found for this agent</p>
                <p className="text-gray-600 text-xs font-mono">This agent has no deployed vaults on the current network.</p>
              </div>
            )}
          </div>

          {/* CTA */}
          <div className="rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/5 p-8 text-center">
            <h3 className="text-lg font-light text-white mb-2" style={{ fontFamily: 'var(--font-serif), serif' }}>
              Deploy a vault with this agent
            </h3>
            <p className="text-gray-500 text-sm font-mono mb-6 max-w-md mx-auto">
              Create your own vault using this agent&apos;s verified execution strategy.
            </p>
            <a
              href="https://docs.tokagent.network"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary inline-flex items-center gap-2 text-sm"
            >
              Read the Docs
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </>
      )}
    </div>
  );
}
