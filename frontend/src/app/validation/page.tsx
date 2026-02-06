'use client';

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
import { getValidationModelLabel } from '@/lib/utils';

export default function ValidationPage() {
  const { isConnected } = useWallet();
  const { count: agentCount, isLoading } = useAgentCount();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Validation Registry
          </h1>
          <p className="mt-2 text-gray-600">
            Browse and request agent capability validations using multiple trust
            models.
          </p>
        </div>
      </div>

      {/* Trust Model Overview */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
        {[
          {
            model: 0,
            icon: CheckCircle,
            color: 'text-green-500',
            bg: 'bg-green-50',
            desc: 'Based on aggregated reputation scores',
          },
          {
            model: 1,
            icon: Shield,
            color: 'text-blue-500',
            bg: 'bg-blue-50',
            desc: 'Secured by staked TON collateral',
          },
          {
            model: 2,
            icon: Clock,
            color: 'text-purple-500',
            bg: 'bg-purple-50',
            desc: 'Hardware-attested execution environment',
          },
          {
            model: 3,
            icon: AlertTriangle,
            color: 'text-amber-500',
            bg: 'bg-amber-50',
            desc: 'Combines multiple trust models',
          },
        ].map(({ model, icon: Icon, color, bg, desc }) => (
          <div key={model} className={`card ${bg} border-0`}>
            <Icon className={`h-6 w-6 ${color}`} />
            <h3 className="mt-2 font-semibold text-gray-900">
              {getValidationModelLabel(model)}
            </h3>
            <p className="mt-1 text-xs text-gray-600">{desc}</p>
          </div>
        ))}
      </div>

      {/* Search Bar */}
      <div className="card mb-8">
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search validations by agent ID or request hash..."
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-tokamak-500 focus:outline-none focus:ring-1 focus:ring-tokamak-500"
            />
          </div>
          <button className="btn-secondary flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </button>
        </div>
      </div>

      {/* Validation List */}
      <div className="space-y-4">
        {isLoading && (
          <div className="card py-12 text-center">
            <p className="text-gray-500">Loading validations...</p>
          </div>
        )}

        {!isLoading && (
          <div className="card py-12 text-center">
            <Shield className="mx-auto h-12 w-12 text-gray-300" />
            <h3 className="mt-4 text-lg font-semibold text-gray-900">
              No Validations Yet
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              Validation requests will appear here once agents begin requesting
              capability validations.
            </p>
            {isConnected && (
              <p className="mt-4 text-xs text-gray-400">
                To request a validation, visit an agent&apos;s detail page and
                select a trust model.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Status Legend */}
      <div className="mt-8 card">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Validation Statuses
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-gray-900">Pending</p>
              <p className="text-xs text-gray-500">Awaiting validator</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <div>
              <p className="text-sm font-medium text-gray-900">Completed</p>
              <p className="text-xs text-gray-500">Successfully validated</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-500" />
            <div>
              <p className="text-sm font-medium text-gray-900">Expired</p>
              <p className="text-xs text-gray-500">Timed out</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <div>
              <p className="text-sm font-medium text-gray-900">Disputed</p>
              <p className="text-xs text-gray-500">Under review</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
