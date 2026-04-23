'use client';

import Link from 'next/link';

const FEATURES = [
  {
    title: 'Multisig Support',
    description:
      'Fully compatible with Safe (Gnosis Safe) multisig wallets. Vault ownership, deposits, and withdrawals all work seamlessly with multi-signature governance.',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
        />
      </svg>
    ),
  },
  {
    title: 'Access Control',
    description:
      'Fine-grained deposit gating with whitelist-only mode, per-address deposit caps, and pluggable KYC verification through external verifier contracts.',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
        />
      </svg>
    ),
  },
  {
    title: 'Reporting',
    description:
      'Export portfolio positions and vault execution history in CSV or JSON format. Programmatic API access for integration with existing reporting systems.',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
        />
      </svg>
    ),
  },
  {
    title: 'Security',
    description:
      'Emergency pause with 14-day depositor withdrawal guarantee. Emergency strategy settlement after 7 days. Audit-ready codebase with comprehensive test coverage.',
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
    title: 'Verifiable Execution',
    description:
      'Every agent trade is verified by a RISC Zero ZK proof before execution. Trusted imageId is pinned at vault deployment, ensuring deterministic and auditable strategy execution.',
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
];

export default function InstitutionalPage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#c4f547]/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#c4f547]/[0.03] rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-5xl mx-auto px-6 lg:px-12 pt-32 pb-20 relative">
          {/* Breadcrumbs */}
          <nav className="breadcrumb mb-10">
            <Link href="/">Home</Link>
            <span className="separator">/</span>
            <span className="text-gray-400">Institutional</span>
          </nav>

          {/* Label */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px flex-1 max-w-[40px] bg-gradient-to-r from-[#c4f547] to-transparent" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d5f972] font-mono">
              For Institutions
            </span>
          </div>

          {/* Heading */}
          <h1
            className="text-4xl md:text-6xl font-light mb-6 tracking-tight max-w-3xl"
            style={{ fontFamily: 'var(--font-serif), serif' }}
          >
            <span className="italic text-[#c4f547]">Enterprise-Grade</span>{' '}
            <span className="text-white">DeFi Infrastructure</span>
          </h1>

          <p className="text-gray-400 max-w-2xl text-base leading-relaxed font-mono mb-10">
            Tokagent provides institutional-grade infrastructure for deploying and managing
            AI-driven vaults. From multisig governance to verifiable ZK execution, every layer
            is designed for compliance, security, and transparency.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-wrap gap-4">
            <a
              href="mailto:security@tokagent.network?subject=Institutional%20Inquiry"
              className="btn-primary inline-flex items-center gap-2 px-6 py-3"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                />
              </svg>
              Contact Us
            </a>
            <a
              href="https://github.com/tokamak-network/Tokamak-AI-Layer/blob/master/contracts/SECURITY.md"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary inline-flex items-center gap-2 px-6 py-3"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
              Read Security Docs
            </a>
          </div>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="max-w-5xl mx-auto px-6 lg:px-12 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="card group hover:border-[#c4f547]/20 transition-all duration-300"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-colors duration-300"
                style={{
                  background: 'rgba(196, 245, 71, 0.08)',
                  border: '1px solid rgba(196, 245, 71, 0.15)',
                }}
              >
                <span className="text-[#c4f547]">{feature.icon}</span>
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

      {/* Bottom CTA */}
      <section className="border-t border-white/5">
        <div className="max-w-5xl mx-auto px-6 lg:px-12 py-20 text-center">
          <h2
            className="text-2xl md:text-3xl font-light mb-4 text-white"
            style={{ fontFamily: 'var(--font-serif), serif' }}
          >
            Ready to get started?
          </h2>
          <p className="text-gray-500 font-mono text-sm mb-8 max-w-lg mx-auto">
            Our team is available to discuss custom integrations, compliance requirements,
            and deployment strategies tailored to your organization.
          </p>
          <a
            href="mailto:security@tokagent.network?subject=Institutional%20Inquiry"
            className="btn-primary inline-flex items-center gap-2 px-8 py-3"
          >
            Get in Touch
          </a>
        </div>
      </section>
    </div>
  );
}
