'use client';

import Link from 'next/link';
import { Search, Filter, ChevronRight, Shield, Star } from 'lucide-react';
import { useAgentCount } from '@/hooks/useAgent';
import { shortenAddress } from '@/lib/utils';

export default function AgentsPage() {
  const { count, isLoading } = useAgentCount();

  const agentCount = count ? Number(count) : 0;

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

      {/* Search and Filter Bar */}
      <div className="card mb-8">
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search agents by name, capability, or address..."
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-tokamak-500 focus:outline-none focus:ring-1 focus:ring-tokamak-500"
            />
          </div>
          <button className="btn-secondary flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </button>
        </div>
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

        {agentCount > 0 &&
          Array.from({ length: Math.min(agentCount, 20) }, (_, i) => (
            <Link
              key={i + 1}
              href={`/agents/${i + 1}`}
              className="card flex items-center justify-between transition-shadow hover:shadow-md"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tokamak-100 text-tokamak-700 font-bold">
                  #{i + 1}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    Agent #{i + 1}
                  </h3>
                  <p className="text-sm text-gray-500">
                    Click to view details
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="hidden sm:flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-500" />
                  <span className="text-sm text-gray-600">-</span>
                </div>
                <div className="hidden sm:flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-gray-600">-</span>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400" />
              </div>
            </Link>
          ))}
      </div>
    </div>
  );
}
