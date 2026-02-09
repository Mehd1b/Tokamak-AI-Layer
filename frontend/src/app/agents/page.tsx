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
  const { name, description, isLoading } = useAgentMetadata(agentURI);

  return (
    <Link
      href={`/agents/${agentId}`}
      className="card flex items-center justify-between transition-shadow hover:shadow-md"
    >
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tokamak-100 text-tokamak-700 font-bold">
          #{agentId}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">
            {isLoading ? 'Loading...' : name || `Agent #${agentId}`}
          </h3>
          <p className="text-sm text-gray-500 truncate">
            {isLoading
              ? 'Fetching metadata...'
              : description || `Owner: ${shortenAddress(owner)}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden sm:block text-xs text-gray-500">
          {shortenAddress(owner)}
        </div>
        <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
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
          <h1 className="text-3xl font-bold text-gray-900">Agent Discovery</h1>
          <p className="mt-2 text-gray-600">
            {isLoading
              ? 'Loading...'
              : `${agentCount} registered agent${agentCount !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Link href="/agents/register" className="btn-primary">
          Register Agent
        </Link>
      </div>

      {/* Search Bar */}
      <div className="card mb-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search agents by ID, owner address, or URI..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-tokamak-500 focus:outline-none focus:ring-1 focus:ring-tokamak-500"
          />
        </div>
        {search && (
          <p className="mt-2 text-sm text-gray-500">
            Showing {filteredAgents.length} of {agents.length} agents
          </p>
        )}
      </div>

      {/* Agent List */}
      <div className="space-y-4">
        {agentCount === 0 && !isLoading && (
          <div className="card text-center py-12">
            <p className="text-gray-500">No agents registered yet.</p>
            <Link href="/agents/register" className="mt-4 inline-block btn-primary">
              Be the first to register
            </Link>
          </div>
        )}

        {isLoading && (
          <div className="card text-center py-12">
            <p className="text-gray-500">Loading agents...</p>
          </div>
        )}

        {!isLoading && filteredAgents.length === 0 && agentCount > 0 && (
          <div className="card text-center py-12">
            <p className="text-gray-500">No agents match your search.</p>
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
