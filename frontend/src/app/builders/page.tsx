'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  useLeaderboard,
  useBuilderCount,
  useBuilderProgramAvailable,
  type BuilderData,
} from '@/hooks/useBuilder';

const TIER_LABELS = ['Bronze', 'Silver', 'Gold'] as const;

const TIER_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  0: { bg: 'bg-amber-700/10', text: 'text-amber-600', border: 'border-amber-700/20' },
  1: { bg: 'bg-gray-300/10', text: 'text-gray-300', border: 'border-gray-400/20' },
  2: { bg: 'bg-yellow-400/10', text: 'text-yellow-400', border: 'border-yellow-400/20' },
};

function formatTvl(value: bigint): string {
  const num = Number(value) / 1e18;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}

function formatFees(value: bigint): string {
  const num = Number(value) / 1e18;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toFixed(2)}`;
}

function TierBadge({ tier }: { tier: number }) {
  const colors = TIER_COLORS[tier] ?? TIER_COLORS[0];
  const label = TIER_LABELS[tier] ?? 'Bronze';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors.bg} ${colors.text} ${colors.border}`}
    >
      {label}
    </span>
  );
}

const PAGE_SIZE = 20;

export default function BuildersPage() {
  const [page, setPage] = useState(0);
  const available = useBuilderProgramAvailable();
  const { data: count, isLoading: countLoading } = useBuilderCount();
  const { data: builders, isLoading } = useLeaderboard(
    BigInt(page * PAGE_SIZE),
    BigInt(PAGE_SIZE),
  );

  const total = count ? Number(count as bigint) : 0;
  const leaderboard = (builders as BuilderData[] | undefined) ?? [];
  const hasNext = (page + 1) * PAGE_SIZE < total;
  const hasPrev = page > 0;

  return (
    <div className="max-w-6xl mx-auto px-6 lg:px-12 py-12">
      {/* Breadcrumbs */}
      <nav className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="separator">/</span>
        <span className="text-gray-400">Builders</span>
      </nav>

      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-px flex-1 max-w-[40px] bg-gradient-to-r from-[#c4f547] to-transparent" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d5f972] font-mono">
            Builder Program
          </span>
        </div>
        <h1
          className="text-4xl md:text-5xl font-light mb-3 tracking-tight"
          style={{ fontFamily: 'var(--font-serif), serif' }}
        >
          <span className="italic text-[#c4f547]">Builder</span>{' '}
          <span className="text-white">Leaderboard</span>
        </h1>
        <p className="text-gray-500 max-w-lg text-sm leading-relaxed font-mono">
          Top agent builders ranked by total value locked. Higher tiers unlock better
          fee splits and grant eligibility.
        </p>
      </div>

      {/* Contract not deployed */}
      {!available && (
        <div className="card text-center py-16">
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-yellow-500/5 border border-yellow-500/10 flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="w-7 h-7 text-yellow-500/40"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-1">Builder program not yet deployed</p>
          <p className="text-gray-600 text-xs font-mono">
            The BuilderProgram contract is not available on the current network. Check back soon.
          </p>
        </div>
      )}

      {/* Main content */}
      {available && (
        <div className="space-y-6">
          {/* Summary row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card text-center py-6">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-2">
                Total Builders
              </div>
              <div className="text-3xl font-light text-white font-mono">
                {countLoading ? (
                  <span className="text-gray-600 animate-pulse">--</span>
                ) : (
                  total
                )}
              </div>
            </div>
            <div className="card text-center py-6">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-2">
                Tier Breakdown
              </div>
              <div className="flex items-center justify-center gap-2">
                <TierBadge tier={2} />
                <TierBadge tier={1} />
                <TierBadge tier={0} />
              </div>
            </div>
            <div className="card text-center py-6">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-2">
                Fee Split Range
              </div>
              <div className="text-sm text-gray-300 font-mono">70% - 90% to builder</div>
            </div>
          </div>

          {/* Leaderboard table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-gray-500">
                      Rank
                    </th>
                    <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-gray-500">
                      Builder
                    </th>
                    <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-gray-500 text-right">
                      TVL
                    </th>
                    <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-gray-500 text-right">
                      Fees Earned
                    </th>
                    <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-gray-500 text-right">
                      Executions
                    </th>
                    <th className="px-4 py-3 text-xs font-mono uppercase tracking-wider text-gray-500 text-center">
                      Tier
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center">
                        <span className="text-gray-600 animate-pulse font-mono text-sm">
                          Loading builders...
                        </span>
                      </td>
                    </tr>
                  ) : leaderboard.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center">
                        <span className="text-gray-600 font-mono text-sm">
                          No builders registered yet. Be the first!
                        </span>
                      </td>
                    </tr>
                  ) : (
                    leaderboard.map((builder, idx) => (
                      <tr
                        key={builder.builderAddress}
                        className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-4 py-4">
                          <span className="text-gray-400 font-mono text-sm">
                            #{page * PAGE_SIZE + idx + 1}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div>
                            <div className="text-white text-sm font-medium">
                              {builder.name}
                            </div>
                            {builder.url && (
                              <a
                                href={builder.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#c4f547] text-xs font-mono hover:underline"
                              >
                                {builder.url.replace(/^https?:\/\//, '')}
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="text-white font-mono text-sm">
                            {formatTvl(builder.totalTvl)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="text-gray-300 font-mono text-sm">
                            {formatFees(builder.totalFeesEarned)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="text-gray-300 font-mono text-sm">
                            {Number(builder.totalExecutions).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <TierBadge tier={builder.tier} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {total > PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={!hasPrev}
                  className="text-xs font-mono text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <span className="text-xs font-mono text-gray-500">
                  Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasNext}
                  className="text-xs font-mono text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {/* CTA */}
          <div className="card text-center py-8">
            <p className="text-gray-400 text-sm mb-4">
              Build agents, grow TVL, and earn higher fee splits
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/builders/dashboard"
                className="btn-primary px-8 py-3 inline-flex items-center gap-2"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5"
                  />
                </svg>
                Builder Dashboard
              </Link>
              <a
                href="https://docs.tokamak.network"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary px-8 py-3 inline-flex items-center gap-2"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.331 0 4.472.89 6.075 2.35M12 6.042A8.967 8.967 0 0118 3.75c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18c-2.331 0-4.472.89-6.075 2.35M12 6.042V20.35"
                  />
                </svg>
                Become a Builder
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
