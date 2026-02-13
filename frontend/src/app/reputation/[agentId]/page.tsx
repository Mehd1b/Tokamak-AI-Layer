'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Star, TrendingUp, Users, Shield } from 'lucide-react';
import { useFeedbackCount, useClientList, useReputationSummary, useVerifiedSummary, useFeedbacks } from '@/hooks/useReputation';
import { useAgent } from '@/hooks/useAgent';
import { FeedbackList } from '@/components/FeedbackList';

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
  const { feedbacks, isLoading: feedbacksLoading } = useFeedbacks(agentId, clients);

  const isLoading = agentLoading || feedbackLoading || clientsLoading || standardLoading || verifiedLoading;

  return (
    <div className="mx-auto max-w-4xl px-6 pt-28 pb-16 lg:px-12">
      <Link
        href={agentId ? `/agents/${agentId}` : '/agents'}
        className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Agent
      </Link>

      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm mb-6">
        <div className="w-2 h-2 rounded-full bg-[#38BDF8] animate-pulse" />
        <span className="text-xs tracking-widest text-gray-400 uppercase" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          Reputation
        </span>
      </div>
      <h1 className="text-4xl md:text-5xl font-light mb-3" style={{ fontFamily: 'var(--font-serif), serif' }}>
        <span className="italic text-[#38BDF8]">Reputation</span>{' '}
        <span className="text-white">for Agent #{agentId?.toString()}</span>
      </h1>
      <p className="mb-8 text-lg text-white/50 leading-relaxed" style={{ fontFamily: 'var(--font-mono), monospace' }}>
        On-chain reputation data from verified client interactions.
      </p>
      <div className="w-full h-px mb-10" style={{ background: 'linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.3), transparent)' }} />

      {isLoading ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] text-center py-12">
          <p className="text-white/40">Loading reputation data...</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-center transition-all duration-300 hover:border-[#38BDF8]/20">
              <Star className="mx-auto h-8 w-8 text-[#38BDF8]" />
              <p className="mt-2 text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-mono), monospace' }}>{formatAverage(standardSummary)}</p>
              <p className="text-sm text-white/40">Average Score</p>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-center transition-all duration-300 hover:border-[#38BDF8]/20">
              <TrendingUp className="mx-auto h-8 w-8 text-emerald-400" />
              <p className="mt-2 text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-mono), monospace' }}>
                {feedbackCount?.toString() ?? '0'}
              </p>
              <p className="text-sm text-white/40">Total Feedback</p>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-center transition-all duration-300 hover:border-[#38BDF8]/20">
              <Users className="mx-auto h-8 w-8 text-[#38BDF8]/70" />
              <p className="mt-2 text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-mono), monospace' }}>
                {clients?.length ?? 0}
              </p>
              <p className="text-sm text-white/40">Unique Clients</p>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-center transition-all duration-300 hover:border-[#38BDF8]/20">
              <Shield className="mx-auto h-8 w-8 text-purple-400" />
              <p className="mt-2 text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-mono), monospace' }}>{formatAverage(verifiedSummary)}</p>
              <p className="text-sm text-white/40">Verified Score</p>
            </div>
          </div>

          {/* Reputation Types */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-sm">
              <h3 className="mb-2 font-medium text-white">
                Standard Reputation
              </h3>
              <p className="text-sm text-white/40">
                Aggregated from all client feedback. Client filtering
                (ERC-8004) prevents Sybil attacks.
              </p>
              <div className="mt-4 rounded-lg bg-white/5 p-3 text-center">
                <p className="text-xl font-bold text-white">{formatAverage(standardSummary)}</p>
                <p className="text-xs text-white/40">Score</p>
                <p className="text-xs text-white/30 mt-1">Range: {formatRange(standardSummary)}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-sm">
              <h3 className="mb-2 font-medium text-white">
                Stake-Weighted
              </h3>
              <p className="text-sm text-white/40">
                Weighted by sqrt(reviewerStake). Feedback from stakers counts
                more.
              </p>
              <div className="mt-4 rounded-lg bg-white/5 p-3 text-center">
                <p className="text-xl font-bold text-white">{formatAverage(standardSummary)}</p>
                <p className="text-xs text-white/40">Weighted Score</p>
                <p className="text-xs text-white/30 mt-1">Range: {formatRange(standardSummary)}</p>
                <p className="text-[10px] text-white/20 mt-2">
                  Uses standard summary as proxy (stake-weighted API not yet available)
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-sm">
              <h3 className="mb-2 font-medium text-white">
                Verified Only
              </h3>
              <p className="text-sm text-white/40">
                Only feedback linked to validated tasks. Highest trust level.
              </p>
              <div className="mt-4 rounded-lg bg-white/5 p-3 text-center">
                <p className="text-xl font-bold text-white">{formatAverage(verifiedSummary)}</p>
                <p className="text-xs text-white/40">Verified Score</p>
                <p className="text-xs text-white/30 mt-1">Range: {formatRange(verifiedSummary)}</p>
              </div>
            </div>
          </div>

          {/* Feedback List */}
          <div className="mt-8 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-sm">
            <h2 className="mb-4 text-lg font-medium text-white">
              Recent Feedback
            </h2>
            <FeedbackList feedbacks={feedbacks} isLoading={feedbacksLoading} />
          </div>
        </>
      )}
    </div>
  );
}
