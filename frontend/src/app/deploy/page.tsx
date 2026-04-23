'use client';

import { DeployVaultForm } from '@/components/DeployVaultForm';
import Link from 'next/link';

export default function DeployPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-12 py-8 sm:py-12">
      {/* Header — editorial layout matching vaults page */}
      <div className="mb-8 sm:mb-10">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-px flex-1 max-w-[40px] bg-gradient-to-r from-[#c4f547] to-transparent" />
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d5f972] font-mono"
          >
            Vault Factory
          </span>
        </div>
        <h1
          className="text-3xl sm:text-4xl md:text-5xl font-light mb-3 tracking-tight"
          style={{ fontFamily: 'var(--font-serif), serif' }}
        >
          <span className="italic text-[#c4f547]">Deploy</span>{' '}
          <span className="text-white">Vault</span>
        </h1>
        <p className="text-gray-500 max-w-lg text-sm leading-relaxed font-mono">
          Launch a new AI-managed vault in four steps. Select an agent, choose an asset, configure parameters, and deploy on-chain.
        </p>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[11px] font-mono text-gray-600 mb-6 sm:mb-8">
        <Link href="/vaults" className="hover:text-gray-400 transition-colors min-h-[44px] sm:min-h-0 flex items-center">
          Vaults
        </Link>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-gray-400">Deploy</span>
      </div>

      {/* Deploy form */}
      <DeployVaultForm />
    </div>
  );
}
