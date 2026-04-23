'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { ConnectWalletButton } from '@/components/ConnectWalletButton';
import { usePoints, usePointsAvailable } from '@/hooks/usePoints';
import Link from 'next/link';

function formatPoints(value: bigint | undefined): string {
  if (value === undefined) return '0';
  return Number(value).toLocaleString();
}

function CountdownTimer({ target }: { target: bigint }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    function update() {
      const now = Math.floor(Date.now() / 1000);
      const end = Number(target);
      const diff = end - now;

      if (diff <= 0) {
        setTimeLeft('Season ended');
        return;
      }

      const days = Math.floor(diff / 86400);
      const hours = Math.floor((diff % 86400) / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;

      setTimeLeft(
        `${days}d ${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`
      );
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [target]);

  return <span className="font-mono">{timeLeft}</span>;
}

export default function PointsPage() {
  const { address: userAddress, isConnected } = useAccount();
  const pointsAvailable = usePointsAvailable();
  const {
    points,
    multiplier,
    seasonEnd,
    depositPoints,
    executionPoints,
    referralPoints,
    isLoading,
  } = usePoints(userAddress as `0x${string}` | undefined);

  const multiplierValue = multiplier ? Number(multiplier) : 1;
  const isEarlyBird = multiplierValue >= 3;
  const hasSeasonEnd = seasonEnd !== undefined && seasonEnd > 0n;

  return (
    <div className="max-w-4xl mx-auto px-6 lg:px-12 py-12">
      {/* Breadcrumbs */}
      <nav className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="separator">/</span>
        <span className="text-gray-400">Points</span>
      </nav>

      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-px flex-1 max-w-[40px] bg-gradient-to-r from-[#c4f547] to-transparent" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d5f972] font-mono">
            Points Program
          </span>
        </div>
        <h1
          className="text-4xl md:text-5xl font-light mb-3 tracking-tight"
          style={{ fontFamily: 'var(--font-serif), serif' }}
        >
          <span className="italic text-[#c4f547]">Earn</span>{' '}
          <span className="text-white">Points</span>
        </h1>
        <p className="text-gray-500 max-w-lg text-sm leading-relaxed font-mono">
          Deposit into vaults to earn points over time. Early adopters earn 3x,
          referrals give you 10% of your referrals&apos; points, and each execution
          earns you a 50-point bonus.
        </p>
      </div>

      {/* Wallet not connected */}
      {!isConnected && (
        <div className="card text-center py-16">
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[#c4f547]/5 border border-[#c4f547]/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-[#c4f547]/40" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-2">Connect your wallet to view your points</p>
          <p className="text-gray-600 text-xs font-mono mb-6">
            Deposit into vaults, refer friends, and earn points for every action.
          </p>
          <div className="flex justify-center">
            <ConnectWalletButton />
          </div>
        </div>
      )}

      {/* Contract not deployed */}
      {isConnected && !pointsAvailable && (
        <div className="card text-center py-16">
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-yellow-500/5 border border-yellow-500/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-yellow-500/40" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
          </div>
          <p className="text-gray-400 text-sm mb-1">Points program not yet deployed</p>
          <p className="text-gray-600 text-xs font-mono">
            The PointsProgram contract is not available on the current network. Check back soon.
          </p>
        </div>
      )}

      {/* Main content */}
      {isConnected && pointsAvailable && (
        <div className="space-y-8">
          {/* Total Points — Hero Card */}
          <div className="card relative overflow-hidden py-10 text-center">
            {/* Subtle gradient glow behind the number */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-64 h-64 rounded-full bg-[#c4f547]/5 blur-3xl" />
            </div>

            <div className="relative z-10">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-3">
                Total Points
              </div>
              <div className="text-5xl md:text-7xl font-light text-white font-mono tracking-tight mb-4">
                {isLoading ? (
                  <span className="text-gray-600 animate-pulse">---</span>
                ) : (
                  formatPoints(points)
                )}
              </div>

              {/* Multiplier badge */}
              <div className="inline-flex items-center gap-2">
                {isEarlyBird ? (
                  <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium bg-amber-500/10 text-amber-400 border-amber-500/20">
                    <svg className="w-3.5 h-3.5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 1l2.39 4.843 5.344.777-3.867 3.77.913 5.323L10 13.285l-4.78 2.428.913-5.323L2.266 6.62l5.344-.777L10 1z" />
                    </svg>
                    3x EARLY BIRD
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium bg-white/5 text-gray-400 border-white/10">
                    1x STANDARD
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stats Row — Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card text-center py-6">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-2">
                Deposit Points
              </div>
              <div className="text-3xl font-light text-white font-mono">
                {isLoading ? (
                  <span className="text-gray-600 animate-pulse">--</span>
                ) : (
                  formatPoints(depositPoints)
                )}
              </div>
            </div>
            <div className="card text-center py-6">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-2">
                Execution Bonus
              </div>
              <div className="text-3xl font-light text-white font-mono">
                {isLoading ? (
                  <span className="text-gray-600 animate-pulse">--</span>
                ) : (
                  formatPoints(executionPoints)
                )}
              </div>
            </div>
            <div className="card text-center py-6">
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-2">
                Referral Bonus
              </div>
              <div className="text-3xl font-light text-[#c4f547] font-mono">
                {isLoading ? (
                  <span className="text-gray-600 animate-pulse">--</span>
                ) : (
                  formatPoints(referralPoints)
                )}
              </div>
            </div>
          </div>

          {/* Season Countdown */}
          {hasSeasonEnd && (
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{
                    background: 'rgba(196, 245, 71, 0.08)',
                    border: '1px solid rgba(196, 245, 71, 0.15)',
                  }}
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#c4f547]" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-lg font-light text-white" style={{ fontFamily: 'var(--font-serif), serif' }}>
                  Season Countdown
                </h2>
              </div>
              <div className="text-center py-4">
                <div className="text-2xl md:text-3xl text-white font-mono">
                  <CountdownTimer target={seasonEnd!} />
                </div>
                <p className="text-gray-500 text-xs font-mono mt-2">
                  Time remaining to earn points this season
                </p>
              </div>
            </div>
          )}

          {/* How Points Work */}
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
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                </svg>
              </div>
              <h2 className="text-lg font-light text-white" style={{ fontFamily: 'var(--font-serif), serif' }}>
                How Points Work
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[#c4f547]/10 border border-[#c4f547]/20 flex items-center justify-center text-[#c4f547] font-mono font-bold text-sm">
                  1
                </div>
                <h3 className="text-white text-sm font-medium mb-1">Deposit</h3>
                <p className="text-gray-500 text-xs font-mono">
                  1 point per token per day. Deposit more to earn faster.
                </p>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-mono font-bold text-sm">
                  3x
                </div>
                <h3 className="text-white text-sm font-medium mb-1">Early Bird</h3>
                <p className="text-gray-500 text-xs font-mono">
                  3x multiplier for the first 30 days after launch.
                </p>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-mono font-bold text-sm">
                  +50
                </div>
                <h3 className="text-white text-sm font-medium mb-1">Execution Bonus</h3>
                <p className="text-gray-500 text-xs font-mono">
                  50 bonus points per successful vault execution.
                </p>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 font-mono font-bold text-sm">
                  10%
                </div>
                <h3 className="text-white text-sm font-medium mb-1">Referral Bonus</h3>
                <p className="text-gray-500 text-xs font-mono">
                  Earn 10% of your referrals&apos; deposit points.
                </p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="card text-center py-8">
            <p className="text-gray-400 text-sm mb-4">
              Deposit into vaults to start earning points
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/vaults"
                className="btn-primary px-8 py-3 inline-flex items-center gap-2"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Deposit to Earn Points
              </Link>
              <Link
                href="/referrals"
                className="btn-secondary px-8 py-3 inline-flex items-center gap-2"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
                Invite Friends
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
