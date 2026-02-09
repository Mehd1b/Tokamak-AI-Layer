'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Star, TrendingUp, Users, Shield } from 'lucide-react';
import { useFeedbackCount, useClientList, useReputationSummary, useVerifiedSummary } from '@/hooks/useReputation';
import { useAgent } from '@/hooks/useAgent';

function formatAverage(summary: { totalValue: bigint; count: bigint; min: bigint; max: bigint } | undefined): string {
  if (!summary || summary.count === 0n) {
    return 'N/A';
  }
  const average = Number(summary.totalValue) / Number(summary.count) / 10;
  return average.toFixed(1);
}

function formatRange(summary: { totalValue: bigint; count: bigint; min: bigint; max: bigint } | undefined): string {
  if (!summary || summary.count === 0n) {
    return 'N/A';
  }
  const min = Number(summary.min) / 10;
  const max = Number(summary.max) / 10;
  return `${min.toFixed(1)} - ${max.toFixed(1)}`;
}

export default function ReputationPage() {
  const params = useParams();
  const agentId = params?.agentId ? BigInt(params.agentId as string) : undefined;
  const { agent, isLoading: agentLoading } = useAgent(agentId);
  const { count: feedbackCount, isLoading: feedbackLoading } =
    useFeedbackCount(agentId);
  const { clients, isLoading: clientsLoading } = useClientList(agentId);
  const { summary: standardSummary, isLoading: standardLoading } =
    useReputationSummary(agentId, clients ?? []);
  const { summary: verifiedSummary, isLoading: verifiedLoading } =
    useVerifiedSummary(agentId, clients ?? []);

  const isLoading = agentLoading || feedbackLoading || clientsLoading || standardLoading || verifiedLoading;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href={agentId ? `/agents/${agentId}` : '/agents'}
        className="mb-6 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Agent
      </Link>

      <h1 className="mb-2 text-3xl font-bold text-gray-900">
        Reputation for Agent #{agentId?.toString()}
      </h1>
      <p className="mb-8 text-gray-600">
        On-chain reputation data from verified client interactions.
      </p>

      {isLoading ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">Loading reputation data...</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
            <div className="card text-center">
              <Star className="mx-auto h-8 w-8 text-amber-500" />
              <p className="mt-2 text-2xl font-bold text-gray-900">{formatAverage(standardSummary)}</p>
              <p className="text-sm text-gray-500">Average Score</p>
            </div>
            <div className="card text-center">
              <TrendingUp className="mx-auto h-8 w-8 text-green-500" />
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {feedbackCount?.toString() ?? '0'}
              </p>
              <p className="text-sm text-gray-500">Total Feedback</p>
            </div>
            <div className="card text-center">
              <Users className="mx-auto h-8 w-8 text-blue-500" />
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {clients?.length ?? 0}
              </p>
              <p className="text-sm text-gray-500">Unique Clients</p>
            </div>
            <div className="card text-center">
              <Shield className="mx-auto h-8 w-8 text-purple-500" />
              <p className="mt-2 text-2xl font-bold text-gray-900">{formatAverage(verifiedSummary)}</p>
              <p className="text-sm text-gray-500">Verified Score</p>
            </div>
          </div>

          {/* Reputation Types */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="card">
              <h3 className="mb-2 font-semibold text-gray-900">
                Standard Reputation
              </h3>
              <p className="text-sm text-gray-600">
                Aggregated from all client feedback. Client filtering
                (ERC-8004) prevents Sybil attacks.
              </p>
              <div className="mt-4 rounded-lg bg-gray-50 p-3 text-center">
                <p className="text-xl font-bold text-gray-900">{formatAverage(standardSummary)}</p>
                <p className="text-xs text-gray-500">Score</p>
                <p className="text-xs text-gray-400 mt-1">Range: {formatRange(standardSummary)}</p>
              </div>
            </div>

            <div className="card">
              <h3 className="mb-2 font-semibold text-gray-900">
                Stake-Weighted
              </h3>
              <p className="text-sm text-gray-600">
                Weighted by sqrt(reviewerStake). Feedback from stakers counts
                more.
              </p>
              <div className="mt-4 rounded-lg bg-gray-50 p-3 text-center">
                <p className="text-xl font-bold text-gray-900">{formatAverage(standardSummary)}</p>
                <p className="text-xs text-gray-500">Weighted Score</p>
                <p className="text-xs text-gray-400 mt-1">Range: {formatRange(standardSummary)}</p>
              </div>
            </div>

            <div className="card">
              <h3 className="mb-2 font-semibold text-gray-900">
                Verified Only
              </h3>
              <p className="text-sm text-gray-600">
                Only feedback linked to validated tasks. Highest trust level.
              </p>
              <div className="mt-4 rounded-lg bg-gray-50 p-3 text-center">
                <p className="text-xl font-bold text-gray-900">{formatAverage(verifiedSummary)}</p>
                <p className="text-xs text-gray-500">Verified Score</p>
                <p className="text-xs text-gray-400 mt-1">Range: {formatRange(verifiedSummary)}</p>
              </div>
            </div>
          </div>

          {/* Feedback List */}
          <div className="mt-8 card">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Recent Feedback
            </h2>
            {Number(feedbackCount ?? 0) === 0 ? (
              <p className="text-center text-sm text-gray-500 py-8">
                No feedback submitted yet for this agent.
              </p>
            ) : (
              <p className="text-center text-sm text-gray-500 py-8">
                Individual feedback details require the subgraph indexer.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
