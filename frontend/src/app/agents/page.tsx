'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, ChevronRight } from 'lucide-react';
import { useAgentCount, useAgentList } from '@/hooks/useAgent';
import { useAgentMetadata } from '@/hooks/useAgentMetadata';
import { shortenAddress } from '@/lib/utils';

interface AgentCardProps {
  agentId: number;
  owner: `0x${string}`;
  agentURI: string;
}

function AgentCard({ agentId, owner, agentURI }: AgentCardProps) {
  const { name, description, active, services, isLoading, error } = useAgentMetadata(agentURI);

  // Hide agents with no URI, failed metadata, inactive status, or localhost endpoints
  if (!isLoading) {
    if (!agentURI) return null;
    if (!name && !error) return null;
    if (error && !name) return null;
    if (active === false) return null;
    const serviceUrls = Object.values(services || {}).join(' ');
    if (serviceUrls.includes('localhost') || serviceUrls.includes('127.0.0.1')) return null;
  }

  return (
    <Link
      href={`/agents/${agentId}`}
      className="card flex items-center justify-between transition-all hover:border-[#38BDF8]/30 hover:-translate-y-1"
    >
      <div className="flex flex-1 min-w-0 items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#38BDF8]/20 text-[#38BDF8] font-bold">
          #{agentId}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white truncate">
            {isLoading ? 'Loading...' : name || `Agent #${agentId}`}
          </h3>
          <p className="text-sm text-zinc-500 truncate">
            {isLoading
              ? 'Fetching metadata...'
              : description || `Owner: ${shortenAddress(owner)}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden sm:block text-xs text-zinc-500">
          {shortenAddress(owner)}
        </div>
        <ChevronRight className="h-5 w-5 text-zinc-600 flex-shrink-0" />
      </div>
    </Link>
  );
}

export default function AgentsPage() {
  const [search, setSearch] = useState('');
  const { count, isLoading: countLoading } = useAgentCount();
  const agentCount = count ? Number(count) : 0;
  const { agents, isLoading: agentsLoading } = useAgentList(agentCount);

  const filteredAgents = useMemo(() => {
    if (!search.trim()) return agents;

    const searchLower = search.toLowerCase();
    return agents.filter((agent) => {
      // Search by agent ID
      if (agent.agentId.toString().includes(search)) return true;

      // Search by owner address
      if (agent.owner.toLowerCase().includes(searchLower)) return true;

      // Search by agentURI
      if (agent.agentURI.toLowerCase().includes(searchLower)) return true;

      return false;
    });
  }, [agents, search]);

  const isLoading = countLoading || agentsLoading;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Agent Discovery</h1>
          <p className="mt-2 text-zinc-400">
            {isLoading
              ? 'Loading...'
              : `${agentCount} registered agent${agentCount !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/agents/fees" className="btn-secondary">
            My Fees
          </Link>
          <Link href="/agents/register" className="btn-primary">
            Register Agent
          </Link>
        </div>
      </div>

      {/* Search Bar */}
      <div className="card mb-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
          <input
            type="text"
            placeholder="Search agents by ID, owner address, or URI..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder-zinc-600 focus:border-[#38BDF8] focus:outline-none focus:ring-1 focus:ring-[#38BDF8]/50"
          />
        </div>
        {search && (
          <p className="mt-2 text-sm text-zinc-500">
            Showing {filteredAgents.length} of {agents.length} agents
          </p>
        )}
      </div>

      {/* Agent List */}
      <div className="space-y-4">
        {agentCount === 0 && !isLoading && (
          <div className="card text-center py-12">
            <p className="text-zinc-500">No agents registered yet.</p>
            <Link href="/agents/register" className="mt-4 inline-block btn-primary">
              Be the first to register
            </Link>
          </div>
        )}

        {isLoading && (
          <div className="card text-center py-12">
            <p className="text-zinc-500">Loading agents...</p>
          </div>
        )}

        {!isLoading && filteredAgents.length === 0 && agentCount > 0 && (
          <div className="card text-center py-12">
            <p className="text-zinc-500">No agents match your search.</p>
          </div>
        )}

        {!isLoading &&
          filteredAgents.map((agent) => (
            <AgentCard
              key={agent.agentId}
              agentId={agent.agentId}
              owner={agent.owner}
              agentURI={agent.agentURI}
            />
          ))}
      </div>
    </div>
  );
}
