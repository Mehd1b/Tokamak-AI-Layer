'use client';

import { useAccount } from 'wagmi';
import { useUserPortfolio, type UserPosition } from '@/hooks/useUserPortfolio';
import { useAgentMetadata } from '@/hooks/useAgentMetadata';
import { formatEther, truncateAddress } from '@/lib/utils';
import { protocolLabel, protocolColor, PROTOCOL_TYPE, type ProtocolType } from '@/lib/protocolTypes';
import { ConnectWalletButton } from '@/components/ConnectWalletButton';
import Link from 'next/link';

/* ── Helpers ── */

function formatClean(value: bigint, decimals: number): string {
  const raw = formatEther(value, decimals);
  return raw.replace(/\.?0+$/, '');
}

function PnLBadge({ value, decimals }: { value: bigint; decimals: number }) {
  if (value === 0n) {
    return (
      <span className="text-gray-500 font-mono text-xs sm:text-sm">0.00</span>
    );
  }
  const isPositive = value > 0n;
  const display = isPositive
    ? `+${formatClean(value, decimals)}`
    : formatClean(value, decimals);

  return (
    <span
      className={`font-mono text-xs sm:text-sm ${
        isPositive ? 'text-emerald-400' : 'text-red-400'
      }`}
    >
      {display}
    </span>
  );
}

/* ── Agent Name ── */

function AgentName({ agentId }: { agentId: string }) {
  const { data: metadata } = useAgentMetadata(agentId as `0x${string}`);
  if (metadata?.name) {
    return <span title={agentId}>{metadata.name}</span>;
  }
  // Truncate bytes32 display
  if (agentId.length > 16) {
    return <span>{agentId.slice(0, 10)}...{agentId.slice(-4)}</span>;
  }
  return <span>{agentId}</span>;
}

/* ── Position Card ── */

function PositionCard({ position }: { position: UserPosition }) {
  const protocolType = position.protocolType ?? 0;
  const colors = protocolColor(protocolType as ProtocolType);

  return (
    <Link href={`/vaults/${position.vaultAddress}`}>
      <div
        className={`
          relative overflow-hidden rounded-2xl border
          bg-[#12121a]/80 backdrop-blur-sm
          p-5 cursor-pointer group
          transition-all duration-500 ease-out
          hover:-translate-y-1
          border-white/10 hover:border-[#c4f547]/30
          group-hover:shadow-[0_0_30px_rgba(196,245,71,0.12)]
        `}
      >
        {/* Top-edge gradient on hover */}
        <div
          className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background: 'linear-gradient(90deg, transparent, #c4f547, transparent)',
          }}
        />

        {/* Header: Agent name + Protocol badge */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white group-hover:text-[#d5f972] transition-colors">
              <AgentName agentId={position.agentId} />
            </span>
          </div>
          <div className="flex items-center gap-2">
            {protocolType !== PROTOCOL_TYPE.GENERIC && (
              <span
                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${colors.bg} ${colors.text} ${colors.border}`}
              >
                {protocolLabel(protocolType as ProtocolType)}
              </span>
            )}
          </div>
        </div>

        {/* Current value */}
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-1">
            Current Value
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-light tracking-tight text-white font-mono truncate">
              {formatClean(position.currentValue, position.assetDecimals)}
            </span>
            <span className="text-xs font-mono font-medium text-[#d5f972]">
              {position.assetSymbol}
            </span>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-lg bg-white/[0.03] px-3 py-2">
            <p className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-0.5">
              Shares
            </p>
            <p className="text-xs text-gray-300 font-mono">
              {formatClean(position.shares, position.assetDecimals)}
            </p>
          </div>
          <div className="rounded-lg bg-white/[0.03] px-3 py-2">
            <p className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-0.5">
              Unrealized P&L
            </p>
            <PnLBadge value={position.unrealizedPnL} decimals={position.assetDecimals} />
          </div>
        </div>

        {/* Footer: vault address */}
        <div className="flex items-center justify-between text-[11px] font-mono text-gray-500">
          <span className="group-hover:text-gray-400 transition-colors">
            {truncateAddress(position.vaultAddress, 6)}
          </span>
          <svg
            className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      </div>
    </Link>
  );
}

/* ── Connect Prompt ── */

function ConnectPrompt() {
  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 py-12">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-px flex-1 max-w-[40px] bg-gradient-to-r from-[#c4f547] to-transparent" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d5f972] font-mono">
            Portfolio
          </span>
        </div>
        <h1
          className="text-4xl md:text-5xl font-light mb-3 tracking-tight"
          style={{ fontFamily: 'var(--font-serif), serif' }}
        >
          <span className="italic text-[#c4f547]">Your</span>{' '}
          <span className="text-white">Portfolio</span>
        </h1>
        <p className="text-gray-500 max-w-lg text-sm leading-relaxed font-mono">
          Track your vault positions and performance.
        </p>
      </div>

      {/* Connect card */}
      <div className="rounded-2xl border border-white/5 bg-[#12121a]/80 text-center py-20">
        <div className="mb-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#c4f547]/5 border border-[#c4f547]/10 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              className="w-7 h-7 text-[#c4f547]/40"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3"
              />
            </svg>
          </div>
        </div>
        <p className="text-gray-400 text-sm mb-1">Connect your wallet to view your portfolio</p>
        <p className="text-gray-600 text-xs mb-6 font-mono">
          Your vault positions, P&L, and transaction history will appear here.
        </p>
        <div className="inline-flex">
          <ConnectWalletButton />
        </div>
      </div>
    </div>
  );
}

/* ── Main Portfolio Page ── */

export default function PortfolioPage() {
  const { address: userAddress, isConnected } = useAccount();
  const { positions, totalValue, totalPnL, isLoading, error } = useUserPortfolio(
    userAddress as `0x${string}` | undefined,
  );

  if (!isConnected) {
    return <ConnectPrompt />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-8 sm:py-12">
      {/* Breadcrumbs */}
      <nav className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="separator">/</span>
        <span className="text-gray-400">Portfolio</span>
      </nav>

      {/* Header */}
      <div className="mb-8 sm:mb-10">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-px flex-1 max-w-[40px] bg-gradient-to-r from-[#c4f547] to-transparent" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d5f972] font-mono">
            Portfolio
          </span>
        </div>
        <h1
          className="text-4xl md:text-5xl font-light mb-3 tracking-tight"
          style={{ fontFamily: 'var(--font-serif), serif' }}
        >
          <span className="italic text-[#c4f547]">Your</span>{' '}
          <span className="text-white">Portfolio</span>
        </h1>
        <p className="text-gray-500 max-w-lg text-sm leading-relaxed font-mono">
          Track your vault positions and performance across all strategy vaults.
        </p>
      </div>

      {/* Loading skeletons */}
      {isLoading && (
        <div>
          {/* Summary skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/5 bg-[#12121a]/80 p-5"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="w-24 h-3 skeleton rounded mb-3" />
                <div className="w-32 h-7 skeleton rounded" />
              </div>
            ))}
          </div>
          {/* Position skeletons */}
          <div className="h-4 skeleton w-48 mb-6" />
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/5 bg-[#12121a]/80 p-5"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-32 h-4 skeleton rounded-md" />
                  <div className="w-20 h-4 skeleton rounded-full" />
                </div>
                <div className="mb-4">
                  <div className="w-16 h-2 skeleton rounded mb-2" />
                  <div className="w-32 h-7 skeleton rounded" />
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="h-12 skeleton rounded-lg" />
                  <div className="h-12 skeleton rounded-lg" />
                </div>
                <div className="flex justify-between">
                  <div className="w-28 h-3 skeleton rounded" />
                  <div className="w-4 h-3 skeleton rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 text-center py-12 mb-8">
          <p className="text-red-400 font-mono text-sm">
            Failed to load portfolio. Please try refreshing the page.
          </p>
        </div>
      )}

      {/* Loaded content */}
      {!isLoading && !error && (
        <>
          {/* Summary cards */}
          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            <div className="card text-center py-4 sm:py-6 flex-1">
              <div className="text-[10px] sm:text-xs text-gray-500 font-mono uppercase tracking-wider mb-1 sm:mb-2">
                Total Value
              </div>
              <div className="text-xl sm:text-2xl font-light text-white font-mono">
                {positions.length > 0
                  ? formatClean(totalValue, positions[0].assetDecimals)
                  : '0'}
                {positions.length > 0 && (
                  <span className="text-xs sm:text-sm text-gray-400 ml-1">
                    {positions[0].assetSymbol}
                  </span>
                )}
              </div>
            </div>
            <div className="card text-center py-4 sm:py-6 flex-1">
              <div className="text-[10px] sm:text-xs text-gray-500 font-mono uppercase tracking-wider mb-1 sm:mb-2">
                Total Unrealized P&L
              </div>
              <div className="text-xl sm:text-2xl font-light font-mono">
                {positions.length > 0 ? (
                  <PnLBadge value={totalPnL} decimals={positions[0].assetDecimals} />
                ) : (
                  <span className="text-gray-500">0.00</span>
                )}
                {positions.length > 0 && (
                  <span className="text-xs sm:text-sm text-gray-400 ml-1">
                    {positions[0].assetSymbol}
                  </span>
                )}
              </div>
            </div>
            <div className="card text-center py-4 sm:py-6 flex-1">
              <div className="text-[10px] sm:text-xs text-gray-500 font-mono uppercase tracking-wider mb-1 sm:mb-2">
                Active Positions
              </div>
              <div className="text-xl sm:text-2xl font-light text-white font-mono">
                {positions.length}
              </div>
            </div>
          </div>

          {/* Positions */}
          {positions.length > 0 && (
            <div>
              <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-5">
                {positions.length} position{positions.length !== 1 ? 's' : ''}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {positions.map((pos) => (
                  <PositionCard key={pos.vaultAddress} position={pos} />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {positions.length === 0 && (
            <div className="rounded-2xl border border-white/5 bg-[#12121a]/80 text-center py-20">
              <div className="mb-6">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-[#c4f547]/5 border border-[#c4f547]/10 flex items-center justify-center">
                  <svg
                    viewBox="0 0 24 24"
                    className="w-7 h-7 text-[#c4f547]/40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375"
                    />
                  </svg>
                </div>
              </div>
              <p className="text-gray-400 text-sm mb-1">No active positions</p>
              <p className="text-gray-600 text-xs mb-6 font-mono">
                Deposit into a vault to start building your portfolio.
              </p>
              <Link href="/vaults" className="btn-primary inline-flex items-center gap-2 text-xs">
                Browse Vaults
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>
          )}

          {/* Transaction history placeholder */}
          {positions.length > 0 && (
            <div className="mt-10">
              <div className="card">
                <h2
                  className="text-lg font-light text-white mb-2"
                  style={{ fontFamily: 'var(--font-serif), serif' }}
                >
                  Transaction History
                </h2>
                <p className="text-gray-500 text-sm font-mono mb-4">
                  Deposit and withdrawal history for your positions.
                </p>
                <div className="rounded-xl border border-white/5 bg-white/[0.02] px-6 py-10 text-center">
                  <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-[#c4f547]/5 border border-[#c4f547]/10 flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-[#c4f547]/40"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={1}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <p className="text-gray-400 text-sm mb-1">Transaction history coming soon</p>
                  <p className="text-gray-600 text-xs font-mono">
                    On-chain deposit and withdrawal events will be displayed here.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
