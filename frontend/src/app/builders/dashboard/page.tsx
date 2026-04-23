'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { ConnectWalletButton } from '@/components/ConnectWalletButton';
import {
  useBuilder,
  useBuilderProgramAvailable,
  useRegisterBuilder,
  useClaimGrant,
} from '@/hooks/useBuilder';

const TIER_LABELS = ['Bronze', 'Silver', 'Gold'] as const;

const TIER_CONFIGS: Record<
  number,
  { label: string; color: string; bg: string; border: string; feeSplit: string }
> = {
  0: {
    label: 'Bronze',
    color: 'text-amber-600',
    bg: 'bg-amber-700/10',
    border: 'border-amber-700/20',
    feeSplit: '70/30',
  },
  1: {
    label: 'Silver',
    color: 'text-gray-300',
    bg: 'bg-gray-300/10',
    border: 'border-gray-400/20',
    feeSplit: '80/20',
  },
  2: {
    label: 'Gold',
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10',
    border: 'border-yellow-400/20',
    feeSplit: '90/10',
  },
};

// TVL thresholds in human-readable form
const TIER_THRESHOLDS = [0, 100_000, 1_000_000]; // Bronze: 0, Silver: $100K, Gold: $1M

function formatTokenAmount(value: bigint): string {
  const num = Number(value) / 1e18;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(2);
}

function formatUsd(value: bigint): string {
  return `$${formatTokenAmount(value)}`;
}

function TierProgressBar({ currentTvl, currentTier }: { currentTvl: bigint; currentTier: number }) {
  const tvlNum = Number(currentTvl) / 1e18;

  if (currentTier >= 2) {
    // Gold -- already at the top
    return (
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs font-mono text-gray-500 mb-2">
          <span>Gold Tier Achieved</span>
          <span>{formatUsd(currentTvl)} TVL</span>
        </div>
        <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-yellow-300 w-full" />
        </div>
      </div>
    );
  }

  const nextThreshold = TIER_THRESHOLDS[currentTier + 1];
  const prevThreshold = TIER_THRESHOLDS[currentTier];
  const range = nextThreshold - prevThreshold;
  const progress = range > 0 ? Math.min(((tvlNum - prevThreshold) / range) * 100, 100) : 0;
  const nextLabel = TIER_LABELS[currentTier + 1];

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-xs font-mono text-gray-500 mb-2">
        <span>
          Progress to {nextLabel} (${(nextThreshold / 1000).toFixed(0)}K TVL)
        </span>
        <span>{progress.toFixed(1)}%</span>
      </div>
      <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#c4f547] to-[#d5f972] transition-all duration-500"
          style={{ width: `${Math.max(progress, 2)}%` }}
        />
      </div>
    </div>
  );
}

function RegisterForm() {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const { registerBuilder, isPending, isConfirming, isSuccess, error } = useRegisterBuilder();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      registerBuilder(name.trim(), url.trim());
    }
  };

  if (isSuccess) {
    return (
      <div className="card text-center py-12">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
          <svg viewBox="0 0 24 24" className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <p className="text-white text-lg mb-1">Registration successful!</p>
        <p className="text-gray-500 text-xs font-mono">
          Your builder profile is now live. Refresh to see your dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{
            background: 'rgba(196, 245, 71, 0.08)',
            border: '1px solid rgba(196, 245, 71, 0.15)',
          }}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#c4f547]" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
          </svg>
        </div>
        <h2 className="text-lg font-light text-white" style={{ fontFamily: 'var(--font-serif), serif' }}>
          Register as a Builder
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-mono text-gray-500 uppercase tracking-wider mb-1.5">
            Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your builder name"
            required
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#c4f547]/50 transition-colors font-mono"
          />
        </div>
        <div>
          <label className="block text-xs font-mono text-gray-500 uppercase tracking-wider mb-1.5">
            Website
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-site.dev"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#c4f547]/50 transition-colors font-mono"
          />
        </div>
        {error && (
          <p className="text-red-400 text-xs font-mono">
            {(error as any)?.shortMessage ?? error.message}
          </p>
        )}
        <button
          type="submit"
          disabled={isPending || isConfirming || !name.trim()}
          className="btn-primary w-full py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending
            ? 'Confirm in wallet...'
            : isConfirming
              ? 'Registering...'
              : 'Register'}
        </button>
      </form>
    </div>
  );
}

export default function BuilderDashboardPage() {
  const { address: userAddress, isConnected } = useAccount();
  const available = useBuilderProgramAvailable();
  const {
    builder,
    tier,
    feeSplit,
    claimable,
    grant,
    isRegistered,
    isLoading,
  } = useBuilder(userAddress as `0x${string}` | undefined);

  const { claimGrant, isPending: claimPending, isConfirming: claimConfirming, isSuccess: claimSuccess } =
    useClaimGrant();

  const currentTier = tier ?? 0;
  const tierConfig = TIER_CONFIGS[currentTier] ?? TIER_CONFIGS[0];
  const hasGrant = grant && grant.totalAmount > 0n;
  const claimableAmount = claimable ?? 0n;

  return (
    <div className="max-w-4xl mx-auto px-6 lg:px-12 py-12">
      {/* Breadcrumbs */}
      <nav className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="separator">/</span>
        <Link href="/builders">Builders</Link>
        <span className="separator">/</span>
        <span className="text-gray-400">Dashboard</span>
      </nav>

      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-px flex-1 max-w-[40px] bg-gradient-to-r from-[#c4f547] to-transparent" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d5f972] font-mono">
            Builder Dashboard
          </span>
        </div>
        <h1
          className="text-4xl md:text-5xl font-light mb-3 tracking-tight"
          style={{ fontFamily: 'var(--font-serif), serif' }}
        >
          <span className="italic text-[#c4f547]">Your</span>{' '}
          <span className="text-white">Dashboard</span>
        </h1>
        <p className="text-gray-500 max-w-lg text-sm leading-relaxed font-mono">
          Track your builder stats, manage grants, and view your tier progress.
        </p>
      </div>

      {/* Wallet not connected */}
      {!isConnected && (
        <div className="card text-center py-16">
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[#c4f547]/5 border border-[#c4f547]/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-[#c4f547]/40" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
              </svg>
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-2">Connect your wallet to access your builder dashboard</p>
          <p className="text-gray-600 text-xs font-mono mb-6">
            Register as a builder to start tracking your stats and earning rewards.
          </p>
          <div className="flex justify-center">
            <ConnectWalletButton />
          </div>
        </div>
      )}

      {/* Contract not deployed */}
      {isConnected && !available && (
        <div className="card text-center py-16">
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-yellow-500/5 border border-yellow-500/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-yellow-500/40" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-1">Builder program not yet deployed</p>
          <p className="text-gray-600 text-xs font-mono">
            The BuilderProgram contract is not available on the current network. Check back soon.
          </p>
        </div>
      )}

      {/* Loading */}
      {isConnected && available && isLoading && (
        <div className="card text-center py-16">
          <span className="text-gray-600 animate-pulse font-mono text-sm">
            Loading your builder profile...
          </span>
        </div>
      )}

      {/* Not registered -- show registration form */}
      {isConnected && available && !isLoading && !isRegistered && <RegisterForm />}

      {/* Dashboard */}
      {isConnected && available && !isLoading && isRegistered && builder && (
        <div className="space-y-8">
          {/* Tier Hero Card */}
          <div className="card relative overflow-hidden py-10 text-center">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-64 h-64 rounded-full bg-[#c4f547]/5 blur-3xl" />
            </div>

            <div className="relative z-10">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-3">
                Current Tier
              </div>
              <div className="mb-3">
                <span
                  className={`inline-flex items-center rounded-full border px-4 py-1.5 text-lg font-medium ${tierConfig.bg} ${tierConfig.color} ${tierConfig.border}`}
                >
                  {tierConfig.label}
                </span>
              </div>
              <div className="text-sm text-gray-500 font-mono">
                Fee split: {tierConfig.feeSplit} (builder/protocol)
              </div>

              <TierProgressBar currentTvl={builder.totalTvl} currentTier={currentTier} />
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card text-center py-6">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-2">
                Total TVL
              </div>
              <div className="text-3xl font-light text-white font-mono">
                {formatUsd(builder.totalTvl)}
              </div>
            </div>
            <div className="card text-center py-6">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-2">
                Fees Earned
              </div>
              <div className="text-3xl font-light text-white font-mono">
                {formatUsd(builder.totalFeesEarned)}
              </div>
            </div>
            <div className="card text-center py-6">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-2">
                Executions
              </div>
              <div className="text-3xl font-light text-white font-mono">
                {Number(builder.totalExecutions).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Revenue Breakdown */}
          <div className="card">
            <div className="flex items-center gap-3 mb-6">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{
                  background: 'rgba(196, 245, 71, 0.08)',
                  border: '1px solid rgba(196, 245, 71, 0.15)',
                }}
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#c4f547]" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                </svg>
              </div>
              <h2 className="text-lg font-light text-white" style={{ fontFamily: 'var(--font-serif), serif' }}>
                Revenue Breakdown
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white/[0.02] rounded-lg p-4 border border-white/5">
                <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">
                  Your Share ({feeSplit ? `${Number(feeSplit.builderBps) / 100}%` : '--'})
                </div>
                <div className="text-2xl font-light text-white font-mono">
                  {feeSplit
                    ? formatUsd(
                        (builder.totalFeesEarned * feeSplit.builderBps) / 10000n,
                      )
                    : '--'}
                </div>
              </div>
              <div className="bg-white/[0.02] rounded-lg p-4 border border-white/5">
                <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">
                  Protocol Share ({feeSplit ? `${Number(feeSplit.protocolBps) / 100}%` : '--'})
                </div>
                <div className="text-2xl font-light text-gray-400 font-mono">
                  {feeSplit
                    ? formatUsd(
                        (builder.totalFeesEarned * feeSplit.protocolBps) / 10000n,
                      )
                    : '--'}
                </div>
              </div>
            </div>
          </div>

          {/* Grant Section */}
          <div className="card">
            <div className="flex items-center gap-3 mb-6">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{
                  background: 'rgba(196, 245, 71, 0.08)',
                  border: '1px solid rgba(196, 245, 71, 0.15)',
                }}
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#c4f547]" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
              </div>
              <h2 className="text-lg font-light text-white" style={{ fontFamily: 'var(--font-serif), serif' }}>
                Vesting Grant
              </h2>
            </div>

            {!hasGrant ? (
              <div className="text-center py-6">
                <p className="text-gray-500 text-sm font-mono">
                  No grant allocated yet. Keep building to qualify for grants.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white/[0.02] rounded-lg p-4 border border-white/5">
                    <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">
                      Total Grant
                    </div>
                    <div className="text-xl font-light text-white font-mono">
                      {formatTokenAmount(grant!.totalAmount)}
                    </div>
                  </div>
                  <div className="bg-white/[0.02] rounded-lg p-4 border border-white/5">
                    <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">
                      Claimed
                    </div>
                    <div className="text-xl font-light text-gray-400 font-mono">
                      {formatTokenAmount(grant!.claimed)}
                    </div>
                  </div>
                  <div className="bg-white/[0.02] rounded-lg p-4 border border-white/5">
                    <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">
                      Claimable Now
                    </div>
                    <div className="text-xl font-light text-emerald-400 font-mono">
                      {formatTokenAmount(claimableAmount)}
                    </div>
                  </div>
                </div>

                {/* Vesting progress bar */}
                {grant && grant.totalAmount > 0n && (
                  <div>
                    <div className="flex items-center justify-between text-xs font-mono text-gray-500 mb-2">
                      <span>Vesting Progress</span>
                      <span>
                        {(
                          (Number(grant.claimed) / Number(grant.totalAmount)) *
                          100
                        ).toFixed(1)}
                        % claimed
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-all duration-500"
                        style={{
                          width: `${Math.max(
                            (Number(grant.claimed) / Number(grant.totalAmount)) * 100,
                            1,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Claim button */}
                <button
                  onClick={() => claimGrant()}
                  disabled={claimableAmount === 0n || claimPending || claimConfirming}
                  className="btn-primary w-full py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {claimPending
                    ? 'Confirm in wallet...'
                    : claimConfirming
                      ? 'Claiming...'
                      : claimSuccess
                        ? 'Claimed!'
                        : claimableAmount > 0n
                          ? `Claim ${formatTokenAmount(claimableAmount)} tokens`
                          : 'Nothing to claim yet'}
                </button>
              </div>
            )}
          </div>

          {/* Builder Info */}
          <div className="card">
            <div className="flex items-center gap-3 mb-6">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{
                  background: 'rgba(196, 245, 71, 0.08)',
                  border: '1px solid rgba(196, 245, 71, 0.15)',
                }}
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#c4f547]" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
              <h2 className="text-lg font-light text-white" style={{ fontFamily: 'var(--font-serif), serif' }}>
                Builder Profile
              </h2>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-xs text-gray-500 font-mono uppercase">Name</span>
                <span className="text-sm text-white">{builder.name}</span>
              </div>
              {builder.url && (
                <div className="flex items-center justify-between py-2 border-b border-white/5">
                  <span className="text-xs text-gray-500 font-mono uppercase">Website</span>
                  <a
                    href={builder.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[#c4f547] hover:underline"
                  >
                    {builder.url.replace(/^https?:\/\//, '')}
                  </a>
                </div>
              )}
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-xs text-gray-500 font-mono uppercase">Address</span>
                <span className="text-sm text-gray-300 font-mono">
                  {builder.builderAddress.slice(0, 6)}...{builder.builderAddress.slice(-4)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-gray-500 font-mono uppercase">Registered</span>
                <span className="text-sm text-gray-300 font-mono">
                  {new Date(Number(builder.registeredAt) * 1000).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* Tier Info Table */}
          <div className="card">
            <div className="flex items-center gap-3 mb-6">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{
                  background: 'rgba(196, 245, 71, 0.08)',
                  border: '1px solid rgba(196, 245, 71, 0.15)',
                }}
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#c4f547]" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <h2 className="text-lg font-light text-white" style={{ fontFamily: 'var(--font-serif), serif' }}>
                Tier Benefits
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="px-3 py-2 text-xs font-mono uppercase tracking-wider text-gray-500">
                      Tier
                    </th>
                    <th className="px-3 py-2 text-xs font-mono uppercase tracking-wider text-gray-500">
                      TVL Required
                    </th>
                    <th className="px-3 py-2 text-xs font-mono uppercase tracking-wider text-gray-500">
                      Builder Share
                    </th>
                    <th className="px-3 py-2 text-xs font-mono uppercase tracking-wider text-gray-500">
                      Protocol Share
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { tier: 0, tvl: '$0', builder: '70%', protocol: '30%' },
                    { tier: 1, tvl: '$100K', builder: '80%', protocol: '20%' },
                    { tier: 2, tvl: '$1M', builder: '90%', protocol: '10%' },
                  ].map((row) => {
                    const isCurrentTier = row.tier === currentTier;
                    return (
                      <tr
                        key={row.tier}
                        className={`border-b border-white/5 ${isCurrentTier ? 'bg-[#c4f547]/5' : ''}`}
                      >
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${TIER_CONFIGS[row.tier].bg} ${TIER_CONFIGS[row.tier].color} ${TIER_CONFIGS[row.tier].border}`}
                          >
                            {TIER_CONFIGS[row.tier].label}
                            {isCurrentTier && ' (you)'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-300 font-mono">
                          {row.tvl}
                        </td>
                        <td className="px-3 py-3 text-sm text-white font-mono">
                          {row.builder}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-400 font-mono">
                          {row.protocol}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
