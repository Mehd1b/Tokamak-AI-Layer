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
import { useFeedbackCount, useClientList } from '@/hooks/useReputation';
import { useAgentValidations } from '@/hooks/useValidation';
import { useRuntimeAgents } from '@/hooks/useAgentRuntime';
import { TaskSubmission } from '@/components/TaskSubmission';
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
  const { validationHashes } = useAgentValidations(agentId);
  const { agents: runtimeAgents } = useRuntimeAgents();
  const [copied, setCopied] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Match on-chain agent to runtime agent by checking if agentURI points to our runtime
  const runtimeAgent = runtimeAgents.find((ra) => {
    if (!agent?.agentURI) return false;
    return agent.agentURI.includes(`/api/agents/${ra.id}/`);
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-gray-500">Loading agent details...</p>
      </div>
    );
  }

  if (!agent?.owner) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/agents"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Agents
        </Link>
        <div className="card text-center py-12">
          <p className="text-gray-500">Agent not found.</p>
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
        className="mb-6 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Agents
      </Link>

      {/* Header */}
      <div className="card mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-tokamak-100 text-tokamak-700 text-2xl font-bold">
              #{agentId?.toString()}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {runtimeAgent ? runtimeAgent.name : `Agent #${agentId?.toString()}`}
              </h1>
              {runtimeAgent && (
                <p className="mt-0.5 text-sm text-gray-600">
                  {runtimeAgent.description}
                </p>
              )}
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  Owner: {shortenAddress(agent.owner)}
                </span>
                <button
                  onClick={() => copyAddress(agent.owner!)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  {copied ? (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {runtimeAgent && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
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
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Agent Information
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-gray-500">Agent URI</dt>
              <dd className="mt-1 flex items-center gap-2">
                <span className="truncate text-sm font-mono text-gray-900">
                  {agent.agentURI || 'Not set'}
                </span>
                {agent.agentURI && (
                  <a
                    href={agent.agentURI}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-tokamak-600 hover:text-tokamak-700"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Operator</dt>
              <dd className="mt-1 text-sm font-mono text-gray-900">
                {agent.operator && agent.operator !== zeroAddr
                  ? shortenAddress(agent.operator)
                  : 'None'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">ZK Identity</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {agent.zkIdentity && agent.zkIdentity !== zeroBytes
                  ? shortenAddress(agent.zkIdentity)
                  : 'Public Identity'}
              </dd>
            </div>
            {runtimeAgent && (
              <div>
                <dt className="text-sm text-gray-500">Version</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {runtimeAgent.version}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Stats */}
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Statistics
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xl font-bold text-tokamak-600">
                {feedbackCount?.toString() ?? '0'}
              </p>
              <p className="text-sm text-gray-500">Feedback Entries</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-tokamak-600">
                {clients?.length ?? 0}
              </p>
              <p className="text-sm text-gray-500">Unique Clients</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-tokamak-600">
                {validationHashes?.length ?? 0}
              </p>
              <p className="text-sm text-gray-500">Validations</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-tokamak-600">
                {agent.isVerifiedOperator ? 'Yes' : 'No'}
              </p>
              <p className="text-sm text-gray-500">Verified Operator</p>
            </div>
          </div>
        </div>
      </div>

      {/* Capabilities */}
      {runtimeAgent && runtimeAgent.capabilities.length > 0 && (
        <div className="mt-6 card">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Capabilities
          </h2>
          <div className="space-y-3">
            {runtimeAgent.capabilities.map((cap) => (
              <div
                key={cap.id}
                className="rounded-lg border border-gray-200 bg-gray-50 p-3"
              >
                <div className="flex items-center gap-2">
                  {agentConfig && <agentConfig.icon className="h-4 w-4 text-tokamak-600" />}
                  <span className="font-medium text-gray-900">{cap.name}</span>
                  <span className="rounded bg-tokamak-100 px-1.5 py-0.5 text-xs font-mono text-tokamak-700">
                    {cap.id}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-600">{cap.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Use Agent */}
      {runtimeAgent && agentConfig && (
        <div className="mt-6 card">
          <div className="mb-4 flex items-center gap-2">
            <Play className="h-5 w-5 text-tokamak-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Use {runtimeAgent.name}
            </h2>
          </div>
          <TaskSubmission
            agentId={runtimeAgent.id}
            agentName={runtimeAgent.name}
            placeholder={agentConfig.placeholder}
          />
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
