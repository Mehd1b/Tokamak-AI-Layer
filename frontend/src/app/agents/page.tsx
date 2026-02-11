'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, ChevronRight, Star, ArrowUpDown } from 'lucide-react';
import { useAgentCount, useAgentList } from '@/hooks/useAgent';
import { useAgentMetadata } from '@/hooks/useAgentMetadata';
import { useAgentRatings } from '@/hooks/useReputation';
import { shortenAddress, getAgentStatusLabel, getAgentStatusColor, getAgentValidationModelLabel } from '@/lib/utils';

type SortOption = 'newest' | 'rating' | 'reviews';

interface AgentCardProps {
  agentId: number;
  owner: `0x${string}`;
  agentURI: string;
  averageScore: number | null;
  feedbackCount: number;
  status: number;
  validationModel: number;
}

function AgentCard({ agentId, owner, agentURI, averageScore, feedbackCount, status, validationModel }: AgentCardProps) {
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

  const statusDotColor = status === 0 ? 'bg-emerald-400' : status === 1 ? 'bg-amber-400' : 'bg-red-400';

  return (
    <Link
      href={`/agents/${agentId}`}
      className="card flex items-center justify-between transition-all hover:border-[#38BDF8]/30 hover:-translate-y-1"
    >
      <div className="flex flex-1 min-w-0 items-center gap-4">
        <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[#38BDF8]/20 text-[#38BDF8] font-bold">
          #{agentId}
          <span className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ${statusDotColor} ring-2 ring-zinc-900`} title={getAgentStatusLabel(status)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white truncate">
              {isLoading ? 'Loading...' : name || `Agent #${agentId}`}
            </h3>
            {validationModel > 0 && (
              <span className="hidden sm:inline-flex rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                {getAgentValidationModelLabel(validationModel)}
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-500 truncate">
            {isLoading
              ? 'Fetching metadata...'
              : description || `Owner: ${shortenAddress(owner)}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        {averageScore !== null && (
          <div className="hidden sm:flex items-center gap-1 text-sm">
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            <span className="text-white font-medium">{averageScore.toFixed(1)}</span>
            <span className="text-zinc-600">({feedbackCount})</span>
          </div>
        )}
        <div className="hidden md:block text-xs text-zinc-500">
          {shortenAddress(owner)}
        </div>
        <ChevronRight className="h-5 w-5 text-zinc-600 flex-shrink-0" />
      </div>
    </Link>
  );
}

export default function AgentsPage() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('newest');
  const { count, isLoading: countLoading } = useAgentCount();
  const agentCount = count ? Number(count) : 0;
  const { agents, isLoading: agentsLoading } = useAgentList(agentCount);

  const agentIds = useMemo(() => agents.map((a) => a.agentId), [agents]);
  const { ratings } = useAgentRatings(agentIds);

  const filteredAndSortedAgents = useMemo(() => {
    let result = agents;

    if (search.trim()) {
      const searchLower = search.toLowerCase();
      result = result.filter((agent) => {
        if (agent.agentId.toString().includes(search)) return true;
        if (agent.owner.toLowerCase().includes(searchLower)) return true;
        if (agent.agentURI.toLowerCase().includes(searchLower)) return true;
        return false;
      });
    }

    if (sort === 'rating') {
      result = [...result].sort((a, b) => {
        const ra = ratings.get(a.agentId);
        const rb = ratings.get(b.agentId);
        const scoreA = ra?.averageScore ?? -Infinity;
        const scoreB = rb?.averageScore ?? -Infinity;
        return scoreB - scoreA;
      });
    } else if (sort === 'reviews') {
      result = [...result].sort((a, b) => {
        const ra = ratings.get(a.agentId);
        const rb = ratings.get(b.agentId);
        return (rb?.feedbackCount ?? 0) - (ra?.feedbackCount ?? 0);
      });
    }
    // 'newest' = default order (highest ID first, already the order from useAgentList)

    return result;
  }, [agents, search, sort, ratings]);

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

      {/* Search + Sort */}
      <div className="card mb-8">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <input
              type="text"
              placeholder="Search agents by ID, owner address, or URI..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder-zinc-600 focus:border-[#38BDF8] focus:outline-none focus:ring-1 focus:ring-[#38BDF8]/50"
            />
          </div>
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-zinc-500" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#38BDF8] focus:outline-none focus:ring-1 focus:ring-[#38BDF8]/50"
            >
              <option value="newest">Newest</option>
              <option value="rating">Highest Rated</option>
              <option value="reviews">Most Reviewed</option>
            </select>
          </div>
        </div>
        {search && (
          <p className="mt-2 text-sm text-zinc-500">
            Showing {filteredAndSortedAgents.length} of {agents.length} agents
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

        {!isLoading && filteredAndSortedAgents.length === 0 && agentCount > 0 && (
          <div className="card text-center py-12">
            <p className="text-zinc-500">No agents match your search.</p>
          </div>
        )}

        {!isLoading &&
          filteredAndSortedAgents.map((agent) => {
            const rating = ratings.get(agent.agentId);
            return (
              <AgentCard
                key={agent.agentId}
                agentId={agent.agentId}
                owner={agent.owner}
                agentURI={agent.agentURI}
                averageScore={rating?.averageScore ?? null}
                feedbackCount={rating?.feedbackCount ?? 0}
                status={agent.status}
                validationModel={agent.validationModel}
              />
            );
          })}
      </div>
    </div>
  );
}
