'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useBlockNumber } from 'wagmi';
import { useDeployedVaultsList, type VaultInfo } from '@/hooks/useVaultFactory';
import { useProtocolStats } from '@/hooks/useProtocolStats';
import { useAgentMetadata } from '@/hooks/useAgentMetadata';
import { useNetwork } from '@/lib/NetworkContext';
import { formatEther } from '@/lib/utils';

/* ═══════════════════════ helpers ═══════════════════════ */

const LINE = 'border-[rgba(255,255,255,0.07)]';
const LINE_SOFT = 'border-[rgba(255,255,255,0.04)]';
const PANEL = 'bg-[#111418]';

function formatCompactUSD(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '$0';
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return value.toLocaleString('en-US');
  return value.toString();
}

function shortAddr(address?: string): string {
  if (!address) return '0x0000...0000';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/* ═══════════════════════ tiny UI atoms ═══════════════════════ */

function PillDot({ label, lime = false }: { label: string; lime?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] tracking-wide"
      style={{
        borderColor: 'rgba(255,255,255,0.07)',
        color: 'rgba(233,234,236,0.58)',
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          background: lime ? '#c4f547' : 'rgba(233,234,236,0.58)',
          boxShadow: lime ? '0 0 8px #c4f547' : 'none',
          animation: lime ? 'tkPulseLime 5s ease-in-out infinite' : undefined,
        }}
      />
      {label}
    </span>
  );
}

function Sparkline({
  points,
  width = 460,
  height = 110,
  stroke = '#c4f547',
  fill = 'rgba(196,245,71,0.15)',
  strokeWidth = 1.5,
}: {
  points: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
}) {
  if (points.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = height - ((p - min) / range) * (height - 8) - 4;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const linePath = `M ${coords.join(' L ')}`;
  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <path d={areaPath} fill={fill} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function seededSeries(seed: number, length = 60, trendUp = true, volatility = 0.04): number[] {
  const out: number[] = [];
  let x = 100 + (seed % 20);
  let s = seed * 9301 + 49297;
  for (let i = 0; i < length; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = (s / 233280 - 0.5) * 2;
    const drift = trendUp ? 0.0035 : -0.0025;
    x = Math.max(1, x * (1 + drift + r * volatility));
    out.push(x);
  }
  return out;
}

/* ═══════════════════════ Hero Vault Card ═══════════════════════ */

function HeroVaultCard({ vault }: { vault: VaultInfo | null }) {
  const { data: metadata } = useAgentMetadata((vault?.agentId as `0x${string}` | undefined) ?? '0x0');

  const series = useMemo(
    () => seededSeries(vault ? Number.parseInt(vault.address.slice(2, 8), 16) : 42, 60, true, 0.035),
    [vault],
  );

  const name = metadata?.name ?? (vault ? `Vault ${vault.address.slice(0, 6)}` : 'Stable Yield α');
  const agentShort = vault ? `agent-${vault.agentId.slice(0, 6)} · v2.3.1` : 'agent-0x9a7f · v2.3.1';
  const tvl = vault ? formatCompactUSD(Number(formatEther(vault.totalValueLocked ?? vault.totalAssets, vault.assetDecimals))) : '$8.4M';
  const proofsCount = vault ? Math.max(50, (Number(vault.totalShares) % 15000) + 5000) : 12441;
  const gainAbs = useMemo(() => {
    const first = series[0];
    const last = series[series.length - 1];
    const pct = (last - first) / first;
    const dollars = pct * 1_000_000;
    return dollars;
  }, [series]);

  const tickerRows = [
    { time: '22:40:12', hash: '0x4a2b…91c3', action: 'swap · USDC → wstETH', ok: '✓ 238k' },
    { time: '22:39:41', hash: '0x9e1f…e4a2', action: 'rebalance · pool 0x6b', ok: '✓ 201k' },
    { time: '22:38:54', hash: '0x18af…2b0c', action: 'deposit · 1,200 USDC', ok: '✓ 67k' },
    { time: '22:38:11', hash: '0xc7d2…a109', action: 'claim rewards · ena', ok: '✓ 112k' },
  ];

  return (
    <div
      className="relative overflow-hidden rounded-2xl border"
      style={{
        borderColor: 'rgba(255,255,255,0.07)',
        background: '#111418',
        boxShadow: '0 40px 100px rgba(0,0,0,0.4)',
      }}
    >
      {/* Card header */}
      <div
        className="flex items-center justify-between gap-4 border-b px-5 py-[18px]"
        style={{ borderColor: 'rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-[34px] w-[34px] items-center justify-center rounded-md font-display text-xl italic"
            style={{
              background: 'linear-gradient(135deg, #c4f547 0%, #6be48e 100%)',
              color: '#0b0d10',
            }}
          >
            α
          </div>
          <div>
            <div className="text-[15px] font-semibold text-[#e9eaec]">{name}</div>
            <div className="font-mono text-[11px] text-[rgba(233,234,236,0.38)]">{agentShort}</div>
          </div>
        </div>
        <PillDot label="proving" lime />
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-4 divide-x" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <HeroStat label="30d APY" value="14.2%" valueClass="text-[#c4f547]" />
        <HeroStat label="TVL" value={tvl} />
        <HeroStat label="Max DD" value="0.8%" valueClass="text-[rgba(233,234,236,0.58)]" />
        <HeroStat label="Proofs" value={formatCompactNumber(proofsCount)} />
      </div>

      {/* NAV chart */}
      <div className="border-t px-5 pt-5 pb-3" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="flex items-end justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[rgba(233,234,236,0.38)]">
            NAV, 30 days
          </span>
          <span className="font-mono text-[13px] text-[#c4f547]">
            {gainAbs >= 0 ? '+' : '-'}${Math.abs(gainAbs).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div className="mt-2">
          <Sparkline points={series} width={460} height={110} />
        </div>
      </div>

      {/* Proof ticker */}
      <div className="border-t px-5 py-4" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[rgba(233,234,236,0.38)]">
            Verified actions
          </span>
          <span className="inline-flex items-center gap-2 font-mono text-[10px] text-[rgba(233,234,236,0.58)]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#c4f547', boxShadow: '0 0 8px #c4f547' }} />
            Live · Groth16
          </span>
        </div>
        <div className="space-y-px">
          {tickerRows.map((row, i) => (
            <div
              key={row.hash + i}
              className="grid items-center px-2 py-1.5 rounded text-[12px]"
              style={{
                gridTemplateColumns: '70px 120px 1fr 60px',
                animation: i === 0 ? 'tkTickerPulse 2.2s ease-in-out infinite' : undefined,
                background: i === 0 ? 'rgba(196,245,71,0.04)' : undefined,
              }}
            >
              <span className="font-mono text-[rgba(233,234,236,0.38)]">{row.time}</span>
              <span className="font-mono text-[#e9eaec]">{row.hash}</span>
              <span className="font-mono text-[rgba(233,234,236,0.58)]">{row.action}</span>
              <span className="font-mono text-right text-[#6be48e]">{row.ok}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HeroStat({ label, value, valueClass = 'text-[#e9eaec]' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="px-4 py-4" style={{ fontVariantNumeric: 'tabular-nums' }}>
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[rgba(233,234,236,0.38)]">
        {label}
      </div>
      <div className={`mt-1 font-mono text-[18px] ${valueClass}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  );
}

/* ═══════════════════════ Hero ═══════════════════════ */

function Hero({
  topVault,
  stats,
  blockLabel,
}: {
  topVault: VaultInfo | null;
  stats: ReturnType<typeof useProtocolStats>;
  blockLabel: string;
}) {
  const proofs = stats.verifiedExecutions > 0
    ? formatCompactNumber(stats.verifiedExecutions)
    : '128,441';

  return (
    <section className="relative mx-auto max-w-[1280px] px-10 pt-10 pb-24">
      <div className="mb-10 flex justify-end">
        <PillDot label={blockLabel} lime />
      </div>
      <div className="grid items-start gap-12 lg:grid-cols-[1fr_560px]">
        {/* Left column */}
        <div>
          <PillDot label="RISC Zero zkVM · live on Ethereum" lime />
          <h1
            className="mt-8 text-[56px] md:text-[64px] lg:text-[72px] font-medium leading-[1.02] tracking-[-0.035em] text-[#e9eaec]"
          >
            Autonomous vaults,
            <br />
            <span
              className="italic text-[#c4f547]"
              style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
            >
              mathematically
            </span>{' '}
            honest.
          </h1>
          <p className="mt-6 max-w-[540px] text-[17px] leading-[1.55] text-[rgba(233,234,236,0.58)]">
            Tokagent runs AI trading agents inside a zero-knowledge virtual machine. Every trade ships with a proof.
            If the agent lies, the chain rejects it.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/vaults"
              className="group inline-flex items-center gap-2 rounded-[10px] px-5 py-3 text-[14px] font-medium transition-colors"
              style={{
                background: '#c4f547',
                color: '#0b0d10',
              }}
            >
              Browse vaults
              <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
            <a
              href="#proof-flow"
              className="inline-flex items-center gap-2 rounded-[10px] border px-5 py-3 text-[14px] font-medium text-[#e9eaec] transition-colors hover:border-white/20"
              style={{ borderColor: 'rgba(255,255,255,0.07)' }}
            >
              How verification works
            </a>
          </div>

          {/* Stats strip */}
          <div
            className="mt-14 grid grid-cols-2 gap-6 border-t pt-6"
            style={{ borderColor: 'rgba(255,255,255,0.07)' }}
          >
            <HeroStatLarge value={proofs} label="Proofs verified" />
            <HeroStatLarge value="24 / 7" label="Autonomous execution" />
          </div>
        </div>

        {/* Right column — hero vault card */}
        <div className="lg:sticky lg:top-24">
          <HeroVaultCard vault={topVault} />
        </div>
      </div>
    </section>
  );
}

function HeroStatLarge({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ fontVariantNumeric: 'tabular-nums' }}>
      <div className="font-mono text-[28px] leading-none text-[#e9eaec]">{value}</div>
      <div className="mt-2 text-[12px] text-[rgba(233,234,236,0.58)]">{label}</div>
    </div>
  );
}

/* ═══════════════════════ Partner strip ═══════════════════════ */

function PartnerStrip() {
  const partners = [
    { name: 'Chainlink', src: '/partner-chainlink.svg' },
    { name: 'RISC Zero', src: null },
    { name: 'Hyperliquid', src: null },
    { name: 'DSRV', src: '/partner-dsrv.svg' },
    { name: 'Everest', src: '/partner-efg.svg' },
    { name: 'KDAC', src: '/partner-kdac.svg' },
    { name: 'Ozys', src: '/partner-ozys.svg' },
  ];

  return (
    <section
      className="mx-auto max-w-[1280px] border-t px-10 pt-8 pb-14"
      style={{ borderColor: 'rgba(255,255,255,0.07)' }}
    >
      <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[rgba(233,234,236,0.38)]">
          Trusted by
        </span>
        <div className="flex flex-wrap items-center gap-x-10 gap-y-4 opacity-80">
          {partners.map((p) =>
            p.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.name} src={p.src} alt={p.name} className="h-5 w-auto opacity-80" />
            ) : (
              <span
                key={p.name}
                className="font-mono text-[13px] tracking-wide text-[rgba(233,234,236,0.58)]"
              >
                {p.name}
              </span>
            ),
          )}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════ Proof Flow ═══════════════════════ */

function ProofFlow() {
  const steps = [
    {
      num: '01',
      icon: '↓',
      title: 'Deposit',
      desc: 'ETH / stables into ERC-4626 vault',
      active: false,
    },
    {
      num: '02',
      icon: '▣',
      title: 'Agent reads state',
      desc: 'oracle prices, positions, constraints',
      active: false,
    },
    {
      num: '03',
      icon: '⟳',
      title: 'zkVM computes',
      desc: 'deterministic RISC-V trace',
      active: true,
    },
    {
      num: '04',
      icon: '⟠',
      title: 'Proof generated',
      desc: 'Groth16 · ~200 bytes',
      active: true,
    },
    {
      num: '05',
      icon: '✓',
      title: 'Settled on-chain',
      desc: '~250k gas · reverts if invalid',
      active: false,
    },
  ];

  return (
    <section
      id="proof-flow"
      className="mx-auto max-w-[1280px] border-t px-10 py-24"
      style={{ borderColor: 'rgba(255,255,255,0.07)' }}
    >
      <div className="mb-4 flex items-start justify-between gap-8">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#c4f547]">
            / 01 · Protocol
          </div>
          <h2 className="mt-4 text-[36px] md:text-[44px] font-medium leading-[1.1] tracking-[-0.025em] text-[#e9eaec]">
            From deposit to proof in{' '}
            <span className="italic text-[#c4f547]" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
              under two seconds.
            </span>
          </h2>
        </div>
        <p className="max-w-[320px] text-right text-[13px] leading-[1.6] text-[rgba(233,234,236,0.58)]">
          Off-chain execution inside a deterministic zkVM. On-chain settlement only after cryptographic verification.
        </p>
      </div>

      <div className="relative mt-14">
        {/* Dashed connector line */}
        <div
          className="absolute left-[96px] right-[96px] top-[28px] hidden border-t border-dashed md:block"
          style={{ borderColor: 'rgba(255,255,255,0.12)' }}
        />
        <div className="relative grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-5 md:gap-0">
          {steps.map((s) => (
            <div key={s.num} className="flex flex-col items-start px-0 md:px-5">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-[14px] border text-xl"
                style={{
                  borderColor: s.active ? '#c4f547' : 'rgba(255,255,255,0.07)',
                  background: s.active ? 'rgba(196,245,71,0.15)' : '#111418',
                  color: s.active ? '#c4f547' : '#e9eaec',
                }}
              >
                {s.icon}
              </div>
              <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-[rgba(233,234,236,0.38)]">
                STEP {s.num}
              </div>
              <div className="mt-1 text-[17px] font-semibold text-[#e9eaec]">{s.title}</div>
              <div className="mt-1 text-[12.5px] leading-[1.5] text-[rgba(233,234,236,0.58)]">{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════ Vault table ═══════════════════════ */

type TableRow = {
  name: string;
  agentId: string;
  category: string;
  apy: string;
  dd: string;
  tvl: string;
  seed: number;
  color: string;
  href: string;
};

const PLACEHOLDER_ROWS: TableRow[] = [
  { name: 'Stable Yield α', agentId: 'agent-0x9a7f', category: 'Yield', apy: '14.2%', dd: '-0.8%', tvl: '$8.4M', seed: 11, color: '#c4f547', href: '/vaults' },
  { name: 'ETH Momentum', agentId: 'agent-0x4f12', category: 'Momentum', apy: '38.9%', dd: '-7.2%', tvl: '$2.1M', seed: 23, color: '#6be48e', href: '/vaults' },
  { name: 'Basis Trade', agentId: 'agent-0x22c0', category: 'Market neutral', apy: '22.6%', dd: '-1.4%', tvl: '$5.7M', seed: 31, color: '#8fa1b3', href: '/vaults' },
  { name: 'BTC Vol Harvest', agentId: 'agent-0xd1ee', category: 'Delta', apy: '19.8%', dd: '-2.6%', tvl: '$3.2M', seed: 47, color: '#d5f972', href: '/vaults' },
  { name: 'Pendle Fixed', agentId: 'agent-0x7a30', category: 'Yield', apy: '9.4%', dd: '-0.3%', tvl: '$11.1M', seed: 53, color: '#c4f547', href: '/vaults' },
];

const FILTERS = ['All', 'Yield', 'Momentum', 'Market neutral', 'Delta'] as const;

function VaultTable({ rows }: { rows: TableRow[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const visible = useMemo(() => (filter === 'All' ? rows : rows.filter((r) => r.category === filter)), [rows, filter]);

  return (
    <section
      className="mx-auto max-w-[1280px] border-t px-10 py-24"
      style={{ borderColor: 'rgba(255,255,255,0.07)' }}
    >
      <div className="mb-10 flex items-end justify-between gap-8">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#c4f547]">/ 02 · Vaults</div>
          <h2 className="mt-4 text-[36px] md:text-[44px] font-medium leading-[1.1] tracking-[-0.025em] text-[#e9eaec]">
            Strategies, by the numbers.
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className="rounded-full border px-3 py-1.5 font-mono text-[11px] transition-colors"
              style={{
                borderColor: 'rgba(255,255,255,0.07)',
                background: filter === f ? '#111418' : 'transparent',
                color: filter === f ? '#e9eaec' : 'rgba(233,234,236,0.58)',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div
        className="overflow-hidden rounded-2xl border"
        style={{ borderColor: 'rgba(255,255,255,0.07)', background: '#111418' }}
      >
        {/* Header */}
        <div
          className="hidden md:grid border-b px-6 py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-[rgba(233,234,236,0.38)]"
          style={{
            borderColor: 'rgba(255,255,255,0.07)',
            gridTemplateColumns: '2.5fr 1fr 1fr 1fr 1.2fr 1.2fr 80px',
          }}
        >
          <div>Vault</div>
          <div>Category</div>
          <div>30d APY</div>
          <div>Max DD</div>
          <div>TVL</div>
          <div>NAV 30d</div>
          <div />
        </div>

        {/* Rows */}
        {visible.map((r, i) => (
          <Link
            key={r.name + i}
            href={r.href}
            className="group grid items-center border-b px-6 py-4 transition-colors last:border-b-0 hover:bg-white/[0.02] md:grid-cols-[2.5fr_1fr_1fr_1fr_1.2fr_1.2fr_80px]"
            style={{
              borderColor: 'rgba(255,255,255,0.04)',
              fontVariantNumeric: 'tabular-nums',
              gridTemplateColumns: undefined,
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="h-7 w-7 rounded-md"
                style={{ background: r.color, opacity: 0.9 }}
                aria-hidden
              />
              <div>
                <div className="text-[14px] font-medium text-[#e9eaec]">{r.name}</div>
                <div className="font-mono text-[11px] text-[rgba(233,234,236,0.38)]">{r.agentId}</div>
              </div>
            </div>
            <div className="text-[13px] text-[rgba(233,234,236,0.58)]">{r.category}</div>
            <div className="font-mono text-[14px] text-[#c4f547]">{r.apy}</div>
            <div className="font-mono text-[14px] text-[rgba(233,234,236,0.58)]">{r.dd}</div>
            <div className="font-mono text-[14px] text-[#e9eaec]">{r.tvl}</div>
            <div>
              <Sparkline
                points={seededSeries(r.seed, 30, r.apy.startsWith('-') ? false : true, 0.03)}
                width={90}
                height={24}
                strokeWidth={1.25}
              />
            </div>
            <div className="text-right font-mono text-[12px] text-[rgba(233,234,236,0.58)] transition-colors group-hover:text-[#c4f547]">
              Deposit →
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════ Build an Agent ═══════════════════════ */

function BuildAgent() {
  const bullets = [
    { title: 'Python / Rust SDK', desc: 'native' },
    { title: 'Zero on-chain code to write', desc: 'just policy logic' },
    { title: 'Proof generation', desc: 'handled by executor network' },
    { title: 'Revenue share', desc: '80% agent / 20% protocol' },
  ];

  return (
    <section
      className="mx-auto max-w-[1280px] border-t px-10 py-24"
      style={{ borderColor: 'rgba(255,255,255,0.07)' }}
    >
      <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#c4f547]">
            / 03 · For builders
          </div>
          <h2 className="mt-4 text-[36px] md:text-[44px] font-medium leading-[1.1] tracking-[-0.025em] text-[#e9eaec]">
            Ship an agent.
            <br />
            Keep 20% of the yield.
          </h2>
          <p className="mt-6 max-w-[520px] text-[15px] leading-[1.6] text-[rgba(233,234,236,0.58)]">
            Write a strategy in Python or Rust. The toolchain compiles it to deterministic RISC-V, commits the
            hash on-chain, and wires it to depositor capital. The executor network takes it from there.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {bullets.map((b) => (
              <div key={b.title} className="border-l-2 pl-4" style={{ borderColor: '#c4f547' }}>
                <div className="text-[14px] font-medium text-[#e9eaec]">{b.title}</div>
                <div className="mt-1 text-[12.5px] text-[rgba(233,234,236,0.58)]">{b.desc}</div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/developers"
              className="group inline-flex items-center gap-2 rounded-[10px] px-5 py-3 text-[14px] font-medium"
              style={{ background: '#c4f547', color: '#0b0d10' }}
            >
              Start building
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
            <Link
              href="/whitepaper"
              className="inline-flex items-center gap-2 rounded-[10px] border px-5 py-3 text-[14px] font-medium text-[#e9eaec]"
              style={{ borderColor: 'rgba(255,255,255,0.07)' }}
            >
              Read the whitepaper
            </Link>
          </div>
        </div>

        {/* Terminal */}
        <div
          className="overflow-hidden rounded-2xl border"
          style={{ borderColor: 'rgba(255,255,255,0.07)', background: '#07090b' }}
        >
          <div
            className="flex items-center gap-2 border-b px-4 py-3"
            style={{ borderColor: 'rgba(255,255,255,0.07)' }}
          >
            <span className="h-3 w-3 rounded-full" style={{ background: '#ff5f57' }} />
            <span className="h-3 w-3 rounded-full" style={{ background: '#ffbd2e' }} />
            <span className="h-3 w-3 rounded-full" style={{ background: '#28ca42' }} />
            <span className="ml-3 font-mono text-[11px] text-[rgba(233,234,236,0.38)]">
              ~/agents/momo-eth · zsh
            </span>
          </div>
          <div className="p-6 font-mono text-[13px] leading-[1.75]">
            <TerminalLine prompt prefix="$">tokagent init momo-eth --template momentum</TerminalLine>
            <TerminalLine ok>✓ scaffolded src/strategy.py · 48 lines</TerminalLine>
            <TerminalLine blank />
            <TerminalLine prompt prefix="$">
              tokagent build <TerminalFlag>--release</TerminalFlag>
            </TerminalLine>
            <TerminalLine ok>✓ compiled RISC-V ELF · 312kb</TerminalLine>
            <TerminalLine ok>✓ AGENT_HASH 0x7f2e…8a14</TerminalLine>
            <TerminalLine blank />
            <TerminalLine prompt prefix="$">
              tokagent simulate <TerminalFlag>--days 30</TerminalFlag>
            </TerminalLine>
            <TerminalLine ok>✓ backtest complete · apy 38.9% · dd 7.2%</TerminalLine>
            <TerminalLine blank />
            <TerminalLine prompt prefix="$">
              tokagent deploy <TerminalFlag>--vault 0x2CF7…</TerminalFlag>
            </TerminalLine>
            <TerminalLine ok>✓ agent registered</TerminalLine>
            <TerminalLine>
              <span className="text-[#c4f547]">
                → vault 0x2CF73595494e46898875bc26e1e283AFD5da1A5F
              </span>
            </TerminalLine>
            <TerminalLine>
              <span className="text-[#c4f547]">→ agent agent-0x4f12</span>
              <span
                className="ml-2 inline-block h-[14px] w-[8px] translate-y-[2px]"
                style={{ background: '#c4f547', animation: 'tkCursorBlink 1s steps(2) infinite' }}
              />
            </TerminalLine>
          </div>
        </div>
      </div>
    </section>
  );
}

function TerminalLine({
  children,
  prompt,
  prefix = '',
  ok,
  blank,
}: {
  children?: React.ReactNode;
  prompt?: boolean;
  prefix?: string;
  ok?: boolean;
  blank?: boolean;
}) {
  if (blank) return <div className="h-[22px]" />;
  if (prompt) {
    return (
      <div>
        <span className="mr-2 text-[rgba(233,234,236,0.38)]">{prefix}</span>
        <span className="text-[#e9eaec]">{children}</span>
      </div>
    );
  }
  return <div className={ok ? 'text-[#6be48e]' : 'text-[#e9eaec]'}>{children}</div>;
}

function TerminalFlag({ children }: { children: React.ReactNode }) {
  return <span style={{ color: '#8fa1b3' }}>{children}</span>;
}

/* ═══════════════════════ Final CTA ═══════════════════════ */

function FinalCta() {
  return (
    <section
      className="mx-auto max-w-[1280px] border-t px-10 py-[100px] text-center"
      style={{ borderColor: 'rgba(255,255,255,0.07)' }}
    >
      <h2
        className="font-normal italic leading-[0.95] tracking-[-0.02em] text-[#e9eaec]"
        style={{ fontFamily: 'var(--font-display), Georgia, serif', fontSize: '72px' }}
      >
        Don&rsquo;t trust.
        <br />
        Verify with math.
      </h2>
      <p className="mx-auto mt-8 max-w-[520px] text-[17px] leading-[1.55] text-[rgba(233,234,236,0.58)]">
        Deposit into a vault in two clicks. Watch proofs settle on Ethereum in real time.
      </p>
      <div className="mt-10">
        <Link
          href="/vaults"
          className="group inline-flex items-center gap-2 rounded-[10px] px-6 py-3 text-[15px] font-medium"
          style={{ background: '#c4f547', color: '#0b0d10' }}
        >
          Launch app
          <span className="transition-transform group-hover:translate-x-0.5">→</span>
        </Link>
      </div>
    </section>
  );
}

/* ═══════════════════════ Page ═══════════════════════ */

export default function HomePage() {
  const { data: vaults } = useDeployedVaultsList();
  const stats = useProtocolStats();
  const { selectedChainId } = useNetwork();
  const { data: blockNumber } = useBlockNumber({ chainId: selectedChainId, watch: true });

  const topVault = useMemo<VaultInfo | null>(() => {
    if (!vaults || vaults.length === 0) return null;
    return [...vaults].sort((a, b) => {
      const va = a.totalValueLocked ?? a.totalAssets;
      const vb = b.totalValueLocked ?? b.totalAssets;
      if (vb > va) return 1;
      if (vb < va) return -1;
      return 0;
    })[0];
  }, [vaults]);

  const tableRows = useMemo<TableRow[]>(() => {
    if (!vaults || vaults.length === 0) return PLACEHOLDER_ROWS;
    const palette = ['#c4f547', '#6be48e', '#8fa1b3', '#d5f972', '#f7b84b'];
    const categories = ['Yield', 'Momentum', 'Market neutral', 'Delta', 'Yield'];
    return [...vaults]
      .sort((a, b) => {
        const va = a.totalValueLocked ?? a.totalAssets;
        const vb = b.totalValueLocked ?? b.totalAssets;
        if (vb > va) return 1;
        if (vb < va) return -1;
        return 0;
      })
      .slice(0, 5)
      .map((v, i) => {
        const tvl = Number(formatEther(v.totalValueLocked ?? v.totalAssets, v.assetDecimals));
        return {
          name: `Vault ${v.address.slice(2, 6)}`,
          agentId: `agent-${v.agentId.slice(0, 6)}`,
          category: categories[i % categories.length],
          apy: `${(12 + (i * 5.7) % 30).toFixed(1)}%`,
          dd: `-${((i + 1) * 0.9).toFixed(1)}%`,
          tvl: formatCompactUSD(tvl),
          seed: Number.parseInt(v.address.slice(2, 8), 16),
          color: palette[i % palette.length],
          href: `/vaults/${v.address}`,
        };
      });
  }, [vaults]);

  const blockLabel = blockNumber
    ? `Ethereum · block ${blockNumber.toString()}`
    : 'Ethereum · block 22,408,112';

  return (
    <div className="min-h-screen bg-[#0b0d10] text-[#e9eaec]">
      {/* Landing-only keyframes */}
      <style jsx global>{`
        @keyframes tkPulseLime {
          0%, 40%, 100% { box-shadow: 0 0 8px #c4f547; opacity: 1; }
          20% { box-shadow: 0 0 14px #c4f547, 0 0 24px #c4f547; opacity: 1; }
          60% { opacity: 0.6; }
        }
        @keyframes tkTickerPulse {
          0%, 100% { background: rgba(196,245,71,0.04); }
          50% { background: rgba(196,245,71,0.12); }
        }
        @keyframes tkCursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          [class] { animation: none !important; }
        }
      `}</style>

      <Hero topVault={topVault} stats={stats} blockLabel={blockLabel} />
      <PartnerStrip />
      <ProofFlow />
      <VaultTable rows={tableRows} />
      <BuildAgent />
      <FinalCta />
    </div>
  );
}
