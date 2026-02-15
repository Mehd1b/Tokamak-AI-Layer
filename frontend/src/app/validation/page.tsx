'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Filter,
  CheckCircle,
  Clock,
  AlertTriangle,
  XCircle,
  Shield,
} from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { useAgentCount } from '@/hooks/useAgent';
import { useL2Config } from '@/hooks/useL2Config';
import { useAllValidationHashes, useValidationBatch } from '@/hooks/useValidation';
import {
  getValidationModelLabel,
  getValidationStatusLabel,
  getStatusColor,
  shortenAddress,
  formatBigInt,
} from '@/lib/utils';

export default function ValidationPage() {
  const { isConnected } = useWallet();
  const { nativeCurrency } = useL2Config();
  const { count: agentCount, isLoading: isLoadingCount } = useAgentCount();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<number | 'all'>('all');
  const [modelFilter, setModelFilter] = useState<number | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);

  const totalAgents = agentCount ? Number(agentCount) : 0;
  const { validations: allHashes, isLoading: isLoadingHashes } = useAllValidationHashes(totalAgents);
  const hashes = allHashes.map((v) => v.hash);
  const { validations, isLoading: isLoadingDetails } = useValidationBatch(hashes);

  const isLoading = isLoadingCount || isLoadingHashes || isLoadingDetails;

  // Filter validations by search query, status, and model
  const filteredValidations = validations.filter((v) => {
    if (statusFilter !== 'all' && v.request.status !== statusFilter) return false;
    if (modelFilter !== 'all' && v.request.model !== modelFilter) return false;
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      v.hash.toLowerCase().includes(query) ||
      v.request.agentId.toString().includes(query)
    );
  });

  return (
    <div className="mx-auto max-w-7xl px-6 pt-28 pb-16 lg:px-12">
      <div className="mb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm mb-6">
            <div className="w-2 h-2 rounded-full bg-[#38BDF8] animate-pulse" />
            <span className="text-xs tracking-widest text-gray-400 uppercase" style={{ fontFamily: 'var(--font-mono), monospace' }}>
              Trust Engine
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-light mb-3" style={{ fontFamily: 'var(--font-serif), serif' }}>
            <span className="italic text-[#38BDF8]">Validation</span>{' '}
            <span className="text-white">Registry</span>
          </h1>
          <p className="text-lg text-white/50 leading-relaxed" style={{ fontFamily: 'var(--font-mono), monospace' }}>
            Browse and request agent capability validations using multiple trust models.
          </p>
        </div>
        <Link href="/validation/request" className="shiny-cta text-sm !px-6 !py-3">
          <span className="shiny-cta-text flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Request Validation
          </span>
        </Link>
      </div>
      <div className="w-full h-px mb-10" style={{ background: 'linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.3), transparent)' }} />

      {/* Trust Model Overview */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
        {[
          {
            model: 0,
            icon: CheckCircle,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10',
            desc: 'No Validation Required - Outputs Valid by Default',
          },
          {
            model: 1,
            icon: Shield,
            color: 'text-blue-400',
            bg: 'bg-blue-500/10',
            desc: 'Secured by staked TON collateral',
          },
          {
            model: 2,
            icon: Clock,
            color: 'text-[#38BDF8]',
            bg: 'bg-[#38BDF8]/10',
            desc: 'Hardware-attested execution environment',
          },
          {
            model: 3,
            icon: AlertTriangle,
            color: 'text-amber-400',
            bg: 'bg-amber-500/10',
            desc: 'Combines multiple trust models',
          },
        ].map(({ model, icon: Icon, color, bg, desc }) => (
          <div key={model} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all duration-300 hover:border-[#38BDF8]/20">
            <Icon className={`h-6 w-6 ${color}`} />
            <h3 className="mt-2 font-medium text-white">
              {getValidationModelLabel(model)}
            </h3>
            <p className="mt-1 text-xs text-white/40">{desc}</p>
          </div>
        ))}
      </div>

      {/* Search Bar */}
      <div className="card mb-8">
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <input
              type="text"
              placeholder="Search validations by agent ID or request hash..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border-white/10 text-white placeholder-zinc-600 focus:border-[#38BDF8] focus:ring-1 focus:ring-[#38BDF8]/50 rounded-lg border py-2 pl-10 pr-4 text-sm focus:outline-none"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`btn-secondary flex items-center gap-2 ${(statusFilter !== 'all' || modelFilter !== 'all') ? 'border-[#38BDF8]/50 text-[#38BDF8]' : ''}`}
          >
            <Filter className="h-4 w-4" />
            Filters
            {(statusFilter !== 'all' || modelFilter !== 'all') && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#38BDF8] text-[10px] font-bold text-black">
                {(statusFilter !== 'all' ? 1 : 0) + (modelFilter !== 'all' ? 1 : 0)}
              </span>
            )}
          </button>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-white/10 pt-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-500">Status:</span>
              <div className="flex gap-1">
                {([['all', 'All'], [0, 'Pending'], [1, 'Completed'], [2, 'Expired'], [3, 'Disputed']] as const).map(([value, label]) => (
                  <button
                    key={String(value)}
                    onClick={() => setStatusFilter(value)}
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
                {([['all', 'All'], [0, 'Reputation'], [1, 'Stake'], [2, 'TEE'], [3, 'Hybrid']] as const).map(([value, label]) => (
                  <button
                    key={String(value)}
                    onClick={() => setModelFilter(value)}
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
            {(statusFilter !== 'all' || modelFilter !== 'all') && (
              <button
                onClick={() => { setStatusFilter('all'); setModelFilter('all'); }}
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
              >
                <XCircle className="h-3 w-3" /> Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Validation List */}
      <div className="space-y-4">
        {isLoading && (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] py-12 text-center">
            <p className="text-white/30">Loading validations...</p>
          </div>
        )}

        {!isLoading && filteredValidations.length === 0 && (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] py-12 text-center">
            <Shield className="mx-auto h-12 w-12 text-zinc-600" />
            <h3 className="mt-4 text-lg font-semibold text-white">
              {searchQuery ? 'No Matching Validations' : 'No Validations Yet'}
            </h3>
            <p className="mt-2 text-sm text-white/30">
              {searchQuery
                ? 'Try a different search query or clear the filter.'
                : 'Validation requests will appear here once agents begin requesting capability validations.'}
            </p>
            {!searchQuery && isConnected && (
              <p className="mt-4 text-xs text-white/20">
                To request a validation, visit an agent&apos;s detail page and
                select a trust model.
              </p>
            )}
          </div>
        )}

        {!isLoading &&
          filteredValidations.map((v) => {
            const statusColor = getStatusColor(v.request.status);
            const isCompleted = v.request.status === 1;
            const modelLabel = getValidationModelLabel(v.request.model);
            const statusLabel = getValidationStatusLabel(v.request.status);

            return (
              <Link key={v.hash} href={`/validation/${v.hash}`}>
                <div className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-300 hover:border-[#38BDF8]/30 hover:-translate-y-0.5 cursor-pointer">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-mono text-sm text-white">
                          {shortenAddress(v.hash, 12)}
                        </h3>
                        <span className={statusColor}>{statusLabel}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-white/30">Agent ID:</span>{' '}
                          <Link
                            href={`/agents/${v.request.agentId}`}
                            className="text-[#38BDF8] hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            #{v.request.agentId.toString()}
                          </Link>
                        </div>
                        <div>
                          <span className="text-white/30">Trust Model:</span>{' '}
                          <span className="font-medium">{modelLabel}</span>
                        </div>
                        {isCompleted && v.response.score > 0 && (
                          <div>
                            <span className="text-white/30">Score:</span>{' '}
                            <span className="font-medium">{v.response.score}/100</span>
                          </div>
                        )}
                        {v.request.bounty > 0n && (
                          <div>
                            <span className="text-white/30">Bounty:</span>{' '}
                            <span className="font-medium">
                              {formatBigInt(v.request.bounty)} {nativeCurrency}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
      </div>

      {/* Status Legend */}
      <div className="mt-8 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-sm">
        <h2 className="mb-4 text-lg font-semibold text-white">
          Validation Statuses
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-white">Pending</p>
              <p className="text-xs text-white/30">Awaiting validator</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <div>
              <p className="text-sm font-medium text-white">Completed</p>
              <p className="text-xs text-white/30">Successfully validated</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-500" />
            <div>
              <p className="text-sm font-medium text-white">Expired</p>
              <p className="text-xs text-white/30">Timed out</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <div>
              <p className="text-sm font-medium text-white">Disputed</p>
              <p className="text-xs text-white/30">Under review</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
