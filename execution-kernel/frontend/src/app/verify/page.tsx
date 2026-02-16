'use client';

import { ProofVerifier } from '@/components/ProofVerifier';
import { KERNEL_CONTRACTS } from '@/lib/contracts';
import { truncateAddress } from '@/lib/utils';

export default function VerifyPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 lg:px-12 py-12">
      {/* Header */}
      <div className="mb-12">
        <span
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-6"
          style={{ fontFamily: 'var(--font-mono), monospace' }}
        >
          Proof Verification
        </span>
        <h1
          className="text-4xl md:text-5xl font-light mb-4"
          style={{ fontFamily: 'var(--font-serif), serif' }}
        >
          <span className="italic text-[#A855F7]">Verify</span> Proofs
        </h1>
        <p className="text-gray-400 max-w-2xl" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          Parse and verify RISC Zero ZK proofs on-chain. Submit a journal and seal to decode execution fields.
        </p>
      </div>

      {/* Verifier contract info */}
      <div className="card mb-8">
        <h2 className="text-lg font-light text-white mb-4" style={{ fontFamily: 'var(--font-serif), serif' }}>
          Verifier Contracts
        </h2>
        <div className="space-y-3" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          <div className="flex justify-between items-center py-2 border-b border-white/5">
            <span className="text-gray-500 text-sm">Execution Verifier</span>
            <a
              href={`https://sepolia.etherscan.io/address/${KERNEL_CONTRACTS.kernelExecutionVerifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#A855F7] text-sm hover:underline"
            >
              {truncateAddress(KERNEL_CONTRACTS.kernelExecutionVerifier, 6)}
            </a>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-500 text-sm">RISC Zero Router</span>
            <a
              href={`https://sepolia.etherscan.io/address/${KERNEL_CONTRACTS.riscZeroVerifierRouter}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#A855F7] text-sm hover:underline"
            >
              {truncateAddress(KERNEL_CONTRACTS.riscZeroVerifierRouter, 6)}
            </a>
          </div>
        </div>
      </div>

      {/* Proof verifier */}
      <div className="card">
        <h2 className="text-lg font-light text-white mb-6" style={{ fontFamily: 'var(--font-serif), serif' }}>
          Submit Proof
        </h2>
        <ProofVerifier />
      </div>

      {/* How it works */}
      <div className="card mt-8">
        <h2 className="text-lg font-light text-white mb-4" style={{ fontFamily: 'var(--font-serif), serif' }}>
          How it works
        </h2>
        <div className="space-y-4 text-sm text-gray-400" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          <div className="flex gap-4">
            <span className="text-[#A855F7] font-medium shrink-0">01</span>
            <p>An agent executes a computation inside the RISC Zero zkVM, producing a journal (public output) and seal (proof).</p>
          </div>
          <div className="flex gap-4">
            <span className="text-[#A855F7] font-medium shrink-0">02</span>
            <p>The journal contains: agentId, vaultAddress, old/new state roots, nonce, actionHash, and configHash.</p>
          </div>
          <div className="flex gap-4">
            <span className="text-[#A855F7] font-medium shrink-0">03</span>
            <p>The seal is verified on-chain by the RISC Zero Verifier Router, proving the computation was correct.</p>
          </div>
          <div className="flex gap-4">
            <span className="text-[#A855F7] font-medium shrink-0">04</span>
            <p>Once verified, the vault atomically updates its state root and applies the agent&apos;s output.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
