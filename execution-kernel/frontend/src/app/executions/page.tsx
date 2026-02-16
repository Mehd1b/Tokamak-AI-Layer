'use client';

import { ExecutionHistoryTable } from '@/components/ExecutionHistoryTable';

export default function ExecutionsPage() {
  // Placeholder - in production, these would come from event logs
  const executions: {
    nonce: string;
    agentId: string;
    oldStateRoot: string;
    newStateRoot: string;
    transactionHash?: string;
  }[] = [];

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 py-12">
      {/* Header */}
      <div className="mb-12">
        <span
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-6"
          style={{ fontFamily: 'var(--font-mono), monospace' }}
        >
          Execution History
        </span>
        <h1
          className="text-4xl md:text-5xl font-light mb-4"
          style={{ fontFamily: 'var(--font-serif), serif' }}
        >
          <span className="italic text-[#A855F7]">Verified</span> Executions
        </h1>
        <p className="text-gray-400 max-w-2xl" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          Browse all ZK-verified agent executions settled on Ethereum Sepolia.
        </p>
      </div>

      {/* Info card */}
      <div className="card mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#A855F7] opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#A855F7]" />
            </span>
            <span className="text-xs font-mono uppercase tracking-wider text-white/50">Live</span>
          </div>
          <span className="text-sm text-gray-400 font-mono">
            Monitoring ExecutionApplied events from all vaults
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 rounded-lg bg-white/[0.02] border border-white/5">
            <span className="text-2xl font-light text-[#A855F7] font-mono">-</span>
            <p className="text-xs text-gray-500 font-mono mt-1">Total Executions</p>
          </div>
          <div className="text-center p-4 rounded-lg bg-white/[0.02] border border-white/5">
            <span className="text-2xl font-light text-[#A855F7] font-mono">-</span>
            <p className="text-xs text-gray-500 font-mono mt-1">Unique Agents</p>
          </div>
          <div className="text-center p-4 rounded-lg bg-white/[0.02] border border-white/5">
            <span className="text-2xl font-light text-[#A855F7] font-mono">-</span>
            <p className="text-xs text-gray-500 font-mono mt-1">Active Vaults</p>
          </div>
        </div>
      </div>

      {/* Execution table */}
      <div className="card">
        <ExecutionHistoryTable executions={executions} />
      </div>
    </div>
  );
}
