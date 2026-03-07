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
      {/* Header */}
      <div className="mb-12">
        <span
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-6"
          style={{ fontFamily: 'var(--font-mono), monospace' }}
        >
          Agent Registry
        </span>
        <h1
          className="text-4xl md:text-5xl font-light mb-4"
          style={{ fontFamily: 'var(--font-serif), serif' }}
        >
          <span className="italic text-[#A855F7]">Registered</span> Agents
        </h1>
        <p className="text-gray-400 max-w-2xl leading-relaxed">
          Browse agents with RISC Zero zkVM image IDs for verifiable execution.
        </p>
      </div>

      {/* Search */}
      <div className="mb-8">
        <div className="input-dark-wrapper">
          <input
            type="text"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            placeholder="Search by Agent ID (bytes32)..."
            className="input-dark font-mono w-full pr-10"
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
        <div className="card text-center py-12">
          <div className="animate-pulse text-[#A855F7] font-mono text-sm">Loading agent...</div>
        </div>
      )}

      {agent && agentIdHex && (
        <div className="mb-8">
          <h2 className="text-sm font-mono text-gray-500 uppercase tracking-wider mb-4">Search Result</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AgentCard
              agentId={agentIdHex}
              author={agent.author}
              imageId={agent.imageId}
              exists={agent.exists}
            />
          </div>
        </div>
      )}

      {!agent && agentIdHex && !isLoading && (
        <div className="card text-center py-12 mb-8">
          <p className="text-gray-500 font-mono text-sm">No agent found with this ID</p>
        </div>
      )}

      {/* On-chain registered agents */}
      {!agentIdHex && (
        <>
          {isLoadingAgents && (
            <div>
              <div className="h-4 skeleton w-48 mb-4" />
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="card">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 skeleton rounded-xl" />
                        <div className="w-14 h-5 skeleton rounded" />
                      </div>
                      <div className="w-16 h-5 skeleton rounded" />
                    </div>
                    <div className="h-4 skeleton rounded w-3/4 mb-3" />
                    <div className="space-y-2">
                      <div className="h-3 skeleton rounded" />
                      <div className="h-3 skeleton rounded w-5/6" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {agentsError && (
            <div className="card text-center py-12 mb-8">
              <p className="text-red-400 font-mono text-sm">Failed to fetch agents: {agentsError.message.slice(0, 120)}</p>
            </div>
          )}

          {registeredAgents && registeredAgents.length > 0 && (
            <div>
              <h2 className="text-sm font-mono text-gray-500 uppercase tracking-wider mb-4">
                On-Chain Registry ({registeredAgents.length} agent{registeredAgents.length !== 1 ? 's' : ''})
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {registeredAgents.map((a) => (
                  <AgentCard
                    key={a.agentId}
                    agentId={a.agentId}
                    author={a.author}
                    imageId={a.imageId}
                    exists={a.exists}
                  />
                ))}
              </div>
            </div>
          )}

          {registeredAgents && registeredAgents.length === 0 && (
            <div className="card text-center py-16">
              <div className="mb-4">
                <svg viewBox="0 0 64 64" className="w-16 h-16 mx-auto opacity-30" fill="none">
                  <circle cx="32" cy="32" r="28" stroke="#A855F7" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="6 4" />
                  <circle cx="32" cy="32" r="16" stroke="#A855F7" strokeWidth="1" strokeOpacity="0.5" />
                  <circle cx="32" cy="32" r="4" fill="#A855F7" fillOpacity="0.5" />
                </svg>
              </div>
              <p className="text-gray-400 text-sm mb-2">No agents registered yet</p>
              <p className="text-gray-500 text-sm mb-6">Register your agent with a RISC Zero zkVM image ID to get started.</p>
              <a
                href="https://docs.tokagent.network"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary inline-flex items-center gap-2"
              >
                Read the Docs
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
