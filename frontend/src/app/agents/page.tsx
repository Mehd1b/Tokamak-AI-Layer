'use client';

import { useState } from 'react';
import { useAgent, useRegisteredAgents } from '@/hooks/useKernelAgent';
import { AgentCard } from '@/components/AgentCard';
import { isValidBytes32 } from '@/lib/utils';

export default function AgentsPage() {
  const [searchId, setSearchId] = useState('');

  const agentIdHex = isValidBytes32(searchId) ? (searchId as `0x${string}`) : undefined;
  const { data: agent, isLoading } = useAgent(agentIdHex);
  const { data: registeredAgents, isLoading: isLoadingAgents, error: agentsError } = useRegisteredAgents();

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 py-12">
      {/* Header — editorial layout */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-px flex-1 max-w-[40px] bg-gradient-to-r from-[#A855F7] to-transparent" />
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C084FC] font-mono"
          >
            Agent Registry
          </span>
        </div>
        <h1
          className="text-4xl md:text-5xl font-light mb-3 tracking-tight"
          style={{ fontFamily: 'var(--font-serif), serif' }}
        >
          <span className="italic text-[#A855F7]">Registered</span>{' '}
          <span className="text-white">Agents</span>
        </h1>
        <p className="text-gray-500 max-w-lg text-sm leading-relaxed font-mono">
          Browse agents with RISC Zero zkVM image IDs for verifiable execution.
        </p>
      </div>

      {/* Search */}
      <div className="mb-8">
        <div className="input-dark-wrapper">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <input
            type="text"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            placeholder="Search by Agent ID (bytes32)..."
            className="input-dark font-mono w-full pl-9 pr-10"
          />
          {searchId && (
            <button
              type="button"
              onClick={() => setSearchId('')}
              className="input-clear"
              aria-label="Clear search"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Search results */}
      {isLoading && agentIdHex && (
        <div className="rounded-2xl border border-white/5 bg-[#12121a]/80 text-center py-12">
          <div className="animate-pulse text-[#C084FC] font-mono text-sm">Loading agent...</div>
        </div>
      )}

      {agent && agentIdHex && (
        <div className="mb-8">
          <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-4">Search Result</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            <AgentCard
              agentId={agentIdHex}
              author={agent.author}
              imageId={agent.imageId}
              exists={agent.exists}
              index={0}
            />
          </div>
        </div>
      )}

      {!agent && agentIdHex && !isLoading && (
        <div className="rounded-2xl border border-white/5 bg-[#12121a]/80 text-center py-12 mb-8">
          <p className="text-gray-500 font-mono text-sm">No agent found with this ID</p>
        </div>
      )}

      {/* On-chain registered agents */}
      {!agentIdHex && (
        <>
          {isLoadingAgents && (
            <div>
              <div className="h-4 skeleton w-48 mb-6" />
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="rounded-2xl border border-white/5 bg-[#12121a]/80 p-5" style={{ animationDelay: `${i * 80}ms` }}>
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 skeleton rounded-xl" />
                        <div className="w-12 h-3 skeleton rounded" />
                      </div>
                      <div className="w-20 h-4 skeleton rounded-full" />
                    </div>
                    <div className="mb-4">
                      <div className="w-14 h-2 skeleton rounded mb-2" />
                      <div className="w-40 h-4 skeleton rounded" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-10 skeleton rounded-lg" />
                      <div className="h-10 skeleton rounded-lg" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {agentsError && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 text-center py-12 mb-8">
              <p className="text-red-400 font-mono text-sm">Failed to fetch agents: {agentsError.message.slice(0, 120)}</p>
            </div>
          )}

          {registeredAgents && registeredAgents.length > 0 && (
            <div>
              <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-5">
                {registeredAgents.length} agent{registeredAgents.length !== 1 ? 's' : ''} on-chain
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                {registeredAgents.map((a, i) => (
                  <AgentCard
                    key={a.agentId}
                    agentId={a.agentId}
                    author={a.author}
                    imageId={a.imageId}
                    exists={a.exists}
                    index={i}
                  />
                ))}
              </div>
            </div>
          )}

          {registeredAgents && registeredAgents.length === 0 && (
            <div className="rounded-2xl border border-white/5 bg-[#12121a]/80 text-center py-20">
              <div className="mb-6">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-[#A855F7]/5 border border-[#A855F7]/10 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-7 h-7 text-[#A855F7]/40" fill="none" stroke="currentColor" strokeWidth="1">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
              </div>
              <p className="text-gray-400 text-sm mb-1">No agents registered yet</p>
              <p className="text-gray-600 text-xs mb-6 font-mono">Register your agent with a RISC Zero zkVM image ID to get started.</p>
              <a
                href="https://docs.tokagent.network"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary inline-flex items-center gap-2 text-xs"
              >
                Read the Docs
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
