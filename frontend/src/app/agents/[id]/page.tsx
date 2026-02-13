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
  UserPlus,
  UserMinus,
  LogOut,
  RefreshCw,
  Clock,
  Globe,
  Link2,
  Fingerprint,
  Hash,
  Cpu,
  Trash2,
  AlertTriangle,
  Code,
} from 'lucide-react';
import { useAgent, useCanReactivate, useReactivate } from '@/hooks/useAgent';
import { useOperatorManagement } from '@/hooks/useOperatorManagement';
import { useDeregisterAgent } from '@/hooks/useDeregisterAgent';
import { useFeedbackCount, useClientList, useFeedbacks } from '@/hooks/useReputation';
import { FeedbackList } from '@/components/FeedbackList';
import { useAgentValidations, useValidationStats } from '@/hooks/useValidation';
import { useRuntimeAgent } from '@/hooks/useAgentRuntime';
import { useAgentMetadata } from '@/hooks/useAgentMetadata';
import { useAgentFee } from '@/hooks/useTaskFee';
import { useL2Config } from '@/hooks/useL2Config';
import { TaskSubmission } from '@/components/TaskSubmission';
import { AgentCustomUI } from '@/components/AgentCustomUI';
import { formatEther } from 'viem';
import { FeedbackModal } from '@/components/FeedbackModal';
import { shortenAddress, getAgentStatusLabel, getAgentStatusColor, getValidationModelLabel, getValidationModelColor } from '@/lib/utils';
import { useState } from 'react';
import { useWallet } from '@/hooks/useWallet';

const SERVICE_TYPE_CONFIG: Record<string, { icon: typeof Globe; color: string; label: string }> = {
  A2A: { icon: Link2, color: 'text-blue-400', label: 'Agent-to-Agent Protocol' },
  MCP: { icon: Cpu, color: 'text-emerald-400', label: 'Model Context Protocol' },
  OASF: { icon: Globe, color: 'text-purple-400', label: 'Open Agent Service Format' },
  DID: { icon: Fingerprint, color: 'text-amber-400', label: 'Decentralized Identifier' },
  ENS: { icon: Hash, color: 'text-cyan-400', label: 'Ethereum Name Service' },
};

function getServiceConfig(type: string) {
  return SERVICE_TYPE_CONFIG[type] || { icon: Globe, color: 'text-white/40', label: type };
}

export default function AgentDetailPage() {
  const params = useParams();
  const agentId = params?.id ? BigInt(params.id as string) : undefined;
  const { agent, isLoading } = useAgent(agentId);
  const { count: feedbackCount } = useFeedbackCount(agentId);
  const { clients } = useClientList(agentId);
  const { feedbacks, isLoading: feedbacksLoading } = useFeedbacks(agentId, clients);
  const { validationHashes } = useAgentValidations(agentId);
  const { total: valTotal, failed: valFailed, failureRate: valFailureRate, isLoading: valStatsLoading } = useValidationStats(agentId);
  const { agent: runtimeAgent } = useRuntimeAgent(agentId?.toString());
  const { name: metaName, description: metaDescription, capabilities: metaCapabilities, talCapabilities: metaTalCapabilities, requestExample: metaRequestExample, services: metaServices, active: metaActive, pricing: metaPricing, customUI: metaCustomUI } = useAgentMetadata(agent?.agentURI);
  const { data: onChainFee } = useAgentFee(agentId);
  const { nativeCurrency } = useL2Config();
  const { address } = useWallet();
  const { canReactivate } = useCanReactivate(agentId);
  const { reactivate, isPending: isReactivating, isConfirming: isReactivateConfirming, isSuccess: isReactivateSuccess } = useReactivate();
  const { removeOperator, operatorExit, isRemoving, isExiting } = useOperatorManagement();
  const { deregister, hash: deregisterHash, isPending: isDeregisterPending, isConfirming: isDeregisterConfirming, isSuccess: isDeregisterSuccess } = useDeregisterAgent();
  const [copied, setCopied] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddOperator, setShowAddOperator] = useState(false);
  const [newOperatorAddress, setNewOperatorAddress] = useState('');
  const [customTaskResult, setCustomTaskResult] = useState<{ output: string; status: string; taskId: string } | null>(null);
  const [useBasicInterface, setUseBasicInterface] = useState(false);

  const handleCustomTaskSubmit = async (input: string) => {
    setCustomTaskResult(null);
    const a2aUrl = metaServices?.A2A;
    if (!a2aUrl) {
      setCustomTaskResult({ output: 'No A2A service endpoint configured for this agent. The agent owner must add an A2A service URL during registration.', status: 'failed', taskId: '' });
      return;
    }
    try {
      // Wrap input in A2A JSON-RPC 2.0 envelope
      const rpcId = crypto.randomUUID();
      const a2aRequest = {
        jsonrpc: '2.0',
        id: rpcId,
        method: 'tasks/send',
        params: {
          message: {
            role: 'user',
            parts: [{ type: 'text', text: input }],
          },
        },
      };

      const res = await fetch(a2aUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(a2aRequest),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errData.error?.message || errData.error || `HTTP ${res.status}`);
      }
      const rpcResponse = await res.json();

      // Handle JSON-RPC error response
      if (rpcResponse.error) {
        throw new Error(rpcResponse.error.message || 'A2A request failed');
      }

      // Extract output from A2A task artifacts or messages
      const a2aTask = rpcResponse.result;
      let output = '';
      if (a2aTask?.artifacts?.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dataParts = a2aTask.artifacts.flatMap((a: any) => a.parts || []).filter((p: any) => p.type === 'data').map((p: any) => p.data);
        output = dataParts.length === 1 ? JSON.stringify(dataParts[0]) : JSON.stringify(dataParts);
      } else if (a2aTask?.messages?.length) {
        const lastMsg = a2aTask.messages[a2aTask.messages.length - 1];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const textParts = (lastMsg?.parts || []).filter((p: any) => p.type === 'text').map((p: any) => p.text);
        output = textParts.join('\n');
      } else {
        output = JSON.stringify(rpcResponse);
      }

      setCustomTaskResult({
        output,
        status: a2aTask?.status?.state === 'failed' ? 'failed' : 'completed',
        taskId: a2aTask?.id || rpcId,
      });
    } catch (err) {
      setCustomTaskResult({ output: err instanceof Error ? err.message : 'Request failed', status: 'failed', taskId: '' });
    }
  };

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-6 pt-28 pb-16 lg:px-12">
        <p className="text-white/30">Loading agent details...</p>
      </div>
    );
  }

  if (!agent?.owner) {
    return (
      <div className="mx-auto max-w-4xl px-6 pt-28 pb-16 lg:px-12">
        <Link
          href="/agents"
          className="mb-4 inline-flex items-center gap-1 text-sm text-white/40 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Agents
        </Link>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-sm text-center py-12">
          <p className="text-white/30">Agent not found.</p>
        </div>
      </div>
    );
  }

  const zeroBytes =
    '0x0000000000000000000000000000000000000000000000000000000000000000';
  const zeroAddr = '0x0000000000000000000000000000000000000000';

  const isOwner = address && agent?.owner && address.toLowerCase() === agent.owner.toLowerCase();
  const hasRuntime = !!runtimeAgent || !!metaServices?.A2A || !!metaCustomUI?.html;
  const agentDisplayName = metaName || runtimeAgent?.name || `Agent #${agentId?.toString()}`;
  const placeholder =
    metaTalCapabilities?.[0]?.placeholder ||
    runtimeAgent?.capabilities?.[0]?.description ||
    'Describe your request...';

  return (
    <div className="mx-auto max-w-4xl px-6 pt-28 pb-16 lg:px-12">
      <Link
        href="/agents"
        className="mb-6 inline-flex items-center gap-1 text-sm text-white/40 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Agents
      </Link>

      {/* Header */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-sm transition-all duration-300 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-[#38BDF8]/20 text-[#38BDF8] text-2xl font-bold" style={{ fontFamily: 'var(--font-mono), monospace' }}>
              #{agentId?.toString()}
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-light text-white" style={{ fontFamily: 'var(--font-serif), serif' }}>
                {metaName || runtimeAgent?.name || `Agent #${agentId?.toString()}`}
              </h1>
              {(metaDescription || runtimeAgent?.description) && (
                <p className="mt-0.5 text-sm text-white/40 break-words">
                  {metaDescription || runtimeAgent?.description}
                </p>
              )}
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm text-white/30">
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
          <div className="flex flex-wrap gap-2">
            {runtimeAgent && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                <Play className="h-3 w-3" /> Live
              </span>
            )}
            {agent.status !== undefined && (
              <span className={`${getAgentStatusColor(agent.status)} flex items-center gap-1`}>
                {getAgentStatusLabel(agent.status)}
              </span>
            )}
            {agent.validationModel !== undefined && (
              <span className={`${getValidationModelColor(agent.validationModel)} flex items-center gap-1`}>
                {getValidationModelLabel(agent.validationModel)}
              </span>
            )}
            {agent.isVerifiedOperator && (
              <span className="badge-success flex items-center gap-1">
                <Shield className="h-3 w-3" /> Verified Operator
              </span>
            )}
            {agent.zkIdentity && agent.zkIdentity !== zeroBytes && (
              <span className="badge-info flex items-center gap-1" title="This agent has a zero-knowledge verified identity commitment on-chain">
                <Fingerprint className="h-3 w-3" /> ZK-Verified Identity
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Gradient Line */}
      <div className="w-full h-px my-8" style={{ background: 'linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.3), transparent)' }} />

      {/* Reactivation Banner */}
      {agent.status === 1 && isOwner && (
        <div className="mb-6 card border-amber-500/20 bg-amber-500/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-400" />
              <div>
                <p className="text-sm font-medium text-amber-400">Agent is Paused</p>
                <p className="text-xs text-amber-300">
                  {canReactivate
                    ? 'Cooldown period has elapsed. You can reactivate this agent.'
                    : 'Cooldown period has not elapsed yet.'}
                </p>
              </div>
            </div>
            <button
              onClick={() => agentId && reactivate(agentId)}
              disabled={!canReactivate || isReactivating || isReactivateConfirming}
              className="btn-primary flex items-center gap-1.5 text-sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isReactivating || isReactivateConfirming ? 'animate-spin' : ''}`} />
              {isReactivating ? 'Confirm...' : isReactivateConfirming ? 'Reactivating...' : isReactivateSuccess ? 'Reactivated!' : 'Reactivate'}
            </button>
          </div>
        </div>
      )}

      {/* Details Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Info */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-sm transition-all duration-300">
          <h2 className="mb-4 text-lg font-medium text-white">
            Agent Information
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-white/30">Agent URI</dt>
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
              <dt className="text-sm text-white/30">Validation Model</dt>
              <dd className="mt-1 text-sm text-white">
                {agent.validationModel !== undefined
                  ? getValidationModelLabel(agent.validationModel)
                  : 'Reputation Only'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-white/30">Operator (V1)</dt>
              <dd className="mt-1 text-sm font-mono text-white">
                {agent.operator && agent.operator !== zeroAddr
                  ? shortenAddress(agent.operator)
                  : 'None'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-white/30">ZK Identity</dt>
              <dd className="mt-1 text-sm text-white">
                {agent.zkIdentity && agent.zkIdentity !== zeroBytes
                  ? shortenAddress(agent.zkIdentity)
                  : 'Public Identity'}
              </dd>
            </div>
            {runtimeAgent && (
              <div>
                <dt className="text-sm text-white/30">Version</dt>
                <dd className="mt-1 text-sm text-white">
                  {runtimeAgent.version}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Stats */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-sm transition-all duration-300">
          <h2 className="mb-4 text-lg font-medium text-white">
            Statistics
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xl font-bold text-[#38BDF8]" style={{ fontFamily: 'var(--font-mono), monospace' }}>
                {feedbackCount?.toString() ?? '0'}
              </p>
              <p className="text-sm text-white/30">Feedback Entries</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#38BDF8]" style={{ fontFamily: 'var(--font-mono), monospace' }}>
                {clients?.length ?? 0}
              </p>
              <p className="text-sm text-white/30">Unique Clients</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#38BDF8]" style={{ fontFamily: 'var(--font-mono), monospace' }}>
                {validationHashes?.length ?? 0}
              </p>
              <p className="text-sm text-white/30">Validations</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#38BDF8]" style={{ fontFamily: 'var(--font-mono), monospace' }}>
                {agent.isVerifiedOperator ? 'Yes' : 'No'}
              </p>
              <p className="text-sm text-white/30">Verified Operator</p>
            </div>
          </div>
        </div>
      </div>

      {/* Validation Stats (V2) */}
      {!valStatsLoading && valTotal > 0 && (
        <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-sm transition-all duration-300">
          <h2 className="mb-4 text-lg font-medium text-white">
            Validation Stats (30-day window)
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-2xl font-bold text-[#38BDF8]" style={{ fontFamily: 'var(--font-mono), monospace' }}>{valTotal}</p>
              <p className="text-sm text-white/30">Total Validations</p>
            </div>
            <div>
              <p className={`text-2xl font-bold ${valFailed > 0 ? 'text-red-400' : 'text-emerald-400'}`} style={{ fontFamily: 'var(--font-mono), monospace' }}>
                {valFailed}
              </p>
              <p className="text-sm text-white/30">Failed</p>
            </div>
            <div>
              <p className={`text-2xl font-bold ${valFailureRate > 30 ? 'text-red-400' : valFailureRate > 10 ? 'text-amber-400' : 'text-emerald-400'}`} style={{ fontFamily: 'var(--font-mono), monospace' }}>
                {valFailureRate.toFixed(1)}%
              </p>
              <p className="text-sm text-white/30">Failure Rate</p>
            </div>
          </div>
          {valFailureRate > 30 && (
            <p className="mt-3 text-sm text-red-400">
              Warning: Failure rate exceeds 30% slashing threshold
            </p>
          )}
        </div>
      )}

      {/* Operators (V2) */}
      {agent.operators && agent.operators.length > 0 && (
        <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-sm transition-all duration-300">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">
              Operators ({agent.operators.length})
            </h2>
            {isOwner && (
              <button
                onClick={() => setShowAddOperator(!showAddOperator)}
                className="btn-secondary flex items-center gap-1 text-xs"
              >
                <UserPlus className="h-3 w-3" /> Add Operator
              </button>
            )}
          </div>

          {/* Add Operator Form */}
          {showAddOperator && isOwner && (
            <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="mb-2 text-xs text-white/40">
                External operators must sign an EIP-712 consent separately (via SDK). Enter the operator address to register.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newOperatorAddress}
                  onChange={(e) => setNewOperatorAddress(e.target.value)}
                  placeholder="0x... operator address"
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-mono text-white placeholder-zinc-600 focus:border-[#38BDF8] focus:outline-none"
                />
                <button
                  onClick={() => setShowAddOperator(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {agent.operators.map((op, idx) => {
              const isOperatorSelf = address?.toLowerCase() === op.toLowerCase();
              return (
                <div
                  key={op}
                  className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/30">#{idx + 1}</span>
                    <span className="text-sm font-mono text-white">
                      {shortenAddress(op)}
                    </span>
                    {isOperatorSelf && (
                      <span className="rounded bg-[#38BDF8]/20 px-1.5 py-0.5 text-[10px] text-[#38BDF8]">You</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copyAddress(op)}
                      className="text-zinc-600 hover:text-zinc-400"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    {isOwner && (
                      <button
                        onClick={() => agentId && removeOperator(agentId, op as `0x${string}`)}
                        disabled={isRemoving}
                        className="text-zinc-600 hover:text-red-400"
                        title="Remove operator"
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {isOperatorSelf && !isOwner && (
                      <button
                        onClick={() => agentId && operatorExit(agentId)}
                        disabled={isExiting}
                        className="text-zinc-600 hover:text-amber-400"
                        title="Exit as operator"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Capabilities */}
      {((runtimeAgent && Array.isArray(runtimeAgent.capabilities) && runtimeAgent.capabilities.length > 0) || (metaCapabilities && metaCapabilities.length > 0)) && (
        <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-sm transition-all duration-300">
          <h2 className="mb-4 text-lg font-medium text-white">
            Capabilities
          </h2>
          <div className="space-y-3">
            {((Array.isArray(runtimeAgent?.capabilities) && runtimeAgent.capabilities.length > 0 ? runtimeAgent.capabilities : null) || (metaCapabilities || []).map((c, i) => ({ id: `cap-${i}`, name: c, description: '' }))).map((cap) => (
              <div
                key={cap.id}
                className="rounded-lg border border-white/10 bg-white/5 p-3"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#38BDF8]" />
                  <span className="font-medium text-white">{cap.name}</span>
                  <span className="rounded bg-[#38BDF8]/20 px-1.5 py-0.5 text-xs font-mono text-[#38BDF8]">
                    {cap.id}
                  </span>
                </div>
                <p className="mt-1 text-sm text-white/40">{cap.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Service Endpoints */}
      {metaServices && Object.keys(metaServices).length > 0 && (
        <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-sm transition-all duration-300">
          <h2 className="mb-4 text-lg font-medium text-white">
            Service Endpoints
          </h2>
          <div className="space-y-2">
            {Object.entries(metaServices).map(([type, url]) => {
              const config = getServiceConfig(type);
              const ServiceIcon = config.icon;
              return (
                <div key={type} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <ServiceIcon className={`h-4 w-4 flex-shrink-0 ${config.color}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-medium ${config.color}`}>{type}</span>
                        <span className="text-[10px] text-white/30">{config.label}</span>
                      </div>
                      <span className="text-sm text-white/40 break-all">{url}</span>
                    </div>
                  </div>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="ml-2 text-[#38BDF8] hover:text-[#38BDF8] flex-shrink-0">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fee Info */}
      {onChainFee && onChainFee > 0n && (
        <div className="mt-6 card border-[#38BDF8]/20 bg-[#38BDF8]/5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Task Fee</h2>
              <p className="text-sm text-white/40">This agent charges a fee per task execution</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-[#38BDF8]" style={{ fontFamily: 'var(--font-mono), monospace' }}>
                {formatEther(onChainFee)} {nativeCurrency}
              </p>
              <p className="text-xs text-white/30">per task</p>
            </div>
          </div>
        </div>
      )}

      {/* Use Agent */}
      {hasRuntime && (
        <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-sm transition-all duration-300">
          {metaCustomUI?.html && !useBasicInterface ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Play className="h-5 w-5 text-[#38BDF8]" />
                  <h2 className="text-lg font-medium text-white">
                    Use {agentDisplayName}
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-xs text-zinc-500">
                    <Code className="h-3 w-3" /> Custom Interface
                  </span>
                  <button
                    onClick={() => setUseBasicInterface(true)}
                    className="text-xs text-zinc-500 hover:text-white underline"
                  >
                    Switch to basic
                  </button>
                </div>
              </div>
              <AgentCustomUI
                html={metaCustomUI.html}
                cdnLinks={metaCustomUI.cdnLinks}
                agentId={agentId!.toString()}
                agentName={agentDisplayName}
                walletAddress={address}
                minHeight={metaCustomUI.minHeight}
                onTaskSubmit={handleCustomTaskSubmit}
                taskResult={customTaskResult}
                feePerTask={onChainFee}
              />
            </>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Play className="h-5 w-5 text-[#38BDF8]" />
                  <h2 className="text-lg font-medium text-white">
                    Use {agentDisplayName}
                  </h2>
                </div>
                {metaCustomUI?.html && useBasicInterface && (
                  <button
                    onClick={() => setUseBasicInterface(false)}
                    className="flex items-center gap-1 text-xs text-[#38BDF8] hover:underline"
                  >
                    <Code className="h-3 w-3" /> Use custom interface
                  </button>
                )}
              </div>
              {metaRequestExample && (
                <div className="mb-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                  <p className="mb-1 text-xs font-medium text-white/30">Example request</p>
                  <p className="text-sm text-white/50 italic">{metaRequestExample}</p>
                </div>
              )}
              <TaskSubmission
                agentId={agentId!.toString()}
                agentName={agentDisplayName}
                placeholder={placeholder}
                onChainAgentId={agentId}
                feePerTask={onChainFee}
                serviceUrl={metaServices?.A2A}
              />
            </>
          )}
        </div>
      )}

      {/* Recent Feedback */}
      {feedbacks.length > 0 && (
        <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-sm transition-all duration-300">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">Recent Feedback</h2>
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
      <div className="mt-6 flex flex-wrap gap-4">
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
        {isOwner && agent.status !== 2 && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete Agent
          </button>
        )}
      </div>

      {/* Deregister Success Banner */}
      {isDeregisterSuccess && (
        <div className="mt-4 card border-emerald-500/20 bg-emerald-500/10">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-400" />
            <div>
              <p className="text-sm font-medium text-emerald-400">Agent deregistered successfully</p>
              {deregisterHash && (
                <a
                  href={`https://explorer.thanos-sepolia.tokamak.network/tx/${deregisterHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-emerald-300 hover:underline"
                >
                  View transaction
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl border border-white/10 bg-zinc-900 p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20">
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Delete Agent</h3>
                <p className="text-sm text-white/40">This action is irreversible</p>
              </div>
            </div>
            <p className="mb-2 text-sm text-white/50">
              Are you sure you want to permanently delete <strong>{agentDisplayName}</strong> (ID: {agentId?.toString()})?
            </p>
            <ul className="mb-6 space-y-1 text-sm text-white/40">
              <li>- The agent NFT will be burned</li>
              <li>- All operators will be removed</li>
              <li>- Agent data will be cleared on-chain</li>
            </ul>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="btn-secondary text-sm"
                disabled={isDeregisterPending || isDeregisterConfirming}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (agentId) {
                    deregister(agentId);
                    setShowDeleteConfirm(false);
                  }
                }}
                disabled={isDeregisterPending || isDeregisterConfirming}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isDeregisterPending ? 'Confirm in wallet...' : isDeregisterConfirming ? 'Deleting...' : 'Delete Agent'}
              </button>
            </div>
          </div>
        </div>
      )}

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
