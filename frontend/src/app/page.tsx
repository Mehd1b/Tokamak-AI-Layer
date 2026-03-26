'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import AuroraBackground from '@/components/AuroraBackground';
import { StatCard } from '@/components/StatCard';
import { useDeployedVaultsList, type VaultInfo } from '@/hooks/useVaultFactory';
import { useAgentMetadata } from '@/hooks/useAgentMetadata';
import { formatEther } from '@/lib/utils';
import { protocolLabel, PROTOCOL_TYPE, type ProtocolType } from '@/lib/protocolTypes';

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
  const [topVaultsRef, topVaultsVisible] = useSectionVisible(0.15);
  const [howItWorksRef, howItWorksVisible] = useSectionVisible(0.15);

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
              fontFamily: 'var(--font-mono), monospace',
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
            style={{ transitionDelay: '600ms', fontFamily: 'var(--font-mono), monospace' }}
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

      {/* ═══════════════ 2. TOP PERFORMING VAULTS ═══════════════ */}
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
              style={{ fontFamily: 'var(--font-mono), monospace' }}
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
              style={{ fontFamily: 'var(--font-mono), monospace' }}
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
                style={{ fontFamily: 'var(--font-mono), monospace' }}
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
                style={{ fontFamily: 'var(--font-mono), monospace' }}
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
                style={{ fontFamily: 'var(--font-mono), monospace' }}
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

      {/* Trustless by Design */}
      <section className="relative z-10 flex flex-col items-center bg-[#0a0a0f]/50 backdrop-blur-xl border-t border-white/5 px-6 py-32 lg:px-12 overflow-hidden">
        <div className="text-center mb-16 max-w-3xl">
          <h2
            className="text-4xl md:text-5xl font-light mb-6"
            style={{ fontFamily: 'var(--font-mono), monospace' }}
          >
            <span className="italic">Trustless</span> by Design
          </h2>
          <p className="text-lg text-white/50 leading-relaxed">
            Every action is cryptographically verified. No trust assumptions beyond math.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full max-w-7xl">
          {/* Card 1 — Deploy Verifiable Agents */}
          <StatCard
            title="Deploy Verifiable Agents"
            description="Compile ML models to deterministic RISC-V, generate cryptographic commitments, and register on-chain in minutes."
          >
            <div className="w-full h-72 rounded-2xl border border-white/10 bg-[#0A0A0A] shadow-2xl overflow-hidden">
              {/* Terminal header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
                <span className="ml-2 text-[10px] font-mono text-white/30 uppercase tracking-wider">terminal</span>
              </div>
              {/* Terminal content */}
              <div className="p-3 font-mono text-xs leading-relaxed">
                <div className="flex items-center gap-2 text-white/50">
                  <span className="text-[#A855F7]">$</span>
                  <span>tal init my-agent --template yield</span>
                </div>
                <div className="mt-2 text-white/30">
                  <span className="text-green-400">&#10003;</span> Agent scaffolded successfully!
                </div>
                <div className="mt-2 flex items-center gap-2 text-white/50">
                  <span className="text-[#A855F7]">$</span>
                  <span>tal build --elf</span>
                </div>
                <div className="mt-1 text-white/30">
                  <span className="text-green-400">&#10003;</span> ELF binary built
                </div>
                <div className="mt-2 flex items-center gap-2 text-white/50">
                  <span className="text-[#A855F7]">$</span>
                  <span>tal deploy --testnet --hyperliquid</span>
                </div>
                <div className="mt-1 text-white/30">
                  <span className="text-green-400">&#10003;</span> Agent registered
                </div>
                <div className="mt-1 text-white/30">
                  <span className="text-green-400">&#10003;</span> Vault deployed
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[#A855F7]">&rarr;</span>
                  <span className="text-white/70">Vault:</span>
                  <span className="text-[#A855F7]">0x34E9...e2E4</span>
                </div>
              </div>
            </div>
          </StatCard>

          {/* Card 2 — Decentralized Execution (Featured) */}
          <StatCard
            title="Decentralized Execution"
            description="Executors run your agents off-chain and generate zero-knowledge proofs. No single point of failure."
            featured
          >
            <div className="group w-full h-80 rounded-2xl border border-white/10 bg-[#0A0A0A] shadow-2xl overflow-hidden relative flex items-center justify-center">
              {/* Animated beam SVG */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-0"
                viewBox="0 0 400 320"
                preserveAspectRatio="xMidYMid slice"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="beam-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="transparent"/>
                    <stop offset="50%" stopColor="rgba(168, 85, 247, 0.8)"/>
                    <stop offset="100%" stopColor="transparent"/>
                  </linearGradient>
                </defs>
                {/* Path 1 */}
                <path d="M420,40 C320,40 280,160 200,160" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1"/>
                <path d="M420,40 C320,40 280,160 200,160" fill="none" stroke="url(#beam-grad)" strokeWidth="1.5" strokeDasharray="100 1000" strokeLinecap="round">
                  <animate attributeName="stroke-dashoffset" from="1000" to="0" dur="3s" repeatCount="indefinite" />
                </path>
                {/* Path 2 */}
                <path d="M-20,280 C80,280 120,160 200,160" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1"/>
                <path d="M-20,280 C80,280 120,160 200,160" fill="none" stroke="url(#beam-grad)" strokeWidth="1.5" strokeDasharray="80 1000" strokeLinecap="round">
                  <animate attributeName="stroke-dashoffset" from="1000" to="0" dur="4s" repeatCount="indefinite" />
                </path>
              </svg>

              {/* Orbital Rings */}
              <div className="relative w-full h-full flex items-center justify-center">
                <div className="absolute w-72 h-72 rounded-full border border-[#A855F7]/5 animate-[ping_4s_cubic-bezier(0,0,0.2,1)_infinite] opacity-10" />
                <div className="absolute w-60 h-60 rounded-full border border-white/5 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite] opacity-20" style={{ animationDelay: '700ms' }} />
                <div className="absolute w-48 h-48 rounded-full border border-white/5 animate-[spin_40s_linear_infinite]" />
                <div className="absolute w-44 h-44 rounded-full border border-white/10 animate-[spin_30s_linear_infinite]" />
                <div className="absolute w-32 h-32 rounded-full border border-white/5 border-dashed animate-[spin_20s_linear_infinite_reverse]" />
                {/* Center Hub */}
                <div className="z-10 flex bg-[#0a0a0f] w-20 h-20 border-white/10 border rounded-3xl relative items-center justify-center overflow-hidden shadow-2xl group-hover:border-[#A855F7]/40 transition-colors duration-500">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-white relative z-20 group-hover:text-[#A855F7] transition-colors duration-500" aria-hidden="true">
                    <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/>
                    <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/>
                    <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>
                  </svg>
                  <div className="animate-[pulse_2s_infinite] bg-gradient-to-tr from-transparent via-[#A855F7]/10 to-transparent absolute inset-0 z-10" />
                </div>
              </div>

              {/* Status Badge */}
              <div className="absolute bottom-4 flex items-center">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#A855F7] opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#A855F7]" />
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-white/50">Network Active</span>
                </div>
              </div>
            </div>
          </StatCard>

          {/* Card 3 — On-Chain Verification */}
          <StatCard
            title="On-Chain Verification"
            description="Proofs are verified on Ethereum for ~250k gas. Only valid, constraint-compliant actions settle."
          >
            <div className="w-full h-72 rounded-2xl border border-white/10 bg-[#0A0A0A] shadow-2xl overflow-hidden relative flex flex-col items-center justify-center p-6">
              {/* ZK Proof hexagon visualization */}
              <div className="relative mb-6">
                <svg viewBox="0 0 100 100" className="w-24 h-24" aria-hidden="true">
                  <defs>
                    <linearGradient id="proof-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#A855F7" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#A855F7" stopOpacity="0.2" />
                    </linearGradient>
                  </defs>
                  <polygon
                    points="50,5 90,25 90,75 50,95 10,75 10,25"
                    fill="none"
                    stroke="url(#proof-gradient)"
                    strokeWidth="2"
                  />
                  <polygon
                    points="50,20 75,35 75,65 50,80 25,65 25,35"
                    fill="none"
                    stroke="#A855F7"
                    strokeWidth="1"
                    opacity="0.5"
                  />
                  <circle cx="50" cy="50" r="8" fill="#A855F7" className="animate-[pulse_2s_infinite]" />
                </svg>
              </div>

              {/* Status badge */}
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/5">
                <div className="relative">
                  <div className="absolute h-2 w-2 rounded-full bg-green-400 animate-ping opacity-75" />
                  <div className="h-2 w-2 rounded-full bg-green-400" />
                </div>
                <span className="text-[10px] font-mono text-white/70 uppercase tracking-wider">Verified</span>
              </div>

              {/* Proof details */}
              <div className="mt-4 text-center">
                <div className="text-[10px] font-mono text-white/30 uppercase tracking-wider mb-1">Groth16 Proof</div>
                <div className="text-sm font-mono text-[#A855F7]">~200 bytes</div>
              </div>
            </div>
          </StatCard>
        </div>
      </section>

      {/* Partnered with — auto-scrolling marquee (right to left → items move left to right visually) */}
      <style>{`
        @keyframes marquee-scroll-rtl {
          from { transform: translateX(-50%); }
          to { transform: translateX(0); }
        }
      `}</style>
      <section className="relative z-10 py-16 border-t border-white/5 overflow-hidden">
        <p className="text-center text-[10px] font-mono uppercase tracking-[0.3em] text-gray-600 mb-8">
          Partnered with
        </p>
        {/* Gradient masks */}
        <div className="absolute left-0 top-0 bottom-0 w-24 z-10 bg-gradient-to-r from-[#0a0a0f] to-transparent pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-24 z-10 bg-gradient-to-l from-[#0a0a0f] to-transparent pointer-events-none" />
        {/* Scrolling track */}
        <div
          className="flex whitespace-nowrap items-center"
          style={{ animation: 'marquee-scroll-rtl 40s linear infinite' }}
        >
          {[
            { src: '/partner-chainlink.svg', alt: 'Chainlink' },
            { src: '/partner-sky.svg', alt: 'SKY' },
            { src: '/partner-dsrv.svg', alt: 'DSRV' },
            { src: '/partner-efg.svg', alt: 'EFG' },
            { src: '/partner-kdac.svg', alt: 'KDAC' },
            { src: '/partner-ozys.svg', alt: 'Ozys' },
            { src: '/partner-chainlink.svg', alt: 'Chainlink' },
            { src: '/partner-sky.svg', alt: 'SKY' },
            { src: '/partner-dsrv.svg', alt: 'DSRV' },
            { src: '/partner-efg.svg', alt: 'EFG' },
            { src: '/partner-kdac.svg', alt: 'KDAC' },
            { src: '/partner-ozys.svg', alt: 'Ozys' },
          ].map((partner, i) => (
            <div
              key={i}
              className="inline-flex items-center justify-center mx-8 shrink-0 opacity-40 hover:opacity-80 transition-opacity duration-300"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={partner.src} alt={partner.alt} className="h-8 w-auto" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
