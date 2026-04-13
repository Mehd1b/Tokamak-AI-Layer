import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Developers',
  description:
    'Build verifiable DeFi agents with the Tokagent Execution Kernel. Write strategy logic in Rust, generate ZK proofs, and deploy on-chain vaults.',
};

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const FEATURES = [
  {
    title: 'Verifiable Execution',
    description:
      'Every agent run produces a Groth16 proof covering input parsing, strategy logic, and constraint enforcement. The on-chain verifier checks the proof before any funds move.',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  {
    title: 'Enforced Constraints',
    description:
      'Drawdown limits, position size caps, leverage bounds, and cooldown periods are checked inside the zkVM. No code path skips them — not even the agent author can bypass them.',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
        />
      </svg>
    ),
  },
  {
    title: 'ERC4626 Vaults',
    description:
      'Standard vault interface — users deposit, receive shares, withdraw proportionally. Compatible with existing DeFi tooling, aggregators, and portfolio dashboards.',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375"
        />
      </svg>
    ),
  },
  {
    title: 'Multi-Chain Deployment',
    description:
      'Protocol contracts deployed on Ethereum, Arbitrum, Optimism, and HyperEVM. Register your agent once, deploy vaults on any supported chain.',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12.75 3.03v.568c0 .334.148.65.405.864l1.068.89c.442.369.535 1.01.216 1.49l-.51.766a2.25 2.25 0 01-1.161.886l-.143.048a1.107 1.107 0 00-.57 1.664c.369.555.169 1.307-.427 1.605L9 13.125l.423 1.059a.956.956 0 01-1.652.928l-.679-.906a1.125 1.125 0 00-1.906.172L4.5 15.75l-.612.153M12.75 3.031a9 9 0 10-8.862 12.872M12.75 3.031a9 9 0 016.69 14.036m0 0l-.177-.529A2.25 2.25 0 0017.128 15H16.5l-.324-.324a1.453 1.453 0 00-2.328.377l-.036.073a1.586 1.586 0 01-.982.816l-.99.282c-.55.157-.894.692-.8 1.258l.108.643c.32.19.66.356 1.013.494l.36-.05z"
        />
      </svg>
    ),
  },
];

const FLOW_STEPS = [
  { label: 'Your Agent', sublabel: 'Rust, no_std' },
  { label: 'Execution Kernel', sublabel: 'zkVM guest' },
  { label: 'ZK Proof', sublabel: 'Groth16' },
  { label: 'On-Chain Verifier', sublabel: 'RISC Zero' },
  { label: 'Vault Executes', sublabel: 'ERC4626' },
];

const STATS = [
  { value: '4 Chains', detail: 'Ethereum, Arbitrum, Optimism, HyperEVM' },
  { value: '7 Adapters', detail: 'Aave V3, Lido, Pendle, Morpho, Hyperliquid, Polymarket, Uniswap V4' },
  { value: '3 Templates', detail: 'yield, perp-trader, polymarket-bot' },
  { value: '< 100 Lines', detail: 'Minimum viable agent' },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DevelopersPage() {
  return (
    <div className="min-h-screen">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#A855F7]/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#A855F7]/[0.03] rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-5xl mx-auto px-6 lg:px-12 pt-32 pb-20 relative">
          {/* Breadcrumbs */}
          <nav className="breadcrumb mb-10">
            <Link href="/">Home</Link>
            <span className="separator">/</span>
            <span className="text-gray-400">Developers</span>
          </nav>

          {/* Label */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px flex-1 max-w-[40px] bg-gradient-to-r from-[#A855F7] to-transparent" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C084FC] font-mono">
              Build on Tokagent
            </span>
          </div>

          {/* Heading */}
          <h1
            className="text-4xl md:text-6xl font-light mb-6 tracking-tight max-w-3xl"
            style={{ fontFamily: 'var(--font-serif), serif' }}
          >
            <span className="italic text-[#A855F7]">Build Verifiable</span>{' '}
            <span className="text-white">DeFi Agents</span>
          </h1>

          <p className="text-gray-400 max-w-2xl text-base leading-relaxed font-mono mb-10">
            Write strategy logic in Rust. The Execution Kernel proves every decision was
            computed correctly. Vaults execute only verified actions.
          </p>

          {/* Code block */}
          <div className="max-w-lg rounded-xl border border-white/10 bg-[#0a0a12] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/40" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/40" />
              <span className="ml-2 text-[10px] font-mono text-gray-600">terminal</span>
            </div>
            <pre className="p-5 text-sm font-mono leading-relaxed overflow-x-auto">
              <code>
                <span className="text-gray-500">{'# scaffold, test, deploy'}</span>
                {'\n'}
                <span className="text-[#C084FC]">$</span>
                <span className="text-gray-300">{' tal init my-agent --template yield'}</span>
                {'\n'}
                <span className="text-[#C084FC]">$</span>
                <span className="text-gray-300">{' tal test --local'}</span>
                {'\n'}
                <span className="text-[#C084FC]">$</span>
                <span className="text-gray-300">{' tal deploy --testnet'}</span>
              </code>
            </pre>
          </div>
        </div>
      </section>

      {/* ── Feature Cards ── */}
      <section className="max-w-5xl mx-auto px-6 lg:px-12 pb-24">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-px flex-1 max-w-[40px] bg-gradient-to-r from-[#A855F7] to-transparent" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C084FC] font-mono">
            What You Get
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="card group hover:border-[#A855F7]/20 transition-all duration-300"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-colors duration-300"
                style={{
                  background: 'rgba(168, 85, 247, 0.08)',
                  border: '1px solid rgba(168, 85, 247, 0.15)',
                }}
              >
                <span className="text-[#A855F7]">{feature.icon}</span>
              </div>
              <h3
                className="text-lg font-light text-white mb-3"
                style={{ fontFamily: 'var(--font-serif), serif' }}
              >
                {feature.title}
              </h3>
              <p className="text-gray-500 text-sm leading-relaxed font-mono">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="border-t border-white/5">
        <div className="max-w-5xl mx-auto px-6 lg:px-12 py-20">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-px flex-1 max-w-[40px] bg-gradient-to-r from-[#A855F7] to-transparent" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C084FC] font-mono">
              How It Works
            </span>
          </div>

          {/* Flow diagram */}
          <div className="flex flex-col md:flex-row items-stretch gap-3">
            {FLOW_STEPS.map((step, i) => (
              <div key={step.label} className="flex items-center gap-3 flex-1">
                <div className="flex-1 rounded-xl border border-white/10 bg-[#0a0a12] px-4 py-5 text-center">
                  <div className="text-white text-sm font-medium mb-1">{step.label}</div>
                  <div className="text-[10px] font-mono text-gray-600">{step.sublabel}</div>
                </div>
                {i < FLOW_STEPS.length - 1 && (
                  <svg
                    className="w-4 h-4 text-[#A855F7]/40 shrink-0 hidden md:block"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Get Started ── */}
      <section className="border-t border-white/5">
        <div className="max-w-5xl mx-auto px-6 lg:px-12 py-20">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-px flex-1 max-w-[40px] bg-gradient-to-r from-[#A855F7] to-transparent" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C084FC] font-mono">
              Get Started
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Quickstart card */}
            <a
              href="https://docs.tokagent.network/quickstart"
              target="_blank"
              rel="noopener noreferrer"
              className="card group hover:border-[#A855F7]/20 transition-all duration-300 block"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                style={{
                  background: 'rgba(168, 85, 247, 0.08)',
                  border: '1px solid rgba(168, 85, 247, 0.15)',
                }}
              >
                <span className="text-[#A855F7]">
                  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                    />
                  </svg>
                </span>
              </div>
              <h3
                className="text-lg font-light text-white mb-2"
                style={{ fontFamily: 'var(--font-serif), serif' }}
              >
                5-Minute Quickstart
              </h3>
              <p className="text-gray-500 text-sm leading-relaxed font-mono mb-4">
                Install the CLI, scaffold an agent from a template, test locally in 2 seconds,
                and deploy to testnet. No proof generation required during development.
              </p>
              <span className="text-[#C084FC] text-xs font-mono group-hover:text-[#A855F7] transition-colors inline-flex items-center gap-1">
                Read the quickstart
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
                </svg>
              </span>
            </a>

            {/* Tutorial card */}
            <a
              href="https://docs.tokagent.network/getting-started/build-a-rebalancer"
              target="_blank"
              rel="noopener noreferrer"
              className="card group hover:border-[#A855F7]/20 transition-all duration-300 block"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                style={{
                  background: 'rgba(168, 85, 247, 0.08)',
                  border: '1px solid rgba(168, 85, 247, 0.15)',
                }}
              >
                <span className="text-[#A855F7]">
                  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.331 0 4.472.89 6.075 2.35M12 6.042A8.967 8.967 0 0118 3.75c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18c-2.331 0-4.472.89-6.075 2.35M12 6.042V20.35"
                    />
                  </svg>
                </span>
              </div>
              <h3
                className="text-lg font-light text-white mb-2"
                style={{ fontFamily: 'var(--font-serif), serif' }}
              >
                30-Minute Tutorial
              </h3>
              <p className="text-gray-500 text-sm leading-relaxed font-mono mb-4">
                Build a DeFi rebalancer agent from scratch. Covers the{' '}
                <code className="text-gray-400 bg-white/5 px-1 rounded">agent_input!</code> macro,{' '}
                <code className="text-gray-400 bg-white/5 px-1 rounded">CallBuilder</code>,
                testing, and deployment.
              </p>
              <span className="text-[#C084FC] text-xs font-mono group-hover:text-[#A855F7] transition-colors inline-flex items-center gap-1">
                Start the tutorial
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
                </svg>
              </span>
            </a>
          </div>

          {/* Additional links */}
          <div className="mt-8 flex flex-wrap gap-4 justify-center">
            <a
              href="https://docs.tokagent.network/sdk/overview"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-gray-500 hover:text-[#C084FC] transition-colors inline-flex items-center gap-1.5"
            >
              SDK Reference
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            <a
              href="https://docs.tokagent.network/architecture/overview"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-gray-500 hover:text-[#C084FC] transition-colors inline-flex items-center gap-1.5"
            >
              Architecture
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            <a
              href="https://github.com/tokamak-network/Tokamak-AI-Layer"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-gray-500 hover:text-[#C084FC] transition-colors inline-flex items-center gap-1.5"
            >
              GitHub
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* ── Stats Bar ── */}
      <section className="border-t border-white/5">
        <div className="max-w-5xl mx-auto px-6 lg:px-12 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {STATS.map((stat) => (
              <div key={stat.value} className="text-center">
                <div className="text-xl font-light text-white mb-1 font-mono">{stat.value}</div>
                <div className="text-[10px] font-mono text-gray-600 leading-relaxed">{stat.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="border-t border-white/5">
        <div className="max-w-5xl mx-auto px-6 lg:px-12 py-20 text-center">
          <h2
            className="text-2xl md:text-3xl font-light mb-4 text-white"
            style={{ fontFamily: 'var(--font-serif), serif' }}
          >
            Ready to build?
          </h2>
          <p className="text-gray-500 font-mono text-sm mb-8 max-w-lg mx-auto">
            Install the CLI and deploy your first verifiable agent in under 30 minutes.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a
              href="https://docs.tokagent.network/quickstart"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary inline-flex items-center gap-2 px-8 py-3"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
                />
              </svg>
              Start Building
            </a>
            <a
              href="https://github.com/tokamak-network/Tokamak-AI-Layer"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary inline-flex items-center gap-2 px-8 py-3"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              View on GitHub
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
