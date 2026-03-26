'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import AuroraBackground from '@/components/AuroraBackground';
import { useProtocolStats } from '@/hooks/useProtocolStats';
import { useDeployedVaultsList, type VaultInfo } from '@/hooks/useVaultFactory';
import { useAgentMetadata } from '@/hooks/useAgentMetadata';
import { formatEther } from '@/lib/utils';
import { protocolLabel, PROTOCOL_TYPE, type ProtocolType } from '@/lib/protocolTypes';

/* ─────────────────────────── Animated Counter ─────────────────────────── */

function AnimatedCounter({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!ref.current || hasAnimated.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const duration = 1200;
          const start = performance.now();
          const animate = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.floor(eased * value));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value]);

  // Update display if value changes after animation
  useEffect(() => {
    if (hasAnimated.current) setDisplay(value);
  }, [value]);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}{display.toLocaleString()}{suffix}
    </span>
  );
}

/* ─────────────────────────── Format TVL helper ─────────────────────────── */

function formatTVL(wei: bigint): string {
  const raw = formatEther(wei, 18);
  const num = parseFloat(raw);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  if (num >= 1) return num.toFixed(2);
  if (num > 0) return num.toFixed(4);
  return '0';
}

function formatTVLClean(value: bigint, decimals: number): string {
  const raw = formatEther(value, decimals);
  return raw.replace(/\.?0+$/, '');
}

/* ─────────────────────────── Vault Card for Top Performers ─────────────────────────── */

function TopVaultCard({ vault, rank }: { vault: VaultInfo; rank: number }) {
  const { data: metadata } = useAgentMetadata(vault.agentId as `0x${string}`);
  const tvl = formatTVLClean(vault.totalValueLocked ?? vault.totalAssets, vault.assetDecimals);

  const protocolType = vault.protocolType ?? 0;
  const accentColor =
    protocolType === PROTOCOL_TYPE.HYPERLIQUID
      ? { border: 'border-emerald-500/20 hover:border-emerald-400/40', text: 'text-emerald-400', bg: 'bg-emerald-500/10', dot: 'bg-emerald-400', glow: 'hover:shadow-[0_0_30px_rgba(16,185,129,0.12)]' }
      : protocolType === PROTOCOL_TYPE.POLYMARKET
        ? { border: 'border-blue-500/20 hover:border-blue-400/40', text: 'text-blue-400', bg: 'bg-blue-500/10', dot: 'bg-blue-400', glow: 'hover:shadow-[0_0_30px_rgba(59,130,246,0.12)]' }
        : { border: 'border-white/10 hover:border-[#A855F7]/30', text: 'text-[#C084FC]', bg: 'bg-[#A855F7]/10', dot: 'bg-[#A855F7]', glow: 'hover:shadow-[0_0_30px_rgba(168,85,247,0.12)]' };

  return (
    <Link href={`/vaults/${vault.address}`}>
      <div
        className={`
          relative overflow-hidden rounded-2xl border
          bg-[#12121a]/80 backdrop-blur-sm
          p-6 cursor-pointer group
          transition-all duration-500 ease-out
          hover:-translate-y-1
          ${accentColor.border} ${accentColor.glow}
          vault-card-enter
        `}
        style={{ animationDelay: `${rank * 100}ms` }}
      >
        {/* Rank badge */}
        <div className="absolute top-4 right-4">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${accentColor.bg} ${accentColor.text}`}
            style={{ fontFamily: 'var(--font-mono), monospace' }}
          >
            #{rank}
          </div>
        </div>

        {/* Top-edge gradient accent on hover */}
        <div
          className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background:
              protocolType === PROTOCOL_TYPE.HYPERLIQUID
                ? 'linear-gradient(90deg, transparent, #10b981, transparent)'
                : protocolType === PROTOCOL_TYPE.POLYMARKET
                  ? 'linear-gradient(90deg, transparent, #3b82f6, transparent)'
                  : 'linear-gradient(90deg, transparent, #A855F7, transparent)',
          }}
        />

        {/* Agent name */}
        <div className="mb-3">
          <h3 className="text-lg font-medium text-white group-hover:text-[#C084FC] transition-colors">
            {metadata?.name ?? `Vault ${vault.address.slice(0, 8)}...`}
          </h3>
          {metadata?.description && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-1">{metadata.description}</p>
          )}
        </div>

        {/* Protocol badge */}
        {protocolType !== PROTOCOL_TYPE.GENERIC && (
          <div className="mb-3">
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${accentColor.bg} ${accentColor.text} border-current/20`}
            >
              {protocolLabel(protocolType as ProtocolType)}
            </span>
          </div>
        )}

        {/* TVL */}
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-1">TVL</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-light tracking-tight text-white font-mono">{tvl}</span>
            <span className={`text-xs font-mono font-medium ${accentColor.text}`}>{vault.assetSymbol}</span>
          </div>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2 text-[11px] font-mono text-gray-500">
          {vault.totalAssets > 0n && (
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${accentColor.dot}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${accentColor.dot}`} />
            </span>
          )}
          <span>
            {vault.isOptimistic ? 'Optimistic' : 'Standard'} Vault
          </span>
        </div>
      </div>
    </Link>
  );
}

/* ─────────────────────────── Section Visibility Hook ─────────────────────────── */

function useSectionVisible(threshold = 0.15): [React.RefObject<HTMLElement>, boolean] {
  const ref = useRef<HTMLElement>(null) as React.RefObject<HTMLElement>;
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setIsVisible(true); },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, isVisible];
}

/* ═══════════════════════════ HOME PAGE ═══════════════════════════ */

export default function HomePage() {
  const [isLoaded, setIsLoaded] = useState(false);

  // Protocol-level stats
  const stats = useProtocolStats();

  // All vaults — used for "Top Performing" section
  const { data: allVaults } = useDeployedVaultsList();

  // Sort vaults by TVL descending, take top 3
  const topVaults = useMemo(() => {
    if (!allVaults || allVaults.length === 0) return [];
    return [...allVaults]
      .sort((a, b) => {
        const tvlA = a.totalValueLocked ?? a.totalAssets;
        const tvlB = b.totalValueLocked ?? b.totalAssets;
        if (tvlB > tvlA) return 1;
        if (tvlB < tvlA) return -1;
        return 0;
      })
      .slice(0, 3);
  }, [allVaults]);

  // Section visibility
  const [statsRef, statsVisible] = useSectionVisible(0.3);
  const [topVaultsRef, topVaultsVisible] = useSectionVisible(0.15);
  const [howItWorksRef, howItWorksVisible] = useSectionVisible(0.15);
  const [trustRef, trustVisible] = useSectionVisible(0.15);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  return (
    <div>
      {/* Aurora -- fixed behind everything */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-40">
        <AuroraBackground />
      </div>

      {/* ═══════════════ 1. HERO SECTION ═══════════════ */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        <div className="relative z-10 w-full max-w-5xl mx-auto px-6 lg:px-12 flex flex-col items-center text-center pt-32 pb-20 lg:py-20">
          {/* Eyebrow badge */}
          <div
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm mb-8 transition-all duration-700 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
            style={{ transitionDelay: '100ms' }}
          >
            <div className="w-2 h-2 rounded-full bg-[#A855F7] animate-pulse" />
            <span
              className="text-xs tracking-widest text-gray-400 uppercase"
              style={{ fontFamily: 'var(--font-mono), monospace' }}
            >
              Live on Ethereum
            </span>
          </div>

          {/* Headline */}
          <h1
            className={`text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-light leading-tight mb-6 transition-all duration-1000 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
            style={{
              fontFamily: 'var(--font-serif), serif',
              transitionDelay: '200ms',
            }}
          >
            <span className="block text-white">
              AI-Managed DeFi Strategies,
            </span>
            <span className="block mt-2">
              <span className="italic gradient-text">
                Verified by Zero-Knowledge Proofs
              </span>
            </span>
          </h1>

          {/* Subheadline */}
          <p
            className={`text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed transition-all duration-1000 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
            style={{ transitionDelay: '600ms' }}
          >
            Deposit into autonomous vaults. Every trade is mathematically proven correct.
          </p>

          {/* CTA Buttons */}
          <div
            className={`flex flex-wrap justify-center gap-4 transition-all duration-1000 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
            style={{ transitionDelay: '800ms' }}
          >
            <Link href="/vaults?sort=returns" className="shiny-cta group">
              <span className="shiny-cta-text">
                View Top Strategies
                <svg
                  className="w-4 h-4 transform group-hover:translate-x-1 transition-transform duration-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </span>
            </Link>

            <a
              href="https://docs.tokagent.network"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary inline-flex items-center gap-2 px-6 py-4 rounded-full text-base"
              style={{ fontFamily: 'var(--font-mono), monospace' }}
            >
              Build an Agent
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>

        {/* Bottom gradient fade */}
        <div
          className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
          style={{ background: 'linear-gradient(to top, #0a0a0f 0%, transparent 100%)' }}
        />
      </section>

      {/* ═══════════════ 2. LIVE STATS BAR ═══════════════ */}
      <section
        ref={statsRef}
        className="relative z-10 -mt-16 pb-8"
      >
        <div className="max-w-5xl mx-auto px-6 lg:px-12">
          <div
            className={`grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 transition-all duration-700 ${statsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
          >
            {/* Total TVL */}
            <div className="relative rounded-2xl border border-white/10 bg-[#12121a]/80 backdrop-blur-sm p-5 text-center group hover:border-[#A855F7]/30 transition-all duration-300">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-2">Total TVL</p>
              <p className="text-2xl md:text-3xl font-light text-white font-mono">
                {stats.isLoading ? (
                  <span className="inline-block w-16 h-7 skeleton rounded" />
                ) : (
                  formatTVL(stats.totalTVL)
                )}
              </p>
              <p className="text-[10px] text-[#C084FC] font-mono mt-1">ETH</p>
            </div>

            {/* Active Vaults */}
            <div className="relative rounded-2xl border border-white/10 bg-[#12121a]/80 backdrop-blur-sm p-5 text-center group hover:border-[#A855F7]/30 transition-all duration-300">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-2">Active Vaults</p>
              <p className="text-2xl md:text-3xl font-light text-white font-mono">
                {stats.isLoading ? (
                  <span className="inline-block w-12 h-7 skeleton rounded" />
                ) : (
                  <AnimatedCounter value={stats.activeVaults} />
                )}
              </p>
            </div>

            {/* Verified Executions */}
            <div className="relative rounded-2xl border border-white/10 bg-[#12121a]/80 backdrop-blur-sm p-5 text-center group hover:border-[#A855F7]/30 transition-all duration-300">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-2">Verified Executions</p>
              <p className="text-2xl md:text-3xl font-light text-white font-mono">
                {stats.isLoading ? (
                  <span className="inline-block w-12 h-7 skeleton rounded" />
                ) : (
                  <AnimatedCounter value={stats.verifiedExecutions} />
                )}
              </p>
            </div>

            {/* Total Depositors */}
            <div className="relative rounded-2xl border border-white/10 bg-[#12121a]/80 backdrop-blur-sm p-5 text-center group hover:border-[#A855F7]/30 transition-all duration-300">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-2">Depositors</p>
              <p className="text-2xl md:text-3xl font-light text-white font-mono">
                {stats.isLoading ? (
                  <span className="inline-block w-12 h-7 skeleton rounded" />
                ) : (
                  <AnimatedCounter value={stats.totalDepositors} />
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ 3. TOP PERFORMING VAULTS ═══════════════ */}
      <section
        ref={topVaultsRef}
        className="relative z-10 py-24 overflow-hidden border-t border-white/5"
      >
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(168, 85, 247, 0.3), transparent)' }}
        />

        <div className="max-w-6xl mx-auto px-6 lg:px-12">
          {/* Section header */}
          <div className="text-center mb-16">
            <div
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm mb-8 transition-all duration-700 ${topVaultsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
            >
              <div className="w-2 h-2 rounded-full bg-[#A855F7] animate-pulse" />
              <span
                className="text-xs tracking-widest text-gray-400 uppercase"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                Top Performers
              </span>
            </div>

            <h2
              className={`text-3xl md:text-4xl lg:text-5xl font-light mb-4 transition-all duration-1000 ${topVaultsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{ fontFamily: 'var(--font-serif), serif' }}
            >
              <span className="text-white">Explore </span>
              <span className="italic text-[#A855F7]">Vaults</span>
            </h2>

            <p
              className={`text-lg text-gray-400 max-w-xl mx-auto leading-relaxed transition-all duration-1000 delay-200 ${topVaultsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            >
              AI-managed strategies with verifiable on-chain execution
            </p>
          </div>

          {/* Vault cards */}
          {topVaults.length > 0 ? (
            <div
              className={`grid md:grid-cols-3 gap-6 transition-all duration-700 ${topVaultsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{ transitionDelay: '400ms' }}
            >
              {topVaults.map((vault, i) => (
                <TopVaultCard key={vault.address} vault={vault} rank={i + 1} />
              ))}
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl border border-white/10 bg-[#12121a]/80 p-6 h-48">
                  <div className="skeleton w-32 h-5 mb-3 rounded" />
                  <div className="skeleton w-48 h-3 mb-6 rounded" />
                  <div className="skeleton w-24 h-8 rounded" />
                </div>
              ))}
            </div>
          )}

          {/* View All link */}
          <div
            className={`text-center mt-10 transition-all duration-700 ${topVaultsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
            style={{ transitionDelay: '600ms' }}
          >
            <Link
              href="/vaults"
              className="inline-flex items-center gap-2 text-[#C084FC] hover:text-white transition-colors font-mono text-sm group"
            >
              View All Vaults
              <svg
                className="w-4 h-4 transform group-hover:translate-x-1 transition-transform"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════ 4. HOW IT WORKS ═══════════════ */}
      <section
        ref={howItWorksRef}
        className="relative z-10 py-24 overflow-hidden border-t border-white/5"
      >
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(168, 85, 247, 0.2), transparent)' }}
        />

        <div className="max-w-5xl mx-auto px-6 lg:px-12">
          <div className="text-center mb-16">
            <h2
              className={`text-3xl md:text-4xl lg:text-5xl font-light mb-4 transition-all duration-1000 ${howItWorksVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{ fontFamily: 'var(--font-serif), serif' }}
            >
              <span className="text-white">How it </span>
              <span className="italic text-[#A855F7]">Works</span>
            </h2>
            <p
              className={`text-lg text-gray-400 max-w-xl mx-auto leading-relaxed transition-all duration-1000 delay-200 ${howItWorksVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            >
              Three steps from deposit to verified returns
            </p>
          </div>

          {/* 3 Steps -- Horizontal flow on desktop, vertical on mobile */}
          <div className="grid md:grid-cols-3 gap-8 md:gap-4 relative">
            {/* Connecting line (desktop only) */}
            <div className="hidden md:block absolute top-16 left-[16%] right-[16%] h-px bg-gradient-to-r from-[#A855F7]/30 via-[#A855F7]/50 to-[#A855F7]/30" />

            {/* Step 1: Deposit */}
            <div
              className={`relative flex flex-col items-center text-center transition-all duration-700 ${howItWorksVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{ transitionDelay: '400ms' }}
            >
              <div
                className="relative z-10 w-16 h-16 rounded-full border border-[#A855F7]/40 bg-[#0a0a0f] flex items-center justify-center mb-6"
                style={{ boxShadow: '0 0 20px rgba(168, 85, 247, 0.15)' }}
              >
                {/* Wallet icon */}
                <svg className="w-7 h-7 text-[#A855F7]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
                </svg>
              </div>
              <div
                className="text-sm font-medium text-[#A855F7] mb-2"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                01
              </div>
              <h3
                className="text-xl font-medium text-white mb-2"
                style={{ fontFamily: 'var(--font-serif), serif' }}
              >
                Deposit
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed max-w-xs">
                Choose a vault and deposit ETH or tokens. Your assets are held securely in an on-chain smart contract.
              </p>
            </div>

            {/* Step 2: Agent Trades */}
            <div
              className={`relative flex flex-col items-center text-center transition-all duration-700 ${howItWorksVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{ transitionDelay: '600ms' }}
            >
              <div
                className="relative z-10 w-16 h-16 rounded-full border border-[#A855F7]/40 bg-[#0a0a0f] flex items-center justify-center mb-6"
                style={{ boxShadow: '0 0 20px rgba(168, 85, 247, 0.15)' }}
              >
                {/* CPU/Agent icon */}
                <svg className="w-7 h-7 text-[#A855F7]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
                </svg>
              </div>
              <div
                className="text-sm font-medium text-[#A855F7] mb-2"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                02
              </div>
              <h3
                className="text-xl font-medium text-white mb-2"
                style={{ fontFamily: 'var(--font-serif), serif' }}
              >
                Agent Trades
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed max-w-xs">
                AI agents execute strategies autonomously. Every decision is computed inside a zkVM and verified with a cryptographic proof.
              </p>
            </div>

            {/* Step 3: Withdraw */}
            <div
              className={`relative flex flex-col items-center text-center transition-all duration-700 ${howItWorksVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{ transitionDelay: '800ms' }}
            >
              <div
                className="relative z-10 w-16 h-16 rounded-full border border-[#A855F7]/40 bg-[#0a0a0f] flex items-center justify-center mb-6"
                style={{ boxShadow: '0 0 20px rgba(168, 85, 247, 0.15)' }}
              >
                {/* Arrow-down-on-square / withdraw icon */}
                <svg className="w-7 h-7 text-[#A855F7]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                </svg>
              </div>
              <div
                className="text-sm font-medium text-[#A855F7] mb-2"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                03
              </div>
              <h3
                className="text-xl font-medium text-white mb-2"
                style={{ fontFamily: 'var(--font-serif), serif' }}
              >
                Withdraw Anytime
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed max-w-xs">
                Your funds are always accessible. Withdraw your share of vault assets at any time, no lock-ups.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ 5. TRUST SIGNALS ═══════════════ */}
      <section
        ref={trustRef}
        className="relative z-10 py-24 overflow-hidden border-t border-white/5"
      >
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(168, 85, 247, 0.2), transparent)' }}
        />

        <div className="max-w-5xl mx-auto px-6 lg:px-12">
          <div className="text-center mb-16">
            <h2
              className={`text-3xl md:text-4xl lg:text-5xl font-light mb-4 transition-all duration-1000 ${trustVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{ fontFamily: 'var(--font-serif), serif' }}
            >
              <span className="italic text-white">Trustless</span>
              <span className="text-[#A855F7]"> by Design</span>
            </h2>
            <p
              className={`text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed transition-all duration-1000 delay-200 ${trustVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            >
              Every execution verified on-chain with RISC Zero proofs. No trust assumptions beyond math.
            </p>
          </div>

          {/* Trust signal cards */}
          <div
            className={`grid md:grid-cols-3 gap-6 transition-all duration-700 ${trustVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            style={{ transitionDelay: '400ms' }}
          >
            {/* ZK Verified */}
            <div className="relative rounded-2xl border border-white/10 bg-[#12121a]/80 backdrop-blur-sm p-6 text-center group hover:border-[#A855F7]/30 transition-all duration-300">
              <div className="mb-4 flex justify-center">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(168, 85, 247, 0.1)', border: '1px solid rgba(168, 85, 247, 0.2)' }}
                >
                  {/* Shield check icon */}
                  <svg className="w-7 h-7 text-[#A855F7]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
              </div>
              <h3
                className="text-lg font-medium text-white mb-2"
                style={{ fontFamily: 'var(--font-serif), serif' }}
              >
                ZK-Verified Execution
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Every agent computation runs inside RISC Zero zkVM. Cryptographic proofs guarantee correctness.
              </p>
            </div>

            {/* Open Source */}
            <div className="relative rounded-2xl border border-white/10 bg-[#12121a]/80 backdrop-blur-sm p-6 text-center group hover:border-[#A855F7]/30 transition-all duration-300">
              <div className="mb-4 flex justify-center">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(168, 85, 247, 0.1)', border: '1px solid rgba(168, 85, 247, 0.2)' }}
                >
                  {/* Code bracket icon */}
                  <svg className="w-7 h-7 text-[#A855F7]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                  </svg>
                </div>
              </div>
              <h3
                className="text-lg font-medium text-white mb-2"
                style={{ fontFamily: 'var(--font-serif), serif' }}
              >
                Fully Open Source
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed mb-3">
                Contracts, SDK, CLI, and frontend -- all open source and auditable.
              </p>
              <a
                href="https://github.com/tokamak-network"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs text-[#C084FC] hover:text-white transition-colors font-mono"
              >
                {/* GitHub icon */}
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                View on GitHub
              </a>
            </div>

            {/* Chain Support */}
            <div className="relative rounded-2xl border border-white/10 bg-[#12121a]/80 backdrop-blur-sm p-6 text-center group hover:border-[#A855F7]/30 transition-all duration-300">
              <div className="mb-4 flex justify-center">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(168, 85, 247, 0.1)', border: '1px solid rgba(168, 85, 247, 0.2)' }}
                >
                  {/* Globe/chain icon */}
                  <svg className="w-7 h-7 text-[#A855F7]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                  </svg>
                </div>
              </div>
              <h3
                className="text-lg font-medium text-white mb-2"
                style={{ fontFamily: 'var(--font-serif), serif' }}
              >
                Multi-Chain Support
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed mb-3">
                Deploy and verify on Ethereum, Arbitrum, Optimism, and HyperEVM.
              </p>
              {/* Chain badges */}
              <div className="flex items-center justify-center gap-3">
                <span className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-mono text-gray-400">
                  Ethereum
                </span>
                <span className="inline-flex items-center rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-[10px] font-mono text-emerald-400">
                  Hyperliquid
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
