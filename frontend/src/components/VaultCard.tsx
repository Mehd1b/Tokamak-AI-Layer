'use client';

import Link from 'next/link';
import { truncateAddress, truncateBytes32, formatEther } from '@/lib/utils';
import { NetworkBadge } from '@/components/NetworkLogo';
import { protocolLabel, protocolColor, PROTOCOL_TYPE, type ProtocolType } from '@/lib/protocolTypes';
import { useAgentMetadata } from '@/hooks/useAgentMetadata';
import { useVaultPerformance } from '@/hooks/useVaultPerformance';

interface VaultCardProps {
  address: string;
  agentId: string;
  asset: string;
  totalAssets: bigint;
  totalShares: bigint;
  totalValueLocked?: bigint;
  assetDecimals: number;
  assetSymbol: string;
  commentCount?: number;
  isOptimistic?: boolean;
  pendingCount?: number;
  protocolType?: number;
  index?: number;
}

/* Strip trailing zeros and decimal point: "20.0000" → "20", "3.5000" → "3.5" */
function formatClean(value: bigint, decimals: number): string {
  const raw = formatEther(value, decimals);
  return raw.replace(/\.?0+$/, '');
}

/* Protocol-specific accent color mapping */
function protocolAccent(type: number): { border: string; glow: string; text: string; bg: string; dot: string } {
  switch (type) {
    case PROTOCOL_TYPE.HYPERLIQUID:
      return {
        border: 'border-emerald-500/20 hover:border-emerald-400/40',
        glow: 'group-hover:shadow-[0_0_30px_rgba(16,185,129,0.12)]',
        text: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        dot: 'bg-emerald-400',
      };
    case PROTOCOL_TYPE.POLYMARKET:
      return {
        border: 'border-blue-500/20 hover:border-blue-400/40',
        glow: 'group-hover:shadow-[0_0_30px_rgba(59,130,246,0.12)]',
        text: 'text-blue-400',
        bg: 'bg-blue-500/10',
        dot: 'bg-blue-400',
      };
    default:
      return {
        border: 'border-white/10 hover:border-[#A855F7]/30',
        glow: 'group-hover:shadow-[0_0_30px_rgba(168,85,247,0.12)]',
        text: 'text-[#C084FC]',
        bg: 'bg-[#A855F7]/10',
        dot: 'bg-[#A855F7]',
      };
  }
}

/* Strategy badge color mapping */
function strategyBadge(strategy: string): { bg: string; text: string; border: string } {
  const s = strategy.toLowerCase();
  if (s.includes('yield') || s.includes('farm')) return { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' };
  if (s.includes('arb') || s.includes('arbitrage')) return { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' };
  if (s.includes('hedge') || s.includes('neutral')) return { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' };
  if (s.includes('snip') || s.includes('mev')) return { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20' };
  if (s.includes('lp') || s.includes('liquidity')) return { bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/20' };
  return { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' };
}

function AgentName({ agentId }: { agentId: string }) {
  const { data: metadata } = useAgentMetadata(agentId as `0x${string}`);
  if (metadata?.name) {
    return <span title={agentId}>{metadata.name}</span>;
  }
  return <span>{truncateBytes32(agentId, 4)}</span>;
}

function AgentCardProfile({ agentId }: { agentId: string }) {
  const { data: metadata } = useAgentMetadata(agentId as `0x${string}`);
  if (!metadata) return null;
  const hasExtra = metadata.strategy || metadata.author || metadata.description;
  if (!hasExtra) return null;
  return (
    <>
      {/* Badges row: author + strategy */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {metadata.author && (
          <span className="text-[10px] font-mono text-gray-500 truncate max-w-[100px]" title={metadata.author}>
            by {metadata.author}
          </span>
        )}
        {metadata.strategy && (() => {
          const badge = strategyBadge(metadata.strategy);
          return (
            <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider shrink-0 ${badge.bg} ${badge.text} ${badge.border}`}>
              {metadata.strategy}
            </span>
          );
        })()}
      </div>
      {/* Description line */}
      {metadata.description && (
        <p className="text-[10px] font-mono text-gray-600 leading-relaxed line-clamp-1">
          {metadata.description}
        </p>
      )}
    </>
  );
}

function ReturnsBadge({ address }: { address: string }) {
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

function RowReturnsBadge({ address }: { address: string }) {
  const { returnSince30d, isLoading } = useVaultPerformance(address as `0x${string}`);

  if (isLoading) return <span className="text-[10px] font-mono text-gray-600">...</span>;
  if (returnSince30d === null) return <span className="text-[10px] font-mono text-gray-600">-</span>;

  const isPositive = returnSince30d >= 0;
  const arrow = isPositive ? '\u2191' : '\u2193';
  const color = isPositive ? 'text-green-400' : 'text-red-400';

  return (
    <span className={`text-xs font-mono font-medium ${color}`}>
      {arrow} {Math.abs(returnSince30d).toFixed(1)}%
    </span>
  );
}

export function VaultCard({
  address,
  agentId,
  asset,
  totalAssets,
  totalShares,
  totalValueLocked,
  assetDecimals,
  assetSymbol,
  commentCount,
  isOptimistic,
  pendingCount,
  protocolType = 0,
  index = 0,
}: VaultCardProps) {
  const accent = protocolAccent(protocolType);
  const tvl = formatClean(totalValueLocked ?? totalAssets, assetDecimals);
  const balance = formatClean(totalAssets, assetDecimals);
  const hasActivity = totalAssets > 0n;

  return (
    <Link href={`/vaults/${address}`}>
      <div
        className={`
          relative overflow-hidden rounded-2xl border
          bg-[#12121a]/80 backdrop-blur-sm
          p-5 cursor-pointer group
          transition-all duration-500 ease-out
          hover:-translate-y-1
          ${accent.border} ${accent.glow}
          vault-card-enter
        `}
        style={{ animationDelay: `${index * 60}ms` }}
      >
        {/* Subtle top-edge gradient accent */}
        <div
          className={`absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
          style={{
            background: protocolType === PROTOCOL_TYPE.HYPERLIQUID
              ? 'linear-gradient(90deg, transparent, #10b981, transparent)'
              : protocolType === PROTOCOL_TYPE.POLYMARKET
                ? 'linear-gradient(90deg, transparent, #3b82f6, transparent)'
                : 'linear-gradient(90deg, transparent, #A855F7, transparent)',
          }}
        />

        {/* Row 1: Badges + Status */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {/* Live status dot */}
            {hasActivity && (
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${accent.dot}`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${accent.dot}`} />
              </span>
            )}
            {protocolType !== PROTOCOL_TYPE.GENERIC && (
              <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${protocolColor(protocolType as ProtocolType).bg} ${protocolColor(protocolType as ProtocolType).text} ${protocolColor(protocolType as ProtocolType).border}`}>
                {protocolLabel(protocolType as ProtocolType)}
              </span>
            )}
            {isOptimistic && (
              <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
                Optimistic
              </span>
            )}
          </div>
          <NetworkBadge />
        </div>

        {/* Row 2: TVL — Hero metric */}
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-1">
            Total Value Locked
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-light tracking-tight text-white font-mono">
              {tvl}
            </span>
            <span className={`text-xs font-mono font-medium ${accent.text}`}>
              {assetSymbol}
            </span>
          </div>
        </div>

        {/* Row 3: Balance + Returns */}
        <div className="mb-4 flex items-stretch gap-2">
          <div className="flex-1 rounded-lg bg-white/[0.03] px-3 py-2">
            <p className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-0.5">Balance</p>
            <p className="text-xs text-gray-300 font-mono">{balance} <span className="text-gray-500">{assetSymbol}</span></p>
          </div>
          <div className="flex items-center">
            <ReturnsBadge address={address} />
          </div>
        </div>

        {/* Row 4: Agent profile */}
        <div className="mb-3">
          <div className="rounded-lg bg-white/[0.02] px-3 py-2 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-300 truncate" title={agentId}>
                <AgentName agentId={agentId} />
              </span>
            </div>
            <AgentCardProfile agentId={agentId} />
          </div>
        </div>

        {/* Row 5: Address */}
        <div className="flex items-center justify-between text-[11px] font-mono text-gray-500">
          <span className="group-hover:text-gray-400 transition-colors">
            {truncateAddress(address, 6)}
          </span>
        </div>

        {/* Row 5: Footer indicators */}
        {((pendingCount !== undefined && pendingCount > 0) || (commentCount !== undefined && commentCount > 0)) && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/5">
            {isOptimistic && pendingCount !== undefined && pendingCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-400">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {pendingCount} pending
              </span>
            )}
            {commentCount !== undefined && commentCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-gray-500">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
                {commentCount}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

/* Compact list-row variant for table view */
export function VaultRow({
  address,
  agentId,
  totalAssets,
  totalShares,
  totalValueLocked,
  assetDecimals,
  assetSymbol,
  commentCount,
  isOptimistic,
  pendingCount,
  protocolType = 0,
  index = 0,
}: VaultCardProps) {
  const accent = protocolAccent(protocolType);
  const tvl = formatClean(totalValueLocked ?? totalAssets, assetDecimals);
  const balance = formatClean(totalAssets, assetDecimals);
  const hasActivity = totalAssets > 0n;

  return (
    <Link href={`/vaults/${address}`}>
      <div
        className={`
          group flex items-center gap-4 px-5 py-3.5
          rounded-xl border bg-[#12121a]/80
          transition-all duration-300 ease-out
          hover:bg-[#1a1a28]/80
          ${accent.border}
          vault-card-enter
        `}
        style={{ animationDelay: `${index * 40}ms` }}
      >
        {/* Status dot */}
        <div className="w-6 flex justify-center shrink-0">
          {hasActivity ? (
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${accent.dot}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${accent.dot}`} />
            </span>
          ) : (
            <span className="h-2 w-2 rounded-full bg-gray-700" />
          )}
        </div>

        {/* Address */}
        <div className="w-36 shrink-0">
          <p className="text-sm font-mono text-gray-300 group-hover:text-white transition-colors">
            {truncateAddress(address, 6)}
          </p>
        </div>

        {/* Protocol badge */}
        <div className="w-24 shrink-0">
          {protocolType !== PROTOCOL_TYPE.GENERIC ? (
            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${protocolColor(protocolType as ProtocolType).bg} ${protocolColor(protocolType as ProtocolType).text} ${protocolColor(protocolType as ProtocolType).border}`}>
              {protocolLabel(protocolType as ProtocolType)}
            </span>
          ) : isOptimistic ? (
            <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
              Optimistic
            </span>
          ) : (
            <span className="text-[10px] font-mono text-gray-600 uppercase">Generic</span>
          )}
        </div>

        {/* TVL */}
        <div className="flex-1 text-right">
          <span className="text-sm font-mono text-white">{tvl}</span>
          <span className="text-xs font-mono text-gray-500 ml-1">{assetSymbol}</span>
        </div>

        {/* 30d Return */}
        <div className="w-24 text-right shrink-0 hidden md:block">
          <RowReturnsBadge address={address} />
        </div>

        {/* Balance */}
        <div className="w-32 text-right hidden lg:block">
          <span className="text-xs font-mono text-gray-400">{balance}</span>
        </div>

        {/* Comments / Pending */}
        <div className="w-20 text-right shrink-0 flex items-center justify-end gap-2">
          {pendingCount !== undefined && pendingCount > 0 && (
            <span className="text-[10px] font-mono text-amber-400">{pendingCount}p</span>
          )}
          {commentCount !== undefined && commentCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] font-mono text-gray-500">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
              {commentCount}
            </span>
          )}
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
}
