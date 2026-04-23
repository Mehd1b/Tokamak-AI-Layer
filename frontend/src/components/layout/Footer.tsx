'use client';

import Link from 'next/link';
import { useBlockNumber } from 'wagmi';
import { DiamondLogo } from '@/components/icons/Logo';
import { useNetwork } from '@/lib/NetworkContext';

type FooterLink = { label: string; href: string; external?: boolean };

const PROTOCOL_LINKS: FooterLink[] = [
  { label: 'Vaults', href: '/vaults' },
  { label: 'Deploy', href: '/deploy' },
  { label: 'Marketplace', href: '/marketplace' },
  { label: 'Staking', href: '/staking' },
];

const BUILD_LINKS: FooterLink[] = [
  { label: 'Developers', href: '/developers' },
  { label: 'SDK', href: 'https://docs.tokagent.network', external: true },
  { label: 'Whitepaper', href: '/whitepaper' },
  { label: 'GitHub', href: 'https://github.com/tokamak-network', external: true },
];

const PROGRAM_LINKS: FooterLink[] = [
  { label: 'Points', href: '/points' },
  { label: 'Referrals', href: '/referrals' },
  { label: 'Leaderboard', href: '/leaderboard' },
  { label: 'Institutional', href: '/institutional' },
];

const COMPANY_LINKS: FooterLink[] = [
  { label: 'X', href: 'https://x.com/tokagent', external: true },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/tokamaknetwork/', external: true },
  { label: 'YouTube', href: 'https://www.youtube.com/@tokagent', external: true },
  { label: 'Press', href: 'mailto:press@tokamak.network', external: true },
];

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div>
      <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-[rgba(233,234,236,0.38)]">
        {title}
      </div>
      <ul className="mt-4 space-y-2">
        {links.map((l) => (
          <li key={l.label}>
            {l.external ? (
              <a
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] text-[rgba(233,234,236,0.58)] transition-colors hover:text-[#c4f547]"
              >
                {l.label}
              </a>
            ) : (
              <Link
                href={l.href}
                className="text-[13px] text-[rgba(233,234,236,0.58)] transition-colors hover:text-[#c4f547]"
              >
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  const { selectedChainId } = useNetwork();
  const { data: blockNumber } = useBlockNumber({ chainId: selectedChainId, watch: true });
  const blockLabel = blockNumber
    ? `Ethereum block ${blockNumber.toString()} · latency 1.2s`
    : 'Ethereum block 22,408,112 · latency 1.2s';

  return (
    <footer
      className="relative border-t bg-[#0b0d10]"
      style={{ borderColor: 'rgba(255,255,255,0.07)' }}
    >
      <div className="mx-auto max-w-[1280px] px-10 py-16">
        <div className="grid gap-10 md:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
          <div className="max-w-[260px]">
            <div className="flex items-center gap-3">
              <DiamondLogo className="h-7 w-7" />
              <span
                className="text-[15px] font-medium tracking-wide text-[#e9eaec]"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                tokagent
              </span>
            </div>
            <p className="mt-4 text-[13px] leading-[1.6] text-[rgba(233,234,236,0.58)]">
              Autonomous AI vaults on Ethereum, with every action backed by a zero-knowledge proof.
            </p>
          </div>
          <FooterColumn title="Protocol" links={PROTOCOL_LINKS} />
          <FooterColumn title="Build" links={BUILD_LINKS} />
          <FooterColumn title="Program" links={PROGRAM_LINKS} />
          <FooterColumn title="Company" links={COMPANY_LINKS} />
        </div>

        <div
          className="mt-12 flex flex-col items-start justify-between gap-2 border-t pt-6 md:flex-row md:items-center"
          style={{ borderColor: 'rgba(255,255,255,0.04)' }}
        >
          <span className="text-[12px] text-[rgba(233,234,236,0.38)]">
            © {new Date().getFullYear()} Tokagent · Tokamak Network
          </span>
          <span className="font-mono text-[11px] text-[rgba(233,234,236,0.38)]">{blockLabel}</span>
        </div>
      </div>
    </footer>
  );
}
