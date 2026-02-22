'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, ChevronRight, Star, ArrowUpDown, Filter, X } from 'lucide-react';
import { useAgentCount, useAgentList } from '@/hooks/useAgent';
import { useAgentMetadata, getCachedMetadata } from '@/hooks/useAgentMetadata';
import { useAgentRatings } from '@/hooks/useReputation';
import { shortenAddress, getAgentStatusLabel, getAgentStatusColor, getValidationModelLabel, getValidationModelColor } from '@/lib/utils';

type SortOption = 'newest' | 'rating' | 'reviews';
type StatusFilter = 'all' | 0 | 1 | 2;
type ModelFilter = 'all' | 0 | 1;

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
  const { name, description, image, active, services, isLoading, error } = useAgentMetadata(agentURI);

  const hasNoMetadata = !isLoading && !agentURI;
  const metadataFailed = !isLoading && error && !name;
  const isInactive = !isLoading && active === false;
  const isDegraded = hasNoMetadata || metadataFailed || isInactive;

  const statusDotColor = status === 0 ? 'bg-emerald-400' : status === 1 ? 'bg-amber-400' : 'bg-red-400';

  return (
    <Link
      href={`/agents/${agentId}`}
      className={`group relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 flex items-center justify-between transition-all duration-300 hover:border-[#38BDF8]/30 hover:-translate-y-0.5 hover:bg-white/[0.04] ${isDegraded ? 'opacity-60' : ''}`}
    >
      {/* Spotlight hover */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: 'radial-gradient(600px circle at 50% 50%, rgba(56, 189, 248, 0.04), transparent 40%)' }}
      />
      <div className="relative z-10 flex flex-1 min-w-0 items-center gap-4">
        <div className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/20 overflow-hidden">
          {image ? (
            <img src={image} alt={name || `Agent #${agentId}`} className="h-full w-full object-cover" />
          ) : (
            <span className="text-[#38BDF8] font-bold text-sm" style={{ fontFamily: 'var(--font-mono), monospace' }}>#{agentId}</span>
          )}
          <span className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ${statusDotColor} ring-2 ring-[#0a0a0f]`} title={getAgentStatusLabel(status)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-white truncate group-hover:text-[#38BDF8] transition-colors duration-300">
              {isLoading ? 'Loading...' : name || `Agent #${agentId}`}
            </h3>
            <span className={`hidden sm:inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getValidationModelColor(validationModel)}`}>
              {getValidationModelLabel(validationModel)}
            </span>
            {hasNoMetadata && (
              <span className="hidden sm:inline-flex rounded-md bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                No Metadata
              </span>
            )}
            {metadataFailed && (
              <span className="hidden sm:inline-flex rounded-md bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                Metadata Unavailable
              </span>
            )}
            {isInactive && (
              <span className="hidden sm:inline-flex rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                Inactive
              </span>
            )}
          </div>
          <p className="text-sm text-white/40 truncate mt-0.5" style={{ fontFamily: 'var(--font-mono), monospace' }}>
            {isLoading
              ? 'Fetching metadata...'
              : description || `Owner: ${shortenAddress(owner)}`}
          </p>
        </div>
      </div>
      <div className="relative z-10 flex items-center gap-4">
        {averageScore !== null && (
          <div className="hidden sm:flex items-center gap-1.5 text-sm">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span className="text-white font-medium">{averageScore.toFixed(1)}</span>
            <span className="text-white/30" style={{ fontFamily: 'var(--font-mono), monospace' }}>({feedbackCount})</span>
          </div>
        )}
        <div className="hidden md:block text-xs text-white/30 font-mono">
          {shortenAddress(owner)}
        </div>
        <ChevronRight className="h-5 w-5 text-white/20 group-hover:text-[#38BDF8] group-hover:translate-x-0.5 transition-all duration-300 flex-shrink-0" />
      </div>
    </Link>
  );
}

export default function AgentsPage() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('newest');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [modelFilter, setModelFilter] = useState<ModelFilter>('all');
  const [showFilters, setShowFilters] = useState(false);
  const { count, isLoading: countLoading } = useAgentCount();
  const agentCount = count ? Number(count) : 0;
  const { agents, isLoading: agentsLoading } = useAgentList(agentCount);

  const agentIds = useMemo(() => agents.map((a) => a.agentId), [agents]);
  const { ratings } = useAgentRatings(agentIds);

  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (modelFilter !== 'all' ? 1 : 0);

  const filteredAndSortedAgents = useMemo(() => {
    let result = agents;

    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter((agent) => agent.status === statusFilter);
    }

    // Apply model filter
    if (modelFilter !== 'all') {
      result = result.filter((agent) => agent.validationModel === modelFilter);
    }

    if (search.trim()) {
      const searchLower = search.toLowerCase();
      result = result.filter((agent) => {
        if (agent.agentId.toString().includes(search)) return true;
        if (agent.owner.toLowerCase().includes(searchLower)) return true;
        if (agent.agentURI.toLowerCase().includes(searchLower)) return true;
        const meta = getCachedMetadata(agent.agentURI);
        if (meta?.name?.toLowerCase().includes(searchLower)) return true;
        if (meta?.description?.toLowerCase().includes(searchLower)) return true;
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
  }, [agents, search, sort, ratings, statusFilter, modelFilter]);

  const isLoading = countLoading || agentsLoading;

  return (
    <div className="mx-auto max-w-7xl px-6 pt-28 pb-16 lg:px-12">
      {/* Page Header */}
      <div className="mb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm mb-6">
            <div className="w-2 h-2 rounded-full bg-[#38BDF8] animate-pulse" />
            <span
              className="text-xs tracking-widest text-gray-400 uppercase"
              style={{ fontFamily: 'var(--font-mono), monospace' }}
            >
              Registry
            </span>
          </div>
          <h1
            className="text-4xl md:text-5xl font-light mb-3"
            style={{ fontFamily: 'var(--font-serif), serif' }}
          >
            <span className="italic text-[#38BDF8]">Agent</span>{' '}
            <span className="text-white">Discovery</span>
          </h1>
          <p
            className="text-lg text-white/50 leading-relaxed"
            style={{ fontFamily: 'var(--font-mono), monospace' }}
          >
            {isLoading
              ? 'Loading...'
              : `${agentCount} registered agent${agentCount !== 1 ? 's' : ''} on the Tokamak Agent Layer`}
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/agents/fees" className="btn-secondary">
            My Fees
          </Link>
          <Link href="/agents/register" className="shiny-cta text-sm !px-6 !py-3">
            <span className="shiny-cta-text">Register Agent</span>
          </Link>
        </div>
      </div>

      {/* Gradient line */}
      <div
        className="w-full h-px mb-10"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.3), transparent)' }}
      />

      {/* Search + Sort + Filters */}
      <div className="card mb-8">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <input
              type="text"
              placeholder="Search by name, description, ID, or owner..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder-zinc-600 focus:border-[#38BDF8] focus:outline-none focus:ring-1 focus:ring-[#38BDF8]/50"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`btn-secondary flex items-center gap-1.5 text-sm ${activeFilterCount > 0 ? 'border-[#38BDF8]/50 text-[#38BDF8]' : ''}`}
            >
              <Filter className="h-3.5 w-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#38BDF8] text-[10px] font-bold text-black">
                  {activeFilterCount}
                </span>
              )}
            </button>
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

        {/* Filter Row */}
        {showFilters && (
          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-white/10 pt-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-500">Status:</span>
              <div className="flex gap-1">
                {([['all', 'All'], [0, 'Active'], [1, 'Paused'], [2, 'Deregistered']] as const).map(([value, label]) => (
                  <button
                    key={String(value)}
                    onClick={() => setStatusFilter(value as StatusFilter)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      statusFilter === value
                        ? 'bg-[#38BDF8]/20 text-[#38BDF8]'
                        : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-500">Model:</span>
              <div className="flex gap-1">
                {([['all', 'All'], [0, 'Reputation'], [1, 'TEE']] as const).map(([value, label]) => (
                  <button
                    key={String(value)}
                    onClick={() => setModelFilter(value as ModelFilter)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      modelFilter === value
                        ? 'bg-[#38BDF8]/20 text-[#38BDF8]'
                        : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {activeFilterCount > 0 && (
              <button
                onClick={() => { setStatusFilter('all'); setModelFilter('all'); }}
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
              >
                <X className="h-3 w-3" /> Clear filters
              </button>
            )}
          </div>
        )}

        {(search || activeFilterCount > 0) && (
          <p className="mt-2 text-sm text-zinc-500">
            Showing {filteredAndSortedAgents.length} of {agents.length} agents
          </p>
        )}
      </div>

      {/* Agent List */}
      <div className="space-y-3">
        {agentCount === 0 && !isLoading && (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] text-center py-16">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-[#38BDF8]/10 border border-[#38BDF8]/20 flex items-center justify-center mb-4">
              <Search className="h-7 w-7 text-[#38BDF8]/60" />
            </div>
            <p className="text-white/40 mb-4" style={{ fontFamily: 'var(--font-mono), monospace' }}>No agents registered yet.</p>
            <Link href="/agents/register" className="shiny-cta text-sm !px-6 !py-3">
              <span className="shiny-cta-text">Be the first to register</span>
            </Link>
          </div>
        )}

        {isLoading && (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] text-center py-16">
            <div className="mx-auto w-12 h-12 rounded-full border-2 border-[#38BDF8]/20 border-t-[#38BDF8] animate-spin mb-4" />
            <p className="text-white/40" style={{ fontFamily: 'var(--font-mono), monospace' }}>Loading agents...</p>
          </div>
        )}

        {!isLoading && filteredAndSortedAgents.length === 0 && agentCount > 0 && (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] text-center py-16">
            <p className="text-white/40" style={{ fontFamily: 'var(--font-mono), monospace' }}>No agents match your search.</p>
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
