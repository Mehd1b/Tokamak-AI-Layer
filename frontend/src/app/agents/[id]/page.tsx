'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Shield,
  ExternalLink,
  Copy,
  CheckCircle,
  Play,
  FileText,
  FileCode,
} from 'lucide-react';
import { useAgent } from '@/hooks/useAgent';
import { useFeedbackCount, useClientList, useFeedbacks } from '@/hooks/useReputation';
import { FeedbackList } from '@/components/FeedbackList';
import { useAgentValidations } from '@/hooks/useValidation';
import { useRuntimeAgent } from '@/hooks/useAgentRuntime';
import { useAgentMetadata } from '@/hooks/useAgentMetadata';
import { useAgentFee } from '@/hooks/useTaskFee';
import { TaskSubmission } from '@/components/TaskSubmission';
import { formatEther } from 'viem';
import { FeedbackModal } from '@/components/FeedbackModal';
import { shortenAddress } from '@/lib/utils';
import { useState } from 'react';

const AGENT_CONFIG: Record<
  string,
  { icon: typeof FileText; placeholder: string }
> = {
  summarizer: {
    icon: FileText,
    placeholder:
      'Paste any text here to get a structured summary with key points...\n\nExample: Paste a news article, research paper abstract, or any long-form text.',
  },
  auditor: {
    icon: FileCode,
    placeholder:
      '// Paste Solidity code here for a security audit...\n\npragma solidity ^0.8.24;\n\ncontract Example {\n    // Your contract code here\n}',
  },
};

export default function AgentDetailPage() {
  const params = useParams();
  const agentId = params?.id ? BigInt(params.id as string) : undefined;
  const { agent, isLoading } = useAgent(agentId);
  const { count: feedbackCount } = useFeedbackCount(agentId);
  const { clients } = useClientList(agentId);
  const { feedbacks, isLoading: feedbacksLoading } = useFeedbacks(agentId, clients);
  const { validationHashes } = useAgentValidations(agentId);
  const { agent: runtimeAgent } = useRuntimeAgent(agentId?.toString());
  const { name: metaName, description: metaDescription, capabilities: metaCapabilities, services: metaServices, active: metaActive, pricing: metaPricing } = useAgentMetadata(agent?.agentURI);
  const { data: onChainFee } = useAgentFee(agentId);
  const [copied, setCopied] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-zinc-500">Loading agent details...</p>
      </div>
    );
  }

  if (!agent?.owner) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/agents"
          className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Agents
        </Link>
        <div className="card text-center py-12">
          <p className="text-zinc-500">Agent not found.</p>
        </div>
      </div>
    );
  }

  const zeroBytes =
    '0x0000000000000000000000000000000000000000000000000000000000000000';
  const zeroAddr = '0x0000000000000000000000000000000000000000';

  const agentConfig = runtimeAgent
    ? AGENT_CONFIG[runtimeAgent.id] || {
        icon: FileText,
        placeholder: 'Enter your input...',
      }
    : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/agents"
        className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Agents
      </Link>

      {/* Header */}
      <div className="card mb-6">
        <div className="flex items-start justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-[#38BDF8]/20 text-[#38BDF8] text-2xl font-bold">
              #{agentId?.toString()}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-white">
                {metaName || runtimeAgent?.name || `Agent #${agentId?.toString()}`}
              </h1>
              {(metaDescription || runtimeAgent?.description) && (
                <p className="mt-0.5 text-sm text-zinc-400 break-words">
                  {metaDescription || runtimeAgent?.description}
                </p>
              )}
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm text-zinc-500">
                  Owner: {shortenAddress(agent.owner)}
                </span>
                <button
                  onClick={() => copyAddress(agent.owner!)}
                  className="text-zinc-600 hover:text-zinc-400"
                >
                  {copied ? (
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {runtimeAgent && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                <Play className="h-3 w-3" /> Live
              </span>
            )}
            {agent.isVerifiedOperator && (
              <span className="badge-success flex items-center gap-1">
                <Shield className="h-3 w-3" /> Verified Operator
              </span>
            )}
            {agent.zkIdentity && agent.zkIdentity !== zeroBytes && (
              <span className="badge-info">ZK Identity</span>
            )}
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Info */}
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-white">
            Agent Information
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-zinc-500">Agent URI</dt>
              <dd className="mt-1 flex items-center gap-2">
                <span className="truncate text-sm font-mono text-white">
                  {agent.agentURI || 'Not set'}
                </span>
                {agent.agentURI && (
                  <a
                    href={agent.agentURI}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#38BDF8] hover:text-[#38BDF8]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-zinc-500">Operator</dt>
              <dd className="mt-1 text-sm font-mono text-white">
                {agent.operator && agent.operator !== zeroAddr
                  ? shortenAddress(agent.operator)
                  : 'None'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-zinc-500">ZK Identity</dt>
              <dd className="mt-1 text-sm text-white">
                {agent.zkIdentity && agent.zkIdentity !== zeroBytes
                  ? shortenAddress(agent.zkIdentity)
                  : 'Public Identity'}
              </dd>
            </div>
            {runtimeAgent && (
              <div>
                <dt className="text-sm text-zinc-500">Version</dt>
                <dd className="mt-1 text-sm text-white">
                  {runtimeAgent.version}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Stats */}
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-white">
            Statistics
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xl font-bold text-[#38BDF8]">
                {feedbackCount?.toString() ?? '0'}
              </p>
              <p className="text-sm text-zinc-500">Feedback Entries</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#38BDF8]">
                {clients?.length ?? 0}
              </p>
              <p className="text-sm text-zinc-500">Unique Clients</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#38BDF8]">
                {validationHashes?.length ?? 0}
              </p>
              <p className="text-sm text-zinc-500">Validations</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#38BDF8]">
                {agent.isVerifiedOperator ? 'Yes' : 'No'}
              </p>
              <p className="text-sm text-zinc-500">Verified Operator</p>
            </div>
          </div>
        </div>
      </div>

      {/* Capabilities */}
      {((runtimeAgent && runtimeAgent.capabilities.length > 0) || (metaCapabilities && metaCapabilities.length > 0)) && (
        <div className="mt-6 card">
          <h2 className="mb-4 text-lg font-semibold text-white">
            Capabilities
          </h2>
          <div className="space-y-3">
            {(runtimeAgent?.capabilities || (metaCapabilities || []).map((c, i) => ({ id: `cap-${i}`, name: c, description: '' }))).map((cap) => (
              <div
                key={cap.id}
                className="rounded-lg border border-white/10 bg-white/5 p-3"
              >
                <div className="flex items-center gap-2">
                  {agentConfig && <agentConfig.icon className="h-4 w-4 text-[#38BDF8]" />}
                  <span className="font-medium text-white">{cap.name}</span>
                  <span className="rounded bg-[#38BDF8]/20 px-1.5 py-0.5 text-xs font-mono text-[#38BDF8]">
                    {cap.id}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-400">{cap.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Service Endpoints */}
      {metaServices && Object.keys(metaServices).length > 0 && (
        <div className="mt-6 card">
          <h2 className="mb-4 text-lg font-semibold text-white">
            Service Endpoints
          </h2>
          <div className="space-y-2">
            {Object.entries(metaServices).map(([type, url]) => (
              <div key={type} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-zinc-300">{type}:</span>{' '}
                  <span className="text-sm text-zinc-400 break-all">{url}</span>
                </div>
                <a href={url} target="_blank" rel="noopener noreferrer" className="ml-2 text-[#38BDF8] hover:text-[#38BDF8] flex-shrink-0">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fee Info */}
      {onChainFee && onChainFee > 0n && (
        <div className="mt-6 card border-[#38BDF8]/20 bg-[#38BDF8]/5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Task Fee</h2>
              <p className="text-sm text-zinc-400">This agent charges a fee per task execution</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-[#38BDF8]">
                {formatEther(onChainFee)} TON
              </p>
              <p className="text-xs text-zinc-500">per task</p>
            </div>
          </div>
        </div>
      )}

      {/* Use Agent */}
      {runtimeAgent && agentConfig && (
        <div className="mt-6 card">
          <div className="mb-4 flex items-center gap-2">
            <Play className="h-5 w-5 text-[#38BDF8]" />
            <h2 className="text-lg font-semibold text-white">
              Use {metaName || runtimeAgent.name}
            </h2>
          </div>
          <TaskSubmission
            agentId={agentId!.toString()}
            agentName={metaName || runtimeAgent.name}
            placeholder={agentConfig.placeholder}
            onChainAgentId={agentId}
            feePerTask={onChainFee}
          />
        </div>
      )}

      {/* Recent Feedback */}
      {feedbacks.length > 0 && (
        <div className="mt-6 card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Recent Feedback</h2>
            <Link
              href={`/reputation/${agentId}`}
              className="text-sm text-[#38BDF8] hover:underline"
            >
              View all
            </Link>
          </div>
          <FeedbackList feedbacks={feedbacks} isLoading={feedbacksLoading} limit={3} />
        </div>
      )}

      {/* Actions */}
      <div className="mt-6 flex gap-4">
        <Link href={`/reputation/${agentId}`} className="btn-primary">
          View Reputation
        </Link>
        <button
          onClick={() => setShowFeedbackModal(true)}
          className="btn-secondary"
        >
          Submit Feedback
        </button>
        <Link
          href={`/validation/request?agentId=${agentId}`}
          className="btn-secondary"
        >
          Request Validation
        </Link>
      </div>

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <FeedbackModal
          agentId={BigInt(params.id as string)}
          agentOwner={agent.owner || ''}
          onClose={() => setShowFeedbackModal(false)}
        />
      )}
    </div>
  );
}
